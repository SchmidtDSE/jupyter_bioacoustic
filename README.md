# JupyterBioacoustic

_A JupyterLab plugin for reviewing and annotating bioacoustic audio clips._

![JupyterBioacoustic Plugin](assets/app-review.png)

**Documentation**
- site:  https://schmidtdse.github.io/jupyter_bioacoustic/
- docs: https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki

**Table of Contents**

- [Install](#install)
- [Quick Start](#quick-start)
- [Features](#features)
- [Documentation](#documentation)
- [Usage](#usage)
- [BioacousticAnnotator Parameters](#bioacousticannotator-parameters)
- [Demo](#demo)
- [License](#license)

---

## Install

```bash
pip install jupyter-bioacoustic
```

Or from a [GitHub Release](https://github.com/SchmidtDSE/jupyter_bioacoustic/releases) wheel:

```bash
pip install jupyter_bioacoustic-0.5.0-py3-none-any.whl
```

See the [Development wiki](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Development) for building from source.

## Quick Start

```python
from jupyter_bioacoustic import BioacousticAnnotator

BioacousticAnnotator(
    data='detections-test.csv',
    audio='test.flac',
    ident_column='common_name',
    form_config='form-review.yaml',
    output='reviews.csv',
).open()
```

![JupyterBioacoustic Plugin](assets/app-inline.png)

See the [Quick Start guide](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Quick-Start) for test files and more examples.

## Features

| | |
|---|---|
| **Clip table** | Sort, GUI filter builder (column/operator/value dropdowns, filter chips), paginate, configurable columns, keyboard navigation |
| **Spectrogram** | Linear/mel STFT or custom visualizations, buffer overlay, play/pause, frequency/time zoom, configurable resolution, capture PNG, keyboard shortcuts |
| **Annotation tools** | Draggable time markers, start/end lines, frequency-time bounding boxes, multibox (multiple labeled boxes per clip) |
| **Configurable forms** | YAML-driven: selects (with conditional sections, filter box, custom values), textboxes, checkboxes, progress tracker, `dynamic_forms` for reusable named sections |
| **Per-row audio** | Each row can point to a different audio file with fallback. S3 and HTTPS partial byte-range downloads (requires ffmpeg). Falls back to full download + cache without ffmpeg. |
| **Output & Sync** | CSV, Parquet, or line-delimited JSON with `pass_value`, `fixed_value`, and `**kwargs`. Sync output to S3/GCS via button or `ba.sync()`. |
| **Duplicate prevention** | Reviewed rows faded, read-only results, deletable. Filter by pending/reviewed/all with refresh. |

## Documentation

Full documentation is on the [wiki](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki):

- [Quick Start](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Quick-Start) — Installation and first usage
- [Configuration](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Configuration) — All parameters, config files, capture, S3, kwargs
- [Configurable Forms](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Configurable-Forms) — YAML form layout reference
- [Annotation Tools](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Annotation-Tools) — Spectrogram interaction tools
- [Data Schema](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Data-Schema) — Input and output formats
- [API Reference](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/API-Reference) — `BioacousticAnnotator` class, properties, methods
- [Audio IO](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Audio-IO) — `jupyter_bioacoustic.audio` module reference
- [Demo](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Demo) — Running the demo notebooks
- [Development](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Development) — Project structure, build tasks, architecture

## Usage 

The `BioacousticAnnotator` class has an extremely simple interface; having only two methods (`.open(inline=True)`, `.output(force=False)`) and one property (`.source`).

```python
from jupyter_bioacoustic import BioacousticAnnotator

# Create an instance
ja = BioacousticAnnotator(data='path_to_data.parquet', ...)

# Open the interface
ja.open()

# Get a dataframe with all the submitted data
# Note: this data is lazy loaded. this will read from
#       file each time you submit.
#       however between submissions it will be cached.
result_df = ja.output()
result_df = ja.output(force=True)  # force re-read from disk

# Dataframe access to the source data (here 'path_to_data.parquet')
ja.source
```

The parameters for `BioacousticAnnotator` are listed [below](#bioacousticannotator-parameters). There is one special parameter `config` that can be used instead of providing the parameter values directly in the notebook. This is a great feature for reproduciblity, organization and avoiding bloated notebooks.  

Consider the example above:


```python
BioacousticAnnotator(
    data='detections-test.csv',
    audio='test.flac',
    ident_column='common_name',
    form_config='form-review.yaml',
    output='reviews.csv',
)
```

This can instead be produced this way

```python
BioacousticAnnotator(
    data='detections-test.csv',
    config='config/review-configuration.yaml',
).open()
```

```yaml
# config/review-configuration.yaml
audio: 'test.flac'
ident_column: 'common_name'
form_config: 'form-review.yaml'
output: 'reviews.csv'
```

For this simple example, this might not seem helpful. However for more advanced configurations this is quite useful.  Moreover, in the example above the review-form has a configuration file `form-review.yaml`. If using `config` the form can be included directly.

See [Configuration](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Configuration) for full details. Here is an advanced example:

```yaml
# BioacousticAnnotator Args
audio: "audio_path"    # column name — auto-detected (no slashes or dots)
data_columns: ["common_name", "confidence", "start_time", "county", "audio_path"]
ident_column: 'common_name'
display_columns: ["confidence", "county", "start_time", "audio_path"]
capture: 'Save Spectrogram'
capture_dir: 'spectrograms'


# Form
form_config:
    title:
      value: 'REVIEW CLIP'
      progress_tracker: true
    select:
      label: Is Valid
      column: is_valid
      required: true
      items:
        - label: 'yes'
          value: 'yes'
        - label: 'no'
          value: 'no'
          form: correction_form
    textbox:
      label: notes
      column: notes
    annotation:
      start_time:
        label: Start
        column: start_time
        source_value: start_time
      end_time:
        label: End
        column: end_time
        source_value: end_time
      tools: start_end_time_select
    correction_form:
      - select:
          label: verified name
          column: verified_common_name
          required: true
          items:
            path: data/categories.csv
            value: common_name
      - select:
          label: verif. confidence
          column: verification_confidence
          items:
            - low
            - medium
            - high
    submission_buttons:
      line: true
      next:
        label: Skip
      submit:
        label: Verify
```

### BioacousticAnnotator Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `data` | DataFrame / str / dict | *required** | Input data. String: file path, URL, `api::url`, or SQL (`SELECT ...`). Dict: `{path\|url\|uri\|api\|sql, secrets, columns}`. |
| `data_path` | str | `None` | Explicit file path for data (overrides `data` source). |
| `data_url` | str | `None` | Explicit URL for data (overrides `data` source). |
| `data_sql` | str | `None` | Explicit SQL query for data (overrides `data` source). |
| `data_api` | str | `None` | Explicit API endpoint for data (overrides `data` source). |
| `data_secrets` | dict or list | `None` | Auth for data loading. `{key, value}` pairs. Value: `env:VAR`, `dialog`, or literal. |
| `data_columns` | list | `[]` | Columns for the clip table. |
| `audio` | str or dict | *required** | Audio source. String: local path, URL/URI, or column name (auto-detected). Dict: `{path\|url\|uri\|column\|sql\|api\|src, prefix, suffix, fallback, secrets, property, response_index}`. |
| `audio_src` | str | `None` | Audio source string (auto-detected as path, URL, or column name). Same as passing a bare string to `audio`. |
| `audio_path` | str | `None` | Explicit local file path for audio (overrides `audio` source). |
| `audio_url` | str | `None` | Explicit URL for audio (overrides `audio` source). |
| `audio_uri` | str | `None` | Alias for `audio_url`. |
| `audio_column` | str | `None` | Explicit column name for per-row audio (overrides `audio` source). |
| `audio_prefix` | str | `''` | Prefix joined with `/` to audio paths. |
| `audio_suffix` | str | `''` | Suffix joined with `/` to audio paths. |
| `audio_fallback` | str | `''` | Fallback when `audio` is a column and the row value is empty. |
| `audio_secrets` | dict or list | `None` | Auth for audio loading (same format as `data_secrets`). |
| `audio_sql` | str | `None` | SQL query to resolve audio path. Requires `audio_property`. |
| `audio_api` | str | `None` | API URL to resolve audio path. Requires `audio_property`. |
| `audio_property` | str | `None` | Field/column to extract from SQL/API response as the audio path. |
| `audio_response_index` | int | `1` | 1-based row index for SQL/API response (1 = first row). |
| `secrets` | dict or list | `None` | Global auth — fallback for both `data_secrets` and `audio_secrets`. |
| `output` | str or dict | `''` | Output file path or sync config dict. String: local path. Dict: `{path, uri/url, sync_button, recursive, secrets}`. See [Output & Sync](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Configuration#output--sync). |
| `form_config` | dict / str | `None` | Form layout — YAML file, dict, or `None` for no form. |
| `ident_column` | str | `''` | Identifying column — shown first (without label) in the info card and capture filenames. |
| `app_title` | str | `'Jupyter Bioacoustic'` | Custom title shown in the widget header and tab. |
| `display_columns` | list | `[]` | Extra columns in the info card. |
| `duplicate_entries` | bool | `False` | Allow multiple submissions per row |
| `default_buffer` | int / float | `3` | Default buffer time in seconds around each clip |
| `capture` | bool / str | `True` | Capture button (`False` to hide, string for custom label) |
| `capture_dir` | str | `''` | Directory prefix for captures |
| `spectrogram_resolution` | int / list | `[1000, 2000, 4000]` | Spectrogram width in pixels. List for a dropdown selector, single value for fixed. Prefix an item with `selected::` to set the default (e.g. `[1000, 'selected::2000', 4000]`). |
| `visualizations` | list | `['linear', 'mel']` | Visualization types for the dropdown. Built-in strings (`'linear'`, `'mel'`, `'log_frequency'`, `'bandpass'`, `'waveform'`) or custom callables. See [Custom Visualizations](https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki/Configuration#custom-visualizations). |
| `partial_download` | bool | `True` | Use byte-range downloads for remote audio (requires ffmpeg/pydub). Set to `False` to always download and cache the full file. |
| `width` | str | `'100%'` | Inline widget width. |
| `height` | int | `900` | Inline widget height. |
| `config` | str | `None` | Path to YAML/JSON config file |
| `**kwargs` | | | Fixed columns in every output row |

> \* `data` is not required if `data_path`, `data_url`, `data_sql`, or `data_api` is provided. `audio` is not required if `audio_src`, `audio_path`, `audio_url`, `audio_uri`, `audio_column`, `audio_sql`, or `audio_api` is provided.

## Demo

Example notebooks are included in the `demo/` directory. They require additional dependencies (ipyleaflet, shapely, seaborn, requests).

### 1. Install with demo dependencies

**With pixi:**
```bash
pixi run -e demo lab
```
This launches JupyterLab with the demo dependencies and sets the working directory to `demo/`.

**With pip:**
```bash
pip install -e ".[demo]"
jupyter lab --ServerApp.iopub_data_rate_limit=1e10
```

### 2. Download audio files (one-time)

Audio files are not included in this repository (they are large FLAC files, ~50-100 MB each).

> **These are large files. It will likely take multiple minutes per file to download.** For demo purposes, you can replace them with any FLAC audio file — the spectrograms will look different but the plugin works the same way.

**With AWS CLI (faster):**

```bash
cd demo
mkdir -p audio
aws s3 cp s3://dse-soundhub/public/audio/dev/20230522_200000.flac audio/test-default.flac --no-sign-request &
aws s3 cp s3://dse-soundhub/public/audio/dev/20230524_200000.flac audio/test1.flac --no-sign-request &
aws s3 cp s3://dse-soundhub/public/audio/dev/20230525_200000.flac audio/test2.flac --no-sign-request &
aws s3 cp s3://dse-soundhub/public/audio/dev/20230526_000000.flac audio/test3.flac --no-sign-request &
wait
```

**With curl:**

```bash
cd demo
mkdir -p audio
curl -o audio/test-default.flac https://dse-soundhub.s3.us-west-2.amazonaws.com/public/audio/dev/20230522_200000.flac
curl -o audio/test1.flac https://dse-soundhub.s3.us-west-2.amazonaws.com/public/audio/dev/20230524_200000.flac
curl -o audio/test2.flac https://dse-soundhub.s3.us-west-2.amazonaws.com/public/audio/dev/20230525_200000.flac
curl -o audio/test3.flac https://dse-soundhub.s3.us-west-2.amazonaws.com/public/audio/dev/20230526_000000.flac
```

### 3. Open a demo notebook

Open `simple-example.ipynb` from the JupyterLab file browser. The notebook demonstrates both review and annotation workflows.

## License

BSD 3-Clause
