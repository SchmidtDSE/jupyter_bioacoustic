"""
Visualizations

Visualization functions for bioacoustic audio.

Each function takes (mono, sr, width) and returns a dict compatible with
BioacousticAnnotator's custom visualization interface or used in standalone
visualizations:

    {
        'matrix': np.ndarray,       # 2D array (freq × time) — OR —
        'png_bytes': bytes,         # raw PNG image bytes
        'freq_min': float,          # lowest frequency in Hz
        'freq_max': float,          # highest frequency in Hz
        'freq_scale': str|callable, # 'linear', 'mel', 'log', or fn(f, fmin, fmax)->0..1
        'matrix_scale': str,        # 'linear' (default) or 'db' — skips dB conversion
    }

This module also holds the shared signal/rendering helpers (``_stft``,
``mel_filterbank``, ``normalize_db``, ``matrix_to_png``) that
``_kernel_helpers`` uses for the built-in spectrograms.

Usage:

    BioacousticAnnotator:

        from jupyter_bioacoustic import BioacousticAnnotator
        from jupyter_bioacoustic.utils import visualizations as vis
        BioacousticAnnotator(
            data='data.csv', audio='audio.flac',
            visualizations=['spectrogram', 'mel', vis.log_frequency],
        ).open()

    Stand Alone:

        from jupyter_bioacoustic.utils import visualizations as vis
        result = vis.mel(mono, sr, 2000)
        fig, ax = vis.plot(result)

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import io
from typing import Any, Optional

import matplotlib.pyplot as plt   # only for plot(), which shows a figure in the notebook
import numpy as np
# Figure (not pyplot) renders PNGs off-screen without switching the user's backend
from matplotlib.figure import Figure


#
# CONSTANTS
#
DEFAULT_FFT = 512
DEFAULT_HOP = 128
DEFAULT_N_MELS = 80
DEFAULT_DYNAMIC_RANGE_DB = 80
DEFAULT_DPI = 100
DEFAULT_HEIGHT = 500
DEFAULT_WIDTH = 2000
DEFAULT_FIGSIZE = (12, 4)
DEFAULT_WAVEFORM_HEIGHT = 5
DEFAULT_COLORMAP = 'magma'
DEFAULT_LOG_HOP = 256
DEFAULT_BANDPASS_FFT = 1024
DEFAULT_LOG_FFT = 2048
DEFAULT_LOG_BINS = 256
DEFAULT_LOG_F_MIN = 50.0
DEFAULT_BANDPASS_F_LO = 1000.0
DEFAULT_BANDPASS_F_HI = 8000.0
DEFAULT_MEL_F_MIN = 80.0
DEFAULT_LINE_WIDTH = 0.3
DEFAULT_N_TICKS = 8
WAVEFORM_COLOR = '#89b4fa'
BACKGROUND_COLOR = '#1e1e2e'
_DB_FLOOR = 1e-10
_EPSILON = 1e-10
_MIN_AMPLITUDE = 1e-6


#
# PUBLIC
#
def spectrogram(
    mono: np.ndarray,
    sr: int,
    width: int,
    fft: int = DEFAULT_FFT,
    hop: Optional[int] = None,
) -> dict[str, Any]:
    """Linear-frequency spectrogram.

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
        hop = _default_hop(len(mono), width, DEFAULT_HOP)
    mag = _stft(mono, fft=fft, hop=hop)
    return {
        'matrix': mag,
        'freq_min': 0.0,
        'freq_max': sr / 2.0,
        'freq_scale': 'linear',
        'matrix_scale': 'linear',
    }


def mel(
    mono: np.ndarray,
    sr: int,
    width: int,
    fft: int = DEFAULT_FFT,
    hop: Optional[int] = None,
    n_mels: int = DEFAULT_N_MELS,
) -> dict[str, Any]:
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
        hop = _default_hop(len(mono), width, DEFAULT_HOP)
    mag = _stft(mono, fft=fft, hop=hop)
    f_min, f_max = DEFAULT_MEL_F_MIN, sr / 2.0
    S = mel_filterbank(sr, fft, n_mels, f_min, f_max) @ mag
    return {
        'matrix': S,
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': 'mel',
        'matrix_scale': 'linear',
    }


def log_frequency(
    mono: np.ndarray,
    sr: int,
    width: int,
    fft: int = DEFAULT_LOG_FFT,
    hop: Optional[int] = None,
    n_bins: int = DEFAULT_LOG_BINS,
    f_min: float = DEFAULT_LOG_F_MIN,
) -> dict[str, Any]:
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
        hop = _default_hop(len(mono), width, DEFAULT_LOG_HOP)
    mag = _stft(mono, fft=fft, hop=hop)

    f_max = sr / 2.0
    log_freqs = np.logspace(np.log10(f_min), np.log10(f_max), n_bins)
    linear_freqs = np.linspace(0, f_max, mag.shape[0])
    log_mag = np.zeros((n_bins, mag.shape[1]))
    for i, f in enumerate(log_freqs):
        idx = np.searchsorted(linear_freqs, f)
        idx = min(idx, len(linear_freqs) - 2)
        t = (f - linear_freqs[idx]) / max(_EPSILON, linear_freqs[idx + 1] - linear_freqs[idx])
        log_mag[i] = mag[idx] * (1 - t) + mag[min(idx + 1, mag.shape[0] - 1)] * t

    return {
        'matrix': np.maximum(log_mag, 0),
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': 'log',
        'matrix_scale': 'linear',
    }


def bandpass(
    mono: np.ndarray,
    sr: int,
    width: int,
    fft: int = DEFAULT_BANDPASS_FFT,
    hop: Optional[int] = None,
    f_lo: float = DEFAULT_BANDPASS_F_LO,
    f_hi: float = DEFAULT_BANDPASS_F_HI,
) -> dict[str, Any]:
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
        hop = _default_hop(len(mono), width, DEFAULT_LOG_HOP)
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


def waveform(mono: np.ndarray, sr: int, width: int) -> dict[str, Any]:
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
    fig = Figure(figsize=(width / DEFAULT_DPI, DEFAULT_WAVEFORM_HEIGHT), dpi=DEFAULT_DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    t = np.linspace(0, len(mono) / sr, len(mono))
    ax.plot(t, mono, color=WAVEFORM_COLOR, linewidth=DEFAULT_LINE_WIDTH)
    ax.set_xlim(0, len(mono) / sr)
    amp = max(abs(mono.min()), abs(mono.max()), _MIN_AMPLITUDE)
    ax.set_ylim(-amp, amp)
    ax.set_facecolor(BACKGROUND_COLOR)
    ax.set_axis_off()
    fig.patch.set_facecolor(BACKGROUND_COLOR)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=DEFAULT_DPI, bbox_inches='tight', pad_inches=0)

    return {
        'png_bytes': buf.getvalue(),
        'freq_min': -amp,
        'freq_max': amp,
        'freq_scale': 'linear',
    }


def plot(
    viz_dict: dict[str, Any],
    cmap: str = DEFAULT_COLORMAP,
    dynamic_range_db: float = DEFAULT_DYNAMIC_RANGE_DB,
    figsize: Optional[tuple[float, float]] = None,
    dpi: int = DEFAULT_DPI,
    **kwargs: Any,
) -> tuple[plt.Figure, plt.Axes]:
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
    figsize = figsize or DEFAULT_FIGSIZE
    with plt.ioff():
        fig, ax = plt.subplots(figsize=figsize, dpi=dpi)

    if 'png_bytes' in viz_dict:
        img = plt.imread(io.BytesIO(viz_dict['png_bytes']), format='png')
        ax.imshow(img, aspect='auto', **kwargs)
        ax.set_axis_off()
    elif 'matrix' in viz_dict:
        S = np.array(viz_dict['matrix'], dtype=float)
        S_norm = normalize_db(
            S, dynamic_range_db, matrix_scale=viz_dict.get('matrix_scale', None),
        )

        f_min = viz_dict.get('freq_min', 0)
        f_max = viz_dict.get('freq_max', 1)
        freq_scale = viz_dict.get('freq_scale', 'linear')

        # The matrix rows map linearly to the image. For log/mel scales,
        # the data is already resampled — we just need correct tick labels.
        ax.imshow(S_norm, aspect='auto', cmap=cmap, origin='lower',
                  interpolation='bilinear',
                  extent=[0, S.shape[1], 0, S.shape[0]], **kwargs)

        tick_freqs, tick_positions = _freq_ticks(freq_scale, f_min, f_max, S.shape[0])
        ax.set_yticks(tick_positions)
        ax.set_yticklabels(_khz_labels(tick_freqs))
        ax.set_ylabel('Frequency (kHz)')
        ax.set_xlabel('Frame')

    return fig, ax


def render_png(
    S: np.ndarray,
    width: int = DEFAULT_WIDTH,
    height: Optional[int] = None,
    matrix_scale: Optional[str] = None,
    dynamic_range_db: float = DEFAULT_DYNAMIC_RANGE_DB,
    cmap: str = DEFAULT_COLORMAP,
) -> bytes:
    """Render a 2D spectrogram matrix to PNG bytes.

    Handles dB conversion, normalization, and colormap rendering.
    Used internally by BioacousticAnnotator for custom visualizations that
    return a matrix instead of png_bytes.

    Args:
        S: 2D numpy array (freq × time).
        width: Image width in pixels.
        height: Image height in pixels. Default 500.
        matrix_scale: 'linear', 'db', or None (auto-detect from negative values).
        dynamic_range_db: dB range for normalization.
        cmap: Matplotlib colormap name.

    Returns:
        PNG bytes.
    """
    if height is None:
        height = DEFAULT_HEIGHT
    S = np.array(S, dtype=float)
    S_norm = normalize_db(S, dynamic_range_db, matrix_scale=matrix_scale)
    return matrix_to_png(S_norm, width, height / DEFAULT_DPI, cmap)


def matrix_to_png(
    S_norm: np.ndarray,
    width: int,
    fig_height: float,
    cmap: str = DEFAULT_COLORMAP,
    dpi: int = DEFAULT_DPI,
) -> bytes:
    """Render a normalised matrix as an axis-free PNG image.

    Uses ``matplotlib.figure.Figure`` (not pyplot), so the user's backend is
    left alone.

    Args:
        S_norm: 2D matrix with values in ``[0, 1]`` (freq × time).
        width: Image width in pixels.
        fig_height: Figure height in inches.
        cmap: Matplotlib colormap name.
        dpi: Figure DPI.

    Returns:
        PNG bytes.
    """
    fig = Figure(figsize=(width / dpi, fig_height), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(S_norm, aspect='auto', cmap=cmap, origin='lower', interpolation='bilinear')
    ax.set_axis_off()
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', pad_inches=0)
    return buf.getvalue()


def mel_filterbank(
    sr: int,
    fft: int,
    n_mels: int,
    f_min: float,
    f_max: float,
) -> np.ndarray:
    """Build a triangular mel filterbank matrix.

    Multiply it with a magnitude STFT (``fb @ mag``) to get a mel spectrogram.

    Args:
        sr: Sample rate in Hz.
        fft: FFT window size (the STFT has ``fft // 2`` frequency bins).
        n_mels: Number of mel bands.
        f_min: Lowest band edge in Hz.
        f_max: Highest band edge in Hz.

    Returns:
        Array of shape ``(n_mels, fft // 2)``.
    """
    n_bins = fft // 2
    mel_pts = np.linspace(
        2595 * np.log10(1 + f_min / 700),
        2595 * np.log10(1 + f_max / 700),
        n_mels + 2,
    )
    hz_pts = 700 * (10 ** (mel_pts / 2595) - 1)
    bin_pts = (hz_pts / (sr / 2.0) * (n_bins - 1)).astype(int).clip(0, n_bins - 1)
    fb = np.zeros((n_mels, n_bins))
    for m in range(1, n_mels + 1):
        lo, pk, hi = bin_pts[m - 1], bin_pts[m], bin_pts[m + 1]
        if pk > lo:
            fb[m - 1, lo:pk] = (np.arange(lo, pk) - lo) / (pk - lo)
        if hi > pk:
            fb[m - 1, pk:hi] = (hi - np.arange(pk, hi)) / (hi - pk)
    return fb


def normalize_db(
    S: np.ndarray,
    dynamic_range_db: float = DEFAULT_DYNAMIC_RANGE_DB,
    matrix_scale: Optional[str] = 'linear',
) -> np.ndarray:
    """Convert a matrix to dB, clip it to a dynamic range and scale to ``0..1``.

    Args:
        S: 2D matrix (freq × time).
        dynamic_range_db: dB range kept below the maximum.
        matrix_scale: ``'linear'`` (magnitudes, converted to dB), ``'db'``
            (already dB, used as-is) or ``None`` (``'db'`` if any value is
            negative, else ``'linear'``).

    Returns:
        The normalised matrix with values in ``[0, 1]``.
    """
    if matrix_scale is None:
        matrix_scale = 'db' if S.min() < 0 else 'linear'
    if matrix_scale == 'db':
        S_db = S
    else:
        S_db = 20 * np.log10(np.maximum(S, _DB_FLOOR))
    S_db = np.clip(S_db, S_db.max() - dynamic_range_db, S_db.max())
    return (S_db - S_db.min()) / max(float(S_db.max() - S_db.min()), _EPSILON)


# Visualization name -> function. BioacousticAnnotator resolves string entries
# in ``visualizations=[...]`` through this (it must follow the functions).
REGISTRY = {
    'linear': spectrogram,
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
def _stft(mono: np.ndarray, fft: int = DEFAULT_FFT, hop: int = DEFAULT_HOP) -> np.ndarray:
    """Compute a magnitude STFT with a Hann window.

    Args:
        mono: 1D audio array.
        fft: FFT window size.
        hop: Hop size in samples.

    Returns:
        Magnitude array of shape ``(fft // 2, n_frames)`` (freq × time).
    """
    win = 0.5 * (1 - np.cos(2 * np.pi * np.arange(fft) / (fft - 1)))
    n_frames = max(1, (len(mono) - fft) // hop + 1)
    idx = np.arange(fft)[None, :] + hop * np.arange(n_frames)[:, None]
    idx = np.clip(idx, 0, len(mono) - 1)
    mag = np.abs(np.fft.rfft(mono[idx] * win, axis=1)[:, :fft // 2]).T
    return mag


def _default_hop(n_samples: int, width: int, fallback: int) -> int:
    """Return the hop size that yields about one STFT frame per pixel.

    Args:
        n_samples: Number of audio samples.
        width: Requested image width in pixels.
        fallback: Hop to use when *width* is not positive.

    Returns:
        The hop size (at least 1).
    """
    return max(1, n_samples // width) if width > 0 else fallback


def _freq_ticks(
    freq_scale: str,
    f_min: float,
    f_max: float,
    n_rows: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute y-axis tick frequencies and their row positions.

    Args:
        freq_scale: ``'log'``, ``'mel'`` or anything else (linear).
        f_min: Lowest frequency in Hz.
        f_max: Highest frequency in Hz.
        n_rows: Number of matrix rows (image height in data units).

    Returns:
        ``(tick_freqs, tick_positions)``.
    """
    if freq_scale == 'log' and f_min > 0:
        tick_freqs = np.logspace(np.log10(f_min), np.log10(f_max), DEFAULT_N_TICKS)
        log_span = np.log10(f_max) - np.log10(f_min)
        tick_positions = (np.log10(tick_freqs) - np.log10(f_min)) / log_span * n_rows
    elif freq_scale == 'mel':
        mel_min = 2595 * np.log10(1 + max(f_min, 1) / 700)
        mel_max = 2595 * np.log10(1 + f_max / 700)
        mel_ticks = np.linspace(mel_min, mel_max, DEFAULT_N_TICKS)
        tick_freqs = 700 * (10 ** (mel_ticks / 2595) - 1)
        tick_positions = (mel_ticks - mel_min) / (mel_max - mel_min) * n_rows
    else:
        # Linear: just relabel y-axis from row indices to kHz
        tick_freqs = np.linspace(f_min, f_max, DEFAULT_N_TICKS)
        tick_positions = np.linspace(0, n_rows, DEFAULT_N_TICKS)
    return tick_freqs, tick_positions


def _khz_labels(tick_freqs: np.ndarray) -> list[str]:
    """Format tick frequencies (Hz) as kHz labels.

    Args:
        tick_freqs: Tick frequencies in Hz.

    Returns:
        One label per tick (one decimal below 1 kHz, none above).
    """
    return [f'{f/1000:.1f}' if f < 1000 else f'{f/1000:.0f}' for f in tick_freqs]
