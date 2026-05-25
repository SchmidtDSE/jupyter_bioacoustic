"""GCS IO backend.

GCS (Google Cloud Storage) backend for reading and writing audio files.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Any

from . import _shared

#
# Constants
#

_DEFAULT_HEADER_SIZE: int = 4095
_GCS_URI_PREFIX: str = 'gs://'

#
# Public API
#

def read(src: str, dest: str | None = None, start_byte: int | None = None,
         end_byte: int | None = None, **kwargs: Any) -> bytes | str:
    """Read data from GCS blob with optional byte range."""
    from google.cloud import storage
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

    if dest is None:
        return data

    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def read_segment(path: str, start_sec: float, dur_sec: float, partial: bool = True,
                 **kwargs: Any) -> Any:
    """Read audio segment from GCS blob."""
    from google.cloud import storage
    bucket_name, blob_name = _parse_gcs_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    if partial:
        _log.debug('GCS partial read: %s  start=%.1fs dur=%.1fs', path,
                   start_sec, dur_sec)
        try:
            result = _shared.read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: blob.download_as_bytes(start=0,
                                                          end=_DEFAULT_HEADER_SIZE),
                get_size=lambda: _blob_size(blob),
                get_range=lambda sb, eb: blob.download_as_bytes(start=sb,
                                                                end=eb),
            )
            _log.debug('GCS partial read succeeded: %s', path)
            return result
        except Exception as e:
            msg = (f'Partial download failed ({type(e).__name__}: {e}). '
                   f'Falling back to full download')
            _log.warning(msg)
            _shared.last_warning = msg

    _log.debug('GCS full download: %s', path)
    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        _log.debug('GCS downloading full file to cache: %s', cache)
        blob.download_to_filename(cache)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


def write(src: str, dest: str, recursive: bool = False, overwrite: bool = True,
          **kwargs: Any) -> str:
    """Write files to GCS."""
    from google.cloud import storage
    bucket_name, prefix = _parse_gcs_uri(dest)
    client = kwargs.get('client') or _get_client(**kwargs)
    bucket = client.bucket(bucket_name)

    if os.path.isdir(src):
        if not recursive:
            raise ValueError(f"src is a directory but recursive=False: {src}")
        for root, _dirs, files in os.walk(src):
            for fname in files:
                local_path = os.path.join(root, fname)
                rel_path = os.path.relpath(local_path, src)
                blob_name = (prefix.rstrip('/') + '/' +
                             rel_path.replace(os.sep, '/'))
                blob = bucket.blob(blob_name)
                if not overwrite and blob.exists():
                    raise FileExistsError(
                        f"gs://{bucket_name}/{blob_name} exists and "
                        f"overwrite=False")
                blob.upload_from_filename(local_path)
                _log.debug('uploaded %s -> gs://%s/%s', local_path,
                           bucket_name, blob_name)
        _log.info('GCS write: uploaded directory to %s', dest)
        return dest
    else:
        blob = bucket.blob(prefix)
        if not overwrite and blob.exists():
            raise FileExistsError(f"gs://{bucket_name}/{prefix} exists and "
                                  f"overwrite=False")
        blob.upload_from_filename(src)
        _log.info('GCS write: uploaded %s -> gs://%s/%s', src, bucket_name,
                  prefix)
        return dest


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List files in GCS bucket prefix."""
    from google.cloud import storage
    bucket_name, prefix = _parse_gcs_uri(path)
    _log.debug('GCS list_files: bucket=%s prefix=%s recursive=%s', bucket_name,
               prefix, recursive)
    client = kwargs.get('client') or _get_client(**kwargs)

    if not prefix.endswith('/'):
        prefix += '/'

    list_kwargs = {'prefix': prefix}
    if not recursive:
        list_kwargs['delimiter'] = '/'

    results = []
    for blob in client.list_blobs(bucket_name, **list_kwargs):
        if blob.name != prefix:
            results.append(f'gs://{bucket_name}/{blob.name}')

    return sorted(results)

#
# Internal

_log = logging.getLogger('jupyter_bioacoustic.audio')


def _parse_gcs_uri(uri: str) -> tuple[str, str]:
    path = uri.replace(_GCS_URI_PREFIX, '')
    slash = path.index('/')
    return path[:slash], path[slash + 1:]


def _get_client(project: str | None = None, credentials: Any | None = None,
                **kwargs: Any) -> Any:
    from google.cloud import storage
    client_kwargs = {}
    if project:
        client_kwargs['project'] = project
    if credentials:
        client_kwargs['credentials'] = credentials
    return storage.Client(**client_kwargs)


def _blob_size(blob: Any) -> int:
    blob.reload()
    if blob.size is None:
        _log.error('GCS blob size is None for %s', blob.name)
        raise ValueError(f'Could not determine blob size')
    return blob.size