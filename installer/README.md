# Desktop installer

No-code desktop installers for Jupyter Bioacoustic. A user downloads one file,
double-clicks, and gets a branded launcher icon that opens the app — no terminal.

Design: a **thin bootstrap installer** drops a pinned `pixi` + a bundled runtime
manifest into a per-user dir and runs `pixi install`; the launcher then runs
`pixi run jba lab`. App updates flow through pixi/PyPI, so the installer rarely
changes. Full rationale + tutorial: `claude/notes/installer.md`.

## Layout
```
installer/
├── manifest/pixi.toml        end-user runtime env (PyPI dep; conda-forge later)
├── icon/bioacoustic-app.svg  oscilloscope mark on brand bg
│   └── make-icons.sh         → build/AppIcon.icns + AppIcon.ico
├── shared/bootstrap.sh       ensure-pixi / ensure-env / update / launch (mac+linux)
├── macos/                    .app bundle, postinstall, build-pkg.sh
├── windows/                  launch.cmd, installer.iss (Inno Setup), build.ps1
├── conda/menu.json           menuinst shortcut spec (phase-2 conda-forge)
└── ci/build-installers.yml   GH Actions: build+sign+notarize, attach to release
```

## Build locally
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

CI does all of this on `release: published` and attaches the signed installers.

## Status
- Works today via **PyPI** (`pixi [pypi-dependencies]`) + an installer-created shortcut.
- Phase 2: publish to **conda-forge** and move the dep to `[dependencies]` so the
  `conda/menu.json` menuinst shortcut is created (and updates) by the package itself.
- Signing/notarization is **required** (no unsigned distribution) — needs an Apple
  Developer account + a Windows code-signing cert.
