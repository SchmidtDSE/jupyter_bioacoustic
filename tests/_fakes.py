"""Fake storage for tests: nothing reaches the network.

License: BSD 3-Clause
"""
import os

import boto3
import requests
from google.cloud import storage
from ondio.backends.local import LocalBackend

from jupyter_bioacoustic.audio import _shared, io_aws, io_gcs

# The test FLAC in conftest.py: 60 s at 48 kHz.
VBR_SR = 48000
VBR_SECONDS = 60


class _DiskStore:
    """ondio backend that serves s3://, gs:// and http(s):// URIs from files
    under root/<bucket-or-host>/<key>. It records each call as
    (method, uri, *args). Set fail[method] = exc to make that method raise."""

    def __init__(self, root):
        self.root = str(root)
        self.calls = []
        self.fail = {}
        self.listing = []
        self._local = LocalBackend()

    def path(self, uri):
        key = uri.split('://', 1)[1].split('?')[0]
        # A file system merges '//'; object stores do not.
        assert '//' not in key, f'empty path segment in {uri}'
        return os.path.join(self.root, key)

    def put(self, uri, src):
        import shutil
        os.makedirs(os.path.dirname(self.path(uri)), exist_ok=True)
        shutil.copyfile(src, self.path(uri))

    def count(self, method):
        return sum(1 for c in self.calls if c[0] == method)

    def _call(self, method, uri, *args):
        self.calls.append((method, uri, *args))
        if method in self.fail:
            raise self.fail[method]

    def read(self, uri):
        self._call('read', uri)
        return self._local.read(self.path(uri))

    def read_range(self, uri, start_byte, end_byte):
        self._call('read_range', uri, start_byte, end_byte)
        return self._local.read_range(self.path(uri), start_byte, end_byte)

    def size(self, uri):
        self._call('size', uri)
        return self._local.size(self.path(uri))

    def exists(self, uri):
        self._call('exists', uri)
        return self._local.exists(self.path(uri))

    def download(self, uri, out_path):
        self._call('download', uri, out_path)
        self._local.download(self.path(uri), out_path)

    def upload(self, uri, source_path):
        self._call('upload', uri, source_path)
        os.makedirs(os.path.dirname(self.path(uri)), exist_ok=True)
        self._local.upload(self.path(uri), source_path)

    def list_files(self, uri_prefix, *, recursive=True, **kwargs):
        self._call('list_files', uri_prefix, recursive)
        return self.listing

    def object(self, uri):
        """The stored bytes at *uri*, or None."""
        p = self.path(uri)
        return open(p, 'rb').read() if os.path.isfile(p) else None


class _FakeRemote:
    """Gives JBA's ondio calls a _DiskStore. self.calls records each
    (uri, ondio options) that reached the backend seam. Set backend_fails
    to make the seam raise, as ondio does when credentials fail. The public
    (no credentials) backend is a second store, self.public. The old
    clients fail, so nothing reaches the network."""

    def __init__(self, monkeypatch, tmp_path):
        self.store = _DiskStore(tmp_path / 'store')
        self.public = _DiskStore(tmp_path / 'public')
        self.calls = []
        self.public_calls = []
        self.backend_fails = None
        monkeypatch.setattr(_shared, 'CACHE_DIR', str(tmp_path / 'cache'))

        def ondio_backend(uri, okw):
            self.calls.append((uri, okw))
            if self.backend_fails is not None:
                raise self.backend_fails
            return self.store

        def public_backend(uri):
            self.public_calls.append(uri)
            return self.public

        monkeypatch.setattr(_shared, 'ondio_backend', ondio_backend)
        monkeypatch.setattr(_shared, 'public_backend', public_backend,
                            raising=False)

        def old_client(*a, **kw):
            raise AssertionError('old storage client used')

        class OldGcsClient:
            def __init__(self, *a, **kw):
                old_client()

            create_anonymous_client = staticmethod(old_client)

        for mod in (io_aws, io_gcs):
            monkeypatch.setattr(mod, '_get_client', old_client, raising=False)
        monkeypatch.setattr(requests, 'get', old_client)
        monkeypatch.setattr(boto3, 'client', old_client)
        monkeypatch.setattr(storage, 'Client', OldGcsClient)

    @property
    def ranges(self):
        return self.store.count('read_range')

    @property
    def downloads(self):
        return self.store.count('download')
