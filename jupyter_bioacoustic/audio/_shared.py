"""
Audio Shared (Internal)

Small helpers shared by the audio IO backends: the local cache for full remote downloads, the
remote ``read_segment`` flow (cache -> partial read -> full download), bucket-URI parsing,
Range headers, writing downloaded bytes, and walking a directory to upload.

The byte-range readers themselves live in ``_partial``.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import hashlib
import logging
import os
from typing import Callable, Iterable, Iterator, Optional, Union

import numpy as np

from ._partial import read_remote_partial


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

CACHE_DIR = '/tmp/jba_audio_cache'
PATH_SEPARATOR = '/'                    # object-store key separator (S3 and GCS)

# Module state: the warning from the last ``read_segment`` (e.g. a partial-read fallback), shown
# to the user by the annotator. ``io.read_segment`` clears it before each read.
last_warning: str | None = None


#
# PUBLIC
#
def cache_path(url_or_uri: str) -> str:
    """Return the local cache file path for a remote URI (creating the cache dir).

    Args:
        url_or_uri: Remote URL or URI.

    Returns:
        ``CACHE_DIR/<md5 of the URI><extension>``; the extension defaults to ``.flac``.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = (
        os.path.splitext(url_or_uri.split('?')[0])[1]
        or '.flac'
    )
    name = hashlib.md5(
        url_or_uri.encode(),
    ).hexdigest() + ext
    return os.path.join(CACHE_DIR, name)


def read_segment_remote(
    path: str,
    start_sec: float,
    dur_sec: float,
    *,
    partial: bool,
    fallback: bool,
    get_size: Callable[[], int],
    get_range: Callable[[int, int], bytes],
    download_to: Callable[[str], None],
) -> tuple[np.ndarray, int]:
    """Read a time window of a remote file: cache, then partial read, then full download.

    Shared by the S3, GCS and HTTPS backends:

    1. If the whole file is already in the local cache, read from it.
    2. If ``partial``, range-read just the window (``_partial.read_remote_partial``).
    3. Otherwise, or if the partial read fails and ``fallback`` is True, download the whole
       file into the cache (atomically: a failed download never leaves a truncated cache file)
       and read the window locally.

    Args:
        path: Remote URI (used for the cache file name and logging).
        start_sec: Window start in seconds.
        dur_sec: Window duration in seconds.
        partial: Try a byte-range read first.
        fallback: If the partial read fails, download the whole file. If False, raise instead.
        get_size: Callable returning the total file size in bytes.
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        download_to: Callable that downloads the whole file to a local path.

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels).

    Raises:
        Exception: Whatever the partial read raised, when ``fallback`` is False.
    """
    from . import io_local
    cache = cache_path(path)
    if os.path.exists(cache):
        _log.debug('using cached full download: %s', cache)
        return io_local.read_segment(cache, start_sec, dur_sec)
    if partial:
        try:
            return read_remote_partial(start_sec, dur_sec, get_size, get_range)
        except Exception as e:
            if not fallback:
                raise
            global last_warning
            last_warning = (f'Partial download failed ({type(e).__name__}: {e}). '
                            f'Downloading the full file instead')
            _log.warning('%s: %s', path, last_warning)
    _log.debug('full download: %s -> %s', path, cache)
    part = f'{cache}.{os.getpid()}.part'
    try:
        download_to(part)
        os.replace(part, cache)
    finally:
        if os.path.exists(part):
            os.remove(part)
    return io_local.read_segment(cache, start_sec, dur_sec)


def ensure_parent_dirs(path: str) -> None:
    """Create the parent directories of ``path`` if needed.

    Args:
        path: A file path.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def split_bucket_uri(uri: str, scheme: str) -> tuple[str, str]:
    """Split an object-store URI into bucket and key.

    ``s3://bucket/a/b`` -> ``('bucket', 'a/b')``; ``s3://bucket`` -> ``('bucket', '')``.

    Args:
        uri: The URI (the scheme prefix is optional).
        scheme: The scheme prefix, e.g. ``'s3://'`` or ``'gs://'``.

    Returns:
        (bucket, key); key is ``''`` for the bucket root.
    """
    path = uri[len(scheme):] if uri.startswith(scheme) else uri
    bucket, _, key = path.partition(PATH_SEPARATOR)
    return bucket, key


def range_header(start_byte: Optional[int], end_byte: Optional[int]) -> Optional[str]:
    """Build an HTTP/S3 ``Range`` header value from optional inclusive byte bounds.

    Args:
        start_byte: First byte, or None to start at 0.
        end_byte: Last byte (inclusive), or None to read to the end.

    Returns:
        ``'bytes=<start>-<end>'`` (either side may be open), or None if both are None.
    """
    if start_byte is not None and end_byte is not None:
        return f'bytes={start_byte}-{end_byte}'
    if start_byte is not None:
        return f'bytes={start_byte}-'
    if end_byte is not None:
        return f'bytes=0-{end_byte}'
    return None


def save_or_return(data: bytes, dest: Optional[str]) -> Union[bytes, str]:
    """Return ``data``, or write it to ``dest`` and return ``dest`` (the backends' ``read``).

    Args:
        data: Bytes that were read.
        dest: Local destination path, or None to return the bytes.

    Returns:
        ``data`` if ``dest`` is None, else ``dest``.
    """
    if dest is None:
        return data
    return write_chunks([data], dest)


def write_chunks(chunks: Iterable[bytes], dest: str) -> str:
    """Write byte chunks to a local file, creating its parent directories.

    Args:
        chunks: Bytes to write, in order.
        dest: Local destination path.

    Returns:
        ``dest``.
    """
    ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        for chunk in chunks:
            f.write(chunk)
    return dest


def is_directory_upload(src: str, recursive: bool) -> bool:
    """Whether a ``write`` source is a directory (which needs ``recursive=True``).

    Args:
        src: Local source path.
        recursive: The caller's ``recursive`` flag.

    Returns:
        True if ``src`` is a directory.

    Raises:
        ValueError: If ``src`` is a directory but ``recursive`` is False.
    """
    if not os.path.isdir(src):
        return False
    if not recursive:
        raise ValueError(f"src is a directory but recursive=False: {src}")
    return True


def iter_upload_keys(src_dir: str, prefix: str) -> Iterator[tuple[str, str]]:
    """Walk a local directory and pair each file with its object-store key under ``prefix``.

    Args:
        src_dir: Local directory to upload.
        prefix: Destination key prefix (a trailing ``/`` is optional).

    Yields:
        (local_path, key) for every file under ``src_dir``.
    """
    for root, _dirs, files in os.walk(src_dir):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel_path = os.path.relpath(local_path, src_dir)
            key = (prefix.rstrip(PATH_SEPARATOR) + PATH_SEPARATOR
                   + rel_path.replace(os.sep, PATH_SEPARATOR))
            yield local_path, key


def list_prefix(prefix: str) -> str:
    """Normalise a listing prefix so it names a "directory".

    Args:
        prefix: Key prefix from the URI; ``''`` means the bucket root.

    Returns:
        ``prefix`` with a trailing ``/`` (unchanged when empty or already ending in ``/``).
    """
    if prefix and not prefix.endswith(PATH_SEPARATOR):
        prefix += PATH_SEPARATOR
    return prefix
