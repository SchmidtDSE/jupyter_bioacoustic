(overview)=
# Overview

## BioacousticAnnotator


```{figure} ../../assets/app/inline_standalone.png
:class: bordered
```

The jupyter-bioacoustic `BioacousticAnnotator` has minimal interface:

```python
from jupyter_bioacoustic import BioacousticAnnotator

ba =  BioacousticAnnotator(...)
````

- `ba.open()`: opens the application within the notebook itself. alternatively, `ba.open(inline=False)` will open the app as a stand-alone application in a new tab.
- `ba.source`: returns the input data as a dataframe 
- `ba.output()`: returns the output data as a dataframe. the data is by default only re-loaded if an update has been made. The user can force a reload `ba.output(force=True)`. Note this is useful if the output data is modified externally. 

---

The app itself is composed of 3 distinct components: 

1. [Clip Table](clip-table): for selecting, sorting, filtering audio-clips
2. [Player and Visulizer](player-and-visulizer): for playing, visualizing, and annotating clips
3. [Form and Panel](form-and-panel): for data collection and model review of the selected clip

---

### Clip Table

```{figure} ../../assets/list/filtered.png
:class: bordered
```

The clip table displays your input data as a sortable, paginated table. Click any row to load its audio. Features include:

- **GUI filter builder** — select a column, operator, and value to filter. Multiple filters combine with AND logic.
- **Sortable** — Sort on any column by clicking on its column-name
- **View modes** — toggle between `pending`, `reviewed`, and `all` rows (when duplicate prevention is enabled)
- **Keyboard navigation** — Up/Down to highlight and Enter to select, or Left/Right to select the previous/next clip
- **Customizable** - order and select columns of interest (defaults to all columns in the dataset)

---

### Player and Visulizer

```{figure} ../../assets/vis/spectrogram-playing.png
:class: bordered
```

The spectrogram player renders each audio clip as an interactive spectrogram with playback controls:

- **Visualization type** — switch between linear STFT, mel, log-frequency, or [custom visualizations](params) from a dropdown
- **Resolution** — select rendering resolution from the [`spectrogram_resolution`](params) dropdown
- **Buffer** — adjustable time padding before and after each clip
- **Zoom** — `+`/`-`/`0` keys, zoom-to-selection box (⬚), click-and-drag to pan
- **Playback** — play/pause with Space, restart with Shift+Space, drag the playhead to scrub
- **Capture** — save the selected visualization as a PNG
- **Customizable** - configure availabe configuration types, resolutions and default buffer. for the selected clip, specifiy which values to display 

---

### Form Panel

```{figure} ../../assets/form_panel/multibox.png
:class: bordered
```

The form panel can be easily configured to contain the simplest to the most complex forms for species labeling, time/frequency annotations, reviewing model predictions, and much more:

- **Robust** there are many options for collecting data:
	- `select`: creat simple dropdown box, source by short inline list or offering 100's of options loaded through external file. Optionally all users to filter list by typing in values, and/or save custom values
	- `textbox`: for collect short or log textual inputs
	- `checkbox`: for true/false inputs
	- `spectrogram-annotations`: the user is optionally able to draw a bounding box, mark the start/end_time, as single time marker or draw multiple bounding boxes.
	- `pass_value`: for passing values (unedited) from source to output. This is useful for, say, taking and `id` column in the source row and passing it to a `source_id` column in the output file. 
- **Dynamic**: additional form fields may be added based on responses from previous fields 
- **Strict**: fields can be optionally requied. 
- **Simple**: Even complex forms can be created using simple yaml configuration files
- **Syncing**: Optionally add a `sync-btn` to push local annotation files to remote storage (such as `s3` and `GCS`).

Note that, by default, the app will not allow for a row to be reviewed twice.  However the option to delete an existing review and re-review it is possible

```{figure} ../../assets/form_panel/reviewed.png
:class: bordered
```
