/**
 * Python
 *
 * Python code snippets executed in the Jupyter kernel.
 * Each function returns a Python code string. Template parameters are
 * interpolated into the code. All paths must be pre-escaped with
 * escPy(). Most heavy lifting is in jupyter_bioacoustic._kernel_helpers
 * — these snippets just call into that module.
 *
 * License: BSD 3-Clause
 */

import {escPy} from './util';


//
// Constants
//
const HELPERS = 'from jupyter_bioacoustic._kernel_helpers import';
const DEFAULT_SPEC_WIDTH = 2000;


//
// Kernel variable reading (plugin.ts _init)
//
export function readKernelVars(): string {
  return [
    `import json as _j`,
    `print(_j.dumps({`,
    `  'data': _BA_DATA,`,
    `  'audio': _BA_AUDIO,`,
    `  'output': _BA_OUTPUT,`,
    `  'info_card_title': _BA_INFO_CARD_TITLE,`,
    `  'app_title': _BA_APP_TITLE,`,
    `  'info_card_text': _BA_INFO_CARD_TEXT,`,
    `  'data_cols': _BA_DATA_COLS,`,
    `  'form_config': _BA_FORM_CONFIG,`,
    `  'capture': _BA_CAPTURE,`,
    `  'capture_dir': _BA_CAPTURE_DIR,`,
    `  'capture_height': _BA_CAPTURE_HEIGHT,`,
    `  'duplicate_entries': _BA_DUPLICATE_ENTRIES,`,
    `  'sort': _BA_SORT,`,
    `  'sort_order': _BA_SORT_ORDER,`,
    `  'default_buffer': _BA_DEFAULT_BUFFER,`,
    `  'spec_resolutions': _BA_SPEC_RESOLUTIONS,`,
    `  'viz_meta': _BA_VIZ_META,`,
    `  'sync_config': _BA_SYNC_CONFIG,`,
    `  'clip_table_height': _BA_CLIP_TABLE_HEIGHT,`,
    `  'player_height': _BA_PLAYER_HEIGHT,`,
    `  'info_card_height': _BA_INFO_CARD_HEIGHT,`,
    `  'form_panel_height': _BA_FORM_PANEL_HEIGHT,`,
    `  'description': _BA_DESCRIPTION,`,
    `  'description_height': _BA_DESCRIPTION_HEIGHT,`,
    `  'project_path': _BA_PROJECT_PATH,`,
    `  'config_path': _BA_CONFIG_PATH,`,
    `  'form_path': _BA_FORM_PATH,`,
    `  'merged_config': _BA_MERGED_CONFIG,`,
    `  'data_index_col': _BA_DATA_INDEX_COL,`,
    `  'output_index_col': _BA_OUTPUT_INDEX_COL,`,
    `}))`,
  ].join('\n');
}


//
// Validation
//
export function validateFormConfig(formConfigJson: string): string {
  return [
    `import json as _j`,
    `from jupyter_bioacoustic._validation import validate_config as _vc`,
    `_r = _vc(form_config=_j.loads('${escPy(formConfigJson)}'))`,
    `print(_j.dumps(_r['errors']))`,
  ].join('\n');
}


//
// Spectrogram + WAV generation (Player)
//
export function readAudio(
  path: string,
  startSec: number,
  durSec: number,
): string {
  const p = escPy(path);
  return [
    `from jupyter_bioacoustic.audio import read_segment as _read_segment`,
    `_partial = _BA_INSTANCE._partial_download \\`,
    `  if hasattr(_BA_INSTANCE, '_partial_download') else True`,
    `_raw, _sr = _read_segment('${p}', ${startSec}, ${durSec}, partial=_partial)`,
  ].join('\n');
}

export function buildSpectrogram(
  spectType: 'mel' | 'linear',
  resolutionW?: number,
  resolutionH?: number,
): string {
  const w = resolutionW ?? DEFAULT_SPEC_WIDTH;
  const h = resolutionH ? `, height=${resolutionH}` : '';
  return [
    `${HELPERS} build_spectrogram as _build_spec`,
    `print(_build_spec(_raw, _sr, spec_type='${spectType}', width=${w}${h}))`,
  ].join('\n');
}

export function spectrogramPipeline(
  path: string,
  startSec: number,
  durSec: number,
  vizType: 'builtin' | 'custom',
  builtinKey?: string,
  vizIndex?: number,
  resolutionW?: number,
  resolutionH?: number,
): string {
  const readCode = readAudio(path, startSec, durSec);
  if (vizType === 'custom' && vizIndex != null) {
    return readCode + '\n' + _customVizCode(
      vizIndex, resolutionW ?? DEFAULT_SPEC_WIDTH, resolutionH,
    );
  }
  const spectType: 'mel' | 'linear' =
    builtinKey === 'mel' ? 'mel' : 'linear';
  return readCode + '\n' + buildSpectrogram(
    spectType, resolutionW, resolutionH,
  );
}


//
// Select items loading (FormPanel)
//
export function loadSelectItems(
  path: string,
  valueCol?: string,
  labelCol?: string,
): string {
  const p = escPy(path);
  const v = valueCol ? `'${escPy(valueCol)}'` : 'None';
  const l = labelCol ? `'${escPy(labelCol)}'` : 'None';
  return [
    `${HELPERS} load_select_items as _load`,
    `print(_load('${p}', value_col=${v}, label_col=${l}))`,
  ].join('\n');
}


//
// Output file operations (FormPanel)
//
export function countOutputRows(path: string, ext: string): string {
  const p = escPy(path);
  return [
    `${HELPERS} count_output_rows as _count`,
    `print(_count('${p}', '${ext}'))`,
  ].join('\n');
}

export function readOutputRows(path: string, ext: string): string {
  const p = escPy(path);
  return [
    `${HELPERS} read_output_rows as _read`,
    `print(_read('${p}', '${ext}'))`,
  ].join('\n');
}

export function writeOutputRow(
  path: string,
  values: Record<string, any>,
): string {
  const outPath = escPy(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';

  const cols = Object.keys(values);
  const rowDict =
    `{\n${cols.map(c => `  '${c}': ${_pyRepr(values[c])}`).join(',\n')}\n}`;
  const colsPy = `[${cols.map(c => `'${c}'`).join(',')}]`;

  return [
    `${HELPERS} write_output_row as _write`,
    `_row = ${rowDict}`,
    `print(_write('${outPath}', _row, ${colsPy}, '${ext}'))`,
  ].join('\n');
}

export function deleteOutputRow(
  path: string,
  matchExpr: string,
): string {
  const p = escPy(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return [
    `${HELPERS} delete_output_row as _delete, _safe_float as _sf`,
    `print(_delete('${p}', lambda r: ${matchExpr}, '${ext}'))`,
  ].join('\n');
}


//
// Capture (Player)
//
export function savePng(filename: string, b64Data: string): string {
  const esc = escPy(filename);
  return [
    `${HELPERS} save_png as _save_png`,
    `print(_save_png('${esc}', '${b64Data}'))`,
  ].join('\n');
}


//
// Cache & project operations
//
export const INVALIDATE_OUTPUT_CACHE =
  'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';

export function syncOutput(dest?: string): string {
  const destArg = dest ? `dest='${escPy(dest)}'` : '';
  return [
    `_BA_INSTANCE.sync(${destArg})`,
    `print('ok')`,
  ].join('\n');
}

export function getDefaultProjectPath(): string {
  return [
    `import os as _os, re as _re, json as _json`,
    `_slug = _re.sub(r'[^a-z0-9]+', '_', _BA_INSTANCE._project_name.lower()).strip('_')`,
    `_def_path = _os.path.join('projects', _slug + '.yaml')`,
    `print(_json.dumps({'path': _def_path}))`,
  ].join('\n');
}

export function saveProject(
  path: string,
  overwrite = false,
): string {
  return [
    `import os as _os, json as _json`,
    `_folder = _os.path.dirname('${escPy(path)}') or '.'`,
    `_fname = _os.path.basename('${escPy(path)}')`,
    `_ow = ${overwrite ? 'True' : 'False'}`,
    `_path = _BA_INSTANCE.save_as_project(`,
    `  filename=_fname, folder=_folder, overwrite=_ow)`,
    `print(_json.dumps({'path': _path}))`,
  ].join('\n');
}

export function checkFileExists(path: string): string {
  return [
    `import os, json`,
    `print(json.dumps({'exists': os.path.exists('${escPy(path)}')}))`,
  ].join('\n');
}

export function resolveOutputTemplates(template: string): string {
  return [
    `from jupyter_bioacoustic.api import _resolve_templates`,
    `import json`,
    `_result = _resolve_templates('${escPy(template)}')`,
    `print(json.dumps({'resolved': _result}))`,
  ].join('\n');
}


//
// Internal
//
function _customVizCode(
  vizIndex: number,
  resolutionW: number,
  resolutionH?: number,
): string {
  const h = resolutionH ? `, height=${resolutionH}` : '';
  return [
    `${HELPERS} run_custom_viz as _run_viz`,
    `_viz_entry = _BA_INSTANCE._visualizations[${vizIndex}]`,
    `print(_run_viz(_raw, _sr, _viz_entry, width=${resolutionW}${h}))`,
  ].join('\n');
}

function _pyRepr(val: any): string {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  return `'${escPy(String(val)).replace(/\n/g, ' ')}'`;
}
