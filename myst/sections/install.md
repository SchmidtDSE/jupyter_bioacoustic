(install)=
# Installation

## From PyPI

```bash
pip install jupyter-bioacoustic
```

## From a Pre-built Wheel

Download the latest wheel from [GitHub Releases](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) and install with pip. No Node.js or build step needed.

```bash
pip install jupyter_bioacoustic-0.5.0-py3-none-any.whl
```

Or with [pixi](https://pixi.sh) in your `pyproject.toml`:

```toml
[tool.pixi.pypi-dependencies]
jupyter-bioacoustic = { path = "dist/jupyter_bioacoustic-0.5.0-py3-none-any.whl" }
```

## Requirements

- Python >= 3.9
- JupyterLab >= 4.0
- **ffmpeg** (recommended) — bundles `ffprobe` and enables partial byte-range downloads for remote audio files (S3, HTTPS, GCS). It is not a pip dependency, so install it separately. Without ffmpeg, remote files are fully downloaded and cached on first access.

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

Or add it to a [pixi](https://pixi.sh) project (`pixi add ffmpeg`, or under `[tool.pixi.dependencies]`):

```toml
[tool.pixi.dependencies]
ffmpeg = "*"
```

The extension auto-registers on install — just launch JupyterLab and go.

See the [Development guide](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Development) on the wiki for building from source.
