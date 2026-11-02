/**
 * Python code snippets executed in the annotator's Jupyter kernel.
 *
 * Each function returns a Python code string. Template parameters are
 * interpolated into the code. All paths must be pre-escaped with
 * escPy(). Most heavy lifting is in jupyter_bioacoustic._kernel_helpers
 * — these snippets just call into that module.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { escPy } from './util';


//
// Constants
//
/** Import prefix for the kernel-side helper module. */
const HELPERS = 'from jupyter_bioacoustic._kernel_helpers import';
/** Spectrogram width (px) when no resolution is chosen. */
const DEFAULT_SPEC_WIDTH = 2000;

/** Drop the output-file cache after a write/delete (no-op if the instance has none). */
export const INVALIDATE_OUTPUT_CACHE =
  'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';


//
// Public
//
// ── Opening an annotator (plugin.ts) ──────────────────────────
/**
 * Validate a project file and set up an annotator for it in the kernel (raises on invalid
 * config). Changes the kernel's cwd to ``workDir`` first, so relative project paths resolve.
 *
 * @param workDir - Absolute directory to ``chdir`` into (``~`` expanded).
 * @param relPath - Project file path, relative to ``workDir`` (or absolute / remote URI).
 */
export function openProjectInKernel(workDir: string, relPath: string): string {
  return [
    `import os as _os`,
    `_os.chdir(_os.path.expanduser('${escPy(workDir)}'))`,
    `from jupyter_bioacoustic import BioacousticAnnotator as _BA`,
    `from jupyter_bioacoustic import ConfigBuilder as _CB`,
    `_cb = _CB()`,
    `_cb.load_config('${escPy(relPath)}')`,
    `_vr = _cb.validate()`,
    `if _vr['errors']:`,
    `    raise ValueError('Config validation failed:\\n' + '\\n'.join(_vr['errors']))`,
    `_ba = _BA(project='${escPy(relPath)}')`,
    `_ba.setup()`,
  ].join('\n');
}

/**
 * Copy the starter notebook into ``cwd``; prints ``{"path", "relative"}`` as JSON.
 *
 * @param cwd - Absolute directory to copy into (``~`` expanded).
 */
export function copyStarterNotebook(cwd: string): string {
  return [
    `import os as _os; _os.chdir(_os.path.expanduser('${escPy(cwd)}'))`,
    `from jupyter_bioacoustic.config_builder.notebook import copy_starter_notebook`,
    `import json; print(json.dumps(copy_starter_notebook('.')))`,
  ].join('\n');
}

// ── Kernel variable reading (BioacousticWidget._init) ─────────
/** Print every ``_BA_*`` config global as one JSON object (see ``types.KernelVars``). */
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

// ── Validation ────────────────────────────────────────────────
/** Validate a form config; prints the list of error strings as JSON. */
export function validateFormConfig(formConfigJson: string): string {
  return [
    `import json as _j`,
    `from jupyter_bioacoustic._validation import validate_config as _vc`,
    `_r = _vc(form_config=_j.loads('${escPy(formConfigJson)}'))`,
    `print(_j.dumps(_r['errors']))`,
  ].join('\n');
}

// ── Spectrogram + WAV generation (Player) ─────────────────────
/** Read ``durSec`` seconds of audio from ``startSec`` into the kernel globals ``_raw, _sr``. */
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

/** Print a built-in spectrogram (+ WAV) of ``_raw`` as JSON (run after ``readAudio``). */
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

/**
 * Read audio and print its spectrogram JSON in one call: the built-in ``mel``/``linear`` view
 * or custom visualization ``vizIndex``.
 */
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

// ── Select items loading (FormPanel) ──────────────────────────
/** Load select ``[value, label]`` pairs from a CSV/YAML/... file; prints them as JSON. */
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

// ── Output file operations (FormPanel) ────────────────────────
/** Print ``{"count": n}`` — the number of rows in the output file. */
export function countOutputRows(path: string, ext: string): string {
  const p = escPy(path);
  return [
    `${HELPERS} count_output_rows as _count`,
    `print(_count('${p}', '${ext}'))`,
  ].join('\n');
}

/** Print every output-file row as a JSON list of objects. */
export function readOutputRows(path: string, ext: string): string {
  const p = escPy(path);
  return [
    `${HELPERS} read_output_rows as _read`,
    `print(_read('${p}', '${ext}'))`,
  ].join('\n');
}

/**
 * Append one row to the output file (see ``writeOutputRows``).
 */
export function writeOutputRow(
  path: string,
  values: Record<string, any>,
): string {
  return writeOutputRows(path, [values]);
}

/**
 * Append rows to the output file in ONE kernel call, so a multibox submit is saved
 * all-or-nothing. Rows travel as JSON, so any column name or value is safe (quotes,
 * newlines; NaN/Infinity become None). Python: ``_kernel_helpers.write_output_rows``.
 */
export function writeOutputRows(
  path: string,
  rows: Record<string, any>[],
): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  }
  const payload = escPy(JSON.stringify({ rows, cols }));
  return [
    'import json as _j',
    `${HELPERS} write_output_rows as _write_rows`,
    `_p = _j.loads('${payload}')`,
    `print(_write_rows('${escPy(path)}', _p['rows'], _p['cols'], '${escPy(ext)}'))`,
  ].join('\n');
}

/**
 * Delete the output rows matching ``matchExpr``.
 *
 * @param matchExpr - Python expression over the row dict ``r`` (callers must escape values).
 */
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

// ── Capture (Player) ──────────────────────────────────────────
/** Save a base64 PNG to ``filename`` (relative to the kernel cwd). */
export function savePng(filename: string, b64Data: string): string {
  const esc = escPy(filename);
  return [
    `${HELPERS} save_png as _save_png`,
    `print(_save_png('${esc}', '${b64Data}'))`,
  ].join('\n');
}

// ── Sync & templates ──────────────────────────────────────────
/** Upload the output file to its sync URI (or ``dest``); prints ``ok``. */
export function syncOutput(dest?: string): string {
  const destArg = dest ? `dest='${escPy(dest)}'` : '';
  return [
    `_BA_INSTANCE.sync(${destArg})`,
    `print('ok')`,
  ].join('\n');
}

/** Resolve ``[[%Y%m%d]]``-style datetime placeholders; prints ``{"resolved": ...}``. */
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
/** Run custom visualization ``vizIndex`` on ``_raw`` and print its JSON. */
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
