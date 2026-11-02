"""
Audio IO

Read and write files on local disk, S3, GCS and HTTPS, through
ondio. ondio selects the backend from the URI scheme.

    from jupyter_bioacoustic.audio import io
    data = io.read('s3://bucket/key.flac')
    raw, sr = io.read_segment('gs://b/k.flac', 0, 15)
    io.write('local.csv', 's3://bucket/out.csv')

License: BSD 3-Clause
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import ondio
from ondio import ObjectExistsError, OndioError

from . import _shared


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

_LOG_URI_MAX_LEN = 80


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
    """Read a file, or bytes start_byte..end_byte (inclusive) of it.

    Returns:
        dest path (str) if dest provided, else bytes.
    """
    backend = _backend(src, kwargs)
    _log.debug('read: %s byte_range=%s-%s', src[:_LOG_URI_MAX_LEN],
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
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    **kwargs: Any,
) -> Any:
    """Read a decoded audio segment from any source.

    A local file is decoded in place. For a remote FLAC with *partial*,
    read only the bytes of the window. If that fails, or for other remote
    formats, decode the window from a cached full download.

    Returns:
        (raw, sr): raw is 2-D float32 numpy array,
        sr is the sample rate.
    """
    _shared.last_warning = None
    okw = _shared.ondio_kwargs(path, kwargs)
    _log.debug('read_segment: path=%s start=%.1f dur=%.1f',
               path[:_LOG_URI_MAX_LEN], start_sec, dur_sec)
    if _shared.platform(path) == 'local':
        return _shared.decode_window(path, start_sec, dur_sec)

    if partial and _shared.is_flac(path):
        try:
            return _shared.read_remote_flac(path, start_sec, dur_sec, **okw)
        # A bad window is ValueError. Both fall back.
        except (OndioError, ValueError) as e:
            msg = (f'Partial download failed ({type(e).__name__}: {e}). '
                   f'Falling back to full download')
            _log.warning(msg)
            _shared.last_warning = msg

    cache = _shared.cache_path(path)
    if os.path.exists(cache):
        _log.debug('using cached file: %s', cache)
    else:
        # ondio.download writes the file only when the download is complete,
        # so a failed download leaves no cache file, and the next call retries.
        _log.debug('downloading full file to cache: %s', cache)
        ondio.download(path, cache, backend=_shared.ondio_backend(path, okw))
    return _shared.decode_window(cache, start_sec, dur_sec)


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any,
) -> str:
    """Write a local file, or a local folder with *recursive*, to *dest*.

    With *overwrite* False, each file is written only if no file exists at
    its destination, and FileExistsError is raised if one exists. That file
    does not change. In a folder, files that were written before the error
    stay. HTTPS is read-only.

    Returns:
        Destination path/URI (str).
    """
    kind = _shared.platform(dest)
    if kind == 'url':
        raise NotImplementedError('HTTPS is read-only: write is not supported')
    is_dir = os.path.isdir(src)
    if is_dir and not recursive:
        raise ValueError(f'src is a directory but recursive=False: {src}')
    backend = _backend(dest, kwargs)
    try:
        if not is_dir:
            ondio.upload(dest, src, overwrite=overwrite, backend=backend)
        else:
            # ondio does not promise that a shared GCS client is
            # thread-safe, so GCS uploads one file at a time.
            ondio.upload_files(
                dest, src, overwrite=overwrite, backend=backend,
                max_workers=1 if kind == 'gcs' else None,
            )
    except ObjectExistsError as e:
        raise FileExistsError(f'{e} (exists and overwrite=False)') from e
    _log.info('write: %s -> %s', src[:_LOG_URI_MAX_LEN],
              dest[:_LOG_URI_MAX_LEN])
    return dest


def list_files(
    path: str,
    recursive: bool = False,
    **kwargs: Any,
) -> list[str]:
    """List the files in the folder *path*, sorted.

    Without *recursive*, list only the files directly in the folder.
    HTTPS cannot be listed.

    Returns:
        Sorted list of full paths/URIs.
    """
    if _shared.platform(path) == 'url':
        raise NotImplementedError('HTTPS is read-only: list_files is not '
                                  'supported')
    folder = path.rstrip('/') + '/'
    backend = _backend(folder, kwargs)
    _log.debug('list_files: %s recursive=%s', folder, recursive)
    # ondio's default is recursive=True, so always pass it.
    return ondio.list_files(folder, recursive=recursive, backend=backend)


#
# Internal
#
def _backend(uri: str, kwargs: dict[str, Any]) -> Any:
    return _shared.ondio_backend(uri, _shared.ondio_kwargs(uri, kwargs))
