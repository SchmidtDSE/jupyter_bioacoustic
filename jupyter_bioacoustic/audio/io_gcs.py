"""GCS IO backend.

GCS (Google Cloud Storage) backend for reading and writing audio files.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Any

from ondio import OndioError

from . import _remote, _shared

#
# Constants
#

_GCS_URI_PREFIX: str = 'gs://'

#
# Public API
#

def read(src: str, dest: str | None = None, start_byte: int | None = None,
         end_byte: int | None = None, **kwargs: Any) -> bytes | str:
    """Read data from GCS blob with optional byte range."""
    return _remote.read('gs', src, dest, start_byte, end_byte, **kwargs)


def read_segment(path: str, start_sec: float, dur_sec: float, partial: bool = True,
                 **kwargs: Any) -> Any:
    """Read audio segment from GCS blob."""
    return _remote.read_segment('gs', path, start_sec, dur_sec, partial, **kwargs)


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
