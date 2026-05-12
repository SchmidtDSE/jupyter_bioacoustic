(config-builder)=
# Config Builder

```{figure} ../../assets/config-builder/overview.png
:class: bordered
```

The Config Builder is an interactive GUI for creating and editing BioacousticAnnotator configuration files. Instead of writing YAML by hand, you fill in form fields and the builder generates valid project, config, and form files — ready to launch an annotator session.

There are three ways to open it:

1. **Launcher tile** — click the Bioacoustic Annotator tile in the JupyterLab launcher, then choose **Config Builder**
2. **Command palette** — search for **"Bioacoustic Config Builder"**
3. **Python** — `ConfigBuilder().open()` from a notebook cell

The Config Builder opens in a full-width JupyterLab tab with its own Python kernel.

---

The builder is composed of 7 distinct components:

1. [Setup](#setup-section) — project identity, output file paths, and an optional description panel
2. [Data](#data-section) — clip source table, columns, and time mapping
3. [Audio](#audio-section) — audio file paths, URLs, or per-row column references
4. [Output](#output-section) — annotation result file and optional remote sync
5. [Application](#app-section) — widget layout, columns, capture, and dimensions
6. [Form](#form-section) — annotation interface controls, dynamic forms, and submission buttons
7. [Side Panel](#side-panel) — live documentation, generated YAML, and direct editing

Each section on the left is collapsible — click a header to expand it. Only one section is open at a time. **Ctrl/Cmd+click** or **double-click** to pin a section open (indicated by a lighter toggle-bar background).

---

(setup-section)=
### Setup

```{figure} ../../assets/config-builder/section-setup.png
:class: bordered
```

Set the **project name** (used as the widget header title and to auto-generate file paths) and configure which output files to create.

**Configuration File Paths** — enable or disable each file type with a checkbox. With all three enabled, files reference each other in a chain: project → config → form. Uncheck a file to inline its contents into the parent. If you only need a single file, uncheck the others and everything is combined.

| File | Purpose |
|---|---|
| **Project** | Data sources, audio paths, output locations — things unique to this review task |
| **Config** | App behavior, column layout, capture, dimensions — shared across projects |
| **Form** | Annotation controls, dynamic forms, submission buttons — reusable form definitions |

**Load existing config** — browse for an existing YAML file. The builder auto-detects whether it is a project, config, or form file and populates the appropriate sections.

**Description Panel** — optionally add a collapsible description section to the top of the annotator for project context, reviewer instructions, or general guidance. Provide markdown text directly or reference a `.md` file.

---

(data-section)=
### Data

```{figure} ../../assets/config-builder/section-data.png
:class: bordered
```

Configure the clip source:

- **Source type** — file path, URL, SQL query, or API endpoint
- **Path / URL** — data location with browse support for local files
- **Columns** — select which columns to include and drag to reorder (auto-populated after loading)
- **Time columns** — map `start_time`, `end_time`, or `duration` columns from your data

The section auto-loads column names when you enter a valid file path.

---

(audio-section)=
### Audio

```{figure} ../../assets/config-builder/section-audio.png
:class: bordered
```

Configure the audio source:

- **Source type** — single file path, URL, or a per-row column from the data table
- **Value** — the file path, URL, or column name depending on source type
- **Prefix / Suffix** — joined with the source value to build full audio paths
- **Fallback** — default audio file when a per-row column value is empty

---

(output-section)=
### Output

Configure where annotation results are saved:

- **Path** — local output file (CSV, Parquet, or JSONL)
- **Sync URI** — optional remote destination (S3, GCS) with a sync button
- **Sync button** — enable/disable with a custom label
- **Recursive** — write output after every submission instead of waiting for session end

---

(app-section)=
### Application

```{figure} ../../assets/config-builder/section-app.png
:class: bordered
```

Widget layout and behavior:

- **Identity column** — primary column shown in the info card and used for capture filenames
- **Display columns** — additional info-card columns (drag to reorder)
- **Project save button** — allow users to save the running config as a project file
- **Duplicate entries** — permit multiple submissions per row
- **Buffer** — seconds of context before/after each audio clip
- **Capture** — enable spectrogram PNG export
- **Width** — widget width (pixels or percentage)
- **Heights** — pixel heights for clip table, player, info card, and form panel

---

(form-section)=
### Form

```{figure} ../../assets/config-builder/section-form.png
:class: bordered
```

Build the annotation interface interactively:

- **Add elements** — click `+ select`, `+ textbox`, `+ checkbox`, `+ number`, `+ annotation`, or other element types
- **Configure each element** — set label, output column, items, validation, and other options per-type
- **Dynamic forms** — conditional sections triggered by select values or checkbox state
- **Submission buttons** — customize submit/skip/back button labels

Each element is shown as a card that can be reordered, edited, or removed. The [side panel](#side-panel) docs highlight the relevant element type as you interact.

---

(side-panel)=
### Side Panel

```{figure} ../../assets/config-builder/side-panel.png
:class: bordered
```

The right-hand panel provides two views:

**Docs** — field-level documentation for the currently active section. As you interact with fields on the left, the corresponding doc card highlights with a blue left border. Documentation is organized with subsections matching the builder layout.

**YAML** — the generated configuration, split into tabs for each output file (project / config / form). Updates live as you edit fields. Supports two modes:

- **Read mode** — view the generated YAML
- **Edit mode** — modify YAML directly and apply changes back to the form fields

---

## Target File Chooser

Each section (except Setup) has a **target file selector** in its header that controls which output file receives the section's settings.

For example, you might route `data` and `audio` to the **project** file while keeping `form` in a separate **form** file. Available targets depend on which files are enabled in Setup.

---

## Validation

Click **Validate** in the bottom toolbar to check for:

- Missing required fields (data source, audio)
- Form elements without output column names
- Dynamic form references that don't match any defined section
- Orphaned dynamic forms not referenced by any element

Errors and warnings appear in the status bar.

---

## Saving

Click **Save Configuration Files** to write all enabled files to disk using the paths from Setup. Directories are created automatically.

Individual files can also be saved from the YAML panel — select the file tab and click Save.

---

## Secrets

The Data, Audio, Output, and Application sections each include a **secrets editor** for credentials:

| Value format | Behavior |
|---|---|
| `env:VAR_NAME` | Read from environment variable |
| `dialog` | Prompt the user interactively at runtime |
| Anything else | Used as a literal value |

Secrets are stored as `{key, value}` pairs. Section-level secrets override global secrets (defined in Application) with the same key. Secrets in the **Application** section are available to all other sections.

---

## Workflow

1. Open the Config Builder from the launcher tile
2. Set a project name — file paths auto-generate
3. **Data** — browse to your CSV, select columns
4. **Audio** — set source type and path
5. **Output** — set the annotation output file
6. **Form** — add elements (select, textbox, annotation tools, etc.)
7. **Validate** — check for issues
8. **Save** — write the YAML files
9. Launch the annotator:

```python
from jupyter_bioacoustic import BioacousticAnnotator

ba = BioacousticAnnotator('config/projects/my_project.yaml')
ba.open()
```
