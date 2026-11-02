"""
Audio IO (Router)

Unified IO for reading and writing files across local,
S3, GCS, and HTTPS. Dispatches to backend modules based
on URI scheme.

    from jupyter_bioacoustic.audio import io
    data = io.read('s3://bucket/key.flac')
    raw, sr = io.read_segment('gs://b/k.flac', 0, 15)
    io.write('local.csv', 's3://bucket/out.csv')

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
from types import ModuleType
from typing import Any, Optional, Union

import numpy as np

from . import _shared, io_aws, io_gcs, io_https, io_local


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

_PLATFORM_MAP: dict[str, ModuleType] = {
    'aws': io_aws, 's3': io_aws,
    'gcs': io_gcs, 'gs': io_gcs,
    'https': io_https, 'http': io_https,
    'url': io_https,
    'local': io_local,
}


#
# PUBLIC
#
def read(
    src: str,
    dest: Optional[str] = None,
    start_byte: Optional[int] = None,
    end_byte: Optional[int] = None,
    **kwargs: Any,
) -> Union[bytes, str]:
    """Read a file (optionally a byte range) from any supported source.

    Args:
        src: Local path or s3:// / gs:// / http(s):// URI.
        dest: Local path to save the bytes to (optional).
        start_byte: First byte (optional).
        end_byte: Last byte, inclusive (optional).
        **kwargs: Backend options (client, credentials, platform, ...).

    Returns:
        ``dest`` if given, else the bytes.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(src, platform)
    _log.debug(
        'read: src=%s handler=%s',
        src[:80], handler.__name__,
    )
    return handler.read(
        src, dest=dest,
        start_byte=start_byte,
        end_byte=end_byte,
        **kwargs,
    )


def read_segment(
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    fallback: bool = True,
    **kwargs: Any,
) -> tuple[np.ndarray, int]:
    """Read a decoded audio segment from any source.

    Clears ``_shared.last_warning`` first, so after the call it holds only this read's
    warning (if any).

    Args:
        path: Local path or s3:// / gs:// / http(s):// URI.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: For remote files, read just the segment's bytes (FLAC and WAV) instead of
            downloading the whole file.
        fallback: For remote files, if the partial read fails (or the format can't be
            range-read), download the whole file into the local cache instead. If False,
            raise instead.
        **kwargs: Backend options (client, credentials, platform, ...).

    Returns:
        (raw, sr): raw is 2-D float32 numpy array,
        sr is the sample rate.
    """
    _shared.last_warning = None

    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    _log.debug(
        'read_segment: path=%s start=%.1f '
        'dur=%.1f handler=%s',
        path[:80], start_sec, dur_sec, handler.__name__,
    )
    return handler.read_segment(
        path, start_sec, dur_sec,
        partial=partial, fallback=fallback, **kwargs,
    )


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Write a local file or directory to any destination.

    Args:
        src: Local source file or directory.
        dest: Destination path or URI (picks the backend).
        recursive: Required to write a directory.
        overwrite: If False, refuse to replace existing files/objects.
        **kwargs: Backend options (client, credentials, platform, ...).

    Returns:
        Destination path/URI (str).
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(dest, platform)
    _log.info(
        'write: src=%s dest=%s handler=%s',
        src[:80], dest[:80], handler.__name__,
    )
    return handler.write(
        src, dest,
        recursive=recursive,
        overwrite=overwrite,
        **kwargs,
    )


def list_files(
    path: str,
    recursive: bool = False,
    **kwargs: Any,
) -> list[str]:
    """List files at a path or prefix.

    Args:
        path: Local directory or s3:// / gs:// prefix.
        recursive: Also list files in subdirectories.
        **kwargs: Backend options (client, credentials, platform, ...).

    Returns:
        Sorted list of full paths/URIs.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    return handler.list_files(
        path, recursive=recursive, **kwargs,
    )


#
# INTERNAL
#
def _handler(path: str, platform: Optional[str] = None) -> ModuleType:
    """Select the IO backend module for a path/URI.

    Args:
        path: Local path or URI.
        platform: Explicit backend name (a ``_PLATFORM_MAP`` key) that overrides the scheme.

    Returns:
        The backend module (``io_aws``, ``io_gcs``, ``io_https`` or ``io_local``).

    Raises:
        KeyError: If ``platform`` is not a known backend name.
    """
    if platform:
        return _PLATFORM_MAP[platform]
    if path.startswith('s3://'):
        return io_aws
    if path.startswith('gs://'):
        return io_gcs
    if path.startswith(('http://', 'https://')):
        return io_https
    return io_local
