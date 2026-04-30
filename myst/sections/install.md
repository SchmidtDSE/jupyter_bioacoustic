(install)=
# Installation

## From a Pre-built Wheel

Download the latest wheel from [GitHub Releases](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) and install with pip. No Node.js or build step needed.

```bash
pip install jupyter_bioacoustic-0.1.8-py3-none-any.whl
```

Or with [pixi](https://pixi.sh) in your `pyproject.toml`:

```toml
[tool.pixi.pypi-dependencies]
jupyter-bioacoustic = { path = "dist/jupyter_bioacoustic-0.1.8-py3-none-any.whl" }
```

## Requirements

- Python >= 3.9
- JupyterLab >= 4.0
- **ffmpeg** (recommended) — enables partial byte-range downloads for remote audio files (S3, HTTPS, GCS). Without ffmpeg, remote files are fully downloaded and cached on first access.

```bash
# macOS
brew install ffmpeg
# Ubuntu
sudo apt install ffmpeg
# conda
conda install -c conda-forge ffmpeg
```

The extension auto-registers on install — just launch JupyterLab and go.

## For Development

```bash
git clone https://github.com/SchmidtDSE/jupyter_bioacoustic.git
cd jupyter_bioacoustic
pixi run setup   # install deps, build TypeScript, register extension
pixi run lab     # launch JupyterLab
```

> If not using pixi, launch with `jupyter lab --ServerApp.iopub_data_rate_limit=1e10` (or set `c.ServerApp.iopub_data_rate_limit = 1e10` in `jupyter_lab_config.py`). Spectrograms are sent as base64 images over the kernel's IOPub channel, which can exceed Jupyter's default 1 MB/s rate limit.

See the [Development guide](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Development) on the wiki for project structure and build details.
