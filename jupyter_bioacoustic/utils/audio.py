"""
Audio loading utilities for bioacoustic data.

Handles local files, S3 URIs, HTTPS/GCS URLs with partial byte-range
downloads for efficient access to large audio files.

Usage:

    from jupyter_bioacoustic.utils import audio

    # Read a segment from any source
    raw, sr = audio.read_segment('s3://bucket/key.flac', start_sec=100, dur_sec=15)
    raw, sr = audio.read_segment('https://example.com/audio.flac', start_sec=0, dur_sec=10)
    raw, sr = audio.read_segment('/local/path/audio.flac', start_sec=5, dur_sec=20)

    # Partial download is the default. Disable for full-file caching:
    raw, sr = audio.read_segment(url, start_sec=0, dur_sec=10, partial=False)

License: BSD 3-clause
"""

import hashlib
import os
import struct
import sys
import tempfile

import numpy as np
import soundfile as sf

import logging
_log = logging.getLogger('jupyter_bioacoustic.audio')
_log.setLevel(logging.DEBUG)
if not _log.handlers:
    _fh = logging.FileHandler('/tmp/jba_audio.log')
    _fh.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    _log.addHandler(_fh)
_log.info(f'module loaded from: {__file__}')


#
# CONSTANTS
#
CACHE_DIR = '/tmp/jba_audio_cache'
HEADER_BYTES = 4096
PADDING_RATIO = 0.25


#
# PUBLIC API
#
def read_segment(path, start_sec, dur_sec, partial=True):
    """Read an audio segment from any supported source.

    Args:
        path: Local file path, S3 URI (s3://), or HTTPS/GCS URL.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: If True (default), use byte-range requests for remote files.
                 If False, download and cache the full file first.

    Returns:
        (raw, sr): raw is a 2D float32 numpy array (samples × channels),
                   sr is the sample rate.
    """
    _log.info(f'read_segment path={path[:80]} start={start_sec} dur={dur_sec} partial={partial}')
    if path.startswith('s3://'):
        _log.info('-> S3 path')
        return _read_s3(path, start_sec, dur_sec, partial)
    elif path.startswith(('http://', 'https://', 'gs://')):
        _log.info('-> URL path')
        return _read_url(path, start_sec, dur_sec, partial)
    else:
        _log.info('-> local path')
        return _read_local(path, start_sec, dur_sec)


#
# LOCAL
#
def _read_local(path, start_sec, dur_sec):
    """Read a segment from a local file."""
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        f.seek(int(start_sec * sr))
        raw = f.read(int(dur_sec * sr), dtype='float32', always_2d=True)
    return raw, sr


#
# S3
#
def _read_s3(uri, start_sec, dur_sec, partial=True):
    """Read a segment from S3. Uses byte-range if partial=True."""
    import boto3
    bucket, key = _parse_s3_uri(uri)
    s3 = boto3.client('s3')

    if partial:
        try:
            return _read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: s3.get_object(Bucket=bucket, Key=key, Range='bytes=0-4095')['Body'].read(),
                get_size=lambda: s3.head_object(Bucket=bucket, Key=key)['ContentLength'],
                get_range=lambda sb, eb: s3.get_object(Bucket=bucket, Key=key, Range=f'bytes={sb}-{eb}')['Body'].read(),
            )
        except Exception as e:
            _log.warning(f'S3 partial failed: {type(e).__name__}: {e}')
            _log.info('falling back to full download + cache')

    # Full download + cache
    cache_path = _cache_path(uri)
    if not os.path.exists(cache_path):
        s3.download_file(bucket, key, cache_path)
    return _read_local(cache_path, start_sec, dur_sec)


#
# HTTPS / GCS
#
def _read_url(url, start_sec, dur_sec, partial=True):
    """Read a segment from an HTTPS or GCS URL. Uses byte-range if partial=True."""
    import requests

    if partial:
        _log.info(f'attempting partial download for {url[:80]}')
        try:
            result = _read_remote_partial(
                start_sec, dur_sec,
                get_header=lambda: _http_range(url, 0, HEADER_BYTES - 1),
                get_size=lambda: _http_content_length(url),
                get_range=lambda sb, eb: _http_range(url, sb, eb),
            )
            _log.info(f'partial SUCCESS: {result[0].shape[0]} samples at sr={result[1]}')
            return result
        except Exception as e:
            import traceback
            _log.warning(f'partial FAILED: {type(e).__name__}: {e}')
            _log.debug(traceback.format_exc())
            _log.info('falling back to full download + cache')
    else:
        _log.info(f'partial_download=False, using full download for {url[:80]}')

    # Full download + cache
    cache_path = _cache_path(url)
    if not os.path.exists(cache_path):
        resp = requests.get(url, stream=True, timeout=300)
        resp.raise_for_status()
        with open(cache_path, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
    return _read_local(cache_path, start_sec, dur_sec)


#
# SHARED PARTIAL READ
#
def _read_remote_partial(start_sec, dur_sec, get_header, get_size, get_range):
    """Shared partial byte-range read logic for any remote source.

    Uses pydub (ffmpeg) to decode the partial FLAC data, which is much
    more tolerant of truncated/partial data than libsndfile.

    Args:
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        get_header: Callable returning the first 4KB of the file.
        get_size: Callable returning the total file size in bytes.
        get_range: Callable(start_byte, end_byte) returning the byte range.

    Returns:
        (raw, sr): audio segment as float32 numpy array.
    """
    from pydub import AudioSegment

    # 1. Parse FLAC header
    header = get_header()
    sr, total_dur = _parse_flac_header(header)
    _log.info(f'partial: sr={sr} total_dur={total_dur:.1f}s')

    # 2. Estimate byte range with padding
    file_size = get_size()
    pad = dur_sec * PADDING_RATIO
    padded_start = max(0, start_sec - pad)
    padded_end = min(total_dur, start_sec + dur_sec + pad)
    bps = file_size / total_dur
    start_byte = int(padded_start * bps)
    end_byte = min(file_size - 1, int(padded_end * bps))
    _log.info(f'partial: byte_range={start_byte}-{end_byte} ({(end_byte-start_byte)/(1024*1024):.1f}MB)')

    # 3. Download byte range
    audio_bytes = get_range(start_byte, end_byte)

    # 4. Write to temp file and decode with pydub (ffmpeg)
    with tempfile.NamedTemporaryFile(suffix='.flac', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        audio = AudioSegment.from_file(tmp_path, format='flac')

        # Extract the target segment relative to the padded start
        rel_start_ms = int((start_sec - padded_start) * 1000)
        dur_ms = int(dur_sec * 1000)
        chunk = audio[rel_start_ms:rel_start_ms + dur_ms]
        _log.info(f'partial: extracted {len(chunk)}ms from pydub')

        # Convert pydub AudioSegment to numpy float32 array
        samples = np.array(chunk.get_array_of_samples(), dtype=np.float32)
        samples = samples / (2 ** (chunk.sample_width * 8 - 1))  # normalize to -1..1
        if chunk.channels > 1:
            samples = samples.reshape(-1, chunk.channels)
        else:
            samples = samples.reshape(-1, 1)

        return samples, chunk.frame_rate
    finally:
        os.unlink(tmp_path)


#
# INTERNAL HELPERS
#
def _parse_flac_header(header_data):
    """Parse FLAC STREAMINFO from the first ~4KB. Returns (sample_rate, duration)."""
    if header_data[:4] != b'fLaC':
        raise ValueError('Not a valid FLAC file')
    pos = 4
    while pos < len(header_data) - 34:
        block_type = header_data[pos] & 0x7f
        is_last = (header_data[pos] & 0x80) != 0
        length = struct.unpack('>I', b'\x00' + header_data[pos+1:pos+4])[0]
        if block_type == 0:  # STREAMINFO
            si = header_data[pos+4:pos+4+length]
            sample_rate = struct.unpack('>I', b'\x00' + si[10:13])[0] >> 4
            total_samples = struct.unpack('>Q', b'\x00\x00\x00' + si[13:18])[0] & 0xfffffffff
            duration = total_samples / sample_rate if sample_rate > 0 else 0
            return sample_rate, duration
        pos += 4 + length
        if is_last:
            break
    raise ValueError('No STREAMINFO block found')


def _parse_s3_uri(uri):
    """Parse s3://bucket/key into (bucket, key)."""
    path = uri.replace('s3://', '')
    slash = path.index('/')
    return path[:slash], path[slash+1:]


def _cache_path(url_or_uri):
    """Generate a cache file path for a URL or URI."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = os.path.splitext(url_or_uri.split('?')[0])[1] or '.flac'
    name = hashlib.md5(url_or_uri.encode()).hexdigest() + ext
    return os.path.join(CACHE_DIR, name)


def _http_range(url, start_byte, end_byte):
    """Download a byte range from an HTTP URL. Raises if server doesn't support Range."""
    import requests
    resp = requests.get(url, headers={'Range': f'bytes={start_byte}-{end_byte}'}, timeout=120)
    resp.raise_for_status()
    if resp.status_code != 206:
        raise ValueError(f'Server returned {resp.status_code} instead of 206 Partial Content')
    return resp.content


def _http_content_length(url):
    """Get the total file size via HEAD request or a Range probe."""
    import requests
    # Try HEAD first
    resp = requests.head(url, timeout=30, allow_redirects=True)
    resp.raise_for_status()
    length = resp.headers.get('Content-Length')
    if length:
        return int(length)
    # Fallback: Range request for byte 0 and read Content-Range header
    resp = requests.get(url, headers={'Range': 'bytes=0-0'}, timeout=30)
    cr = resp.headers.get('Content-Range', '')  # e.g. "bytes 0-0/123456"
    if '/' in cr:
        return int(cr.split('/')[-1])
    raise ValueError('Cannot determine file size')
