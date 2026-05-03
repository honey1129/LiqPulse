from __future__ import annotations

import asyncio
import base64
import json
import logging
import sqlite3
import time
from collections.abc import Mapping
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from typing import Any, Protocol, runtime_checkable

from config import RadarConfig
from models import BalanceSnapshot, HealthCacheState, MarginfiAccountState, RiskLevel

LOGGER = logging.getLogger(__name__)


@runtime_checkable
class StateSink(Protocol):
    async def publish(self, state: MarginfiAccountState) -> None:
        ...


class NoopStateSink:
    async def publish(self, state: MarginfiAccountState) -> None:
        return None


class AccountStateStore(Protocol):
    async def initialize(self) -> None:
        ...

    async def load_latest(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        ...

    async def save_states(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        ...

    async def close(self) -> None:
        ...


def _json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _mapping_from_row(row: Any) -> dict[str, Any]:
    if isinstance(row, Mapping):
        return dict(row)
    if hasattr(row, "items"):
        return dict(row.items())
    if hasattr(row, "keys"):
        return {key: row[key] for key in row.keys()}
    return dict(row)


def _decimal_str(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _decimal_value(value: Any, default: str = "0") -> Decimal:
    if value is None:
        return Decimal(default)
    return Decimal(str(value))


def _health_cache_payload(cache: HealthCacheState) -> dict[str, Any]:
    return {
        "asset_value_initial": _decimal_str(cache.asset_value_initial),
        "liability_value_initial": _decimal_str(cache.liability_value_initial),
        "asset_value_maint": _decimal_str(cache.asset_value_maint),
        "liability_value_maint": _decimal_str(cache.liability_value_maint),
        "asset_value_equity": _decimal_str(cache.asset_value_equity),
        "liability_value_equity": _decimal_str(cache.liability_value_equity),
        "timestamp": cache.timestamp,
        "flags": cache.flags,
        "internal_err": cache.internal_err,
        "internal_liq_err": cache.internal_liq_err,
        "bankruptcy_err": cache.bankruptcy_err,
        "program_version": cache.program_version,
    }


def _health_cache_from_payload(payload: Mapping[str, Any]) -> HealthCacheState:
    return HealthCacheState(
        asset_value_initial=_decimal_value(payload.get("asset_value_initial")),
        liability_value_initial=_decimal_value(payload.get("liability_value_initial")),
        asset_value_maint=_decimal_value(payload.get("asset_value_maint")),
        liability_value_maint=_decimal_value(payload.get("liability_value_maint")),
        asset_value_equity=_decimal_value(payload.get("asset_value_equity")),
        liability_value_equity=_decimal_value(payload.get("liability_value_equity")),
        timestamp=int(payload.get("timestamp", 0)),
        flags=int(payload.get("flags", 0)),
        internal_err=int(payload.get("internal_err", 0)),
        internal_liq_err=int(payload.get("internal_liq_err", 0)),
        bankruptcy_err=int(payload.get("bankruptcy_err", 0)),
        program_version=int(payload.get("program_version", 0)),
    )


def _balances_payload(balances: tuple[BalanceSnapshot, ...]) -> list[dict[str, Any]]:
    return [
        {
            "bank_pk": balance.bank_pk,
            "asset_shares": _decimal_str(balance.asset_shares),
            "liability_shares": _decimal_str(balance.liability_shares),
            "last_update": balance.last_update,
        }
        for balance in balances
    ]


def _balances_from_payload(payload: Any) -> tuple[BalanceSnapshot, ...]:
    if not payload:
        return ()
    balances: list[BalanceSnapshot] = []
    for item in payload:
        if not isinstance(item, Mapping):
            continue
        balances.append(
            BalanceSnapshot(
                bank_pk=str(item.get("bank_pk", "")),
                asset_shares=_decimal_value(item.get("asset_shares")),
                liability_shares=_decimal_value(item.get("liability_shares")),
                last_update=int(item.get("last_update", 0)),
            )
        )
    return tuple(balances)


def _state_to_row(protocol: str, state: MarginfiAccountState, now_ms: int) -> tuple[Any, ...]:
    return (
        protocol,
        state.pubkey,
        state.group,
        state.authority,
        state.slot,
        _decimal_str(state.collateral_value),
        _decimal_str(state.debt_value),
        _decimal_str(state.exposure_usd),
        _decimal_str(state.health_factor),
        state.risk_level.value,
        _json_dumps(_health_cache_payload(state.health_cache)),
        base64.b64encode(state.data_fingerprint).decode("ascii"),
        base64.b64encode(state.risk_fingerprint).decode("ascii"),
        _json_dumps(_balances_payload(state.balances)),
        state.received_at_ms,
        state.decoded_at_ms,
        state.rpc_endpoint,
        now_ms,
    )


def _row_to_state(record: Mapping[str, Any]) -> MarginfiAccountState:
    health_cache_payload = _json_value(record.get("health_cache_json"))
    balances_payload = _json_value(record.get("balances_json"))

    health_factor_raw = record.get("health_factor")
    health_factor = None if health_factor_raw in (None, "") else Decimal(str(health_factor_raw))

    return MarginfiAccountState(
        pubkey=str(record.get("pubkey", "")),
        group=str(record.get("group_pk", "")),
        authority=str(record.get("authority", "")),
        slot=int(record.get("slot", 0)),
        collateral_value=_decimal_value(record.get("collateral_value")),
        debt_value=_decimal_value(record.get("debt_value")),
        exposure_usd=_decimal_value(record.get("exposure_usd")),
        health_factor=health_factor,
        risk_level=RiskLevel(str(record.get("risk_level", RiskLevel.INVALID.value))),
        health_cache=_health_cache_from_payload(health_cache_payload),
        data_fingerprint=_b64decode_value(record.get("data_fingerprint")),
        risk_fingerprint=_b64decode_value(record.get("risk_fingerprint")),
        balances=_balances_from_payload(balances_payload),
        received_at_ms=int(record.get("received_at_ms", 0)),
        decoded_at_ms=int(record.get("decoded_at_ms", 0)),
        rpc_endpoint=str(record.get("rpc_endpoint", "")),
    )


def _sqlite_path_from_url(url: str, base_dir: Path) -> Path:
    raw = url.removeprefix("sqlite:///") if url.startswith("sqlite:///") else url.removeprefix("sqlite://")
    if raw in {"", ":memory:"}:
        return Path(":memory:")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = base_dir / path
    return path


def _json_value(raw: Any) -> Any:
    if raw is None:
        return {}
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        return json.loads(raw)
    if isinstance(raw, Mapping):
        return dict(raw)
    return json.loads(str(raw))


def _b64decode_value(raw: Any) -> bytes:
    if raw is None or raw == "" or raw == b"":
        return b""
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    if isinstance(raw, (bytes, bytearray)):
        value = bytes(raw)
    else:
        value = str(raw).encode("utf-8")
    try:
        return base64.b64decode(value, validate=False)
    except Exception:
        return b""


def _parse_mysql_url(db_url: str) -> dict[str, Any]:
    parsed = urlparse(db_url)
    if not (parsed.scheme.startswith("mysql") or parsed.scheme.startswith("mariadb")):
        raise ValueError(f"unsupported mysql url: {db_url}")

    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError("mysql database name is required in the connection URL")

    query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
    charset = query.get("charset", "utf8mb4")
    connect_timeout = int(query.get("connect_timeout", "10"))

    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": database,
        "charset": charset,
        "connect_timeout": connect_timeout,
    }


class DisabledAccountStateStore:
    async def initialize(self) -> None:
        return None

    async def load_latest(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        return []

    async def save_states(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        return None

    async def close(self) -> None:
        return None


class SqliteAccountStateStore:
    def __init__(self, db_url: str, base_dir: Path) -> None:
        self._path = _sqlite_path_from_url(db_url, base_dir)

    async def initialize(self) -> None:
        if str(self._path) == ":memory:":
            raise ValueError("sqlite :memory: is not supported for LiqPulse persistence")
        await asyncio.to_thread(self._initialize_sync)

    def _initialize_sync(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS account_states (
                    protocol TEXT NOT NULL,
                    pubkey TEXT NOT NULL,
                    group_pk TEXT NOT NULL,
                    authority TEXT NOT NULL,
                    slot INTEGER NOT NULL,
                    collateral_value TEXT NOT NULL,
                    debt_value TEXT NOT NULL,
                    exposure_usd TEXT NOT NULL,
                    health_factor TEXT,
                    risk_level TEXT NOT NULL,
                    health_cache_json TEXT NOT NULL,
                    data_fingerprint TEXT NOT NULL,
                    risk_fingerprint TEXT NOT NULL,
                    balances_json TEXT NOT NULL,
                    received_at_ms INTEGER NOT NULL,
                    decoded_at_ms INTEGER NOT NULL,
                    rpc_endpoint TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (protocol, pubkey)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_account_states_protocol_risk ON account_states(protocol, risk_level, slot DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_account_states_protocol_hf ON account_states(protocol, health_factor, exposure_usd, slot DESC)"
            )
            conn.commit()

    async def load_latest(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        return await asyncio.to_thread(self._load_latest_sync, protocol, limit)

    def _load_latest_sync(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        if limit <= 0:
            return []

        with sqlite3.connect(self._path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT *
                FROM account_states
                WHERE protocol = ?
                ORDER BY
                    CASE risk_level
                        WHEN 'liquidatable' THEN 0
                        WHEN 'high' THEN 1
                        WHEN 'warning' THEN 2
                        WHEN 'healthy' THEN 3
                        WHEN 'no_debt' THEN 4
                        ELSE 5
                    END,
                    CASE WHEN health_factor IS NULL THEN 1 ELSE 0 END,
                    CAST(health_factor AS REAL) ASC,
                    CAST(exposure_usd AS REAL) DESC,
                    slot DESC
                LIMIT ?
                """,
                (protocol, limit),
            ).fetchall()
        return [_row_to_state(_mapping_from_row(row)) for row in rows]

    async def save_states(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        if not states:
            return None
        await asyncio.to_thread(self._save_states_sync, protocol, states)

    def _save_states_sync(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        now_ms = int(time.time() * 1000)
        rows = [_state_to_row(protocol, state, now_ms) for state in states]
        with sqlite3.connect(self._path) as conn:
            conn.executemany(
                """
                INSERT INTO account_states (
                    protocol, pubkey, group_pk, authority, slot,
                    collateral_value, debt_value, exposure_usd, health_factor,
                    risk_level, health_cache_json, data_fingerprint, risk_fingerprint,
                    balances_json, received_at_ms, decoded_at_ms, rpc_endpoint, updated_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(protocol, pubkey) DO UPDATE SET
                    group_pk=excluded.group_pk,
                    authority=excluded.authority,
                    slot=excluded.slot,
                    collateral_value=excluded.collateral_value,
                    debt_value=excluded.debt_value,
                    exposure_usd=excluded.exposure_usd,
                    health_factor=excluded.health_factor,
                    risk_level=excluded.risk_level,
                    health_cache_json=excluded.health_cache_json,
                    data_fingerprint=excluded.data_fingerprint,
                    risk_fingerprint=excluded.risk_fingerprint,
                    balances_json=excluded.balances_json,
                    received_at_ms=excluded.received_at_ms,
                    decoded_at_ms=excluded.decoded_at_ms,
                    rpc_endpoint=excluded.rpc_endpoint,
                    updated_at_ms=excluded.updated_at_ms
                WHERE excluded.slot >= account_states.slot
                """,
                rows,
            )
            conn.commit()

    async def close(self) -> None:
        return None


class MySqlAccountStateStore:
    def __init__(self, db_url: str) -> None:
        self._settings = _parse_mysql_url(db_url)

    def _connect(self) -> Any:
        try:
            import pymysql
            import pymysql.cursors
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("pymysql is required for mysql persistence") from exc

        return pymysql.connect(
            **self._settings,
            autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize_sync)

    def _initialize_sync(self) -> None:
        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS account_states (
                        protocol VARCHAR(32) NOT NULL,
                        pubkey VARCHAR(64) NOT NULL,
                        group_pk VARCHAR(64) NOT NULL,
                        authority VARCHAR(64) NOT NULL,
                        slot BIGINT NOT NULL,
                        collateral_value DECIMAL(65,18) NOT NULL,
                        debt_value DECIMAL(65,18) NOT NULL,
                        exposure_usd DECIMAL(65,18) NOT NULL,
                        health_factor DECIMAL(65,18) NULL,
                        risk_level VARCHAR(24) NOT NULL,
                        health_cache_json LONGTEXT NOT NULL,
                        data_fingerprint VARCHAR(64) NOT NULL,
                        risk_fingerprint VARCHAR(64) NOT NULL,
                        balances_json LONGTEXT NOT NULL,
                        received_at_ms BIGINT NOT NULL,
                        decoded_at_ms BIGINT NOT NULL,
                        rpc_endpoint VARCHAR(512) NOT NULL,
                        updated_at_ms BIGINT NOT NULL,
                        PRIMARY KEY (protocol, pubkey),
                        KEY idx_account_states_protocol_risk (protocol, risk_level, slot),
                        KEY idx_account_states_protocol_hf (protocol, health_factor, exposure_usd, slot)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
            conn.commit()
        finally:
            conn.close()

    async def load_latest(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        return await asyncio.to_thread(self._load_latest_sync, protocol, limit)

    def _load_latest_sync(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        if limit <= 0:
            return []

        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM account_states
                    WHERE protocol = %s
                    ORDER BY
                        CASE risk_level
                            WHEN 'liquidatable' THEN 0
                            WHEN 'high' THEN 1
                            WHEN 'warning' THEN 2
                            WHEN 'healthy' THEN 3
                            WHEN 'no_debt' THEN 4
                            ELSE 5
                        END,
                        CASE WHEN health_factor IS NULL THEN 1 ELSE 0 END,
                        health_factor ASC,
                        exposure_usd DESC,
                        slot DESC
                    LIMIT %s
                    """,
                    (protocol, limit),
                )
                rows = cursor.fetchall()
        finally:
            conn.close()
        return [_row_to_state(_mapping_from_row(row)) for row in rows]

    async def save_states(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        if not states:
            return None
        await asyncio.to_thread(self._save_states_sync, protocol, states)

    def _save_states_sync(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        now_ms = int(time.time() * 1000)
        rows = [_state_to_row(protocol, state, now_ms) for state in states]
        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO account_states (
                        protocol, pubkey, group_pk, authority, slot,
                        collateral_value, debt_value, exposure_usd, health_factor,
                        risk_level, health_cache_json, data_fingerprint, risk_fingerprint,
                        balances_json, received_at_ms, decoded_at_ms, rpc_endpoint, updated_at_ms
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        group_pk=IF(VALUES(slot) >= slot, VALUES(group_pk), group_pk),
                        authority=IF(VALUES(slot) >= slot, VALUES(authority), authority),
                        collateral_value=IF(VALUES(slot) >= slot, VALUES(collateral_value), collateral_value),
                        debt_value=IF(VALUES(slot) >= slot, VALUES(debt_value), debt_value),
                        exposure_usd=IF(VALUES(slot) >= slot, VALUES(exposure_usd), exposure_usd),
                        health_factor=IF(VALUES(slot) >= slot, VALUES(health_factor), health_factor),
                        risk_level=IF(VALUES(slot) >= slot, VALUES(risk_level), risk_level),
                        health_cache_json=IF(VALUES(slot) >= slot, VALUES(health_cache_json), health_cache_json),
                        data_fingerprint=IF(VALUES(slot) >= slot, VALUES(data_fingerprint), data_fingerprint),
                        risk_fingerprint=IF(VALUES(slot) >= slot, VALUES(risk_fingerprint), risk_fingerprint),
                        balances_json=IF(VALUES(slot) >= slot, VALUES(balances_json), balances_json),
                        received_at_ms=IF(VALUES(slot) >= slot, VALUES(received_at_ms), received_at_ms),
                        decoded_at_ms=IF(VALUES(slot) >= slot, VALUES(decoded_at_ms), decoded_at_ms),
                        rpc_endpoint=IF(VALUES(slot) >= slot, VALUES(rpc_endpoint), rpc_endpoint),
                        updated_at_ms=IF(VALUES(slot) >= slot, VALUES(updated_at_ms), updated_at_ms),
                        slot=GREATEST(slot, VALUES(slot))
                    """,
                    rows,
                )
            conn.commit()
        finally:
            conn.close()

    async def close(self) -> None:
        return None


class PostgresAccountStateStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: Any | None = None

    async def initialize(self) -> None:
        try:
            import asyncpg
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("asyncpg is required for postgres persistence") from exc

        self._pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=5)
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS account_states (
                    protocol TEXT NOT NULL,
                    pubkey TEXT NOT NULL,
                    group_pk TEXT NOT NULL,
                    authority TEXT NOT NULL,
                    slot BIGINT NOT NULL,
                    collateral_value NUMERIC NOT NULL,
                    debt_value NUMERIC NOT NULL,
                    exposure_usd NUMERIC NOT NULL,
                    health_factor NUMERIC,
                    risk_level TEXT NOT NULL,
                    health_cache_json JSONB NOT NULL,
                    data_fingerprint TEXT NOT NULL,
                    risk_fingerprint TEXT NOT NULL,
                    balances_json JSONB NOT NULL,
                    received_at_ms BIGINT NOT NULL,
                    decoded_at_ms BIGINT NOT NULL,
                    rpc_endpoint TEXT NOT NULL,
                    updated_at_ms BIGINT NOT NULL,
                    PRIMARY KEY (protocol, pubkey)
                )
                """
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_account_states_protocol_risk ON account_states(protocol, risk_level, slot DESC)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_account_states_protocol_hf ON account_states(protocol, health_factor, exposure_usd, slot DESC)"
            )

    async def load_latest(self, protocol: str, limit: int) -> list[MarginfiAccountState]:
        if self._pool is None or limit <= 0:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM account_states
                WHERE protocol = $1
                ORDER BY
                    CASE risk_level
                        WHEN 'liquidatable' THEN 0
                        WHEN 'high' THEN 1
                        WHEN 'warning' THEN 2
                        WHEN 'healthy' THEN 3
                        WHEN 'no_debt' THEN 4
                        ELSE 5
                    END,
                    CASE WHEN health_factor IS NULL THEN 1 ELSE 0 END,
                    health_factor ASC NULLS LAST,
                    exposure_usd DESC,
                    slot DESC
                LIMIT $2
                """,
                protocol,
                limit,
            )
        return [_row_to_state(_mapping_from_row(row)) for row in rows]

    async def save_states(self, protocol: str, states: list[MarginfiAccountState]) -> None:
        if self._pool is None or not states:
            return None
        now_ms = int(time.time() * 1000)
        rows = [_state_to_row(protocol, state, now_ms) for state in states]
        async with self._pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO account_states (
                    protocol, pubkey, group_pk, authority, slot,
                    collateral_value, debt_value, exposure_usd, health_factor,
                    risk_level, health_cache_json, data_fingerprint, risk_fingerprint,
                    balances_json, received_at_ms, decoded_at_ms, rpc_endpoint, updated_at_ms
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10, $11::jsonb, $12, $13,
                    $14::jsonb, $15, $16, $17, $18
                )
                ON CONFLICT(protocol, pubkey) DO UPDATE SET
                    group_pk=excluded.group_pk,
                    authority=excluded.authority,
                    slot=excluded.slot,
                    collateral_value=excluded.collateral_value,
                    debt_value=excluded.debt_value,
                    exposure_usd=excluded.exposure_usd,
                    health_factor=excluded.health_factor,
                    risk_level=excluded.risk_level,
                    health_cache_json=excluded.health_cache_json,
                    data_fingerprint=excluded.data_fingerprint,
                    risk_fingerprint=excluded.risk_fingerprint,
                    balances_json=excluded.balances_json,
                    received_at_ms=excluded.received_at_ms,
                    decoded_at_ms=excluded.decoded_at_ms,
                    rpc_endpoint=excluded.rpc_endpoint,
                    updated_at_ms=excluded.updated_at_ms
                WHERE excluded.slot >= account_states.slot
                """,
                [
                    (
                        row[0],
                        row[1],
                        row[2],
                        row[3],
                        row[4],
                        row[5],
                        row[6],
                        row[7],
                        row[8],
                        row[9],
                        row[10],
                        row[11],
                        row[12],
                        row[13],
                        row[14],
                        row[15],
                        row[16],
                        row[17],
                    )
                    for row in rows
                ],
            )

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None


class AccountStateWriter:
    def __init__(
        self,
        store: AccountStateStore,
        protocol: str,
        queue_maxsize: int,
        batch_size: int,
        flush_interval_ms: int,
    ) -> None:
        self._store = store
        self._protocol = protocol
        self._queue: asyncio.Queue[MarginfiAccountState] = asyncio.Queue(maxsize=max(1, queue_maxsize))
        self._batch_size = max(1, batch_size)
        self._flush_interval_s = max(0.05, flush_interval_ms / 1000)
        self._dropped = 0

    @property
    def dropped(self) -> int:
        return self._dropped

    @property
    def pending(self) -> int:
        return self._queue.qsize()

    async def publish(self, state: MarginfiAccountState) -> None:
        await self._queue.put(state)

    async def flush(self) -> None:
        await self._queue.join()

    async def run(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set() or not self._queue.empty():
            try:
                first = await asyncio.wait_for(self._queue.get(), timeout=self._flush_interval_s)
            except TimeoutError:
                continue

            batch = [first]
            while len(batch) < self._batch_size:
                try:
                    batch.append(self._queue.get_nowait())
                except asyncio.QueueEmpty:
                    break

            try:
                await self._store.save_states(self._protocol, batch)
            except Exception:
                LOGGER.exception("failed to persist account state batch")
            finally:
                for _ in batch:
                    self._queue.task_done()


def build_account_state_store(config: RadarConfig) -> AccountStateStore:
    if not config.database_enabled:
        return DisabledAccountStateStore()

    database_url = config.database_url
    if database_url.startswith("sqlite://"):
        return SqliteAccountStateStore(database_url, Path(__file__).resolve().parent)
    if database_url.startswith(("mysql://", "mysql+", "mariadb://", "mariadb+")):
        return MySqlAccountStateStore(database_url)
    if database_url.startswith("postgres://") or database_url.startswith("postgresql://"):
        return PostgresAccountStateStore(database_url)

    raise ValueError(f"unsupported database url: {database_url}")
