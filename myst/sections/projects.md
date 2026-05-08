(projects)=
# Projects and Launcher

## Projects

A **project** is a self-contained configuration file that bundles all settings into a single YAML file. Projects can be opened from Python or directly from the JupyterLab launcher tile — no code required.

### Project vs Config

Both `project` and `config` load a YAML/JSON file, but they differ in how overrides work:

| | `config=` | `project=` |
|---|---|---|
| Loads YAML/JSON file | Yes | Yes |
| Inline parameter overrides | Yes | No (raises error) |
| `**kwargs` (fixed columns) | Yes | Yes |
| Nested `config:` key | No | Yes |
| Auto-derives `project_name` | No | Yes |
| Positional argument | No | Yes |

`config` is a starting point you can override. `project` is a complete specification.

### Creating a project file

A project file uses the same schema as a config file — any constructor parameter can be a key:

```yaml
# projects/my_review.yaml
project_name: My Review
data: data/detections.csv
audio: audio_path
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

### Nested config inheritance

A project file can reference a base config via the `config:` key. The base is loaded first, then project keys override:

```yaml
# projects/site-a-review.yaml
project_name: Site A Review
config: config/base-review.yaml
data: data/site-a-detections.csv
output: outputs/site-a-reviews.csv
```

This lets multiple projects share form, audio, and display settings while varying only the data source and output.

### Opening a project

```python
from jupyter_bioacoustic import BioacousticAnnotator

ba = BioacousticAnnotator('projects/my_review.yaml')
ba.open()

# Fixed output columns are still allowed
ba = BioacousticAnnotator('projects/my_review.yaml', annotator_id=1234)
ba.open()
```


### Saving a project

From Python:

```python
ba = BioacousticAnnotator(data='detections.csv', audio='test.flac', ...)
ba.save_as_project()                                    # -> projects/<slug>.yaml
ba.save_as_project(filename='my_review.yaml')           # explicit filename
ba.save_as_project(folder='configs', overwrite=True)    # custom folder
```

The saved file contains the **original constructor arguments** — not processed internal state — so the output YAML is directly loadable as a project.

From the UI, enable the save button:

```python
BioacousticAnnotator(..., project_save_btn=True).open()
BioacousticAnnotator(..., project_save_btn='Export Config').open()
```

Clicking the button shows a path prompt (pre-filled, editable) with overwrite confirmation if the file exists.

---

## Launcher Tile

The JupyterLab launcher includes a **Bioacoustic Annotator** tile under "Other" that opens a project without writing code.

### Workflow

1. Click the **Bioacoustic Annotator** tile in the launcher
2. A file browser dialog opens — navigate to a `.yaml`, `.yml`, or `.json` project file
3. A standalone Python kernel starts (no notebook is created)
4. The widget opens in a full-width main tab
5. When the tab is closed, the standalone kernel shuts down automatically

### Path resolution

The launcher resolves paths relative to the file browser's current directory. Navigate to the project's root directory in the file browser before clicking the tile so that relative paths inside the project file (e.g. `data: data/detections.csv`) resolve correctly.

### Kernel behavior

- If a notebook is already open, the launcher reuses its kernel
- Otherwise a new standalone kernel is started
- Standalone kernels are owned by the widget and shut down on close
- Multiple launcher tabs each get their own kernel

The command is also available in the JupyterLab command palette as **"Bioacoustic Annotator"**.

---

## Notebook vs Launcher

| | Notebook | Launcher tile |
|---|---|---|
| Opens from | Python cell | Launcher / command palette |
| Kernel | Notebook kernel (shared) | Standalone or reuses notebook kernel |
| Widget placement | Inline or split-right | Full-width main tab |
| Requires notebook | Yes | No |
| Config method | Any (args, config, project) | Project file only |
| Kernel lifecycle | Managed by notebook | Shut down when tab closes |
