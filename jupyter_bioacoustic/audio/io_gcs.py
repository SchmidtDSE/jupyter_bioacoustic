import os
import logging

from . import _shared

_log = logging.getLogger('jupyter_bioacoustic.audio')


def _parse_gcs_uri(uri):
    path = uri.replace('gs://', '')
    slash = path.index('/')
    return path[:slash], path[slash + 1:]


def _get_client(project=None, credentials=None, **kwargs):
    from google.cloud import storage
    client_kwargs = {}
    if project:
        client_kwargs['project'] = project
    if credentials:
        client_kwargs['credentials'] = credentials
    return storage.Client(**client_kwargs)


def read(src, dest=None, start_byte=None, end_byte=None, **kwargs):
    from google.cloud import storage
    bucket_name, blob_name = _parse_gcs_uri(src)
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


def read_segment(path, start_sec, dur_sec, partial=True, **kwargs):
    from google.cloud import storage
    bucket_name, blob_name = _parse_gcs_uri(path)
    client = kwargs.get('client') or _get_client(**kwargs)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    if partial:
        try:
            return _shared.read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: blob.download_as_bytes(start=0, end=4095),
                get_size=lambda: _blob_size(blob),
                get_range=lambda sb, eb: blob.download_as_bytes(start=sb, end=eb),
            )
        except Exception as e:
            _log.warning(f'GCS partial failed: {type(e).__name__}: {e}')
            _log.info('falling back to full download + cache')

    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        blob.download_to_filename(cache)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


def write(src, dest, recursive=False, overwrite=True, **kwargs):
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
                blob_name = prefix.rstrip('/') + '/' + rel_path.replace(os.sep, '/')
                blob = bucket.blob(blob_name)
                if not overwrite and blob.exists():
                    raise FileExistsError(f"gs://{bucket_name}/{blob_name} exists and overwrite=False")
                blob.upload_from_filename(local_path)
                _log.info(f'uploaded {local_path} -> gs://{bucket_name}/{blob_name}')
        return dest
    else:
        blob = bucket.blob(prefix)
        if not overwrite and blob.exists():
            raise FileExistsError(f"gs://{bucket_name}/{prefix} exists and overwrite=False")
        blob.upload_from_filename(src)
        _log.info(f'uploaded {src} -> gs://{bucket_name}/{prefix}')
        return dest


def list_files(path, recursive=False, **kwargs):
    from google.cloud import storage
    bucket_name, prefix = _parse_gcs_uri(path)
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


def _blob_size(blob):
    blob.reload()
    if blob.size is None:
        raise ValueError(f'Could not determine blob size')
    return blob.size
