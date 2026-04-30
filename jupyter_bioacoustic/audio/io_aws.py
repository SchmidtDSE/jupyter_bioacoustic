import os
import logging

from . import _shared

_log = logging.getLogger('jupyter_bioacoustic.audio')


def _parse_s3_uri(uri):
    path = uri.replace('s3://', '')
    slash = path.index('/')
    return path[:slash], path[slash + 1:]


def _get_client(profile_name=None, region_name=None, **kwargs):
    import boto3
    session_kwargs = {}
    if profile_name:
        session_kwargs['profile_name'] = profile_name
    if region_name:
        session_kwargs['region_name'] = region_name
    session = boto3.Session(**session_kwargs)
    return session.client('s3')


def read(src, dest=None, start_byte=None, end_byte=None, **kwargs):
    import boto3
    bucket, key = _parse_s3_uri(src)
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


def read_segment(path, start_sec, dur_sec, partial=True, **kwargs):
    bucket, key = _parse_s3_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)

    if partial:
        try:
            return _shared.read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: client.get_object(
                    Bucket=bucket, Key=key, Range='bytes=0-4095'
                )['Body'].read(),
                get_size=lambda: client.head_object(
                    Bucket=bucket, Key=key
                )['ContentLength'],
                get_range=lambda sb, eb: client.get_object(
                    Bucket=bucket, Key=key, Range=f'bytes={sb}-{eb}'
                )['Body'].read(),
            )
        except Exception as e:
            _log.warning(f'S3 partial failed: {type(e).__name__}: {e}')
            _log.info('falling back to full download + cache')

    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        client.download_file(bucket, key, cache)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


def write(src, dest, recursive=False, overwrite=True, **kwargs):
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
                key = prefix.rstrip('/') + '/' + rel_path.replace(os.sep, '/')
                if not overwrite:
                    try:
                        client.head_object(Bucket=bucket, Key=key)
                        raise FileExistsError(f"s3://{bucket}/{key} exists and overwrite=False")
                    except client.exceptions.ClientError:
                        pass
                client.upload_file(local_path, bucket, key)
                uploaded.append(f's3://{bucket}/{key}')
                _log.info(f'uploaded {local_path} -> s3://{bucket}/{key}')
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
        _log.info(f'uploaded {src} -> s3://{bucket}/{key}')
        return dest


def list_files(path, recursive=False, **kwargs):
    import boto3
    bucket, prefix = _parse_s3_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)

    if not prefix.endswith('/'):
        prefix += '/'

    results = []
    paginator = client.get_paginator('list_objects_v2')

    list_kwargs = {'Bucket': bucket, 'Prefix': prefix}
    if not recursive:
        list_kwargs['Delimiter'] = '/'

    for page in paginator.paginate(**list_kwargs):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key != prefix:
                results.append(f's3://{bucket}/{key}')

    return sorted(results)
