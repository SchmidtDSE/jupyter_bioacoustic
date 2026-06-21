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

# Write a default config on first run. root_dir = the folder the file browser
# opens in AND its ceiling (JupyterLab can't go above it). "~" → home. Within
# that root JupyterLab restores the last-used folder automatically on relaunch.
_ensure_config() {
  [ -f "$CONFIG" ] && return 0
  mkdir -p "$APP_SUPPORT"
  cat > "$CONFIG" <<'JSON'
{
  "root_dir": "~"
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

run_lab() {
  local root; root="$(_root_dir)"
  mkdir -p "$root" 2>/dev/null || root="$HOME"
  log "launch jupyter lab (root=$root)"
  # Bypass the `lab` task so we can pin root_dir; replicate jba lab's IOPub limit
  # (needed for base64 spectrograms). JupyterLab restores the last folder within root.
  exec "$PIXI" run --manifest-path "$ENV_DIR/pixi.toml" \
    python -m jupyter lab \
      --ServerApp.root_dir="$root" \
      --ServerApp.iopub_data_rate_limit=1e10
}

bootstrap_and_launch() {
  ensure_pixi
  ensure_env
  maybe_update
  run_lab
}
