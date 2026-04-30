import hashlib
import os
import struct
import tempfile
import logging

import numpy as np

_log = logging.getLogger('jupyter_bioacoustic.audio')

CACHE_DIR = '/tmp/jba_audio_cache'
HEADER_BYTES = 4096
PADDING_RATIO = 0.25


def cache_path(url_or_uri):
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = os.path.splitext(url_or_uri.split('?')[0])[1] or '.flac'
    name = hashlib.md5(url_or_uri.encode()).hexdigest() + ext
    return os.path.join(CACHE_DIR, name)


def parse_flac_header(header_data):
    if header_data[:4] != b'fLaC':
        raise ValueError('Not a valid FLAC file')
    pos = 4
    while pos < len(header_data) - 34:
        block_type = header_data[pos] & 0x7f
        is_last = (header_data[pos] & 0x80) != 0
        length = struct.unpack('>I', b'\x00' + header_data[pos + 1:pos + 4])[0]
        if block_type == 0:
            si = header_data[pos + 4:pos + 4 + length]
            sample_rate = struct.unpack('>I', b'\x00' + si[10:13])[0] >> 4
            total_samples = struct.unpack('>Q', b'\x00\x00\x00' + si[13:18])[0] & 0xfffffffff
            duration = total_samples / sample_rate if sample_rate > 0 else 0
            return sample_rate, duration
        pos += 4 + length
        if is_last:
            break
    raise ValueError('No STREAMINFO block found')


def read_remote_partial(start_sec, dur_sec, get_header, get_size, get_range):
    from pydub import AudioSegment

    header = get_header()
    sr, total_dur = parse_flac_header(header)
    _log.info(f'partial: sr={sr} total_dur={total_dur:.1f}s')

    file_size = get_size()
    pad = dur_sec * PADDING_RATIO
    padded_start = max(0, start_sec - pad)
    padded_end = min(total_dur, start_sec + dur_sec + pad)
    bps = file_size / total_dur
    start_byte = int(padded_start * bps)
    end_byte = min(file_size - 1, int(padded_end * bps))
    _log.info(f'partial: byte_range={start_byte}-{end_byte} ({(end_byte - start_byte) / (1024 * 1024):.1f}MB)')

    audio_bytes = get_range(start_byte, end_byte)

    with tempfile.NamedTemporaryFile(suffix='.flac', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        audio = AudioSegment.from_file(tmp_path, format='flac')
        rel_start_ms = int((start_sec - padded_start) * 1000)
        dur_ms = int(dur_sec * 1000)
        chunk = audio[rel_start_ms:rel_start_ms + dur_ms]
        _log.info(f'partial: extracted {len(chunk)}ms from pydub')

        samples = np.array(chunk.get_array_of_samples(), dtype=np.float32)
        samples = samples / (2 ** (chunk.sample_width * 8 - 1))
        if chunk.channels > 1:
            samples = samples.reshape(-1, chunk.channels)
        else:
            samples = samples.reshape(-1, 1)

        return samples, chunk.frame_rate
    finally:
        os.unlink(tmp_path)


def ensure_parent_dirs(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
