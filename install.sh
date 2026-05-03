#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-liqpulse}"
API_PROCESS_NAME="${API_PROCESS_NAME:-liqpulse-api}"
FRONTEND_PROCESS_NAME="${FRONTEND_PROCESS_NAME:-liqpulse-front}"
NODE_MAJOR="${NODE_MAJOR:-20}"

MARGINFI_PROGRAM_ID="${MARGINFI_PROGRAM_ID:-MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA}"
MARGINFI_ACCOUNT_DATA_SIZE="${MARGINFI_ACCOUNT_DATA_SIZE:-2312}"
MARGINFI_COLLATERAL_OFFSET="${MARGINFI_COLLATERAL_OFFSET:-1872}"
MARGINFI_DEBT_OFFSET="${MARGINFI_DEBT_OFFSET:-1888}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
LIQUIDATION_RADAR_API_HOST="${LIQUIDATION_RADAR_API_HOST:-0.0.0.0}"
LIQUIDATION_RADAR_API_PORT="${LIQUIDATION_RADAR_API_PORT:-8765}"
LIQUIDATION_RADAR_PROTOCOL="${LIQUIDATION_RADAR_PROTOCOL:-marginfi}"
SOLANA_WS_ENDPOINTS="${SOLANA_WS_ENDPOINTS:-wss://api.mainnet-beta.solana.com}"
SOLANA_HTTP_ENDPOINTS="${SOLANA_HTTP_ENDPOINTS:-}"
SOLANA_COMMITMENT="${SOLANA_COMMITMENT:-processed}"
LIQUIDATION_RADAR_LOG_LEVEL="${LIQUIDATION_RADAR_LOG_LEVEL:-INFO}"
LIQUIDATION_RADAR_TOP_N="${LIQUIDATION_RADAR_TOP_N:-20}"
LIQUIDATION_RADAR_REFRESH_MS="${LIQUIDATION_RADAR_REFRESH_MS:-500}"
LIQUIDATION_RADAR_QUEUE_MAXSIZE="${LIQUIDATION_RADAR_QUEUE_MAXSIZE:-20000}"
LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE="${LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE:-50000}"
LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE="${LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE:-75000}"
LIQUIDATION_RADAR_DB_ENABLED="${LIQUIDATION_RADAR_DB_ENABLED:-true}"
LIQUIDATION_RADAR_DB_REQUIRED="${LIQUIDATION_RADAR_DB_REQUIRED:-false}"
LIQUIDATION_RADAR_DATABASE_URL="${LIQUIDATION_RADAR_DATABASE_URL:-${DATABASE_URL:-sqlite:///data/liqpulse.sqlite3}}"
LIQUIDATION_RADAR_DB_WARM_START_LIMIT="${LIQUIDATION_RADAR_DB_WARM_START_LIMIT:-50000}"
LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE="${LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE:-20000}"
LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE="${LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE:-250}"
LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS="${LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS:-500}"
LIQUIDATION_RADAR_RISK_WORKERS="${LIQUIDATION_RADAR_RISK_WORKERS:-1}"
LIQUIDATION_RADAR_MIN_DISPLAY_HF="${LIQUIDATION_RADAR_MIN_DISPLAY_HF:-0}"
LIQUIDATION_RADAR_HIGH_RISK_HF="${LIQUIDATION_RADAR_HIGH_RISK_HF:-1.05}"
LIQUIDATION_RADAR_WARNING_HF="${LIQUIDATION_RADAR_WARNING_HF:-1.10}"
LIQUIDATION_RADAR_MAX_DISPLAY_HF="${LIQUIDATION_RADAR_MAX_DISPLAY_HF:-1.10}"
LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE="${LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE:-true}"
LIQUIDATION_RADAR_PARSE_BALANCES="${LIQUIDATION_RADAR_PARSE_BALANCES:-true}"
LIQUIDATION_RADAR_BACKFILL_ENABLED="${LIQUIDATION_RADAR_BACKFILL_ENABLED:-true}"
LIQUIDATION_RADAR_BACKFILL_REQUIRED="${LIQUIDATION_RADAR_BACKFILL_REQUIRED:-false}"
LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT="${LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT:-3}"
LIQUIDATION_RADAR_BACKFILL_TIMEOUT="${LIQUIDATION_RADAR_BACKFILL_TIMEOUT:-30}"
LIQUIDATION_RADAR_WS_OPEN_TIMEOUT="${LIQUIDATION_RADAR_WS_OPEN_TIMEOUT:-10}"
LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT="${LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT:-10}"
LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT="${LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT:-60}"
LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL="${LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL:-20}"
LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT="${LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT:-10}"
LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY="${LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY:-0.25}"
LIQUIDATION_RADAR_RECONNECT_MAX_DELAY="${LIQUIDATION_RADAR_RECONNECT_MAX_DELAY:-8}"

OPEN_FIREWALL="${OPEN_FIREWALL:-true}"
SKIP_PM2_STARTUP="${SKIP_PM2_STARTUP:-false}"
PUBLIC_WS_SCHEME="${PUBLIC_WS_SCHEME:-ws}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
PUBLIC_WS_URL="${PUBLIC_WS_URL:-}"
PYTHON_BIN="${PYTHON_BIN:-}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
if [[ -f "$SCRIPT_DIR/requirements.txt" && -d "$SCRIPT_DIR/front" ]]; then
  DEFAULT_APP_DIR="$SCRIPT_DIR"
else
  DEFAULT_APP_DIR="/opt/liqpulse"
fi

APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"
VENV_DIR="${VENV_DIR:-$APP_DIR/.venv}"

log() {
  printf '\033[1;34m[%s]\033[0m %s\n' "$APP_NAME" "$*"
}

warn() {
  printf '\033[1;33m[%s][warn]\033[0m %s\n' "$APP_NAME" "$*" >&2
}

die() {
  printf '\033[1;31m[%s][error]\033[0m %s\n' "$APP_NAME" "$*" >&2
  exit 1
}

trap 'die "Install failed at line ${LINENO}: ${BASH_COMMAND}"' ERR

is_true() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | y | Y | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required when not running as root"
    sudo "$@"
  fi
}

detect_os() {
  [[ "$(uname -s)" == "Linux" ]] || die "This installer targets Linux VPS hosts"

  OS_ID="unknown"
  OS_LIKE=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"
  fi

  if command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  elif command -v apk >/dev/null 2>&1; then
    PKG_MANAGER="apk"
  else
    die "Unsupported Linux package manager. Supported: apt, dnf, yum, apk"
  fi

  log "Detected OS: ${OS_ID} (${OS_LIKE:-none}), arch: $(uname -m), package manager: ${PKG_MANAGER}"
}

pkg_update() {
  case "$PKG_MANAGER" in
    apt) run_as_root apt-get update ;;
    dnf) run_as_root dnf makecache -y ;;
    yum) run_as_root yum makecache -y ;;
    apk) run_as_root apk update ;;
  esac
}

pkg_install() {
  case "$PKG_MANAGER" in
    apt) run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf) run_as_root dnf install -y "$@" ;;
    yum) run_as_root yum install -y "$@" ;;
    apk) run_as_root apk add --no-cache "$@" ;;
  esac
}

install_base_packages() {
  log "Installing base packages"
  pkg_update
  case "$PKG_MANAGER" in
    apt) pkg_install ca-certificates curl git build-essential pkg-config ;;
    dnf | yum) pkg_install ca-certificates curl git gcc gcc-c++ make pkgconfig ;;
    apk) pkg_install ca-certificates curl git build-base pkgconfig bash ;;
  esac
}

python_is_supported() {
  local bin="$1"
  "$bin" - <<'PY'
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
}

find_supported_python() {
  local candidates=()
  [[ -n "$PYTHON_BIN" ]] && candidates+=("$PYTHON_BIN")
  candidates+=(python3.13 python3.12 python3.11 python3)

  local bin
  for bin in "${candidates[@]}"; do
    if command -v "$bin" >/dev/null 2>&1 && python_is_supported "$bin"; then
      command -v "$bin"
      return 0
    fi
  done
  return 1
}

install_python_runtime() {
  if PYTHON_BIN="$(find_supported_python)"; then
    log "Using Python: $("$PYTHON_BIN" --version 2>&1) at ${PYTHON_BIN}"
    return
  fi

  log "Installing Python 3.11+ runtime"
  case "$PKG_MANAGER" in
    apt)
      if ! pkg_install python3.11 python3.11-venv python3.11-dev python3-pip; then
        if [[ "$OS_ID" == "ubuntu" ]]; then
          log "Adding deadsnakes PPA for Python 3.11"
          pkg_install software-properties-common
          run_as_root add-apt-repository -y ppa:deadsnakes/ppa
          pkg_update
          pkg_install python3.11 python3.11-venv python3.11-dev python3-pip
        else
          die "Python 3.11+ is unavailable from this apt repo. Set PYTHON_BIN=/path/to/python3.11 and rerun"
        fi
      fi
      ;;
    dnf | yum)
      pkg_install python3 python3-pip python3-devel
      ;;
    apk)
      pkg_install python3 py3-pip python3-dev py3-virtualenv
      ;;
  esac

  PYTHON_BIN="$(find_supported_python)" || die "Python 3.11+ is required"
  log "Using Python: $("$PYTHON_BIN" --version 2>&1) at ${PYTHON_BIN}"
}

node_major_version() {
  node -p 'Number.parseInt(process.versions.node.split(".")[0], 10)' 2>/dev/null || printf '0'
}

node_is_supported() {
  command -v node >/dev/null 2>&1 || return 1
  command -v npm >/dev/null 2>&1 || return 1
  [[ "$(node_major_version)" -ge 18 ]]
}

install_nodesource_apt() {
  local setup_file="/tmp/nodesource_setup_${NODE_MAJOR}.sh"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$setup_file"
  run_as_root bash "$setup_file"
  pkg_install nodejs
}

install_nodesource_rpm() {
  local setup_file="/tmp/nodesource_setup_${NODE_MAJOR}.sh"
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" -o "$setup_file"
  run_as_root bash "$setup_file"
  pkg_install nodejs
}

install_node_runtime() {
  if node_is_supported; then
    log "Using Node: $(node --version), npm: $(npm --version)"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x"
  case "$PKG_MANAGER" in
    apt) install_nodesource_apt ;;
    dnf | yum) install_nodesource_rpm ;;
    apk) pkg_install nodejs npm ;;
  esac

  node_is_supported || die "Node.js 18+ and npm are required"
  log "Using Node: $(node --version), npm: $(npm --version)"
}

install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "Using PM2: $(pm2 --version)"
    return
  fi

  log "Installing PM2"
  run_as_root npm install -g pm2@latest
  command -v pm2 >/dev/null 2>&1 || die "PM2 installation failed"
  log "Using PM2: $(pm2 --version)"
}

validate_app_dir() {
  [[ -d "$APP_DIR" ]] || die "APP_DIR=${APP_DIR} does not exist. Clone or upload the project first, then rerun this script"
  [[ -f "$APP_DIR/requirements.txt" ]] || die "Missing requirements.txt in ${APP_DIR}. Run from the LiqPulse root or set APP_DIR=/path/to/LiqPulse"
  [[ -f "$APP_DIR/api_server.py" ]] || die "Missing api_server.py in ${APP_DIR}. Run from the LiqPulse root or set APP_DIR=/path/to/LiqPulse"
  [[ -f "$APP_DIR/front/package.json" ]] || die "Missing front/package.json in ${APP_DIR}. Run from the LiqPulse root or set APP_DIR=/path/to/LiqPulse"
  log "Project directory: ${APP_DIR}"
}

load_runtime_env() {
  local env_file="$APP_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    return
  fi

  log "Loading runtime env from ${env_file}"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

detect_public_host() {
  if [[ -n "$PUBLIC_HOST" ]]; then
    printf '%s' "$PUBLIC_HOST"
    return
  fi

  local detected=""
  detected="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "$detected" ]]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  printf '%s' "${detected:-127.0.0.1}"
}

resolve_public_urls() {
  PUBLIC_HOST_VALUE="$(detect_public_host)"
  if [[ -z "$PUBLIC_WS_URL" ]]; then
    PUBLIC_WS_URL="${PUBLIC_WS_SCHEME}://${PUBLIC_HOST_VALUE}:${LIQUIDATION_RADAR_API_PORT}"
  fi
  log "Frontend WebSocket URL: ${PUBLIC_WS_URL}"
}

write_runtime_env() {
  cat > "$APP_DIR/.env" <<EOF
MARGINFI_PROGRAM_ID=${MARGINFI_PROGRAM_ID}
MARGINFI_ACCOUNT_DATA_SIZE=${MARGINFI_ACCOUNT_DATA_SIZE}
MARGINFI_COLLATERAL_OFFSET=${MARGINFI_COLLATERAL_OFFSET}
MARGINFI_DEBT_OFFSET=${MARGINFI_DEBT_OFFSET}
LIQUIDATION_RADAR_PROTOCOL=${LIQUIDATION_RADAR_PROTOCOL}
SOLANA_WS_ENDPOINTS=${SOLANA_WS_ENDPOINTS}
SOLANA_HTTP_ENDPOINTS=${SOLANA_HTTP_ENDPOINTS}
SOLANA_COMMITMENT=${SOLANA_COMMITMENT}
LIQUIDATION_RADAR_API_HOST=${LIQUIDATION_RADAR_API_HOST}
LIQUIDATION_RADAR_API_PORT=${LIQUIDATION_RADAR_API_PORT}
LIQUIDATION_RADAR_LOG_LEVEL=${LIQUIDATION_RADAR_LOG_LEVEL}
LIQUIDATION_RADAR_TOP_N=${LIQUIDATION_RADAR_TOP_N}
LIQUIDATION_RADAR_REFRESH_MS=${LIQUIDATION_RADAR_REFRESH_MS}
LIQUIDATION_RADAR_QUEUE_MAXSIZE=${LIQUIDATION_RADAR_QUEUE_MAXSIZE}
LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE=${LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE}
LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE=${LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE}
LIQUIDATION_RADAR_DB_ENABLED=${LIQUIDATION_RADAR_DB_ENABLED}
LIQUIDATION_RADAR_DB_REQUIRED=${LIQUIDATION_RADAR_DB_REQUIRED}
LIQUIDATION_RADAR_DATABASE_URL=${LIQUIDATION_RADAR_DATABASE_URL}
LIQUIDATION_RADAR_DB_WARM_START_LIMIT=${LIQUIDATION_RADAR_DB_WARM_START_LIMIT}
LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE=${LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE}
LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE=${LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE}
LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS=${LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS}
LIQUIDATION_RADAR_RISK_WORKERS=${LIQUIDATION_RADAR_RISK_WORKERS}
LIQUIDATION_RADAR_MIN_DISPLAY_HF=${LIQUIDATION_RADAR_MIN_DISPLAY_HF}
LIQUIDATION_RADAR_HIGH_RISK_HF=${LIQUIDATION_RADAR_HIGH_RISK_HF}
LIQUIDATION_RADAR_WARNING_HF=${LIQUIDATION_RADAR_WARNING_HF}
LIQUIDATION_RADAR_MAX_DISPLAY_HF=${LIQUIDATION_RADAR_MAX_DISPLAY_HF}
LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE=${LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE}
LIQUIDATION_RADAR_PARSE_BALANCES=${LIQUIDATION_RADAR_PARSE_BALANCES}
LIQUIDATION_RADAR_BACKFILL_ENABLED=${LIQUIDATION_RADAR_BACKFILL_ENABLED}
LIQUIDATION_RADAR_BACKFILL_REQUIRED=${LIQUIDATION_RADAR_BACKFILL_REQUIRED}
LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT=${LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT}
LIQUIDATION_RADAR_BACKFILL_TIMEOUT=${LIQUIDATION_RADAR_BACKFILL_TIMEOUT}
LIQUIDATION_RADAR_WS_OPEN_TIMEOUT=${LIQUIDATION_RADAR_WS_OPEN_TIMEOUT}
LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT=${LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT}
LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT=${LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT}
LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL=${LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL}
LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT=${LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT}
LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY=${LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY}
LIQUIDATION_RADAR_RECONNECT_MAX_DELAY=${LIQUIDATION_RADAR_RECONNECT_MAX_DELAY}
EOF
  chmod 600 "$APP_DIR/.env"

  cat > "$APP_DIR/front/.env.production" <<EOF
VITE_RADAR_WS_URL=${PUBLIC_WS_URL}
EOF
  chmod 600 "$APP_DIR/front/.env.production"
}

export_runtime_env() {
  export MARGINFI_PROGRAM_ID
  export MARGINFI_ACCOUNT_DATA_SIZE
  export MARGINFI_COLLATERAL_OFFSET
  export MARGINFI_DEBT_OFFSET
  export LIQUIDATION_RADAR_PROTOCOL
  export SOLANA_WS_ENDPOINTS
  export SOLANA_HTTP_ENDPOINTS
  export SOLANA_COMMITMENT
  export LIQUIDATION_RADAR_API_HOST
  export LIQUIDATION_RADAR_API_PORT
  export LIQUIDATION_RADAR_LOG_LEVEL
  export LIQUIDATION_RADAR_TOP_N
  export LIQUIDATION_RADAR_REFRESH_MS
  export LIQUIDATION_RADAR_QUEUE_MAXSIZE
  export LIQUIDATION_RADAR_ACCOUNT_CACHE_SIZE
  export LIQUIDATION_RADAR_FINGERPRINT_CACHE_SIZE
  export LIQUIDATION_RADAR_DB_ENABLED
  export LIQUIDATION_RADAR_DB_REQUIRED
  export LIQUIDATION_RADAR_DATABASE_URL
  export LIQUIDATION_RADAR_DB_WARM_START_LIMIT
  export LIQUIDATION_RADAR_DB_WRITE_QUEUE_SIZE
  export LIQUIDATION_RADAR_DB_WRITE_BATCH_SIZE
  export LIQUIDATION_RADAR_DB_FLUSH_INTERVAL_MS
  export LIQUIDATION_RADAR_RISK_WORKERS
  export LIQUIDATION_RADAR_MIN_DISPLAY_HF
  export LIQUIDATION_RADAR_HIGH_RISK_HF
  export LIQUIDATION_RADAR_WARNING_HF
  export LIQUIDATION_RADAR_MAX_DISPLAY_HF
  export LIQUIDATION_RADAR_REQUIRE_USABLE_CACHE
  export LIQUIDATION_RADAR_PARSE_BALANCES
  export LIQUIDATION_RADAR_BACKFILL_ENABLED
  export LIQUIDATION_RADAR_BACKFILL_REQUIRED
  export LIQUIDATION_RADAR_BACKFILL_RETRY_COUNT
  export LIQUIDATION_RADAR_BACKFILL_TIMEOUT
  export LIQUIDATION_RADAR_WS_OPEN_TIMEOUT
  export LIQUIDATION_RADAR_WS_SUBSCRIBE_TIMEOUT
  export LIQUIDATION_RADAR_WS_RECEIVE_TIMEOUT
  export LIQUIDATION_RADAR_WS_HEARTBEAT_INTERVAL
  export LIQUIDATION_RADAR_WS_HEARTBEAT_TIMEOUT
  export LIQUIDATION_RADAR_RECONNECT_INITIAL_DELAY
  export LIQUIDATION_RADAR_RECONNECT_MAX_DELAY
}

install_python_deps() {
  log "Installing Python dependencies"
  if [[ -x "$VENV_DIR/bin/python" ]] && ! python_is_supported "$VENV_DIR/bin/python"; then
    warn "Existing virtualenv uses unsupported Python; recreating it"
    "$PYTHON_BIN" -m venv --clear "$VENV_DIR"
  else
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi

  "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
  "$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt"
}

install_frontend_deps_and_build() {
  log "Installing frontend dependencies and building production bundle"
  pushd "$APP_DIR/front" >/dev/null
  if [[ -f package-lock.json ]]; then
    NPM_CONFIG_PRODUCTION=false npm ci
  else
    NPM_CONFIG_PRODUCTION=false npm install
  fi
  npm run build
  popd >/dev/null
}

pm2_delete_if_exists() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 delete "$name" >/dev/null
  fi
}

start_pm2_processes() {
  log "Starting project with PM2"
  export_runtime_env

  pm2_delete_if_exists "$API_PROCESS_NAME"
  pm2 start "$APP_DIR/api_server.py" \
    --name "$API_PROCESS_NAME" \
    --cwd "$APP_DIR" \
    --interpreter "$VENV_DIR/bin/python" \
    --time

  pm2_delete_if_exists "$FRONTEND_PROCESS_NAME"
  pm2 serve "$APP_DIR/front/dist" "$FRONTEND_PORT" \
    --spa \
    --name "$FRONTEND_PROCESS_NAME"
}

configure_firewall() {
  is_true "$OPEN_FIREWALL" || return 0

  if command -v ufw >/dev/null 2>&1 && run_as_root ufw status 2>/dev/null | grep -qi "Status: active"; then
    log "Opening ports with ufw"
    run_as_root ufw allow "${FRONTEND_PORT}/tcp"
    run_as_root ufw allow "${LIQUIDATION_RADAR_API_PORT}/tcp"
  elif command -v firewall-cmd >/dev/null 2>&1 && run_as_root firewall-cmd --state >/dev/null 2>&1; then
    log "Opening ports with firewalld"
    run_as_root firewall-cmd --permanent --add-port="${FRONTEND_PORT}/tcp"
    run_as_root firewall-cmd --permanent --add-port="${LIQUIDATION_RADAR_API_PORT}/tcp"
    run_as_root firewall-cmd --reload
  else
    warn "No active ufw/firewalld detected; make sure ports ${FRONTEND_PORT} and ${LIQUIDATION_RADAR_API_PORT} are reachable"
  fi
}

setup_pm2_startup() {
  if is_true "$SKIP_PM2_STARTUP"; then
    warn "Skipping PM2 startup registration"
    pm2 save
    return
  fi

  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    log "Registering PM2 startup service"
    if ! run_as_root env PATH="$PATH" pm2 startup systemd -u "$(id -un)" --hp "$HOME"; then
      warn "PM2 startup registration failed; services are running but may not restart after reboot"
    fi
  else
    warn "systemd not detected; skipping PM2 startup registration"
  fi

  pm2 save
}

print_summary() {
  log "Deployment complete"
  printf '\n'
  printf 'Frontend: http://%s:%s\n' "$PUBLIC_HOST_VALUE" "$FRONTEND_PORT"
  printf 'Radar WS: %s\n' "$PUBLIC_WS_URL"
  printf 'PM2 status: pm2 status\n'
  printf 'API logs: pm2 logs %s\n' "$API_PROCESS_NAME"
  printf 'Frontend logs: pm2 logs %s\n' "$FRONTEND_PROCESS_NAME"
  printf '\n'
}

main() {
  detect_os
  validate_app_dir
  load_runtime_env
  install_base_packages
  install_python_runtime
  install_node_runtime
  install_pm2
  resolve_public_urls
  write_runtime_env
  install_python_deps
  install_frontend_deps_and_build
  start_pm2_processes
  configure_firewall
  setup_pm2_startup
  print_summary
}

main "$@"
