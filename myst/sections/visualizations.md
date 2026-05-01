(visualizations)=
# Visualizations

```{figure} ../../assets/vis/spectrogram-playing.png
:class: bordered
```

The spectrogram player renders each audio clip as an interactive visualization. Switch between visualization types from the dropdown, adjust resolution, buffer, zoom, and capture the current view as a PNG.


## Built-in Visualizations


Five visualization types are included and can be referenced by string name in the `visualizations` parameter:

| Name | Description |
|---|---|
| `'linear'` (or `'spectrogram'`) | Linear-frequency STFT magnitude spectrogram |
| `'mel'` | Mel-scale spectrogram — compresses the frequency axis to better match human auditory perception |
| `'log_frequency'` | Log-frequency spectrogram — more visual detail at lower frequencies, similar to a constant-Q transform |
| `'bandpass'` | Bandpass spectrogram focused on 1–8 kHz (typical birdsong range) |
| `'waveform'` | Time-domain waveform plot (amplitude vs. time, not a spectrogram) |



```{embed} nb.vis.1.built_in
```

The first item in the list is the default. Use `selected::` prefix to override the default (e.g. `['linear', 'selected::mel', 'log_frequency']`).


## Capture

The capture button saves the current spectrogram/visualization as a PNG file. Configure it with:

- `capture: True` — show the button with default label
- `capture: 'Save Spectrogram'` — custom button label
- `capture: False` — hide the button
- `capture_dir: 'spectrograms'` — output directory for captures

```python
BioacousticAnnotator(
    data='detections.csv',
    audio='recording.flac',
    capture='Save Spectrogram',
    capture_dir='spectrograms',
).open()
```

Filenames are auto-generated from the `ident_column` value (if set), timestamp, and visualization type.


## Standalone Usage

The visualization functions in `jupyter_bioacoustic.utils.visualizations` can be used outside the widget — for analysis, figures, or custom pipelines.


```{embed} nb.vis.2.standalone
```

The `vis.plot()` helper renders any visualization dict as a matplotlib figure. It handles dB normalization, colormap rendering, and frequency-axis tick labels for linear, mel, and log scales.

Available functions: `vis.spectrogram()`, `vis.mel()`, `vis.log_frequency()`, `vis.bandpass()`, `vis.waveform()`.

`vis.render_png(matrix, width, cmap, dynamic_range_db)` converts a raw 2D matrix to PNG bytes — useful when building custom visualizations that need colormap control without full matplotlib layout.


## Custom Visualizations

Custom visualization functions can be passed directly to the `visualizations` parameter alongside built-in names. Each function must have the signature `(mono, sr, width)` and returns a dict with  `freq_min`, `freq_max`, `freq_scale` and either 

- **`matrix`** — a 2D numpy array (freq × time). The widget renders it automatically with dB normalization.
- **`png_bytes`** — raw PNG image bytes for full rendering control.

Both forms require `freq_min`, `freq_max`, and `freq_scale` (`'linear'`, `'mel'`, or `'log'`). Matrix returns can optionally include `matrix_scale: 'db'` to skip the dB conversion.

```python
def my_custum_vis(mono: np.ndarray, sr: float, width: int) -> dict:
    ...
    return {
        'freq_min':  ...,    # min frequency
        'freq_max':  ...,    # max frequency
        'freq_scale':  ...,  # frequency scale: one of linear, mel, or log
        'png_bytes': ...,    # [Required if matrix is None] raw PNG image bytes
        'matrix': ...,       # [Required if png_bytes is None] a 2D numpy array (freq × time)
        'matrix_scale': ..., # [Optional] db or None - only works with 'matrix'
    }
```

--- 

**Matrix Example**
```{embed} nb.vis.4.bandpass
```

--- 

**PNG Example**
```{embed} nb.vis.3.png
```

--- 

## Third-party Visualizations

Any audio library can be wrapped as a custom visualization. The demo notebooks show integrations with:

- **OpenSoundscape** — `Spectrogram.from_audio()`, `MelSpectrogram`, `.bandpass()`
- **Librosa** — `librosa.feature.melspectrogram()`, HPSS harmonic separation, chromagrams
- **SciPy** — `scipy.signal.spectrogram()` with configurable window functions (Hann, Blackman, Kaiser, Tukey)

--- 

**OpenSoundscapes**

```{embed} nb.vis.3rd.oss
:class: bordered
```

--- 

**Librosa**

```{embed} nb.vis.3rd.librosa
:class: bordered
```

---

**SciPy**

```{embed} nb.vis.3rd.scipy
:class: bordered
```

---

See the [Custom Visualizations](../demo/custom-visualizations.ipynb) and [Third-Party Libraries](../demo/custom-visualizations-2.ipynb) notebooks for complete examples.
