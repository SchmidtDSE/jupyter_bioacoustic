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
    log "pixi install (first run)"
    # Show a persistent "Setting up…" indicator (hook from the platform wrapper) that
    # stays up for the whole multi-minute download; fall back to a one-shot notify.
    command -v _setup_start >/dev/null 2>&1 && _setup_start \
      || notify "Setting up JupyterBioacoustic (first run, a few minutes)…"
    if "$PIXI" install --manifest-path "$ENV_DIR/pixi.toml" >>"$LOG" 2>&1; then
      :   # leave the splash up — the launcher dismisses it when the browser opens
          # (passed forward as JBA_SETUP_PID in run_lab), so there's no gap.
    else
      command -v _setup_done >/dev/null 2>&1 && _setup_done
      notify "Setup failed — see $LOG"; log "pixi install FAILED"; exit 1
    fi
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

# All runtime lifecycle — config, server start/stop, single-instance reuse, the
# tray icon, Change-Folder, Quit, idle-shutdown, and Jupyter-dir isolation — lives
# in the cross-platform Python launcher (installer/launcher/jba_launcher.py). The
# shell only ensures the env exists, then hands off. The platform wrapper exports
# JBA_LAUNCHER (path to jba_launcher.py) and optionally JBA_ICON (tray PNG).
run_lab() {
  local bin="$ENV_DIR/.pixi/envs/default/bin"
  [ -x "$bin/python" ] || bin="$(dirname "$(ls "$ENV_DIR"/.pixi/envs/*/bin/python 2>/dev/null | head -1)")"
  log "hand off to jba_launcher (tray app)"
  # exec so the launcher (and the jupyter child it manages) is the app's process.
  exec env PATH="$bin:$PATH" \
    JBA_APP_SUPPORT="$APP_SUPPORT" JBA_ENV_BIN="$bin" JBA_ICON="${JBA_ICON:-}" \
    JBA_SETUP_PID="${_SETUP_PID:-}" \
    "$bin/python" "${JBA_LAUNCHER:?JBA_LAUNCHER not set}"
}

bootstrap_and_launch() {
  ensure_pixi
  ensure_env
  maybe_update
  run_lab
}
