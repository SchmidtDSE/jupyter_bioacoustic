# Mel filterbank applied to _mag (from build_spectrogram.py).
# Sets _f_min, _f_max, _S.

_f_min, _f_max = 80.0, _sr / 2.0
_mel_pts = _np.linspace(2595*_np.log10(1+_f_min/700), 2595*_np.log10(1+_f_max/700), _n_mels+2)
_hz_pts  = 700 * (10 ** (_mel_pts / 2595) - 1)
_bin_pts = (_hz_pts / (_sr / 2.0) * (_fft // 2 - 1)).astype(int).clip(0, _fft // 2 - 1)
_fb = _np.zeros((_n_mels, _fft // 2))
for _m in range(1, _n_mels + 1):
    _lo, _pk, _hi = _bin_pts[_m-1], _bin_pts[_m], _bin_pts[_m+1]
    if _pk > _lo: _fb[_m-1, _lo:_pk] = (_np.arange(_lo, _pk) - _lo) / (_pk - _lo)
    if _hi > _pk: _fb[_m-1, _pk:_hi] = (_hi - _np.arange(_pk, _hi)) / (_hi - _pk)
_S = _fb @ _mag
_freq_scale = 'mel'
