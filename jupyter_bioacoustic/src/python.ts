/**
 * Python code snippets executed in the Jupyter kernel.
 *
 * Each function returns a Python code string. Template parameters are
 * interpolated into the code. All paths must be pre-escaped with escPy().
 *
 * Grouping matches the kernel.exec() call sites across sections.
 */
import { escPy } from './util';
import {
  buildSpectrogram as PY_BUILD_SPEC,
  spectrogramMel as PY_SPEC_MEL,
  spectrogramPlain as PY_SPEC_PLAIN,
  spectrogramRender as PY_SPEC_RENDER,
} from './py_chunks';

// ─── Kernel variable reading (plugin.ts _init) ──────────────

export function readKernelVars(): string {
  return [
    `import json as _j`,
    `print(_j.dumps({`,
    `  'data': _BA_DATA,`,
    `  'audio': _BA_AUDIO,`,
    `  'category_path': _BA_CATEGORY_PATH,`,
    `  'output': _BA_OUTPUT,`,
    `  'ident_col': _BA_IDENT_COL,`,
    `  'app_title': _BA_APP_TITLE,`,
    `  'display_cols': _BA_DISPLAY_COLS,`,
    `  'data_cols': _BA_DATA_COLS,`,
    `  'form_config': _BA_FORM_CONFIG,`,
    `  'capture': _BA_CAPTURE,`,
    `  'capture_dir': _BA_CAPTURE_DIR,`,
    `  'duplicate_entries': _BA_DUPLICATE_ENTRIES,`,
    `  'default_buffer': _BA_DEFAULT_BUFFER,`,
    `  'spec_resolutions': _BA_SPEC_RESOLUTIONS,`,
    `  'viz_meta': _BA_VIZ_META,`,
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
  // Try partial FLAC read (header + byte-range), fall back to full download + cache
  return [
    `import struct as _struct, os as _os, hashlib as _hl, boto3 as _b3, tempfile as _tmp, soundfile as _sf, sys as _sys`,
    `_s3 = _b3.client('s3')`,
    `_bkt, _key = '${escPy(bucket)}', '${escPy(key)}'`,
    `_raw = None`,
    `try:`,
    `    # 1. Read FLAC header (4KB)`,
    `    _hdr = _s3.get_object(Bucket=_bkt, Key=_key, Range='bytes=0-4095')['Body'].read()`,
    `    assert _hdr[:4] == b'fLaC', 'Not a valid FLAC file'`,
    `    _pos = 4`,
    `    while _pos < len(_hdr) - 34:`,
    `        _bt = _hdr[_pos] & 0x7f`,
    `        _ln = _struct.unpack('>I', b'\\x00' + _hdr[_pos+1:_pos+4])[0]`,
    `        if _bt == 0:`,
    `            _si = _hdr[_pos+4:_pos+4+_ln]`,
    `            _sr = _struct.unpack('>I', b'\\x00' + _si[10:13])[0] >> 4`,
    `            _ts = _struct.unpack('>Q', b'\\x00\\x00\\x00' + _si[13:18])[0] & 0xfffffffff`,
    `            _total_dur = _ts / _sr`,
    `            break`,
    `        _pos += 4 + _ln`,
    `    # 2. Estimate byte range with 25% padding`,
    `    _fsz = _s3.head_object(Bucket=_bkt, Key=_key)['ContentLength']`,
    `    _dur = ${durSec}`,
    `    _pad = _dur * 0.25`,
    `    _ps = max(0, ${startSec} - _pad)`,
    `    _pe = min(_total_dur, ${startSec} + _dur + _pad)`,
    `    _bps = _fsz / _total_dur`,
    `    _sb, _eb = int(_ps * _bps), min(_fsz - 1, int(_pe * _bps))`,
    `    print(f'[S3 partial] header_sr={_sr} total_dur={_total_dur:.1f}s file_size={_fsz} byte_range={_sb}-{_eb} ({(_eb-_sb)/(1024*1024):.1f}MB)', file=_sys.stderr)`,
    `    # 3. Download byte range + prepend header`,
    `    _audio_bytes = _s3.get_object(Bucket=_bkt, Key=_key, Range=f'bytes={_sb}-{_eb}')['Body'].read()`,
    `    with _tmp.NamedTemporaryFile(suffix='.flac', delete=False) as _t:`,
    `        _t.write(_hdr)`,
    `        _t.write(_audio_bytes)`,
    `        _tp = _t.name`,
    `    with _sf.SoundFile(_tp) as _f:`,
    `        _rel_start = ${startSec} - _ps`,
    `        _f.seek(int(_rel_start * _sr))`,
    `        _raw = _f.read(int(_dur * _sr), dtype='float32', always_2d=True)`,
    `    _os.unlink(_tp)`,
    `    print(f'[S3 partial] SUCCESS: read {_raw.shape[0]} samples', file=_sys.stderr)`,
    `except Exception as _e:`,
    `    print(f'[S3 partial] FAILED: {type(_e).__name__}: {_e}', file=_sys.stderr)`,
    `    print(f'[S3 partial] Falling back to full download + cache', file=_sys.stderr)`,
    `    _cache_dir = '/tmp/jba_audio_cache'`,
    `    _os.makedirs(_cache_dir, exist_ok=True)`,
    `    _name = _hl.md5(f'{_bkt}/{_key}'.encode()).hexdigest() + '.flac'`,
    `    _cached = _os.path.join(_cache_dir, _name)`,
    `    if not _os.path.exists(_cached):`,
    `        _s3.download_file(_bkt, _key, _cached)`,
    `    with _sf.SoundFile(_cached) as _f:`,
    `        _sr = _f.samplerate`,
    `        _f.seek(int(${startSec} * _sr))`,
    `        _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
  ].join('\n');
}

export function readAudioUrl(url: string, startSec: number, durSec: number): string {
  // Download URL to a cached local file, then read with soundfile
  const u = escPy(url);
  return [
    `import os as _os, hashlib as _hl, soundfile as _sf`,
    `_cache_dir = '/tmp/jba_audio_cache'`,
    `_os.makedirs(_cache_dir, exist_ok=True)`,
    `_url = '${u}'`,
    `_name = _hl.md5(_url.encode()).hexdigest() + _os.path.splitext(_url.split('?')[0])[1]`,
    `_cached = _os.path.join(_cache_dir, _name)`,
    `if not _os.path.exists(_cached):`,
    `    import requests as _req`,
    `    _resp = _req.get(_url, stream=True, timeout=300)`,
    `    _resp.raise_for_status()`,
    `    with open(_cached, 'wb') as _f:`,
    `        for _chunk in _resp.iter_content(8192): _f.write(_chunk)`,
    `with _sf.SoundFile(_cached) as _f:`,
    `    _sr = _f.samplerate`,
    `    _f.seek(int(${startSec} * _sr))`,
    `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
  ].join('\n');
}

/** Assemble the spectrogram pipeline from .py chunks (no template vars). */
export function buildSpectrogram(spectType: 'mel' | 'plain', resolutionW?: number): string {
  const filterBlock = spectType === 'mel' ? PY_SPEC_MEL : PY_SPEC_PLAIN;
  const resLine = resolutionW ? `_fig_w = ${resolutionW}` : '';
  return [PY_BUILD_SPEC, filterBlock, resLine, PY_SPEC_RENDER].join('\n');
}

/** Python code for a custom visualization callable. */
function customVizCode(vizIndex: number, resolutionW: number): string {
  return [
    `import numpy as _np, io as _io, base64 as _b64, json as _j`,
    `from jupyter_bioacoustic.utils.visualizations import render_png as _render_matrix`,
    `_mono = _raw.mean(axis=1) if _raw.shape[1] > 1 else _raw[:, 0]`,
    `_actual_dur = len(_mono) / _sr`,
    `_viz_entry = _BA_INSTANCE._visualizations[${vizIndex}]`,
    `_viz_fn = _viz_entry['fn']`,
    `_viz_result = _viz_fn(_mono, _sr, ${resolutionW})`,
    `_f_min = float(_viz_result['freq_min'])`,
    `_f_max = float(_viz_result['freq_max'])`,
    `_freq_scale_raw = _viz_result.get('freq_scale', 'linear')`,
    `_freq_scale_lut = None`,
    `if callable(_freq_scale_raw):`,
    `    _n_lut = 256`,
    `    _lut_freqs = _np.linspace(_f_min, _f_max, _n_lut).tolist()`,
    `    _freq_scale_lut = [float(_freq_scale_raw(f, _f_min, _f_max)) for f in _lut_freqs]`,
    `    _freq_scale = 'lut'`,
    `else:`,
    `    _freq_scale = str(_freq_scale_raw)`,
    `if 'png_bytes' in _viz_result:`,
    `    _spec_b64 = _b64.b64encode(_viz_result['png_bytes']).decode()`,
    `elif 'matrix' in _viz_result:`,
    `    _png = _render_matrix(_viz_result['matrix'], width=${resolutionW}, matrix_scale=_viz_result.get('matrix_scale', None))`,
    `    _spec_b64 = _b64.b64encode(_png).decode()`,
    `else:`,
    `    raise ValueError("Custom viz must return 'png_bytes' or 'matrix'")`,
    `import soundfile as _sf2`,
    `_wb = _io.BytesIO()`,
    `_sf2.write(_wb, (_mono * 32767).astype(_np.int16)[:, None], _sr, format='WAV', subtype='PCM_16')`,
    `print(_j.dumps({`,
    `    'spec': _spec_b64,`,
    `    'wav': _b64.b64encode(_wb.getvalue()).decode(),`,
    `    'duration': float(_actual_dur),`,
    `    'sample_rate': int(_sr),`,
    `    'freq_min': _f_min,`,
    `    'freq_max': _f_max,`,
    `    'freq_scale': _freq_scale,`,
    `    'freq_scale_lut': _freq_scale_lut,`,
    `}))`,
  ].join('\n');
}

/** Full spectrogram pipeline: read audio + process + return JSON. */
export function spectrogramPipeline(
  path: string, startSec: number, durSec: number,
  vizType: 'builtin' | 'custom', builtinKey?: string,
  vizIndex?: number, resolutionW?: number,
): string {
  let readCode: string;
  if (path.startsWith('s3://')) {
    const noProto = path.slice(5);
    const slash = noProto.indexOf('/');
    const bucket = slash < 0 ? noProto : noProto.slice(0, slash);
    const key = slash < 0 ? '' : noProto.slice(slash + 1);
    readCode = readAudioS3(bucket, key, startSec, durSec);
  } else if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('gs://')) {
    readCode = readAudioUrl(path, startSec, durSec);
  } else {
    readCode = readAudioLocal(path, startSec, durSec);
  }
  if (vizType === 'custom' && vizIndex != null) {
    return readCode + '\n' + customVizCode(vizIndex, resolutionW ?? 2000);
  }
  const spectType = (builtinKey === 'mel' ? 'mel' : 'plain') as 'mel' | 'plain';
  return readCode + '\n' + buildSpectrogram(spectType, resolutionW);
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
