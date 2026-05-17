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

from __future__ import annotations

import logging
from typing import Any, Optional

from . import io_local, io_aws, io_gcs, io_https


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

_PLATFORM_MAP = {
    'aws': io_aws, 's3': io_aws,
    'gcs': io_gcs, 'gs': io_gcs,
    'https': io_https, 'http': io_https,
    'url': io_https,
    'local': io_local,
}


#
# Public API
#
def read(
    src: str,
    dest: Optional[str] = None,
    start_byte: Optional[int] = None,
    end_byte: Optional[int] = None,
    **kwargs: Any,
) -> Any:
    """Read a file from any supported source.

    Returns:
        dest path (str) if dest provided, else bytes.
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
    **kwargs: Any,
) -> Any:
    """Read a decoded audio segment from any source.

    Returns:
        (raw, sr): raw is 2-D float32 numpy array,
        sr is the sample rate.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    _log.debug(
        'read_segment: path=%s start=%.1f '
        'dur=%.1f handler=%s',
        path[:80], start_sec, dur_sec, handler.__name__,
    )
    return handler.read_segment(
        path, start_sec, dur_sec,
        partial=partial, **kwargs,
    )


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Write a file or directory to any destination.

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

    Returns:
        Sorted list of full paths/URIs.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    return handler.list_files(
        path, recursive=recursive, **kwargs,
    )


#
# Internal
#
def _handler(path: str, platform: Optional[str] = None):
    """Select the IO backend for a given path/URI."""
    if platform:
        return _PLATFORM_MAP[platform]
    if path.startswith('s3://'):
        return io_aws
    if path.startswith('gs://'):
        return io_gcs
    if path.startswith(('http://', 'https://')):
        return io_https
    return io_local
