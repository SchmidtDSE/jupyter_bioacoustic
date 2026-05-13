(projects)=
# Projects

A **project** is a self-contained YAML file that bundles all settings — data source, audio, form, output, and display — into a single file. Projects can be opened from Python or directly from the launcher tile with no code required.


## Project vs Config

Both `project` and `config` load a YAML/JSON file, but they differ in how they handle overrides:

| | `config` | `project` |
|---|---|---|
| Loads YAML/JSON file | Yes | Yes |
| Inline parameter overrides | Yes | No (raises error) |
| `**kwargs` (fixed columns) | Yes | Yes |
| Nested `config:` key | No | Yes |
| Auto-derives `project_name` | No | Yes |
| Positional argument | No | Yes |

`config` is a starting point you can override in Python. `project` is a complete, locked specification — ideal for reproducible workflows and sharing with collaborators.


## Creating a Project File

A project file uses the same schema as the constructor — any parameter can be a top-level key:

```yaml
# projects/my_review.yaml
project_name: My Review
data: data/detections.csv
audio: audio_path
audio_prefix: audio/
ident_column: common_name
data_columns: [common_name, confidence, start_time]
output: outputs/my-reviews.csv
project_save_btn: true

form_config:
    title:
        value: REVIEW
        progress_tracker: true
    select:
        label: Is Valid
        column: is_valid
        required: true
        items: ['yes', 'no']
```


## Nested Config Inheritance

A project file can reference a base config via the `config:` key. The base is loaded first, then project-level keys override:

```yaml
# projects/site-a-review.yaml
project_name: Site A Review
config: config/base-review.yaml
data: data/site-a-detections.csv
output: outputs/site-a-reviews.csv
```

This lets multiple projects share form, audio, and display settings while varying only the data source and output — useful when several team members review different sites with the same schema.


## Splitting Into Multiple Files

For larger projects, settings can be spread across up to three files:

| File | Parameter | Purpose |
|---|---|---|
| **Project** | `project=` | Data, audio, output — things that change per dataset |
| **Config** | `config=` | App behavior: columns, capture, layout, spectrogram settings |
| **Form** | `form_config=` | Form elements, dynamic forms, submission buttons |

```python
ba = BioacousticAnnotator(
    project='projects/my_review.yaml',
)
ba.open()
```

Where the project file itself references the others:

```yaml
# projects/my_review.yaml
project_name: My Review
config: config/review-settings.yaml
data: data/detections.csv
audio: s3://my-bucket/recordings/
output: outputs/reviews.csv
```

The [Config Builder](config-builder) can help create and manage this multi-file structure interactively.


## Opening a Project

**From Python:**

```python
from jupyter_bioacoustic import BioacousticAnnotator

# Positional argument
ba = BioacousticAnnotator('projects/my_review.yaml')
ba.open()

# Fixed output columns are still allowed
ba = BioacousticAnnotator('projects/my_review.yaml', annotator_id=1234)
ba.open()
```

**From the launcher:** Click the Bioacoustic Annotator tile → choose Annotator → select the project file.

**From the command palette:** Search for "Bioacoustic Annotator" to open the launcher dialog.


## Saving a Project

**From Python:**

```python
ba = BioacousticAnnotator(data='detections.csv', audio='test.flac', ...)
ba.save_as_project()                                    # -> projects/<slug>.yaml
ba.save_as_project(filename='my_review.yaml')           # explicit filename
ba.save_as_project(folder='configs', overwrite=True)    # custom folder
```

The saved file contains the **original constructor arguments** — not processed internal state — so the output YAML is directly loadable as a project.

**From the UI:** Enable the save button to allow saving from within the running widget:

```python
ba = BioacousticAnnotator(..., project_save_btn=True)
ba.open()
```

Or with a custom label:

```python
ba = BioacousticAnnotator(..., project_save_btn='Export Config')
ba.open()
```

![TODO: SCREENSHOT OF SAVE PROJECT BUTTON IN FORM PANEL](../../assets/launcher/save-project-btn.png)

Clicking the button shows a path prompt (pre-filled, editable) with overwrite confirmation if the file exists.


