"""
Tests for audio modules

Unit tests for IO handler dispatch, cache path generation,
and remote IO through ondio.

License: BSD 3-Clause
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.audio import io, _shared
from jupyter_bioacoustic.audio._shared import cache_path
from jupyter_bioacoustic.audio import io_local, io_aws, io_gcs, io_https


#
# io._handler
#
class TestHandler:

    def test_s3(self):
        assert io._handler('s3://bucket/key.flac') is io_aws

    def test_gs(self):
        assert io._handler('gs://bucket/key.flac') is io_gcs

    def test_https(self):
        assert io._handler('https://example.com/a.flac') is io_https

    def test_http(self):
        assert io._handler('http://example.com/a.flac') is io_https

    def test_local(self):
        assert io._handler('/tmp/audio.flac') is io_local

    def test_relative_local(self):
        assert io._handler('audio/file.wav') is io_local

    def test_platform_override_aws(self):
        assert io._handler('/local/path', platform='aws') is io_aws

    def test_platform_override_gcs(self):
        assert io._handler('/local/path', platform='gcs') is io_gcs

    def test_platform_override_url(self):
        assert io._handler('/local/path', platform='url') is io_https


#
# cache_path
#
class TestCachePath:

    def test_preserves_extension(self):
        p = cache_path('https://example.com/audio.wav')
        assert p.endswith('.wav')

    def test_default_flac_extension(self):
        p = cache_path('https://example.com/audio')
        assert p.endswith('.flac')

    def test_strips_query_params(self):
        p = cache_path('https://example.com/audio.ogg?token=abc')
        assert p.endswith('.ogg')

    def test_deterministic(self):
        a = cache_path('s3://bucket/key.flac')
        b = cache_path('s3://bucket/key.flac')
        assert a == b

    def test_different_urls_differ(self):
        a = cache_path('s3://bucket/a.flac')
        b = cache_path('s3://bucket/b.flac')
        assert a != b


#
# last_warning cleared by dispatcher
#
class TestLastWarningCleared:

    def test_read_segment_clears_stale_warning(self, tmp_path):
        import numpy as np
        import soundfile as sf

        wav = tmp_path / 'test.wav'
        samples = np.zeros((4410, 1), dtype='float32')
        sf.write(str(wav), samples, 44100)

        _shared.last_warning = 'stale S3 error'
        io.read_segment(str(wav), 0, 0.05)
        assert _shared.last_warning is None


#
# Remote FLAC reads through ondio (no network)
#
import numpy as np
import requests
import soundfile as sf
from ondio import AuthError, NetworkError, OndioError
from ondio.registry import get_backend

from tests._fakes import VBR_SR as _VBR_SR, _DiskStore, _FakeRemote
_URIS = {
    's3': 's3://bucket/x.flac',
    'gs': 'gs://bucket/x.flac',
    'https': 'https://example.com/x.flac',
}


@pytest.fixture
def fake_remote(monkeypatch, tmp_path, vbr_flac):
    fake = _FakeRemote(monkeypatch, tmp_path)
    for uri in (*_URIS.values(), 'http://example.com/x.flac'):
        fake.store.put(uri, vbr_flac)
    return fake


def _assert_same(got, want):
    raw, sr = got
    want_raw, want_sr = want
    assert sr == want_sr
    assert raw.dtype == np.float32
    assert raw.shape == want_raw.shape
    assert np.array_equal(raw, want_raw)


_WINDOWS = [
    (s, d)
    for s in (0.0, 4.9, 5.0, 7.3, 12.5, 29.99, 59.0, 59.7)
    for d in (0.5, 3.0, 15.0)
]


class TestRemoteFlacExact:

    @pytest.mark.parametrize('start,dur', _WINDOWS)
    def test_window_matches_local(self, fake_remote, vbr_flac, start, dur):
        got = io.read_segment(_URIS['s3'], start, dur)
        _assert_same(got, io_local.read_segment(vbr_flac, start, dur))
        assert _shared.last_warning is None
        assert fake_remote.ranges > 0
        assert fake_remote.downloads == 0

    @pytest.mark.parametrize('scheme', ['gs', 'https'])
    def test_other_schemes_use_ranged_path(self, fake_remote, vbr_flac, scheme):
        got = io.read_segment(_URIS[scheme], 33.3, 3.0)
        _assert_same(got, io_local.read_segment(vbr_flac, 33.3, 3.0))
        assert _shared.last_warning is None
        assert fake_remote.ranges > 0
        assert fake_remote.downloads == 0

    def test_window_past_eof_falls_back(self, fake_remote):
        # The fallback reads the cached copy locally, and soundfile cannot
        # seek past EOF.
        with pytest.raises(sf.LibsndfileError):
            io.read_segment(_URIS['s3'], 70.0, 1.0)
        assert _shared.last_warning.startswith('Partial download failed')
        assert fake_remote.downloads == 1


class TestRangedFailureFallsBack:

    @pytest.mark.parametrize('scheme', ['s3', 'gs', 'https'])
    @pytest.mark.parametrize('exc', [
        NetworkError('reset'), AuthError('denied'), OndioError('corrupt region'),
    ])
    def test_fallback(self, fake_remote, vbr_flac, scheme, exc):
        fake_remote.store.fail['read_range'] = exc
        got = io.read_segment(_URIS[scheme], 12.5, 3.0)
        _assert_same(got, io_local.read_segment(vbr_flac, 12.5, 3.0))
        assert fake_remote.ranges > 0
        assert _shared.last_warning.startswith('Partial download failed')
        assert fake_remote.downloads == 1

    def test_programming_error_is_not_hidden(self, fake_remote):
        fake_remote.store.fail['read_range'] = TypeError('bug')
        with pytest.raises(TypeError):
            io.read_segment(_URIS['s3'], 12.5, 3.0)
        assert fake_remote.downloads == 0


class TestRangedPathSkipped:

    def _assert_skipped(self, fake_remote, uri, **kwargs):
        io.read_segment(uri, 1.0, 1.0, **kwargs)
        assert fake_remote.ranges == 0
        assert _shared.last_warning is None
        assert fake_remote.downloads == 1

    def test_non_flac(self, monkeypatch, tmp_path):
        wav = str(tmp_path / 'a.wav')
        sf.write(wav, np.zeros(_VBR_SR * 3, dtype=np.float32), _VBR_SR)
        fake = _FakeRemote(monkeypatch, tmp_path)
        fake.store.put('s3://bucket/a.wav', wav)
        self._assert_skipped(fake, 's3://bucket/a.wav')

    def test_partial_false(self, fake_remote):
        self._assert_skipped(fake_remote, _URIS['s3'], partial=False)


class TestPlatformScheme:
    """``platform=`` selects a handler. ondio selects its backend from the
    URI, so a URI of another scheme must be refused, not read."""

    @pytest.mark.parametrize('platform,uri', [
        ('aws', 'LOCAL'),
        ('aws', _URIS['gs']),
        ('gcs', 'LOCAL'),
        ('gcs', _URIS['s3']),
        ('https', 'LOCAL'),
        ('https', _URIS['s3']),
    ])
    @pytest.mark.parametrize('partial', [True, False])
    def test_other_scheme_is_refused(
        self, fake_remote, vbr_flac, platform, uri, partial,
    ):
        uri = vbr_flac if uri == 'LOCAL' else uri
        with pytest.raises(ValueError):
            io.read_segment(uri, 1.0, 1.0, partial=partial, platform=platform)
        assert fake_remote.calls == []
        assert fake_remote.downloads == 0

    def test_http_uses_ranged_path(self, fake_remote, vbr_flac):
        got = io.read_segment('http://example.com/x.flac', 33.3, 3.0,
                              platform='https')
        _assert_same(got, io_local.read_segment(vbr_flac, 33.3, 3.0))
        assert fake_remote.ranges > 0
        assert fake_remote.downloads == 0


_DATA = bytes(range(10))


@pytest.fixture
def remote_bin(monkeypatch, tmp_path):
    """A _FakeRemote that serves _DATA at s3://b/x.bin, gs://b/x.bin,
    https://h/x.bin and http://h/x.bin."""
    src = tmp_path / 'x.bin'
    src.write_bytes(_DATA)
    fake = _FakeRemote(monkeypatch, tmp_path)
    for uri in ('s3://b/x.bin', 'gs://b/x.bin', 'https://h/x.bin'):
        fake.store.put(uri, str(src))
    return fake


class TestRemoteRead:

    @pytest.mark.parametrize('uri', ['s3://b/x.bin', 'gs://b/x.bin',
                                     'https://h/x.bin'])
    def test_read_whole(self, remote_bin, uri):
        assert io.read(uri) == _DATA

    @pytest.mark.parametrize('uri', ['s3://b/x.bin', 'gs://b/x.bin',
                                     'https://h/x.bin'])
    @pytest.mark.parametrize('kwargs,want', [
        ({'start_byte': 2, 'end_byte': 5}, _DATA[2:6]),
        ({'start_byte': 2}, _DATA[2:]),
        ({'end_byte': 5}, _DATA[:6]),
    ])
    def test_read_range_inclusive(self, remote_bin, uri, kwargs, want):
        assert io.read(uri, **kwargs) == want

    def test_read_dest_relative(self, remote_bin, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        assert io.read('s3://b/x.bin', dest='out/x.bin') == 'out/x.bin'
        assert (tmp_path / 'out' / 'x.bin').read_bytes() == _DATA

    def test_read_range_with_dest(self, remote_bin, tmp_path):
        dest = str(tmp_path / 'out' / 'r.bin')
        got = io.read('s3://b/x.bin', dest=dest, start_byte=2, end_byte=5)
        assert got == dest
        with open(dest, 'rb') as f:
            assert f.read() == _DATA[2:6]

    def test_read_options_reach_ondio(self, remote_bin):
        client = object()
        io.read('s3://b/x.bin', client=client, profile_name='p')
        assert remote_bin.calls == [('s3://b/x.bin', {'client': client})]

    def test_platform_with_other_scheme_is_refused(self, remote_bin, tmp_path):
        with pytest.raises(ValueError):
            io.read(str(tmp_path / 'x.bin'), platform='aws')
        assert remote_bin.calls == []
        assert remote_bin.store.calls == []

    @pytest.mark.parametrize('platform', [None, 'https'])
    def test_read_http(self, remote_bin, platform):
        assert io.read('http://h/x.bin', platform=platform) == _DATA

    def test_failed_cache_download_retries_next_time(self, monkeypatch, tmp_path):
        wav = str(tmp_path / 'a.wav')
        sf.write(wav, np.zeros(_VBR_SR * 2, dtype=np.float32), _VBR_SR)
        fake = _FakeRemote(monkeypatch, tmp_path)
        fake.store.put('s3://b/a.wav', wav)
        fake.store.fail['download'] = NetworkError('reset')
        with pytest.raises(NetworkError):
            io.read_segment('s3://b/a.wav', 0, 1)
        del fake.store.fail['download']
        raw, sr = io.read_segment('s3://b/a.wav', 0, 1)
        assert sr == _VBR_SR and len(raw) == _VBR_SR
        assert fake.downloads == 2


@pytest.fixture
def store(monkeypatch, tmp_path):
    return _FakeRemote(monkeypatch, tmp_path).store


def _tree(root):
    """A local folder with a.txt and sub/b.txt."""
    (root / 'sub').mkdir(parents=True)
    (root / 'a.txt').write_bytes(b'A')
    (root / 'sub' / 'b.txt').write_bytes(b'B')
    return str(root)


_BUCKETS = ['s3://b', 'gs://b']


class TestRemoteWrite:

    @pytest.mark.parametrize('bucket', _BUCKETS)
    def test_write_file(self, store, tmp_path, bucket):
        src = tmp_path / 'f.txt'
        src.write_bytes(b'data')
        assert io.write(str(src), f'{bucket}/k/f.txt') == f'{bucket}/k/f.txt'
        assert store.object(f'{bucket}/k/f.txt') == b'data'

    def test_write_file_relative_src(self, store, tmp_path, monkeypatch):
        (tmp_path / 'f.txt').write_bytes(b'data')
        monkeypatch.chdir(tmp_path)
        assert io.write('f.txt', 's3://b/f.txt') == 's3://b/f.txt'
        assert store.object('s3://b/f.txt') == b'data'

    @pytest.mark.parametrize('bucket', _BUCKETS)
    def test_write_overwrite_false_existing(self, store, tmp_path, bucket):
        old, new = tmp_path / 'old', tmp_path / 'new'
        old.write_bytes(b'old')
        new.write_bytes(b'new')
        store.put(f'{bucket}/f', str(old))
        with pytest.raises(FileExistsError, match='exists and overwrite=False'):
            io.write(str(new), f'{bucket}/f', overwrite=False)
        assert store.object(f'{bucket}/f') == b'old'
        assert store.count('upload') == 0

    def test_write_overwrite_false_absent(self, store, tmp_path):
        src = tmp_path / 'f'
        src.write_bytes(b'new')
        assert io.write(str(src), 's3://b/f', overwrite=False) == 's3://b/f'
        assert store.object('s3://b/f') == b'new'

    @pytest.mark.parametrize('bucket', _BUCKETS)
    @pytest.mark.parametrize('slash', ['', '/'])
    def test_write_dir_recursive(self, store, tmp_path, bucket, slash):
        src = _tree(tmp_path / 'src')
        dest = f'{bucket}/out{slash}'
        assert io.write(src, dest, recursive=True) == dest
        assert store.object(f'{bucket}/out/a.txt') == b'A'
        assert store.object(f'{bucket}/out/sub/b.txt') == b'B'
        assert store.count('upload') == 2

    def test_write_dir_not_recursive(self, store, tmp_path):
        with pytest.raises(ValueError, match='recursive=False'):
            io.write(_tree(tmp_path / 'src'), 's3://b/out')
        assert store.calls == []

    def test_write_dir_overwrite_false_stops(self, store, tmp_path):
        src = _tree(tmp_path / 'src')
        old = tmp_path / 'old'
        old.write_bytes(b'old')
        store.put('s3://b/out/a.txt', str(old))
        with pytest.raises(FileExistsError, match='exists and overwrite=False'):
            io.write(src, 's3://b/out', recursive=True, overwrite=False)
        assert store.object('s3://b/out/a.txt') == b'old'

    def test_write_options_reach_ondio(self, monkeypatch, tmp_path):
        fake = _FakeRemote(monkeypatch, tmp_path)
        src = tmp_path / 'f'
        src.write_bytes(b'x')
        io.write(str(src), 's3://b/f', profile_name='p')
        assert {c[1]['profile_name'] for c in fake.calls} == {'p'}

    def test_write_other_scheme_is_refused(self, store, tmp_path):
        src = tmp_path / 'f'
        src.write_bytes(b'x')
        with pytest.raises(ValueError):
            io.write(str(src), str(tmp_path / 'g'), platform='aws')
        assert store.calls == []
        assert not (tmp_path / 'g').exists()

    @pytest.mark.parametrize('bucket', _BUCKETS)
    @pytest.mark.parametrize('recursive', [False, True])
    def test_list_files_folder_prefix(self, store, bucket, recursive):
        store.listing = [f'{bucket}/p/a', f'{bucket}/p/b']
        for path in (f'{bucket}/p', f'{bucket}/p/'):
            store.calls.clear()
            assert io.list_files(path, recursive=recursive) == store.listing
            assert store.calls == [('list_files', f'{bucket}/p/', recursive)]

    def test_list_files_default_not_recursive(self, store):
        io.list_files('s3://b/p')
        assert store.calls == [('list_files', 's3://b/p/', False)]

    def test_list_files_other_scheme_is_refused(self, store, tmp_path):
        with pytest.raises(ValueError):
            io.list_files(str(tmp_path), platform='gcs')
        assert store.calls == []

    def test_local_dir_overwrite_false(self, tmp_path):
        src = _tree(tmp_path / 'src')
        dest = tmp_path / 'dest'
        dest.mkdir()
        with pytest.raises(FileExistsError):
            io.write(src, str(dest), recursive=True, overwrite=False)
        assert list(dest.iterdir()) == []


_CLIENT = object()


class TestOptionsReachOndio:

    @pytest.mark.parametrize('scheme,options,expected', [
        ('https', {'token': 't'}, {'headers': {'Authorization': 'Bearer t'}}),
        ('https', {'headers': {'X-A': '1'}, 'token': 't'},
         {'headers': {'X-A': '1', 'Authorization': 'Bearer t'}}),
        ('https', {'verify': '/path/ca.pem', 'timeout': 5},
         {'verify': '/path/ca.pem', 'timeout': 5}),
        ('s3', {'client': _CLIENT, 'profile_name': 'p'}, {'client': _CLIENT}),
        ('s3', {'profile_name': 'p', 'region_name': 'r'},
         {'profile_name': 'p', 'region_name': 'r'}),
        ('gs', {'client': _CLIENT}, {'client': _CLIENT}),
    ])
    def test_options(self, fake_remote, scheme, options, expected):
        headers = dict(options.get('headers', {}))
        io.read_segment(_URIS[scheme], 12.5, 3.0, **options)
        assert fake_remote.calls[-1] == (_URIS[scheme], expected)
        assert fake_remote.ranges > 0
        assert fake_remote.downloads == 0
        assert options.get('headers', {}) == headers

    @pytest.mark.parametrize('scheme,options', [
        ('https', {'headers': {'X-A': '1'}, 'token': 't', 'cookies': {'a': 'b'},
                   'auth': ('u', 'p'), 'verify': False, 'timeout': 5,
                   'allow_redirects': False}),
        ('s3', {'client': _CLIENT, 'profile_name': 'p'}),
        ('gs', {'client': _CLIENT, 'project': 'p'}),
    ])
    def test_mappings_build_real_backends(self, scheme, options):
        # These constructors make no request.
        get_backend(_URIS[scheme], **_shared.ondio_kwargs(scheme, options))


class TestLocalCutRule:
    """Window is [round(start * sr), round((start + dur) * sr)), clipped at EOF."""

    @pytest.fixture
    def ramp(self, tmp_path):
        # Sample i holds i / 1000, so returned values give their indices.
        path = str(tmp_path / 'ramp.wav')
        sf.write(path, np.arange(100, dtype=np.float32) / 1000, 10,
                 subtype='FLOAT')
        return path

    def _indices(self, path, start, dur):
        raw, _ = io_local.read_segment(path, start, dur)
        return list(np.round(raw[:, 0] * 1000).astype(int))

    def test_start_rounds(self, ramp):
        # start * sr = 0.9: int() gives 0, round() gives 1.
        assert self._indices(ramp, 0.09, 0.2) == [1, 2]

    def test_end_rounds(self, ramp):
        # start * sr = 0.9 and dur * sr = 0.9: old end 0, new end 2.
        assert self._indices(ramp, 0.09, 0.09) == [1]

    def test_clipped_at_eof(self, ramp):
        assert self._indices(ramp, 9.75, 1.0) == [98, 99]
