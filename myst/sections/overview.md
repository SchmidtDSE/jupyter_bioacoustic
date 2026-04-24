(overview)=
# Overview

## The API

`jupyter_bioacoustic` has a single class with a minimal interface:

```{embed} myst:api-overview
:remove-output: true
```

That's it — one class, two methods, one property. All configuration is handled through constructor parameters or a YAML/JSON config file.

Parameters and config files are interchangeable. A config file is equivalent to:

```python
import yaml
config = yaml.safe_load(open('config.yaml'))
ba = BioacousticAnnotator(**config)
```

This makes it easy to share configurations between users and projects while keeping notebooks clean.


## The Interface

The widget is composed of three main sections:

### Clip Table

![TODO: SCREENSHOT OF CLIP TABLE](../../assets/app-review-filter.png)

The clip table displays your input data as a sortable, paginated table. Click any row to load its audio. Features include:

- **GUI filter builder** — select a column, operator, and value to filter. Multiple filters combine with AND logic.
- **View modes** — toggle between `pending`, `reviewed`, and `all` rows (when duplicate prevention is enabled)
- **Keyboard navigation** — Up/Down to highlight, Enter or Left/Right to select

The columns shown are controlled by the [`data_columns`](params) parameter. By default, all columns from the data are displayed.


### Spectrogram Player

![TODO: SCREENSHOT OF PLAYER](../../assets/spectrogram-2.png)

The spectrogram player renders each audio clip as an interactive spectrogram with playback controls:

- **Visualization type** — switch between plain STFT, mel, log-frequency, or [custom visualizations](params) from a dropdown
- **Resolution** — select rendering resolution from the [`spectrogram_resolution`](params) dropdown
- **Buffer** — adjustable time padding before and after each clip
- **Zoom** — `+`/`-`/`0` keys, zoom-to-selection box (⬚), click-and-drag to pan
- **Playback** — play/pause with Space, restart with Shift+Space
- **Capture** — save the current view as a PNG

The frequency axis shows kHz labels that update correctly for all visualization scales. Editable time/frequency bounds allow precise navigation.


### Form Panel

![TODO: SCREENSHOT OF FORM](../../assets/form-review-no.png)

The form panel is driven entirely by YAML configuration. It can be used for:

- **Data collection** — species labeling, time/frequency annotation
- **Validation** — confirm or reject model predictions with conditional correction forms

Form elements include selects (with filter box, custom values, and conditional sections), textboxes, checkboxes, numbers, and annotation tools. See [Parameters & Configuration](params) for the full reference and [Form Examples](form-examples) for progressively complex configurations.

On submit, a row is appended to the [`output`](params) file. Results are accessible via `ba.output()`.
