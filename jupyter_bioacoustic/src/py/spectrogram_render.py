# Render spectrogram to PNG + encode audio to WAV.
# Expects _S, _f_min, _f_max, _actual_dur, _mono, _sr from previous steps.
# Expects _fig_w (int, image width in px, default 2000) from pipeline.
# Outputs JSON to stdout.

_S_db   = 20 * _np.log10(_np.maximum(_S, 1e-10))
_S_db   = _np.clip(_S_db, _S_db.max() - 80, _S_db.max())
_S_norm = (_S_db - _S_db.min()) / max(float(_S_db.max() - _S_db.min()), 1e-10)

_render_w = _fig_w if '_fig_w' in dir() else 2000
_render_dpi = 100
_fig = _plt.figure(figsize=(_render_w / _render_dpi, 5), dpi=_render_dpi)
_ax  = _fig.add_axes([0, 0, 1, 1])
_ax.imshow(_S_norm, aspect='auto', cmap='magma', origin='lower', interpolation='bilinear')
_ax.set_axis_off()
_pb = _io.BytesIO()
_fig.savefig(_pb, format='png', dpi=_render_dpi, bbox_inches='tight', pad_inches=0)
_plt.close(_fig)

import soundfile as _sf2
_wb = _io.BytesIO()
_sf2.write(_wb, (_mono * 32767).astype(_np.int16)[:, None], _sr, format='WAV', subtype='PCM_16')

print(_j.dumps({
    'spec': _b64.b64encode(_pb.getvalue()).decode(),
    'wav':  _b64.b64encode(_wb.getvalue()).decode(),
    'duration': float(_actual_dur),
    'sample_rate': int(_sr),
    'freq_min': float(_f_min),
    'freq_max': float(_f_max),
}))
