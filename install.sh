#!/bin/sh
set -eu

PACKAGE_NAME="${FOGACT_PACKAGE:-fogact}"
GITHUB_REPO="${FOGACT_GITHUB_REPO:-FogMaly/fogact}"
GIT_REF="${FOGACT_GIT_REF:-main}"
INSTALL_METHOD="${FOGACT_INSTALL_METHOD:-npm}"
INSTALL_DIR="${FOGACT_INSTALL_DIR:-}"
SERVICE="${FOGACT_SERVICE:-}"
CODE="${FOGACT_CODE:-}"
API_KEY="${NEWAPI_API_KEY:-${FOGACT_API_KEY:-}}"
BASE_URL="${NEWAPI_BASE_URL:-${FOGACT_BASE_URL:-}}"
FOGACT_API_BASE_VALUE="${FOGACT_API_BASE:-}"
PLATFORMS="${FOGACT_PLATFORMS:-}"
RUN_WEB="${FOGACT_RUN_WEB:-0}"
WEB_PORT="${PORT:-${FOGACT_WEB_PORT:-34020}}"
ADMIN_PASSWORD_VALUE="${ADMIN_PASSWORD:-${FOGACT_ADMIN_PASSWORD:-}}"
SKIP_VERIFY="${FOGACT_SKIP_VERIFY:-0}"
ALL_PLATFORMS="${FOGACT_ALL:-0}"
NO_ACTIVATE="${FOGACT_NO_ACTIVATE:-0}"
NO_REDEEM="${FOGACT_NO_REDEEM:-0}"
CREATE_SYSTEMD="${FOGACT_SYSTEMD:-0}"

log() { printf '%s\n' "==> $*"; }
warn() { printf '%s\n' "WARN: $*" >&2; }
fail() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
is_root() { [ "$(id -u 2>/dev/null || echo 1)" = "0" ]; }

usage() {
  cat <<'EOF'
FogAct bootstrap installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/FogMaly/fogact/main/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/FogMaly/fogact/main/install.sh | sh -s -- --service codex --code YOUR_CODE

Options:
  --service <codex|claude>       Activate a specific service after install
  --code <code>                  Activation / redeem code
  --api-key <key>                NewAPI key for direct activation
  --base-url <url>               NewAPI base URL for direct activation
  --fogact-api-base <url>      Activation backend URL for code mode
  --platforms <ids>              Comma-separated target platform ids
  --all                          Configure all creatable optional platforms
  --skip-verify                  Skip NewAPI /v1/models verification
  --no-redeem                    Do not mark activation code as redeemed
  --no-activate                  Install only
  --web                          Start local Web UI after install
  --systemd                      Create and start a systemd Web UI service
  --method <npm|github>          Install from npm package or GitHub source
  --install-dir <path>           GitHub source install directory
  -h, --help                     Show help

Environment variables mirror the options:
  FOGACT_PACKAGE=fogact, FOGACT_SERVICE, FOGACT_CODE, NEWAPI_BASE_URL, NEWAPI_API_KEY,
  FOGACT_API_BASE, FOGACT_PLATFORMS, FOGACT_ALL=1,
  FOGACT_SKIP_VERIFY=1, FOGACT_RUN_WEB=1, FOGACT_SYSTEMD=1
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --service) SERVICE="${2:-}"; shift 2 ;;
    --code) CODE="${2:-}"; shift 2 ;;
    --api-key) API_KEY="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --fogact-api-base) FOGACT_API_BASE_VALUE="${2:-}"; shift 2 ;;
    --platforms) PLATFORMS="${2:-}"; shift 2 ;;
    --all) ALL_PLATFORMS=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --no-redeem) NO_REDEEM=1; shift ;;
    --no-activate) NO_ACTIVATE=1; shift ;;
    --web) RUN_WEB=1; shift ;;
    --systemd) CREATE_SYSTEMD=1; RUN_WEB=1; shift ;;
    --method) INSTALL_METHOD="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

run_sudo() {
  if is_root; then
    "$@"
  elif has sudo; then
    sudo "$@"
  else
    fail "Need root or sudo to install missing system packages. Install Node.js 16+ manually, then rerun."
  fi
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

node_ok() {
  has node && has npm && [ "$(node_major)" -ge 16 ]
}

recover_apt_state() {
  if ! has apt-get; then
    return
  fi

  needs_recovery=0
  dpkg_audit="$(dpkg --audit 2>/dev/null || true)"
  if [ -n "$dpkg_audit" ]; then
    needs_recovery=1
  elif [ -f /var/lib/dpkg/updates/0000 ]; then
    needs_recovery=1
  elif [ -d /var/lib/dpkg/updates ] && find /var/lib/dpkg/updates -type f 2>/dev/null | grep -q .; then
    needs_recovery=1
  fi

  if [ "$needs_recovery" = "1" ]; then
    log "dpkg has pending updates; running dpkg --configure -a"
    run_sudo dpkg --configure -a || fail "dpkg recovery failed. Run 'sudo dpkg --configure -a' manually, then rerun this installer."
  fi
}

apt_update() {
  if ! run_sudo apt-get update; then
    warn "apt update failed; attempting dpkg/apt recovery"
    recover_apt_state
    run_sudo apt-get -f install -y || fail "apt dependency repair failed. Run 'sudo apt-get -f install -y' manually, then rerun this installer."
    run_sudo apt-get update || fail "apt update failed. Run 'sudo dpkg --configure -a' and 'sudo apt-get -f install -y', then rerun this installer."
  fi
}

apt_install() {
  if ! run_sudo apt-get install -y "$@"; then
    warn "apt install failed; attempting dpkg/apt recovery"
    recover_apt_state
    run_sudo apt-get -f install -y || fail "apt dependency repair failed. Run 'sudo apt-get -f install -y' manually, then rerun this installer."
    run_sudo apt-get install -y "$@" || fail "apt install failed. Run 'sudo dpkg --configure -a' and 'sudo apt-get -f install -y', then rerun this installer."
  fi
}

install_node_system() {
  log "Node.js 16+ not found; installing Node.js"

  if has apt-get; then
    recover_apt_state
    apt_update
    apt_install ca-certificates curl gnupg
    if has curl; then
      if curl -fsSL https://deb.nodesource.com/setup_20.x | run_sudo bash -; then
        apt_install nodejs
      else
        warn "NodeSource setup failed; falling back to distro nodejs/npm"
        apt_install nodejs npm
      fi
    else
      apt_install nodejs npm
    fi
    return
  fi

  if has dnf; then
    run_sudo dnf install -y ca-certificates curl
    if has curl && curl -fsSL https://rpm.nodesource.com/setup_20.x | run_sudo bash -; then
      run_sudo dnf install -y nodejs
    else
      warn "NodeSource setup failed; falling back to distro nodejs/npm"
      run_sudo dnf install -y nodejs npm
    fi
    return
  fi

  if has yum; then
    run_sudo yum install -y ca-certificates curl
    if has curl && curl -fsSL https://rpm.nodesource.com/setup_20.x | run_sudo bash -; then
      run_sudo yum install -y nodejs
    else
      warn "NodeSource setup failed; falling back to distro nodejs/npm"
      run_sudo yum install -y nodejs npm
    fi
    return
  fi

  if has apk; then
    run_sudo apk add --no-cache nodejs npm
    return
  fi

  if has pacman; then
    run_sudo pacman -Sy --noconfirm nodejs npm
    return
  fi

  if has zypper; then
    run_sudo zypper --non-interactive install nodejs20 npm20 || run_sudo zypper --non-interactive install nodejs npm
    return
  fi

  if has brew; then
    brew install node
    return
  fi

  fail "Unsupported OS package manager. Install Node.js 16+ and npm, then rerun."
}

ensure_node() {
  if node_ok; then
    log "Node.js $(node -v) and npm $(npm -v) detected"
    return
  fi

  install_node_system

  if ! node_ok; then
    fail "Node.js 16+ and npm are still unavailable after installation."
  fi

  log "Node.js $(node -v) and npm $(npm -v) ready"
}

ensure_global_npm_prefix() {
  prefix="$(npm config get prefix 2>/dev/null || echo /usr/local)"
  bindir="$prefix/bin"

  if is_root || [ -w "$prefix" ] || [ -w "$bindir" ]; then
    return
  fi

  user_prefix="${HOME:-$PWD}/.local"
  log "Global npm prefix is not writable; using $user_prefix"
  mkdir -p "$user_prefix/bin"
  npm config set prefix "$user_prefix" >/dev/null
  PATH="$user_prefix/bin:$PATH"
  export PATH

  case ":$PATH:" in
    *":$user_prefix/bin:"*) : ;;
    *) PATH="$user_prefix/bin:$PATH"; export PATH ;;
  esac

  shell_rc="${HOME:-}/.profile"
  if [ -n "${HOME:-}" ] && [ -f "$shell_rc" ] && ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$shell_rc" 2>/dev/null; then
    printf '\n# FogAct npm global binaries\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$shell_rc" || true
  fi
}

ensure_git() {
  if has git; then
    return
  fi

  log "git not found; installing git"
  if has apt-get; then run_sudo apt-get update && run_sudo apt-get install -y git; return; fi
  if has dnf; then run_sudo dnf install -y git; return; fi
  if has yum; then run_sudo yum install -y git; return; fi
  if has apk; then run_sudo apk add --no-cache git; return; fi
  if has pacman; then run_sudo pacman -Sy --noconfirm git; return; fi
  if has zypper; then run_sudo zypper --non-interactive install git; return; fi
  if has brew; then brew install git; return; fi
  fail "git is required for --method github. Install git, then rerun."
}

install_from_npm() {
  ensure_global_npm_prefix
  log "Installing $PACKAGE_NAME from npm"
  npm install -g "$PACKAGE_NAME@latest"
}

install_from_github() {
  ensure_git
  if [ -z "$INSTALL_DIR" ]; then
    if is_root; then
      INSTALL_DIR="/opt/fogact"
    else
      INSTALL_DIR="${HOME:-$PWD}/.local/share/fogact"
    fi
  fi

  log "Installing from GitHub: $GITHUB_REPO#$GIT_REF"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$GIT_REF"
    git -C "$INSTALL_DIR" checkout -q FETCH_HEAD
  else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 --branch "$GIT_REF" "https://github.com/$GITHUB_REPO.git" "$INSTALL_DIR"
  fi

  (cd "$INSTALL_DIR" && npm install)

  fogact_cli() {
    node "$INSTALL_DIR/bin/cli.js" "$@"
  }
  fogact_web() {
    node "$INSTALL_DIR/bin/web-server.js" "$@"
  }
}

find_public_ip() {
  if has curl; then
    curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true
  elif has wget; then
    wget -qO- --timeout=3 https://api.ipify.org 2>/dev/null || true
  fi
}

start_web_background() {
  log "Starting FogAct Web UI on port $WEB_PORT"
  log_dir="${HOME:-$PWD}/.fogact/logs"
  mkdir -p "$log_dir"

  if has fogact-web; then
    PORT="$WEB_PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD_VALUE" nohup fogact-web > "$log_dir/web.log" 2>&1 &
  else
    PORT="$WEB_PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD_VALUE" nohup sh -c 'node "$1"' sh "$INSTALL_DIR/bin/web-server.js" > "$log_dir/web.log" 2>&1 &
  fi

  sleep 2
  log "Web UI log: $log_dir/web.log"
  log "Local: http://127.0.0.1:$WEB_PORT/"
  public_ip="$(find_public_ip)"
  if [ -n "$public_ip" ]; then
    log "Public: http://$public_ip:$WEB_PORT/"
  fi
}

create_systemd_service() {
  if ! has systemctl; then
    warn "systemd not found; falling back to background start"
    start_web_background
    return
  fi

  if ! is_root; then
    warn "systemd service creation needs root; falling back to background start"
    start_web_background
    return
  fi

  web_bin="$(command -v fogact-web 2>/dev/null || true)"
  if [ -z "$web_bin" ] && [ -n "$INSTALL_DIR" ]; then
    web_bin="/usr/bin/node $INSTALL_DIR/bin/web-server.js"
  fi
  [ -n "$web_bin" ] || fail "Cannot locate fogact-web binary for systemd service."

  cat > /etc/systemd/system/fogact-web.service <<EOF
[Unit]
Description=FogAct Web UI
After=network.target

[Service]
Type=simple
Environment=PORT=$WEB_PORT
Environment=ADMIN_PASSWORD=$ADMIN_PASSWORD_VALUE
ExecStart=$web_bin
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now fogact-web.service
  log "systemd service started: fogact-web.service"
}

run_activation() {
  if [ "$NO_ACTIVATE" = "1" ]; then
    return
  fi

  if [ -z "$SERVICE" ] && [ -z "$CODE" ] && [ -z "$API_KEY" ]; then
    log "Install complete. No activation options supplied."
    print_next_steps
    return
  fi

  if [ -n "$BASE_URL" ]; then export NEWAPI_BASE_URL="$BASE_URL"; fi
  if [ -n "$API_KEY" ]; then export NEWAPI_API_KEY="$API_KEY"; fi
  if [ -n "$FOGACT_API_BASE_VALUE" ]; then export FOGACT_API_BASE="$FOGACT_API_BASE_VALUE"; fi

  set -- wizard --yes
  if [ -n "$SERVICE" ]; then set -- "$@" --service "$SERVICE"; fi
  if [ -n "$CODE" ]; then set -- "$@" --code "$CODE"; fi
  if [ -n "$API_KEY" ]; then set -- "$@" --api-key "$API_KEY"; fi
  if [ -n "$PLATFORMS" ]; then set -- "$@" --platforms "$PLATFORMS"; fi
  if [ "$ALL_PLATFORMS" = "1" ]; then set -- "$@" --all; fi
  if [ "$SKIP_VERIFY" = "1" ]; then set -- "$@" --skip-verify; fi
  if [ "$NO_REDEEM" = "1" ]; then set -- "$@" --no-redeem; fi

  log "Running activation"
  if [ "$INSTALL_METHOD" = "github" ]; then
    node "$INSTALL_DIR/bin/cli.js" "$@"
  else
    fogact "$@"
  fi
}

print_next_steps() {
  cat <<EOF

Next command:
  fogact

This opens the same interactive activation menu as:
  npx fogact
EOF
}

main() {
  log "FogAct bootstrap"
  ensure_node

  case "$INSTALL_METHOD" in
    npm) install_from_npm ;;
    github) install_from_github ;;
    *) fail "Unsupported install method: $INSTALL_METHOD" ;;
  esac

  run_activation

  if [ "$RUN_WEB" = "1" ]; then
    if [ "$CREATE_SYSTEMD" = "1" ]; then
      create_systemd_service
    else
      start_web_background
    fi
  fi

  log "Done"
}

main
