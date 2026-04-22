(usage)=
# Quick Example

The `JupyterAudio` class has a simple interface: two methods (`.open()`, `.output()`) and one property (`.source`).

## Visualizer Mode

Without a form config, the widget is a pure audio browser — browse clips, play audio, view spectrograms.

```python
from jupyter_bioacoustic import JupyterAudio

JupyterAudio(
    data='detections.csv',
    audio='recording.flac',
).open()
```

![Inline visualizer with no form](../../assets/app-inline.png)

By default, the widget embeds below the cell. Set `inline=False` to open it as a split-right panel instead, giving you more screen space while keeping the notebook visible.

![App has inline and panel views](../../assets/app-inline-panel.png)

## With a Form

Add a `form_config` to collect data or validate existing results like model outputs. The form layout is driven entirely by YAML — selects (with conditional form sections based on user selection), textboxes, checkboxes, and progress tracking.

```python
ja = JupyterAudio(
    data='detections.csv',
    audio='recording.flac',
    ident_column='common_name',
    form_config='form-review.yaml',
    output='reviews.csv',
)
ja.open()
```

![Form-based workflow](../../assets/app-review.png)

Each submission appends a row to the output file. Access results programmatically at any time:

```python
ja.output()     # returns a DataFrame of all reviewed rows
ja.source       # the original input DataFrame
```

![Access source and output data directly](../../assets/analysis-county.png)

## Config Files

For reproducibility, all parameters can be moved to a YAML config file:

```python
JupyterAudio(data='detections.csv', config='config.yaml').open()
```

```yaml
# config.yaml
audio: recording.flac
ident_column: common_name
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
  correction_form:
    - select:
        label: verified name
        column: verified_common_name
        items: [sparrow, owl, warbler]
  submission_buttons:
    submit:
      label: Verify
    next:
      label: Skip
output: reviews.csv
```

This keeps notebooks clean and makes it easy to share configurations across team members.
