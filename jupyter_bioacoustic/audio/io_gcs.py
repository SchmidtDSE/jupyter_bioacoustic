"""
GCS IO Backend

Audio file IO for Google Cloud Storage (``gs://bucket/blob``). Needs ``google-cloud-storage``
(``pip install 'jupyter-bioacoustic[gcs]'``).

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from . import _shared


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

_GCS_URI_PREFIX: str = 'gs://'


#
# PUBLIC
#
def read(src: str, dest: str | None = None, start_byte: int | None = None,
         end_byte: int | None = None, **kwargs: Any) -> bytes | str:
    """Read data from a GCS blob, optionally a byte range.

    Args:
        src: gs:// URI of the blob.
        dest: Local destination path (optional).
        start_byte: First byte (optional).
        end_byte: Last byte, inclusive (optional).
        **kwargs: Additional arguments including client, project and credentials.

    Returns:
        The bytes if ``dest`` is None, otherwise ``dest``.
    """
    bucket_name, blob_name = _parse_gcs_uri(src)
    _log.debug('GCS read: bucket=%s blob=%s byte_range=%s-%s', bucket_name,
               blob_name, start_byte, end_byte)
    client = kwargs.get('client') or _get_client(**kwargs)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    if start_byte is not None or end_byte is not None:
        data = blob.download_as_bytes(
            start=start_byte or 0,
            end=end_byte,
        )
    else:
        data = blob.download_as_bytes()
    return _shared.save_or_return(data, dest)


def read_segment(path: str, start_sec: float, dur_sec: float, partial: bool = True,
                 fallback: bool = True, **kwargs: Any) -> tuple[np.ndarray, int]:
    """Read a time segment from a GCS audio blob.

    Args:
        path: gs:// URI of the audio file.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: Read just the segment's bytes (FLAC/WAV) instead of the whole file.
        fallback: If the partial read fails (or the format can't be range-read), download the
            whole file into the local cache instead. If False, raise instead.
        **kwargs: Additional arguments including client, project and credentials.

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels).
    """
    bucket_name, blob_name = _parse_gcs_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)
    blob = client.bucket(bucket_name).blob(blob_name)
    return _shared.read_segment_remote(
        path, start_sec, dur_sec, partial=partial, fallback=fallback,
        get_size=lambda: _blob_size(blob),
        get_range=lambda sb, eb: blob.download_as_bytes(start=sb, end=eb),
        download_to=blob.download_to_filename,
    )


def write(src: str, dest: str, recursive: bool = False, overwrite: bool = True,
          **kwargs: Any) -> str:
    """Upload a local file or directory to GCS.

    Args:
        src: Local source file or directory.
        dest: gs:// destination URI (a prefix for a directory).
        recursive: Required to upload a directory.
        overwrite: If False, refuse to replace existing blobs.
        **kwargs: Additional arguments including client, project and credentials.

    Returns:
        ``dest``.

    Raises:
        ValueError: If ``src`` is a directory and ``recursive`` is False.
        FileExistsError: If a blob exists and ``overwrite`` is False.
    """
    bucket_name, prefix = _parse_gcs_uri(dest)
    client = kwargs.get('client') or _get_client(**kwargs)
    bucket = client.bucket(bucket_name)

    if _shared.is_directory_upload(src, recursive):
        for local_path, blob_name in _shared.iter_upload_keys(src, prefix):
            blob = bucket.blob(blob_name)
            if not overwrite:
                _raise_if_exists(blob, bucket_name, blob_name)
            blob.upload_from_filename(local_path)
            _log.debug('uploaded %s -> gs://%s/%s', local_path,
                       bucket_name, blob_name)
        _log.info('GCS write: uploaded directory to %s', dest)
        return dest

    blob = bucket.blob(prefix)
    if not overwrite:
        _raise_if_exists(blob, bucket_name, prefix)
    blob.upload_from_filename(src)
    _log.info('GCS write: uploaded %s -> gs://%s/%s', src, bucket_name,
              prefix)
    return dest


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List the blobs under a GCS prefix.

    Args:
        path: gs:// URI of a bucket or prefix.
        recursive: Also list blobs in "subdirectories".
        **kwargs: Additional arguments including client, project and credentials.

    Returns:
        Sorted gs:// URIs.
    """
    bucket_name, prefix = _parse_gcs_uri(path)
    _log.debug('GCS list_files: bucket=%s prefix=%s recursive=%s', bucket_name,
               prefix, recursive)
    client = kwargs.get('client') or _get_client(**kwargs)
    prefix = _shared.list_prefix(prefix)

    list_kwargs = {'prefix': prefix}
    if not recursive:
        list_kwargs['delimiter'] = _shared.PATH_SEPARATOR

    results = []
    for blob in client.list_blobs(bucket_name, **list_kwargs):
        if blob.name != prefix:
            results.append(f'gs://{bucket_name}/{blob.name}')

    return sorted(results)


#
# INTERNAL
#
def _parse_gcs_uri(uri: str) -> tuple[str, str]:
    """Split a GCS URI: ``gs://bucket/a/b`` -> ``('bucket', 'a/b')``; ``gs://bucket`` -> ``''``.

    Args:
        uri: gs:// URI.

    Returns:
        (bucket, blob name).
    """
    return _shared.split_bucket_uri(uri, _GCS_URI_PREFIX)


def _get_client(project: str | None = None, credentials: Any | None = None,
                **kwargs: Any) -> Any:
    """Create a google-cloud-storage client (optionally for a project / with credentials).

    Args:
        project: GCP project id (optional).
        credentials: google-auth credentials (optional).
        **kwargs: Ignored (the caller's other backend options).

    Returns:
        A ``google.cloud.storage.Client``.

    Raises:
        ImportError: If google-cloud-storage isn't installed.
    """
    try:
        from google.cloud import storage
    except ImportError as e:
        raise ImportError(
            "gs:// paths need google-cloud-storage: pip install 'jupyter-bioacoustic[gcs]'"
        ) from e
    client_kwargs = {}
    if project:
        client_kwargs['project'] = project
    if credentials:
        client_kwargs['credentials'] = credentials
    return storage.Client(**client_kwargs)


def _blob_size(blob: Any) -> int:
    """Return a blob's size in bytes (reloads its metadata).

    Args:
        blob: A ``google.cloud.storage.Blob``.

    Returns:
        Size in bytes.

    Raises:
        ValueError: If GCS reports no size.
    """
    blob.reload()
    if blob.size is None:
        _log.error('GCS blob size is None for %s', blob.name)
        raise ValueError('Could not determine blob size')
    return blob.size


def _raise_if_exists(blob: Any, bucket_name: str, blob_name: str) -> None:
    """Raise if ``blob`` exists (used when ``overwrite=False``).

    Args:
        blob: The destination ``google.cloud.storage.Blob``.
        bucket_name: Bucket name (for the message).
        blob_name: Blob name (for the message).

    Raises:
        FileExistsError: If the blob exists.
    """
    if blob.exists():
        raise FileExistsError(f"gs://{bucket_name}/{blob_name} exists and overwrite=False")
