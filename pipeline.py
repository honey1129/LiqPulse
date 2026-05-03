from __future__ import annotations

import asyncio
import logging
from typing import Protocol

from errors import AccountDecodeError, InvalidAccountDataError
from models import AccountUpdate, MarginfiAccountState, RiskLevel
from protocols import ProtocolAdapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from state_store import StateSink

LOGGER = logging.getLogger(__name__)


class RiskNotifier(Protocol):
    async def publish(self, state: MarginfiAccountState) -> None:
        ...


class NoopNotifier:
    async def publish(self, state: MarginfiAccountState) -> None:
        return None


async def process_account_update(
    update: AccountUpdate,
    protocol: ProtocolAdapter,
    risk_engine: RiskEngine,
    ranking_engine: RankingEngine,
    notifier: RiskNotifier,
    state_sink: StateSink | None = None,
) -> bool:
    try:
        decoded = protocol.decode(update)
        if decoded is None:
            ranking_engine.mark_skipped()
            return False

        previous = ranking_engine.peek(decoded.pubkey)
        evaluated = risk_engine.evaluate(decoded, previous)
        if not ranking_engine.upsert(evaluated):
            ranking_engine.mark_skipped()
            return False

        if state_sink is not None:
            try:
                await state_sink.publish(evaluated)
            except Exception:
                LOGGER.exception("failed to enqueue account state persistence")

        if evaluated.risk_level in {RiskLevel.LIQUIDATABLE, RiskLevel.HIGH}:
            await notifier.publish(evaluated)
        return True
    except InvalidAccountDataError as exc:
        ranking_engine.mark_skipped()
        LOGGER.debug("invalid account data: %s", exc)
    except AccountDecodeError as exc:
        ranking_engine.mark_skipped()
        LOGGER.error("decode error: %s", exc)
    except Exception:
        ranking_engine.mark_skipped()
        LOGGER.exception("failed to process account update")
    return False


async def process_updates(
    updates: asyncio.Queue[AccountUpdate],
    protocol: ProtocolAdapter,
    risk_engine: RiskEngine,
    ranking_engine: RankingEngine,
    notifier: RiskNotifier,
    stop_event: asyncio.Event,
    state_sink: StateSink | None = None,
) -> None:
    while not stop_event.is_set():
        try:
            update = await asyncio.wait_for(updates.get(), timeout=0.5)
        except TimeoutError:
            continue

        try:
            await process_account_update(update, protocol, risk_engine, ranking_engine, notifier, state_sink)
        finally:
            updates.task_done()
