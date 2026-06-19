#!/usr/bin/env bash
# Build → sign → notarize → staple the macOS installer (.pkg).
#
# Prereqs (CI or local with creds):
#   - Developer ID Application + Developer ID Installer certs in the keychain
#   - A notarytool keychain profile (xcrun notarytool store-credentials)
#   - The pinned pixi binary for the target arch + its .sha256
#   - icon built: installer/icon/build/AppIcon.icns  (run icon/make-icons.sh)
#
# Env:
#   APP_CERT="Developer ID Application: NAME (TEAMID)"
#   PKG_CERT="Developer ID Installer: NAME (TEAMID)"
#   NOTARY_PROFILE="jba-notary"
#   PIXI_BIN=/path/to/pixi          PIXI_SHA256=/path/to/pixi.sha256
#   VERSION=0.1.0  ARCH=arm64
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)/installer"
: "${VERSION:=0.1.0}" "${ARCH:=arm64}"
STAGE="$(mktemp -d)"; APP="$STAGE/JupyterBioacoustic.app"

echo "› stage .app bundle"
cp -R app/JupyterBioacoustic.app "$APP"
mkdir -p "$APP/Contents/Resources/payload"
cp "$ROOT/shared/bootstrap.sh"        "$APP/Contents/Resources/bootstrap.sh"
cp "$ROOT/icon/build/AppIcon.icns"    "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/manifest/pixi.toml"         "$APP/Contents/Resources/payload/pixi.toml"
cp "$ROOT/manifest/pixi.lock"         "$APP/Contents/Resources/payload/pixi.lock" 2>/dev/null || true
cp "${PIXI_BIN:?set PIXI_BIN}"        "$APP/Contents/Resources/payload/pixi"
cp "${PIXI_SHA256:?set PIXI_SHA256}"  "$APP/Contents/Resources/payload/pixi.sha256"
chmod +x "$APP/Contents/MacOS/launch" "$APP/Contents/Resources/payload/pixi"

echo "› codesign .app (hardened runtime)"
codesign --force --deep --options runtime --timestamp \
  --sign "${APP_CERT:?set APP_CERT}" "$APP"

echo "› pkgbuild + productbuild"
COMP="$STAGE/component.pkg"
pkgbuild --root "$STAGE" --install-location /Applications \
  --scripts scripts --identifier org.schmidtdse.jupyterbioacoustic \
  --version "$VERSION" "$COMP"
OUT="$ROOT/dist/JupyterBioacoustic-$VERSION-$ARCH.pkg"; mkdir -p "$ROOT/dist"
productbuild --package "$COMP" --sign "${PKG_CERT:?set PKG_CERT}" "$OUT"

echo "› notarize + staple"
xcrun notarytool submit "$OUT" --keychain-profile "${NOTARY_PROFILE:?}" --wait
xcrun stapler staple "$OUT"

echo "✓ $OUT"
