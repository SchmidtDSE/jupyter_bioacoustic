#!/usr/bin/env bash
# Cross-assemble a DISTRIBUTABLE *unsigned* Windows .zip (unzip -> double-click
# launch.cmd) for early testers, built ON macOS/Linux — no Windows, no Inno Setup.
#
# This is the Windows analog of macos/make-dist.sh: it bundles the pinned Windows
# pixi.exe + the arch-neutral scripts/manifest/icon; the env (python, ffmpeg,
# jupyter-bioacoustic, pystray, pillow) is built on the Windows machine on first run.
#
#   installer/dist/JupyterBioacoustic-windows-x86_64.zip
#
# The real, polished Windows artifact is the SIGNED .exe (windows/installer.iss via
# Inno Setup) — that can only be built on Windows/CI. This zip is the stopgap so a
# tester with a Windows box can exercise the launcher end-to-end.
#
# WARNING: the Windows path is UNTESTED (launch.cmd + jba_launcher.py on Windows).
# Expect to iterate once a tester runs it. macOS is the validated path.
#
#   bash installer/windows/make-dist-win.sh
set -euo pipefail
cd "$(dirname "$0")/.."            # → installer/
PIXI_VERSION="0.70.0"             # keep in sync with shared/bootstrap.sh + windows/launch.cmd
DIST="$PWD/dist"; mkdir -p "$DIST"

label="x86_64"
target="x86_64-pc-windows-msvc"
tmp="$(mktemp -d)"
name="JupyterBioacoustic-windows-$label"
stage="$tmp/$name"
mkdir -p "$stage"

# --- fetch + checksum-verify the pinned Windows pixi (a .zip containing pixi.exe) ---
base="https://github.com/prefix-dev/pixi/releases/download/v$PIXI_VERSION/pixi-$target"
echo "› [$label] fetching pinned pixi $PIXI_VERSION ($target)"
curl -fsSL "$base.zip"        -o "$tmp/pixi.zip"
curl -fsSL "$base.zip.sha256" -o "$tmp/pixi.sha256"
want="$(awk '{print $1}' "$tmp/pixi.sha256")"
got="$(shasum -a 256 "$tmp/pixi.zip" | awk '{print $1}')"
[ "$want" = "$got" ] || { echo "  checksum FAILED for $label" >&2; exit 1; }
unzip -q "$tmp/pixi.zip" -d "$tmp/pixi"
pixi_exe="$(find "$tmp/pixi" -name 'pixi.exe' | head -1)"
[ -n "$pixi_exe" ] || { echo "  pixi.exe not found in archive" >&2; exit 1; }

# --- assemble the payload (flat layout next to launch.cmd) ---
cp "$pixi_exe"                       "$stage/pixi.exe"
cp windows/launch.cmd                "$stage/launch.cmd"
cp windows/set-start-folder.cmd      "$stage/set-start-folder.cmd"
cp launcher/jba_launcher.py          "$stage/jba_launcher.py"
cp manifest/pixi.toml                "$stage/pixi.toml"
[ -f manifest/pixi.lock ]      && cp manifest/pixi.lock   "$stage/pixi.lock" || true
[ -f icon/build/tray.png ]     && cp icon/build/tray.png  "$stage/tray.png" \
  || echo "  WARN: icon/build/tray.png missing — run icon/make-icons.sh first" >&2
[ -f icon/build/AppIcon.ico ]  && cp icon/build/AppIcon.ico "$stage/AppIcon.ico" || true

cat > "$stage/README.txt" <<'EOF'
Jupyter Bioacoustic — Windows (test build, unsigned)

1. Unzip anywhere, then double-click  launch.cmd
   - Windows may warn (unsigned): "Open File - Security Warning" > Run, and/or
     SmartScreen "Windows protected your PC" > "More info" > "Run anyway".
   - First run downloads the app environment (a few minutes; needs internet) and
     installs the app into your user profile + a Start-menu shortcut.
2. A microphone/oscilloscope icon appears in the system tray (bottom-right, may be
   under the "^" overflow). Right-click it for: Open in Browser / Change Start
   Folder / Quit. JupyterLab opens in your browser automatically.
3. After the first run you can DELETE this unzipped folder — the app now lives in
   your user profile. Relaunch any time from the Start menu ("Jupyter Bioacoustic").

This is an early UNSIGNED test build. Log: %LOCALAPPDATA%\JupyterBioacoustic\launch.log
EOF

# --- zip it (top-level folder so the unzip is tidy) ---
zip_out="$DIST/$name.zip"; rm -f "$zip_out"
( cd "$tmp" && zip -qr "$zip_out" "$name" )
echo "✓ $zip_out  ($(du -h "$zip_out" | cut -f1))"
rm -rf "$tmp"

echo
echo "Windows test zip in installer/dist/ — unzip, then double-click launch.cmd."
echo "UNSIGNED + UNTESTED on Windows: SmartScreen 'More info > Run anyway'; expect to iterate."
echo "The signed .exe (real installer) is built on Windows/CI via windows/installer.iss."
