from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets

from config import RadarConfig
from errors import RpcTimeoutError
from models import AccountUpdate, SubscriptionState
from protocols import ProtocolAdapter
from utils import extract_account_data, monotonic_ms, put_latest

LOGGER = logging.getLogger(__name__)


class RadarWebSocketClient:
    def __init__(
        self,
        config: RadarConfig,
        protocol: ProtocolAdapter,
        updates: asyncio.Queue[AccountUpdate],
    ) -> None:
        self._config = config
        self._protocol = protocol
        self._updates = updates
        self._request_id = 0
        self._endpoint_index = 0
        self._subscriptions: dict[str, SubscriptionState] = {}

    async def run(self, stop_event: asyncio.Event) -> None:
        delay = self._config.reconnect_initial_delay_s

        while not stop_event.is_set():
            endpoint = self._next_endpoint()
            try:
                await self._connect_and_consume(endpoint, stop_event)
                delay = self._config.reconnect_initial_delay_s
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                LOGGER.warning("websocket disconnected endpoint=%s error=%s", endpoint, exc)
                await self._sleep_or_stop(delay, stop_event)
                delay = min(delay * 2, self._config.reconnect_max_delay_s)

    def _next_endpoint(self) -> str:
        endpoint = self._config.ws_endpoints[self._endpoint_index % len(self._config.ws_endpoints)]
        self._endpoint_index += 1
        return endpoint

    async def _connect_and_consume(self, endpoint: str, stop_event: asyncio.Event) -> None:
        LOGGER.info("connecting websocket endpoint=%s", endpoint)
        async with websockets.connect(
            endpoint,
            open_timeout=self._config.ws_open_timeout_s,
            ping_interval=None,
            max_queue=None,
            close_timeout=5,
        ) as ws:
            subscription = await self._subscribe(ws, endpoint)
            heartbeat = asyncio.create_task(self._heartbeat_loop(ws, endpoint, stop_event), name="ws-heartbeat")
            consumer = asyncio.create_task(
                self._consume_loop(ws, endpoint, subscription.subscription_id, stop_event),
                name="ws-consumer",
            )

            try:
                done, pending = await asyncio.wait(
                    {heartbeat, consumer},
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

                for task in done:
                    exc = task.exception()
                    if exc:
                        raise exc

                if not stop_event.is_set():
                    raise ConnectionError("websocket task ended unexpectedly")
            finally:
                await self._unsubscribe(ws, endpoint)

    async def _subscribe(self, ws: Any, endpoint: str) -> SubscriptionState:
        self._request_id += 1
        request_id = self._request_id
        params: list[Any] = [
            self._protocol.program_id,
            {
                "encoding": "base64",
                "commitment": self._config.commitment,
                "filters": self._protocol.subscription_filters(),
            },
        ]
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "programSubscribe",
            "params": params,
        }
        await ws.send(json.dumps(request, separators=(",", ":")))
        LOGGER.info(
            "subscription request endpoint=%s request_id=%s protocol=%s program=%s account=%s",
            endpoint,
            request_id,
            self._protocol.protocol_name,
            self._protocol.program_id,
            self._protocol.account_label,
        )

        deadline = self._config.ws_subscribe_timeout_s
        while True:
            try:
                raw_message = await asyncio.wait_for(ws.recv(), timeout=deadline)
            except TimeoutError as exc:
                raise RpcTimeoutError(f"subscription timeout endpoint={endpoint}") from exc

            message = json.loads(raw_message)
            if "error" in message:
                raise RuntimeError(f"RPC subscription error: {message['error']}")
            if message.get("id") != request_id:
                LOGGER.debug("ignore pre-subscription message=%s", message)
                continue

            subscription_id = int(message["result"])
            subscription = SubscriptionState(
                endpoint=endpoint,
                request_id=request_id,
                subscription_id=subscription_id,
                program_id=self._protocol.program_id,
                created_at_ms=monotonic_ms(),
            )
            self._subscriptions[endpoint] = subscription
            LOGGER.info(
                "subscription confirmed endpoint=%s request_id=%s subscription_id=%s",
                endpoint,
                request_id,
                subscription_id,
            )
            return subscription

    async def _unsubscribe(self, ws: Any, endpoint: str) -> None:
        subscription = self._subscriptions.pop(endpoint, None)
        if subscription is None or getattr(ws, "closed", False):
            return

        self._request_id += 1
        request_id = self._request_id
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "programUnsubscribe",
            "params": [subscription.subscription_id],
        }
        try:
            await ws.send(json.dumps(request, separators=(",", ":")))
            await asyncio.wait_for(ws.recv(), timeout=2.0)
            LOGGER.info(
                "subscription closed endpoint=%s subscription_id=%s",
                endpoint,
                subscription.subscription_id,
            )
        except Exception as exc:
            LOGGER.debug("unsubscribe skipped endpoint=%s error=%s", endpoint, exc)

    async def _consume_loop(
        self,
        ws: Any,
        endpoint: str,
        subscription_id: int,
        stop_event: asyncio.Event,
    ) -> None:
        while not stop_event.is_set():
            try:
                raw_message = await asyncio.wait_for(ws.recv(), timeout=self._config.ws_receive_timeout_s)
            except TimeoutError as exc:
                raise RpcTimeoutError(f"websocket receive timeout endpoint={endpoint}") from exc
            await self._handle_message(raw_message, endpoint, subscription_id)

    async def _heartbeat_loop(self, ws: Any, endpoint: str, stop_event: asyncio.Event) -> None:
        interval = max(1.0, self._config.ws_heartbeat_interval_s)
        timeout = max(1.0, self._config.ws_heartbeat_timeout_s)
        while not stop_event.is_set():
            await self._sleep_or_stop(interval, stop_event)
            if stop_event.is_set():
                return
            try:
                pong_waiter = await ws.ping()
                await asyncio.wait_for(pong_waiter, timeout=timeout)
                LOGGER.debug("websocket heartbeat ok endpoint=%s", endpoint)
            except Exception as exc:
                await ws.close()
                raise RpcTimeoutError(f"websocket heartbeat failed endpoint={endpoint}") from exc

    async def _handle_message(self, raw_message: str | bytes, endpoint: str, subscription_id: int) -> None:
        message = json.loads(raw_message)

        if "error" in message:
            raise RuntimeError(f"RPC subscription error: {message['error']}")

        if message.get("method") != "programNotification":
            if "result" in message:
                LOGGER.info("subscription confirmed id=%s result=%s", message.get("id"), message["result"])
            return

        params = message.get("params") or {}
        result = params.get("result") or {}
        context = result.get("context") or {}
        value = result.get("value") or {}
        data_base64 = extract_account_data(value)
        if data_base64 is None:
            return

        account = value.get("account") or {}
        update = AccountUpdate(
            pubkey=value.get("pubkey", ""),
            slot=int(context.get("slot", 0)),
            data_base64=data_base64,
            lamports=account.get("lamports"),
            owner=account.get("owner"),
            executable=account.get("executable"),
            rent_epoch=account.get("rentEpoch"),
            received_at_ms=monotonic_ms(),
            rpc_endpoint=endpoint,
            subscription_id=subscription_id,
        )
        await put_latest(self._updates, update)

    @staticmethod
    async def _sleep_or_stop(delay: float, stop_event: asyncio.Event) -> None:
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=delay)
        except TimeoutError:
            return


MarginfiWebSocketClient = RadarWebSocketClient
