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

## Run API Bridge For Frontend

Backend live WebSocket bridge:

```bash
python api_server.py
```

Default frontend stream URL:

```bash
ws://127.0.0.1:8765
```

Override API bind:

```bash
export LIQUIDATION_RADAR_API_HOST=127.0.0.1
export LIQUIDATION_RADAR_API_PORT=8765
python api_server.py
```

Run frontend:

```bash
cd front
cp .env.example .env
npm install
npm run dev
```

The frontend connects to `VITE_RADAR_WS_URL`; if the API bridge is offline it falls back to mock data.

## Initial Backfill

On startup the service now performs a full marginfi account snapshot through HTTP RPC `getProgramAccounts`, then keeps the live stream hot through WebSocket subscriptions.

If your WebSocket endpoint does not expose HTTP on the same host, set:

```bash
export SOLANA_HTTP_ENDPOINTS="https://your-http-rpc.example.com"
```

Fallback RPCs are supported:

```bash
export SOLANA_HTTP_ENDPOINTS="https://rpc-a.example.com,https://rpc-b.example.com"
```

## Replace RPC Endpoint

Single endpoint:

```bash
export SOLANA_WS_ENDPOINTS="wss://your-mainnet-rpc.example.com"
export SOLANA_HTTP_ENDPOINTS="https://your-mainnet-rpc.example.com"
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
export LIQUIDATION_RADAR_BACKFILL_ENABLED=true
export LIQUIDATION_RADAR_BACKFILL_REQUIRED=false
export LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT=3
export LIQUIDATION_RADAR_BACKFILL_TIMEOUT=30
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
