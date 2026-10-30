"""HTTPS IO Backend

Audio I/O for HTTPS URLs with support for partial
downloads and range requests.

License: BSD 3-Clause
"""
from __future__ import annotations

import logging
from typing import Any, Optional, Union

import numpy as np

from . import _shared


#
# Constants
#
DEFAULT_TIMEOUT = 120
RANGE_REQUEST_TIMEOUT = 30
CHUNK_SIZE = 8192
LOG_URL_MAX_LEN = 80


#
# Public API
#
def read(
    src: str,
    dest: Optional[str] = None,
    start_byte: Optional[int] = None,
    end_byte: Optional[int] = None,
    **kwargs: Any,
) -> Union[bytes, str]:
    """Read data from an HTTPS URL.

    Args:
        src: URL to read from.
        dest: Local path to write to (returns bytes
            if None).
        start_byte: Starting byte offset.
        end_byte: Ending byte offset.

    Returns:
        Bytes if dest is None, otherwise dest path.
    """
    import requests
    _log.debug(
        'HTTPS read: %s byte_range=%s-%s',
        src[:LOG_URL_MAX_LEN], start_byte, end_byte,
    )

    rk = _request_kwargs(kwargs)

    if start_byte is not None and end_byte is not None:
        rk['headers']['Range'] = (
            f'bytes={start_byte}-{end_byte}'
        )
    elif start_byte is not None:
        rk['headers']['Range'] = f'bytes={start_byte}-'
    elif end_byte is not None:
        rk['headers']['Range'] = f'bytes=0-{end_byte}'

    resp = requests.get(src, stream=True, **rk)
    resp.raise_for_status()
    _log.debug(
        'HTTPS read: status=%d content-length=%s',
        resp.status_code,
        resp.headers.get('Content-Length', 'unknown'),
    )

    if dest is None:
        return resp.content

    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        for chunk in resp.iter_content(CHUNK_SIZE):
            f.write(chunk)
    return dest


def read_segment(
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    fallback: bool = True,
    **kwargs: Any,
) -> tuple[np.ndarray, int]:
    """Read a time segment from an audio file over HTTPS.

    Args:
        path: URL to the audio file.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: Read just the segment's bytes (FLAC/WAV) instead of the whole file. Needs a
            server that honours Range requests (HTTP 206).
        fallback: If the partial read fails (or the format can't be range-read), download the
            whole file into the local cache instead. If False, raise instead.

    Returns:
        (raw, sr) audio segment.
    """
    rk = _request_kwargs(kwargs)
    return _shared.read_segment_remote(
        path, start_sec, dur_sec, partial=partial, fallback=fallback,
        get_size=lambda: _get_size(path, rk),
        get_range=lambda sb, eb: _get_range(path, rk, sb, eb),
        download_to=lambda dest: read(path, dest=dest, **kwargs),
    )


def write(
    src: str, dest: str, **kwargs: Any,
) -> None:
    """Not supported — HTTPS is read-only."""
    raise NotImplementedError(
        "HTTPS is read-only. "
        "Use S3, GCS, or local for writes."
    )


def list_files(
    path: str, **kwargs: Any,
) -> None:
    """Not supported — cannot list files over HTTPS."""
    raise NotImplementedError(
        "Cannot list files over HTTPS."
    )


#
# Internal
#
_log = logging.getLogger('jupyter_bioacoustic.audio')


def _request_kwargs(
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    """Build requests kwargs from caller kwargs."""
    rk: dict[str, Any] = {
        'timeout': kwargs.get(
            'timeout', DEFAULT_TIMEOUT,
        ),
        'verify': kwargs.get('verify', True),
        'allow_redirects': kwargs.get(
            'allow_redirects', True,
        ),
    }
    if 'cookies' in kwargs:
        rk['cookies'] = kwargs['cookies']
    if 'auth' in kwargs:
        rk['auth'] = kwargs['auth']
    if 'headers' in kwargs:
        rk['headers'] = dict(kwargs['headers'])
    else:
        rk['headers'] = {}
    if 'token' in kwargs:
        rk['headers']['Authorization'] = (
            f"Bearer {kwargs['token']}"
        )
    return rk


def _get_size(path: str, rk: dict[str, Any]) -> int:
    """Total size of the resource at ``path`` in bytes (HEAD, else a 1-byte Range GET).

    Args:
        path: URL.
        rk: Request kwargs from ``_request_kwargs`` (auth/headers are sent).

    Returns:
        Size in bytes.

    Raises:
        ValueError: If the server reports neither Content-Length nor Content-Range.
    """
    import requests
    common = {k: rk[k] for k in ('verify', 'cookies', 'auth') if k in rk}
    r = requests.head(path, headers=rk.get('headers', {}), timeout=RANGE_REQUEST_TIMEOUT,
                      allow_redirects=True, **common)
    r.raise_for_status()
    length = r.headers.get('Content-Length')
    if length:
        return int(length)
    r = requests.get(path, headers={**rk.get('headers', {}), 'Range': 'bytes=0-0'},
                     timeout=RANGE_REQUEST_TIMEOUT, **common)
    content_range = r.headers.get('Content-Range', '')
    if '/' in content_range:
        return int(content_range.split('/')[-1])
    raise ValueError('Cannot determine file size')


def _get_range(path: str, rk: dict[str, Any], start_byte: int, end_byte: int) -> bytes:
    """Fetch bytes ``start_byte..end_byte`` (inclusive) of ``path``.

    Args:
        path: URL.
        rk: Request kwargs from ``_request_kwargs``.
        start_byte: First byte.
        end_byte: Last byte (inclusive).

    Returns:
        The bytes.

    Raises:
        ValueError: If the server ignores the Range header (anything but HTTP 206).
    """
    import requests
    headers = {**rk.get('headers', {}), 'Range': f'bytes={start_byte}-{end_byte}'}
    r = requests.get(path, **{**rk, 'headers': headers})
    r.raise_for_status()
    if r.status_code != 206:
        raise ValueError(f'Server returned {r.status_code} instead of 206')
    return r.content
