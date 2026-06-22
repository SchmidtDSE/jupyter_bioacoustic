#!/usr/bin/env bash
# Generate platform icon sets from bioacoustic-app.svg.
#
#   macOS:   AppIcon.icns   (via iconutil, built-in)
#   Windows: AppIcon.ico
#
# Needs ONE svg rasterizer on PATH (checked in order):
#   rsvg-convert  (brew install librsvg)   ← recommended
#   inkscape
#   magick / convert  (ImageMagick)
#   cairosvg  (pip install cairosvg)
#
# .icns also needs `iconutil` (macOS only). .ico is assembled with ImageMagick if
# present, else left as a set of PNGs for a Windows-side tool.
set -euo pipefail
cd "$(dirname "$0")"
SVG="bioacoustic-app.svg"
OUT="build"
mkdir -p "$OUT"

# --- pick a rasterizer: rasterize <svg> <px> <out.png> ---
rasterize() {
  local svg="$1" px="$2" out="$3"
  if command -v rsvg-convert >/dev/null 2>&1; then rsvg-convert -w "$px" -h "$px" "$svg" -o "$out"
  elif command -v inkscape   >/dev/null 2>&1; then inkscape "$svg" -w "$px" -h "$px" -o "$out" >/dev/null 2>&1
  elif command -v magick     >/dev/null 2>&1; then magick -background none -density 384 "$svg" -resize "${px}x${px}" "$out"
  elif command -v convert    >/dev/null 2>&1; then convert -background none -density 384 "$svg" -resize "${px}x${px}" "$out"
  elif command -v cairosvg   >/dev/null 2>&1; then cairosvg "$svg" -W "$px" -H "$px" -o "$out"
  else echo "ERROR: no svg rasterizer found (install librsvg: brew install librsvg)" >&2; exit 1
  fi
}

# --- master 1024 png ---
rasterize "$SVG" 1024 "$OUT/icon_1024.png"

# --- macOS .icns ---
ICONSET="$OUT/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  rasterize "$SVG" "$s"          "$ICONSET/icon_${s}x${s}.png"
  rasterize "$SVG" "$((s*2))"    "$ICONSET/icon_${s}x${s}@2x.png"
done
if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$OUT/AppIcon.icns"
  echo "wrote $OUT/AppIcon.icns"
else
  echo "iconutil not found (macOS only) — skipped .icns; PNGs are in $ICONSET" >&2
fi

# --- tray icon (menu bar / system tray): black outline mark, transparent bg ---
if [ -f tray-a-outline.svg ]; then
  rasterize tray-a-outline.svg 64 "$OUT/tray.png"
  echo "wrote $OUT/tray.png"
fi

# --- Windows .ico ---
for s in 16 32 48 64 256; do rasterize "$SVG" "$s" "$OUT/ico_${s}.png"; done
if command -v magick >/dev/null 2>&1; then
  magick "$OUT"/ico_16.png "$OUT"/ico_32.png "$OUT"/ico_48.png "$OUT"/ico_64.png "$OUT"/ico_256.png "$OUT/AppIcon.ico"
  echo "wrote $OUT/AppIcon.ico"
elif command -v convert >/dev/null 2>&1; then
  convert "$OUT"/ico_16.png "$OUT"/ico_32.png "$OUT"/ico_48.png "$OUT"/ico_64.png "$OUT"/ico_256.png "$OUT/AppIcon.ico"
  echo "wrote $OUT/AppIcon.ico"
else
  echo "ImageMagick not found — .ico not assembled; PNGs (ico_*.png) are in $OUT for a Windows tool" >&2
fi
