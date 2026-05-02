from __future__ import annotations

from decimal import Decimal

from config import RadarConfig
from models import MarginfiAccountState, RiskLevel


class RiskEngine:
    def __init__(self, config: RadarConfig) -> None:
        self._config = config

    def evaluate(
        self,
        state: MarginfiAccountState,
        previous: MarginfiAccountState | None = None,
    ) -> MarginfiAccountState:
        if previous and previous.risk_fingerprint == state.risk_fingerprint:
            return state.with_risk(previous.health_factor, previous.risk_level)

        if self._config.require_usable_health_cache and not state.health_cache.usable:
            return state.with_risk(None, RiskLevel.INVALID)

        collateral = state.collateral_value
        debt = state.debt_value

        if collateral < 0 or debt < 0:
            return state.with_risk(None, RiskLevel.INVALID)

        if debt == 0:
            return state.with_risk(None, RiskLevel.NO_DEBT)

        health_factor = collateral / debt
        return state.with_risk(health_factor, self._risk_level(health_factor))

    def _risk_level(self, health_factor: Decimal) -> RiskLevel:
        if health_factor < Decimal("1.0"):
            return RiskLevel.LIQUIDATABLE
        if health_factor < self._config.high_risk_hf:
            return RiskLevel.HIGH
        if health_factor < self._config.warning_hf:
            return RiskLevel.WARNING
        return RiskLevel.HEALTHY
