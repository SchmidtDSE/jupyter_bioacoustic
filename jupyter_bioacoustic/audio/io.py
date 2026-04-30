"""
Unified IO for reading and writing files across local, S3, GCS, and HTTPS.

    from jupyter_bioacoustic.audio import io

    # Read (any source)
    data = io.read('s3://bucket/key.flac')
    io.read('https://example.com/file.csv', dest='local.csv')

    # Read audio segment (returns numpy array + sample rate)
    raw, sr = io.read_segment('s3://bucket/key.flac', start_sec=100, dur_sec=15)

    # Write (local, S3, or GCS)
    io.write('local.csv', 's3://bucket/output/local.csv')
    io.write('partitioned_dir/', 'gs://bucket/output/', recursive=True)

    # List files
    files = io.list_files('s3://bucket/prefix/', recursive=True)

Authentication:
    S3:   Uses boto3 defaults (env vars, ~/.aws, IAM role).
          Override with profile_name= or client= kwargs.
    GCS:  Uses google-cloud-storage defaults (GOOGLE_APPLICATION_CREDENTIALS, gcloud auth).
          Override with project=, credentials=, or client= kwargs.
    HTTPS: Pass cookies=, auth= (requests-style tuple), token= (Bearer), or headers= kwargs.

License: BSD 3-Clause
"""

import logging

from . import io_local, io_aws, io_gcs, io_https

_log = logging.getLogger('jupyter_bioacoustic.audio')


def _handler(path, platform=None):
    if platform:
        return {
            'aws': io_aws, 's3': io_aws,
            'gcs': io_gcs, 'gs': io_gcs,
            'https': io_https, 'http': io_https, 'url': io_https,
            'local': io_local,
        }[platform]
    if path.startswith('s3://'):
        return io_aws
    if path.startswith('gs://'):
        return io_gcs
    if path.startswith(('http://', 'https://')):
        return io_https
    return io_local


def read(src, dest=None, start_byte=None, end_byte=None, **kwargs):
    """Read a file from any supported source.

    Args:
        src: Local path, S3 URI, GCS URI, or HTTPS URL.
        dest: Local destination. If None, return raw bytes.
        start_byte/end_byte: Optional byte-range.
        platform: Force backend ('aws', 'gcs', 'https', 'local').
        **kwargs: Backend-specific auth (profile_name, client, cookies, auth, token, headers).

    Returns:
        dest path (str) if dest provided, else bytes.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(src, platform)
    _log.info(f'read src={src[:80]} handler={handler.__name__}')
    return handler.read(src, dest=dest, start_byte=start_byte, end_byte=end_byte, **kwargs)


def read_segment(path, start_sec, dur_sec, partial=True, **kwargs):
    """Read a decoded audio segment from any supported source.

    Args:
        path: Local path, S3 URI, GCS URI, or HTTPS URL.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: Use byte-range requests for remote files (default True).
        **kwargs: Backend-specific auth.

    Returns:
        (raw, sr): raw is 2D float32 numpy array (samples x channels),
                   sr is the sample rate.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    _log.info(f'read_segment path={path[:80]} start={start_sec} dur={dur_sec} handler={handler.__name__}')
    return handler.read_segment(path, start_sec, dur_sec, partial=partial, **kwargs)


def write(src, dest, recursive=False, overwrite=True, **kwargs):
    """Write a file or directory to any supported destination.

    Args:
        src: Local file or directory path.
        dest: Destination path/URI (local, s3://, gs://).
        recursive: Upload directory contents recursively (for partitioned parquet etc).
        overwrite: Overwrite existing files.
        platform: Force backend ('aws', 'gcs', 'local').
        **kwargs: Backend-specific auth.

    Returns:
        Destination path/URI (str).
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(dest, platform)
    _log.info(f'write src={src[:80]} dest={dest[:80]} handler={handler.__name__}')
    return handler.write(src, dest, recursive=recursive, overwrite=overwrite, **kwargs)


def list_files(path, recursive=False, **kwargs):
    """List files at a path or prefix.

    Args:
        path: Local directory, S3 prefix (s3://bucket/prefix/), or GCS prefix (gs://bucket/prefix/).
        recursive: Include subdirectories.
        **kwargs: Backend-specific auth.

    Returns:
        Sorted list of full paths/URIs.
    """
    platform = kwargs.pop('platform', None)
    handler = _handler(path, platform)
    return handler.list_files(path, recursive=recursive, **kwargs)
