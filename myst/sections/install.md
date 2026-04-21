(install)=
# Installation

## From a Pre-built Wheel

Download the latest wheel from [GitHub Releases](https://github.com/SchmidtDSE/dev-jupyter-audio/releases) and install with pip. No Node.js or build step needed.

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

The extension auto-registers on install — just launch JupyterLab and go.

## For Development

```bash
git clone https://github.com/SchmidtDSE/dev-jupyter-audio.git
cd dev-jupyter-audio
pixi run setup   # install deps, build TypeScript, register extension
pixi run lab     # launch JupyterLab
```

See the [Development guide](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Development) on the wiki for project structure and build details.
