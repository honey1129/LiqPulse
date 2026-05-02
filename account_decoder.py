from __future__ import annotations

import hashlib
import binascii
import logging
from decimal import Decimal

from config import (
    ASSET_VALUE_EQUITY_OFFSET,
    ASSET_VALUE_INITIAL_OFFSET,
    ASSET_VALUE_MAINT_OFFSET,
    AUTHORITY_OFFSET,
    GROUP_OFFSET,
    HEALTH_CACHE_OFFSET,
    LENDING_ACCOUNT_OFFSET,
    LIABILITY_VALUE_EQUITY_OFFSET,
    LIABILITY_VALUE_INITIAL_OFFSET,
    LIABILITY_VALUE_MAINT_OFFSET,
    RadarConfig,
)
from errors import AccountDecodeError, InvalidAccountDataError
from models import AccountUpdate, BalanceSnapshot, HealthCacheState, MarginfiAccountState, RiskLevel
from utils import (
    LruCache,
    MARGINFI_ACCOUNT_DISCRIMINATOR,
    decode_base64_account,
    decode_i64_le,
    decode_i80f48,
    decode_u32_le,
    decode_u64_le,
    monotonic_ms,
    pubkey_from_bytes,
)

LOGGER = logging.getLogger(__name__)


class MarginfiAccountDecoder:
    BALANCE_SIZE = 104
    MAX_BALANCES = 16

    def __init__(self, config: RadarConfig) -> None:
        self._config = config
        self._fingerprints: LruCache[str, bytes] = LruCache(config.fingerprint_cache_size)

    def decode(self, update: AccountUpdate) -> MarginfiAccountState | None:
        if update.owner and update.owner != self._config.program_id:
            raise InvalidAccountDataError(f"owner mismatch account={update.pubkey} owner={update.owner}")

        try:
            data = decode_base64_account(update.data_base64)
        except (binascii.Error, ValueError) as exc:
            raise AccountDecodeError(f"invalid base64 account={update.pubkey}") from exc

        if len(data) != self._config.account_data_size:
            raise InvalidAccountDataError(
                f"invalid account size account={update.pubkey} len={len(data)} expected={self._config.account_data_size}"
            )

        if data[:8] != MARGINFI_ACCOUNT_DISCRIMINATOR:
            raise InvalidAccountDataError(f"discriminator mismatch account={update.pubkey}")

        digest = hashlib.blake2b(data, digest_size=16).digest()
        if self._fingerprints.get(update.pubkey) == digest:
            return None
        self._fingerprints.put(update.pubkey, digest)

        risk_fingerprint = self._risk_fingerprint(data)

        group = pubkey_from_bytes(data[GROUP_OFFSET : GROUP_OFFSET + 32])
        authority = pubkey_from_bytes(data[AUTHORITY_OFFSET : AUTHORITY_OFFSET + 32])
        health_cache = self._decode_health_cache(data)
        balances = self._decode_balances(data) if self._config.parse_active_balances else ()

        collateral_value = self._decode_configured_value(data, self._config.collateral_offset)
        debt_value = self._decode_configured_value(data, self._config.debt_offset)
        exposure_usd = max(Decimal("0"), collateral_value) + max(Decimal("0"), debt_value)

        return MarginfiAccountState(
            pubkey=update.pubkey,
            group=group,
            authority=authority,
            slot=update.slot,
            collateral_value=collateral_value,
            debt_value=debt_value,
            exposure_usd=exposure_usd,
            health_factor=None,
            risk_level=RiskLevel.INVALID,
            health_cache=health_cache,
            data_fingerprint=digest,
            risk_fingerprint=risk_fingerprint,
            balances=balances,
            received_at_ms=update.received_at_ms,
            decoded_at_ms=monotonic_ms(),
            rpc_endpoint=update.rpc_endpoint,
        )

    def _decode_configured_value(self, data: bytes, offset: int) -> Decimal:
        return decode_i80f48(data[offset : offset + 16])

    def _decode_health_cache(self, data: bytes) -> HealthCacheState:
        h = HEALTH_CACHE_OFFSET
        return HealthCacheState(
            asset_value_initial=decode_i80f48(data[ASSET_VALUE_INITIAL_OFFSET : ASSET_VALUE_INITIAL_OFFSET + 16]),
            liability_value_initial=decode_i80f48(data[LIABILITY_VALUE_INITIAL_OFFSET : LIABILITY_VALUE_INITIAL_OFFSET + 16]),
            asset_value_maint=decode_i80f48(data[ASSET_VALUE_MAINT_OFFSET : ASSET_VALUE_MAINT_OFFSET + 16]),
            liability_value_maint=decode_i80f48(data[LIABILITY_VALUE_MAINT_OFFSET : LIABILITY_VALUE_MAINT_OFFSET + 16]),
            asset_value_equity=decode_i80f48(data[ASSET_VALUE_EQUITY_OFFSET : ASSET_VALUE_EQUITY_OFFSET + 16]),
            liability_value_equity=decode_i80f48(data[LIABILITY_VALUE_EQUITY_OFFSET : LIABILITY_VALUE_EQUITY_OFFSET + 16]),
            timestamp=decode_i64_le(data[h + 96 : h + 104]),
            flags=decode_u32_le(data[h + 104 : h + 108]),
            internal_err=decode_u32_le(data[h + 240 : h + 244]),
            internal_liq_err=decode_u32_le(data[h + 248 : h + 252]),
            bankruptcy_err=decode_u32_le(data[h + 252 : h + 256]),
            program_version=data[h + 245],
        )

    def _risk_fingerprint(self, data: bytes) -> bytes:
        h = HEALTH_CACHE_OFFSET
        collateral_offset = self._config.collateral_offset
        debt_offset = self._config.debt_offset
        material = b"".join(
            (
                data[collateral_offset : collateral_offset + 16],
                data[debt_offset : debt_offset + 16],
                data[h + 104 : h + 108],
                data[h + 240 : h + 256],
            )
        )
        return hashlib.blake2b(material, digest_size=16).digest()

    def _decode_balances(self, data: bytes) -> tuple[BalanceSnapshot, ...]:
        balances: list[BalanceSnapshot] = []
        for index in range(self.MAX_BALANCES):
            offset = LENDING_ACCOUNT_OFFSET + index * self.BALANCE_SIZE
            active = data[offset]
            if active == 0:
                continue

            bank_pk = pubkey_from_bytes(data[offset + 1 : offset + 33])
            asset_shares = decode_i80f48(data[offset + 40 : offset + 56])
            liability_shares = decode_i80f48(data[offset + 56 : offset + 72])
            last_update = decode_u64_le(data[offset + 88 : offset + 96])

            balances.append(
                BalanceSnapshot(
                    bank_pk=bank_pk,
                    asset_shares=asset_shares,
                    liability_shares=liability_shares,
                    last_update=last_update,
                )
            )

        return tuple(balances)
