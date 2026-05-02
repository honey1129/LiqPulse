# Liquidation Radar

## Install

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python main.py
```

or:

```bash
python main.py
```

## Replace RPC Endpoint

Single endpoint:

```bash
export SOLANA_WS_ENDPOINTS="wss://your-mainnet-rpc.example.com"
python main.py
```

Multiple fallback endpoints:

```bash
export SOLANA_WS_ENDPOINTS="wss://rpc-a.example.com,wss://rpc-b.example.com,wss://rpc-c.example.com"
python main.py
```

## Useful Env

```bash
export MARGINFI_PROGRAM_ID="MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
export LIQUIDATION_RADAR_TOP_N=20
export LIQUIDATION_RADAR_REFRESH_MS=500
export LIQUIDATION_RADAR_MAX_DISPLAY_HF=1.10
export LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE=true
export LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE=50000
export LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE=75000
export LIQUIDATION_RADAR_RISK_WORKERS=1
export SOLANA_COMMITMENT=processed
```

## WebSocket Runtime

```bash
export LIQUIDATION_RADAR_WS_OPEN_TIMEOUT=10
export LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT=10
export LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT=60
export LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL=20
export LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT=10
export LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY=0.25
export LIQUIDATION_RADAR_RECONNECT_MAX_DELAY=8
```

## Protocol Adapter

```bash
export LIQUIDATION_RADAR_PROTOCOL=marginfi
```

`solend` and `kamino` adapter slots are reserved in `protocols.py`.

## Decoder Offset Overrides

The default decoder reads marginfi v2 `HealthCache` maintenance asset/liability values:

```bash
export MARGINFI_COLLATERAL_OFFSET=1872
export MARGINFI_DEBT_OFFSET=1888
```
