from __future__ import annotations

import asyncio
import logging
import signal
from typing import Protocol

from config import RadarConfig
from errors import AccountDecodeError, InvalidAccountDataError
from models import AccountUpdate, MarginfiAccountState, RiskLevel
from protocols import ProtocolAdapter, build_protocol_adapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from utils import clear_screen, format_decimal, format_usd, monotonic_ms, short_pubkey
from websocket_client import MarginfiWebSocketClient

LOGGER = logging.getLogger(__name__)


class RiskNotifier(Protocol):
    async def publish(self, state: MarginfiAccountState) -> None:
        ...


class NoopNotifier:
    async def publish(self, state: MarginfiAccountState) -> None:
        return None


async def process_updates(
    updates: asyncio.Queue[AccountUpdate],
    protocol: ProtocolAdapter,
    risk_engine: RiskEngine,
    ranking_engine: RankingEngine,
    notifier: RiskNotifier,
    stop_event: asyncio.Event,
) -> None:
    while not stop_event.is_set():
        try:
            update = await asyncio.wait_for(updates.get(), timeout=0.5)
        except TimeoutError:
            continue

        try:
            decoded = protocol.decode(update)
            if decoded is None:
                ranking_engine.mark_skipped()
                continue

            previous = ranking_engine.get(decoded.pubkey)
            evaluated = risk_engine.evaluate(decoded, previous)
            ranking_engine.upsert(evaluated)
            if evaluated.risk_level in {RiskLevel.LIQUIDATABLE, RiskLevel.HIGH}:
                await notifier.publish(evaluated)
        except InvalidAccountDataError as exc:
            ranking_engine.mark_skipped()
            LOGGER.debug("invalid account data: %s", exc)
        except AccountDecodeError as exc:
            ranking_engine.mark_skipped()
            LOGGER.error("decode error: %s", exc)
        except Exception:
            LOGGER.exception("failed to process account update")
        finally:
            updates.task_done()


async def render_cli(
    ranking_engine: RankingEngine,
    config: RadarConfig,
    protocol: ProtocolAdapter,
    stop_event: asyncio.Event,
) -> None:
    refresh_s = max(config.refresh_interval_ms, 100) / 1000

    while not stop_event.is_set():
        clear_screen()
        stats = ranking_engine.stats()
        rows = ranking_engine.top(config.top_n)

        print(f"Solana Liquidation Radar | {protocol.protocol_name}")
        print(f"Program: {protocol.program_id} | Account: {protocol.account_label}")
        print(f"RPC: {stats.last_rpc_endpoint or config.ws_endpoints[0]}")
        print(
            "Accounts: "
            f"{stats.accounts_total} | Risk: {stats.risk_accounts} "
            f"(liq={stats.liquidatable}, high={stats.high}, warn={stats.warning}) | "
            f"healthy={stats.healthy}, no_debt={stats.no_debt}, invalid={stats.invalid}"
        )
        print(
            f"Updates: processed={stats.updates_processed}, skipped={stats.updates_skipped}, "
            f"queue<= {config.queue_maxsize}, cache={stats.accounts_total}/{stats.cache_capacity}, "
            f"evicted={stats.cache_evictions}, slot={stats.last_slot}, now_ms={monotonic_ms()}"
        )
        print()
        print(
            f"{'#':>2} {'risk':<12} {'HF':>10} {'collateral':>18} {'debt':>18} "
            f"{'exposure':>18} {'acct':<13} {'authority':<13} {'slot':>12} {'lat':>6}"
        )
        print("-" * 132)

        if not rows:
            print("No accounts below display HF threshold yet.")
        else:
            for idx, item in enumerate(rows, start=1):
                print(
                    f"{idx:>2} {item.risk_level.value:<12} "
                    f"{format_decimal(item.health_factor, 6):>10} "
                    f"{format_usd(item.collateral_value):>18} "
                    f"{format_usd(item.debt_value):>18} "
                    f"{format_usd(item.exposure_usd):>18} "
                    f"{short_pubkey(item.pubkey):<13} "
                    f"{short_pubkey(item.authority):<13} "
                    f"{item.slot:>12} "
                    f"{item.latency_ms:>5}ms"
                )

        await asyncio.sleep(refresh_s)


async def run() -> None:
    config = RadarConfig.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            pass

    updates: asyncio.Queue[AccountUpdate] = asyncio.Queue(maxsize=config.queue_maxsize)
    protocol = build_protocol_adapter(config)
    risk_engine = RiskEngine(config)
    ranking_engine = RankingEngine(config)
    notifier = NoopNotifier()
    ws_client = MarginfiWebSocketClient(config, protocol, updates)

    LOGGER.info(
        "radar starting protocol=%s endpoints=%s workers=%s cache=%s",
        protocol.protocol_name,
        ",".join(config.ws_endpoints),
        config.risk_worker_count,
        config.account_cache_size,
    )

    tasks = [
        asyncio.create_task(ws_client.run(stop_event), name="websocket-client"),
        *[
            asyncio.create_task(
                process_updates(updates, protocol, risk_engine, ranking_engine, notifier, stop_event),
                name=f"account-processor-{idx}",
            )
            for idx in range(max(1, config.risk_worker_count))
        ],
        asyncio.create_task(render_cli(ranking_engine, config, protocol, stop_event), name="cli-renderer"),
    ]

    try:
        await stop_event.wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
