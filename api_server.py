from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from collections import defaultdict, deque
from decimal import Decimal
from typing import Any

import websockets

from backfill import InitialBackfillRunner
from config import RadarConfig
from models import AccountUpdate, MarginfiAccountState, RadarStats, RiskLevel
from pipeline import NoopNotifier, process_updates
from protocols import ProtocolAdapter, build_protocol_adapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from state_store import AccountStateWriter, NoopStateSink, build_account_state_store
from utils import monotonic_ms, short_pubkey
from websocket_client import MarginfiWebSocketClient

LOGGER = logging.getLogger(__name__)

RiskTrend = deque[float]


def _get_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _get_host() -> str:
    return os.getenv("LIQUIDATION_RADAR_API_HOST", "127.0.0.1")


def _risk_label(level: RiskLevel) -> str:
    return {
        RiskLevel.LIQUIDATABLE: "Liquidatable",
        RiskLevel.HIGH: "High Risk",
        RiskLevel.WARNING: "Warning",
        RiskLevel.HEALTHY: "Healthy",
        RiskLevel.NO_DEBT: "No Debt",
        RiskLevel.INVALID: "Invalid",
    }[level]


def _decimal_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _trend_value(account: MarginfiAccountState) -> float:
    if account.health_factor is None:
        return 0.0
    return float(account.health_factor)


def _update_trends(accounts: list[MarginfiAccountState], trends: dict[str, RiskTrend]) -> None:
    for account in accounts:
        series = trends[account.pubkey]
        series.append(_trend_value(account))


def _expanded_trend(series: RiskTrend) -> list[float]:
    if not series:
        return [0.0] * 14
    values = list(series)
    if len(values) >= 14:
        return values[-14:]
    return [values[0]] * (14 - len(values)) + values


def _account_payload(rank: int, account: MarginfiAccountState, trend: list[float]) -> dict[str, Any]:
    return {
        "rank": rank,
        "account": short_pubkey(account.pubkey),
        "accountFull": account.pubkey,
        "wallet": short_pubkey(account.authority),
        "walletFull": account.authority,
        "protocol": "marginfi v2",
        "collateralUsd": _decimal_float(account.collateral_value) or 0.0,
        "debtUsd": _decimal_float(account.debt_value) or 0.0,
        "hf": _decimal_float(account.health_factor),
        "risk": _risk_label(account.risk_level),
        "updatedSlot": account.slot,
        "latencyMs": account.latency_ms,
        "trend": trend,
        "rpcEndpoint": account.rpc_endpoint,
    }


def _snapshot_payload(
    ranking_engine: RankingEngine,
    config: RadarConfig,
    protocol: ProtocolAdapter,
    updates: asyncio.Queue[AccountUpdate],
    trends: dict[str, RiskTrend],
) -> dict[str, Any]:
    stats = ranking_engine.stats()
    top_accounts = ranking_engine.top(config.top_n)
    _update_trends(top_accounts, trends)

    return {
        "type": "snapshot",
        "protocol": protocol.protocol_name,
        "accountLabel": protocol.account_label,
        "programId": protocol.program_id,
        "generatedAtMs": monotonic_ms(),
        "rpcEndpoint": stats.last_rpc_endpoint or config.ws_endpoints[0],
        "queueDepth": updates.qsize(),
        "stats": _stats_payload(stats),
        "accounts": [
            _account_payload(index, account, _expanded_trend(trends[account.pubkey]))
            for index, account in enumerate(top_accounts, start=1)
        ],
    }


def _stats_payload(stats: RadarStats) -> dict[str, Any]:
    return {
        "accountsTotal": stats.accounts_total,
        "riskAccounts": stats.risk_accounts,
        "liquidatable": stats.liquidatable,
        "high": stats.high,
        "warning": stats.warning,
        "healthy": stats.healthy,
        "noDebt": stats.no_debt,
        "invalid": stats.invalid,
        "cacheCapacity": stats.cache_capacity,
        "cacheEvictions": stats.cache_evictions,
        "updatesProcessed": stats.updates_processed,
        "updatesSkipped": stats.updates_skipped,
        "lastSlot": stats.last_slot,
        "lastRpcEndpoint": stats.last_rpc_endpoint,
    }


class RadarApiServer:
    def __init__(
        self,
        config: RadarConfig,
        protocol: ProtocolAdapter,
        ranking_engine: RankingEngine,
        updates: asyncio.Queue[AccountUpdate],
    ) -> None:
        self._config = config
        self._protocol = protocol
        self._ranking_engine = ranking_engine
        self._updates = updates
        self._clients: set[Any] = set()
        self._trends: dict[str, RiskTrend] = defaultdict(lambda: deque(maxlen=14))

    async def handler(self, websocket: Any, *_: object) -> None:
        self._clients.add(websocket)
        LOGGER.info("frontend connected clients=%s", len(self._clients))
        try:
            if self._ranking_engine.stats().accounts_total > 0:
                await websocket.send(self.snapshot_json())
            async for _ in websocket:
                pass
        finally:
            self._clients.discard(websocket)
            LOGGER.info("frontend disconnected clients=%s", len(self._clients))

    def snapshot_json(self) -> str:
        payload = _snapshot_payload(
            self._ranking_engine,
            self._config,
            self._protocol,
            self._updates,
            self._trends,
        )
        return json.dumps(payload, separators=(",", ":"))

    async def broadcast_loop(self, stop_event: asyncio.Event) -> None:
        interval_s = max(self._config.refresh_interval_ms, 100) / 1000
        while not stop_event.is_set():
            await asyncio.sleep(interval_s)
            if not self._clients:
                continue

            message = self.snapshot_json()
            dead_clients: set[Any] = set()
            for client in self._clients:
                try:
                    await client.send(message)
                except Exception:
                    dead_clients.add(client)
            self._clients.difference_update(dead_clients)


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

    api = RadarApiServer(config, protocol, ranking_engine, updates)
    backfill = InitialBackfillRunner(config, protocol, risk_engine, ranking_engine, state_sink)

    ws_task = asyncio.create_task(ws_client.run(stop_event), name="solana-websocket")
    writer_task = (
        asyncio.create_task(state_sink.run(stop_event), name="state-writer")
        if isinstance(state_sink, AccountStateWriter)
        else None
    )
    await backfill.run(stop_event)

    host = _get_host()
    port = _get_int("LIQUIDATION_RADAR_API_PORT", 8765)
    LOGGER.info("api server starting ws://%s:%s", host, port)

    async with websockets.serve(api.handler, host, port, ping_interval=20, ping_timeout=20):
        tasks = [
            ws_task,
            *([writer_task] if writer_task is not None else []),
            *[
                asyncio.create_task(
                    process_updates(updates, protocol, risk_engine, ranking_engine, NoopNotifier(), stop_event, state_sink),
                    name=f"risk-worker-{idx}",
                )
                for idx in range(max(1, config.risk_worker_count))
            ],
            asyncio.create_task(api.broadcast_loop(stop_event), name="frontend-broadcaster"),
        ]

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
