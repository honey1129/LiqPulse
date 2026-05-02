from __future__ import annotations

import asyncio
import base64
import hashlib
import time
from collections import OrderedDict
from decimal import Decimal, InvalidOperation
from typing import Any, Generic, TypeVar


I80F48_SCALE = Decimal(2**48)
MARGINFI_ACCOUNT_DISCRIMINATOR = bytes([67, 178, 130, 109, 126, 114, 28, 42])
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
K = TypeVar("K")
V = TypeVar("V")


def monotonic_ms() -> int:
    return int(time.monotonic() * 1000)


def anchor_account_discriminator(account_name: str) -> bytes:
    return hashlib.sha256(f"account:{account_name}".encode("utf-8")).digest()[:8]


def discriminator_base58(account_name: str) -> str:
    if account_name == "MarginfiAccount":
        return b58encode(MARGINFI_ACCOUNT_DISCRIMINATOR)
    return b58encode(anchor_account_discriminator(account_name))


def b58encode(data: bytes) -> str:
    value = int.from_bytes(data, "big")
    encoded = ""
    while value > 0:
        value, remainder = divmod(value, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded

    leading_zeros = len(data) - len(data.lstrip(b"\0"))
    return "1" * leading_zeros + (encoded or "")


def pubkey_from_bytes(data: bytes) -> str:
    return b58encode(data)


def decode_i80f48(raw: bytes) -> Decimal:
    if len(raw) != 16:
        raise ValueError("I80F48 requires exactly 16 bytes")
    value = int.from_bytes(raw, "little", signed=True)
    return Decimal(value) / I80F48_SCALE


def decode_u64_le(raw: bytes) -> int:
    if len(raw) != 8:
        raise ValueError("u64 requires exactly 8 bytes")
    return int.from_bytes(raw, "little", signed=False)


def decode_i64_le(raw: bytes) -> int:
    if len(raw) != 8:
        raise ValueError("i64 requires exactly 8 bytes")
    return int.from_bytes(raw, "little", signed=True)


def decode_u32_le(raw: bytes) -> int:
    if len(raw) != 4:
        raise ValueError("u32 requires exactly 4 bytes")
    return int.from_bytes(raw, "little", signed=False)


def decode_base64_account(data: str) -> bytes:
    return base64.b64decode(data, validate=True)


def short_pubkey(pubkey: str, width: int = 4) -> str:
    if len(pubkey) <= width * 2 + 3:
        return pubkey
    return f"{pubkey[:width]}...{pubkey[-width:]}"


def format_decimal(value: Decimal | None, places: int = 4) -> str:
    if value is None:
        return "-"
    try:
        quant = Decimal(1).scaleb(-places)
        return f"{value.quantize(quant):f}"
    except (InvalidOperation, ValueError):
        return str(value)


def format_usd(value: Decimal, places: int = 2) -> str:
    sign = "-" if value < 0 else ""
    value = abs(value)
    quant = Decimal(1).scaleb(-places)
    try:
        text = f"{value.quantize(quant):f}"
    except InvalidOperation:
        text = str(value)
    whole, _, frac = text.partition(".")
    groups: list[str] = []
    while whole:
        groups.append(whole[-3:])
        whole = whole[:-3]
    grouped = ",".join(reversed(groups or ["0"]))
    return f"{sign}${grouped}.{frac or '0' * places}"


def clear_screen() -> None:
    print("\033[2J\033[H", end="")


def extract_account_data(value: dict[str, Any]) -> str | None:
    account = value.get("account") or {}
    data = account.get("data")
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, str):
        return data
    return None


async def put_latest(queue: asyncio.Queue[Any], item: Any) -> None:
    try:
        queue.put_nowait(item)
        return
    except asyncio.QueueFull:
        pass

    try:
        queue.get_nowait()
        queue.task_done()
    except asyncio.QueueEmpty:
        pass
    queue.put_nowait(item)


class LruCache(Generic[K, V]):
    def __init__(self, maxsize: int) -> None:
        self._maxsize = max(1, maxsize)
        self._items: OrderedDict[K, V] = OrderedDict()
        self.evictions = 0

    @property
    def maxsize(self) -> int:
        return self._maxsize

    def get(self, key: K) -> V | None:
        try:
            value = self._items.pop(key)
        except KeyError:
            return None
        self._items[key] = value
        return value

    def put(self, key: K, value: V) -> None:
        if key in self._items:
            self._items.pop(key)
        self._items[key] = value
        if len(self._items) > self._maxsize:
            self._items.popitem(last=False)
            self.evictions += 1

    def values(self) -> list[V]:
        return list(self._items.values())

    def __len__(self) -> int:
        return len(self._items)
