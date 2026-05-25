(projects)=
# Projects

A `project` is a self-contained YAML file that bundles all settings — data source, audio, form, output, and display — into a single file. Projects can be opened from Python or directly from the launcher tile with no code required.

## Project vs Config

Functionally, the main difference between a `project` and a `config` is that a project is **required** to be a complete specification and it doesn't allow overrides.

The importance of a `project` is that it allows the user to fully specify both data sources, such a a clip meta data and audio files, while reusing a configuration file that might be used for many different sets of data sources.

Consider the following

```python
ba1 = BioacousticAnnotator(
    audio='path/to/audio-1.flac',
    data='path/to/clip-meta-1.csv',
    config='path/to/config.yaml')

ba2 = BioacousticAnnotator(
    audio='path/to/audio-2.flac',
    data='path/to/clip-meta-2.csv',
    config='path/to/config.yaml')

ba3 = BioacousticAnnotator(
    audio='path/to/audio-3.flac',
    data='path/to/clip-meta-3.csv',
    info_card_title='[[species]]',
    config='path/to/config.yaml')
```

Here `ba1` and `ba2` use a single configuration. `ba3` also uses the same configuration, however we have overwritten the `display_columns` contained in `path/to/config.yaml`.

Alternatively `projects` we could have done this:

```yaml
# path/to/project-1
audio: 'path/to/audio-1.flac'
data: 'path/to/clip-meta-1.csv'
config: 'path/to/config.yaml'
```

```yaml
# path/to/project-2
audio: 'path/to/audio-2.flac'
data: 'path/to/clip-meta-2.csv'
config: 'path/to/config.yaml'
```

```yaml
# path/to/project-3
audio: 'path/to/audio-3.flac'
data: 'path/to/clip-meta-3.csv'
info_card_title: '[[species]]'
config: 'path/to/config.yaml'
```

```python
ba1 = BioacousticAnnotator('path/to/project-1.yaml')    # project is the first parameter and can be used positionally
ba2 = BioacousticAnnotator(project='path/to/project-2.yaml')
ba3 = BioacousticAnnotator(project='path/to/project-3.yaml')
```

Some of the advantages of this approach over a pure `config` + _in-cell-notebook-overrides_ are:

- Annotators for projects can be opened from the launcher tile, a great option during data collection when no data selection, filtering, processing or training is needed.
- YAML files are easier to read than python
- Cleaner notebooks, and avoiding users from re-running the same notebook over and over changing one or two lines, creating a permenant record of the configurations used
- Makes it easier to transfer the setup to new research-projects

As mentioned user project configurations do not allow overrides. Note however that `**kwargs` (values passed directly to the output file) are still allowed.  For example:

```python
# raises an error
BioacousticAnnotator(audio='new_audio.flac', project='path/to/project-2.yaml')

# does not raise an error
BioacousticAnnotator(reviewer='brookie', project='path/to/project-2.yaml')
```

## Creating a Project File

A project file uses the same schema as the constructor — any parameter can be a top-level key:

```yaml
# projects/my_review.yaml
project_name: My Review
data: data/detections.csv
audio: audio_path
audio_prefix: audio/
info_card_title: '[[common_name]]'
display_columns: [common_name, confidence, start_time]
output: outputs/my-reviews.csv

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



