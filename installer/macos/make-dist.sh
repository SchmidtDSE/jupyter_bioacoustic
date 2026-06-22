#!/usr/bin/env bash
# Build a DISTRIBUTABLE *unsigned* macOS app (a .zip) for early testers — no certs.
#
# This is the download you hand to testers. It is self-contained (bundles a pinned
# pixi + the manifest + launcher + icon); the heavy env install happens on first
# launch (needs internet, a few minutes, one time).
#
# UNSIGNED ⇒ Gatekeeper will warn on first open. Testers must **right-click → Open**
# (or System Settings → Privacy & Security → "Open Anyway") once. Plain double-click
# is blocked. This is fine for people you can give one instruction to; for the
# general public use build-pkg.sh (signed + notarized).
#
#   bash installer/macos/make-dist.sh
#   → installer/dist/JupyterBioacoustic-macos-<arch>.zip
set -euo pipefail
cd "$(dirname "$0")/.."            # → installer/
ARCH="$(uname -m)"                 # arm64 (Apple Silicon) or x86_64 (Intel)
STAGE="$(mktemp -d)"
DIST="$PWD/dist"; mkdir -p "$DIST"

# Assemble the self-contained, ad-hoc-signed .app into a staging dir.
bash macos/make-local-app.sh "$STAGE" >/dev/null

ZIP="$DIST/JupyterBioacoustic-macos-$ARCH.zip"
rm -f "$ZIP"
# ditto preserves bundle structure / symlinks / xattrs (zip the .app only).
( cd "$STAGE" && ditto -c -k --keepParent "JupyterBioacoustic.app" "$ZIP" )

echo "✓ $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo
echo "Hand this .zip to testers. It is for $ARCH Macs."
echo "Tester instructions:"
echo "  1. Unzip it (double-click) → JupyterBioacoustic.app"
echo "  2. Drag it to /Applications (optional)"
echo "  3. RIGHT-CLICK the app → Open → Open  (needed once; it's unsigned)"
echo "  4. First launch sets up (internet, ~a few min); then a menu-bar icon appears"
echo "     and the browser opens. Quit from the menu-bar icon."
