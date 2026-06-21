#!/usr/bin/env bash
# Native folder picker → writes the launcher's config.json. Interim "settings UI"
# for non-coders: double-click, pick a folder, done (no JSON editing). A polished
# in-app settings panel is the planned successor — see installer_status.md.
APP_SUPPORT="$HOME/Library/Application Support/JupyterBioacoustic"
mkdir -p "$APP_SUPPORT"
dir=$(osascript -e 'POSIX path of (choose folder with prompt "Choose the folder Jupyter Bioacoustic should open in:")' 2>/dev/null) || exit 0
[ -z "$dir" ] && exit 0
dir="${dir%/}"
printf '{\n  "root_dir": "%s"\n}\n' "$dir" > "$APP_SUPPORT/config.json"
osascript -e "display notification \"Opens in: $dir\" with title \"Jupyter Bioacoustic\"" >/dev/null 2>&1
