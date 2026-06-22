#!/usr/bin/env bash
# Build DISTRIBUTABLE *unsigned* macOS apps (.zip) for early testers — no certs.
#
# Produces BOTH macOS arches by bundling the matching pinned pixi binary (the rest
# of the app is arch-neutral scripts; the env is built on the target on first run),
# so this works even though you can only *test* the arch you're on:
#   installer/dist/JupyterBioacoustic-macos-arm64.zip    (Apple Silicon)
#   installer/dist/JupyterBioacoustic-macos-x86_64.zip   (Intel)
#
# Windows (.exe) CANNOT be built here — it needs Inno Setup on Windows / CI
# (see installer/ci/build-installers.yml).
#
# UNSIGNED ⇒ testers must right-click → Open once (Gatekeeper). First launch needs
# internet (downloads the env, ~a few min). For the public, use build-pkg.sh (signed).
#
#   bash installer/macos/make-dist.sh
set -euo pipefail
cd "$(dirname "$0")/.."            # → installer/
PIXI_VERSION="0.70.0"             # keep in sync with shared/bootstrap.sh + ci
DIST="$PWD/dist"; mkdir -p "$DIST"

build_arch() {  # $1=label (arm64|x86_64)  $2=pixi target triple
  local label="$1" target="$2" tmp stage zip base want got
  tmp="$(mktemp -d)"; stage="$(mktemp -d)"
  base="https://github.com/prefix-dev/pixi/releases/download/v$PIXI_VERSION/pixi-$target"
  echo "› [$label] fetching pinned pixi $PIXI_VERSION ($target)"
  curl -fsSL "$base.tar.gz"        -o "$tmp/pixi.tar.gz"
  curl -fsSL "$base.tar.gz.sha256" -o "$tmp/pixi.sha256"
  want="$(awk '{print $1}' "$tmp/pixi.sha256")"
  got="$(shasum -a 256 "$tmp/pixi.tar.gz" | awk '{print $1}')"
  [ "$want" = "$got" ] || { echo "  checksum FAILED for $label" >&2; exit 1; }
  tar xzf "$tmp/pixi.tar.gz" -C "$tmp"          # → $tmp/pixi (the binary)
  PIXI_BIN="$tmp/pixi" bash macos/make-local-app.sh "$stage" >/dev/null
  zip="$DIST/JupyterBioacoustic-macos-$label.zip"; rm -f "$zip"
  ( cd "$stage" && ditto -c -k --keepParent "JupyterBioacoustic.app" "$zip" )
  echo "✓ $zip  ($(du -h "$zip" | cut -f1))"
  rm -rf "$tmp" "$stage"
}

build_arch arm64  aarch64-apple-darwin
build_arch x86_64 x86_64-apple-darwin

echo
echo "Two macOS zips in installer/dist/ — arm64 = Apple Silicon, x86_64 = Intel."
echo "Tester: unzip → drag to /Applications → RIGHT-CLICK → Open → Open (once; unsigned)."
echo "First launch needs internet (~a few min). Windows .exe = build on Windows/CI."
