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
# read_remote_partial (sample-accurate byte-range FLAC reads)
#
def _write_vbr_flac(path, sr=16000, seconds=40, channels=1, subtype='PCM_16', seed=0):
    """Quiet first half, loud second half: the bitrate changes ~5x, so any linear
    time->byte estimate is badly off (this is what broke the old partial reader)."""
    import numpy as np
    import soundfile as sf

    rng = np.random.default_rng(seed)
    n = sr * seconds
    x = rng.normal(0, 0.0005, n)
    x[n // 2:] = rng.normal(0, 0.25, n - n // 2)
    x[::sr] += 0.8                       # a click every second
    x = np.clip(x, -0.99, 0.99)
    if channels == 2:
        x = np.stack([x, np.roll(x, sr // 10) * 0.5], axis=1)
    sf.write(str(path), x, sr, format='FLAC', subtype=subtype)
    return path


def _insert_metadata_block(path, block_type, body):
    """Insert a metadata block right after STREAMINFO (which stops being the last block)."""
    data = bytearray(open(path, 'rb').read())
    assert data[4] & 0x7F == 0, 'STREAMINFO must be first'
    was_last = data[4] & 0x80
    data[4] &= 0x7F
    header = bytes([(0x80 if was_last else 0) | block_type]) + len(body).to_bytes(3, 'big')
    data[42:42] = header + body
    open(path, 'wb').write(bytes(data))


def _range_callables(path):
    """(get_size, get_range, stats) over a local file: what an S3/GCS/HTTPS backend provides."""
    stats = {'requests': 0, 'bytes': 0}
    size = os.path.getsize(path)

    def get_range(start, end):
        with open(path, 'rb') as f:
            f.seek(start)
            data = f.read(min(end, size - 1) - start + 1)
        stats['requests'] += 1
        stats['bytes'] += len(data)
        return data

    return (lambda: size), get_range, stats


def _windows(total_sec, sr, n_random=40, seed=0):
    import numpy as np
    rng = np.random.default_rng(seed)
    durs = [0.01, 0.2, 1, 3, 5, 10]
    wins = [(float(rng.uniform(0, total_sec - d)), float(d)) for d in rng.choice(durs, n_random)]
    one = 1 / sr
    wins += [(0, 3), (0, one), (total_sec - 3, 3), (total_sec - 1, 5),
             (total_sec / 2 - 0.5, 1), (total_sec / 2, one), (0, total_sec)]
    return wins


def _assert_partial_matches_local(path, windows):
    import numpy as np
    get_size, get_range, _ = _range_callables(path)
    for start, dur in windows:
        expected, sr = io_local.read_segment(str(path), start, dur)
        got, got_sr = _shared.read_remote_partial(start, dur, get_size, get_range)
        assert got_sr == sr
        assert got.shape == expected.shape, (start, dur, got.shape, expected.shape)
        assert np.array_equal(got, expected), (start, dur)


class TestReadRemotePartial:

    def test_matches_full_read_on_vbr_audio(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'vbr.flac')
        _assert_partial_matches_local(path, _windows(40, 16000))

    def test_matches_full_read_stereo_24bit(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'st24.flac', sr=44100, seconds=20, channels=2,
                               subtype='PCM_24', seed=1)
        _assert_partial_matches_local(path, _windows(20, 44100, n_random=20, seed=1))

    def test_metadata_larger_than_header_fetch(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'padded.flac', seconds=20)
        _insert_metadata_block(path, 1, bytes(70000))            # PADDING block
        get_size, get_range, _ = _range_callables(path)
        info = _shared._read_flac_info(get_range, get_size())
        assert info.audio_offset > _shared.HEADER_BYTES
        _assert_partial_matches_local(path, _windows(20, 16000, n_random=15))

    def test_uses_seektable(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'seek.flac', seconds=20)
        get_size, get_range, _ = _range_callables(path)
        info = _shared._read_flac_info(get_range, get_size())
        frames = _shared._find_frame_chain(get_range(0, get_size() - 1), 0, info)
        points = b''.join(
            f.first_sample.to_bytes(8, 'big')
            + (f.offset - info.audio_offset).to_bytes(8, 'big')
            + f.block_size.to_bytes(2, 'big')
            for f in frames[::10]
        )
        _insert_metadata_block(path, 3, points)                  # SEEKTABLE block
        get_size, get_range, _ = _range_callables(path)
        assert len(_shared._read_flac_info(get_range, get_size()).seekpoints) == len(frames[::10])
        _assert_partial_matches_local(path, _windows(20, 16000, n_random=15))

    def test_fetches_only_part_of_the_file(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'vbr.flac')
        get_size, get_range, stats = _range_callables(path)
        _shared.read_remote_partial(30, 1, get_size, get_range)
        assert stats['bytes'] < get_size() / 4

    def test_unsupported_format_raises(self, tmp_path):
        import numpy as np
        import soundfile as sf
        ogg = tmp_path / 'a.ogg'
        sf.write(str(ogg), np.zeros(8000), 8000, format='OGG')
        get_size, get_range, _ = _range_callables(ogg)
        with pytest.raises(_shared.UnsupportedPartialFormat):
            _shared.read_remote_partial(0, 0.01, get_size, get_range)

    @pytest.mark.parametrize('fmt,subtype', [
        ('WAV', 'PCM_U8'), ('WAV', 'PCM_16'), ('WAV', 'PCM_24'), ('WAV', 'PCM_32'),
        ('WAV', 'FLOAT'), ('WAV', 'DOUBLE'), ('WAVEX', 'PCM_24'), ('RF64', 'PCM_16'),
    ])
    def test_wav_matches_full_read(self, tmp_path, fmt, subtype):
        import numpy as np
        import soundfile as sf
        sr, seconds = 8000, 30
        x = np.random.default_rng(2).uniform(-0.9, 0.9, (sr * seconds, 2))
        path = tmp_path / f'a_{fmt}_{subtype}.wav'
        sf.write(str(path), x, sr, format=fmt, subtype=subtype)
        _assert_partial_matches_local(path, _windows(seconds, sr, n_random=15))

    def test_wav_is_two_exact_requests(self, tmp_path):
        import numpy as np
        import soundfile as sf
        path = tmp_path / 'long.wav'
        sf.write(str(path), np.zeros(16000 * 60), 16000, subtype='PCM_16')
        get_size, get_range, stats = _range_callables(path)
        raw, sr = _shared.read_remote_partial(30, 3, get_size, get_range)
        assert raw.shape == (3 * sr, 1)
        assert stats['requests'] == 2                           # header + samples
        assert stats['bytes'] <= _shared.HEADER_BYTES + 3 * sr * 2

    def test_wav_data_chunk_past_header_fetch(self, tmp_path):
        """A big chunk (e.g. LIST/bext metadata) before 'data' pushes it past the first 4 KB."""
        import numpy as np
        import soundfile as sf
        path = tmp_path / 'meta.wav'
        sf.write(str(path), np.random.default_rng(3).uniform(-0.5, 0.5, 8000 * 10), 8000,
                 subtype='PCM_16')
        data = bytearray(open(path, 'rb').read())
        junk = b'JUNK' + (20000).to_bytes(4, 'little') + bytes(20000)
        data[12:12] = junk                                      # right after RIFF....WAVE
        data[4:8] = (len(data) - 8).to_bytes(4, 'little')
        open(path, 'wb').write(bytes(data))
        _assert_partial_matches_local(path, _windows(10, 8000, n_random=10))

    def test_corrupt_audio_raises_runtime_error(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'vbr.flac', seconds=10)
        get_size, get_range, _ = _range_callables(path)
        info = _shared._read_flac_info(get_range, get_size())

        def zeros_after_header(start, end):
            data = bytearray(get_range(start, end))
            for k in range(max(info.audio_offset - start, 0), len(data)):
                data[k] = 0
            return bytes(data)

        with pytest.raises(RuntimeError):
            _shared.read_remote_partial(5, 1, get_size, zeros_after_header)

    def test_s3_backend_partial_and_fallback(self, tmp_path):
        """io_aws wiring: partial path matches local; unsupported formats fall back cleanly."""
        import numpy as np
        import soundfile as sf

        path = _write_vbr_flac(tmp_path / 'vbr.flac')
        expected, _ = io_local.read_segment(str(path), 27.3, 2)
        got, _ = io_aws.read_segment('s3://b/vbr.flac', 27.3, 2, client=_FakeS3(path))
        assert np.array_equal(got, expected)

        ogg = tmp_path / 'tone.ogg'
        sf.write(str(ogg), np.sin(np.arange(16000) / 5.0) * 0.5, 16000, format='OGG')
        uri = f's3://b/{os.getpid()}-tone.ogg'
        _shared.last_warning = None
        try:
            got, _ = io_aws.read_segment(uri, 0.25, 0.5, client=_FakeS3(ogg))
            assert os.path.exists(_shared.cache_path(uri))      # full download was cached
        finally:
            _remove_cache(uri)
        expected, _ = io_local.read_segment(str(ogg), 0.25, 0.5)
        assert np.array_equal(got, expected)
        assert 'Partial download failed' in (_shared.last_warning or '')

    def test_fallback_false_raises(self, tmp_path):
        import numpy as np
        import soundfile as sf
        ogg = tmp_path / 'tone.ogg'
        sf.write(str(ogg), np.zeros(8000), 8000, format='OGG')
        uri = f's3://b/{os.getpid()}-nofallback.ogg'
        client = _FakeS3(ogg)
        with pytest.raises(_shared.UnsupportedPartialFormat):
            io.read_segment(uri, 0, 0.1, fallback=False, client=client)
        assert client.downloads == 0
        assert not os.path.exists(_shared.cache_path(uri))

    def test_uses_cache_before_partial(self, tmp_path):
        import numpy as np
        path = _write_vbr_flac(tmp_path / 'vbr.flac', seconds=10)
        uri = f's3://b/{os.getpid()}-cached.flac'
        client = _FakeS3(path)
        try:
            io_aws.read_segment(uri, 1, 1, partial=False, client=client)   # full download
            assert client.downloads == 1
            client.ranges = 0
            got, _ = io_aws.read_segment(uri, 5, 1, client=client)
            assert client.ranges == 0                           # served from the cache
            assert np.array_equal(got, io_local.read_segment(str(path), 5, 1)[0])
        finally:
            _remove_cache(uri)

    def test_failed_download_leaves_no_cache_file(self, tmp_path):
        path = _write_vbr_flac(tmp_path / 'vbr.flac', seconds=5)
        uri = f's3://b/{os.getpid()}-broken.flac'

        class BrokenDownload(_FakeS3):
            def download_file(self, Bucket, Key, dest):
                with open(dest, 'wb') as f:
                    f.write(b'partial bytes')
                raise ConnectionError('dropped')

        with pytest.raises(ConnectionError):
            io_aws.read_segment(uri, 1, 1, partial=False, client=BrokenDownload(path))
        cache = _shared.cache_path(uri)
        assert not os.path.exists(cache)
        assert not [f for f in os.listdir(os.path.dirname(cache)) if f.startswith(
            os.path.basename(cache))]


class _FakeS3:
    """Minimal boto3 S3 client over a local file (counts range reads and downloads)."""

    def __init__(self, path):
        self.path = path
        self.ranges = 0
        self.downloads = 0

    def head_object(self, Bucket, Key):
        return {'ContentLength': os.path.getsize(self.path)}

    def get_object(self, Bucket, Key, Range):
        self.ranges += 1
        start, end = (int(v) for v in Range[len('bytes='):].split('-'))
        with open(self.path, 'rb') as f:
            f.seek(start)
            body = f.read(end - start + 1)
        return {'Body': type('Body', (), {'read': lambda self: body})()}

    def download_file(self, Bucket, Key, dest):
        import shutil
        self.downloads += 1
        shutil.copy(self.path, dest)


def _remove_cache(uri):
    if os.path.exists(_shared.cache_path(uri)):
        os.remove(_shared.cache_path(uri))


#
# bucket-root listing and URI parsing (S3 / GCS)
#
class TestBucketRoot:

    def test_parse_uris(self):
        assert io_aws._parse_s3_uri('s3://b/a/k.flac') == ('b', 'a/k.flac')
        assert io_aws._parse_s3_uri('s3://b/') == ('b', '')
        assert io_aws._parse_s3_uri('s3://b') == ('b', '')
        assert io_gcs._parse_gcs_uri('gs://b/a/k.flac') == ('b', 'a/k.flac')
        assert io_gcs._parse_gcs_uri('gs://b') == ('b', '')

    def test_s3_lists_bucket_root(self):
        keys = ['a.flac', 'b.flac', 'sub/c.flac']

        class Paginator:
            def paginate(self, Bucket, Prefix, Delimiter=None):
                found = [k for k in keys if k.startswith(Prefix)]
                if Delimiter:
                    found = [k for k in found if Delimiter not in k[len(Prefix):]]
                yield {'Contents': [{'Key': k} for k in found]}

        client = type('C', (), {'get_paginator': lambda self, name: Paginator()})()
        assert io_aws.list_files('s3://b/', client=client) == ['s3://b/a.flac', 's3://b/b.flac']
        assert io_aws.list_files('s3://b', recursive=True, client=client) == [
            's3://b/a.flac', 's3://b/b.flac', 's3://b/sub/c.flac']

    def test_gcs_lists_bucket_root(self):
        names = ['a.flac', 'sub/c.flac']

        class Client:
            def list_blobs(self, bucket, prefix, delimiter=None):
                found = [n for n in names if n.startswith(prefix)]
                if delimiter:
                    found = [n for n in found if delimiter not in n[len(prefix):]]
                return [type('Blob', (), {'name': n})() for n in found]

        assert io_gcs.list_files('gs://b/', client=Client()) == ['gs://b/a.flac']

    def test_gcs_without_package_explains_the_extra(self):
        try:
            import google.cloud.storage  # noqa: F401
            pytest.skip('google-cloud-storage is installed')
        except ImportError:
            pass
        with pytest.raises(ImportError, match=r"jupyter-bioacoustic\[gcs\]"):
            io_gcs._get_client()
