from __future__ import annotations

from dataclasses import dataclass, field, replace
from decimal import Decimal
from enum import StrEnum
from typing import Any


class RiskLevel(StrEnum):
    LIQUIDATABLE = "liquidatable"
    HIGH = "high"
    WARNING = "warning"
    HEALTHY = "healthy"
    NO_DEBT = "no_debt"
    INVALID = "invalid"


@dataclass(frozen=True, slots=True)
class AccountUpdate:
    pubkey: str
    slot: int
    data_base64: str
    lamports: int | None = None
    owner: str | None = None
    executable: bool | None = None
    rent_epoch: int | None = None
    received_at_ms: int = 0
    rpc_endpoint: str = ""
    subscription_id: int | None = None


@dataclass(frozen=True, slots=True)
class SubscriptionState:
    endpoint: str
    request_id: int
    subscription_id: int
    program_id: str
    created_at_ms: int


@dataclass(frozen=True, slots=True)
class HealthCacheState:
    asset_value_initial: Decimal
    liability_value_initial: Decimal
    asset_value_maint: Decimal
    liability_value_maint: Decimal
    asset_value_equity: Decimal
    liability_value_equity: Decimal
    timestamp: int
    flags: int
    internal_err: int
    internal_liq_err: int
    bankruptcy_err: int
    program_version: int

    @property
    def engine_ok(self) -> bool:
        return (self.flags & 2) == 2

    @property
    def oracle_ok(self) -> bool:
        return (self.flags & 4) == 4

    @property
    def usable(self) -> bool:
        return self.engine_ok and self.oracle_ok and self.internal_err == 0


@dataclass(frozen=True, slots=True)
class BalanceSnapshot:
    bank_pk: str
    asset_shares: Decimal
    liability_shares: Decimal
    last_update: int


@dataclass(frozen=True, slots=True)
class MarginfiAccountState:
    pubkey: str
    group: str
    authority: str
    slot: int
    collateral_value: Decimal
    debt_value: Decimal
    exposure_usd: Decimal
    health_factor: Decimal | None
    risk_level: RiskLevel
    health_cache: HealthCacheState
    data_fingerprint: bytes
    risk_fingerprint: bytes
    balances: tuple[BalanceSnapshot, ...] = field(default_factory=tuple)
    received_at_ms: int = 0
    decoded_at_ms: int = 0
    rpc_endpoint: str = ""

    @property
    def latency_ms(self) -> int:
        if self.received_at_ms <= 0 or self.decoded_at_ms <= 0:
            return 0
        return max(0, self.decoded_at_ms - self.received_at_ms)

    def with_risk(self, health_factor: Decimal | None, risk_level: RiskLevel) -> "MarginfiAccountState":
        return replace(self, health_factor=health_factor, risk_level=risk_level)


@dataclass(frozen=True, slots=True)
class RadarStats:
    accounts_total: int = 0
    risk_accounts: int = 0
    liquidatable: int = 0
    high: int = 0
    warning: int = 0
    healthy: int = 0
    no_debt: int = 0
    invalid: int = 0
    cache_capacity: int = 0
    cache_evictions: int = 0
    updates_processed: int = 0
    updates_skipped: int = 0
    last_slot: int = 0
    last_rpc_endpoint: str = ""


NotifierPayload = dict[str, Any]
