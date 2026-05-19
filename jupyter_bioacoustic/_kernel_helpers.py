"""
Kernel Helpers (Internal)

Functions executed inside the Jupyter kernel by the TypeScript
frontend (via python.ts). Each function receives deserialized arguments,
performs I/O or computation, and returns a JSON string that the frontend
parses.

License: BSD 3-Clause
"""

from __future__ import annotations

import base64
import csv
import io
import json
import logging
import os
from typing import Any, Callable, Optional

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import soundfile as sf

from .audio import _shared as _audio_shared
from .utils.visualizations import render_png, _stft


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.kernel_helpers')

_FFT_SIZE = 512
_HOP_LENGTH = 128
_N_MELS = 80
_DPI = 100
_DEFAULT_WIDTH = 2000
_DEFAULT_FIG_HEIGHT = 2.6
_DB_FLOOR = 1e-10
_DB_RANGE = 80
_MEL_F_MIN = 80.0
_PCM16_SCALE = 32767


#
# Public API
#
def build_spectrogram(
    raw: np.ndarray,
    sr: int,
    spec_type: str = 'mel',
    width: int = _DEFAULT_WIDTH,
    height: Optional[int] = None,
) -> str:
    """Build a spectrogram PNG + WAV from raw audio samples.

    Args:
        raw: Audio samples as a 2-D array (samples × channels).
        sr: Sample rate in Hz.
        spec_type: ``'mel'`` or ``'linear'``.
        width: Output image width in pixels.
        height: Output image height in pixels (``None`` → default).

    Returns:
        JSON string with keys: ``spec``, ``wav``, ``duration``,
        ``sample_rate``, ``freq_min``, ``freq_max``, ``freq_scale``,
        ``audio_warning``.
    """
    mono = _to_mono(raw)
    actual_dur = len(mono) / sr

    mag = _stft(mono, fft=_FFT_SIZE, hop=_HOP_LENGTH)

    if spec_type == 'mel':
        f_min, f_max = _MEL_F_MIN, sr / 2.0
        S = _mel_filterbank(mag, sr, f_min, f_max)
        freq_scale = 'mel'
    else:
        f_min, f_max = 0.0, sr / 2.0
        S = mag
        freq_scale = 'linear'

    S_norm = _normalize_db(S)

    fig_h = (height / _DPI) if height else _DEFAULT_FIG_HEIGHT
    fig = plt.figure(figsize=(width / _DPI, fig_h), dpi=_DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(
        S_norm, aspect='auto', cmap='magma',
        origin='lower', interpolation='bilinear',
    )
    ax.set_axis_off()
    pb = io.BytesIO()
    fig.savefig(pb, format='png', dpi=_DPI, bbox_inches='tight',
                pad_inches=0)
    plt.close(fig)

    wav_b64 = _encode_wav(mono, sr)

    return json.dumps({
        'spec': base64.b64encode(pb.getvalue()).decode(),
        'wav': wav_b64,
        'duration': float(actual_dur),
        'sample_rate': int(sr),
        'freq_min': float(f_min),
        'freq_max': float(f_max),
        'freq_scale': freq_scale,
        'audio_warning': getattr(_audio_shared, 'last_warning', None),
    })


def run_custom_viz(
    raw: np.ndarray,
    sr: int,
    viz_entry: dict[str, Any],
    width: int = _DEFAULT_WIDTH,
    height: Optional[int] = None,
) -> str:
    """Run a user-provided visualization function and return results.

    Args:
        raw: Audio samples as a 2-D array (samples × channels).
        sr: Sample rate in Hz.
        viz_entry: Dict with ``'fn'`` key pointing to the viz callable.
        width: Output image width in pixels.
        height: Output image height in pixels (``None`` → default).

    Returns:
        JSON string with keys: ``spec``, ``wav``, ``duration``,
        ``sample_rate``, ``freq_min``, ``freq_max``, ``freq_scale``,
        ``freq_scale_lut``, ``audio_warning``.
    """
    mono = _to_mono(raw)
    actual_dur = len(mono) / sr

    viz_fn = viz_entry['fn']
    viz_result = viz_fn(mono, sr, width)

    f_min = float(viz_result['freq_min'])
    f_max = float(viz_result['freq_max'])

    freq_scale, freq_scale_lut = _resolve_freq_scale(
        viz_result.get('freq_scale', 'linear'), f_min, f_max,
    )

    if 'png_bytes' in viz_result:
        spec_b64 = base64.b64encode(viz_result['png_bytes']).decode()
    elif 'matrix' in viz_result:
        png = render_png(
            viz_result['matrix'], width=width,
            height=height or None,
            matrix_scale=viz_result.get('matrix_scale', None),
        )
        spec_b64 = base64.b64encode(png).decode()
    else:
        raise ValueError(
            "Custom viz must return 'png_bytes' or 'matrix'"
        )

    wav_b64 = _encode_wav(mono, sr)

    return json.dumps({
        'spec': spec_b64,
        'wav': wav_b64,
        'duration': float(actual_dur),
        'sample_rate': int(sr),
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': freq_scale,
        'freq_scale_lut': freq_scale_lut,
        'audio_warning': getattr(_audio_shared, 'last_warning', None),
    })


def count_output_rows(path: str, ext: str) -> str:
    """Count rows in an output file.

    Returns:
        JSON string ``{"count": <int>}``.
    """
    c = 0
    if os.path.exists(path):
        if ext == 'csv':
            with open(path) as f:
                c = sum(1 for _ in csv.DictReader(f))
        elif ext == 'parquet':
            import pandas as pd
            c = len(pd.read_parquet(path))
        else:
            with open(path) as f:
                c = sum(1 for line in f if line.strip())
    return json.dumps({'count': c})


def read_output_rows(path: str, ext: str) -> str:
    """Read all rows from an output file.

    Returns:
        JSON array of row dicts.
    """
    r: list[dict[str, Any]] = []
    if os.path.exists(path):
        if ext == 'csv':
            with open(path) as f:
                r = list(csv.DictReader(f))
        elif ext == 'parquet':
            import pandas as pd
            r = pd.read_parquet(path).astype(str).to_dict('records')
        else:
            with open(path) as f:
                r = [json.loads(line) for line in f if line.strip()]
    return json.dumps(r)


def write_output_row(
    path: str,
    row_dict: dict[str, Any],
    columns: list[str],
    ext: str,
) -> str:
    """Append a single row to an output file.

    Returns:
        ``'ok'`` on success.
    """
    try:
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)

        if ext == 'csv':
            exists = os.path.exists(path)
            if exists:
                with open(path, newline='') as rf:
                    reader = csv.reader(rf)
                    existing_cols = next(reader, None)
                if existing_cols:
                    columns = existing_cols
            with open(path, 'a', newline='') as f:
                w = csv.DictWriter(f, fieldnames=columns)
                if not exists:
                    w.writeheader()
                w.writerow(row_dict)
        elif ext == 'parquet':
            import pandas as pd
            new = pd.DataFrame([row_dict])
            if os.path.exists(path):
                existing = pd.read_parquet(path)
                pd.concat(
                    [existing, new], ignore_index=True,
                ).to_parquet(path, index=False)
            else:
                new.to_parquet(path, index=False)
        else:
            with open(path, 'a') as f:
                f.write(json.dumps(row_dict) + '\n')
        return 'ok'
    except Exception:
        _log.exception('write_output_row failed for %s', path)
        raise


def delete_output_row(
    path: str,
    match_fn: Callable[[dict[str, Any]], bool],
    ext: str,
) -> str:
    """Delete rows matching ``match_fn`` from an output file.

    Returns:
        ``'ok'`` on success.
    """
    try:
        if ext == 'csv':
            with open(path) as f:
                rows = list(csv.DictReader(f))
            keep = [r for r in rows if not match_fn(r)]
            with open(path, 'w', newline='') as f:
                if keep:
                    w = csv.DictWriter(f, fieldnames=keep[0].keys())
                    w.writeheader()
                    w.writerows(keep)
        elif ext == 'parquet':
            import pandas as pd
            df = pd.read_parquet(path)
            df = df[~df.apply(match_fn, axis=1)]
            df.to_parquet(path, index=False)
        else:
            with open(path) as f:
                rows = [json.loads(line) for line in f if line.strip()]
            keep = [r for r in rows if not match_fn(r)]
            with open(path, 'w') as f:
                for r in keep:
                    f.write(json.dumps(r) + '\n')
        return 'ok'
    except Exception:
        _log.exception('delete_output_row failed for %s', path)
        raise


def load_select_items(
    path: str,
    value_col: Optional[str] = None,
    label_col: Optional[str] = None,
) -> str:
    """Load ``[value, label]`` pairs from a data file.

    Supports CSV, Parquet, JSONL/NDJSON, YAML, and plain text.

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == '.csv':
        return _load_select_csv(path, value_col, label_col)

    if ext == '.parquet':
        return _load_select_parquet(path, value_col, label_col)

    if ext in ('.jsonl', '.ndjson'):
        return _load_select_jsonl(path, value_col, label_col)

    if ext in ('.yaml', '.yml'):
        return _load_select_yaml(path, value_col, label_col)

    return _load_select_text(path)


def save_png(path: str, b64_data: str) -> str:
    """Decode base-64 PNG data and write to *path*.

    Returns:
        ``'ok'`` on success.
    """
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, 'wb') as f:
        f.write(base64.b64decode(b64_data))
    return 'ok'


#
# Internal
#
def _safe_float(val: Any, default: float = float('nan')) -> float:
    """Convert *val* to float, returning *default* on failure."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _to_mono(raw: np.ndarray) -> np.ndarray:
    """Convert multi-channel audio to mono."""
    return raw.mean(axis=1) if raw.shape[1] > 1 else raw[:, 0]


def _encode_wav(mono: np.ndarray, sr: int) -> str:
    """Encode mono audio as a base-64 WAV string."""
    wb = io.BytesIO()
    pcm = (mono * _PCM16_SCALE).astype(np.int16)[:, None]
    sf.write(wb, pcm, sr, format='WAV', subtype='PCM_16')
    return base64.b64encode(wb.getvalue()).decode()


def _normalize_db(S: np.ndarray) -> np.ndarray:
    """Convert magnitude spectrogram to normalised dB scale."""
    S_db = 20 * np.log10(np.maximum(S, _DB_FLOOR))
    S_db = np.clip(S_db, S_db.max() - _DB_RANGE, S_db.max())
    denom = max(float(S_db.max() - S_db.min()), _DB_FLOOR)
    return (S_db - S_db.min()) / denom


def _mel_filterbank(
    mag: np.ndarray,
    sr: int,
    f_min: float,
    f_max: float,
) -> np.ndarray:
    """Apply a mel filterbank to a magnitude spectrogram."""
    mel_pts = np.linspace(
        2595 * np.log10(1 + f_min / 700),
        2595 * np.log10(1 + f_max / 700),
        _N_MELS + 2,
    )
    hz_pts = 700 * (10 ** (mel_pts / 2595) - 1)
    n_bins = _FFT_SIZE // 2
    bin_pts = (hz_pts / (sr / 2.0) * (n_bins - 1)).astype(int)
    bin_pts = bin_pts.clip(0, n_bins - 1)
    fb = np.zeros((_N_MELS, n_bins))
    for m in range(1, _N_MELS + 1):
        lo, pk, hi = bin_pts[m - 1], bin_pts[m], bin_pts[m + 1]
        if pk > lo:
            fb[m - 1, lo:pk] = (
                (np.arange(lo, pk) - lo) / (pk - lo)
            )
        if hi > pk:
            fb[m - 1, pk:hi] = (
                (hi - np.arange(pk, hi)) / (hi - pk)
            )
    return fb @ mag


def _resolve_freq_scale(
    freq_scale_raw: Any,
    f_min: float,
    f_max: float,
) -> tuple[str, Optional[list[float]]]:
    """Normalise a freq_scale value from a custom viz result.

    Returns:
        ``(freq_scale, freq_scale_lut)`` — the LUT is ``None``
        unless the raw value was callable.
    """
    if callable(freq_scale_raw):
        n_lut = 256
        lut_freqs = np.linspace(f_min, f_max, n_lut).tolist()
        lut = [
            float(freq_scale_raw(f, f_min, f_max))
            for f in lut_freqs
        ]
        return 'lut', lut
    return str(freq_scale_raw), None


def _load_select_csv(
    path: str,
    value_col: Optional[str],
    label_col: Optional[str],
) -> str:
    with open(path) as f:
        if value_col:
            rows = list(csv.DictReader(f))
            lc = label_col or value_col
            return json.dumps([
                [r[value_col], r.get(lc, r[value_col])]
                for r in rows
            ])
        rd = csv.reader(f)
        rows = [r for r in rd if r]
        return json.dumps([
            [r[0], r[1] if len(r) > 1 else r[0]] for r in rows
        ])


def _load_select_parquet(
    path: str,
    value_col: Optional[str],
    label_col: Optional[str],
) -> str:
    import pandas as pd
    df = pd.read_parquet(path)
    vc = value_col or df.columns[0]
    lc = label_col or vc
    return json.dumps([
        [str(r[vc]), str(r[lc])] for _, r in df.iterrows()
    ])


def _load_select_jsonl(
    path: str,
    value_col: Optional[str],
    label_col: Optional[str],
) -> str:
    with open(path) as f:
        rows = [json.loads(line) for line in f if line.strip()]
    vc = value_col or (
        list(rows[0].keys())[0] if rows else 'value'
    )
    lc = label_col or vc
    return json.dumps([
        [str(r[vc]), str(r.get(lc, r[vc]))] for r in rows
    ])


def _load_select_yaml(
    path: str,
    value_col: Optional[str],
    label_col: Optional[str],
) -> str:
    import yaml
    with open(path) as f:
        data = yaml.safe_load(f)
    vc = value_col or (
        list(data.keys())[0] if isinstance(data, dict) else 'value'
    )
    lc = label_col or vc
    if isinstance(data, dict):
        vals = data.get(vc, [])
        lbls = data.get(lc, vals)
        return json.dumps([
            [str(vals[i]), str(lbls[i])]
            for i in range(min(len(vals), len(lbls)))
        ])
    return json.dumps([[str(x), str(x)] for x in data])


def _load_select_text(path: str) -> str:
    with open(path) as f:
        lines = [ln.rstrip('\n') for ln in f if ln.strip()]
    rows = [[p.strip() for p in ln.split(',', 1)] for ln in lines]
    return json.dumps([
        [r[0], r[1] if len(r) > 1 else r[0]] for r in rows
    ])
