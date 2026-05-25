"""HTTPS IO Backend

Audio I/O for HTTPS URLs with support for partial
downloads and range requests.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Any, Optional, Union

from . import _shared


#
# Constants
#
DEFAULT_TIMEOUT = 120
RANGE_REQUEST_TIMEOUT = 30
CHUNK_SIZE = 8192
HEADER_RANGE_SIZE = 4095
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
    **kwargs: Any,
) -> Any:
    """Read a time segment from an audio file over HTTPS.

    Args:
        path: URL to the audio file.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: Attempt partial download optimisation.

    Returns:
        (raw, sr) audio segment.
    """
    import requests

    rk = _request_kwargs(kwargs)
    if partial:
        _log.debug(
            'HTTPS partial read: %s  '
            'start=%.1fs dur=%.1fs',
            path[:LOG_URL_MAX_LEN], start_sec, dur_sec,
        )
        try:
            result = _read_partial(
                path, start_sec, dur_sec, rk,
            )
            _log.debug(
                'HTTPS partial read succeeded: %s',
                path[:LOG_URL_MAX_LEN],
            )
            return result
        except Exception as e:
            msg = (
                f'Partial download failed '
                f'({type(e).__name__}: {e}). '
                f'Falling back to full download'
            )
            _log.warning(msg)
            _shared.last_warning = msg

    _log.debug(
        'HTTPS full download: %s',
        path[:LOG_URL_MAX_LEN],
    )
    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        import requests as req
        resp = req.get(path, stream=True, **rk)
        resp.raise_for_status()
        with open(cache, 'wb') as f:
            for chunk in resp.iter_content(CHUNK_SIZE):
                f.write(chunk)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


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


def _read_partial(
    path: str,
    start_sec: float,
    dur_sec: float,
    rk: dict[str, Any],
) -> Any:
    """Perform partial byte-range download."""
    import requests

    def get_header() -> bytes:
        h = dict(rk.get('headers', {}))
        h['Range'] = f'bytes=0-{HEADER_RANGE_SIZE}'
        r = requests.get(
            path, headers=h,
            timeout=rk.get('timeout', DEFAULT_TIMEOUT),
            verify=rk.get('verify', True),
            cookies=rk.get('cookies'),
            auth=rk.get('auth'),
        )
        r.raise_for_status()
        if r.status_code != 206:
            raise ValueError(
                f'Server returned {r.status_code} '
                f'instead of 206'
            )
        return r.content

    def get_size() -> int:
        r = requests.head(
            path, timeout=RANGE_REQUEST_TIMEOUT,
            allow_redirects=True,
            verify=rk.get('verify', True),
            cookies=rk.get('cookies'),
            auth=rk.get('auth'),
        )
        r.raise_for_status()
        length = r.headers.get('Content-Length')
        if length:
            return int(length)
        r2 = requests.get(
            path, headers={'Range': 'bytes=0-0'},
            timeout=RANGE_REQUEST_TIMEOUT,
            verify=rk.get('verify', True),
            cookies=rk.get('cookies'),
            auth=rk.get('auth'),
        )
        cr = r2.headers.get('Content-Range', '')
        if '/' in cr:
            return int(cr.split('/')[-1])
        raise ValueError('Cannot determine file size')

    def get_range(sb: int, eb: int) -> bytes:
        h = dict(rk.get('headers', {}))
        h['Range'] = f'bytes={sb}-{eb}'
        r = requests.get(
            path, headers=h,
            timeout=rk.get('timeout', DEFAULT_TIMEOUT),
            verify=rk.get('verify', True),
            cookies=rk.get('cookies'),
            auth=rk.get('auth'),
        )
        r.raise_for_status()
        if r.status_code != 206:
            raise ValueError(
                f'Server returned {r.status_code} '
                f'instead of 206'
            )
        return r.content

    return _shared.read_remote_partial(
        start_sec, dur_sec,
        get_header, get_size, get_range,
    )
