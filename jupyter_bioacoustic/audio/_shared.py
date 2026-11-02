"""
Audio Shared (Internal)

Shared utilities for audio IO backends: caching, FLAC
header parsing, sample-exact remote FLAC windows, and
path helpers.

License: BSD 3-Clause
"""

from __future__ import annotations

import hashlib
import logging
import os
import struct
from typing import Any

import numpy as np


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

CACHE_DIR = '/tmp/jba_audio_cache'
HEADER_BYTES = 4096

# Caller options passed on to ondio, per scheme.
_ONDIO_OPTIONS = {
    's3': ('profile_name', 'region_name'),
    'gs': ('project', 'credentials'),
}
_HTTPS_OPTIONS = (
    'headers', 'cookies', 'auth', 'verify', 'timeout', 'allow_redirects',
)

last_warning: str | None = None


#
# Public API
#
def cache_path(url_or_uri: str) -> str:
    """Return a local cache file path for a remote URI."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = (
        os.path.splitext(url_or_uri.split('?')[0])[1]
        or '.flac'
    )
    name = hashlib.md5(
        url_or_uri.encode(),
    ).hexdigest() + ext
    return os.path.join(CACHE_DIR, name)


def parse_flac_header(
    header_data: bytes,
) -> tuple[int, float]:
    """Extract sample rate and duration from a FLAC header.

    Returns:
        (sample_rate, duration_seconds)
    """
    if header_data[:4] != b'fLaC':
        _log.error(
            'FLAC header validation failed: got %r',
            header_data[:4],
        )
        raise ValueError('Not a valid FLAC file')
    pos = 4
    while pos < len(header_data) - 34:
        block_type = header_data[pos] & 0x7f
        is_last = (header_data[pos] & 0x80) != 0
        length = struct.unpack(
            '>I', b'\x00' + header_data[pos + 1:pos + 4],
        )[0]
        if block_type == 0:
            si = header_data[pos + 4:pos + 4 + length]
            sample_rate = struct.unpack(
                '>I', b'\x00' + si[10:13],
            )[0] >> 4
            total_samples = (
                struct.unpack(
                    '>Q', b'\x00\x00\x00' + si[13:18],
                )[0]
                & 0xfffffffff
            )
            duration = (
                total_samples / sample_rate
                if sample_rate > 0 else 0
            )
            return sample_rate, duration
        pos += 4 + length
        if is_last:
            break
    _log.error(
        'No STREAMINFO block found in FLAC header '
        '(%d bytes)', len(header_data),
    )
    raise ValueError('No STREAMINFO block found')


def is_flac(path: str) -> bool:
    """Return True if *path* names a FLAC file."""
    return path.split('?')[0].lower().endswith('.flac')


def ondio_kwargs(
    scheme: str, kwargs: dict[str, Any],
) -> dict[str, Any]:
    """Map caller options to ondio backend kwargs.

    Options that the JBA backends ignore are also ignored here.
    """
    if scheme in ('s3', 'gs'):
        # ondio refuses a client together with other options;
        # JBA ignores the other options when a client is given.
        if kwargs.get('client') is not None:
            return {'client': kwargs['client']}
        names = _ONDIO_OPTIONS[scheme]
        return {k: kwargs[k] for k in names if kwargs.get(k)}
    okw = {k: kwargs[k] for k in _HTTPS_OPTIONS if k in kwargs}
    if 'token' in kwargs:
        okw['headers'] = {
            **okw.get('headers', {}),
            'Authorization': f"Bearer {kwargs['token']}",
        }
    return okw


def ondio_backend(uri: str, okw: dict[str, Any]) -> Any:
    """Build the ondio backend for *uri* from mapped caller options."""
    from ondio.registry import get_backend
    return get_backend(uri, **okw)


def read_remote_flac(
    uri: str,
    start_sec: float,
    dur_sec: float,
    **backend_kwargs: Any,
) -> tuple[np.ndarray, int]:
    """Read a window of a remote FLAC with sample-exact ranged reads.

    Returns:
        (raw, sample_rate) where raw is 2-D float32. The window is
        samples [round(start_sec * sr), round((start_sec + dur_sec) * sr)),
        clipped at EOF.
    """
    import ondio

    _log.debug(
        'read_remote_flac: %s start=%.3fs dur=%.3fs',
        uri[:80], start_sec, dur_sec,
    )
    return ondio.read_flac(
        uri, start_sec, start_sec + dur_sec, use_range=True,
        backend=ondio_backend(uri, backend_kwargs),
    )


def ensure_parent_dirs(path: str) -> None:
    """Create parent directories for *path* if needed."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
