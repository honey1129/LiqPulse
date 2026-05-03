from __future__ import annotations

import asyncio
import logging
import signal

from backfill import InitialBackfillRunner
from config import RadarConfig
from models import AccountUpdate
from pipeline import NoopNotifier, process_updates
from protocols import ProtocolAdapter, build_protocol_adapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from state_store import AccountStateWriter, NoopStateSink, build_account_state_store
from utils import clear_screen, format_decimal, format_usd, monotonic_ms, short_pubkey
from websocket_client import MarginfiWebSocketClient

LOGGER = logging.getLogger(__name__)


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
    state_store = build_account_state_store(config)
    state_sink: NoopStateSink | AccountStateWriter = NoopStateSink()

    if config.database_enabled:
        try:
            await state_store.initialize()
            cached_states = await state_store.load_latest(protocol.protocol_name, config.database_warm_start_limit)
            loaded = ranking_engine.seed(cached_states)
            LOGGER.info(
                "database warm start protocol=%s loaded=%s limit=%s source=%s",
                protocol.protocol_name,
                loaded,
                config.database_warm_start_limit,
                config.database_url,
            )
            state_sink = AccountStateWriter(
                state_store,
                protocol.protocol_name,
                config.database_write_queue_size,
                config.database_write_batch_size,
                config.database_flush_interval_ms,
            )
        except Exception as exc:
            if config.database_required:
                raise
            LOGGER.exception("database persistence disabled: %s", exc)

    backfill = InitialBackfillRunner(config, protocol, risk_engine, ranking_engine, state_sink)

    LOGGER.info(
        "radar starting protocol=%s ws_endpoints=%s http_endpoints=%s workers=%s cache=%s backfill=%s",
        protocol.protocol_name,
        ",".join(config.ws_endpoints),
        ",".join(config.http_endpoints),
        config.risk_worker_count,
        config.account_cache_size,
        config.backfill_enabled,
    )

    tasks = [
        asyncio.create_task(ws_client.run(stop_event), name="websocket-client"),
    ]

    if isinstance(state_sink, AccountStateWriter):
        tasks.append(asyncio.create_task(state_sink.run(stop_event), name="state-writer"))

    await backfill.run(stop_event)
    if isinstance(state_sink, AccountStateWriter):
        LOGGER.info("waiting for initial database snapshot persistence pending=%s", state_sink.pending)
        await state_sink.flush()
        LOGGER.info("initial database snapshot persistence flushed dropped=%s", state_sink.dropped)

    tasks.extend(
        [
            *[
                asyncio.create_task(
                    process_updates(updates, protocol, risk_engine, ranking_engine, notifier, stop_event, state_sink),
                    name=f"account-processor-{idx}",
                )
                for idx in range(max(1, config.risk_worker_count))
            ],
            asyncio.create_task(render_cli(ranking_engine, config, protocol, stop_event), name="cli-renderer"),
        ]
    )

    try:
        await stop_event.wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await state_store.close()


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
