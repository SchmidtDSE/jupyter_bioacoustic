"""
Jupyter Bioacoustic

JupyterLab extension for bioacoustic audio annotation
and review.

License: BSD 3-Clause
"""

import logging
import os
import sys

_log = logging.getLogger('jupyter_bioacoustic')

DEFAULT_LOG_FILENAME = 'jba_debug.log'


class _ResilientFileHandler(logging.FileHandler):
    """FileHandler that recovers when the log file is deleted or replaced.

    Detects three failure modes:
    * Stream closed externally.
    * File deleted (path no longer exists).
    * File replaced by an editor (inode changed via atomic rename).
    """

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        self._inode: int = self._current_inode()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            reopen = False
            if self.stream and self.stream.closed:
                reopen = True
            elif not os.path.exists(self.baseFilename):
                reopen = True
            elif self._current_inode() != self._inode:
                reopen = True
            if reopen:
                if self.stream and not self.stream.closed:
                    self.stream.close()
                self.stream = self._open()
                self._inode = self._current_inode()
        except Exception:
            pass
        super().emit(record)

    def _current_inode(self) -> int:
        """Return the inode of the log file, or ``-1`` if unavailable."""
        try:
            return os.stat(self.baseFilename).st_ino
        except OSError:
            return -1


if os.environ.get('JBA_DEBUG_MODE'):
    _log_path = os.path.join(
        os.environ.get('JBA_LOG_DIR', '.'),
        os.environ.get('JBA_LOG_FILE', DEFAULT_LOG_FILENAME),
    )
    _handler = _ResilientFileHandler(_log_path)
    _handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s %(name)s: %(message)s',
    ))
    _log.addHandler(_handler)
    _log.setLevel(logging.DEBUG)
    sys.__stderr__.write(
        f'[JBA] Debug mode enabled. '
        f'Logs \u2192 {os.path.abspath(_log_path)}\n',
    )
    sys.__stderr__.flush()

from .api import BioacousticAnnotator
from .config_builder import ConfigBuilder

__all__ = ['BioacousticAnnotator', 'ConfigBuilder']
