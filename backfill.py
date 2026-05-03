from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

from solana.rpc.async_api import AsyncClient
from solana.rpc.types import MemcmpOpts
from solders.pubkey import Pubkey

from config import RadarConfig
from models import AccountUpdate
from pipeline import NoopNotifier, process_account_update
from protocols import ProtocolAdapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from utils import discriminator_base58, monotonic_ms

LOGGER = logging.getLogger(__name__)


def _account_data_bytes(data: Any) -> bytes | None:
    if isinstance(data, bytes):
        return data
    if isinstance(data, bytearray):
        return bytes(data)
    if isinstance(data, str):
        try:
            return base64.b64decode(data, validate=True)
        except Exception:
            return None
    if isinstance(data, (list, tuple)) and data:
        head = data[0]
        if isinstance(head, str):
            try:
                return base64.b64decode(head, validate=True)
            except Exception:
                return None
        if isinstance(head, bytes):
            return head
    return None


class InitialBackfillRunner:
    def __init__(
        self,
        config: RadarConfig,
        protocol: ProtocolAdapter,
        risk_engine: RiskEngine,
        ranking_engine: RankingEngine,
    ) -> None:
        self._config = config
        self._protocol = protocol
        self._risk_engine = risk_engine
        self._ranking_engine = ranking_engine

    async def run(self, stop_event: asyncio.Event) -> None:
        if not self._config.backfill_enabled:
            LOGGER.info("initial backfill disabled")
            return

        errors: list[str] = []
        for attempt in range(1, max(1, self._config.backfill_retry_count) + 1):
            if stop_event.is_set():
                return

            for endpoint in self._config.http_endpoints:
                try:
                    processed = await self._run_endpoint(endpoint, stop_event)
                    LOGGER.info(
                        "initial backfill complete endpoint=%s processed=%s attempt=%s",
                        endpoint,
                        processed,
                        attempt,
                    )
                    return
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    message = f"{endpoint}: {exc}"
                    errors.append(message)
                    LOGGER.warning("initial backfill failed endpoint=%s attempt=%s error=%s", endpoint, attempt, exc)

            if attempt < self._config.backfill_retry_count and not stop_event.is_set():
                await asyncio.sleep(min(2.0 * attempt, 10.0))

        message = "; ".join(errors) if errors else "unknown error"
        if self._config.backfill_required:
            raise RuntimeError(f"initial backfill failed: {message}")
        LOGGER.warning("initial backfill skipped after failures: %s", message)

    async def _run_endpoint(self, endpoint: str, stop_event: asyncio.Event) -> int:
        filter_bytes = discriminator_base58(self._protocol.account_label)
        filters = [
            self._protocol.account_data_size,
            MemcmpOpts(offset=0, bytes=filter_bytes),
        ]

        async with AsyncClient(endpoint, commitment=self._config.commitment, timeout=self._config.backfill_request_timeout_s) as client:
            slot_resp = await client.get_slot(commitment=self._config.commitment)
            slot = int(slot_resp.value)
            response = await client.get_program_accounts(
                Pubkey.from_string(self._protocol.program_id),
                commitment=self._config.commitment,
                encoding="base64",
                filters=filters,
            )

        accounts = list(response.value)
        total = len(accounts)
        LOGGER.info("initial backfill endpoint=%s slot=%s accounts=%s", endpoint, slot, total)

        accepted = 0
        seen = 0
        notifier = NoopNotifier()
        for index, keyed_account in enumerate(accounts, start=1):
            if stop_event.is_set():
                break

            account_data = _account_data_bytes(keyed_account.account.data)
            if account_data is None:
                continue

            update = AccountUpdate(
                pubkey=str(keyed_account.pubkey),
                slot=slot,
                data_base64=base64.b64encode(account_data).decode("ascii"),
                lamports=int(keyed_account.account.lamports),
                owner=str(keyed_account.account.owner),
                executable=bool(keyed_account.account.executable),
                rent_epoch=int(keyed_account.account.rent_epoch),
                received_at_ms=monotonic_ms(),
                rpc_endpoint=endpoint,
                subscription_id=None,
            )
            seen += 1
            if await process_account_update(update, self._protocol, self._risk_engine, self._ranking_engine, notifier):
                accepted += 1

            if index % 250 == 0:
                LOGGER.info(
                    "initial backfill progress endpoint=%s processed=%s/%s",
                    endpoint,
                    index,
                    total,
                )
                await asyncio.sleep(0)

        LOGGER.info(
            "initial backfill endpoint=%s accepted=%s seen=%s total=%s",
            endpoint,
            accepted,
            seen,
            total,
        )
        return accepted
