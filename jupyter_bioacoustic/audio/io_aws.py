"""AWS S3 I/O Backend

Audio file I/O operations for AWS S3 storage backend.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Any, Optional, Union

import numpy as np

from . import _shared

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
    bucket, key = _parse_s3_uri(src)
    _log.debug('S3 read: bucket=%s key=%s byte_range=%s-%s', bucket, key, start_byte, end_byte)
    client = kwargs.get('client') or _get_client(**kwargs)

    get_params = {'Bucket': bucket, 'Key': key}
    if start_byte is not None and end_byte is not None:
        get_params['Range'] = f'bytes={start_byte}-{end_byte}'
    elif start_byte is not None:
        get_params['Range'] = f'bytes={start_byte}-'
    elif end_byte is not None:
        get_params['Range'] = f'bytes=0-{end_byte}'

    response = client.get_object(**get_params)
    data = response['Body'].read()

    if dest is None:
        return data

    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def read_segment(
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    fallback: bool = True,
    **kwargs: Any
) -> tuple[np.ndarray, int]:
    """Read a time segment from an S3 audio file.

    Args:
        path: S3 URI of the audio file
        start_sec: Start time in seconds
        dur_sec: Duration in seconds
        partial: Read just the segment's bytes (FLAC/WAV) instead of the whole file
        fallback: If the partial read fails (or the format can't be range-read), download the
            whole file into the local cache instead. If False, raise instead.
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels)
    """
    bucket, key = _parse_s3_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)
    return _shared.read_segment_remote(
        path, start_sec, dur_sec, partial=partial, fallback=fallback,
        get_size=lambda: client.head_object(Bucket=bucket, Key=key)['ContentLength'],
        get_range=lambda sb, eb: client.get_object(
            Bucket=bucket, Key=key, Range=f'bytes={sb}-{eb}'
        )['Body'].read(),
        download_to=lambda dest: client.download_file(bucket, key, dest),
    )


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
    bucket, prefix = _parse_s3_uri(dest)
    client = kwargs.get('client') or _get_client(**kwargs)

    if os.path.isdir(src):
        if not recursive:
            raise ValueError(f"src is a directory but recursive=False: {src}")
        uploaded = []
        for root, _dirs, files in os.walk(src):
            for fname in files:
                local_path = os.path.join(root, fname)
                rel_path = os.path.relpath(local_path, src)
                key = (prefix.rstrip(PATH_SEPARATOR) + PATH_SEPARATOR +
                       rel_path.replace(os.sep, PATH_SEPARATOR))
                if not overwrite:
                    try:
                        client.head_object(Bucket=bucket, Key=key)
                        raise FileExistsError(f"s3://{bucket}/{key} exists and overwrite=False")
                    except client.exceptions.ClientError:
                        pass
                client.upload_file(local_path, bucket, key)
                uploaded.append(f's3://{bucket}/{key}')
                _log.debug('uploaded %s -> s3://%s/%s', local_path, bucket, key)
        _log.info('S3 write: uploaded %d files to %s', len(uploaded), dest)
        return dest
    else:
        key = prefix
        if not overwrite:
            try:
                client.head_object(Bucket=bucket, Key=key)
                raise FileExistsError(f"s3://{bucket}/{key} exists and overwrite=False")
            except client.exceptions.ClientError:
                pass
        client.upload_file(src, bucket, key)
        _log.info('S3 write: uploaded %s -> s3://%s/%s', src, bucket, key)
        return dest


def list_files(path: str, recursive: bool = False, **kwargs: Any) -> list[str]:
    """List files in an S3 path.

    Args:
        path: S3 URI path to list
        recursive: Whether to list recursively
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        List of S3 URIs
    """
    bucket, prefix = _parse_s3_uri(path)
    _log.debug('S3 list_files: bucket=%s prefix=%s recursive=%s', bucket, prefix, recursive)
    client = kwargs.get('client') or _get_client(**kwargs)

    if prefix and not prefix.endswith(PATH_SEPARATOR):    # '' = bucket root
        prefix += PATH_SEPARATOR

    results = []
    paginator = client.get_paginator('list_objects_v2')

    list_kwargs = {'Bucket': bucket, 'Prefix': prefix}
    if not recursive:
        list_kwargs['Delimiter'] = PATH_SEPARATOR

    for page in paginator.paginate(**list_kwargs):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key != prefix:
                results.append(f's3://{bucket}/{key}')

    return sorted(results)

#
# Internal
#
_log = logging.getLogger('jupyter_bioacoustic.audio')


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """Split an S3 URI: ``s3://bucket/a/b`` -> ``('bucket', 'a/b')``; ``s3://bucket`` -> key ``''``."""
    path = uri[len(S3_SCHEME):] if uri.startswith(S3_SCHEME) else uri
    bucket, _, key = path.partition(PATH_SEPARATOR)
    return bucket, key


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
