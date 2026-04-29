"use strict";
(self["webpackChunkjupyter_bioacoustic"] = self["webpackChunkjupyter_bioacoustic"] || []).push([["lib_index_js"],{

/***/ "./lib/index.js"
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const plugin_1 = __webpack_require__(/*! ./plugin */ "./lib/plugin.js");
exports["default"] = [plugin_1.bioacousticPlugin];


/***/ },

/***/ "./lib/kernel.js"
/*!***********************!*\
  !*** ./lib/kernel.js ***!
  \***********************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.KernelBridge = void 0;
class KernelBridge {
    constructor(_tracker) {
        this._tracker = _tracker;
    }
    /** Get the currently-active kernel (may be null during startup). */
    _kernel() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this._tracker.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext.session) === null || _b === void 0 ? void 0 : _b.kernel) !== null && _c !== void 0 ? _c : null;
    }
    /**
     * Execute a Python snippet and return stdout (trimmed).
     * @throws Error(stderr+traceback) on Python error, or "No active kernel"
     */
    async exec(code) {
        const kernel = this._kernel();
        if (!kernel)
            throw new Error('No active kernel');
        let out = '', err = '';
        const future = kernel.requestExecute({ code });
        future.onIOPub = (msg) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const t = msg.header.msg_type;
            if (t === 'stream') {
                if (((_a = msg.content) === null || _a === void 0 ? void 0 : _a.name) === 'stdout')
                    out += msg.content.text;
                if (((_b = msg.content) === null || _b === void 0 ? void 0 : _b.name) === 'stderr')
                    err += msg.content.text;
            }
            else if (t === 'error') {
                const tb = (_d = (_c = msg.content) === null || _c === void 0 ? void 0 : _c.traceback) !== null && _d !== void 0 ? _d : [];
                err += ((_f = (_e = msg.content) === null || _e === void 0 ? void 0 : _e.ename) !== null && _f !== void 0 ? _f : '') + ': ' + ((_h = (_g = msg.content) === null || _g === void 0 ? void 0 : _g.evalue) !== null && _h !== void 0 ? _h : '') +
                    '\n' + tb.join('\n');
            }
        };
        await future.done;
        if (!out.trim() && err)
            throw new Error(err.trim());
        return out.trim();
    }
}
exports.KernelBridge = KernelBridge;


/***/ },

/***/ "./lib/plugin.js"
/*!***********************!*\
  !*** ./lib/plugin.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bioacousticPlugin = void 0;
const apputils_1 = __webpack_require__(/*! @jupyterlab/apputils */ "webpack/sharing/consume/default/@jupyterlab/apputils");
const notebook_1 = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
const kernel_1 = __webpack_require__(/*! ./kernel */ "./lib/kernel.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/python.js");
const FormPanel_1 = __webpack_require__(/*! ./sections/FormPanel */ "./lib/sections/FormPanel.js");
const Player_1 = __webpack_require__(/*! ./sections/Player */ "./lib/sections/Player.js");
const ClipTable_1 = __webpack_require__(/*! ./sections/ClipTable */ "./lib/sections/ClipTable.js");
const InfoCard_1 = __webpack_require__(/*! ./sections/InfoCard */ "./lib/sections/InfoCard.js");
// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════
const DEFAULT_TITLE = 'Jupyter Bioacoustic';
let _counter = 0;
class BioacousticWidget extends widgets_1.Widget {
    constructor(tracker) {
        super();
        // ── Config (from kernel vars) ────────────────────────────────
        this._identCol = '';
        this._displayCols = [];
        this._kernelBridge = new kernel_1.KernelBridge(tracker);
        this.id = `jp-bioacoustic-${_counter++}`;
        this.title.label = DEFAULT_TITLE;
        this.title.closable = true;
        (0, styles_1.injectGlobalStyles)();
        this._buildUI();
    }
    // ─── UI construction ────────────────────────────────────────
    _buildUI() {
        this.node.style.cssText =
            `display:flex;flex-direction:column;width:100%;height:100%;` +
                `background:${styles_1.COLORS.bgBase};color:${styles_1.COLORS.textPrimary};` +
                `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
                `overflow-y:auto;overflow-x:hidden;box-sizing:border-box;`;
        // ── Header ──────────────────────────────────────────────────
        const header = document.createElement('div');
        header.style.cssText = (0, styles_1.barBottomStyle)();
        this._titleEl = document.createElement('span');
        this._titleEl.textContent = DEFAULT_TITLE;
        this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;
        this._statusEl = document.createElement('span');
        this._statusEl.style.cssText =
            `flex:1;text-align:right;font-size:11px;color:${styles_1.COLORS.green};` +
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        this._statusEl.textContent = 'Loading…';
        header.append(this._titleEl, this._statusEl);
        // ── Clip table (filter + table + pagination) ──────────────────
        // ── Sections ──────────────────────────────────────────────────
        this._form = new FormPanel_1.FormPanel(this._kernelBridge);
        this._player = new Player_1.Player(this._kernelBridge, this._form);
        this._table = new ClipTable_1.ClipTable(this._form);
        this._infoCard = new InfoCard_1.InfoCard();
        // Wire InfoCard signals
        this._infoCard.prevRequested.connect(() => this._onPrev());
        this._infoCard.nextRequested.connect(() => this._onSkip());
        // Wire ClipTable signals
        this._table.rowSelected.connect((_, { row, filteredIdx }) => {
            this._selectRow(filteredIdx);
            void this._player.loadRow(row);
        });
        // Wire FormPanel signals
        this._form.submitted.connect(() => this._onSkip());
        this._form.prevRequested.connect(() => this._onPrev());
        this._form.nextRequested.connect(() => this._onSkip());
        this._form.reviewDeleted.connect(() => this._table.refresh());
        this._form.annotationChanged.connect(() => this._player.renderFrame());
        this._form.activeToolChanged.connect(() => {
            this._player.updateCursor();
            this._player.renderFrame();
        });
        this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));
        // Wire Player signals
        this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));
        // ── Assemble widget ──────────────────────────────────────────
        this.node.append(header, this._table.element, this._infoCard.element, this._player.element, this._form.element);
    }
    // ─── Lumino lifecycle ────────────────────────────────────────
    onAfterAttach(msg) {
        super.onAfterAttach(msg);
        this._player.attach();
        void this._init();
    }
    onBeforeDetach(msg) {
        this._player.detach();
        super.onBeforeDetach(msg);
    }
    // ─── Initialization ──────────────────────────────────────────
    async _init() {
        var _a, _b, _c;
        this._setStatus('Reading kernel variables…');
        let raw;
        try {
            raw = await this._kernelBridge.exec((0, python_1.readKernelVars)());
        }
        catch (e) {
            this._setStatus(`❌ ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
            return;
        }
        let cfg;
        try {
            cfg = JSON.parse(raw);
        }
        catch (_d) {
            this._setStatus('❌ Failed to parse kernel config', true);
            return;
        }
        this._identCol = cfg.ident_col;
        this._displayCols = JSON.parse(cfg.display_cols);
        const dataCols = JSON.parse(cfg.data_cols);
        const formConfig = JSON.parse(cfg.form_config);
        const duplicateEntries = !!cfg.duplicate_entries;
        const outputPath = cfg.output;
        let rows;
        try {
            rows = JSON.parse(cfg.data);
        }
        catch (_e) {
            this._setStatus('❌ Failed to parse detection data', true);
            return;
        }
        // Set title
        const appTitle = cfg.app_title || DEFAULT_TITLE;
        this._titleEl.textContent = appTitle;
        this.title.label = appTitle;
        // Initialize form panel
        this._form.setContext({
            formConfig,
            rows,
            identCol: this._identCol,
            duplicateEntries,
            outputPath,
        });
        await this._form.build();
        await this._form.loadOutputFileProgress();
        await this._form.loadReviewedState();
        // Initialize player
        const audioConfig = JSON.parse(cfg.audio);
        const specResolutions = JSON.parse(cfg.spec_resolutions || '["1000","2000","4000"]');
        const vizMeta = JSON.parse(cfg.viz_meta || '[]');
        this._player.setContext({
            audioConfig,
            captureLabel: (_b = cfg.capture) !== null && _b !== void 0 ? _b : '',
            captureDir: (_c = cfg.capture_dir) !== null && _c !== void 0 ? _c : '',
            identCol: this._identCol,
            displayCols: this._displayCols,
            defaultBuffer: parseFloat(cfg.default_buffer) || 3,
            specResolutions,
            vizMeta,
            rows,
        });
        // Initialize table
        this._table.setData({
            rows,
            identCol: this._identCol,
            displayCols: this._displayCols,
            dataCols,
            duplicateEntries,
        });
        // Auto-select first row
        if (this._table.filtered.length > 0) {
            this._selectRow(0);
            await this._player.loadRow(this._table.filtered[0]);
        }
        this._setStatus(`✓ ${rows.length} clips loaded`);
    }
    /** Orchestrator: update info card + form for the selected row. */
    _selectRow(filteredIdx) {
        this._table.selectIndex(filteredIdx);
        const row = this._table.filtered[filteredIdx];
        if (!row)
            return;
        this._infoCard.render(row, {
            identCol: this._identCol,
            displayCols: this._displayCols,
            filteredIdx,
            filteredLength: this._table.filtered.length,
        });
        this._form.setSelectionInfo(filteredIdx, this._table.filtered.length);
        this._form.updateFromRow(row);
        this._player.signalTimeDisplay.textContent = this._form.getAnnotConfig()
            ? 'drag on spectrogram to annotate' : '';
    }
    _onPrev() {
        const idx = this._table.selectedIdx;
        if (idx > 0) {
            this._selectRow(idx - 1);
            this._table.ensurePageShowsSelected();
            void this._player.loadRow(this._table.filtered[idx - 1]);
        }
    }
    _onSkip() {
        const idx = this._table.selectedIdx;
        if (idx < this._table.filtered.length - 1) {
            this._selectRow(idx + 1);
            this._table.ensurePageShowsSelected();
            void this._player.loadRow(this._table.filtered[idx + 1]);
        }
    }
    // ─── Capture ─────────────────────────────────────────────────
    // ─── Kernel helpers ──────────────────────────────────────────
    // ─── Utilities ───────────────────────────────────────────────
    _setStatus(msg, error = false) {
        this._statusEl.textContent = msg;
        this._statusEl.style.color = error ? styles_1.COLORS.red : styles_1.COLORS.green;
    }
}
// ═══════════════════════════════════════════════════════════════
// Plugin registration
// ═══════════════════════════════════════════════════════════════
exports.bioacousticPlugin = {
    id: 'jupyter-bioacoustic:plugin',
    autoStart: true,
    requires: [apputils_1.ICommandPalette, notebook_1.INotebookTracker],
    activate: (app, palette, tracker) => {
        window._bioacousticApp = app;
        window._bioacousticOpenInline = (divId) => {
            const container = document.getElementById(divId);
            if (!container)
                return;
            const widget = new BioacousticWidget(tracker);
            widget.node.style.cssText += `position:absolute;inset:0;`;
            widgets_1.Widget.attach(widget, container);
        };
        app.commands.addCommand('bioacoustic:open', {
            label: 'Open Bioacoustic Reviewer',
            execute: () => {
                const widget = new BioacousticWidget(tracker);
                app.shell.add(widget, 'main', { mode: 'split-right' });
                app.shell.activateById(widget.id);
            }
        });
        palette.addItem({ command: 'bioacoustic:open', category: 'Bioacoustic' });
        console.log('jupyter-bioacoustic activated');
    }
};
exports["default"] = exports.bioacousticPlugin;


/***/ },

/***/ "./lib/py_chunks.js"
/*!**************************!*\
  !*** ./lib/py_chunks.js ***!
  \**************************/
(__unused_webpack_module, exports) {


// Auto-generated by src/py/gen_chunks.js — do not edit.
// Source: src/py/*.py
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.spectrogramRender = exports.spectrogramPlain = exports.spectrogramMel = exports.buildSpectrogram = void 0;
exports.buildSpectrogram = `# Spectrogram + WAV generation pipeline.
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
`;
exports.spectrogramMel = `# Mel filterbank applied to _mag (from build_spectrogram.py).
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
`;
exports.spectrogramPlain = `# Plain STFT (no mel filterbank). Sets _f_min, _f_max, _S.

_f_min, _f_max = 0.0, _sr / 2.0
_S = _mag
`;
exports.spectrogramRender = `# Render spectrogram to PNG + encode audio to WAV.
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
    'freq_scale': _freq_scale if '_freq_scale' in dir() else ('mel' if '_n_mels' in dir() else 'linear'),
}))
`;


/***/ },

/***/ "./lib/python.js"
/*!***********************!*\
  !*** ./lib/python.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.INVALIDATE_OUTPUT_CACHE = exports.savePng = exports.deleteOutputRow = exports.writeOutputRow = exports.readOutputRows = exports.countOutputRows = exports.loadSelectItemsText = exports.loadSelectItemsYaml = exports.loadSelectItemsJsonl = exports.loadSelectItemsParquet = exports.loadSelectItemsCsv = exports.spectrogramPipeline = exports.buildSpectrogram = exports.readAudio = exports.readKernelVars = void 0;
/**
 * Python code snippets executed in the Jupyter kernel.
 *
 * Each function returns a Python code string. Template parameters are
 * interpolated into the code. All paths must be pre-escaped with escPy().
 *
 * Grouping matches the kernel.exec() call sites across sections.
 */
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
const py_chunks_1 = __webpack_require__(/*! ./py_chunks */ "./lib/py_chunks.js");
// ─── Kernel variable reading (plugin.ts _init) ──────────────
function readKernelVars() {
    return [
        `import json as _j`,
        `print(_j.dumps({`,
        `  'data': _BA_DATA,`,
        `  'audio': _BA_AUDIO,`,
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
exports.readKernelVars = readKernelVars;
// ─── Spectrogram + WAV generation (Player) ───────────────────
function readAudio(path, startSec, durSec) {
    const p = (0, util_1.escPy)(path);
    return [
        `from jupyter_bioacoustic.utils.audio import read_segment as _read_segment`,
        `_partial = _BA_INSTANCE._partial_download if hasattr(_BA_INSTANCE, '_partial_download') else True`,
        `_raw, _sr = _read_segment('${p}', ${startSec}, ${durSec}, partial=_partial)`,
    ].join('\n');
}
exports.readAudio = readAudio;
/** Assemble the spectrogram pipeline from .py chunks (no template vars). */
function buildSpectrogram(spectType, resolutionW) {
    const filterBlock = spectType === 'mel' ? py_chunks_1.spectrogramMel : py_chunks_1.spectrogramPlain;
    const resLine = resolutionW ? `_fig_w = ${resolutionW}` : '';
    return [py_chunks_1.buildSpectrogram, filterBlock, resLine, py_chunks_1.spectrogramRender].join('\n');
}
exports.buildSpectrogram = buildSpectrogram;
/** Python code for a custom visualization callable. */
function customVizCode(vizIndex, resolutionW) {
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
function spectrogramPipeline(path, startSec, durSec, vizType, builtinKey, vizIndex, resolutionW) {
    const readCode = readAudio(path, startSec, durSec);
    if (vizType === 'custom' && vizIndex != null) {
        return readCode + '\n' + customVizCode(vizIndex, resolutionW !== null && resolutionW !== void 0 ? resolutionW : 2000);
    }
    const spectType = (builtinKey === 'mel' ? 'mel' : 'plain');
    return readCode + '\n' + buildSpectrogram(spectType, resolutionW);
}
exports.spectrogramPipeline = spectrogramPipeline;
// ─── Select items loading (FormPanel) ────────────────────────
function loadSelectItemsCsv(path, valueCol, labelCol) {
    const p = (0, util_1.escPy)(path);
    if (valueCol) {
        const v = (0, util_1.escPy)(valueCol);
        const l = labelCol ? (0, util_1.escPy)(labelCol) : v;
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
exports.loadSelectItemsCsv = loadSelectItemsCsv;
function loadSelectItemsParquet(path, valueCol, labelCol) {
    const p = (0, util_1.escPy)(path);
    const v = valueCol ? `'${(0, util_1.escPy)(valueCol)}'` : 'None';
    const l = labelCol ? `'${(0, util_1.escPy)(labelCol)}'` : 'None';
    return [
        `import pandas as _pd, json as _j`,
        `_df = _pd.read_parquet('${p}')`,
        `_vc = ${v} or _df.columns[0]`,
        `_lc = ${l} or _vc`,
        `print(_j.dumps([[str(r[_vc]), str(r[_lc])] for _,r in _df.iterrows()]))`,
    ].join('\n');
}
exports.loadSelectItemsParquet = loadSelectItemsParquet;
function loadSelectItemsJsonl(path, valueCol, labelCol) {
    const p = (0, util_1.escPy)(path);
    const v = valueCol ? `'${(0, util_1.escPy)(valueCol)}'` : 'None';
    const l = labelCol ? `'${(0, util_1.escPy)(labelCol)}'` : 'None';
    return [
        `import json as _j`,
        `_rows = [_j.loads(line) for line in open('${p}') if line.strip()]`,
        `_vc = ${v} or (list(_rows[0].keys())[0] if _rows else 'value')`,
        `_lc = ${l} or _vc`,
        `print(_j.dumps([[str(r[_vc]), str(r.get(_lc, r[_vc]))] for r in _rows]))`,
    ].join('\n');
}
exports.loadSelectItemsJsonl = loadSelectItemsJsonl;
function loadSelectItemsYaml(path, valueCol, labelCol) {
    const p = (0, util_1.escPy)(path);
    const v = valueCol ? `'${(0, util_1.escPy)(valueCol)}'` : 'None';
    const l = labelCol ? `'${(0, util_1.escPy)(labelCol)}'` : 'None';
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
exports.loadSelectItemsYaml = loadSelectItemsYaml;
function loadSelectItemsText(path) {
    const p = (0, util_1.escPy)(path);
    return [
        `import json as _j`,
        `_lines = [ln.rstrip('\\n') for ln in open('${p}') if ln.strip()]`,
        `_rows = [[p[0].strip(), p[1].strip() if len(p)>1 else p[0].strip()] for p in [ln.split(',',1) for ln in _lines]]`,
        `print(_j.dumps(_rows))`,
    ].join('\n');
}
exports.loadSelectItemsText = loadSelectItemsText;
// ─── Output file operations (FormPanel) ──────────────────────
/** Count rows in the output file. */
function countOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    if (ext === 'csv') {
        return [
            `import csv, json, os`,
            `_c = 0`,
            `if os.path.exists('${p}'):`,
            `    with open('${p}') as f: _c = sum(1 for _ in csv.DictReader(f))`,
            `print(json.dumps({'count': _c}))`,
        ].join('\n');
    }
    if (ext === 'parquet') {
        return [
            `import json, os`,
            `_c = 0`,
            `if os.path.exists('${p}'):`,
            `    import pandas as pd; _c = len(pd.read_parquet('${p}'))`,
            `print(json.dumps({'count': _c}))`,
        ].join('\n');
    }
    return [
        `import json, os`,
        `_c = 0`,
        `if os.path.exists('${p}'):`,
        `    with open('${p}') as f: _c = sum(1 for l in f if l.strip())`,
        `print(json.dumps({'count': _c}))`,
    ].join('\n');
}
exports.countOutputRows = countOutputRows;
/** Read all output rows as JSON (for reviewed state). */
function readOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    if (ext === 'csv') {
        return `import csv,json,os\n_r=[]\nif os.path.exists('${p}'):\n with open('${p}') as f: _r=list(csv.DictReader(f))\nprint(json.dumps(_r))`;
    }
    if (ext === 'parquet') {
        return `import pandas as pd,json,os\n_r=[]\nif os.path.exists('${p}'):\n _r=pd.read_parquet('${p}').astype(str).to_dict('records')\nprint(json.dumps(_r))`;
    }
    return `import json,os\n_r=[]\nif os.path.exists('${p}'):\n with open('${p}') as f: _r=[json.loads(l) for l in f if l.strip()]\nprint(json.dumps(_r))`;
}
exports.readOutputRows = readOutputRows;
/** Write a single row to the output file (csv/parquet/jsonl). */
function writeOutputRow(path, values) {
    var _a, _b;
    const outPath = (0, util_1.escPy)(path);
    const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    const mkdirLine = `import os as _os; _d=_os.path.dirname('${outPath}');\nif _d: _os.makedirs(_d, exist_ok=True)`;
    const cols = Object.keys(values);
    const pyRepr = (val) => {
        if (val === null || val === undefined)
            return 'None';
        if (typeof val === 'boolean')
            return val ? 'True' : 'False';
        if (typeof val === 'number')
            return String(val);
        return `'${(0, util_1.escPy)(String(val)).replace(/\n/g, ' ')}'`;
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
exports.writeOutputRow = writeOutputRow;
/** Delete a row from the output file matching the given expression. */
function deleteOutputRow(path, matchExpr) {
    var _a, _b;
    const p = (0, util_1.escPy)(path);
    const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
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
exports.deleteOutputRow = deleteOutputRow;
// ─── Capture (Player) ────────────────────────────────────────
function savePng(filename, b64Data) {
    const esc = (0, util_1.escPy)(filename);
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
exports.savePng = savePng;
// ─── Cache invalidation ──────────────────────────────────────
exports.INVALIDATE_OUTPUT_CACHE = 'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';


/***/ },

/***/ "./lib/sections/ClipTable.js"
/*!***********************************!*\
  !*** ./lib/sections/ClipTable.js ***!
  \***********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClipTable = void 0;
/**
 * ClipTable — GUI filter builder, sortable/paginated data table, view mode toggle.
 *
 * Owns column-type detection, filter GUI (column/operator/value dropdowns + chips),
 * sorting, pagination, row rendering, and reviewed-row styling.
 * Emits `rowSelected` when the user clicks a row or navigates via controls.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const FLOAT_OPS = [
    { value: '=', label: '=', needsValue: true },
    { value: '!=', label: '!=', needsValue: true },
    { value: '>=', label: '>=', needsValue: true },
    { value: '<=', label: '<=', needsValue: true },
    { value: '>', label: '>', needsValue: true },
    { value: '<', label: '<', needsValue: true },
    { value: 'is_null', label: 'is null', needsValue: false },
    { value: 'is_not_null', label: 'is not null', needsValue: false },
    { value: 'is_empty', label: 'is empty', needsValue: false },
    { value: 'is_not_empty', label: 'is not empty', needsValue: false },
];
const DATE_OPS = [
    { value: '=', label: 'equals', needsValue: true },
    { value: '!=', label: 'not equals', needsValue: true },
    { value: '>=', label: 'on or after', needsValue: true },
    { value: '<=', label: 'on or before', needsValue: true },
    { value: '>', label: 'after', needsValue: true },
    { value: '<', label: 'before', needsValue: true },
    { value: 'is_null', label: 'is null', needsValue: false },
    { value: 'is_not_null', label: 'is not null', needsValue: false },
    { value: 'is_empty', label: 'is empty', needsValue: false },
    { value: 'is_not_empty', label: 'is not empty', needsValue: false },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRING_OPS = [
    { value: '=', label: 'equals', needsValue: true },
    { value: '!=', label: 'not equals', needsValue: true },
    { value: 'starts_with', label: 'starts with', needsValue: true },
    { value: 'ends_with', label: 'ends with', needsValue: true },
    { value: 'contains', label: 'contains', needsValue: true },
    { value: 'is_null', label: 'is null', needsValue: false },
    { value: 'is_not_null', label: 'is not null', needsValue: false },
    { value: 'is_empty', label: 'is empty', needsValue: false },
    { value: 'is_not_empty', label: 'is not empty', needsValue: false },
];
// Human-readable label for an operator (used in chips)
const OP_LABELS = {};
[...FLOAT_OPS, ...STRING_OPS, ...DATE_OPS].forEach(o => { OP_LABELS[o.value] = o.label; });
class ClipTable {
    constructor(_form) {
        this._form = _form;
        // ─── Signals ───────────────────────────────────────────────
        this.rowSelected = new signaling_1.Signal(this);
        // ─── Data state ────────────────────────────────────────────
        this._rows = [];
        this._filtered = [];
        this._sortCol = 'id';
        this._sortAsc = true;
        this._page = 0;
        this._pageSize = 10;
        this._selectedIdx = -1;
        this._highlightIdx = -1;
        this._activeFilters = [];
        this._viewMode = 'all';
        this._tableCols = [];
        this._filterColMeta = [];
        this.element = document.createElement('div');
        this.element.style.cssText = `display:contents;`;
        this._buildUI();
    }
    // ─── Public API ────────────────────────────────────────────
    setData(opts) {
        this._rows = opts.rows;
        this._configureColumns(opts);
        this._detectColumnTypes();
        if (!opts.duplicateEntries) {
            this._viewModeSelect.style.display = '';
            this._refreshBtn.style.display = '';
            this._viewMode = 'pending';
            this._viewModeSelect.value = 'pending';
        }
        this.refresh();
    }
    refresh() {
        this._applyFilterAndSort();
        this._renderTable();
    }
    selectIndex(filteredIdx) {
        this._selectedIdx = filteredIdx;
        this._renderTable();
    }
    get selectedIdx() { return this._selectedIdx; }
    get filtered() { return this._filtered; }
    get rows() { return this._rows; }
    ensurePageShowsSelected() {
        if (this._selectedIdx < 0)
            return;
        const newPage = Math.floor(this._selectedIdx / this._pageSize);
        if (newPage !== this._page) {
            this._page = newPage;
            this._renderTable();
        }
    }
    // ─── Private: column type detection ────────────────────────
    _detectColumnTypes() {
        const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        // Use all columns present in the data (superset of table cols)
        const allKeys = new Set();
        // Table cols first (in order), then any remaining data keys
        this._tableCols.forEach(c => allKeys.add(c.key));
        if (this._rows.length > 0) {
            Object.keys(this._rows[0]).forEach(k => allKeys.add(k));
        }
        const meta = [];
        const sampleSize = Math.min(50, this._rows.length);
        allKeys.forEach(key => {
            var _a, _b;
            let isFloat = true;
            let isDate = true;
            let checked = 0;
            for (let i = 0; i < sampleSize; i++) {
                const v = this._rows[i][key];
                if (v === null || v === undefined || v === '')
                    continue;
                checked++;
                const s = String(v);
                if (!DATE_RE.test(s))
                    isDate = false;
                if (typeof v === 'number')
                    continue;
                const n = parseFloat(s);
                if (isNaN(n) || !isFinite(n) || s !== String(n)) {
                    isFloat = false;
                }
            }
            if (checked === 0) {
                isFloat = false;
                isDate = false;
            }
            let dtype = 'string';
            if (isDate)
                dtype = 'date';
            else if (isFloat)
                dtype = 'float';
            const label = (_b = (_a = this._tableCols.find(c => c.key === key)) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : prettify(key);
            meta.push({ key, label, dtype });
        });
        this._filterColMeta = meta;
        this._rebuildColSelect();
    }
    _rebuildColSelect() {
        this._colSelect.innerHTML = '';
        this._filterColMeta.forEach(m => {
            const o = document.createElement('option');
            o.value = m.key;
            o.textContent = m.label;
            this._colSelect.appendChild(o);
        });
        this._updateOpSelect();
    }
    // ─── Private: filter GUI interactions ──────────────────────
    _getSelectedColMeta() {
        return this._filterColMeta.find(m => m.key === this._colSelect.value);
    }
    _opsForDtype(dtype) {
        if (dtype === 'float')
            return FLOAT_OPS;
        if (dtype === 'date')
            return DATE_OPS;
        return STRING_OPS;
    }
    _updateOpSelect() {
        const meta = this._getSelectedColMeta();
        const ops = this._opsForDtype(meta === null || meta === void 0 ? void 0 : meta.dtype);
        this._opSelect.innerHTML = '';
        ops.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            this._opSelect.appendChild(opt);
        });
        this._updateValueInput();
    }
    _currentOpNeedsValue() {
        const meta = this._getSelectedColMeta();
        const ops = this._opsForDtype(meta === null || meta === void 0 ? void 0 : meta.dtype);
        const op = ops.find(o => o.value === this._opSelect.value);
        return op ? op.needsValue : true;
    }
    _updateValueInput() {
        this._valueContainer.innerHTML = '';
        if (!this._currentOpNeedsValue())
            return;
        const meta = this._getSelectedColMeta();
        const inp = document.createElement('input');
        if ((meta === null || meta === void 0 ? void 0 : meta.dtype) === 'float') {
            inp.type = 'number';
            inp.step = 'any';
            inp.style.cssText = (0, styles_1.inputStyle)('100px');
        }
        else if ((meta === null || meta === void 0 ? void 0 : meta.dtype) === 'date') {
            inp.type = 'text';
            inp.placeholder = 'YYYY-MM-DD';
            inp.className = 'jp-BA-filter-input';
            inp.style.cssText = (0, styles_1.inputStyle)('120px');
        }
        else {
            inp.type = 'text';
            inp.placeholder = 'value';
            inp.style.cssText = (0, styles_1.inputStyle)('140px');
        }
        inp.addEventListener('keydown', e => { if (e.key === 'Enter')
            this._addFilter(); });
        this._valueContainer.appendChild(inp);
    }
    _addFilter() {
        const col = this._colSelect.value;
        const op = this._opSelect.value;
        if (!this._currentOpNeedsValue()) {
            this._activeFilters.push({ col, op, val: null });
        }
        else {
            const inp = this._valueContainer.querySelector('input, select');
            if (!inp || !inp.value.trim())
                return;
            const raw = inp.value.trim();
            const meta = this._getSelectedColMeta();
            let val = raw;
            if ((meta === null || meta === void 0 ? void 0 : meta.dtype) === 'float') {
                val = parseFloat(raw);
                if (isNaN(val))
                    return;
            }
            this._activeFilters.push({ col, op, val });
            inp.value = '';
        }
        this._page = 0;
        this._renderChips();
        this.refresh();
    }
    _removeFilter(index) {
        this._activeFilters.splice(index, 1);
        this._page = 0;
        this._renderChips();
        this.refresh();
    }
    _clearAllFilters() {
        this._activeFilters = [];
        this._page = 0;
        this._renderChips();
        this.refresh();
    }
    _renderChips() {
        this._chipContainer.innerHTML = '';
        if (this._activeFilters.length === 0) {
            this._chipContainer.style.display = 'none';
            return;
        }
        this._chipContainer.style.display = 'flex';
        this._activeFilters.forEach((f, i) => {
            var _a, _b;
            const chip = document.createElement('span');
            chip.style.cssText = (0, styles_1.filterChipStyle)();
            const colMeta = this._filterColMeta.find(m => m.key === f.col);
            const colLabel = (_a = colMeta === null || colMeta === void 0 ? void 0 : colMeta.label) !== null && _a !== void 0 ? _a : f.col;
            const opLabel = (_b = OP_LABELS[f.op]) !== null && _b !== void 0 ? _b : f.op;
            let text = `${colLabel} ${opLabel}`;
            if (f.val !== null) {
                text += typeof f.val === 'string' ? ` "${f.val}"` : ` ${f.val}`;
            }
            const labelSpan = document.createElement('span');
            labelSpan.textContent = text;
            const dismissBtn = document.createElement('button');
            dismissBtn.className = 'jp-BA-chip-dismiss';
            dismissBtn.style.cssText = (0, styles_1.filterChipDismissStyle)();
            dismissBtn.textContent = '\u00d7';
            dismissBtn.title = 'Remove filter';
            dismissBtn.addEventListener('click', () => this._removeFilter(i));
            chip.append(labelSpan, dismissBtn);
            this._chipContainer.appendChild(chip);
        });
        // Clear all button
        if (this._activeFilters.length > 1) {
            const clearAll = document.createElement('button');
            clearAll.textContent = 'Clear all';
            clearAll.style.cssText = (0, styles_1.btnStyle)() + `font-size:10px;padding:2px 8px;margin-left:4px;`;
            clearAll.addEventListener('click', () => this._clearAllFilters());
            this._chipContainer.appendChild(clearAll);
        }
    }
    // ─── Private: keyboard navigation ──────────────────────────
    _onTableKeyDown(e) {
        const total = this._filtered.length;
        if (total === 0)
            return;
        // Up/Down: move highlight only (like hovering)
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = this._highlightIdx >= 0 ? this._highlightIdx : this._selectedIdx;
            this._highlightIdx = Math.min(cur + 1, total - 1);
            this._ensurePageShowsIdx(this._highlightIdx);
            this._renderTable();
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const cur = this._highlightIdx >= 0 ? this._highlightIdx : this._selectedIdx;
            this._highlightIdx = Math.max(cur - 1, 0);
            this._ensurePageShowsIdx(this._highlightIdx);
            this._renderTable();
            // Enter: select the highlighted row (or current selected if no highlight)
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const idx = this._highlightIdx >= 0 ? this._highlightIdx : this._selectedIdx;
            if (idx >= 0 && idx < total) {
                this._selectedIdx = idx;
                this._highlightIdx = -1;
                this._renderTable();
                this.rowSelected.emit({ row: this._filtered[idx], filteredIdx: idx });
            }
            // Right: select and load next row
        }
        else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = Math.min(this._selectedIdx + 1, total - 1);
            if (next !== this._selectedIdx) {
                this._selectedIdx = next;
                this._highlightIdx = -1;
                this.ensurePageShowsSelected();
                this._renderTable();
                this.rowSelected.emit({ row: this._filtered[next], filteredIdx: next });
            }
            // Left: select and load previous row
        }
        else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = Math.max(this._selectedIdx - 1, 0);
            if (prev !== this._selectedIdx) {
                this._selectedIdx = prev;
                this._highlightIdx = -1;
                this.ensurePageShowsSelected();
                this._renderTable();
                this.rowSelected.emit({ row: this._filtered[prev], filteredIdx: prev });
            }
        }
    }
    _ensurePageShowsIdx(idx) {
        if (idx < 0)
            return;
        const newPage = Math.floor(idx / this._pageSize);
        if (newPage !== this._page) {
            this._page = newPage;
        }
    }
    // ─── Private: UI build ─────────────────────────────────────
    _buildUI() {
        // Filter builder bar
        const filterBar = document.createElement('div');
        filterBar.style.cssText = (0, styles_1.barBottomStyle)();
        const filterLbl = document.createElement('span');
        filterLbl.style.cssText = (0, styles_1.smallLabelStyle)();
        filterLbl.textContent = 'Filter:';
        this._colSelect = document.createElement('select');
        this._colSelect.style.cssText = (0, styles_1.selectStyle)() + `max-width:140px;`;
        this._colSelect.addEventListener('change', () => this._updateOpSelect());
        this._opSelect = document.createElement('select');
        this._opSelect.style.cssText = (0, styles_1.selectStyle)() + `max-width:130px;`;
        this._opSelect.addEventListener('change', () => this._updateValueInput());
        this._valueContainer = document.createElement('div');
        this._valueContainer.style.cssText = `display:inline-flex;`;
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add';
        addBtn.style.cssText = (0, styles_1.btnStyle)(true);
        addBtn.addEventListener('click', () => this._addFilter());
        this._viewModeSelect = document.createElement('select');
        this._viewModeSelect.style.cssText = (0, styles_1.selectStyle)() + `font-size:11px;margin-left:auto;display:none;`;
        ['all', 'pending', 'reviewed'].forEach(v => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = v;
            this._viewModeSelect.appendChild(o);
        });
        this._viewModeSelect.addEventListener('change', () => {
            this._viewMode = this._viewModeSelect.value;
            this._page = 0;
            this.refresh();
            if (this._filtered.length > 0) {
                this._selectedIdx = 0;
                this.rowSelected.emit({ row: this._filtered[0], filteredIdx: 0 });
            }
        });
        this._refreshBtn = document.createElement('button');
        this._refreshBtn.textContent = '↻';
        this._refreshBtn.title = 'Refresh list';
        this._refreshBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:17px;padding:1px 7px 3px;display:none;`;
        this._refreshBtn.addEventListener('click', () => {
            this._page = 0;
            this.refresh();
            if (this._filtered.length > 0) {
                this._selectedIdx = 0;
                this.rowSelected.emit({ row: this._filtered[0], filteredIdx: 0 });
            }
        });
        const phStyle = document.createElement('style');
        phStyle.textContent = `.jp-BA-filter-input::placeholder{color:${styles_1.COLORS.overlay}!important;opacity:0.7!important;font-style:italic;}`;
        filterBar.append(phStyle, filterLbl, this._colSelect, this._opSelect, this._valueContainer, addBtn, this._viewModeSelect, this._refreshBtn);
        // Chip bar (hidden until filters are added)
        this._chipContainer = document.createElement('div');
        this._chipContainer.style.cssText =
            `display:none;align-items:center;gap:4px;padding:4px 12px;` +
                `background:${styles_1.COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
        // Table
        const tableWrap = document.createElement('div');
        tableWrap.tabIndex = 0;
        tableWrap.style.cssText =
            `flex:0 0 auto;overflow-y:auto;max-height:175px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};outline:none;`;
        tableWrap.addEventListener('keydown', e => this._onTableKeyDown(e));
        const table = document.createElement('table');
        table.style.cssText = `width:100%;border-collapse:collapse;font-size:12px;`;
        this._thead = document.createElement('thead');
        this._thead.style.cssText = `background:${styles_1.COLORS.bgMantle};position:sticky;top:0;z-index:1;`;
        this._tableCols = [
            { key: 'id', label: 'ID' },
            { key: 'common_name', label: 'Common Name' },
            { key: 'start_time', label: 'Start (s)' },
            { key: 'end_time', label: 'End (s)' },
        ];
        this._rebuildTableHeader();
        this._tableBody = document.createElement('tbody');
        table.append(this._thead, this._tableBody);
        tableWrap.appendChild(table);
        // Pagination bar
        const pagBar = document.createElement('div');
        pagBar.style.cssText = (0, styles_1.barBottomStyle)() + `gap:5px;`;
        const mkPagBtn = (label, action) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = (0, styles_1.btnStyle)() + `padding:2px 7px;font-size:11px;`;
            b.addEventListener('click', action);
            return b;
        };
        const firstBtn = mkPagBtn('⏮', () => { this._page = 0; this._renderTable(); });
        const prevBtn = mkPagBtn('◀', () => {
            if (this._page > 0) {
                this._page--;
                this._renderTable();
            }
        });
        const nextBtn = mkPagBtn('▶', () => {
            const max = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
            if (this._page < max) {
                this._page++;
                this._renderTable();
            }
        });
        const lastBtn = mkPagBtn('⏭', () => {
            this._page = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
            this._renderTable();
        });
        this._pageInput = document.createElement('input');
        this._pageInput.type = 'number';
        this._pageInput.min = '1';
        this._pageInput.value = '1';
        this._pageInput.style.cssText = (0, styles_1.inputStyle)('44px') + `text-align:center;`;
        this._pageInput.addEventListener('change', () => {
            const max = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
            this._page = Math.max(0, Math.min(parseInt(this._pageInput.value) - 1, max));
            this._renderTable();
        });
        this._pageInfo = document.createElement('span');
        this._pageInfo.style.cssText = `font-size:11px;color:${styles_1.COLORS.textSubtle};white-space:nowrap;`;
        const rowsLbl = document.createElement('span');
        rowsLbl.style.cssText = (0, styles_1.smallLabelStyle)() + `margin-left:6px;`;
        rowsLbl.textContent = 'Rows:';
        this._pageSizeSelect = document.createElement('select');
        this._pageSizeSelect.style.cssText = (0, styles_1.selectStyle)() + `font-size:11px;`;
        ['5', '10', '20', 'custom'].forEach(v => {
            const o = document.createElement('option');
            o.value = o.textContent = v;
            if (v === '10')
                o.selected = true;
            this._pageSizeSelect.appendChild(o);
        });
        this._pageSizeSelect.addEventListener('change', () => {
            if (this._pageSizeSelect.value === 'custom') {
                this._customPageSizeInput.style.display = 'inline-block';
            }
            else {
                this._customPageSizeInput.style.display = 'none';
                this._pageSize = parseInt(this._pageSizeSelect.value);
                this._page = 0;
                this._renderTable();
            }
        });
        this._customPageSizeInput = document.createElement('input');
        this._customPageSizeInput.type = 'number';
        this._customPageSizeInput.min = '1';
        this._customPageSizeInput.value = '10';
        this._customPageSizeInput.style.cssText = (0, styles_1.inputStyle)('48px');
        this._customPageSizeInput.style.display = 'none';
        this._customPageSizeInput.addEventListener('change', () => {
            const n = parseInt(this._customPageSizeInput.value);
            if (n > 0) {
                this._pageSize = n;
                this._page = 0;
                this._renderTable();
            }
        });
        pagBar.append(firstBtn, prevBtn, this._pageInput, this._pageInfo, nextBtn, lastBtn, rowsLbl, this._pageSizeSelect, this._customPageSizeInput);
        this.element.append(filterBar, this._chipContainer, tableWrap, pagBar);
    }
    // ─── Private: columns ──────────────────────────────────────
    _configureColumns(opts) {
        const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (opts.dataCols.length > 0) {
            // Explicit column list — use as-is
            this._tableCols = opts.dataCols.map(k => ({ key: k, label: prettify(k) }));
        }
        else if (opts.rows.length > 0 && opts.displayCols.length === 0) {
            // No explicit columns — show all data columns
            this._tableCols = Object.keys(opts.rows[0]).map(k => ({ key: k, label: prettify(k) }));
        }
        else {
            // Fallback: base cols + display cols
            const baseCols = [
                { key: 'id', label: 'ID' },
                { key: 'start_time', label: 'Start (s)' },
                { key: 'end_time', label: 'End (s)' },
            ];
            const extraCols = opts.displayCols.map(k => ({ key: k, label: prettify(k) }));
            this._tableCols = [...baseCols, ...extraCols];
        }
        this._rebuildTableHeader();
    }
    _rebuildTableHeader() {
        this._thead.innerHTML = '';
        const headerRow = document.createElement('tr');
        this._tableCols.forEach(({ key, label }) => {
            const th = document.createElement('th');
            th.dataset.col = key;
            th.style.cssText =
                `padding:5px 8px;text-align:left;color:${styles_1.COLORS.blue};font-size:11px;` +
                    `cursor:pointer;user-select:none;white-space:nowrap;` +
                    `border-bottom:2px solid ${styles_1.COLORS.bgSurface0};`;
            th.textContent = label;
            th.addEventListener('click', () => {
                if (this._sortCol === key) {
                    this._sortAsc = !this._sortAsc;
                }
                else {
                    this._sortCol = key;
                    this._sortAsc = true;
                }
                this._thead.querySelectorAll('th').forEach(t => {
                    const col = t.dataset.col;
                    const entry = this._tableCols.find(c => c.key === col);
                    if (entry)
                        t.textContent = entry.label + (col === this._sortCol ? (this._sortAsc ? ' ▲' : ' ▼') : '');
                });
                this._page = 0;
                this.refresh();
            });
            headerRow.appendChild(th);
        });
        this._thead.appendChild(headerRow);
    }
    // ─── Private: filter + sort ────────────────────────────────
    _applyFilterAndSort() {
        const filters = this._activeFilters;
        let rows = this._rows.filter(row => {
            return filters.every(f => {
                const v = row[f.col];
                const colMeta = this._filterColMeta.find(m => m.key === f.col);
                // Null / empty operators (no value comparison)
                if (f.op === 'is_null')
                    return v === null || v === undefined;
                if (f.op === 'is_not_null')
                    return v !== null && v !== undefined;
                if (f.op === 'is_empty')
                    return v === null || v === undefined || String(v).trim() === '';
                if (f.op === 'is_not_empty')
                    return v !== null && v !== undefined && String(v).trim() !== '';
                // Value-based operators
                const vs = String(v).toLowerCase();
                const fvs = String(f.val).toLowerCase();
                if (f.op === '=')
                    return vs === fvs;
                if (f.op === '!=')
                    return vs !== fvs;
                if (f.op === 'contains')
                    return vs.includes(fvs);
                if (f.op === 'starts_with')
                    return vs.startsWith(fvs);
                if (f.op === 'ends_with')
                    return vs.endsWith(fvs);
                // Date comparisons (lexicographic on YYYY-MM-DD strings)
                if ((colMeta === null || colMeta === void 0 ? void 0 : colMeta.dtype) === 'date') {
                    const ds = String(v);
                    const dfs = String(f.val);
                    if (f.op === '>=')
                        return ds >= dfs;
                    if (f.op === '<=')
                        return ds <= dfs;
                    if (f.op === '>')
                        return ds > dfs;
                    if (f.op === '<')
                        return ds < dfs;
                    return true;
                }
                // Numeric operators
                const n = parseFloat(String(v));
                const fvn = typeof f.val === 'number' ? f.val : parseFloat(String(f.val));
                if (f.op === '>=')
                    return n >= fvn;
                if (f.op === '<=')
                    return n <= fvn;
                if (f.op === '>')
                    return n > fvn;
                if (f.op === '<')
                    return n < fvn;
                return true;
            });
        });
        rows.sort((a, b) => {
            const av = a[this._sortCol];
            const bv = b[this._sortCol];
            let cmp = 0;
            if (typeof av === 'string' && typeof bv === 'string') {
                cmp = av.localeCompare(bv);
            }
            else {
                cmp = av < bv ? -1 : av > bv ? 1 : 0;
            }
            return this._sortAsc ? cmp : -cmp;
        });
        // Apply view mode filter
        if (this._viewMode === 'pending') {
            rows = rows.filter(r => !this._form.getReviewedMap().has(r.id));
        }
        else if (this._viewMode === 'reviewed') {
            rows = rows.filter(r => this._form.getReviewedMap().has(r.id));
        }
        this._filtered = rows;
    }
    // ─── Private: render ───────────────────────────────────────
    _renderTable() {
        this._tableBody.innerHTML = '';
        const total = this._filtered.length;
        const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
        this._page = Math.min(this._page, maxPage);
        const start = this._page * this._pageSize;
        const slice = this._filtered.slice(start, start + this._pageSize);
        slice.forEach((row, i) => {
            const globalIdx = start + i;
            const isSelected = globalIdx === this._selectedIdx;
            const isHighlighted = globalIdx === this._highlightIdx;
            const reviewed = this._form.isReviewed(row);
            const tr = document.createElement('tr');
            const baseBg = i % 2 === 0 ? styles_1.COLORS.bgBase : styles_1.COLORS.bgAltRow;
            tr.style.cssText =
                `cursor:pointer;border-bottom:1px solid ${styles_1.COLORS.bgHover};` +
                    (isSelected
                        ? `background:${styles_1.COLORS.bgSelected};`
                        : isHighlighted
                            ? `background:${styles_1.COLORS.bgHover};`
                            : reviewed
                                ? `background:${styles_1.COLORS.bgReviewed};`
                                : `background:${baseBg};`);
            this._tableCols.forEach(({ key }) => {
                const raw = row[key];
                const v = typeof raw === 'number' && !Number.isInteger(raw)
                    ? raw.toFixed(key === 'confidence' ? 3 : 2)
                    : raw !== null && raw !== void 0 ? raw : '—';
                const td = document.createElement('td');
                td.textContent = String(v);
                td.style.cssText =
                    `padding:4px 8px;font-size:12px;white-space:nowrap;` +
                        `color:${reviewed ? styles_1.COLORS.textMuted : styles_1.COLORS.textPrimary};`;
                tr.appendChild(td);
            });
            tr.addEventListener('click', () => {
                this._selectedIdx = globalIdx;
                this._renderTable();
                this.rowSelected.emit({ row, filteredIdx: globalIdx });
            });
            tr.addEventListener('mouseenter', () => {
                if (globalIdx !== this._selectedIdx)
                    tr.style.background = styles_1.COLORS.bgHover;
            });
            tr.addEventListener('mouseleave', () => {
                if (globalIdx !== this._selectedIdx)
                    tr.style.background = reviewed ? styles_1.COLORS.bgReviewed : baseBg;
            });
            this._tableBody.appendChild(tr);
        });
        const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
        this._pageInput.value = String(this._page + 1);
        this._pageInfo.textContent = `/ ${totalPages}  (${total} rows)`;
    }
}
exports.ClipTable = ClipTable;


/***/ },

/***/ "./lib/sections/FormPanel.js"
/*!***********************************!*\
  !*** ./lib/sections/FormPanel.js ***!
  \***********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FormPanel = void 0;
/**
 * FormPanel — the bottom panel of the BioacousticWidget.
 *
 * Owns the dynamic form built from `form_config`: all inputs, submission
 * buttons, progress tracker, annotation tool UI, reviewed-view (for
 * already-submitted rows), and output file writing.
 *
 * Communicates with the rest of the widget via Lumino signals.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ../python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
class FormPanel {
    constructor(_kernel) {
        this._kernel = _kernel;
        // ─── Signals ───────────────────────────────────────────────
        /** Emitted after a successful submit. Values have been written to the output file. */
        this.submitted = new signaling_1.Signal(this);
        /** Reviewed-view Prev button clicked. */
        this.prevRequested = new signaling_1.Signal(this);
        /** Reviewed-view Next button clicked (also fires after submit via _onSkip equivalent). */
        this.nextRequested = new signaling_1.Signal(this);
        /** A review was deleted — orchestrator should re-render the table. */
        this.reviewDeleted = new signaling_1.Signal(this);
        /** An annotation field was changed from inside the form (not from the canvas).
         *  Orchestrator forwards this to the Player to re-render the spectrogram. */
        this.annotationChanged = new signaling_1.Signal(this);
        /** The active annotation tool changed (via the dropdown). */
        this.activeToolChanged = new signaling_1.Signal(this);
        /** A status message to show in the widget header. */
        this.statusChanged = new signaling_1.Signal(this);
        // ─── Form state ────────────────────────────────────────────
        this._formConfig = null;
        this._formValues = {};
        this._submitBtns = [];
        /** Named form sections (top-level config keys referenced by select form: items). */
        this._namedSections = new Map();
        this._requiredInputs = [];
        this._inputRefs = new Map();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        // Progress tracking
        this._sessionCount = 0;
        this._fileCount = 0;
        this._accuracy = null;
        this._progressEls = [];
        this._accuracyConfig = null;
        // Annotation tool
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs = new Map();
        // Multibox state
        this._multiboxEntries = [];
        this._activeBoxIndex = -1;
        this._multiboxFormName = null;
        this._multiboxNextId = 0;
        this._multiboxColorIdx = 0;
        this._multiboxContainer = null;
        // Reviewed state (for duplicate_entries=false)
        this._reviewedMap = new Map();
        this._showingReviewedView = false;
        // Context provided by the orchestrator
        this._rows = [];
        this._identCol = '';
        this._duplicateEntries = false;
        this._outputPath = '';
        this._selectedIdx = -1;
        this._filteredLength = 0;
        this._currentRow = null;
        // Build the section shell
        this.element = document.createElement('div');
        this.element.style.cssText =
            `flex:0 0 auto;min-height:140px;padding:10px 14px 12px;background:${styles_1.COLORS.bgMantle};` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;
        this._dynFormEl = document.createElement('div');
        this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
        this.element.append(this._dynFormEl);
        // Enter to submit when form is focused
        this.element.addEventListener('keydown', e => {
            var _a;
            if (e.key === 'Enter' && !e.shiftKey) {
                // Don't intercept Enter in textareas or inputs
                const tag = (_a = e.target) === null || _a === void 0 ? void 0 : _a.tagName;
                if (tag === 'TEXTAREA')
                    return;
                if (tag === 'INPUT' && e.target.type === 'text')
                    return;
                // Check if submit is enabled
                const btn = this._submitBtns.find(b => !b.disabled);
                if (btn) {
                    e.preventDefault();
                    btn.click();
                }
            }
        });
    }
    // ─── Public API ────────────────────────────────────────────
    /** Set context needed by the form (called once after reading kernel vars). */
    setContext(opts) {
        this._formConfig = opts.formConfig;
        this._rows = opts.rows;
        this._identCol = opts.identCol;
        this._duplicateEntries = opts.duplicateEntries;
        this._outputPath = opts.outputPath;
    }
    /** Update selection info (called each time a row is selected). Used for
     *  Prev/Next disabled states in the reviewed view. */
    setSelectionInfo(selectedIdx, filteredLength) {
        this._selectedIdx = selectedIdx;
        this._filteredLength = filteredLength;
    }
    /** Build the form from the current form config. */
    async build() {
        this._dynFormEl.innerHTML = '';
        this._formValues = {};
        this._submitBtns = [];
        this._namedSections.clear();
        this._requiredInputs = [];
        this._inputRefs.clear();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs.clear();
        this._sessionCount = 0;
        this._accuracy = null;
        this._progressEls = [];
        this._accuracyConfig = null;
        const cfg = this._formConfig;
        if (!cfg) {
            this.element.style.display = 'none';
            return;
        }
        this.element.style.display = 'flex';
        // Known top-level keys (not named form sections)
        const RESERVED_KEYS = new Set([
            'title', 'progress_tracker', 'pass_value', 'fixed_value',
            'submission_buttons', '_fixed_kwargs', 'dynamic_forms',
        ]);
        // First pass: build inline elements and submission buttons
        for (const key of Object.keys(cfg)) {
            if (key === 'title') {
                this._appendTitleEntry(cfg.title, this._dynFormEl);
            }
            else if (key === 'progress_tracker') {
                this._accuracyConfig = (0, util_1.parseAccuracyConfig)(cfg.progress_tracker);
                this._appendProgressTracker(this._dynFormEl);
            }
            else if (key === 'pass_value') {
                this._registerPassValue(cfg.pass_value);
            }
            else if (key === 'fixed_value') {
                this._registerFixedValue(cfg.fixed_value);
            }
            else if (key === 'submission_buttons') {
                await this._buildSubmissionButtons(cfg.submission_buttons);
            }
            else if (key === '_fixed_kwargs') {
                for (const item of cfg._fixed_kwargs) {
                    if (item.fixed_value)
                        this._registerFixedValue(item.fixed_value);
                }
            }
            else if (key === 'dynamic_forms') {
                // Explicit named form sections container
                const forms = cfg.dynamic_forms;
                if (forms && typeof forms === 'object') {
                    for (const formName of Object.keys(forms)) {
                        let formElements = forms[formName];
                        // Accept both array of elements and a single element dict
                        if (!Array.isArray(formElements)) {
                            if (formElements && typeof formElements === 'object') {
                                // Wrap single element: {select: {...}} → [{select: {...}}]
                                formElements = Object.keys(formElements).map(k => ({ [k]: formElements[k] }));
                            }
                            else {
                                continue;
                            }
                        }
                        const sectionDiv = document.createElement('div');
                        sectionDiv.dataset.formSection = formName;
                        sectionDiv.style.cssText = (0, styles_1.formRowStyle)(true); // hidden by default
                        await this._buildFormSection(formElements, sectionDiv);
                        this._dynFormEl.appendChild(sectionDiv);
                        this._namedSections.set(formName, sectionDiv);
                    }
                }
            }
            else if (!RESERVED_KEYS.has(key)) {
                // Any other top-level key is a named form section or inline element
                const sectionData = cfg[key];
                if (Array.isArray(sectionData)) {
                    // Array of form elements → named section (hidden until a select references it)
                    const sectionDiv = document.createElement('div');
                    sectionDiv.dataset.formSection = key;
                    sectionDiv.style.cssText = (0, styles_1.formRowStyle)(true); // hidden by default
                    await this._buildFormSection(sectionData, sectionDiv);
                    this._dynFormEl.appendChild(sectionDiv);
                    this._namedSections.set(key, sectionDiv);
                }
                else if (key === 'annotation') {
                    await this._buildAnnotationElement(sectionData, this._dynFormEl);
                }
                else {
                    // Single element (e.g. a top-level select, textbox, etc.)
                    await this._buildInputElement(key, sectionData, this._dynFormEl);
                }
            }
        }
        // Default submission buttons if none were configured
        if (!cfg.submission_buttons) {
            await this._buildSubmissionButtons({ submit: true });
        }
        this._validateForm();
    }
    /** Called each time a new row is selected. Rebuilds form vs. reviewed view. */
    updateFromRow(row) {
        if (this._isRowReviewed(row)) {
            this._showReviewedResult(row);
            return;
        }
        // Rebuild form if it was replaced by a reviewed result view
        if (this._showingReviewedView) {
            this._showingReviewedView = false;
            void this.build().then(() => this._applyRow(row));
        }
        else {
            this._applyRow(row);
        }
    }
    /** External setter used by the canvas drag (from Player). Does NOT re-emit
     *  annotationChanged to avoid circular updates. */
    setAnnotValue(field, val) {
        this._setAnnotValueInternal(field, val, /*emit*/ false);
    }
    /** The parsed annotation config (for Player to know if annotation is active). */
    getAnnotConfig() {
        return this._annotConfig;
    }
    /** The currently active annotation tool (for Player mouse handling). */
    getActiveTool() {
        return this._activeTool;
    }
    /** Read a single form value (for Player to read start_time/end_time/etc.). */
    getFormValue(col) {
        return this._formValues[col];
    }
    // ─── Multibox public API (for Player) ───────────────────────
    isMultiboxMode() {
        return this._activeTool === 'multibox';
    }
    getMultiboxEntries() {
        return this._multiboxEntries;
    }
    getActiveBoxIndex() {
        return this._activeBoxIndex;
    }
    addMultiboxEntry(startTime, endTime, minFreq, maxFreq) {
        const colors = styles_1.DISPLAY_CHIP_COLORS;
        const entry = {
            id: this._multiboxNextId++,
            startTime, endTime, minFreq, maxFreq,
            formValues: {},
            color: colors[this._multiboxColorIdx++ % colors.length],
        };
        this._multiboxEntries.push(entry);
        this._activeBoxIndex = this._multiboxEntries.length - 1;
        // Sync annotation inputs
        if (this._annotConfig) {
            if (this._annotConfig.startTime)
                this._setAnnotValueInternal('startTime', startTime, false);
            if (this._annotConfig.endTime)
                this._setAnnotValueInternal('endTime', endTime, false);
            if (this._annotConfig.minFreq)
                this._setAnnotValueInternal('minFreq', minFreq, false);
            if (this._annotConfig.maxFreq)
                this._setAnnotValueInternal('maxFreq', maxFreq, false);
        }
        void this._rebuildAnnotFormUI();
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    setActiveBox(index) {
        if (index >= 0 && index < this._multiboxEntries.length) {
            this._activeBoxIndex = index;
            this._highlightActiveBoxCard();
            // Update annotation inputs to reflect the active box
            const entry = this._multiboxEntries[index];
            if (entry && this._annotConfig) {
                if (this._annotConfig.startTime)
                    this._setAnnotValueInternal('startTime', entry.startTime, false);
                if (this._annotConfig.endTime)
                    this._setAnnotValueInternal('endTime', entry.endTime, false);
                if (this._annotConfig.minFreq)
                    this._setAnnotValueInternal('minFreq', entry.minFreq, false);
                if (this._annotConfig.maxFreq)
                    this._setAnnotValueInternal('maxFreq', entry.maxFreq, false);
            }
            this.annotationChanged.emit(void 0);
        }
    }
    updateMultiboxBounds(index, field, value) {
        const entry = this._multiboxEntries[index];
        if (!entry)
            return;
        entry[field] = value;
        this.annotationChanged.emit(void 0);
    }
    removeMultiboxEntry(index) {
        if (index < 0 || index >= this._multiboxEntries.length)
            return;
        this._multiboxEntries.splice(index, 1);
        if (this._activeBoxIndex >= this._multiboxEntries.length) {
            this._activeBoxIndex = this._multiboxEntries.length - 1;
        }
        void this._rebuildAnnotFormUI();
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    removeActiveMultiboxEntry() {
        if (this._activeBoxIndex >= 0)
            this.removeMultiboxEntry(this._activeBoxIndex);
    }
    // ─── End multibox API ──────────────────────────────────────
    /** Read the full reviewed map (for ClipTable row styling). */
    getReviewedMap() {
        return this._reviewedMap;
    }
    /** True if a row has been reviewed and duplicate_entries is off. */
    isReviewed(row) {
        return this._isRowReviewed(row);
    }
    /** Load output-file progress counts (session + total + accuracy).
     *  Called once during init. */
    async loadOutputFileProgress() {
        var _a, _b;
        if (!this._outputPath)
            return;
        const ext = (_b = (_a = this._outputPath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
        const code = (0, python_1.countOutputRows)(this._outputPath, ext);
        try {
            const raw = await this._kernel.exec(code);
            const result = JSON.parse(raw);
            this._fileCount = result.count;
        }
        catch (_c) {
            // output file may not exist yet
        }
        await this._refreshAccuracy();
        this._updateProgress();
    }
    async _refreshAccuracy() {
        var _a, _b;
        if (!this._accuracyConfig || !this._outputPath) {
            this._accuracy = null;
            return;
        }
        const ext = (_b = (_a = this._outputPath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
        const code = (0, python_1.readOutputRows)(this._outputPath, ext);
        try {
            const rows = JSON.parse(await this._kernel.exec(code));
            if (rows.length === 0) {
                this._accuracy = null;
                return;
            }
            const col = this._accuracyConfig.column;
            const val = this._accuracyConfig.value;
            const valid = rows.filter(r => this._isAccuracyValid(r[col], val)).length;
            this._accuracy = Math.round(100 * valid / rows.length);
        }
        catch (_c) {
            this._accuracy = null;
        }
    }
    /** Load reviewed state from the output file (called during init when
     *  duplicate_entries=false). Matches output rows to input rows by
     *  pass_value id mapping, or start_time+end_time fallback. */
    async loadReviewedState() {
        var _a, _b, _c, _d;
        if (this._duplicateEntries || !this._outputPath)
            return;
        this._reviewedMap.clear();
        const ext = (_b = (_a = this._outputPath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
        const code = (0, python_1.readOutputRows)(this._outputPath, ext);
        let outputRows;
        try {
            outputRows = JSON.parse(await this._kernel.exec(code));
        }
        catch (_e) {
            return;
        }
        const idMapping = this._passValueDefs.find(pv => pv.sourceCol === 'id');
        const outIdCol = idMapping === null || idMapping === void 0 ? void 0 : idMapping.col;
        for (const outRow of outputRows) {
            let inputId = null;
            if (outIdCol && outRow[outIdCol] !== undefined) {
                inputId = Number(outRow[outIdCol]);
            }
            else {
                const st = Number((_c = outRow['start_time']) !== null && _c !== void 0 ? _c : NaN);
                const et = Number((_d = outRow['end_time']) !== null && _d !== void 0 ? _d : NaN);
                if (!isNaN(st) && !isNaN(et)) {
                    const match = this._rows.find(r => Math.abs(r.start_time - st) < 0.01 && Math.abs(r.end_time - et) < 0.01);
                    if (match)
                        inputId = match.id;
                }
            }
            if (inputId !== null) {
                this._reviewedMap.set(inputId, outRow);
            }
        }
    }
    // ─── Private: form building ────────────────────────────────
    async _buildFormSection(elements, container) {
        for (const item of elements) {
            if (!item || typeof item !== 'object')
                continue;
            const [type] = Object.keys(item);
            const config = item[type];
            if (type === 'pass_value') {
                this._registerPassValue(config);
            }
            else if (type === 'title') {
                this._appendTitleEntry(config, container);
            }
            else if (type === 'progress_tracker') {
                if (!this._accuracyConfig)
                    this._accuracyConfig = (0, util_1.parseAccuracyConfig)(config);
                this._appendProgressTracker(container);
            }
            else if (type === 'annotation') {
                await this._buildAnnotationElement(config, container);
            }
            else if (type === 'break') {
                container.appendChild(document.createElement('br'));
            }
            else if (type === 'line') {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.fullWidthDividerStyle)();
                container.appendChild(d);
            }
            else if (type === 'text') {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.mutedTextStyle)({ width: '100%' });
                d.textContent = String(config);
                container.appendChild(d);
            }
            else {
                await this._buildInputElement(type, config, container);
            }
        }
    }
    async _buildInputElement(type, rawConfig, container) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const cfg = (rawConfig === true || rawConfig === null || rawConfig === undefined) ? {} : rawConfig;
        let labelText;
        let col;
        let required;
        labelText = (_a = cfg.label) !== null && _a !== void 0 ? _a : type;
        col = (_b = cfg.column) !== null && _b !== void 0 ? _b : labelText;
        required = (_c = cfg.required) !== null && _c !== void 0 ? _c : false;
        const lbl = document.createElement('label');
        lbl.style.cssText = (0, styles_1.formLabelStyle)();
        lbl.textContent = labelText;
        let inputEl;
        if (type === 'textbox') {
            if (cfg.multiline) {
                const ta = document.createElement('textarea');
                ta.rows = 1;
                ta.style.cssText =
                    (0, styles_1.inputStyle)(cfg.width ? (0, styles_1.cssSize)(cfg.width) : '220px') +
                        `font-size:13px;resize:vertical;vertical-align:middle;height:28px;`;
                ta.addEventListener('input', () => { this._formValues[col] = ta.value; this._validateForm(); });
                inputEl = ta;
            }
            else {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.style.cssText =
                    (0, styles_1.inputStyle)(cfg.width ? (0, styles_1.cssSize)(cfg.width) : '220px') + `font-size:13px;`;
                inp.addEventListener('input', () => { this._formValues[col] = inp.value; this._validateForm(); });
                inputEl = inp;
            }
            this._formValues[col] = (_d = cfg.default) !== null && _d !== void 0 ? _d : '';
        }
        else if (type === 'select') {
            const sel = document.createElement('select');
            sel.style.cssText = (0, styles_1.selectStyle)() + `font-size:13px;max-width:260px;`;
            if (cfg.width)
                sel.style.width = (0, styles_1.cssSize)(cfg.width);
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '— select —';
            sel.appendChild(emptyOpt);
            // Parse items config options
            const itemsCfg = cfg.items;
            const hasFilterBox = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) && itemsCfg.filter_box;
            const hasCustomValue = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) && itemsCfg.custom_value;
            const notAvailCfg = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) ? itemsCfg.not_available : undefined;
            const items = await this._loadSelectItems(cfg.items);
            // Prepend not_available option if configured
            if (notAvailCfg) {
                let naVal, naLabel;
                if (notAvailCfg === true) {
                    naVal = naLabel = 'not-available';
                }
                else if (typeof notAvailCfg === 'string') {
                    naVal = naLabel = notAvailCfg;
                }
                else if (typeof notAvailCfg === 'object') {
                    naLabel = (_e = notAvailCfg.label) !== null && _e !== void 0 ? _e : 'not-available';
                    naVal = (_f = notAvailCfg.value) !== null && _f !== void 0 ? _f : naLabel;
                }
                else {
                    naVal = naLabel = 'not-available';
                }
                items.unshift([naVal, naLabel]);
            }
            // Build all option data: [{val, label, formRef, isDefault}]
            const allItems = [];
            const formRefs = new Map();
            let selectedDefault = '';
            items.forEach(([v, l, formRef]) => {
                const isDefault = v.startsWith('selected::');
                const cleanVal = isDefault ? v.slice(10) : v;
                const cleanLabel = l.startsWith('selected::') ? l.slice(10) : l;
                allItems.push({ val: cleanVal, label: cleanLabel, formRef, isDefault });
                if (isDefault)
                    selectedDefault = cleanVal;
                if (formRef)
                    formRefs.set(cleanVal, formRef);
            });
            const allFormSections = new Set(formRefs.values());
            // Helper: rebuild select options from filtered items
            const rebuildOptions = (filter) => {
                // Remove all options except the empty one
                while (sel.options.length > 1)
                    sel.remove(1);
                const f = (filter !== null && filter !== void 0 ? filter : '').toLowerCase();
                allItems.forEach(item => {
                    if (f && !item.label.toLowerCase().includes(f) && !item.val.toLowerCase().includes(f))
                        return;
                    const o = document.createElement('option');
                    o.value = item.val;
                    o.textContent = item.label;
                    if (item.isDefault && !f)
                        o.selected = true;
                    sel.appendChild(o);
                });
            };
            rebuildOptions();
            // Change handler (shared)
            const onSelectChange = () => {
                this._formValues[col] = sel.value;
                if (allFormSections.size > 0) {
                    const activeSection = formRefs.get(sel.value);
                    for (const sectionName of allFormSections) {
                        const sectionEl = this._namedSections.get(sectionName);
                        if (sectionEl) {
                            sectionEl.style.display = sectionName === activeSection ? 'flex' : 'none';
                        }
                    }
                }
                this._validateForm();
            };
            sel.addEventListener('change', onSelectChange);
            if (hasFilterBox || hasCustomValue) {
                // Wrap select with a filter input to the right (and optional Add button)
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;
                // Inject placeholder style directly into wrapper (avoids global stylesheet issues)
                const phStyle = document.createElement('style');
                phStyle.textContent = `.jp-BA-filter-input::placeholder{color:${styles_1.COLORS.overlay}!important;opacity:0.7;font-style:italic;}`;
                wrapper.appendChild(phStyle);
                const filterInput = document.createElement('input');
                filterInput.type = 'text';
                filterInput.placeholder = 'filter options';
                filterInput.className = 'jp-BA-filter-input';
                filterInput.style.cssText = (0, styles_1.inputStyle)('110px') + `font-size:13px;`;
                let addBtn = null;
                if (hasCustomValue) {
                    addBtn = document.createElement('button');
                    addBtn.textContent = '+ Add';
                    addBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:2px 6px;display:none;`;
                    addBtn.addEventListener('click', () => {
                        const custom = filterInput.value.trim();
                        if (!custom)
                            return;
                        allItems.push({ val: custom, label: custom, isDefault: false });
                        rebuildOptions();
                        sel.value = custom;
                        filterInput.value = '';
                        if (addBtn)
                            addBtn.style.display = 'none';
                        onSelectChange();
                    });
                }
                filterInput.addEventListener('input', () => {
                    const f = filterInput.value.trim();
                    rebuildOptions(f);
                    // Open the dropdown so the user sees filtered results
                    sel.size = Math.min(8, sel.options.length);
                    if (!f)
                        sel.size = 0; // collapse back when filter is cleared
                    // Show Add button if custom_value enabled and no exact match
                    if (addBtn) {
                        const hasExact = f && allItems.some(item => item.val.toLowerCase() === f.toLowerCase() || item.label.toLowerCase() === f.toLowerCase());
                        addBtn.style.display = (f && !hasExact) ? '' : 'none';
                    }
                });
                // Arrow keys in filter input navigate the select; Enter selects
                filterInput.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        sel.selectedIndex = Math.min(sel.selectedIndex + 1, sel.options.length - 1);
                    }
                    else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        sel.selectedIndex = Math.max(sel.selectedIndex - 1, 0);
                    }
                    else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (sel.value) {
                            sel.size = 0;
                            filterInput.value = '';
                            onSelectChange();
                        }
                    }
                });
                // Collapse the expanded list when a selection is made
                sel.addEventListener('change', () => { sel.size = 0; });
                wrapper.append(sel, filterInput);
                if (addBtn)
                    wrapper.appendChild(addBtn);
                // Replace the simple select with the wrapper in the label
                this._formValues[col] = (_g = cfg.default) !== null && _g !== void 0 ? _g : selectedDefault;
                this._inputRefs.set(col, sel);
                if (cfg.source_value)
                    this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
                if (required)
                    this._requiredInputs.push({ col, el: sel });
                lbl.appendChild(wrapper);
                container.appendChild(lbl);
                return;
            }
            this._formValues[col] = (_h = cfg.default) !== null && _h !== void 0 ? _h : selectedDefault;
            inputEl = sel;
        }
        else if (type === 'checkbox') {
            const inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = Boolean(cfg.default);
            inp.addEventListener('change', () => {
                var _a, _b;
                this._formValues[col] = inp.checked ? ((_a = cfg.yes_value) !== null && _a !== void 0 ? _a : true) : ((_b = cfg.no_value) !== null && _b !== void 0 ? _b : false);
                this._validateForm();
            });
            this._formValues[col] = inp.checked ? ((_j = cfg.yes_value) !== null && _j !== void 0 ? _j : true) : ((_k = cfg.no_value) !== null && _k !== void 0 ? _k : false);
            inputEl = inp;
        }
        else if (type === 'number') {
            const inp = document.createElement('input');
            inp.type = 'number';
            if (cfg.min !== undefined)
                inp.min = String(cfg.min);
            if (cfg.max !== undefined)
                inp.max = String(cfg.max);
            if (cfg.step !== undefined)
                inp.step = String(cfg.step);
            if (cfg.placeholder)
                inp.placeholder = String(cfg.placeholder);
            if (cfg.value !== undefined)
                inp.value = String(cfg.value);
            inp.style.cssText =
                (0, styles_1.inputStyle)(cfg.width ? (0, styles_1.cssSize)(cfg.width) : '80px') + `font-size:13px;`;
            inp.addEventListener('input', () => {
                this._formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
                this._validateForm();
            });
            this._formValues[col] = (_l = cfg.value) !== null && _l !== void 0 ? _l : null;
            inputEl = inp;
        }
        else {
            return;
        }
        if (cfg.source_value) {
            this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
        }
        if (required)
            this._requiredInputs.push({ col, el: inputEl });
        this._inputRefs.set(col, inputEl);
        lbl.appendChild(inputEl);
        container.appendChild(lbl);
    }
    /**
     * Load select items. Returns [value, label, formRef?] tuples.
     * formRef is the name of a named form section to show when this item is selected.
     */
    async _loadSelectItems(items) {
        var _a, _b;
        if (!items)
            return [];
        if (Array.isArray(items)) {
            return items.map(item => {
                var _a, _b, _c, _d;
                if (typeof item === 'string')
                    return [item, item];
                if (typeof item === 'object' && item !== null) {
                    // New form: {label, value, form} or {label, form} or legacy {key: val}
                    if ('label' in item || 'form' in item) {
                        const label = (_b = (_a = item.label) !== null && _a !== void 0 ? _a : item.value) !== null && _b !== void 0 ? _b : '';
                        const value = (_d = (_c = item.value) !== null && _c !== void 0 ? _c : item.label) !== null && _d !== void 0 ? _d : '';
                        const form = item.form;
                        return [String(value), String(label), form];
                    }
                    const [k] = Object.keys(item);
                    return [k, String(item[k])];
                }
                return [String(item), String(item)];
            });
        }
        if (typeof items === 'string') {
            return this._loadSelectItemsFromFile(items);
        }
        if (typeof items === 'object') {
            if ('max' in items) {
                const min = (_a = items.min) !== null && _a !== void 0 ? _a : 0;
                const max = items.max;
                const step = (_b = items.step) !== null && _b !== void 0 ? _b : 1;
                const result = [];
                for (let i = min; i <= max; i += step)
                    result.push([String(i), String(i)]);
                return result;
            }
            if ('path' in items) {
                return this._loadSelectItemsFromFile(items.path, items.value, items.label);
            }
        }
        return [];
    }
    async _loadSelectItemsFromFile(path, valueCol, labelCol) {
        var _a, _b;
        const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
        let code;
        if (ext === 'csv') {
            code = (0, python_1.loadSelectItemsCsv)(path, valueCol, labelCol);
        }
        else if (ext === 'parquet') {
            code = (0, python_1.loadSelectItemsParquet)(path, valueCol, labelCol);
        }
        else if (ext === 'jsonl' || ext === 'ndjson') {
            code = (0, python_1.loadSelectItemsJsonl)(path, valueCol, labelCol);
        }
        else if (ext === 'yaml' || ext === 'yml') {
            code = (0, python_1.loadSelectItemsYaml)(path, valueCol, labelCol);
        }
        else {
            code = (0, python_1.loadSelectItemsText)(path);
        }
        try {
            const result = await this._kernel.exec(code);
            return JSON.parse(result);
        }
        catch (_c) {
            return [];
        }
    }
    async _buildSubmissionButtons(cfg) {
        var _a, _b, _c;
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px;`;
        for (const [key, val] of Object.entries(cfg)) {
            if (key === 'pass_value') {
                this._registerPassValue(val);
            }
            else if (key === 'fixed_value') {
                this._registerFixedValue(val);
            }
            else if (key === 'title') {
                this._appendTitleEntry(val, this._dynFormEl);
            }
            else if (key === 'progress_tracker') {
                if (!this._accuracyConfig)
                    this._accuracyConfig = (0, util_1.parseAccuracyConfig)(val);
                this._appendProgressTracker(this._dynFormEl);
            }
            else if (key === 'line') {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.dividerStyle)();
                this._dynFormEl.appendChild(d);
            }
            else if (key === 'break') {
                this._dynFormEl.appendChild(document.createElement('br'));
            }
            else if (key === 'text') {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.mutedTextStyle)();
                d.textContent = String(val);
                this._dynFormEl.appendChild(d);
            }
            else {
                const btnCfg = (val === true) ? {} : val;
                const btn = document.createElement('button');
                if (key === 'previous') {
                    btn.textContent = (_a = btnCfg.label) !== null && _a !== void 0 ? _a : '◀ Prev';
                    btn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;`;
                    btn.addEventListener('click', () => this.prevRequested.emit(void 0));
                }
                else if (key === 'next') {
                    const showIcon = btnCfg.icon !== false;
                    btn.textContent = ((_b = btnCfg.label) !== null && _b !== void 0 ? _b : 'Skip') + (showIcon ? ' →' : '');
                    btn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;`;
                    btn.addEventListener('click', () => this.nextRequested.emit(void 0));
                }
                else if (key === 'submit') {
                    const showIcon = btnCfg.icon !== false;
                    btn.textContent = (showIcon ? '✓ ' : '') + ((_c = btnCfg.label) !== null && _c !== void 0 ? _c : 'Submit');
                    btn.style.cssText = (0, styles_1.btnStyle)(true) + `font-size:13px;opacity:0.4;`;
                    btn.disabled = true;
                    btn.addEventListener('click', () => void this._onVerify());
                    this._submitBtns.push(btn);
                }
                btnContainer.appendChild(btn);
            }
        }
        this._dynFormEl.appendChild(btnContainer);
    }
    async _buildAnnotationElement(config, container) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        if (!config || typeof config !== 'object')
            return;
        const ac = { tools: [] };
        if (config.start_time) {
            const c = typeof config.start_time === 'string' ? { column: config.start_time } : config.start_time;
            const col = (_b = (_a = c.column) !== null && _a !== void 0 ? _a : c.label) !== null && _b !== void 0 ? _b : 'start_time';
            ac.startTime = { col, sourceValue: c.source_value };
            this._formValues[col] = null;
        }
        if (config.end_time) {
            const c = typeof config.end_time === 'string' ? { column: config.end_time } : config.end_time;
            const col = (_d = (_c = c.column) !== null && _c !== void 0 ? _c : c.label) !== null && _d !== void 0 ? _d : 'end_time';
            ac.endTime = { col, sourceValue: c.source_value };
            this._formValues[col] = null;
        }
        if (config.min_frequency) {
            const c = typeof config.min_frequency === 'string' ? { column: config.min_frequency } : config.min_frequency;
            const col = (_f = (_e = c.column) !== null && _e !== void 0 ? _e : c.label) !== null && _f !== void 0 ? _f : 'min_frequency';
            ac.minFreq = { col };
            this._formValues[col] = null;
        }
        if (config.max_frequency) {
            const c = typeof config.max_frequency === 'string' ? { column: config.max_frequency } : config.max_frequency;
            const col = (_h = (_g = c.column) !== null && _g !== void 0 ? _g : c.label) !== null && _h !== void 0 ? _h : 'max_frequency';
            ac.maxFreq = { col };
            this._formValues[col] = null;
        }
        const rawTools = config.tools;
        if (typeof rawTools === 'string') {
            ac.tools = [rawTools];
        }
        else if (Array.isArray(rawTools)) {
            ac.tools = rawTools.filter((t) => typeof t === 'string');
        }
        else {
            ac.tools = ['time_select'];
        }
        // Parse annotation.form for multibox per-box forms
        if (config.form) {
            ac.form = typeof config.form === 'string' ? config.form : null;
            this._multiboxFormName = ac.form;
        }
        this._annotConfig = ac;
        this._activeTool = (_j = ac.tools[0]) !== null && _j !== void 0 ? _j : '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `display:flex;align-items:center;gap:12px;flex-wrap:wrap;`;
        if (ac.tools.length > 1) {
            const lbl = document.createElement('label');
            lbl.style.cssText = (0, styles_1.formLabelStyle)();
            lbl.textContent = 'tool';
            const sel = document.createElement('select');
            sel.style.cssText = (0, styles_1.selectStyle)() + `font-size:13px;`;
            ac.tools.forEach(t => {
                const o = document.createElement('option');
                o.value = t;
                o.textContent = t.replace(/_/g, ' ');
                sel.appendChild(o);
            });
            sel.addEventListener('change', () => {
                this._activeTool = sel.value;
                void this._rebuildAnnotFormUI();
                this.activeToolChanged.emit(this._activeTool);
                this.annotationChanged.emit(void 0);
            });
            lbl.appendChild(sel);
            wrapper.appendChild(lbl);
        }
        const mkInput = (field, label, unit = '') => {
            const lbl = document.createElement('label');
            lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:12px;gap:5px;`;
            lbl.textContent = label;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = field.includes('Freq') ? '1' : '0.01';
            inp.style.cssText = (0, styles_1.inputStyle)('80px') + `font-size:12px;`;
            inp.addEventListener('input', () => {
                const v = inp.value === '' ? null : parseFloat(inp.value);
                this._setAnnotValueInternal(field, v, /*emit*/ true);
            });
            if (unit) {
                const u = document.createElement('span');
                u.textContent = unit;
                u.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:10px;`;
                lbl.append(inp, u);
            }
            else {
                lbl.appendChild(inp);
            }
            this._annotInputs.set(field, inp);
            wrapper.appendChild(lbl);
        };
        if (ac.startTime)
            mkInput('startTime', (_l = (_k = config.start_time) === null || _k === void 0 ? void 0 : _k.label) !== null && _l !== void 0 ? _l : 'start', 's');
        if (ac.endTime)
            mkInput('endTime', (_o = (_m = config.end_time) === null || _m === void 0 ? void 0 : _m.label) !== null && _o !== void 0 ? _o : 'end', 's');
        if (ac.minFreq)
            mkInput('minFreq', (_q = (_p = config.min_frequency) === null || _p === void 0 ? void 0 : _p.label) !== null && _q !== void 0 ? _q : 'min freq', 'Hz');
        if (ac.maxFreq)
            mkInput('maxFreq', (_s = (_r = config.max_frequency) === null || _r === void 0 ? void 0 : _r.label) !== null && _s !== void 0 ? _s : 'max freq', 'Hz');
        container.appendChild(wrapper);
        // Annotation form container — shows per-box forms in multibox mode,
        // or a single form instance for other annotation tools
        if (ac.form) {
            this._multiboxContainer = document.createElement('div');
            this._multiboxContainer.style.cssText =
                `display:flex;flex-direction:column;gap:6px;overflow-y:auto;`;
            container.appendChild(this._multiboxContainer);
            // Build initial single-form view (will switch to multibox cards when tool changes)
            await this._rebuildAnnotFormUI();
        }
    }
    // ─── Private: multibox UI ──────────────────────────────────
    async _rebuildAnnotFormUI() {
        var _a, _b, _c, _d;
        if (!this._multiboxContainer)
            return;
        this._multiboxContainer.innerHTML = '';
        // Non-multibox mode: show a single form instance
        if (!this.isMultiboxMode()) {
            if (this._multiboxFormName) {
                let formCfg = (_b = (_a = this._formConfig) === null || _a === void 0 ? void 0 : _a.dynamic_forms) === null || _b === void 0 ? void 0 : _b[this._multiboxFormName];
                if (formCfg) {
                    if (!Array.isArray(formCfg) && typeof formCfg === 'object') {
                        formCfg = Object.keys(formCfg).map((k) => ({ [k]: formCfg[k] }));
                    }
                    if (Array.isArray(formCfg)) {
                        const formDiv = document.createElement('div');
                        formDiv.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;`;
                        await this._buildFormSection(formCfg, formDiv);
                        this._multiboxContainer.appendChild(formDiv);
                    }
                }
            }
            this._validateForm();
            return;
        }
        // Multibox mode
        if (this._multiboxEntries.length === 0) {
            const hint = document.createElement('div');
            hint.style.cssText = (0, styles_1.mutedTextStyle)({ fontSize: 11 });
            hint.textContent = 'Draw on spectrogram to add boxes';
            this._multiboxContainer.appendChild(hint);
            return;
        }
        for (let i = 0; i < this._multiboxEntries.length; i++) {
            const entry = this._multiboxEntries[i];
            const card = document.createElement('div');
            card.dataset.multiboxIdx = String(i);
            card.style.cssText =
                `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
                    `border-radius:4px;border-left:3px solid ${entry.color};` +
                    `background:${i === this._activeBoxIndex ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgMantle};cursor:pointer;`;
            card.addEventListener('click', () => this.setActiveBox(i));
            // Header row: color dot + bounds + delete button
            const headerRow = document.createElement('div');
            headerRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
            const dot = document.createElement('span');
            dot.style.cssText =
                `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${entry.color};`;
            headerRow.appendChild(dot);
            const bounds = document.createElement('span');
            bounds.style.cssText = `font-size:10px;color:${styles_1.COLORS.textSubtle};font-family:ui-monospace,monospace;white-space:nowrap;`;
            bounds.textContent =
                `${entry.startTime.toFixed(1)}–${entry.endTime.toFixed(1)}s` +
                    `  ${(entry.minFreq / 1000).toFixed(1)}–${(entry.maxFreq / 1000).toFixed(1)} kHz`;
            headerRow.appendChild(bounds);
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            headerRow.appendChild(spacer);
            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.title = 'Remove this box';
            delBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:14px;padding:0 6px;line-height:1;`;
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeMultiboxEntry(i);
            });
            headerRow.appendChild(delBtn);
            card.appendChild(headerRow);
            // Per-box form (if configured)
            if (this._multiboxFormName) {
                let formCfg = (_d = (_c = this._formConfig) === null || _c === void 0 ? void 0 : _c.dynamic_forms) === null || _d === void 0 ? void 0 : _d[this._multiboxFormName];
                if (formCfg) {
                    if (!Array.isArray(formCfg) && typeof formCfg === 'object') {
                        formCfg = Object.keys(formCfg).map((k) => ({ [k]: formCfg[k] }));
                    }
                    if (Array.isArray(formCfg)) {
                        const formDiv = document.createElement('div');
                        formDiv.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
                        await this._buildMultiboxFormSection(formCfg, formDiv, entry);
                        card.appendChild(formDiv);
                    }
                }
            }
            this._multiboxContainer.appendChild(card);
        }
        this._validateForm();
    }
    /** Build form elements for a multibox entry, writing to entry.formValues. */
    async _buildMultiboxFormSection(elements, container, entry) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        for (const item of elements) {
            if (!item || typeof item !== 'object')
                continue;
            const [type] = Object.keys(item);
            const config = item[type];
            if (type === 'select') {
                const cfg = config !== null && config !== void 0 ? config : {};
                const col = (_b = (_a = cfg.column) !== null && _a !== void 0 ? _a : cfg.label) !== null && _b !== void 0 ? _b : type;
                const sel = document.createElement('select');
                sel.style.cssText = (0, styles_1.selectStyle)() + `font-size:11px;max-width:160px;`;
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '— select —';
                sel.appendChild(emptyOpt);
                const items = await this._loadSelectItems(cfg.items);
                items.forEach(([v, l]) => {
                    const isDefault = v.startsWith('selected::');
                    const cleanVal = isDefault ? v.slice(10) : v;
                    const cleanLabel = l.startsWith('selected::') ? l.slice(10) : l;
                    const o = document.createElement('option');
                    o.value = cleanVal;
                    o.textContent = cleanLabel;
                    if (isDefault)
                        o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener('change', () => { entry.formValues[col] = sel.value; this._validateForm(); });
                entry.formValues[col] = (_c = entry.formValues[col]) !== null && _c !== void 0 ? _c : '';
                if (entry.formValues[col])
                    sel.value = entry.formValues[col];
                const lbl = document.createElement('label');
                lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
                lbl.textContent = (_d = cfg.label) !== null && _d !== void 0 ? _d : col;
                lbl.appendChild(sel);
                container.appendChild(lbl);
            }
            else if (type === 'textbox') {
                const cfg = config !== null && config !== void 0 ? config : {};
                const col = (_f = (_e = cfg.column) !== null && _e !== void 0 ? _e : cfg.label) !== null && _f !== void 0 ? _f : type;
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.style.cssText = (0, styles_1.inputStyle)('100px') + `font-size:11px;`;
                inp.addEventListener('input', () => { entry.formValues[col] = inp.value; this._validateForm(); });
                entry.formValues[col] = (_g = entry.formValues[col]) !== null && _g !== void 0 ? _g : '';
                inp.value = entry.formValues[col];
                const lbl = document.createElement('label');
                lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
                lbl.textContent = (_h = cfg.label) !== null && _h !== void 0 ? _h : col;
                lbl.appendChild(inp);
                container.appendChild(lbl);
            }
            else if (type === 'number') {
                const cfg = config !== null && config !== void 0 ? config : {};
                const col = (_k = (_j = cfg.column) !== null && _j !== void 0 ? _j : cfg.label) !== null && _k !== void 0 ? _k : type;
                const inp = document.createElement('input');
                inp.type = 'number';
                if (cfg.min !== undefined)
                    inp.min = String(cfg.min);
                if (cfg.max !== undefined)
                    inp.max = String(cfg.max);
                if (cfg.step !== undefined)
                    inp.step = String(cfg.step);
                inp.style.cssText = (0, styles_1.inputStyle)('60px') + `font-size:11px;`;
                inp.addEventListener('input', () => {
                    entry.formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
                    this._validateForm();
                });
                entry.formValues[col] = (_l = entry.formValues[col]) !== null && _l !== void 0 ? _l : null;
                if (entry.formValues[col] != null)
                    inp.value = String(entry.formValues[col]);
                const lbl = document.createElement('label');
                lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
                lbl.textContent = (_m = cfg.label) !== null && _m !== void 0 ? _m : col;
                lbl.appendChild(inp);
                container.appendChild(lbl);
            }
            else if (type === 'checkbox') {
                const cfg = config !== null && config !== void 0 ? config : {};
                const col = (_p = (_o = cfg.column) !== null && _o !== void 0 ? _o : cfg.label) !== null && _p !== void 0 ? _p : type;
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                inp.checked = Boolean((_q = entry.formValues[col]) !== null && _q !== void 0 ? _q : cfg.default);
                inp.addEventListener('change', () => {
                    var _a, _b;
                    entry.formValues[col] = inp.checked ? ((_a = cfg.yes_value) !== null && _a !== void 0 ? _a : true) : ((_b = cfg.no_value) !== null && _b !== void 0 ? _b : false);
                    this._validateForm();
                });
                entry.formValues[col] = inp.checked ? ((_r = cfg.yes_value) !== null && _r !== void 0 ? _r : true) : ((_s = cfg.no_value) !== null && _s !== void 0 ? _s : false);
                const lbl = document.createElement('label');
                lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
                lbl.textContent = (_t = cfg.label) !== null && _t !== void 0 ? _t : col;
                lbl.appendChild(inp);
                container.appendChild(lbl);
            }
        }
    }
    _highlightActiveBoxCard() {
        if (!this._multiboxContainer)
            return;
        const cards = this._multiboxContainer.querySelectorAll('[data-multibox-idx]');
        cards.forEach((card, i) => {
            const entry = this._multiboxEntries[i];
            if (!entry)
                return;
            card.style.borderColor =
                i === this._activeBoxIndex ? entry.color : 'transparent';
        });
    }
    // ─── Private: value management ─────────────────────────────
    _applyRow(row) {
        var _a;
        this._currentRow = row;
        // Clear multibox state
        this._multiboxEntries = [];
        this._activeBoxIndex = -1;
        void this._rebuildAnnotFormUI();
        // Hide all named form sections
        for (const sectionEl of this._namedSections.values()) {
            sectionEl.style.display = 'none';
        }
        // Reset all tracked inputs to empty
        for (const [col, el] of this._inputRefs) {
            if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                el.checked = false;
                this._formValues[col] = false;
            }
            else {
                el.value = '';
                this._formValues[col] = '';
            }
        }
        // Apply source_value fields
        for (const { col, sourceCol } of this._sourceValueFields) {
            const val = row[sourceCol];
            if (val !== undefined) {
                const el = this._inputRefs.get(col);
                if (el) {
                    el.value = String(val);
                    this._formValues[col] = val;
                }
            }
        }
        // Apply annotation fields from row
        if (this._annotConfig) {
            const ac = this._annotConfig;
            if (ac.startTime) {
                const sv = ac.startTime.sourceValue;
                const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.start_time;
                this._setAnnotValueInternal('startTime', v, /*emit*/ false);
            }
            if (ac.endTime) {
                const sv = ac.endTime.sourceValue;
                const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.end_time;
                this._setAnnotValueInternal('endTime', v, /*emit*/ false);
            }
            if (ac.minFreq)
                this._setAnnotValueInternal('minFreq', null, /*emit*/ false);
            if (ac.maxFreq)
                this._setAnnotValueInternal('maxFreq', null, /*emit*/ false);
        }
        // Apply pass_value fields
        for (const { sourceCol, col } of this._passValueDefs) {
            this._formValues[col] = (_a = row[sourceCol]) !== null && _a !== void 0 ? _a : null;
        }
        // Annotation rendering on the canvas depends on these values
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    _setAnnotValueInternal(field, val, emit) {
        var _a, _b, _c, _d;
        const ac = this._annotConfig;
        if (!ac)
            return;
        let col;
        if (field === 'startTime')
            col = (_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col;
        else if (field === 'endTime')
            col = (_b = ac.endTime) === null || _b === void 0 ? void 0 : _b.col;
        else if (field === 'minFreq')
            col = (_c = ac.minFreq) === null || _c === void 0 ? void 0 : _c.col;
        else if (field === 'maxFreq')
            col = (_d = ac.maxFreq) === null || _d === void 0 ? void 0 : _d.col;
        if (!col)
            return;
        this._formValues[col] = val;
        const inp = this._annotInputs.get(field);
        if (inp)
            inp.value = val != null ? val.toFixed(2) : '';
        this._validateForm();
        if (emit)
            this.annotationChanged.emit(void 0);
    }
    _validateForm() {
        var _a, _b, _c, _d, _e;
        // Check main form required inputs (skip those in detached/hidden sections)
        let allSatisfied = this._requiredInputs.every(({ col, el }) => {
            if (!el.isConnected)
                return true; // skip stale refs from rebuilt multibox forms
            const section = el.closest('[data-form-section]');
            if (section && section.style.display === 'none')
                return true;
            const val = this._formValues[col];
            return val !== null && val !== undefined && val !== '';
        });
        // In multibox mode, require at least one box and check per-box required fields
        if (this.isMultiboxMode()) {
            if (this._multiboxEntries.length === 0) {
                allSatisfied = false;
            }
            else if (this._multiboxFormName) {
                // Check each box has its required fields filled
                let formCfg = (_b = (_a = this._formConfig) === null || _a === void 0 ? void 0 : _a.dynamic_forms) === null || _b === void 0 ? void 0 : _b[this._multiboxFormName];
                if (formCfg && !Array.isArray(formCfg) && typeof formCfg === 'object') {
                    formCfg = Object.keys(formCfg).map((k) => ({ [k]: formCfg[k] }));
                }
                if (Array.isArray(formCfg)) {
                    const requiredCols = [];
                    for (const item of formCfg) {
                        if (!item || typeof item !== 'object')
                            continue;
                        const [type] = Object.keys(item);
                        const cfg = (_c = item[type]) !== null && _c !== void 0 ? _c : {};
                        if (cfg.required)
                            requiredCols.push((_e = (_d = cfg.column) !== null && _d !== void 0 ? _d : cfg.label) !== null && _e !== void 0 ? _e : type);
                    }
                    if (requiredCols.length > 0) {
                        for (const entry of this._multiboxEntries) {
                            for (const col of requiredCols) {
                                const val = entry.formValues[col];
                                if (val === null || val === undefined || val === '') {
                                    allSatisfied = false;
                                    break;
                                }
                            }
                            if (!allSatisfied)
                                break;
                        }
                    }
                }
            }
        }
        this._submitBtns.forEach(btn => {
            btn.disabled = !allSatisfied;
            btn.style.opacity = allSatisfied ? '1' : '0.4';
        });
    }
    _registerPassValue(config) {
        var _a;
        if (typeof config === 'string') {
            this._passValueDefs.push({ sourceCol: config, col: config });
            this._formValues[config] = null;
        }
        else if (config && typeof config === 'object') {
            const sourceCol = config.source_column;
            const col = (_a = config.column) !== null && _a !== void 0 ? _a : sourceCol;
            this._passValueDefs.push({ sourceCol, col });
            this._formValues[col] = null;
        }
    }
    _registerFixedValue(config) {
        var _a;
        if (!config || typeof config !== 'object')
            return;
        const col = config.column;
        if (!col)
            return;
        this._formValues[col] = (_a = config.value) !== null && _a !== void 0 ? _a : null;
    }
    _collectFormValues() {
        return Object.assign({}, this._formValues);
    }
    _isAccuracyValid(cellValue, configValue) {
        if (configValue !== null) {
            return String(cellValue !== null && cellValue !== void 0 ? cellValue : '').toLowerCase() === configValue.toLowerCase();
        }
        return (0, util_1.isTruthyValue)(cellValue);
    }
    // ─── Private: display elements ────────────────────────────
    _appendTitleEntry(config, container) {
        var _a;
        if (!config)
            return;
        const isObj = typeof config === 'object';
        const text = isObj ? ((_a = config.value) !== null && _a !== void 0 ? _a : '') : String(config);
        const withProgress = isObj && config.progress_tracker != null && config.progress_tracker !== false;
        const d = document.createElement('div');
        d.style.cssText = (0, styles_1.sectionTitleStyle)() + `display:flex;align-items:baseline;`;
        const span = document.createElement('span');
        span.textContent = text;
        d.appendChild(span);
        if (withProgress) {
            if (!this._accuracyConfig)
                this._accuracyConfig = (0, util_1.parseAccuracyConfig)(config.progress_tracker);
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            d.append(spacer, this._createProgressEl());
        }
        container.appendChild(d);
    }
    _appendProgressTracker(container) {
        const d = document.createElement('div');
        d.style.cssText = `width:100%;`;
        d.appendChild(this._createProgressEl());
        container.appendChild(d);
    }
    _createProgressEl() {
        const el = document.createElement('span');
        el.style.cssText =
            `font-size:11px;font-weight:400;letter-spacing:0;color:${styles_1.COLORS.textMuted};` +
                `font-family:ui-monospace,monospace;`;
        this._progressEls.push(el);
        this._updateProgress();
        return el;
    }
    _updateProgress() {
        const total = this._rows.length;
        const fileN = Math.min(this._fileCount, total);
        const totalDone = fileN + this._sessionCount;
        const parts = [];
        if (this._sessionCount > 0) {
            parts.push(`session ${this._sessionCount}/${total}`);
        }
        parts.push(`total ${totalDone}/${total}`);
        if (this._accuracy !== null) {
            parts.push(`accuracy ${this._accuracy}%`);
        }
        const text = parts.join(' \u00b7 ');
        for (const el of this._progressEls) {
            el.textContent = text;
        }
    }
    // ─── Private: reviewed state ────────────────────────────────
    _isRowReviewed(row) {
        return !this._duplicateEntries && this._reviewedMap.has(row.id);
    }
    _showReviewedResult(row) {
        this._dynFormEl.innerHTML = '';
        this._submitBtns = [];
        this._showingReviewedView = true;
        const data = this._reviewedMap.get(row.id);
        if (!data)
            return;
        // Title (same as sectionTitleStyle but green)
        const title = document.createElement('div');
        title.style.cssText =
            `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${styles_1.COLORS.green};`;
        title.textContent = 'REVIEWED';
        this._dynFormEl.appendChild(title);
        // Key-value pairs
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:4px 0;`;
        for (const [key, val] of Object.entries(data)) {
            const line = document.createElement('div');
            line.style.cssText = `display:flex;gap:8px;font-size:12px;`;
            const keyEl = document.createElement('span');
            keyEl.style.cssText = `color:${styles_1.COLORS.textMuted};min-width:140px;flex-shrink:0;`;
            keyEl.textContent = key;
            const valEl = document.createElement('span');
            valEl.style.cssText = `color:${styles_1.COLORS.textPrimary};`;
            valEl.textContent = val != null && val !== '' ? String(val) : '—';
            line.append(keyEl, valEl);
            container.appendChild(line);
        }
        this._dynFormEl.appendChild(container);
        // Divider + buttons
        const divider = document.createElement('div');
        divider.style.cssText = (0, styles_1.dividerStyle)('4px -2px');
        this._dynFormEl.appendChild(divider);
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:2px;`;
        const navBtnStyle = (0, styles_1.btnStyle)() + `font-size:12px;width:75px;height:28px`;
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀ Prev';
        prevBtn.style.cssText = navBtnStyle;
        prevBtn.disabled = this._selectedIdx === 0;
        prevBtn.addEventListener('click', () => this.prevRequested.emit(void 0));
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next ▶';
        nextBtn.style.cssText = navBtnStyle;
        nextBtn.disabled = this._selectedIdx >= this._filteredLength - 1;
        nextBtn.addEventListener('click', () => this.nextRequested.emit(void 0));
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete this review';
        deleteBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:12px;color:${styles_1.COLORS.red};`;
        deleteBtn.addEventListener('click', () => void this._onDeleteReview(row));
        btnRow.append(prevBtn, nextBtn, spacer, deleteBtn);
        this._dynFormEl.appendChild(btnRow);
    }
    // ─── Private: submit / delete ─────────────────────────────
    async _onVerify() {
        var _a, _b;
        if (!this._currentRow || !this._outputPath)
            return;
        const activeRow = this._currentRow;
        const ac = this._annotConfig;
        // Multibox mode: write one row per box
        if (this.isMultiboxMode() && this._multiboxEntries.length > 0) {
            const baseValues = this._collectFormValues();
            // Remove annotation columns from base (they come from each box)
            if (ac === null || ac === void 0 ? void 0 : ac.startTime)
                delete baseValues[ac.startTime.col];
            if (ac === null || ac === void 0 ? void 0 : ac.endTime)
                delete baseValues[ac.endTime.col];
            if (ac === null || ac === void 0 ? void 0 : ac.minFreq)
                delete baseValues[ac.minFreq.col];
            if (ac === null || ac === void 0 ? void 0 : ac.maxFreq)
                delete baseValues[ac.maxFreq.col];
            const n = this._multiboxEntries.length;
            try {
                for (const entry of this._multiboxEntries) {
                    const rowValues = Object.assign({}, baseValues);
                    if (ac === null || ac === void 0 ? void 0 : ac.startTime)
                        rowValues[ac.startTime.col] = entry.startTime;
                    if (ac === null || ac === void 0 ? void 0 : ac.endTime)
                        rowValues[ac.endTime.col] = entry.endTime;
                    if (ac === null || ac === void 0 ? void 0 : ac.minFreq)
                        rowValues[ac.minFreq.col] = entry.minFreq;
                    if (ac === null || ac === void 0 ? void 0 : ac.maxFreq)
                        rowValues[ac.maxFreq.col] = entry.maxFreq;
                    // Merge per-box form values
                    Object.assign(rowValues, entry.formValues);
                    const code = (0, python_1.writeOutputRow)(this._outputPath, rowValues);
                    await this._kernel.exec(code);
                }
                this.statusChanged.emit({
                    message: `✓ Saved ${n} boxes for clip ${activeRow.id} → ${this._outputPath}`,
                    error: false,
                });
            }
            catch (e) {
                this.statusChanged.emit({ message: `❌ Write failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
                return;
            }
            this._sessionCount++;
            if (!this._duplicateEntries) {
                this._reviewedMap.set(activeRow.id, { _multibox: true, count: n });
            }
            void this._refreshAccuracy().then(() => this._updateProgress());
            void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
            this.submitted.emit({ _multibox: true, count: n });
            return;
        }
        // Standard single-row submit
        const values = this._collectFormValues();
        const code = (0, python_1.writeOutputRow)(this._outputPath, values);
        try {
            await this._kernel.exec(code);
            this.statusChanged.emit({ message: `✓ Saved clip ${activeRow.id} → ${this._outputPath}`, error: false });
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Write failed: ${String((_b = e.message) !== null && _b !== void 0 ? _b : e)}`, error: true });
            return;
        }
        this._sessionCount++;
        if (!this._duplicateEntries) {
            this._reviewedMap.set(activeRow.id, Object.assign({}, values));
        }
        void this._refreshAccuracy().then(() => this._updateProgress());
        void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
        this.submitted.emit(values);
    }
    _currentRowId() { var _a, _b; return (_b = (_a = this._currentRow) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : -1; }
    _rowById(id) {
        return this._rows.findIndex(r => r.id === id);
    }
    async _onDeleteReview(row) {
        var _a;
        if (!confirm('Delete this review? This cannot be undone.'))
            return;
        const idMapping = this._passValueDefs.find(pv => pv.sourceCol === 'id');
        const outIdCol = idMapping === null || idMapping === void 0 ? void 0 : idMapping.col;
        const matchExpr = outIdCol
            ? `str(r.get('${(0, util_1.escPy)(outIdCol)}','')) == '${row.id}'`
            : `abs(float(r.get('start_time',0))-${row.start_time})<0.01 and abs(float(r.get('end_time',0))-${row.end_time})<0.01`;
        const code = (0, python_1.deleteOutputRow)(this._outputPath, matchExpr);
        try {
            await this._kernel.exec(code);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Delete failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
            return;
        }
        this._reviewedMap.delete(row.id);
        this._sessionCount = 0;
        this._fileCount = 0;
        await this.loadOutputFileProgress();
        // Rebuild the form and show it
        await this.build();
        this._applyRow(row);
        this.statusChanged.emit({ message: `✓ Review deleted for clip ${row.id}`, error: false });
        void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
        this.reviewDeleted.emit(row);
    }
}
exports.FormPanel = FormPanel;


/***/ },

/***/ "./lib/sections/InfoCard.js"
/*!**********************************!*\
  !*** ./lib/sections/InfoCard.js ***!
  \**********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InfoCard = void 0;
/**
 * InfoCard — displays metadata for the currently selected row.
 *
 * Shows time range, ident column value, display columns as colored chips,
 * and Prev/Next navigation buttons.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
class InfoCard {
    constructor() {
        this.prevRequested = new signaling_1.Signal(this);
        this.nextRequested = new signaling_1.Signal(this);
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;align-items:center;gap:10px;padding:6px 12px;` +
                `background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;min-height:34px;`;
        this.element.innerHTML =
            `<span style="font-size:12px;color:${styles_1.COLORS.textMuted};font-style:italic;">No selection</span>`;
    }
    /** Render the info card for the given row. */
    render(row, opts) {
        this.element.innerHTML = '';
        const sep = () => {
            const s = document.createElement('span');
            s.style.cssText = `color:${styles_1.COLORS.bgSurface1};font-size:11px;flex-shrink:0;`;
            s.textContent = '|';
            return s;
        };
        const mkChip = (text, color) => {
            const s = document.createElement('span');
            s.style.cssText = `font-size:12px;color:${color};flex-shrink:0;`;
            s.textContent = text;
            return s;
        };
        const items = [];
        items.push(mkChip(`${(0, util_1.fmtTime)(row.start_time)} – ${(0, util_1.fmtTime)(row.end_time)}`, styles_1.COLORS.textSubtle));
        if (opts.identCol && row[opts.identCol] !== undefined) {
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `font-size:13px;font-weight:600;color:${styles_1.COLORS.textPrimary};flex-shrink:0;`;
            nameSpan.textContent = String(row[opts.identCol]);
            items.unshift(nameSpan);
        }
        const colColors = styles_1.DISPLAY_CHIP_COLORS;
        opts.displayCols.forEach((col, i) => {
            if (row[col] === undefined)
                return;
            const val = typeof row[col] === 'number' && !Number.isInteger(row[col])
                ? row[col].toFixed(3)
                : String(row[col]);
            items.push(mkChip(`${col}: ${val}`, colColors[i % colColors.length]));
        });
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀ Prev';
        prevBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        prevBtn.disabled = opts.filteredIdx === 0;
        prevBtn.addEventListener('click', () => this.prevRequested.emit(void 0));
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next ▶';
        nextBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        nextBtn.disabled = opts.filteredIdx >= opts.filteredLength - 1;
        nextBtn.addEventListener('click', () => this.nextRequested.emit(void 0));
        const cardChildren = [];
        items.forEach((el, i) => {
            cardChildren.push(el);
            if (i < items.length - 1)
                cardChildren.push(sep());
        });
        cardChildren.push(spacer, prevBtn, nextBtn);
        this.element.append(...cardChildren);
    }
}
exports.InfoCard = InfoCard;


/***/ },

/***/ "./lib/sections/Player.js"
/*!********************************!*\
  !*** ./lib/sections/Player.js ***!
  \********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Player = void 0;
/**
 * Player — spectrogram canvas, audio playback, annotation tools, capture.
 *
 * Owns the player controls bar, spectrogram canvas, playback bar, and
 * all mouse interaction for annotation tools. Reads annotation config
 * and values from FormPanel.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ../python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
class Player {
    constructor(_kernel, _form) {
        this._kernel = _kernel;
        this._form = _form;
        // ─── Signals ───────────────────────────────────────────────
        /** Status message for the widget header. */
        this.statusChanged = new signaling_1.Signal(this);
        // ─── Player state ─────────────────────────────────────────
        this._specBitmap = null;
        this._segLoadStart = 0;
        this._segDuration = 0;
        this._detectionStart = 0;
        this._detectionEnd = 0;
        this._bufferSec = 5;
        this._playing = false;
        this._rafId = 0;
        this._resizeObserver = null;
        this._resizeTimer = null;
        this._sampleRate = 0;
        this._freqMin = 0;
        this._freqMax = 0;
        this._annotDrag = null;
        this._playheadDrag = false;
        // ─── Zoom state (client-side crop) ────────────────────────
        // View fractions: 0..1 range over the full spectrogram image
        this._viewXMin = 0; // left edge (time fraction)
        this._viewXMax = 1; // right edge
        this._viewYMin = 0; // bottom edge (freq fraction, 0=low freq)
        this._viewYMax = 1; // top edge
        this._panDrag = null;
        this._zoomBoxActive = false;
        this._zoomBoxDrag = null;
        this._zoomBoxMoveHandler = null;
        this._zoomBoxUpHandler = null;
        this._specResolutions = ['1000', '2000', '4000'];
        // ─── Visualization state ──────────────────────────────────
        this._vizMeta = [];
        this._currentFreqScale = 'linear';
        this._freqScaleLUT = null; // 256 frac values for 'lut' scale
        // ─── Context ───────────────────────────────────────────────
        this._audioConfig = { type: 'path', value: '', prefix: '', suffix: '', fallback: '' };
        this._captureLabel = '';
        this._captureDir = '';
        this._identCol = '';
        this._displayCols = [];
        this._currentRow = null;
        this._rows = [];
        this._selectedIdx = -1;
        this.element = document.createElement('div');
        this.element.style.cssText = `display:contents;`; // transparent wrapper
        this._buildUI();
    }
    // ─── Public API ────────────────────────────────────────────
    /** Set context after kernel vars are read. */
    setContext(opts) {
        this._audioConfig = opts.audioConfig;
        this._captureLabel = opts.captureLabel;
        this._captureDir = opts.captureDir;
        this._identCol = opts.identCol;
        this._displayCols = opts.displayCols;
        this._rows = opts.rows;
        this._bufferInput.value = String(opts.defaultBuffer);
        this._specResolutions = opts.specResolutions;
        this._rebuildResolutionSelect();
        this._vizMeta = opts.vizMeta.length > 0 ? opts.vizMeta : [
            { type: 'builtin', key: 'plain', label: 'Plain', freq_scale: 'linear', index: 0 },
            { type: 'builtin', key: 'mel', label: 'Mel', freq_scale: 'mel', index: 1 },
        ];
        this._rebuildVizSelect();
        if (this._captureLabel) {
            this._captureBtn.textContent = this._captureLabel;
            this._captureBtn.style.display = '';
        }
        this._updateCursorForZoom();
    }
    /** Load audio for a row (called when a row is selected). */
    async loadRow(row) {
        this._currentRow = row;
        this._startInput.value = String(row.start_time);
        this._endInput.value = String(row.end_time);
        this._resetZoom();
        await this._loadAudio();
    }
    /** Re-render the spectrogram frame (after annotation change, etc.). */
    renderFrame() {
        this._renderFrame();
    }
    /** Update cursor for annotation mode. */
    updateCursor() {
        this._updateCursorForZoom();
    }
    /** Set up the resize observer (call from Widget.onAfterAttach). */
    attach() {
        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (this._resizeTimer !== null)
                    clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(() => {
                    this._canvas.width = Math.floor(width);
                    this._canvas.height = Math.floor(height);
                    if (this._specBitmap)
                        this._renderFrame();
                }, 150);
            }
        });
        this._resizeObserver.observe(this._canvasContainer);
    }
    /** Tear down the resize observer (call from Widget.onBeforeDetach). */
    detach() {
        var _a;
        (_a = this._resizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this._resizeObserver = null;
        if (this._resizeTimer !== null)
            clearTimeout(this._resizeTimer);
        cancelAnimationFrame(this._rafId);
    }
    /** Get the signal time display element (for orchestrator to update text). */
    get signalTimeDisplay() {
        return this._signalTimeDisplay;
    }
    // ─── Private: UI ───────────────────────────────────────────
    _buildUI() {
        // Player controls bar
        const playerCtrls = document.createElement('div');
        playerCtrls.style.cssText = (0, styles_1.barBottomStyle)();
        const mkNumInput = (labelText, def, w = '65px', container) => {
            const lbl = document.createElement('label');
            lbl.style.cssText = (0, styles_1.labelStyle)();
            lbl.textContent = labelText;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = def;
            inp.style.cssText = (0, styles_1.inputStyle)(w);
            lbl.appendChild(inp);
            (container !== null && container !== void 0 ? container : playerCtrls).appendChild(lbl);
            return inp;
        };
        const typeLbl = document.createElement('label');
        typeLbl.style.cssText = (0, styles_1.labelStyle)();
        typeLbl.textContent = 'Type';
        this._spectTypeSelect = document.createElement('select');
        this._spectTypeSelect.style.cssText = (0, styles_1.selectStyle)();
        typeLbl.appendChild(this._spectTypeSelect);
        playerCtrls.appendChild(typeLbl);
        // Resolution selector
        const resLbl = document.createElement('label');
        resLbl.style.cssText = (0, styles_1.labelStyle)();
        resLbl.textContent = 'Res';
        this._resolutionSelect = document.createElement('select');
        this._resolutionSelect.style.cssText = (0, styles_1.selectStyle)();
        resLbl.appendChild(this._resolutionSelect);
        playerCtrls.appendChild(resLbl);
        this._bufferInput = mkNumInput('Buffer (s)', '3', '50px');
        this._startInput = mkNumInput('Start (s)', '0', '70px');
        this._endInput = mkNumInput('End (s)', '12', '70px');
        this._loadBtn = document.createElement('button');
        this._loadBtn.textContent = 'Update';
        this._loadBtn.style.cssText = (0, styles_1.btnStyle)(true);
        this._loadBtn.addEventListener('click', () => void this._loadAudio());
        playerCtrls.appendChild(this._loadBtn);
        this._captureBtn = document.createElement('button');
        this._captureBtn.textContent = 'Capture';
        this._captureBtn.style.cssText = (0, styles_1.btnStyle)() + `display:none;margin-left:auto;`;
        this._captureBtn.addEventListener('click', () => void this._onCapture());
        playerCtrls.appendChild(this._captureBtn);
        // View bounds bar (shows current zoom window)
        const viewBar = document.createElement('div');
        viewBar.style.cssText = (0, styles_1.barBottomStyle)();
        this._viewTimeMinDisplay = mkNumInput('Time min (s)', '0', '70px', viewBar);
        this._viewTimeMaxDisplay = mkNumInput('Time max (s)', '0', '70px', viewBar);
        this._viewFreqMinDisplay = mkNumInput('Freq min (kHz)', '0', '65px', viewBar);
        this._viewFreqMaxDisplay = mkNumInput('Freq max (kHz)', '0', '65px', viewBar);
        const applyViewBounds = () => {
            if (this._segDuration <= 0)
                return;
            const tMin = parseFloat(this._viewTimeMinDisplay.value);
            const tMax = parseFloat(this._viewTimeMaxDisplay.value);
            if (!isNaN(tMin) && !isNaN(tMax) && tMax > tMin) {
                this._viewXMin = Math.max(0, (tMin - this._segLoadStart) / this._segDuration);
                this._viewXMax = Math.min(1, (tMax - this._segLoadStart) / this._segDuration);
            }
            const fMinKhz = parseFloat(this._viewFreqMinDisplay.value);
            const fMaxKhz = parseFloat(this._viewFreqMaxDisplay.value);
            const fRange = this._freqMax - this._freqMin;
            if (!isNaN(fMinKhz) && !isNaN(fMaxKhz) && fMaxKhz > fMinKhz && fRange > 0) {
                this._viewYMin = Math.max(0, (fMinKhz * 1000 - this._freqMin) / fRange);
                this._viewYMax = Math.min(1, (fMaxKhz * 1000 - this._freqMin) / fRange);
            }
            this._updateCursorForZoom();
            this._renderFrame();
        };
        const onEnterOrBlur = (inp) => {
            inp.addEventListener('change', applyViewBounds);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') {
                e.preventDefault();
                applyViewBounds();
            } });
        };
        onEnterOrBlur(this._viewTimeMinDisplay);
        onEnterOrBlur(this._viewTimeMaxDisplay);
        onEnterOrBlur(this._viewFreqMinDisplay);
        onEnterOrBlur(this._viewFreqMaxDisplay);
        this._zoomBoxBtn = document.createElement('button');
        this._zoomBoxBtn.textContent = '⬚';
        this._zoomBoxBtn.title = 'Zoom to selection — draw a box on the spectrogram';
        this._zoomBoxBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;padding:2px 8px;`;
        this._zoomBoxBtn.addEventListener('click', () => {
            this._zoomBoxActive = !this._zoomBoxActive;
            this._zoomBoxBtn.style.background = this._zoomBoxActive ? styles_1.COLORS.overlay : styles_1.COLORS.bgSurface1;
            this._canvasContainer.style.cursor = this._zoomBoxActive ? 'crosshair' : 'default';
        });
        viewBar.appendChild(this._zoomBoxBtn);
        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.textContent = 'Reset';
        zoomResetBtn.style.cssText = (0, styles_1.btnStyle)();
        zoomResetBtn.addEventListener('click', () => this._resetZoom());
        viewBar.appendChild(zoomResetBtn);
        // Spectrogram canvas
        this._canvasContainer = document.createElement('div');
        this._canvasContainer.style.cssText =
            `flex:0 0 260px;position:relative;background:${styles_1.COLORS.bgCrust};overflow:hidden;cursor:default;`;
        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
        this._canvas.tabIndex = 0; // make focusable for keyboard events
        this._canvas.style.outline = 'none';
        this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
        this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
        this._canvas.addEventListener('mouseup', e => this._onCanvasMouseUp(e));
        this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseLeave());
        // Note: no wheel zoom — two-finger trackpad scroll should not zoom the spectrogram
        this._canvas.addEventListener('keydown', e => this._onCanvasKeyDown(e));
        this._canvasContainer.appendChild(this._canvas);
        // Playback bar
        const playBar = document.createElement('div');
        playBar.style.cssText = (0, styles_1.barTopBottomStyle)();
        this._playBtn = document.createElement('button');
        this._playBtn.textContent = '▶';
        this._playBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:15px;width:34px;height:28px;`;
        this._playBtn.addEventListener('click', () => this._togglePlay());
        this._timeDisplay = document.createElement('span');
        this._timeDisplay.style.cssText = (0, styles_1.monoTextStyle)();
        this._timeDisplay.textContent = '0:00.00 / 0:00.00';
        this._signalTimeDisplay = document.createElement('span');
        this._signalTimeDisplay.style.cssText =
            `margin-left:auto;font-size:11px;color:${styles_1.COLORS.mauve};font-family:ui-monospace,monospace;`;
        this._signalTimeDisplay.textContent = '';
        playBar.append(this._playBtn, this._timeDisplay, this._signalTimeDisplay);
        // Hidden audio element
        this._audio = document.createElement('audio');
        this._audio.style.display = 'none';
        this._audio.addEventListener('ended', () => {
            this._playing = false;
            cancelAnimationFrame(this._rafId);
            this._playBtn.textContent = '▶';
            this._renderFrame();
        });
        // Assemble
        this.element.append(playerCtrls, viewBar, this._canvasContainer, playBar, this._audio);
    }
    // ─── Private: audio loading ────────────────────────────────
    /**
     * Apply prefix/suffix to a raw audio path based on the audio type.
     * - path/url: join with '/'
     * - url prefix: insert after protocol (e.g. s3://prefix/rest)
     */
    _applyPrefixSuffix(raw) {
        const { prefix, suffix, type } = this._audioConfig;
        if (!prefix && !suffix)
            return raw;
        if (type === 'url' || raw.match(/^(https?|s3|gs):\/\//)) {
            const m = raw.match(/^(https?:\/\/|s3:\/\/|gs:\/\/)(.*)/);
            if (m) {
                let rest = m[2];
                if (prefix)
                    rest = prefix + '/' + rest;
                if (suffix)
                    rest = rest + '/' + suffix;
                return m[1] + rest;
            }
        }
        let result = raw;
        if (prefix)
            result = prefix + '/' + result;
        if (suffix)
            result = result + '/' + suffix;
        return result;
    }
    _resolveAudioPath() {
        const { type, value, fallback } = this._audioConfig;
        if (type === 'column') {
            // Read the column value from the current row
            if (this._currentRow) {
                const colVal = this._currentRow[value];
                if (colVal != null && String(colVal).trim()) {
                    return this._applyPrefixSuffix(String(colVal));
                }
            }
            // Fallback (already a complete path — no prefix/suffix)
            return fallback || '';
        }
        // path or url — apply prefix/suffix directly
        return this._applyPrefixSuffix(value);
    }
    async _loadAudio() {
        var _a, _b, _c, _d, _e, _f;
        const audioPath = this._resolveAudioPath();
        if (!audioPath) {
            this.statusChanged.emit({ message: '❌ No audio configured — set audio param', error: true });
            return;
        }
        // Disable Update button while loading
        this._loadBtn.disabled = true;
        this._loadBtn.textContent = 'Updating…';
        this._loadBtn.style.opacity = '0.4';
        // Stop any current playback
        if (this._playing) {
            this._audio.pause();
            this._playing = false;
            cancelAnimationFrame(this._rafId);
            this._playBtn.textContent = '▶';
        }
        const bufVal = parseFloat(this._bufferInput.value);
        this._bufferSec = Math.max(0, isNaN(bufVal) ? 0 : bufVal);
        const startTime = parseFloat(this._startInput.value) || 0;
        const endTime = parseFloat(this._endInput.value) || startTime + 12;
        const loadStart = Math.max(0, startTime - this._bufferSec);
        const loadDur = (endTime + this._bufferSec) - loadStart;
        this._detectionStart = startTime;
        this._detectionEnd = endTime;
        this._segLoadStart = loadStart;
        // Show contextual loading message
        const isUrl = audioPath.startsWith('http://') || audioPath.startsWith('https://');
        const isS3 = audioPath.startsWith('s3://');
        const isGcs = audioPath.startsWith('gs://');
        const loadMsg = isUrl
            ? '⬇ Downloading audio (first load may take a moment)…'
            : isS3
                ? '⬇ Loading audio from S3…'
                : isGcs
                    ? '⬇ Loading audio from GCS…'
                    : 'Loading audio…';
        this.statusChanged.emit({ message: loadMsg, error: false });
        let result;
        try {
            const vizIdx = parseInt(this._spectTypeSelect.value) || 0;
            const viz = (_a = this._vizMeta[vizIdx]) !== null && _a !== void 0 ? _a : this._vizMeta[0];
            const resW = parseInt(this._resolutionSelect.value) || 2000;
            const raw = await this._kernel.exec((0, python_1.spectrogramPipeline)(audioPath, loadStart, loadDur, viz.type === 'custom' ? 'custom' : 'builtin', viz.key, viz.index, resW));
            result = JSON.parse(raw);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ ${String((_b = e.message) !== null && _b !== void 0 ? _b : e)}`, error: true });
            this._enableLoadBtn();
            return;
        }
        this._segDuration = result.duration;
        this._sampleRate = result.sample_rate;
        this._freqMin = result.freq_min;
        this._freqMax = result.freq_max;
        this._currentFreqScale = (_c = result.freq_scale) !== null && _c !== void 0 ? _c : 'linear';
        this._freqScaleLUT = (_d = result.freq_scale_lut) !== null && _d !== void 0 ? _d : null;
        this.statusChanged.emit({ message: 'Decoding spectrogram…', error: false });
        try {
            const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'image/png' });
            if (this._specBitmap)
                this._specBitmap.close();
            this._specBitmap = await createImageBitmap(blob);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Image decode: ${String((_e = e.message) !== null && _e !== void 0 ? _e : e)}`, error: true });
            this._enableLoadBtn();
            return;
        }
        this._audio.src = `data:audio/wav;base64,${result.wav}`;
        this._audio.load();
        this._renderFrame();
        this._enableLoadBtn();
        const fname = (_f = audioPath.split('/').pop()) !== null && _f !== void 0 ? _f : audioPath;
        this.statusChanged.emit({
            message: `✓ ${fname}  ${(0, util_1.fmtTime)(loadStart)}–${(0, util_1.fmtTime)(loadStart + result.duration)}`,
            error: false,
        });
    }
    _enableLoadBtn() {
        this._loadBtn.disabled = false;
        this._loadBtn.textContent = 'Update';
        this._loadBtn.style.opacity = '1';
    }
    _renderFrame() {
        const ctx = this._canvas.getContext('2d');
        if (!ctx)
            return;
        const W = this._canvas.width, H = this._canvas.height;
        if (!W || !H)
            return;
        const padY = Player.SPEC_PAD_Y;
        // Fill padding areas with dark background
        ctx.fillStyle = styles_1.COLORS.bgCrust;
        ctx.fillRect(0, 0, W, padY);
        ctx.fillRect(0, H - padY, W, padY);
        if (this._specBitmap) {
            // Client-side zoom: draw only the visible portion of the spectrogram
            const bw = this._specBitmap.width;
            const bh = this._specBitmap.height;
            const sx = this._viewXMin * bw;
            const sw = (this._viewXMax - this._viewXMin) * bw;
            const sy = (1 - this._viewYMax) * bh;
            const sh = (this._viewYMax - this._viewYMin) * bh;
            ctx.drawImage(this._specBitmap, sx, sy, sw, sh, 0, padY, W, H - 2 * padY);
        }
        else {
            ctx.fillStyle = styles_1.COLORS.bgCrust;
            ctx.fillRect(0, 0, W, H);
        }
        if (this._specBitmap && this._segDuration > 0) {
            // Map detection bounds to the current view
            const detStartFrac = (this._detectionStart - this._segLoadStart) / this._segDuration;
            const detEndFrac = (this._detectionEnd - this._segLoadStart) / this._segDuration;
            const viewW = this._viewXMax - this._viewXMin;
            const toScreen = (frac) => ((frac - this._viewXMin) / viewW) * W;
            const bufLeft = toScreen(detStartFrac);
            const bufRight = toScreen(detEndFrac);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            if (bufLeft > 0)
                ctx.fillRect(0, 0, Math.floor(bufLeft), H);
            if (bufRight < W) {
                const rx = Math.ceil(bufRight);
                ctx.fillRect(rx, 0, W - rx, H);
            }
            // Playhead
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = Math.floor(Math.max(0, Math.min(W, toScreen(playFrac))));
            ctx.strokeStyle = `rgba(205,214,244,0.9)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ph, 0);
            ctx.lineTo(ph, H);
            ctx.stroke();
            ctx.fillStyle = styles_1.COLORS.textPrimary;
            ctx.beginPath();
            ctx.moveTo(ph - 6, 0);
            ctx.lineTo(ph + 6, 0);
            ctx.lineTo(ph, 11);
            ctx.closePath();
            ctx.fill();
        }
        this._renderAnnotation(ctx, W, H);
        this._renderFreqAxis(ctx, W, H);
        this._updateViewBoundsDisplay();
        const absNow = this._segLoadStart + this._audio.currentTime;
        const absEnd = this._segLoadStart + this._segDuration;
        this._timeDisplay.textContent = `${(0, util_1.fmtTime)(absNow)} / ${(0, util_1.fmtTime)(absEnd)}`;
    }
    _togglePlay() {
        if (!this._specBitmap)
            return;
        if (this._playing) {
            this._audio.pause();
            this._playing = false;
            cancelAnimationFrame(this._rafId);
            this._playBtn.textContent = '▶';
        }
        else {
            void this._audio.play();
            this._playing = true;
            this._playBtn.textContent = '⏸';
            const loop = () => {
                this._renderFrame();
                if (this._playing)
                    this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);
        }
    }
    // ─── Private: canvas mouse handlers ────────────────────────
    _canvasXY(e) {
        const rect = this._canvas.getBoundingClientRect();
        return {
            cx: (e.clientX - rect.left) * (this._canvas.width / rect.width),
            cy: (e.clientY - rect.top) * (this._canvas.height / rect.height),
        };
    }
    /** Like _canvasXY but clamped to canvas bounds. */
    _canvasXYClamped(e) {
        const rect = this._canvas.getBoundingClientRect();
        return {
            cx: Math.max(0, Math.min(this._canvas.width, (e.clientX - rect.left) * (this._canvas.width / rect.width))),
            cy: Math.max(0, Math.min(this._canvas.height, (e.clientY - rect.top) * (this._canvas.height / rect.height))),
        };
    }
    /** Convert absolute time to screen X, accounting for zoom. */
    _timeToX(t) {
        const frac = (t - this._segLoadStart) / this._segDuration;
        return ((frac - this._viewXMin) / (this._viewXMax - this._viewXMin)) * this._canvas.width;
    }
    /** Convert screen X to absolute time, accounting for zoom. */
    _xToTime(x) {
        const viewFrac = this._viewXMin + (x / this._canvas.width) * (this._viewXMax - this._viewXMin);
        return this._segLoadStart + viewFrac * this._segDuration;
    }
    /** Map frequency to 0..1 fraction based on the current freq scale. */
    _freqToFrac(f) {
        const fMin = this._freqMin, fMax = this._freqMax;
        if (this._currentFreqScale === 'mel') {
            const melMin = 2595 * Math.log10(1 + fMin / 700);
            const melMax = 2595 * Math.log10(1 + fMax / 700);
            const mel = 2595 * Math.log10(1 + f / 700);
            return (melMax - melMin) > 0 ? (mel - melMin) / (melMax - melMin) : 0;
        }
        else if (this._currentFreqScale === 'log') {
            const logMin = Math.log(Math.max(1, fMin));
            const logMax = Math.log(Math.max(1, fMax));
            return (logMax - logMin) > 0 ? (Math.log(Math.max(1, f)) - logMin) / (logMax - logMin) : 0;
        }
        else if (this._currentFreqScale === 'lut' && this._freqScaleLUT) {
            // Interpolate: frac value at position (f - fMin) / (fMax - fMin) in the LUT
            const pos = (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) * (this._freqScaleLUT.length - 1) : 0;
            const lo = Math.floor(pos), hi = Math.min(lo + 1, this._freqScaleLUT.length - 1);
            const t = pos - lo;
            return this._freqScaleLUT[lo] * (1 - t) + this._freqScaleLUT[hi] * t;
        }
        // linear (default)
        return (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) : 0;
    }
    /** Inverse: map 0..1 fraction to frequency based on the current freq scale. */
    _fracToFreq(frac) {
        const fMin = this._freqMin, fMax = this._freqMax;
        if (this._currentFreqScale === 'mel') {
            const melMin = 2595 * Math.log10(1 + fMin / 700);
            const melMax = 2595 * Math.log10(1 + fMax / 700);
            const mel = melMin + frac * (melMax - melMin);
            return 700 * (Math.pow(10, mel / 2595) - 1);
        }
        else if (this._currentFreqScale === 'log') {
            const logMin = Math.log(Math.max(1, fMin));
            const logMax = Math.log(Math.max(1, fMax));
            return Math.exp(logMin + frac * (logMax - logMin));
        }
        else if (this._currentFreqScale === 'lut' && this._freqScaleLUT) {
            // Binary search for the frac in the LUT, then interpolate freq
            const lut = this._freqScaleLUT;
            let lo = 0, hi = lut.length - 1;
            while (lo < hi - 1) {
                const mid = (lo + hi) >> 1;
                if (lut[mid] <= frac)
                    lo = mid;
                else
                    hi = mid;
            }
            const t = (lut[hi] - lut[lo]) > 0 ? (frac - lut[lo]) / (lut[hi] - lut[lo]) : 0;
            const pos = lo + t;
            return fMin + (pos / (lut.length - 1)) * (fMax - fMin);
        }
        // linear
        return fMin + frac * (fMax - fMin);
    }
    /** Convert frequency to screen Y, accounting for zoom and padding. */
    _freqToY(f) {
        const H = this._canvas.height;
        const padY = Player.SPEC_PAD_Y;
        const specH = H - 2 * padY;
        const frac = this._freqToFrac(f);
        const viewFrac = (frac - this._viewYMin) / (this._viewYMax - this._viewYMin);
        return padY + specH * (1 - viewFrac);
    }
    /** Convert screen Y to frequency, accounting for zoom and padding. */
    _yToFreq(y) {
        const H = this._canvas.height;
        const padY = Player.SPEC_PAD_Y;
        const specH = H - 2 * padY;
        const viewFrac = 1 - (y - padY) / specH;
        const frac = this._viewYMin + viewFrac * (this._viewYMax - this._viewYMin);
        return this._fracToFreq(frac);
    }
    _onCanvasMouseDown(e) {
        var _a, _b, _c, _d, _e, _f;
        // Zoom-box mode: draw a selection rectangle (tracked at document level)
        if (this._zoomBoxActive && this._specBitmap) {
            const { cx, cy } = this._canvasXYClamped(e);
            this._zoomBoxDrag = { startCx: cx, startCy: cy };
            // Attach document-level handlers so drag continues outside canvas
            this._zoomBoxMoveHandler = (ev) => this._onZoomBoxMove(ev);
            this._zoomBoxUpHandler = (ev) => this._onZoomBoxUp(ev);
            document.addEventListener('mousemove', this._zoomBoxMoveHandler);
            document.addEventListener('mouseup', this._zoomBoxUpHandler);
            return;
        }
        // Playhead drag: click near the playhead line or triangle to scrub
        if (this._specBitmap && this._segDuration > 0) {
            const { cx } = this._canvasXY(e);
            const W = this._canvas.width;
            const viewW = this._viewXMax - this._viewXMin;
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = ((playFrac - this._viewXMin) / viewW) * W;
            if (Math.abs(cx - ph) <= 10) {
                this._playheadDrag = true;
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
        }
        // Pan mode: when no annotation tool is active and zoomed in
        const ac = this._form.getAnnotConfig();
        const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
        if ((!ac || !this._form.getActiveTool()) && isZoomed && this._specBitmap) {
            this._panDrag = {
                startX: e.clientX, startY: e.clientY,
                origXMin: this._viewXMin, origXMax: this._viewXMax,
                origYMin: this._viewYMin, origYMax: this._viewYMax,
            };
            this._canvasContainer.style.cursor = 'grabbing';
            return;
        }
        if (!ac || !this._specBitmap || this._segDuration === 0)
            return;
        const { cx, cy } = this._canvasXY(e);
        const tool = this._form.getActiveTool();
        const GRAB = 10;
        if (tool === 'time_select') {
            this._form.setAnnotValue('startTime', this._xToTime(cx));
            this._annotDrag = { target: 'start' };
        }
        else if (tool === 'start_end_time_select') {
            const st = ((_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_b = ac.endTime) === null || _b === void 0 ? void 0 : _b.col) ? this._form.getFormValue(ac.endTime.col) : null;
            const sx = st != null ? this._timeToX(st) : -Infinity;
            const ex = et != null ? this._timeToX(et) : Infinity;
            if (Math.abs(cx - sx) <= GRAB && Math.abs(cx - sx) <= Math.abs(cx - ex)) {
                this._annotDrag = { target: 'start' };
            }
            else if (Math.abs(cx - ex) <= GRAB) {
                this._annotDrag = { target: 'end' };
            }
            else if (cx < (sx + ex) / 2) {
                this._form.setAnnotValue('startTime', this._xToTime(cx));
                this._annotDrag = { target: 'start' };
            }
            else {
                this._form.setAnnotValue('endTime', this._xToTime(cx));
                this._annotDrag = { target: 'end' };
            }
        }
        else if (tool === 'bounding_box') {
            const st = ((_c = ac.startTime) === null || _c === void 0 ? void 0 : _c.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_d = ac.endTime) === null || _d === void 0 ? void 0 : _d.col) ? this._form.getFormValue(ac.endTime.col) : null;
            const flo = ((_e = ac.minFreq) === null || _e === void 0 ? void 0 : _e.col) ? this._form.getFormValue(ac.minFreq.col) : null;
            const fhi = ((_f = ac.maxFreq) === null || _f === void 0 ? void 0 : _f.col) ? this._form.getFormValue(ac.maxFreq.col) : null;
            if (st != null && et != null && flo != null && fhi != null) {
                const sx = this._timeToX(st), ex = this._timeToX(et);
                const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
                const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
                const inX = cx >= sx - GRAB && cx <= ex + GRAB;
                if (inY && Math.abs(cx - sx) <= GRAB) {
                    this._annotDrag = { target: 'box-left' };
                    this._renderFrame();
                    this._updateAnnotDisplay();
                    return;
                }
                if (inY && Math.abs(cx - ex) <= GRAB) {
                    this._annotDrag = { target: 'box-right' };
                    this._renderFrame();
                    this._updateAnnotDisplay();
                    return;
                }
                if (inX && Math.abs(cy - yhi) <= GRAB) {
                    this._annotDrag = { target: 'box-top' };
                    this._renderFrame();
                    this._updateAnnotDisplay();
                    return;
                }
                if (inX && Math.abs(cy - ylo) <= GRAB) {
                    this._annotDrag = { target: 'box-bottom' };
                    this._renderFrame();
                    this._updateAnnotDisplay();
                    return;
                }
            }
            const t = this._xToTime(cx);
            const f = this._yToFreq(cy);
            this._form.setAnnotValue('startTime', t);
            this._form.setAnnotValue('endTime', t);
            this._form.setAnnotValue('minFreq', f);
            this._form.setAnnotValue('maxFreq', f);
            this._annotDrag = { target: 'box-corner', anchorTime: t, anchorFreq: f };
        }
        else if (tool === 'multibox') {
            const entries = this._form.getMultiboxEntries();
            // Hit test existing boxes (edges first, then interior)
            for (let i = entries.length - 1; i >= 0; i--) {
                const entry = entries[i];
                const sx = this._timeToX(entry.startTime), ex = this._timeToX(entry.endTime);
                const yhi = this._freqToY(entry.maxFreq), ylo = this._freqToY(entry.minFreq);
                const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
                const inX = cx >= sx - GRAB && cx <= ex + GRAB;
                if (inY && Math.abs(cx - sx) <= GRAB) {
                    this._form.setActiveBox(i);
                    this._annotDrag = { target: 'box-left', boxIndex: i };
                    this._renderFrame();
                    return;
                }
                if (inY && Math.abs(cx - ex) <= GRAB) {
                    this._form.setActiveBox(i);
                    this._annotDrag = { target: 'box-right', boxIndex: i };
                    this._renderFrame();
                    return;
                }
                if (inX && Math.abs(cy - yhi) <= GRAB) {
                    this._form.setActiveBox(i);
                    this._annotDrag = { target: 'box-top', boxIndex: i };
                    this._renderFrame();
                    return;
                }
                if (inX && Math.abs(cy - ylo) <= GRAB) {
                    this._form.setActiveBox(i);
                    this._annotDrag = { target: 'box-bottom', boxIndex: i };
                    this._renderFrame();
                    return;
                }
            }
            // Hit test interior (click to select)
            for (let i = entries.length - 1; i >= 0; i--) {
                const entry = entries[i];
                const sx = this._timeToX(entry.startTime), ex = this._timeToX(entry.endTime);
                const yhi = this._freqToY(entry.maxFreq), ylo = this._freqToY(entry.minFreq);
                if (cx >= sx && cx <= ex && cy >= yhi && cy <= ylo) {
                    this._form.setActiveBox(i);
                    this._renderFrame();
                    return;
                }
            }
            // No hit — start drawing a new box
            const t = this._xToTime(cx);
            const f = this._yToFreq(cy);
            this._annotDrag = { target: 'multibox-new', anchorTime: t, anchorFreq: f };
        }
        this._renderFrame();
        this._updateAnnotDisplay();
    }
    _onCanvasMouseMove(e) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        // Zoom-box is handled at document level — skip here
        if (this._zoomBoxDrag)
            return;
        // Handle playhead drag
        if (this._playheadDrag) {
            const { cx } = this._canvasXY(e);
            const W = this._canvas.width;
            const viewW = this._viewXMax - this._viewXMin;
            const frac = this._viewXMin + (cx / W) * viewW;
            const newTime = Math.max(0, Math.min(this._segDuration, frac * this._segDuration));
            this._audio.currentTime = newTime;
            this._renderFrame();
            return;
        }
        // Handle pan drag
        if (this._panDrag) {
            const rect = this._canvas.getBoundingClientRect();
            const dx = (e.clientX - this._panDrag.startX) / rect.width;
            const dy = (e.clientY - this._panDrag.startY) / rect.height;
            const viewW = this._panDrag.origXMax - this._panDrag.origXMin;
            const viewH = this._panDrag.origYMax - this._panDrag.origYMin;
            let newXMin = this._panDrag.origXMin - dx * viewW;
            let newYMin = this._panDrag.origYMin + dy * viewH; // inverted Y
            // Clamp
            newXMin = Math.max(0, Math.min(1 - viewW, newXMin));
            newYMin = Math.max(0, Math.min(1 - viewH, newYMin));
            this._viewXMin = newXMin;
            this._viewXMax = newXMin + viewW;
            this._viewYMin = newYMin;
            this._viewYMax = newYMin + viewH;
            this._renderFrame();
            return;
        }
        const ac = this._form.getAnnotConfig();
        if (!this._specBitmap || this._segDuration === 0)
            return;
        const { cx, cy } = this._canvasXY(e);
        if (!this._annotDrag) {
            // Check if hovering near the playhead
            const W = this._canvas.width;
            const viewW = this._viewXMax - this._viewXMin;
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = ((playFrac - this._viewXMin) / viewW) * W;
            if (Math.abs(cx - ph) <= 10) {
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
            if (ac) {
                this._updateAnnotCursor(cx, cy);
            }
            else {
                this._updateCursorForZoom();
            }
            return;
        }
        if (!ac)
            return;
        const t = Math.max(this._segLoadStart, Math.min(this._segLoadStart + this._segDuration, this._xToTime(cx)));
        const f = Math.max(0, this._yToFreq(Math.max(0, Math.min(this._canvas.height, cy))));
        const tgt = this._annotDrag.target;
        if (tgt === 'start') {
            const endCol = (_a = ac.endTime) === null || _a === void 0 ? void 0 : _a.col;
            const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
            if (this._form.getActiveTool() === 'start_end_time_select' && endVal != null) {
                this._form.setAnnotValue('startTime', Math.min(t, endVal));
            }
            else {
                this._form.setAnnotValue('startTime', t);
            }
        }
        else if (tgt === 'end') {
            const startCol = (_b = ac.startTime) === null || _b === void 0 ? void 0 : _b.col;
            const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
            if (startVal != null)
                this._form.setAnnotValue('endTime', Math.max(t, startVal));
        }
        else if (tgt === 'box-corner') {
            const at = (_c = this._annotDrag.anchorTime) !== null && _c !== void 0 ? _c : t;
            const af = (_d = this._annotDrag.anchorFreq) !== null && _d !== void 0 ? _d : f;
            this._form.setAnnotValue('startTime', Math.min(at, t));
            this._form.setAnnotValue('endTime', Math.max(at, t));
            this._form.setAnnotValue('minFreq', Math.min(af, f));
            this._form.setAnnotValue('maxFreq', Math.max(af, f));
        }
        else if (tgt === 'box-left') {
            const endCol = (_e = ac.endTime) === null || _e === void 0 ? void 0 : _e.col;
            const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
            if (endVal != null)
                this._form.setAnnotValue('startTime', Math.min(t, endVal));
        }
        else if (tgt === 'box-right') {
            const startCol = (_f = ac.startTime) === null || _f === void 0 ? void 0 : _f.col;
            const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
            if (startVal != null)
                this._form.setAnnotValue('endTime', Math.max(t, startVal));
        }
        else if (tgt === 'box-top') {
            const loCol = (_g = ac.minFreq) === null || _g === void 0 ? void 0 : _g.col;
            const loVal = loCol ? this._form.getFormValue(loCol) : 0;
            if (loVal != null)
                this._form.setAnnotValue('maxFreq', Math.max(f, loVal));
        }
        else if (tgt === 'box-bottom') {
            const hiCol = (_h = ac.maxFreq) === null || _h === void 0 ? void 0 : _h.col;
            const hiVal = hiCol ? this._form.getFormValue(hiCol) : Infinity;
            if (hiVal != null)
                this._form.setAnnotValue('minFreq', Math.min(f, hiVal));
        }
        else if (tgt === 'multibox-new') {
            // Drawing a new multibox — render preview
            // (committed on mouseup)
        }
        else if (tgt.startsWith('box-') && this._annotDrag.boxIndex != null) {
            const bi = this._annotDrag.boxIndex;
            const entry = this._form.getMultiboxEntries()[bi];
            if (entry) {
                if (tgt === 'box-left')
                    this._form.updateMultiboxBounds(bi, 'startTime', Math.min(t, entry.endTime));
                else if (tgt === 'box-right')
                    this._form.updateMultiboxBounds(bi, 'endTime', Math.max(t, entry.startTime));
                else if (tgt === 'box-top')
                    this._form.updateMultiboxBounds(bi, 'maxFreq', Math.max(f, entry.minFreq));
                else if (tgt === 'box-bottom')
                    this._form.updateMultiboxBounds(bi, 'minFreq', Math.min(f, entry.maxFreq));
            }
        }
        // Render multibox-new preview rectangle
        if (tgt === 'multibox-new' && this._annotDrag.anchorTime != null && this._annotDrag.anchorFreq != null) {
            this._renderFrame();
            const ctx2 = this._canvas.getContext('2d');
            if (ctx2) {
                const sx = this._timeToX(Math.min(this._annotDrag.anchorTime, t));
                const ex = this._timeToX(Math.max(this._annotDrag.anchorTime, t));
                const yhi = this._freqToY(Math.max(this._annotDrag.anchorFreq, f));
                const ylo = this._freqToY(Math.min(this._annotDrag.anchorFreq, f));
                ctx2.strokeStyle = styles_1.COLORS.textPrimary;
                ctx2.lineWidth = 1.5;
                ctx2.setLineDash([4, 4]);
                ctx2.strokeRect(sx, yhi, ex - sx, ylo - yhi);
                ctx2.setLineDash([]);
            }
            this._updateAnnotDisplay();
            return;
        }
        this._renderFrame();
        this._updateAnnotDisplay();
    }
    _onCanvasMouseLeave() {
        // Cancel pan, playhead, and annotation drags, but NOT zoom-box
        if (!this._zoomBoxDrag) {
            this._panDrag = null;
            this._playheadDrag = false;
            this._annotDrag = null;
            if (this._specBitmap)
                this._renderFrame();
        }
    }
    _onCanvasMouseUp(e) {
        var _a;
        if (this._playheadDrag) {
            this._playheadDrag = false;
            this._updateCursorForZoom();
            return;
        }
        // Zoom-box is handled at document level
        if (this._panDrag) {
            this._panDrag = null;
            this._updateCursorForZoom();
            return;
        }
        // Commit new multibox on release
        if (((_a = this._annotDrag) === null || _a === void 0 ? void 0 : _a.target) === 'multibox-new' && e) {
            const { cx, cy } = this._canvasXY(e);
            const at = this._annotDrag.anchorTime;
            const af = this._annotDrag.anchorFreq;
            const t = this._xToTime(cx);
            const f = this._yToFreq(cy);
            const tMin = Math.min(at, t), tMax = Math.max(at, t);
            const fMin = Math.min(af, f), fMax = Math.max(af, f);
            // Only add if box is large enough
            if (Math.abs(this._timeToX(tMax) - this._timeToX(tMin)) > 5 &&
                Math.abs(this._freqToY(fMax) - this._freqToY(fMin)) > 5) {
                this._form.addMultiboxEntry(tMin, tMax, fMin, fMax);
            }
        }
        this._annotDrag = null;
        this._renderFrame();
    }
    _updateAnnotCursor(cx, cy) {
        var _a, _b, _c, _d, _e, _f, _g;
        const ac = this._form.getAnnotConfig();
        if (!ac)
            return;
        const GRAB = 10;
        const tool = this._form.getActiveTool();
        if (tool === 'time_select') {
            const st = ((_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col) ? this._form.getFormValue(ac.startTime.col) : null;
            if (st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) {
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
        }
        else if (tool === 'start_end_time_select') {
            const st = ((_b = ac.startTime) === null || _b === void 0 ? void 0 : _b.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_c = ac.endTime) === null || _c === void 0 ? void 0 : _c.col) ? this._form.getFormValue(ac.endTime.col) : null;
            if ((st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) ||
                (et != null && Math.abs(cx - this._timeToX(et)) <= GRAB)) {
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
        }
        else if (tool === 'bounding_box') {
            const st = ((_d = ac.startTime) === null || _d === void 0 ? void 0 : _d.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_e = ac.endTime) === null || _e === void 0 ? void 0 : _e.col) ? this._form.getFormValue(ac.endTime.col) : null;
            const flo = ((_f = ac.minFreq) === null || _f === void 0 ? void 0 : _f.col) ? this._form.getFormValue(ac.minFreq.col) : null;
            const fhi = ((_g = ac.maxFreq) === null || _g === void 0 ? void 0 : _g.col) ? this._form.getFormValue(ac.maxFreq.col) : null;
            if (st != null && et != null && flo != null && fhi != null) {
                const sx = this._timeToX(st), ex = this._timeToX(et);
                const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
                const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
                const inX = cx >= sx - GRAB && cx <= ex + GRAB;
                if (inY && (Math.abs(cx - sx) <= GRAB || Math.abs(cx - ex) <= GRAB)) {
                    this._canvasContainer.style.cursor = 'ew-resize';
                    return;
                }
                if (inX && (Math.abs(cy - yhi) <= GRAB || Math.abs(cy - ylo) <= GRAB)) {
                    this._canvasContainer.style.cursor = 'ns-resize';
                    return;
                }
            }
        }
        this._canvasContainer.style.cursor = 'crosshair';
    }
    _updateAnnotDisplay() {
        var _a, _b, _c, _d;
        const ac = this._form.getAnnotConfig();
        if (!ac)
            return;
        const parts = [];
        const st = ((_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col) ? this._form.getFormValue(ac.startTime.col) : null;
        const et = ((_b = ac.endTime) === null || _b === void 0 ? void 0 : _b.col) ? this._form.getFormValue(ac.endTime.col) : null;
        if (st != null)
            parts.push((0, util_1.fmtTime)(st));
        if (et != null)
            parts.push(`– ${(0, util_1.fmtTime)(et)}`);
        const flo = ((_c = ac.minFreq) === null || _c === void 0 ? void 0 : _c.col) ? this._form.getFormValue(ac.minFreq.col) : null;
        const fhi = ((_d = ac.maxFreq) === null || _d === void 0 ? void 0 : _d.col) ? this._form.getFormValue(ac.maxFreq.col) : null;
        if (flo != null && fhi != null)
            parts.push(`${Math.round(flo)}–${Math.round(fhi)} Hz`);
        this._signalTimeDisplay.textContent = parts.length ? `⏱ ${parts.join(' ')}` : '';
    }
    _renderAnnotation(ctx, W, H) {
        var _a, _b, _c, _d, _e, _f, _g;
        const ac = this._form.getAnnotConfig();
        if (!ac || this._segDuration === 0)
            return;
        const tool = this._form.getActiveTool();
        if (tool === 'time_select') {
            const st = ((_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col) ? this._form.getFormValue(ac.startTime.col) : null;
            if (st == null)
                return;
            const x = this._timeToX(st);
            ctx.strokeStyle = 'rgba(137,180,250,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
            ctx.fillStyle = styles_1.COLORS.blue;
            ctx.beginPath();
            ctx.moveTo(x - 6, 0);
            ctx.lineTo(x + 6, 0);
            ctx.lineTo(x, 10);
            ctx.closePath();
            ctx.fill();
        }
        else if (tool === 'start_end_time_select') {
            const st = ((_b = ac.startTime) === null || _b === void 0 ? void 0 : _b.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_c = ac.endTime) === null || _c === void 0 ? void 0 : _c.col) ? this._form.getFormValue(ac.endTime.col) : null;
            if (st != null && et != null) {
                const sx = this._timeToX(st), ex = this._timeToX(et);
                ctx.fillStyle = 'rgba(137,180,250,0.08)';
                ctx.fillRect(sx, 0, ex - sx, H);
            }
            if (st != null) {
                const x = this._timeToX(st);
                ctx.strokeStyle = 'rgba(166,227,161,0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
                ctx.stroke();
                ctx.fillStyle = styles_1.COLORS.green;
                ctx.beginPath();
                ctx.moveTo(x - 6, 0);
                ctx.lineTo(x + 6, 0);
                ctx.lineTo(x, 10);
                ctx.closePath();
                ctx.fill();
            }
            if (et != null) {
                const x = this._timeToX(et);
                ctx.strokeStyle = 'rgba(243,139,168,0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
                ctx.stroke();
                ctx.fillStyle = styles_1.COLORS.red;
                ctx.beginPath();
                ctx.moveTo(x - 6, 0);
                ctx.lineTo(x + 6, 0);
                ctx.lineTo(x, 10);
                ctx.closePath();
                ctx.fill();
            }
        }
        else if (tool === 'bounding_box') {
            const st = ((_d = ac.startTime) === null || _d === void 0 ? void 0 : _d.col) ? this._form.getFormValue(ac.startTime.col) : null;
            const et = ((_e = ac.endTime) === null || _e === void 0 ? void 0 : _e.col) ? this._form.getFormValue(ac.endTime.col) : null;
            const flo = ((_f = ac.minFreq) === null || _f === void 0 ? void 0 : _f.col) ? this._form.getFormValue(ac.minFreq.col) : null;
            const fhi = ((_g = ac.maxFreq) === null || _g === void 0 ? void 0 : _g.col) ? this._form.getFormValue(ac.maxFreq.col) : null;
            if (st == null || et == null || flo == null || fhi == null)
                return;
            const sx = this._timeToX(st), ex = this._timeToX(et);
            const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
            ctx.fillStyle = 'rgba(137,180,250,0.1)';
            ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
            ctx.strokeStyle = 'rgba(137,180,250,0.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
            ctx.fillStyle = styles_1.COLORS.blue;
            for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        else if (tool === 'multibox') {
            const entries = this._form.getMultiboxEntries();
            const activeIdx = this._form.getActiveBoxIndex();
            entries.forEach((entry, i) => {
                const sx = this._timeToX(entry.startTime);
                const ex = this._timeToX(entry.endTime);
                const yhi = this._freqToY(entry.maxFreq);
                const ylo = this._freqToY(entry.minFreq);
                const isActive = i === activeIdx;
                // Fill
                ctx.fillStyle = isActive ? `${entry.color}20` : `${entry.color}0a`;
                ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
                // Border
                ctx.strokeStyle = entry.color;
                ctx.lineWidth = isActive ? 2.5 : 1;
                if (!isActive)
                    ctx.setLineDash([4, 4]);
                ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
                ctx.setLineDash([]);
                // Corner handles on active box
                if (isActive) {
                    ctx.fillStyle = entry.color;
                    for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
                        ctx.beginPath();
                        ctx.arc(px, py, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
        }
    }
    // ─── Private: frequency axis ─────────────────────────────────
    _renderFreqAxis(ctx, _W, H) {
        if (!this._specBitmap || this._freqMax <= this._freqMin)
            return;
        const AXIS_W = 40;
        const FONT_SIZE = 10;
        const TICK_LEN = 4;
        const padY = Player.SPEC_PAD_Y;
        const specH = H - 2 * padY;
        // Background strip
        ctx.fillStyle = 'rgba(17,17,27,0.75)';
        ctx.fillRect(0, 0, AXIS_W, H);
        // Compute visible freq range
        const fMin = this._freqMin + this._viewYMin * (this._freqMax - this._freqMin);
        const fMax = this._freqMin + this._viewYMax * (this._freqMax - this._freqMin);
        const fRange = fMax - fMin;
        // Choose nice tick interval (in Hz)
        const targetTicks = Math.max(2, Math.floor(specH / 40));
        let tickInterval = fRange / targetTicks;
        const mag = Math.pow(10, Math.floor(Math.log10(tickInterval)));
        const norm = tickInterval / mag;
        if (norm < 1.5)
            tickInterval = mag;
        else if (norm < 3.5)
            tickInterval = 2 * mag;
        else if (norm < 7.5)
            tickInterval = 5 * mag;
        else
            tickInterval = 10 * mag;
        const firstTick = Math.ceil(fMin / tickInterval) * tickInterval;
        ctx.fillStyle = styles_1.COLORS.textSubtle;
        ctx.strokeStyle = styles_1.COLORS.textMuted;
        ctx.lineWidth = 1;
        ctx.font = `${FONT_SIZE}px ui-monospace, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let f = firstTick; f <= fMax; f += tickInterval) {
            // Use _freqToY for correct positioning on mel/log/lut scales
            const y = this._freqToY(f);
            // Tick mark
            ctx.beginPath();
            ctx.moveTo(AXIS_W - TICK_LEN, y);
            ctx.lineTo(AXIS_W, y);
            ctx.stroke();
            // Label in kHz (use integer when possible)
            const khz = f / 1000;
            const label = Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
            ctx.fillText(label, AXIS_W - TICK_LEN - 2, y);
        }
        // "kHz" unit label at top-left
        ctx.fillStyle = styles_1.COLORS.textMuted;
        ctx.font = `${FONT_SIZE - 1}px ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.fillText('kHz', 2, FONT_SIZE);
    }
    // ─── Private: zoom + pan ────────────────────────────────────
    // ─── Zoom-box (document-level drag) ─────────────────────────
    _onZoomBoxMove(e) {
        if (!this._zoomBoxDrag)
            return;
        const { cx, cy } = this._canvasXYClamped(e);
        this._renderFrame();
        const ctx = this._canvas.getContext('2d');
        if (ctx) {
            const x = Math.min(this._zoomBoxDrag.startCx, cx);
            const y = Math.min(this._zoomBoxDrag.startCy, cy);
            const w = Math.abs(cx - this._zoomBoxDrag.startCx);
            const h = Math.abs(cy - this._zoomBoxDrag.startCy);
            ctx.strokeStyle = styles_1.COLORS.blue;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(137,180,250,0.1)';
            ctx.fillRect(x, y, w, h);
        }
    }
    _onZoomBoxUp(e) {
        // Clean up document listeners
        if (this._zoomBoxMoveHandler)
            document.removeEventListener('mousemove', this._zoomBoxMoveHandler);
        if (this._zoomBoxUpHandler)
            document.removeEventListener('mouseup', this._zoomBoxUpHandler);
        this._zoomBoxMoveHandler = null;
        this._zoomBoxUpHandler = null;
        if (!this._zoomBoxDrag)
            return;
        const { cx, cy } = this._canvasXYClamped(e);
        const W = this._canvas.width, H = this._canvas.height;
        const x1 = Math.min(this._zoomBoxDrag.startCx, cx) / W;
        const x2 = Math.max(this._zoomBoxDrag.startCx, cx) / W;
        const y1 = Math.min(this._zoomBoxDrag.startCy, cy) / H;
        const y2 = Math.max(this._zoomBoxDrag.startCy, cy) / H;
        this._zoomBoxDrag = null;
        // Only zoom if the box is large enough
        if ((x2 - x1) > 0.02 && (y2 - y1) > 0.02) {
            const vw = this._viewXMax - this._viewXMin;
            const vh = this._viewYMax - this._viewYMin;
            this._viewXMin = this._viewXMin + x1 * vw;
            this._viewXMax = this._viewXMin + (x2 - x1) * vw;
            // Y inverted (top of canvas = high freq)
            const newYMax = this._viewYMin + (1 - y1) * vh;
            const newYMin = this._viewYMin + (1 - y2) * vh;
            this._viewYMin = newYMin;
            this._viewYMax = newYMax;
        }
        // Deactivate zoom-box tool
        this._zoomBoxActive = false;
        this._zoomBoxBtn.style.background = styles_1.COLORS.bgSurface1;
        this._updateCursorForZoom();
        this._renderFrame();
    }
    // ─── Private: zoom + pan ────────────────────────────────────
    _onCanvasKeyDown(e) {
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            this._zoomBy(0.8);
        }
        else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            this._zoomBy(1.25);
        }
        else if (e.key === '0') {
            e.preventDefault();
            this._resetZoom();
        }
        else if (e.key === ' ') {
            e.preventDefault();
            if (e.shiftKey) {
                // Shift+Space: play from beginning
                this._audio.currentTime = 0;
                if (!this._playing)
                    this._togglePlay();
                this._renderFrame();
            }
            else {
                this._togglePlay();
            }
        }
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
            if (isZoomed) {
                e.preventDefault();
                const step = 0.1;
                const vw = this._viewXMax - this._viewXMin;
                const vh = this._viewYMax - this._viewYMin;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowLeft')
                    dx = -step * vw;
                if (e.key === 'ArrowRight')
                    dx = step * vw;
                if (e.key === 'ArrowUp')
                    dy = step * vh;
                if (e.key === 'ArrowDown')
                    dy = -step * vh;
                this._viewXMin = Math.max(0, Math.min(1 - vw, this._viewXMin + dx));
                this._viewXMax = this._viewXMin + vw;
                this._viewYMin = Math.max(0, Math.min(1 - vh, this._viewYMin + dy));
                this._viewYMax = this._viewYMin + vh;
                this._renderFrame();
            }
        }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && this._form.isMultiboxMode()) {
            e.preventDefault();
            this._form.removeActiveMultiboxEntry();
            this._renderFrame();
        }
    }
    /**
     * Zoom the view by a factor, centered on (cx, cy) in view fraction space.
     * factor < 1 = zoom in, factor > 1 = zoom out.
     * cx, cy default to center of current view.
     */
    _zoomBy(factor, cx, cy) {
        const viewW = this._viewXMax - this._viewXMin;
        const viewH = this._viewYMax - this._viewYMin;
        // Default center
        const centerX = cx !== undefined ? this._viewXMin + cx * viewW : (this._viewXMin + this._viewXMax) / 2;
        const centerY = cy !== undefined ? this._viewYMin + cy * viewH : (this._viewYMin + this._viewYMax) / 2;
        const newW = Math.min(1, viewW * factor);
        const newH = Math.min(1, viewH * factor);
        let newXMin = centerX - newW * ((centerX - this._viewXMin) / viewW);
        let newYMin = centerY - newH * ((centerY - this._viewYMin) / viewH);
        // Clamp to 0..1
        newXMin = Math.max(0, Math.min(1 - newW, newXMin));
        newYMin = Math.max(0, Math.min(1 - newH, newYMin));
        this._viewXMin = newXMin;
        this._viewXMax = newXMin + newW;
        this._viewYMin = newYMin;
        this._viewYMax = newYMin + newH;
        this._updateCursorForZoom();
        this._renderFrame();
    }
    _resetZoom() {
        this._viewXMin = 0;
        this._viewXMax = 1;
        this._viewYMin = 0;
        this._viewYMax = 1;
        this._updateCursorForZoom();
        this._renderFrame();
    }
    _updateCursorForZoom() {
        const ac = this._form.getAnnotConfig();
        const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
        if (ac && this._form.getActiveTool()) {
            this._canvasContainer.style.cursor = 'crosshair';
        }
        else {
            this._canvasContainer.style.cursor = isZoomed ? 'grab' : 'default';
        }
    }
    _updateViewBoundsDisplay() {
        if (this._segDuration === 0)
            return;
        const tMin = this._segLoadStart + this._viewXMin * this._segDuration;
        const tMax = this._segLoadStart + this._viewXMax * this._segDuration;
        const fMin = this._viewYMin * (this._freqMax - this._freqMin) + this._freqMin;
        const fMax = this._viewYMax * (this._freqMax - this._freqMin) + this._freqMin;
        // Only update inputs that aren't focused (avoid overwriting user edits)
        if (document.activeElement !== this._viewTimeMinDisplay)
            this._viewTimeMinDisplay.value = tMin.toFixed(2);
        if (document.activeElement !== this._viewTimeMaxDisplay)
            this._viewTimeMaxDisplay.value = tMax.toFixed(2);
        if (document.activeElement !== this._viewFreqMinDisplay)
            this._viewFreqMinDisplay.value = (fMin / 1000).toFixed(1);
        if (document.activeElement !== this._viewFreqMaxDisplay)
            this._viewFreqMaxDisplay.value = (fMax / 1000).toFixed(1);
    }
    _rebuildResolutionSelect() {
        this._resolutionSelect.innerHTML = '';
        let hasSelected = false;
        this._specResolutions.forEach(raw => {
            const isDefault = String(raw).startsWith('selected::');
            const val = String(raw).replace(/^selected::/, '');
            const o = document.createElement('option');
            o.value = val;
            o.textContent = `${val}px`;
            if (isDefault) {
                o.selected = true;
                hasSelected = true;
            }
            this._resolutionSelect.appendChild(o);
        });
        // If nothing was marked selected, default to the middle option
        if (!hasSelected && this._resolutionSelect.options.length > 0) {
            const mid = Math.min(1, this._resolutionSelect.options.length - 1);
            this._resolutionSelect.options[mid].selected = true;
        }
    }
    _rebuildVizSelect() {
        this._spectTypeSelect.innerHTML = '';
        this._vizMeta.forEach((v, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = v.label;
            if (i === 0)
                o.selected = true;
            this._spectTypeSelect.appendChild(o);
        });
    }
    // ─── Private: capture ──────────────────────────────────────
    _buildCaptureFilename() {
        const row = this._currentRow;
        if (!row)
            return 'spectrogram.png';
        const parts = [];
        if (this._identCol && row[this._identCol] !== undefined) {
            parts.push(String(row[this._identCol]));
        }
        for (const col of this._displayCols) {
            if (row[col] !== undefined) {
                const v = typeof row[col] === 'number' && !Number.isInteger(row[col])
                    ? row[col].toFixed(3) : String(row[col]);
                parts.push(`${col}_${v}`);
            }
        }
        if (!parts.length)
            parts.push(`clip_${row.id}`);
        return parts.join('.')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[:.]+/g, '_')
            .replace(/[^a-z0-9._-]/g, '') + '.png';
    }
    async _onCapture() {
        var _a;
        if (!this._specBitmap)
            return;
        const defaultName = this._buildCaptureFilename();
        const suggested = this._captureDir
            ? `${this._captureDir}/${defaultName}` : defaultName;
        const filename = prompt('Save spectrogram as:', suggested);
        if (!filename)
            return;
        // Output matches the display aspect ratio at the bitmap's horizontal resolution
        const bw = this._specBitmap.width;
        const bh = this._specBitmap.height;
        const sx = this._viewXMin * bw;
        const sw = (this._viewXMax - this._viewXMin) * bw;
        const sy = (1 - this._viewYMax) * bh;
        const sh = (this._viewYMax - this._viewYMin) * bh;
        const W = Math.round(sw);
        const displayAspect = this._canvas.height / Math.max(1, this._canvas.width);
        const H = Math.round(W * displayAspect);
        if (W <= 0 || H <= 0) {
            this.statusChanged.emit({ message: '❌ Capture failed: zoom region too small', error: true });
            return;
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = W;
        offscreen.height = H;
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
            this.statusChanged.emit({ message: '❌ Capture failed: could not create canvas', error: true });
            return;
        }
        ctx.drawImage(this._specBitmap, sx, sy, sw, sh, 0, 0, W, H);
        if (this._segDuration > 0) {
            const viewW = this._viewXMax - this._viewXMin;
            const toScreen = (frac) => ((frac - this._viewXMin) / viewW) * W;
            const dsf = (this._detectionStart - this._segLoadStart) / this._segDuration;
            const def = (this._detectionEnd - this._segLoadStart) / this._segDuration;
            const bufLeft = toScreen(dsf);
            const bufRight = toScreen(def);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            if (bufLeft > 0)
                ctx.fillRect(0, 0, Math.floor(bufLeft), H);
            if (bufRight < W) {
                const rx = Math.ceil(bufRight);
                ctx.fillRect(rx, 0, W - rx, H);
            }
        }
        this._renderAnnotation(ctx, W, H);
        let dataUrl;
        try {
            dataUrl = offscreen.toDataURL('image/png');
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Capture failed: image too large to encode`, error: true });
            return;
        }
        const b64 = dataUrl.split(',')[1];
        if (!b64) {
            this.statusChanged.emit({ message: '❌ Capture failed: image too large to encode', error: true });
            return;
        }
        try {
            await this._kernel.exec((0, python_1.savePng)(filename, b64));
            this.statusChanged.emit({ message: `✓ Saved ${filename}`, error: false });
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Save failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
        }
    }
}
exports.Player = Player;
/** Vertical padding (px) at top/bottom of canvas for freq axis labels. */
Player.SPEC_PAD_Y = 8;


/***/ },

/***/ "./lib/styles.js"
/*!***********************!*\
  !*** ./lib/styles.js ***!
  \***********************/
(__unused_webpack_module, exports) {


/**
 * Styling helpers for the BioacousticWidget.
 *
 * All inline CSS strings and the color palette live here so the main widget
 * file focuses on behavior, not presentation.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.injectGlobalStyles = exports.cssSize = exports.filterChipDismissStyle = exports.filterChipStyle = exports.fullWidthDividerStyle = exports.dividerStyle = exports.formRowStyle = exports.mutedTextStyle = exports.monoTextStyle = exports.sectionTitleStyle = exports.formLabelStyle = exports.smallLabelStyle = exports.barTopBottomStyle = exports.barBottomStyle = exports.barStyle = exports.btnStyle = exports.labelStyle = exports.selectStyle = exports.inputStyle = exports.DISPLAY_CHIP_COLORS = exports.COLORS = void 0;
// ─── Color palette (Catppuccin Mocha) ─────────────────────────
exports.COLORS = {
    // Backgrounds
    bgBase: '#1e1e2e',
    bgMantle: '#181825',
    bgCrust: '#11111b',
    bgSurface0: '#313244',
    bgSurface1: '#45475a',
    bgSurface2: '#585b70',
    bgAltRow: '#252538',
    bgHover: '#2a2a3d',
    bgSelected: '#2d3f5e',
    bgReviewed: '#1a2a1a',
    // Text
    textPrimary: '#cdd6f4',
    textSubtle: '#a6adc8',
    textMuted: '#6c7086',
    // Accents
    blue: '#89b4fa',
    green: '#a6e3a1',
    red: '#f38ba8',
    peach: '#fab387',
    mauve: '#cba6f7',
    sky: '#89dceb',
    yellow: '#f9e2af',
    teal: '#94e2d5',
    pinkRose: '#eba0ac',
    sapphire: '#74c7ec',
    lavender: '#b4befe',
    pink: '#f5c2e7',
    overlay: '#bac2de',
    flamingo: '#f2cdcd',
};
exports.DISPLAY_CHIP_COLORS = [
    exports.COLORS.green, exports.COLORS.mauve, exports.COLORS.peach, exports.COLORS.sky, exports.COLORS.red,
];
// ─── CSS helper functions ─────────────────────────────────────
const inputStyle = (w = '80px') => `background:${exports.COLORS.bgSurface0};border:1px solid ${exports.COLORS.bgSurface1};border-radius:4px;color:${exports.COLORS.textPrimary};` +
    `padding:3px 6px;font-size:12px;width:${w};box-sizing:border-box;`;
exports.inputStyle = inputStyle;
const selectStyle = () => `background:${exports.COLORS.bgSurface0};border:1px solid ${exports.COLORS.bgSurface1};border-radius:4px;color:${exports.COLORS.textPrimary};` +
    `padding:3px 5px;font-size:12px;`;
exports.selectStyle = selectStyle;
const labelStyle = () => `display:flex;align-items:center;gap:5px;color:${exports.COLORS.textSubtle};font-size:11px;white-space:nowrap;`;
exports.labelStyle = labelStyle;
const btnStyle = (primary = false) => primary
    ? `background:${exports.COLORS.blue};border:none;border-radius:4px;color:${exports.COLORS.bgBase};padding:4px 12px;` +
        `font-size:12px;cursor:pointer;font-weight:700;`
    : `background:${exports.COLORS.bgSurface1};border:none;border-radius:4px;color:${exports.COLORS.textPrimary};padding:4px 10px;` +
        `font-size:12px;cursor:pointer;`;
exports.btnStyle = btnStyle;
const barStyle = () => `display:flex;align-items:center;gap:8px;padding:6px 12px;` +
    `background:${exports.COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;`;
exports.barStyle = barStyle;
const barBottomStyle = () => (0, exports.barStyle)() + `border-bottom:1px solid ${exports.COLORS.bgSurface0};`;
exports.barBottomStyle = barBottomStyle;
const barTopBottomStyle = () => (0, exports.barStyle)() +
    `border-top:1px solid ${exports.COLORS.bgSurface0};border-bottom:1px solid ${exports.COLORS.bgSurface0};`;
exports.barTopBottomStyle = barTopBottomStyle;
// ─── Label / text helpers ─────────────────────────────────────
const smallLabelStyle = () => `color:${exports.COLORS.textSubtle};font-size:11px;white-space:nowrap;flex-shrink:0;`;
exports.smallLabelStyle = smallLabelStyle;
const formLabelStyle = (fontSize = 13) => (0, exports.labelStyle)() + `font-size:${fontSize}px;gap:7px;`;
exports.formLabelStyle = formLabelStyle;
const sectionTitleStyle = () => `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${exports.COLORS.textMuted};`;
exports.sectionTitleStyle = sectionTitleStyle;
const monoTextStyle = () => `font-variant-numeric:tabular-nums;font-size:11px;color:${exports.COLORS.textSubtle};` +
    `font-family:ui-monospace,monospace;`;
exports.monoTextStyle = monoTextStyle;
const mutedTextStyle = (opts = {}) => {
    var _a;
    const size = (_a = opts.fontSize) !== null && _a !== void 0 ? _a : 11;
    const width = opts.width ? `width:${opts.width};` : '';
    return `color:${exports.COLORS.textSubtle};font-size:${size}px;${width}`;
};
exports.mutedTextStyle = mutedTextStyle;
// ─── Form row containers ──────────────────────────────────────
const formRowStyle = (hidden = false) => `display:${hidden ? 'none' : 'flex'};align-items:center;gap:16px;flex-wrap:wrap;`;
exports.formRowStyle = formRowStyle;
// ─── Divider ──────────────────────────────────────────────────
const dividerStyle = (margin = '0 -2px') => `border-top:1px solid ${exports.COLORS.bgSurface0};margin:${margin};`;
exports.dividerStyle = dividerStyle;
const fullWidthDividerStyle = () => `border-top:1px solid ${exports.COLORS.bgSurface0};width:100%;margin:2px 0;`;
exports.fullWidthDividerStyle = fullWidthDividerStyle;
// ─── Filter chip ──────────────────────────────────────────────
const filterChipStyle = () => `display:inline-flex;align-items:center;gap:4px;` +
    `background:${exports.COLORS.bgSurface1};color:${exports.COLORS.textPrimary};` +
    `border-radius:12px;padding:2px 6px 2px 10px;font-size:11px;` +
    `white-space:nowrap;margin:2px;`;
exports.filterChipStyle = filterChipStyle;
const filterChipDismissStyle = () => `background:none;border:none;color:${exports.COLORS.textMuted};cursor:pointer;` +
    `font-size:14px;padding:0 2px;line-height:1;`;
exports.filterChipDismissStyle = filterChipDismissStyle;
// ─── Utility ──────────────────────────────────────────────────
const cssSize = (val) => typeof val === 'number' ? `${val}px` : String(val);
exports.cssSize = cssSize;
// ─── Global stylesheet injection ──────────────────────────────
/**
 * Inject a <style> tag with rules that can't be applied via inline styles
 * (pseudo-elements, etc.). Idempotent — only injects once per document.
 */
function injectGlobalStyles() {
    const ID = 'jp-bioacoustic-global-styles';
    if (document.getElementById(ID))
        return;
    const styleEl = document.createElement('style');
    styleEl.id = ID;
    styleEl.textContent = `
    .jp-BA-chip-dismiss:hover { color: ${exports.COLORS.red}; }
    .jp-BA-filter-input::placeholder {
      color: ${exports.COLORS.overlay} !important;
      opacity: 0.7 !important;
      font-style: italic;
    }
  `;
    document.head.appendChild(styleEl);
}
exports.injectGlobalStyles = injectGlobalStyles;


/***/ },

/***/ "./lib/util.js"
/*!*********************!*\
  !*** ./lib/util.js ***!
  \*********************/
(__unused_webpack_module, exports) {


/**
 * Small stateless utilities used across sections.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isTruthyValue = exports.parseAccuracyConfig = exports.escPy = exports.fmtTime = void 0;
/** Format a time in seconds as "m:ss.cc" (with leading - sign if negative). */
function fmtTime(s) {
    const sign = s < 0 ? '-' : '';
    const abs = Math.abs(s);
    const m = Math.floor(abs / 60);
    const sec = Math.floor(abs % 60).toString().padStart(2, '0');
    const cs = Math.floor((abs % 1) * 100).toString().padStart(2, '0');
    return `${sign}${m}:${sec}.${cs}`;
}
exports.fmtTime = fmtTime;
/** Escape a string for use inside a single-quoted Python string literal. */
function escPy(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
exports.escPy = escPy;
function parseAccuracyConfig(progressTracker) {
    if (!progressTracker || progressTracker === true)
        return null;
    if (typeof progressTracker === 'string') {
        return { column: progressTracker, value: null };
    }
    if (typeof progressTracker === 'object') {
        const acc = progressTracker.accuracy;
        if (!acc)
            return null;
        if (typeof acc === 'string') {
            return { column: acc, value: null };
        }
        if (typeof acc === 'object' && acc.column) {
            return { column: acc.column, value: acc.value != null ? String(acc.value) : null };
        }
    }
    return null;
}
exports.parseAccuracyConfig = parseAccuracyConfig;
const _TRUTHY_WORDS = new Set(['yes', 'valid', 'true']);
const _IS_PREFIXES = ['is', 'is ', 'is-', 'is_'];
function isTruthyValue(val) {
    if (val === true)
        return true;
    if (val === 1)
        return true;
    if (typeof val === 'number')
        return false;
    const s = String(val).trim().toLowerCase();
    if (s === '' || s === 'null' || s === 'undefined' || s === 'none')
        return false;
    const n = parseFloat(s);
    if (!isNaN(n))
        return n === 1 || s === '1.0';
    if (_TRUTHY_WORDS.has(s))
        return true;
    for (const prefix of _IS_PREFIXES) {
        if (s.startsWith(prefix) && _TRUTHY_WORDS.has(s.slice(prefix.length)))
            return true;
    }
    return false;
}
exports.isTruthyValue = isTruthyValue;


/***/ }

}]);
//# sourceMappingURL=lib_index_js.3fead5cc225629f3ade4.js.map