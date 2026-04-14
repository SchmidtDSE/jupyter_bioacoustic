# JupyterBioacoustic

_A JupyterLab plugin for reviewing and annotating bioacoustic audio clips._

![JupyterBioacoustic Plugin](assets/screenshot.png)

Browse a table of audio clips, play each one with a spectrogram, and optionally record verification decisions or annotations — all without leaving the notebook. The form layout is fully configurable via YAML; without a form config the widget is a pure visualizer/player.

## Quick Start

```bash
git clone <repo-url>
cd jupyter_bioacoustic
pixi run setup   # install deps, build TypeScript, register extension
pixi run lab     # launch JupyterLab
```

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

![TODO INSERT SCREENSHOT: Widget embedded inline below a notebook cell](assets/quick-start-inline.png)

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
| **Duplicate prevention** | Reviewed rows are faded, show read-only results, deletable |

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
| `capture` | bool / str | `True` | Capture button (`False` to hide, string for custom label) |
| `capture_dir` | str | `''` | Directory prefix for captures |
| `inline` | bool | `False` | Embed below cell vs split-right panel |
| `config` | str | `None` | Path to YAML/JSON config file |
| `**kwargs` | | | Fixed columns in every output row |

See [Configuration](https://github.com/SchmidtDSE/dev-jupyter-audio/wiki/Configuration) for full details.

## License

BSD 3-Clause

---

## TODO

### SCREENSHOT INSERTS

- README.md

    - [ ] Widget embedded inline below a notebook cell

- Quick-Start.md

    - [ ] Widget opened in split-right panel mode with a spectrogram loaded and form visible
    - [ ] Widget embedded inline below a notebook cell
    - [ ] Notebook cell showing `JupyterAudio(...).open()` with the widget appearing below

- Configuration.md

    - [ ] Example YAML config file open in an editor alongside the running widget
    - [ ] Widget showing per-row audio files with different filenames in the audio_path column
    - [ ] Capture button in the player controls bar
    - [ ] Save dialog prompt with auto-generated filename

- Configurable-Forms.md

    - [ ] Review form with is_valid_select, notes, and annotation tool visible
    - [ ] Review form showing no_form section expanded after selecting "no"
    - [ ] Annotation form with species dropdown and annotation tools
    - [ ] Progress tracker showing session and total counts inline with title
    - [ ] Form with multiple element types visible (select, textbox, checkbox, number)

- Annotation-Tools.md

    - [ ] time_select tool: single vertical line on spectrogram with handle at top
    - [ ] start_end_time_select tool: two colored vertical lines (green start, pink end) with shaded region between
    - [ ] bounding_box tool: rectangle drawn on spectrogram with corner handles
    - [ ] Tool selector dropdown in the form when multiple tools are configured

- Data-Schema.md

    - [ ] Example input CSV open in a table view
    - [ ] Example output CSV showing review results

- API-Reference.md

    - [ ] Notebook cell showing `ja.source` and `ja.output()` with DataFrames displayed
    - [ ] Reviewed row in the table showing faded/green styling
    - [ ] Read-only review result view with "Delete this review" button
