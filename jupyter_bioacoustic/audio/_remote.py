"""Remote IO through ondio

The S3, GCS and HTTPS handlers call these functions with their scheme.

License: BSD 3-Clause
"""
from __future__ import annotations

import logging
import os
from typing import Any

import ondio
from ondio import OndioError

from . import _shared

#
# Constants
#
# The URI prefixes that each handler takes. io._handler sends http:// and
# https:// to the HTTPS handler.
_SCHEMES: dict[str, tuple[str, ...]] = {
    's3': ('s3://',),
    'gs': ('gs://',),
    'https': ('http://', 'https://'),
}


#
# Public API
#
def read(
    scheme: str,
    src: str,
    dest: str | None = None,
    start_byte: int | None = None,
    end_byte: int | None = None,
    **kwargs: Any,
) -> bytes | str:
    """Read a remote object, or bytes start_byte..end_byte (inclusive) of it.

    Returns the bytes, or *dest* when *dest* is given.
    """
    _shared.check_scheme(src, _SCHEMES[scheme])
    backend = _shared.ondio_backend(src, _shared.ondio_kwargs(scheme, kwargs))
    _log.debug('%s read: %s byte_range=%s-%s', scheme, src[:_LOG_URI_MAX_LEN],
               start_byte, end_byte)
    if start_byte is None and end_byte is None:
        if dest is None:
            return ondio.read(src, backend=backend)
        ondio.download(src, dest, backend=backend)
        return dest

    data = ondio.read_range(src, start_byte or 0, end_byte, backend=backend)
    if dest is None:
        return data
    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def read_segment(
    scheme: str,
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    **kwargs: Any,
) -> Any:
    """Read a time window of a remote audio file as (raw, sr).

    For FLAC with *partial*, read only the bytes of the window. If that fails,
    or for other formats, read the window from a cached full download.
    """
    _shared.check_scheme(path, _SCHEMES[scheme])
    okw = _shared.ondio_kwargs(scheme, kwargs)
    if partial and _shared.is_flac(path):
        try:
            return _shared.read_remote_flac(path, start_sec, dur_sec, **okw)
        # A bad window is ValueError. Both fall back, as before.
        except (OndioError, ValueError) as e:
            msg = (f'Partial download failed ({type(e).__name__}: {e}). '
                   f'Falling back to full download')
            _log.warning(msg)
            _shared.last_warning = msg

    cache = _shared.cache_path(path)
    if os.path.exists(cache):
        _log.debug('%s using cached file: %s', scheme, cache)
    else:
        # ondio.download writes the file only when the download is complete,
        # so a failed download leaves no cache file, and the next call retries.
        _log.debug('%s downloading full file to cache: %s', scheme, cache)
        ondio.download(path, cache, backend=_shared.ondio_backend(path, okw))
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


def write(
    scheme: str,
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Upload a local file, or a local folder with *recursive*, to *dest*.

    With *overwrite* False, stop with FileExistsError at the first object
    that exists. Files uploaded before it stay. Returns *dest*.
    """
    _shared.check_scheme(dest, _SCHEMES[scheme])
    backend = _shared.ondio_backend(dest, _shared.ondio_kwargs(scheme, kwargs))
    if not os.path.isdir(src):
        _upload(src, dest, overwrite, backend)
        _log.info('%s write: uploaded %s -> %s', scheme, src, dest)
        return dest

    if not recursive:
        raise ValueError(f'src is a directory but recursive=False: {src}')
    count = 0
    for root, _dirs, files in os.walk(src):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel = os.path.relpath(local_path, src).replace(os.sep, '/')
            _upload(local_path, f"{dest.rstrip('/')}/{rel}", overwrite, backend)
            count += 1
    _log.info('%s write: uploaded %d files to %s', scheme, count, dest)
    return dest


def list_files(
    scheme: str,
    path: str,
    recursive: bool = False,
    **kwargs: Any,
) -> list[str]:
    """List the objects in the folder *path*, sorted.

    Without *recursive*, list only the objects directly in the folder.
    """
    _shared.check_scheme(path, _SCHEMES[scheme])
    folder = path.rstrip('/') + '/'
    backend = _shared.ondio_backend(folder, _shared.ondio_kwargs(scheme, kwargs))
    _log.debug('%s list_files: %s recursive=%s', scheme, folder, recursive)
    # ondio's default is recursive=True, so always pass it.
    return ondio.list_files(folder, recursive=recursive, backend=backend)


#
# Internal
#
def _upload(src: str, dest: str, overwrite: bool, backend: Any) -> None:
    if not overwrite and ondio.exists(dest, backend=backend):
        raise FileExistsError(f'{dest} exists and overwrite=False')
    ondio.upload(dest, src, backend=backend)
    _log.debug('uploaded %s -> %s', src, dest)


_LOG_URI_MAX_LEN = 80
_log = logging.getLogger('jupyter_bioacoustic.audio')
