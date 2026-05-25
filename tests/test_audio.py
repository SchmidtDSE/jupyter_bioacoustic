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
