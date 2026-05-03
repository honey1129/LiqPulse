# Liquidation Radar

## Install

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment File

Copy the template and edit it:

```bash
cp .env.example .env
```

The backend loads `.env` automatically on startup. For frontend dev:

```bash
cd front
cp .env.example .env
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
SOLANA_HTTP_ENDPOINTS=https://your-http-rpc.example.com
```

Fallback RPCs are supported:

```bash
SOLANA_HTTP_ENDPOINTS=https://rpc-a.example.com,https://rpc-b.example.com
```

## Replace RPC Endpoint

Single endpoint:

Edit `.env`:

```bash
SOLANA_WS_ENDPOINTS=wss://your-mainnet-rpc.example.com
SOLANA_HTTP_ENDPOINTS=https://your-mainnet-rpc.example.com
```

Multiple fallback endpoints:

```bash
SOLANA_WS_ENDPOINTS=wss://rpc-a.example.com,wss://rpc-b.example.com,wss://rpc-c.example.com
```

## Useful Env

```bash
MARGINFI_PROGRAM_ID=MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA
LIQUIDATION_RADAR_TOP_N=20
LIQUIDATION_RADAR_REFRESH_MS=500
LIQUIDATION_RADAR_MAX_DISPLAY_HF=1.10
LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE=true
LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE=50000
LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE=75000
LIQUIDATION_RADAR_RISK_WORKERS=1
SOLANA_COMMITMENT=processed
LIQUIDATION_RADAR_BACKFILL_ENABLED=true
LIQUIDATION_RADAR_BACKFILL_REQUIRED=false
LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT=3
LIQUIDATION_RADAR_BACKFILL_TIMEOUT=30
```

## WebSocket Runtime

Use `.env` values instead of shell exports.

## Protocol Adapter

Set `LIQUIDATION_RADAR_PROTOCOL=marginfi` in `.env`.

`solend` and `kamino` adapter slots are reserved in `protocols.py`.

## Decoder Offset Overrides

The default decoder reads marginfi v2 `HealthCache` maintenance asset/liability values:

Set the offsets in `.env` if your program layout differs.
