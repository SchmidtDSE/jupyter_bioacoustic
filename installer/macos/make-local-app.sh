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

echo "› staging $DEST"
# PIXI_BIN (optional) lets make-dist bundle a specific arch's pixi
bash "$INSTALLER/macos/assemble-app.sh" "$DEST"
codesign -s - --deep --force "$DEST" >/dev/null 2>&1 || true   # ad-hoc: runs locally

# Drop the folder-picker next to the app so you can test the "set start folder" UI.
PICK="$(dirname "$DEST")/Set JupyterBioacoustic Folder.command"
cp "$INSTALLER/macos/set-start-folder.command" "$PICK"; chmod +x "$PICK"

echo "✓ built $DEST"
echo "  Settings: '$(basename "$PICK")' (double-click to pick the start folder)."
echo "  Open it from ~/Applications. First launch: right-click → Open (Gatekeeper),"
echo "  then it sets up the env (a minute) and opens JupyterLab. Logs: ~/Library/Application Support/JupyterBioacoustic/launch.log"
