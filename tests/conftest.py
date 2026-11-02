"""Shared test fixtures.

License: BSD 3-Clause
"""
import numpy as np
import pytest
import soundfile as sf

from tests._fakes import VBR_SECONDS, VBR_SR


@pytest.fixture(scope='module')
def vbr_flac(tmp_path_factory):
    """60 s FLAC whose bitrate varies strongly: 5 s blocks of digital
    silence and full-scale white noise. soundfile writes no seek table."""
    path = str(tmp_path_factory.mktemp('vbr') / 'vbr.flac')
    rng = np.random.default_rng(0)
    x = np.zeros(VBR_SECONDS * VBR_SR, dtype=np.float32)
    for b in range(5, VBR_SECONDS, 10):
        x[b * VBR_SR:(b + 5) * VBR_SR] = rng.uniform(-1, 1, 5 * VBR_SR)
    sf.write(path, x, VBR_SR, subtype='PCM_16', format='FLAC')
    return path
