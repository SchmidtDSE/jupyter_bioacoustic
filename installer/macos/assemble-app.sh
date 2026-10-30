#!/usr/bin/env bash
# Assemble an (unsigned) JupyterBioacoustic.app bundle at the given path. This is the ONE
# place that knows what goes inside the .app, so the dev/unsigned build (make-local-app.sh,
# make-dist.sh) and the signed build (build-pkg.sh) can't drift apart. Callers sign it.
#
#   PIXI_BIN=/path/to/pixi bash installer/macos/assemble-app.sh /path/to/JupyterBioacoustic.app
#
# PIXI_BIN: the pixi binary to bundle (defaults to the pixi on PATH).
# Optional inputs (skipped with a note when missing): icon/build/AppIcon.icns + tray.png
# (run icon/make-icons.sh), manifest/pixi.lock.
#
# License: BSD 3-Clause
set -euo pipefail
INSTALLER="$(cd "$(dirname "$0")/.." && pwd)"     # → installer/
DEST="${1:?usage: assemble-app.sh /path/to/JupyterBioacoustic.app}"
PIXI_BIN="${PIXI_BIN:-$(command -v pixi || true)}"
[ -n "$PIXI_BIN" ] && [ -x "$PIXI_BIN" ] || { echo "need PIXI_BIN or pixi on PATH" >&2; exit 1; }

rm -rf "$DEST"; mkdir -p "$(dirname "$DEST")"
cp -R "$INSTALLER/macos/app/JupyterBioacoustic.app" "$DEST"
RES="$DEST/Contents/Resources"; mkdir -p "$RES/payload"

cp "$INSTALLER/shared/bootstrap.sh"      "$RES/bootstrap.sh"       # env setup + update check
cp "$INSTALLER/launcher/jba_launcher.py" "$RES/jba_launcher.py"    # the tray app
cp "$INSTALLER/macos/splash.js"          "$RES/splash.js"          # first-run install splash
cp "$INSTALLER/manifest/pixi.toml"       "$RES/payload/pixi.toml"
cp "$PIXI_BIN"                           "$RES/payload/pixi"
( cd "$RES/payload" && shasum -a 256 pixi > pixi.sha256 )          # checked on first run

optional() {  # $1=source $2=dest $3=what
  if [ -f "$1" ]; then cp "$1" "$2"; else echo "  (no $(basename "$1") — $3)"; fi
}
optional "$INSTALLER/manifest/pixi.lock"      "$RES/payload/pixi.lock" "env resolves on first run"
optional "$INSTALLER/icon/build/tray.png"     "$RES/tray.png"     "menu-bar icon is drawn instead"
optional "$INSTALLER/icon/build/AppIcon.icns" "$RES/AppIcon.icns" "generic app icon; run icon/make-icons.sh"

chmod +x "$DEST/Contents/MacOS/launch" "$RES/payload/pixi"
