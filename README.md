# JupyterBioacoustic

_A JupyterLab plugin for reviewing and annotating bioacoustic audio clips._

Browse a table of audio clips, play each one with a mel spectrogram, and optionally record verification decisions or annotations — all without leaving the notebook. The form layout is fully configurable via YAML; without a form config the widget is a pure visualizer/player.

**Clip table.** An interactive list of clips or detections that lets you:
- Sort by any column and filter with expression syntax — `common_name = 'Barred Owl' and confidence >= 0.5`
- Paginate through large result sets with configurable page size
- Select any row to load the corresponding audio clip
- Control which columns appear with `data_columns`

**Spectrogram player.** A visual audio player built around the selected clip's time window:
- Renders a mel spectrogram or plain STFT of the clipped audio segment
- Adjustable buffer window — pads the clip with context on either side
- Semi-transparent overlay marks the region outside the clip window
- Displays metadata in an info card, controlled by `prediction_column` and `display_columns`
- Annotation tools: draggable time markers (`time_select`, `start_end_time_select`) and frequency-time bounding boxes
- Play/pause with a real-time position indicator drawn over the spectrogram
- Capture button to save spectrogram PNGs

**Configurable form.** Define your own review or annotation form via a YAML config:
- Build review forms with `is_valid_select`, conditional `yes_form`/`no_form` sections, and any combination of selects, textboxes, checkboxes, number inputs, and annotation tools
- Build annotation forms with any fields you need
- Load select options from inline lists, CSV/Parquet/JSONL/YAML files, or integer ranges
- Pass input row values to output with `pass_value`, add constants with `fixed_value` or `**kwargs`
- Output is written to CSV, Parquet, or line-delimited JSON on each submit
- Progress tracker shows session and total counts with accuracy

**Table of Contents**

- [Usage](#usage)
- [Configurable Forms](#configurable-forms)
- [Data Schema](#data-schema)
- [Motivation](#motivation)
- [Install](#install)
- [Dev](#dev)
- [License](#license)

---

## Usage

### Basic usage

```python
import pandas as pd
from jupyter_bioacoustic import JupyterAudio

df = pd.read_csv('detections-test.csv')

# Visualizer/player only (no form)
JupyterAudio(
    data=df,
    audio_path='test.flac',
    prediction_column='common_name',
    display_columns=['confidence', 'rank'],
).open()

# With a review form
JupyterAudio(
    data=df,
    audio_path='test.flac',
    prediction_column='common_name',
    display_columns=['confidence', 'rank'],
    form_config='form-review.yaml',
    output='observations.jsonl',
).open()
```

![JupyterBioacoustic Plugin](assets/screenshot.png)

### Loading data from a file

`data` accepts a file path string as well as a DataFrame. The format is inferred from the extension:

```python
JupyterAudio(
    data='detections.csv',          # or .parquet, .jsonl, .ndjson
    audio_path='test.flac',
    category_path='categories.csv',
    prediction_column='common_name',
    output='observations.jsonl',
).open()
```

### Per-row audio files

If each row points to a different audio file, use `audio_column` instead of (or alongside) `audio_path`:

```python
# Each row has its own file path in the 'file' column
JupyterAudio(
    data='detections.csv',
    audio_column='file',               # column containing audio paths
    audio_path='fallback.flac',        # optional fallback for empty values
).open()
```

Rows with a non-empty value in the audio column use that path. Rows with empty/null values fall back to `audio_path`. At least one of the two must be set.

### Customising the clip table columns

By default the table shows the prediction column (if set), any `display_columns`, plus `id`, `start_time`, and `end_time`. Use `data_columns` to specify exactly which columns appear and in what order:

```python
JupyterAudio(
    data='detections.csv',
    audio_path='test.flac',
    prediction_column='common_name',
    data_columns=['id', 'common_name', 'confidence', 'start_time', 'end_time', 'rank'],
    output='observations.jsonl',
).open()
```

### Output file format

The output format is inferred from the file extension. Any unrecognised extension (including no extension) writes line-delimited JSON:

```python
# line-delimited JSON (default)
JupyterAudio(..., output='observations.jsonl').open()

# CSV
JupyterAudio(..., output='observations.csv').open()

# Parquet
JupyterAudio(..., output='observations.parquet').open()
```

### Config file

Any parameter can be set in a JSON or YAML config file and loaded with the `config` argument. Explicitly passed arguments always take precedence over config file values, so you can keep shared settings in a file and override per-session in the notebook.

```yaml
# config.yaml
data: 'detections.csv'
audio_path: 'recordings/site-a.flac'
category_path: 'categories.csv'
prediction_column: 'common_name'
display_columns: ['confidence', 'rank']
output: 'observations.jsonl'
```

```python
# load everything from config
JupyterAudio(config='config.yaml').open()

# override audio_path for a different recording; everything else from config
JupyterAudio(audio_path='recordings/site-b.flac', config='config.yaml').open()
```

Supported config formats: `.json`, `.yaml`, `.yml`. A path with no extension is assumed to be YAML.

### Embedding inline

By default the widget opens as a split-right panel. Set `inline=True` to embed it directly below the notebook cell instead:

```python
JupyterAudio(
    data=df,
    audio_path='test.flac',
    category_path='categories.csv',
    prediction_column='common_name',
    output='observations.jsonl',
    inline=True,
    height=900,    # px, or a CSS string like '90vh'
    width='100%',
).open()
```

### Accessing data

The `JupyterAudio` instance exposes the input and output data directly:

```python
ja = JupyterAudio(data=df, audio_path='test.flac', output='reviews.jsonl', form_config='form.yaml')
ja.open()

ja.source       # the input DataFrame passed as data=
ja.output()     # the output file as a DataFrame (cached, reloads after each submit)
```

`ja.output()` lazy-loads the output file and caches the result. The cache is automatically invalidated each time the widget's submit button is pressed, so the next call re-reads the file.

### Parameters

| parameter | type | default | description |
|---|---|---|---|
| `data` | DataFrame or str | — | Rows with at minimum `id`, `start_time`, `end_time`. Pass a file path (`.csv`, `.parquet`, `.jsonl`, `.ndjson`) to load directly. |
| `audio_path` | str | `''` | Default audio file — local path or `s3://bucket/key`. Used when `audio_column` is not set or the row value is empty. |
| `audio_column` | str | `''` | Column in `data` containing per-row audio file paths. Rows with empty values fall back to `audio_path`. At least one of `audio_path` or `audio_column` is required. |
| `category_path` | str | `''` | Path to `categories.csv` for the class dropdown |
| `output` | str | `''` | Path where rows are appended on Verify / Submit. Format inferred from extension: `.csv`, `.parquet`, `.jsonl` / `.ndjson`, or line-delimited JSON for any other extension. Parent directories are created automatically. |
| `prediction_column` | str | `''` | Column holding the model's predicted class. Sets title to "Bioacoustic Reviewer", shows the value in the info card, and uses it in capture filenames. |
| `display_columns` | list\[str\] | `[]` | Extra columns to show in the player info card |
| `data_columns` | list\[str\] | `[]` | Ordered list of columns to display in the clip table. When empty and no `prediction_column` or `display_columns` are set, all columns in the data are shown. |
| `inline` | bool | `False` | Embed below cell instead of opening a panel |
| `width` | int \| str | `'100%'` | Inline widget width (px int or CSS string) |
| `height` | int \| str | `900` | Inline widget height (px int or CSS string) |
| `form_config` | dict or str | `None` | Form layout config — a Python dict, or a path to a YAML/JSON file. May also be included in `config` (see below). When omitted, no form is shown and the widget is a pure visualizer/player. See [Configurable Forms](#configurable-forms) below. |
| `capture` | bool or str | `True` | Show a Capture button to save spectrogram PNGs. `False` hides it. A string sets the button label (e.g. `'Save Spectrogram'`). |
| `capture_dir` | str | `''` | Directory prefix for capture filenames. Created automatically if it doesn't exist. |
| `config` | str | `None` | Path to a JSON or YAML config file. Any parameter above can be set here; explicit arguments override file values. |
| `**kwargs` | | | Any extra keyword arguments are written as fixed columns in every output row. See below. |

### Fixed values via kwargs

Any unrecognised keyword argument is treated as a fixed value column appended to every output row:

```python
JupyterAudio(
    data=df,
    audio_path='test.flac',
    form_config='form.yaml',
    output='reviews.csv',
    reviewer_name='brookie guzder-williams',
    review_date=20260413,
).open()
```

Every submitted row will include `reviewer_name` and `review_date` with the given values. This is equivalent to adding `fixed_value` entries at the end of the form config, but more convenient for per-session metadata.

### Configurable Forms

The review/annotation form is fully driven by a **form config** — a YAML file, JSON file, or Python dict passed via the `form_config` parameter. When no form config is provided the widget operates as a visualizer/player with no form section.

```python
# From a YAML file
JupyterAudio(
    data='detections.csv',
    audio_path='test.flac',
    form_config='form-review.yaml',
).open()

# From a Python dict
JupyterAudio(
    data='detections.csv',
    audio_path='test.flac',
    form_config={
        'title': 'REVIEW CLIP',
        'is_valid_form': [
            {'is_valid_select': True},
            {'textbox': {'label': 'notes', 'column': 'notes'}},
        ],
        'submission_buttons': {'next': {'label': 'Skip'}, 'submit': {'label': 'Verify'}},
    },
).open()

# Embedded in the main config.yaml under a form_config key
JupyterAudio(config='config.yaml').open()
```

There are two form types, determined by which top-level key is present:

| Form type | Key | Widget title |
|---|---|---|
| **Review** | `is_valid_form` | Bioacoustic Reviewer |
| **Annotate** | `annotate_form` | Bioacoustic Annotator |

#### Review form structure

```yaml
title:
  value: REVIEW CLIP             # optional styled header
  progress_tracker: true         # inline progress: session 2/25 · total 8/25 · accuracy 75%
pass_value:                      # pass input row values to output
  source_column: id
  column: detection_id
is_valid_form:                   # always visible; must contain one is_valid_select
  - is_valid_select: true
  - textbox:
      label: notes
      column: notes
  - annotation:
      start_time:
        label: signal start
        column: signal_start_time
        source_value: start_time
      tools: time_select

yes_form:                        # shown when is_valid = yes (optional)
  - ...

no_form:                         # shown when is_valid = no (optional)
  - select:
      label: verified name
      column: verified_common_name
      items:
        path: categories.csv
        value: common_name
  - select:
      label: verif. confidence
      column: verification_confidence
      items: [low, medium, high]

submission_buttons:
  line: true
  next:
    label: Skip
  submit:
    label: Verify
```

#### Annotation form structure

```yaml
title: ANNOTATE CLIP
annotate_form:                   # always visible
  - select:
      label: common_name
      column: common_name
      items:
        path: categories.csv
        value: common_name
  - select:
      label: confidence
      column: confidence
      items: [low, medium, high]
  - textbox:
      label: notes
      column: notes
  - annotation:
      start_time:
        label: start
        column: start_time
        source_value: start_time
      end_time:
        label: end
        column: end_time
        source_value: end_time
      tools: start_end_time_select

submission_buttons:
  line: true
  next:
    label: Skip
  submit:
    label: Submit
```

#### Element types

| Element | Description |
|---|---|
| `textbox` | Single-line or multiline text input. `multiline: true` renders a `<textarea>`. |
| `select` | Dropdown. Items from an inline list, a file (CSV/Parquet/JSONL/YAML/text), or an integer range. |
| `checkbox` | Single checkbox. Custom `yes_value`/`no_value` supported. |
| `number` | Numeric input with optional `min`, `max`, `step`, `placeholder`. |
| `is_valid_select` | Special yes/no dropdown for review mode. Required by default. Controls `yes_form`/`no_form` visibility. |
| `annotation` | Spectrogram annotation tools — draggable lines and bounding boxes. See [Annotation tools](#annotation-tools) below. |
| `title` | Styled section header. String or `{value, progress_tracker}`. Can appear anywhere. |
| `pass_value` | Passes a column from the input row to the output. `pass_value: col` or `{source_column, column}`. Position controls output column order. |
| `fixed_value` | Writes a constant value to every output row. `{column, value}`. |
| `progress_tracker` | Shows session and total progress, with accuracy for review mode. Reads existing output file on load. |
| `break` | Line break. |
| `line` | Horizontal divider. |
| `text` | Static text. |

#### Common fields

All input elements share these optional fields:

```yaml
label: 'Label Text'         # display label; doubles as column name if column omitted
column: 'output_col_name'   # output column name (defaults to label)
default: null               # initial value
required: false             # if true, submit disabled until value is set
source_value: 'col_name'    # pre-populate from this column of the selected row
width: null                 # CSS width (int = px, string = CSS value)
```

#### Select items formats

```yaml
# Inline list
items: [low, medium, high]

# Inline with custom labels
items:
  - low: Low confidence
  - high: High confidence

# From a file
items:
  path: categories.csv
  value: common_name        # column for option value
  label: display_name       # column for display label (optional)

# Plain text file (one value per line, or "value, label" per line)
items: species.txt

# Integer range
items:
  min: 1
  max: 5
  step: 1
```

#### Submission buttons

```yaml
submission_buttons:
  previous: true             # go back without writing
  next:
    label: Skip              # go forward without writing
    icon: true               # show arrow icon (default true)
  submit:
    label: Verify            # write form values and advance
    icon: true               # show checkmark icon (default true)
```

Use `pass_value` to include input row values (like `id`) in the output.

#### Annotation tools

The `annotation` element adds interactive spectrogram tools for marking times and frequency ranges. Without an `annotation` element, the spectrogram has no click/drag interaction.

Three tools are available:

| Tool | Interaction | Fields used |
|---|---|---|
| `time_select` | Single draggable vertical line | `start_time` |
| `start_end_time_select` | Two draggable vertical lines (can't cross) | `start_time`, `end_time` |
| `bounding_box` | Click+drag rectangle with draggable edges | `start_time`, `end_time`, `min_frequency`, `max_frequency` |

```yaml
- annotation:
    start_time:                    # required for all tools
      label: Start
      column: start_time
      source_value: start_time     # init from selected row column
    end_time:                      # required for start_end_time_select, bounding_box
      label: End
      column: end_time
      source_value: end_time
    min_frequency:                 # required for bounding_box
      label: Min
      column: min_freq
    max_frequency:                 # required for bounding_box
      label: Max
      column: max_freq
    tools:                         # string for one tool, list for a selector dropdown
      - start_end_time_select
      - bounding_box
```

When `tools` is a list, a dropdown appears in the form to switch between tools. Values for all configured fields are always written to the output regardless of which tool is active.

For the full specification with all options, see [CONFIG_FORMS.md](CONFIG_FORMS.md).

### Features

| Section | What you can do |
|---|---|
| **Filter bar** | Expression filtering: `common_name = 'Barred owl' and confidence >= 0.5` |
| **Clip table** | Sort by any column · paginate (5 / 10 / 20 / custom rows) · click to select · columns set by `data_columns` |
| **Info card** | Time range · prediction value · any `display_columns` · Prev / Next navigation |
| **Spectrogram player** | Mel or plain STFT · adjustable buffer · buffer overlay · play/pause · capture PNG · annotation tools |
| **Configurable form** | YAML-driven: selects, textboxes, checkboxes, number inputs, annotation tools, conditional sections, `pass_value`, `fixed_value`, progress tracker |
| **Analysis tools** | Species histograms · accuracy-by-county charts · choropleth maps · interactive map selection (`tools/`) |

---

## Data Schema

### Input

Pass either a pandas DataFrame or a file path string. The only required columns are `id`, `start_time`, and `end_time`; all other columns are optional.

| column | type | description |
|---|---|---|
| `id` | int | unique clip / detection ID |
| `start_time` | float | clip start (seconds from file start) |
| `end_time` | float | clip end (seconds) |
| *(any others)* | — | available for `prediction_column`, `display_columns`, `data_columns` |

Supported input file formats (when `data` is a path string):

| extension | format |
|---|---|
| `.csv` | comma-separated values |
| `.parquet` | Apache Parquet |
| `.jsonl`, `.ndjson` | line-delimited JSON |

### Output

Format is inferred from the `output` file extension. Line-delimited JSON is the default for any unrecognised extension.

| extension | format |
|---|---|
| `.csv` | comma-separated values (header written on first row) |
| `.parquet` | Apache Parquet (read-concat-write on each append) |
| `.jsonl`, `.ndjson`, *(other)* | line-delimited JSON — one JSON object per line |

Output columns are determined by the `form_config`. Each submit writes one column per form element (using the element's `column` or `label` as the column name), plus any `pass_value`, `fixed_value`, or `**kwargs` entries. Use `pass_value` to include input row values like `id` in the output. Column order matches the order elements appear in the config.


---

## Motivation

Using JupyterGIS as a guide, it's interesting how we might work with bioacoustic data in JupyterLab — either as a plugin ecosystem or as a suite of standalone widgets.

JupyterGIS's foundation is:

- A schema for JSON objects that define what layers exist and the data/sources being displayed
- Code that translates JSON into visual display, allows two-way communication between map layers and Python objects, computes GIS operations (merge / convex hull / simplify / ...), supports real-time collaboration, and turns map interactions into reproducible code

**JupyterBioacoustic** overlaps many of these points, replacing maps with audio tools. If it grew into a full product it could start as a suite of interactive Jupyter plugins.

1. An interactive clip table that lets you filter, sort, and select rows pointing to audio sources and time windows.
2. A spectrogram player that displays the selected clip, plays audio, and supports both verification (confirm or correct a model prediction) and annotation (assign a class from scratch). Similar in spirit to [whombat](https://mbsantiago.github.io/whombat/).
3. Reporting tools — species histograms, accuracy-by-county charts, progress tracking, and choropleth maps via the `tools/analysis` module.
4. Map integration — interactive county/region selection and bounding-box filtering via `tools/MapHandler`, using ipyleaflet.

---

## Install

### Requirements

- Python ≥ 3.11
- JupyterLab ≥ 4.0
- [pixi](https://pixi.sh)

### Setup

```bash
git clone <repo-url>
cd jupyter_bioacoustic
pixi run setup   # installs deps, builds TypeScript, registers the extension
pixi run lab     # launches JupyterLab
```

### Test files

Dummy files for testing are available on S3:

```bash
curl -O https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/test.flac
curl -O https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/categories.csv
curl -O https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/detections-test.csv
```

Or regenerate the synthetic detections locally:

```bash
pixi run generate-data
```

### S3 audio

S3 URIs (`s3://bucket/key`) are supported via `boto3` — ensure your AWS credentials are configured before passing an S3 path as `audio_path`.

---

## Dev

### Project structure

```
jupyter_bioacoustic/
├── pyproject.toml                    # build config + pixi task definitions
├── develop.py                        # labextension symlink helper
├── generate_test_data.py             # generates detections-test.csv
├── generate_dev_data.py              # generates dev-annotate.csv / dev-review.csv
├── categories.csv                    # 51 species/class reference rows
├── categories-small.csv              # 19 species subset
├── form-review.yaml                  # example review form config
├── CONFIG_FORMS.md                   # full form config specification
├── tools/                            # analysis and map utilities
│   ├── __init__.py
│   ├── analysis.py                   # histograms, accuracy charts, choropleth maps
│   └── map_handler.py                # interactive ipyleaflet point/region selection
└── jupyter_bioacoustic/              # Python package + TypeScript source
    ├── api.py                        # JupyterAudio class
    ├── __init__.py
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                  # plugin entry point
        └── plugin.ts                 # full widget (table + player + form)
```

### Pixi tasks

| task | description |
|---|---|
| `pixi run setup` | full install: jlpm → tsc → labextension build → pip install → symlink |
| `pixi run build` | rebuild TypeScript only (after source changes) |
| `pixi run lab`   | launch JupyterLab |
| `pixi run watch` | watch TypeScript and recompile on change |
| `pixi run generate-data` | regenerate `detections-test.csv` |

> After any TypeScript change: `pixi run build` then hard-refresh the browser.

### How the plugin works

`JupyterAudio.open()` serialises the DataFrame to JSON and stores it in kernel namespace variables (`_BA_DATA`, `_BA_AUDIO_PATH`, etc.), then uses `display(Javascript(...))` to trigger a JupyterLab command or attach a widget to a cell output div.

The TypeScript `BioacousticWidget` reads those variables on attach, populates the table, and for each selected row runs a Python snippet in the kernel that uses `soundfile` (partial file seeking) + `numpy` + `matplotlib` to return a base64-encoded mel spectrogram PNG and WAV segment. No full audio files are ever loaded into the browser.

---

## License

BSD 3-Clause
