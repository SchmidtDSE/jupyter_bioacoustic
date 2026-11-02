"""HTTPS IO Backend

Audio I/O for HTTPS URLs. FLAC windows use sample-exact
byte-range reads.

License: BSD 3-Clause
"""
from __future__ import annotations

from typing import Any, Optional, Union

from . import _remote


#
# Public API
#
def read(
    src: str,
    dest: Optional[str] = None,
    start_byte: Optional[int] = None,
    end_byte: Optional[int] = None,
    **kwargs: Any,
) -> Union[bytes, str]:
    """Read data from an HTTPS URL.

    Args:
        src: URL to read from.
        dest: Local path to write to (returns bytes
            if None).
        start_byte: Starting byte offset.
        end_byte: Ending byte offset.

    Returns:
        Bytes if dest is None, otherwise dest path.
    """
    return _remote.read('https', src, dest, start_byte, end_byte, **kwargs)


def read_segment(
    path: str,
    start_sec: float,
    dur_sec: float,
    partial: bool = True,
    **kwargs: Any,
) -> Any:
    """Read a time segment from an audio file over HTTPS.

    Args:
        path: URL to the audio file.
        start_sec: Start time in seconds.
        dur_sec: Duration in seconds.
        partial: Attempt partial download optimisation.

    Returns:
        (raw, sr) audio segment.
    """
    return _remote.read_segment('https', path, start_sec, dur_sec, partial, **kwargs)


def write(
    src: str, dest: str, **kwargs: Any,
) -> None:
    """Not supported — HTTPS is read-only."""
    raise NotImplementedError(
        "HTTPS is read-only. "
        "Use S3, GCS, or local for writes."
    )


def list_files(
    path: str, **kwargs: Any,
) -> None:
    """Not supported — cannot list files over HTTPS."""
    raise NotImplementedError(
        "Cannot list files over HTTPS."
    )
