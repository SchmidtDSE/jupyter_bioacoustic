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

```python
BioacousticAnnotator(
    data='detections.csv',
    audio='recording.flac',
    visualizations=['linear', 'mel', 'log_frequency', 'bandpass', 'waveform'],
).open()
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

```python
import soundfile as sf
from jupyter_bioacoustic.utils import visualizations as vis

audio_data, sample_rate = sf.read('recording.flac')
mono = audio_data[:sample_rate * 15].mean(axis=1)

result = vis.log_frequency(mono, sample_rate, 2000)
print(result['matrix'].shape)
print(result['freq_min'], result['freq_max'], result['freq_scale'])

fig, ax = vis.plot(result, cmap='inferno')
ax.set_title('Log-Frequency Spectrogram')
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

### Matrix Example

TODO: UPDATE WITH NOT SOURCE VIS EXAMPLES BUT SIMPLE
TOTO: include ScreenShots

```python
from jupyter_bioacoustic.utils import visualizations as vis

def birdsong_spectrogram(mono, sr, width):
    result = vis.bandpass(mono, sr, width, f_lo=1000.0, f_hi=8000.0)
    return result

BioacousticAnnotator(
    data='detections.csv',
    audio='recording.flac',
    visualizations=[
        'linear',
        'mel',
        {'fn': birdsong_spectrogram, 'label': 'Birdsong (1-8 kHz)'},
    ],
).open()
```

### PNG Example

TODO: UPDATE WITH NOT SOURCE VIS EXAMPLES BUT SIMPLE
TOTO: include ScreenShots

For complete control — custom colormaps, layouts, overlays, or multi-panel figures:

```python
from jupyter_bioacoustic.utils import visualizations as vis

def inferno_spectrogram(mono, sr, width):
    result = vis.spectrogram(mono, sr, width)
    png = vis.render_png(result['matrix'], width=width, cmap='inferno')
    return {
        'png_bytes': png,
        'freq_min': result['freq_min'],
        'freq_max': result['freq_max'],
        'freq_scale': result['freq_scale'],
    }
```

### Third-party libraries


Any audio library can be wrapped as a custom visualization. The demo notebooks show integrations with:

- **OpenSoundscape** — `Spectrogram.from_audio()`, `MelSpectrogram`, `.bandpass()`
- **Librosa** — `librosa.feature.melspectrogram()`, HPSS harmonic separation, chromagrams
- **SciPy** — `scipy.signal.spectrogram()` with configurable window functions (Hann, Blackman, Kaiser, Tukey)

#### Matplotlib

This example uses `matplotlib` for full control (custom layouts, overlays, multi-panel) over the visualizations:

```python
import matplotlib.pyplot as plt
import numpy as np
import io

def waveform_and_spectrogram(mono, sr, width):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(width / 100, 5),
                                    gridspec_kw={'height_ratios': [1, 3]}, dpi=100)
    t = np.linspace(0, len(mono) / sr, len(mono))
    ax1.plot(t, mono, color='#89b4fa', linewidth=0.3)
    ax1.set_xlim(0, len(mono) / sr)
    ax1.set_facecolor('#1e1e2e')
    ax1.set_axis_off()

    ax2.specgram(mono, Fs=sr, NFFT=1024, noverlap=512, cmap='inferno')
    ax2.set_facecolor('#1e1e2e')
    ax2.set_axis_off()

    fig.patch.set_facecolor('#1e1e2e')
    fig.subplots_adjust(hspace=0.05)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight', pad_inches=0.02)
    plt.close(fig)

    return {
        'png_bytes': buf.getvalue(),
        'freq_min': 0.0,
        'freq_max': sr / 2.0,
        'freq_scale': 'linear',
    }
```

#### OpenSoundscapes

TODO: include open soundscapes
TOTO: include ScreenShots

#### Librosa

TOTO: include ScreenShots

```python
import librosa

def librosa_harmonic(mono, sr, width):
    hop = max(1, len(mono) // width) if width > 0 else 512
    S = np.abs(librosa.stft(mono.astype(np.float32), n_fft=2048, hop_length=hop))
    S_harmonic, _ = librosa.decompose.hpss(S)
    return {
        'matrix': S_harmonic,
        'freq_min': 0.0,
        'freq_max': sr / 2.0,
        'freq_scale': 'linear',
    }

BioacousticAnnotator(
    data='detections.csv',
    audio='recording.flac',
    visualizations=[
        'linear',
        'mel',
        {'fn': librosa_harmonic, 'label': 'Librosa Harmonic'},
    ],
).open()
```

See the [Custom Visualizations](../demo/custom-visualizations.ipynb) and [Third-Party Libraries](../demo/custom-visualizations-2.ipynb) notebooks for complete examples.
