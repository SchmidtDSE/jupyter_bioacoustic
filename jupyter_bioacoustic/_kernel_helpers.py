"""
Kernel Helpers (Internal)

Functions executed inside the Jupyter kernel by the TypeScript
frontend (via python.ts). Each function receives deserialized arguments,
performs I/O or computation, and returns a JSON string that the frontend
parses.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import logging
import os
import tempfile
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Optional

import numpy as np
import soundfile as sf

from .audio import _shared as _audio_shared
from .utils.visualizations import (
    _stft,
    matrix_to_png,
    mel_filterbank,
    normalize_db,
    render_png,
)


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.kernel_helpers')

_FFT_SIZE = 512
_HOP_LENGTH = 128
_N_MELS = 80
_DPI = 100
_DEFAULT_WIDTH = 2000
_DEFAULT_FIG_HEIGHT = 2.6
_DB_RANGE = 80
_MEL_F_MIN = 80.0
_PCM16_SCALE = 32767
_COLORMAP = 'magma'
_N_LUT = 256


#
# PUBLIC
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
    png = matrix_to_png(S_norm, width, fig_h, cmap=_COLORMAP, dpi=_DPI)

    wav_b64 = _encode_wav(mono, sr)

    return json.dumps({
        'spec': base64.b64encode(png).decode(),
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

    Raises:
        ValueError: If the viz result has neither ``png_bytes`` nor ``matrix``.
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

    Args:
        path: Output file path (a missing file counts as 0 rows).
        ext: ``'csv'``, ``'parquet'``, or anything else for JSON Lines.

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

    Args:
        path: Output file path (a missing file gives ``[]``).
        ext: ``'csv'``, ``'parquet'``, or anything else for JSON Lines.

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
    """Append a single row to an output file (see ``write_output_rows``).

    Args:
        path: Output file path.
        row_dict: The row to append.
        columns: Column order for a new file (row keys not listed are appended).
        ext: ``'csv'``, ``'parquet'``, or anything else for JSON Lines.

    Returns:
        ``'ok'`` on success.

    Raises:
        Exception: Any I/O error is logged and re-raised.
    """
    return write_output_rows(path, [row_dict], columns, ext)


def write_output_rows(
    path: str,
    rows: list[dict[str, Any]],
    columns: list[str],
    ext: str,
) -> str:
    """Append rows to an output file in one write: all of them, or none if it fails.

    CSV: a missing or empty file gets a header first. If the rows have columns the file
    doesn't (the form gained a field mid-project), the file is rewritten with the combined
    header and existing rows get blanks in the new columns.

    Holds the file's lock for the whole read-modify-write, so annotators in other kernels
    writing the same file can't interleave or lose rows; full rewrites are atomic.

    Args:
        path: Output file path.
        rows: Rows to append (e.g. one per multibox box).
        columns: Column order for a new file (row keys not listed are appended).
        ext: ``'csv'``, ``'parquet'``, or anything else for JSON Lines.

    Returns:
        ``'ok'`` on success.

    Raises:
        Exception: Any I/O error is logged and re-raised.
    """
    if not rows:
        return 'ok'
    row_keys = [k for row in rows for k in row]
    try:
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        with _file_lock(path):
            if ext == 'csv':
                _append_csv(path, rows, list(dict.fromkeys(list(columns) + row_keys)))
            elif ext == 'parquet':
                import pandas as pd
                new = pd.DataFrame(rows)
                if os.path.exists(path):
                    new = pd.concat([pd.read_parquet(path), new], ignore_index=True)
                _replace_atomically(path, lambda tmp: new.to_parquet(tmp, index=False))
            else:
                with open(path, 'a') as f:
                    f.write(''.join(json.dumps(row) + '\n' for row in rows))
        return 'ok'
    except Exception:
        _log.exception('write_output_rows failed for %s', path)
        raise


def delete_output_row(
    path: str,
    match_fn: Callable[[dict[str, Any]], bool],
    ext: str,
) -> str:
    """Delete rows matching ``match_fn`` from an output file (locked, atomic rewrite).

    CSV keeps its header even when every row is deleted.

    Args:
        path: Output file path.
        match_fn: Returns True for rows to delete.
        ext: ``'csv'``, ``'parquet'``, or anything else for JSON Lines.

    Returns:
        ``'ok'`` on success.

    Raises:
        Exception: Any I/O error (e.g. a missing file) is logged and re-raised.
    """
    try:
        with _file_lock(path):
            if ext == 'csv':
                with open(path, newline='') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                    fieldnames = list(reader.fieldnames or [])
                _write_csv(path, fieldnames, [r for r in rows if not match_fn(r)])
            elif ext == 'parquet':
                import pandas as pd
                df = pd.read_parquet(path)
                df = df[~df.apply(match_fn, axis=1)]
                _replace_atomically(path, lambda tmp: df.to_parquet(tmp, index=False))
            else:
                with open(path) as f:
                    rows = [json.loads(line) for line in f if line.strip()]
                text = ''.join(json.dumps(r) + '\n' for r in rows if not match_fn(r))
                _replace_atomically(path, lambda tmp: _write_text(tmp, text))
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

    Supports CSV, Parquet, JSONL/NDJSON, YAML, and plain text (chosen by
    file extension).

    Args:
        path: Data file path.
        value_col: Column/key holding the values (default: the first one).
        label_col: Column/key holding the labels (default: ``value_col``).

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

    Missing parent directories are created.

    Args:
        path: Destination PNG path.
        b64_data: Base-64 encoded PNG bytes.

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
# INTERNAL
#
def _csv_header(path: str) -> Optional[list[str]]:
    """Return the header row of a CSV file, or None if it is missing or empty.

    Args:
        path: CSV file path.

    Returns:
        Column names, or None.
    """
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    with open(path, newline='') as f:
        return next(csv.reader(f), None)


@contextmanager
def _file_lock(path: str) -> Iterator[None]:
    """Hold an exclusive lock for ``path`` (other kernels on this machine wait).

    The lock file lives in the temp dir, keyed by the output's absolute path, so nothing
    extra appears next to the output (or gets synced with it).

    Args:
        path: The file being read-modified-written.

    Yields:
        None, while the lock is held.
    """
    key = hashlib.md5(os.path.abspath(path).encode()).hexdigest()
    lock_dir = os.path.join(tempfile.gettempdir(), 'jba_locks')
    os.makedirs(lock_dir, exist_ok=True)
    with open(os.path.join(lock_dir, f'{key}.lock'), 'a+') as f:
        if os.name == 'nt':
            import msvcrt
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(f, fcntl.LOCK_UN)


def _replace_atomically(path: str, write: Callable[[str], None]) -> None:
    """Write a whole file via ``write(tmp_path)``, then rename it over ``path``.

    Readers see either the old or the new file, never a half-written one.

    Args:
        path: Destination file.
        write: Writes the complete new contents to the given temp path.
    """
    tmp = f'{path}.{os.getpid()}.tmp'
    try:
        write(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _write_text(path: str, text: str) -> None:
    """Write ``text`` to ``path``.

    Args:
        path: Destination file path.
        text: The full file contents.
    """
    with open(path, 'w') as f:
        f.write(text)


def _append_csv(path: str, rows: list[dict[str, Any]], new_file_columns: list[str]) -> None:
    """Append rows to a CSV (caller holds the lock).

    A missing/empty file gets ``new_file_columns`` as its header. Rows with columns the file
    lacks trigger a rewrite with the combined header (existing rows get blanks).

    Args:
        path: CSV file path.
        rows: Rows to append.
        new_file_columns: Header for a new file.
    """
    header = _csv_header(path)
    if header is None:
        _write_csv(path, new_file_columns, rows)
        return
    extra = [k for k in dict.fromkeys(k for row in rows for k in row) if k not in header]
    if extra:
        with open(path, newline='') as f:
            existing = list(csv.DictReader(f))
        _write_csv(path, header + extra, existing + rows)
    else:
        with open(path, 'a', newline='') as f:
            csv.DictWriter(f, fieldnames=header).writerows(rows)


def _write_csv(path: str, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    """Write a whole CSV (header + rows) atomically.

    Args:
        path: CSV file path.
        fieldnames: Header columns (missing values are written blank).
        rows: Rows to write.
    """
    def write(tmp: str) -> None:
        """Write the header and rows to *tmp*.

        Args:
            tmp: Temporary file path.
        """
        with open(tmp, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)

    _replace_atomically(path, write)


def _safe_float(val: Any, default: float = float('nan')) -> float:
    """Convert *val* to float, returning *default* on failure.

    Used by the TS-built match expression in ``delete_output_row`` calls.

    Args:
        val: Value to convert.
        default: Value returned when conversion fails.

    Returns:
        ``float(val)``, or *default*.
    """
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _to_mono(raw: np.ndarray) -> np.ndarray:
    """Convert multi-channel audio to mono.

    Args:
        raw: Samples as a 2-D array (samples × channels).

    Returns:
        1-D array (channel mean when there is more than one channel).
    """
    return raw.mean(axis=1) if raw.shape[1] > 1 else raw[:, 0]


def _encode_wav(mono: np.ndarray, sr: int) -> str:
    """Encode mono audio as a base-64 WAV string.

    Args:
        mono: 1-D float samples in ``[-1, 1]``.
        sr: Sample rate in Hz.

    Returns:
        Base-64 encoded 16-bit PCM WAV.
    """
    wb = io.BytesIO()
    pcm = (mono * _PCM16_SCALE).astype(np.int16)[:, None]
    sf.write(wb, pcm, sr, format='WAV', subtype='PCM_16')
    return base64.b64encode(wb.getvalue()).decode()


def _normalize_db(S: np.ndarray) -> np.ndarray:
    """Convert a magnitude spectrogram to a normalised (``0..1``) dB scale.

    Args:
        S: Magnitude matrix (freq × time).

    Returns:
        The normalised matrix (see ``visualizations.normalize_db``).
    """
    return normalize_db(S, _DB_RANGE)


def _mel_filterbank(
    mag: np.ndarray,
    sr: int,
    f_min: float,
    f_max: float,
) -> np.ndarray:
    """Apply an 80-band mel filterbank to a 512-point magnitude spectrogram.

    Args:
        mag: Magnitude STFT, shape ``(_FFT_SIZE // 2, n_frames)``.
        sr: Sample rate in Hz.
        f_min: Lowest band edge in Hz.
        f_max: Highest band edge in Hz.

    Returns:
        Mel spectrogram, shape ``(_N_MELS, n_frames)``.
    """
    return mel_filterbank(sr, _FFT_SIZE, _N_MELS, f_min, f_max) @ mag


def _resolve_freq_scale(
    freq_scale_raw: Any,
    f_min: float,
    f_max: float,
) -> tuple[str, Optional[list[float]]]:
    """Normalise a freq_scale value from a custom viz result.

    Args:
        freq_scale_raw: A scale name, or a callable ``fn(f, f_min, f_max)``
            returning the ``0..1`` position of frequency ``f``.
        f_min: Lowest frequency in Hz.
        f_max: Highest frequency in Hz.

    Returns:
        ``(freq_scale, freq_scale_lut)`` — the LUT is ``None``
        unless the raw value was callable.
    """
    if callable(freq_scale_raw):
        lut_freqs = np.linspace(f_min, f_max, _N_LUT).tolist()
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
    """Load select items from a CSV (header row when ``value_col`` is set).

    Args:
        path: Data file path.
        value_col: Column/key holding the values (default: the first one).
        label_col: Column/key holding the labels (default: ``value_col``).

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
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
    """Load select items from a Parquet file.

    Args:
        path: Data file path.
        value_col: Column/key holding the values (default: the first one).
        label_col: Column/key holding the labels (default: ``value_col``).

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
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
    """Load select items from a JSON Lines file.

    Args:
        path: Data file path.
        value_col: Column/key holding the values (default: the first one).
        label_col: Column/key holding the labels (default: ``value_col``).

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
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
    """Load select items from YAML (a ``{column: [values]}`` dict or a list).

    Args:
        path: Data file path.
        value_col: Column/key holding the values (default: the first one).
        label_col: Column/key holding the labels (default: ``value_col``).

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
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
    """Load select items from plain text: ``value`` or ``value, label`` per line.

    Args:
        path: Text file path.

    Returns:
        JSON array of ``[value, label]`` pairs.
    """
    with open(path) as f:
        lines = [ln.rstrip('\n') for ln in f if ln.strip()]
    rows = [[p.strip() for p in ln.split(',', 1)] for ln in lines]
    return json.dumps([
        [r[0], r[1] if len(r) > 1 else r[0]] for r in rows
    ])
