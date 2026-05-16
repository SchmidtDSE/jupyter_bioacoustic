import base64
import csv
import io
import json
import logging
import os

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import soundfile as sf

from .audio import _shared as _audio_shared
from .utils.visualizations import render_png, _stft

_log = logging.getLogger('jupyter_bioacoustic.kernel_helpers')

_FFT = 512
_HOP = 128
_N_MELS = 80


def build_spectrogram(raw, sr, spec_type='mel', width=2000, height=None):
    mono = raw.mean(axis=1) if raw.shape[1] > 1 else raw[:, 0]
    actual_dur = len(mono) / sr

    mag = _stft(mono, fft=_FFT, hop=_HOP)

    if spec_type == 'mel':
        f_min, f_max = 80.0, sr / 2.0
        mel_pts = np.linspace(
            2595 * np.log10(1 + f_min / 700),
            2595 * np.log10(1 + f_max / 700),
            _N_MELS + 2,
        )
        hz_pts = 700 * (10 ** (mel_pts / 2595) - 1)
        bin_pts = (hz_pts / (sr / 2.0) * (_FFT // 2 - 1)).astype(int).clip(0, _FFT // 2 - 1)
        fb = np.zeros((_N_MELS, _FFT // 2))
        for m in range(1, _N_MELS + 1):
            lo, pk, hi = bin_pts[m - 1], bin_pts[m], bin_pts[m + 1]
            if pk > lo:
                fb[m - 1, lo:pk] = (np.arange(lo, pk) - lo) / (pk - lo)
            if hi > pk:
                fb[m - 1, pk:hi] = (hi - np.arange(pk, hi)) / (hi - pk)
        S = fb @ mag
        freq_scale = 'mel'
    else:
        f_min, f_max = 0.0, sr / 2.0
        S = mag
        freq_scale = 'linear'

    S_db = 20 * np.log10(np.maximum(S, 1e-10))
    S_db = np.clip(S_db, S_db.max() - 80, S_db.max())
    S_norm = (S_db - S_db.min()) / max(float(S_db.max() - S_db.min()), 1e-10)

    dpi = 100
    fig_h = (height / dpi) if height else 2.6
    fig = plt.figure(figsize=(width / dpi, fig_h), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(S_norm, aspect='auto', cmap='magma', origin='lower', interpolation='bilinear')
    ax.set_axis_off()
    pb = io.BytesIO()
    fig.savefig(pb, format='png', dpi=dpi, bbox_inches='tight', pad_inches=0)
    plt.close(fig)

    wb = io.BytesIO()
    sf.write(wb, (mono * 32767).astype(np.int16)[:, None], sr, format='WAV', subtype='PCM_16')

    return json.dumps({
        'spec': base64.b64encode(pb.getvalue()).decode(),
        'wav': base64.b64encode(wb.getvalue()).decode(),
        'duration': float(actual_dur),
        'sample_rate': int(sr),
        'freq_min': float(f_min),
        'freq_max': float(f_max),
        'freq_scale': freq_scale,
        'audio_warning': getattr(_audio_shared, 'last_warning', None),
    })


def run_custom_viz(raw, sr, viz_entry, width=2000, height=None):
    mono = raw.mean(axis=1) if raw.shape[1] > 1 else raw[:, 0]
    actual_dur = len(mono) / sr

    viz_fn = viz_entry['fn']
    viz_result = viz_fn(mono, sr, width)

    f_min = float(viz_result['freq_min'])
    f_max = float(viz_result['freq_max'])

    freq_scale_raw = viz_result.get('freq_scale', 'linear')
    freq_scale_lut = None
    if callable(freq_scale_raw):
        n_lut = 256
        lut_freqs = np.linspace(f_min, f_max, n_lut).tolist()
        freq_scale_lut = [float(freq_scale_raw(f, f_min, f_max)) for f in lut_freqs]
        freq_scale = 'lut'
    else:
        freq_scale = str(freq_scale_raw)

    if 'png_bytes' in viz_result:
        spec_b64 = base64.b64encode(viz_result['png_bytes']).decode()
    elif 'matrix' in viz_result:
        png = render_png(viz_result['matrix'], width=width, height=height or None,
                         matrix_scale=viz_result.get('matrix_scale', None))
        spec_b64 = base64.b64encode(png).decode()
    else:
        raise ValueError("Custom viz must return 'png_bytes' or 'matrix'")

    wb = io.BytesIO()
    sf.write(wb, (mono * 32767).astype(np.int16)[:, None], sr, format='WAV', subtype='PCM_16')

    return json.dumps({
        'spec': spec_b64,
        'wav': base64.b64encode(wb.getvalue()).decode(),
        'duration': float(actual_dur),
        'sample_rate': int(sr),
        'freq_min': f_min,
        'freq_max': f_max,
        'freq_scale': freq_scale,
        'freq_scale_lut': freq_scale_lut,
        'audio_warning': getattr(_audio_shared, 'last_warning', None),
    })


def count_output_rows(path, ext):
    c = 0
    if os.path.exists(path):
        if ext == 'csv':
            with open(path) as f:
                c = sum(1 for _ in csv.DictReader(f))
        elif ext == 'parquet':
            import pandas as pd
            c = len(pd.read_parquet(path))
        else:
            with open(path) as f:
                c = sum(1 for line in f if line.strip())
    return json.dumps({'count': c})


def read_output_rows(path, ext):
    r = []
    if os.path.exists(path):
        if ext == 'csv':
            with open(path) as f:
                r = list(csv.DictReader(f))
        elif ext == 'parquet':
            import pandas as pd
            r = pd.read_parquet(path).astype(str).to_dict('records')
        else:
            with open(path) as f:
                r = [json.loads(line) for line in f if line.strip()]
    return json.dumps(r)


def write_output_row(path, row_dict, columns, ext):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)

    if ext == 'csv':
        exists = os.path.exists(path)
        with open(path, 'a', newline='') as f:
            w = csv.DictWriter(f, fieldnames=columns)
            if not exists:
                w.writeheader()
            w.writerow(row_dict)
    elif ext == 'parquet':
        import pandas as pd
        new = pd.DataFrame([row_dict])
        if os.path.exists(path):
            existing = pd.read_parquet(path)
            pd.concat([existing, new], ignore_index=True).to_parquet(path, index=False)
        else:
            new.to_parquet(path, index=False)
    else:
        with open(path, 'a') as f:
            f.write(json.dumps(row_dict) + '\n')
    return 'ok'


def delete_output_row(path, match_fn, ext):
    if ext == 'csv':
        with open(path) as f:
            rows = list(csv.DictReader(f))
        keep = [r for r in rows if not match_fn(r)]
        with open(path, 'w', newline='') as f:
            if keep:
                w = csv.DictWriter(f, fieldnames=keep[0].keys())
                w.writeheader()
                w.writerows(keep)
    elif ext == 'parquet':
        import pandas as pd
        df = pd.read_parquet(path)
        df = df[~df.apply(match_fn, axis=1)]
        df.to_parquet(path, index=False)
    else:
        with open(path) as f:
            rows = [json.loads(line) for line in f if line.strip()]
        keep = [r for r in rows if not match_fn(r)]
        with open(path, 'w') as f:
            for r in keep:
                f.write(json.dumps(r) + '\n')
    return 'ok'


def load_select_items(path, value_col=None, label_col=None):
    ext = os.path.splitext(path)[1].lower()

    if ext == '.csv':
        with open(path) as f:
            if value_col:
                rows = list(csv.DictReader(f))
                lc = label_col or value_col
                return json.dumps([[r[value_col], r.get(lc, r[value_col])] for r in rows])
            else:
                rd = csv.reader(f)
                rows = [r for r in rd if r]
                return json.dumps([[r[0], r[1] if len(r) > 1 else r[0]] for r in rows])

    if ext == '.parquet':
        import pandas as pd
        df = pd.read_parquet(path)
        vc = value_col or df.columns[0]
        lc = label_col or vc
        return json.dumps([[str(r[vc]), str(r[lc])] for _, r in df.iterrows()])

    if ext in ('.jsonl', '.ndjson'):
        with open(path) as f:
            rows = [json.loads(line) for line in f if line.strip()]
        vc = value_col or (list(rows[0].keys())[0] if rows else 'value')
        lc = label_col or vc
        return json.dumps([[str(r[vc]), str(r.get(lc, r[vc]))] for r in rows])

    if ext in ('.yaml', '.yml'):
        import yaml
        with open(path) as f:
            data = yaml.safe_load(f)
        vc = value_col or (list(data.keys())[0] if isinstance(data, dict) else 'value')
        lc = label_col or vc
        if isinstance(data, dict):
            vals = data.get(vc, [])
            lbls = data.get(lc, vals)
            return json.dumps([[str(vals[i]), str(lbls[i])] for i in range(min(len(vals), len(lbls)))])
        else:
            return json.dumps([[str(x), str(x)] for x in data])

    with open(path) as f:
        lines = [ln.rstrip('\n') for ln in f if ln.strip()]
    rows = [[p.strip() for p in ln.split(',', 1)] for ln in lines]
    return json.dumps([[r[0], r[1] if len(r) > 1 else r[0]] for r in rows])


def save_png(path, b64_data):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, 'wb') as f:
        f.write(base64.b64decode(b64_data))
    return 'ok'
