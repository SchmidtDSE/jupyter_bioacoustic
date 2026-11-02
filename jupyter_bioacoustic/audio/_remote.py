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


#
# Internal
#
_LOG_URI_MAX_LEN = 80
_log = logging.getLogger('jupyter_bioacoustic.audio')
