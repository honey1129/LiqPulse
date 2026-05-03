# LiqPulse

Realtime Solana liquidation radar for marginfi v2 accounts.

LiqPulse performs an HTTP snapshot backfill on startup, keeps the account stream hot
with Solana WebSocket subscriptions, ranks accounts by liquidation risk, and can
persist decoded account state in MySQL, SQLite, or PostgreSQL so restarts warm-start
from the latest known state before new live updates arrive.

## Features

- marginfi v2 account decoding and health-factor ranking.
- Initial `getProgramAccounts` backfill through HTTP RPC.
- Live Solana WebSocket subscriptions with reconnect handling.
- CLI radar view through `main.py`.
- WebSocket API bridge for the React/Vite frontend through `api_server.py`.
- Database-backed warm starts with batched state writes.
- MySQL, SQLite, and PostgreSQL persistence backends.

## Requirements

- Python 3.11+
- Node.js 18+ for frontend development
- Optional MySQL, PostgreSQL, or local SQLite persistence

## Install

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure

Copy the backend environment template and edit the RPC and database settings:

```bash
cp .env.example .env
```

The backend loads `.env` automatically on startup. You can also point at a custom
file with `LIQUIDATION_RADAR_ENV_FILE=/path/to/file`.

For frontend development:

```bash
cd front
cp .env.example .env
```

The frontend reads `VITE_RADAR_WS_URL`, which defaults to:

```bash
ws://127.0.0.1:8765
```

## Run CLI Radar

```bash
python main.py
```

This starts the backfill, WebSocket stream, risk engine, optional state writer,
and terminal dashboard.

## Run API Bridge and Frontend

Start the backend WebSocket bridge:

```bash
python api_server.py
```

Override the API bind address if needed:

```bash
export LIQUIDATION_RADAR_API_HOST=127.0.0.1
export LIQUIDATION_RADAR_API_PORT=8765
python api_server.py
```

Start the frontend in another shell:

```bash
cd front
npm install
npm run dev
```

If the API bridge is offline, the frontend falls back to mock data.

## Database Persistence and Warm Starts

When `LIQUIDATION_RADAR_DB_ENABLED=true`, both `main.py` and `api_server.py` use
the configured database store.

On startup, LiqPulse:

1. Creates the `account_states` table if it does not exist.
2. Loads the latest saved states for the active protocol into the ranking engine.
3. Runs the initial HTTP backfill.
4. Continues writing decoded live updates in batches.

If persistence fails and `LIQUIDATION_RADAR_DB_REQUIRED=false`, the service logs
the error and continues without database warm starts. Set
`LIQUIDATION_RADAR_DB_REQUIRED=true` when startup should fail if the database is
unavailable.

### MySQL

The default `.env.example` uses MySQL:

```bash
LIQUIDATION_RADAR_DATABASE_URL=mysql://liqpulse:password@127.0.0.1:3306/liqpulse?charset=utf8mb4
```

Create the database and user before first launch:

```sql
CREATE DATABASE liqpulse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'liqpulse'@'127.0.0.1' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON liqpulse.* TO 'liqpulse'@'127.0.0.1';
FLUSH PRIVILEGES;
```

The `account_states` table is created automatically by the application.

### SQLite

For a local file-backed store:

```bash
LIQUIDATION_RADAR_DATABASE_URL=sqlite:///data/liqpulse.sqlite3
```

The `data/` directory and SQLite table are created automatically.

### PostgreSQL

```bash
LIQUIDATION_RADAR_DATABASE_URL=postgresql://liqpulse:password@127.0.0.1:5432/liqpulse
```

## Initial Backfill and RPC Endpoints

At startup, LiqPulse performs a full marginfi account snapshot through HTTP RPC
`getProgramAccounts`, then processes live updates through WebSocket
subscriptions.

If your WebSocket endpoint does not expose HTTP on the same host, set explicit
HTTP endpoints:

```bash
SOLANA_HTTP_ENDPOINTS=https://your-http-rpc.example.com
```

Fallback RPCs are comma-separated:

```bash
SOLANA_WS_ENDPOINTS=wss://rpc-a.example.com,wss://rpc-b.example.com
SOLANA_HTTP_ENDPOINTS=https://rpc-a.example.com,https://rpc-b.example.com
```

## Key Environment Variables

```bash
MARGINFI_PROGRAM_ID=MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA
MARGINFI_ACCOUNT_DATA_SIZE=2312
MARGINFI_COLLATERAL_OFFSET=1872
MARGINFI_DEBT_OFFSET=1888

LIQUIDATION_RADAR_PROTOCOL=marginfi
LIQUIDATION_RADAR_API_HOST=0.0.0.0
LIQUIDATION_RADAR_API_PORT=8765
LIQUIDATION_RADAR_LOG_LEVEL=INFO

SOLANA_WS_ENDPOINTS=wss://api.mainnet-beta.solana.com
SOLANA_HTTP_ENDPOINTS=https://api.mainnet-beta.solana.com
SOLANA_COMMITMENT=processed

LIQUIDATION_RADAR_TOP_N=20
LIQUIDATION_RADAR_REFRESH_MS=500
LIQUIDATION_RADAR_QUEUE_MAXSIZE=20000
LIQUIDATION_RADAR_RISK_WORKERS=1
LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE=50000
LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE=75000

LIQUIDATION_RADAR_DB_ENABLED=true
LIQUIDATION_RADAR_DB_REQUIRED=false
LIQUIDATION_RADAR_DATABASE_URL=mysql://liqpulse:password@127.0.0.1:3306/liqpulse?charset=utf8mb4
LIQUIDATION_RADAR_DB_WARM_START_LIMIT=50000
LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE=20000
LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE=250
LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS=500

LIQUIDATION_RADAR_MIN_DISPLAY_HF=0
LIQUIDATION_RADAR_HIGH_RISK_HF=1.05
LIQUIDATION_RADAR_WARNING_HF=1.10
LIQUIDATION_RADAR_MAX_DISPLAY_HF=1.10
LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE=true
LIQUIDATION_RADAR_PARSE_BALANCES=true

LIQUIDATION_RADAR_BACKFILL_ENABLED=true
LIQUIDATION_RADAR_BACKFILL_REQUIRED=false
LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT=3
LIQUIDATION_RADAR_BACKFILL_TIMEOUT=30

LIQUIDATION_RADAR_WS_OPEN_TIMEOUT=10
LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT=10
LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT=60
LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL=20
LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT=10
LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY=0.25
LIQUIDATION_RADAR_RECONNECT_MAX_DELAY=8
```

## Protocol Adapter

Set the active protocol in `.env`:

```bash
LIQUIDATION_RADAR_PROTOCOL=marginfi
```

`solend` and `kamino` adapter slots are reserved in `protocols.py`, but only the
marginfi adapter is implemented today.

## Decoder Offset Overrides

The default decoder reads marginfi v2 `HealthCache` maintenance asset and
liability values. Override offsets only if the account layout changes:

```bash
MARGINFI_COLLATERAL_OFFSET=1872
MARGINFI_DEBT_OFFSET=1888
```
