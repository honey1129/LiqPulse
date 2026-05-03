from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal


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
    backfill_enabled: bool
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
            account_cache_size=_get_int("LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE", 50000),
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
            backfill_enabled=_get_bool("LIQUIDATION_RADAR_BACKFILL_ENABLED", True),
            backfill_required=_get_bool("LIQUIDATION_RADAR_BACKFILL_REQUIRED", False),
            backfill_retry_count=_get_int("LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT", 3),
            backfill_request_timeout_s=_get_float("LIQUIDATION_RADAR_BACKFILL_TIMEOUT", 30.0),
            collateral_offset=_get_int("MARGINFI_COLLATERAL_OFFSET", ASSET_VALUE_MAINT_OFFSET),
            debt_offset=_get_int("MARGINFI_DEBT_OFFSET", LIABILITY_VALUE_MAINT_OFFSET),
            log_level=os.getenv("LIQUIDATION_RADAR_LOG_LEVEL", "INFO").upper(),
        )
