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
    return _remote.write('gs', src, dest, recursive, overwrite, **kwargs)


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List files in GCS bucket prefix."""
    return _remote.list_files('gs', path, recursive, **kwargs)


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
