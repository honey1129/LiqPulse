from __future__ import annotations

from collections import Counter
from decimal import Decimal

from config import RadarConfig
from models import MarginfiAccountState, RadarStats, RiskLevel
from utils import LruCache


class RankingEngine:
    def __init__(self, config: RadarConfig) -> None:
        self._config = config
        self._accounts: LruCache[str, MarginfiAccountState] = LruCache(config.account_cache_size)
        self._updates_processed = 0
        self._updates_skipped = 0
        self._last_slot = 0
        self._last_rpc_endpoint = ""

    def upsert(self, state: MarginfiAccountState) -> bool:
        previous = self._accounts.peek(state.pubkey)
        if previous is not None and previous.slot > 0 and state.slot > 0 and state.slot < previous.slot:
            return False

        self._accounts.put(state.pubkey, state)
        self._updates_processed += 1
        self._last_slot = max(self._last_slot, state.slot)
        if state.rpc_endpoint:
            self._last_rpc_endpoint = state.rpc_endpoint
        return True

    def mark_skipped(self) -> None:
        self._updates_skipped += 1

    def get(self, pubkey: str) -> MarginfiAccountState | None:
        return self._accounts.get(pubkey)

    def peek(self, pubkey: str) -> MarginfiAccountState | None:
        return self._accounts.peek(pubkey)

    def top(self, n: int | None = None) -> list[MarginfiAccountState]:
        limit = n or self._config.top_n
        candidates = [
            state
            for state in self._accounts.values()
            if self._is_display_candidate(state)
        ]
        if not candidates:
            candidates = [
                state
                for state in self._accounts.values()
                if state.health_factor is not None and state.debt_value > 0
            ]
        candidates.sort(key=lambda item: (item.health_factor or Decimal("Infinity"), -item.exposure_usd))
        return candidates[:limit]

    def stats(self) -> RadarStats:
        counts = Counter(state.risk_level for state in self._accounts.values())
        risk_accounts = counts[RiskLevel.LIQUIDATABLE] + counts[RiskLevel.HIGH] + counts[RiskLevel.WARNING]
        return RadarStats(
            accounts_total=len(self._accounts),
            risk_accounts=risk_accounts,
            liquidatable=counts[RiskLevel.LIQUIDATABLE],
            high=counts[RiskLevel.HIGH],
            warning=counts[RiskLevel.WARNING],
            healthy=counts[RiskLevel.HEALTHY],
            no_debt=counts[RiskLevel.NO_DEBT],
            invalid=counts[RiskLevel.INVALID],
            cache_capacity=self._accounts.maxsize,
            cache_evictions=self._accounts.evictions,
            updates_processed=self._updates_processed,
            updates_skipped=self._updates_skipped,
            last_slot=self._last_slot,
            last_rpc_endpoint=self._last_rpc_endpoint,
        )

    def _is_display_candidate(self, state: MarginfiAccountState) -> bool:
        if state.health_factor is None:
            return False
        if state.debt_value <= 0:
            return False
        if state.health_factor < self._config.min_display_hf:
            return False
        if self._config.max_display_hf > 0 and state.health_factor >= self._config.max_display_hf:
            return False
        return state.risk_level in {RiskLevel.LIQUIDATABLE, RiskLevel.HIGH, RiskLevel.WARNING}
