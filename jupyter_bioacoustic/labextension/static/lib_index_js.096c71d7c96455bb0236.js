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
let _counter = 0;
class BioacousticWidget extends widgets_1.Widget {
    constructor(tracker) {
        super();
        // ── Config (from kernel vars) ────────────────────────────────
        this._predictionCol = '';
        this._displayCols = [];
        this._kernelBridge = new kernel_1.KernelBridge(tracker);
        this.id = `jp-bioacoustic-${_counter++}`;
        this.title.label = 'Bioacoustic Reviewer';
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
                `overflow:hidden;box-sizing:border-box;`;
        // ── Header ──────────────────────────────────────────────────
        const header = document.createElement('div');
        header.style.cssText = (0, styles_1.barBottomStyle)();
        this._titleEl = document.createElement('span');
        this._titleEl.textContent = 'Bioacoustic Reviewer';
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
        this._predictionCol = cfg.prediction_col;
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
        // Set title from mode
        if (this._predictionCol) {
            this._titleEl.textContent = 'Bioacoustic Reviewer';
            this.title.label = 'Bioacoustic Reviewer';
        }
        else {
            this._titleEl.textContent = 'Bioacoustic Annotator';
            this.title.label = 'Bioacoustic Annotator';
        }
        // Initialize form panel
        this._form.setContext({
            formConfig,
            rows,
            predictionCol: this._predictionCol,
            duplicateEntries,
            outputPath,
        });
        await this._form.build();
        await this._form.loadOutputFileProgress();
        await this._form.loadReviewedState();
        // Initialize player
        this._player.setContext({
            audioPath: cfg.audio_path,
            audioCol: cfg.audio_col,
            captureLabel: (_b = cfg.capture) !== null && _b !== void 0 ? _b : '',
            captureDir: (_c = cfg.capture_dir) !== null && _c !== void 0 ? _c : '',
            predictionCol: this._predictionCol,
            displayCols: this._displayCols,
            defaultBuffer: parseFloat(cfg.default_buffer) || 3,
            rows,
        });
        // Initialize table
        this._table.setData({
            rows,
            predictionCol: this._predictionCol,
            displayCols: this._displayCols,
            dataCols,
            duplicateEntries,
        });
        // Auto-select first row
        if (this._table.filtered.length > 0) {
            this._selectRow(0);
            await this._player.loadRow(this._table.filtered[0]);
        }
        const noun = this._predictionCol ? 'detections' : 'clips';
        this._setStatus(`✓ ${rows.length} ${noun} loaded`);
    }
    /** Orchestrator: update info card + form for the selected row. */
    _selectRow(filteredIdx) {
        this._table.selectIndex(filteredIdx);
        const row = this._table.filtered[filteredIdx];
        if (!row)
            return;
        this._infoCard.render(row, {
            predictionCol: this._predictionCol,
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
# Outputs JSON to stdout.

_S_db   = 20 * _np.log10(_np.maximum(_S, 1e-10))
_S_db   = _np.clip(_S_db, _S_db.max() - 80, _S_db.max())
_S_norm = (_S_db - _S_db.min()) / max(float(_S_db.max() - _S_db.min()), 1e-10)

_fig = _plt.figure(figsize=(20, 5), dpi=100)
_ax  = _fig.add_axes([0, 0, 1, 1])
_ax.imshow(_S_norm, aspect='auto', cmap='magma', origin='lower', interpolation='bilinear')
_ax.set_axis_off()
_pb = _io.BytesIO()
_fig.savefig(_pb, format='png', dpi=100, bbox_inches='tight', pad_inches=0)
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
`;


/***/ },

/***/ "./lib/python.js"
/*!***********************!*\
  !*** ./lib/python.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.INVALIDATE_OUTPUT_CACHE = exports.savePng = exports.deleteOutputRow = exports.writeOutputRow = exports.readOutputRows = exports.countOutputProgress = exports.loadSelectItemsText = exports.loadSelectItemsYaml = exports.loadSelectItemsJsonl = exports.loadSelectItemsParquet = exports.loadSelectItemsCsv = exports.spectrogramPipeline = exports.buildSpectrogram = exports.readAudioS3 = exports.readAudioLocal = exports.readKernelVars = void 0;
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
exports.readKernelVars = readKernelVars;
// ─── Spectrogram + WAV generation (Player) ───────────────────
function readAudioLocal(path, startSec, durSec) {
    const p = (0, util_1.escPy)(path);
    return [
        `import soundfile as _sf`,
        `with _sf.SoundFile('${p}') as _f:`,
        `    _sr = _f.samplerate`,
        `    _f.seek(int(${startSec} * _sr))`,
        `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
    ].join('\n');
}
exports.readAudioLocal = readAudioLocal;
function readAudioS3(bucket, key, startSec, durSec) {
    return [
        `import boto3 as _b3, tempfile as _tmp, os as _os, soundfile as _sf`,
        `with _tmp.NamedTemporaryFile(suffix='.flac', delete=False) as _t:`,
        `    _b3.client('s3').download_fileobj('${(0, util_1.escPy)(bucket)}', '${(0, util_1.escPy)(key)}', _t)`,
        `    _tp = _t.name`,
        `with _sf.SoundFile(_tp) as _f:`,
        `    _sr = _f.samplerate`,
        `    _f.seek(int(${startSec} * _sr))`,
        `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
        `_os.unlink(_tp)`,
    ].join('\n');
}
exports.readAudioS3 = readAudioS3;
/** Assemble the spectrogram pipeline from .py chunks (no template vars). */
function buildSpectrogram(spectType) {
    const filterBlock = spectType === 'mel' ? py_chunks_1.spectrogramMel : py_chunks_1.spectrogramPlain;
    return [py_chunks_1.buildSpectrogram, filterBlock, py_chunks_1.spectrogramRender].join('\n');
}
exports.buildSpectrogram = buildSpectrogram;
/** Full spectrogram pipeline: read audio + process + return JSON. */
function spectrogramPipeline(path, startSec, durSec, spectType) {
    let readCode;
    if (path.startsWith('s3://')) {
        const noProto = path.slice(5);
        const slash = noProto.indexOf('/');
        const bucket = slash < 0 ? noProto : noProto.slice(0, slash);
        const key = slash < 0 ? '' : noProto.slice(slash + 1);
        readCode = readAudioS3(bucket, key, startSec, durSec);
    }
    else {
        readCode = readAudioLocal(path, startSec, durSec);
    }
    return readCode + '\n' + buildSpectrogram(spectType);
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
/** Count rows + valid rows in the output file. */
function countOutputProgress(path, ext, isValidCol, yesVal) {
    const p = (0, util_1.escPy)(path);
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
exports.countOutputProgress = countOutputProgress;
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
 * ClipTable — filter bar, sortable/paginated data table, view mode toggle.
 *
 * Owns the filter expression parsing, sorting, pagination, row rendering,
 * and the reviewed-row styling. Emits `rowSelected` when the user clicks
 * a row or navigates via the view-mode/refresh controls.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
class ClipTable {
    constructor(_form) {
        this._form = _form;
        // ─── Signals ───────────────────────────────────────────────
        /** A row was clicked in the table. */
        this.rowSelected = new signaling_1.Signal(this);
        // ─── Data state ────────────────────────────────────────────
        this._rows = [];
        this._filtered = [];
        this._sortCol = 'id';
        this._sortAsc = true;
        this._page = 0;
        this._pageSize = 10;
        this._selectedIdx = -1;
        this._filterExpr = '';
        this._viewMode = 'all';
        this._tableCols = [];
        this.element = document.createElement('div');
        this.element.style.cssText = `display:contents;`;
        this._buildUI();
    }
    // ─── Public API ────────────────────────────────────────────
    /** Set data and column config. Call after reading kernel vars. */
    setData(opts) {
        this._rows = opts.rows;
        this._configureColumns(opts);
        if (!opts.duplicateEntries) {
            this._viewModeSelect.style.display = '';
            this._refreshBtn.style.display = '';
            this._viewMode = 'pending';
            this._viewModeSelect.value = 'pending';
        }
        this.refresh();
    }
    /** Re-apply filters and re-render. */
    refresh() {
        this._applyFilterAndSort();
        this._renderTable();
    }
    /** Programmatically select a row by filtered index. Does NOT emit rowSelected. */
    selectIndex(filteredIdx) {
        this._selectedIdx = filteredIdx;
        this._renderTable();
    }
    /** Get the currently selected filtered index. */
    get selectedIdx() { return this._selectedIdx; }
    /** Get the filtered rows array. */
    get filtered() { return this._filtered; }
    /** Get total input rows. */
    get rows() { return this._rows; }
    /** Scroll pagination to show the selected row. */
    ensurePageShowsSelected() {
        if (this._selectedIdx < 0)
            return;
        const newPage = Math.floor(this._selectedIdx / this._pageSize);
        if (newPage !== this._page) {
            this._page = newPage;
            this._renderTable();
        }
    }
    // ─── Private: UI ───────────────────────────────────────────
    _buildUI() {
        // Filter bar
        const filterBar = document.createElement('div');
        filterBar.style.cssText = (0, styles_1.barBottomStyle)();
        const filterLbl = document.createElement('span');
        filterLbl.style.cssText = (0, styles_1.smallLabelStyle)();
        filterLbl.textContent = 'Filter:';
        this._filterInput = document.createElement('input');
        this._filterInput.type = 'text';
        this._filterInput.className = 'jp-BA-filter-input';
        this._filterInput.placeholder = `common_name = 'Barred owl' and confidence >= 0.5`;
        this._filterInput.style.cssText = (0, styles_1.inputStyle)('340px');
        this._filterInput.addEventListener('keydown', e => {
            if (e.key === 'Enter')
                this._applyFilter();
        });
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.style.cssText = (0, styles_1.btnStyle)(true);
        applyBtn.addEventListener('click', () => this._applyFilter());
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = (0, styles_1.btnStyle)();
        clearBtn.addEventListener('click', () => {
            this._filterInput.value = '';
            this._filterExpr = '';
            this._page = 0;
            this.refresh();
        });
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
        filterBar.append(filterLbl, this._filterInput, applyBtn, clearBtn, this._viewModeSelect, this._refreshBtn);
        // Table
        const tableWrap = document.createElement('div');
        tableWrap.style.cssText =
            `flex:0 0 auto;overflow-y:auto;max-height:175px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
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
        this.element.append(filterBar, tableWrap, pagBar);
    }
    // ─── Private: columns ──────────────────────────────────────
    _configureColumns(opts) {
        const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (opts.dataCols.length > 0) {
            this._tableCols = opts.dataCols.map(k => ({ key: k, label: prettify(k) }));
        }
        else if (opts.rows.length > 0 && !opts.predictionCol && opts.displayCols.length === 0) {
            this._tableCols = Object.keys(opts.rows[0]).map(k => ({ key: k, label: prettify(k) }));
        }
        else {
            const baseCols = [
                { key: 'id', label: 'ID' },
                { key: 'start_time', label: 'Start (s)' },
                { key: 'end_time', label: 'End (s)' },
            ];
            const extraCols = opts.displayCols.map(k => ({ key: k, label: prettify(k) }));
            if (opts.predictionCol) {
                this._tableCols = [
                    { key: 'id', label: 'ID' },
                    { key: opts.predictionCol, label: prettify(opts.predictionCol) },
                    ...extraCols,
                    { key: 'start_time', label: 'Start (s)' },
                    { key: 'end_time', label: 'End (s)' },
                ];
            }
            else {
                this._tableCols = [...baseCols, ...extraCols];
            }
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
    _parseFilters(expr) {
        if (!expr.trim())
            return [];
        return expr.split(/\s+and\s+/i).map(clause => {
            const m = clause.trim().match(/^(\w+)\s*(=|!=|>=|<=|>|<|contains)\s*(.+)$/i);
            if (!m)
                return null;
            const col = m[1];
            const op = m[2];
            const rawVal = m[3].trim();
            let val;
            if (/^['"]/.test(rawVal)) {
                val = rawVal.replace(/^['"]|['"]$/g, '');
            }
            else {
                val = parseFloat(rawVal);
            }
            return { col, op, val };
        }).filter((x) => x !== null);
    }
    _applyFilter() {
        this._filterExpr = this._filterInput.value;
        this._page = 0;
        this.refresh();
    }
    _applyFilterAndSort() {
        const filters = this._parseFilters(this._filterExpr);
        let rows = this._rows.filter(row => {
            return filters.every(f => {
                const v = row[f.col];
                const vs = String(v).toLowerCase();
                const fvs = String(f.val).toLowerCase();
                if (f.op === '=')
                    return vs === fvs;
                if (f.op === '!=')
                    return vs !== fvs;
                if (f.op === 'contains')
                    return vs.includes(fvs);
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
            const reviewed = this._form.isReviewed(row);
            const tr = document.createElement('tr');
            const baseBg = i % 2 === 0 ? styles_1.COLORS.bgBase : styles_1.COLORS.bgAltRow;
            tr.style.cssText =
                `cursor:pointer;border-bottom:1px solid ${styles_1.COLORS.bgHover};` +
                    (isSelected
                        ? `background:${styles_1.COLORS.bgSelected};`
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
        this._isValidEl = null;
        this._isValidYesVal = 'yes';
        this._isValidNoVal = 'no';
        this._isValidCol = 'is_valid';
        this._yesFormEl = null;
        this._noFormEl = null;
        this._submitBtns = [];
        this._requiredInputs = [];
        this._inputRefs = new Map();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        // Progress tracking
        this._sessionCount = 0;
        this._sessionValid = 0;
        this._fileCount = 0;
        this._fileValid = 0;
        this._progressEls = [];
        // Annotation tool
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs = new Map();
        // Reviewed state (for duplicate_entries=false)
        this._reviewedMap = new Map();
        this._showingReviewedView = false;
        // Context provided by the orchestrator
        this._rows = [];
        this._predictionCol = '';
        this._duplicateEntries = false;
        this._outputPath = '';
        this._selectedIdx = -1;
        this._filteredLength = 0;
        this._currentRow = null;
        // Build the section shell
        this.element = document.createElement('div');
        this.element.style.cssText =
            `flex-shrink:0;min-height:140px;padding:10px 14px 12px;background:${styles_1.COLORS.bgMantle};` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;
        this._dynFormEl = document.createElement('div');
        this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
        this.element.append(this._dynFormEl);
    }
    // ─── Public API ────────────────────────────────────────────
    /** Set context needed by the form (called once after reading kernel vars). */
    setContext(opts) {
        this._formConfig = opts.formConfig;
        this._rows = opts.rows;
        this._predictionCol = opts.predictionCol;
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
        var _a, _b;
        this._dynFormEl.innerHTML = '';
        this._formValues = {};
        this._isValidEl = null;
        this._isValidCol = 'is_valid';
        this._yesFormEl = null;
        this._noFormEl = null;
        this._submitBtns = [];
        this._requiredInputs = [];
        this._inputRefs.clear();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs.clear();
        this._sessionCount = 0;
        this._sessionValid = 0;
        this._progressEls = [];
        const cfg = this._formConfig;
        if (!cfg) {
            this.element.style.display = 'none';
            return;
        }
        this.element.style.display = 'flex';
        // Iterate keys in order so pass_value position controls output column order
        for (const key of Object.keys(cfg)) {
            if (key === 'title') {
                this._appendTitleEntry(cfg.title, this._dynFormEl);
            }
            else if (key === 'progress_tracker') {
                this._appendProgressTracker(this._dynFormEl);
            }
            else if (key === 'pass_value') {
                this._registerPassValue(cfg.pass_value);
            }
            else if (key === 'fixed_value') {
                this._registerFixedValue(cfg.fixed_value);
            }
            else if (key === 'is_valid_form') {
                const isValidDiv = document.createElement('div');
                isValidDiv.dataset.formSection = 'is_valid_form';
                isValidDiv.style.cssText = (0, styles_1.formRowStyle)();
                await this._buildFormSection((_a = cfg.is_valid_form) !== null && _a !== void 0 ? _a : [], isValidDiv);
                this._dynFormEl.appendChild(isValidDiv);
            }
            else if (key === 'yes_form') {
                this._yesFormEl = document.createElement('div');
                this._yesFormEl.dataset.formSection = 'yes_form';
                this._yesFormEl.style.cssText = (0, styles_1.formRowStyle)(true);
                await this._buildFormSection(cfg.yes_form, this._yesFormEl);
                this._dynFormEl.appendChild(this._yesFormEl);
            }
            else if (key === 'no_form') {
                this._noFormEl = document.createElement('div');
                this._noFormEl.dataset.formSection = 'no_form';
                this._noFormEl.style.cssText = (0, styles_1.formRowStyle)(true);
                await this._buildFormSection(cfg.no_form, this._noFormEl);
                this._dynFormEl.appendChild(this._noFormEl);
            }
            else if (key === 'annotate_form') {
                const annotateDiv = document.createElement('div');
                annotateDiv.dataset.formSection = 'annotate_form';
                annotateDiv.style.cssText = (0, styles_1.formRowStyle)();
                await this._buildFormSection((_b = cfg.annotate_form) !== null && _b !== void 0 ? _b : [], annotateDiv);
                this._dynFormEl.appendChild(annotateDiv);
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
        }
        // Wire is_valid_select → show/hide subforms
        if (this._isValidEl) {
            const isValidEl = this._isValidEl;
            isValidEl.addEventListener('change', () => {
                const val = isValidEl.value;
                if (this._yesFormEl) {
                    this._yesFormEl.style.display = val === String(this._isValidYesVal) ? 'flex' : 'none';
                }
                if (this._noFormEl) {
                    this._noFormEl.style.display = val === String(this._isValidNoVal) ? 'flex' : 'none';
                }
                this._validateForm();
            });
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
        const isValidCol = this._isValidEl ? (0, util_1.escPy)(this._isValidCol) : '';
        const yesVal = this._isValidEl ? (0, util_1.escPy)(String(this._isValidYesVal)) : '';
        const code = (0, python_1.countOutputProgress)(this._outputPath, ext, isValidCol, yesVal);
        try {
            const raw = await this._kernel.exec(code);
            const result = JSON.parse(raw);
            this._fileCount = result.count;
            this._fileValid = result.valid;
            this._updateProgress();
        }
        catch (_c) {
            // output file may not exist yet — that's fine
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
                this._appendProgressTracker(container);
            }
            else if (type === 'annotation') {
                this._buildAnnotationElement(config, container);
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const cfg = (rawConfig === true || rawConfig === null || rawConfig === undefined) ? {} : rawConfig;
        let labelText;
        let col;
        let required;
        if (type === 'is_valid_select') {
            col = (_a = cfg.column) !== null && _a !== void 0 ? _a : 'is_valid';
            labelText = (_b = cfg.label) !== null && _b !== void 0 ? _b : 'is_valid';
            required = true;
        }
        else {
            labelText = (_c = cfg.label) !== null && _c !== void 0 ? _c : type;
            col = (_d = cfg.column) !== null && _d !== void 0 ? _d : labelText;
            required = (_e = cfg.required) !== null && _e !== void 0 ? _e : false;
        }
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
            this._formValues[col] = (_f = cfg.default) !== null && _f !== void 0 ? _f : '';
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
            const items = await this._loadSelectItems(cfg.items);
            items.forEach(([v, l]) => {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = l;
                sel.appendChild(o);
            });
            sel.addEventListener('change', () => { this._formValues[col] = sel.value; this._validateForm(); });
            this._formValues[col] = (_g = cfg.default) !== null && _g !== void 0 ? _g : '';
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
            this._formValues[col] = inp.checked ? ((_h = cfg.yes_value) !== null && _h !== void 0 ? _h : true) : ((_j = cfg.no_value) !== null && _j !== void 0 ? _j : false);
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
            this._formValues[col] = (_k = cfg.value) !== null && _k !== void 0 ? _k : null;
            inputEl = inp;
        }
        else if (type === 'is_valid_select') {
            const sel = document.createElement('select');
            sel.style.cssText = (0, styles_1.selectStyle)() + `font-size:13px;`;
            let yesLabel = 'yes', yesVal = 'yes';
            let noLabel = 'no', noVal = 'no';
            if (typeof cfg.yes === 'string') {
                yesLabel = yesVal = cfg.yes;
            }
            else if (cfg.yes && typeof cfg.yes === 'object') {
                yesLabel = (_l = cfg.yes.label) !== null && _l !== void 0 ? _l : 'yes';
                yesVal = (_m = cfg.yes.value) !== null && _m !== void 0 ? _m : 'yes';
            }
            if (typeof cfg.no === 'string') {
                noLabel = noVal = cfg.no;
            }
            else if (cfg.no && typeof cfg.no === 'object') {
                noLabel = (_o = cfg.no.label) !== null && _o !== void 0 ? _o : 'no';
                noVal = (_p = cfg.no.value) !== null && _p !== void 0 ? _p : 'no';
            }
            [['', '— select —'], [String(yesVal), yesLabel], [String(noVal), noLabel]].forEach(([v, l]) => {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = l;
                sel.appendChild(o);
            });
            this._isValidEl = sel;
            this._isValidYesVal = yesVal;
            this._isValidNoVal = noVal;
            this._isValidCol = col;
            sel.addEventListener('change', () => { this._formValues[col] = sel.value; this._validateForm(); });
            this._formValues[col] = '';
            this._requiredInputs.push({ col, el: sel });
            this._inputRefs.set(col, sel);
            lbl.appendChild(sel);
            container.appendChild(lbl);
            return;
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
    async _loadSelectItems(items) {
        var _a, _b;
        if (!items)
            return [];
        if (Array.isArray(items)) {
            return items.map(item => {
                if (typeof item === 'string')
                    return [item, item];
                if (typeof item === 'object' && item !== null) {
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
    _buildAnnotationElement(config, container) {
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
    }
    // ─── Private: value management ─────────────────────────────
    _applyRow(row) {
        var _a;
        this._currentRow = row;
        // Reset is_valid select and hide subforms
        if (this._isValidEl) {
            this._isValidEl.value = '';
            this._formValues[this._isValidCol] = '';
        }
        if (this._yesFormEl)
            this._yesFormEl.style.display = 'none';
        if (this._noFormEl)
            this._noFormEl.style.display = 'none';
        // Reset all tracked inputs to empty (skip is_valid — already reset above)
        for (const [col, el] of this._inputRefs) {
            if (col === this._isValidCol)
                continue;
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
        const allSatisfied = this._requiredInputs.every(({ col, el }) => {
            const section = el.closest('[data-form-section]');
            if (section && section.style.display === 'none')
                return true;
            const val = this._formValues[col];
            return val !== null && val !== undefined && val !== '';
        });
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
    // ─── Private: display elements ────────────────────────────
    _appendTitleEntry(config, container) {
        var _a;
        if (!config)
            return;
        const isObj = typeof config === 'object';
        const text = isObj ? ((_a = config.value) !== null && _a !== void 0 ? _a : '') : String(config);
        const withProgress = isObj && config.progress_tracker === true;
        const d = document.createElement('div');
        d.style.cssText = (0, styles_1.sectionTitleStyle)() + `display:flex;align-items:baseline;`;
        const span = document.createElement('span');
        span.textContent = text;
        d.appendChild(span);
        if (withProgress) {
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
        const fileV = Math.min(this._fileValid, fileN);
        const totalDone = fileN + this._sessionCount;
        const parts = [];
        if (this._sessionCount > 0) {
            parts.push(`session ${this._sessionCount}/${total}`);
        }
        parts.push(`total ${totalDone}/${total}`);
        if (this._isValidEl) {
            const allValid = fileV + this._sessionValid;
            const pct = totalDone > 0 ? Math.round((allValid / totalDone) * 100) : 0;
            parts.push(`accuracy ${pct}%`);
        }
        const text = parts.join(' · ');
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
        var _a;
        const row = this._rows[this._rowById(this._currentRowId())];
        // The orchestrator provides the selected row via the caller of updateFromRow.
        // But we don't hold a direct ref; we reconstruct from selectedIdx + rows.
        // NOTE: we rely on _applyRow having been called last with the correct row.
        // This is fine because submit is user-driven (after a row was selected).
        // We could instead remember _currentRow in _applyRow — do that for safety.
        if (!this._currentRow || !this._outputPath)
            return;
        const activeRow = this._currentRow;
        const values = this._collectFormValues();
        const code = (0, python_1.writeOutputRow)(this._outputPath, values);
        const verb = this._predictionCol ? 'Verified' : 'Annotated';
        try {
            await this._kernel.exec(code);
            this.statusChanged.emit({ message: `✓ ${verb} clip ${activeRow.id} → ${this._outputPath}`, error: false });
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Write failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
            return;
        }
        this._sessionCount++;
        if (this._isValidEl && this._formValues[this._isValidCol] === String(this._isValidYesVal)) {
            this._sessionValid++;
        }
        if (!this._duplicateEntries) {
            this._reviewedMap.set(activeRow.id, Object.assign({}, values));
        }
        this._updateProgress();
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
        this._sessionCount = Math.max(0, this._sessionCount - 1);
        this._fileCount = Math.max(0, this._fileCount - 1);
        this._updateProgress();
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
 * Shows time range, prediction value, display columns as colored chips,
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
        if (opts.predictionCol && row[opts.predictionCol] !== undefined) {
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `font-size:13px;font-weight:600;color:${styles_1.COLORS.textPrimary};flex-shrink:0;`;
            nameSpan.textContent = String(row[opts.predictionCol]);
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
        // ─── Context ───────────────────────────────────────────────
        this._audioPath = '';
        this._audioCol = '';
        this._captureLabel = '';
        this._captureDir = '';
        this._predictionCol = '';
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
        this._audioPath = opts.audioPath;
        this._audioCol = opts.audioCol;
        this._captureLabel = opts.captureLabel;
        this._captureDir = opts.captureDir;
        this._predictionCol = opts.predictionCol;
        this._displayCols = opts.displayCols;
        this._rows = opts.rows;
        this._bufferInput.value = String(opts.defaultBuffer);
        if (this._captureLabel) {
            this._captureBtn.textContent = this._captureLabel;
            this._captureBtn.style.display = '';
        }
        // Set cursor based on annotation config
        this._canvasContainer.style.cursor =
            this._form.getAnnotConfig() ? 'crosshair' : 'default';
    }
    /** Load audio for a row (called when a row is selected). */
    async loadRow(row) {
        this._currentRow = row;
        this._startInput.value = String(row.start_time);
        this._endInput.value = String(row.end_time);
        await this._loadAudio();
    }
    /** Re-render the spectrogram frame (after annotation change, etc.). */
    renderFrame() {
        this._renderFrame();
    }
    /** Update cursor for annotation mode. */
    updateCursor() {
        this._canvasContainer.style.cursor =
            this._form.getAnnotConfig() ? 'crosshair' : 'default';
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
        const mkNumLabel = (labelText, def, w = '65px') => {
            const lbl = document.createElement('label');
            lbl.style.cssText = (0, styles_1.labelStyle)();
            lbl.textContent = labelText;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = def;
            inp.style.cssText = (0, styles_1.inputStyle)(w);
            lbl.appendChild(inp);
            playerCtrls.appendChild(lbl);
            return inp;
        };
        const typeLbl = document.createElement('label');
        typeLbl.style.cssText = (0, styles_1.labelStyle)();
        typeLbl.textContent = 'Type';
        this._spectTypeSelect = document.createElement('select');
        this._spectTypeSelect.style.cssText = (0, styles_1.selectStyle)();
        ['plain', 'mel'].forEach(v => {
            const o = document.createElement('option');
            o.value = o.textContent = v;
            this._spectTypeSelect.appendChild(o);
        });
        typeLbl.appendChild(this._spectTypeSelect);
        playerCtrls.appendChild(typeLbl);
        this._bufferInput = mkNumLabel('Buffer (s)', '3', '50px');
        this._startInput = mkNumLabel('Start (s)', '0', '70px');
        this._endInput = mkNumLabel('End (s)', '12', '70px');
        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Update';
        loadBtn.style.cssText = (0, styles_1.btnStyle)(true);
        loadBtn.addEventListener('click', () => void this._loadAudio());
        playerCtrls.appendChild(loadBtn);
        const ctrNote = document.createElement('span');
        ctrNote.textContent = '← update after changes';
        ctrNote.style.cssText = `font-size:10px;color:${styles_1.COLORS.textMuted};white-space:nowrap;`;
        playerCtrls.appendChild(ctrNote);
        this._captureBtn = document.createElement('button');
        this._captureBtn.textContent = 'Capture';
        this._captureBtn.style.cssText = (0, styles_1.btnStyle)() + `display:none;margin-left:auto;`;
        this._captureBtn.addEventListener('click', () => void this._onCapture());
        playerCtrls.appendChild(this._captureBtn);
        // Spectrogram canvas
        this._canvasContainer = document.createElement('div');
        this._canvasContainer.style.cssText =
            `flex:1;position:relative;min-height:80px;background:${styles_1.COLORS.bgCrust};overflow:hidden;cursor:default;`;
        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
        this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
        this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
        this._canvas.addEventListener('mouseup', () => this._onCanvasMouseUp());
        this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseUp());
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
        this.element.append(playerCtrls, this._canvasContainer, playBar, this._audio);
    }
    // ─── Private: audio loading ────────────────────────────────
    _resolveAudioPath() {
        if (this._audioCol && this._currentRow) {
            const val = this._currentRow[this._audioCol];
            if (val != null && String(val).trim())
                return String(val);
        }
        return this._audioPath;
    }
    async _loadAudio() {
        var _a, _b, _c;
        const audioPath = this._resolveAudioPath();
        if (!audioPath) {
            this.statusChanged.emit({ message: '❌ No audio path — set audio_path or audio_column', error: true });
            return;
        }
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
        this.statusChanged.emit({ message: 'Running Python (soundfile + numpy + matplotlib)…', error: false });
        let result;
        try {
            const spectType = this._spectTypeSelect.value;
            const raw = await this._kernel.exec((0, python_1.spectrogramPipeline)(audioPath, loadStart, loadDur, spectType));
            result = JSON.parse(raw);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
            return;
        }
        this._segDuration = result.duration;
        this._sampleRate = result.sample_rate;
        this._freqMin = result.freq_min;
        this._freqMax = result.freq_max;
        this.statusChanged.emit({ message: 'Decoding spectrogram…', error: false });
        try {
            const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'image/png' });
            if (this._specBitmap)
                this._specBitmap.close();
            this._specBitmap = await createImageBitmap(blob);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Image decode: ${String((_b = e.message) !== null && _b !== void 0 ? _b : e)}`, error: true });
            return;
        }
        this._audio.src = `data:audio/wav;base64,${result.wav}`;
        this._audio.load();
        this._renderFrame();
        const fname = (_c = audioPath.split('/').pop()) !== null && _c !== void 0 ? _c : audioPath;
        this.statusChanged.emit({
            message: `✓ ${fname}  ${(0, util_1.fmtTime)(loadStart)}–${(0, util_1.fmtTime)(loadStart + result.duration)}`,
            error: false,
        });
    }
    _renderFrame() {
        const ctx = this._canvas.getContext('2d');
        if (!ctx)
            return;
        const W = this._canvas.width, H = this._canvas.height;
        if (!W || !H)
            return;
        if (this._specBitmap) {
            ctx.drawImage(this._specBitmap, 0, 0, W, H);
        }
        else {
            ctx.fillStyle = styles_1.COLORS.bgCrust;
            ctx.fillRect(0, 0, W, H);
        }
        if (this._specBitmap && this._segDuration > 0) {
            const detStartFrac = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
            const detEndFrac = Math.min(1, (this._detectionEnd - this._segLoadStart) / this._segDuration);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            if (detStartFrac > 0)
                ctx.fillRect(0, 0, Math.floor(detStartFrac * W), H);
            if (detEndFrac < 1) {
                const rx = Math.ceil(detEndFrac * W);
                ctx.fillRect(rx, 0, W - rx, H);
            }
            const ph = Math.floor(Math.max(0, Math.min(1, this._audio.currentTime / this._segDuration)) * (W - 1));
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
    _timeToX(t) {
        return ((t - this._segLoadStart) / this._segDuration) * this._canvas.width;
    }
    _xToTime(x) {
        return this._segLoadStart + (x / this._canvas.width) * this._segDuration;
    }
    _freqToY(f) {
        const H = this._canvas.height;
        let frac;
        if (this._spectTypeSelect.value === 'mel') {
            const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
            const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
            const mel = 2595 * Math.log10(1 + f / 700);
            frac = (melMax - melMin) > 0 ? (mel - melMin) / (melMax - melMin) : 0;
        }
        else {
            frac = (this._freqMax - this._freqMin) > 0
                ? (f - this._freqMin) / (this._freqMax - this._freqMin) : 0;
        }
        return H * (1 - frac);
    }
    _yToFreq(y) {
        const H = this._canvas.height;
        const frac = 1 - y / H;
        if (this._spectTypeSelect.value === 'mel') {
            const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
            const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
            const mel = melMin + frac * (melMax - melMin);
            return 700 * (Math.pow(10, mel / 2595) - 1);
        }
        return this._freqMin + frac * (this._freqMax - this._freqMin);
    }
    _onCanvasMouseDown(e) {
        var _a, _b, _c, _d, _e, _f;
        const ac = this._form.getAnnotConfig();
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
        this._renderFrame();
        this._updateAnnotDisplay();
    }
    _onCanvasMouseMove(e) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const ac = this._form.getAnnotConfig();
        if (!ac || !this._specBitmap || this._segDuration === 0)
            return;
        const { cx, cy } = this._canvasXY(e);
        if (!this._annotDrag) {
            this._updateAnnotCursor(cx, cy);
            return;
        }
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
        this._renderFrame();
        this._updateAnnotDisplay();
    }
    _onCanvasMouseUp() {
        this._annotDrag = null;
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
    }
    // ─── Private: capture ──────────────────────────────────────
    _buildCaptureFilename() {
        const row = this._currentRow;
        if (!row)
            return 'spectrogram.png';
        const parts = [];
        if (this._predictionCol && row[this._predictionCol] !== undefined) {
            parts.push(String(row[this._predictionCol]));
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
        const W = this._canvas.width, H = this._canvas.height;
        const offscreen = document.createElement('canvas');
        offscreen.width = W;
        offscreen.height = H;
        const ctx = offscreen.getContext('2d');
        if (!ctx)
            return;
        ctx.drawImage(this._specBitmap, 0, 0, W, H);
        if (this._segDuration > 0) {
            const dsf = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
            const def = Math.min(1, (this._detectionEnd - this._segLoadStart) / this._segDuration);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            if (dsf > 0)
                ctx.fillRect(0, 0, Math.floor(dsf * W), H);
            if (def < 1) {
                const rx = Math.ceil(def * W);
                ctx.fillRect(rx, 0, W - rx, H);
            }
        }
        this._renderAnnotation(ctx, W, H);
        const dataUrl = offscreen.toDataURL('image/png');
        const b64 = dataUrl.split(',')[1];
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
exports.injectGlobalStyles = exports.cssSize = exports.fullWidthDividerStyle = exports.dividerStyle = exports.formRowStyle = exports.mutedTextStyle = exports.monoTextStyle = exports.sectionTitleStyle = exports.formLabelStyle = exports.smallLabelStyle = exports.barTopBottomStyle = exports.barBottomStyle = exports.barStyle = exports.btnStyle = exports.labelStyle = exports.selectStyle = exports.inputStyle = exports.DISPLAY_CHIP_COLORS = exports.COLORS = void 0;
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
    .jp-BA-filter-input::placeholder {
      color: ${exports.COLORS.textMuted};
      opacity: 0.7;
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
exports.escPy = exports.fmtTime = void 0;
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


/***/ }

}]);
//# sourceMappingURL=lib_index_js.096c71d7c96455bb0236.js.map