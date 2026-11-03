# Desktop installer

No-code desktop installers for Jupyter Bioacoustic. A user downloads one file,
double-clicks, and gets a branded launcher icon that opens the app — no terminal.

Design: a **thin bootstrap installer** drops a pinned `pixi` + a bundled runtime
manifest into a per-user dir and runs `pixi install`; it then starts the tray
launcher (`launcher/jba_launcher.py`) with the env's Python, which runs JupyterLab and
the menu-bar / system-tray icon. App updates flow through pixi/PyPI, so the installer
rarely changes. Full rationale + tutorial: `claude/notes/installer.md`.

## Layout
```
installer/
├── manifest/pixi.toml        end-user runtime env (PyPI dep; conda-forge later)
├── launcher/jba_launcher.py  tray app: starts/stops JupyterLab, folder, updates, uninstall
├── icon/bioacoustic-app.svg  oscilloscope mark on brand bg
│   └── make-icons.sh         → build/AppIcon.icns + AppIcon.ico
├── shared/bootstrap.sh       ensure-pixi / ensure-env / update / launch (mac+linux)
├── macos/                    .app bundle, make-local-app.sh, make-dist.sh (unsigned zips),
│                             build-pkg.sh + postinstall (signed .pkg, not yet used)
├── windows/                  launch.cmd, make-dist-win.sh (unsigned zip),
│                             installer.iss + build.ps1 (Inno Setup, not yet used)
├── conda/menu.json           menuinst shortcut spec (phase-2 conda-forge)
└── ci/build-installers.yml   DRAFT GH Actions (not installed, known issues listed inside)
```

## Working folder (where the app opens)
JupyterLab's file browser is confined to the server's root, so the launcher pins it via a config file:
`~/Library/Application Support/JupyterBioacoustic/config.json` (Windows: `%LOCALAPPDATA%\JupyterBioacoustic\config.json`):
```json
{ "root_dir": "~" }
```
- Default `~` = home. Within that root, JupyterLab restores the **last-used folder** on relaunch.
- Change it from the tray icon → **Change Start Folder…** (a native folder picker that writes the
  config and restarts the server). Editing the file, or the older **"Set Start Folder"** helpers
  (`macos/set-start-folder.command` / `windows/set-start-folder.cmd`), also work.

## Build locally

What releases ship today (v0.9.3) are **unsigned** zips:
```bash
bash installer/icon/make-icons.sh
bash installer/macos/make-dist.sh          # → installer/dist/JupyterBioacoustic-macos-{arm64,x86_64}.zip
bash installer/windows/make-dist-win.sh    # → installer/dist/JupyterBioacoustic-windows-x86_64.zip
```

Signed installers (not built yet):
```bash
# 1. icons (needs a rasterizer: brew install librsvg)
bash installer/icon/make-icons.sh

# 2. fetch the pinned pixi binary for your platform into the payload dir,
#    verify its checksum, and generate the lock (see ci/build-installers.yml)

# 3a. macOS (needs Developer ID certs + notarytool profile)
VERSION=0.1.0 ARCH=arm64 PIXI_BIN=… PIXI_SHA256=… \
  APP_CERT=… PKG_CERT=… NOTARY_PROFILE=… bash installer/macos/build-pkg.sh

# 3b. Windows (needs Inno Setup + a code-signing cert)
pwsh installer/windows/build.ps1 -Version 0.1.0 -CertThumbprint <THUMB>
```

There is no CI for installers yet: `ci/build-installers.yml` is a draft and is not in
`.github/workflows/`.

## Status
- Works today via **PyPI** (`pixi [pypi-dependencies]`) + an installer-created shortcut.
- Phase 2: publish to **conda-forge** and move the dep to `[dependencies]` so the
  `conda/menu.json` menuinst shortcut is created (and updates) by the package itself.
- Releases currently ship **unsigned** builds (macOS: right-click → Open; Windows: SmartScreen →
  More info → Run anyway). Signing/notarization needs an Apple Developer account + a Windows
  code-signing cert.
