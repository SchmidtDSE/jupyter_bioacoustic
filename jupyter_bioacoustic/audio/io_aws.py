"""AWS S3 I/O Backend

Audio file I/O operations for AWS S3 storage backend.

License: BSD 3-Clause
"""
from __future__ import annotations

import os
import logging
from typing import Optional, Any, Union

from . import _shared

#
# Constants
#
DEFAULT_HEADER_BYTES = 4095
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
    import boto3
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
    bucket, key = _parse_s3_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)
    if partial:
        _log.debug('S3 partial read: %s  start=%.1fs dur=%.1fs', path, start_sec, dur_sec)
        try:
            result = _shared.read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: client.get_object(
                    Bucket=bucket, Key=key, Range=f'bytes=0-{DEFAULT_HEADER_BYTES}'
                )['Body'].read(),
                get_size=lambda: client.head_object(
                    Bucket=bucket, Key=key
                )['ContentLength'],
                get_range=lambda sb, eb: client.get_object(
                    Bucket=bucket, Key=key, Range=f'bytes={sb}-{eb}'
                )['Body'].read(),
            )
            _log.debug('S3 partial read succeeded: %s', path)
            return result
        except Exception as e:
            msg = (f'Partial download failed ({type(e).__name__}: {e}). '
                   f'Falling back to full download')
            _log.warning(msg)
            _shared.last_warning = msg

    _log.debug('S3 full download: %s', path)
    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        _log.debug('S3 downloading full file to cache: %s', cache)
        client.download_file(bucket, key, cache)
    else:
        _log.debug('S3 using cached file: %s', cache)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


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
    import boto3
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
    import boto3
    bucket, prefix = _parse_s3_uri(path)
    _log.debug('S3 list_files: bucket=%s prefix=%s recursive=%s', bucket, prefix, recursive)
    client = kwargs.get('client') or _get_client(**kwargs)

    if not prefix.endswith(PATH_SEPARATOR):
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
