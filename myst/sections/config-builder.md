(config-builder)=
# Config Builder

The Config Builder is an interactive GUI for creating and editing BioacousticAnnotator configuration files. It provides a visual alternative to writing YAML by hand — you fill in form fields, and the builder generates valid project, config, and form files.

![TODO: SCREENSHOT OF CONFIG BUILDER FULL INTERFACE](../../assets/config-builder/overview.png)


## Opening the Config Builder

There are three ways to open the Config Builder:

1. **Launcher tile** — click the Bioacoustic Annotator tile in the JupyterLab launcher, then choose **Config Builder**
2. **Command palette** — search for **"Bioacoustic Config Builder"** in the JupyterLab command palette
3. **Python** — from a notebook cell:

```python
from jupyter_bioacoustic import ConfigBuilder

cb = ConfigBuilder()
cb.open()
```

The Config Builder opens in a full-width JupyterLab tab with its own Python kernel.


## Interface Layout

The Config Builder is split into two panels:

![TODO: SCREENSHOT OF CONFIG BUILDER SHOWING LEFT SECTIONS AND RIGHT YAML PANEL](../../assets/config-builder/layout.png)

**Left panel** — collapsible configuration sections, each representing a group of related settings. Click a section header to expand it. Only one section is open at a time (Ctrl/Cmd+click or double-click to pin a section open).

**Right panel** — a live YAML/documentation viewer. As you fill in fields on the left, the YAML output updates automatically on the right. You can switch between:
- **Docs** — field-level documentation for the currently focused section
- **YAML** — the generated configuration, split into tabs for each output file (project / config / form)

The right panel also supports **direct YAML editing** — click the edit button to modify the YAML directly, then apply changes back to the form fields.


## Configuration Sections

### Configuration File Paths

![TODO: SCREENSHOT OF PROJECT SECTION](../../assets/config-builder/section-project.png)

Set the project name and choose which output files to generate. Each file type has an enable checkbox and a file path:

| File | Purpose |
|---|---|
| **Project** | Data source, audio, output path — things that change per dataset |
| **Config** | App behavior: columns, layout, spectrogram, capture settings |
| **Form** | Form elements, dynamic forms, submission buttons |

You can enable any combination. If only one file is enabled, all settings go into that single file.

**Load existing config** — use the browse button at the top to load an existing YAML file. The builder auto-detects whether it's a project, config, or form file and populates the appropriate sections.


### Data

![TODO: SCREENSHOT OF DATA SECTION](../../assets/config-builder/section-data.png)

Configure the data source:
- **Source type** — choose between file path, URL, SQL query, or API endpoint
- **Path / URL** — the data location (browse button for local files)
- **Columns** — after loading, select which columns to include and drag to reorder
- **Time columns** — map start_time, end_time, or duration columns

The section auto-loads column names when you enter a file path, so you can select from actual column names rather than typing them manually.


### Audio

![TODO: SCREENSHOT OF AUDIO SECTION](../../assets/config-builder/section-audio.png)

Configure the audio source:
- **Source type** — file path, URL, or column name (per-row mode)
- **Prefix / Suffix** — path components joined with the source value
- **Fallback** — default audio file for rows with empty values


### Output

Configure where annotation results are saved:
- **Output path** — local file (CSV, Parquet, or JSONL)
- **Sync URI** — optional remote destination (S3, GCS) for the sync button
- **Sync button** — enable/disable with a custom label


### Application

![TODO: SCREENSHOT OF APP SECTION](../../assets/config-builder/section-app.png)

Display and behavior settings:
- **Identity column** — the primary column shown in the info card
- **Display columns** — additional columns shown as chips (drag to reorder)
- **Capture** — enable spectrogram PNG export with a custom button label
- **Dimensions** — heights for the player, clip table, and form panel
- **Project save button** — allow saving the running config as a project file


### Form

![TODO: SCREENSHOT OF FORM SECTION](../../assets/config-builder/section-form.png)

Build the annotation form interactively:
- **Add elements** — select, textbox, checkbox, number, or annotation tool
- **Configure each element** — label, column name, required flag, items list
- **Dynamic forms** — conditional sections that appear based on select values or checkbox state
- **Submission buttons** — customize button labels

Each form element is shown as a card that can be reordered, edited, or removed.

![TODO: SCREENSHOT OF FORM ELEMENT CARD WITH SELECT CONFIGURATION](../../assets/config-builder/form-element.png)


### Config Summary

At the top of the left panel, a collapsible **summary** shows the current configuration at a glance — data source, audio, output, and a compact view of all form elements with their types and settings.


## Target File Chooser

Each section (except Configuration File Paths) has a **target file selector** in its header — a dropdown that controls which output file the section's settings are written to.

![TODO: SCREENSHOT OF TARGET FILE SELECTOR DROPDOWN](../../assets/config-builder/target-selector.png)

For example, you might put `data` and `audio` in the **project** file but `form` settings in a separate **form** file. The available options depend on which file types are enabled in the Configuration File Paths section.


## Validation

Click **Validate** in the bottom toolbar to check the configuration for common issues:
- Missing required fields (data, audio)
- Form elements without column names
- Dynamic form references that don't match any defined dynamic form
- Orphaned dynamic forms not referenced by any element

Errors and warnings appear in the status bar at the top.


## Saving

Click **Save Configuration Files** to write all enabled files to disk. The builder uses the paths defined in the Configuration File Paths section and creates any necessary directories.

Individual files can also be saved from the YAML panel — switch to the file tab you want and click Save.


## Secrets

The Data, Audio, and Output sections each include a **secrets editor** for authentication credentials:

| Value format | Behavior |
|---|---|
| `env:VAR_NAME` | Reads from environment variable |
| `dialog` | Prompts the user interactively |
| Anything else | Used as a literal value |

Secrets are stored as `{key, value}` pairs in the configuration file. A global secrets section is also available for credentials shared across data and audio.


## Workflow Example

A typical Config Builder workflow:

1. Open the Config Builder from the launcher tile
2. Set a project name (e.g. "Bird Review") — file paths auto-generate
3. In **Data**, browse to your CSV file — columns load automatically
4. In **Audio**, set the source type and path (or column for per-row audio)
5. In **Output**, set the output file path
6. In **Form**, add a select element for species validation, configure items
7. Click **Validate** to check for issues
8. Click **Save Configuration Files** to write the YAML files
9. Open the project from the launcher's **Annotator** tile or from Python:

```python
from jupyter_bioacoustic import BioacousticAnnotator

ba = BioacousticAnnotator('projects/bird-review.yaml')
ba.open()
```
