import os
import logging

from . import _shared

_log = logging.getLogger('jupyter_bioacoustic.audio')


def _request_kwargs(kwargs):
    rk = {
        'timeout': kwargs.get('timeout', 120),
        'verify': kwargs.get('verify', True),
        'allow_redirects': kwargs.get('allow_redirects', True),
    }
    if 'cookies' in kwargs:
        rk['cookies'] = kwargs['cookies']
    if 'auth' in kwargs:
        rk['auth'] = kwargs['auth']
    if 'headers' in kwargs:
        rk['headers'] = dict(kwargs['headers'])
    else:
        rk['headers'] = {}
    if 'token' in kwargs:
        rk['headers']['Authorization'] = f"Bearer {kwargs['token']}"
    return rk


def read(src, dest=None, start_byte=None, end_byte=None, **kwargs):
    import requests

    rk = _request_kwargs(kwargs)

    if start_byte is not None and end_byte is not None:
        rk['headers']['Range'] = f'bytes={start_byte}-{end_byte}'
    elif start_byte is not None:
        rk['headers']['Range'] = f'bytes={start_byte}-'
    elif end_byte is not None:
        rk['headers']['Range'] = f'bytes=0-{end_byte}'

    resp = requests.get(src, stream=True, **rk)
    resp.raise_for_status()

    if dest is None:
        return resp.content

    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)
    return dest


def read_segment(path, start_sec, dur_sec, partial=True, **kwargs):
    import requests

    rk = _request_kwargs(kwargs)

    if partial:
        _log.info(f'attempting partial download for {path[:80]}')
        try:
            def get_header():
                h = dict(rk.get('headers', {}))
                h['Range'] = 'bytes=0-4095'
                r = requests.get(path, headers=h, timeout=rk.get('timeout', 120),
                                 verify=rk.get('verify', True), cookies=rk.get('cookies'),
                                 auth=rk.get('auth'))
                r.raise_for_status()
                if r.status_code != 206:
                    raise ValueError(f'Server returned {r.status_code} instead of 206')
                return r.content

            def get_size():
                r = requests.head(path, timeout=30, allow_redirects=True,
                                  verify=rk.get('verify', True), cookies=rk.get('cookies'),
                                  auth=rk.get('auth'))
                r.raise_for_status()
                length = r.headers.get('Content-Length')
                if length:
                    return int(length)
                r2 = requests.get(path, headers={'Range': 'bytes=0-0'}, timeout=30,
                                  verify=rk.get('verify', True), cookies=rk.get('cookies'),
                                  auth=rk.get('auth'))
                cr = r2.headers.get('Content-Range', '')
                if '/' in cr:
                    return int(cr.split('/')[-1])
                raise ValueError('Cannot determine file size')

            def get_range(sb, eb):
                h = dict(rk.get('headers', {}))
                h['Range'] = f'bytes={sb}-{eb}'
                r = requests.get(path, headers=h, timeout=rk.get('timeout', 120),
                                 verify=rk.get('verify', True), cookies=rk.get('cookies'),
                                 auth=rk.get('auth'))
                r.raise_for_status()
                if r.status_code != 206:
                    raise ValueError(f'Server returned {r.status_code} instead of 206')
                return r.content

            result = _shared.read_remote_partial(start_sec, dur_sec, get_header, get_size, get_range)
            _log.info(f'partial SUCCESS: {result[0].shape[0]} samples at sr={result[1]}')
            return result
        except Exception as e:
            _log.warning(f'partial FAILED: {type(e).__name__}: {e}')
            _log.info('falling back to full download + cache')

    cache = _shared.cache_path(path)
    if not os.path.exists(cache):
        resp = requests.get(path, stream=True, **rk)
        resp.raise_for_status()
        with open(cache, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
    from . import io_local
    return io_local.read_segment(cache, start_sec, dur_sec)


def write(src, dest, **kwargs):
    raise NotImplementedError("HTTPS is read-only. Use S3, GCS, or local for writes.")


def list_files(path, **kwargs):
    raise NotImplementedError("Cannot list files over HTTPS.")
