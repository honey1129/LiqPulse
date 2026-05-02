from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from account_decoder import MarginfiAccountDecoder
from config import RadarConfig
from models import AccountUpdate, MarginfiAccountState
from utils import discriminator_base58


RpcFilter = dict[str, object]


class ProtocolAdapter(Protocol):
    protocol_name: str
    account_label: str

    @property
    def program_id(self) -> str:
        ...

    @property
    def account_data_size(self) -> int:
        ...

    def subscription_filters(self) -> list[RpcFilter]:
        ...

    def decode(self, update: AccountUpdate) -> MarginfiAccountState | None:
        ...


@dataclass(slots=True)
class MarginfiProtocolAdapter:
    config: RadarConfig
    protocol_name: str = "marginfi"
    account_label: str = "MarginfiAccount"
    _decoder: MarginfiAccountDecoder = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._decoder = MarginfiAccountDecoder(self.config)

    @property
    def program_id(self) -> str:
        return self.config.program_id

    @property
    def account_data_size(self) -> int:
        return self.config.account_data_size

    def subscription_filters(self) -> list[RpcFilter]:
        return [
            {"memcmp": {"offset": 0, "bytes": discriminator_base58(self.account_label)}},
            {"dataSize": self.account_data_size},
        ]

    def decode(self, update: AccountUpdate) -> MarginfiAccountState | None:
        return self._decoder.decode(update)


@dataclass(frozen=True, slots=True)
class UnsupportedProtocolAdapter:
    protocol_name: str
    account_label: str

    @property
    def program_id(self) -> str:
        raise NotImplementedError(f"{self.protocol_name} adapter is not implemented yet")

    @property
    def account_data_size(self) -> int:
        raise NotImplementedError(f"{self.protocol_name} adapter is not implemented yet")

    def subscription_filters(self) -> list[RpcFilter]:
        raise NotImplementedError(f"{self.protocol_name} adapter is not implemented yet")

    def decode(self, update: AccountUpdate) -> MarginfiAccountState | None:
        raise NotImplementedError(f"{self.protocol_name} adapter is not implemented yet")


def build_protocol_adapter(config: RadarConfig) -> ProtocolAdapter:
    if config.protocol == "marginfi":
        return MarginfiProtocolAdapter(config)
    if config.protocol == "solend":
        return UnsupportedProtocolAdapter("solend", "Obligation")
    if config.protocol == "kamino":
        return UnsupportedProtocolAdapter("kamino", "Obligation")
    raise ValueError(f"unsupported protocol: {config.protocol}")
