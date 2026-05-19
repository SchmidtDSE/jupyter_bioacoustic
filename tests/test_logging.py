"""
Test Logging

Tests for the resilient file handler that recovers
from log file deletion or external modification.

License: BSD 3-Clause
"""
import logging
import os

import pytest

from jupyter_bioacoustic import _ResilientFileHandler


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
