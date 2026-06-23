(install)=
# Installation

There are three ways to install, depending on how you work:

1. **[pixi](#install-pixi)** *(recommended)* — a reproducible, cross-platform environment that
   installs `ffmpeg` for you. Best choice if you're comfortable with a terminal.
2. **[pip](#install-pip)** — if you already manage your own Python / JupyterLab environment.
3. **[Desktop app](#install-desktop)** — a no-code, no-terminal download for the small set of users
   who don't work in Python tooling at all.

:::{tip}
If you'll ever touch a terminal, use **pixi** (or pip). The desktop app trades flexibility for
zero setup and is aimed at non-technical reviewers — see the [caveats](#install-desktop) below.
:::

(install-pixi)=
## 1. pixi (recommended)

[pixi](https://pixi.sh) builds an isolated, lock-fileable environment and pulls both conda-forge
packages (Python, JupyterLab, **ffmpeg**) and PyPI packages (`jupyter-bioacoustic`) in one step — so
you get `ffmpeg` automatically on macOS, Linux, and Windows with no separate install.

### Quick start (new project)

```bash
pixi init my-annotations
cd my-annotations
pixi add jupyterlab ffmpeg "python>=3.11"   # conda-forge
pixi add --pypi jupyter-bioacoustic          # PyPI
pixi run jupyter lab
```

### Or declare it in `pixi.toml` / `pyproject.toml`

```toml
[tool.pixi.dependencies]
python = ">=3.11"
jupyterlab = ">=4.0,<5"
ffmpeg = "*"

[tool.pixi.pypi-dependencies]
jupyter-bioacoustic = ">=0.9,<1.0"
```

Then `pixi install` and `pixi run jupyter lab`.

:::{note}
**Python version.** The package supports Python ≥ 3.9. If a *fresh* solve picks a brand-new Python
release for which a dependency has no prebuilt wheel yet (the install errors while *building* a
package such as `llvmlite`), pin to a slightly older interpreter — e.g. `python = ">=3.11,<3.13"` —
or get the offending package from conda-forge instead of PyPI.
:::

(install-pip)=
## 2. pip

If you already have a Python ≥ 3.9 environment with JupyterLab:

```bash
pip install jupyter-bioacoustic
```

Or install a specific release wheel from
[GitHub Releases](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) (no Node.js or build
step needed):

```bash
pip install jupyter_bioacoustic-0.9.2-py3-none-any.whl
```

:::{important}
**`ffmpeg` is not a pip dependency** — install it separately for partial byte-range downloads of
remote audio (S3 / HTTPS / GCS) and for `ffprobe`. Without it, remote files are fully downloaded and
cached on first access. (pixi users get this for free; see [Requirements](#install-requirements).)
:::

(install-desktop)=
## 3. Desktop app (no-code)

:::{note}
**Coming soon — not yet published.** The desktop builds are in development and are **not** on the
[Releases page](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) yet (which currently has
the Python wheel only). This section describes what's planned; for now, use pixi or pip above.
:::

A double-click desktop app (no terminal, no `pip`, no `pixi`) that runs the annotator in your browser
via a menu-bar / system-tray icon. When released it will be on
[GitHub Releases](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) as:

- **macOS** — `JupyterBioacoustic-macos-arm64.zip` (Apple Silicon) or `-x86_64.zip` (Intel)
- **Windows** — `JupyterBioacoustic-windows-x86_64.zip`

:::{warning}
**This is a niche option — most people should use pixi or pip above.** Caveats:

- **For non-technical users only.** It exists for reviewers who never open a terminal. If you do any
  work in Python/Jupyter, the pixi or pip install is more flexible and integrates with your own
  environment.
- **Early / unsigned builds.** macOS: right-click → **Open** to get past Gatekeeper. Windows:
  SmartScreen → **More info → Run anyway**. (Signed installers are planned.)
- **First launch needs internet** and takes a few minutes — it downloads the app environment on first
  run. After that it works offline.
- **It's a separate, self-contained app**, not your Jupyter environment: notebooks, kernels, and
  packages you install through it are isolated from any `pip`/`pixi`/`conda` setup you already have.
:::

### Command-line tools (optional)

The app is self-contained, so its `jba` CLI (`jba lab`, `jba validate`, …) isn't on your `PATH`. If you
*do* want it in a terminal, add a small shell function pointing at the app's bundled environment (this
also puts the app's `ffmpeg` on `PATH` for that command):

```bash
# macOS (zsh)
cat >> ~/.zshrc <<'EOF'
jba() {
  local d="$HOME/Library/Application Support/JupyterBioacoustic/env/.pixi/envs/default/bin"
  PATH="$d:$PATH" "$d/jba" "$@"
}
EOF
source ~/.zshrc
```

```powershell
# Windows (PowerShell) — open a new terminal afterward
Add-Content $PROFILE @'
function jba {
  $e = "$env:LOCALAPPDATA\JupyterBioacoustic\env\.pixi\envs\default"
  $env:PATH = "$e;$e\Scripts;$e\Library\bin;$env:PATH"
  & "$e\Scripts\jba.exe" @args
}
'@
```

(if you've never used a PowerShell profile, you may first need
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)

(install-uninstall)=
### Uninstalling

**From the app:** tray icon → **Uninstall…** — it asks for confirmation, then removes the app and its
downloaded environment.

**From a terminal** (quit the app first, via tray → Quit):

```bash
# macOS
rm -rf ~/Library/Application\ Support/JupyterBioacoustic
rm -rf /Applications/JupyterBioacoustic.app ~/Applications/JupyterBioacoustic.app
rm -f  ~/Applications/"Set JupyterBioacoustic Folder.command" \
       /Applications/"Set JupyterBioacoustic Folder.command"
```

```powershell
# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\JupyterBioacoustic"
Remove-Item -Force "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Jupyter Bioacoustic.lnk"
```

:::{note}
**Your work is safe.** Uninstalling removes only the application and the ~1 GB environment it
downloaded. Your notebooks, data, annotations, and configuration in your own folders are left
untouched. (If you added the `jba` shell function above, delete it from your `~/.zshrc` /
PowerShell `$PROFILE`.)
:::

(install-requirements)=
## Requirements

- **Python** ≥ 3.9
- **JupyterLab** ≥ 4.0
- **ffmpeg** *(recommended)* — bundles `ffprobe` and enables partial byte-range downloads for remote
  audio (S3, HTTPS, GCS). Not a pip dependency, so pip users install it separately. **pixi and the
  desktop app include it automatically.**

```bash
# macOS (Homebrew)
brew install ffmpeg
# Linux — Debian/Ubuntu
sudo apt install ffmpeg
# Linux — Fedora
sudo dnf install ffmpeg
# Windows (winget) — or: choco install ffmpeg
winget install ffmpeg
# conda (cross-platform)
conda install -c conda-forge ffmpeg
```

The extension auto-registers on install — just launch JupyterLab and go.

See the [Development guide](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Development) on the
wiki for building from source.
