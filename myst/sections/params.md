(params)=
# Parameters & Configuration

All parameters can be passed directly to `BioacousticAnnotator()` or set in a YAML/JSON config file. The config file and constructor signature are the same — a config file is equivalent to `BioacousticAnnotator(**yaml.safe_load(open('config.yaml')))`.


## Data

The `data` parameter specifies where input rows come from. The source type is auto-detected from the string:

| Pattern | Source |
|---|---|
| Contains `SELECT` | SQL query (DuckDB) |
| Starts with `api::` | API endpoint |
| Starts with `http://`, `s3://`, etc. | URL / URI |
| Everything else | Local file path |

```{embed} nb.data.from-file
:remove-output: true
```

### DataFrame

```{embed} nb.data.from-dataframe
:remove-output: true
```

### SQL

```{embed} nb.data.from-sql
:remove-output: true
```

### Dict form

For explicit control over the source type, secrets, and columns:

```{embed} nb.data.dict-form
:remove-output: true
```

In YAML:

```yaml
data:
  path: data/annotate-data.csv
  columns: [common_name, confidence, start_time, end_time]
  secrets:
    - key: Authorization
      value: env:API_TOKEN
```

### Top-level overrides

`data_path`, `data_url`, `data_sql`, `data_api` override the source while keeping other settings in a dict or config file.

### Time columns

By default, the widget expects `start_time` and `end_time` columns. Use `data_start_time`, `data_end_time` to rename them, or `data_duration` (column name or fixed number) to compute end times:

```{embed} nb.data.duration
:remove-output: true
```

### Secrets

`data_secrets` provides authentication. Values can be `env:VAR_NAME`, `dialog` (interactive prompt), or literal strings. A global `secrets` parameter serves as fallback for both `data_secrets` and `audio_secrets`.


## Audio

The `audio` parameter specifies where audio files come from. Auto-detected from the string:

| Pattern | Source |
|---|---|
| Starts with `http://`, `s3://`, `gs://` | URL / URI |
| No `/` and no `.` | Column name (per-row audio) |
| Everything else | Local file path |

S3 uses partial byte-range downloads (only the FLAC header + estimated segment range). HTTPS files are downloaded and cached on first access.

`audio_prefix` and `audio_suffix` are joined with `/`. `audio_fallback` provides a default when using column mode with empty values.

### Dict form

```yaml
audio:
  column: audio_path
  prefix: audio
  fallback: audio/default.flac
```

### Audio from SQL/API

Use `audio_sql` or `audio_api` with `audio_property` to resolve the audio path dynamically at init time.

### Partial byte-range downloads

Remote audio (S3, HTTPS, GCS) uses partial byte-range downloads by default — only the FLAC header and the estimated segment range are fetched. Multi-hour recordings load in seconds.

This requires **ffmpeg** (via `pydub`). Without ffmpeg, it falls back to downloading and caching the full file. Disable partial downloads with `partial_download=False`.


## Forms

The `form_config` parameter drives the entire form layout. It can be a Python dict, a YAML file path, or embedded in the main config file. Input elements are placed inside a `form:` list, while structural elements remain at the top level.

### Elements

**Top-level elements**

| Element | Description | Key fields |
|---|---|---|
| `title` | Section header. String or `{value, progress_tracker}` | `value`, `progress_tracker` |
| `pass_value` | Copies a column from input to output | `source_column`, `column` |
| `fixed_value` | Constant value in every output row | `column`, `value` |
| `annotation` | Spectrogram interaction tools | `start_time`, `end_time`, `min_frequency`, `max_frequency`, `tools`, `form` |
| `submission_buttons` | Submit, Skip, Prev buttons | `submit`, `next`, `previous` |
| `dynamic_forms` | List of conditional form sections | `- name: [elements]` |

**Input elements** (inside `form:` list)

| Element | Description | Key fields |
|---|---|---|
| `select` | Dropdown. Items from inline list, file, or range. Supports `form:` for conditional sections, `filter_box`, `custom_value`, `not_available` | `label`, `column`, `required`, `items`, `width` |
| `textbox` | Text input. `multiline: true` for textarea | `label`, `column`, `default`, `multiline` |
| `checkbox` | Boolean. `checked_value`/`unchecked_value` for custom values. `checked_form`/`unchecked_form` for conditional sections | `label`, `column`, `checked_value`, `unchecked_value`, `checked_form`, `unchecked_form` |
| `number` | Numeric input | `label`, `column`, `min`, `max`, `step` |
| `break` | Visual break | (no fields) |
| `line` | Horizontal line | (no fields) |
| `text` | Static text | `value` |

### Conditional sections (`dynamic_forms`)

Select items and checkboxes can trigger conditional form sections. `dynamic_forms` is a list of named form sections:

```yaml
form:
    - select:
          label: Is Valid
          column: is_valid
          items:
              - label: 'yes'
                value: 'yes'
              - label: 'no'
                value: 'no'
                form: correction
    - checkbox:
          label: needs review
          column: needs_review
          checked_form: review_form
dynamic_forms:
    - correction:
          - select:
                label: corrected species
                column: corrected_name
                items:
                    path: categories.csv
                    value: common_name
    - review_form:
          - textbox:
                label: reason
                column: review_reason
```

### Annotation tools

| Tool | Interaction | Fields |
|---|---|---|
| `time_select` | Single draggable line | `start_time` |
| `start_end_time_select` | Two constrained lines | `start_time`, `end_time` |
| `bounding_box` | Draggable rectangle | `start_time`, `end_time`, `min_frequency`, `max_frequency` |
| `multibox` | Multiple labeled boxes | Same + per-box form via `annotation.form` |

### Select item features

| Feature | Description |
|---|---|
| `filter_box: true` | Adds a text filter input next to the dropdown |
| `custom_value: true` | Shows "+ Add" button when no exact match |
| `not_available: true` | Prepends a fallback option (string or `{label, value}` dict) |
| `selected::value` | Prefix to mark the default selection |


## Other Parameters

| Parameter | Default | Description |
|---|---|---|
| `project` | `None` | Project file path or dict. No other config params allowed when set. |
| `ident_column` | `''` | Shown first in info card (no label) and capture filenames |
| `project_name` | `None` | Widget header title. Auto-derived from project filename if not set. |
| `project_save_btn` | `False` | *(deprecated — no longer rendered)* |
| `display_columns` | `[]` | Extra columns in the info card |
| `data_columns` | `[]` | Columns for the clip table |
| `duplicate_entries` | `False` | Allow multiple submissions per row |
| `default_buffer` | `3` | Buffer time in seconds |
| `capture` | `True` | Capture button (`False` to hide, string for label) |
| `capture_dir` | `''` | Directory for captures |
| `capture_height` | `None` | Capture image height in pixels. Defaults to `player_height` if not set |
| `spectrogram_resolution` | `[1000, 2000, 4000]` | Image width(s) in px. `selected::` prefix for default |
| `visualizations` | `['linear', 'mel']` | Built-in strings or callables |
| `partial_download` | `True` | Byte-range downloads for remote audio (requires ffmpeg) |
| `width` | `'100%'` | Inline widget width |
| `clip_table_height` | `175` | Clip table height (px) |
| `player_height` | `260` | Player/spectrogram height (px). **Sets spectrogram resolution height.** |
| `info_card_height` | `34` | Info card height (px) |
| `form_panel_height` | `140` | Form panel height (px) |
| `output` | `''` | Output file path. Auto-generated if form is configured |
| `config` | `None` | Path to YAML/JSON config file |
