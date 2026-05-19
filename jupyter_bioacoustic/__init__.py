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
    """FileHandler that recovers when the log file is deleted or replaced."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if self.stream and (self.stream.closed or not os.path.exists(self.baseFilename)):
                self.stream.close()
                self.stream = self._open()
        except Exception:
            pass
        super().emit(record)


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
