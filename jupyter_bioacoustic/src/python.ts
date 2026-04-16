/**
 * Python code snippets executed in the Jupyter kernel.
 *
 * Each function returns a Python code string. Template parameters are
 * interpolated into the code. All paths must be pre-escaped with escPy().
 *
 * Grouping matches the kernel.exec() call sites across sections.
 */
import { escPy } from './util';

// ─── Kernel variable reading (plugin.ts _init) ──────────────

export function readKernelVars(): string {
  return [
    `import json as _j`,
    `print(_j.dumps({`,
    `  'data': _BA_DATA,`,
    `  'audio_path': _BA_AUDIO_PATH,`,
    `  'audio_col': _BA_AUDIO_COL,`,
    `  'category_path': _BA_CATEGORY_PATH,`,
    `  'output': _BA_OUTPUT,`,
    `  'prediction_col': _BA_PREDICTION_COL,`,
    `  'display_cols': _BA_DISPLAY_COLS,`,
    `  'data_cols': _BA_DATA_COLS,`,
    `  'form_config': _BA_FORM_CONFIG,`,
    `  'capture': _BA_CAPTURE,`,
    `  'capture_dir': _BA_CAPTURE_DIR,`,
    `  'duplicate_entries': _BA_DUPLICATE_ENTRIES,`,
    `  'default_buffer': _BA_DEFAULT_BUFFER,`,
    `}))`,
  ].join('\n');
}

// ─── Spectrogram + WAV generation (Player) ───────────────────

export function readAudioLocal(path: string, startSec: number, durSec: number): string {
  const p = escPy(path);
  return [
    `import soundfile as _sf`,
    `with _sf.SoundFile('${p}') as _f:`,
    `    _sr = _f.samplerate`,
    `    _f.seek(int(${startSec} * _sr))`,
    `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
  ].join('\n');
}

export function readAudioS3(bucket: string, key: string, startSec: number, durSec: number): string {
  return [
    `import boto3 as _b3, tempfile as _tmp, os as _os, soundfile as _sf`,
    `with _tmp.NamedTemporaryFile(suffix='.flac', delete=False) as _t:`,
    `    _b3.client('s3').download_fileobj('${escPy(bucket)}', '${escPy(key)}', _t)`,
    `    _tp = _t.name`,
    `with _sf.SoundFile(_tp) as _f:`,
    `    _sr = _f.samplerate`,
    `    _f.seek(int(${startSec} * _sr))`,
    `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
    `_os.unlink(_tp)`,
  ].join('\n');
}

export function buildSpectrogram(spectType: 'mel' | 'plain'): string {
  const melBlock = [
    `_f_min, _f_max = 80.0, _sr / 2.0`,
    `_mel_pts = _np.linspace(2595*_np.log10(1+_f_min/700), 2595*_np.log10(1+_f_max/700), _n_mels+2)`,
    `_hz_pts  = 700 * (10 ** (_mel_pts / 2595) - 1)`,
    `_bin_pts = (_hz_pts / (_sr / 2.0) * (_fft // 2 - 1)).astype(int).clip(0, _fft // 2 - 1)`,
    `_fb = _np.zeros((_n_mels, _fft // 2))`,
    `for _m in range(1, _n_mels + 1):`,
    `    _lo, _pk, _hi = _bin_pts[_m-1], _bin_pts[_m], _bin_pts[_m+1]`,
    `    if _pk > _lo: _fb[_m-1, _lo:_pk] = (_np.arange(_lo, _pk) - _lo) / (_pk - _lo)`,
    `    if _hi > _pk: _fb[_m-1, _pk:_hi] = (_hi - _np.arange(_pk, _hi)) / (_hi - _pk)`,
    `_S = _fb @ _mag`,
  ];

  const plainBlock = [
    `_f_min, _f_max = 0.0, _sr / 2.0`,
    `_S = _mag`,
  ];

  return [
    `import numpy as _np, io as _io, base64 as _b64, json as _j`,
    `import matplotlib as _mpl; _mpl.use('Agg')`,
    `import matplotlib.pyplot as _plt`,
    `_mono = _raw.mean(axis=1) if _raw.shape[1] > 1 else _raw[:, 0]`,
    `_actual_dur = len(_mono) / _sr`,
    `_fft = 512; _hop = 128; _n_mels = 80`,
    `_win = 0.5 * (1 - _np.cos(2 * _np.pi * _np.arange(_fft) / (_fft - 1)))`,
    `_n_frames = max(1, (len(_mono) - _fft) // _hop + 1)`,
    `_idx = _np.arange(_fft)[None,:] + _hop * _np.arange(_n_frames)[:,None]`,
    `_idx = _np.clip(_idx, 0, len(_mono) - 1)`,
    `_mag = _np.abs(_np.fft.rfft(_mono[_idx] * _win, axis=1)[:, :_fft//2]).T`,
    ...(spectType === 'mel' ? melBlock : plainBlock),
    `_S_db   = 20 * _np.log10(_np.maximum(_S, 1e-10))`,
    `_S_db   = _np.clip(_S_db, _S_db.max() - 80, _S_db.max())`,
    `_S_norm = (_S_db - _S_db.min()) / max(float(_S_db.max() - _S_db.min()), 1e-10)`,
    `_fig = _plt.figure(figsize=(20, 5), dpi=100)`,
    `_ax  = _fig.add_axes([0, 0, 1, 1])`,
    `_ax.imshow(_S_norm, aspect='auto', cmap='magma', origin='lower', interpolation='bilinear')`,
    `_ax.set_axis_off()`,
    `_pb = _io.BytesIO()`,
    `_fig.savefig(_pb, format='png', dpi=100, bbox_inches='tight', pad_inches=0)`,
    `_plt.close(_fig)`,
    `import soundfile as _sf2`,
    `_wb = _io.BytesIO()`,
    `_sf2.write(_wb, (_mono * 32767).astype(_np.int16)[:, None], _sr, format='WAV', subtype='PCM_16')`,
    `print(_j.dumps({`,
    `  'spec': _b64.b64encode(_pb.getvalue()).decode(),`,
    `  'wav':  _b64.b64encode(_wb.getvalue()).decode(),`,
    `  'duration': float(_actual_dur),`,
    `  'sample_rate': int(_sr),`,
    `  'freq_min': float(_f_min),`,
    `  'freq_max': float(_f_max),`,
    `}))`,
  ].join('\n');
}

/** Full spectrogram pipeline: read audio + process + return JSON. */
export function spectrogramPipeline(
  path: string, startSec: number, durSec: number, spectType: 'mel' | 'plain'
): string {
  let readCode: string;
  if (path.startsWith('s3://')) {
    const noProto = path.slice(5);
    const slash = noProto.indexOf('/');
    const bucket = slash < 0 ? noProto : noProto.slice(0, slash);
    const key = slash < 0 ? '' : noProto.slice(slash + 1);
    readCode = readAudioS3(bucket, key, startSec, durSec);
  } else {
    readCode = readAudioLocal(path, startSec, durSec);
  }
  return readCode + '\n' + buildSpectrogram(spectType);
}

// ─── Select items loading (FormPanel) ────────────────────────

export function loadSelectItemsCsv(path: string, valueCol?: string, labelCol?: string): string {
  const p = escPy(path);
  if (valueCol) {
    const v = escPy(valueCol);
    const l = labelCol ? escPy(labelCol) : v;
    return [
      `import csv as _csv, json as _j`,
      `with open('${p}') as _f:`,
      `    _rows = list(_csv.DictReader(_f))`,
      `print(_j.dumps([[r['${v}'], r.get('${l}', r['${v}'])] for r in _rows]))`,
    ].join('\n');
  }
  return [
    `import csv as _csv, json as _j`,
    `with open('${p}') as _f:`,
    `    _rd = _csv.reader(_f)`,
    `    _rows = [r for r in _rd if r]`,
    `print(_j.dumps([[r[0], r[1] if len(r)>1 else r[0]] for r in _rows]))`,
  ].join('\n');
}

export function loadSelectItemsParquet(path: string, valueCol?: string, labelCol?: string): string {
  const p = escPy(path);
  const v = valueCol ? `'${escPy(valueCol)}'` : 'None';
  const l = labelCol ? `'${escPy(labelCol)}'` : 'None';
  return [
    `import pandas as _pd, json as _j`,
    `_df = _pd.read_parquet('${p}')`,
    `_vc = ${v} or _df.columns[0]`,
    `_lc = ${l} or _vc`,
    `print(_j.dumps([[str(r[_vc]), str(r[_lc])] for _,r in _df.iterrows()]))`,
  ].join('\n');
}

export function loadSelectItemsJsonl(path: string, valueCol?: string, labelCol?: string): string {
  const p = escPy(path);
  const v = valueCol ? `'${escPy(valueCol)}'` : 'None';
  const l = labelCol ? `'${escPy(labelCol)}'` : 'None';
  return [
    `import json as _j`,
    `_rows = [_j.loads(line) for line in open('${p}') if line.strip()]`,
    `_vc = ${v} or (list(_rows[0].keys())[0] if _rows else 'value')`,
    `_lc = ${l} or _vc`,
    `print(_j.dumps([[str(r[_vc]), str(r.get(_lc, r[_vc]))] for r in _rows]))`,
  ].join('\n');
}

export function loadSelectItemsYaml(path: string, valueCol?: string, labelCol?: string): string {
  const p = escPy(path);
  const v = valueCol ? `'${escPy(valueCol)}'` : 'None';
  const l = labelCol ? `'${escPy(labelCol)}'` : 'None';
  return [
    `import yaml as _y, json as _j`,
    `_data = _y.safe_load(open('${p}'))`,
    `_vc = ${v} or (list(_data.keys())[0] if isinstance(_data, dict) else 'value')`,
    `_lc = ${l} or _vc`,
    `if isinstance(_data, dict):`,
    `    _vals = _data.get(_vc, [])`,
    `    _lbls = _data.get(_lc, _vals)`,
    `    print(_j.dumps([[str(_vals[i]), str(_lbls[i])] for i in range(min(len(_vals),len(_lbls)))]))`,
    `else:`,
    `    print(_j.dumps([[str(x), str(x)] for x in _data]))`,
  ].join('\n');
}

export function loadSelectItemsText(path: string): string {
  const p = escPy(path);
  return [
    `import json as _j`,
    `_lines = [ln.rstrip('\\n') for ln in open('${p}') if ln.strip()]`,
    `_rows = [[p[0].strip(), p[1].strip() if len(p)>1 else p[0].strip()] for p in [ln.split(',',1) for ln in _lines]]`,
    `print(_j.dumps(_rows))`,
  ].join('\n');
}

// ─── Output file operations (FormPanel) ──────────────────────

/** Count rows + valid rows in the output file. */
export function countOutputProgress(
  path: string, ext: string, isValidCol: string, yesVal: string
): string {
  const p = escPy(path);
  const validLine = isValidCol
    ? (ext === 'csv'
      ? `        _v = sum(1 for r in rows if r.get('${isValidCol}') == '${yesVal}')`
      : ext === 'parquet'
        ? `    if '${isValidCol}' in df.columns: _v = int((df['${isValidCol}'].astype(str) == '${yesVal}').sum())`
        : `        _v = sum(1 for r in rows if str(r.get('${isValidCol}','')) == '${yesVal}')`)
    : '';

  if (ext === 'csv') {
    return [
      `import csv, json, os`,
      `_c = _v = 0`,
      `if os.path.exists('${p}'):`,
      `    with open('${p}') as f:`,
      `        rows = list(csv.DictReader(f))`,
      `        _c = len(rows)`,
      ...(validLine ? [validLine] : []),
      `print(json.dumps({'count': _c, 'valid': _v}))`,
    ].join('\n');
  }
  if (ext === 'parquet') {
    return [
      `import json, os`,
      `_c = _v = 0`,
      `if os.path.exists('${p}'):`,
      `    import pandas as pd`,
      `    df = pd.read_parquet('${p}')`,
      `    _c = len(df)`,
      ...(validLine ? [validLine] : []),
      `print(json.dumps({'count': _c, 'valid': _v}))`,
    ].join('\n');
  }
  // jsonl / default
  return [
    `import json, os`,
    `_c = _v = 0`,
    `if os.path.exists('${p}'):`,
    `    with open('${p}') as f:`,
    `        rows = [json.loads(l) for l in f if l.strip()]`,
    `        _c = len(rows)`,
    ...(validLine ? [validLine] : []),
    `print(json.dumps({'count': _c, 'valid': _v}))`,
  ].join('\n');
}

/** Read all output rows as JSON (for reviewed state). */
export function readOutputRows(path: string, ext: string): string {
  const p = escPy(path);
  if (ext === 'csv') {
    return `import csv,json,os\n_r=[]\nif os.path.exists('${p}'):\n with open('${p}') as f: _r=list(csv.DictReader(f))\nprint(json.dumps(_r))`;
  }
  if (ext === 'parquet') {
    return `import pandas as pd,json,os\n_r=[]\nif os.path.exists('${p}'):\n _r=pd.read_parquet('${p}').astype(str).to_dict('records')\nprint(json.dumps(_r))`;
  }
  return `import json,os\n_r=[]\nif os.path.exists('${p}'):\n with open('${p}') as f: _r=[json.loads(l) for l in f if l.strip()]\nprint(json.dumps(_r))`;
}

/** Write a single row to the output file (csv/parquet/jsonl). */
export function writeOutputRow(path: string, values: Record<string, any>): string {
  const outPath = escPy(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';

  const mkdirLine = `import os as _os; _d=_os.path.dirname('${outPath}');\nif _d: _os.makedirs(_d, exist_ok=True)`;

  const cols = Object.keys(values);
  const pyRepr = (val: any): string => {
    if (val === null || val === undefined) return 'None';
    if (typeof val === 'boolean') return val ? 'True' : 'False';
    if (typeof val === 'number') return String(val);
    return `'${escPy(String(val)).replace(/\n/g, ' ')}'`;
  };
  const rowDict = `{\n${cols.map(c => `  '${c}': ${pyRepr(values[c])}`).join(',\n')}\n}`;

  if (ext === 'csv') {
    const colsPy = `[${cols.map(c => `'${c}'`).join(',')}]`;
    return [
      mkdirLine,
      `import csv as _csv, os as _os`,
      `_cols = ${colsPy}`,
      `_row  = ${rowDict}`,
      `_exists = _os.path.exists('${outPath}')`,
      `with open('${outPath}', 'a', newline='') as _f:`,
      `  _w = _csv.DictWriter(_f, fieldnames=_cols)`,
      `  if not _exists: _w.writeheader()`,
      `  _w.writerow(_row)`,
      `print('ok')`,
    ].join('\n');
  }

  if (ext === 'parquet') {
    return [
      mkdirLine,
      `import pandas as _pd, os as _os`,
      `_row  = ${rowDict}`,
      `_new  = _pd.DataFrame([_row])`,
      `if _os.path.exists('${outPath}'):`,
      `  _existing = _pd.read_parquet('${outPath}')`,
      `  _pd.concat([_existing, _new], ignore_index=True).to_parquet('${outPath}', index=False)`,
      `else:`,
      `  _new.to_parquet('${outPath}', index=False)`,
      `print('ok')`,
    ].join('\n');
  }

  return [
    mkdirLine,
    `import json as _json`,
    `_row  = ${rowDict}`,
    `with open('${outPath}', 'a') as _f:`,
    `  _f.write(_json.dumps(_row) + '\\n')`,
    `print('ok')`,
  ].join('\n');
}

/** Delete a row from the output file matching the given expression. */
export function deleteOutputRow(path: string, matchExpr: string): string {
  const p = escPy(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'csv') {
    return [
      `import csv,os`,
      `_rows=list(csv.DictReader(open('${p}')))`,
      `_keep=[r for r in _rows if not (${matchExpr})]`,
      `with open('${p}','w',newline='') as f:`,
      `  if _keep:`,
      `    w=csv.DictWriter(f,fieldnames=_keep[0].keys())`,
      `    w.writeheader(); w.writerows(_keep)`,
      `print('ok')`,
    ].join('\n');
  }

  if (ext === 'parquet') {
    return [
      `import pandas as pd`,
      `df=pd.read_parquet('${p}')`,
      `df=df[~df.apply(lambda r: ${matchExpr}, axis=1)]`,
      `df.to_parquet('${p}',index=False)`,
      `print('ok')`,
    ].join('\n');
  }

  return [
    `import json`,
    `_rows=[json.loads(l) for l in open('${p}') if l.strip()]`,
    `_keep=[r for r in _rows if not (${matchExpr})]`,
    `with open('${p}','w') as f:`,
    `  for r in _keep: f.write(json.dumps(r)+'\\n')`,
    `print('ok')`,
  ].join('\n');
}

// ─── Capture (Player) ────────────────────────────────────────

export function savePng(filename: string, b64Data: string): string {
  const esc = escPy(filename);
  return [
    `import base64 as _b64, os as _os`,
    `_p = '${esc}'`,
    `_d = _os.path.dirname(_p)`,
    `if _d: _os.makedirs(_d, exist_ok=True)`,
    `with open(_p, 'wb') as _f:`,
    `    _f.write(_b64.b64decode('${b64Data}'))`,
    `print('ok')`,
  ].join('\n');
}

// ─── Cache invalidation ──────────────────────────────────────

export const INVALIDATE_OUTPUT_CACHE =
  'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';
