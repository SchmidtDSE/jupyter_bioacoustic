#!/usr/bin/env bash
set -euo pipefail

DST="s3://dse-soundhub/public/audio/samples"

declare -a SOURCES=(
  "s3://casoundhub/audio/sentinel-site-acoustics/CBER4_2023/20230513_000000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/EDSA2_2023/20230524_000000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/RW12_2023/20230522_000000.flac"
  "s3://casoundhub/audio/sentinel-site-acoustics/ESNERR3_2023/20230518_000000.flac"
  "s3://casoundhub/audio/sentinel-site-acoustics/SFVWA3_2023/20230513_200000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/ALBS1_2023/20230529_200000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/AGCA3_2023/20230528_200000.flac"
  "s3://casoundhub/audio/sentinel-site-acoustics/SELER4_2023/20230512_000000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/STEV2_2023/20230526_200000.flac"
  "s3://casoundhub/audio/cemaf-acoustics/RW12_2023/20230523_000000.flac"
)

TMPDIR="$(cd "$(dirname "$0")/.." && pwd)/audio/samples"
mkdir -p "$TMPDIR"

copy_file() {
  local src="$1"
  local dir fname
  dir="$(basename "$(dirname "$src")")"
  fname="$(basename "$src")"
  local dst="${DST}/${dir}.${fname}"
  local tmp="${TMPDIR}/${dir}.${fname}"
  echo "download ${src}"
  aws s3 cp "$src" "$tmp" && \
  echo "upload   ${dst}" && \
  aws s3 cp "$tmp" "$dst" && \
  rm -f "$tmp"
}

export -f copy_file
export DST TMPDIR

printf '%s\n' "${SOURCES[@]}" | xargs -P 5 -I {} bash -c 'copy_file "$@"' _ {}

echo "Done"
