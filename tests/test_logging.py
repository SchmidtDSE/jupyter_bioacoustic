"""
Test Logging

Tests for the resilient file handler that recovers
from log file deletion, replacement, or external modification.

License: BSD 3-Clause
"""
import logging
import os
import tempfile

import pytest

import jupyter_bioacoustic
from jupyter_bioacoustic import _ResilientFileHandler, _setup_debug_logging


#
# CONSTANTS
#
LOG_FORMAT = '%(levelname)s %(name)s: %(message)s'
TEST_LOGGER_NAME = 'jupyter_bioacoustic.test_logging'


#
# Fixtures
#
@pytest.fixture
def log_file(tmp_path: str) -> str:
    """Return a temporary log file path."""
    return str(tmp_path / 'test_debug.log')


@pytest.fixture
def logger(log_file: str) -> logging.Logger:
    """Create a logger with a _ResilientFileHandler attached."""
    log = logging.getLogger(TEST_LOGGER_NAME)
    log.setLevel(logging.DEBUG)
    handler = _ResilientFileHandler(log_file)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    log.addHandler(handler)
    yield log
    log.removeHandler(handler)
    handler.close()


#
# Tests
#
def test_log_survives_deletion(logger: logging.Logger, log_file: str) -> None:
    """Logging continues after the log file is deleted."""
    logger.info('before delete')
    assert os.path.exists(log_file)

    os.remove(log_file)
    assert not os.path.exists(log_file)

    logger.info('after delete')
    assert os.path.exists(log_file)
    with open(log_file) as f:
        contents = f.read()
    assert 'after delete' in contents


def test_log_survives_truncation(logger: logging.Logger, log_file: str) -> None:
    """Logging continues after the log file is truncated externally."""
    logger.info('first message')
    with open(log_file) as f:
        assert 'first message' in f.read()

    with open(log_file, 'w') as f:
        f.write('')

    logger.info('second message')
    with open(log_file) as f:
        contents = f.read()
    assert 'second message' in contents


def test_log_survives_atomic_replace(logger: logging.Logger, log_file: str) -> None:
    """Logging continues after the log file is replaced via atomic rename."""
    logger.info('before replace')
    assert os.path.exists(log_file)

    tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(log_file))
    os.write(tmp_fd, b'replaced content\n')
    os.close(tmp_fd)
    os.replace(tmp_path, log_file)

    logger.info('after replace')
    with open(log_file) as f:
        contents = f.read()
    assert 'after replace' in contents


def test_setup_debug_logging_noop_without_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv('JBA_DEBUG_MODE', raising=False)
    pkg_log = jupyter_bioacoustic._log
    before = list(pkg_log.handlers)
    _setup_debug_logging()
    assert pkg_log.handlers == before


def test_setup_debug_logging_attaches_handler(
    monkeypatch: pytest.MonkeyPatch, tmp_path: str,
) -> None:
    monkeypatch.setenv('JBA_DEBUG_MODE', '1')
    monkeypatch.setenv('JBA_LOG_DIR', str(tmp_path))
    monkeypatch.setenv('JBA_LOG_FILE', 'dbg.log')
    pkg_log = jupyter_bioacoustic._log
    before = list(pkg_log.handlers)
    old_level = pkg_log.level
    try:
        _setup_debug_logging()
        added = [h for h in pkg_log.handlers if h not in before]
        assert len(added) == 1
        assert isinstance(added[0], _ResilientFileHandler)
        assert added[0].baseFilename == os.path.join(str(tmp_path), 'dbg.log')
        assert pkg_log.level == logging.DEBUG
    finally:
        for h in list(pkg_log.handlers):
            if h not in before:
                pkg_log.removeHandler(h)
                h.close()
        pkg_log.setLevel(old_level)
