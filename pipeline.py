from __future__ import annotations

import asyncio
import html
import json
import logging
import time
from typing import Protocol
from urllib import request

from config import RadarConfig
from errors import AccountDecodeError, InvalidAccountDataError
from models import AccountUpdate, MarginfiAccountState, RiskLevel
from protocols import ProtocolAdapter
from ranking_engine import RankingEngine
from risk_engine import RiskEngine
from state_store import StateSink

LOGGER = logging.getLogger(__name__)


class RiskNotifier(Protocol):
    @property
    def configured(self) -> bool:
        ...

    @property
    def enabled(self) -> bool:
        ...

    def set_enabled(self, enabled: bool) -> bool:
        ...

    async def publish(self, state: MarginfiAccountState) -> None:
        ...


class NoopNotifier:
    @property
    def configured(self) -> bool:
        return False

    @property
    def enabled(self) -> bool:
        return False

    def set_enabled(self, enabled: bool) -> bool:
        return False

    async def publish(self, state: MarginfiAccountState) -> None:
        return None


class TelegramNotifier:
    def __init__(
        self,
        bot_token: str,
        chat_id: str,
        enabled: bool,
        cooldown_ms: int,
        timeout_s: float,
    ) -> None:
        self._bot_token = bot_token
        self._chat_id = chat_id
        self._enabled = enabled
        self._cooldown_ms = max(0, cooldown_ms)
        self._timeout_s = max(1.0, timeout_s)
        self._last_sent_ms: dict[tuple[str, RiskLevel], int] = {}
        self._lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(self._bot_token and self._chat_id)

    @property
    def enabled(self) -> bool:
        return self.configured and self._enabled

    def set_enabled(self, enabled: bool) -> bool:
        if not self.configured:
            return False
        self._enabled = enabled
        return True

    async def publish(self, state: MarginfiAccountState) -> None:
        if not self.enabled:
            return

        async with self._lock:
            now_ms = int(time.time() * 1000)
            key = (state.pubkey, state.risk_level)
            last_sent_ms = self._last_sent_ms.get(key, 0)
            if self._cooldown_ms > 0 and now_ms - last_sent_ms < self._cooldown_ms:
                return

            await asyncio.to_thread(self._send_message, self._message(state))
            self._last_sent_ms[key] = now_ms

    def _send_message(self, text: str) -> None:
        url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
        payload = {
            "chat_id": self._chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self._timeout_s) as response:
            if response.status >= 400:
                raise RuntimeError(f"telegram send failed status={response.status}")

    def _message(self, state: MarginfiAccountState) -> str:
        risk_label = {
            RiskLevel.LIQUIDATABLE: "Liquidatable",
            RiskLevel.HIGH: "High Risk",
            RiskLevel.WARNING: "Warning",
            RiskLevel.HEALTHY: "Healthy",
            RiskLevel.NO_DEBT: "No Debt",
            RiskLevel.INVALID: "Invalid",
        }[state.risk_level]
        hf = "INF" if state.health_factor is None else f"{state.health_factor:.6f}"
        collateral = f"${state.collateral_value:,.2f}"
        debt = f"${state.debt_value:,.2f}"
        exposure = f"${state.exposure_usd:,.2f}"
        return "\n".join(
            [
                "<b>LiqPulse Risk Alert</b>",
                f"Risk: <b>{html.escape(risk_label)}</b>",
                f"HF: <code>{html.escape(hf)}</code>",
                f"Collateral: <code>{html.escape(collateral)}</code>",
                f"Debt: <code>{html.escape(debt)}</code>",
                f"Exposure: <code>{html.escape(exposure)}</code>",
                f"Account: <code>{html.escape(state.pubkey)}</code>",
                f"Authority: <code>{html.escape(state.authority)}</code>",
                f"Slot: <code>{state.slot}</code>",
            ]
        )


def build_risk_notifier(config: RadarConfig) -> RiskNotifier:
    if not config.telegram_bot_token or not config.telegram_chat_id:
        if config.telegram_enabled:
            LOGGER.warning("telegram alerts enabled but token/chat id are missing")
        return NoopNotifier()

    return TelegramNotifier(
        bot_token=config.telegram_bot_token,
        chat_id=config.telegram_chat_id,
        enabled=config.telegram_enabled,
        cooldown_ms=config.telegram_cooldown_ms,
        timeout_s=config.telegram_timeout_s,
    )


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
            try:
                await notifier.publish(evaluated)
            except Exception:
                LOGGER.exception("failed to publish risk notification")
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
