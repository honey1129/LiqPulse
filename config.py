from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path


DEFAULT_MARGINFI_PROGRAM_ID = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
DEFAULT_WS_ENDPOINTS = ("wss://api.mainnet-beta.solana.com",)

# Official marginfi v2 type-crate layout as of current v2 sources:
# account discriminator (8) + MarginfiAccount (2304) = 2312 bytes.
MARGINFI_ACCOUNT_DATA_SIZE = 2312

# Absolute byte offsets inside account data including the 8-byte Anchor discriminator.
GROUP_OFFSET = 8
AUTHORITY_OFFSET = 40
LENDING_ACCOUNT_OFFSET = 72
ACCOUNT_FLAGS_OFFSET = 1800
EMISSIONS_DESTINATION_OFFSET = 1808
HEALTH_CACHE_OFFSET = 1840

# HealthCache I80F48 offsets relative to the account data buffer.
ASSET_VALUE_INITIAL_OFFSET = HEALTH_CACHE_OFFSET
LIABILITY_VALUE_INITIAL_OFFSET = HEALTH_CACHE_OFFSET + 16
ASSET_VALUE_MAINT_OFFSET = HEALTH_CACHE_OFFSET + 32
LIABILITY_VALUE_MAINT_OFFSET = HEALTH_CACHE_OFFSET + 48
ASSET_VALUE_EQUITY_OFFSET = HEALTH_CACHE_OFFSET + 64
LIABILITY_VALUE_EQUITY_OFFSET = HEALTH_CACHE_OFFSET + 80


def _split_csv(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _normalize_http_endpoint(endpoint: str) -> str:
    if endpoint.startswith("wss://"):
        return "https://" + endpoint.removeprefix("wss://")
    if endpoint.startswith("ws://"):
        return "http://" + endpoint.removeprefix("ws://")
    return endpoint


def _valid_env_key(key: str) -> bool:
    if not key:
        return False
    if not (key[0].isalpha() or key[0] == "_"):
        return False
    return all(char.isalnum() or char == "_" for char in key)


def _parse_env_value(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value.split(" #", 1)[0].strip()


def _load_env_file(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped.removeprefix("export ").lstrip()

        key, separator, value = stripped.partition("=")
        key = key.strip()
        if separator != "=" or not _valid_env_key(key):
            continue

        os.environ.setdefault(key, _parse_env_value(value))


def load_env_files() -> None:
    custom_env_file = os.getenv("LIQUIDATION_RADAR_ENV_FILE")
    if custom_env_file:
        _load_env_file(Path(custom_env_file).expanduser())
        return

    root = Path(__file__).resolve().parent
    for path in (root / ".env", root / ".env.runtime"):
        if path.is_file():
            _load_env_file(path)
            return


load_env_files()


def _get_decimal(name: str, default: str) -> Decimal:
    return Decimal(os.getenv(name, default))


def _get_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _get_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True, slots=True)
class RadarConfig:
    protocol: str
    program_id: str
    ws_endpoints: tuple[str, ...]
    http_endpoints: tuple[str, ...]
    commitment: str
    top_n: int
    refresh_interval_ms: int
    queue_maxsize: int
    risk_worker_count: int
    account_cache_size: int
    fingerprint_cache_size: int
    account_data_size: int
    min_display_hf: Decimal
    high_risk_hf: Decimal
    warning_hf: Decimal
    max_display_hf: Decimal
    require_usable_health_cache: bool
    ws_ping_interval: float
    ws_ping_timeout: float
    ws_open_timeout_s: float
    ws_subscribe_timeout_s: float
    ws_receive_timeout_s: float
    ws_heartbeat_interval_s: float
    ws_heartbeat_timeout_s: float
    reconnect_initial_delay_s: float
    reconnect_max_delay_s: float
    parse_active_balances: bool
    database_enabled: bool
    database_required: bool
    database_url: str
    database_warm_start_limit: int
    database_write_queue_size: int
    database_write_batch_size: int
    database_flush_interval_ms: int
    database_history_enabled: bool
    telegram_enabled: bool
    telegram_bot_token: str
    telegram_chat_id: str
    telegram_cooldown_ms: int
    telegram_timeout_s: float
    backfill_enabled: bool
    backfill_skip_on_warm_start: bool
    backfill_min_warm_start_records: int
    backfill_required: bool
    backfill_retry_count: int
    backfill_request_timeout_s: float
    collateral_offset: int
    debt_offset: int
    log_level: str

    @classmethod
    def from_env(cls) -> "RadarConfig":
        ws_endpoints = (
            _split_csv(os.getenv("SOLANA_WS_ENDPOINTS"))
            or _split_csv(os.getenv("LIQUIDATION_RADAR_WS_ENDPOINTS"))
            or DEFAULT_WS_ENDPOINTS
        )
        http_endpoints = (
            _split_csv(os.getenv("SOLANA_HTTP_ENDPOINTS"))
            or _split_csv(os.getenv("LIQUIDATION_RADAR_HTTP_ENDPOINTS"))
            or tuple(_normalize_http_endpoint(endpoint) for endpoint in ws_endpoints)
        )
        account_cache_size = _get_int("LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE", 50000)

        return cls(
            protocol=os.getenv("LIQUIDATION_RADAR_PROTOCOL", "marginfi").lower(),
            program_id=os.getenv("MARGINFI_PROGRAM_ID", DEFAULT_MARGINFI_PROGRAM_ID),
            ws_endpoints=ws_endpoints,
            http_endpoints=http_endpoints,
            commitment=os.getenv("SOLANA_COMMITMENT", "processed"),
            top_n=_get_int("LIQUIDATION_RADAR_TOP_N", 20),
            refresh_interval_ms=_get_int("LIQUIDATION_RADAR_REFRESH_MS", 500),
            queue_maxsize=_get_int("LIQUIDATION_RADAR_QUEUE_MAXSIZE", 20000),
            risk_worker_count=_get_int("LIQUIDATION_RADAR_RISK_WORKERS", 1),
            account_cache_size=account_cache_size,
            fingerprint_cache_size=_get_int("LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE", 75000),
            account_data_size=_get_int("MARGINFI_ACCOUNT_DATA_SIZE", MARGINFI_ACCOUNT_DATA_SIZE),
            min_display_hf=_get_decimal("LIQUIDATION_RADAR_MIN_DISPLAY_HF", "0"),
            high_risk_hf=_get_decimal("LIQUIDATION_RADAR_HIGH_RISK_HF", "1.05"),
            warning_hf=_get_decimal("LIQUIDATION_RADAR_WARNING_HF", "1.10"),
            max_display_hf=_get_decimal("LIQUIDATION_RADAR_MAX_DISPLAY_HF", "1.10"),
            require_usable_health_cache=_get_bool("LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE", True),
            ws_ping_interval=_get_float("LIQUIDATION_RADAR_WS_PING_INTERVAL", 20.0),
            ws_ping_timeout=_get_float("LIQUIDATION_RADAR_WS_PING_TIMEOUT", 20.0),
            ws_open_timeout_s=_get_float("LIQUIDATION_RADAR_WS_OPEN_TIMEOUT", 10.0),
            ws_subscribe_timeout_s=_get_float("LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT", 10.0),
            ws_receive_timeout_s=_get_float("LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT", 60.0),
            ws_heartbeat_interval_s=_get_float("LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL", 20.0),
            ws_heartbeat_timeout_s=_get_float("LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT", 10.0),
            reconnect_initial_delay_s=_get_float("LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY", 0.25),
            reconnect_max_delay_s=_get_float("LIQUIDATION_RADAR_RECONNECT_MAX_DELAY", 8.0),
            parse_active_balances=_get_bool("LIQUIDATION_RADAR_PARSE_BALANCES", True),
            database_enabled=_get_bool("LIQUIDATION_RADAR_DB_ENABLED", True),
            database_required=_get_bool("LIQUIDATION_RADAR_DB_REQUIRED", False),
            database_url=(
                os.getenv("LIQUIDATION_RADAR_DATABASE_URL")
                or os.getenv("DATABASE_URL")
                or "sqlite:///data/liqpulse.sqlite3"
            ),
            database_warm_start_limit=_get_int("LIQUIDATION_RADAR_DB_WARM_START_LIMIT", account_cache_size),
            database_write_queue_size=_get_int("LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE", 20000),
            database_write_batch_size=_get_int("LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE", 250),
            database_flush_interval_ms=_get_int("LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS", 500),
            database_history_enabled=_get_bool("LIQUIDATION_RADAR_DB_HISTORY_ENABLED", True),
            telegram_enabled=_get_bool("LIQUIDATION_RADAR_TELEGRAM_ENABLED", False),
            telegram_bot_token=os.getenv("LIQUIDATION_RADAR_TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.getenv("LIQUIDATION_RADAR_TELEGRAM_CHAT_ID", ""),
            telegram_cooldown_ms=_get_int("LIQUIDATION_RADAR_TELEGRAM_COOLDOWN_MS", 300000),
            telegram_timeout_s=_get_float("LIQUIDATION_RADAR_TELEGRAM_TIMEOUT", 8.0),
            backfill_enabled=_get_bool("LIQUIDATION_RADAR_BACKFILL_ENABLED", True),
            backfill_skip_on_warm_start=_get_bool("LIQUIDATION_RADAR_BACKFILL_SKIP_ON_WARM_START", True),
            backfill_min_warm_start_records=_get_int("LIQUIDATION_RADAR_BACKFILL_MIN_WARM_START_RECORDS", 1),
            backfill_required=_get_bool("LIQUIDATION_RADAR_BACKFILL_REQUIRED", False),
            backfill_retry_count=_get_int("LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT", 3),
            backfill_request_timeout_s=_get_float("LIQUIDATION_RADAR_BACKFILL_TIMEOUT", 30.0),
            collateral_offset=_get_int("MARGINFI_COLLATERAL_OFFSET", ASSET_VALUE_MAINT_OFFSET),
            debt_offset=_get_int("MARGINFI_DEBT_OFFSET", LIABILITY_VALUE_MAINT_OFFSET),
            log_level=os.getenv("LIQUIDATION_RADAR_LOG_LEVEL", "INFO").upper(),
        )
