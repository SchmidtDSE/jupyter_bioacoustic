"""
Minimal S3 partial FLAC reader — no soundhub_utils dependency.

Extracts from soundhub_utils the minimum needed to:
1. Read FLAC header from S3 (4KB range request)
2. Estimate byte range for a time segment
3. Download only that byte range
4. Extract the audio segment with pydub

Usage:
    audio, sr = read_s3_partial('s3://bucket/key.flac', start_sec=100, dur_sec=15)
    # audio: numpy float32 array, sr: sample rate
"""
import struct
import tempfile
import os
from typing import Dict, Tuple

import boto3
import numpy as np


# ─── FLAC header parsing (from soundhub_utils.utils.flac) ─────

def _parse_flac_header(header_data: bytes) -> Dict:
    """Parse FLAC STREAMINFO from the first ~4KB of the file."""
    if header_data[:4] != b'fLaC':
        raise ValueError("Not a valid FLAC file")

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
            return {'duration': duration, 'sample_rate': sample_rate, 'total_samples': total_samples}

        pos += 4 + length
        if is_last:
            break

    raise ValueError("No STREAMINFO block found")


# ─── Byte range estimation ─────────────────────────────────────

def _estimate_byte_range(file_size: int, total_duration: float,
                         start_time: float, end_time: float,
                         padding_ratio: float = 0.25) -> Tuple[int, int]:
    """Estimate byte range with padding for a time segment."""
    duration = end_time - start_time
    pad = duration * padding_ratio
    padded_start = max(0, start_time - pad)
    padded_end = min(total_duration, end_time + pad)
    bps = file_size / total_duration
    return int(padded_start * bps), min(file_size - 1, int(padded_end * bps))


# ─── S3 helpers ────────────────────────────────────────────────

def _parse_s3_uri(uri: str) -> Tuple[str, str]:
    """Parse s3://bucket/key into (bucket, key)."""
    path = uri.replace('s3://', '')
    slash = path.index('/')
    return path[:slash], path[slash+1:]


def _s3_range(bucket: str, key: str, start: int, end: int) -> bytes:
    """Download a byte range from S3."""
    resp = boto3.client('s3').get_object(
        Bucket=bucket, Key=key, Range=f'bytes={start}-{end}')
    return resp['Body'].read()


def _s3_file_size(bucket: str, key: str) -> int:
    return boto3.client('s3').head_object(Bucket=bucket, Key=key)['ContentLength']


# ─── Main function ─────────────────────────────────────────────

def read_s3_partial(s3_uri: str, start_sec: float, dur_sec: float):
    """Read a partial FLAC segment from S3 using byte-range requests.

    Returns (audio_float32_2d, sample_rate) — same format as soundfile.read().
    Only downloads ~25% more than needed (header + estimated byte range).

    Args:
        s3_uri: s3://bucket/key.flac
        start_sec: start time in seconds
        dur_sec: duration in seconds

    Returns:
        (np.ndarray shape=(samples, channels), int sample_rate)
    """
    import soundfile as _sf

    bucket, key = _parse_s3_uri(s3_uri)

    # 1. Get header (4KB) to find duration + sample rate
    header = _s3_range(bucket, key, 0, 4095)
    info = _parse_flac_header(header)
    file_size = _s3_file_size(bucket, key)

    end_sec = min(start_sec + dur_sec, info['duration'])

    # 2. Estimate byte range
    start_byte, end_byte = _estimate_byte_range(
        file_size, info['duration'], start_sec, end_sec)

    # 3. Download just that range
    audio_bytes = _s3_range(bucket, key, start_byte, end_byte)

    # 4. Write to temp file, read with soundfile, extract the right segment
    with tempfile.NamedTemporaryFile(suffix='.flac', delete=False) as f:
        f.write(audio_bytes)
        tmp = f.name

    try:
        with _sf.SoundFile(tmp) as sf:
            sr = sf.samplerate
            # The byte range starts at padded_start, so we need to seek
            # relative to the padded start
            pad = dur_sec * 0.25
            padded_start = max(0, start_sec - pad)
            relative_start = start_sec - padded_start
            sf.seek(int(relative_start * sr))
            raw = sf.read(int(dur_sec * sr), dtype='float32', always_2d=True)
    finally:
        os.unlink(tmp)

    return raw, sr


# ─── HTTPS download helper (for issue #2) ──────────────────────

def download_url_to_cache(url: str, cache_dir: str = '/tmp/jba_audio_cache') -> str:
    """Download a URL to a local cache file. Returns the cached path.

    Uses the URL's basename as the filename. Skips download if cached.
    """
    import requests
    os.makedirs(cache_dir, exist_ok=True)
    # Use URL hash for unique filename
    import hashlib
    name = hashlib.md5(url.encode()).hexdigest() + os.path.splitext(url.split('?')[0])[1]
    cached = os.path.join(cache_dir, name)
    if os.path.exists(cached):
        return cached
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    with open(cached, 'wb') as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)
    return cached
