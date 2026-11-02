"""
Audio Shared (Internal)

Helpers for audio IO: caching, ondio backends and their
options, sample-exact remote FLAC windows, the local window
decode, and path helpers.

License: BSD 3-Clause
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import numpy as np
import soundfile as sf


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

CACHE_DIR = '/tmp/jba_audio_cache'
DEFAULT_DTYPE = 'float32'

# Caller options passed on to ondio, per ondio platform.
_ONDIO_OPTIONS = {
    'aws': ('profile_name', 'region_name', 'aws_access_key_id',
            'aws_secret_access_key', 'aws_session_token'),
    'gcs': ('project', 'credentials'),
}
_HTTPS_OPTIONS = (
    'headers', 'cookies', 'auth', 'verify', 'timeout', 'allow_redirects',
)
# Every option that a caller can give. A backend ignores the options of
# other backends.
_KNOWN_OPTIONS = frozenset(
    ('client', 'token', *_HTTPS_OPTIONS,
     *(n for names in _ONDIO_OPTIONS.values() for n in names)),
)

# ondio options for a backend with no credentials, for public buckets.
PUBLIC_OPTIONS: dict[str, Any] = {'anonymous': True}

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


def is_flac(path: str) -> bool:
    """Return True if *path* names a FLAC file."""
    return path.split('?')[0].lower().endswith('.flac')


def platform(uri: str) -> str:
    """Return the ondio platform of *uri*: aws, gcs, url or local.

    Raises:
        UnknownPlatformError: For a scheme that ondio does not know.
    """
    from ondio.registry import detect_platform
    return detect_platform(uri)


def ondio_kwargs(
    uri: str, kwargs: dict[str, Any],
) -> dict[str, Any]:
    """Map caller options to ondio backend kwargs for *uri*.

    Options of other backends are ignored.

    Raises:
        TypeError: For an option that no backend takes.
        UnknownPlatformError: For a scheme that ondio does not know.
    """
    unknown = sorted(set(kwargs) - _KNOWN_OPTIONS)
    if unknown:
        raise TypeError(
            f'unexpected keyword argument(s): {", ".join(unknown)}',
        )
    kind = platform(uri)
    if kind == 'local':
        return {}
    if kind in _ONDIO_OPTIONS:
        # ondio refuses a client together with other options;
        # JBA ignores the other options when a client is given.
        if kwargs.get('client') is not None:
            return {'client': kwargs['client']}
        names = _ONDIO_OPTIONS[kind]
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


def decode_window(
    path: str, start_sec: float, dur_sec: float,
) -> tuple[np.ndarray, int]:
    """Decode a window of a local audio file as (raw, sr).

    The window is samples [round(start_sec * sr),
    round((start_sec + dur_sec) * sr)), clipped at EOF. raw is 2-D float32.
    """
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        first = round(start_sec * sr)
        stop = round((start_sec + dur_sec) * sr)
        f.seek(first)
        raw = f.read(stop - first, dtype=DEFAULT_DTYPE, always_2d=True)
    _log.debug('decode_window: %d samples, sr=%d', raw.shape[0], sr)
    return raw, sr


def ensure_parent_dirs(path: str) -> None:
    """Create parent directories for *path* if needed."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
