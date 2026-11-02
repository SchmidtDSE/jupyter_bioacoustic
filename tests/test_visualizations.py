"""
Tests for utils/visualizations.py

Unit tests for spectrogram generation, mel transform,
STFT, and normalization helpers.

License: BSD 3-Clause
"""
import os
import sys

import numpy as np

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


#
# shared helpers
#
class TestSharedHelpers:

    def test_mel_filterbank_shape_and_range(self):
        from jupyter_bioacoustic.utils.visualizations import mel_filterbank
        fb = mel_filterbank(SR, 512, 40, 80.0, SR / 2)
        assert fb.shape == (40, 256)
        assert fb.min() >= 0.0 and fb.max() <= 1.0

    def test_mel_uses_filterbank(self):
        from jupyter_bioacoustic.utils.visualizations import mel_filterbank
        fb = mel_filterbank(SR, 512, 80, 80.0, SR / 2)
        expected = fb @ _stft(MONO, fft=512, hop=128)
        assert np.array_equal(mel(MONO, SR, 0, hop=128)['matrix'], expected)

    def test_normalize_db_range(self):
        from jupyter_bioacoustic.utils.visualizations import normalize_db
        S = np.abs(np.random.default_rng(1).normal(size=(10, 20))) + 1e-3
        out = normalize_db(S)
        assert out.min() == 0.0
        assert np.isclose(out.max(), 1.0)

    def test_normalize_db_auto_detects_db_input(self):
        from jupyter_bioacoustic.utils.visualizations import normalize_db
        S_db = np.array([[-60.0, -20.0], [-40.0, 0.0]])
        assert np.allclose(normalize_db(S_db, matrix_scale=None), (S_db + 60) / 60)

    def test_matrix_to_png_is_png(self):
        from jupyter_bioacoustic.utils.visualizations import matrix_to_png
        png = matrix_to_png(np.random.default_rng(2).random((8, 8)), 50, 0.5)
        assert png[:8] == b'\x89PNG\r\n\x1a\n'

    def test_default_hop(self):
        from jupyter_bioacoustic.utils.visualizations import _default_hop
        assert _default_hop(1000, 10, 99) == 100
        assert _default_hop(5, 10, 99) == 1
        assert _default_hop(1000, 0, 99) == 99

    def test_freq_ticks_linear_and_labels(self):
        from jupyter_bioacoustic.utils.visualizations import _freq_ticks, _khz_labels
        freqs, pos = _freq_ticks('linear', 0.0, 7000.0, 70)
        assert len(freqs) == len(pos) == 8
        assert pos[0] == 0 and pos[-1] == 70
        assert _khz_labels(np.array([500.0, 2000.0])) == ['0.5', '2']


def test_rendering_keeps_the_users_matplotlib_backend():
    """A7: importing / rendering used to call matplotlib.use('Agg'), breaking inline plots."""
    import subprocess
    import textwrap
    code = textwrap.dedent('''
        import base64, json, matplotlib
        import numpy as np
        import pandas as pd
        matplotlib.use('pdf')
        from jupyter_bioacoustic import BioacousticAnnotator
        from jupyter_bioacoustic._kernel_helpers import build_spectrogram
        from jupyter_bioacoustic.utils.visualizations import REGISTRY, render_png
        raw = np.random.default_rng(0).normal(0, 0.1, (8000, 1)).astype('float32')
        out = json.loads(build_spectrogram(raw, 8000, 'linear', 200, 100))
        assert base64.b64decode(out['spec'])[:8] == b'\\x89PNG\\r\\n\\x1a\\n'
        wave = REGISTRY['waveform'](raw[:, 0], 8000, 200)['png_bytes']
        spec = render_png(REGISTRY['spectrogram'](raw[:, 0], 8000, 200)['matrix'], width=200)
        assert wave[:8] == spec[:8] == b'\\x89PNG\\r\\n\\x1a\\n'
        df = pd.DataFrame({'id': [1], 'start_time': [0.0], 'end_time': [1.0], 'f': ['a.wav']})
        BioacousticAnnotator(data=df, audio='f', visualizations=['mel', 'waveform'])
        print(matplotlib.get_backend())
    ''')
    out = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == 'pdf'
