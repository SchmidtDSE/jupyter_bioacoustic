# Spectrogram + WAV generation pipeline.
#
# Expects _raw (2D float32 array) and _sr (sample rate) to be set
# by the audio-reading step that runs before this.
#
# Outputs JSON to stdout: { spec, wav, duration, sample_rate, freq_min, freq_max }

import numpy as _np, io as _io, base64 as _b64, json as _j
import matplotlib as _mpl; _mpl.use('Agg')
import matplotlib.pyplot as _plt

_mono = _raw.mean(axis=1) if _raw.shape[1] > 1 else _raw[:, 0]
_actual_dur = len(_mono) / _sr

_fft = 512; _hop = 128; _n_mels = 80
_win = 0.5 * (1 - _np.cos(2 * _np.pi * _np.arange(_fft) / (_fft - 1)))
_n_frames = max(1, (len(_mono) - _fft) // _hop + 1)
_idx = _np.arange(_fft)[None,:] + _hop * _np.arange(_n_frames)[:,None]
_idx = _np.clip(_idx, 0, len(_mono) - 1)
_mag = _np.abs(_np.fft.rfft(_mono[_idx] * _win, axis=1)[:, :_fft//2]).T
