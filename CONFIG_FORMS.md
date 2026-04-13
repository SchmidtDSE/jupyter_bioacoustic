# Configurable Forms — JupyterBioacoustic

## Overview

Form layout and fields are controlled by a **form config** — a YAML (or JSON) document, or a plain Python dict. When no form config is provided the widget generates sensible defaults that replicate the current hardcoded behaviour.

There are two form types:

| Form type | Triggered by | Widget title |
|---|---|---|
| **Review** | `is_valid_form` key present in config | Bioacoustic Reviewer |
| **Annotate** | `annotate_form` key present in config | Bioacoustic Annotator |

`detection_id` (the `id` from the selected row) is **always** written to the output automatically — it does not need to appear in the form config.

---

## Loading a form config

### Option 1 — standalone file passed to `form_config`

```python
JupyterAudio(
    data='detections.csv',
    audio_path='test.flac',
    form_config='form.yaml',       # path to YAML or JSON file
).open()
```

### Option 2 — Python dict passed to `form_config`

Useful during development or when generating the config programmatically.

```python
JupyterAudio(
    data='detections.csv',
    audio_path='test.flac',
    form_config={
        'annotate_form': [
            {'select': {'label': 'species', 'column': 'common_name',
                        'items': ['Robin', 'Wren', 'Blackbird']}},
        ],
        'submission_buttons': {'next': {'label': 'Skip'}, 'submit': True},
    },
).open()
```

### Option 3 — embedded in the main config file

Add a `form_config:` key directly inside `config.yaml`. Explicit `form_config` argument (options 1 or 2) always takes precedence.

```yaml
# config.yaml
data: detections.csv
audio_path: test.flac
category_path: categories.csv
output: observations.jsonl

form_config:
  is_valid_form:
    - is_valid_select: true
    - textbox:
        label: notes
  submission_buttons:
    next:
      label: Skip
    submit:
      label: Verify
```

---

## Form structure

### Review form

A review form may contain up to four top-level sections, all optional except `is_valid_form`:

```
is_valid_form     ← always visible; must contain one is_valid_select element
yes_form          ← shown only when is_valid = yes value; hidden otherwise
no_form           ← shown only when is_valid = no value; hidden otherwise
submission_buttons
```

### Annotation form

An annotation form has two sections:

```
annotate_form     ← always visible
submission_buttons
```

---

## Element reference

All non-static elements share a set of common fields. Element-specific fields follow.

### Common fields

```yaml
label: 'Label Text'         # display label; used as column name if column is omitted
column: 'output_col_name'   # column written to output file; defaults to label
default: null               # initial value (overridden by source_value if provided)
required: false             # if true, submit button disabled until value is set
                            # NOTE: is_valid_select is required by default
source_value: 'col_name'    # pre-populate from this column of the selected input row
                            # takes precedence over default
width: null                 # optional CSS width (int = px, string = CSS value)
height: null                # optional CSS height (int = px, string = CSS value)
```

> **Note:** when `column` is omitted the `label` string is used as-is as the output column name. If the label contains spaces or special characters this produces awkward column names — specify `column` explicitly in those cases.

---

### textbox

A single-line or multiline text input.

```yaml
textbox:
  label: notes
  column: notes
  multiline: false          # true → <textarea>, false → <input type="text">
```

---

### select

A dropdown menu. The `items` field controls what populates it.

#### Inline list — value only

Values and display labels are identical.

```yaml
select:
  label: confidence
  column: verification_confidence
  items:
    - low
    - medium
    - high
```

#### Inline list — value + label

```yaml
select:
  label: confidence
  column: verification_confidence
  items:
    - low: Low confidence
    - medium: Medium confidence
    - high: High confidence
```

#### From a plain text file

One value per line, or `value, label` per line (comma-separated).

```yaml
select:
  label: species
  column: common_name
  items: path/to/species.txt
```

Equivalently:

```yaml
select:
  label: species
  column: common_name
  items:
    path: path/to/species.txt
```

#### From a structured file (CSV / Parquet / JSONL / YAML)

```yaml
select:
  label: species
  column: common_name
  items:
    path: categories.csv
    value: common_name      # column to use as option value
    label: display_name     # column to use as display label (defaults to value column)
```

Supported file formats: `.csv`, `.parquet`, `.jsonl`, `.ndjson`, `.yaml`, `.yml`.
For YAML files the expectation is a mapping where each key named by `value`/`label` holds a list.

#### Integer range

```yaml
select:
  label: rank
  column: rank
  items:
    min: 1      # default 0
    max: 5      # required; presence of max signals a range
    step: 1     # default 1
```

---

### checkbox

A single checkbox. Writes `true`/`false` by default; custom values can be specified.

```yaml
checkbox:
  label: flagged
  column: flagged
  yes_value: true     # written when checked   (default true)
  no_value: false     # written when unchecked (default false)
```

---

### number

A numeric input mirroring HTML `<input type="number">` behaviour.

```yaml
number:
  label: observer count
  column: observer_count
  min: 0
  max: 100
  step: 1
  value: 1            # initial value
  placeholder: ''
```

---

### is_valid_select

A special select element tied to the review workflow. It must appear exactly once inside `is_valid_form`. When the user selects yes/no, the corresponding `yes_form`/`no_form` section is shown or hidden. `is_valid_select` is **required by default** (submit is disabled until a value is chosen).

Simplest form — defaults to labels/values `yes`/`no`, output column `is_valid`:

```yaml
- is_valid_select: true
```

Custom yes/no strings (used as both label and value):

```yaml
- is_valid_select:
    yes: confirmed
    no: rejected
```

Custom label and value independently:

```yaml
- is_valid_select:
    column: valid_flag     # output column (default: is_valid)
    yes:
      label: 'Yes, correct'
      value: 1
    no:
      label: 'No, wrong'
      value: 0
```

---

### time_select

A numeric input populated and updated by clicking on the spectrogram. Each spectrogram click updates every `time_select` field in the currently visible form.

```yaml
- time_select:
    label: signal start (s)
    column: signal_start_time
    init_value: start_time    # string → column name from selected row
                              # number → literal initial value
```

---

## Static elements

Static elements can appear inside any form section, including `submission_buttons`.

```yaml
- break: true            # inserts a line break before the next element
- line: true             # inserts a horizontal divider
- text: 'Explanatory text goes here.'
- text: |
    Multi-line text is supported.
    Wrap with the YAML block scalar (|).
```

---

## Submission buttons

`submission_buttons` is a mapping (not a list). The three button types are `previous`, `next`, and `submit`. Omit any you do not want. Static elements (`line`, `break`, `text`) may also appear here.

```yaml
submission_buttons:
  line: true               # divider above the buttons
  previous: true           # go back without writing
  next:
    label: Skip            # go forward without writing
    icon: true             # show arrow icon (default true)
  submit:
    label: Verify          # write form values and go forward
    icon: true             # show checkmark icon (default true)
```

Shorthand `true` uses all defaults for that button type:

```yaml
submission_buttons:
  previous: true
  next: true
  submit: true
```

---

## Complete examples

### Default review form (replicates current hardcoded behaviour)

```yaml
is_valid_form:
  - is_valid_select: true
  - textbox:
      label: notes
      column: notes
  - time_select:
      label: signal_start (s)
      column: signal_start_time
      init_value: start_time

no_form:
  - select:
      label: verified name
      column: verified_common_name
      items:
        path: categories.csv
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

### Default annotation form (replicates current hardcoded behaviour)

```yaml
annotate_form:
  - select:
      label: common_name
      column: common_name
      items:
        path: categories.csv
        value: common_name
  - select:
      label: confidence
      column: confidence
      items:
        - low
        - medium
        - high
  - textbox:
      label: notes
      column: notes
  - time_select:
      label: start_time (s)
      column: start_time
      init_value: start_time

submission_buttons:
  line: true
  next:
    label: Skip
  submit:
    label: Submit
```

### Minimal review form (no yes/no subforms, no category file)

```yaml
is_valid_form:
  - is_valid_select: true
  - textbox:
      label: notes

submission_buttons:
  next:
    label: Skip
  submit:
    label: Verify
```

---

## Changes from the original specification

The following minor changes were made to improve consistency and correctness. Each is marked below with the reason.

---

**Change 1 — Form sections are YAML lists, not mappings**

> **Original:** Form sections were shown as mappings (dicts), which would require duplicate keys (e.g. two `select:` entries) — invalid in YAML.
> **Change:** All form sections (`is_valid_form`, `yes_form`, `no_form`, `annotate_form`) are YAML sequences (lists). Each item is a single-key mapping: `- element_type: config`.

```yaml
# ✗ original — invalid YAML (duplicate select keys)
no_form:
  select:
    label: verified name
  select:
    label: confidence

# ✓ changed — valid YAML list
no_form:
  - select:
      label: verified name
  - select:
      label: confidence
```

---

**Change 2 — `is_valid: true` → `is_valid_select: true`**

> **Original:** The "putting it all together" example used `is_valid: true` inside `is_valid_form`, inconsistent with the `is_valid_select` element type defined elsewhere.
> **Change:** The element is always named `is_valid_select` everywhere, including inside `is_valid_form`.

```yaml
# ✗ original — inconsistent key
is_valid_form:
  is_valid: true

# ✓ changed — consistent with element type name
is_valid_form:
  - is_valid_select: true
```

---

**Change 3 — `select` file items always go under `items:`**

> **Original:** The "current form equivalent" example placed `path:`, `value:`, `label:` as direct keys of `select:` rather than nested under `items:`. The select type definition placed them under `items:`. Inconsistent.
> **Change:** All item configuration (inline lists, file paths, ranges) always goes under the `items:` key.

```yaml
# ✗ original — path/value as direct select keys
select:
  label: verified name
  path: categories.csv
  value: common_name

# ✓ changed — path/value nested under items
select:
  label: verified name
  column: verified_common_name
  items:
    path: categories.csv
    value: common_name
```
