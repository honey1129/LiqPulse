from __future__ import annotations


class RadarError(Exception):
    pass


class RpcTimeoutError(RadarError):
    pass


class AccountDecodeError(RadarError):
    pass


class InvalidAccountDataError(AccountDecodeError):
    pass
