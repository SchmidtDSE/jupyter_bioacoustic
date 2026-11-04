"""
Audio Partial Reads

Partial (byte-range) reads of remote FLAC and WAV files, and the header parsing they need.
A remote backend hands ``read_remote_partial`` two callables (file size, byte range) and gets
back exactly the samples ``io_local.read_segment`` would return for the same window.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import bisect
import functools
import io
import logging
import struct
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np
import soundfile as sf


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.audio')

HEADER_BYTES = 4096                     # first bytes fetched to sniff the format / parse headers
HEADER_READAHEAD = 64 * 1024            # header bytes fetched at once past the first HEADER_BYTES
HEADER_CACHE_SIZE = 64                  # parsed headers kept (one per remote file)
# Module state: parsed headers by (cache_key, file size), least recently used first.
_HEADER_CACHE: OrderedDict[tuple[str, int], _FlacInfo | _WavInfo] = OrderedDict()
DEFAULT_DTYPE = 'float32'
MAX_RANGE_ATTEMPTS = 10
STREAMINFO_LEN = 34
FIXED_BLOCKSIZE_SYNC = b'\xff\xf8'      # frame header carries the frame number
VARIABLE_BLOCKSIZE_SYNC = b'\xff\xf9'   # frame header carries the sample number
_BLOCK_SIZES = {1: 192, 2: 576, 3: 1152, 4: 2304, 5: 4608,
                **{code: 256 << (code - 8) for code in range(8, 16)}}
_SAMPLE_RATES = {1: 88200, 2: 176400, 3: 192000, 4: 8000, 5: 16000, 6: 22050,
                 7: 24000, 8: 32000, 9: 44100, 10: 48000, 11: 96000}
_BITS_PER_SAMPLE = {1: 8, 2: 12, 4: 16, 5: 20, 6: 24, 7: 32}
# UTF-8-style coded frame/sample number: (lead-byte mask, lead value, value bits, extra bytes)
_CODED_NUMBER_LEADS = ((0x80, 0x00, 0x7F, 0), (0xE0, 0xC0, 0x1F, 1), (0xF0, 0xE0, 0x0F, 2),
                       (0xF8, 0xF0, 0x07, 3), (0xFC, 0xF8, 0x03, 4), (0xFE, 0xFC, 0x01, 5),
                       (0xFF, 0xFE, 0x00, 6))

_WAVE_FORMAT_PCM = 0x0001
_WAVE_FORMAT_IEEE_FLOAT = 0x0003
_WAVE_FORMAT_EXTENSIBLE = 0xFFFE
_RF64_UNKNOWN_SIZE = 0xFFFFFFFF


#
# PUBLIC
#
class UnsupportedPartialFormat(ValueError):
    """The remote file's format can't be range-read (only FLAC and PCM/float WAV can)."""


def parse_flac_header(
    header_data: bytes,
) -> tuple[int, float]:
    """Extract sample rate and duration from a FLAC header.

    Args:
        header_data: The first bytes of the file (``HEADER_BYTES`` is usually enough).

    Returns:
        (sample_rate, duration_seconds)

    Raises:
        ValueError: If the bytes are not FLAC or hold no STREAMINFO block.
    """
    if header_data[:4] != b'fLaC':
        _log.error(
            'FLAC header validation failed: got %r',
            header_data[:4],
        )
        raise ValueError('Not a valid FLAC file')
    pos = 4
    while pos < len(header_data) - 34:
        block_type = header_data[pos] & 0x7f
        is_last = (header_data[pos] & 0x80) != 0
        length = struct.unpack(
            '>I', b'\x00' + header_data[pos + 1:pos + 4],
        )[0]
        if block_type == 0:
            si = header_data[pos + 4:pos + 4 + length]
            sample_rate = struct.unpack(
                '>I', b'\x00' + si[10:13],
            )[0] >> 4
            total_samples = (
                struct.unpack(
                    '>Q', b'\x00\x00\x00' + si[13:18],
                )[0]
                & 0xfffffffff
            )
            duration = (
                total_samples / sample_rate
                if sample_rate > 0 else 0
            )
            return sample_rate, duration
        pos += 4 + length
        if is_last:
            break
    _log.error(
        'No STREAMINFO block found in FLAC header '
        '(%d bytes)', len(header_data),
    )
    raise ValueError('No STREAMINFO block found')


def read_remote_partial(
    start_sec: float,
    dur_sec: float,
    get_size: Callable[[], int],
    get_range: Callable[[int, int], bytes],
    cache_key: Optional[str] = None,
) -> tuple[np.ndarray, int]:
    """Read a time window of a remote audio file by byte ranges, without downloading it all.

    The format is detected from the file's first bytes:

    * **FLAC**: frame-accurate read (see ``_read_flac_partial``).
    * **WAV / RF64** (PCM int or IEEE float): uncompressed, so the window's byte range is exact:
      one request for the header, one for the samples.

    The result is identical to ``io_local.read_segment`` on the full file.

    With a ``cache_key`` (the remote path), the parsed header is remembered per
    ``(cache_key, file size)``, so later windows of the same file skip the header requests.

    Args:
        start_sec: Window start in seconds.
        dur_sec: Window duration in seconds.
        get_size: Callable returning the total file size in bytes.
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        cache_key: Identifies the file for the header cache. ``None`` disables the cache.

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels). ``n_samples`` is
        shorter than requested only when the window runs past the end of the file.

    Raises:
        UnsupportedPartialFormat: If the format can't be range-read.
        ValueError: If the file's header is invalid.
        RuntimeError: If the bytes for the window can't be read (e.g. a corrupt stream).
    """
    _log.debug('read_remote_partial: start=%.3fs dur=%.3fs', start_sec, dur_sec)
    file_size = get_size()
    key = (cache_key, file_size)
    info = _HEADER_CACHE.get(key) if cache_key is not None else None
    if info is None:
        info = _read_audio_info(get_range, file_size)
        if cache_key is not None:
            _HEADER_CACHE[key] = info
            while len(_HEADER_CACHE) > HEADER_CACHE_SIZE:
                _HEADER_CACHE.popitem(last=False)
    else:
        _HEADER_CACHE.move_to_end(key)
        _log.debug('using cached header for %s', cache_key)
    if isinstance(info, _FlacInfo):
        return _read_flac_partial(start_sec, dur_sec, file_size, get_range, info)
    return _read_wav_partial(start_sec, dur_sec, file_size, get_range, info)


def clear_header_cache() -> None:
    """Forget every header remembered by :func:`read_remote_partial`."""
    _HEADER_CACHE.clear()


def segment_frames(start_sec: float, dur_sec: float, sample_rate: int) -> tuple[int, int]:
    """Convert a time window to (first sample, sample count).

    Every reader (local seek and remote partial read) uses this so they return the same samples
    for the same window.

    Args:
        start_sec: Window start in seconds.
        dur_sec: Window duration in seconds.
        sample_rate: Sample rate in Hz.

    Returns:
        (start_sample, n_samples)
    """
    return int(start_sec * sample_rate), int(dur_sec * sample_rate)


#
# INTERNAL
#
def _read_audio_info(get_range: Callable[[int, int], bytes],
                     file_size: int) -> _FlacInfo | _WavInfo:
    """Fetch the first bytes of a file, detect FLAC or WAV, and parse its header.

    Args:
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        file_size: Total file size in bytes.

    Returns:
        The parsed FLAC or WAV header.

    Raises:
        UnsupportedPartialFormat: If the file is neither FLAC nor WAV/RF64.
    """
    head = get_range(0, min(HEADER_BYTES, file_size) - 1)
    if head[:4] == b'fLaC':
        return _read_flac_info(get_range, file_size, head)
    if head[:4] in (b'RIFF', b'RF64') and head[8:12] == b'WAVE':
        return _read_wav_info(get_range, file_size, head)
    raise UnsupportedPartialFormat('partial reads support FLAC and WAV files only')


def _read_flac_partial(
    start_sec: float,
    dur_sec: float,
    file_size: int,
    get_range: Callable[[int, int], bytes],
    info: _FlacInfo,
) -> tuple[np.ndarray, int]:
    """Read a time window of a remote FLAC by byte ranges, sample-accurately.

    FLAC frames are self-contained and each frame header carries its own frame/sample number
    (CRC-8 protected). So instead of assuming where decoding starts (FLAC is variable-bitrate, so
    a time->byte estimate can be off by tens of seconds), this:

    1. reads the metadata (STREAMINFO, optional SEEKTABLE, where the audio frames start);
    2. estimates a byte range (seektable-interpolated, else average bitrate) and fetches it;
    3. finds the chain of real frames in the bytes and reads their true sample numbers;
    4. widens the range until complete frames cover the window;
    5. decodes those frames behind a minimal header with soundfile and slices by sample.

    The result is identical to ``io_local.read_segment`` on the full file.

    Args:
        start_sec: Window start in seconds.
        dur_sec: Window duration in seconds.
        file_size: Total file size in bytes.
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        info: The parsed FLAC metadata (``_read_flac_info``).

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels).

    Raises:
        RuntimeError: If the window can't be covered (e.g. a corrupt stream).
    """
    first, count = segment_frames(start_sec, dur_sec, info.sample_rate)
    start = min(max(first, 0), info.total_samples)
    end = min(start + count, info.total_samples)
    if end <= start:
        return np.zeros((0, info.channels), dtype=DEFAULT_DTYPE), info.sample_rate

    slack = info.frame_bytes_guess
    lo = max(info.audio_offset,
             _sample_to_byte(info, file_size, start - info.max_blocksize) - slack)
    hi = min(file_size - 1,
             _sample_to_byte(info, file_size, end + info.max_blocksize) + slack)
    buf = get_range(lo, hi)
    bytes_per_sample = (file_size - info.audio_offset) / max(info.total_samples, 1)

    for attempt in range(MAX_RANGE_ATTEMPTS):
        chain = _find_frame_chain(buf, lo, info)
        end_sample, end_byte = _complete_frames(chain, lo + len(buf), info, file_size)
        short_left = not chain or chain[0].first_sample > start
        short_right = not chain or end_sample < end
        if not short_left and not short_right:
            break
        _log.debug('partial range %d-%d short (left=%s right=%s), widening',
                   lo, lo + len(buf) - 1, short_left, short_right)
        growth = 2 ** attempt
        if short_left and lo > info.audio_offset:
            missing = (chain[0].first_sample - start) if chain else (end - start)
            grow = int((missing + info.max_blocksize) * bytes_per_sample * 1.5 * growth) + slack
            new_lo = max(info.audio_offset, lo - grow)
            buf, lo = get_range(new_lo, lo - 1) + buf, new_lo
        if short_right and lo + len(buf) < file_size:
            missing = (end - end_sample) if chain else (end - start)
            grow = int((missing + info.max_blocksize) * bytes_per_sample * 1.5 * growth) + slack
            buf += get_range(lo + len(buf), lo + len(buf) + grow - 1)
    else:
        raise RuntimeError(
            f'could not cover samples {start}-{end} after {MAX_RANGE_ATTEMPTS} range requests'
        )

    head = chain[0]
    n_samples = end_sample - head.first_sample
    stream = _flac_stream(info, buf[head.offset - lo:end_byte - lo], n_samples)
    # read sequentially: sf.read() would first seek to sample 0, which this fragment doesn't have
    with sf.SoundFile(io.BytesIO(stream)) as f:
        audio = f.read(dtype=DEFAULT_DTYPE, always_2d=True)
    if len(audio) != n_samples:
        raise RuntimeError(f'decoded {len(audio)} samples, expected {n_samples}')
    offset = start - head.first_sample
    _log.debug('partial read: bytes %d-%d, frames from sample %d, returning %d samples',
               lo, lo + len(buf) - 1, head.first_sample, end - start)
    return audio[offset:offset + (end - start)], info.sample_rate


def _header_reader(get_range: Callable[[int, int], bytes], file_size: int,
                   head: Optional[bytes]) -> Callable[[int, int], bytes]:
    """Return ``read(offset, n)`` that serves header bytes from ``head`` or fetches them.

    Bytes past ``head`` are fetched ``HEADER_READAHEAD`` at a time and kept, so walking many
    small metadata blocks (e.g. after a large SEEKTABLE) costs one request, not one per block.

    Args:
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        file_size: Total file size in bytes.
        head: The first bytes of the file, if already fetched (else fetched here).

    Returns:
        A function returning up to ``n`` bytes starting at ``offset``.
    """
    if head is None:
        head = get_range(0, min(HEADER_BYTES, file_size) - 1)
    window = [0, b'']                   # [start offset, bytes]: the last read-ahead chunk

    def read(offset: int, n: int) -> bytes:
        """Return up to ``n`` bytes starting at ``offset`` (b'' past the end of the file).

        Args:
            offset: Absolute byte offset.
            n: Number of bytes wanted.

        Returns:
            The bytes.
        """
        if offset + n <= len(head):
            return head[offset:offset + n]
        if offset >= file_size:
            return b''
        start, buf = window
        if not (start <= offset and offset + n <= start + len(buf)):
            end = min(offset + max(n, HEADER_READAHEAD), file_size)
            window[:] = [offset, get_range(offset, end - 1)]
            start, buf = window
        return buf[offset - start:offset - start + n]

    return read


@dataclass
class _WavInfo:
    """Layout of a WAV/RF64 file's sample data.

    Attributes:
        sample_rate: Sample rate in Hz.
        channels: Number of channels.
        bits_per_sample: Bits per sample (per channel).
        is_float: True for IEEE-float samples, False for PCM integers.
        block_align: Bytes per sample frame (all channels).
        data_offset: Byte offset of the first sample.
        total_frames: Number of sample frames in the data chunk.
    """
    sample_rate: int
    channels: int
    bits_per_sample: int
    is_float: bool
    block_align: int            # bytes per sample frame (all channels)
    data_offset: int            # byte offset of the first sample
    total_frames: int


def _read_wav_info(get_range: Callable[[int, int], bytes], file_size: int,
                   head: Optional[bytes] = None) -> _WavInfo:
    """Parse a WAV/RF64 header: walk the chunks to ``fmt `` and ``data``.

    Args:
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        file_size: Total file size in bytes.
        head: The first bytes of the file, if already fetched.

    Returns:
        The sample-data layout.

    Raises:
        UnsupportedPartialFormat: If the WAV holds compressed or unusual sample data.
        ValueError: If the header is malformed.
    """
    read = _header_reader(get_range, file_size, head)
    riff = read(0, 12)
    if riff[:4] not in (b'RIFF', b'RF64') or riff[8:12] != b'WAVE':
        raise ValueError('Not a valid WAV file')
    pos, fmt, ds64_data_size = 12, None, None
    while True:
        chunk = read(pos, 8)
        if len(chunk) < 8:
            raise ValueError('WAV file has no data chunk')
        chunk_id, size = chunk[:4], int.from_bytes(chunk[4:8], 'little')
        if chunk_id == b'ds64':
            ds64_data_size = int.from_bytes(read(pos + 16, 8), 'little')
        elif chunk_id == b'fmt ':
            fmt = read(pos + 8, min(size, 40))
        elif chunk_id == b'data':
            break
        pos += 8 + size + (size & 1)        # chunks are word-aligned
    if fmt is None or len(fmt) < 16:
        raise ValueError('WAV data chunk before fmt chunk')
    code, channels, rate, _, block_align, bits = struct.unpack('<HHIIHH', fmt[:16])
    if code == _WAVE_FORMAT_EXTENSIBLE and len(fmt) >= 26:
        code = int.from_bytes(fmt[24:26], 'little')       # sub-format GUID starts with the code
    is_float = code == _WAVE_FORMAT_IEEE_FLOAT
    supported = ((code == _WAVE_FORMAT_PCM and bits in (8, 16, 24, 32))
                 or (is_float and bits in (32, 64)))
    if not supported or block_align != channels * bits // 8:
        raise UnsupportedPartialFormat(
            f'WAV format {code:#06x} ({bits}-bit) can\'t be range-read')
    data_offset = pos + 8
    if size == _RF64_UNKNOWN_SIZE and ds64_data_size is not None:
        size = ds64_data_size
    size = min(size, file_size - data_offset)        # recorders sometimes leave a bogus size
    return _WavInfo(rate, channels, bits, is_float, block_align, data_offset,
                    size // block_align)


def _read_wav_partial(
    start_sec: float,
    dur_sec: float,
    file_size: int,
    get_range: Callable[[int, int], bytes],
    info: _WavInfo,
) -> tuple[np.ndarray, int]:
    """Read a time window of a remote WAV/RF64: exact byte math, one range request.

    Args:
        start_sec: Window start in seconds.
        dur_sec: Window duration in seconds.
        file_size: Total file size in bytes.
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        info: The parsed WAV header (``_read_wav_info``).

    Returns:
        (raw, sample_rate) where raw is float32 of shape (n_samples, channels).

    Raises:
        RuntimeError: If the server returns fewer bytes than requested.
    """
    first, count = segment_frames(start_sec, dur_sec, info.sample_rate)
    start = min(max(first, 0), info.total_frames)
    end = min(start + count, info.total_frames)
    if end <= start:
        return np.zeros((0, info.channels), dtype=DEFAULT_DTYPE), info.sample_rate
    lo = info.data_offset + start * info.block_align
    raw = get_range(lo, info.data_offset + end * info.block_align - 1)
    if len(raw) != (end - start) * info.block_align:
        raise RuntimeError(f'expected {(end - start) * info.block_align} bytes, got {len(raw)}')
    _log.debug('partial WAV read: bytes %d-%d, %d samples', lo, lo + len(raw) - 1, end - start)
    return _pcm_to_float(raw, info).reshape(-1, info.channels), info.sample_rate


def _pcm_to_float(raw: bytes, info: _WavInfo) -> np.ndarray:
    """Convert little-endian WAV sample bytes to float32 in [-1, 1), the way soundfile does.

    Args:
        raw: Sample bytes (whole frames).
        info: The WAV layout.

    Returns:
        1-D float32 array (interleaved channels).
    """
    if info.is_float:
        return np.frombuffer(raw, dtype=f'<f{info.bits_per_sample // 8}').astype(DEFAULT_DTYPE)
    if info.bits_per_sample == 8:                    # 8-bit WAV is unsigned
        return (np.frombuffer(raw, dtype=np.uint8).astype(DEFAULT_DTYPE) - 128) / 128
    if info.bits_per_sample == 24:                   # no 3-byte dtype: assemble, sign-extend
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        values = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        values -= (values & 0x800000) << 1
    else:
        values = np.frombuffer(raw, dtype=f'<i{info.bits_per_sample // 8}')
    return values.astype(DEFAULT_DTYPE) / np.float32(2 ** (info.bits_per_sample - 1))


@dataclass
class _FlacInfo:
    """Stream facts needed to locate and decode frames.

    Attributes:
        sample_rate: Sample rate in Hz.
        channels: Number of channels.
        bits_per_sample: Bits per sample (per channel).
        total_samples: Samples per channel in the stream (0 = unknown).
        max_blocksize: Largest frame, in samples.
        max_framesize: Largest frame, in bytes (0 = unknown).
        streaminfo: Raw 34-byte STREAMINFO body.
        audio_offset: Byte offset of the first audio frame.
        seekpoints: ``(sample, byte offset from audio_offset)`` pairs from the SEEKTABLE.
    """
    sample_rate: int
    channels: int
    bits_per_sample: int
    total_samples: int
    max_blocksize: int
    max_framesize: int
    streaminfo: bytes           # raw 34-byte STREAMINFO body
    audio_offset: int           # byte offset of the first audio frame
    seekpoints: list[tuple[int, int]] = field(default_factory=list)  # (sample, byte from audio)

    @property
    def frame_bytes_guess(self) -> int:
        """Upper-bound guess for one frame's size in bytes.

        Returns:
            ``max_framesize`` when known, else the size of an uncompressed max-size block.
        """
        if self.max_framesize:
            return self.max_framesize
        return self.max_blocksize * self.channels * self.bits_per_sample // 8 + 64


@dataclass(frozen=True)
class _FlacFrame:
    """A located FLAC frame.

    Attributes:
        offset: Absolute byte offset of the frame header.
        first_sample: Number of the frame's first sample.
        block_size: Samples in the frame.
    """
    offset: int
    first_sample: int
    block_size: int

    @property
    def end_sample(self) -> int:
        """Sample number just past this frame.

        Returns:
            ``first_sample + block_size``.
        """
        return self.first_sample + self.block_size


@functools.cache
def _crc8_table() -> tuple[int, ...]:
    """CRC-8 lookup table for polynomial x^8 + x^2 + x + 1 (FLAC frame headers).

    Built once, on first use.

    Returns:
        The 256 table entries.
    """
    table = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = ((c << 1) ^ 0x07) & 0xFF if c & 0x80 else (c << 1) & 0xFF
        table.append(c)
    return tuple(table)


def _crc8(data: bytes) -> int:
    """FLAC frame-header CRC-8 of ``data``.

    Args:
        data: The frame-header bytes (sync code up to, not including, the CRC byte).

    Returns:
        The CRC-8 value.
    """
    table = _crc8_table()
    c = 0
    for b in data:
        c = table[c ^ b]
    return c


def _read_flac_info(get_range: Callable[[int, int], bytes], file_size: int,
                    head: Optional[bytes] = None) -> _FlacInfo:
    """Parse all FLAC metadata blocks, fetching past the first 4 KB only when needed.

    Args:
        get_range: Callable ``(start_byte, end_byte_inclusive) -> bytes``.
        file_size: Total file size in bytes.
        head: The first bytes of the file, if already fetched.

    Returns:
        The parsed stream info.

    Raises:
        ValueError: If the data is not FLAC or has no STREAMINFO block.
    """
    read = _header_reader(get_range, file_size, head)

    if read(0, 4) != b'fLaC':
        raise ValueError('Not a valid FLAC file')
    pos, streaminfo, seekpoints = 4, None, []
    while True:
        block_header = read(pos, 4)
        if len(block_header) < 4:
            raise ValueError('Truncated FLAC metadata')
        block_type, is_last = block_header[0] & 0x7F, bool(block_header[0] & 0x80)
        length = int.from_bytes(block_header[1:4], 'big')
        if block_type == 0:
            streaminfo = read(pos + 4, STREAMINFO_LEN)
        elif block_type == 3:
            table = read(pos + 4, length)
            for k in range(length // 18):
                sample = int.from_bytes(table[18 * k:18 * k + 8], 'big')
                if sample != 0xFFFFFFFFFFFFFFFF:       # placeholder seek point
                    byte = int.from_bytes(table[18 * k + 8:18 * k + 16], 'big')
                    seekpoints.append((sample, byte))
        pos += 4 + length
        if is_last:
            break
    if streaminfo is None or len(streaminfo) < STREAMINFO_LEN:
        raise ValueError('No STREAMINFO block found')
    packed = int.from_bytes(streaminfo[10:18], 'big')
    return _FlacInfo(
        sample_rate=packed >> 44,
        channels=((packed >> 41) & 0x07) + 1,
        bits_per_sample=((packed >> 36) & 0x1F) + 1,
        total_samples=packed & ((1 << 36) - 1),
        max_blocksize=int.from_bytes(streaminfo[2:4], 'big'),
        max_framesize=int.from_bytes(streaminfo[7:10], 'big'),
        streaminfo=bytes(streaminfo),
        audio_offset=pos,
        seekpoints=sorted(seekpoints),
    )


def _parse_frame_header(buf: bytes, i: int, base: int, info: _FlacInfo) -> Optional[_FlacFrame]:
    """Return the frame starting at ``buf[i]`` if it is a valid frame header, else None.

    Checks the sync code, that every header field is legal and agrees with STREAMINFO, and the
    header CRC-8.

    Args:
        buf: Fetched bytes.
        i: Candidate position inside ``buf``.
        base: Absolute file offset of ``buf[0]``.
        info: Stream info used to cross-check header fields.

    Returns:
        The located frame, or None if ``buf[i]`` is not a frame header.
    """
    if i + 6 > len(buf) or buf[i] != 0xFF or (buf[i + 1] & 0xFE) != 0xF8:
        return None
    variable = buf[i + 1] & 0x01
    bs_code, sr_code = buf[i + 2] >> 4, buf[i + 2] & 0x0F
    ch_code, ss_code = buf[i + 3] >> 4, (buf[i + 3] >> 1) & 0x07
    if bs_code == 0 or sr_code == 0x0F or ch_code > 10 or ss_code == 3 or buf[i + 3] & 0x01:
        return None
    if (ch_code + 1 if ch_code < 8 else 2) != info.channels:
        return None
    if ss_code and _BITS_PER_SAMPLE[ss_code] != info.bits_per_sample:
        return None
    if sr_code in _SAMPLE_RATES and _SAMPLE_RATES[sr_code] != info.sample_rate:
        return None
    j = i + 4
    lead = buf[j]
    for mask, value, bits, extra in _CODED_NUMBER_LEADS:
        if lead & mask == value:
            number = lead & bits
            break
    else:
        return None
    if j + 1 + extra + 4 > len(buf):
        return None
    for k in range(extra):
        cont = buf[j + 1 + k]
        if cont & 0xC0 != 0x80:
            return None
        number = (number << 6) | (cont & 0x3F)
    j += 1 + extra
    if bs_code == 6:
        block_size, j = buf[j] + 1, j + 1
    elif bs_code == 7:
        block_size, j = int.from_bytes(buf[j:j + 2], 'big') + 1, j + 2
    else:
        block_size = _BLOCK_SIZES[bs_code]
    j += {12: 1, 13: 2, 14: 2}.get(sr_code, 0)
    if j >= len(buf) or _crc8(buf[i:j]) != buf[j]:
        return None
    # fixed-blocksize streams number frames; every frame but the last has max_blocksize samples
    first_sample = number if variable else number * info.max_blocksize
    if info.total_samples and first_sample + block_size > info.total_samples:
        return None
    return _FlacFrame(base + i, first_sample, block_size)


def _find_frame_chain(buf: bytes, base: int, info: _FlacInfo) -> list[_FlacFrame]:
    """Longest run of real frames in ``buf``, each followed by the frame that continues it.

    A random byte pattern can pass the header + CRC-8 checks (roughly 1 in a few thousand
    candidates), but it can't also be followed by a frame whose sample number continues it, so it
    never joins the chain.

    Args:
        buf: Fetched bytes.
        base: Absolute file offset of ``buf[0]``.
        info: Stream info.

    Returns:
        Frames in file order (empty if none found).
    """
    candidates = []
    for sync in (FIXED_BLOCKSIZE_SYNC, VARIABLE_BLOCKSIZE_SYNC):
        i = buf.find(sync)
        while i != -1:
            frame = _parse_frame_header(buf, i, base, info)
            if frame:
                candidates.append(frame)
            i = buf.find(sync, i + 1)
    candidates.sort(key=lambda f: f.offset)
    by_first_sample: dict[int, list[_FlacFrame]] = {}
    for frame in candidates:
        by_first_sample.setdefault(frame.first_sample, []).append(frame)

    best: list[_FlacFrame] = []
    used: set[_FlacFrame] = set()
    for start in candidates:
        if start in used:
            continue
        chain = [start]
        while True:
            nxt = next((f for f in by_first_sample.get(chain[-1].end_sample, [])
                        if f.offset > chain[-1].offset), None)
            if nxt is None:
                break
            chain.append(nxt)
        used.update(chain)
        if len(chain) > len(best):
            best = chain
    return best


def _complete_frames(chain: list[_FlacFrame], buf_end: int, info: _FlacInfo,
                     file_size: int) -> tuple[int, int]:
    """(end_sample, end_byte) of the complete frames in ``chain``.

    Every frame except the last ends where the next one starts. The last frame is only known to
    be complete if it is the final frame of the file and the bytes reach EOF.

    Args:
        chain: Frames from ``_find_frame_chain``.
        buf_end: Absolute file offset just past the fetched bytes.
        info: Stream info.
        file_size: Total file size in bytes.

    Returns:
        (sample just past the last complete frame, byte just past it); (0, 0) for no frames.
    """
    if not chain:
        return 0, 0
    last = chain[-1]
    if last.end_sample == info.total_samples and buf_end == file_size:
        return last.end_sample, file_size
    return last.first_sample, last.offset


def _sample_to_byte(info: _FlacInfo, file_size: int, sample: int) -> int:
    """Estimate the byte offset of ``sample``: seektable-interpolated, else average bitrate.

    Args:
        info: Stream info (seek points are byte offsets from the first frame).
        file_size: Total file size in bytes.
        sample: Sample number (clamped to the stream).

    Returns:
        Estimated absolute byte offset.
    """
    points = ([(0, 0)] + [p for p in info.seekpoints if 0 < p[0] < info.total_samples]
              + [(info.total_samples, file_size - info.audio_offset)])
    sample = min(max(sample, 0), info.total_samples)
    k = max(0, bisect.bisect_right([p[0] for p in points], sample) - 1)
    k = min(k, len(points) - 2)
    (s0, b0), (s1, b1) = points[k], points[k + 1]
    frac = (sample - s0) / (s1 - s0) if s1 > s0 else 0.0
    return info.audio_offset + int(b0 + frac * (b1 - b0))


def _flac_stream(info: _FlacInfo, frames: bytes, n_samples: int) -> bytes:
    """A minimal valid FLAC file: magic + STREAMINFO (sample count set, MD5 zeroed) + frames.

    Args:
        info: Stream info of the source file.
        frames: Complete frames copied from the source.
        n_samples: Samples contained in ``frames``.

    Returns:
        Bytes soundfile can decode.
    """
    si = bytearray(info.streaminfo)
    packed = int.from_bytes(si[10:18], 'big')
    packed = (packed & ~((1 << 36) - 1)) | n_samples
    si[10:18] = packed.to_bytes(8, 'big')
    si[18:34] = bytes(16)
    block_header = bytes([0x80]) + STREAMINFO_LEN.to_bytes(3, 'big')   # last block: STREAMINFO
    return b'fLaC' + block_header + bytes(si) + frames
