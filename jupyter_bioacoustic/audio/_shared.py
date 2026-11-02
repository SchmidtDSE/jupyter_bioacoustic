"""
Audio Shared (Internal)

Shared utilities for audio IO backends: caching, ondio
backends, sample-exact remote FLAC windows, and path
helpers.

License: BSD 3-Clause
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import numpy as np


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

CACHE_DIR = '/tmp/jba_audio_cache'

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


def check_scheme(path: str, schemes: tuple[str, ...]) -> None:
    """Raise ValueError if *path* does not start with one of *schemes*.

    ``platform=`` can send a path to a handler of another scheme. ondio
    selects its backend from the URI, so without this check a local path
    sent to the S3 handler would be read from disk.
    """
    if not path.startswith(schemes):
        raise ValueError(f'{path!r} does not start with {" or ".join(schemes)}')


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


def normalize_gs(uri: str) -> str:
    """Rewrite a leading gcs:// to gs://. ondio knows only gs://."""
    if uri.startswith('gcs://'):
        return 'gs://' + uri[len('gcs://'):]
    return uri


def public_backend(uri: str) -> Any:
    """Build an ondio backend with no credentials, for a public bucket.

    S3 uses an unsigned client and GCS an anonymous client.
    """
    if uri.startswith('s3://'):
        import boto3
        from botocore import UNSIGNED
        from botocore.config import Config
        from ondio.backends.aws import AwsBackend
        return AwsBackend(client=boto3.client(
            's3', config=Config(signature_version=UNSIGNED),
        ))
    if uri.startswith('gs://'):
        from google.cloud import storage
        from ondio.backends.gcs import GcsBackend
        return GcsBackend(client=storage.Client.create_anonymous_client())
    raise ValueError(f'no public backend for {uri!r}')


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
