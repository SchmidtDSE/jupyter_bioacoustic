"""
Tests for audio modules

Unit tests for IO handler dispatch, cache path generation,
and FLAC header parsing.

License: BSD 3-Clause
"""
import hashlib
import os
import struct
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.audio import io, _shared
from jupyter_bioacoustic.audio._shared import cache_path, parse_flac_header
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
# parse_flac_header
#
def _make_flac_header(sample_rate: int, total_samples: int) -> bytes:
    """Build a minimal valid FLAC header with STREAMINFO block."""
    magic = b'fLaC'
    block_type = 0x80
    si_length = 34
    si_header = bytes([block_type]) + struct.pack('>I', si_length)[1:]
    si_data = bytearray(34)
    sr_bits = (sample_rate << 4) & 0xFFFFF0
    si_data[10:13] = struct.pack('>I', sr_bits)[1:]
    ts_packed = struct.pack('>Q', total_samples & 0xfffffffff)
    si_data[13:18] = ts_packed[3:]
    return magic + si_header + bytes(si_data)


class TestParseFlacHeader:

    def test_valid_header(self):
        header = _make_flac_header(44100, 44100 * 60)
        sr, dur = parse_flac_header(header)
        assert sr == 44100
        assert abs(dur - 60.0) < 0.01

    def test_invalid_magic(self):
        with pytest.raises(ValueError, match='Not a valid FLAC'):
            parse_flac_header(b'RIFF' + b'\x00' * 100)

    def test_truncated_header(self):
        with pytest.raises(ValueError):
            parse_flac_header(b'fLaC\x00')


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
from ondio.backends.local import LocalBackend

_VBR_SR = 48000
_VBR_SECONDS = 60
_URIS = {
    's3': 's3://bucket/x.flac',
    'gs': 'gs://bucket/x.flac',
    'https': 'https://example.com/x.flac',
}


@pytest.fixture(scope='module')
def vbr_flac(tmp_path_factory):
    """60 s FLAC whose bitrate varies strongly: 5 s blocks of digital
    silence and full-scale white noise. soundfile writes no seek table."""
    path = str(tmp_path_factory.mktemp('vbr') / 'vbr.flac')
    rng = np.random.default_rng(0)
    x = np.zeros(_VBR_SECONDS * _VBR_SR, dtype=np.float32)
    for b in range(5, _VBR_SECONDS, 10):
        x[b * _VBR_SR:(b + 5) * _VBR_SR] = rng.uniform(-1, 1, 5 * _VBR_SR)
    sf.write(path, x, _VBR_SR, subtype='PCM_16', format='FLAC')
    return path


class _CountingBackend:
    """ondio LocalBackend over one local file. Ignores the URI, counts
    read_range calls, and can raise a given exception from read_range."""

    def __init__(self, path):
        self.path = path
        self.ranges = 0
        self.raises = None
        self._local = LocalBackend()

    def read_range(self, uri, start_byte, end_byte):
        self.ranges += 1
        if self.raises is not None:
            raise self.raises
        return self._local.read_range(self.path, start_byte, end_byte)

    def size(self, uri):
        return self._local.size(self.path)

    def read(self, uri):
        return self._local.read(self.path)


class _FakeRemote:
    """Gives JBA's ondio calls a counting backend, and routes the old
    clients' full downloads to a local copy. Nothing reaches the network."""

    def __init__(self, monkeypatch, tmp_path, path):
        import shutil

        self.backend = _CountingBackend(path)
        self.calls = []
        self.downloads = 0
        monkeypatch.setattr(_shared, 'CACHE_DIR', str(tmp_path / 'cache'))

        def ondio_backend(uri, okw):
            self.calls.append((uri, okw))
            return self.backend

        monkeypatch.setattr(_shared, 'ondio_backend', ondio_backend)

        def copy(dest):
            self.downloads += 1
            shutil.copyfile(path, dest)

        class Blob:
            def download_to_filename(self, dest):
                copy(dest)

        class Bucket:
            def blob(self, name):
                return Blob()

        class Client:
            def download_file(self, bucket, key, dest):
                copy(dest)

            def bucket(self, name):
                return Bucket()

        class Response:
            def raise_for_status(self):
                pass

            def iter_content(self, size):
                self_.downloads += 1
                with open(path, 'rb') as f:
                    yield f.read()

        self_ = self
        self.client = Client()
        monkeypatch.setattr(io_aws, '_get_client', lambda **kw: self.client)
        monkeypatch.setattr(io_gcs, '_get_client', lambda **kw: self.client)
        monkeypatch.setattr(requests, 'get', lambda *a, **kw: Response())


@pytest.fixture
def fake_remote(monkeypatch, tmp_path, vbr_flac):
    return _FakeRemote(monkeypatch, tmp_path, vbr_flac)


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
        assert fake_remote.backend.ranges > 0
        assert fake_remote.downloads == 0

    @pytest.mark.parametrize('scheme', ['gs', 'https'])
    def test_other_schemes_use_ranged_path(self, fake_remote, vbr_flac, scheme):
        got = io.read_segment(_URIS[scheme], 33.3, 3.0)
        _assert_same(got, io_local.read_segment(vbr_flac, 33.3, 3.0))
        assert _shared.last_warning is None
        assert fake_remote.backend.ranges > 0
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
        fake_remote.backend.raises = exc
        got = io.read_segment(_URIS[scheme], 12.5, 3.0)
        _assert_same(got, io_local.read_segment(vbr_flac, 12.5, 3.0))
        assert fake_remote.backend.ranges > 0
        assert _shared.last_warning.startswith('Partial download failed')
        assert fake_remote.downloads == 1

    def test_programming_error_is_not_hidden(self, fake_remote):
        fake_remote.backend.raises = TypeError('bug')
        with pytest.raises(TypeError):
            io.read_segment(_URIS['s3'], 12.5, 3.0)
        assert fake_remote.downloads == 0


class TestRangedPathSkipped:

    def _assert_skipped(self, fake_remote, uri, **kwargs):
        io.read_segment(uri, 1.0, 1.0, **kwargs)
        assert fake_remote.backend.ranges == 0
        assert _shared.last_warning is None
        assert fake_remote.downloads == 1

    def test_non_flac(self, monkeypatch, tmp_path):
        wav = str(tmp_path / 'a.wav')
        sf.write(wav, np.zeros(_VBR_SR * 3, dtype=np.float32), _VBR_SR)
        fake = _FakeRemote(monkeypatch, tmp_path, wav)
        self._assert_skipped(fake, 's3://bucket/a.wav')

    def test_partial_false(self, fake_remote):
        self._assert_skipped(fake_remote, _URIS['s3'], partial=False)


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
        assert fake_remote.backend.ranges > 0
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
