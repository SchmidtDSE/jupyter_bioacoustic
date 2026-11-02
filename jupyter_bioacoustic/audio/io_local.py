"""
Local IO Backend

Audio file IO for the local filesystem. Every remote full-download fallback also ends here
(the cached file is read with ``read_segment``).

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from . import _shared
from ._partial import DEFAULT_DTYPE, segment_frames


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')


#
# PUBLIC
#
def read(
    src: str,
    dest: str | None = None,
    start_byte: int | None = None,
    end_byte: int | None = None,
    **kwargs: Any,
) -> bytes | str:
    """Read file data (optionally a byte range) from the local filesystem.

    Args:
        src: Local source path.
        dest: Local path to copy the bytes to (optional).
        start_byte: First byte to read (optional).
        end_byte: Last byte to read, inclusive (optional).
        **kwargs: Ignored (accepted for a uniform backend signature).

    Returns:
        The bytes if ``dest`` is None, otherwise ``dest``.
    """
    with open(src, 'rb') as f:
        if start_byte is not None:
            f.seek(start_byte)
        if start_byte is not None and end_byte is not None:
            data = f.read(end_byte - start_byte + 1)
        elif end_byte is not None:
            data = f.read(end_byte + 1)
        else:
            data = f.read()
    return _shared.save_or_return(data, dest)


def read_segment(
    path: str, start_sec: float, dur_sec: float, **kwargs: Any
) -> tuple[np.ndarray, int]:
    """Read a time segment from a local audio file.

    Args:
        path: Local audio file path.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        **kwargs: Ignored (accepted for a uniform backend signature).

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels).
    """
    _log.debug(
        'local read_segment: %s start=%.1fs dur=%.1fs', path, start_sec, dur_sec
    )
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        start, n_samples = segment_frames(start_sec, dur_sec, sr)
        f.seek(start)
        raw = f.read(n_samples, dtype=DEFAULT_DTYPE, always_2d=True)
    _log.debug('local read_segment: %d samples, sr=%d', raw.shape[0], sr)
    return raw, sr


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Copy a file or directory to a local destination.

    Args:
        src: Local source file or directory.
        dest: Local destination path.
        recursive: Required to copy a directory.
        overwrite: If False, refuse to replace an existing destination.
        **kwargs: Ignored (accepted for a uniform backend signature).

    Returns:
        ``dest``.

    Raises:
        ValueError: If ``src`` is a directory and ``recursive`` is False.
        FileExistsError: If ``dest`` exists and ``overwrite`` is False.
    """
    is_dir = _shared.is_directory_upload(src, recursive)
    if os.path.exists(dest) and not overwrite:
        raise FileExistsError(f"Destination exists and overwrite=False: {dest}")
    if is_dir:
        shutil.copytree(src, dest, dirs_exist_ok=overwrite)
        return dest
    _shared.ensure_parent_dirs(dest)
    shutil.copy2(src, dest)
    return dest


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List the files in a local directory.

    Args:
        path: Local directory.
        recursive: Also list files in subdirectories.
        **kwargs: Ignored (accepted for a uniform backend signature).

    Returns:
        Sorted file paths.

    Raises:
        ValueError: If ``path`` is not a directory.
    """
    p = Path(path)
    if not p.is_dir():
        raise ValueError(f"Not a directory: {path}")
    if recursive:
        return sorted(str(f) for f in p.rglob('*') if f.is_file())
    return sorted(str(f) for f in p.iterdir() if f.is_file())
