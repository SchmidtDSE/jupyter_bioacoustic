"""Local filesystem IO backend.

License: BSD 3-Clause
"""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

import soundfile as sf

from . import _shared

#
# Constants
#
DEFAULT_DTYPE = 'float32'

#
# Public API
#
_log = logging.getLogger('jupyter_bioacoustic.audio')


def read(
    src: str,
    dest: str | None = None,
    start_byte: int | None = None,
    end_byte: int | None = None,
    **kwargs: Any,
) -> bytes | str:
    """Read file data from local filesystem."""
    with open(src, 'rb') as f:
        if start_byte is not None:
            f.seek(start_byte)
        if start_byte is not None and end_byte is not None:
            data = f.read(end_byte - start_byte + 1)
        elif end_byte is not None:
            data = f.read(end_byte + 1)
        else:
            data = f.read()

    if dest is None:
        return data

    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def read_segment(
    path: str, start_sec: float, dur_sec: float, **kwargs: Any
) -> tuple[Any, int]:
    """Read audio segment from local file."""
    _log.debug(
        'local read_segment: %s start=%.1fs dur=%.1fs', path, start_sec, dur_sec
    )
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        f.seek(int(start_sec * sr))
        raw = f.read(int(dur_sec * sr), dtype=DEFAULT_DTYPE, always_2d=True)
    _log.debug('local read_segment: %d samples, sr=%d', raw.shape[0], sr)
    return raw, sr


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Write file or directory to local filesystem."""
    if os.path.isdir(src):
        if not recursive:
            raise ValueError(f"src is a directory but recursive=False: {src}")
        if os.path.exists(dest) and not overwrite:
            raise FileExistsError(f"Destination exists and overwrite=False: {dest}")
        shutil.copytree(src, dest, dirs_exist_ok=overwrite)
        return dest
    else:
        if os.path.exists(dest) and not overwrite:
            raise FileExistsError(f"Destination exists and overwrite=False: {dest}")
        _shared.ensure_parent_dirs(dest)
        shutil.copy2(src, dest)
        return dest


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List files in local directory."""
    p = Path(path)
    if not p.is_dir():
        raise ValueError(f"Not a directory: {path}")
    if recursive:
        return sorted(str(f) for f in p.rglob('*') if f.is_file())
    return sorted(str(f) for f in p.iterdir() if f.is_file())
