"""
AWS S3 IO Backend

Audio file IO for AWS S3 (``s3://bucket/key``). Needs ``boto3``.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
from typing import Any, Optional, Union

import numpy as np

from . import _shared


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

S3_SCHEME = 's3://'
PATH_SEPARATOR = _shared.PATH_SEPARATOR


#
# PUBLIC
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
        end_byte: Ending byte position, inclusive (optional)
        **kwargs: Additional arguments including client and AWS credentials

    Returns:
        Binary data if dest is None, otherwise destination path
    """
    bucket, key = _parse_s3_uri(src)
    _log.debug('S3 read: bucket=%s key=%s byte_range=%s-%s', bucket, key, start_byte, end_byte)
    client = kwargs.get('client') or _get_client(**kwargs)

    get_params = {'Bucket': bucket, 'Key': key}
    byte_range = _shared.range_header(start_byte, end_byte)
    if byte_range:
        get_params['Range'] = byte_range

    response = client.get_object(**get_params)
    return _shared.save_or_return(response['Body'].read(), dest)


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

    Raises:
        ValueError: If ``src`` is a directory and ``recursive`` is False.
        FileExistsError: If an object exists and ``overwrite`` is False.
    """
    bucket, prefix = _parse_s3_uri(dest)
    client = kwargs.get('client') or _get_client(**kwargs)

    if _shared.is_directory_upload(src, recursive):
        uploaded = []
        for local_path, key in _shared.iter_upload_keys(src, prefix):
            if not overwrite:
                _raise_if_exists(client, bucket, key)
            client.upload_file(local_path, bucket, key)
            uploaded.append(f's3://{bucket}/{key}')
            _log.debug('uploaded %s -> s3://%s/%s', local_path, bucket, key)
        _log.info('S3 write: uploaded %d files to %s', len(uploaded), dest)
        return dest

    if not overwrite:
        _raise_if_exists(client, bucket, prefix)
    client.upload_file(src, bucket, prefix)
    _log.info('S3 write: uploaded %s -> s3://%s/%s', src, bucket, prefix)
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
    prefix = _shared.list_prefix(prefix)

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
# INTERNAL
#
def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """Split an S3 URI: ``s3://bucket/a/b`` -> ``('bucket', 'a/b')``; ``s3://bucket`` -> ``''``.

    Args:
        uri: S3 URI.

    Returns:
        (bucket, key).
    """
    return _shared.split_bucket_uri(uri, S3_SCHEME)


def _get_client(
    profile_name: Optional[str] = None,
    region_name: Optional[str] = None,
    **kwargs: Any
) -> Any:
    """Create an S3 client (optionally for a named profile / region).

    Args:
        profile_name: AWS profile name (optional).
        region_name: AWS region (optional).
        **kwargs: Ignored (the caller's other backend options).

    Returns:
        A boto3 S3 client.
    """
    import boto3
    session_kwargs = {}
    if profile_name:
        session_kwargs['profile_name'] = profile_name
    if region_name:
        session_kwargs['region_name'] = region_name
    session = boto3.Session(**session_kwargs)
    return session.client('s3')


def _raise_if_exists(client: Any, bucket: str, key: str) -> None:
    """Raise if ``s3://bucket/key`` exists (used when ``overwrite=False``).

    Any ``ClientError`` from the HEAD request is treated as "doesn't exist".

    Args:
        client: boto3 S3 client.
        bucket: Bucket name.
        key: Object key.

    Raises:
        FileExistsError: If the object exists.
    """
    try:
        client.head_object(Bucket=bucket, Key=key)
        raise FileExistsError(f"s3://{bucket}/{key} exists and overwrite=False")
    except client.exceptions.ClientError:
        pass
