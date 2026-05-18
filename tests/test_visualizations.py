"""
Tests for utils/visualizations.py

Unit tests for spectrogram generation, mel transform,
STFT, and normalization helpers.

License: BSD 3-Clause
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.utils.visualizations import (
    spectrogram,
    mel,
    _stft,
)


#
# Constants
#
SR = 22050
DURATION = 2.0
MONO = np.random.randn(int(SR * DURATION)).astype(np.float32)


#
# _stft
#
class TestStft:

    def test_output_shape(self):
        fft = 1024
        hop = 512
        S = _stft(MONO, fft=fft, hop=hop)
        assert S.shape[0] == fft // 2
        assert S.shape[1] > 0

    def test_non_negative(self):
        S = _stft(MONO)
        assert np.all(S >= 0)

    def test_short_audio(self):
        short = np.zeros(100, dtype=np.float32)
        S = _stft(short, fft=256, hop=128)
        assert S.shape[0] == 128
        assert S.shape[1] >= 1


#
# spectrogram
#
class TestSpectrogram:

    def test_returns_required_keys(self):
        result = spectrogram(MONO, SR, 500)
        assert 'matrix' in result
        assert 'freq_min' in result
        assert 'freq_max' in result
        assert 'freq_scale' in result

    def test_freq_scale_is_linear(self):
        result = spectrogram(MONO, SR, 500)
        assert result['freq_scale'] == 'linear'

    def test_matrix_shape(self):
        result = spectrogram(MONO, SR, 500)
        mat = result['matrix']
        assert mat.ndim == 2
        assert mat.shape[0] > 0
        assert mat.shape[1] > 0

    def test_freq_range(self):
        result = spectrogram(MONO, SR, 500)
        assert result['freq_min'] == 0.0
        assert result['freq_max'] == SR / 2.0


#
# mel
#
class TestMel:

    def test_returns_required_keys(self):
        result = mel(MONO, SR, 500)
        assert 'matrix' in result
        assert 'freq_scale' in result

    def test_freq_scale_is_mel(self):
        result = mel(MONO, SR, 500)
        assert result['freq_scale'] == 'mel'

    def test_matrix_shape(self):
        result = mel(MONO, SR, 500)
        mat = result['matrix']
        assert mat.ndim == 2
        assert mat.shape[0] > 0
