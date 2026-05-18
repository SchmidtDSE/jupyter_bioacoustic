"""
Tests for _kernel_helpers.py

Unit tests for audio conversion and normalization
utilities.

License: BSD 3-Clause
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic._kernel_helpers import (
    _to_mono,
    _normalize_db,
)


#
# _to_mono
#
class TestToMono:

    def test_mono_passthrough(self):
        raw = np.ones((100, 1), dtype=np.float32)
        result = _to_mono(raw)
        assert result.ndim == 1
        assert len(result) == 100

    def test_stereo_average(self):
        left = np.ones((100, 1), dtype=np.float32) * 2.0
        right = np.ones((100, 1), dtype=np.float32) * 4.0
        raw = np.hstack([left, right])
        result = _to_mono(raw)
        assert result.ndim == 1
        np.testing.assert_allclose(result, 3.0)

    def test_already_1d(self):
        raw = np.ones((50, 1), dtype=np.float32).ravel()
        raw = raw.reshape(-1, 1)
        result = _to_mono(raw)
        assert result.ndim == 1
        assert len(result) == 50


#
# _normalize_db
#
class TestNormalizeDb:

    def test_output_range(self):
        S = np.random.rand(128, 64).astype(np.float32) + 1e-10
        result = _normalize_db(S)
        assert result.min() >= 0.0
        assert result.max() <= 1.0

    def test_zeros_no_nan(self):
        S = np.zeros((10, 10), dtype=np.float32)
        result = _normalize_db(S)
        assert not np.any(np.isnan(result))
        assert not np.any(np.isinf(result))

    def test_uniform_input(self):
        S = np.ones((10, 10), dtype=np.float32)
        result = _normalize_db(S)
        assert not np.any(np.isnan(result))
