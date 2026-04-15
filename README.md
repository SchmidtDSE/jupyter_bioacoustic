# JupyterBioacoustic

_A JupyterLab plugin for reviewing and annotating bioacoustic audio clips._

![JupyterBioacoustic Plugin](assets/app-review.png)

Browse a table of audio clips, play each one with a spectrogram, and optionally record verification decisions or annotations — all without leaving the notebook. The form layout is fully configurable via YAML; without a form config the widget is a pure visualizer/player.

## Install

### From pre-built wheel (fastest)

Download the wheel from a [GitHub Release](https://github.com/SchmidtDSE/dev-jupyter-audio/releases) and install locally. No Node.js or build step needed:

```bash
gh release download v0.1.0 --repo SchmidtDSE/dev-jupyter-audio -p "*.whl" -D dist/
pip install dist/jupyter_bioacoustic-0.1.0-py3-none-any.whl
```

Or in a pixi `pyproject.toml` (after downloading the wheel):

```toml
jupyter-bioacoustic = { path = "dist/jupyter_bioacoustic-0.1.0-py3-none-any.whl" }
```

### For development

```bash
git clone <repo-url>
cd dev-jupyter-audio
pixi run setup   # install deps, build TypeScript, register extension
pixi run lab     # launch JupyterLab
```

### Building a new wheel

After TypeScript or Python changes:

```bash
# 1. Build TypeScript
pixi run build

# 2. Build the wheel (requires the `dev` pixi environment)
rm -f dist/*.whl
pixi run -e dev python -m build --wheel

# 3. Verify
ls dist/*.whl
```

Then distribute the wheel:
- Copy it to downstream repos (e.g. `dev-jupyter-audio-demo/dist/`)
- Optionally tag and create a [GitHub Release](https://github.com/SchmidtDSE/dev-jupyter-audio/releases) with the wheel attached

```bash
git tag v0.1.2
git push origin v0.1.2
gh release create v0.1.2 dist/jupyter_bioacoustic-0.1.2-py3-none-any.whl \
    --title "v0.1.2" --notes "prev/next on reviewed"
```

> **Checklist:**
> - Bump the version in `pyproject.toml` if the API changed
> - Delete old wheels before building (`rm -f dist/*.whl`)
> - Update the wheel filename in downstream `pyproject.toml` files if the version changed

## Quick Start

```python
from jupyter_bioacoustic import JupyterAudio

JupyterAudio(
    data='detections-test.csv',
    audio_path='test.flac',
    prediction_column='common_name',
    form_config='form-review.yaml',
    output='reviews.csv',
    inline=True,
).open()
```

![JupyterBioacoustic Plugin](assets/app-inline.png)

See the [Quick Start guide](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Quick-Start) for test files and more examples.

## Features

| | |
|---|---|
| **Clip table** | Sort, filter (`common_name = 'Barred owl' and confidence >= 0.5`), paginate, configurable columns |
| **Spectrogram** | Plain/mel STFT, buffer overlay, play/pause, capture PNG |
| **Annotation tools** | Draggable time markers, start/end lines, frequency-time bounding boxes |
| **Configurable forms** | YAML-driven: selects, textboxes, checkboxes, conditional sections, progress tracker |
| **Per-row audio** | Each row can point to a different audio file with fallback |
| **Output** | CSV, Parquet, or line-delimited JSON with `pass_value`, `fixed_value`, and `**kwargs` |
| **Duplicate prevention** | Reviewed rows faded, read-only results, deletable. Filter by pending/reviewed/all with refresh. |

## Documentation

Full documentation is on the [wiki](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki):

- [Quick Start](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Quick-Start) — Installation and first usage
- [Configuration](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Configuration) — All parameters, config files, capture, S3, kwargs
- [Configurable Forms](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Configurable-Forms) — YAML form layout reference
- [Annotation Tools](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Annotation-Tools) — Spectrogram interaction tools
- [Data Schema](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Data-Schema) — Input and output formats
- [API Reference](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/API-Reference) — `JupyterAudio` class, properties, methods
- [Development](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Development) — Project structure, build tasks, architecture

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `data` | DataFrame / str | *required* | Input data with `id`, `start_time`, `end_time` columns |
| `audio_path` | str | `''` | Default audio file (local or `s3://`) |
| `audio_column` | str | `''` | Column with per-row audio paths |
| `output` | str | `''` | Output file path (`.csv`, `.parquet`, `.jsonl`) |
| `form_config` | dict / str | `None` | Form layout — YAML file, dict, or `None` for no form |
| `prediction_column` | str | `''` | Prediction column — sets title, info card, capture filename |
| `display_columns` | list | `[]` | Extra columns in the info card |
| `data_columns` | list | `[]` | Columns for the clip table |
| `duplicate_entries` | bool | `False` | Allow multiple submissions per row |
| `default_buffer` | int / float | `3` | Default buffer time in seconds around each clip |
| `capture` | bool / str | `True` | Capture button (`False` to hide, string for custom label) |
| `capture_dir` | str | `''` | Directory prefix for captures |
| `inline` | bool | `False` | Embed below cell vs split-right panel |
| `config` | str | `None` | Path to YAML/JSON config file |
| `**kwargs` | | | Fixed columns in every output row |

See [Configuration](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Configuration) for full details.

## License

BSD 3-Clause
