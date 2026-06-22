#!/usr/bin/env bash
# DEV-ONLY: assemble a clickable, ad-hoc-signed JupyterBioacoustic.app for LOCAL
# testing — no certs, no notarization. Drops it in ~/Applications so you get the
# real "double-click the icon → JupyterLab opens" experience. NOT for distribution
# (use build-pkg.sh + signing for that, see installer/README.md).
#
#   bash installer/macos/make-local-app.sh
#
# Brand icon: if installer/icon/build/AppIcon.icns exists (run icon/make-icons.sh
# after `brew install librsvg`) it's used; otherwise the app gets a generic icon
# but works fine.
set -euo pipefail
cd "$(dirname "$0")/.."                          # → installer/
INSTALLER="$PWD"
DEST="${1:-$HOME/Applications}/JupyterBioacoustic.app"

command -v pixi >/dev/null || { echo "need pixi on PATH" >&2; exit 1; }

echo "› staging $DEST"
rm -rf "$DEST"; mkdir -p "$(dirname "$DEST")"
cp -R "$INSTALLER/macos/app/JupyterBioacoustic.app" "$DEST"
RES="$DEST/Contents/Resources"; mkdir -p "$RES/payload"

cp "$INSTALLER/shared/bootstrap.sh"   "$RES/bootstrap.sh"
cp "$INSTALLER/launcher/jba_launcher.py" "$RES/jba_launcher.py"   # the tray app
cp "$INSTALLER/icon/build/tray.png" "$RES/tray.png" 2>/dev/null || true  # menu-bar icon (else drawn)
cp "$INSTALLER/manifest/pixi.toml"  "$RES/payload/pixi.toml"
cp "$INSTALLER/manifest/pixi.lock"  "$RES/payload/pixi.lock" 2>/dev/null || true
cp "$(command -v pixi)"             "$RES/payload/pixi"
( cd "$RES/payload" && shasum -a 256 pixi > pixi.sha256 )

if [ -f "$INSTALLER/icon/build/AppIcon.icns" ]; then
  cp "$INSTALLER/icon/build/AppIcon.icns" "$RES/AppIcon.icns"
else
  echo "  (no AppIcon.icns — run icon/make-icons.sh for the brand icon; using generic)"
fi

chmod +x "$DEST/Contents/MacOS/launch" "$RES/payload/pixi"
codesign -s - --deep --force "$DEST" >/dev/null 2>&1 || true   # ad-hoc: runs locally

# Drop the folder-picker next to the app so you can test the "set start folder" UI.
PICK="$(dirname "$DEST")/Set JupyterBioacoustic Folder.command"
cp "$INSTALLER/macos/set-start-folder.command" "$PICK"; chmod +x "$PICK"

echo "✓ built $DEST"
echo "  Settings: '$(basename "$PICK")' (double-click to pick the start folder)."
echo "  Open it from ~/Applications. First launch: right-click → Open (Gatekeeper),"
echo "  then it sets up the env (a minute) and opens JupyterLab. Logs: ~/Library/Application Support/JupyterBioacoustic/launch.log"
