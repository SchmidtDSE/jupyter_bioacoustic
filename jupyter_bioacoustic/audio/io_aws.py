"""AWS S3 I/O Backend

Audio file I/O operations for AWS S3 storage backend.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Optional, Any, Union

from ondio import OndioError

from . import _remote, _shared

#
# Constants
#
S3_SCHEME = 's3://'
PATH_SEPARATOR = '/'

#
# Public API
#
def read(
    src: str,
    dest: Optional[str] = None,
    start_byte: Optional[int] = None,
    end_byte: Optional[int] = None,
    **kwargs: Any
) -> Union[bytes, str]:
    """Read data from an S3 object.

    Args:
        src: S3 URI of the source object
        dest: Local destination path (optional)
        start_byte: Starting byte position (optional)
        end_byte: Ending byte position (optional)
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        Binary data if dest is None, otherwise destination path
    """
    return _remote.read('s3', src, dest, start_byte, end_byte, **kwargs)


def read_segment(
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    **kwargs: Any
) -> Any:
    """Read a time segment from an S3 audio file.

    Args:
        path: S3 URI of the audio file
        start_sec: Start time in seconds
        dur_sec: Duration in seconds
        partial: Whether to attempt partial download optimization
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        Audio data for the specified segment
    """
    return _remote.read_segment('s3', path, start_sec, dur_sec, partial, **kwargs)


def write(
    src: str,
    dest: str,
    recursive: bool = False,
    overwrite: bool = True,
    **kwargs: Any
) -> str:
    """Write local file(s) to S3.

    Args:
        src: Local source path
        dest: S3 destination URI
        recursive: Whether to upload directories recursively
        overwrite: Whether to overwrite existing objects
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        Destination S3 URI
    """
    return _remote.write('s3', src, dest, recursive, overwrite, **kwargs)


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List files in an S3 path.

    Args:
        path: S3 URI path to list
        recursive: Whether to list recursively
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        List of S3 URIs
    """
    return _remote.list_files('s3', path, recursive, **kwargs)


#
# Internal
#
_log = logging.getLogger('jupyter_bioacoustic.audio')


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """Parse an S3 URI into bucket and key components."""
    path = uri.replace(S3_SCHEME, '')
    slash = path.index(PATH_SEPARATOR)
    return path[:slash], path[slash + 1:]


def _get_client(
    profile_name: Optional[str] = None,
    region_name: Optional[str] = None,
    **kwargs: Any
) -> Any:
    """Create and return an S3 client."""
    import boto3
    session_kwargs = {}
    if profile_name:
        session_kwargs['profile_name'] = profile_name
    if region_name:
        session_kwargs['region_name'] = region_name
    session = boto3.Session(**session_kwargs)
    return session.client('s3')
