"""
Visualization functions for bioacoustic audio.

Each function takes (mono, sr, width) and returns a dict compatible with
JupyterAudio's custom visualization interface or used in standalone 
visualizations:

    {
        'matrix': np.ndarray,       # 2D array (freq × time) — OR —
        'png_bytes': bytes,         # raw PNG image bytes
        'freq_min': float,          # lowest frequency in Hz
        'freq_max': float,          # highest frequency in Hz
        'freq_scale': str|callable, # 'linear', 'mel', 'log', or fn(f, fmin, fmax)->0..1
        'matrix_scale': str,        # 'linear' (default) or 'db' — skips dB conversion
    }

Usage:

    JupyterAudio:

        from jupyter_bioacoustic import JupyterAudio
        JupyterAudio(
            data='data.csv', audio='audio.flac',
            visualizations=['spectrogram', 'mel', vis.log_frequency],
        ).open()

    Stand Alone:

        from jupyter_bioacoustic.utils import visualizations as vis
        result = vis.mel(mono, sr, 2000)
        fig, ax = vis.plot(result)

License: BSD 3-clause
"""
import io
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
matplotlib.use('Agg')


#
# CONSTANTS
#
DEFAULT_FFT = 512
DEFAULT_HOP = 128
DEFAULT_N_MELS = 80
DEFAULT_DYNAMIC_RANGE_DB = 80


#
# VISUALIZATIONS
#
def spectrogram(mono, sr, width, fft=DEFAULT_FFT, hop=None):
    """Plain linear-frequency spectrogram.

    Args:
        mono: 1D float32 audio array.
        sr: Sample rate.
        width: Requested image width in pixels (controls hop size if hop is None).
        fft: FFT window size.
        hop: Hop size. If None, computed from width.

    Returns:
        Visualization dict with 'matrix', 'freq_min', 'freq_max', 'freq_scale'.
    """
    if hop is None:
        hop = max(1, len(mono) // width) if width > 0 else DEFAULT_HOP
    mag = _stft(mono, fft=fft, hop=hop)
    return {
        'matrix': mag,
        'freq_min': 0.0,
        'freq_max': sr / 2.0,
        'freq_scale': 'linear',
        'matrix_scale': 'linear',
    }


def mel(mono, sr, width, fft=DEFAULT_FFT, hop=None, n_mels=DEFAULT_N_MELS):
    """Mel-scale spectrogram.

    Applies a mel filterbank to a linear STFT, compressing the frequency
    axis to better match human auditory perception.

    Args:
        mono: 1D float32 audio array.
        sr: Sample rate.
        width: Requested image width in pixels.
        fft: FFT window size.
        hop: Hop size. If None, computed from width.
        n_mels: Number of mel frequency bins.

    Returns:
        Visualization dict with mel-filtered 'matrix'.
    """
    if hop is None:
        hop = max(1, len(mono) // width) if width > 0 else DEFAULT_HOP
    mag = _stft(mono, fft=fft, hop=hop)

    f_min, f_max = 80.0, sr / 2.0
    mel_pts = np.linspace(
        2595 * np.log10(1 + f_min / 700),
        2595 * np.log10(1 + f_max / 700),
        n_mels + 2,
    )
    hz_pts = 700 * (10 ** (mel_pts / 2595) - 1)
    bin_pts = (hz_pts / (sr / 2.0) * (fft // 2 - 1)).astype(int).clip(0, fft // 2 - 1)
    fb = np.zeros((n_mels, fft // 2))
    for m in range(1, n_mels + 1):
        lo, pk, hi = bin_pts[m - 1], bin_pts[m], bin_pts[m + 1]
        if pk > lo:
            fb[m - 1, lo:pk] = (np.arange(lo, pk) - lo) / (pk - lo)
        if hi > pk:
            fb[m - 1, pk:hi] = (hi - np.arange(pk, hi)) / (hi - pk)
    S = fb @ mag

    return {
        'matrix': S,
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': 'mel',
        'matrix_scale': 'linear',
    }


def log_frequency(mono, sr, width, fft=2048, hop=None, n_bins=256, f_min=50.0):
    """Log-frequency spectrogram.

    Resamples a linear STFT onto logarithmically-spaced frequency bins,
    giving more visual detail to lower frequencies (similar to a
    constant-Q transform).

    Args:
        mono: 1D float32 audio array.
        sr: Sample rate.
        width: Requested image width in pixels.
        fft: FFT window size (larger = better low-freq resolution).
        hop: Hop size. If None, computed from width.
        n_bins: Number of log-spaced output frequency bins.
        f_min: Lowest frequency in Hz (skips near-DC).

    Returns:
        Visualization dict with log-resampled 'matrix'.
    """
    if hop is None:
        hop = max(1, len(mono) // width) if width > 0 else 256
    mag = _stft(mono, fft=fft, hop=hop)

    f_max = sr / 2.0
    log_freqs = np.logspace(np.log10(f_min), np.log10(f_max), n_bins)
    linear_freqs = np.linspace(0, f_max, mag.shape[0])
    log_mag = np.zeros((n_bins, mag.shape[1]))
    for i, f in enumerate(log_freqs):
        idx = np.searchsorted(linear_freqs, f)
        idx = min(idx, len(linear_freqs) - 2)
        t = (f - linear_freqs[idx]) / max(1e-10, linear_freqs[idx + 1] - linear_freqs[idx])
        log_mag[i] = mag[idx] * (1 - t) + mag[min(idx + 1, mag.shape[0] - 1)] * t

    return {
        'matrix': np.maximum(log_mag, 0),
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': 'log',
        'matrix_scale': 'linear',
    }


def bandpass(mono, sr, width, fft=1024, hop=None, f_lo=1000.0, f_hi=8000.0):
    """Bandpass spectrogram focused on a specific frequency range.

    Extracts a frequency band from the STFT — useful for isolating
    birdsong (1–8 kHz) or other frequency-specific signals.

    Args:
        mono: 1D float32 audio array.
        sr: Sample rate.
        width: Requested image width in pixels.
        fft: FFT window size.
        hop: Hop size. If None, computed from width.
        f_lo: Lower frequency bound in Hz.
        f_hi: Upper frequency bound in Hz.

    Returns:
        Visualization dict with bandpass-filtered 'matrix'.
    """
    if hop is None:
        hop = max(1, len(mono) // width) if width > 0 else 256
    mag = _stft(mono, fft=fft, hop=hop)

    freqs = np.linspace(0, sr / 2, mag.shape[0])
    lo_bin = np.searchsorted(freqs, f_lo)
    hi_bin = np.searchsorted(freqs, f_hi)
    band = mag[lo_bin:hi_bin, :]

    return {
        'matrix': band,
        'freq_min': f_lo,
        'freq_max': f_hi,
        'freq_scale': 'linear',
        'matrix_scale': 'linear',
    }


def waveform(mono, sr, width):
    """Waveform visualization as a PNG.

    Renders the audio waveform directly — not a spectrogram. The y-axis
    shows amplitude. Frequency labels on the plugin's axis won't be
    meaningful; set freq_min/max to amplitude bounds.

    Args:
        mono: 1D float32 audio array.
        sr: Sample rate.
        width: Requested image width in pixels.

    Returns:
        Visualization dict with 'png_bytes'.
    """
    fig = plt.figure(figsize=(width / 100, 5), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    t = np.linspace(0, len(mono) / sr, len(mono))
    ax.plot(t, mono, color='#89b4fa', linewidth=0.3)
    ax.set_xlim(0, len(mono) / sr)
    amp = max(abs(mono.min()), abs(mono.max()), 1e-6)
    ax.set_ylim(-amp, amp)
    ax.set_facecolor('#1e1e2e')
    ax.set_axis_off()
    fig.patch.set_facecolor('#1e1e2e')
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight', pad_inches=0)
    plt.close(fig)

    return {
        'png_bytes': buf.getvalue(),
        'freq_min': -amp,
        'freq_max': amp,
        'freq_scale': 'linear',
    }


#
# HELPERS
#
def plot(viz_dict, cmap='magma', dynamic_range_db=DEFAULT_DYNAMIC_RANGE_DB,
         figsize=None, dpi=100, **kwargs):
    """Plot a visualization dict as a matplotlib figure.

    Accepts the dict returned by any visualization function and renders
    it as a standalone matplotlib figure.

    Args:
        viz_dict: Dict from a visualization function ('matrix' or 'png_bytes').
        cmap: Colormap for matrix rendering (ignored for png_bytes).
        dynamic_range_db: dB range for normalization.
        figsize: Figure size tuple. Defaults to (12, 4).
        dpi: Figure DPI.
        **kwargs: Passed to ax.imshow() (for matrix) or ax.imshow() (for PNG).

    Returns:
        (fig, ax) matplotlib figure and axes.
    """
    figsize = figsize or (12, 4)
    with plt.ioff():
        fig, ax = plt.subplots(figsize=figsize, dpi=dpi)

    if 'png_bytes' in viz_dict:
        img = plt.imread(io.BytesIO(viz_dict['png_bytes']), format='png')
        ax.imshow(img, aspect='auto', **kwargs)
        ax.set_axis_off()
    elif 'matrix' in viz_dict:
        S = np.array(viz_dict['matrix'], dtype=float)
        matrix_scale = viz_dict.get('matrix_scale', None)
        if matrix_scale is None:
            matrix_scale = 'db' if S.min() < 0 else 'linear'
        if matrix_scale == 'db':
            S_db = S
        else:
            S_db = 20 * np.log10(np.maximum(S, 1e-10))
        S_db = np.clip(S_db, S_db.max() - dynamic_range_db, S_db.max())
        S_norm = (S_db - S_db.min()) / max(float(S_db.max() - S_db.min()), 1e-10)

        f_min = viz_dict.get('freq_min', 0)
        f_max = viz_dict.get('freq_max', 1)
        freq_scale = viz_dict.get('freq_scale', 'linear')

        # The matrix rows map linearly to the image. For log/mel scales,
        # the data is already resampled — we just need correct tick labels.
        ax.imshow(S_norm, aspect='auto', cmap=cmap, origin='lower',
                  interpolation='bilinear',
                  extent=[0, S.shape[1], 0, S.shape[0]], **kwargs)

        if freq_scale == 'log' and f_min > 0:
            n_ticks = 8
            tick_freqs = np.logspace(np.log10(f_min), np.log10(f_max), n_ticks)
            tick_positions = (np.log10(tick_freqs) - np.log10(f_min)) / (np.log10(f_max) - np.log10(f_min)) * S.shape[0]
            ax.set_yticks(tick_positions)
            ax.set_yticklabels([f'{f/1000:.1f}' if f < 1000 else f'{f/1000:.0f}' for f in tick_freqs])
        elif freq_scale == 'mel':
            n_ticks = 8
            mel_min = 2595 * np.log10(1 + max(f_min, 1) / 700)
            mel_max = 2595 * np.log10(1 + f_max / 700)
            mel_ticks = np.linspace(mel_min, mel_max, n_ticks)
            tick_freqs = 700 * (10 ** (mel_ticks / 2595) - 1)
            tick_positions = (mel_ticks - mel_min) / (mel_max - mel_min) * S.shape[0]
            ax.set_yticks(tick_positions)
            ax.set_yticklabels([f'{f/1000:.1f}' if f < 1000 else f'{f/1000:.0f}' for f in tick_freqs])
        else:
            # Linear: just relabel y-axis from row indices to kHz
            n_ticks = 8
            tick_freqs = np.linspace(f_min, f_max, n_ticks)
            tick_positions = np.linspace(0, S.shape[0], n_ticks)
            ax.set_yticks(tick_positions)
            ax.set_yticklabels([f'{f/1000:.1f}' if f < 1000 else f'{f/1000:.0f}' for f in tick_freqs])

        ax.set_ylabel('Frequency (kHz)')
        ax.set_xlabel('Frame')

    return fig, ax


#
# Registry:  enables string based lookup for jupyter_bioacoustic tools
#
REGISTRY = {
    'spectrogram': spectrogram,
    'plain': spectrogram,
    'mel': mel,
    'log_frequency': log_frequency,
    'bandpass': bandpass,
    'waveform': waveform,
}


#
# INTERNAL
#
def _stft(mono, fft=DEFAULT_FFT, hop=DEFAULT_HOP):
    """Compute magnitude STFT. Returns magnitude 2D array (freq × time)."""
    win = 0.5 * (1 - np.cos(2 * np.pi * np.arange(fft) / (fft - 1)))
    n_frames = max(1, (len(mono) - fft) // hop + 1)
    idx = np.arange(fft)[None, :] + hop * np.arange(n_frames)[:, None]
    idx = np.clip(idx, 0, len(mono) - 1)
    mag = np.abs(np.fft.rfft(mono[idx] * win, axis=1)[:, :fft // 2]).T
    return mag


def render_png(S, width=2000, matrix_scale=None,
                         dynamic_range_db=DEFAULT_DYNAMIC_RANGE_DB,
                         cmap='magma'):
    """Render a 2D spectrogram matrix to PNG bytes.

    Handles dB conversion, normalization, and colormap rendering.
    Used internally by JupyterAudio for custom visualizations that
    return a matrix instead of png_bytes.

    Args:
        S: 2D numpy array (freq × time).
        width: Image width in pixels.
        matrix_scale: 'linear', 'db', or None (auto-detect from negative values).
        dynamic_range_db: dB range for normalization.
        cmap: Matplotlib colormap name.

    Returns:
        PNG bytes.
    """
    S = np.array(S, dtype=float)
    if matrix_scale is None:
        matrix_scale = 'db' if S.min() < 0 else 'linear'
    if matrix_scale == 'db':
        S_db = S
    else:
        S_db = 20 * np.log10(np.maximum(S, 1e-10))
    S_db = np.clip(S_db, S_db.max() - dynamic_range_db, S_db.max())
    S_norm = (S_db - S_db.min()) / max(float(S_db.max() - S_db.min()), 1e-10)

    dpi = 100
    fig = plt.figure(figsize=(width / dpi, 5), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(S_norm, aspect='auto', cmap=cmap, origin='lower', interpolation='bilinear')
    ax.set_axis_off()
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', pad_inches=0)
    plt.close(fig)
    return buf.getvalue()


