"""
Jupyter Bioacoustic

JupyterLab extension for bioacoustic audio annotation
and review.

When the ``JBA_DEBUG_MODE`` environment variable is set at import time, a
debug log file is attached to the ``jupyter_bioacoustic`` logger
(``$JBA_LOG_DIR/$JBA_LOG_FILE``, default ``./jba_debug.log``).

License: BSD 3-Clause
"""
#
# Imports
#
import logging
import os
import sys

from .api import BioacousticAnnotator, print_md
from .config_builder import ConfigBuilder


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic')
DEFAULT_LOG_FILENAME = 'jba_debug.log'
__all__ = ['BioacousticAnnotator', 'ConfigBuilder', 'print_md']


#
# INTERNAL
#
class _ResilientFileHandler(logging.FileHandler):
    """FileHandler that recovers when the log file is deleted or replaced.

    Detects three failure modes:
    * Stream closed externally.
    * File deleted (path no longer exists).
    * File replaced by an editor (inode changed via atomic rename).
    """

    def __init__(self, *args: object, **kwargs: object) -> None:
        """Open the log file and remember its inode.

        Args:
            *args: Positional arguments passed to ``logging.FileHandler``.
            **kwargs: Keyword arguments passed to ``logging.FileHandler``.
        """
        super().__init__(*args, **kwargs)
        self._inode: int = self._current_inode()

    def emit(self, record: logging.LogRecord) -> None:
        """Reopen the log file if needed, then write *record*.

        Args:
            record: The log record to write.
        """
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
            # never let log-file recovery break the caller; emit() below
            # reports its own errors through logging.Handler.handleError
            pass
        super().emit(record)

    def _current_inode(self) -> int:
        """Return the inode of the log file, or ``-1`` if unavailable.

        Returns:
            The inode number, or ``-1`` when the file cannot be stat'ed.
        """
        try:
            return os.stat(self.baseFilename).st_ino
        except OSError:
            return -1


def _setup_debug_logging() -> None:
    """Attach a debug file handler when ``JBA_DEBUG_MODE`` is set.

    Reads ``JBA_LOG_DIR`` (default ``.``) and ``JBA_LOG_FILE`` (default
    :data:`DEFAULT_LOG_FILENAME`), and prints a one-line notice to the real
    stderr. Does nothing when ``JBA_DEBUG_MODE`` is unset or empty.
    """
    if not os.environ.get('JBA_DEBUG_MODE'):
        return
    log_path = os.path.join(
        os.environ.get('JBA_LOG_DIR', '.'),
        os.environ.get('JBA_LOG_FILE', DEFAULT_LOG_FILENAME),
    )
    handler = _ResilientFileHandler(log_path)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s %(name)s: %(message)s',
    ))
    _log.addHandler(handler)
    _log.setLevel(logging.DEBUG)
    sys.__stderr__.write(
        f'[JBA] Debug mode enabled. '
        f'Logs → {os.path.abspath(log_path)}\n',
    )
    sys.__stderr__.flush()


_setup_debug_logging()
