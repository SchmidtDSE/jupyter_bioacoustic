#!/usr/bin/env bash
# Shared bootstrap/launch logic for the macOS .app and Linux .desktop wrappers.
# Sourced (not executed) by a thin per-platform launcher that sets:
#   APP_SUPPORT   per-user data dir (holds pixi binary + env/)
#   PAYLOAD       installer payload dir (holds the bundled pixi binary + manifest + lock)
#   NOTIFY        optional fn(msg) for a native toast (macOS: osascript)
#
# Design notes:
#  - pixi is BUNDLED (copied from PAYLOAD), pinned + checksum-verified — no network fetch of pixi.
#  - the env is installed from a bundled pixi.lock → reproducible first run.
#  - updates are CHECK-AND-PROMPT, throttled, constraint-bounded (see maybe_update).
set -euo pipefail

PIXI_VERSION="0.70.0"          # pin: must match the bundled binary
ENV_DIR="$APP_SUPPORT/env"
PIXI="$APP_SUPPORT/pixi"
STAMP="$APP_SUPPORT/.last-update-check"
LOG="$APP_SUPPORT/launch.log"
UPDATE_INTERVAL=$((60*60*24))  # seconds between update checks

log()    { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
notify() { command -v _notify_impl >/dev/null 2>&1 && _notify_impl "$@" || true; }

# Copy the bundled pixi binary into APP_SUPPORT and verify its checksum.
ensure_pixi() {
  [ -x "$PIXI" ] && return 0
  mkdir -p "$APP_SUPPORT"
  log "installing bundled pixi $PIXI_VERSION"
  cp "$PAYLOAD/pixi" "$PIXI"
  chmod +x "$PIXI"
  if [ -f "$PAYLOAD/pixi.sha256" ]; then
    ( cd "$APP_SUPPORT" && shasum -a 256 -c <(sed "s#pixi#$PIXI#" "$PAYLOAD/pixi.sha256") ) \
      || { log "pixi checksum FAILED"; rm -f "$PIXI"; exit 1; }
  fi
}

# Copy the bundled manifest+lock and install the environment (idempotent).
ensure_env() {
  mkdir -p "$ENV_DIR"
  [ -f "$ENV_DIR/pixi.toml" ] || cp "$PAYLOAD/pixi.toml" "$ENV_DIR/pixi.toml"
  [ -f "$ENV_DIR/pixi.lock" ] || cp "$PAYLOAD/pixi.lock" "$ENV_DIR/pixi.lock" 2>/dev/null || true
  if [ ! -d "$ENV_DIR/.pixi" ]; then
    notify "Setting up JupyterBioacoustic (first run, this can take a minute)…"
    log "pixi install (first run)"
    "$PIXI" install --manifest-path "$ENV_DIR/pixi.toml" >>"$LOG" 2>&1 \
      || { notify "Setup failed — see $LOG"; log "pixi install FAILED"; exit 1; }
  fi
}

# Check-and-prompt update, throttled. Never silent/forced. PROMPT(msg)->0=yes is
# provided by the caller; without it, we skip updating (launch current).
maybe_update() {
  local now last=0
  now=$(date +%s)
  [ -f "$STAMP" ] && last=$(cat "$STAMP" 2>/dev/null || echo 0)
  [ $((now - last)) -lt "$UPDATE_INTERVAL" ] && return 0
  echo "$now" >"$STAMP"
  command -v _prompt_update >/dev/null 2>&1 || return 0
  # `pixi update --dry-run` is the cheap "is anything newer within constraint?" probe.
  if "$PIXI" update jupyter-bioacoustic --manifest-path "$ENV_DIR/pixi.toml" --dry-run 2>/dev/null \
       | grep -qiE 'jupyter-bioacoustic'; then
    if _prompt_update; then
      notify "Updating…"
      log "pixi update jupyter-bioacoustic"
      "$PIXI" update jupyter-bioacoustic --manifest-path "$ENV_DIR/pixi.toml" >>"$LOG" 2>&1 || true
    fi
  fi
}

CONFIG="$APP_SUPPORT/config.json"
SERVERFILE="$APP_SUPPORT/server.json"   # tracks the running app server (port/token/pid)

# Write a default config on first run.
#   root_dir                  folder the browser opens in + its ceiling ("~" = home)
#   single_instance           re-clicking the app reuses the running server (new tab)
#   shutdown_on_idle_minutes  auto-stop the server after N idle minutes (0 = never)
# Within root_dir JupyterLab restores the last-used folder automatically on relaunch.
_ensure_config() {
  [ -f "$CONFIG" ] && return 0
  mkdir -p "$APP_SUPPORT"
  cat > "$CONFIG" <<'JSON'
{
  "root_dir": "~",
  "single_instance": true,
  "shutdown_on_idle_minutes": 30
}
JSON
}

# Read root_dir from config.json (default ~), expanding a leading ~.
_root_dir() {
  local root=""
  _ensure_config
  root="$(sed -n 's/.*"root_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -1)"
  [ -z "$root" ] && root="~"
  case "$root" in
    "~")   root="$HOME" ;;
    "~/"*) root="$HOME/${root#\~/}" ;;
  esac
  printf '%s' "$root"
}

# Read a scalar (bool/number/quoted) config value; falls back to $2.
_config_get() {
  local key="$1" def="$2" val
  _ensure_config
  val="$(sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" "$CONFIG" | head -1 | tr -d '[:space:]')"
  [ -n "$val" ] && printf '%s' "$val" || printf '%s' "$def"
}

# First free TCP port from 8888 (matches the jba-lab numbering the user expects).
_free_port() {
  local p
  for p in $(seq 8888 8999); do
    (echo >"/dev/tcp/127.0.0.1/$p") 2>/dev/null || { printf '%s' "$p"; return; }
  done
  printf '8888'
}

_sf_num() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p" "$SERVERFILE"; }

# Is the recorded app server still alive (pid running AND port accepting)?
_server_alive() {
  [ -f "$SERVERFILE" ] || return 1
  local pid port
  pid="$(_sf_num pid)"; port="$(_sf_num port)"
  [ -n "$pid" ] && [ -n "$port" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null
}

_server_url() {
  local port token
  port="$(_sf_num port)"
  token="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SERVERFILE")"
  printf 'http://localhost:%s/lab?token=%s' "$port" "$token"
}

# Launch (or reuse) the JupyterLab server. exec's the env's python directly so the
# app process *is* jupyter — quitting the app (Cmd-Q / Dock → Quit) shuts it down,
# and `single_instance` reuse means re-clicking opens a new tab, not a new server.
run_lab() {
  local root single port token idle bin idle_arg
  root="$(_root_dir)"; mkdir -p "$root" 2>/dev/null || root="$HOME"
  single="$(_config_get single_instance true)"

  # Singleton: if our server is already up, open a new tab to it and exit.
  if [ "$single" = "true" ] && _server_alive; then
    log "reuse running server on port $(_sf_num port)"
    command -v _open_browser >/dev/null && _open_browser "$(_server_url)" || true
    exit 0
  fi

  bin="$ENV_DIR/.pixi/envs/default/bin"
  [ -x "$bin/python" ] || bin="$(dirname "$(ls "$ENV_DIR"/.pixi/envs/*/bin/python 2>/dev/null | head -1)")"

  port="$(_free_port)"
  token="$("$bin/python" -c 'import secrets;print(secrets.token_hex(16))' 2>/dev/null || echo "${RANDOM}${RANDOM}${RANDOM}")"
  # Record BEFORE exec — exec keeps this PID, so "pid" == the running jupyter's PID.
  printf '{ "port": %s, "token": "%s", "pid": %s }\n' "$port" "$token" "$$" > "$SERVERFILE"

  idle="$(_config_get shutdown_on_idle_minutes 30)"
  idle_arg=""
  case "$idle" in ''|0|*[!0-9]*) ;; *) idle_arg="--ServerApp.shutdown_no_activity_timeout=$((idle*60))" ;; esac

  log "launch jupyter lab (root=$root port=$port idle=${idle}m)"
  # exec the env python directly (not `pixi run`) so SIGTERM on Quit reaches jupyter.
  exec env PATH="$bin:$PATH" JUPYTER_TOKEN="$token" \
    "$bin/python" -m jupyter lab \
      --ServerApp.root_dir="$root" \
      --ServerApp.iopub_data_rate_limit=1e10 \
      --ServerApp.port="$port" --ServerApp.port_retries=0 \
      ${idle_arg:+$idle_arg}
}

bootstrap_and_launch() {
  ensure_pixi
  ensure_env
  maybe_update
  run_lab
}
