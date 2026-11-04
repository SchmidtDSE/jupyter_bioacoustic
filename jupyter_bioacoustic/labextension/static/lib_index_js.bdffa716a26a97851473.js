"use strict";
(self["webpackChunkjupyter_bioacoustic"] = self["webpackChunkjupyter_bioacoustic"] || []).push([["lib_index_js"],{

/***/ "./lib/BioacousticWidget.js"
/*!**********************************!*\
  !*** ./lib/BioacousticWidget.js ***!
  \**********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BioacousticWidget = exports.DEFAULT_TITLE = void 0;
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const infoPanel_1 = __webpack_require__(/*! ./infoPanel */ "./lib/infoPanel.js");
const kernel_1 = __webpack_require__(/*! ./kernel */ "./lib/kernel.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/python.js");
const ClipTable_1 = __webpack_require__(/*! ./sections/ClipTable */ "./lib/sections/ClipTable.js");
const DescriptionPanel_1 = __webpack_require__(/*! ./sections/DescriptionPanel */ "./lib/sections/DescriptionPanel.js");
const FormPanel_1 = __webpack_require__(/*! ./sections/FormPanel */ "./lib/sections/FormPanel.js");
const InfoCard_1 = __webpack_require__(/*! ./sections/InfoCard */ "./lib/sections/InfoCard.js");
const Player_1 = __webpack_require__(/*! ./sections/Player */ "./lib/sections/Player.js");
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ./text */ "./lib/text.js");
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
//
// Constants
//
/** Tab / header title until the config's ``app_title`` is read. */
exports.DEFAULT_TITLE = 'Jupyter Bioacoustic';
const DEFAULT_SPEC_RESOLUTIONS = '["1000","2000","4000"]';
const DEFAULT_BUFFER_SEC = 3;
/** Makes widget ids unique: ``jp-bioacoustic-<n>``. */
let widgetCounter = 0;
//
// Public
//
/** The annotator widget; one per open annotator, bound to one kernel for its lifetime. */
class BioacousticWidget extends widgets_1.Widget {
    /**
     * @param source - The kernel or notebook session this widget talks to (fixed for its lifetime).
     * @param ownsKernel - Shut ``source.kernel`` down when the widget is closed.
     */
    constructor(source, ownsKernel = false) {
        var _a;
        super();
        // ── Config (from kernel vars) ────────────────────────────────
        this._titleTemplate = '';
        this._textTemplate = '';
        this._kernelBridge = new kernel_1.KernelBridge(source);
        this._ownedKernel = ownsKernel ? (_a = source.kernel) !== null && _a !== void 0 ? _a : null : null;
        this.id = `jp-bioacoustic-${widgetCounter++}`;
        this.title.label = exports.DEFAULT_TITLE;
        this.title.closable = true;
        (0, styles_1.injectGlobalStyles)();
        this._buildUI();
    }
    /** Close the widget, shutting down its kernel if it started one. */
    dispose() {
        if (this._ownedKernel) {
            this._ownedKernel.shutdown().catch(() => { });
            this._ownedKernel = null;
        }
        super.dispose();
    }
    // ── Lumino lifecycle ─────────────────────────────────────────
    onAfterAttach(msg) {
        super.onAfterAttach(msg);
        this._player.attach();
        void this._init();
    }
    onBeforeDetach(msg) {
        this._player.detach();
        super.onBeforeDetach(msg);
    }
    // ── UI construction ──────────────────────────────────────────
    /** Build the header + info panel, create the sections and wire their signals. */
    _buildUI() {
        this.node.style.cssText =
            `display:flex;flex-direction:column;width:100%;height:100%;` +
                `background:${styles_1.COLORS.bgBase};color:${styles_1.COLORS.textPrimary};` +
                `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
                `overflow-y:auto;overflow-x:hidden;box-sizing:border-box;`;
        const header = this._buildHeader();
        this._infoPanel = document.createElement('div');
        this._infoPanel.style.cssText =
            `display:none;background:${styles_1.COLORS.bgSurface0};border-bottom:1px solid ${styles_1.COLORS.bgSurface1};` +
                `padding:12px 16px;font-size:11px;line-height:1.4;`;
        this._infoPanel.innerHTML =
            `<div style="color:${styles_1.COLORS.textSubtle};">Loading configuration info...</div>`;
        this._description = new DescriptionPanel_1.DescriptionPanel();
        this._form = new FormPanel_1.FormPanel(this._kernelBridge);
        this._player = new Player_1.Player(this._kernelBridge, this._form);
        this._table = new ClipTable_1.ClipTable(this._form);
        this._infoCard = new InfoCard_1.InfoCard();
        this._connectSignals();
        this.node.append(header, this._infoPanel, this._description.element, this._table.element, this._infoCard.element, this._player.element, this._form.element);
    }
    /** The header bar: title, status line and the ⓘ info toggle. */
    _buildHeader() {
        const header = document.createElement('div');
        header.style.cssText = (0, styles_1.barBottomStyle)();
        this._titleEl = document.createElement('span');
        this._titleEl.textContent = exports.DEFAULT_TITLE;
        this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;
        this._statusEl = document.createElement('span');
        this._statusEl.style.cssText =
            `flex:1;text-align:right;font-size:11px;color:${styles_1.COLORS.green};` +
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;`;
        this._statusEl.textContent = 'Loading…';
        this._infoToggle = document.createElement('button');
        this._infoToggle.innerHTML = infoPanel_1.INFO_ICON_CLOSED;
        this._infoToggle.style.cssText =
            `background:none;border:none;cursor:pointer;padding:2px;` +
                `flex-shrink:0;transition:all 0.15s;font-size:14px;color:${styles_1.COLORS.textSubtle};`;
        this._infoToggle.title = text_1.TOOLTIP.toggleInfo;
        this._infoToggle.onclick = () => this._toggleInfoPanel();
        this._infoToggle.onmouseenter = () => {
            this._infoToggle.style.backgroundColor = styles_1.COLORS.bgHover;
        };
        this._infoToggle.onmouseleave = () => {
            this._infoToggle.style.backgroundColor = 'transparent';
        };
        header.append(this._titleEl, this._statusEl, this._infoToggle);
        return header;
    }
    /** Wire section signals to the orchestration methods. */
    _connectSignals() {
        this._infoCard.prevRequested.connect(() => this._onPrev());
        this._infoCard.nextRequested.connect(() => this._onSkip());
        this._table.rowSelected.connect((_, { row, filteredIdx }) => {
            this._selectRow(filteredIdx);
            void this._player.loadRow(row);
        });
        this._form.submitted.connect(() => this._onSkip());
        this._form.prevRequested.connect(() => this._onPrev());
        this._form.nextRequested.connect(() => this._onSkip());
        this._form.reviewDeleted.connect(() => {
            // In the reviewed view keep the deleted item visible (just un-grey it): refreshing
            // would remove it from the list.
            if (this._table.viewMode === 'reviewed') {
                this._table.updateCurrentRowStyle();
            }
            else {
                this._table.refresh();
            }
        });
        this._form.annotationChanged.connect(() => this._player.renderFrame());
        this._form.activeToolChanged.connect(() => {
            this._player.updateCursor();
            this._player.renderFrame();
        });
        this._form.syncRequested.connect(() => void this._onSync());
        this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));
        this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error, s.warning));
    }
    // ── Initialization ───────────────────────────────────────────
    /**
     * Read the kernel config, validate the form config, initialize every section and select
     * the first row. Errors end up in the status line (and a dialog for invalid config).
     */
    async _init() {
        this._setStatus('Reading kernel variables…');
        let raw;
        try {
            raw = await this._kernelBridge.exec((0, python_1.readKernelVars)());
        }
        catch (e) {
            this._setStatus(`❌ ${(0, util_1.errorMessage)(e)}`, true);
            return;
        }
        let cfg;
        try {
            cfg = JSON.parse(raw);
        }
        catch (_a) {
            this._setStatus('❌ Failed to parse kernel config', true);
            return;
        }
        this._titleTemplate = cfg.info_card_title || '';
        this._textTemplate = cfg.info_card_text || '';
        const formConfig = JSON.parse(cfg.form_config);
        if (!(await this._validateFormConfig(formConfig)))
            return;
        let rows;
        try {
            rows = JSON.parse(cfg.data);
        }
        catch (_b) {
            this._setStatus('❌ Failed to parse detection data', true);
            return;
        }
        const appTitle = cfg.app_title || exports.DEFAULT_TITLE;
        this._titleEl.textContent = appTitle;
        this.title.label = appTitle;
        if (cfg.description) {
            try {
                const descCfg = JSON.parse(cfg.description);
                this._description.setConfig(descCfg, _parseHeight(cfg.description_height));
            }
            catch ( /* no description */_c) { /* no description */ }
        }
        const syncConfig = JSON.parse(cfg.sync_config || '{}');
        const audioConfig = await this._initSections(cfg, formConfig, rows, syncConfig);
        if (this._table.filtered.length > 0) {
            this._selectRow(0);
            await this._player.loadRow(this._table.filtered[0]);
        }
        this._setStatus(`✓ ${rows.length} clips loaded`);
        this._infoPanel.innerHTML = (0, infoPanel_1.infoPanelHtml)({
            cfg,
            audioConfig,
            outputPath: cfg.output,
            syncConfig,
            mergedConfig: cfg.merged_config ? JSON.parse(cfg.merged_config) : {},
            rowCount: Array.isArray(rows) ? rows.length : 0,
        });
    }
    /**
     * Validate the form config in the kernel.
     * @returns false (after reporting the problem) if it is invalid or validation failed.
     */
    async _validateFormConfig(formConfig) {
        try {
            const valRaw = await this._kernelBridge.exec((0, python_1.validateFormConfig)(JSON.stringify(formConfig)));
            const configErrors = JSON.parse(valRaw);
            if (configErrors.length > 0) {
                this._setStatus('❌ Config validation failed', true);
                await (0, util_1.showDialog)({
                    title: text_1.DIALOG.configValidationFailedTitle,
                    body: '• ' + configErrors.join('\n• '),
                });
                return false;
            }
        }
        catch (e) {
            this._setStatus(`❌ Validation error: ${(0, util_1.errorMessage)(e)}`, true);
            return false;
        }
        return true;
    }
    /**
     * Hand each section its config: form (built and loaded with output progress), player
     * and table, plus the info card height.
     * @returns The parsed audio config (for the info panel).
     */
    async _initSections(cfg, formConfig, rows, syncConfig) {
        var _a, _b;
        const duplicateEntries = !!cfg.duplicate_entries;
        const dataIndexCol = cfg.data_index_col;
        this._form.setContext({
            formConfig,
            rows,
            duplicateEntries,
            outputPath: cfg.output,
            dataIndexCol,
            outputIndexCol: cfg.output_index_col,
            syncConfig,
            height: _parseHeight(cfg.form_panel_height),
        });
        await this._form.build();
        await this._form.loadOutputFileProgress();
        await this._form.loadReviewedState();
        const audioConfig = JSON.parse(cfg.audio);
        this._player.setContext({
            audioConfig,
            captureLabel: (_a = cfg.capture) !== null && _a !== void 0 ? _a : '',
            captureDir: (_b = cfg.capture_dir) !== null && _b !== void 0 ? _b : '',
            captureHeight: _parseHeight(cfg.capture_height),
            titleTemplate: this._titleTemplate,
            defaultBuffer: cfg.default_buffer !== undefined && cfg.default_buffer !== ''
                ? parseFloat(cfg.default_buffer) : DEFAULT_BUFFER_SEC,
            specResolutions: JSON.parse(cfg.spec_resolutions || DEFAULT_SPEC_RESOLUTIONS),
            vizMeta: JSON.parse(cfg.viz_meta || '[]'),
            dataIndexCol,
            height: _parseHeight(cfg.player_height),
        });
        this._table.setData({
            rows,
            dataCols: JSON.parse(cfg.data_cols),
            duplicateEntries,
            dataIndexCol,
            sort: cfg.sort || '',
            sortOrder: cfg.sort_order || 'asc',
            height: _parseHeight(cfg.clip_table_height),
        });
        this._infoCard.setHeight(_parseHeight(cfg.info_card_height));
        return audioConfig;
    }
    // ── Row navigation ───────────────────────────────────────────
    /** Select a row of the filtered list: table highlight, info card and form follow it. */
    _selectRow(filteredIdx) {
        this._table.selectIndex(filteredIdx);
        const row = this._table.filtered[filteredIdx];
        if (!row)
            return;
        this._infoCard.render(row, {
            titleTemplate: this._titleTemplate,
            textTemplate: this._textTemplate,
            filteredIdx,
            filteredLength: this._table.filtered.length,
        });
        this._form.setSelectionInfo(filteredIdx, this._table.filtered.length);
        this._form.updateFromRow(row);
        this._player.clearAnnotDisplay();
    }
    /** Go to the previous row (if any) and load its audio. */
    _onPrev() {
        this._step(-1);
    }
    /** Go to the next row (if any) and load its audio — after submit, Skip or Next. */
    _onSkip() {
        this._step(1);
    }
    /** Move the selection by ``delta`` rows when the target row exists. */
    _step(delta) {
        const target = this._table.selectedIdx + delta;
        if (target < 0 || target >= this._table.filtered.length)
            return;
        this._selectRow(target);
        this._table.ensurePageShowsSelected();
        void this._player.loadRow(this._table.filtered[target]);
    }
    // ── Sync / info panel / status ───────────────────────────────
    /** Upload the output file to its sync URI (the form's sync button). */
    async _onSync() {
        this._setStatus('Syncing…');
        try {
            await this._kernelBridge.exec((0, python_1.syncOutput)());
            this._setStatus('✓ Sync complete');
        }
        catch (e) {
            this._setStatus(`❌ Sync failed: ${(0, util_1.errorMessage)(e)}`, true);
        }
        finally {
            this._form.setSyncBusy(false); // re-syncing is always allowed (it re-uploads)
        }
    }
    /** Show / hide the ⓘ info panel. */
    _toggleInfoPanel() {
        const isVisible = this._infoPanel.style.display !== 'none';
        this._infoPanel.style.display = isVisible ? 'none' : 'block';
        this._infoToggle.innerHTML = isVisible ? infoPanel_1.INFO_ICON_CLOSED : infoPanel_1.INFO_ICON_OPEN;
        this._infoToggle.style.color = isVisible ? styles_1.COLORS.textSubtle : styles_1.COLORS.blue;
    }
    /** Show ``msg`` in the header status line (red for errors, yellow for warnings). */
    _setStatus(msg, error = false, warning = false) {
        this._statusEl.textContent = msg;
        this._statusEl.style.color = error ? styles_1.COLORS.red : warning ? styles_1.COLORS.yellow : styles_1.COLORS.green;
    }
}
exports.BioacousticWidget = BioacousticWidget;
//
// Internal
//
/** A section height from the config (px), or undefined for "use the default". */
function _parseHeight(raw) {
    return parseInt(raw) || undefined;
}


/***/ },

/***/ "./lib/boxEdges.js"
/*!*************************!*\
  !*** ./lib/boxEdges.js ***!
  \*************************/
(__unused_webpack_module, exports) {


/**
 * Pure geometry for dragging a box edge on the spectrogram (no DOM), so it can be unit-tested.
 *
 * License: BSD 3-Clause
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.dragBoxEdge = void 0;
//
// Public
//
/**
 * The bound a drag of ``edge`` changes, and its new value. The edge follows the cursor but
 * never crosses the opposite edge.
 *
 * @param box - The box being resized.
 * @param edge - Which edge is being dragged.
 * @param time - Cursor time (s).
 * @param freq - Cursor frequency (Hz).
 */
function dragBoxEdge(box, edge, time, freq) {
    switch (edge) {
        case 'left': return { field: 'startTime', value: Math.min(time, box.endTime) };
        case 'right': return { field: 'endTime', value: Math.max(time, box.startTime) };
        case 'top': return { field: 'maxFreq', value: Math.max(freq, box.minFreq) };
        case 'bottom': return { field: 'minFreq', value: Math.min(freq, box.maxFreq) };
    }
}
exports.dragBoxEdge = dragBoxEdge;


/***/ },

/***/ "./lib/config_builder/ConfigPanel.js"
/*!*******************************************!*\
  !*** ./lib/config_builder/ConfigPanel.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigPanel = void 0;
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const builderKernel_1 = __webpack_require__(/*! ./builderKernel */ "./lib/config_builder/builderKernel.js");
const builderSections_1 = __webpack_require__(/*! ./builderSections */ "./lib/config_builder/builderSections.js");
const builderState_1 = __webpack_require__(/*! ./builderState */ "./lib/config_builder/builderState.js");
const constants_1 = __webpack_require__(/*! ./constants */ "./lib/config_builder/constants.js");
const panelChrome_1 = __webpack_require__(/*! ./panelChrome */ "./lib/config_builder/panelChrome.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
const saveFlow_1 = __webpack_require__(/*! ./saveFlow */ "./lib/config_builder/saveFlow.js");
const ConfigSummary_1 = __webpack_require__(/*! ./sections/ConfigSummary */ "./lib/config_builder/sections/ConfigSummary.js");
const statusLine_1 = __webpack_require__(/*! ./statusLine */ "./lib/config_builder/statusLine.js");
const YamlPanel_1 = __webpack_require__(/*! ./YamlPanel */ "./lib/config_builder/YamlPanel.js");
//
// Constants
//
const MAX_STATUS_LABEL = 60;
//
// Public
//
class ConfigPanel {
    /** @param kernel - The builder widget's kernel (setup starts immediately). */
    constructor(kernel) {
        this._status = new statusLine_1.StatusLine();
        this._s = new builderSections_1.BuilderSections();
        this._yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
        this._dirty = false;
        this._savedPath = '';
        this._suppressChanges = false;
        this._dirtyCallbacks = [];
        this._summary = new ConfigSummary_1.ConfigSummary();
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;flex:1;overflow:hidden;position:relative;`;
        const left = document.createElement('div');
        left.style.cssText =
            `display:flex;flex-direction:column;flex:1;overflow-y:auto;min-width:0;`;
        for (const [name, section] of this._s.all) {
            this._wireSection(name, section);
            left.appendChild(section.element);
        }
        this._s.form.changed.connect(() => void this._updateSummary());
        for (const sec of this._s.targeted) {
            sec.targetChanged.connect((_, { section, target }) => {
                void this._onTargetChanged(section, target);
            });
        }
        left.appendChild(this._summary.element);
        this._wireSetup();
        this._wireSources();
        this._yamlPanel = new YamlPanel_1.YamlPanel();
        this._yamlPanel.configEdited.connect((_, { yaml, configType }) => {
            void this._onYamlEdited(yaml, configType);
        });
        this._yamlPanel.saveSingleRequested.connect((_, configType) => {
            void this._saveSingleFile(configType);
        });
        this._yamlPanel.refreshRequested.connect(() => {
            void this._confirmAndRefresh();
        });
        this.element.append(left, (0, panelChrome_1.makeResizeHandle)(this._yamlPanel.element), this._yamlPanel.element);
        this._bk = new builderKernel_1.BuilderKernel(kernel, this._status);
        this._saveFlow = new saveFlow_1.SaveFlow(this._bk, this._status, () => this._s.configFiles.getData());
    }
    /** The status message element (placed in the widget header). */
    get statusEl() {
        return this._status.element;
    }
    /** Unsaved changes in the kernel-side builder. */
    get dirty() {
        return this._dirty;
    }
    /** The builder's kernel. */
    get kernel() {
        return this._bk.bridge;
    }
    /** Whether an enabled project file with a path is configured (Open Annotator shown). */
    get isProjectConfigured() {
        const d = this._s.configFiles.getData();
        return !!(d.project_enabled && d.project_path);
    }
    /** Run ``cb`` with the kernel's cwd once known. */
    onCwdReady(cb) {
        this._bk.onCwdReady(cb);
    }
    /** Call ``cb`` on any section change and whenever the dirty flag may have changed. */
    onAnyChanged(cb) {
        for (const section of this._s.all.values()) {
            section.changed.connect(() => cb());
        }
        this._dirtyCallbacks.push(cb);
    }
    /** ``chdir`` the kernel; resolves to the new cwd or null. */
    async setCwd(newDir) {
        return this._bk.setCwd(newDir);
    }
    /** Pick a folder with the overlay file browser. */
    browseDirectory(startDir, onSelect) {
        this._openBrowser(startDir, [], onSelect, true);
    }
    /** Validate and report the result. */
    async validate() {
        await this._saveFlow.validate();
    }
    /** Validate (letting the user save despite errors) and save. */
    async saveToFile() {
        await this._validateAndSave(false);
    }
    /** Validate (errors block) and save; resolves to the file to open, or null. */
    async saveAndOpenAnnotator() {
        return this._validateAndSave(true);
    }
    /** Validate the unchanged files before opening; resolves to the file to open, or null. */
    async validateAndOpen() {
        return this._saveFlow.validateForOpen();
    }
    _wireSection(name, section) {
        section.focused.connect(() => this._yamlPanel.showForSection(name, this._yamls));
        section.fieldFocused.connect((_, field) => {
            if (field.startsWith('description')) {
                this._yamlPanel.switchToTab('config');
            }
            this._yamlPanel.scrollToField(field);
        });
        section.changed.connect(() => void this._onSectionChanged(name));
        section.opened.connect(() => this._s.closeOthers(section));
    }
    /** Setup (create / template / load) and Configuration Files signals. */
    _wireSetup() {
        this._s.setup.browseRequested.connect((_, { field }) => {
            if (field === 'project' || field === 'config' || field === 'form') {
                void this._resolveConfigDir(constants_1.CONFIG_DIRS[field]).then(dir => {
                    this._openBrowser(dir, constants_1.YAML_EXTS, (p) => this._s.setup.setLoadPath(p));
                });
            }
        });
        this._s.setup.projectCreated.connect((_, name) => {
            this._s.app.setProjectName(name);
            this._s.configFiles.initFromCreate(name);
            void this._onSectionChanged('project');
            void this._onSectionChanged('app');
        });
        this._s.configFiles.projectEnabledChanged.connect(() => void this._onProjectEnabledChanged());
        this._s.configFiles.fileStatesChanged.connect((_, states) => this._s.updateTargetOptions(states));
        this._s.configFiles.lockStatesChanged.connect(() => this._applyFileLocks());
        this._s.setup.loadConfigRequested.connect((_, { field, path }) => void this._onLoadConfig(path, field));
        this._s.setup.templateListRequested.connect(() => void this._onListTemplates());
        this._s.setup.templateSelected.connect((_, name) => void this._onLoadTemplate(name));
        this._s.setup.applyTemplateRequested.connect((_, payload) => void this._onApplyTemplate(payload));
        this._s.setup.templateBrowseRequested.connect((_, { key, exts, current }) => {
            this._openBrowser(current, exts, (p) => this._s.setup.setTemplateFieldValue(key, p));
        });
        this._s.setup.templateColumnsRequested.connect((_, path) => void this._onTemplateColumns(path));
    }
    /** Data / audio / output / app / description / form browse and column signals. */
    _wireSources() {
        this._s.data.fileLoadRequested.connect((_, path) => void this._onLoadColumns(path));
        this._s.data.sourceLoadRequested.connect((_, req) => void this._onLoadSourceColumns(req));
        this._s.data.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, constants_1.DATA_EXTS, (p) => this._s.data.setPath(p));
        });
        this._s.data.columnsLoaded.connect((_, cols) => {
            this._s.app.setColumnOptions(cols);
            this._s.audio.setColumnOptions(cols);
            this._s.output.setColumnOptions(cols);
        });
        this._s.audio.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, constants_1.AUDIO_EXTS, (p) => this._s.audio.setPath(p));
        });
        this._s.audio.validateRequested.connect((_, value) => void this._onValidateAudio(value));
        this._s.output.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, constants_1.OUTPUT_EXTS, (p) => this._s.output.setOutputPath(p));
        });
        this._s.app.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, [], (p) => this._s.app.setCaptureDir(p), true);
        });
        this._s.description.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, constants_1.DESCRIPTION_EXTS, (p) => this._s.description.setDescriptionPath(p));
        });
        this._s.form.browseRequested.connect((_, { callback }) => {
            this._openBrowser('.', constants_1.ITEMS_FILE_EXTS, callback);
        });
        this._s.form.columnsRequested.connect((_, { path, callback }) => {
            void this._bk.call((0, python_1.readColumns)(path), null, (r) => callback(r.columns));
        });
    }
    async _onSectionChanged(sectionName) {
        if (this._suppressChanges)
            return;
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        const section = this._s.all.get(sectionName);
        if (!section)
            return;
        const data = section.getData();
        const uiTarget = section.getTarget();
        const target = uiTarget === 'form' ? 'form_config' : uiTarget;
        this._bk.dbg('sectionChanged', sectionName, data, 'target=', target);
        this._status.set('Updating…');
        await this._bk.run((0, python_1.updateSection)(sectionName, data, target), 'Error', (state) => {
            this._applyStatePartial(state);
            void this._updateSummary();
            this._status.set('Ready');
        });
    }
    async _onProjectEnabledChanged() {
        await this._bk.call((0, python_1.updateSection)('project', this._s.configFiles.getData()), null, (state) => this._applyStatePartial(state));
    }
    async _onTargetChanged(section, target) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set('Updating target…');
        const pyTarget = target === 'form' ? 'form_config' : target;
        await this._bk.run((0, python_1.setSectionTarget)(section, pyTarget), 'Error', (state) => {
            this._applyStatePartial(state);
            this._applyFileLocks();
            this._status.set('Ready');
        });
    }
    /** ``preferred`` if it exists in the kernel's cwd, else ``.``. */
    async _resolveConfigDir(preferred) {
        const exists = await this._bk.run((0, python_1.checkFileExists)(preferred), null, (r) => r.exists);
        return exists ? preferred : '.';
    }
    _openBrowser(dir, extensions, onSelect, dirOnly = false) {
        (0, panelChrome_1.openFileBrowserOverlay)(this.element, this._bk.bridge, {
            dir, extensions, dirOnly,
            onSelect: (path) => {
                onSelect(path);
                this._status.set(`Selected: ${path}`);
            },
        });
    }
    async _saveSingleFile(configType) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set(`Saving ${configType} file…`);
        await this._bk.run((0, python_1.saveSingleFile)(configType), 'Save failed', (r) => {
            this._status.set(`Saved: ${r.saved_to}`);
        });
    }
    async _onLoadColumns(pathOrDir) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set('Loading columns…');
        await this._bk.run((0, python_1.readColumns)(pathOrDir), 'Error', (r) => {
            this._s.data.setDetectedColumns(r.columns);
            this._status.set(`${r.columns.length} columns loaded`);
        });
    }
    /** Load the data columns for ``path`` if it is a data file (after a load / template). */
    _loadDataColumnsIfFile() {
        const dataPath = this._s.data.getPath();
        if (dataPath && constants_1.DATA_FILE_RE.test(dataPath)) {
            void this._onLoadColumns(dataPath);
        }
    }
    async _onLoadSourceColumns(req) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        const label = this._shortLabel(req.value);
        this._status.set(`Loading ${label}…`);
        await this._bk.run((0, python_1.readColumnsFromSource)(req.sourceType, req.value, req.secrets), (e) => {
            this._s.data.setDetectedColumns([]);
            this._s.data.setLoadStatus(false);
            this._status.set(`Load failed: ${(0, util_1.errorMessage)(e)}`, 'error');
        }, (r) => {
            const cols = r.columns || [];
            this._s.data.setDetectedColumns(cols);
            this._s.data.setLoadStatus(true);
            this._status.set(`Loaded ${cols.length} columns from ${label}`);
        });
    }
    async _onValidateAudio(value) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set(`Checking ${this._shortLabel(value)}…`);
        await this._bk.run((0, python_1.checkAudioUrl)(value), (e) => {
            this._s.audio.setValidateStatus(false);
            this._status.set(`Audio not reachable: ${(0, util_1.errorMessage)(e)}`, 'error');
        }, (info) => {
            var _a;
            const parts = [];
            if (typeof info.duration === 'number')
                parts.push(_fmtDuration(info.duration));
            parts.push(`${info.sample_rate} Hz`);
            if (((_a = info.channels) !== null && _a !== void 0 ? _a : 0) > 1)
                parts.push(`${info.channels} ch`);
            this._s.audio.setValidateStatus(true);
            this._status.set(`Audio reachable — ${parts.join(' · ')}`);
        });
    }
    async _onYamlEdited(yaml, configType) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set('Applying edits…');
        await this._bk.run((0, python_1.updateConfigFromYaml)(yaml, configType), 'Error', (state) => {
            if (state.update_ok) {
                this._applyState(state);
                this._status.set('Config updated');
            }
            else {
                this._status.set('Invalid YAML', 'error');
            }
        });
    }
    async _confirmAndRefresh() {
        const { path } = (0, builderState_1.activeFilePath)(this._s.configFiles.getData());
        if (!path) {
            this._status.set('No active file to reload', 'error');
            return;
        }
        const choice = await (0, util_1.showDialog)({
            title: 'Reload YAML',
            body: 'Reloading will erase unsaved changes. Continue?',
            buttons: [
                { label: 'Cancel' },
                { label: 'Reload', primary: true },
            ],
        });
        if (choice !== 'Reload')
            return;
        await this._onLoadConfig(path);
    }
    async _validateAndSave(blockOnErrors) {
        return this._saveFlow.validateAndSave(blockOnErrors, (state) => {
            this._dirty = false;
            const paths = state.saved_paths || {};
            this._bk.dbg('saved', paths);
            const savedList = Object.values(paths).join(', ');
            // open the project file when it's enabled, even if locked (not rewritten, but it exists)
            const active = (0, builderState_1.activeFilePath)(this._s.configFiles.getData()).path;
            this._savedPath =
                (active && (0, builderState_1.withYamlExt)(active)) || paths.project || paths.config || paths.form || '';
            this._status.set(`Saved: ${savedList}`);
            for (const cb of this._dirtyCallbacks)
                cb();
            return this._savedPath;
        });
    }
    async _onListTemplates() {
        await this._bk.call((0, python_1.listTemplates)(), 'Failed to list templates', (r) => this._s.setup.setTemplateList(r.templates || []));
    }
    async _onTemplateColumns(path) {
        // a bad/missing path just leaves the dropdown empty
        await this._bk.call((0, python_1.readColumns)(path), null, (r) => {
            this._s.setup.setTemplateColumns(path, r.columns || []);
        });
    }
    async _onLoadTemplate(name) {
        await this._bk.call((0, python_1.loadTemplate)(name), 'Failed to load template', (r) => this._s.setup.setTemplate(name, r.template || {}));
    }
    async _onApplyTemplate(payload) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._status.set('Applying template…');
        const applied = await this._bk.run((0, python_1.applyTemplate)(payload.name, payload.scope, payload.projectName, payload.values), 'Template failed', (state) => {
            this._applyState(state);
            this._loadDataColumnsIfFile();
            return true;
        });
        if (!applied)
            return;
        // Reuse the standard validate → overwrite-prompt → save flow.
        const saved = await this._validateAndSave(true);
        if (saved) {
            // Lock the form (greyed, Edit button) and collapse Setup; reopening the
            // section still shows the disabled form.
            this._s.setup.markTemplateSaved();
            this._s.setup.close();
            this._status.set(`Created ${payload.projectName} — ${saved}`);
        }
    }
    async _onLoadConfig(path, fileType) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        this._bk.dbg('loadConfig', path, fileType);
        this._status.set(`Loading ${path}…`);
        await this._bk.run((0, python_1.loadConfig)(path, fileType), (e) => {
            const msg = (0, util_1.errorMessage)(e);
            const fnf = msg.match(/FileNotFoundError:\s*(.+)/);
            this._status.set(fnf ? `File not found: ${fnf[1]}` : `Load failed: ${msg}`, 'error');
        }, (state) => {
            this._applyState(state);
            this._loadDataColumnsIfFile();
            this._reportLoaded(state);
        });
    }
    /** Status after a load: what was loaded, plus referenced files that weren't found. */
    _reportLoaded(state) {
        const detected = state.detected_type || 'config';
        const paths = state.loaded_paths || {};
        const loaded = Object.values(paths).filter(Boolean);
        const projectData = state.project || {};
        const missing = [];
        for (const ft of ['config', 'form']) {
            if (projectData[`${ft}_enabled`] && projectData[`${ft}_path`] && !paths[ft]) {
                missing.push(`${ft} not found: ${projectData[`${ft}_path`]}`);
            }
        }
        const warn = missing.length ? ` (⚠ ${missing.join(', ')})` : '';
        this._status.set(`Loaded as ${detected}: ${loaded.join(', ')}${warn}`, missing.length > 0 ? 'error' : 'ok');
    }
    /** Take the kernel's YAML previews and dirty flag (after an edit; sections untouched). */
    _applyStatePartial(state) {
        this._setYamls(state);
        const wasDirty = this._dirty;
        this._dirty = !!state.dirty;
        this._savedPath = state.saved_path || '';
        if (this._dirty !== wasDirty) {
            for (const cb of this._dirtyCallbacks)
                cb();
        }
    }
    /** Replace every section's contents with a loaded / applied state. */
    _applyState(state) {
        this._bk.dbg('applyState', {
            targets: state.section_targets,
            projectKeys: Object.keys(state.project || {}),
            configKeys: Object.keys(state.config || {}),
        });
        this._suppressChanges = true;
        try {
            this._setYamls(state);
            this._dirty = !!state.dirty;
            this._savedPath = state.saved_path || '';
            this._s.fill(state);
            void this._updateSummary();
        }
        finally {
            this._suppressChanges = false;
        }
        this._applyFileLocks();
        for (const cb of this._dirtyCallbacks)
            cb();
    }
    _setYamls(state) {
        this._yamls = {
            project_yaml: state.project_yaml || '',
            config_yaml: state.config_yaml || '',
            form_yaml: state.form_yaml || '',
        };
        this._yamlPanel.updateYaml(this._yamls);
    }
    _applyFileLocks() {
        this._s.applyFileLocks(this._bk.routingKeys);
    }
    async _updateSummary() {
        if (!this._bk.isReady)
            return;
        await this._bk.run((0, python_1.getSummary)(), null, (sections) => {
            this._summary.update(sections);
        });
    }
    /** ``value`` cut to the status line's width. */
    _shortLabel(value) {
        return value.length > MAX_STATUS_LABEL ? value.slice(0, MAX_STATUS_LABEL - 3) + '…' : value;
    }
}
exports.ConfigPanel = ConfigPanel;
//
// Internal
//
/** ``sec`` as "1h 2m" / "3m 4s" / "5s". */
function _fmtDuration(sec) {
    const s = Math.round(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h)
        return `${h}h ${m}m`;
    if (m)
        return `${m}m ${rem}s`;
    return `${rem}s`;
}


/***/ },

/***/ "./lib/config_builder/FileBrowser.js"
/*!*******************************************!*\
  !*** ./lib/config_builder/FileBrowser.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FileBrowser = void 0;
/**
 * Modal file / folder picker for the builder, listing directories through the kernel's
 * ``list_files`` (so it sees the kernel's filesystem, not the browser's). Folder mode adds
 * "Select this folder" and New Folder.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
//
// Constants
//
/** The browser's compact, flexible text inputs (filename, new folder). */
const SMALL_INPUT_STYLE = () => `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
    `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
    `font-size:11px;flex:1;box-sizing:border-box;`;
//
// Public
//
class FileBrowser {
    /**
     * @param kernel - Kernel to list files with.
     * @param startDir - Directory to open (a file path opens its directory).
     * @param extensions - Only show files with these extensions (all when empty).
     * @param dirOnly - Pick a folder instead of a file.
     * @param rootDir - Root that emitted paths are made relative to.
     */
    constructor(kernel, startDir, extensions, dirOnly = false, rootDir) {
        /** A file (or, in folder mode, a folder) was chosen; the path is relative to the start dir. */
        this.fileSelected = new signaling_1.Signal(this);
        /** Closed without a choice. */
        this.dismissed = new signaling_1.Signal(this);
        this._startDir = '';
        this._kernel = kernel;
        const hasExt = /\.[a-z0-9]+$/i.test(startDir);
        this._cwd = hasExt ? (startDir.replace(/\/[^/]+$/, '') || '.') : (startDir || '.');
        this._extensions = extensions;
        this._dirOnly = dirOnly;
        this._rootDir = rootDir;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;` +
                `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:6px;` +
                `box-shadow:0 8px 24px rgba(0,0,0,0.5);overflow:hidden;`;
        const header = document.createElement('div');
        header.style.cssText =
            `display:flex;align-items:center;gap:8px;padding:8px 12px;` +
                `background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        const title = document.createElement('span');
        title.textContent = dirOnly ? 'Select Folder' : 'Browse Files';
        title.style.cssText = `font-size:13px;font-weight:700;color:${styles_1.COLORS.textPrimary};flex:1;`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:12px;padding:2px 8px;`;
        closeBtn.addEventListener('click', () => this.dismissed.emit(void 0));
        header.append(title, closeBtn);
        this._pathBar = document.createElement('div');
        this._pathBar.style.cssText =
            `padding:6px 12px;font-size:11px;color:${styles_1.COLORS.textSubtle};font-family:monospace;` +
                `background:${styles_1.COLORS.bgSurface0};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;` +
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        this._listEl = document.createElement('div');
        this._listEl.style.cssText =
            `flex:1;overflow-y:auto;display:flex;flex-direction:column;`;
        this._footerRow = document.createElement('div');
        this._footerRow.style.cssText =
            `display:${dirOnly ? 'none' : 'flex'};align-items:center;gap:6px;padding:6px 12px;` +
                `background:${styles_1.COLORS.bgMantle};border-top:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        const fnLabel = document.createElement('span');
        fnLabel.textContent = 'Filename:';
        fnLabel.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;flex-shrink:0;`;
        this._filenameInput = document.createElement('input');
        this._filenameInput.type = 'text';
        this._filenameInput.placeholder = 'new_file.yaml';
        this._filenameInput.style.cssText = SMALL_INPUT_STYLE();
        this._filenameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                this._confirmFilename();
        });
        this._confirmBtn = document.createElement('button');
        this._confirmBtn.textContent = 'Select';
        this._confirmBtn.style.cssText = (0, styles_1.btnStyle)(true) + `font-size:11px;padding:3px 10px;`;
        this._confirmBtn.addEventListener('click', () => this._confirmFilename());
        this._footerRow.append(fnLabel, this._filenameInput, this._confirmBtn);
        this._statusEl = document.createElement('span');
        this._statusEl.style.cssText =
            `padding:4px 12px;font-size:11px;color:${styles_1.COLORS.textMuted};flex-shrink:0;` +
                `background:${styles_1.COLORS.bgMantle};`;
        this.element.append(header, this._pathBar, this._listEl, this._footerRow, this._statusEl);
        this.element.tabIndex = 0;
        this.element.addEventListener('keydown', (e) => {
            // Enter = "select this folder", except in a text box (e.g. the new-folder name), which
            // handles its own Enter; it used to bubble here and also select the parent folder
            if (e.target instanceof HTMLInputElement)
                return;
            if (e.key === 'Enter' && this._dirOnly) {
                this.fileSelected.emit(this._emitPath(this._cwd));
            }
        });
        void this._loadDir(this._cwd);
    }
    async _loadDir(dir) {
        this._cwd = dir;
        this._pathBar.textContent = dir;
        this._listEl.innerHTML = '';
        this._statusEl.textContent = 'Loading…';
        try {
            const raw = await this._kernel.exec((0, python_1.listFiles)(dir, this._extensions, this._rootDir));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            if (result.resolved) {
                this._cwd = result.resolved;
                if (!this._startDir) {
                    this._startDir = result.resolved;
                }
                if (result.root_resolved) {
                    this._startDir = result.root_resolved;
                }
                this._pathBar.textContent = this._displayPath();
            }
            const entries = result.files;
            this._renderEntries(entries);
            this._statusEl.textContent = `${entries.length} items`;
        }
        catch (e) {
            this._statusEl.textContent = `Error: ${(0, util_1.errorMessage)(e)}`;
        }
    }
    _renderEntries(entries) {
        this._listEl.innerHTML = '';
        if (this._dirOnly) {
            const selectRow = document.createElement('div');
            selectRow.style.cssText =
                `display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;` +
                    `font-size:12px;color:${styles_1.COLORS.green};font-weight:700;` +
                    `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};background:${styles_1.COLORS.bgSurface0};`;
            selectRow.textContent = `\u2713 Select this folder: ${this._displayPath()}`;
            selectRow.addEventListener('click', () => {
                this.fileSelected.emit(this._emitPath(this._cwd));
            });
            selectRow.addEventListener('mouseenter', () => { selectRow.style.background = styles_1.COLORS.bgHover; });
            selectRow.addEventListener('mouseleave', () => { selectRow.style.background = styles_1.COLORS.bgSurface0; });
            this._listEl.appendChild(selectRow);
            const newFolderRow = document.createElement('div');
            newFolderRow.style.cssText =
                `display:flex;align-items:center;gap:6px;padding:4px 12px;` +
                    `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
            const nfInput = document.createElement('input');
            nfInput.type = 'text';
            nfInput.placeholder = 'new folder name';
            nfInput.style.cssText = SMALL_INPUT_STYLE();
            const nfBtn = document.createElement('button');
            nfBtn.textContent = '+ New Folder';
            nfBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:3px 8px;`;
            const doCreate = async () => {
                const name = nfInput.value.trim();
                if (!name)
                    return;
                const newPath = this._cwd === '.' ? name : `${this._cwd}/${name}`;
                try {
                    await this._kernel.exec((0, python_1.createDirectory)(newPath));
                    void this._loadDir(newPath);
                }
                catch (e) {
                    this._statusEl.textContent = `Error: ${(0, util_1.errorMessage)(e)}`;
                }
            };
            nfBtn.addEventListener('click', doCreate);
            nfInput.addEventListener('keydown', (e) => { if (e.key === 'Enter')
                void doCreate(); });
            newFolderRow.append(nfInput, nfBtn);
            this._listEl.appendChild(newFolderRow);
        }
        const upRow = this._makeEntryRow('📁', '..', true);
        upRow.addEventListener('click', () => {
            if (this._cwd === '/')
                return;
            const parts = this._cwd.replace(/\/$/, '').split('/');
            parts.pop();
            const parent = parts.length <= 1 ? (parts[0] || '/') : parts.join('/');
            void this._loadDir(parent);
        });
        this._listEl.appendChild(upRow);
        for (const entry of entries) {
            if (this._dirOnly && !entry.is_dir)
                continue;
            const icon = entry.is_dir ? '📁' : '📄';
            const row = this._makeEntryRow(icon, entry.name, entry.is_dir);
            if (entry.is_dir) {
                row.addEventListener('click', () => {
                    void this._loadDir(`${this._cwd}/${entry.name}`);
                });
            }
            else {
                row.addEventListener('click', () => {
                    this.fileSelected.emit(this._emitPath(`${this._cwd}/${entry.name}`));
                });
            }
            this._listEl.appendChild(row);
        }
    }
    _displayPath() {
        if (!this._startDir || !this._cwd.startsWith(this._startDir)) {
            return this._cwd;
        }
        const rel = this._cwd.substring(this._startDir.length);
        if (!rel)
            return '.';
        return '.' + rel;
    }
    _emitPath(absPath) {
        if (!this._startDir || !absPath.startsWith(this._startDir)) {
            return absPath;
        }
        const rel = absPath.substring(this._startDir.length);
        if (!rel)
            return '.';
        return rel.startsWith('/') ? rel.substring(1) : rel;
    }
    _confirmFilename() {
        const name = this._filenameInput.value.trim();
        if (!name)
            return;
        this.fileSelected.emit(this._emitPath(`${this._cwd}/${name}`));
    }
    _makeEntryRow(icon, name, isDir) {
        const row = document.createElement('div');
        row.style.cssText =
            `display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;` +
                `font-size:12px;color:${isDir ? styles_1.COLORS.blue : styles_1.COLORS.textPrimary};` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
        row.addEventListener('mouseenter', () => { row.style.background = styles_1.COLORS.bgHover; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
        const iconEl = document.createElement('span');
        iconEl.textContent = icon;
        iconEl.style.cssText = `font-size:14px;flex-shrink:0;`;
        const nameEl = document.createElement('span');
        nameEl.textContent = name;
        nameEl.style.cssText = `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        row.append(iconEl, nameEl);
        return row;
    }
}
exports.FileBrowser = FileBrowser;


/***/ },

/***/ "./lib/config_builder/YamlPanel.js"
/*!*****************************************!*\
  !*** ./lib/config_builder/YamlPanel.js ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.YamlPanel = void 0;
/**
 * The builder's collapsible right-hand pane: per-section docs (field cards highlighted as the
 * user edits) or a preview of the three generated YAML files, with Edit -> Apply, Save File
 * and Reload YAML.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const docs_1 = __webpack_require__(/*! ./docs */ "./lib/config_builder/docs.js");
//
// Constants
//
const EXPANDED_WIDTH = '350px';
const COLLAPSED_WIDTH = '36px';
/** YAML tabs: kernel config type -> tab label. */
const YAML_TABS = [
    ['project', 'project'], ['config', 'config'], ['form_config', 'form'],
];
/** Docs heading per section, where it differs from the section name. */
const SECTION_TITLES = { project: 'Setup', app: 'Application' };
//
// Public
//
class YamlPanel {
    constructor() {
        /** Apply clicked on edited YAML (``configType``: project / config / form_config). */
        this.configEdited = new signaling_1.Signal(this);
        /** Save File clicked (payload: the shown config type). */
        this.saveSingleRequested = new signaling_1.Signal(this);
        /** Reload YAML clicked. */
        this.refreshRequested = new signaling_1.Signal(this);
        this._expanded = true;
        this._editing = false;
        this._configType = 'project';
        this._mode = 'docs';
        this._yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
        this._yamlTabs = new Map();
        this._activeField = null;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;flex-direction:column;width:${EXPANDED_WIDTH};overflow:hidden;` +
                `border-left:1px solid ${styles_1.COLORS.bgSurface0};transition:width 0.2s ease;flex-shrink:0;`;
        const header = document.createElement('div');
        header.style.cssText =
            `display:flex;align-items:center;gap:6px;padding:6px 10px;` +
                `background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;` +
                `overflow:hidden;white-space:nowrap;`;
        this._toggleBtn = document.createElement('button');
        this._toggleBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:2px 8px;`;
        this._toggleBtn.textContent = '▶';
        this._toggleBtn.addEventListener('click', () => this.toggle());
        header.appendChild(this._toggleBtn);
        this._modeBar = document.createElement('div');
        this._modeBar.style.cssText =
            `display:flex;gap:0;background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        this._docsBtn = document.createElement('button');
        this._docsBtn.textContent = 'docs';
        this._docsBtn.style.cssText = this._modeTabStyle(true);
        this._docsBtn.addEventListener('click', () => this._setMode('docs'));
        this._yamlBtn = document.createElement('button');
        this._yamlBtn.textContent = 'yaml';
        this._yamlBtn.style.cssText = this._modeTabStyle(false);
        this._yamlBtn.addEventListener('click', () => this._setMode('yaml'));
        this._modeBar.append(this._docsBtn, this._yamlBtn);
        this._docsContent = document.createElement('div');
        this._docsContent.style.cssText =
            `flex:1;overflow-y:auto;padding:12px;font-size:12px;line-height:1.6;` +
                `color:${styles_1.COLORS.textPrimary};background:${styles_1.COLORS.bgBase};`;
        this._yamlContent = document.createElement('div');
        this._yamlContent.style.cssText =
            `flex:1;overflow:auto;position:relative;display:none;flex-direction:column;`;
        this._yamlTabBar = document.createElement('div');
        this._yamlTabBar.style.cssText =
            `display:none;gap:0;background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        for (const [t, label] of YAML_TABS) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText =
                `flex:1;padding:4px 8px;font-size:11px;border:none;cursor:pointer;` +
                    `background:${t === 'project' ? styles_1.COLORS.bgSurface0 : 'transparent'};` +
                    `color:${t === 'project' ? styles_1.COLORS.textPrimary : styles_1.COLORS.textMuted};`;
            btn.addEventListener('click', () => this._switchYamlTab(t));
            this._yamlTabs.set(t, btn);
            this._yamlTabBar.appendChild(btn);
        }
        this._display = document.createElement('pre');
        this._display.style.cssText =
            `margin:0;padding:10px;font-size:12px;line-height:1.6;font-family:monospace;` +
                `color:${styles_1.COLORS.textPrimary};white-space:pre-wrap;word-wrap:break-word;` +
                `background:${styles_1.COLORS.bgMantle};flex:1;`;
        this._display.textContent = '# (empty)';
        this._editor = document.createElement('textarea');
        this._editor.style.cssText =
            (0, styles_1.inputStyle)() +
                `width:100%;height:100%;box-sizing:border-box;resize:none;font-family:monospace;` +
                `font-size:12px;line-height:1.6;padding:10px;display:none;border:none;border-radius:0;` +
                `position:absolute;inset:0;`;
        this._editBtn = document.createElement('button');
        this._editBtn.textContent = 'Edit';
        this._editBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:2px 8px;`;
        this._editBtn.addEventListener('click', () => this._startEdit());
        const saveFileBtn = document.createElement('button');
        saveFileBtn.textContent = 'Save File';
        saveFileBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:2px 8px;`;
        saveFileBtn.addEventListener('click', () => {
            this.saveSingleRequested.emit(this._configType);
        });
        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = 'Reload YAML';
        refreshBtn.title = 'Reload active file from disk';
        refreshBtn.style.cssText = (0, styles_1.btnStyle)(true) + `font-size:11px;padding:2px 8px;`;
        refreshBtn.addEventListener('click', () => this.refreshRequested.emit());
        const headerSpacer = document.createElement('span');
        headerSpacer.style.flex = '1';
        header.append(this._editBtn, saveFileBtn, headerSpacer, refreshBtn);
        this._editBar = document.createElement('div');
        this._editBar.style.cssText =
            `display:none;gap:6px;padding:6px 10px;` +
                `background:${styles_1.COLORS.bgMantle};border-top:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        this._saveBtn = document.createElement('button');
        this._saveBtn.textContent = 'Apply';
        this._saveBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        this._saveBtn.addEventListener('click', () => this._applyEdit());
        this._cancelBtn = document.createElement('button');
        this._cancelBtn.textContent = 'Cancel';
        this._cancelBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        this._cancelBtn.addEventListener('click', () => this._cancelEdit());
        this._editBar.append(this._saveBtn, this._cancelBtn);
        this._yamlContent.append(this._display, this._editor);
        this.element.append(header, this._modeBar, this._yamlTabBar, this._docsContent, this._yamlContent, this._editBar);
        this._renderDocs('project');
    }
    /** Collapse to a thin strip / expand again. */
    toggle() {
        this._expanded = !this._expanded;
        if (this._expanded) {
            this.element.style.width = EXPANDED_WIDTH;
            this._modeBar.style.display = 'flex';
            this._setMode(this._mode);
        }
        else {
            this.element.style.width = COLLAPSED_WIDTH;
            this._modeBar.style.display = 'none';
            this._docsContent.style.display = 'none';
            this._yamlContent.style.display = 'none';
            this._yamlTabBar.style.display = 'none';
            this._editBtn.style.display = 'none';
            if (this._editing)
                this._cancelEdit();
        }
        this._toggleBtn.textContent = this._expanded ? '▶' : '◀';
    }
    /** Show YAML tab ``tab`` (project / config / form_config). */
    switchToTab(tab) {
        this._switchYamlTab(tab);
    }
    /** New YAML previews from the kernel. */
    updateYaml(yamls) {
        this._yamls = yamls;
        this._updateYamlDisplay(yamls);
    }
    /** A section was focused: show its YAML file and its docs. */
    showForSection(section, yamls) {
        if (section === 'form') {
            this._configType = 'form_config';
        }
        else if (section === 'project') {
            this._configType = 'project';
        }
        else {
            this._configType = 'config';
        }
        this._highlightYamlTab();
        this._yamls = yamls;
        this._updateYamlDisplay(yamls);
        this._renderDocs(section);
    }
    /** Highlight and scroll to the docs card of ``fieldKey`` (if the section documents it). */
    scrollToField(fieldKey) {
        if (this._activeField) {
            this._activeField.style.borderLeftColor = styles_1.COLORS.bgSurface1;
        }
        const el = this._docsContent.querySelector(`[data-field="${fieldKey}"]`);
        if (el) {
            el.style.borderLeftColor = styles_1.COLORS.sapphire;
            this._activeField = el;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        else {
            this._activeField = null;
        }
    }
    _modeTabStyle(active) {
        return `flex:1;padding:5px 8px;font-size:11px;font-weight:600;border:none;cursor:pointer;` +
            `background:${active ? styles_1.COLORS.bgSurface0 : 'transparent'};` +
            `color:${active ? styles_1.COLORS.textPrimary : styles_1.COLORS.textMuted};`;
    }
    _setMode(mode) {
        this._mode = mode;
        this._docsBtn.style.cssText = this._modeTabStyle(mode === 'docs');
        this._yamlBtn.style.cssText = this._modeTabStyle(mode === 'yaml');
        if (mode === 'docs') {
            this._docsContent.style.display = 'block';
            this._yamlContent.style.display = 'none';
            this._yamlTabBar.style.display = 'none';
            this._editBtn.style.display = 'none';
            if (this._editing)
                this._cancelEdit();
        }
        else {
            this._docsContent.style.display = 'none';
            this._yamlContent.style.display = 'flex';
            this._yamlTabBar.style.display = 'flex';
            this._editBtn.style.display = '';
        }
    }
    _switchYamlTab(tab) {
        this._configType = tab;
        this._highlightYamlTab();
        if (this._editing)
            this._cancelEdit();
        this._updateYamlDisplay(this._yamls);
    }
    _highlightYamlTab() {
        for (const [t, btn] of this._yamlTabs) {
            btn.style.background = t === this._configType ? styles_1.COLORS.bgSurface0 : 'transparent';
            btn.style.color = t === this._configType ? styles_1.COLORS.textPrimary : styles_1.COLORS.textMuted;
        }
    }
    _renderDocs(section) {
        this._activeField = null;
        this._docsContent.innerHTML = '';
        const docs = docs_1.DOCS[section];
        if (!docs) {
            this._docsContent.textContent = `No documentation for "${section}".`;
            return;
        }
        const title = document.createElement('h3');
        title.textContent = SECTION_TITLES[section] || section;
        title.style.cssText =
            `margin:0 0 8px 0;font-size:14px;font-weight:700;color:${styles_1.COLORS.blue};` +
                `text-transform:capitalize;`;
        this._docsContent.appendChild(title);
        if (docs._intro) {
            const intro = document.createElement('p');
            intro.textContent = docs._intro;
            intro.style.cssText =
                `margin:0 0 12px 0;color:${styles_1.COLORS.textSubtle};font-size:12px;line-height:1.5;`;
            this._docsContent.appendChild(intro);
        }
        for (const [key, text] of Object.entries(docs)) {
            if (key === '_intro')
                continue;
            if (key.startsWith('_sub:')) {
                const hr = document.createElement('hr');
                hr.style.cssText = `border:none;border-top:1px solid ${styles_1.COLORS.bgSurface1};margin:12px 0 8px;`;
                this._docsContent.appendChild(hr);
                const subTitle = document.createElement('h4');
                subTitle.textContent = key.slice(5);
                subTitle.style.cssText =
                    `margin:0 0 4px 0;font-size:12px;font-weight:700;color:${styles_1.COLORS.textPrimary};`;
                this._docsContent.appendChild(subTitle);
                const subIntro = document.createElement('p');
                subIntro.textContent = text;
                subIntro.style.cssText =
                    `margin:0 0 10px 0;color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.5;`;
                this._docsContent.appendChild(subIntro);
                continue;
            }
            if (key.startsWith('_group:') && typeof text === 'object') {
                const group = document.createElement('div');
                group.style.cssText =
                    `border-left:2px solid ${styles_1.COLORS.lavender};margin:0 0 10px 3px;padding-left:8px;`;
                for (const [childKey, childText] of Object.entries(text)) {
                    group.appendChild(this._makeFieldCard(childKey, childText));
                }
                this._docsContent.appendChild(group);
                continue;
            }
            this._docsContent.appendChild(this._makeFieldCard(key, text));
        }
    }
    _makeFieldCard(key, text) {
        const fieldEl = document.createElement('div');
        fieldEl.setAttribute('data-field', key);
        fieldEl.style.cssText =
            `margin-bottom:10px;padding:8px;background:${styles_1.COLORS.bgSurface0};border-radius:4px;` +
                `border-left:3px solid ${styles_1.COLORS.bgSurface1};transition:border-color 0.15s ease;`;
        const nameEl = document.createElement('div');
        nameEl.style.cssText =
            `font-size:12px;font-weight:700;color:${styles_1.COLORS.mauve};margin-bottom:4px;font-family:monospace;` +
                `display:flex;align-items:center;gap:6px;`;
        const nameText = document.createElement('span');
        nameText.textContent = key;
        nameEl.appendChild(nameText);
        let desc = text;
        const tagMatch = text.match(/^\(([^)]+)\)\s*/);
        if (tagMatch) {
            desc = text.slice(tagMatch[0].length);
            const tag = document.createElement('span');
            tag.textContent = tagMatch[1];
            tag.style.cssText =
                `font-size:10px;font-weight:600;padding:2px 8px;border-radius:3px;font-family:sans-serif;` +
                    `background:${styles_1.COLORS.teal}22;color:${styles_1.COLORS.teal};`;
            nameEl.appendChild(tag);
        }
        const descEl = document.createElement('div');
        descEl.style.cssText =
            `font-size:11px;color:${styles_1.COLORS.textSubtle};line-height:1.5;white-space:pre-wrap;`;
        descEl.textContent = desc;
        fieldEl.append(nameEl, descEl);
        return fieldEl;
    }
    _updateYamlDisplay(yamls) {
        let yaml = '';
        if (this._configType === 'project')
            yaml = yamls.project_yaml;
        else if (this._configType === 'config')
            yaml = yamls.config_yaml;
        else if (this._configType === 'form_config')
            yaml = yamls.form_yaml;
        this._display.textContent = yaml || '# (empty)';
    }
    _startEdit() {
        this._editing = true;
        this._editor.value = this._display.textContent || '';
        this._editor.style.display = 'block';
        this._display.style.display = 'none';
        this._editBar.style.display = 'flex';
        this._editBtn.style.display = 'none';
        this._editor.focus();
    }
    _applyEdit() {
        const yaml = this._editor.value;
        this._cancelEdit();
        this.configEdited.emit({ yaml, configType: this._configType });
    }
    /** Leave edit mode without applying. */
    _cancelEdit() {
        this._editing = false;
        this._editor.style.display = 'none';
        this._display.style.display = 'block';
        this._editBar.style.display = 'none';
        this._editBtn.style.display = '';
    }
}
exports.YamlPanel = YamlPanel;


/***/ },

/***/ "./lib/config_builder/builderKernel.js"
/*!*********************************************!*\
  !*** ./lib/config_builder/builderKernel.js ***!
  \*********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuilderKernel = void 0;
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
//
// Public
//
class BuilderKernel {
    /**
     * Starts the setup immediately.
     *
     * @param bridge - The builder widget's kernel.
     * @param status - Where progress and failures are shown.
     */
    constructor(bridge, status) {
        this._isReady = false;
        this._debug = false;
        this._resolvedCwd = '';
        this._cwdCallbacks = [];
        this._routingKeys = null;
        this.bridge = bridge;
        this._status = status;
        this.ready = this._setup();
    }
    /** Whether setup succeeded (calls are skipped until it has). */
    get isReady() {
        return this._isReady;
    }
    /** Split routing per section, or null if it couldn't be fetched (locks then act per section). */
    get routingKeys() {
        return this._routingKeys;
    }
    /** The kernel's working directory (as resolved by the kernel once ready). */
    get cwd() {
        return this._resolvedCwd || this.bridge.cwd || '.';
    }
    /** Run ``cb`` with the resolved cwd now, or once setup resolves it. */
    onCwdReady(cb) {
        if (this._resolvedCwd) {
            cb(this._resolvedCwd);
        }
        else {
            this._cwdCallbacks.push(cb);
        }
    }
    /**
     * ``chdir`` the kernel. Returns the new absolute cwd, or null (failure shown in the status).
     *
     * @param newDir - Directory to change to.
     */
    async setCwd(newDir) {
        return this.call((0, python_1.changeCwd)(newDir), 'chdir failed', (r) => {
            this._resolvedCwd = r.cwd || '';
            return r.cwd;
        });
    }
    /**
     * Wait for setup, run a python.ts snippet and hand its parsed reply to ``handle``.
     * A failure of the call — or of ``handle`` — goes to ``onFail``.
     *
     * @param code - Snippet from python.ts.
     * @param onFail - Failure label / handler / null (see ``CallFailure``).
     * @param handle - Receives the reply; its result is returned.
     * @returns ``handle``'s result, or null when not ready or on failure.
     */
    async call(code, onFail, handle) {
        await this.ready;
        if (!this._isReady)
            return null;
        return this.run(code, onFail, handle);
    }
    /** ``call`` without waiting for setup (for calls made from an already-ready flow). */
    async run(code, onFail, handle) {
        try {
            return await handle(await this.exec(code));
        }
        catch (e) {
            if (typeof onFail === 'string')
                this._status.set(`${onFail}: ${(0, util_1.errorMessage)(e)}`, 'error');
            else
                onFail === null || onFail === void 0 ? void 0 : onFail(e);
            return null;
        }
    }
    /** Run a snippet and parse its reply; throws on kernel or parse errors. */
    async exec(code) {
        return JSON.parse((0, python_1.extractJson)(await this.bridge.exec(code)));
    }
    /** ``console.debug`` when the kernel runs with ``JBA_DEBUG_MODE``. */
    dbg(...args) {
        if (this._debug)
            console.debug('[JBA]', ...args);
    }
    async _setup() {
        this._status.set('Initializing…');
        try {
            const result = await this.exec((0, python_1.ensureSetup)(this.bridge.cwd));
            this._isReady = true;
            this._debug = !!result.debug;
            this._resolvedCwd = result.cwd || '';
            this.dbg('ConfigPanel ready, cwd:', result.cwd);
            for (const cb of this._cwdCallbacks)
                cb(this._resolvedCwd);
            this._cwdCallbacks = [];
            // Cache the per-section split-routing key sets (single source of truth in
            // core.py) so file-lock disabling needs no further kernel round-trips.
            try {
                this._routingKeys = await this.exec((0, python_1.getRoutingKeys)());
            }
            catch ( /* lock disabling degrades to whole-section if absent */_a) { /* lock disabling degrades to whole-section if absent */ }
            this._status.set('Ready');
        }
        catch (e) {
            this._status.set(`Init failed: ${(0, util_1.errorMessage)(e)}`, 'error');
        }
    }
}
exports.BuilderKernel = BuilderKernel;


/***/ },

/***/ "./lib/config_builder/builderSections.js"
/*!***********************************************!*\
  !*** ./lib/config_builder/builderSections.js ***!
  \***********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuilderSections = void 0;
/**
 * The builder's sections and the logic that works on all of them at once: filling them from a
 * loaded state, file-lock disabling, target options and the accordion.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const builderState_1 = __webpack_require__(/*! ./builderState */ "./lib/config_builder/builderState.js");
const AppSection_1 = __webpack_require__(/*! ./sections/AppSection */ "./lib/config_builder/sections/AppSection.js");
const AudioSection_1 = __webpack_require__(/*! ./sections/AudioSection */ "./lib/config_builder/sections/AudioSection.js");
const ConfigFilesSection_1 = __webpack_require__(/*! ./sections/ConfigFilesSection */ "./lib/config_builder/sections/ConfigFilesSection.js");
const DataSection_1 = __webpack_require__(/*! ./sections/DataSection */ "./lib/config_builder/sections/DataSection.js");
const DescriptionSection_1 = __webpack_require__(/*! ./sections/DescriptionSection */ "./lib/config_builder/sections/DescriptionSection.js");
const FormSection_1 = __webpack_require__(/*! ./sections/FormSection */ "./lib/config_builder/sections/FormSection.js");
const OutputSection_1 = __webpack_require__(/*! ./sections/OutputSection */ "./lib/config_builder/sections/OutputSection.js");
const SetupSection_1 = __webpack_require__(/*! ./sections/SetupSection */ "./lib/config_builder/sections/SetupSection.js");
//
// Public
//
class BuilderSections {
    constructor() {
        this.setup = new SetupSection_1.SetupSection();
        this.configFiles = new ConfigFilesSection_1.ConfigFilesSection();
        this.data = new DataSection_1.DataSection();
        this.audio = new AudioSection_1.AudioSection();
        this.output = new OutputSection_1.OutputSection();
        this.app = new AppSection_1.AppSection();
        this.form = new FormSection_1.FormSection();
        this.description = new DescriptionSection_1.DescriptionSection();
        this.all = new Map([
            ['setup', this.setup],
            ['project', this.configFiles],
            ['data', this.data],
            ['audio', this.audio],
            ['output', this.output],
            ['app', this.app],
            ['form', this.form],
            ['description', this.description],
        ]);
        this.targeted = [this.data, this.audio, this.output, this.app, this.form, this.description];
        this.app.setTarget('config');
        this.form.setTarget('form');
        this.description.setTarget('project');
    }
    /**
     * Replace every section's contents with a loaded / applied state (reset first, since
     * ``setData`` only adds).
     */
    fill(state) {
        for (const section of this.all.values())
            section.reset();
        if (state.project)
            this._fillProjectData(state);
        if (state.form_config && typeof state.form_config === 'object') {
            this.form.setData(state.form_config);
        }
        if (state.section_targets)
            this._applyTargets(state.section_targets);
    }
    /**
     * Disable whatever writes to a locked file, and freeze the target dropdowns while any file
     * is locked (so routing can't shift fields into/out of a locked file).
     *
     * @param routing - Split routing per section (null: lock split sections per section).
     */
    applyFileLocks(routing) {
        const locks = this.configFiles.getLockStates();
        const anyLocked = locks.project || locks.config || locks.form;
        const fileOf = (t) => t === 'form' ? 'form' : t === 'config' ? 'config' : 'project';
        for (const [name, section] of this.all) {
            if (name !== 'project')
                section.setTargetEnabled(!anyLocked);
        }
        // Whole-section-target sections route entirely to one file.
        this.app.setFieldsLocked(locks[fileOf(this.app.getTarget())]);
        this.description.setFieldsLocked(locks[fileOf(this.description.getTarget())]);
        this.form.setFieldsLocked(locks[fileOf(this.form.getTarget())]);
        // Split sections disable per-field by routing (project-group vs config-group).
        this.data.applyLocks(locks, routing === null || routing === void 0 ? void 0 : routing.data);
        this.audio.applyLocks(locks, routing === null || routing === void 0 ? void 0 : routing.audio);
        this.output.applyLocks(locks, routing === null || routing === void 0 ? void 0 : routing.output);
    }
    /** Offer only the enabled files as targets (``split`` needs project and config). */
    updateTargetOptions(states) {
        const baseOpts = [];
        if (states.project)
            baseOpts.push('project');
        if (states.config)
            baseOpts.push('config');
        if (baseOpts.length === 0)
            baseOpts.push('project');
        const splitOpts = states.project && states.config
            ? ['split', ...baseOpts] : [...baseOpts];
        for (const sec of [this.data, this.audio, this.output]) {
            sec.setTargetOptions(splitOpts);
        }
        this.app.setTargetOptions(baseOpts);
        this.description.setTargetOptions(baseOpts);
        const formOpts = [...baseOpts];
        if (states.form)
            formOpts.push('form');
        this.form.setTargetOptions(formOpts);
    }
    /** Accordion: opening one section closes the others unless pinned. */
    closeOthers(opened) {
        for (const section of this.all.values()) {
            if (section !== opened && !section.isPinned) {
                section.close();
            }
        }
    }
    /** Fill the file / data / audio / output / app / description sections. */
    _fillProjectData(state) {
        var _a;
        const proj = state.project || {};
        const conf = state.config || {};
        this.configFiles.setData(proj);
        const targets = state.section_targets || {};
        if (proj.project_name) {
            this.app.setProjectName(proj.project_name);
        }
        const mergedData = (0, builderState_1.resolveSectionData)('data', targets, proj, conf);
        if (mergedData)
            this.data.setData(mergedData);
        const mergedAudio = (0, builderState_1.resolveSectionData)('audio', targets, proj, conf);
        if (mergedAudio)
            this.audio.setData(mergedAudio);
        const mergedOutput = (0, builderState_1.resolveSectionData)('output', targets, proj, conf);
        const outputData = mergedOutput ? Object.assign({}, mergedOutput) : {};
        const outputPath = ((_a = proj.output) === null || _a === void 0 ? void 0 : _a.path) || proj.output_path;
        if (outputPath)
            outputData.path = outputPath;
        if (Object.keys(outputData).length > 0)
            this.output.setData(outputData);
        const appSource = targets.app === 'config' ? Object.assign(Object.assign({}, proj), conf) : proj;
        this.app.setData(appSource);
        const descData = (0, builderState_1.collectDescriptionData)(proj, conf);
        if (Object.keys(descData).length > 0)
            this.description.setData(descData);
    }
    /** Set each section's target dropdown from ``section_targets``. */
    _applyTargets(targets) {
        if (targets.data)
            this.data.setTarget(targets.data);
        if (targets.audio)
            this.audio.setTarget(targets.audio);
        if (targets.output)
            this.output.setTarget(targets.output);
        if (targets.app)
            this.app.setTarget(targets.app);
        if (targets.form)
            this.form.setTarget(targets.form === 'form_config' ? 'form' : targets.form);
        if (targets.description)
            this.description.setTarget(targets.description);
    }
}
exports.BuilderSections = BuilderSections;


/***/ },

/***/ "./lib/config_builder/builderState.js"
/*!********************************************!*\
  !*** ./lib/config_builder/builderState.js ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.collectDescriptionData = exports.resolveSectionData = exports.formatValidation = exports.activeFilePath = exports.writableFiles = exports.withYamlExt = void 0;
/**
 * Pure helpers for ConfigPanel: which files are written / opened, validation messages, and
 * splitting a loaded ``BuilderState`` into each section's ``setData`` payload.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const constants_1 = __webpack_require__(/*! ./constants */ "./lib/config_builder/constants.js");
//
// Constants
//
/** Flat description keys a project / config file may carry. */
const DESCRIPTION_KEYS = [
    'description', 'description_title', 'description_text', 'description_path',
    'description_open', 'description_height',
];
//
// Public
//
/** ``path`` with a ``.yaml`` extension unless it has .yaml/.yml (as the kernel saves it). */
function withYamlExt(path) {
    return /\.ya?ml$/i.test(path) ? path : `${path}.yaml`;
}
exports.withYamlExt = withYamlExt;
/** The paths save will write: enabled, unlocked files that have a path (project, config, form). */
function writableFiles(files) {
    const paths = [];
    for (const ft of constants_1.CONFIG_FILE_TYPES) {
        const path = files[`${ft}_path`];
        if (files[`${ft}_enabled`] && !files[`${ft}_locked`] && path)
            paths.push(path);
    }
    return paths;
}
exports.writableFiles = writableFiles;
/**
 * The file the annotator opens / Reload re-reads: the first enabled file with a path, in
 * project -> config -> form order (a locked file still counts — it exists, it's just not
 * rewritten).
 */
function activeFilePath(files) {
    for (const ft of constants_1.CONFIG_FILE_TYPES) {
        const path = files[`${ft}_path`];
        if (files[`${ft}_enabled`] && path)
            return { path, label: ft };
    }
    return { path: '', label: '' };
}
exports.activeFilePath = activeFilePath;
/** The validation errors / warnings as dialog text (``''`` when there are none). */
function formatValidation(reply) {
    var _a, _b;
    const msgs = [];
    if ((_a = reply.errors) === null || _a === void 0 ? void 0 : _a.length)
        msgs.push('Errors:\n• ' + reply.errors.join('\n• '));
    if ((_b = reply.warnings) === null || _b === void 0 ? void 0 : _b.length)
        msgs.push('Warnings:\n• ' + reply.warnings.join('\n• '));
    return msgs.join('\n\n');
}
exports.formatValidation = formatValidation;
/**
 * A split-capable section's data from the loaded project / config dicts: the file its target
 * names, or both merged (project wins) for ``split``. Null when there is none.
 *
 * @param section - ``data`` / ``audio`` / ``output``.
 * @param targets - ``section_targets`` from the state.
 * @param proj - The loaded project dict.
 * @param conf - The loaded config dict.
 */
function resolveSectionData(section, targets, proj, conf) {
    const t = targets[section];
    const pData = proj[section];
    const cData = conf[section];
    if (t === 'split') {
        if (!pData && !cData)
            return null;
        return Object.assign(Object.assign({}, (typeof cData === 'object' ? cData : {})), (typeof pData === 'object' ? pData : {}));
    }
    const source = t === 'config' ? cData : pData;
    return source && typeof source === 'object' ? source : null;
}
exports.resolveSectionData = resolveSectionData;
/**
 * The Description section's data: the description keys set in ``proj`` then ``conf`` (the
 * config file wins). Falsy values are skipped, except an explicit ``description_open``.
 */
function collectDescriptionData(proj, conf) {
    const descData = {};
    for (const src of [proj, conf]) {
        for (const key of DESCRIPTION_KEYS) {
            const keep = key === 'description_open' ? src[key] !== undefined : !!src[key];
            if (keep)
                descData[key] = src[key];
        }
    }
    return descData;
}
exports.collectDescriptionData = collectDescriptionData;


/***/ },

/***/ "./lib/config_builder/constants.js"
/*!*****************************************!*\
  !*** ./lib/config_builder/constants.js ***!
  \*****************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.YAML_FILE_RE = exports.REMOTE_SCHEME_RE = exports.DATA_FILE_RE = exports.ITEMS_FILE_EXTS = exports.DESCRIPTION_EXTS = exports.YAML_EXTS = exports.AUDIO_EXTS = exports.OUTPUT_EXTS = exports.DATA_EXTS = exports.CONFIG_DIRS = exports.CONFIG_FILE_TYPES = void 0;
//
// Constants
//
/** The three files a project is saved as, in cascade order. */
exports.CONFIG_FILE_TYPES = ['project', 'config', 'form'];
/** Default directory of each config file type (mirrors core.py's DEFAULT_*_DIR). */
exports.CONFIG_DIRS = {
    project: 'annotator_config/projects',
    config: 'annotator_config/config',
    form: 'annotator_config/forms',
};
/** Tabular data files the kernel's ``read_columns`` can read. */
exports.DATA_EXTS = ['.csv', '.parquet', '.json', '.tsv', '.jsonl'];
/** Output files the annotator can write. */
exports.OUTPUT_EXTS = ['.csv', '.parquet', '.json', '.tsv'];
/** Audio files the annotator can play. */
exports.AUDIO_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac'];
/** Project / config / form files. */
exports.YAML_EXTS = ['.yaml', '.yml'];
/** Description-panel content files. */
exports.DESCRIPTION_EXTS = ['.md', '.txt', '.html'];
/** Files a select element's ``items: {path: ...}`` may point at. */
exports.ITEMS_FILE_EXTS = ['.csv', '.parquet', '.json', '.tsv', '.txt'];
/** A path whose columns can be loaded (one of ``DATA_EXTS``). */
exports.DATA_FILE_RE = /\.(csv|parquet|json|jsonl|tsv)$/i;
/** A value that starts with a URL scheme (``https://``, ``s3://``, ``gs://``, ...). */
exports.REMOTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
/** A ``.yaml`` / ``.yml`` file name. */
exports.YAML_FILE_RE = /\.(yaml|yml)$/i;


/***/ },

/***/ "./lib/config_builder/docs.js"
/*!************************************!*\
  !*** ./lib/config_builder/docs.js ***!
  \************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DOCS = void 0;
//
// Constants
//
/** Docs per section name. */
exports.DOCS = {
    setup: {
        _intro: `Start a project: "Create New" from scratch, "Create from Template" from a ready-made config, or "Load Existing" to open saved files. File names and locations are managed in the Configuration Files section below.`,
        '_sub:Create New': `Enter a project name and click Create. This generates default file paths under annotator_config/ and opens the other sections for editing.`,
        '_sub:Create from Template': `Start from a ready-made template and fill in only the deployment-specific bits.\n\n• Pick a template from the list to see its description.\n• Choose what to create — project (project + config + form), config (config + form), or just a form.\n• Enter a name (used for the saved file names), then fill the inputs. A source-type dropdown reconfigures its value field: a path adds a Browse button; a column becomes a dropdown once the data file's columns load (until then it's a text box).\n• Save writes the files and locks the form; reopen Setup and click Edit to change values and save again.`,
        '_sub:Load Existing': `Choose a file type (project, config, or form), browse or type a path, and click Load. Loading cascades: a project file loads its referenced config, which loads its referenced form.`,
    },
    project: {
        _intro: `Configuration Files controls how the project is saved — up to three files (project, config, form), their names, and per-file enable/lock.`,
        '_sub:Linked / Duplicate-Rename / Lock': `• Checkbox — write that file as a separate file (uncheck to inline it into its parent).\n• Linked — keep all three filenames in sync from one name; unlink to set each path independently.\n• Duplicate / Rename — unlock the paths to save under new filenames. Saving writes the new files and leaves the originals untouched — your chance to start a copy from an existing config.\n• Lock (per file) — that file won't be saved and its fields are disabled, so you can't overwrite it.`,
        'project file': `Project-specific configuration — data sources, audio paths, output locations, and anything unique to this particular review task. References the config file for shared app settings.\nLoad: populates all sections and cascades into config and form files if referenced.`,
        'config file': `Application setup shared across multiple projects — layout options, column visibility, capture settings, heights, and general widget behavior. Referenced by the project file; references the form file.\nLoad: populates app/layout sections and cascades into the form file if referenced.`,
        'form file': `Form definition only — the annotation interface controls (selects, textboxes, checkboxes, etc.) and dynamic forms. Kept separate so the same form can be reused across different project/config combinations.\nLoad: populates the form section only.`,
    },
    data: {
        _intro: `Data is where you define your clip source — a table of detections or segments to review. Each row represents one clip. The table must have at minimum a start_time column (or you must map one). Supported formats: CSV, Parquet, JSON, JSONL.`,
        source_type: `(required) How to load the data table.`,
        '_group:source_type': {
            path: `Local file path (CSV, Parquet, JSON, JSONL) relative to the working directory.\nExample: data/detections.csv`,
            url: `Remote file URL. Downloaded and read based on extension or content type.`,
            sql: `DuckDB SQL query. Requires duckdb.\nExample: SELECT * FROM 'data.parquet' WHERE confidence > 0.5`,
            api: `REST API endpoint. Response parsed as JSON.\nExample: https://api.example.com/v1/detections`,
        },
        value: `(required) The file path, URL, SQL query, or API endpoint depending on source type.`,
        index_column: `(required) Column name used as the unique row identifier.\nMust uniquely identify each row. Used for tracking submissions.`,
        display_columns: `Subset of columns shown in the clip table.\nIf empty, all columns are included. Use this to limit what's visible and reduce memory for large files.`,
        start_time_col: `Column name containing the segment start time in seconds.\nDefault: "start_time". Remap if your file uses a different name.`,
        end_time_col: `Column name containing the segment end time in seconds.\nDefault: "end_time". Remap if your file uses a different name.`,
        duration: `Column name or fixed number (seconds) to compute end_time from start_time.\nUse this if your data has duration instead of end_time.\nExample: "duration" (column) or 5.0 (fixed seconds).`,
        secrets: `Key-value pairs for credentials needed to access data.\nExample: API tokens, database passwords. They ARE saved in the config file: use env:VAR_NAME (read from an environment variable) or dialog (asked for when the annotator opens) instead of pasting real secrets.`,
    },
    audio: {
        _intro: `Audio defines where to find the sound files for each clip.\nYou can point to a single file, a URL, or a per-row column that holds the path for each detection.`,
        source_type: `(required) How to resolve the audio file for each clip.`,
        '_group:source_type': {
            path: `Single local audio file shared by all clips.\nExample: recordings/site-a.flac`,
            url: `Remote audio file URL (HTTPS, S3, GCS). Supports partial byte-range downloads.`,
            column: `Per-row audio — each row's value in the selected data column is used as the audio path.\nUse with prefix/suffix/fallback for flexible path resolution.`,
        },
        value: `(required) The file path, URL, or column name depending on source type.\nFor "column" mode, select which data column holds the audio paths.`,
        prefix: `Prepended to the audio path with "/" separator.\nUseful for base directories or URL roots.\nExample: "audio/" turns "recording.flac" into "audio/recording.flac"`,
        suffix: `Appended to the audio path.\nUseful for adding file extensions when paths are stored without them.`,
        fallback: `Fallback audio file used when column mode yields an empty value.`,
        secrets: `Key-value pairs for credentials needed to access audio.\nExample: storage tokens or signed URL secrets.`,
    },
    output: {
        _intro: `Output controls where annotation results are saved.\nResults are written as a table (CSV/Parquet) with one row per submission. Optionally sync to remote storage.`,
        index_column: `(defaults to data.index_column) Column name used as the unique row identifier in the output file.\nSet this when the output needs a different key than the input data.`,
        'output path': `Output file path for saved annotations.\nAuto-generated from project name if form is configured.\nExample: outputs/reviews.csv`,
        sync_uri: `Remote URI to sync the output file after writes.\nExample: s3://my-bucket/annotations/reviews.csv`,
        sync_button: `Show a sync button in the widget.\nSet to true for default "Sync" label, or provide a custom string.`,
        sync_label: `Text label shown next to the sync button.`,
        recursive: `Write output after every submission instead of waiting for session end. Default: false.`,
        secrets: `Key-value pairs for credentials needed for output sync.\nExample: S3 access keys for remote sync.`,
    },
    app: {
        _intro: `Application settings control the widget layout, visible columns, and interaction features like capture and buffering.`,
        project_name: `Widget header title displayed at the top of the annotator.\nIf not set, it is auto-derived from the project filename.`,
        display_columns: `Columns visible in the clip table.\nControls which columns appear as sortable table headers.`,
        info_card_title: `Template string shown prominently in the info card and used for naming captured files.\nSupports [[column_name]] placeholders.\nExample: "[[common_name]]"`,
        info_card_text: `Template string shown after the time range in the info card.\nSupports [[column_name]] placeholders.\nExample: "species: [[scientific_name]] | confidence: [[confidence]]"`,
        sort: `(defaults to none) Column to sort the clip table by.\nLeave blank to keep the input/file order. Users can still re-sort by clicking column headers.`,
        sort_order: `Sort direction when "sort" is set: asc (default) or desc.`,
        duplicate_entries: `Allow multiple submissions per row. Default: false.\nEnable for tasks where the same clip needs multiple annotations.`,
        default_buffer: `Buffer time in seconds added before/after the audio segment.\nDefault: 3. Increase for more context around short clips.`,
        capture: `Capture button lets users save audio clips.\nSet to false to hide, true for default label, or a string for custom label.`,
        capture_dir: `Directory where captured audio clips are saved.\nDefault: "captures/"`,
        width: `Inline widget width. Default: "100%".\nCan be pixels ("800px") or percentage.`,
        clip_table_height: `Clip table height in pixels. Default: 175.`,
        player_height: `Player/spectrogram height in pixels. Default: 260.\nAlso determines the spectrogram resolution.`,
        info_card_height: `Info card height in pixels. Default: 34.`,
        form_panel_height: `Form panel height in pixels. Default: 140.`,
        capture_height: `Capture image height in pixels.\nDefaults to player_height if not set.`,
        secrets: `Global key-value pairs for credentials available to all sections.\nSection-level secrets override global ones with the same key.`,
    },
    description: {
        _intro: `Add an optional collapsible section at the top of the annotator for project descriptions, reviewer instructions, or other guidance. Accepts inline markdown or a path to a markdown file.`,
        title: `Title shown in the collapsible description bar.\nDefault: "Description".`,
        text: `Markdown-formatted text displayed in the description panel.\nSupports headings, lists, bold, italic, code blocks, links, and horizontal rules.`,
        description_path: `Path to a markdown file whose contents populate the description panel.\nOverridden by text if both are set.`,
        open: `Whether the description panel starts expanded.\nDefault: true.`,
        height: `Max height in pixels for the description body.\nLeave empty for auto height. Set to constrain long descriptions with scroll.`,
    },
    form: {
        _intro: `Form defines the annotation interface — the controls users interact with to label each clip. Elements are rendered in order. Each element writes its value to a specified output column.\n\nElement types: title, select, textbox, checkbox, number, annotation, pass_value, fixed_value, submission_buttons.`,
        '_sub:Display': `Static elements that show information but do not collect user input.`,
        title: `Display title at the top of the form. Set "value" for the text.\nEnable "progress_tracker" to show completion percentage.`,
        text: `Static text displayed in the form. Set "value" for the text content.`,
        line: `Horizontal rule divider between form elements.`,
        break: `Visual spacer that adds vertical space between form elements.`,
        '_sub:User Input': `Interactive elements that collect user input and write to output columns.`,
        annotation: `Add spectrogram interaction tools for time and frequency selection.`,
        '_group:annotation': {
            time_select: `Single vertical line on the spectrogram. Click to position.\nWrites: start_time.`,
            start_end_time_select: `Two vertical lines — green (start) and pink (end). Lines cannot cross each other. A shaded region appears between them.\nWrites: start_time, end_time.`,
            fixed_duration: `Fixed-length time region centered on click position. Click to place, drag to reposition, arrow keys to nudge.\nConfigure with "window" (fixed) or "initial_window" (user-editable with optional min/max/step bounds).\nWrites: start_time, end_time.`,
            bounding_box: `Click+drag rectangle with individually draggable edges for time and frequency bounds.\nWrites: start_time, end_time, min_frequency, max_frequency.`,
            multibox: `Draw multiple bounding boxes, each with an optional per-box form. One output row per box on submit.\nUse annotation "form" field to reference a dynamic_forms section.\nWrites: start_time, end_time, min_frequency, max_frequency + per-box form values.`,
        },
        select: `Dropdown selector. Requires "label" (display text), "column" (output column name), and "items" (the options). Optional features:\n• required — user must pick a value before submitting\n• filter_box — adds a search input above the dropdown\n• custom_value — lets users type a value not in the list\n• not_available — prepends an N/A option (true for default label, or a custom string)`,
        '_group:select': {
            'add items': `Add options one at a time. Each item has a label (shown in the dropdown), a value (written to output), and an optional form reference that shows/hides a dynamic form section when selected.\nIf only a label is provided, the value defaults to the label text.`,
            'from file': `Load options from a CSV, Parquet, JSON, or JSONL file.\n• value col — column whose values are written to output\n• label col — column whose values are shown in the dropdown. If omitted, the value column is used for both.\nBrowse or type a path and press Enter to detect columns.`,
            'paste values': `Bulk-add options by pasting text. Choose a separator (comma by default) or check "line delimited" for one item per line.\nAll pasted values are used as both label and value.`,
            range: `Generate numeric options from a min/max/step range.\nExample: min=1, max=5, step=1 produces items 1, 2, 3, 4, 5.`,
        },
        textbox: `Free text input. Set "multiline: true" for a textarea.\nRequires "label" and "column".`,
        checkbox: `Boolean toggle. Optionally set "yes_value" and "no_value" for custom output values (default: true/false).`,
        number: `Numeric input with min/max/step constraints.\nRequires "label", "column", "min", "max", "step".`,
        '_sub:Data': `Elements that write values to the output without user interaction.`,
        pass_value: `Copies a value from the data row into the output.\nSet "source_column" (input) and "column" (output).`,
        fixed_value: `Writes a constant value to the output for every submission.\nSet "column" and "value".`,
        '_sub:Navigation': `Form submission and navigation controls.`,
        submission_buttons: `Submit/skip navigation buttons. Options:\n• line: show a divider above buttons\n• previous: show a back button\n• next: {label: "Skip"} for the skip button\n• submit: {label: "Verify"} for the submit button`,
        dynamic_forms: `Conditional form sections triggered by select item values.\nWhen a select item has "form: section_name", selecting it reveals the named dynamic form section below.`,
    },
};


/***/ },

/***/ "./lib/config_builder/dom.js"
/*!***********************************!*\
  !*** ./lib/config_builder/dom.js ***!
  \***********************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fillSelect = exports.makeButton = exports.makeSelect = exports.makeInput = exports.makeLabel = exports.makeRow = void 0;
/**
 * Small DOM factories for the config builder's forms (rows, labels, inputs, selects, buttons),
 * styled with the shared ``styles.ts`` helpers so every section looks the same.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
//
// Public
//
/** A horizontal, wrapping row for a label and its control(s). */
function makeRow() {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
    return row;
}
exports.makeRow = makeRow;
/**
 * A fixed-width field label.
 *
 * @param text - Label text (usually the YAML key).
 * @param required - Colour it as a required field.
 */
function makeLabel(text, required = false) {
    const lbl = document.createElement('label');
    lbl.textContent = text;
    lbl.style.cssText =
        `color:${required ? styles_1.COLORS.teal : styles_1.COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
    return lbl;
}
exports.makeLabel = makeLabel;
/**
 * A text input (``inputStyle`` with the builder's roomier padding).
 *
 * @param placeholder - Placeholder text.
 * @param width - CSS width.
 */
function makeInput(placeholder = '', width = '200px') {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = placeholder;
    inp.style.cssText = (0, styles_1.inputStyle)(width) + `padding:4px 8px;`;
    return inp;
}
exports.makeInput = makeInput;
/**
 * A select with one option per value.
 *
 * @param options - Option values (also used as their text).
 * @param selected - Value to select initially.
 */
function makeSelect(options, selected) {
    const sel = document.createElement('select');
    sel.style.cssText = (0, styles_1.selectStyle)() + `padding:4px 6px;`;
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === selected)
            o.selected = true;
        sel.appendChild(o);
    }
    return sel;
}
exports.makeSelect = makeSelect;
/**
 * A button (``btnStyle``).
 *
 * @param text - Button text.
 * @param primary - Use the highlighted primary style.
 */
function makeButton(text, primary = false) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = (0, styles_1.btnStyle)(primary);
    return btn;
}
exports.makeButton = makeButton;
/**
 * Replace a select's options with ``values`` (value = text). Does not change the selection;
 * callers restore it afterwards.
 *
 * @param sel - The select to refill.
 * @param values - Option values.
 * @param placeholder - When given, a first option with value ``''`` and this text.
 */
function fillSelect(sel, values, placeholder) {
    sel.innerHTML = '';
    if (placeholder !== undefined) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholder;
        sel.appendChild(ph);
    }
    for (const v of values) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
    }
}
exports.fillSelect = fillSelect;


/***/ },

/***/ "./lib/config_builder/formSerialization.js"
/*!*************************************************!*\
  !*** ./lib/config_builder/formSerialization.js ***!
  \*************************************************/
(__unused_webpack_module, exports) {


/**
 * Form-builder element <-> form YAML conversion (pure, no DOM).
 *
 * The builder edits each form element as a flat "card config" (e.g. an annotation's
 * ``start_time_col``); the form YAML the annotator reads uses a different shape (e.g.
 * ``start_time: {column, source_value}``). ``serializeElement`` and ``deserializeElement`` are
 * exact mirrors and are used for EVERY element — top level, inside the ``form:`` list, and in
 * ``dynamic_forms`` — so loading and re-saving a form never changes it.
 *
 * License: BSD 3-Clause
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deserializeElement = exports.serializeElement = void 0;
//
// Public
//
/**
 * The YAML value for ``{[type]: value}`` built from a card config.
 *
 * @param type - Element type.
 * @param cfg - The element's card config.
 */
function serializeElement(type, cfg) {
    var _a;
    switch (type) {
        case 'title':
            return cfg.progress_tracker
                ? { value: cfg.value || '', progress_tracker: true }
                : cfg.value || '';
        case 'pass_value':
            return { source_column: cfg.source_column || '', column: cfg.column || '' };
        case 'fixed_value':
            return { column: cfg.column || '', value: (_a = cfg.value) !== null && _a !== void 0 ? _a : '' };
        case 'annotation':
            return _serializeAnnotation(cfg);
        case 'submission_buttons':
            return _serializeSubmissionButtons(cfg);
        case 'break':
        case 'line':
            return true;
        case 'text':
            return cfg.value || '';
        default:
            return _withoutEmpty(cfg);
    }
}
exports.serializeElement = serializeElement;
/**
 * The card config for an element read from YAML (the inverse of ``serializeElement``).
 *
 * @param type - Element type (the YAML key).
 * @param raw - The YAML value under that key.
 */
function deserializeElement(type, raw) {
    switch (type) {
        case 'title':
            return typeof raw === 'object' && raw !== null
                ? { value: raw.value || '', progress_tracker: !!raw.progress_tracker }
                : { value: raw !== null && raw !== void 0 ? raw : '' };
        case 'annotation':
            return _deserializeAnnotation(raw !== null && raw !== void 0 ? raw : {});
        case 'submission_buttons':
            return _deserializeSubmissionButtons(raw !== null && raw !== void 0 ? raw : {});
        case 'break':
        case 'line':
            return {};
        default:
            return typeof raw === 'object' && raw !== null ? Object.assign({}, raw) : { value: raw };
    }
}
exports.deserializeElement = deserializeElement;
//
// Internal
//
const ANNOTATION_BOUNDS = [
    // [yaml key, card column key, default source_value]
    ['start_time', 'start_time_col', 'start_time'],
    ['end_time', 'end_time_col', 'end_time'],
    ['min_frequency', 'min_freq_col', null],
    ['max_frequency', 'max_freq_col', null],
];
function _serializeAnnotation(cfg) {
    var _a;
    const annot = {};
    for (const [yamlKey, colKey, defaultSource] of ANNOTATION_BOUNDS) {
        if (!cfg[colKey])
            continue;
        const bound = { column: cfg[colKey] };
        const source = (_a = cfg[`${colKey}_source`]) !== null && _a !== void 0 ? _a : defaultSource;
        if (source)
            bound.source_value = source;
        annot[yamlKey] = bound;
    }
    if (cfg.tools)
        annot.tools = cfg.tools;
    if (cfg.form)
        annot.form = cfg.form;
    return annot;
}
function _deserializeAnnotation(a) {
    const cfg = {};
    for (const [yamlKey, colKey, defaultSource] of ANNOTATION_BOUNDS) {
        const bound = a[yamlKey];
        if (!bound)
            continue;
        cfg[colKey] = typeof bound === 'object' ? bound.column : bound;
        const source = typeof bound === 'object' ? bound.source_value : undefined;
        if (source && source !== defaultSource)
            cfg[`${colKey}_source`] = source;
    }
    if (a.tools)
        cfg.tools = a.tools;
    if (a.form)
        cfg.form = a.form;
    return cfg;
}
function _serializeSubmissionButtons(cfg) {
    const icon = cfg.show_icon !== false;
    const sb = {};
    if (cfg.line)
        sb.line = true;
    for (const name of ['previous', 'next', 'submit']) {
        const label = cfg[`${name}_label`];
        if (label && (cfg[name] || name !== 'previous'))
            sb[name] = { label, icon };
        else if (cfg[name])
            sb[name] = true;
    }
    return sb;
}
function _deserializeSubmissionButtons(sb) {
    // one "show icon" switch in the UI: off if any labelled button says icon: false (a button
    // that isn't there must not count as "icon on", which used to drop icon: false on load)
    const labelled = ['previous', 'next', 'submit'].map(n => sb[n]).filter(b => b && typeof b === 'object');
    const cfg = { show_icon: !labelled.some(b => b.icon === false) };
    if (sb.line)
        cfg.line = true;
    for (const name of ['previous', 'next', 'submit']) {
        if (!sb[name])
            continue;
        cfg[name] = true;
        if (typeof sb[name] === 'object' && sb[name].label)
            cfg[`${name}_label`] = sb[name].label;
    }
    return cfg;
}
/** Copy of ``cfg`` without unset / empty / false values. */
function _withoutEmpty(cfg) {
    const cleaned = {};
    for (const [k, v] of Object.entries(cfg)) {
        if (v !== undefined && v !== null && v !== '' && v !== false)
            cleaned[k] = v;
    }
    return cleaned;
}


/***/ },

/***/ "./lib/config_builder/index.js"
/*!*************************************!*\
  !*** ./lib/config_builder/index.js ***!
  \*************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.configBuilderPlugin = void 0;
/**
 * Config builder entry point: exports the JupyterLab plugin.
 *
 * License: BSD 3-Clause
 */
var plugin_1 = __webpack_require__(/*! ./plugin */ "./lib/config_builder/plugin.js");
Object.defineProperty(exports, "configBuilderPlugin", ({ enumerable: true, get: function () { return plugin_1.configBuilderPlugin; } }));


/***/ },

/***/ "./lib/config_builder/panelChrome.js"
/*!*******************************************!*\
  !*** ./lib/config_builder/panelChrome.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.makeResizeHandle = exports.openFileBrowserOverlay = void 0;
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const FileBrowser_1 = __webpack_require__(/*! ./FileBrowser */ "./lib/config_builder/FileBrowser.js");
//
// Constants
//
const OVERLAY_CLASS = 'jp-cb-filebrowser';
const MIN_PANE_WIDTH = 200;
const MAX_PANE_WIDTH = 800;
//
// Public
//
/**
 * Show a FileBrowser over ``host`` (at most one at a time). Closes on a pick, on dismiss, or
 * on a click outside the browser.
 *
 * @param host - Positioned element to cover.
 * @param bridge - Kernel to list files with.
 * @param opts - What to browse for.
 */
function openFileBrowserOverlay(host, bridge, opts) {
    if (host.querySelector(`.${OVERLAY_CLASS}`))
        return;
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.style.cssText =
        `position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;` +
            `background:rgba(0,0,0,0.5);padding:24px;`;
    const browserWrap = document.createElement('div');
    browserWrap.style.cssText =
        `position:relative;width:100%;max-width:500px;height:400px;`;
    const browser = new FileBrowser_1.FileBrowser(bridge, opts.dir || '.', opts.extensions, !!opts.dirOnly, '.');
    browser.fileSelected.connect((_, path) => {
        opts.onSelect(path);
        overlay.remove();
    });
    browser.dismissed.connect(() => overlay.remove());
    browserWrap.appendChild(browser.element);
    overlay.appendChild(browserWrap);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            overlay.remove();
    });
    host.appendChild(overlay);
}
exports.openFileBrowserOverlay = openFileBrowserOverlay;
/**
 * A vertical drag handle that resizes ``pane`` (to its right) between 200 and 800 px.
 * Document listeners exist only during a drag (they used to stay registered for every builder
 * ever opened, keeping closed panels alive).
 *
 * @param pane - The element whose width the handle controls.
 */
function makeResizeHandle(pane) {
    const handle = document.createElement('div');
    handle.style.cssText =
        `width:5px;cursor:col-resize;background:${styles_1.COLORS.bgSurface0};flex-shrink:0;` +
            `display:flex;align-items:center;justify-content:center;`;
    const grip = document.createElement('div');
    grip.style.cssText =
        `width:3px;height:28px;border-radius:2px;background:${styles_1.COLORS.overlay};`;
    handle.appendChild(grip);
    handle.addEventListener('mousedown', (e) => {
        const startX = e.clientX;
        const startW = pane.offsetWidth;
        pane.style.transition = 'none';
        e.preventDefault();
        const onMove = (ev) => {
            const newW = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, startW + (startX - ev.clientX)));
            pane.style.width = `${newW}px`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            pane.style.transition = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    return handle;
}
exports.makeResizeHandle = makeResizeHandle;


/***/ },

/***/ "./lib/config_builder/plugin.js"
/*!**************************************!*\
  !*** ./lib/config_builder/plugin.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.configBuilderPlugin = void 0;
const apputils_1 = __webpack_require__(/*! @jupyterlab/apputils */ "webpack/sharing/consume/default/@jupyterlab/apputils");
const coreutils_1 = __webpack_require__(/*! @jupyterlab/coreutils */ "webpack/sharing/consume/default/@jupyterlab/coreutils");
const filebrowser_1 = __webpack_require__(/*! @jupyterlab/filebrowser */ "webpack/sharing/consume/default/@jupyterlab/filebrowser");
const notebook_1 = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const kernel_1 = __webpack_require__(/*! ../kernel */ "./lib/kernel.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const ConfigPanel_1 = __webpack_require__(/*! ./ConfigPanel */ "./lib/config_builder/ConfigPanel.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
const icons_1 = __webpack_require__(/*! ../icons */ "./lib/icons.js");
//
// Constants
//
const COMMAND_ID = 'bioacoustic:open-config-builder';
//
// Public
//
exports.configBuilderPlugin = {
    id: 'jupyter-bioacoustic:config-builder',
    autoStart: true,
    requires: [apputils_1.ICommandPalette, notebook_1.INotebookTracker],
    optional: [filebrowser_1.IDefaultFileBrowser],
    activate: (app, palette, tracker, fileBrowser) => {
        window._bioacousticOpenConfigBuilder = (divId) => {
            const container = document.getElementById(divId);
            if (!container)
                return;
            const widget = new ConfigBuilderWidget({ session: (0, kernel_1.notebookSession)(tracker, container) });
            widget.node.style.cssText += `position:absolute;inset:0;`;
            (0, util_1.suppressNotebookShortcuts)(widget.node);
            widgets_1.Widget.attach(widget, container);
        };
        app.commands.addCommand(COMMAND_ID, {
            label: 'Bioacoustic Config Builder',
            icon: icons_1.builderIcon,
            execute: () => _openBuilderCommand(app, tracker, fileBrowser),
        });
        palette.addItem({ command: COMMAND_ID, category: 'Bioacoustic' });
    }
};
//
// Internal
//
let _builderCounter = 0;
/** The builder command: start a kernel, initialise the builder there, open the widget. */
async function _openBuilderCommand(app, tracker, fileBrowser) {
    const acquired = await (0, kernel_1.acquireKernel)(app, tracker);
    if (!acquired) {
        void (0, util_1.showDialog)({ title: 'Error', body: 'Failed to start a Python kernel.' });
        return;
    }
    const { kernel, owns: ownsKernel } = acquired;
    const browserPath = (fileBrowser === null || fileBrowser === void 0 ? void 0 : fileBrowser.model.path) || '';
    const serverRoot = coreutils_1.PageConfig.getOption('serverRoot');
    const cwd = browserPath
        ? `${serverRoot}/${browserPath}`
        : serverRoot;
    const error = await (0, kernel_1.execInKernel)(kernel, (0, python_1.initBuilder)(cwd));
    if (error) {
        if (ownsKernel)
            kernel.shutdown().catch(() => { });
        void (0, util_1.showDialog)({ title: 'Config Builder Error', body: error });
        return;
    }
    const widget = new ConfigBuilderWidget(acquired.source, ownsKernel, cwd, browserPath);
    app.shell.add(widget, 'main');
    app.shell.activateById(widget.id);
}
/** The builder widget: header (title, cwd, status), ConfigPanel, bottom action bar. */
class ConfigBuilderWidget extends widgets_1.Widget {
    /**
     * @param source - The kernel or notebook session this builder talks to (fixed for its lifetime).
     * @param ownsKernel - Shut ``source.kernel`` down when the builder is closed.
     * @param cwd - Kernel working directory the builder was opened in.
     * @param browserPath - File-browser path at open time (relative to the server root).
     */
    constructor(source, ownsKernel = false, cwd, browserPath) {
        var _a;
        super();
        this._kernelBridge = new kernel_1.KernelBridge(source, cwd);
        this._ownedKernel = ownsKernel ? (_a = source.kernel) !== null && _a !== void 0 ? _a : null : null;
        this._browserPath = browserPath || '';
        this.id = `jp-config-builder-${_builderCounter++}`;
        this.title.label = 'Config Builder';
        this.title.closable = true;
        (0, styles_1.injectGlobalStyles)();
        this._buildUI();
    }
    dispose() {
        if (this._ownedKernel) {
            this._ownedKernel.shutdown().catch(() => { });
            this._ownedKernel = null;
        }
        super.dispose();
    }
    _buildUI() {
        this.node.style.cssText =
            `display:flex;flex-direction:column;width:100%;height:100%;` +
                `background:${styles_1.COLORS.bgBase};color:${styles_1.COLORS.textPrimary};` +
                `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
                `overflow:hidden;box-sizing:border-box;`;
        const header = document.createElement('div');
        header.style.cssText = (0, styles_1.barBottomStyle)();
        this._titleEl = document.createElement('span');
        this._titleEl.textContent = 'Config Builder';
        this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;
        this._panel = new ConfigPanel_1.ConfigPanel(this._kernelBridge);
        const initialCwd = this._kernelBridge.cwd || '.';
        let baseCwd = initialCwd;
        const cwdRelative = (p) => {
            if (p.startsWith(baseCwd + '/'))
                return p.slice(baseCwd.length + 1);
            if (p === baseCwd)
                return '.';
            return p.split('/').filter(Boolean).pop() || '.';
        };
        const cwdLabel = document.createElement('span');
        const displayPath = this._browserPath ? this._browserPath + '/' : '.';
        cwdLabel.textContent = displayPath;
        cwdLabel.title = initialCwd;
        this._panel.onCwdReady((cwd) => {
            baseCwd = cwd;
            cwdLabel.textContent = displayPath;
            cwdLabel.title = cwd;
        });
        cwdLabel.style.cssText =
            `font-size:11px;color:${styles_1.COLORS.textMuted};font-family:monospace;cursor:pointer;` +
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto;` +
                `padding:2px 6px;border-radius:3px;`;
        cwdLabel.addEventListener('mouseenter', () => {
            cwdLabel.style.background = styles_1.COLORS.bgSurface1;
        });
        cwdLabel.addEventListener('mouseleave', () => {
            cwdLabel.style.background = '';
        });
        const browseCwd = () => {
            this._panel.browseDirectory('.', (selectedDir) => {
                void (async () => {
                    const newCwd = await this._panel.setCwd(selectedDir);
                    if (newCwd) {
                        cwdLabel.textContent = cwdRelative(newCwd);
                        cwdLabel.title = newCwd;
                    }
                })();
            });
        };
        cwdLabel.addEventListener('dblclick', browseCwd);
        const cwdBtn = document.createElement('button');
        cwdBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
        cwdBtn.title = 'Change working directory';
        cwdBtn.style.cssText =
            `background:none;border:none;color:${styles_1.COLORS.blue};opacity:0.6;cursor:pointer;` +
                `padding:2px 4px;display:inline-flex;align-items:center;flex-shrink:0;border-radius:3px;`;
        cwdBtn.addEventListener('mouseenter', () => { cwdBtn.style.opacity = '0.85'; });
        cwdBtn.addEventListener('mouseleave', () => { cwdBtn.style.opacity = '0.6'; });
        cwdBtn.addEventListener('click', browseCwd);
        header.append(this._titleEl, cwdLabel, cwdBtn, this._panel.statusEl);
        const bottomBar = document.createElement('div');
        bottomBar.style.cssText =
            `display:flex;gap:8px;padding:6px 12px;` +
                `background:${styles_1.COLORS.bgMantle};border-top:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        const validateBtn = document.createElement('button');
        validateBtn.textContent = 'Validate';
        validateBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        validateBtn.addEventListener('click', () => void this._panel.validate());
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Configuration Files';
        saveBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        saveBtn.addEventListener('click', () => void this._panel.saveToFile());
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open Annotator';
        openBtn.style.cssText = (0, styles_1.btnStyle)(true) + `font-size:11px;`;
        openBtn.style.display = this._panel.isProjectConfigured ? '' : 'none';
        openBtn.addEventListener('click', () => void this._onSaveAndOpen());
        this._panel.onAnyChanged(() => {
            const ready = this._panel.isProjectConfigured;
            openBtn.style.display = ready ? '' : 'none';
            openBtn.textContent = this._panel.dirty ? 'Save & Open Annotator' : 'Open Annotator';
        });
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        dismissBtn.addEventListener('click', () => this._onDismiss());
        bottomBar.append(validateBtn, saveBtn, spacer, openBtn, dismissBtn);
        this.node.append(header, this._panel.element, bottomBar);
    }
    async _onSaveAndOpen() {
        const savedPath = this._panel.dirty
            ? await this._panel.saveAndOpenAnnotator()
            : await this._panel.validateAndOpen();
        if (!savedPath)
            return;
        try {
            await this._panel.kernel.exec((0, python_1.setupAnnotatorFromProject)(savedPath));
        }
        catch (e) {
            void (0, util_1.showDialog)({ title: 'Annotator Error', body: (0, util_1.errorMessage)(e) });
            return;
        }
        const openFn = window._bioacousticOpenWithKernel;
        if (openFn) {
            openFn(this._kernelBridge.activeKernel, false);
        }
    }
    async _onDismiss() {
        if (this._panel.dirty) {
            const choice = await (0, util_1.showDialog)({
                title: 'Unsaved Changes',
                body: 'You have unsaved changes. Dismiss anyway?',
                buttons: [
                    { label: 'Cancel' },
                    { label: 'Dismiss', primary: true },
                ],
            });
            if (choice !== 'Dismiss')
                return;
        }
        this.dispose();
    }
}


/***/ },

/***/ "./lib/config_builder/python.js"
/*!**************************************!*\
  !*** ./lib/config_builder/python.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setupAnnotatorFromProject = exports.changeCwd = exports.getSummary = exports.applyTemplate = exports.loadTemplate = exports.listTemplates = exports.getRoutingKeys = exports.loadConfig = exports.validateConfig = exports.setSectionTarget = exports.checkFileExists = exports.checkAudioUrl = exports.readColumnsFromSource = exports.readColumns = exports.createDirectory = exports.listFiles = exports.saveSingleFile = exports.saveAll = exports.updateConfigFromYaml = exports.updateSection = exports.initBuilder = exports.ensureSetup = exports.extractJson = void 0;
/**
 * Python source generators for the config builder's kernel calls.
 *
 * Each function returns a snippet that calls one method of the kernel-side ``ConfigBuilder``
 * instance (``_CB_INSTANCE``, from ``jupyter_bioacoustic/config_builder/core.py``) and prints
 * its JSON reply between ``___CB_JSON___`` markers. Run the snippet with ``KernelBridge.exec``
 * and parse the output with ``extractJson``; the reply shapes are the ``*Reply`` types below.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
//
// Constants
//
const DELIM = '___CB_JSON___';
//
// Public
//
/**
 * The JSON text a builder snippet printed between the ``___CB_JSON___`` markers.
 *
 * @param raw - The snippet's stdout.
 * @throws Error when the markers are missing or empty.
 */
function extractJson(raw) {
    const start = raw.indexOf(DELIM);
    const end = raw.lastIndexOf(DELIM);
    if (start >= 0 && end > start) {
        const content = raw.substring(start + DELIM.length, end).trim();
        if (content)
            return content;
    }
    throw new Error('No valid JSON in kernel output');
}
exports.extractJson = extractJson;
/**
 * Create the kernel's ``ConfigBuilder`` once (``ConfigBuilder().setup()``), optionally after
 * ``chdir`` to ``cwd``. Reply: ``ReadyReply``.
 *
 * @param cwd - Directory to change to first.
 */
function ensureSetup(cwd) {
    const lines = [`import json as _j, os as _os`];
    if (cwd) {
        lines.push(`_os.chdir(_os.path.expanduser('${(0, util_1.escPy)(cwd)}'))`);
    }
    lines.push(`try:`, `    _CB_INSTANCE`, `except NameError:`, `    from jupyter_bioacoustic.config_builder import ConfigBuilder as _CB_cls`, `    _cb = _CB_cls()`, `    _cb.setup()`);
    lines.push(wp(`_j.dumps({'ready': True, 'debug': bool(_os.environ.get('JBA_DEBUG_MODE')), 'cwd': _os.getcwd()})`));
    return lines.join('\n');
}
exports.ensureSetup = ensureSetup;
/**
 * ``chdir`` to ``cwd`` and create + ``setup()`` a fresh ``ConfigBuilder`` — run once when the
 * builder command opens, before the widget exists. No JSON reply.
 *
 * @param cwd - Directory the builder works in (``~`` expanded).
 */
function initBuilder(cwd) {
    return [
        `import os as _os`,
        `_os.chdir(_os.path.expanduser('${(0, util_1.escPy)(cwd)}'))`,
        `from jupyter_bioacoustic.config_builder import ConfigBuilder`,
        `_cb = ConfigBuilder()`,
        `_cb.setup()`,
    ].join('\n');
}
exports.initBuilder = initBuilder;
/**
 * ``update_section(section, data, target=...)``. Reply: ``BuilderState``.
 *
 * @param section - Builder section name (``data``, ``app``, ``project``, ...).
 * @param data - The section's ``getData()`` payload.
 * @param target - Python-side target (``form_config`` for the form file).
 */
function updateSection(section, data, target) {
    const dataJson = JSON.stringify(data);
    const targetArg = target ? `, target='${(0, util_1.escPy)(target)}'` : '';
    return [
        `import json as _j`,
        `_state = _CB_INSTANCE.update_section('${(0, util_1.escPy)(section)}', _j.loads('${(0, util_1.escPy)(dataJson)}')${targetArg})`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.updateSection = updateSection;
/**
 * ``update_config_from_yaml(yaml, config_type)`` then ``_get_state()``.
 * Reply: ``BuilderState`` with ``update_ok``.
 *
 * @param yamlStr - Edited YAML text.
 * @param configType - ``project`` / ``config`` / ``form_config``.
 */
function updateConfigFromYaml(yamlStr, configType) {
    const yamlJson = JSON.stringify(yamlStr);
    return [
        `import json as _j`,
        `_ok = _CB_INSTANCE.update_config_from_yaml(_j.loads(${JSON.stringify(yamlJson)}), '${(0, util_1.escPy)(configType)}')`,
        `_state = _CB_INSTANCE._get_state()`,
        `_state['update_ok'] = _ok`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.updateConfigFromYaml = updateConfigFromYaml;
/** ``save_all()`` then ``_get_state()``. Reply: ``BuilderState`` with ``saved_paths``. */
function saveAll() {
    return [
        `import json as _j`,
        `_paths = _CB_INSTANCE.save_all()`,
        `_state = _CB_INSTANCE._get_state()`,
        `_state['saved_paths'] = _paths`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.saveAll = saveAll;
/**
 * ``save_single(config_type)``. Reply: ``{saved_to: string}``.
 *
 * @param configType - ``project`` / ``config`` / ``form_config``.
 */
function saveSingleFile(configType) {
    return [
        `import json as _j`,
        `_path = _CB_INSTANCE.save_single('${(0, util_1.escPy)(configType)}')`,
        wp(`_j.dumps({'saved_to': _path})`),
    ].join('\n');
}
exports.saveSingleFile = saveSingleFile;
/**
 * ``list_files(directory, extensions)`` plus the resolved directory. Reply: ``ListFilesReply``.
 *
 * @param directory - Directory to list.
 * @param extensions - Only list files with these extensions (all files when omitted).
 * @param rootDir - Root the browser shows paths relative to (resolved into ``root_resolved``).
 */
function listFiles(directory, extensions, rootDir) {
    const extArg = extensions ? `[${extensions.map(e => `'${(0, util_1.escPy)(e)}'`).join(',')}]` : 'None';
    const rootLine = rootDir
        ? `_r = _os.path.realpath('${(0, util_1.escPy)(rootDir)}')`
        : `_r = None`;
    return [
        `import json as _j, os as _os`,
        `_d = _os.path.realpath('${(0, util_1.escPy)(directory)}')`,
        rootLine,
        wp(`_j.dumps({'files': _CB_INSTANCE.list_files('${(0, util_1.escPy)(directory)}', ${extArg}), 'resolved': _d, 'root_resolved': _r})`),
    ].join('\n');
}
exports.listFiles = listFiles;
/**
 * ``os.makedirs(dirPath, exist_ok=True)``. Reply: ``{created: string}``.
 *
 * @param dirPath - Directory to create.
 */
function createDirectory(dirPath) {
    return [
        `import json as _j, os as _os`,
        `_os.makedirs('${(0, util_1.escPy)(dirPath)}', exist_ok=True)`,
        wp(`_j.dumps({'created': '${(0, util_1.escPy)(dirPath)}'})`),
    ].join('\n');
}
exports.createDirectory = createDirectory;
/**
 * ``read_columns(filepath)`` for a local data file. Reply: ``ColumnsReply``.
 *
 * @param filepath - Local data file.
 */
function readColumns(filepath) {
    return [
        `import json as _j`,
        wp(`_j.dumps({'columns': _CB_INSTANCE.read_columns('${(0, util_1.escPy)(filepath)}')})`),
    ].join('\n');
}
exports.readColumns = readColumns;
/**
 * ``read_columns_from_source(source_type, value, secrets)`` for any data source (path, url incl.
 * s3://, sql, api). Reply: ``ColumnsReply``.
 *
 * @param sourceType - The data ``source_type``.
 * @param value - The data ``value`` (path, URL, query, endpoint).
 * @param secrets - The data section's secrets (``SecretsEditor.getData()``).
 */
function readColumnsFromSource(sourceType, value, secrets) {
    const secretsJson = JSON.stringify(secrets !== null && secrets !== void 0 ? secrets : null);
    return [
        `import json as _j`,
        `_cols = _CB_INSTANCE.read_columns_from_source('${(0, util_1.escPy)(sourceType)}', '${(0, util_1.escPy)(value)}', _j.loads('${(0, util_1.escPy)(secretsJson)}'))`,
        wp(`_j.dumps({'columns': _cols})`),
    ].join('\n');
}
exports.readColumnsFromSource = readColumnsFromSource;
/**
 * ``check_audio_url(value)`` — raises (so ``exec`` throws) when the audio isn't reachable.
 * Reply: ``AudioCheckReply``.
 *
 * @param value - Remote audio URL / URI.
 */
function checkAudioUrl(value) {
    return [
        `import json as _j`,
        wp(`_j.dumps(_CB_INSTANCE.check_audio_url('${(0, util_1.escPy)(value)}'))`),
    ].join('\n');
}
exports.checkAudioUrl = checkAudioUrl;
/**
 * ``os.path.exists(path)``. Reply: ``{exists: boolean}``.
 *
 * @param path - Path to check (relative to the kernel's cwd).
 */
function checkFileExists(path) {
    return [
        `import os, json`,
        wp(`json.dumps({'exists': os.path.exists('${(0, util_1.escPy)(path)}')})`),
    ].join('\n');
}
exports.checkFileExists = checkFileExists;
/**
 * ``set_section_target(section, target)`` then ``_get_state()``. Reply: ``BuilderState``.
 *
 * @param section - Builder section name.
 * @param target - Python-side target (``project`` / ``config`` / ``split`` / ``form_config``).
 */
function setSectionTarget(section, target) {
    return [
        `import json as _j`,
        `_CB_INSTANCE.set_section_target('${(0, util_1.escPy)(section)}', '${(0, util_1.escPy)(target)}')`,
        `_state = _CB_INSTANCE._get_state()`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.setSectionTarget = setSectionTarget;
/** ``validate()``. Reply: ``ValidationReply``. */
function validateConfig() {
    return [
        `import json as _j`,
        wp(`_j.dumps(_CB_INSTANCE.validate())`),
    ].join('\n');
}
exports.validateConfig = validateConfig;
/**
 * ``load_config(path, file_type=...)`` (cascades project -> config -> form).
 * Reply: ``BuilderState`` with ``detected_type`` and ``loaded_paths``.
 *
 * @param path - File to load.
 * @param fileType - ``project`` / ``config`` / ``form`` hint (auto-detected when omitted).
 */
function loadConfig(path, fileType) {
    const hint = fileType ? `, file_type='${(0, util_1.escPy)(fileType)}'` : '';
    return [
        `import json as _j`,
        `_state = _CB_INSTANCE.load_config('${(0, util_1.escPy)(path)}'${hint})`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.loadConfig = loadConfig;
/** ``get_routing_keys()``. Reply: ``RoutingKeys`` (see ``types.ts``). */
function getRoutingKeys() {
    return [
        `import json as _j`,
        wp(`_j.dumps(_CB_INSTANCE.get_routing_keys())`),
    ].join('\n');
}
exports.getRoutingKeys = getRoutingKeys;
/** ``list_templates()``. Reply: ``{templates: TemplateSummary[]}``. */
function listTemplates() {
    return [
        `import json as _j`,
        wp(`_j.dumps({'templates': _CB_INSTANCE.list_templates()})`),
    ].join('\n');
}
exports.listTemplates = listTemplates;
/**
 * ``load_template(name)``. Reply: ``{template: Record<string, any>}`` (the parsed template).
 *
 * @param name - Template file stem.
 */
function loadTemplate(name) {
    return [
        `import json as _j`,
        wp(`_j.dumps({'template': _CB_INSTANCE.load_template('${(0, util_1.escPy)(name)}')})`),
    ].join('\n');
}
exports.loadTemplate = loadTemplate;
/**
 * ``apply_template(name, scope, project_name, values)``. Reply: ``BuilderState``.
 *
 * @param name - Template file stem.
 * @param scope - What to create: ``project`` / ``config`` / ``form``.
 * @param projectName - Project name (sets the linked file names).
 * @param values - The user's value per template placeholder.
 */
function applyTemplate(name, scope, projectName, values) {
    const valuesJson = JSON.stringify(values);
    return [
        `import json as _j`,
        `_state = _CB_INSTANCE.apply_template('${(0, util_1.escPy)(name)}', '${(0, util_1.escPy)(scope)}', '${(0, util_1.escPy)(projectName)}', _j.loads('${(0, util_1.escPy)(valuesJson)}'))`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.applyTemplate = applyTemplate;
/**
 * ``summary.build_summary_from_builder(_CB_INSTANCE)``.
 * Reply: the Configuration Summary sections (``ConfigSummary.update``'s input).
 */
function getSummary() {
    return [
        `import json as _j`,
        `from jupyter_bioacoustic.config_builder.summary import build_summary_from_builder as _bsfb`,
        wp(`_j.dumps(_bsfb(_CB_INSTANCE))`),
    ].join('\n');
}
exports.getSummary = getSummary;
/**
 * ``os.chdir(newDir)``. Reply: ``{cwd: string}`` (the new absolute cwd).
 *
 * @param newDir - Directory to change to (``~`` expanded).
 */
function changeCwd(newDir) {
    return [
        `import json as _j, os as _os`,
        `_os.chdir(_os.path.expanduser('${(0, util_1.escPy)(newDir)}'))`,
        wp(`_j.dumps({'cwd': _os.getcwd()})`),
    ].join('\n');
}
exports.changeCwd = changeCwd;
/**
 * ``BioacousticAnnotator(project=projectPath).setup()`` — prepares the annotator for the
 * saved project. No JSON reply.
 *
 * @param projectPath - Saved project (or config) file.
 */
function setupAnnotatorFromProject(projectPath) {
    return [
        `from jupyter_bioacoustic import BioacousticAnnotator as _BA`,
        `_ba = _BA(project='${(0, util_1.escPy)(projectPath)}')`,
        `_ba.setup()`,
    ].join('\n');
}
exports.setupAnnotatorFromProject = setupAnnotatorFromProject;
//
// Internal
//
/** A Python statement printing ``expr`` between the JSON markers. */
function wp(expr) {
    return `print('${DELIM}'); print(${expr}); print('${DELIM}')`;
}


/***/ },

/***/ "./lib/config_builder/saveFlow.js"
/*!****************************************!*\
  !*** ./lib/config_builder/saveFlow.js ***!
  \****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SaveFlow = void 0;
/**
 * The builder's validate / save flows: Validate, validate-before-open, and validate ->
 * confirm overwrites -> ``save_all``. All three share the kernel ``validate()`` call and the
 * same error / warning dialog text.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const builderState_1 = __webpack_require__(/*! ./builderState */ "./lib/config_builder/builderState.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
//
// Constants
//
const NOTHING_TO_SAVE = 'Nothing to save — all files are disabled or locked';
//
// Public
//
class SaveFlow {
    /**
     * @param bk - The builder's kernel connection.
     * @param status - Status line for progress / outcome.
     * @param getFiles - The Configuration Files section's current data.
     */
    constructor(bk, status, getFiles) {
        this._bk = bk;
        this._status = status;
        this._getFiles = getFiles;
    }
    /** Validate and show the result (passed / passed with warnings / failed) in a dialog. */
    async validate() {
        await this._bk.ready;
        if (!this._bk.isReady)
            return;
        await this._validated('Validate error', async (reply, body) => {
            if (reply.valid && !body) {
                this._status.set('Validation passed');
                await (0, util_1.showDialog)({ title: 'Validation Passed', body: 'No issues found.' });
            }
            else if (reply.valid) {
                this._status.set('Validation passed with warnings', 'warning');
                await (0, util_1.showDialog)({ title: 'Validation Passed', body });
            }
            else {
                this._status.set('Validation failed', 'error');
                await (0, util_1.showDialog)({ title: 'Validation Failed', body });
            }
            return true;
        });
    }
    /**
     * Validate before opening the annotator on the saved files (errors block, warnings ask).
     *
     * @returns The file to open, or null when cancelled / invalid / nothing to open.
     */
    async validateForOpen() {
        await this._bk.ready;
        if (!this._bk.isReady)
            return null;
        const files = this._getFiles();
        if ((0, builderState_1.writableFiles)(files).length === 0) {
            this._status.set(NOTHING_TO_SAVE, 'error');
            return null;
        }
        const proceed = await this._validated('Validation error', async (reply, body) => {
            if (!reply.valid) {
                await (0, util_1.showDialog)({ title: 'Validation Failed', body });
                this._status.set('Validation failed', 'error');
                return false;
            }
            if (body && !await this._confirm('Validation Warnings', body, 'Open Anyway')) {
                this._status.set('Cancelled', 'warning');
                return false;
            }
            return true;
        });
        if (!proceed)
            return null;
        this._status.set('Ready');
        return (0, builderState_1.activeFilePath)(files).path || null;
    }
    /**
     * Validate, confirm overwriting existing files, then ``save_all``.
     *
     * @param blockOnErrors - Validation errors cancel the save (else the user may save anyway).
     * @param onSaved - Receives the post-save state; returns the path to report as saved.
     * @returns ``onSaved``'s path, or null when cancelled or failed.
     */
    async validateAndSave(blockOnErrors, onSaved) {
        await this._bk.ready;
        if (!this._bk.isReady)
            return null;
        const enabled = (0, builderState_1.writableFiles)(this._getFiles());
        if (enabled.length === 0) {
            this._status.set(NOTHING_TO_SAVE, 'error');
            return null;
        }
        const proceed = await this._validated('Validation error', async (reply, body) => {
            if (!reply.valid && blockOnErrors) {
                await (0, util_1.showDialog)({ title: 'Validation Failed', body });
                this._status.set('Save cancelled — validation errors', 'error');
                return false;
            }
            if (!reply.valid || body) {
                const title = reply.valid ? 'Validation Warnings' : 'Validation Failed';
                if (!await this._confirm(title, body, 'Save Anyway')) {
                    this._status.set('Save cancelled', 'warning');
                    return false;
                }
            }
            return true;
        });
        if (!proceed)
            return null;
        // every file about to be written (project, config AND form), as the kernel will name it
        const existing = [];
        for (const path of enabled.map(builderState_1.withYamlExt)) {
            await this._bk.run((0, python_1.checkFileExists)(path), null, (r) => {
                if (r.exists)
                    existing.push(path);
            }); // unknown: treat as new
        }
        if (existing.length > 0) {
            const body = `These files already exist and will be overwritten:\n• ${existing.join('\n• ')}`;
            if (!await this._confirm('Overwrite Files?', body, 'Overwrite'))
                return null;
        }
        this._bk.dbg('saveToFile', { enabled });
        this._status.set(`Saving ${enabled.length} file(s)…`);
        return this._bk.run((0, python_1.saveAll)(), 'Save failed', onSaved);
    }
    /**
     * Run the kernel's ``validate()`` and let ``decide`` act on it (dialogs, status).
     *
     * @param failLabel - Status label if the call (or ``decide``) fails.
     * @param decide - Gets the reply and its dialog text; resolves whether to continue.
     */
    async _validated(failLabel, decide) {
        this._status.set('Validating…');
        const proceed = await this._bk.run((0, python_1.validateConfig)(), failLabel, (reply) => decide(reply, (0, builderState_1.formatValidation)(reply)));
        return proceed === true;
    }
    /** A Cancel / ``okLabel`` dialog; true when ``okLabel`` was chosen. */
    async _confirm(title, body, okLabel) {
        const choice = await (0, util_1.showDialog)({
            title, body, buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true }],
        });
        return choice === okLabel;
    }
}
exports.SaveFlow = SaveFlow;


/***/ },

/***/ "./lib/config_builder/sections/AppSection.js"
/*!***************************************************!*\
  !*** ./lib/config_builder/sections/AppSection.js ***!
  \***************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppSection = void 0;
/**
 * Application section: annotator-wide settings (project name, clip-table display columns,
 * info card templates, sort, duplicate entries, buffer, capture, sizes, secrets). Display
 * columns become draggable chips once the data columns are known.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
//
// Public
//
class AppSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Application', 'app', false, true);
        /** Browse clicked for capture_dir (payload: the current dir, or ``.``). */
        this.browseRequested = new signaling_1.Signal(this);
        this._dispCols = [];
        this._dispColsSet = false; // Track if display_columns was explicitly set
        this._availableCols = [];
        this._projectNameInput = (0, dom_1.makeInput)('e.g. Bird Review', '250px');
        this._projectNameInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('project_name', this._projectNameInput));
        this._dispTextInput = (0, dom_1.makeInput)('col1, col2, col3', '250px');
        this._dispTextInput.addEventListener('input', () => {
            this._dispColsSet = true;
            this._dispCols = this._dispTextInput.value.split(',').map(s => s.trim()).filter(Boolean);
            this._emitChanged();
        });
        this._dispChipsArea = this._makeChipsArea();
        this._dispChipsArea.style.display = 'none';
        this._attachEmptyAreaDrop(this._dispChipsArea);
        this._dispPickerArea = this._makePickerArea();
        const dispWrap = this._makeColumnGroupWrapper();
        dispWrap.append(this._makeSectionLabel('display_columns', 'display columns'), this._dispTextInput, this._dispChipsArea, this._dispPickerArea);
        this._body.appendChild(dispWrap);
        this._titleInput = (0, dom_1.makeInput)('[[common_name]]', '220px');
        this._titleInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('info_card_title', this._titleInput));
        this._textInput = (0, dom_1.makeInput)('species: [[species]] | confidence: [[confidence]]', '220px');
        this._textInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('info_card_text', this._textInput));
        this._sortInput = (0, dom_1.makeInput)('column (default: file order)', '180px');
        this._sortInput.addEventListener('input', () => this._emitChanged());
        // dropdown shown once data columns are known; writes back into _sortInput
        // (the canonical value). Empty option = None (file order).
        this._sortSelect = (0, dom_1.makeSelect)([], '');
        this._sortSelect.style.display = 'none';
        this._sortSelect.addEventListener('change', () => {
            this._sortInput.value = this._sortSelect.value;
            this._emitChanged();
        });
        const sortRow = this._makeFieldRow('sort', this._sortInput);
        sortRow.appendChild(this._sortSelect);
        this._body.appendChild(sortRow);
        this._sortOrderSelect = (0, dom_1.makeSelect)(['asc', 'desc'], 'asc');
        this._sortOrderSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('sort_order', this._sortOrderSelect));
        const { row: dupRow, input: dupCb } = this._makeCheckbox('duplicate_entries');
        this._duplicateCb = dupCb;
        this._duplicateCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(dupRow);
        this._bufferInput = (0, dom_1.makeInput)('3', '80px');
        this._bufferInput.type = 'number';
        this._bufferInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('default_buffer', this._bufferInput));
        const { row: capRow, input: capCb } = this._makeCheckbox('capture');
        this._captureCb = capCb;
        this._captureCb.checked = true;
        this._captureCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(capRow);
        const capDirRow = this._makeFocusRow('capture_dir', 'capture_dir');
        this._captureDirInput = (0, dom_1.makeInput)('captures/', '160px');
        this._captureDirInput.addEventListener('input', () => this._emitChanged());
        const capDirBrowse = (0, dom_1.makeButton)('Browse');
        capDirBrowse.addEventListener('click', () => {
            this.browseRequested.emit(this._captureDirInput.value || '.');
        });
        capDirRow.append(this._captureDirInput, capDirBrowse);
        this._body.appendChild(capDirRow);
        this._widthInput = (0, dom_1.makeInput)('100%', '100px');
        this._widthInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('width', this._widthInput));
        const heightRow = this._makeFocusRow('clip_table_height', 'heights');
        this._clipTableHeightInput = (0, dom_1.makeInput)('175', '60px');
        this._clipTableHeightInput.type = 'number';
        this._playerHeightInput = (0, dom_1.makeInput)('260', '60px');
        this._playerHeightInput.type = 'number';
        this._infoCardHeightInput = (0, dom_1.makeInput)('34', '60px');
        this._infoCardHeightInput.type = 'number';
        this._formPanelHeightInput = (0, dom_1.makeInput)('140', '60px');
        this._formPanelHeightInput.type = 'number';
        for (const inp of [this._clipTableHeightInput, this._playerHeightInput,
            this._infoCardHeightInput, this._formPanelHeightInput]) {
            inp.addEventListener('input', () => this._emitChanged());
        }
        this._captureHeightInput = (0, dom_1.makeInput)('', '60px');
        this._captureHeightInput.type = 'number';
        this._captureHeightInput.addEventListener('input', () => this._emitChanged());
        const hLabels = ['clip_table', 'player', 'info_card', 'form_panel', 'capture'];
        const hInputs = [this._clipTableHeightInput, this._playerHeightInput,
            this._infoCardHeightInput, this._formPanelHeightInput, this._captureHeightInput];
        for (let i = 0; i < hLabels.length; i++) {
            const mini = document.createElement('span');
            mini.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:10px;`;
            mini.textContent = hLabels[i];
            heightRow.append(mini, hInputs[i]);
        }
        this._body.appendChild(heightRow);
        this._secrets = new SecretsEditor_1.SecretsEditor(false);
        this._secrets.changed.connect(() => this._emitChanged());
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    /** Set capture_dir (e.g. from Browse). */
    setCaptureDir(path) {
        this._captureDirInput.value = path;
        this._emitChanged();
    }
    /** Offer the data columns: sort dropdown and display-column chips (free text without). */
    setColumnOptions(cols) {
        this._availableCols = cols;
        // sort field: dropdown of [None] + columns when columns are known,
        // otherwise fall back to the free-text input
        (0, dom_1.fillSelect)(this._sortSelect, cols, 'None');
        const curSort = this._sortInput.value.trim();
        this._sortSelect.value = cols.includes(curSort) ? curSort : '';
        const hasCols = cols.length > 0;
        this._sortSelect.style.display = hasCols ? '' : 'none';
        this._sortInput.style.display = hasCols ? 'none' : '';
        if (cols.length > 0) {
            if (this._dispCols.length === 0 && this._dispTextInput.value.trim()) {
                this._dispCols = this._dispTextInput.value.split(',').map(s => s.trim()).filter(Boolean);
            }
            this._dispTextInput.style.display = 'none';
            this._dispChipsArea.style.display = '';
            this._rebuildChips(this._dispChipsArea, this._dispCols);
        }
        else {
            this._dispTextInput.value = this._dispCols.join(', ');
            this._dispTextInput.style.display = '';
            this._dispChipsArea.style.display = 'none';
        }
        this._rebuildPicker(this._dispPickerArea, this._dispCols);
    }
    getData() {
        const result = {};
        const pn = this._projectNameInput.value.trim();
        if (pn)
            result.project_name = pn;
        if (this._dispColsSet)
            result.display_columns = this._dispCols.length > 0 ? [...this._dispCols] : [];
        result.info_card_title = this._titleInput.value.trim();
        result.info_card_text = this._textInput.value.trim();
        const sortCol = this._sortInput.value.trim();
        if (sortCol) {
            result.sort = sortCol;
            if (this._sortOrderSelect.value === 'desc')
                result.sort_order = 'desc';
        }
        if (this._duplicateCb.checked)
            result.duplicate_entries = true;
        const bufStr = this._bufferInput.value.trim();
        if (bufStr !== '') {
            const buf = parseFloat(bufStr);
            if (!isNaN(buf) && buf !== 3)
                result.default_buffer = buf;
        }
        if (this._captureCb.checked)
            result.capture = true;
        else
            result.capture = false;
        if (this._captureDirInput.value)
            result.capture_dir = this._captureDirInput.value;
        const w = this._widthInput.value;
        if (w && w !== '100%')
            result.width = w;
        const cth = parseInt(this._clipTableHeightInput.value);
        if (!isNaN(cth) && cth !== 175)
            result.clip_table_height = cth;
        const ph = parseInt(this._playerHeightInput.value);
        if (!isNaN(ph) && ph !== 260)
            result.player_height = ph;
        const ich = parseInt(this._infoCardHeightInput.value);
        if (!isNaN(ich) && ich !== 34)
            result.info_card_height = ich;
        const fph = parseInt(this._formPanelHeightInput.value);
        if (!isNaN(fph) && fph !== 140)
            result.form_panel_height = fph;
        const ch = parseInt(this._captureHeightInput.value);
        if (!isNaN(ch) && ch > 0)
            result.capture_height = ch;
        const secrets = this._secrets.getData();
        if (secrets !== undefined)
            result.secrets = secrets;
        return result;
    }
    /** Set project_name (e.g. from Setup > Create New). */
    setProjectName(name) {
        this._projectNameInput.value = name;
        this._emitChanged();
    }
    reset() {
        for (const el of [
            this._projectNameInput, this._dispTextInput, this._titleInput, this._textInput,
            this._sortInput, this._bufferInput, this._captureDirInput, this._widthInput,
            this._clipTableHeightInput, this._playerHeightInput, this._infoCardHeightInput,
            this._formPanelHeightInput, this._captureHeightInput,
        ]) {
            el.value = '';
        }
        this._sortSelect.value = '';
        this._sortOrderSelect.value = 'asc';
        this._duplicateCb.checked = false;
        this._captureCb.checked = true;
        this._dispCols = [];
        this._dispColsSet = false;
        if (this._availableCols.length > 0)
            this._rebuildChips(this._dispChipsArea, this._dispCols);
        this._rebuildPicker(this._dispPickerArea, this._dispCols);
        this._secrets.reset();
    }
    setData(data) {
        if (data.project_name !== undefined)
            this._projectNameInput.value = data.project_name;
        if ('display_columns' in data && Array.isArray(data.display_columns)) {
            this._dispCols = [...data.display_columns];
            this._dispColsSet = true;
            this._dispTextInput.value = this._dispCols.join(', ');
            if (this._availableCols.length > 0) {
                this._dispTextInput.style.display = 'none';
                this._dispChipsArea.style.display = '';
                this._rebuildChips(this._dispChipsArea, this._dispCols);
            }
            this._rebuildPicker(this._dispPickerArea, this._dispCols);
        }
        if (data.info_card_title)
            this._titleInput.value = data.info_card_title;
        if (data.info_card_text)
            this._textInput.value = data.info_card_text;
        if (data.sort !== undefined) {
            const sv = data.sort ? String(data.sort) : '';
            this._sortInput.value = sv;
            this._sortSelect.value = this._availableCols.includes(sv) ? sv : '';
        }
        if (data.sort_order !== undefined)
            this._sortOrderSelect.value = String(data.sort_order) === 'desc' ? 'desc' : 'asc';
        if (data.duplicate_entries)
            this._duplicateCb.checked = true;
        if (data.default_buffer !== undefined)
            this._bufferInput.value = String(data.default_buffer);
        if (data.capture === false)
            this._captureCb.checked = false;
        if (data.capture_dir)
            this._captureDirInput.value = data.capture_dir;
        if (data.width)
            this._widthInput.value = String(data.width);
        if (data.clip_table_height)
            this._clipTableHeightInput.value = String(data.clip_table_height);
        if (data.player_height)
            this._playerHeightInput.value = String(data.player_height);
        if (data.info_card_height)
            this._infoCardHeightInput.value = String(data.info_card_height);
        if (data.form_panel_height)
            this._formPanelHeightInput.value = String(data.form_panel_height);
        if (data.capture_height)
            this._captureHeightInput.value = String(data.capture_height);
        if (data.secrets !== undefined)
            this._secrets.setData(data.secrets);
    }
    _makeChipsArea() {
        const area = document.createElement('div');
        area.style.cssText = `display:flex;flex-wrap:wrap;gap:4px;min-height:22px;padding:2px 0;`;
        return area;
    }
    _makePickerArea() {
        const area = document.createElement('div');
        area.style.cssText =
            `display:none;flex-wrap:wrap;gap:4px;padding:4px 0;` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};margin-top:2px;`;
        return area;
    }
    _makeColumnGroupWrapper() {
        const wrap = document.createElement('div');
        wrap.style.cssText =
            `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
                `background:${styles_1.COLORS.bgSurface0};border-radius:6px;`;
        return wrap;
    }
    _makeSectionLabel(fieldKey, displayText) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
        const lbl = document.createElement('span');
        lbl.textContent = displayText || fieldKey;
        lbl.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        row.append(lbl);
        row.addEventListener('click', () => this.fieldFocused.emit(fieldKey));
        return row;
    }
    _rebuildPicker(area, selected) {
        area.innerHTML = '';
        if (this._availableCols.length === 0) {
            area.style.display = 'none';
            return;
        }
        area.style.display = 'flex';
        const hint = document.createElement('span');
        hint.textContent = 'Click or drag to add:';
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;width:100%;`;
        area.appendChild(hint);
        for (const col of this._availableCols) {
            if (selected.includes(col))
                continue;
            const chip = document.createElement('button');
            chip.textContent = `+ ${col}`;
            chip.draggable = true;
            chip.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;
            // Click functionality (existing)
            chip.addEventListener('click', () => {
                this._dispColsSet = true;
                selected.push(col);
                this._rebuildChips(this._dispChipsArea, selected);
                this._rebuildPicker(area, selected);
                this._emitChanged();
            });
            // Drag functionality (new)
            chip.addEventListener('dragstart', (e) => {
                chip.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('text/plain', col);
            });
            chip.addEventListener('dragend', () => {
                chip.style.opacity = '1';
            });
            area.appendChild(chip);
        }
    }
    /**
     * Dropping a column on the EMPTY chips area adds it. Attached once (it used to be re-added on
     * every empty rebuild, stacking handlers that held stale copies of the list).
     */
    _attachEmptyAreaDrop(area) {
        const isEmpty = () => this._dispCols.length === 0;
        area.addEventListener('dragover', (e) => {
            if (!isEmpty())
                return;
            e.preventDefault();
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'copy';
            area.style.background = styles_1.COLORS.bgSurface1;
        });
        area.addEventListener('dragleave', () => { area.style.background = ''; });
        area.addEventListener('drop', (e) => {
            var _a;
            if (!isEmpty())
                return;
            e.preventDefault();
            area.style.background = '';
            const col = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.getData('text/plain');
            if (!col)
                return;
            this._dispColsSet = true;
            this._dispCols.push(col);
            this._rebuildChips(area, this._dispCols);
            this._rebuildPicker(this._dispPickerArea, this._dispCols);
            this._emitChanged();
        });
    }
    _rebuildChips(area, selected) {
        area.innerHTML = '';
        if (selected.length === 0) {
            const hint = document.createElement('span');
            hint.textContent = '(none)';
            hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-style:italic;`;
            area.appendChild(hint);
            return; // dropping on the empty area: see _attachEmptyAreaDrop
        }
        // Create container for chips with drop zones
        const container = document.createElement('div');
        container.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;';
        let draggedIdx = -1;
        // Helper to create drop zone
        const createDropZone = (insertIdx, isEnd = false) => {
            const zone = document.createElement('div');
            zone.style.cssText = isEnd
                ? 'flex:1;min-width:40px;min-height:20px;'
                : 'width:12px;min-height:20px;transition:all 0.2s;border-radius:4px;';
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (isEnd) {
                    zone.style.background = styles_1.COLORS.bgSurface1;
                }
                else {
                    zone.style.width = '28px';
                    zone.style.background = styles_1.COLORS.textPrimary;
                }
            });
            zone.addEventListener('dragleave', () => {
                zone.style.background = '';
                if (!isEnd)
                    zone.style.width = '12px';
            });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.style.background = '';
                if (!isEnd)
                    zone.style.width = '12px';
                const isReorder = e.dataTransfer.getData('reorder') === 'true';
                const newCol = e.dataTransfer.getData('text/plain');
                if (isReorder && draggedIdx >= 0) {
                    // Reordering existing chips
                    if (draggedIdx !== insertIdx && draggedIdx !== insertIdx - 1) {
                        this._dispColsSet = true;
                        const [moved] = selected.splice(draggedIdx, 1);
                        const targetIdx = draggedIdx < insertIdx ? insertIdx - 1 : insertIdx;
                        selected.splice(targetIdx, 0, moved);
                        this._dispCols = [...selected];
                        this._rebuildChips(area, this._dispCols);
                        this._emitChanged();
                    }
                }
                else if (!isReorder && newCol && !selected.includes(newCol)) {
                    this._dispColsSet = true;
                    selected.splice(insertIdx, 0, newCol);
                    this._dispCols = [...selected];
                    this._rebuildChips(area, this._dispCols);
                    this._rebuildPicker(this._dispPickerArea, this._dispCols);
                    this._emitChanged();
                }
            });
            return zone;
        };
        for (let i = 0; i < selected.length; i++) {
            // Add drop zone before each chip
            if (i === 0) {
                container.appendChild(createDropZone(0));
            }
            const col = selected[i];
            const chip = document.createElement('span');
            chip.draggable = true;
            chip.dataset.index = String(i);
            chip.style.cssText =
                `display:inline-flex;align-items:center;gap:4px;margin:0 2px;` +
                    `background:${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;cursor:grab;`;
            chip.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                draggedIdx = i;
                chip.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('reorder', 'true');
                e.dataTransfer.setData('text/plain', col);
            });
            chip.addEventListener('dragend', () => {
                chip.style.opacity = '1';
            });
            // Prevent chip from being a drop target
            chip.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            const name = document.createElement('span');
            name.textContent = col;
            const rm = document.createElement('button');
            rm.textContent = '\u2715';
            rm.style.cssText =
                `background:none;border:none;color:${styles_1.COLORS.textMuted};cursor:pointer;` +
                    `font-size:12px;padding:0 2px;line-height:1;`;
            rm.addEventListener('click', () => {
                const idx = selected.indexOf(col);
                if (idx >= 0) {
                    this._dispColsSet = true;
                    selected.splice(idx, 1);
                    this._dispCols = [...selected];
                    this._rebuildChips(area, this._dispCols);
                    this._rebuildPicker(this._dispPickerArea, this._dispCols);
                    this._emitChanged();
                }
            });
            chip.append(name, rm);
            container.appendChild(chip);
            // Add drop zone after each chip
            container.appendChild(createDropZone(i + 1, i === selected.length - 1));
        }
        area.appendChild(container);
    }
}
exports.AppSection = AppSection;


/***/ },

/***/ "./lib/config_builder/sections/AudioSection.js"
/*!*****************************************************!*\
  !*** ./lib/config_builder/sections/AudioSection.js ***!
  \*****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AudioSection = void 0;
/**
 * Audio section: where each row's audio comes from (``audio:`` — a single path, a url/uri, or
 * a data column per row, plus prefix / suffix / fallback and secrets). A remote value can be
 * checked for reachability (Validate).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
const sourceValue_1 = __webpack_require__(/*! ./sourceValue */ "./lib/config_builder/sections/sourceValue.js");
//
// Constants
//
/** The UI's single remote option; ``getData`` writes it as ``url`` (http/https) or ``uri``. */
const REMOTE_TYPE = 'url/uri';
//
// Public
//
class AudioSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Audio', 'audio', false, true, ['split', 'project', 'config']);
        /** Browse clicked (payload: the current value, or ``.``). */
        this.browseRequested = new signaling_1.Signal(this);
        /** Validate clicked: check the remote audio is reachable. */
        this.validateRequested = new signaling_1.Signal(this);
        this._availableCols = [];
        this._sourceType = (0, dom_1.makeSelect)(['path', REMOTE_TYPE, 'column'], 'path');
        this._sourceType.addEventListener('change', () => {
            this._updateValueUI();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));
        this._pathRow = this._makeFocusRow('value', 'value', true);
        this._valueInput = (0, dom_1.makeInput)('audio/recording.flac', '200px');
        this._valueInput.addEventListener('input', () => {
            this._autoDetectSourceType();
            this._emitChanged();
            this.setValidateStatus(null);
        });
        this._colSelect = (0, dom_1.makeSelect)([], '');
        this._colSelect.style.display = 'none';
        this._colSelect.addEventListener('change', () => this._emitChanged());
        this._colInput = (0, dom_1.makeInput)('column name', '150px');
        this._colInput.style.display = 'none';
        this._colInput.addEventListener('input', () => this._emitChanged());
        this._browseBtn = (0, dom_1.makeButton)('Browse');
        this._browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._valueInput.value || '.');
        });
        // For url/uri audio, confirm the remote file is reachable.
        this._validateBtn = (0, dom_1.makeButton)('Validate');
        this._validateBtn.style.display = 'none';
        this._validateBtn.addEventListener('click', () => {
            const v = this._valueInput.value.trim();
            if (v)
                this.validateRequested.emit(v);
        });
        this._validateStatus = (0, sourceValue_1.makeStatusBadge)();
        this._pathRow.append(this._valueInput, this._colSelect, this._colInput, this._browseBtn, this._validateBtn, this._validateStatus);
        this._body.appendChild(this._pathRow);
        this._prefixInput = (0, dom_1.makeInput)('optional prefix', '200px');
        this._prefixInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('prefix', this._prefixInput));
        this._suffixInput = (0, dom_1.makeInput)('optional suffix', '200px');
        this._suffixInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('suffix', this._suffixInput));
        this._fallbackInput = (0, dom_1.makeInput)('fallback path', '200px');
        this._fallbackInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('fallback', this._fallbackInput));
        this._secrets = new SecretsEditor_1.SecretsEditor(true);
        this._secrets.changed.connect(() => this._emitChanged());
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    /** Set the value (e.g. from Browse). */
    setPath(path) {
        this._valueInput.value = path;
        this._emitChanged();
    }
    /** Offer the data columns for the ``column`` source type (dropdown instead of text). */
    setColumnOptions(cols) {
        this._availableCols = cols;
        (0, dom_1.fillSelect)(this._colSelect, cols);
        const pending = this._colInput.value.trim();
        if (pending && cols.includes(pending)) {
            this._colSelect.value = pending;
        }
        this._updateValueUI();
    }
    /** Set the validate indicator next to the button: ✓ ok, ✗ failed, null clears. */
    setValidateStatus(ok) {
        (0, sourceValue_1.setStatusBadge)(this._validateStatus, ok, 'Reachable', 'Not reachable — see status bar');
    }
    /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
    applyLocks(locks, routing) {
        this._applyRoutedLocks([
            { el: this._sourceType, key: 'source_type' },
            { el: this._valueInput, key: 'value' },
            { el: this._colSelect, key: 'value' },
            { el: this._colInput, key: 'value' },
            { el: this._browseBtn, key: 'value' },
            { el: this._secrets.element, key: 'secrets' },
            { el: this._prefixInput, key: 'prefix' },
            { el: this._suffixInput, key: 'suffix' },
            { el: this._fallbackInput, key: 'fallback' },
        ], locks, routing);
    }
    getData() {
        const uiType = this._sourceType.value;
        const result = {};
        let val = uiType === 'column'
            ? (this._availableCols.length > 0 ? this._colSelect.value : this._colInput.value.trim())
            : this._valueInput.value;
        if (val && uiType === REMOTE_TYPE) {
            // Auto-detect protocol and choose url (http/https) vs uri (s3, gs, ...)
            if (!constants_1.REMOTE_SCHEME_RE.test(val)) {
                // Default to https:// if no protocol specified
                val = `https://${val}`;
            }
            result.source_type =
                (val.startsWith('https://') || val.startsWith('http://')) ? 'url' : 'uri';
            result.value = val;
        }
        else if (val) {
            // 'path' or 'column' map directly to source_type
            result.source_type = uiType;
            result.value = val;
        }
        if (this._prefixInput.value)
            result.prefix = this._prefixInput.value;
        if (this._suffixInput.value)
            result.suffix = this._suffixInput.value;
        if (this._fallbackInput.value)
            result.fallback = this._fallbackInput.value;
        const secrets = this._secrets.getData();
        if (secrets !== undefined)
            result.secrets = secrets;
        return result;
    }
    reset() {
        this._sourceType.value = 'path';
        for (const el of [this._valueInput, this._colInput, this._prefixInput, this._suffixInput,
            this._fallbackInput]) {
            el.value = '';
        }
        this._colSelect.value = '';
        this._secrets.reset();
        this.setValidateStatus(null);
        this._updateValueUI();
    }
    setData(data) {
        var _a, _b, _c;
        // Current form: source_type + value. Legacy form: an explicit
        // path/url/uri/column key (still loadable).
        if (data.value !== undefined || data.source_type) {
            const st = data.source_type;
            if (st === 'column') {
                this._sourceType.value = 'column';
                this._colInput.value = (_a = data.value) !== null && _a !== void 0 ? _a : '';
                if (this._availableCols.includes(data.value)) {
                    this._colSelect.value = data.value;
                }
            }
            else if (st === 'url' || st === 'uri') {
                this._sourceType.value = REMOTE_TYPE;
                this._valueInput.value = (_b = data.value) !== null && _b !== void 0 ? _b : '';
            }
            else {
                // 'path' or a falsey/auto source_type
                this._sourceType.value = 'path';
                this._valueInput.value = (_c = data.value) !== null && _c !== void 0 ? _c : '';
            }
        }
        else if (data.path) {
            this._sourceType.value = 'path';
            this._valueInput.value = data.path;
        }
        else if (data.url || data.uri) {
            this._sourceType.value = REMOTE_TYPE;
            this._valueInput.value = data.url || data.uri;
        }
        else if (data.column) {
            this._sourceType.value = 'column';
            this._colInput.value = data.column;
            if (this._availableCols.includes(data.column)) {
                this._colSelect.value = data.column;
            }
        }
        if (data.prefix)
            this._prefixInput.value = data.prefix;
        if (data.suffix)
            this._suffixInput.value = data.suffix;
        if (data.fallback)
            this._fallbackInput.value = data.fallback;
        if (data.secrets !== undefined)
            this._secrets.setData(data.secrets);
        this._updateValueUI();
    }
    /** Switch source_type between path and url/uri from the typed value. */
    _autoDetectSourceType() {
        if ((0, sourceValue_1.autoDetectSourceType)(this._sourceType, this._valueInput.value, REMOTE_TYPE)) {
            this._updateValueUI();
        }
    }
    _updateValueUI() {
        const sourceType = this._sourceType.value;
        const isCol = sourceType === 'column';
        const hasCols = this._availableCols.length > 0;
        this._valueInput.style.display = isCol ? 'none' : '';
        this._colSelect.style.display = (isCol && hasCols) ? '' : 'none';
        this._colInput.style.display = (isCol && !hasCols) ? '' : 'none';
        this._browseBtn.style.display = (sourceType === 'path') ? '' : 'none';
        this._validateBtn.style.display = (sourceType === REMOTE_TYPE) ? '' : 'none';
        this.setValidateStatus(null);
    }
}
exports.AudioSection = AudioSection;


/***/ },

/***/ "./lib/config_builder/sections/CollapsibleSection.js"
/*!***********************************************************!*\
  !*** ./lib/config_builder/sections/CollapsibleSection.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollapsibleSection = void 0;
/**
 * Base class of every config-builder section: a collapsible ``<details>`` with a title bar,
 * an optional "target" dropdown (which file the section writes to), accordion / pin
 * behaviour, file-lock UI and the shared field-row factories.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
//
// Constants
//
const DEFAULT_TARGETS = ['project', 'config'];
/** The small lock icon shown after each disabled control. */
const lockMarkers = new WeakMap();
//
// Public
//
class CollapsibleSection {
    /**
     * @param title - Title bar text.
     * @param sectionName - Name used for kernel calls and docs (``data``, ``app``, ...).
     * @param open - Start expanded.
     * @param showTargetToggle - Show the "target:" dropdown in the title bar.
     * @param targetOptions - The dropdown's options (default project / config).
     */
    constructor(title, sectionName, open = false, showTargetToggle = false, targetOptions) {
        /** The title bar was clicked (payload: section name) — shows this section's docs. */
        this.focused = new signaling_1.Signal(this);
        /** A field was focused/clicked (payload: its docs key) — highlights it in the docs. */
        this.fieldFocused = new signaling_1.Signal(this);
        /** A value changed; the panel then sends ``getData()`` to the kernel. */
        this.changed = new signaling_1.Signal(this);
        /** The target dropdown changed. */
        this.targetChanged = new signaling_1.Signal(this);
        /** The section is about to open (the panel closes the other unpinned sections). */
        this.opened = new signaling_1.Signal(this);
        this._targetToggle = null;
        this._targetLockBadge = null;
        this._bodyLockBanner = null;
        this._pinned = false;
        this._targetForceDisabled = false;
        this._optionsDisabled = false;
        this._sectionName = sectionName;
        this.element = document.createElement('details');
        if (open)
            this.element.open = true;
        this.element.style.cssText =
            `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
        const summary = document.createElement('summary');
        summary.style.cssText =
            `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
                `background:${styles_1.COLORS.bgMantle};color:${styles_1.COLORS.textPrimary};` +
                `list-style:none;user-select:none;letter-spacing:0.5px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};` +
                `display:flex;align-items:center;justify-content:space-between;`;
        summary.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                this._pin();
                return;
            }
            if (!this.element.open) {
                this.opened.emit(void 0);
            }
            else {
                this._pinned = false;
            }
            this.focused.emit(this._sectionName);
        });
        summary.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this._pin();
        });
        const leftGroup = document.createElement('span');
        leftGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;
        this._chevron = document.createElement('span');
        this._chevron.style.cssText =
            `font-size:20px;line-height:0;margin-top:-3px;color:${styles_1.COLORS.textMuted};flex-shrink:0;width:16px;text-align:center;`;
        this._chevron.textContent = open ? '▾' : '▸';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        leftGroup.append(this._chevron, titleSpan);
        summary.appendChild(leftGroup);
        this.element.addEventListener('toggle', () => this._updateChevron());
        if (showTargetToggle)
            summary.appendChild(this._buildTargetToggle(targetOptions));
        this._body = document.createElement('div');
        this._body.style.cssText =
            `padding:10px 12px;display:flex;flex-direction:column;gap:8px;` +
                `background:${styles_1.COLORS.bgBase};`;
        this._summary = summary;
        this.element.append(summary, this._body);
    }
    /** Pinned sections (Cmd/Ctrl-click or double-click) stay open when another one opens. */
    get isPinned() {
        return this._pinned;
    }
    /** Collapse and unpin. */
    close() {
        this.element.open = false;
        this._pinned = false;
        this._updateChevron();
    }
    /** The target dropdown's value (``project`` when the section has none). */
    getTarget() {
        var _a;
        return ((_a = this._targetToggle) === null || _a === void 0 ? void 0 : _a.value) || 'project';
    }
    /** Select ``target`` in the dropdown (no ``targetChanged``). */
    setTarget(target) {
        if (this._targetToggle) {
            this._targetToggle.value = target;
        }
    }
    /**
     * Replace the target choices (e.g. only the enabled files). Keeps the current target when
     * still offered, else picks the last option; a single option disables the dropdown.
     */
    setTargetOptions(options) {
        if (!this._targetToggle)
            return;
        const current = this._targetToggle.value;
        (0, dom_1.fillSelect)(this._targetToggle, options);
        if (options.includes(current))
            this._targetToggle.value = current;
        else if (options.length > 0)
            this._targetToggle.value = options[options.length - 1];
        this._optionsDisabled = options.length <= 1;
        this._applyTargetDisabled();
    }
    /** Grey out + disable the field body while keeping the section expandable. */
    setFieldsLocked(locked) {
        this._body.style.opacity = locked ? '0.5' : '';
        this._body.style.pointerEvents = locked ? 'none' : '';
        if (locked && !this._bodyLockBanner) {
            const b = document.createElement('div');
            b.style.cssText =
                `display:flex;align-items:center;gap:6px;color:${styles_1.COLORS.textMuted};font-size:11px;`;
            b.innerHTML = `${(0, styles_1.lockIconSvg)(true, 12)}<span>Writes to a locked file — unlock it to edit</span>`;
            this._bodyLockBanner = b;
            this._body.insertBefore(b, this._body.firstChild);
        }
        else if (!locked && this._bodyLockBanner) {
            this._bodyLockBanner.remove();
            this._bodyLockBanner = null;
        }
    }
    /** Enable/disable the header target dropdown (e.g. frozen while files are locked). */
    setTargetEnabled(enabled) {
        this._targetForceDisabled = !enabled;
        if (this._targetLockBadge)
            this._targetLockBadge.style.display = enabled ? 'none' : '';
        this._applyTargetDisabled();
    }
    /**
     * Put every field back to its just-constructed state. Called before loading another file:
     * ``setData`` only fills the keys present in the new file, so without a reset the previous
     * file's values stayed on screen (and were sent back to the kernel on the next edit).
     */
    reset() { }
    /** A label + control row that highlights ``labelText`` in the docs when used. */
    _makeFieldRow(labelText, input, required = false) {
        const row = (0, dom_1.makeRow)();
        row.appendChild((0, dom_1.makeLabel)(labelText, required));
        row.appendChild(input);
        row.addEventListener('focusin', () => this.fieldFocused.emit(labelText));
        row.addEventListener('click', () => this.fieldFocused.emit(labelText));
        return row;
    }
    /**
     * A row holding only a label, for several controls (input + Browse, ...). Using the row
     * highlights ``fieldKey`` in the docs.
     *
     * @param fieldKey - Docs key to highlight.
     * @param labelText - Label text.
     * @param required - Colour the label as required.
     */
    _makeFocusRow(fieldKey, labelText, required = false) {
        const row = (0, dom_1.makeRow)();
        row.addEventListener('focusin', () => this.fieldFocused.emit(fieldKey));
        row.addEventListener('click', () => this.fieldFocused.emit(fieldKey));
        row.appendChild((0, dom_1.makeLabel)(labelText, required));
        return row;
    }
    /** A labelled checkbox row (clicking it highlights ``label`` in the docs). */
    _makeCheckbox(label, checked = false) {
        const row = (0, dom_1.makeRow)();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.style.cssText = `accent-color:${styles_1.COLORS.blue};`;
        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;cursor:pointer;`;
        lbl.prepend(cb);
        lbl.style.display = 'flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '6px';
        row.appendChild(lbl);
        row.addEventListener('click', () => this.fieldFocused.emit(label));
        return { row, input: cb };
    }
    /** Emit ``changed`` (the panel then sends ``getData()`` to the kernel). */
    _emitChanged() {
        this.changed.emit(void 0);
    }
    /** Disable/grey a single control + show a small grey lock next to it. */
    _setControlDisabled(el, disabled) {
        if (!el)
            return;
        if ('disabled' in el)
            el.disabled = disabled;
        el.style.opacity = disabled ? '0.5' : '';
        el.style.pointerEvents = disabled ? 'none' : '';
        if (el.tagName !== 'BUTTON')
            this._toggleFieldLockMarker(el, disabled);
    }
    /**
     * Disable each control whose file is locked. A section targeting ``project`` or ``config``
     * writes every field there; a ``split`` section sends the keys in ``routing.project`` to the
     * project file and the rest to the config file.
     *
     * @param fields - Each control with the YAML key it edits.
     * @param locks - Which files are locked.
     * @param routing - The section's split routing (from ``get_routing_keys``).
     */
    _applyRoutedLocks(fields, locks, routing) {
        var _a;
        const projKeys = new Set((_a = routing === null || routing === void 0 ? void 0 : routing.project) !== null && _a !== void 0 ? _a : []);
        const target = this.getTarget();
        for (const { el, key } of fields) {
            const file = target === 'project' ? 'project'
                : target === 'config' ? 'config'
                    : (projKeys.has(key) ? 'project' : 'config');
            this._setControlDisabled(el, !!locks[file]);
        }
    }
    _buildTargetToggle(targetOptions) {
        const toggleWrap = document.createElement('span');
        toggleWrap.style.cssText = `display:flex;align-items:center;gap:4px;`;
        toggleWrap.addEventListener('click', (e) => e.stopPropagation());
        const lbl = document.createElement('span');
        lbl.textContent = 'target:';
        lbl.style.cssText = `font-size:11px;font-weight:400;color:${styles_1.COLORS.textSubtle};`;
        const toggle = document.createElement('select');
        toggle.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:3px;color:${styles_1.COLORS.textPrimary};padding:1px 4px;font-size:10px;cursor:pointer;`;
        (0, dom_1.fillSelect)(toggle, targetOptions || DEFAULT_TARGETS);
        toggle.addEventListener('change', () => {
            this.targetChanged.emit({ section: this._sectionName, target: toggle.value });
        });
        this._targetToggle = toggle;
        this._targetLockBadge = document.createElement('span');
        this._targetLockBadge.style.cssText = `display:none;color:${styles_1.COLORS.textMuted};line-height:0;`;
        this._targetLockBadge.innerHTML = (0, styles_1.lockIconSvg)(true, 12);
        this._targetLockBadge.title = 'Target is locked while a file is locked';
        toggleWrap.append(lbl, toggle, this._targetLockBadge);
        return toggleWrap;
    }
    _pin() {
        this._pinned = true;
        if (!this.element.open)
            this.element.open = true;
        this._updateChevron();
    }
    _updateChevron() {
        this._chevron.textContent = this.element.open ? '▾' : '▸';
        this._summary.style.background = (this._pinned && this.element.open) ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgMantle;
    }
    _applyTargetDisabled() {
        if (this._targetToggle) {
            this._targetToggle.disabled = this._targetForceDisabled || this._optionsDisabled;
        }
    }
    _toggleFieldLockMarker(el, disabled) {
        const marker = lockMarkers.get(el);
        if (disabled) {
            if (marker)
                return;
            const m = document.createElement('span');
            m.style.cssText =
                `display:inline-flex;color:${styles_1.COLORS.textMuted};margin-left:5px;vertical-align:middle;`;
            m.innerHTML = (0, styles_1.lockIconSvg)(true, 12);
            m.title = 'Locked — this field writes to a locked file';
            lockMarkers.set(el, m);
            el.insertAdjacentElement('afterend', m);
        }
        else if (marker) {
            marker.remove();
            lockMarkers.delete(el);
        }
    }
}
exports.CollapsibleSection = CollapsibleSection;


/***/ },

/***/ "./lib/config_builder/sections/ConfigFilesSection.js"
/*!***********************************************************!*\
  !*** ./lib/config_builder/sections/ConfigFilesSection.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigFilesSection = void 0;
/**
 * Configuration Files section: the project's output files (project / config / form) — the
 * enable checkbox, linked naming, Duplicate / Rename, and per-file Lock. Owns the
 * ``'project'`` config routing (its getData feeds update_section('project')).
 *
 * Split out of SetupSection so the tabbed project entry (Create / Template / Load) and the
 * file management read as distinct sections.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/config_builder/text.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
//
// Public
//
class ConfigFilesSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Configuration Files', 'project', false);
        /** The project file's enable checkbox changed. */
        this.projectEnabledChanged = new signaling_1.Signal(this);
        /** Which files are enabled (drives the other sections' target options). */
        this.fileStatesChanged = new signaling_1.Signal(this);
        /** A file was locked / unlocked. */
        this.lockStatesChanged = new signaling_1.Signal(this);
        this._active = false;
        this._locked = true;
        this._linked = true;
        this._rows = {};
        this._fileLocked = { project: false, config: false, form: false };
        this._buildBody();
        this.setEnabled(false);
    }
    /** Grey out the section until a project is created or loaded. */
    setEnabled(enabled) {
        this._body.style.opacity = enabled ? '1' : '0.4';
        this._body.style.pointerEvents = enabled ? '' : 'none';
    }
    /** Which files are locked (won't be saved; their fields are disabled). */
    getLockStates() {
        return Object.assign({}, this._fileLocked);
    }
    /** Initialize default paths for a freshly-created project (from its name). */
    initFromCreate(name) {
        const slug = (0, util_1.slugify)(name);
        this._active = true;
        this._locked = true;
        this._linked = true;
        this.setEnabled(true);
        this._linkedToggle.disabled = true;
        this._setLinkedName(this._titlize(slug));
        this._setPaths(slug);
        this._updateLinkedToggle();
        this._applyLockState();
        this._emitFileStates();
        this._emitChanged();
    }
    /** Activate after a load: linked when all three files share a name, else show ``name``. */
    activateFromLoad(name) {
        this._active = true;
        this._locked = true;
        this._linked = true;
        this.setEnabled(true);
        const [projFile, confFile, formFile] = constants_1.CONFIG_FILE_TYPES.map(ft => this._filename(this._rows[ft].pathInput.value));
        const allSame = projFile && projFile === confFile && confFile === formFile;
        if (allSame) {
            this._linked = true;
            this._setLinkedName(this._titlize(projFile.replace(constants_1.YAML_FILE_RE, '')));
        }
        else if (name) {
            this._setLinkedName(this._titlize(name));
            this._linked = false;
        }
        else {
            this._linked = false;
            this._linkedNameEl.textContent = '—';
            this._linkedNameInput.value = '';
        }
        this._updateLinkedToggle();
        this._linkedToggle.disabled = true;
        this._applyLockState();
        this._emitFileStates();
    }
    getData() {
        const enabled = (ft) => this._rows[ft].checkbox.checked;
        const path = (ft) => enabled(ft) ? (this._rows[ft].pathInput.value.trim() || undefined) : undefined;
        return {
            project_enabled: enabled('project'),
            config_enabled: enabled('config'),
            form_enabled: enabled('form'),
            project_path: path('project'),
            config_path: path('config'),
            form_path: path('form'),
            project_locked: this._fileLocked.project,
            config_locked: this._fileLocked.config,
            form_locked: this._fileLocked.form,
        };
    }
    reset() {
        for (const ft of constants_1.CONFIG_FILE_TYPES)
            this._setPath(ft, '');
        for (const ft of constants_1.CONFIG_FILE_TYPES) {
            this._rows[ft].checkbox.checked = true;
            this._fileLocked[ft] = false;
            this._renderLockBtn(ft);
        }
    }
    /** Load the ``*_path`` / ``*_enabled`` / ``*_locked`` keys; activates when a path is set. */
    setData(data) {
        for (const ft of constants_1.CONFIG_FILE_TYPES) {
            const row = this._rows[ft];
            const path = data[`${ft}_path`];
            if (path) {
                row.pathInput.value = path;
                row.pathEl.textContent = path;
            }
            const enabled = data[`${ft}_enabled`];
            if (enabled !== undefined)
                row.checkbox.checked = !!enabled;
        }
        for (const ft of constants_1.CONFIG_FILE_TYPES) {
            this._fileLocked[ft] = !!data[`${ft}_locked`];
            this._renderLockBtn(ft);
        }
        if (data.project_path || data.config_path || data.form_path) {
            this.activateFromLoad(data.project_name || '');
        }
    }
    _buildBody() {
        const help = document.createElement('div');
        help.style.cssText =
            `color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.5;margin-bottom:4px;`;
        help.innerHTML = text_1.CONFIG_FILES_HELP;
        this._body.appendChild(help);
        const linkedRow = document.createElement('div');
        linkedRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:4px;`;
        this._linkedToggle = document.createElement('button');
        this._linkedToggle.style.cssText =
            `background:${styles_1.COLORS.bgSurface1};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:4px;` +
                `color:${styles_1.COLORS.textPrimary};padding:2px 8px;font-size:11px;cursor:pointer;min-width:60px;`;
        this._linkedToggle.disabled = true;
        this._linkedToggle.addEventListener('click', () => {
            this._linked = !this._linked;
            this._updateLinkedToggle();
            this._applyLockState();
            if (this._linked)
                this._applyLinkedName();
        });
        this._linkedNameEl = document.createElement('span');
        this._linkedNameEl.textContent = '—';
        this._linkedNameEl.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        this._linkedNameInput = (0, dom_1.makeInput)('linked name', '160px');
        this._linkedNameInput.style.display = 'none';
        this._linkedNameInput.addEventListener('input', () => {
            if (this._linked && !this._locked)
                this._applyLinkedName();
            this._emitChanged();
        });
        linkedRow.append(this._linkedToggle, this._linkedNameEl, this._linkedNameInput);
        this._body.appendChild(linkedRow);
        for (const ft of constants_1.CONFIG_FILE_TYPES)
            this._body.appendChild(this._buildFileRow(ft));
        this._duplicateBtn = (0, dom_1.makeButton)('Duplicate');
        this._duplicateBtn.style.cssText += `margin-top:4px;align-self:flex-start;`;
        this._duplicateBtn.addEventListener('click', () => this._onDuplicateOrLock());
        this._body.appendChild(this._duplicateBtn);
        this._updateLinkedToggle();
    }
    _buildFileRow(fileType) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.cssText = `accent-color:${styles_1.COLORS.blue};flex-shrink:0;`;
        cb.addEventListener('change', () => {
            this._emitFileStates();
            this._emitChanged();
        });
        if (fileType === 'project') {
            cb.addEventListener('change', () => this.projectEnabledChanged.emit(cb.checked));
        }
        // Lock button — left of the checkbox; independent of the enable checkbox.
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.style.cssText =
            `background:none;border:none;cursor:pointer;padding:0;display:flex;` +
                `align-items:center;flex-shrink:0;color:${styles_1.COLORS.textMuted};`;
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fileLocked[fileType] = !this._fileLocked[fileType];
            this._renderLockBtn(fileType);
            this.lockStatesChanged.emit(this.getLockStates());
            this._emitChanged();
        });
        const lbl = document.createElement('label');
        lbl.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;min-width:60px;`;
        const lblText = document.createElement('span');
        lblText.textContent = fileType;
        lblText.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        lbl.append(cb, lblText);
        const pathEl = document.createElement('span');
        pathEl.textContent = '—';
        pathEl.style.cssText =
            `color:${styles_1.COLORS.textMuted};font-size:12px;font-family:monospace;` +
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        const pathInput = (0, dom_1.makeInput)(`${constants_1.CONFIG_DIRS[fileType]}/<name>.yaml`, '200px');
        pathInput.style.display = 'none';
        pathInput.addEventListener('input', () => {
            pathEl.textContent = pathInput.value;
            this._emitChanged();
        });
        row.append(lockBtn, lbl, pathEl, pathInput);
        row.addEventListener('focusin', () => this.fieldFocused.emit(`${fileType} file`));
        this._rows[fileType] = { checkbox: cb, pathEl, pathInput, lockBtn };
        this._renderLockBtn(fileType);
        return row;
    }
    _renderLockBtn(fileType) {
        const btn = this._rows[fileType].lockBtn;
        const locked = this._fileLocked[fileType];
        btn.innerHTML = (0, styles_1.lockIconSvg)(locked, 14);
        btn.style.color = locked ? styles_1.COLORS.lockAmber : styles_1.COLORS.textMuted;
        btn.title = locked
            ? `Unlock ${fileType} file`
            : `Lock ${fileType} file — won't be saved and its fields are disabled`;
    }
    /** Duplicate unlocks the paths for editing; clicking again (Lock) freezes them. */
    _onDuplicateOrLock() {
        if (this._locked) {
            this._locked = false;
            this._linkedToggle.disabled = false;
            this._duplicateBtn.textContent = 'Lock';
            const projPath = this._rows.project.pathInput.value;
            if (projPath) {
                this._setLinkedName(this._titlize(this._filename(projPath).replace(constants_1.YAML_FILE_RE, '')));
            }
        }
        else {
            this._locked = true;
            this._linkedToggle.disabled = true;
            this._duplicateBtn.textContent = 'Duplicate';
        }
        this._applyLockState();
    }
    /** Set one file's path (input + display) and notify. */
    _setPath(fileType, path) {
        this._rows[fileType].pathInput.value = path;
        this._rows[fileType].pathEl.textContent = path;
        this._emitChanged();
    }
    /** Point all three files at ``<default dir>/<slug>.yaml``. */
    _setPaths(slug) {
        for (const ft of constants_1.CONFIG_FILE_TYPES) {
            const p = `${constants_1.CONFIG_DIRS[ft]}/${slug}.yaml`;
            this._rows[ft].pathInput.value = p;
            this._rows[ft].pathEl.textContent = p;
        }
    }
    _setLinkedName(name) {
        this._linkedNameEl.textContent = name;
        this._linkedNameInput.value = name;
    }
    _applyLinkedName() {
        const raw = this._linkedNameInput.value.trim();
        if (!raw)
            return;
        this._setPaths((0, util_1.slugify)(raw));
    }
    _applyLockState() {
        const editable = !this._locked && this._active;
        for (const ft of constants_1.CONFIG_FILE_TYPES) {
            this._rows[ft].pathInput.style.display = editable ? '' : 'none';
            this._rows[ft].pathEl.style.display = editable ? 'none' : '';
        }
        if (editable && this._linked) {
            this._linkedNameInput.style.display = '';
            this._linkedNameEl.style.display = 'none';
        }
        else {
            this._linkedNameInput.style.display = 'none';
            this._linkedNameEl.style.display = '';
        }
    }
    _updateLinkedToggle() {
        this._linkedToggle.textContent = this._linked ? 'Linked' : 'Unlinked';
        this._linkedToggle.style.background = this._linked ? styles_1.COLORS.blue : styles_1.COLORS.bgSurface1;
        this._linkedToggle.style.color = this._linked ? styles_1.COLORS.bgBase : styles_1.COLORS.textPrimary;
    }
    _emitFileStates() {
        this.fileStatesChanged.emit({
            project: this._rows.project.checkbox.checked,
            config: this._rows.config.checkbox.checked,
            form: this._rows.form.checkbox.checked,
        });
    }
    _filename(path) {
        return (path || '').split('/').pop() || '';
    }
    _titlize(slug) {
        return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
}
exports.ConfigFilesSection = ConfigFilesSection;


/***/ },

/***/ "./lib/config_builder/sections/ConfigSummary.js"
/*!******************************************************!*\
  !*** ./lib/config_builder/sections/ConfigSummary.js ***!
  \******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigSummary = void 0;
/**
 * The read-only "Configuration Summary" at the bottom of the builder, rendered from the
 * kernel's ``build_summary_from_builder`` sections.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
//
// Constants
//
const S = {
    section: `padding:6px 10px;`,
    sectionTitle: `font-size:11px;font-weight:700;letter-spacing:0.6px;color:${styles_1.COLORS.textMuted};` +
        `text-transform:uppercase;margin-bottom:2px;`,
    row: `display:flex;align-items:baseline;gap:6px;padding:1px 0;font-size:11px;line-height:1.5;`,
    key: `color:${styles_1.COLORS.textSubtle};min-width:90px;flex-shrink:0;`,
    val: `color:${styles_1.COLORS.textPrimary};word-break:break-word;`,
    muted: `color:${styles_1.COLORS.textMuted};font-style:italic;`,
    hr: `border:none;border-top:1px solid ${styles_1.COLORS.bgSurface0};margin:0;`,
    tag: `display:inline-block;background:${styles_1.COLORS.bgSurface1};border-radius:3px;` +
        `padding:0 5px;font-size:10px;color:${styles_1.COLORS.blue};margin-right:3px;`,
    dynTag: `display:inline-block;background:${styles_1.COLORS.bgSurface0};border-radius:3px;` +
        `padding:0 5px;font-size:10px;color:${styles_1.COLORS.mauve};margin-right:3px;`,
    indent: `margin-left:16px;padding-left:8px;border-left:2px solid ${styles_1.COLORS.bgSurface1};`,
};
//
// Public
//
class ConfigSummary {
    constructor() {
        this.element = document.createElement('details');
        this.element.open = true;
        this.element.style.cssText =
            `border-top:2px solid ${styles_1.COLORS.teal};margin-top:4px;`;
        const summary = document.createElement('summary');
        summary.textContent = 'Configuration Summary';
        summary.style.cssText =
            `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
                `background:${styles_1.COLORS.bgCrust};color:${styles_1.COLORS.teal};` +
                `list-style:none;user-select:none;letter-spacing:0.5px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
        this._body = document.createElement('div');
        this._body.style.cssText =
            `background:${styles_1.COLORS.bgCrust};display:flex;flex-direction:column;`;
        this.element.append(summary, this._body);
    }
    /** Re-render from the ``getSummary`` reply. */
    update(sections) {
        this._body.innerHTML = '';
        for (let i = 0; i < sections.length; i++) {
            if (i > 0)
                this._hr();
            this._renderSection(sections[i]);
        }
    }
    _hr() {
        const hr = document.createElement('hr');
        hr.style.cssText = S.hr;
        this._body.appendChild(hr);
    }
    _renderSection(section) {
        const sec = document.createElement('div');
        sec.style.cssText = S.section;
        const t = document.createElement('div');
        t.style.cssText = S.sectionTitle;
        t.textContent = section.title;
        sec.appendChild(t);
        for (const row of section.rows) {
            this._renderRow(sec, row);
        }
        this._body.appendChild(sec);
    }
    _renderRow(parent, row) {
        const key = row.key || '';
        const value = row.value || '';
        const tag = row.tag || '';
        const muted = row.muted || false;
        if (key === 'FORM') {
            const header = document.createElement('div');
            header.style.cssText = S.sectionTitle + `margin-top:4px;`;
            header.textContent = 'FORM';
            parent.appendChild(header);
            const wrap = document.createElement('div');
            wrap.style.cssText = S.indent;
            for (const child of row.children || []) {
                this._renderRow(wrap, child);
            }
            parent.appendChild(wrap);
            return;
        }
        if (tag === 'dynamic') {
            const wrap = document.createElement('div');
            wrap.style.cssText = S.indent;
            const header = document.createElement('div');
            header.style.cssText = S.row;
            header.innerHTML =
                `<span style="${S.dynTag}">${(0, util_1.escapeHtml)(value)}</span>`;
            wrap.appendChild(header);
            for (const child of row.children || []) {
                this._renderRow(wrap, child);
            }
            parent.appendChild(wrap);
            return;
        }
        const el = document.createElement('div');
        el.style.cssText = S.row;
        if (tag) {
            el.innerHTML =
                `<span style="${S.tag}">${(0, util_1.escapeHtml)(tag)}</span>` +
                    `<span style="${S.val}">${(0, util_1.escapeHtml)(value)}</span>`;
        }
        else if (key) {
            const k = document.createElement('span');
            k.style.cssText = S.key;
            k.textContent = key;
            const v = document.createElement('span');
            v.style.cssText = muted ? S.muted : S.val;
            v.textContent = value;
            el.append(k, v);
        }
        else if (value) {
            const v = document.createElement('span');
            v.style.cssText = muted ? S.muted : S.val;
            v.textContent = value;
            el.appendChild(v);
        }
        parent.appendChild(el);
        if (row.children) {
            const wrap = document.createElement('div');
            wrap.style.cssText = S.indent;
            for (const child of row.children) {
                this._renderRow(wrap, child);
            }
            parent.appendChild(wrap);
        }
    }
}
exports.ConfigSummary = ConfigSummary;


/***/ },

/***/ "./lib/config_builder/sections/DataSection.js"
/*!****************************************************!*\
  !*** ./lib/config_builder/sections/DataSection.js ***!
  \****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DataSection = void 0;
/**
 * Data section: where the annotator's rows come from (``data:`` — source_type + value, index
 * column, start/end time columns, duration, secrets). Loads the source's columns (local file,
 * url / s3://, sql, api) so the time / index fields — and the other sections' column pickers —
 * become dropdowns.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
const sourceValue_1 = __webpack_require__(/*! ./sourceValue */ "./lib/config_builder/sections/sourceValue.js");
//
// Constants
//
const AUTO_LOAD_DELAY_MS = 800;
const SECRETS_RETRY_DELAY_MS = 400;
//
// Public
//
class DataSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Data', 'data', false, true, ['split', 'project', 'config']);
        /** The detected columns changed (empty when none are known). */
        this.columnsLoaded = new signaling_1.Signal(this);
        /** A local data file was picked via Browse; load its columns. */
        this.fileLoadRequested = new signaling_1.Signal(this);
        /** Browse clicked (payload: the current value, or ``.``). */
        this.browseRequested = new signaling_1.Signal(this);
        /** Load the columns of the current source (any source_type). */
        this.sourceLoadRequested = new signaling_1.Signal(this);
        this._detectedCols = [];
        this._debounceTimer = null;
        this._sourceType = (0, dom_1.makeSelect)(['path', 'url', 'sql', 'api'], 'path');
        this._sourceType.addEventListener('change', () => {
            this._updateValueUI();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));
        const pathRow = this._makeFocusRow('value', 'value', true);
        this._pathInput = (0, dom_1.makeInput)('data/detections.csv', '220px');
        this._pathInput.addEventListener('input', () => {
            this._autoDetectSourceType();
            this._emitChanged();
            this.setLoadStatus(null);
            this._scheduleAutoLoad();
        });
        this._pathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                this._onValueEnter();
        });
        this._browseBtn = (0, dom_1.makeButton)('Browse');
        this._browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._pathInput.value || '.');
        });
        // sql/api need an explicit Load (don't auto-run a query on each keystroke);
        // url auto-loads. Both fetch via the source-aware loader (handles s3://).
        this._loadBtn = (0, dom_1.makeButton)('Load', true);
        this._loadBtn.style.display = 'none';
        this._loadBtn.addEventListener('click', () => this._triggerSourceLoad());
        this._loadStatus = (0, sourceValue_1.makeStatusBadge)();
        pathRow.append(this._pathInput, this._browseBtn, this._loadBtn, this._loadStatus);
        this._body.appendChild(pathRow);
        this._indexColInput = (0, dom_1.makeInput)('e.g. id', '150px');
        this._indexColInput.addEventListener('input', () => this._emitChanged());
        this._indexColSelect = (0, dom_1.makeSelect)([], '');
        this._indexColSelect.style.display = 'none';
        this._indexColSelect.addEventListener('change', () => this._emitChanged());
        this._indexColRow = this._makeFocusRow('index_column', 'index_column', true);
        this._indexColRow.append(this._indexColInput, this._indexColSelect);
        this._body.appendChild(this._indexColRow);
        this._startTimeSelect = (0, dom_1.makeSelect)(['start_time'], 'start_time');
        this._startTimeSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('start_time_col', this._startTimeSelect));
        this._endTimeSelect = (0, dom_1.makeSelect)(['end_time'], 'end_time');
        this._endTimeSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('end_time_col', this._endTimeSelect));
        this._durationInput = (0, dom_1.makeInput)('duration or number', '150px');
        this._durationInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('duration', this._durationInput));
        this._secrets = new SecretsEditor_1.SecretsEditor(true);
        this._secrets.changed.connect(() => {
            this._emitChanged();
            this._retryLoadAfterSecrets();
        });
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    /** Set the load indicator next to the value: ✓ ok, ✗ failed, null clears. */
    setLoadStatus(ok) {
        (0, sourceValue_1.setStatusBadge)(this._loadStatus, ok, 'Loaded', 'Load failed — see status bar');
    }
    /** Use ``cols`` for the index / time dropdowns and tell the other sections. */
    setDetectedColumns(cols) {
        this._detectedCols = cols;
        this.columnsLoaded.emit(cols);
        this._rebuildTimeSelects();
    }
    /** The trimmed value (path, URL, query, ...). */
    getPath() {
        return this._pathInput.value.trim();
    }
    /** Set the value (e.g. from Browse) and load its columns if it is a data file. */
    setPath(path) {
        this._pathInput.value = path;
        this._emitChanged();
        if (path && constants_1.DATA_FILE_RE.test(path)) {
            this.fileLoadRequested.emit(path);
        }
    }
    /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
    applyLocks(locks, routing) {
        this._applyRoutedLocks([
            { el: this._sourceType, key: 'source_type' },
            { el: this._pathInput, key: 'value' },
            { el: this._browseBtn, key: 'value' },
            { el: this._secrets.element, key: 'secrets' },
            { el: this._indexColInput, key: 'index_column' },
            { el: this._indexColSelect, key: 'index_column' },
            { el: this._startTimeSelect, key: 'start_time' },
            { el: this._endTimeSelect, key: 'end_time' },
            { el: this._durationInput, key: 'duration' },
        ], locks, routing);
    }
    getData() {
        const result = {};
        if (this._pathInput.value) {
            result.source_type = this._sourceType.value;
            result.value = this._pathInput.value;
        }
        const idx = this._detectedCols.length > 0
            ? this._indexColSelect.value
            : this._indexColInput.value.trim();
        if (idx)
            result.index_column = idx;
        const st = this._startTimeSelect.value;
        const et = this._endTimeSelect.value;
        const dur = this._durationInput.value.trim();
        if (st && st !== 'start_time')
            result.start_time = st;
        if (et && et !== 'end_time')
            result.end_time = et;
        if (dur) {
            const num = parseFloat(dur);
            result.duration = isNaN(num) ? dur : num;
        }
        const secrets = this._secrets.getData();
        if (secrets !== undefined)
            result.secrets = secrets;
        return result;
    }
    reset() {
        this._sourceType.value = 'path';
        this._pathInput.value = '';
        this._indexColInput.value = '';
        this._indexColSelect.value = '';
        this._durationInput.value = '';
        this._detectedCols = [];
        this._rebuildTimeSelects();
        this._secrets.reset();
        this.setLoadStatus(null);
        this._updateValueUI();
    }
    setData(data) {
        var _a;
        // Current form: source_type + value. Legacy form: an explicit
        // path/url/sql/api key (still loadable).
        if (data.value !== undefined || data.source_type) {
            const st = data.source_type === 'uri' ? 'url' : (data.source_type || 'path');
            this._sourceType.value = st;
            this._pathInput.value = (_a = data.value) !== null && _a !== void 0 ? _a : '';
        }
        else if (data.path) {
            this._sourceType.value = 'path';
            this._pathInput.value = data.path;
        }
        else if (data.url) {
            this._sourceType.value = 'url';
            this._pathInput.value = data.url;
        }
        else if (data.sql) {
            this._sourceType.value = 'sql';
            this._pathInput.value = data.sql;
        }
        else if (data.api) {
            this._sourceType.value = 'api';
            this._pathInput.value = data.api;
        }
        if (data.index_column) {
            this._indexColInput.value = data.index_column;
            if (this._detectedCols.includes(data.index_column)) {
                this._indexColSelect.value = data.index_column;
            }
        }
        if (data.start_time)
            this._fillTimeSelect(this._startTimeSelect, data.start_time, 'start_time');
        if (data.end_time)
            this._fillTimeSelect(this._endTimeSelect, data.end_time, 'end_time');
        if (data.duration !== undefined)
            this._durationInput.value = String(data.duration);
        if (data.secrets !== undefined)
            this._secrets.setData(data.secrets);
    }
    /** Switch source_type between path and url from the typed value. */
    _autoDetectSourceType() {
        if ((0, sourceValue_1.autoDetectSourceType)(this._sourceType, this._pathInput.value, 'url')) {
            this._updateValueUI();
        }
    }
    /** Enter in the value: load now (sql/api/url, or a local data file). */
    _onValueEnter() {
        this._autoDetectSourceType();
        if (this._debounceTimer)
            clearTimeout(this._debounceTimer);
        if (this._sourceType.value !== 'path') {
            this._triggerSourceLoad();
            return;
        }
        const path = this._pathInput.value.trim();
        if (path && constants_1.DATA_FILE_RE.test(path)) {
            this._triggerSourceLoad();
        }
        else {
            this.setDetectedColumns([]);
        }
    }
    _updateValueUI() {
        const type = this._sourceType.value;
        this._browseBtn.style.display = type === 'path' ? '' : 'none';
        // url auto-loads; sql/api use an explicit Load button.
        this._loadBtn.style.display = (type === 'sql' || type === 'api') ? '' : 'none';
        this.setLoadStatus(null);
    }
    _retryLoadAfterSecrets() {
        if (this._sourceType.value === 'path' || !this._pathInput.value.trim())
            return;
        if (this._debounceTimer)
            clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._triggerSourceLoad(), SECRETS_RETRY_DELAY_MS);
    }
    _triggerSourceLoad() {
        const value = this._pathInput.value.trim();
        if (!value)
            return;
        this.sourceLoadRequested.emit({
            sourceType: this._sourceType.value,
            value,
            secrets: this._secrets.getData(),
        });
    }
    _scheduleAutoLoad() {
        if (this._debounceTimer)
            clearTimeout(this._debounceTimer);
        const type = this._sourceType.value;
        this._debounceTimer = setTimeout(() => {
            const val = this._pathInput.value.trim();
            if (!val)
                return;
            if (type === 'path') {
                // Local file: auto-load (with ✓/✗) once it looks like a data file.
                if (constants_1.DATA_FILE_RE.test(val))
                    this._triggerSourceLoad();
            }
            else if (type === 'url') {
                // url (incl. s3://) auto-loads via the source-aware loader.
                this._triggerSourceLoad();
            }
            // sql/api: explicit Load button only.
        }, AUTO_LOAD_DELAY_MS);
    }
    _rebuildTimeSelects() {
        const currentIdx = this._indexColSelect.value;
        const currentStart = this._startTimeSelect.value;
        const currentEnd = this._endTimeSelect.value;
        (0, dom_1.fillSelect)(this._indexColSelect, this._detectedCols, '— select —');
        const pending = currentIdx || this._indexColInput.value.trim();
        if (pending && this._detectedCols.includes(pending)) {
            this._indexColSelect.value = pending;
        }
        const hasCols = this._detectedCols.length > 0;
        this._indexColInput.style.display = hasCols ? 'none' : '';
        this._indexColSelect.style.display = hasCols ? '' : 'none';
        this._fillTimeSelect(this._startTimeSelect, currentStart, 'start_time');
        this._fillTimeSelect(this._endTimeSelect, currentEnd, 'end_time');
    }
    /**
     * Fill a time-column select with the detected columns (or just ``fallback`` before any are
     * loaded) and select ``keep``. A configured column the data doesn't (yet) list is kept as an
     * extra option instead of being silently replaced — that used to drop custom mappings.
     */
    _fillTimeSelect(sel, keep, fallback) {
        const cols = this._detectedCols.length > 0 ? this._detectedCols : [fallback];
        const options = keep && !cols.includes(keep) ? [...cols, keep] : cols;
        (0, dom_1.fillSelect)(sel, options);
        sel.value = keep || (options.includes(fallback) ? fallback : options[0]);
    }
}
exports.DataSection = DataSection;


/***/ },

/***/ "./lib/config_builder/sections/DescriptionSection.js"
/*!***********************************************************!*\
  !*** ./lib/config_builder/sections/DescriptionSection.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DescriptionSection = void 0;
/**
 * Description section: the annotator's optional description panel (``description:`` — title,
 * markdown text or a file path, open by default — and ``description_height``).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
//
// Public
//
class DescriptionSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Description', 'description', false, true, ['project', 'config']);
        /** Browse clicked (payload: the current path, or ``.``). */
        this.browseRequested = new signaling_1.Signal(this);
        this._titleInput = (0, dom_1.makeInput)('', '200px');
        this._titleInput.placeholder = 'e.g. Instructions';
        this._titleInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('title', this._titleInput));
        this._textArea = document.createElement('textarea');
        this._textArea.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:4px;` +
                `color:${styles_1.COLORS.textPrimary};padding:4px 6px;font-size:12px;width:100%;min-height:60px;` +
                `box-sizing:border-box;resize:vertical;font-family:monospace;`;
        this._textArea.placeholder = 'Markdown text (or use path for a file)';
        this._textArea.addEventListener('keydown', (e) => e.stopPropagation());
        this._textArea.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('text', this._textArea));
        const pathRow = this._makeFocusRow('description_path', 'path');
        this._pathInput = (0, dom_1.makeInput)('docs/instructions.md', '200px');
        this._pathInput.addEventListener('input', () => this._emitChanged());
        const browseBtn = (0, dom_1.makeButton)('Browse');
        browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._pathInput.value || '.');
        });
        pathRow.append(this._pathInput, browseBtn);
        this._body.appendChild(pathRow);
        const { row: openRow, input: openCb } = this._makeCheckbox('open');
        this._openCb = openCb;
        this._openCb.checked = true;
        this._openCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(openRow);
        this._heightInput = (0, dom_1.makeInput)('', '60px');
        this._heightInput.type = 'number';
        this._heightInput.placeholder = 'auto';
        this._heightInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('height', this._heightInput));
    }
    /** Set the description file path (e.g. from Browse). */
    setDescriptionPath(path) {
        this._pathInput.value = path;
        this._emitChanged();
    }
    getData() {
        const result = {};
        const title = this._titleInput.value.trim();
        const text = this._textArea.value;
        const path = this._pathInput.value.trim();
        const open = this._openCb.checked;
        const h = parseInt(this._heightInput.value);
        if (title || text || path) {
            const desc = {};
            if (title)
                desc.title = title;
            if (text)
                desc.text = text;
            if (path)
                desc.path = path;
            if (!open)
                desc.open = false;
            result.description = desc;
        }
        if (!isNaN(h) && h > 0)
            result.description_height = h;
        return result;
    }
    reset() {
        for (const el of [this._titleInput, this._textArea, this._pathInput, this._heightInput]) {
            el.value = '';
        }
        this._openCb.checked = true;
    }
    /** Accepts the ``description: {...}`` block and the flat ``description_*`` keys. */
    setData(data) {
        if (data.description_height)
            this._heightInput.value = String(data.description_height);
        const d = data.description;
        if (d && typeof d === 'object') {
            if (d.title)
                this._titleInput.value = d.title;
            if (d.text)
                this._textArea.value = d.text;
            if (d.path)
                this._pathInput.value = d.path;
            if (d.open === false)
                this._openCb.checked = false;
        }
        if (data.description_title)
            this._titleInput.value = data.description_title;
        if (data.description_text)
            this._textArea.value = data.description_text;
        if (data.description_path)
            this._pathInput.value = data.description_path;
        if (data.description_open === false)
            this._openCb.checked = false;
    }
}
exports.DescriptionSection = DescriptionSection;


/***/ },

/***/ "./lib/config_builder/sections/FormSection.js"
/*!****************************************************!*\
  !*** ./lib/config_builder/sections/FormSection.js ***!
  \****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FormSection = void 0;
/**
 * Form section: builds the form YAML — element cards (add bar, drag / move / remove), dynamic
 * forms, and the round trip to YAML. The fields inside each card are built in formCards.ts
 * (with formAnnotationTools.ts and formSelectItems.ts); YAML conversion is formSerialization.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const formSerialization_1 = __webpack_require__(/*! ../formSerialization */ "./lib/config_builder/formSerialization.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/config_builder/text.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const formCards_1 = __webpack_require__(/*! ./formCards */ "./lib/config_builder/sections/formCards.js");
//
// Constants
//
/** Element types that make a following title / annotation / ... go into the ``form:`` list. */
const USER_INPUT_TYPES = new Set(['select', 'textbox', 'checkbox', 'number']);
/** Element types written as top-level keys when they come before any user input. */
const TOP_LEVEL_TYPES = new Set(['title', 'annotation', 'pass_value', 'fixed_value']);
/** The add bar's button groups. */
const ADD_BAR_COLUMNS = [
    { header: 'Display', rows: [['title', 'text'], ['line', 'break']] },
    { header: 'User Input', rows: [['annotation', 'select'], ['textbox', 'checkbox', 'number']] },
    { header: 'Data', rows: [['pass_value'], ['fixed_value']] },
    { header: 'Navigation', rows: [['submission_buttons']] },
];
//
// Public
//
class FormSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Form', 'form', false, true, ['project', 'config', 'form']);
        /** A card wants a file picked (``callback`` gets the path). */
        this.browseRequested = new signaling_1.Signal(this);
        /** A card wants a file's columns (``callback`` gets them). */
        this.columnsRequested = new signaling_1.Signal(this);
        this._elements = [];
        this._dynForms = [];
        this._dragSrcCard = null;
        this._ctx = {
            changed: () => this._emitChanged(),
            fieldRow: (label, input) => this._makeFieldRow(label, input),
            checkbox: (label, checked) => this._makeCheckbox(label, checked),
            browse: (callback) => this.browseRequested.emit({ callback }),
            requestColumns: (path, callback) => this.columnsRequested.emit({ path, callback }),
        };
        const hint = document.createElement('div');
        hint.textContent = text_1.FORM_ADD_HINT;
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-style:italic;margin-bottom:4px;`;
        this._body.appendChild(hint);
        this._addBar = this._makeAddBar();
        this._body.appendChild(this._addBar);
        this._listEl = document.createElement('div');
        this._listEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
        this._body.appendChild(this._listEl);
        this._dynFormsContainer = document.createElement('div');
        this._dynFormsContainer.style.cssText =
            `display:flex;flex-direction:column;gap:6px;` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};padding-top:8px;margin-top:4px;`;
        const dynHeader = (0, dom_1.makeRow)();
        const dynLabel = document.createElement('div');
        dynLabel.textContent = 'Dynamic Forms';
        dynLabel.style.cssText =
            `font-size:12px;font-weight:700;color:${styles_1.COLORS.textMuted};letter-spacing:0.5px;`;
        const addDynBtn = (0, dom_1.makeButton)('+ Dynamic Form');
        addDynBtn.style.fontSize = '11px';
        addDynBtn.addEventListener('click', () => this._promptAddDynForm());
        dynHeader.append(dynLabel, addDynBtn);
        this._dynFormsContainer.appendChild(dynHeader);
        this._body.appendChild(this._dynFormsContainer);
    }
    /**
     * The form YAML for the current elements. Title / annotation / pass_value / fixed_value
     * cards placed before the first user input are top-level keys; everything else goes in
     * the ``form:`` list. Every element (incl. dynamic forms) uses ``serializeElement``.
     */
    getData() {
        const result = {};
        const formList = [];
        let submissionButtons = null;
        let seenUserInput = false;
        for (const elem of this._elements) {
            const val = (0, formSerialization_1.serializeElement)(elem.type, elem.config);
            if (elem.type === 'submission_buttons') {
                submissionButtons = val;
                continue;
            }
            if (USER_INPUT_TYPES.has(elem.type))
                seenUserInput = true;
            if (!seenUserInput && TOP_LEVEL_TYPES.has(elem.type)) {
                result[elem.type] = val;
            }
            else {
                formList.push({ [elem.type]: val });
            }
        }
        if (formList.length > 0)
            result.form = formList;
        if (submissionButtons)
            result.submission_buttons = submissionButtons;
        if (this._dynForms.length > 0) {
            const dynDict = {};
            for (const df of this._dynForms) {
                dynDict[df.name] = df.elements.map(fe => ({ [fe.type]: (0, formSerialization_1.serializeElement)(fe.type, fe.config) }));
            }
            result.dynamic_forms = dynDict;
        }
        return result;
    }
    /** Rebuild the cards from form YAML (every element goes through ``deserializeElement``). */
    setData(data) {
        this._elements = [];
        this._listEl.innerHTML = '';
        this._dynForms = [];
        while (this._dynFormsContainer.children.length > 1) {
            this._dynFormsContainer.removeChild(this._dynFormsContainer.lastChild);
        }
        for (const key of ['title', 'pass_value', 'fixed_value', 'annotation']) {
            if (data[key] !== undefined && data[key] !== null) {
                this._addElement(key, (0, formSerialization_1.deserializeElement)(key, data[key]));
            }
        }
        if (Array.isArray(data.form)) {
            for (const item of data.form) {
                if (!item || typeof item !== 'object')
                    continue;
                const [type] = Object.keys(item);
                this._addElement(type, (0, formSerialization_1.deserializeElement)(type, item[type]));
            }
        }
        else {
            for (const key of ['select', 'textbox', 'checkbox', 'number']) {
                if (data[key])
                    this._addElement(key, (0, formSerialization_1.deserializeElement)(key, data[key]));
            }
        }
        if (data.submission_buttons) {
            this._addElement('submission_buttons', (0, formSerialization_1.deserializeElement)('submission_buttons', data.submission_buttons));
        }
        const dynForms = data.dynamic_forms;
        if (dynForms && typeof dynForms === 'object' && !Array.isArray(dynForms)) {
            for (const [name, elems] of Object.entries(dynForms)) {
                const feList = [];
                if (Array.isArray(elems)) {
                    for (const el of elems) {
                        if (el && typeof el === 'object') {
                            const [type] = Object.keys(el);
                            feList.push({ type, config: (0, formSerialization_1.deserializeElement)(type, el[type]), el: document.createElement('div') });
                        }
                    }
                }
                this._createDynForm(name, feList);
            }
        }
    }
    _makeAddBar(onAdd) {
        const bar = document.createElement('div');
        bar.style.cssText =
            `display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px 8px;padding:6px 0;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};margin-bottom:4px;`;
        const columns = ADD_BAR_COLUMNS;
        const mkBtn = (t) => {
            const btn = (0, dom_1.makeButton)(`+ ${t}`);
            btn.style.fontSize = '11px';
            btn.style.padding = '3px 8px';
            btn.addEventListener('click', () => {
                this.fieldFocused.emit(t);
                if (onAdd) {
                    onAdd(t);
                }
                else {
                    this._addElement(t);
                }
            });
            btn.addEventListener('mouseenter', () => this.fieldFocused.emit(t));
            return btn;
        };
        for (const col of columns) {
            const hdr = document.createElement('div');
            hdr.textContent = col.header;
            hdr.style.cssText =
                `font-size:10px;font-weight:700;color:${styles_1.COLORS.textMuted};text-transform:uppercase;` +
                    `letter-spacing:0.5px;padding-bottom:2px;`;
            bar.appendChild(hdr);
        }
        for (const col of columns) {
            const cell = document.createElement('div');
            cell.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
            for (const row of col.rows) {
                const rowEl = document.createElement('div');
                rowEl.style.cssText = `display:flex;gap:3px;`;
                for (const t of row) {
                    const b = mkBtn(t);
                    b.style.flex = '1';
                    b.style.minWidth = '0';
                    rowEl.appendChild(b);
                }
                cell.appendChild(rowEl);
            }
            bar.appendChild(cell);
        }
        return bar;
    }
    _addElement(type, config, target) {
        const cfg = config || (0, formCards_1.defaultElementConfig)(type);
        const tgt = target || { elements: this._elements, listEl: this._listEl };
        const card = this._buildElementCard(type, cfg, tgt);
        const fe = { type, config: cfg, el: card };
        tgt.elements.push(fe);
        tgt.listEl.appendChild(card);
        this._emitChanged();
    }
    _buildElementCard(type, cfg, target) {
        const card = document.createElement('div');
        card.draggable = true;
        card.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
                `display:flex;flex-direction:column;gap:5px;cursor:grab;` +
                `border:1px solid transparent;`;
        card.addEventListener('focusin', () => this.fieldFocused.emit(type));
        card.addEventListener('click', () => this.fieldFocused.emit(type));
        card.addEventListener('dragstart', (e) => {
            this._dragSrcCard = card;
            card.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
            this._dragSrcCard = null;
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.style.borderColor = styles_1.COLORS.blue;
        });
        card.addEventListener('dragleave', () => {
            card.style.borderColor = 'transparent';
        });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.style.borderColor = 'transparent';
            if (!this._dragSrcCard || this._dragSrcCard === card)
                return;
            const srcIdx = target.elements.findIndex(el => el.el === this._dragSrcCard);
            const dstIdx = target.elements.findIndex(el => el.el === card);
            if (srcIdx < 0 || dstIdx < 0)
                return;
            const [moved] = target.elements.splice(srcIdx, 1);
            target.elements.splice(dstIdx, 0, moved);
            target.listEl.innerHTML = '';
            for (const el of target.elements)
                target.listEl.appendChild(el.el);
            this._emitChanged();
        });
        const header = (0, dom_1.makeRow)();
        const typeLabel = document.createElement('span');
        typeLabel.textContent = type;
        typeLabel.style.cssText =
            `font-size:12px;font-weight:700;color:${styles_1.COLORS.blue};flex:1;`;
        const moveUp = (0, dom_1.makeButton)('▲');
        moveUp.style.cssText += `font-size:10px;padding:2px 6px;`;
        moveUp.addEventListener('click', () => this._moveElement(card, -1, target));
        const moveDown = (0, dom_1.makeButton)('▼');
        moveDown.style.cssText += `font-size:10px;padding:2px 6px;`;
        moveDown.addEventListener('click', () => this._moveElement(card, 1, target));
        const removeBtn = (0, dom_1.makeButton)('✕');
        removeBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${styles_1.COLORS.red};`;
        removeBtn.addEventListener('click', () => this._removeElement(card, target));
        header.append(typeLabel, moveUp, moveDown, removeBtn);
        card.appendChild(header);
        (0, formCards_1.buildElementFields)(this._ctx, card, type, cfg);
        return card;
    }
    _promptAddDynForm() {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            `position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;` +
                `background:rgba(0,0,0,0.5);`;
        const dialog = document.createElement('div');
        dialog.style.cssText =
            `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:8px;` +
                `padding:16px;display:flex;flex-direction:column;gap:10px;min-width:260px;`;
        const title = document.createElement('div');
        title.textContent = 'New Dynamic Form';
        title.style.cssText = `font-size:13px;font-weight:700;color:${styles_1.COLORS.textPrimary};`;
        const inp = (0, dom_1.makeInput)('form name', '200px');
        inp.style.fontSize = '13px';
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display:flex;gap:8px;justify-content:flex-end;`;
        const cancelBtn = (0, dom_1.makeButton)('Cancel');
        cancelBtn.addEventListener('click', () => overlay.remove());
        const createBtn = (0, dom_1.makeButton)('Create', true);
        createBtn.addEventListener('click', () => {
            const name = inp.value.trim();
            if (!name)
                return;
            if (this._dynForms.some(df => df.name === name))
                return;
            this._createDynForm(name);
            overlay.remove();
            this._emitChanged();
        });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                createBtn.click();
            if (e.key === 'Escape')
                overlay.remove();
        });
        btnRow.append(cancelBtn, createBtn);
        dialog.append(title, inp, btnRow);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => { if (e.target === overlay)
            overlay.remove(); });
        document.body.appendChild(overlay);
        inp.focus();
    }
    _createDynForm(name, elements) {
        const container = document.createElement('div');
        container.style.cssText =
            `background:${styles_1.COLORS.bgMantle};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:6px;` +
                `padding:8px 10px;display:flex;flex-direction:column;gap:6px;`;
        const header = (0, dom_1.makeRow)();
        const lbl = document.createElement('span');
        lbl.textContent = name;
        lbl.style.cssText = `font-size:12px;font-weight:700;color:${styles_1.COLORS.mauve};flex:1;cursor:pointer;`;
        lbl.title = 'Double-click to rename';
        const startRename = () => {
            const renameInp = (0, dom_1.makeInput)(df.name, '160px');
            renameInp.value = df.name;
            renameInp.style.fontSize = '12px';
            renameInp.style.fontWeight = '700';
            lbl.replaceWith(renameInp);
            renameInp.focus();
            renameInp.select();
            const commit = () => {
                const newName = renameInp.value.trim();
                if (newName && newName !== df.name && !this._dynForms.some(d => d !== df && d.name === newName)) {
                    df.name = newName;
                }
                lbl.textContent = df.name;
                renameInp.replaceWith(lbl);
                this._emitChanged();
            };
            renameInp.addEventListener('blur', commit);
            renameInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    renameInp.blur();
                }
                if (e.key === 'Escape') {
                    renameInp.value = df.name;
                    renameInp.blur();
                }
            });
        };
        lbl.addEventListener('dblclick', startRename);
        const renameBtn = (0, dom_1.makeButton)('✎');
        renameBtn.title = 'Rename form';
        renameBtn.style.cssText += `font-size:12px;padding:2px 6px;color:${styles_1.COLORS.textPrimary};`;
        renameBtn.addEventListener('click', startRename);
        const rmBtn = (0, dom_1.makeButton)('✕');
        rmBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${styles_1.COLORS.red};`;
        rmBtn.addEventListener('click', () => {
            const idx = this._dynForms.findIndex(d => d === df);
            if (idx >= 0)
                this._dynForms.splice(idx, 1);
            container.remove();
            this._emitChanged();
        });
        header.append(lbl, renameBtn, rmBtn);
        container.appendChild(header);
        const listEl = document.createElement('div');
        listEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
        container.appendChild(listEl);
        const df = { name, elements: elements || [], el: container, listEl };
        for (const fe of df.elements) {
            const card = this._buildElementCard(fe.type, fe.config, df);
            fe.el = card;
            listEl.appendChild(card);
        }
        const addBar = this._makeAddBar((type) => this._addElement(type, undefined, df));
        addBar.style.borderBottom = 'none';
        addBar.style.paddingBottom = '0';
        container.appendChild(addBar);
        this._dynForms.push(df);
        this._dynFormsContainer.appendChild(container);
        requestAnimationFrame(() => container.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    _moveElement(card, direction, target) {
        const idx = target.elements.findIndex(e => e.el === card);
        if (idx < 0)
            return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= target.elements.length)
            return;
        const [el] = target.elements.splice(idx, 1);
        target.elements.splice(newIdx, 0, el);
        target.listEl.innerHTML = '';
        for (const e of target.elements)
            target.listEl.appendChild(e.el);
        this._emitChanged();
    }
    _removeElement(card, target) {
        const idx = target.elements.findIndex(e => e.el === card);
        if (idx < 0)
            return;
        target.elements.splice(idx, 1);
        card.remove();
        this._emitChanged();
    }
}
exports.FormSection = FormSection;


/***/ },

/***/ "./lib/config_builder/sections/OutputSection.js"
/*!******************************************************!*\
  !*** ./lib/config_builder/sections/OutputSection.js ***!
  \******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OutputSection = void 0;
/**
 * Output section: where submissions are written (``output:`` — path, index column, sync
 * uri / button, recursive scan, secrets).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
//
// Public
//
class OutputSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Output', 'output', false, true, ['split', 'project', 'config']);
        /** Browse clicked (payload: the current path, or ``.``). */
        this.browseRequested = new signaling_1.Signal(this);
        this._indexColInput = (0, dom_1.makeInput)('e.g. id', '150px');
        this._indexColInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('index_column', this._indexColInput, true));
        const pathRow = this._makeFocusRow('output path', 'path');
        this._pathInput = (0, dom_1.makeInput)('outputs/my_project.csv', '200px');
        this._pathInput.addEventListener('input', () => this._emitChanged());
        this._browseBtn = (0, dom_1.makeButton)('Browse');
        this._browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._pathInput.value || '.');
        });
        pathRow.append(this._pathInput, this._browseBtn);
        this._body.appendChild(pathRow);
        this._uriInput = (0, dom_1.makeInput)('s3://bucket/reviews.csv', '250px');
        this._uriInput.addEventListener('input', () => {
            this._autoCheckSync();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('sync_uri', this._uriInput));
        const { row: syncRow, input: syncCb } = this._makeCheckbox('sync_button');
        this._syncBtnCb = syncCb;
        this._syncBtnCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(syncRow);
        this._syncLabelInput = (0, dom_1.makeInput)('Sync', '150px');
        this._syncLabelInput.addEventListener('input', () => {
            this._autoCheckSync();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('sync_label', this._syncLabelInput));
        const { row: recRow, input: recCb } = this._makeCheckbox('recursive');
        this._recursiveCb = recCb;
        this._recursiveCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(recRow);
        this._secrets = new SecretsEditor_1.SecretsEditor(true);
        this._secrets.changed.connect(() => this._emitChanged());
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    /** Set the output path (e.g. from Browse). */
    setOutputPath(path) {
        this._pathInput.value = path;
        this._emitChanged();
    }
    /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
    applyLocks(locks, routing) {
        this._applyRoutedLocks([
            { el: this._pathInput, key: 'path' },
            { el: this._browseBtn, key: 'path' },
            { el: this._uriInput, key: 'uri' },
            { el: this._syncBtnCb, key: 'sync_button' },
            { el: this._syncLabelInput, key: 'sync_button' },
            { el: this._recursiveCb, key: 'recursive' },
            { el: this._secrets.element, key: 'secrets' },
            { el: this._indexColInput, key: 'index_column' },
        ], locks, routing);
    }
    getData() {
        const result = {};
        if (this._pathInput.value)
            result.path = this._pathInput.value;
        if (this._indexColInput.value)
            result.index_column = this._indexColInput.value;
        if (this._uriInput.value)
            result.uri = this._uriInput.value;
        if (this._syncBtnCb.checked) {
            result.sync_button = this._syncLabelInput.value || true;
        }
        if (this._recursiveCb.checked)
            result.recursive = true;
        const secrets = this._secrets.getData();
        if (secrets !== undefined)
            result.secrets = secrets;
        return result;
    }
    /** No-op: the output index_column is free-form text (it may differ from the data's). */
    setColumnOptions(_cols) { }
    reset() {
        for (const el of [this._pathInput, this._indexColInput, this._uriInput, this._syncLabelInput]) {
            el.value = '';
        }
        this._syncBtnCb.checked = false;
        this._recursiveCb.checked = false;
        this._secrets.reset();
    }
    setData(data) {
        if (data.path)
            this._pathInput.value = data.path;
        if (data.index_column)
            this._indexColInput.value = data.index_column;
        if (data.uri || data.url)
            this._uriInput.value = data.uri || data.url;
        if (data.sync_button) {
            this._syncBtnCb.checked = true;
            if (typeof data.sync_button === 'string')
                this._syncLabelInput.value = data.sync_button;
        }
        if (data.recursive)
            this._recursiveCb.checked = true;
        if (data.secrets !== undefined)
            this._secrets.setData(data.secrets);
    }
    /**
     * Entering a sync URI or a sync button label implies the user wants the sync button shown,
     * so check it automatically.
     */
    _autoCheckSync() {
        if (this._uriInput.value || this._syncLabelInput.value) {
            this._syncBtnCb.checked = true;
        }
    }
}
exports.OutputSection = OutputSection;


/***/ },

/***/ "./lib/config_builder/sections/SecretsEditor.js"
/*!******************************************************!*\
  !*** ./lib/config_builder/sections/SecretsEditor.js ***!
  \******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SecretsEditor = void 0;
/**
 * Editor for a section's ``secrets:`` list ({key, value} pairs such as an Authorization
 * header), with an optional "opt out of global" checkbox that writes ``secrets: false``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/config_builder/text.js");
//
// Public
//
class SecretsEditor {
    /** @param showOptOut - Show the "opt out of global" checkbox (section-level secrets). */
    constructor(showOptOut = false) {
        /** An entry or the opt-out changed. */
        this.changed = new signaling_1.Signal(this);
        /** The editor was clicked / focused (highlights ``secrets`` in the docs). */
        this.focused = new signaling_1.Signal(this);
        this._entries = [];
        this._optedOut = false;
        this._showOptOut = showOptOut;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
                `background:${styles_1.COLORS.bgSurface0};border-radius:6px;`;
        const header = document.createElement('div');
        header.style.cssText = `display:flex;align-items:center;gap:8px;`;
        const label = document.createElement('span');
        label.textContent = 'secrets';
        label.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        header.appendChild(label);
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add';
        addBtn.style.cssText =
            `background:${styles_1.COLORS.bgSurface1};border:none;border-radius:4px;` +
                `color:${styles_1.COLORS.textPrimary};padding:2px 8px;font-size:11px;cursor:pointer;`;
        addBtn.addEventListener('click', () => {
            this._entries.push({ key: '', value: '' });
            this._rebuild();
            this.changed.emit(void 0);
            this.focused.emit(void 0);
        });
        header.appendChild(addBtn);
        if (showOptOut) {
            this._optOutCb = document.createElement('input');
            this._optOutCb.type = 'checkbox';
            this._optOutCb.style.cssText = `accent-color:${styles_1.COLORS.blue};`;
            this._optOutCb.addEventListener('change', () => {
                this._optedOut = this._optOutCb.checked;
                this._listEl.style.display = this._optedOut ? 'none' : 'flex';
                this.changed.emit(void 0);
            });
            const optLabel = document.createElement('label');
            optLabel.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto;`;
            const optText = document.createElement('span');
            optText.textContent = 'opt out of global';
            optText.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;`;
            optLabel.append(this._optOutCb, optText);
            header.appendChild(optLabel);
        }
        else {
            this._optOutCb = document.createElement('input');
        }
        this.element.addEventListener('focusin', () => this.focused.emit(void 0));
        this.element.addEventListener('click', () => this.focused.emit(void 0));
        this.element.appendChild(header);
        const hint = document.createElement('span');
        hint.textContent = text_1.SECRETS_HINT;
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.3;`;
        this.element.appendChild(hint);
        this._listEl = document.createElement('div');
        this._listEl.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
        this.element.appendChild(this._listEl);
    }
    /**
     * The ``secrets`` value to write:
     * - ``false`` — opted out of the global secrets (only with the opt-out checkbox);
     * - ``undefined`` — no complete entries, so omit the key;
     * - otherwise the entries that have both a key and a value.
     */
    getData() {
        if (this._showOptOut && this._optedOut)
            return false;
        const valid = this._entries.filter(e => e.key && e.value);
        if (valid.length === 0)
            return undefined;
        return valid.map(e => ({ key: e.key, value: e.value }));
    }
    /** Back to the empty, not-opted-out state. */
    reset() {
        this._optedOut = false;
        if (this._optOutCb)
            this._optOutCb.checked = false;
        this._listEl.style.display = 'flex';
        this._entries = [];
        this._rebuild();
    }
    /** Load ``secrets`` YAML: ``false`` (opted out), a list of entries, or a single entry. */
    setData(data) {
        if (data === false) {
            this._optedOut = true;
            this._optOutCb.checked = true;
            this._listEl.style.display = 'none';
            this._entries = [];
        }
        else if (Array.isArray(data)) {
            this._optedOut = false;
            this._optOutCb.checked = false;
            this._listEl.style.display = 'flex';
            this._entries = data.map((e) => ({
                key: String(e.key || ''),
                value: String(e.value || ''),
            }));
        }
        else if (data && typeof data === 'object' && 'key' in data) {
            const entry = data;
            this._optedOut = false;
            this._optOutCb.checked = false;
            this._listEl.style.display = 'flex';
            this._entries = [{ key: String(entry.key || ''), value: String(entry.value || '') }];
        }
        else {
            this._entries = [];
        }
        this._rebuild();
    }
    _rebuild() {
        this._listEl.innerHTML = '';
        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:4px;`;
            const keyInput = this._makeEntryInput('key (e.g. Authorization)', entry.key, '130px', v => { this._entries[i].key = v; });
            const valInput = this._makeEntryInput('value (env:VAR / dialog / literal)', entry.value, '170px', v => { this._entries[i].value = v; });
            const rmBtn = document.createElement('button');
            rmBtn.textContent = '✕';
            rmBtn.style.cssText =
                `background:none;border:none;color:${styles_1.COLORS.textMuted};cursor:pointer;` +
                    `font-size:12px;padding:0 2px;line-height:1;`;
            rmBtn.addEventListener('click', () => {
                this._entries.splice(i, 1);
                this._rebuild();
                this.changed.emit(void 0);
            });
            row.append(keyInput, valInput, rmBtn);
            this._listEl.appendChild(row);
        }
    }
    _makeEntryInput(placeholder, value, width, onInput) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.value = value;
        input.style.cssText =
            `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
                `font-size:11px;width:${width};box-sizing:border-box;`;
        input.addEventListener('input', () => {
            onInput(input.value);
            this.changed.emit(void 0);
        });
        return input;
    }
}
exports.SecretsEditor = SecretsEditor;


/***/ },

/***/ "./lib/config_builder/sections/SetupSection.js"
/*!*****************************************************!*\
  !*** ./lib/config_builder/sections/SetupSection.js ***!
  \*****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetupSection = void 0;
/**
 * Setup section: tabbed project entry: Create New / Create from Template / Load Existing.
 * File management (paths, enable, Duplicate/Rename, lock) lives in the separate
 * ConfigFilesSection. This section only emits intent signals — `projectCreated`,
 * `loadConfigRequested`, and the template signals.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/config_builder/text.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const TemplateForm_1 = __webpack_require__(/*! ./TemplateForm */ "./lib/config_builder/sections/TemplateForm.js");
//
// Constants
//
const MODE_CREATE = 'create';
const MODE_TEMPLATE = 'template';
const MODE_LOAD = 'load';
//
// Public
//
class SetupSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Setup', 'setup', true);
        /** Load tab Browse clicked (``field``: the chosen file type). */
        this.browseRequested = new signaling_1.Signal(this);
        /** Load clicked (``field``: file type hint, ``path``: file to load). */
        this.loadConfigRequested = new signaling_1.Signal(this);
        /** Create clicked (payload: the project name). */
        this.projectCreated = new signaling_1.Signal(this);
        // Re-emitted TemplateForm signals (see TemplateForm).
        this.templateListRequested = new signaling_1.Signal(this);
        this.templateSelected = new signaling_1.Signal(this);
        this.applyTemplateRequested = new signaling_1.Signal(this);
        this.templateBrowseRequested = new signaling_1.Signal(this);
        this.templateColumnsRequested = new signaling_1.Signal(this);
        this._body.appendChild(this._makeTabBar());
        this._tabHelp = document.createElement('div');
        this._tabHelp.style.cssText =
            `color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.5;margin:2px 0 4px;`;
        this._tabHelp.textContent = text_1.SETUP_TAB_HELP.create;
        this._body.appendChild(this._tabHelp);
        this._createPane = this._buildCreatePane();
        this._templatePane = this._buildTemplatePane();
        this._templatePane.style.display = 'none';
        this._loadPane = this._buildLoadPane();
        this._loadPane.style.display = 'none';
        this._body.append(this._createPane, this._templatePane, this._loadPane);
    }
    setTemplateList(items) {
        this._templateForm.setList(items);
    }
    setTemplate(name, template) {
        this._templateForm.setTemplate(name, template);
    }
    /** Lock the template form after its files were saved (Edit re-enables it). */
    markTemplateSaved() {
        this._templateForm.markSaved();
    }
    setTemplateFieldValue(key, value) {
        this._templateForm.setFieldValue(key, value);
    }
    setTemplateColumns(path, cols) {
        this._templateForm.setColumns(path, cols);
    }
    /** Fill the Load path (e.g. from Browse). */
    setLoadPath(path) {
        this._loadPathInput.value = path;
        this._loadPathInput.focus();
    }
    /** Nothing: the tabs hold no persisted config. */
    getData() {
        return {};
    }
    setData(_data) {
        /* tabs hold no persisted config; file state lives in ConfigFilesSection */
    }
    //
    // Internal — UI builders
    //
    _makeTabBar() {
        const bar = document.createElement('div');
        bar.style.cssText = `display:flex;gap:0;border-radius:4px;overflow:hidden;border:1px solid ${styles_1.COLORS.bgSurface1};`;
        this._createTab = document.createElement('button');
        this._createTab.textContent = 'Create New';
        this._createTab.style.cssText = this._tabStyle(true, true);
        this._createTab.addEventListener('click', () => this._switchMode(MODE_CREATE));
        this._templateTab = document.createElement('button');
        this._templateTab.textContent = 'Create from Template';
        this._templateTab.style.cssText = this._tabStyle(false, true);
        this._templateTab.addEventListener('click', () => this._switchMode(MODE_TEMPLATE));
        this._loadTab = document.createElement('button');
        this._loadTab.textContent = 'Load Existing';
        this._loadTab.style.cssText = this._tabStyle(false);
        this._loadTab.addEventListener('click', () => this._switchMode(MODE_LOAD));
        bar.append(this._createTab, this._templateTab, this._loadTab);
        return bar;
    }
    _buildTemplatePane() {
        const pane = document.createElement('div');
        pane.style.cssText = `display:flex;flex-direction:column;padding:4px 0;`;
        this._templateForm = new TemplateForm_1.TemplateForm();
        this._templateForm.listRequested.connect(() => this.templateListRequested.emit());
        this._templateForm.templateSelected.connect((_, name) => this.templateSelected.emit(name));
        this._templateForm.applyRequested.connect((_, payload) => this.applyTemplateRequested.emit(payload));
        this._templateForm.browseRequested.connect((_, payload) => this.templateBrowseRequested.emit(payload));
        this._templateForm.columnsRequested.connect((_, path) => this.templateColumnsRequested.emit(path));
        pane.appendChild(this._templateForm.element);
        return pane;
    }
    _buildCreatePane() {
        const pane = document.createElement('div');
        pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;`;
        const lbl = (0, dom_1.makeLabel)('name');
        lbl.style.minWidth = '40px';
        this._createNameInput = (0, dom_1.makeInput)('e.g. Bird Review', '400px');
        this._createNameInput.style.flexShrink = '1';
        this._createNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                this._onCreate();
        });
        this._createBtn = (0, dom_1.makeButton)('Create', true);
        this._createBtn.type = 'button';
        this._createBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onCreate(); });
        pane.append(lbl, this._createNameInput, this._createBtn);
        return pane;
    }
    _buildLoadPane() {
        const pane = document.createElement('div');
        pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;`;
        this._loadTypeSelect = (0, dom_1.makeSelect)(['project', 'config', 'form'], 'project');
        this._loadPathInput = (0, dom_1.makeInput)('path to configuration file', '400px');
        this._loadPathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._onLoad();
            }
        });
        const loadBrowseBtn = (0, dom_1.makeButton)('Browse');
        loadBrowseBtn.type = 'button';
        loadBrowseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.browseRequested.emit({
                field: this._loadTypeSelect.value,
                current: this._loadPathInput.value || '.',
            });
        });
        this._loadBtn = (0, dom_1.makeButton)('Load', true);
        this._loadBtn.type = 'button';
        this._loadBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onLoad(); });
        pane.append(this._loadTypeSelect, this._loadPathInput, loadBrowseBtn, this._loadBtn);
        return pane;
    }
    //
    // Internal — actions
    //
    _switchMode(mode) {
        this._createTab.style.cssText = this._tabStyle(mode === MODE_CREATE, true);
        this._templateTab.style.cssText = this._tabStyle(mode === MODE_TEMPLATE, true);
        this._loadTab.style.cssText = this._tabStyle(mode === MODE_LOAD);
        this._createPane.style.display = mode === MODE_CREATE ? 'flex' : 'none';
        this._templatePane.style.display = mode === MODE_TEMPLATE ? 'flex' : 'none';
        this._loadPane.style.display = mode === MODE_LOAD ? 'flex' : 'none';
        this._tabHelp.textContent =
            mode === MODE_TEMPLATE ? text_1.SETUP_TAB_HELP.template
                : mode === MODE_LOAD ? text_1.SETUP_TAB_HELP.load
                    : text_1.SETUP_TAB_HELP.create;
        if (mode === MODE_TEMPLATE)
            this._templateForm.activate();
    }
    _onCreate() {
        const name = this._createNameInput.value.trim();
        if (!name)
            return;
        this.projectCreated.emit(name);
    }
    _onLoad() {
        const path = this._loadPathInput.value.trim();
        if (!path)
            return;
        this.loadConfigRequested.emit({ field: this._loadTypeSelect.value, path });
    }
    //
    // Internal — helpers
    //
    _tabStyle(active, divider = false) {
        return `flex:1;padding:6px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;` +
            `background:${active ? styles_1.COLORS.blue : 'transparent'};` +
            `color:${active ? styles_1.COLORS.bgBase : styles_1.COLORS.textMuted};` +
            (divider ? `border-right:1px solid ${styles_1.COLORS.bgSurface1};` : '');
    }
}
exports.SetupSection = SetupSection;


/***/ },

/***/ "./lib/config_builder/sections/TemplateForm.js"
/*!*****************************************************!*\
  !*** ./lib/config_builder/sections/TemplateForm.js ***!
  \*****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TemplateForm = void 0;
/**
 * TemplateForm
 *
 * "Create from Template" UI for the config-builder Setup section: a selectable
 * template list plus the per-template input form.
 *
 * The widget for each builder element is inferred from where its
 * ``__placeholder__`` sits in the template's ``configuration`` (a scoped
 * positional inference):
 *  - a ``*.source_type`` placeholder → a dropdown that live-reconfigures its
 *    paired ``value`` control (path ⇒ Browse, column ⇒ column picker, else text);
 *  - an index/select column → a **text input until the source file's columns are
 *    loaded**, then a dropdown of those columns (preserving the typed value);
 *  - a source path → text + Browse; everything else → text.
 * Columns and Browse reuse the kernel's read_columns + FileBrowser via ConfigPanel. The
 * placeholder analysis itself lives in templateAnalysis.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
const DescriptionPanel_1 = __webpack_require__(/*! ../../sections/DescriptionPanel */ "./lib/sections/DescriptionPanel.js");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const templateAnalysis_1 = __webpack_require__(/*! ./templateAnalysis */ "./lib/config_builder/sections/templateAnalysis.js");
//
// Constants
//
const SOURCE_TYPE_OPTIONS = {
    data: ['path', 'url', 'sql', 'api'],
    audio: ['path', 'url', 'uri', 'column'],
};
const COLUMNS_DEBOUNCE_MS = 500;
//
// Public
//
class TemplateForm {
    constructor() {
        /** The template tab opened for the first time: fetch the list. */
        this.listRequested = new signaling_1.Signal(this);
        /** A template was picked: fetch it (answer with ``setTemplate``). */
        this.templateSelected = new signaling_1.Signal(this);
        this.applyRequested = new signaling_1.Signal(this);
        this.browseRequested = new signaling_1.Signal(this);
        /** A source file changed: fetch its columns (answer with ``setColumns``). */
        this.columnsRequested = new signaling_1.Signal(this);
        this._rows = new Map();
        this._selectedName = '';
        this._template = null;
        this._requested = false;
        this._locked = false;
        this._fields = [];
        this._fieldByKey = new Map();
        this._columnsByPath = new Map();
        this._providerKeys = new Set();
        this._debounce = new Map();
        this.element = document.createElement('div');
        this.element.style.cssText = `display:flex;flex-direction:column;gap:8px;padding:4px 0;`;
        this._listEl = document.createElement('div');
        this._listEl.style.cssText =
            `display:flex;flex-direction:column;border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:4px;max-height:240px;overflow-y:auto;`;
        this._detailEl = document.createElement('div');
        this._detailEl.style.cssText = `display:none;flex-direction:column;gap:8px;`;
        this.element.append(this._listEl, this._detailEl);
        this._renderListPlaceholder('Loading templates…');
    }
    /** Called when the tab becomes visible; requests the list once. */
    activate() {
        if (!this._requested) {
            this._requested = true;
            this.listRequested.emit();
        }
    }
    /** Show the template list (``list_templates`` reply). */
    setList(items) {
        this._listEl.innerHTML = '';
        this._rows.clear();
        if (!items.length) {
            this._renderListPlaceholder('No templates found.');
            return;
        }
        for (const it of items) {
            const row = document.createElement('div');
            row.style.cssText =
                `padding:8px 10px;cursor:pointer;border-bottom:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `display:flex;flex-direction:column;gap:2px;`;
            const title = document.createElement('div');
            title.textContent = it.title;
            title.style.cssText = `color:${styles_1.COLORS.textPrimary};font-size:12px;font-weight:600;`;
            const desc = document.createElement('div');
            desc.textContent = it.short_description;
            desc.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;`;
            row.append(title, desc);
            row.addEventListener('mouseenter', () => {
                if (it.name !== this._selectedName)
                    row.style.background = styles_1.COLORS.bgSurface0;
            });
            row.addEventListener('mouseleave', () => {
                if (it.name !== this._selectedName)
                    row.style.background = '';
            });
            row.addEventListener('click', () => this._onSelect(it.name));
            this._rows.set(it.name, row);
            this._listEl.appendChild(row);
        }
    }
    /** Show the selected template's description and inputs (ignored if no longer selected). */
    setTemplate(name, template) {
        if (name !== this._selectedName)
            return;
        this._template = template;
        this._renderDetail();
    }
    /** After a successful save: grey out + lock the form, show an Edit button. */
    markSaved() {
        this._setLocked(true);
    }
    /** Set a field's value (e.g. after a Browse pick) and refresh dependents. */
    setFieldValue(key, value) {
        const f = this._fieldByKey.get(key);
        if (!f)
            return;
        f.value = value;
        this._renderControl(f);
        if (this._providerKeys.has(key)) {
            this._refreshColumnDependents(key);
            this._maybeRequestColumns(value);
        }
        this._updateSaveEnabled();
    }
    /** Populate column dropdowns whose source file is ``path``. */
    setColumns(path, cols) {
        this._columnsByPath.set(path, cols);
        for (const f of this._fields) {
            if (this._isColumnConsumer(f) && this._providerValue(f) === path) {
                this._renderControl(f);
            }
        }
        this._updateSaveEnabled();
    }
    /** Deselect and clear the form (keeps the list). */
    reset() {
        this._selectedName = '';
        this._template = null;
        this._locked = false;
        this._fields = [];
        this._fieldByKey.clear();
        this._columnsByPath.clear();
        this._providerKeys.clear();
        this._detailEl.style.display = 'none';
        this._detailEl.innerHTML = '';
        for (const row of this._rows.values())
            row.style.background = '';
    }
    //
    // Internal — actions
    //
    _onSelect(name) {
        this._selectedName = name;
        for (const [n, row] of this._rows) {
            row.style.background = n === name ? styles_1.COLORS.bgSurface1 : '';
        }
        this._detailEl.style.display = 'none';
        this.templateSelected.emit(name);
    }
    _onSave() {
        if (this._saveBtn.disabled)
            return;
        const values = {};
        for (const f of this._fields) {
            const v = (f.value || '').trim();
            if (v)
                values[f.key] = v;
        }
        this.applyRequested.emit({
            name: this._selectedName,
            scope: this._scopeSelect.value,
            projectName: this._nameInput.value.trim(),
            values,
        });
    }
    async _onDismiss() {
        const choice = await (0, util_1.showDialog)({
            title: 'Discard template?',
            body: 'Your template inputs will be lost. Proceed?',
            buttons: [{ label: 'Cancel' }, { label: 'Discard', primary: true }],
        });
        if (choice === 'Discard')
            this.reset();
    }
    _maybeRequestColumns(path) {
        const p = (path || '').trim();
        if (p && constants_1.DATA_FILE_RE.test(p))
            this.columnsRequested.emit(p);
    }
    //
    // Internal — detail + form rendering
    //
    _renderDetail() {
        var _a, _b;
        const tpl = this._template;
        this._detailEl.innerHTML = '';
        this._detailEl.style.display = 'flex';
        this._locked = false;
        const head = document.createElement('div');
        head.innerHTML = (0, DescriptionPanel_1.renderMarkdown)(`# ${(_a = tpl.title) !== null && _a !== void 0 ? _a : this._selectedName}\n\n${(_b = tpl.description) !== null && _b !== void 0 ? _b : ''}`);
        head.style.cssText = `color:${styles_1.COLORS.textPrimary};font-size:12px;`;
        this._detailEl.appendChild(head);
        // Everything the Edit/Save state greys out lives in _editableEl.
        this._editableEl = document.createElement('div');
        this._editableEl.style.cssText = `display:flex;flex-direction:column;gap:8px;`;
        const scopeRow = document.createElement('div');
        scopeRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
        this._scopeSelect = document.createElement('select');
        this._scopeSelect.style.cssText = (0, styles_1.selectStyle)();
        (0, dom_1.fillSelect)(this._scopeSelect, Object.keys(templateAnalysis_1.SCOPE_SECTIONS));
        this._scopeSelect.value = 'project';
        this._scopeSelect.addEventListener('change', () => this._renderForm());
        scopeRow.append(this._label('create'), this._scopeSelect);
        this._editableEl.appendChild(scopeRow);
        const nameRow = document.createElement('div');
        nameRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
        this._nameInput = document.createElement('input');
        this._nameInput.style.cssText = (0, styles_1.inputStyle)('300px');
        this._nameInput.placeholder = 'e.g. Bird Review';
        this._nameInput.addEventListener('input', () => this._updateSaveEnabled());
        nameRow.append(this._label('name', true), this._nameInput);
        this._editableEl.appendChild(nameRow);
        this._formEl = document.createElement('div');
        this._formEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
        this._editableEl.appendChild(this._formEl);
        this._detailEl.appendChild(this._editableEl);
        this._btnRow = document.createElement('div');
        this._btnRow.style.cssText = `display:flex;gap:8px;margin-top:4px;`;
        this._detailEl.appendChild(this._btnRow);
        this._renderButtons();
        this._renderForm();
    }
    _renderButtons() {
        this._btnRow.innerHTML = '';
        if (this._locked) {
            const edit = (0, dom_1.makeButton)('Edit', true);
            edit.addEventListener('click', () => this._setLocked(false));
            this._btnRow.appendChild(edit);
            return;
        }
        this._saveBtn = (0, dom_1.makeButton)('Save', true);
        this._saveBtn.addEventListener('click', () => this._onSave());
        const dismissBtn = (0, dom_1.makeButton)('Dismiss');
        dismissBtn.addEventListener('click', () => this._onDismiss());
        this._btnRow.append(this._saveBtn, dismissBtn);
        this._updateSaveEnabled();
    }
    _setLocked(locked) {
        this._locked = locked;
        this._editableEl.style.opacity = locked ? '0.55' : '1';
        this._editableEl.style.pointerEvents = locked ? 'none' : '';
        this._renderButtons();
    }
    _renderForm() {
        var _a;
        this._formEl.innerHTML = '';
        this._fields = [];
        this._fieldByKey.clear();
        const tpl = this._template;
        const scope = this._scopeSelect.value;
        const descriptors = (0, templateAnalysis_1.analyzeTemplate)(tpl, scope);
        for (const section of (_a = templateAnalysis_1.SCOPE_SECTIONS[scope]) !== null && _a !== void 0 ? _a : []) {
            const sec = tpl[section];
            if (!sec || typeof sec !== 'object')
                continue;
            const hasElements = Array.isArray(sec.builder_elements) && sec.builder_elements.length > 0;
            const hasDesc = !!sec.template_description;
            // A section with neither inputs nor a description (e.g. a fixed `config`)
            // contributes no UI — not even a title.
            if (!hasElements && !hasDesc)
                continue;
            this._formEl.appendChild(this._sectionHeader(section));
            if (hasDesc) {
                const d = document.createElement('div');
                d.innerHTML = (0, DescriptionPanel_1.renderMarkdown)(String(sec.template_description));
                d.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;`;
                this._formEl.appendChild(d);
            }
            if (hasElements) {
                this._renderElements(sec.builder_elements, this._formEl, descriptors);
            }
        }
        this._providerKeys = new Set(this._fields.map(f => f.providerKey).filter((k) => !!k));
        for (const f of this._fields)
            this._renderControl(f);
        // Seed columns from any path provider that already has a value.
        for (const f of this._fields) {
            if (this._providerKeys.has(f.key) && f.value)
                this._maybeRequestColumns(f.value);
        }
        this._updateSaveEnabled();
    }
    _renderElements(elements, parent, descriptors) {
        for (const item of elements) {
            if (!item || typeof item !== 'object')
                continue;
            if (item.group && typeof item.group === 'object') {
                const g = item.group;
                // The group header (name + description) sits at the parent indent…
                const groupWrap = document.createElement('div');
                groupWrap.style.cssText = `display:flex;flex-direction:column;gap:4px;margin-bottom:12px;`;
                if (g.group_name) {
                    const t = document.createElement('div');
                    t.textContent = g.group_name;
                    t.style.cssText =
                        `color:${styles_1.COLORS.textSubtle};font-size:11px;font-weight:600;text-transform:uppercase;`;
                    groupWrap.appendChild(t);
                }
                if (g.group_description) {
                    const dd = document.createElement('div');
                    dd.textContent = g.group_description;
                    dd.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;`;
                    groupWrap.appendChild(dd);
                }
                // …only the fields are indented under the left bar.
                const inner = document.createElement('div');
                inner.style.cssText =
                    `display:flex;flex-direction:column;gap:6px;margin-top:4px;` +
                        `border-left:2px solid ${styles_1.COLORS.bgSurface1};padding-left:10px;`;
                if (Array.isArray(g.elements))
                    this._renderElements(g.elements, inner, descriptors);
                groupWrap.appendChild(inner);
                parent.appendChild(groupWrap);
                continue;
            }
            const key = Object.keys(item)[0];
            if (key)
                this._addField(key, item[key], parent, descriptors.get(key));
        }
    }
    _addField(key, spec, parent, desc) {
        var _a;
        const norm = (0, templateAnalysis_1.normalizeElementSpec)(spec);
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:8px;`;
        const lbl = this._label(norm.label || key, norm.required);
        if (norm.description)
            lbl.title = norm.description;
        const host = document.createElement('div');
        host.style.cssText = `display:flex;align-items:center;gap:6px;flex:1;`;
        row.append(lbl, host);
        parent.appendChild(row);
        const field = {
            key, required: norm.required, role: (_a = desc === null || desc === void 0 ? void 0 : desc.role) !== null && _a !== void 0 ? _a : 'plain',
            default: norm.default, value: norm.default != null ? String(norm.default) : '',
            host, section: desc === null || desc === void 0 ? void 0 : desc.section, exts: desc === null || desc === void 0 ? void 0 : desc.exts,
            sourceTypeKey: desc === null || desc === void 0 ? void 0 : desc.sourceTypeKey, literalSourceType: desc === null || desc === void 0 ? void 0 : desc.literalSourceType,
            providerKey: desc === null || desc === void 0 ? void 0 : desc.providerKey,
        };
        this._fields.push(field);
        this._fieldByKey.set(key, field);
    }
    //
    // Internal — per-field control rendering
    //
    _renderControl(field) {
        var _a, _b;
        field.host.innerHTML = '';
        switch (field.role) {
            case 'source_type':
                this._renderSourceType(field);
                break;
            case 'pathfile':
                this._renderPath(field, (_a = field.exts) !== null && _a !== void 0 ? _a : constants_1.DATA_EXTS);
                break;
            case 'value': {
                const eff = this._effSourceType(field);
                if (eff === 'path')
                    this._renderPath(field, (_b = field.exts) !== null && _b !== void 0 ? _b : constants_1.DATA_EXTS);
                else if (eff === 'column')
                    this._renderColumn(field);
                else
                    this._renderText(field);
                break;
            }
            case 'column':
                this._renderColumn(field);
                break;
            default:
                this._renderText(field);
        }
    }
    _renderSourceType(field) {
        var _a, _b;
        const select = document.createElement('select');
        select.style.cssText = (0, styles_1.selectStyle)() + 'min-width:120px;';
        const opts = (_b = SOURCE_TYPE_OPTIONS[(_a = field.section) !== null && _a !== void 0 ? _a : 'data']) !== null && _b !== void 0 ? _b : [];
        (0, dom_1.fillSelect)(select, opts, field.value ? undefined : '— select —');
        select.value = field.value;
        select.addEventListener('change', () => {
            field.value = select.value;
            // re-render the paired value field(s) — their widget depends on this.
            for (const vf of this._fields) {
                if (vf.role === 'value' && vf.sourceTypeKey === field.key)
                    this._renderControl(vf);
            }
            this._updateSaveEnabled();
        });
        field.host.appendChild(select);
    }
    _renderText(field) {
        field.host.appendChild(this._makeValueInput(field));
    }
    _renderPath(field, exts) {
        const input = this._makeValueInput(field, () => {
            if (this._providerKeys.has(field.key))
                this._scheduleProvide(field);
        });
        const browse = (0, dom_1.makeButton)('Browse');
        browse.addEventListener('click', () => this.browseRequested.emit({ key: field.key, exts, current: field.value || '.' }));
        field.host.append(input, browse);
    }
    _renderColumn(field) {
        const providerVal = this._providerValue(field);
        const cols = providerVal ? this._columnsByPath.get(providerVal) : undefined;
        if (cols && cols.length) {
            const select = document.createElement('select');
            select.style.cssText = (0, styles_1.selectStyle)() + 'min-width:200px;';
            const current = field.value;
            const opts = [...cols];
            if (current && !opts.includes(current))
                opts.unshift(current);
            (0, dom_1.fillSelect)(select, opts, (!field.required || !current) ? '— select —' : undefined);
            select.value = current;
            select.addEventListener('change', () => {
                field.value = select.value;
                this._updateSaveEnabled();
            });
            field.host.appendChild(select);
        }
        else {
            // No columns yet — a plain text input until the source file loads.
            const input = this._makeValueInput(field);
            input.placeholder = 'type a column, or pick the file above';
            field.host.appendChild(input);
        }
    }
    //
    // Internal — dynamic helpers
    //
    _effSourceType(field) {
        if (field.sourceTypeKey) {
            const st = this._fieldByKey.get(field.sourceTypeKey);
            return st ? st.value || undefined : field.literalSourceType;
        }
        return field.literalSourceType;
    }
    _isColumnConsumer(field) {
        return field.role === 'column'
            || (field.role === 'value' && this._effSourceType(field) === 'column');
    }
    _providerValue(field) {
        var _a, _b;
        if (!field.providerKey)
            return '';
        return (_b = (_a = this._fieldByKey.get(field.providerKey)) === null || _a === void 0 ? void 0 : _a.value.trim()) !== null && _b !== void 0 ? _b : '';
    }
    _refreshColumnDependents(providerKey) {
        for (const f of this._fields) {
            if (this._isColumnConsumer(f) && f.providerKey === providerKey)
                this._renderControl(f);
        }
    }
    _scheduleProvide(field) {
        const prev = this._debounce.get(field.key);
        if (prev)
            clearTimeout(prev);
        this._debounce.set(field.key, setTimeout(() => {
            this._refreshColumnDependents(field.key);
            this._maybeRequestColumns(field.value);
        }, COLUMNS_DEBOUNCE_MS));
    }
    _updateSaveEnabled() {
        if (this._locked)
            return;
        const nameOk = !!this._nameInput.value.trim();
        const requiredOk = this._fields.every(f => !f.required || !!(f.value || '').trim());
        this._saveBtn.disabled = !(nameOk && requiredOk);
        this._saveBtn.style.opacity = this._saveBtn.disabled ? '0.5' : '1';
        this._saveBtn.style.cursor = this._saveBtn.disabled ? 'not-allowed' : 'pointer';
    }
    //
    // Internal — helpers
    //
    _sectionHeader(name) {
        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;flex-direction:column;gap:3px;margin-top:8px;`;
        const title = document.createElement('div');
        title.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        title.style.cssText = `color:${styles_1.COLORS.textPrimary};font-size:14px;font-weight:700;padding-bottom:4px;`;
        const hr = document.createElement('div');
        hr.style.cssText = `height:1px;background:${styles_1.COLORS.bgSurface1};`;
        wrap.append(title, hr);
        return wrap;
    }
    /** A text input bound to ``field.value`` (``onInput`` runs after each edit). */
    _makeValueInput(field, onInput) {
        const input = document.createElement('input');
        input.style.cssText = (0, styles_1.inputStyle)('300px');
        input.value = field.value;
        input.addEventListener('input', () => {
            field.value = input.value;
            this._updateSaveEnabled();
            onInput === null || onInput === void 0 ? void 0 : onInput();
        });
        return input;
    }
    _label(text, required = false) {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.cssText =
            `color:${required ? styles_1.COLORS.teal : styles_1.COLORS.textSubtle};font-size:12px;min-width:140px;`;
        return s;
    }
    _renderListPlaceholder(msg) {
        this._listEl.innerHTML = '';
        const p = document.createElement('div');
        p.textContent = msg;
        p.style.cssText = `padding:10px;color:${styles_1.COLORS.textMuted};font-size:11px;`;
        this._listEl.appendChild(p);
    }
}
exports.TemplateForm = TemplateForm;


/***/ },

/***/ "./lib/config_builder/sections/formAnnotationTools.js"
/*!************************************************************!*\
  !*** ./lib/config_builder/sections/formAnnotationTools.js ***!
  \************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildAnnotationToolList = void 0;
/**
 * The annotation card's tool list: enabled tools (drag to reorder, x to disable, fixed_duration
 * settings) above the disabled ones (+ to enable).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
//
// Constants
//
const ALL_ANNOTATION_TOOLS = [
    'time_select', 'start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration',
];
//
// Public
//
/**
 * Add the annotation ``tools`` editor to ``card`` (edits ``cfg.tools`` in place).
 *
 * @param ctx - The owning section's hooks.
 * @param card - The annotation card.
 * @param cfg - The annotation's card config.
 */
function buildAnnotationToolList(ctx, card, cfg) {
    if (!Array.isArray(cfg.tools))
        cfg.tools = ['start_end_time_select'];
    const TOOL_ROW_W = '400px';
    const FD_INPUT_W = '60px';
    const toolName = (t) => typeof t === 'string' ? t : (typeof t === 'object' && t ? Object.keys(t)[0] : '');
    const listEl = document.createElement('div');
    listEl.style.cssText = `display:flex;flex-direction:column;gap:3px;width:${TOOL_ROW_W};`;
    let dragSrcIdx = null;
    const rebuild = () => {
        listEl.innerHTML = '';
        const currentEnabled = new Set(cfg.tools.map(toolName));
        const currentDisabled = ALL_ANNOTATION_TOOLS.filter(t => !currentEnabled.has(t));
        cfg.tools.forEach((tool, idx) => {
            const name = toolName(tool);
            const row = document.createElement('div');
            row.draggable = true;
            row.style.cssText =
                `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
                    `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:4px;font-size:12px;color:${styles_1.COLORS.textPrimary};cursor:grab;`;
            row.addEventListener('dragstart', (e) => {
                dragSrcIdx = idx;
                row.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
                dragSrcIdx = null;
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                row.style.borderColor = styles_1.COLORS.blue;
            });
            row.addEventListener('dragleave', () => {
                row.style.borderColor = styles_1.COLORS.bgSurface1;
            });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.style.borderColor = styles_1.COLORS.bgSurface1;
                if (dragSrcIdx == null || dragSrcIdx === idx)
                    return;
                const [moved] = cfg.tools.splice(dragSrcIdx, 1);
                cfg.tools.splice(idx, 0, moved);
                dragSrcIdx = null;
                ctx.changed();
                rebuild();
            });
            const label = document.createElement('span');
            label.textContent = name.replace(/_/g, ' ');
            label.style.cssText = `flex:1;`;
            row.appendChild(label);
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.title = 'Disable tool';
            removeBtn.style.cssText =
                `background:none;border:none;color:${styles_1.COLORS.red};cursor:pointer;` +
                    `font-size:14px;padding:0 2px;line-height:1;`;
            removeBtn.addEventListener('click', () => {
                cfg.tools.splice(idx, 1);
                ctx.changed();
                rebuild();
            });
            row.appendChild(removeBtn);
            listEl.appendChild(row);
            if (name === 'fixed_duration') {
                let fdCfg;
                if (typeof tool === 'object' && tool.fixed_duration != null) {
                    fdCfg = typeof tool.fixed_duration === 'object'
                        ? tool.fixed_duration : { window: tool.fixed_duration };
                }
                else {
                    fdCfg = { window: 3 };
                    cfg.tools[idx] = { fixed_duration: fdCfg };
                }
                const isInitial = fdCfg.initial_window != null;
                const detail = document.createElement('div');
                detail.style.cssText =
                    `display:flex;gap:6px;flex-wrap:wrap;padding:2px 0 2px 12px;`;
                const mkNum = (key, placeholder, disabled = false) => {
                    const inp = (0, dom_1.makeInput)(placeholder, FD_INPUT_W);
                    inp.type = 'number';
                    inp.step = 'any';
                    if (fdCfg[key] != null)
                        inp.value = String(fdCfg[key]);
                    inp.disabled = disabled;
                    inp.style.opacity = disabled ? '0.35' : '1';
                    inp.addEventListener('input', () => {
                        const v = parseFloat(inp.value);
                        if (inp.value === '') {
                            delete fdCfg[key];
                        }
                        else if (!isNaN(v)) {
                            fdCfg[key] = v;
                        }
                        ctx.changed();
                    });
                    return inp;
                };
                const valKey = isInitial ? 'initial_window' : 'window';
                const modeSel = (0, dom_1.makeSelect)(['window', 'initial_window'], valKey);
                modeSel.style.cssText += `width:120px;font-size:11px;`;
                modeSel.addEventListener('change', () => {
                    var _a, _b;
                    const v = (_b = (_a = fdCfg.window) !== null && _a !== void 0 ? _a : fdCfg.initial_window) !== null && _b !== void 0 ? _b : 3;
                    delete fdCfg.window;
                    delete fdCfg.initial_window;
                    fdCfg[modeSel.value] = v;
                    if (modeSel.value === 'initial_window') {
                        if (fdCfg.step == null)
                            fdCfg.step = 1;
                    }
                    else {
                        delete fdCfg.min;
                        delete fdCfg.max;
                        delete fdCfg.step;
                    }
                    ctx.changed();
                    rebuild();
                });
                detail.appendChild(modeSel);
                detail.appendChild(mkNum(valKey, valKey));
                detail.appendChild(mkNum('min', 'min', !isInitial));
                detail.appendChild(mkNum('max', 'max', !isInitial));
                detail.appendChild(mkNum('step', 'step', !isInitial));
                listEl.appendChild(detail);
            }
        });
        if (currentDisabled.length > 0) {
            const divider = document.createElement('div');
            divider.style.cssText =
                `border-top:1px solid ${styles_1.COLORS.bgSurface1};margin:4px 0 2px;`;
            listEl.appendChild(divider);
            for (const name of currentDisabled) {
                const row = document.createElement('div');
                row.style.cssText =
                    `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
                        `background:${styles_1.COLORS.bgCrust};border:1px solid ${styles_1.COLORS.bgSurface0};` +
                        `border-radius:4px;font-size:12px;color:${styles_1.COLORS.textMuted};opacity:0.6;`;
                const label = document.createElement('span');
                label.textContent = name.replace(/_/g, ' ');
                label.style.cssText = `flex:1;`;
                row.appendChild(label);
                const addBtn = document.createElement('button');
                addBtn.textContent = '+';
                addBtn.title = 'Enable tool';
                addBtn.style.cssText =
                    `background:none;border:none;color:${styles_1.COLORS.green};cursor:pointer;` +
                        `font-size:16px;padding:0 2px;line-height:1;font-weight:bold;`;
                addBtn.addEventListener('click', () => {
                    if (name === 'fixed_duration') {
                        cfg.tools.push({ fixed_duration: { window: 3 } });
                    }
                    else {
                        cfg.tools.push(name);
                    }
                    ctx.changed();
                    rebuild();
                });
                row.appendChild(addBtn);
                listEl.appendChild(row);
            }
        }
    };
    rebuild();
    const container = document.createElement('div');
    container.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    container.appendChild(listEl);
    card.appendChild(ctx.fieldRow('tools', container));
}
exports.buildAnnotationToolList = buildAnnotationToolList;


/***/ },

/***/ "./lib/config_builder/sections/formCards.js"
/*!**************************************************!*\
  !*** ./lib/config_builder/sections/formCards.js ***!
  \**************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildElementFields = exports.defaultElementConfig = void 0;
/**
 * Form-builder cards: the fields inside each element card (label / column, checkboxes,
 * numbers, submission buttons, ...) and each element type's default card config. Cards edit
 * their config object in place and call ``ctx.changed()``; serialisation to form YAML is in
 * formSerialization.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const formAnnotationTools_1 = __webpack_require__(/*! ./formAnnotationTools */ "./lib/config_builder/sections/formAnnotationTools.js");
const formSelectItems_1 = __webpack_require__(/*! ./formSelectItems */ "./lib/config_builder/sections/formSelectItems.js");
//
// Public
//
/** The card config a newly added element of ``type`` starts with. */
function defaultElementConfig(type) {
    switch (type) {
        case 'title': return { value: 'REVIEW' };
        case 'select': return { label: '', column: '', required: false, items: [] };
        case 'textbox': return { label: '', column: '', multiline: false };
        case 'checkbox': return { label: '', column: '' };
        case 'number': return { label: '', column: '', min: 0, max: 1, step: 0.1 };
        case 'annotation': return { tools: ['start_end_time_select'] };
        case 'pass_value': return { source_column: '', column: '' };
        case 'fixed_value': return { column: '', value: '' };
        case 'submission_buttons': return { show_icon: true, submit: true, next: false, previous: false };
        case 'break': return {};
        case 'line': return {};
        case 'text': return { value: '' };
        default: return {};
    }
}
exports.defaultElementConfig = defaultElementConfig;
/**
 * Add the fields for an element of ``type`` to ``card``; they edit ``cfg`` in place.
 *
 * @param ctx - The owning section's hooks.
 * @param card - The card element.
 * @param type - Element type.
 * @param cfg - The element's card config.
 */
function buildElementFields(ctx, card, type, cfg) {
    switch (type) {
        case 'title':
            _addField(ctx, card, cfg, 'value', 'title text', '200px');
            _addCheckboxField(ctx, card, cfg, 'progress_tracker', 'progress_tracker');
            break;
        case 'select':
            _addLabelColumnFields(ctx, card, cfg);
            _addCheckboxField(ctx, card, cfg, 'required', 'required');
            (0, formSelectItems_1.addSelectItemsBuilder)(ctx, card, cfg);
            break;
        case 'textbox':
            _addLabelColumnFields(ctx, card, cfg);
            _addCheckboxField(ctx, card, cfg, 'multiline', 'multiline');
            break;
        case 'checkbox':
            _addLabelColumnFields(ctx, card, cfg);
            _addField(ctx, card, cfg, 'checked_value', 'checked_value', '100px');
            _addField(ctx, card, cfg, 'unchecked_value', 'unchecked_value', '100px');
            _addField(ctx, card, cfg, 'checked_form', 'checked_form', '150px');
            _addField(ctx, card, cfg, 'unchecked_form', 'unchecked_form', '150px');
            break;
        case 'number':
            _addLabelColumnFields(ctx, card, cfg);
            _addNumField(ctx, card, cfg, 'min', 'min', '60px');
            _addNumField(ctx, card, cfg, 'max', 'max', '60px');
            _addNumField(ctx, card, cfg, 'step', 'step', '60px');
            break;
        case 'annotation': {
            (0, formAnnotationTools_1.buildAnnotationToolList)(ctx, card, cfg);
            _addField(ctx, card, cfg, 'start_time_col', 'start_time col', '120px');
            _addField(ctx, card, cfg, 'end_time_col', 'end_time col', '120px');
            _addField(ctx, card, cfg, 'min_freq_col', 'min_freq col', '120px');
            _addField(ctx, card, cfg, 'max_freq_col', 'max_freq col', '120px');
            _addField(ctx, card, cfg, 'form', 'form (dynamic)', '150px');
            break;
        }
        case 'pass_value':
            _addField(ctx, card, cfg, 'source_column', 'source_column', '150px');
            _addField(ctx, card, cfg, 'column', 'column', '150px');
            break;
        case 'fixed_value':
            _addField(ctx, card, cfg, 'column', 'column', '150px');
            _addField(ctx, card, cfg, 'value', 'value', '150px');
            break;
        case 'submission_buttons': {
            _addCheckboxField(ctx, card, cfg, 'line', 'line divider');
            _addCheckboxField(ctx, card, cfg, 'show_icon', 'show icon');
            _addInlineButtonField(ctx, card, cfg, 'previous', 'previous btn');
            _addInlineButtonField(ctx, card, cfg, 'next', 'next btn');
            _addInlineButtonField(ctx, card, cfg, 'submit', 'submit btn');
            break;
        }
        case 'text': {
            const ta = document.createElement('textarea');
            ta.rows = 2;
            ta.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:4px 8px;` +
                    `font-size:12px;width:250px;resize:vertical;font-family:inherit;box-sizing:border-box;`;
            if (cfg.value != null)
                ta.value = String(cfg.value);
            ta.addEventListener('input', () => {
                cfg.value = ta.value;
                ctx.changed();
            });
            card.appendChild(ctx.fieldRow('text', ta));
            break;
        }
        case 'break':
        case 'line':
            break;
    }
}
exports.buildElementFields = buildElementFields;
//
// Internal
//
/** label + column inputs; the column follows the label (slugified) until edited. */
function _addLabelColumnFields(ctx, card, cfg) {
    const labelInp = (0, dom_1.makeInput)('label', '150px');
    if (cfg.label != null)
        labelInp.value = String(cfg.label);
    const colInp = (0, dom_1.makeInput)('column', '150px');
    if (cfg.column != null)
        colInp.value = String(cfg.column);
    const userEditedCol = { value: !!cfg.column };
    labelInp.addEventListener('input', () => {
        cfg.label = labelInp.value;
        if (!userEditedCol.value) {
            const snake = (0, util_1.slugify)(labelInp.value.trim());
            colInp.value = snake;
            cfg.column = snake;
        }
        ctx.changed();
    });
    colInp.addEventListener('input', () => {
        userEditedCol.value = !!colInp.value;
        cfg.column = colInp.value;
        ctx.changed();
    });
    card.appendChild(ctx.fieldRow('label', labelInp));
    card.appendChild(ctx.fieldRow('column', colInp));
}
function _addField(ctx, card, cfg, key, label, width) {
    const inp = (0, dom_1.makeInput)(label, width);
    if (cfg[key] !== undefined && cfg[key] !== null)
        inp.value = String(cfg[key]);
    inp.addEventListener('input', () => {
        cfg[key] = inp.value;
        ctx.changed();
    });
    card.appendChild(ctx.fieldRow(label, inp));
}
function _addNumField(ctx, card, cfg, key, label, width) {
    const inp = (0, dom_1.makeInput)('', width);
    inp.type = 'number';
    inp.step = 'any';
    if (cfg[key] !== undefined)
        inp.value = String(cfg[key]);
    inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        cfg[key] = isNaN(v) ? undefined : v;
        ctx.changed();
    });
    card.appendChild(ctx.fieldRow(label, inp));
}
function _addCheckboxField(ctx, card, cfg, key, label) {
    const { row, input } = ctx.checkbox(label, !!cfg[key]);
    input.addEventListener('change', () => {
        cfg[key] = input.checked;
        ctx.changed();
    });
    card.appendChild(row);
}
/** A submission button toggle with an optional custom label (typing enables it). */
function _addInlineButtonField(ctx, card, cfg, key, label) {
    var _a;
    const row = (0, dom_1.makeRow)();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cssText = `accent-color:${styles_1.COLORS.blue};margin-right:6px;`;
    // Use existing value if defined, otherwise use defaults from _defaultConfig
    if (cfg[key] === undefined) {
        const defaults = defaultElementConfig('submission_buttons');
        cfg[key] = (_a = defaults[key]) !== null && _a !== void 0 ? _a : false;
    }
    checkbox.checked = !!cfg[key];
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;margin-left:-7px;width:70px;`;
    const textInput = (0, dom_1.makeInput)(`custom ${label.replace(' btn', '')} label`, '140px');
    textInput.style.fontSize = '11px';
    const labelKey = `${key}_label`;
    if (cfg[labelKey])
        textInput.value = cfg[labelKey];
    // Update text input enabled state
    const updateTextInputState = () => {
        textInput.disabled = !checkbox.checked;
        textInput.style.opacity = checkbox.checked ? '1' : '0.5';
        textInput.style.backgroundColor = checkbox.checked ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgSurface1;
    };
    updateTextInputState();
    // Checkbox change handler
    checkbox.addEventListener('change', () => {
        cfg[key] = checkbox.checked;
        updateTextInputState();
        ctx.changed();
    });
    // Text input change handler
    textInput.addEventListener('input', () => {
        cfg[labelKey] = textInput.value;
        // Auto-check checkbox if user types in text field
        if (textInput.value && !checkbox.checked) {
            checkbox.checked = true;
            cfg[key] = true;
            updateTextInputState();
        }
        ctx.changed();
    });
    row.append(checkbox, labelSpan, textInput);
    card.appendChild(row);
}


/***/ },

/***/ "./lib/config_builder/sections/formSelectItems.js"
/*!********************************************************!*\
  !*** ./lib/config_builder/sections/formSelectItems.js ***!
  \********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.addSelectItemsBuilder = void 0;
/**
 * The select card's "Items source" builder: add items one by one, paste values, read them from
 * a file (value / label columns, filter box, custom value, not-available option) or a numeric
 * range.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
const dom_1 = __webpack_require__(/*! ../dom */ "./lib/config_builder/dom.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/config_builder/text.js");
//
// Public
//
/**
 * Add the "Items source" picker to a select card; the chosen mode's editor writes
 * ``cfg.items`` (a list, ``{path, value, label, ...}`` or ``{min, max, step}``).
 *
 * @param ctx - The owning section's hooks.
 * @param card - The select card.
 * @param cfg - The select's card config.
 */
function addSelectItemsBuilder(ctx, card, cfg) {
    const itemsArea = document.createElement('div');
    itemsArea.style.cssText =
        `display:flex;flex-direction:column;gap:4px;padding:4px 0;` +
            `border-top:1px solid ${styles_1.COLORS.bgSurface1};margin-top:4px;`;
    const modeLabel = document.createElement('span');
    modeLabel.textContent = 'Items source:';
    modeLabel.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;`;
    itemsArea.appendChild(modeLabel);
    const modeSel = (0, dom_1.makeSelect)(['add items', 'from file', 'paste values', 'range'], 'add items');
    itemsArea.appendChild(modeSel);
    const itemsContent = document.createElement('div');
    itemsContent.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    itemsArea.appendChild(itemsContent);
    const detectMode = () => {
        const items = cfg.items;
        if (items && typeof items === 'object' && !Array.isArray(items)) {
            if ('path' in items)
                return 'from file';
            if ('max' in items)
                return 'range';
        }
        return 'add items';
    };
    const mode = detectMode();
    modeSel.value = mode;
    const buildForMode = (m) => {
        itemsContent.innerHTML = '';
        if (m === 'add items') {
            _buildAddItems(ctx, itemsContent, cfg);
        }
        else if (m === 'from file') {
            _buildFileItems(ctx, itemsContent, cfg);
        }
        else if (m === 'paste values') {
            _buildPasteValues(ctx, itemsContent, cfg);
        }
        else {
            _buildRangeItems(ctx, itemsContent, cfg);
        }
    };
    buildForMode(mode);
    modeSel.addEventListener('change', () => buildForMode(modeSel.value));
    card.appendChild(itemsArea);
}
exports.addSelectItemsBuilder = addSelectItemsBuilder;
//
// Internal
//
function _buildAddItems(ctx, container, cfg) {
    if (!Array.isArray(cfg.items))
        cfg.items = [];
    const listEl = document.createElement('div');
    listEl.style.cssText = `display:flex;flex-direction:column;gap:2px;max-height:150px;overflow-y:auto;`;
    const renderList = () => {
        listEl.innerHTML = '';
        if (!Array.isArray(cfg.items) || cfg.items.length === 0) {
            const empty = document.createElement('span');
            empty.textContent = '(no items)';
            empty.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;font-style:italic;`;
            listEl.appendChild(empty);
            return;
        }
        for (let i = 0; i < cfg.items.length; i++) {
            const it = cfg.items[i];
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:4px;font-size:11px;`;
            const txt = document.createElement('span');
            txt.style.cssText = `flex:1;color:${styles_1.COLORS.textPrimary};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
            if (typeof it === 'string') {
                txt.textContent = it;
            }
            else if (it && typeof it === 'object') {
                const parts = [];
                if (it.label)
                    parts.push(it.label);
                if (it.value && it.value !== it.label)
                    parts.push(`= ${it.value}`);
                if (it.form)
                    parts.push(`→ ${it.form}`);
                txt.textContent = parts.join(' ');
            }
            const rm = (0, dom_1.makeButton)('✕');
            rm.style.cssText += `font-size:9px;padding:1px 4px;color:${styles_1.COLORS.red};`;
            rm.addEventListener('click', () => {
                cfg.items.splice(i, 1);
                renderList();
                ctx.changed();
            });
            row.append(txt, rm);
            listEl.appendChild(row);
        }
    };
    renderList();
    container.appendChild(listEl);
    const addRow = document.createElement('div');
    addRow.style.cssText = `display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;`;
    const labelInp = (0, dom_1.makeInput)('label', '90px');
    const valueInp = (0, dom_1.makeInput)('value', '90px');
    const formInp = (0, dom_1.makeInput)('form (opt)', '90px');
    const addBtn = (0, dom_1.makeButton)('+ Add');
    addBtn.style.fontSize = '11px';
    addBtn.addEventListener('click', () => {
        const label = labelInp.value.trim();
        const value = valueInp.value.trim();
        const form = formInp.value.trim();
        if (!label && !value)
            return;
        if (!Array.isArray(cfg.items))
            cfg.items = [];
        const item = {};
        if (label)
            item.label = label;
        if (value)
            item.value = value;
        else if (label)
            item.value = label;
        if (form)
            item.form = form;
        if (!item.label && item.value && !form) {
            cfg.items.push(item.value);
        }
        else {
            if (!item.label)
                item.label = item.value;
            cfg.items.push(item);
        }
        labelInp.value = '';
        valueInp.value = '';
        formInp.value = '';
        renderList();
        ctx.changed();
    });
    addRow.append(labelInp, valueInp, formInp, addBtn);
    container.appendChild(addRow);
    const hint = document.createElement('span');
    hint.textContent = text_1.FORM_ADD_ITEMS_HINT;
    hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;`;
    container.appendChild(hint);
}
function _buildPasteValues(ctx, container, cfg) {
    const sepRow = document.createElement('div');
    sepRow.style.cssText = `display:flex;align-items:center;gap:6px;`;
    const lineDelimCb = document.createElement('input');
    lineDelimCb.type = 'checkbox';
    lineDelimCb.style.cssText = `accent-color:${styles_1.COLORS.blue};`;
    const lineLabel = document.createElement('label');
    lineLabel.style.cssText = `display:flex;align-items:center;gap:4px;color:${styles_1.COLORS.textSubtle};font-size:11px;cursor:pointer;`;
    lineLabel.textContent = 'line delimited';
    lineLabel.prepend(lineDelimCb);
    const sepLabel = document.createElement('span');
    sepLabel.textContent = 'separator:';
    sepLabel.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;`;
    const sepInp = (0, dom_1.makeInput)(',', '40px');
    sepInp.style.fontSize = '11px';
    sepRow.append(sepLabel, sepInp, lineLabel);
    container.appendChild(sepRow);
    const textarea = document.createElement('textarea');
    textarea.style.cssText =
        `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
            `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:4px 8px;` +
            `font-size:11px;width:250px;height:60px;resize:vertical;font-family:monospace;`;
    textarea.placeholder = 'yes, no, maybe';
    if (Array.isArray(cfg.items)) {
        textarea.value = cfg.items.map((it) => {
            if (typeof it === 'string')
                return it;
            if (it && it.label)
                return it.label;
            return String(it);
        }).join(', ');
    }
    const parse = () => {
        const raw = textarea.value;
        const sep = lineDelimCb.checked ? '\n' : (sepInp.value || ',');
        const tokens = raw.split(sep);
        cfg.items = tokens.map(t => t.trim()).filter(Boolean);
        ctx.changed();
    };
    textarea.addEventListener('input', parse);
    sepInp.addEventListener('input', parse);
    lineDelimCb.addEventListener('change', () => {
        sepInp.disabled = lineDelimCb.checked;
        sepInp.style.opacity = lineDelimCb.checked ? '0.4' : '1';
        parse();
    });
    container.appendChild(textarea);
}
/** ``items: {path, value, label}`` from a data file, with column pickers once loaded. */
function _buildFileItems(ctx, container, cfg) {
    var _a, _b, _c, _d, _e;
    const pathRow = (0, dom_1.makeRow)();
    pathRow.appendChild((0, dom_1.makeLabel)('file path'));
    const pathInp = (0, dom_1.makeInput)('data/categories.csv', '160px');
    if (cfg.items && typeof cfg.items === 'object' && !Array.isArray(cfg.items) && cfg.items.path) {
        pathInp.value = cfg.items.path;
    }
    const valSel = (0, dom_1.makeSelect)([], '');
    valSel.style.width = '150px';
    valSel.style.display = 'none';
    valSel.addEventListener('change', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.value = valSel.value;
        ctx.changed();
    });
    const valInput = (0, dom_1.makeInput)('value column', '150px');
    if ((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.value)
        valInput.value = cfg.items.value;
    valInput.addEventListener('input', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.value = valInput.value.trim();
        ctx.changed();
    });
    const lblSel = (0, dom_1.makeSelect)(['(none)'], '');
    lblSel.style.width = '150px';
    lblSel.style.display = 'none';
    lblSel.addEventListener('change', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.label = lblSel.value || undefined;
        ctx.changed();
    });
    const lblInput = (0, dom_1.makeInput)('label column (optional)', '150px');
    if ((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.label)
        lblInput.value = cfg.items.label;
    lblInput.addEventListener('input', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.label = lblInput.value.trim() || undefined;
        ctx.changed();
    });
    const populateSelects = (cols) => {
        var _a, _b;
        (0, dom_1.fillSelect)(valSel, cols);
        (0, dom_1.fillSelect)(lblSel, cols, '(none)');
        const pendingVal = valInput.value.trim();
        if (pendingVal && cols.includes(pendingVal))
            valSel.value = pendingVal;
        else if (((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.value) && cols.includes(cfg.items.value))
            valSel.value = cfg.items.value;
        const pendingLbl = lblInput.value.trim();
        if (pendingLbl && cols.includes(pendingLbl))
            lblSel.value = pendingLbl;
        else if (((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.label) && cols.includes(cfg.items.label))
            lblSel.value = cfg.items.label;
        valInput.style.display = 'none';
        valSel.style.display = '';
        lblInput.style.display = 'none';
        lblSel.style.display = '';
    };
    const revertToText = () => {
        valSel.style.display = 'none';
        valInput.style.display = '';
        valInput.value = valSel.value || valInput.value;
        lblSel.style.display = 'none';
        lblInput.style.display = '';
        lblInput.value = lblSel.value || lblInput.value;
    };
    const loadCols = (path) => {
        if (path && constants_1.DATA_FILE_RE.test(path)) {
            ctx.requestColumns(path, populateSelects);
        }
        else {
            revertToText();
        }
    };
    pathInp.addEventListener('input', () => {
        if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items))
            cfg.items = {};
        cfg.items.path = pathInp.value;
        ctx.changed();
    });
    pathInp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter')
            return;
        loadCols(pathInp.value.trim());
    });
    const browseBtn = (0, dom_1.makeButton)('Browse');
    browseBtn.addEventListener('click', () => {
        ctx.browse((path) => {
            pathInp.value = path;
            if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items))
                cfg.items = {};
            cfg.items.path = path;
            ctx.changed();
            loadCols(path);
        });
    });
    pathRow.append(pathInp, browseBtn);
    container.appendChild(pathRow);
    const hintStyle = `color:${styles_1.COLORS.textSubtle};font-size:12px;white-space:nowrap;`;
    const valRow = (0, dom_1.makeRow)();
    valRow.appendChild((0, dom_1.makeLabel)('value column'));
    valRow.append(valInput, valSel);
    const valHint = document.createElement('span');
    valHint.style.cssText = hintStyle;
    valHint.textContent = '| source column whose value is written to output dataset';
    valRow.appendChild(valHint);
    container.appendChild(valRow);
    const lblRow = (0, dom_1.makeRow)();
    lblRow.appendChild((0, dom_1.makeLabel)('label column'));
    lblRow.append(lblInput, lblSel);
    const lblHint = document.createElement('span');
    lblHint.style.cssText = hintStyle;
    lblHint.textContent = '| source column whose value is shown in dropdown (defaults to value column)';
    lblRow.appendChild(lblHint);
    container.appendChild(lblRow);
    if (pathInp.value)
        loadCols(pathInp.value);
    const { row: fbRow, input: fbCb } = ctx.checkbox('filter_box', !!((_c = cfg.items) === null || _c === void 0 ? void 0 : _c.filter_box));
    fbCb.addEventListener('change', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.filter_box = fbCb.checked;
        ctx.changed();
    });
    container.appendChild(fbRow);
    const { row: cvRow, input: cvCb } = ctx.checkbox('custom_value', !!((_d = cfg.items) === null || _d === void 0 ? void 0 : _d.custom_value));
    cvCb.addEventListener('change', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        cfg.items.custom_value = cvCb.checked;
        ctx.changed();
    });
    container.appendChild(cvRow);
    const naRow = (0, dom_1.makeRow)();
    const naCb = document.createElement('input');
    naCb.type = 'checkbox';
    naCb.style.cssText = `accent-color:${styles_1.COLORS.blue};margin-right:6px;`;
    const naVal = (_e = cfg.items) === null || _e === void 0 ? void 0 : _e.not_available;
    naCb.checked = !!naVal;
    const naLabel = document.createElement('span');
    naLabel.textContent = 'not_available';
    naLabel.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;width:90px;`;
    const naTextInput = (0, dom_1.makeInput)('custom label', '140px');
    naTextInput.style.fontSize = '11px';
    if (typeof naVal === 'string')
        naTextInput.value = naVal;
    const updateNaTextState = () => {
        naTextInput.disabled = !naCb.checked;
        naTextInput.style.opacity = naCb.checked ? '1' : '0.5';
        naTextInput.style.backgroundColor = naCb.checked ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgSurface1;
    };
    updateNaTextState();
    naCb.addEventListener('change', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        if (naCb.checked) {
            const label = naTextInput.value.trim();
            cfg.items.not_available = label || true;
        }
        else {
            delete cfg.items.not_available;
        }
        updateNaTextState();
        ctx.changed();
    });
    naTextInput.addEventListener('input', () => {
        if (!cfg.items || typeof cfg.items !== 'object')
            cfg.items = {};
        const label = naTextInput.value.trim();
        if (label && !naCb.checked) {
            naCb.checked = true;
            updateNaTextState();
        }
        cfg.items.not_available = label || true;
        ctx.changed();
    });
    naRow.append(naCb, naLabel, naTextInput);
    container.appendChild(naRow);
}
function _buildRangeItems(ctx, container, cfg) {
    var _a, _b, _c;
    const minInp = (0, dom_1.makeInput)('1', '60px');
    minInp.type = 'number';
    const maxInp = (0, dom_1.makeInput)('10', '60px');
    maxInp.type = 'number';
    const stepInp = (0, dom_1.makeInput)('1', '60px');
    stepInp.type = 'number';
    if (((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.min) !== undefined)
        minInp.value = String(cfg.items.min);
    if (((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.max) !== undefined)
        maxInp.value = String(cfg.items.max);
    if (((_c = cfg.items) === null || _c === void 0 ? void 0 : _c.step) !== undefined)
        stepInp.value = String(cfg.items.step);
    const update = () => {
        cfg.items = {
            min: (0, util_1.numberOr)(minInp.value, 1),
            max: (0, util_1.numberOr)(maxInp.value, 10),
            step: (0, util_1.numberOr)(stepInp.value, 1) > 0 ? (0, util_1.numberOr)(stepInp.value, 1) : 1,
        };
        ctx.changed();
    };
    minInp.addEventListener('input', update);
    maxInp.addEventListener('input', update);
    stepInp.addEventListener('input', update);
    const row = (0, dom_1.makeRow)();
    row.append((0, dom_1.makeLabel)('min'), minInp, (0, dom_1.makeLabel)('max'), maxInp, (0, dom_1.makeLabel)('step'), stepInp);
    container.appendChild(row);
}


/***/ },

/***/ "./lib/config_builder/sections/sourceValue.js"
/*!****************************************************!*\
  !*** ./lib/config_builder/sections/sourceValue.js ***!
  \****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setStatusBadge = exports.makeStatusBadge = exports.autoDetectSourceType = void 0;
/**
 * Helpers shared by the Data and Audio sections' "source_type + value" fields: switching the
 * source type from the typed value, and the ✓ / ✗ badge next to the value.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
//
// Public
//
/**
 * Drive ``source_type`` from the value: a remote scheme (``https://``, ``s3://``, ...) selects
 * ``remoteType``, anything else ``path``. Only switches between those two value-detectable
 * types — a deliberate choice of any other type (sql, api, column) is left alone.
 *
 * @param select - The source_type dropdown.
 * @param value - The current value text.
 * @param remoteType - The option meaning "remote" (``url`` for data, ``url/uri`` for audio).
 * @returns Whether the dropdown was changed.
 */
function autoDetectSourceType(select, value, remoteType) {
    const type = select.value;
    if (type !== 'path' && type !== remoteType)
        return false;
    const val = value.trim();
    if (!val)
        return false;
    const detected = constants_1.REMOTE_SCHEME_RE.test(val) ? remoteType : 'path';
    if (detected === type)
        return false;
    select.value = detected;
    return true;
}
exports.autoDetectSourceType = autoDetectSourceType;
/** A hidden ✓ / ✗ badge (see ``setStatusBadge``). */
function makeStatusBadge() {
    const badge = document.createElement('span');
    badge.style.cssText = `font-size:14px;font-weight:700;display:none;`;
    return badge;
}
exports.makeStatusBadge = makeStatusBadge;
/**
 * Show ✓ (``ok``) or ✗ (failed) with a tooltip, or hide the badge (``null``).
 *
 * @param badge - Badge from ``makeStatusBadge``.
 * @param ok - Result, or null to clear.
 * @param okTitle - Tooltip for ✓.
 * @param failTitle - Tooltip for ✗.
 */
function setStatusBadge(badge, ok, okTitle, failTitle) {
    if (ok === null) {
        badge.style.display = 'none';
        return;
    }
    badge.style.display = '';
    badge.textContent = ok ? '✓' : '✗';
    badge.style.color = ok ? styles_1.COLORS.green : styles_1.COLORS.red;
    badge.title = ok ? okTitle : failTitle;
}
exports.setStatusBadge = setStatusBadge;


/***/ },

/***/ "./lib/config_builder/sections/templateAnalysis.js"
/*!*********************************************************!*\
  !*** ./lib/config_builder/sections/templateAnalysis.js ***!
  \*********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.normalizeElementSpec = exports.placeholderKey = exports.analyzeTemplate = exports.SCOPE_SECTIONS = void 0;
/**
 * Placeholder analysis for "Create from Template" (pure, no DOM).
 *
 * A template's ``configuration`` holds ``__placeholder__`` strings; where each one sits decides
 * the widget TemplateForm shows for it (a scoped positional inference):
 *  - a ``*.source_type`` placeholder -> a source-type dropdown;
 *  - ``data.value`` / ``audio.value`` -> a value whose widget follows its source type;
 *  - an index / select column -> a column picker fed by the data (or items) file;
 *  - a source path -> text + Browse; everything else -> plain text.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const constants_1 = __webpack_require__(/*! ../constants */ "./lib/config_builder/constants.js");
//
// Constants
//
/** The template sections each "create" scope fills in. */
exports.SCOPE_SECTIONS = {
    project: ['project', 'config', 'form'],
    config: ['config', 'form'],
    form: ['form'],
};
const PLACEHOLDER_RE = /^__([a-zA-Z0-9_]+)__$/;
//
// Public
//
/**
 * A descriptor per placeholder in the sections ``scope`` creates.
 *
 * @param template - The parsed template (``load_template`` reply).
 * @param scope - ``project`` / ``config`` / ``form``.
 */
function analyzeTemplate(template, scope) {
    var _a, _b;
    const map = new Map();
    const dataProvider = _findDataProvider(template);
    for (const section of (_a = exports.SCOPE_SECTIONS[scope]) !== null && _a !== void 0 ? _a : []) {
        const cfg = (_b = template[section]) === null || _b === void 0 ? void 0 : _b.configuration;
        if (cfg && typeof cfg === 'object')
            _walk(cfg, [], map, dataProvider);
    }
    return map;
}
exports.analyzeTemplate = analyzeTemplate;
/**
 * The key of a ``__key__`` placeholder string, or ``''``.
 *
 * @param v - Any configuration value.
 */
function placeholderKey(v) {
    if (typeof v !== 'string')
        return '';
    const m = v.match(PLACEHOLDER_RE);
    return m ? m[1] : '';
}
exports.placeholderKey = placeholderKey;
/**
 * Normalise a ``builder_elements`` spec: an object (``{required, default, label,
 * description}``), ``true`` / ``false`` (required or not), or a bare default value.
 */
function normalizeElementSpec(spec) {
    var _a;
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
        const s = spec;
        return {
            required: !!s.required,
            default: (_a = s.default) !== null && _a !== void 0 ? _a : null,
            label: s.label,
            description: s.description,
        };
    }
    if (spec === true)
        return { required: true, default: null };
    if (spec === false)
        return { required: false, default: null };
    return { required: false, default: spec };
}
exports.normalizeElementSpec = normalizeElementSpec;
//
// Internal
//
/** The placeholder holding the project's data file (feeds the column pickers). */
function _findDataProvider(template) {
    var _a, _b;
    const data = (_b = (_a = template === null || template === void 0 ? void 0 : template['project']) === null || _a === void 0 ? void 0 : _a.configuration) === null || _b === void 0 ? void 0 : _b.data;
    if (!data || typeof data !== 'object')
        return undefined;
    return placeholderKey(data.value) || placeholderKey(data.path) || undefined;
}
function _walk(node, path, map, dataProvider) {
    if (Array.isArray(node)) {
        for (const item of node)
            _walk(item, path, map, dataProvider);
        return;
    }
    if (!node || typeof node !== 'object')
        return;
    const tail = path[path.length - 1];
    for (const [k, v] of Object.entries(node)) {
        const key = typeof v === 'string' ? placeholderKey(v) : '';
        if (key) {
            map.set(key, _classify(tail, k, node, dataProvider));
        }
        else {
            _walk(v, [...path, k], map, dataProvider);
        }
    }
}
/** The descriptor for placeholder ``key`` inside ``parent``, whose own key is ``tail``. */
function _classify(tail, key, parent, dataProvider) {
    const stMeta = {
        sourceTypeKey: placeholderKey(parent.source_type) || undefined,
        literalSourceType: (typeof parent.source_type === 'string' && !placeholderKey(parent.source_type))
            ? parent.source_type : undefined,
    };
    if (tail === 'data') {
        if (key === 'source_type')
            return { role: 'source_type', section: 'data' };
        if (key === 'path')
            return { role: 'pathfile', exts: constants_1.DATA_EXTS };
        if (key === 'value')
            return Object.assign({ role: 'value', section: 'data', exts: constants_1.DATA_EXTS }, stMeta);
        if (key === 'index_column')
            return { role: 'column', providerKey: dataProvider };
    }
    else if (tail === 'audio') {
        if (key === 'source_type')
            return { role: 'source_type', section: 'audio' };
        if (key === 'column')
            return { role: 'column', providerKey: dataProvider };
        if (key === 'value') {
            return Object.assign({ role: 'value', section: 'audio', exts: constants_1.AUDIO_EXTS, providerKey: dataProvider }, stMeta);
        }
    }
    else if (tail === 'output') {
        if (key === 'path')
            return { role: 'pathfile', exts: constants_1.OUTPUT_EXTS };
    }
    else if (tail === 'items') {
        if (key === 'path')
            return { role: 'pathfile', exts: constants_1.DATA_EXTS };
        if (key === 'value')
            return { role: 'column', providerKey: placeholderKey(parent.path) || undefined };
    }
    if (key === 'source_type')
        return { role: 'source_type', section: 'data' };
    return { role: 'plain' };
}


/***/ },

/***/ "./lib/config_builder/statusLine.js"
/*!******************************************!*\
  !*** ./lib/config_builder/statusLine.js ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatusLine = void 0;
/**
 * The builder's one-line status message (shown in the widget header).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
//
// Public
//
class StatusLine {
    constructor() {
        this.element = document.createElement('span');
        this.element.style.cssText =
            `font-size:11px;color:${styles_1.COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    }
    /**
     * Show ``msg``.
     *
     * @param msg - Message text.
     * @param level - ``ok`` (green), ``warning`` (yellow) or ``error`` (red).
     */
    set(msg, level = 'ok') {
        this.element.textContent = msg;
        this.element.style.color =
            level === 'error' ? styles_1.COLORS.red : level === 'warning' ? styles_1.COLORS.yellow : styles_1.COLORS.green;
    }
}
exports.StatusLine = StatusLine;


/***/ },

/***/ "./lib/config_builder/text.js"
/*!************************************!*\
  !*** ./lib/config_builder/text.js ***!
  \************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SETUP_TAB_HELP = exports.SECRETS_HINT = exports.FORM_ADD_ITEMS_HINT = exports.FORM_ADD_HINT = exports.CONFIG_FILES_HELP = void 0;
/**
 * Centralized user-facing copy for the config-builder UI.
 *
 * Keep wording here (rather than inline in the section code) so it can be
 * edited without touching component logic. Values are HTML strings (rendered
 * via innerHTML) or plain text as noted.
 *
 * License: BSD 3-Clause
 */
//
// Constants
//
/** Configuration Files section — explains the per-file controls (HTML). */
exports.CONFIG_FILES_HELP = `A project is saved as up to three files — <b>project</b>, <b>config</b>, and <b>form</b>. ` +
    `Use the controls below to manage them:` +
    `<ul style="margin:4px 0 0 0;padding-left:16px;">` +
    `<li><b>Duplicate</b> — unlock the paths to save under new filenames. Saving creates copies ` +
    `of the existing files (leaving the original files untouched).</li>` +
    `<li><b>Linked</b> — keep all three filenames in sync from one name; unlink to set each path ` +
    `independently.</li>` +
    `<li><b>Lock</b> (per file) — fields for locked files are disabled, preventing unwanted changes. ` +
    `Note this also disables changing the "target" for the config-builder sections below.</li>` +
    `<li><b>Checkbox</b> — determines if that file is written as a separate file (checked) or ` +
    `inline to its parent (unchecked).</li>` +
    `</ul>`;
/** Inline hint under the form builder's add-element bar (plain text). */
exports.FORM_ADD_HINT = 'Click on the buttons below to add items to the form.';
/** Inline hint for the select "add items" builder (plain text). */
exports.FORM_ADD_ITEMS_HINT = 'Add items one at a time. Use form field to reference a dynamic form.';
/** Inline hint above the secrets editor (plain text). */
exports.SECRETS_HINT = 'Each entry is {key, value}. Value: env:VAR, dialog, or literal.';
/** Short blurb shown under the Setup tab bar for the active tab (plain text). */
exports.SETUP_TAB_HELP = {
    create: `Choose a name for a new project, then use the sections below to build a configuration for ` +
        `your BioacousticAnnotator.`,
    template: `Pick a project template and fill in a few fields to quickly create a new project. The ` +
        `configuration can be further customized using the sections below.`,
    load: `Load an existing configuration and edit it using the sections below.`,
};


/***/ },

/***/ "./lib/dialogs/launcherDialog.js"
/*!***************************************!*\
  !*** ./lib/dialogs/launcherDialog.js ***!
  \***************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.showLauncherDialog = void 0;
/**
 * The launcher chooser: three tiles (Notebook / Annotator / Config Builder) shown when the
 * "Bioacoustic Annotator" launcher item is clicked. Arrow keys move the focus, Enter picks,
 * Escape or a backdrop click closes.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const icons_1 = __webpack_require__(/*! ../icons */ "./lib/icons.js");
const modal_1 = __webpack_require__(/*! ../modal */ "./lib/modal.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/text.js");
//
// Constants
//
const ICON_SIZE = '40';
//
// Public
//
/** Show the launcher chooser; the picked tile's action runs after the dialog closes. */
function showLauncherDialog(actions) {
    const modal = (0, modal_1.createModal)({
        title: text_1.LAUNCHER.title,
        cardCss: `border-radius:12px;padding:24px 28px;gap:16px;min-width:340px;width:auto;` +
            `max-width:none;box-shadow:none;`,
        titleCss: `font-size:20px;text-align:center;`,
        zIndex: 10000,
    });
    const subtitle = document.createElement('div');
    subtitle.textContent = text_1.LAUNCHER.subtitle;
    subtitle.style.cssText =
        `font-size:14px;color:${styles_1.COLORS.textMuted};text-align:center;margin-top:-8px;`;
    const tileRow = document.createElement('div');
    tileRow.style.cssText = `display:flex;gap:12px;justify-content:center;`;
    const tiles = [];
    let focusedIdx = 0;
    const setFocused = (idx) => {
        focusedIdx = idx;
        tiles.forEach((t, i) => { t.style.borderColor = i === idx ? styles_1.COLORS.blue : styles_1.COLORS.bgSurface1; });
    };
    const tileSpecs = [
        [text_1.LAUNCHER.tiles.notebook, icons_1.notebookIconSvg, actions.onNotebook],
        [text_1.LAUNCHER.tiles.annotator, icons_1.bioacousticIconSvg, actions.onAnnotator],
        [text_1.LAUNCHER.tiles.builder, icons_1.builderIconSvg, actions.onConfigBuilder],
    ];
    for (const [text, iconSvg, onPick] of tileSpecs) {
        const tile = _makeTile(text.label, text.desc, iconSvg);
        tile.addEventListener('mouseenter', () => setFocused(tiles.indexOf(tile)));
        tile.addEventListener('click', () => { modal.close(); onPick(); });
        tiles.push(tile);
        tileRow.appendChild(tile);
    }
    setFocused(0);
    modal.card.append(subtitle, tileRow);
    modal.backdrop.tabIndex = -1;
    modal.backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            setFocused((focusedIdx + 1) % tiles.length);
        }
        else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setFocused((focusedIdx - 1 + tiles.length) % tiles.length);
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            tiles[focusedIdx].click();
        }
    });
    modal.backdrop.focus();
}
exports.showLauncherDialog = showLauncherDialog;
//
// Internal
//
/** One tile: icon, label and description (click handling is added by the caller). */
function _makeTile(label, desc, iconSvg) {
    var _a, _b;
    const tile = document.createElement('button');
    tile.style.cssText =
        `background:${styles_1.COLORS.bgMantle};border:2px solid ${styles_1.COLORS.bgSurface1};border-radius:8px;` +
            `padding:16px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;` +
            `cursor:pointer;flex:1;min-width:130px;transition:border-color 0.15s;outline:none;`;
    const icon = document.createElement('div');
    icon.innerHTML = iconSvg;
    icon.style.cssText = `width:40px;height:40px;color:${styles_1.COLORS.blue};`;
    (_a = icon.querySelector('svg')) === null || _a === void 0 ? void 0 : _a.setAttribute('width', ICON_SIZE);
    (_b = icon.querySelector('svg')) === null || _b === void 0 ? void 0 : _b.setAttribute('height', ICON_SIZE);
    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = `font-size:15px;font-weight:600;color:${styles_1.COLORS.textPrimary};`;
    const d = document.createElement('div');
    d.textContent = desc;
    d.style.cssText = `font-size:12px;color:${styles_1.COLORS.textMuted};text-align:center;line-height:1.4;`;
    tile.append(icon, lbl, d);
    return tile;
}


/***/ },

/***/ "./lib/dialogs/projectPicker.js"
/*!**************************************!*\
  !*** ./lib/dialogs/projectPicker.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.pickProjectFile = void 0;
const modal_1 = __webpack_require__(/*! ../modal */ "./lib/modal.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/text.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
//
// Constants
//
/** Folder (under the browser's cwd) the picker opens in when it exists. */
const PROJECTS_DIR = 'annotator_config/projects';
const PROJECT_FILE_RE = /\.(yaml|yml|json)$/;
const ROW_CSS = `padding:6px 0;cursor:pointer;border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`;
//
// Public
//
/**
 * Ask the user for a project file.
 *
 * @param browser - The default file browser (null: fall back to a plain text prompt).
 * @param defaultPath - The file browser's current directory (server-relative).
 * @returns The chosen path (server-relative, absolute or a remote URI), or '' if cancelled.
 */
async function pickProjectFile(browser, defaultPath) {
    if (!browser) {
        const path = await (0, modal_1.promptText)({ title: text_1.PROJECT_PICKER.title, label: 'Project file path (.yaml)' });
        return path !== null && path !== void 0 ? path : '';
    }
    const startPath = await _startDirectory(browser, defaultPath);
    return _showProjectFileDialog(browser, startPath, defaultPath);
}
exports.pickProjectFile = pickProjectFile;
//
// Internal
//
/** ``<cwd>/annotator_config/projects`` if that folder exists, else ``cwd``. */
async function _startDirectory(browser, cwd) {
    const projectsPath = cwd ? `${cwd}/${PROJECTS_DIR}` : PROJECTS_DIR;
    try {
        const contents = await browser.model.manager.services.contents.get(projectsPath);
        if (contents.type === 'directory')
            return projectsPath;
    }
    catch ( /* directory doesn't exist */_a) { /* directory doesn't exist */ }
    return cwd;
}
/**
 * Show the picker.
 *
 * @param browser - Used to list server directories.
 * @param initialPath - Directory listed first.
 * @param cwdPath - The file browser's directory: picked files under it are shown relative.
 */
function _showProjectFileDialog(browser, initialPath, cwdPath) {
    return new Promise(resolve => {
        // Enter selects even when focus left the input (e.g. after clicking a file row)
        const onEnter = (e) => {
            if (e.key === 'Enter' && pathInput.value.trim()) {
                e.preventDefault();
                onSelect();
            }
        };
        const modal = (0, modal_1.createModal)({
            title: text_1.PROJECT_PICKER.title,
            cardCss: `max-width:600px;max-height:500px;padding:0;gap:0;`,
            titleCss: `padding:16px 20px;font-size:16px;border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`,
            zIndex: 10000,
            onDismiss: () => { document.removeEventListener('keydown', onEnter); resolve(''); },
        });
        // ── Path input ──────────────────────────────────────────────
        const inputSection = _div(`padding:16px 20px;border-bottom:1px solid ${styles_1.COLORS.bgSurface0};background:${styles_1.COLORS.bgMantle};`);
        const inputLabel = _div(`margin-bottom:8px;font-size:13px;font-weight:500;color:${styles_1.COLORS.textSubtle};`, text_1.PROJECT_PICKER.pathLabel);
        const pathInput = document.createElement('input');
        pathInput.type = 'text';
        pathInput.placeholder = text_1.PROJECT_PICKER.pathPlaceholder;
        pathInput.style.cssText =
            (0, styles_1.inputStyle)('100%') + `padding:8px 12px;font-size:13px;font-family:monospace;`;
        const errorEl = _div(`display:none;margin-top:6px;font-size:12px;color:${styles_1.COLORS.red};`);
        inputSection.append(inputLabel, pathInput, errorEl);
        // ── File browser ────────────────────────────────────────────
        const browserSection = _div(`flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:200px;`);
        const browserLabel = _div(`padding:12px 20px;font-size:13px;font-weight:500;color:${styles_1.COLORS.textSubtle};` +
            `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};`, text_1.PROJECT_PICKER.browseLabel);
        const listing = _div(`flex:1;overflow:auto;padding:16px 20px;color:${styles_1.COLORS.textPrimary};`);
        browserSection.append(browserLabel, listing);
        // ── Buttons ─────────────────────────────────────────────────
        const finish = (path) => {
            document.removeEventListener('keydown', onEnter);
            modal.close();
            resolve(path);
        };
        let selectedFromBrowser = false;
        let currentBrowserPath = initialPath;
        const onSelect = () => {
            let finalPath = pathInput.value.trim();
            if (!finalPath) {
                errorEl.textContent = 'Please enter a file path or select a file.';
                errorEl.style.display = 'block';
                return;
            }
            // Only prepend the listed directory to typed relative paths: a file clicked in the
            // browser already carries its full path.
            if (!selectedFromBrowser && !finalPath.includes('://') && !finalPath.startsWith('/') &&
                currentBrowserPath) {
                finalPath = `${currentBrowserPath}/${finalPath}`.replace(/\/+/g, '/');
            }
            finish(finalPath);
        };
        const buttons = (0, modal_1.buttonRow)([
            { label: 'Cancel', onClick: () => finish('') },
            { label: 'Select', primary: true, onClick: onSelect },
        ]);
        buttons.style.cssText += `padding:16px 20px;margin-top:0;border-top:1px solid ${styles_1.COLORS.bgSurface0};`;
        modal.card.append(inputSection, browserSection, buttons);
        // ── Behaviour ───────────────────────────────────────────────
        /** Grey out the browser for remote URIs; hint the base dir for typed relative paths. */
        const updatePathContext = () => {
            const value = pathInput.value.trim();
            const isRemote = (0, util_1.remoteScheme)(value) !== null;
            browserSection.style.opacity = isRemote ? '0.4' : '1';
            browserSection.style.pointerEvents = isRemote ? 'none' : 'auto';
            browserLabel.textContent = isRemote
                ? text_1.PROJECT_PICKER.browseDisabledLabel : text_1.PROJECT_PICKER.browseLabel;
            browserLabel.style.color = isRemote ? styles_1.COLORS.textMuted : styles_1.COLORS.textSubtle;
            if (isRemote) {
                pathInput.placeholder = text_1.PROJECT_PICKER.remoteUriPlaceholder;
            }
            else if (value && !value.startsWith('/')) {
                pathInput.placeholder = `Current dir: ${currentBrowserPath}/`;
            }
            else {
                pathInput.placeholder = text_1.PROJECT_PICKER.pathPlaceholder;
            }
        };
        const openDir = (path) => {
            currentBrowserPath = path;
            void loadDir(path);
            updatePathContext();
        };
        const pickFile = (path) => {
            selectedFromBrowser = true;
            errorEl.style.display = 'none';
            pathInput.value = cwdPath && path.startsWith(cwdPath + '/')
                ? path.substring(cwdPath.length + 1)
                : path;
        };
        /** List ``path``: a ".." row, folders, and project files (others greyed out). */
        const loadDir = async (path) => {
            var _a;
            listing.replaceChildren(_div(`color:${styles_1.COLORS.textMuted};text-align:center;padding:20px;`, 'Loading...'));
            try {
                const contents = await browser.model.manager.services.contents.get(path);
                listing.replaceChildren();
                if (path !== '') {
                    const parent = _row('📁 ..', `color:${styles_1.COLORS.blue};`);
                    parent.onclick = () => openDir(path.split('/').slice(0, -1).join('/') || '');
                    listing.appendChild(parent);
                }
                for (const item of (_a = contents.content) !== null && _a !== void 0 ? _a : []) {
                    // server file names: text, never HTML
                    if (item.type === 'directory') {
                        const el = _row(`📁 ${item.name}`);
                        el.onclick = () => openDir(item.path);
                        listing.appendChild(el);
                    }
                    else if (PROJECT_FILE_RE.test(item.name.toLowerCase())) {
                        const el = _row(`📄 ${item.name}`);
                        el.onclick = () => pickFile(item.path);
                        el.ondblclick = () => { pickFile(item.path); onSelect(); };
                        el.onmouseover = () => { el.style.backgroundColor = styles_1.COLORS.bgHover; };
                        el.onmouseout = () => { el.style.backgroundColor = 'transparent'; };
                        listing.appendChild(el);
                    }
                    else {
                        listing.appendChild(_row(`📄 ${item.name}`, `color:${styles_1.COLORS.textMuted};cursor:default;`));
                    }
                }
            }
            catch (error) {
                listing.replaceChildren(_div(`color:${styles_1.COLORS.red};padding:20px;`, `Error loading directory: ${error}`));
            }
        };
        pathInput.addEventListener('input', () => {
            selectedFromBrowser = false;
            errorEl.style.display = 'none';
            updatePathContext();
        });
        document.addEventListener('keydown', onEnter);
        void loadDir(initialPath);
        updatePathContext();
        pathInput.focus();
    });
}
/** A ``<div>`` with inline CSS and optional text. */
function _div(css, text) {
    const el = document.createElement('div');
    el.style.cssText = css;
    if (text !== undefined)
        el.textContent = text;
    return el;
}
/** One row of the file listing. */
function _row(text, extraCss = '') {
    return _div(ROW_CSS + extraCss, text);
}


/***/ },

/***/ "./lib/icons.js"
/*!**********************!*\
  !*** ./lib/icons.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bioacousticIcon = exports.builderIcon = exports.builderIconSvg = exports.notebookIconSvg = exports.bioacousticIconSvg = void 0;
/**
 * SVG icons shared by the annotator and config-builder plugins (tab / launcher icons and the
 * launcher-dialog tiles): one copy of each.
 *
 * All icons are 24x24 line drawings using ``currentColor``, so they take the text color of
 * the element they are placed in.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const ui_components_1 = __webpack_require__(/*! @jupyterlab/ui-components */ "webpack/sharing/consume/default/@jupyterlab/ui-components");
//
// Constants
//
/** Waveform-in-a-circle: the annotator's icon. */
exports.bioacousticIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 12 C2 12 4 6 6 6 C8 6 8 18 10 18 C12 18 12 3 14 3 C16 3 16 21 18 21 C20 21 22 12 22 12"/>
  <circle cx="12" cy="12" r="11" stroke-width="1"/>
</svg>`;
/** Notebook page: the launcher dialog's "Notebook" tile. */
exports.notebookIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16v16H4z"/>
    <path d="M8 4v16"/>
    <line x1="12" y1="8" x2="18" y2="8"/>
    <line x1="12" y1="12" x2="18" y2="12"/>
    <line x1="12" y1="16" x2="16" y2="16"/>
  </svg>`;
/** Document with lines: the launcher dialog's "Config Builder" tile. */
exports.builderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>`;
/** The config builder icon as a JupyterLab ``LabIcon`` (palette, launcher). */
exports.builderIcon = new ui_components_1.LabIcon({
    name: 'jupyter-bioacoustic:config-builder-icon',
    svgstr: exports.builderIconSvg,
});
/** The annotator icon as a JupyterLab ``LabIcon`` (tabs, launcher, palette). */
exports.bioacousticIcon = new ui_components_1.LabIcon({
    name: 'jupyter-bioacoustic:icon',
    svgstr: exports.bioacousticIconSvg,
});


/***/ },

/***/ "./lib/index.js"
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
/**
 * Extension entry point: JupyterLab loads the default export, the list of plugins
 * (the annotator and the config builder).
 *
 * License: BSD 3-Clause
 */
const plugin_1 = __webpack_require__(/*! ./plugin */ "./lib/plugin.js");
const config_builder_1 = __webpack_require__(/*! ./config_builder */ "./lib/config_builder/index.js");
exports["default"] = [plugin_1.bioacousticPlugin, config_builder_1.configBuilderPlugin];


/***/ },

/***/ "./lib/infoPanel.js"
/*!**************************!*\
  !*** ./lib/infoPanel.js ***!
  \**************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.infoPanelHtml = exports.INFO_ICON_OPEN = exports.INFO_ICON_CLOSED = void 0;
/**
 * The annotator's collapsible "info" panel (ⓘ in the header): where the data, audio and
 * output come from, which config files were loaded, and links to the docs.
 *
 * Every value shown comes from config / data, so it is HTML-escaped before going into
 * ``innerHTML``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
//
// Constants
//
const SITE_URL = 'https://schmidtdse.github.io/jupyter_bioacoustic';
const WIKI_URL = 'https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki';
const DATA_SOURCE_KEYS = ['path', 'url', 'uri', 'sql', 'api'];
const ITEM_CSS = 'margin-bottom:4px;';
const INDENT = '&nbsp;&nbsp;&nbsp;&nbsp;';
/** The ⓘ toggle's content while the panel is closed (outline icon). */
exports.INFO_ICON_CLOSED = `&#9432;`;
/** The ⓘ toggle's content while the panel is open (white filled circle with a black i). */
exports.INFO_ICON_OPEN = `<span style="
        display:inline-block;
        width:14px;
        height:14px;
        border-radius:50%;
        background:white;
        color:black;
        text-align:center;
        line-height:14px;
        font-size:10px;
        font-weight:bold;
      ">i</span>`;
//
// Public
//
/** The info panel's inner HTML for ``ctx`` (all values escaped). */
function infoPanelHtml(ctx) {
    const { cfg } = ctx;
    return `
      <div style="font-family:monospace;">
        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Data Sources & Output</div>
        <div style="${ITEM_CSS}">• <strong>data:</strong> ${_dataSourceHtml(ctx.mergedConfig.data, ctx.rowCount)}</div>
        <div style="${ITEM_CSS}">• <strong>audio:</strong> ${_audioSourceHtml(ctx.audioConfig)}</div>
        <div style="margin-bottom:12px;">• <strong>output:</strong><br>${INDENT}${_outputHtml(ctx)}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Configuration Files</div>
        <div style="margin-bottom:12px;">${_configFilesHtml(cfg)}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Documentation</div>
        <div style="${ITEM_CSS}">• <strong>site:</strong> <a href="${SITE_URL}" target="_blank" style="color:${styles_1.COLORS.blue};">schmidtdse.github.io/jupyter_bioacoustic</a></div>
        <div>• <strong>docs:</strong> <a href="${WIKI_URL}" target="_blank" style="color:${styles_1.COLORS.blue};">github.com/SchmidtDSE/jupyter_bioacoustic/wiki</a></div>
      </div>
    `;
}
exports.infoPanelHtml = infoPanelHtml;
//
// Internal
//
/** ``(kind) path``, where kind is url/s3/gcs for remote paths, else ``type``. */
function _formatPath(path, type) {
    var _a;
    if (!path)
        return `<span style="color:${styles_1.COLORS.textSubtle};">Not specified</span>`;
    const label = (_a = (0, util_1.remoteScheme)(path)) !== null && _a !== void 0 ? _a : type;
    return `<span style="color:${styles_1.COLORS.blue};">(${(0, util_1.escapeHtml)(label)})</span> ${(0, util_1.escapeHtml)(path)}`;
}
/** A blue ``(tag)`` followed by already-safe HTML. */
function _tagged(tag, html) {
    return `<span style="color:${styles_1.COLORS.blue};">(${tag})</span> ${html}`;
}
function _dataSourceHtml(mcData, rowCount) {
    const fromKernel = _tagged('kernel', `${rowCount} rows loaded`);
    if (typeof mcData === 'object' && mcData !== null) {
        const data = mcData;
        const srcKey = DATA_SOURCE_KEYS.find(k => k in data);
        const src = srcKey ? String(data[srcKey]) : '';
        return src ? `${_formatPath(src, srcKey)} — ${rowCount} rows` : fromKernel;
    }
    if (typeof mcData === 'string')
        return `${_formatPath(mcData, 'path')} — ${rowCount} rows`;
    return fromKernel;
}
function _audioSourceHtml(audio) {
    if (audio.type === 'column')
        return _tagged('column', (0, util_1.escapeHtml)(String(audio.value)));
    if (audio.type && audio.value)
        return _formatPath(audio.value, audio.type);
    return `<span style="color:${styles_1.COLORS.textSubtle};">Unknown audio source</span>`;
}
function _outputHtml(ctx) {
    const mcOutput = ctx.mergedConfig.output;
    const sync = (uri) => `<br>${INDENT}${_tagged('sync', (0, util_1.escapeHtml)(String(uri)))}`;
    if (typeof mcOutput === 'object' && mcOutput !== null) {
        let html = _formatPath(mcOutput.path || ctx.outputPath, 'local');
        const syncUri = mcOutput.uri || mcOutput.url || (ctx.syncConfig && ctx.syncConfig.uri) || '';
        if (syncUri)
            html += sync(syncUri);
        return html;
    }
    let html = _formatPath(ctx.outputPath, 'local');
    if (ctx.syncConfig && ctx.syncConfig.uri)
        html += sync(ctx.syncConfig.uri);
    return html;
}
function _configFilesHtml(cfg) {
    const files = [
        ['project', cfg.project_path], ['config', cfg.config_path], ['form', cfg.form_path],
    ];
    const html = files
        .filter(([, path]) => path)
        .map(([name, path]) => `<div style="${ITEM_CSS}">• <strong>${name}:</strong> ${_formatPath(path, 'file')}</div>`)
        .join('');
    return html || `<div style="color:${styles_1.COLORS.textSubtle};">No configuration files loaded</div>`;
}


/***/ },

/***/ "./lib/kernel.js"
/*!***********************!*\
  !*** ./lib/kernel.js ***!
  \***********************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.execInKernel = exports.acquireKernel = exports.notebookSession = exports.KernelBridge = exports.KernelError = void 0;
//
// Public
//
/** A Python exception (or stderr-only output) from a kernel call. */
class KernelError extends Error {
    /**
     * @param message - Short summary (``ename: evalue``).
     * @param traceback - Full error text.
     */
    constructor(message, traceback) {
        super(message);
        this.name = 'KernelError';
        this.traceback = traceback;
    }
}
exports.KernelError = KernelError;
/**
 * Runs Python snippets in one widget's kernel and returns what they print. Every annotator /
 * builder kernel call goes through here.
 */
class KernelBridge {
    /**
     * @param source - The widget's kernel or notebook session (fixed for its lifetime).
     * @param cwd - Working directory the widget was opened in, if known.
     */
    constructor(source, cwd) {
        this._source = source;
        this.cwd = cwd;
    }
    /** The kernel calls currently go to (null if the session has no kernel). */
    get activeKernel() {
        var _a, _b, _c, _d;
        return (_d = (_a = this._source.kernel) !== null && _a !== void 0 ? _a : (_c = (_b = this._source.session) === null || _b === void 0 ? void 0 : _b.session) === null || _c === void 0 ? void 0 : _c.kernel) !== null && _d !== void 0 ? _d : null;
    }
    /**
     * Execute a Python snippet and return stdout (trimmed).
     * @throws KernelError(traceback) if Python raised (even after printing some output), or if
     *     it printed only to stderr; Error("No active kernel") without a kernel.
     */
    async exec(code) {
        const kernel = this.activeKernel;
        if (!kernel)
            throw new Error('No active kernel');
        let out = '', err = '';
        let summary = '';
        let raised = false;
        const future = kernel.requestExecute({ code });
        future.onIOPub = (msg) => {
            var _a, _b, _c;
            const t = msg.header.msg_type;
            const content = msg.content;
            if (t === 'stream') {
                if ((content === null || content === void 0 ? void 0 : content.name) === 'stdout')
                    out += content.text;
                if ((content === null || content === void 0 ? void 0 : content.name) === 'stderr')
                    err += content.text;
            }
            else if (t === 'error') {
                raised = true;
                const tb = (_a = content === null || content === void 0 ? void 0 : content.traceback) !== null && _a !== void 0 ? _a : [];
                summary = ((_b = content === null || content === void 0 ? void 0 : content.ename) !== null && _b !== void 0 ? _b : '') + ': ' + ((_c = content === null || content === void 0 ? void 0 : content.evalue) !== null && _c !== void 0 ? _c : '');
                err += summary + '\n' + tb.join('\n');
            }
        };
        await future.done;
        // an exception always fails the call: partial stdout before it is not a result
        if (raised || (!out.trim() && err)) {
            throw new KernelError(summary || err.trim(), err.trim());
        }
        return out.trim();
    }
}
exports.KernelBridge = KernelBridge;
/**
 * The session of the notebook whose DOM contains ``node`` (an inline output), else the
 * focused notebook's session. Call once, when creating the widget.
 */
function notebookSession(tracker, node) {
    var _a, _b;
    if (node) {
        let found = null;
        tracker.forEach(panel => {
            if (!found && panel.node.contains(node))
                found = panel.sessionContext;
        });
        if (found)
            return found;
    }
    return (_b = (_a = tracker.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext) !== null && _b !== void 0 ? _b : null;
}
exports.notebookSession = notebookSession;
/**
 * The focused notebook's kernel, or a newly started python3 kernel the caller owns.
 * The notebook is captured before awaiting, so focusing another notebook while the kernel
 * starts can't change the answer. Returns null if no kernel could be started.
 */
async function acquireKernel(app, tracker) {
    var _a, _b, _c, _d;
    const session = (_b = (_a = tracker.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext) !== null && _b !== void 0 ? _b : null;
    const existing = (_d = (_c = session === null || session === void 0 ? void 0 : session.session) === null || _c === void 0 ? void 0 : _c.kernel) !== null && _d !== void 0 ? _d : null;
    if (existing)
        return { source: { session }, kernel: existing, owns: false };
    try {
        const kernel = await app.serviceManager.kernels.startNew({ name: 'python3' });
        return { source: { kernel }, kernel, owns: true };
    }
    catch (e) {
        console.error('bioacoustic: failed to start kernel', e);
        return null;
    }
}
exports.acquireKernel = acquireKernel;
/**
 * Run ``code`` in ``kernel``, ignoring its output.
 * @returns The Python error message, or '' on success.
 */
async function execInKernel(kernel, code) {
    const future = kernel.requestExecute({ code });
    let error = '';
    future.onIOPub = (msg) => {
        var _a;
        if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.msg_type) === 'error') {
            const content = msg.content;
            error = content.evalue || (content.traceback || []).join('\n') || 'Unknown error';
        }
    };
    await future.done;
    return error;
}
exports.execInKernel = execInKernel;


/***/ },

/***/ "./lib/modal.js"
/*!**********************!*\
  !*** ./lib/modal.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buttonRow = exports.promptText = exports.showMessage = exports.createModal = void 0;
/**
 * Modal dialogs: one backdrop + card helper (``createModal``) that every hand-built dialog in
 * the annotator uses (message boxes, text prompts, the project picker, the launcher chooser),
 * so they look and close the same way.
 *
 * Plain DOM, no framework. Escape closes the top-most modal; clicking the backdrop closes it
 * unless ``dismissOnBackdrop`` is false.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
//
// Constants
//
const BACKDROP_CSS = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;` +
    `background:rgba(0,0,0,0.55);`;
const CARD_CSS = `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:8px;` +
    `padding:20px 24px;max-width:520px;width:90%;max-height:80vh;display:flex;` +
    `flex-direction:column;gap:12px;font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
    `box-shadow:0 8px 32px rgba(0,0,0,0.5);box-sizing:border-box;`;
const TITLE_CSS = `font-size:14px;font-weight:700;color:${styles_1.COLORS.textPrimary};`;
const MESSAGE_CSS = `font-size:12px;color:${styles_1.COLORS.textSubtle};white-space:pre-wrap;` +
    `overflow-y:auto;max-height:50vh;line-height:1.5;`;
const BUTTON_ROW_CSS = `display:flex;gap:8px;justify-content:flex-end;margin-top:4px;`;
const DEFAULT_Z_INDEX = 100000;
/** Open modals, bottom to top: Escape only closes the top one. */
const openModals = [];
//
// Public
//
/**
 * Show an empty modal (backdrop + themed card with an optional title) and return it.
 *
 * @param opts - See ``ModalOptions``.
 * @returns The modal; append content to ``card``.
 */
function createModal(opts = {}) {
    var _a, _b, _c, _d;
    const backdrop = document.createElement('div');
    backdrop.style.cssText = BACKDROP_CSS + `z-index:${(_a = opts.zIndex) !== null && _a !== void 0 ? _a : DEFAULT_Z_INDEX};`;
    const card = document.createElement('div');
    card.style.cssText = CARD_CSS + ((_b = opts.cardCss) !== null && _b !== void 0 ? _b : '');
    if (opts.title) {
        const heading = document.createElement('div');
        heading.textContent = opts.title;
        heading.style.cssText = TITLE_CSS + ((_c = opts.titleCss) !== null && _c !== void 0 ? _c : '');
        card.appendChild(heading);
    }
    backdrop.appendChild(card);
    let closed = false;
    const onKeydown = (e) => {
        if (e.key === 'Escape' && openModals[openModals.length - 1] === handle) {
            e.preventDefault();
            dismiss();
        }
    };
    const close = () => {
        if (closed)
            return;
        closed = true;
        document.removeEventListener('keydown', onKeydown);
        const i = openModals.indexOf(handle);
        if (i >= 0)
            openModals.splice(i, 1);
        backdrop.remove();
    };
    const dismiss = () => {
        var _a;
        if (closed)
            return;
        close();
        (_a = opts.onDismiss) === null || _a === void 0 ? void 0 : _a.call(opts);
    };
    const handle = { backdrop, card, close };
    if ((_d = opts.dismissOnBackdrop) !== null && _d !== void 0 ? _d : true) {
        backdrop.addEventListener('click', e => { if (e.target === backdrop)
            dismiss(); });
    }
    document.addEventListener('keydown', onKeydown);
    openModals.push(handle);
    document.body.appendChild(backdrop);
    return handle;
}
exports.createModal = createModal;
/**
 * A message box with buttons.
 *
 * @param opts.title - Heading.
 * @param opts.body - Plain-text message (newlines kept).
 * @param opts.buttons - Buttons, left to right (default: a single primary "OK"). The last one
 *     gets focus.
 * @param opts.dismissOnBackdrop - Close on a backdrop click (default false).
 * @returns The clicked button's label, or null if dismissed with Escape / the backdrop.
 */
function showMessage(opts) {
    var _a;
    const buttons = (_a = opts.buttons) !== null && _a !== void 0 ? _a : [{ label: 'OK', primary: true }];
    return new Promise(resolve => {
        var _a, _b;
        const modal = createModal({
            title: opts.title,
            dismissOnBackdrop: (_a = opts.dismissOnBackdrop) !== null && _a !== void 0 ? _a : false,
            onDismiss: () => resolve(null),
        });
        const body = document.createElement('div');
        body.style.cssText = MESSAGE_CSS;
        body.textContent = opts.body;
        modal.card.appendChild(body);
        const row = buttonRow(buttons.map(b => (Object.assign(Object.assign({}, b), { onClick: () => { modal.close(); resolve(b.label); } }))));
        modal.card.appendChild(row);
        (_b = row.lastElementChild) === null || _b === void 0 ? void 0 : _b.focus();
    });
}
exports.showMessage = showMessage;
/**
 * Ask for a line of text (replaces ``window.prompt``).
 *
 * @param opts.title - Heading.
 * @param opts.label - Text above the input.
 * @param opts.value - Initial value (selected, so typing replaces it).
 * @param opts.placeholder - Input placeholder.
 * @param opts.okLabel - Label of the confirm button (default "OK").
 * @returns The entered text (trimmed), or null if cancelled / left empty.
 */
function promptText(opts) {
    return new Promise(resolve => {
        var _a, _b, _c;
        const modal = createModal({ title: opts.title, onDismiss: () => resolve(null) });
        if (opts.label) {
            const lbl = document.createElement('div');
            lbl.style.cssText = MESSAGE_CSS;
            lbl.textContent = opts.label;
            modal.card.appendChild(lbl);
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.value = (_a = opts.value) !== null && _a !== void 0 ? _a : '';
        input.placeholder = (_b = opts.placeholder) !== null && _b !== void 0 ? _b : '';
        input.style.cssText = (0, styles_1.inputStyle)('100%') + `font-size:13px;padding:6px 8px;`;
        modal.card.appendChild(input);
        const finish = (value) => {
            var _a;
            modal.close();
            const text = (_a = value === null || value === void 0 ? void 0 : value.trim()) !== null && _a !== void 0 ? _a : '';
            resolve(text ? text : null);
        };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(input.value);
            }
        });
        modal.card.appendChild(buttonRow([
            { label: 'Cancel', onClick: () => finish(null) },
            { label: (_c = opts.okLabel) !== null && _c !== void 0 ? _c : 'OK', primary: true, onClick: () => finish(input.value) },
        ]));
        input.focus();
        input.select();
    });
}
exports.promptText = promptText;
/**
 * A right-aligned row of buttons styled like the rest of the annotator.
 *
 * @param buttons - Label, primary flag and click handler for each button.
 */
function buttonRow(buttons) {
    const row = document.createElement('div');
    row.style.cssText = BUTTON_ROW_CSS;
    for (const b of buttons) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        btn.style.cssText = (0, styles_1.btnStyle)(b.primary);
        btn.addEventListener('click', b.onClick);
        row.appendChild(btn);
    }
    return row;
}
exports.buttonRow = buttonRow;


/***/ },

/***/ "./lib/plugin.js"
/*!***********************!*\
  !*** ./lib/plugin.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bioacousticPlugin = void 0;
const apputils_1 = __webpack_require__(/*! @jupyterlab/apputils */ "webpack/sharing/consume/default/@jupyterlab/apputils");
const coreutils_1 = __webpack_require__(/*! @jupyterlab/coreutils */ "webpack/sharing/consume/default/@jupyterlab/coreutils");
const filebrowser_1 = __webpack_require__(/*! @jupyterlab/filebrowser */ "webpack/sharing/consume/default/@jupyterlab/filebrowser");
const launcher_1 = __webpack_require__(/*! @jupyterlab/launcher */ "webpack/sharing/consume/default/@jupyterlab/launcher");
const notebook_1 = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const BioacousticWidget_1 = __webpack_require__(/*! ./BioacousticWidget */ "./lib/BioacousticWidget.js");
const launcherDialog_1 = __webpack_require__(/*! ./dialogs/launcherDialog */ "./lib/dialogs/launcherDialog.js");
const projectPicker_1 = __webpack_require__(/*! ./dialogs/projectPicker */ "./lib/dialogs/projectPicker.js");
const icons_1 = __webpack_require__(/*! ./icons */ "./lib/icons.js");
const kernel_1 = __webpack_require__(/*! ./kernel */ "./lib/kernel.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ./text */ "./lib/text.js");
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
//
// Constants
//
const CMD_OPEN = 'bioacoustic:open';
const CMD_OPEN_PROJECT = 'bioacoustic:open-project';
const CMD_LAUNCHER_DIALOG = 'bioacoustic:launcher-dialog';
const CMD_OPEN_CONFIG_BUILDER = 'bioacoustic:open-config-builder';
const PALETTE_CATEGORY = 'Bioacoustic';
const LOADING_FILL_STYLE_ID = 'jba-fill-style';
/** Makes loading-placeholder ids unique: ``jp-bioacoustic-loading-<n>``. */
let loadingCounter = 0;
//
// Public
//
/** The annotator plugin (registered from ``index.ts``). */
exports.bioacousticPlugin = {
    id: 'jupyter-bioacoustic:plugin',
    autoStart: true,
    requires: [apputils_1.ICommandPalette, notebook_1.INotebookTracker],
    optional: [launcher_1.ILauncher, filebrowser_1.IDefaultFileBrowser],
    activate: (app, palette, tracker, launcher, defaultBrowser) => {
        _registerWindowHooks(app, tracker);
        app.commands.addCommand(CMD_OPEN, {
            label: 'Open Bioacoustic Reviewer',
            execute: () => {
                const widget = new BioacousticWidget_1.BioacousticWidget({ session: (0, kernel_1.notebookSession)(tracker) });
                app.shell.add(widget, 'main', { mode: 'split-right' });
                app.shell.activateById(widget.id);
            },
        });
        app.commands.addCommand(CMD_OPEN_PROJECT, {
            label: 'Bioacoustic Annotator',
            icon: icons_1.bioacousticIcon,
            execute: () => _openProject(app, tracker, defaultBrowser),
        });
        app.commands.addCommand(CMD_LAUNCHER_DIALOG, {
            label: 'Bioacoustic Annotator',
            icon: icons_1.bioacousticIcon,
            execute: () => {
                (0, launcherDialog_1.showLauncherDialog)({
                    onNotebook: () => void _openStarterNotebook(app, tracker, defaultBrowser),
                    onAnnotator: () => void app.commands.execute(CMD_OPEN_PROJECT),
                    onConfigBuilder: () => void app.commands.execute(CMD_OPEN_CONFIG_BUILDER),
                });
            },
        });
        for (const command of [CMD_OPEN, CMD_OPEN_PROJECT, CMD_LAUNCHER_DIALOG]) {
            palette.addItem({ command, category: PALETTE_CATEGORY });
        }
        launcher === null || launcher === void 0 ? void 0 : launcher.add({ command: CMD_LAUNCHER_DIALOG, category: 'Other' });
    },
};
//
// Internal
//
/** Install the ``window._bioacoustic*`` hooks the Python side calls to open a widget. */
function _registerWindowHooks(app, tracker) {
    window._bioacousticApp = app;
    window._bioacousticOpenInline = (divId) => {
        const container = document.getElementById(divId);
        if (!container)
            return;
        const widget = new BioacousticWidget_1.BioacousticWidget({ session: (0, kernel_1.notebookSession)(tracker, container) });
        widget.node.style.cssText += `position:absolute;inset:0;`;
        (0, util_1.suppressNotebookShortcuts)(widget.node);
        widgets_1.Widget.attach(widget, container);
    };
    window._bioacousticOpenWithKernel = (kernel, ownsKernel = true) => {
        const widget = new BioacousticWidget_1.BioacousticWidget({ kernel }, ownsKernel);
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
    };
}
/** The kernel cwd for the file browser's directory (absolute, server-side). */
function _serverDir(browserPath) {
    const serverRoot = coreutils_1.PageConfig.getOption('serverRoot');
    return browserPath ? `${serverRoot}/${browserPath}` : serverRoot;
}
/**
 * ``bioacoustic:open-project``: pick a project file, set it up in the focused notebook's
 * kernel (or a new one), then open the annotator on it. A loading tab shows meanwhile.
 */
async function _openProject(app, tracker, browser) {
    var _a;
    const browserPath = (_a = browser === null || browser === void 0 ? void 0 : browser.model.path) !== null && _a !== void 0 ? _a : '';
    const projectPath = await (0, projectPicker_1.pickProjectFile)(browser, browserPath);
    if (!projectPath)
        return;
    const placeholder = _createLoadingWidget();
    app.shell.add(placeholder, 'main');
    app.shell.activateById(placeholder.id);
    const acquired = await (0, kernel_1.acquireKernel)(app, tracker);
    if (!acquired) {
        placeholder.dispose();
        void (0, util_1.showDialog)({ title: 'Error', body: text_1.DIALOG.kernelFailed });
        return;
    }
    const { kernel, owns: ownsKernel } = acquired;
    const relPath = browserPath && projectPath.startsWith(browserPath + '/')
        ? projectPath.substring(browserPath.length + 1)
        : projectPath;
    const error = await (0, kernel_1.execInKernel)(kernel, (0, python_1.openProjectInKernel)(_serverDir(browserPath), relPath));
    placeholder.dispose();
    if (error) {
        if (ownsKernel)
            kernel.shutdown().catch(() => { });
        void (0, util_1.showDialog)({ title: text_1.DIALOG.annotatorErrorTitle, body: error });
        return;
    }
    const widget = new BioacousticWidget_1.BioacousticWidget(acquired.source, ownsKernel);
    app.shell.add(widget, 'main');
    app.shell.activateById(widget.id);
}
/**
 * The launcher's "Notebook" tile: copy the starter notebook into the file browser's
 * directory and open it. Failures are silent (the browser is refreshed either way).
 */
async function _openStarterNotebook(app, tracker, browser) {
    var _a;
    const browserPath = (_a = browser === null || browser === void 0 ? void 0 : browser.model.path) !== null && _a !== void 0 ? _a : '';
    const acquired = await (0, kernel_1.acquireKernel)(app, tracker);
    if (!acquired) {
        void (0, util_1.showDialog)({ title: 'Error', body: text_1.DIALOG.kernelFailed });
        return;
    }
    const { kernel, owns: ownsKernel } = acquired;
    let result = '';
    try {
        result = await new kernel_1.KernelBridge({ kernel }).exec((0, python_1.copyStarterNotebook)(_serverDir(browserPath)));
    }
    catch ( /* copy failed: nothing to open */_b) { /* copy failed: nothing to open */ }
    if (ownsKernel)
        kernel.shutdown().catch(() => { });
    if (result) {
        try {
            const parsed = JSON.parse(result);
            const rel = parsed.relative || parsed.path;
            const nbPath = browserPath ? `${browserPath}/${rel}` : rel;
            void app.commands.execute('docmanager:open', { path: nbPath });
        }
        catch ( /* ignore parse errors */_c) { /* ignore parse errors */ }
    }
    if (browser)
        void browser.model.refresh();
}
/** A placeholder tab with a filling progress bar, shown while a project loads. */
function _createLoadingWidget() {
    const w = new widgets_1.Widget();
    w.id = `jp-bioacoustic-loading-${loadingCounter++}`;
    w.title.label = 'Bioacoustic Annotator';
    w.title.closable = true;
    w.title.icon = icons_1.bioacousticIcon;
    w.node.style.cssText =
        `display:flex;align-items:center;justify-content:center;` +
            `width:100%;height:100%;background:${styles_1.COLORS.bgBase};`;
    const wrap = document.createElement('div');
    wrap.style.cssText = `text-align:center;`;
    const label = document.createElement('div');
    label.textContent = 'Loading…';
    label.style.cssText =
        `color:${styles_1.COLORS.textSubtle};font-size:14px;letter-spacing:0.5px;margin-bottom:14px;` +
            `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);`;
    const track = document.createElement('div');
    track.style.cssText =
        `width:240px;height:3px;background:${styles_1.COLORS.bgSurface0};` +
            `border-radius:2px;overflow:hidden;margin:0 auto;`;
    const bar = document.createElement('div');
    bar.style.cssText =
        `width:0%;height:100%;background:${styles_1.COLORS.blue};border-radius:2px;` +
            `animation:jba-fill 10s ease-out forwards;`;
    if (!document.getElementById(LOADING_FILL_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = LOADING_FILL_STYLE_ID;
        style.textContent = '@keyframes jba-fill{to{width:100%}}';
        document.head.appendChild(style);
    }
    track.appendChild(bar);
    wrap.append(label, track);
    w.node.appendChild(wrap);
    return w;
}


/***/ },

/***/ "./lib/python.js"
/*!***********************!*\
  !*** ./lib/python.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveOutputTemplates = exports.syncOutput = exports.savePng = exports.deleteOutputRow = exports.writeOutputRows = exports.writeOutputRow = exports.readOutputRows = exports.countOutputRows = exports.loadSelectItems = exports.spectrogramPipeline = exports.buildSpectrogram = exports.readAudio = exports.validateFormConfig = exports.readKernelVars = exports.copyStarterNotebook = exports.openProjectInKernel = exports.INVALIDATE_OUTPUT_CACHE = void 0;
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
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
//
// Constants
//
/** Import prefix for the kernel-side helper module. */
const HELPERS = 'from jupyter_bioacoustic._kernel_helpers import';
/** Spectrogram width (px) when no resolution is chosen. */
const DEFAULT_SPEC_WIDTH = 2000;
/** Drop the output-file cache after a write/delete (no-op if the instance has none). */
exports.INVALIDATE_OUTPUT_CACHE = 'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';
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
function openProjectInKernel(workDir, relPath) {
    return [
        `import os as _os`,
        `_os.chdir(_os.path.expanduser('${(0, util_1.escPy)(workDir)}'))`,
        `from jupyter_bioacoustic import BioacousticAnnotator as _BA`,
        `from jupyter_bioacoustic import ConfigBuilder as _CB`,
        `_cb = _CB()`,
        `_cb.load_config('${(0, util_1.escPy)(relPath)}')`,
        `_vr = _cb.validate()`,
        `if _vr['errors']:`,
        `    raise ValueError('Config validation failed:\\n' + '\\n'.join(_vr['errors']))`,
        `_ba = _BA(project='${(0, util_1.escPy)(relPath)}')`,
        `_ba.setup()`,
    ].join('\n');
}
exports.openProjectInKernel = openProjectInKernel;
/**
 * Copy the starter notebook into ``cwd``; prints ``{"path", "relative"}`` as JSON.
 *
 * @param cwd - Absolute directory to copy into (``~`` expanded).
 */
function copyStarterNotebook(cwd) {
    return [
        `import os as _os; _os.chdir(_os.path.expanduser('${(0, util_1.escPy)(cwd)}'))`,
        `from jupyter_bioacoustic.config_builder.notebook import copy_starter_notebook`,
        `import json; print(json.dumps(copy_starter_notebook('.')))`,
    ].join('\n');
}
exports.copyStarterNotebook = copyStarterNotebook;
// ── Kernel variable reading (BioacousticWidget._init) ─────────
/** Print every ``_BA_*`` config global as one JSON object (see ``types.KernelVars``). */
function readKernelVars() {
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
exports.readKernelVars = readKernelVars;
// ── Validation ────────────────────────────────────────────────
/** Validate a form config; prints the list of error strings as JSON. */
function validateFormConfig(formConfigJson) {
    return [
        `import json as _j`,
        `from jupyter_bioacoustic._validation import validate_config as _vc`,
        `_r = _vc(form_config=_j.loads('${(0, util_1.escPy)(formConfigJson)}'))`,
        `print(_j.dumps(_r['errors']))`,
    ].join('\n');
}
exports.validateFormConfig = validateFormConfig;
// ── Spectrogram + WAV generation (Player) ─────────────────────
/** Read ``durSec`` seconds of audio from ``startSec`` into the kernel globals ``_raw, _sr``. */
function readAudio(path, startSec, durSec) {
    const p = (0, util_1.escPy)(path);
    return [
        `from jupyter_bioacoustic.audio import read_segment as _read_segment`,
        `_partial = _BA_INSTANCE._partial_download \\`,
        `  if hasattr(_BA_INSTANCE, '_partial_download') else True`,
        `_raw, _sr = _read_segment('${p}', ${startSec}, ${durSec}, partial=_partial)`,
    ].join('\n');
}
exports.readAudio = readAudio;
/** Print a built-in spectrogram (+ WAV) of ``_raw`` as JSON (run after ``readAudio``). */
function buildSpectrogram(spectType, resolutionW, resolutionH) {
    const w = resolutionW !== null && resolutionW !== void 0 ? resolutionW : DEFAULT_SPEC_WIDTH;
    const h = resolutionH ? `, height=${resolutionH}` : '';
    return [
        `${HELPERS} build_spectrogram as _build_spec`,
        `print(_build_spec(_raw, _sr, spec_type='${spectType}', width=${w}${h}))`,
    ].join('\n');
}
exports.buildSpectrogram = buildSpectrogram;
/**
 * Read audio and print its spectrogram JSON in one call: the built-in ``mel``/``linear`` view
 * or custom visualization ``vizIndex``.
 */
function spectrogramPipeline(path, startSec, durSec, vizType, builtinKey, vizIndex, resolutionW, resolutionH) {
    const readCode = readAudio(path, startSec, durSec);
    if (vizType === 'custom' && vizIndex != null) {
        return readCode + '\n' + _customVizCode(vizIndex, resolutionW !== null && resolutionW !== void 0 ? resolutionW : DEFAULT_SPEC_WIDTH, resolutionH);
    }
    const spectType = builtinKey === 'mel' ? 'mel' : 'linear';
    return readCode + '\n' + buildSpectrogram(spectType, resolutionW, resolutionH);
}
exports.spectrogramPipeline = spectrogramPipeline;
// ── Select items loading (FormPanel) ──────────────────────────
/** Load select ``[value, label]`` pairs from a CSV/YAML/... file; prints them as JSON. */
function loadSelectItems(path, valueCol, labelCol) {
    const p = (0, util_1.escPy)(path);
    const v = valueCol ? `'${(0, util_1.escPy)(valueCol)}'` : 'None';
    const l = labelCol ? `'${(0, util_1.escPy)(labelCol)}'` : 'None';
    return [
        `${HELPERS} load_select_items as _load`,
        `print(_load('${p}', value_col=${v}, label_col=${l}))`,
    ].join('\n');
}
exports.loadSelectItems = loadSelectItems;
// ── Output file operations (FormPanel) ────────────────────────
/** Print ``{"count": n}`` — the number of rows in the output file. */
function countOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    return [
        `${HELPERS} count_output_rows as _count`,
        `print(_count('${p}', '${ext}'))`,
    ].join('\n');
}
exports.countOutputRows = countOutputRows;
/** Print every output-file row as a JSON list of objects. */
function readOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    return [
        `${HELPERS} read_output_rows as _read`,
        `print(_read('${p}', '${ext}'))`,
    ].join('\n');
}
exports.readOutputRows = readOutputRows;
/**
 * Append one row to the output file (see ``writeOutputRows``).
 */
function writeOutputRow(path, values) {
    return writeOutputRows(path, [values]);
}
exports.writeOutputRow = writeOutputRow;
/**
 * Append rows to the output file in ONE kernel call, so a multibox submit is saved
 * all-or-nothing. Rows travel as JSON, so any column name or value is safe (quotes,
 * newlines; NaN/Infinity become None). Python: ``_kernel_helpers.write_output_rows``.
 */
function writeOutputRows(path, rows) {
    var _a, _b;
    const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    const cols = [];
    for (const row of rows) {
        for (const k of Object.keys(row))
            if (!cols.includes(k))
                cols.push(k);
    }
    const payload = (0, util_1.escPy)(JSON.stringify({ rows, cols }));
    return [
        'import json as _j',
        `${HELPERS} write_output_rows as _write_rows`,
        `_p = _j.loads('${payload}')`,
        `print(_write_rows('${(0, util_1.escPy)(path)}', _p['rows'], _p['cols'], '${(0, util_1.escPy)(ext)}'))`,
    ].join('\n');
}
exports.writeOutputRows = writeOutputRows;
/**
 * Delete the output rows matching ``matchExpr``.
 *
 * @param matchExpr - Python expression over the row dict ``r`` (callers must escape values).
 */
function deleteOutputRow(path, matchExpr) {
    var _a, _b;
    const p = (0, util_1.escPy)(path);
    const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    return [
        `${HELPERS} delete_output_row as _delete, _safe_float as _sf`,
        `print(_delete('${p}', lambda r: ${matchExpr}, '${ext}'))`,
    ].join('\n');
}
exports.deleteOutputRow = deleteOutputRow;
// ── Capture (Player) ──────────────────────────────────────────
/** Save a base64 PNG to ``filename`` (relative to the kernel cwd). */
function savePng(filename, b64Data) {
    const esc = (0, util_1.escPy)(filename);
    return [
        `${HELPERS} save_png as _save_png`,
        `print(_save_png('${esc}', '${b64Data}'))`,
    ].join('\n');
}
exports.savePng = savePng;
// ── Sync & templates ──────────────────────────────────────────
/** Upload the output file to its sync URI (or ``dest``); prints ``ok``. */
function syncOutput(dest) {
    const destArg = dest ? `dest='${(0, util_1.escPy)(dest)}'` : '';
    return [
        `_BA_INSTANCE.sync(${destArg})`,
        `print('ok')`,
    ].join('\n');
}
exports.syncOutput = syncOutput;
/** Resolve ``[[%Y%m%d]]``-style datetime placeholders; prints ``{"resolved": ...}``. */
function resolveOutputTemplates(template) {
    return [
        `from jupyter_bioacoustic.api import _resolve_templates`,
        `import json`,
        `_result = _resolve_templates('${(0, util_1.escPy)(template)}')`,
        `print(json.dumps({'resolved': _result}))`,
    ].join('\n');
}
exports.resolveOutputTemplates = resolveOutputTemplates;
//
// Internal
//
/** Run custom visualization ``vizIndex`` on ``_raw`` and print its JSON. */
function _customVizCode(vizIndex, resolutionW, resolutionH) {
    const h = resolutionH ? `, height=${resolutionH}` : '';
    return [
        `${HELPERS} run_custom_viz as _run_viz`,
        `_viz_entry = _BA_INSTANCE._visualizations[${vizIndex}]`,
        `print(_run_viz(_raw, _sr, _viz_entry, width=${resolutionW}${h}))`,
    ].join('\n');
}


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
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const text_1 = __webpack_require__(/*! ../text */ "./lib/text.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
//
// Constants
//
const DEFAULT_TABLE_MAX_HEIGHT = 175;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Operators for numeric columns. */
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
/** Operators for date (YYYY-MM-DD) columns. */
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
/** Operators for text columns. */
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
/** Human-readable label for an operator (used in chips). */
const OP_LABELS = {};
[...FLOAT_OPS, ...STRING_OPS, ...DATE_OPS].forEach(o => { OP_LABELS[o.value] = o.label; });
//
// Public
//
/** The clip table section: filter bar, chips, sortable paginated table. */
class ClipTable {
    constructor(_form) {
        this._form = _form;
        // ─── Signals ───────────────────────────────────────────────
        this.rowSelected = new signaling_1.Signal(this);
        // ─── Data state ────────────────────────────────────────────
        this._rows = [];
        this._filtered = [];
        this._dataIndexCol = 'id';
        this._sortCol = ''; // '' = no sort (preserve file/input order)
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
        if (opts.height) {
            this._tableWrap.style.maxHeight = `${opts.height}px`;
        }
        this._dataIndexCol = opts.dataIndexCol;
        // '' (default) preserves file/input order; a column name sorts by it
        this._sortCol = opts.sort || '';
        this._sortAsc = !/^desc/i.test(opts.sortOrder || 'asc');
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
    /**
     * Re-apply filters / sort / view mode and redraw. The selection follows its ROW, not its
     * position: after filtering or sorting, ``selectedIdx`` points at the same clip (or -1 if
     * it is no longer listed), so Prev/Next and the highlight stay on the clip being reviewed.
     */
    refresh() {
        const selectedRow = this._filtered[this._selectedIdx];
        this._applyFilterAndSort();
        this._selectedIdx = selectedRow ? this._filtered.indexOf(selectedRow) : -1;
        this._highlightIdx = -1;
        this._renderTable();
    }
    selectIndex(filteredIdx) {
        this._selectedIdx = filteredIdx;
        this._renderTable();
    }
    get selectedIdx() { return this._selectedIdx; }
    get filtered() { return this._filtered; }
    get rows() { return this._rows; }
    get viewMode() { return this._viewMode; }
    ensurePageShowsSelected() {
        if (this._selectedIdx < 0)
            return;
        const newPage = Math.floor(this._selectedIdx / this._pageSize);
        if (newPage !== this._page) {
            this._page = newPage;
            this._renderTable();
        }
    }
    updateCurrentRowStyle() {
        if (this._selectedIdx < 0 || this._selectedIdx >= this._filtered.length)
            return;
        const pageStart = this._page * this._pageSize;
        const pageEnd = Math.min(pageStart + this._pageSize, this._filtered.length);
        // Check if selected row is on current page
        if (this._selectedIdx < pageStart || this._selectedIdx >= pageEnd)
            return;
        const rowIndexOnPage = this._selectedIdx - pageStart;
        const tr = this._tableBody.children[rowIndexOnPage];
        if (!tr)
            return;
        const row = this._filtered[this._selectedIdx];
        const reviewed = this._form.isReviewed(row);
        // Update row background (selected rows keep selected background)
        tr.style.background = styles_1.COLORS.bgSelected; // Keep selected state
        // Update cell text colors
        const tds = tr.querySelectorAll('td');
        tds.forEach(td => {
            td.style.color = reviewed ? styles_1.COLORS.textMuted : styles_1.COLORS.textPrimary;
        });
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
        var _a, _b;
        const prev = (_b = (_a = this._valueContainer.querySelector('input, select')) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '';
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
        inp.value = prev;
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
            dismissBtn.title = text_1.TOOLTIP.removeFilter;
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
        this._refreshBtn.title = text_1.TOOLTIP.refreshList;
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
        this._tableWrap = document.createElement('div');
        this._tableWrap.tabIndex = 0;
        this._tableWrap.style.cssText =
            `flex:0 0 auto;overflow-y:auto;max-height:${DEFAULT_TABLE_MAX_HEIGHT}px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};outline:none;`;
        this._tableWrap.addEventListener('keydown', e => this._onTableKeyDown(e));
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
        this._tableWrap.appendChild(table);
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
        this.element.append(filterBar, this._chipContainer, this._tableWrap, pagBar);
    }
    // ─── Private: columns ──────────────────────────────────────
    _configureColumns(opts) {
        const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (opts.dataCols.length > 0) {
            this._tableCols = opts.dataCols.map(k => ({ key: k, label: prettify(k) }));
        }
        else if (opts.rows.length > 0) {
            this._tableCols = Object.keys(opts.rows[0]).map(k => ({ key: k, label: prettify(k) }));
        }
        else {
            this._tableCols = [
                { key: this._dataIndexCol, label: 'ID' },
                { key: 'start_time', label: 'Start (s)' },
                { key: 'end_time', label: 'End (s)' },
            ];
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
            th.title = text_1.TOOLTIP.sortHeader;
            th.textContent = label;
            th.addEventListener('click', (e) => {
                if (e.shiftKey) {
                    // shift-click clears the sort → natural/input order
                    this._sortCol = '';
                }
                else if (this._sortCol === key) {
                    this._sortAsc = !this._sortAsc;
                }
                else {
                    this._sortCol = key;
                    this._sortAsc = true;
                }
                this._updateSortIndicators();
                this._page = 0;
                this.refresh();
            });
            headerRow.appendChild(th);
        });
        this._thead.appendChild(headerRow);
        // reflect the current sort (including one set via the sort/sort_order
        // params) in the header arrows on (re)build
        this._updateSortIndicators();
    }
    _updateSortIndicators() {
        this._thead.querySelectorAll('th').forEach(t => {
            const col = t.dataset.col;
            const entry = this._tableCols.find(c => c.key === col);
            if (entry) {
                t.textContent = entry.label
                    + (col === this._sortCol ? (this._sortAsc ? ' ▲' : ' ▼') : '');
            }
        });
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
        if (this._sortCol) {
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
        }
        // Apply view mode filter
        if (this._viewMode === 'pending') {
            const idxCol = this._dataIndexCol;
            rows = rows.filter(r => !this._form.getReviewedMap().has(r[idxCol]));
        }
        else if (this._viewMode === 'reviewed') {
            const idxCol = this._dataIndexCol;
            rows = rows.filter(r => this._form.getReviewedMap().has(r[idxCol]));
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

/***/ "./lib/sections/DescriptionPanel.js"
/*!******************************************!*\
  !*** ./lib/sections/DescriptionPanel.js ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DescriptionPanel = exports.renderMarkdown = exports.safeHref = void 0;
/**
 * DescriptionPanel — the collapsible project description at the top of the annotator,
 * rendered from a small, safe Markdown subset (``renderMarkdown``).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
//
// Constants
//
const DEFAULT_DESCRIPTION_TITLE = 'Description';
/**
 * A link target that is safe to put in ``href``: http(s), mailto, or a relative link.
 * Anything else (``javascript:``, ``data:``, ...) becomes ``#``. Browsers ignore tabs, newlines
 * and spaces inside a scheme (``java\tscript:``), so those are removed before checking.
 */
//
// Public
//
function safeHref(url) {
    const u = url.replace(/[\u0000-\u0020]/g, '');
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(u);
    return !hasScheme || /^(https?|mailto):/i.test(u) ? u : '#';
}
exports.safeHref = safeHref;
function renderMarkdown(src) {
    const lines = src.split('\n');
    const out = [];
    let inList = '';
    let inCode = false;
    const inline = (s) => (0, util_1.escapeHtml)(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    const closeList = () => {
        if (inList) {
            out.push(inList === 'ol' ? '</ol>' : '</ul>');
            inList = '';
        }
    };
    let baseIndent = -1;
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    if (nonEmpty.length > 0) {
        baseIndent = Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)[1].length));
    }
    const deindent = (s) => baseIndent > 0 && s.length >= baseIndent ? s.slice(baseIndent) : s;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (trimmed.startsWith('```')) {
            if (inCode) {
                out.push('</code></pre>');
                inCode = false;
            }
            else {
                closeList();
                out.push('<pre><code>');
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            const codeLine = deindent(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            out.push(codeLine);
            continue;
        }
        if (/^\s*$/.test(trimmed)) {
            closeList();
            continue;
        }
        if (/^---+$/.test(trimmed.trim()) || /^\*\*\*+$/.test(trimmed.trim()) || /^___+$/.test(trimmed.trim())) {
            closeList();
            out.push('<hr>');
            continue;
        }
        const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
            closeList();
            const level = hMatch[1].length;
            out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
            continue;
        }
        const olMatch = trimmed.match(/^\s*\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inList !== 'ol') {
                closeList();
                out.push('<ol>');
                inList = 'ol';
            }
            out.push(`<li>${inline(olMatch[1])}</li>`);
            continue;
        }
        const ulMatch = trimmed.match(/^\s*[-*+]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== 'ul') {
                closeList();
                out.push('<ul>');
                inList = 'ul';
            }
            out.push(`<li>${inline(ulMatch[1])}</li>`);
            continue;
        }
        closeList();
        out.push(`<p>${inline(trimmed)}</p>`);
    }
    closeList();
    if (inCode)
        out.push('</code></pre>');
    return out.join('\n');
}
exports.renderMarkdown = renderMarkdown;
/** The collapsible description section. */
class DescriptionPanel {
    constructor() {
        this.element = document.createElement('details');
        this.element.style.cssText =
            `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;`;
        const summary = document.createElement('summary');
        summary.style.cssText =
            `padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;` +
                `background:${styles_1.COLORS.bgMantle};color:${styles_1.COLORS.textPrimary};` +
                `list-style:none;user-select:none;letter-spacing:0.5px;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};` +
                `display:flex;align-items:center;gap:6px;`;
        this._chevron = document.createElement('span');
        this._chevron.style.cssText =
            `font-size:20px;line-height:0;margin-top:-3px;color:${styles_1.COLORS.textMuted};flex-shrink:0;width:16px;text-align:center;`;
        this._chevron.textContent = '▾';
        this._body = document.createElement('div');
        this._body.style.cssText =
            `padding:10px 16px;background:${styles_1.COLORS.bgBase};color:${styles_1.COLORS.textPrimary};` +
                `font-size:13px;line-height:1.6;overflow-y:auto;`;
        summary.appendChild(this._chevron);
        this.element.appendChild(summary);
        this.element.appendChild(this._body);
        this.element.addEventListener('toggle', () => {
            this._chevron.textContent = this.element.open ? '▾' : '▸';
        });
        this.element.style.display = 'none';
    }
    setConfig(cfg, height) {
        if (!cfg.text) {
            this.element.style.display = 'none';
            return;
        }
        const title = cfg.title || DEFAULT_DESCRIPTION_TITLE;
        const summary = this.element.querySelector('summary');
        const titleSpan = summary.querySelector('span:last-child');
        if (titleSpan && titleSpan !== this._chevron) {
            titleSpan.textContent = title;
        }
        else {
            const s = document.createElement('span');
            s.textContent = title;
            summary.appendChild(s);
        }
        if (cfg.text) {
            this._body.innerHTML = renderMarkdown(cfg.text);
            this._applyContentStyles();
        }
        if (height) {
            this._body.style.maxHeight = `${height}px`;
        }
        this.element.open = cfg.open;
        this._chevron.textContent = cfg.open ? '▾' : '▸';
        this.element.style.display = '';
    }
    _applyContentStyles() {
        var _a;
        for (const h of this._body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
            h.style.cssText =
                `color:${styles_1.COLORS.textPrimary};margin:12px 0 6px;font-weight:700;`;
        }
        for (const h1 of this._body.querySelectorAll('h1')) {
            h1.style.fontSize = '15px';
        }
        for (const h2 of this._body.querySelectorAll('h2')) {
            h2.style.fontSize = '14px';
        }
        for (const h3 of this._body.querySelectorAll('h3')) {
            h3.style.fontSize = '13px';
        }
        for (const p of this._body.querySelectorAll('p')) {
            p.style.cssText = `margin:6px 0;color:${styles_1.COLORS.textPrimary};`;
        }
        for (const a of this._body.querySelectorAll('a')) {
            a.style.cssText = `color:${styles_1.COLORS.blue};text-decoration:underline;`;
        }
        for (const ol of this._body.querySelectorAll('ol,ul')) {
            ol.style.cssText = `margin:6px 0;padding-left:24px;color:${styles_1.COLORS.textPrimary};`;
        }
        for (const li of this._body.querySelectorAll('li')) {
            li.style.cssText = `margin:2px 0;color:${styles_1.COLORS.textPrimary};`;
        }
        for (const code of this._body.querySelectorAll('pre > code')) {
            code.style.cssText = `color:${styles_1.COLORS.textPrimary};font-size:12px;background:transparent;padding:0;border-radius:0;display:block;`;
        }
        for (const code of this._body.querySelectorAll('code')) {
            if (((_a = code.parentElement) === null || _a === void 0 ? void 0 : _a.tagName) !== 'PRE') {
                code.style.cssText =
                    `background:${styles_1.COLORS.bgSurface0};color:${styles_1.COLORS.textPrimary};padding:1px 4px;border-radius:3px;font-size:12px;`;
            }
        }
        for (const pre of this._body.querySelectorAll('pre')) {
            pre.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};color:${styles_1.COLORS.textPrimary};padding:8px 12px;border-radius:4px;overflow-x:auto;font-size:12px;margin:6px 0;`;
        }
        for (const strong of this._body.querySelectorAll('strong')) {
            strong.style.color = styles_1.COLORS.textPrimary;
        }
        for (const em of this._body.querySelectorAll('em')) {
            em.style.color = styles_1.COLORS.textPrimary;
        }
        for (const hr of this._body.querySelectorAll('hr')) {
            hr.style.cssText = `border:none;border-top:1px solid ${styles_1.COLORS.bgSurface1};margin:12px 0;`;
        }
    }
}
exports.DescriptionPanel = DescriptionPanel;


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
 * Owns the dynamic form built from `form_config`: all inputs, submission buttons, progress
 * tracker, annotation tool UI (incl. multibox cards), the reviewed view (for
 * already-submitted rows), and output file writing.
 *
 * Communicates with the rest of the widget via Lumino signals. Related modules under
 * ``form/``: ``annotationConfig`` (parsing the annotation element), ``selectItems`` /
 * ``inputs`` (select parsing and DOM), ``multiboxCards`` (box cards and per-box forms),
 * ``reviewed`` (reviewed view), ``progress`` (progress text / accuracy), ``formConfig``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const kernel_1 = __webpack_require__(/*! ../kernel */ "./lib/kernel.js");
const python_1 = __webpack_require__(/*! ../python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ../text */ "./lib/text.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const annotationConfig_1 = __webpack_require__(/*! ./form/annotationConfig */ "./lib/sections/form/annotationConfig.js");
const formConfig_1 = __webpack_require__(/*! ./form/formConfig */ "./lib/sections/form/formConfig.js");
const inputs_1 = __webpack_require__(/*! ./form/inputs */ "./lib/sections/form/inputs.js");
const multiboxCards_1 = __webpack_require__(/*! ./form/multiboxCards */ "./lib/sections/form/multiboxCards.js");
const progress_1 = __webpack_require__(/*! ./form/progress */ "./lib/sections/form/progress.js");
const reviewed_1 = __webpack_require__(/*! ./form/reviewed */ "./lib/sections/form/reviewed.js");
const selectItems_1 = __webpack_require__(/*! ./form/selectItems */ "./lib/sections/form/selectItems.js");
//
// Constants
//
const DEFAULT_FORM_MIN_HEIGHT = 140;
/** Top-level form-config keys that are not named form sections. */
const TOPLEVEL_KEYS = new Set([
    'title', 'progress_tracker', 'pass_value', 'fixed_value',
    'submission_buttons', '_fixed_kwargs', 'dynamic_forms', 'form',
    'annotation',
]);
/** Input types allowed directly at the top level of a form config. */
const TOPLEVEL_INPUTS = new Set(['select', 'textbox', 'checkbox', 'number']);
/** Annotation bounds in output-column order. */
const ANNOT_FIELDS = ['startTime', 'endTime', 'minFreq', 'maxFreq'];
//
// Public
//
/** The annotation form section of the annotator. */
class FormPanel {
    /** @param _kernel - Runs select-file loads and output-file reads/writes. */
    constructor(_kernel) {
        this._kernel = _kernel;
        // ── Signals ──────────────────────────────────────────────────
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
        /** Sync button was clicked — orchestrator handles the kernel call. */
        this.syncRequested = new signaling_1.Signal(this);
        /** A status message to show in the widget header. */
        this.statusChanged = new signaling_1.Signal(this);
        // ── Form state ───────────────────────────────────────────────
        this._formConfig = null;
        this._formValues = {};
        this._submitBtns = [];
        /** Named form sections (top-level config keys referenced by select form: items). */
        this._namedSections = new Map();
        this._requiredInputs = [];
        this._inputRefs = new Map();
        /** Each input's state right after build (value, or checked for checkboxes): restored per row. */
        this._inputInitial = new Map();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        this._templateElements = [];
        // ── Progress tracking ────────────────────────────────────────
        this._sessionCount = 0;
        this._fileCount = 0;
        this._accuracy = null;
        this._progressEls = [];
        this._accuracyConfig = null;
        // ── Annotation tool ──────────────────────────────────────────
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs = new Map();
        this._fixedDurationValue = 0;
        this._fixedDurationInput = null;
        this._fixedDurationLabel = null;
        // ── Multibox state ───────────────────────────────────────────
        this._multiboxEntries = [];
        this._activeBoxIndex = -1;
        this._multiboxFormName = null;
        this._multiboxNextId = 0;
        this._multiboxColorIdx = 0;
        this._multiboxContainer = null;
        // ── Reviewed state (for duplicate_entries=false) ─────────────
        this._reviewedMap = new Map();
        this._showingReviewedView = false;
        this._reviewedTool = '';
        this._reviewedMultiboxEntries = [];
        // ── Context provided by the orchestrator ─────────────────────
        this._rows = [];
        this._duplicateEntries = false;
        this._outputPath = '';
        this._dataIndexCol = '';
        this._outputIndexCol = '';
        this._syncConfig = {};
        this._syncBtn = null;
        this._selectedIdx = -1;
        this._filteredLength = 0;
        /** The row the form is showing (needed by submit / delete). */
        this._currentRow = null;
        this._submitting = false;
        /** Async form-structure work (rebuilds) runs one job at a time, in call order. */
        this._formWork = Promise.resolve();
        this._formWorkPending = 0;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `flex:0 0 auto;min-height:${DEFAULT_FORM_MIN_HEIGHT}px;padding:10px 14px 12px;background:${styles_1.COLORS.bgMantle};` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;
        this._dynFormEl = document.createElement('div');
        this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
        this.element.append(this._dynFormEl);
        // Enter submits (when allowed) — except in textareas and text inputs
        this.element.addEventListener('keydown', e => {
            var _a;
            if (e.key !== 'Enter' || e.shiftKey)
                return;
            const tag = (_a = e.target) === null || _a === void 0 ? void 0 : _a.tagName;
            if (tag === 'TEXTAREA')
                return;
            if (tag === 'INPUT' && e.target.type === 'text')
                return;
            const btn = this._submitBtns.find(b => !b.disabled);
            if (btn) {
                e.preventDefault();
                btn.click();
            }
        });
    }
    // ── Public API: setup ────────────────────────────────────────
    /** Set context needed by the form (called once after reading kernel vars). */
    setContext(opts) {
        var _a;
        if (opts.height) {
            this.element.style.minHeight = `${opts.height}px`;
        }
        this._formConfig = opts.formConfig;
        this._rows = opts.rows;
        this._duplicateEntries = opts.duplicateEntries;
        this._outputPath = opts.outputPath;
        this._dataIndexCol = opts.dataIndexCol;
        this._outputIndexCol = opts.outputIndexCol;
        this._syncConfig = (_a = opts.syncConfig) !== null && _a !== void 0 ? _a : {};
    }
    /** Update selection info (called each time a row is selected). Used for
     *  Prev/Next disabled states in the reviewed view. */
    setSelectionInfo(selectedIdx, filteredLength) {
        this._selectedIdx = selectedIdx;
        this._filteredLength = filteredLength;
    }
    /** Build the form from the current form config (top-level keys in config order). */
    async build() {
        this._resetFormState();
        if (this._dataIndexCol) {
            const col = this._outputIndexCol || this._dataIndexCol;
            this._passValueDefs.push({ sourceCol: this._dataIndexCol, col });
            this._formValues[col] = null;
        }
        const cfg = this._formConfig;
        if (!cfg) {
            this.element.style.display = 'none';
            return;
        }
        this.element.style.display = 'flex';
        await this._registerDynamicForms(cfg.dynamic_forms);
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
            else if (key === 'annotation') {
                await this._buildAnnotationElement(cfg.annotation, this._dynFormEl);
            }
            else if (key === 'form') {
                if (Array.isArray(cfg.form))
                    await this._buildFormSection(cfg.form, this._dynFormEl);
            }
            else if (key === 'submission_buttons') {
                this._buildSubmissionButtons(cfg.submission_buttons);
            }
            else if (key === '_fixed_kwargs') {
                for (const item of cfg._fixed_kwargs) {
                    if (item.fixed_value)
                        this._registerFixedValue(item.fixed_value);
                }
            }
            else if (!TOPLEVEL_KEYS.has(key)) {
                const sectionData = cfg[key];
                if (Array.isArray(sectionData)) {
                    const sectionDiv = this._createSectionDiv(key);
                    await this._buildFormSection(sectionData, sectionDiv);
                    this._dynFormEl.appendChild(sectionDiv);
                    this._namedSections.set(key, sectionDiv);
                }
                else if (TOPLEVEL_INPUTS.has(key)) {
                    await this._buildInputElement(key, sectionData, this._dynFormEl);
                }
            }
            // 'dynamic_forms' was handled above
        }
        for (const el of this._namedSections.values()) {
            if (!el.parentElement)
                this._dynFormEl.appendChild(el);
        }
        if (!cfg.submission_buttons)
            this._buildSubmissionButtons({ submit: true });
        this._validateForm();
    }
    /** Called each time a new row is selected. Rebuilds form vs. reviewed view. */
    updateFromRow(row) {
        if (this._isRowReviewed(row)) {
            this._showReviewedResult(row);
            return;
        }
        if (this._showingReviewedView) {
            // the form was replaced by a reviewed result view: rebuild it
            this._showingReviewedView = false;
            this._reviewedTool = '';
            this._reviewedMultiboxEntries = [];
            void this._enqueue(async () => {
                await this.build();
                this._applyRow(row);
            });
        }
        else if (this._formWorkPending > 0) {
            void this._enqueue(() => this._applyRow(row)); // after the queued rebuilds, in order
        }
        else {
            this._applyRow(row);
        }
    }
    /** Load output-file progress counts (session + total + accuracy).
     *  Called once during init. */
    async loadOutputFileProgress() {
        if (!this._outputPath)
            return;
        try {
            const raw = await this._kernel.exec((0, python_1.countOutputRows)(this._outputPath, this._outputExt()));
            this._fileCount = JSON.parse(raw).count;
        }
        catch (_a) {
            // output file may not exist yet
        }
        await this._refreshAccuracy();
        this._updateProgress();
    }
    /** Load reviewed state from the output file (called during init when
     *  duplicate_entries=false). Matches output rows to input rows via
     *  the configured data/output index columns. */
    async loadReviewedState() {
        if (this._duplicateEntries || !this._outputPath)
            return;
        this._reviewedMap.clear();
        let outputRows;
        try {
            outputRows = JSON.parse(await this._kernel.exec((0, python_1.readOutputRows)(this._outputPath, this._outputExt())));
        }
        catch (_a) {
            return;
        }
        const outCol = this._outputIndexCol;
        const srcCol = this._dataIndexCol;
        for (const outRow of outputRows) {
            if (!outCol || outRow[outCol] === undefined)
                continue;
            const outVal = outRow[outCol];
            const match = this._rows.find(r => String(r[srcCol]) === String(outVal));
            if (!match)
                continue;
            const key = match[srcCol];
            const arr = this._reviewedMap.get(key);
            if (arr)
                arr.push(outRow);
            else
                this._reviewedMap.set(key, [outRow]);
        }
    }
    // ── Public API: annotation (for Player) ──────────────────────
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
    /** Current fixed_duration value in seconds. */
    getFixedDuration() {
        return this._fixedDurationValue;
    }
    /** Read a single form value (for Player to read start_time/end_time/etc.). */
    getFormValue(col) {
        return this._formValues[col];
    }
    /** True when the multibox tool is active. */
    isMultiboxMode() {
        return this._activeTool === 'multibox';
    }
    /** The drawn boxes (multibox mode), in drawing order. */
    getMultiboxEntries() {
        return this._multiboxEntries;
    }
    /** Index of the active (highlighted) box, or -1. */
    getActiveBoxIndex() {
        return this._activeBoxIndex;
    }
    /** Add a drawn box (it becomes active, with the next chip color). */
    addMultiboxEntry(startTime, endTime, minFreq, maxFreq) {
        const entry = {
            id: this._multiboxNextId++,
            startTime, endTime, minFreq, maxFreq,
            formValues: {},
            color: styles_1.DISPLAY_CHIP_COLORS[this._multiboxColorIdx++ % styles_1.DISPLAY_CHIP_COLORS.length],
        };
        this._multiboxEntries.push(entry);
        this._activeBoxIndex = this._multiboxEntries.length - 1;
        this._syncAnnotInputsToBox(entry);
        void this._rebuildAnnotFormUI();
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    /** Make box ``index`` active; the annotation inputs show its bounds. */
    setActiveBox(index) {
        if (index < 0 || index >= this._multiboxEntries.length)
            return;
        this._activeBoxIndex = index;
        this._highlightActiveBoxCard();
        this._syncAnnotInputsToBox(this._multiboxEntries[index]);
        this.annotationChanged.emit(void 0);
    }
    /** Move one bound of box ``index`` (edge drag); the active box's inputs follow. */
    updateMultiboxBounds(index, field, value) {
        var _a;
        const entry = this._multiboxEntries[index];
        if (!entry)
            return;
        entry[field] = value;
        if (index === this._activeBoxIndex && ((_a = this._annotConfig) === null || _a === void 0 ? void 0 : _a[field])) {
            this._setAnnotValueInternal(field, value, false);
        }
        this.annotationChanged.emit(void 0);
    }
    /** Remove box ``index``. */
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
    /** Remove the active box (Delete key on the canvas). */
    removeActiveMultiboxEntry() {
        if (this._activeBoxIndex >= 0)
            this.removeMultiboxEntry(this._activeBoxIndex);
    }
    // ── Public API: reviewed state ───────────────────────────────
    /** Read the full reviewed map (for ClipTable row styling). */
    getReviewedMap() {
        return this._reviewedMap;
    }
    /** True if a row has been reviewed and duplicate_entries is off. */
    isReviewed(row) {
        return this._isRowReviewed(row);
    }
    /** True while the reviewed view replaces the form. */
    isShowingReviewedView() {
        return this._showingReviewedView;
    }
    /** The tool the reviewed annotation is drawn with ('' for none). */
    getReviewedTool() {
        return this._reviewedTool;
    }
    /** The reviewed boxes (when ``getReviewedTool()`` is ``multibox``). */
    getReviewedMultiboxEntries() {
        return this._reviewedMultiboxEntries;
    }
    /** Show the sync button busy ("Syncing…", disabled) or ready; the widget calls this when a sync ends. */
    setSyncBusy(busy) {
        var _a;
        if (!this._syncBtn)
            return;
        this._syncBtn.disabled = busy;
        this._syncBtn.style.opacity = busy ? '0.4' : '1';
        this._syncBtn.textContent = busy ? 'Syncing…' : ((_a = this._syncConfig.button) !== null && _a !== void 0 ? _a : 'Sync');
    }
    // ── Private: form building ───────────────────────────────────
    /** Clear everything ``build()`` creates. */
    _resetFormState() {
        this._dynFormEl.innerHTML = '';
        this._formValues = {};
        this._submitBtns = [];
        this._namedSections.clear();
        this._requiredInputs = [];
        this._inputRefs.clear();
        this._inputInitial.clear();
        this._sourceValueFields = [];
        this._passValueDefs = [];
        this._templateElements = [];
        this._annotConfig = null;
        this._activeTool = '';
        this._annotInputs.clear();
        this._showingReviewedView = false;
        this._sessionCount = 0;
        this._accuracy = null;
        this._progressEls = [];
        this._accuracyConfig = null;
    }
    /** A hidden named-section container (shown when a select / checkbox picks it). */
    _createSectionDiv(name) {
        const div = document.createElement('div');
        div.dataset.formSection = name;
        div.style.cssText = (0, styles_1.formRowStyle)(true);
        return div;
    }
    /** Build each ``dynamic_forms`` entry into a hidden named section. */
    async _registerDynamicForms(dynForms) {
        if (!dynForms || typeof dynForms !== 'object' || Array.isArray(dynForms))
            return;
        for (const [formName, rawElements] of Object.entries(dynForms)) {
            const elements = (0, formConfig_1.asElementList)(rawElements);
            if (!elements)
                continue;
            const sectionDiv = this._createSectionDiv(formName);
            await this._buildFormSection(elements, sectionDiv);
            this._namedSections.set(formName, sectionDiv);
        }
    }
    /** Build a list of form elements (inputs, text, lines, titles...) into ``container``. */
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
                container.appendChild(this._textElement(config));
            }
            else {
                await this._buildInputElement(type, config, container);
            }
        }
    }
    /** A ``text`` element (``[[column]]`` templates are resolved per row). */
    _textElement(config) {
        var _a;
        const d = document.createElement('div');
        d.style.cssText = (0, styles_1.mutedTextStyle)({ width: '100%' });
        const textStr = String(config && typeof config === 'object' ? ((_a = config.value) !== null && _a !== void 0 ? _a : '') : config);
        d.textContent = textStr;
        if (textStr.includes('\n'))
            d.style.whiteSpace = 'pre-wrap';
        if ((0, util_1.hasTemplatePlaceholders)(textStr))
            this._templateElements.push({ el: d, template: textStr });
        return d;
    }
    /**
     * Build one input (textbox / select / checkbox / number) with its label, register it, and
     * append it plus any named sections it can reveal.
     */
    async _buildInputElement(type, rawConfig, container) {
        var _a, _b, _c;
        const cfg = (rawConfig === true || rawConfig === null || rawConfig === undefined) ? {} : rawConfig;
        const labelText = (_a = cfg.label) !== null && _a !== void 0 ? _a : type;
        const col = (_b = cfg.column) !== null && _b !== void 0 ? _b : labelText;
        let built;
        if (type === 'textbox')
            built = this._buildTextbox(cfg, col);
        else if (type === 'select')
            built = await this._buildSelectInput(cfg, col);
        else if (type === 'checkbox')
            built = this._buildCheckbox(cfg, col);
        else if (type === 'number')
            built = this._buildNumber(cfg, col);
        else
            built = null;
        if (!built)
            return;
        const lbl = document.createElement('label');
        lbl.style.cssText = (0, styles_1.formLabelStyle)();
        const lblText = document.createTextNode(labelText);
        lbl.appendChild(lblText);
        if ((0, util_1.hasTemplatePlaceholders)(labelText)) {
            this._templateElements.push({ el: lblText, template: labelText });
        }
        if (cfg.source_value)
            this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
        if ((_c = cfg.required) !== null && _c !== void 0 ? _c : false)
            this._requiredInputs.push({ col, el: built.input });
        this._registerInput(col, built.input);
        lbl.appendChild(built.element);
        container.appendChild(lbl);
        for (const name of built.sections) {
            const sec = this._namedSections.get(name);
            if (sec)
                container.appendChild(sec);
        }
    }
    /** A textbox (``multiline`` -> textarea). */
    _buildTextbox(cfg, col) {
        var _a;
        const css = (0, styles_1.inputStyle)(cfg.width ? (0, styles_1.cssSize)(cfg.width) : '220px');
        let input;
        if (cfg.multiline) {
            const ta = document.createElement('textarea');
            ta.rows = 1;
            ta.style.cssText = css + `font-size:13px;resize:vertical;vertical-align:middle;height:28px;`;
            input = ta;
        }
        else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.style.cssText = css + `font-size:13px;`;
            input = inp;
        }
        input.addEventListener('input', () => { this._formValues[col] = input.value; this._validateForm(); });
        input.value = cfg.default == null ? '' : String(cfg.default);
        this._formValues[col] = (_a = cfg.default) !== null && _a !== void 0 ? _a : '';
        return { input, element: input, sections: [] };
    }
    /** A select; items with a ``form`` reveal that named section while selected. */
    async _buildSelectInput(cfg, col) {
        var _a;
        const flags = (0, selectItems_1.selectItemOptions)(cfg.items);
        const { items, selectedDefault } = (0, selectItems_1.parseSelectItems)(await this._loadSelectItems(cfg.items), flags.notAvailable);
        const formRefs = new Map();
        for (const item of items)
            if (item.formRef)
                formRefs.set(item.val, item.formRef);
        const allFormSections = new Set(formRefs.values());
        const built = (0, inputs_1.buildSelect)({
            items, filterBox: flags.filterBox, customValue: flags.customValue, variant: 'main',
            onChange: () => {
                const sel = built.select;
                this._formValues[col] = sel.value;
                if (allFormSections.size > 0)
                    this._showOnly(allFormSections, formRefs.get(sel.value));
                this._validateForm();
            },
        });
        if (cfg.width)
            built.select.style.width = (0, styles_1.cssSize)(cfg.width);
        if (cfg.default != null)
            built.select.value = String(cfg.default);
        this._formValues[col] = (_a = cfg.default) !== null && _a !== void 0 ? _a : selectedDefault;
        return { input: built.select, element: built.element, sections: [...allFormSections] };
    }
    /** A checkbox with checked/unchecked values; ``checked_form`` / ``unchecked_form`` sections. */
    _buildCheckbox(cfg, col) {
        var _a, _b, _c, _d;
        const checkedVal = (_b = (_a = cfg.checked_value) !== null && _a !== void 0 ? _a : cfg.yes_value) !== null && _b !== void 0 ? _b : true;
        const uncheckedVal = (_d = (_c = cfg.unchecked_value) !== null && _c !== void 0 ? _c : cfg.no_value) !== null && _d !== void 0 ? _d : false;
        const checkedForm = cfg.checked_form;
        const uncheckedForm = cfg.unchecked_form;
        const forms = new Set();
        if (checkedForm)
            forms.add(checkedForm);
        if (uncheckedForm)
            forms.add(uncheckedForm);
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = Boolean(cfg.default);
        inp.addEventListener('change', () => {
            this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
            if (forms.size > 0)
                this._showOnly(forms, inp.checked ? checkedForm : uncheckedForm);
            this._validateForm();
        });
        this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
        const sections = [checkedForm, uncheckedForm].filter((f) => !!f);
        return { input: inp, element: inp, sections };
    }
    /** A number input (``value`` is its initial value). */
    _buildNumber(cfg, col) {
        var _a;
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
        inp.style.cssText = (0, styles_1.inputStyle)(cfg.width ? (0, styles_1.cssSize)(cfg.width) : '80px') + `font-size:13px;`;
        inp.addEventListener('input', () => {
            this._formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
            this._validateForm();
        });
        this._formValues[col] = (_a = cfg.value) !== null && _a !== void 0 ? _a : null;
        return { input: inp, element: inp, sections: [] };
    }
    /** Show named section ``active`` and hide the other ``sections``. */
    _showOnly(sections, active) {
        for (const name of sections) {
            const el = this._namedSections.get(name);
            if (el)
                el.style.display = name === active ? 'flex' : 'none';
        }
    }
    /** A select's items as raw ``[value, label, formRef?]`` tuples (files load in the kernel). */
    _loadSelectItems(items) {
        return (0, selectItems_1.loadRawSelectItems)(items, async (path, valueCol, labelCol) => {
            try {
                const result = await this._kernel.exec((0, python_1.loadSelectItems)(path, valueCol, labelCol));
                return JSON.parse(result);
            }
            catch (_a) {
                return [];
            }
        });
    }
    /** The submission row (Prev / Skip / Submit, sync button) plus inline extras. */
    _buildSubmissionButtons(cfg) {
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
                btnContainer.appendChild(this._submissionButton(key, val === true ? {} : val));
            }
        }
        if (this._syncConfig.button) {
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            btnContainer.appendChild(spacer);
            this._syncBtn = document.createElement('button');
            this._syncBtn.textContent = this._syncConfig.button;
            this._syncBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:12px;`;
            this._syncBtn.addEventListener('click', () => this._onSync());
            btnContainer.appendChild(this._syncBtn);
        }
        this._dynFormEl.appendChild(btnContainer);
    }
    /** A ``previous`` / ``next`` / ``submit`` button (an empty button for unknown keys). */
    _submissionButton(key, btnCfg) {
        var _a, _b, _c;
        const btn = document.createElement('button');
        const showIcon = btnCfg.icon !== false;
        if (key === 'previous') {
            btn.textContent = (_a = btnCfg.label) !== null && _a !== void 0 ? _a : '◀ Prev';
            btn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;`;
            btn.addEventListener('click', () => this.prevRequested.emit(void 0));
        }
        else if (key === 'next') {
            btn.textContent = ((_b = btnCfg.label) !== null && _b !== void 0 ? _b : 'Skip') + (showIcon ? ' →' : '');
            btn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;`;
            btn.addEventListener('click', () => this.nextRequested.emit(void 0));
        }
        else if (key === 'submit') {
            btn.textContent = (showIcon ? '✓ ' : '') + ((_c = btnCfg.label) !== null && _c !== void 0 ? _c : 'Submit');
            btn.style.cssText = (0, styles_1.btnStyle)(true) + `font-size:13px;opacity:0.4;`;
            btn.disabled = true;
            btn.addEventListener('click', () => void this._onVerify());
            this._submitBtns.push(btn);
        }
        return btn;
    }
    /** Sync button: show it busy and ask the widget to sync. */
    _onSync() {
        if (!this._syncBtn)
            return;
        this.setSyncBusy(true);
        this.syncRequested.emit(void 0);
    }
    // ── Private: annotation element ──────────────────────────────
    /**
     * Build the annotation element: tool dropdown (several tools), fixed-window input, the
     * bound inputs, and the annotation-form / multibox-card container.
     */
    async _buildAnnotationElement(config, container) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!config || typeof config !== 'object')
            return;
        const { config: ac, columns } = (0, annotationConfig_1.parseAnnotationConfig)(config);
        for (const col of columns)
            this._formValues[col] = null;
        if (config.form)
            this._multiboxFormName = (_a = ac.form) !== null && _a !== void 0 ? _a : null;
        this._annotConfig = ac;
        this._activeTool = (_b = ac.tools[0]) !== null && _b !== void 0 ? _b : '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `display:flex;align-items:center;gap:12px;flex-wrap:wrap;`;
        if (ac.tools.length > 1)
            wrapper.appendChild(this._buildToolSelect(ac.tools));
        if (ac.fixedDuration)
            wrapper.appendChild(this._buildFixedDurationInput(ac));
        const labels = {
            startTime: (_d = (_c = config.start_time) === null || _c === void 0 ? void 0 : _c.label) !== null && _d !== void 0 ? _d : 'start_time',
            endTime: (_f = (_e = config.end_time) === null || _e === void 0 ? void 0 : _e.label) !== null && _f !== void 0 ? _f : 'end_time',
            minFreq: (_h = (_g = config.min_frequency) === null || _g === void 0 ? void 0 : _g.label) !== null && _h !== void 0 ? _h : 'min_frequency',
            maxFreq: (_k = (_j = config.max_frequency) === null || _j === void 0 ? void 0 : _j.label) !== null && _k !== void 0 ? _k : 'max_frequency',
        };
        for (const field of ANNOT_FIELDS) {
            if (ac[field])
                wrapper.appendChild(this._buildAnnotInput(field, labels[field]));
        }
        container.appendChild(wrapper);
        // Annotation form container — per-box cards in multibox mode, or one form instance
        if (ac.form || ac.tools.includes('multibox')) {
            this._multiboxContainer = document.createElement('div');
            this._multiboxContainer.style.cssText = `display:flex;flex-direction:column;gap:6px;overflow-y:auto;`;
            container.appendChild(this._multiboxContainer);
            // Direct, not queued: build() may itself be running inside the queue.
            await this._renderAnnotFormUI();
        }
    }
    /** The "tool" dropdown. */
    _buildToolSelect(tools) {
        const lbl = document.createElement('label');
        lbl.style.cssText = (0, styles_1.formLabelStyle)();
        lbl.textContent = 'tool';
        const sel = document.createElement('select');
        sel.style.cssText = (0, styles_1.selectStyle)() + `font-size:13px;`;
        for (const t of tools) {
            const o = document.createElement('option');
            o.value = t;
            o.textContent = t.replace(/_/g, ' ');
            sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
            this._activeTool = sel.value;
            this._updateFixedDurationState();
            if (this._currentRow)
                this._applyAnnotValues(this._currentRow);
            void this._rebuildAnnotFormUI();
            this.activeToolChanged.emit(this._activeTool);
            this.annotationChanged.emit(void 0);
        });
        lbl.appendChild(sel);
        return lbl;
    }
    /** The fixed-duration "window" input (editable only for ``initial_window`` configs). */
    _buildFixedDurationInput(ac) {
        const fd = ac.fixedDuration;
        this._fixedDurationValue = fd.value;
        const lbl = document.createElement('label');
        lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:12px;gap:5px;`;
        lbl.textContent = 'window';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(fd.value);
        inp.style.cssText = (0, styles_1.inputStyle)('70px') + `font-size:12px;`;
        if (fd.step)
            inp.step = String(fd.step);
        if (fd.min != null)
            inp.min = String(fd.min);
        if (fd.max != null)
            inp.max = String(fd.max);
        const commitValue = () => {
            let v = parseFloat(inp.value);
            if (isNaN(v) || v < 0)
                return;
            if (fd.min != null)
                v = Math.max(fd.min, v);
            if (fd.max != null)
                v = Math.min(fd.max, v);
            this._fixedDurationValue = v;
            inp.value = String(v);
            this._resizeFixedDuration();
        };
        inp.addEventListener('blur', commitValue);
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitValue();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
                requestAnimationFrame(commitValue);
        });
        inp.addEventListener('pointerup', () => requestAnimationFrame(commitValue));
        lbl.append(inp, this._unitSpan('s'));
        this._fixedDurationInput = inp;
        this._fixedDurationLabel = lbl;
        this._updateFixedDurationState();
        return lbl;
    }
    /** A number input for one annotation bound (typing updates the canvas). */
    _buildAnnotInput(field, label) {
        const lbl = document.createElement('label');
        lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:12px;gap:5px;`;
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = field.includes('Freq') ? '1' : '0.01';
        inp.style.cssText = (0, styles_1.inputStyle)('80px') + `font-size:12px;`;
        inp.addEventListener('input', () => {
            this._setAnnotValueInternal(field, inp.value === '' ? null : parseFloat(inp.value), true);
        });
        lbl.append(inp, this._unitSpan(field.includes('Freq') ? 'Hz' : 's'));
        this._annotInputs.set(field, inp);
        return lbl;
    }
    /** A small muted unit label (``s``, ``Hz``). */
    _unitSpan(unit) {
        const u = document.createElement('span');
        u.textContent = unit;
        u.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:10px;`;
        return u;
    }
    // ── Private: annotation form / multibox cards ────────────────
    /** Re-render the annotation form area (queued: rebuilds await the kernel and must not overlap). */
    _rebuildAnnotFormUI() {
        return this._enqueue(() => this._renderAnnotFormUI());
    }
    /** Run ``work`` after all previously queued form work, one job at a time. */
    _enqueue(work) {
        this._formWorkPending++;
        this._formWork = this._formWork
            .then(work)
            .catch(e => console.error('[JBA] form update failed:', e))
            .finally(() => { this._formWorkPending--; });
        return this._formWork;
    }
    /** Drop the registrations of inputs that live inside ``container`` (it's about to be rebuilt). */
    _forgetInputsIn(container) {
        const inside = (el) => !!el && container.contains(el);
        for (const [col, el] of this._inputRefs) {
            if (inside(el)) {
                this._inputRefs.delete(col);
                this._inputInitial.delete(col);
            }
        }
        this._requiredInputs = this._requiredInputs.filter(r => !inside(r.el));
        this._sourceValueFields = this._sourceValueFields.filter(f => this._inputRefs.has(f.col));
        this._templateElements = this._templateElements.filter(t => !inside(t.el));
    }
    /**
     * Fill the annotation form container: one instance of the annotation form (other tools),
     * or a card per box with its own form (multibox; a hint when there are no boxes).
     */
    async _renderAnnotFormUI() {
        var _a, _b;
        const host = this._multiboxContainer;
        if (!host)
            return;
        this._forgetInputsIn(host);
        host.innerHTML = '';
        const formCfg = this._multiboxFormName
            ? (0, formConfig_1.asElementList)((_b = (_a = this._formConfig) === null || _a === void 0 ? void 0 : _a.dynamic_forms) === null || _b === void 0 ? void 0 : _b[this._multiboxFormName])
            : null;
        if (!this.isMultiboxMode()) {
            if (formCfg) {
                const formDiv = document.createElement('div');
                formDiv.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;`;
                await this._buildFormSection(formCfg, formDiv);
                host.appendChild(formDiv);
            }
            this._validateForm();
            return;
        }
        if (this._multiboxEntries.length === 0) {
            const hint = document.createElement('div');
            hint.style.cssText = (0, styles_1.mutedTextStyle)({ fontSize: 11 });
            hint.textContent = text_1.HINT.drawBoxes;
            host.appendChild(hint);
            return;
        }
        for (let i = 0; i < this._multiboxEntries.length; i++) {
            const entry = this._multiboxEntries[i];
            const card = (0, multiboxCards_1.buildBoxCard)(entry, i, i === this._activeBoxIndex, {
                onSelect: () => this.setActiveBox(i),
                onRemove: () => this.removeMultiboxEntry(i),
            });
            if (formCfg) {
                const formDiv = document.createElement('div');
                formDiv.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
                await (0, multiboxCards_1.buildBoxForm)(formCfg, formDiv, entry, items => this._loadSelectItems(items), () => this._validateForm());
                card.appendChild(formDiv);
            }
            host.appendChild(card);
        }
        this._validateForm();
    }
    /** Recolor the cards' left strips: the active box's color, transparent for the others. */
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
    /** Copy a box's bounds into the annotation inputs / values. */
    _syncAnnotInputsToBox(entry) {
        if (!entry || !this._annotConfig)
            return;
        for (const field of ANNOT_FIELDS) {
            if (this._annotConfig[field])
                this._setAnnotValueInternal(field, entry[field], false);
        }
    }
    // ── Private: values ──────────────────────────────────────────
    /** Track an input and remember its just-built state, which ``_applyRow`` restores. */
    _registerInput(col, el) {
        this._inputRefs.set(col, el);
        const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
        this._inputInitial.set(col, isCheckbox ? el.checked : el.value);
    }
    /**
     * Show ``row`` in the form: clear boxes, hide named sections, reset inputs to their
     * built state, then apply source values, annotation values, pass values and templates.
     */
    _applyRow(row) {
        var _a;
        this._currentRow = row;
        this._multiboxEntries = [];
        this._activeBoxIndex = -1;
        // multibox: clear the box cards. The single annotation sub-form is NOT rebuilt per row
        // (that re-registered its inputs every row); its inputs are reset below like the rest.
        if (this.isMultiboxMode())
            void this._rebuildAnnotFormUI();
        for (const sectionEl of this._namedSections.values())
            sectionEl.style.display = 'none';
        // Reset every input to its state right after build (defaults, selected:: items, number
        // values, checkbox checked/unchecked values). Firing the input's own event recomputes
        // _formValues and re-shows any form section the default reveals, exactly as at build.
        for (const [col, el] of this._inputRefs) {
            const initial = this._inputInitial.get(col);
            if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                el.checked = initial === true;
                el.dispatchEvent(new Event('change'));
            }
            else {
                el.value = typeof initial === 'string' ? initial : '';
                el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
            }
        }
        for (const { col, sourceCol } of this._sourceValueFields) {
            const val = row[sourceCol];
            const el = this._inputRefs.get(col);
            if (val !== undefined && el) {
                el.value = String(val);
                this._formValues[col] = val;
            }
        }
        this._applyAnnotValues(row);
        for (const { sourceCol, col } of this._passValueDefs) {
            this._formValues[col] = (_a = row[sourceCol]) !== null && _a !== void 0 ? _a : null;
        }
        for (const { el, template } of this._templateElements) {
            el.textContent = (0, util_1.resolveTemplate)(template, row);
        }
        // Annotation rendering on the canvas depends on these values
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    /**
     * Pre-fill the annotation from the row for the time tools (start / start+end from the
     * row or its ``source_value`` columns); clear everything else.
     */
    _applyAnnotValues(row) {
        const ac = this._annotConfig;
        if (!ac)
            return;
        const tool = this._activeTool;
        const fromRow = (sv, fallback) => sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : fallback;
        if (ac.startTime) {
            const fill = tool === 'time_select' || tool === 'start_end_time_select';
            this._setAnnotValueInternal('startTime', fill ? fromRow(ac.startTime.sourceValue, row.start_time) : null, false);
        }
        if (ac.endTime) {
            const fill = tool === 'start_end_time_select';
            this._setAnnotValueInternal('endTime', fill ? fromRow(ac.endTime.sourceValue, row.end_time) : null, false);
        }
        if (ac.minFreq)
            this._setAnnotValueInternal('minFreq', null, false);
        if (ac.maxFreq)
            this._setAnnotValueInternal('maxFreq', null, false);
    }
    /** Enable / dim the window input for the active tool. */
    _updateFixedDurationState() {
        const ac = this._annotConfig;
        if (!(ac === null || ac === void 0 ? void 0 : ac.fixedDuration) || !this._fixedDurationInput || !this._fixedDurationLabel)
            return;
        const isActive = this._activeTool === 'fixed_duration';
        const canEdit = ac.fixedDuration.editable && isActive;
        this._fixedDurationInput.disabled = !canEdit;
        this._fixedDurationInput.style.opacity = canEdit ? '1' : '0.5';
        this._fixedDurationLabel.style.opacity = isActive ? '1' : '0.35';
    }
    /** Resize the placed fixed window around its center after the window length changed. */
    _resizeFixedDuration() {
        var _a, _b;
        const ac = this._annotConfig;
        const stCol = (_a = ac === null || ac === void 0 ? void 0 : ac.startTime) === null || _a === void 0 ? void 0 : _a.col;
        const etCol = (_b = ac === null || ac === void 0 ? void 0 : ac.endTime) === null || _b === void 0 ? void 0 : _b.col;
        if (!stCol || !etCol)
            return;
        const st = this._formValues[stCol];
        const et = this._formValues[etCol];
        if (st == null || et == null)
            return;
        const center = (st + et) / 2;
        const half = this._fixedDurationValue / 2;
        this._setAnnotValueInternal('startTime', center - half, false);
        this._setAnnotValueInternal('endTime', center + half, false);
        this.annotationChanged.emit(void 0);
    }
    /** Set an annotation bound's value and input; re-validate; optionally notify the Player. */
    _setAnnotValueInternal(field, val, emit) {
        var _a, _b;
        const col = (_b = (_a = this._annotConfig) === null || _a === void 0 ? void 0 : _a[field]) === null || _b === void 0 ? void 0 : _b.col;
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
    /**
     * Enable Submit when every visible required input has a value and, in multibox mode,
     * there is at least one box and every box's required fields are filled.
     */
    _validateForm() {
        var _a, _b;
        const filled = (val) => val !== null && val !== undefined && val !== '';
        let allSatisfied = this._requiredInputs.every(({ col, el }) => {
            if (!el.isConnected)
                return true; // skip stale refs from rebuilt multibox forms
            const section = el.closest('[data-form-section]');
            if (section && section.style.display === 'none')
                return true;
            return filled(this._formValues[col]);
        });
        if (this.isMultiboxMode()) {
            if (this._multiboxEntries.length === 0) {
                allSatisfied = false;
            }
            else if (this._multiboxFormName) {
                const formCfg = (0, formConfig_1.asElementList)((_b = (_a = this._formConfig) === null || _a === void 0 ? void 0 : _a.dynamic_forms) === null || _b === void 0 ? void 0 : _b[this._multiboxFormName]);
                const cols = formCfg ? (0, formConfig_1.requiredColumns)(formCfg) : [];
                if (!this._multiboxEntries.every(e => cols.every(c => filled(e.formValues[c])))) {
                    allSatisfied = false;
                }
            }
        }
        this._submitBtns.forEach(btn => {
            btn.disabled = !allSatisfied;
            btn.style.opacity = allSatisfied ? '1' : '0.4';
        });
    }
    /** ``pass_value``: copy a data column into the output (``name`` or ``{source_column, column}``). */
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
    /** ``fixed_value``: a constant output column (``{column, value}``). */
    _registerFixedValue(config) {
        var _a;
        if (!config || typeof config !== 'object')
            return;
        const col = config.column;
        if (!col)
            return;
        this._formValues[col] = (_a = config.value) !== null && _a !== void 0 ? _a : null;
    }
    /** The output file's extension (lower case). */
    _outputExt() {
        var _a, _b;
        return (_b = (_a = this._outputPath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    }
    // ── Private: titles / progress ───────────────────────────────
    /** A section title, optionally with the progress line on the right. */
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
    /** A full-width progress line. */
    _appendProgressTracker(container) {
        const d = document.createElement('div');
        d.style.cssText = `width:100%;`;
        d.appendChild(this._createProgressEl());
        container.appendChild(d);
    }
    /** A progress text element (kept up to date by ``_updateProgress``). */
    _createProgressEl() {
        const el = document.createElement('span');
        el.style.cssText =
            `font-size:11px;font-weight:400;letter-spacing:0;color:${styles_1.COLORS.textMuted};` +
                `font-family:ui-monospace,monospace;`;
        this._progressEls.push(el);
        this._updateProgress();
        return el;
    }
    /** Refresh every progress element. */
    _updateProgress() {
        const text = (0, progress_1.formatProgress)(this._sessionCount, this._fileCount, this._rows.length, this._accuracy);
        for (const el of this._progressEls)
            el.textContent = text;
    }
    /** Recompute the accuracy from the output file (null without an accuracy check / rows). */
    async _refreshAccuracy() {
        if (!this._accuracyConfig || !this._outputPath) {
            this._accuracy = null;
            return;
        }
        try {
            const rows = JSON.parse(await this._kernel.exec((0, python_1.readOutputRows)(this._outputPath, this._outputExt())));
            this._accuracy = (0, progress_1.accuracyPercent)(rows, this._accuracyConfig);
        }
        catch (_a) {
            this._accuracy = null;
        }
    }
    // ── Private: reviewed view ───────────────────────────────────
    _isRowReviewed(row) {
        return !this._duplicateEntries && this._reviewedMap.has(row[this._dataIndexCol]);
    }
    /** Replace the form with the saved values of ``row`` and draw its saved annotation. */
    _showReviewedResult(row) {
        this._dynFormEl.innerHTML = '';
        this._submitBtns = [];
        this._showingReviewedView = true;
        const rows = this._reviewedMap.get(row[this._dataIndexCol]);
        if (!rows || rows.length === 0)
            return;
        this._dynFormEl.append(...(0, reviewed_1.buildReviewedView)(rows, {
            canPrev: this._selectedIdx !== 0,
            canNext: this._selectedIdx < this._filteredLength - 1,
            onPrev: () => this.prevRequested.emit(void 0),
            onNext: () => this.nextRequested.emit(void 0),
            onDelete: () => void this._onDeleteReview(row),
        }));
        const ann = (0, reviewed_1.reviewedAnnotation)(rows, this._annotConfig);
        this._reviewedTool = ann.tool;
        this._reviewedMultiboxEntries = ann.boxes;
        Object.assign(this._formValues, ann.values);
        this.annotationChanged.emit(void 0);
    }
    // ── Private: submit / delete ─────────────────────────────────
    /** Submit handler: one guarded write per submit (no double-clicks, no partial multibox saves). */
    async _onVerify() {
        if (this._submitting || !this._currentRow || !this._outputPath)
            return;
        this._submitting = true;
        this._setSubmitBusy(true);
        try {
            await this._writeSubmission(this._currentRow);
        }
        finally {
            this._submitting = false;
            this._setSubmitBusy(false);
        }
    }
    /** Write the current form (one row, or one row per multibox box) in a single kernel call. */
    async _writeSubmission(activeRow) {
        const multibox = this.isMultiboxMode() && this._multiboxEntries.length > 0;
        const rows = multibox
            ? this._multiboxEntries.map(entry => this._multiboxRow(entry))
            : [Object.assign({}, this._formValues)];
        try {
            await this._kernel.exec((0, python_1.writeOutputRows)(this._outputPath, rows));
        }
        catch (e) {
            if (e instanceof kernel_1.KernelError)
                console.error('[JBA] Write failed:', e.traceback);
            this.statusChanged.emit({ message: `❌ Write failed: ${(0, util_1.errorMessage)(e)}`, error: true });
            return;
        }
        const clipId = activeRow[this._dataIndexCol];
        this.statusChanged.emit({
            message: multibox
                ? `✓ Saved ${rows.length} boxes for clip ${clipId} → ${this._outputPath}`
                : `✓ Saved clip ${clipId} → ${this._outputPath}`,
            error: false,
        });
        this._sessionCount++;
        if (!this._duplicateEntries) {
            this._reviewedMap.set(clipId, rows.map(r => (Object.assign({}, r))));
        }
        void this._refreshAccuracy().then(() => this._updateProgress());
        void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
        this.setSyncBusy(false);
        this.submitted.emit(multibox ? { _multibox: true, count: rows.length } : rows[0]);
    }
    /** One output row for a multibox box: shared form values + the box bounds + its own form. */
    _multiboxRow(entry) {
        var _a, _b;
        const row = Object.assign({}, this._formValues);
        for (const field of ANNOT_FIELDS) {
            const col = (_b = (_a = this._annotConfig) === null || _a === void 0 ? void 0 : _a[field]) === null || _b === void 0 ? void 0 : _b.col;
            if (col) {
                delete row[col]; // re-add so the bound columns come last, after the form
                row[col] = entry[field];
            }
        }
        return Object.assign(row, entry.formValues);
    }
    /** Disable the submit buttons while a write is in flight; re-validate afterwards. */
    _setSubmitBusy(busy) {
        if (busy) {
            for (const btn of this._submitBtns)
                btn.disabled = true;
        }
        else {
            this._validateForm();
        }
    }
    /** "Delete this review": confirm, delete the row's output rows, then show the form again. */
    async _onDeleteReview(row) {
        const answer = await (0, util_1.showDialog)({
            title: 'Delete review',
            body: 'Delete this review? This cannot be undone.',
            buttons: [{ label: 'Cancel' }, { label: 'Delete', primary: true }],
        });
        if (answer !== 'Delete')
            return;
        const rowIdx = row[this._dataIndexCol];
        const matchExpr = `str(r.get('${(0, util_1.escPy)(this._outputIndexCol)}','')) == '${(0, util_1.escPy)(String(rowIdx))}'`;
        try {
            await this._kernel.exec((0, python_1.deleteOutputRow)(this._outputPath, matchExpr));
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Delete failed: ${(0, util_1.errorMessage)(e)}`, error: true });
            return;
        }
        this._reviewedMap.delete(rowIdx);
        this._reviewedTool = '';
        this._reviewedMultiboxEntries = [];
        // the deleted rows were counted in the file total: recount it (and restart the session)
        this._sessionCount = 0;
        this._fileCount = 0;
        await this.loadOutputFileProgress();
        await this._enqueue(async () => {
            await this.build();
            this._applyRow(row);
        });
        this.statusChanged.emit({ message: `✓ Review deleted for clip ${rowIdx}`, error: false });
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
 * Shows time range, resolved title/text templates, and Prev/Next navigation.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
//
// Constants
//
const DEFAULT_INFO_CARD_MIN_HEIGHT = 34;
//
// Public
//
/** The info card between the clip table and the player. */
class InfoCard {
    constructor() {
        this.prevRequested = new signaling_1.Signal(this);
        this.nextRequested = new signaling_1.Signal(this);
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;align-items:center;gap:10px;padding:6px 12px;` +
                `background:${styles_1.COLORS.bgMantle};border-bottom:1px solid ${styles_1.COLORS.bgSurface0};flex-shrink:0;min-height:${DEFAULT_INFO_CARD_MIN_HEIGHT}px;`;
        this.element.innerHTML =
            `<span style="font-size:12px;color:${styles_1.COLORS.textMuted};font-style:italic;">No selection</span>`;
    }
    setHeight(h) {
        if (h) {
            this.element.style.minHeight = `${h}px`;
        }
    }
    render(row, opts) {
        this.element.innerHTML = '';
        const sep = () => {
            const s = document.createElement('span');
            s.style.cssText = `color:${styles_1.COLORS.bgSurface1};font-size:11px;flex-shrink:0;`;
            s.textContent = '|';
            return s;
        };
        const items = [];
        items.push((() => {
            const s = document.createElement('span');
            s.style.cssText = `font-size:12px;color:${styles_1.COLORS.textSubtle};flex-shrink:0;`;
            s.textContent = `${(0, util_1.fmtTime)(row.start_time)} – ${(0, util_1.fmtTime)(row.end_time)}`;
            return s;
        })());
        if (opts.titleTemplate) {
            const resolved = (0, util_1.resolveTemplate)(opts.titleTemplate, row);
            if (resolved) {
                const titleSpan = document.createElement('span');
                titleSpan.style.cssText = `font-size:13px;font-weight:600;color:${styles_1.COLORS.textPrimary};flex-shrink:0;`;
                titleSpan.textContent = resolved;
                items.unshift(titleSpan);
            }
        }
        if (opts.textTemplate) {
            const resolved = (0, util_1.resolveTemplate)(opts.textTemplate, row);
            if (resolved) {
                const textSpan = document.createElement('span');
                textSpan.style.cssText = `font-size:12px;color:${styles_1.COLORS.textSubtle};flex-shrink:0;`;
                textSpan.textContent = resolved;
                items.push(textSpan);
            }
        }
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
 * Owns the player controls bar, spectrogram canvas, playback bar, and all mouse / keyboard
 * interaction for the annotation tools. Reads annotation config and values from FormPanel
 * and writes them back through its setters.
 *
 * Related modules: ``playerControls`` builds the DOM, ``playerGeometry`` holds the pure
 * coordinate math, ``playerRender`` draws the overlays.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const modal_1 = __webpack_require__(/*! ../modal */ "./lib/modal.js");
const python_1 = __webpack_require__(/*! ../python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const annotationTools_1 = __webpack_require__(/*! ./annotationTools */ "./lib/sections/annotationTools.js");
const audioPath_1 = __webpack_require__(/*! ./audioPath */ "./lib/sections/audioPath.js");
const playerControls_1 = __webpack_require__(/*! ./playerControls */ "./lib/sections/playerControls.js");
const playerGeometry_1 = __webpack_require__(/*! ./playerGeometry */ "./lib/sections/playerGeometry.js");
const playerRender_1 = __webpack_require__(/*! ./playerRender */ "./lib/sections/playerRender.js");
//
// Constants
//
const DEFAULT_CANVAS_HEIGHT = 260;
/** Smallest zoom box (fraction of the view per side) that zooms. */
const MIN_ZOOM_BOX_FRAC = 0.02;
/** Arrow-key pan step (fraction of the view). */
const PAN_STEP = 0.1;
const RESIZE_DEBOUNCE_MS = 150;
/** Length loaded when the row has no end_time (s). */
const DEFAULT_ROW_DURATION_SEC = 12;
const REMOTE_LOAD_MSG = {
    url: '⬇ Loading audio…',
    s3: '⬇ Loading audio from S3…',
    gcs: '⬇ Loading audio from GCS…',
};
const DEFAULT_VIZ_META = [
    { type: 'builtin', key: 'linear', label: 'Linear', freq_scale: 'linear', index: 0 },
    { type: 'builtin', key: 'mel', label: 'Mel', freq_scale: 'mel', index: 1 },
];
//
// Public
//
/** The spectrogram player section of the annotator. */
class Player {
    /**
     * @param _kernel - Runs the spectrogram pipeline and capture saves.
     * @param _form - Source of the annotation config and values.
     */
    constructor(_kernel, _form) {
        this._kernel = _kernel;
        this._form = _form;
        /** Status message for the widget header. */
        this.statusChanged = new signaling_1.Signal(this);
        // ── Player state ─────────────────────────────────────────────
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
        this._freqMin = 0;
        this._freqMax = 0;
        this._playheadDrag = false;
        this._playRegion = null;
        // ── Zoom state (client-side crop of the spectrogram image) ───
        // View fractions: 0..1 range over the full spectrogram image (y: 0 = low freq)
        this._viewXMin = 0;
        this._viewXMax = 1;
        this._viewYMin = 0;
        this._viewYMax = 1;
        this._panDrag = null;
        this._zoomBoxActive = false;
        this._panToolActive = false;
        this._zoomBoxDrag = null;
        this._zoomBoxMoveHandler = null;
        this._zoomBoxUpHandler = null;
        this._specResolutions = ['1000', '2000', '4000'];
        this._canvasHeight = DEFAULT_CANVAS_HEIGHT;
        // ── Visualization state ──────────────────────────────────────
        this._vizMeta = [];
        this._currentFreqScale = 'linear';
        this._freqScaleLUT = null; // 256 frac values for 'lut' scale
        // ── Context ──────────────────────────────────────────────────
        this._audioConfig = { type: 'path', value: '', prefix: '', suffix: '', fallback: '' };
        this._captureLabel = '';
        this._captureDir = '';
        this._titleTemplate = '';
        this._currentRow = null;
        this._dataIndexCol = 'id';
        this.element = document.createElement('div');
        this.element.style.cssText = `display:contents;`; // transparent wrapper
        this._dom = (0, playerControls_1.buildPlayerDom)({
            onLoad: () => void this._loadAudio(),
            onDirty: () => this._setLoadBtnDirty(),
            onApplyViewBounds: () => this._applyViewBounds(),
            onToggleZoomBox: () => this._setViewTool(this._zoomBoxActive ? null : 'zoom'),
            onTogglePan: () => this._setViewTool(this._panToolActive ? null : 'pan'),
            onResetZoom: () => this._resetZoom(),
            onCapture: () => void this._onCapture(),
            onTogglePlay: () => this._togglePlay(),
        }, DEFAULT_CANVAS_HEIGHT);
        this._canvas = this._dom.canvas;
        this._audio = this._dom.audio;
        this._tools = new annotationTools_1.AnnotationTools(_form, {
            timeToX: t => this._timeToX(t),
            xToTime: x => this._xToTime(x),
            yToFreq: y => this._yToFreq(y),
            pixelBox: (st, et, flo, fhi) => this._pixelBox(st, et, flo, fhi),
            segmentRange: () => [this._segLoadStart, this._segLoadStart + this._segDuration],
            renderFrame: () => this._renderFrame(),
            context: () => this._canvas.getContext('2d'),
            playRange: (start, end) => this._playRange(start, end),
            updateAnnotDisplay: () => this._updateAnnotDisplay(),
        });
        this._connectCanvasEvents();
        this.element.append(...this._dom.bars);
    }
    // ── Public API ───────────────────────────────────────────────
    /** Set context after kernel vars are read. */
    setContext(opts) {
        if (opts.height) {
            this._canvasHeight = opts.height;
            this._dom.canvasContainer.style.flex = `0 0 ${opts.height}px`;
        }
        this._audioConfig = opts.audioConfig;
        this._captureLabel = opts.captureLabel;
        this._captureDir = opts.captureDir;
        this._captureHeight = opts.captureHeight;
        this._titleTemplate = opts.titleTemplate;
        this._dataIndexCol = opts.dataIndexCol;
        this._dom.bufferInput.value = String(opts.defaultBuffer);
        this._specResolutions = opts.specResolutions;
        this._rebuildResolutionSelect();
        this._vizMeta = opts.vizMeta.length > 0 ? opts.vizMeta : DEFAULT_VIZ_META;
        this._rebuildVizSelect();
        if (this._captureLabel) {
            this._dom.captureBtn.textContent = this._captureLabel;
            this._dom.captureBtn.style.display = '';
        }
        this._updateCursorForZoom();
    }
    /** Load audio for a row (called when a row is selected). */
    async loadRow(row) {
        this._currentRow = row;
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
    /** Clear the annotation readout in the playback bar (a new row was selected). */
    clearAnnotDisplay() {
        this._dom.signalTimeDisplay.textContent = '';
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
                }, RESIZE_DEBOUNCE_MS);
            }
        });
        this._resizeObserver.observe(this._dom.canvasContainer);
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
    // ── Private: wiring ──────────────────────────────────────────
    /** Canvas mouse / keyboard handlers and the audio ``ended`` handler. */
    _connectCanvasEvents() {
        this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
        this._canvas.addEventListener('dblclick', e => this._onCanvasDblClick(e));
        this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
        this._canvas.addEventListener('mouseup', e => this._onCanvasMouseUp(e));
        this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseLeave());
        // Note: no wheel zoom — two-finger trackpad scroll should not zoom the spectrogram
        this._canvas.addEventListener('keydown', e => this._onCanvasKeyDown(e));
        this._audio.addEventListener('ended', () => {
            this._stopPlayback();
            this._audio.currentTime = this._zoomStartTime();
            this._renderFrame();
        });
    }
    /** Activate the zoom-box or pan tool (they are exclusive), or neither. */
    _setViewTool(tool) {
        this._zoomBoxActive = tool === 'zoom';
        this._panToolActive = tool === 'pan';
        this._dom.zoomBoxBtn.style.background = this._zoomBoxActive ? styles_1.COLORS.overlay : styles_1.COLORS.bgSurface1;
        this._dom.panToolBtn.style.background = this._panToolActive ? styles_1.COLORS.overlay : styles_1.COLORS.bgSurface1;
        this._updateCursorForZoom();
    }
    /** Zoom to the time / frequency window typed into the view-bounds bar. */
    _applyViewBounds() {
        if (this._segDuration <= 0)
            return;
        const d = this._dom;
        const tMin = parseFloat(d.viewTimeMin.value);
        const tMax = parseFloat(d.viewTimeMax.value);
        if (!isNaN(tMin) && !isNaN(tMax) && tMax > tMin) {
            this._viewXMin = Math.max(0, (tMin - this._segLoadStart) / this._segDuration);
            this._viewXMax = Math.min(1, (tMax - this._segLoadStart) / this._segDuration);
        }
        const fMinKhz = parseFloat(d.viewFreqMin.value);
        const fMaxKhz = parseFloat(d.viewFreqMax.value);
        if (!isNaN(fMinKhz) && !isNaN(fMaxKhz) && fMaxKhz > fMinKhz && this._freqMax - this._freqMin > 0) {
            this._viewYMin = Math.max(0, this._freqToFrac(fMinKhz * 1000));
            this._viewYMax = Math.min(1, this._freqToFrac(fMaxKhz * 1000));
        }
        this._updateCursorForZoom();
        this._renderFrame();
    }
    // ── Private: audio loading ───────────────────────────────────
    /**
     * Load the current row's audio (± the buffer) and its spectrogram from the kernel, then
     * redraw. Stops playback first; reports progress / errors through ``statusChanged``.
     */
    async _loadAudio() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const audioPath = (0, audioPath_1.resolveAudioPath)(this._audioConfig, this._currentRow);
        if (!audioPath) {
            console.error('[JBA] No audio configured — set audio param');
            this.statusChanged.emit({ message: '❌ No audio configured — set audio param', error: true });
            return;
        }
        const { loadBtn, canvasContainer } = this._dom;
        loadBtn.disabled = true;
        loadBtn.textContent = 'Updating…';
        loadBtn.style.opacity = '0.4';
        canvasContainer.style.opacity = '0.5';
        if (this._playing) {
            this._audio.pause();
            this._playing = false;
            cancelAnimationFrame(this._rafId);
            this._dom.playBtn.textContent = '▶';
        }
        const bufVal = parseFloat(this._dom.bufferInput.value);
        this._bufferSec = Math.max(0, isNaN(bufVal) ? 0 : bufVal);
        const startTime = (_b = (_a = this._currentRow) === null || _a === void 0 ? void 0 : _a.start_time) !== null && _b !== void 0 ? _b : 0;
        const endTime = (_d = (_c = this._currentRow) === null || _c === void 0 ? void 0 : _c.end_time) !== null && _d !== void 0 ? _d : startTime + DEFAULT_ROW_DURATION_SEC;
        const loadStart = Math.max(0, startTime - this._bufferSec);
        const loadDur = (endTime + this._bufferSec) - loadStart;
        this._detectionStart = startTime;
        this._detectionEnd = endTime;
        this._segLoadStart = loadStart;
        const scheme = (0, util_1.remoteScheme)(audioPath);
        this.statusChanged.emit({
            message: scheme ? REMOTE_LOAD_MSG[scheme] : 'Loading audio…', error: false,
        });
        let result;
        try {
            const vizIdx = parseInt(this._dom.spectTypeSelect.value) || 0;
            const viz = (_e = this._vizMeta[vizIdx]) !== null && _e !== void 0 ? _e : this._vizMeta[0];
            const resW = parseInt(this._dom.resolutionSelect.value) || 2000;
            const raw = await this._kernel.exec((0, python_1.spectrogramPipeline)(audioPath, loadStart, loadDur, viz.type === 'custom' ? 'custom' : 'builtin', viz.key, viz.index, resW, this._canvasHeight));
            result = JSON.parse(raw);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ ${(0, util_1.errorMessage)(e)}`, error: true });
            this._resetLoadBtn();
            return;
        }
        this._segDuration = result.duration;
        this._freqMin = result.freq_min;
        this._freqMax = result.freq_max;
        this._currentFreqScale = (_f = result.freq_scale) !== null && _f !== void 0 ? _f : 'linear';
        this._freqScaleLUT = (_g = result.freq_scale_lut) !== null && _g !== void 0 ? _g : null;
        this.statusChanged.emit({ message: 'Decoding spectrogram…', error: false });
        try {
            const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'image/png' });
            if (this._specBitmap)
                this._specBitmap.close();
            this._specBitmap = await createImageBitmap(blob);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Image decode: ${(0, util_1.errorMessage)(e)}`, error: true });
            this._resetLoadBtn();
            return;
        }
        this._audio.src = `data:audio/wav;base64,${result.wav}`;
        this._audio.load();
        this._renderFrame();
        this._resetLoadBtn();
        const fname = (_h = audioPath.split('/').pop()) !== null && _h !== void 0 ? _h : audioPath;
        if (result.audio_warning) {
            this.statusChanged.emit({
                message: `⚠ ${fname}: ${result.audio_warning}`, error: false, warning: true,
            });
        }
        else {
            this.statusChanged.emit({
                message: `✓ ${fname}  ${(0, util_1.fmtTime)(loadStart)}–${(0, util_1.fmtTime)(loadStart + result.duration)}`,
                error: false,
            });
        }
    }
    /** Put the Update button back in its clean (disabled) state and un-dim the canvas. */
    _resetLoadBtn() {
        const btn = this._dom.loadBtn;
        btn.disabled = true;
        btn.textContent = 'Update';
        btn.style.opacity = '0.5';
        btn.style.cursor = 'default';
        this._dom.canvasContainer.style.opacity = '1';
    }
    /** Enable the Update button (a load control changed). */
    _setLoadBtnDirty() {
        const btn = this._dom.loadBtn;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
    // ── Private: rendering ───────────────────────────────────────
    /** Redraw the canvas: spectrogram crop, shading, playhead, annotation, axis, readouts. */
    _renderFrame() {
        const ctx = this._canvas.getContext('2d');
        if (!ctx)
            return;
        const W = this._canvas.width, H = this._canvas.height;
        if (!W || !H)
            return;
        const padY = Player.SPEC_PAD_Y;
        const ax = Player.AXIS_W;
        ctx.fillStyle = styles_1.COLORS.bgCrust;
        ctx.fillRect(0, 0, W, padY);
        ctx.fillRect(0, H - padY, W, padY);
        ctx.fillRect(0, 0, ax, H);
        if (this._specBitmap) {
            const src = this._bitmapViewRect(this._specBitmap);
            ctx.drawImage(this._specBitmap, src.sx, src.sy, src.sw, src.sh, ax, padY, W - ax, H - 2 * padY);
        }
        else {
            ctx.fillStyle = styles_1.COLORS.bgCrust;
            ctx.fillRect(0, 0, W, H);
        }
        if (this._specBitmap && this._segDuration > 0) {
            (0, playerRender_1.drawBufferShading)(ctx, this._timeToX(this._detectionStart), this._timeToX(this._detectionEnd), ax, W, H);
            (0, playerRender_1.drawPlayhead)(ctx, Math.floor(Math.max(ax, Math.min(W, this._playheadX()))), H);
        }
        this._renderAnnotation(ctx, W, H);
        if (this._specBitmap && this._freqMax > this._freqMin) {
            const [fMin, fMax] = this._visibleFreqRange();
            (0, playerRender_1.drawFreqAxis)(ctx, H, ax, padY, fMin, fMax, f => this._freqToY(f));
        }
        this._updateViewBoundsDisplay();
        const absNow = this._segLoadStart + this._audio.currentTime;
        const absEnd = this._segLoadStart + this._segDuration;
        this._dom.timeDisplay.textContent = `${(0, util_1.fmtTime)(absNow)} / ${(0, util_1.fmtTime)(absEnd)}`;
    }
    /**
     * Draw the annotation for the active tool (or the reviewed result). The capture canvas
     * passes its own size and no axis / padding.
     */
    _renderAnnotation(ctx, W, H, axisW, padY) {
        if (!this._form.getAnnotConfig() || this._segDuration === 0)
            return;
        const reviewed = this._form.isShowingReviewedView();
        (0, playerRender_1.drawAnnotation)(ctx, {
            tx: t => this._timeToX(t, W, axisW),
            ty: f => this._freqToY(f, H, padY),
            height: H,
        }, {
            tool: reviewed ? this._form.getReviewedTool() : this._form.getActiveTool(),
            bounds: this._tools.bounds(),
            boxes: reviewed ? this._form.getReviewedMultiboxEntries() : this._form.getMultiboxEntries(),
            activeBox: reviewed ? -1 : this._form.getActiveBoxIndex(),
        });
    }
    /** The source rectangle of ``bitmap`` that the current view shows. */
    _bitmapViewRect(bitmap) {
        const bw = bitmap.width, bh = bitmap.height;
        return {
            sx: this._viewXMin * bw,
            sw: (this._viewXMax - this._viewXMin) * bw,
            sy: (1 - this._viewYMax) * bh,
            sh: (this._viewYMax - this._viewYMin) * bh,
        };
    }
    /** Show the annotation values (time range, frequency range) in the playback bar. */
    _updateAnnotDisplay() {
        if (!this._form.getAnnotConfig())
            return;
        this._dom.signalTimeDisplay.textContent = this._tools.displayText();
    }
    /** Mirror the view window into the view-bounds inputs (skipping the focused one). */
    _updateViewBoundsDisplay() {
        if (this._segDuration === 0)
            return;
        const d = this._dom;
        const [fMin, fMax] = this._visibleFreqRange();
        const values = [
            [d.viewTimeMin, (this._segLoadStart + this._viewXMin * this._segDuration).toFixed(2)],
            [d.viewTimeMax, (this._segLoadStart + this._viewXMax * this._segDuration).toFixed(2)],
            [d.viewFreqMin, (fMin / 1000).toFixed(1)],
            [d.viewFreqMax, (fMax / 1000).toFixed(1)],
        ];
        for (const [input, value] of values) {
            if (document.activeElement !== input)
                input.value = value;
        }
    }
    /** Fill the resolution dropdown; ``selected::`` marks the default, else the 2nd option. */
    _rebuildResolutionSelect() {
        const select = this._dom.resolutionSelect;
        select.innerHTML = '';
        let hasSelected = false;
        for (const raw of this._specResolutions) {
            const { value, selected } = (0, util_1.splitSelected)(String(raw));
            const o = document.createElement('option');
            o.value = value;
            o.textContent = `${value}px`;
            if (selected) {
                o.selected = true;
                hasSelected = true;
            }
            select.appendChild(o);
        }
        if (!hasSelected && select.options.length > 0) {
            select.options[Math.min(1, select.options.length - 1)].selected = true;
        }
    }
    /** Fill the spectrogram type dropdown from the viz metadata (first one selected). */
    _rebuildVizSelect() {
        const select = this._dom.spectTypeSelect;
        select.innerHTML = '';
        this._vizMeta.forEach((v, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = v.label;
            if (i === 0)
                o.selected = true;
            select.appendChild(o);
        });
    }
    // ── Private: playback ────────────────────────────────────────
    /** Play / pause. When zoomed in time, playback is limited to the visible window. */
    _togglePlay() {
        if (!this._specBitmap)
            return;
        if (this._playing) {
            this._audio.pause();
            this._stopPlayback();
            return;
        }
        if ((0, playerGeometry_1.isTimeZoomed)(this._view) && this._segDuration > 0) {
            const start = this._viewXMin * this._segDuration;
            const end = this._viewXMax * this._segDuration;
            this._playRegion = { start, end };
            if (this._audio.currentTime < start || this._audio.currentTime >= end) {
                this._audio.currentTime = start;
            }
        }
        else {
            this._playRegion = null;
        }
        this._startPlayback();
    }
    /** Play ``[startSec, endSec]`` (absolute seconds) once — double-click on an annotation. */
    _playRange(startSec, endSec) {
        if (!this._specBitmap || this._segDuration <= 0)
            return;
        if (this._playing) {
            this._audio.pause();
            cancelAnimationFrame(this._rafId);
        }
        const start = Math.max(0, startSec - this._segLoadStart);
        const end = Math.min(this._segDuration, endSec - this._segLoadStart);
        if (end <= start)
            return;
        this._playRegion = { start, end };
        this._audio.currentTime = start;
        this._startPlayback();
    }
    /**
     * Start the audio and the redraw loop. The loop stops at the end of ``_playRegion`` (and
     * rewinds to its start) when one is set.
     */
    _startPlayback() {
        void this._audio.play();
        this._playing = true;
        this._dom.playBtn.textContent = '⏸';
        const loop = () => {
            if (this._playRegion && this._audio.currentTime >= this._playRegion.end) {
                this._audio.pause();
                this._audio.currentTime = this._playRegion.start;
                this._stopPlayback();
                this._renderFrame();
                return;
            }
            this._renderFrame();
            if (this._playing)
                this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }
    /** Mark playback stopped (the caller pauses / rewinds the audio as needed). */
    _stopPlayback() {
        this._playing = false;
        this._playRegion = null;
        cancelAnimationFrame(this._rafId);
        this._dom.playBtn.textContent = '▶';
    }
    /** Where playback (re)starts: the start of the visible time window, or 0. */
    _zoomStartTime() {
        return (0, playerGeometry_1.isTimeZoomed)(this._view) ? this._viewXMin * this._segDuration : 0;
    }
    // ── Private: coordinates ─────────────────────────────────────
    /** The current view window. */
    get _view() {
        return { xMin: this._viewXMin, xMax: this._viewXMax, yMin: this._viewYMin, yMax: this._viewYMax };
    }
    set _view(v) {
        this._viewXMin = v.xMin;
        this._viewXMax = v.xMax;
        this._viewYMin = v.yMin;
        this._viewYMax = v.yMax;
    }
    /** The loaded segment. */
    get _segment() {
        return { loadStart: this._segLoadStart, duration: this._segDuration };
    }
    /** The spectrogram's frequency scale. */
    get _scale() {
        return {
            min: this._freqMin, max: this._freqMax, kind: this._currentFreqScale, lut: this._freqScaleLUT,
        };
    }
    /** Mouse position in canvas pixels. */
    _canvasXY(e) {
        const rect = this._canvas.getBoundingClientRect();
        return {
            cx: (e.clientX - rect.left) * (this._canvas.width / rect.width),
            cy: (e.clientY - rect.top) * (this._canvas.height / rect.height),
        };
    }
    /** Like _canvasXY but clamped to canvas bounds. */
    _canvasXYClamped(e) {
        const { cx, cy } = this._canvasXY(e);
        return {
            cx: Math.max(0, Math.min(this._canvas.width, cx)),
            cy: Math.max(0, Math.min(this._canvas.height, cy)),
        };
    }
    /** Convert absolute time to screen X, accounting for zoom. */
    _timeToX(t, canvasW, axisW) {
        return (0, playerGeometry_1.timeToX)(t, this._segment, this._view, canvasW !== null && canvasW !== void 0 ? canvasW : this._canvas.width, axisW !== null && axisW !== void 0 ? axisW : Player.AXIS_W);
    }
    /** Convert screen X to absolute time, accounting for zoom. */
    _xToTime(x) {
        return (0, playerGeometry_1.xToTime)(x, this._segment, this._view, this._canvas.width, Player.AXIS_W);
    }
    /** Map frequency to 0..1 fraction based on the current freq scale. */
    _freqToFrac(f) {
        return (0, playerGeometry_1.freqToFrac)(f, this._scale);
    }
    /** Inverse: map 0..1 fraction to frequency based on the current freq scale. */
    _fracToFreq(frac) {
        return (0, playerGeometry_1.fracToFreq)(frac, this._scale);
    }
    /** The frequencies (Hz) at the bottom and top of the current vertical view, on its scale. */
    _visibleFreqRange() {
        return [this._fracToFreq(this._viewYMin), this._fracToFreq(this._viewYMax)];
    }
    /**
     * Convert frequency to Y on a canvas, accounting for zoom and padding. Defaults to the
     * on-screen canvas; capture passes its own height and no padding.
     */
    _freqToY(f, canvasH, padYOverride) {
        return (0, playerGeometry_1.freqToY)(f, this._scale, this._view, canvasH !== null && canvasH !== void 0 ? canvasH : this._canvas.height, padYOverride !== null && padYOverride !== void 0 ? padYOverride : Player.SPEC_PAD_Y);
    }
    /** Convert screen Y to frequency, accounting for zoom and padding. */
    _yToFreq(y) {
        return (0, playerGeometry_1.yToFreq)(y, this._scale, this._view, this._canvas.height, Player.SPEC_PAD_Y);
    }
    /** The playhead's x on the canvas (unclamped). */
    _playheadX() {
        return this._timeToX(this._segLoadStart + this._audio.currentTime);
    }
    /** A data-space box in canvas pixels. */
    _pixelBox(st, et, flo, fhi) {
        return { sx: this._timeToX(st), ex: this._timeToX(et), yhi: this._freqToY(fhi), ylo: this._freqToY(flo) };
    }
    // ── Private: canvas mouse handlers ───────────────────────────
    /**
     * Mouse down, in priority order: zoom-box drag, playhead scrub, pan (pan tool, or zoomed
     * with no annotation tool), then the active annotation tool.
     */
    _onCanvasMouseDown(e) {
        if (this._zoomBoxActive && this._specBitmap) {
            this._startZoomBoxDrag(e);
            return;
        }
        if (this._specBitmap && this._segDuration > 0) {
            const { cx } = this._canvasXY(e);
            if (Math.abs(cx - this._playheadX()) <= annotationTools_1.GRAB_PX) {
                this._playheadDrag = true;
                this._dom.canvasContainer.style.cursor = 'ew-resize';
                return;
            }
        }
        const ac = this._form.getAnnotConfig();
        const noTool = !ac || !this._form.getActiveTool();
        if ((this._panToolActive || noTool) && (0, playerGeometry_1.isZoomed)(this._view) && this._specBitmap) {
            this._panDrag = { startX: e.clientX, startY: e.clientY, orig: this._view };
            this._dom.canvasContainer.style.cursor = 'grabbing';
            return;
        }
        if (!ac || !this._specBitmap || this._segDuration === 0 || this._form.isShowingReviewedView()) {
            return;
        }
        const { cx, cy } = this._canvasXY(e);
        if (this._tools.down(cx, cy))
            return;
        this._renderFrame();
        this._updateAnnotDisplay();
    }
    /** Mouse move: playhead scrub, pan, hover cursor, or the current annotation drag. */
    _onCanvasMouseMove(e) {
        if (this._zoomBoxDrag)
            return; // handled at document level
        if (this._playheadDrag) {
            const { cx } = this._canvasXY(e);
            const frac = (this._xToTime(cx) - this._segLoadStart) / this._segDuration;
            this._audio.currentTime = Math.max(0, Math.min(this._segDuration, frac * this._segDuration));
            this._renderFrame();
            return;
        }
        if (this._panDrag) {
            const rect = this._canvas.getBoundingClientRect();
            const specCssW = rect.width * (1 - Player.AXIS_W / this._canvas.width);
            const { orig } = this._panDrag;
            const dx = (e.clientX - this._panDrag.startX) / specCssW;
            const dy = (e.clientY - this._panDrag.startY) / rect.height;
            this._view = (0, playerGeometry_1.panView)(orig, -dx * (orig.xMax - orig.xMin), dy * (orig.yMax - orig.yMin));
            this._renderFrame();
            return;
        }
        const ac = this._form.getAnnotConfig();
        if (!this._specBitmap || this._segDuration === 0)
            return;
        const { cx, cy } = this._canvasXY(e);
        if (!this._tools.dragging) {
            if (Math.abs(cx - this._playheadX()) <= annotationTools_1.GRAB_PX) {
                this._dom.canvasContainer.style.cursor = 'ew-resize';
            }
            else if (ac && !this._form.isShowingReviewedView()) {
                this._dom.canvasContainer.style.cursor = this._tools.cursorAt(cx, cy);
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
        this._tools.move(t, f);
    }
    /** Cancel pan, playhead and annotation drags (but not a zoom-box drag) when leaving. */
    _onCanvasMouseLeave() {
        if (this._zoomBoxDrag)
            return;
        this._panDrag = null;
        this._playheadDrag = false;
        this._tools.cancel();
        if (this._specBitmap)
            this._renderFrame();
    }
    /** Mouse up: end a scrub / pan, or commit a new multibox if it is big enough. */
    _onCanvasMouseUp(e) {
        if (this._playheadDrag || this._panDrag) {
            this._playheadDrag = false;
            this._panDrag = null;
            this._updateCursorForZoom();
            return;
        }
        const { cx, cy } = this._canvasXY(e);
        this._tools.up(cx, cy);
        this._renderFrame();
    }
    /** Double-click: play the annotation / box under the pointer. */
    _onCanvasDblClick(e) {
        if (!this._specBitmap || this._segDuration <= 0 || !this._form.getAnnotConfig())
            return;
        const { cx, cy } = this._canvasXY(e);
        this._tools.dblClick(cx, cy);
    }
    // ── Private: zoom + pan ──────────────────────────────────────
    /** Begin a zoom-box drag; tracked on the document so it continues outside the canvas. */
    _startZoomBoxDrag(e) {
        const { cx, cy } = this._canvasXYClamped(e);
        this._zoomBoxDrag = { startCx: cx, startCy: cy };
        this._zoomBoxMoveHandler = (ev) => this._onZoomBoxMove(ev);
        this._zoomBoxUpHandler = (ev) => this._onZoomBoxUp(ev);
        document.addEventListener('mousemove', this._zoomBoxMoveHandler);
        document.addEventListener('mouseup', this._zoomBoxUpHandler);
    }
    /** Redraw with the zoom-box preview. */
    _onZoomBoxMove(e) {
        if (!this._zoomBoxDrag)
            return;
        const { cx, cy } = this._canvasXYClamped(e);
        this._renderFrame();
        const ctx = this._canvas.getContext('2d');
        if (ctx) {
            const { startCx, startCy } = this._zoomBoxDrag;
            (0, playerRender_1.drawDashedRect)(ctx, Math.min(startCx, cx), Math.min(startCy, cy), Math.abs(cx - startCx), Math.abs(cy - startCy), styles_1.COLORS.blue, 2, playerRender_1.ZOOM_BOX_FILL);
        }
    }
    /** Finish a zoom-box drag: zoom if the box is big enough, then turn the tool off. */
    _onZoomBoxUp(e) {
        if (this._zoomBoxMoveHandler)
            document.removeEventListener('mousemove', this._zoomBoxMoveHandler);
        if (this._zoomBoxUpHandler)
            document.removeEventListener('mouseup', this._zoomBoxUpHandler);
        this._zoomBoxMoveHandler = null;
        this._zoomBoxUpHandler = null;
        if (!this._zoomBoxDrag)
            return;
        const { cx, cy } = this._canvasXYClamped(e);
        const { startCx, startCy } = this._zoomBoxDrag;
        const H = this._canvas.height;
        const ax = Player.AXIS_W;
        const specW = this._canvas.width - ax;
        const x1 = Math.max(0, Math.min(startCx, cx) - ax) / specW;
        const x2 = Math.max(0, Math.max(startCx, cx) - ax) / specW;
        const y1 = Math.min(startCy, cy) / H;
        const y2 = Math.max(startCy, cy) / H;
        this._zoomBoxDrag = null;
        if ((x2 - x1) > MIN_ZOOM_BOX_FRAC && (y2 - y1) > MIN_ZOOM_BOX_FRAC) {
            this._view = (0, playerGeometry_1.zoomToBox)(this._view, x1, x2, y1, y2);
        }
        this._setViewTool(null);
        this._renderFrame();
    }
    /**
     * Canvas shortcuts: ``+``/``-`` zoom, ``0`` reset, Space play/pause (Shift: from the
     * window start), arrows nudge the fixed window or pan when zoomed, Delete/Backspace remove
     * the active box or the fixed window.
     */
    _onCanvasKeyDown(e) {
        const tool = this._form.getActiveTool();
        const isDelete = e.key === 'Delete' || e.key === 'Backspace';
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
                this._audio.currentTime = this._zoomStartTime();
                if (!this._playing)
                    this._togglePlay();
                this._renderFrame();
            }
            else {
                this._togglePlay();
            }
        }
        else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tool === 'fixed_duration') {
            if (this._tools.nudgeFixedWindow(e.key === 'ArrowLeft' ? -1 : 1)) {
                e.preventDefault();
                this._renderFrame();
            }
        }
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (!(0, playerGeometry_1.isZoomed)(this._view))
                return;
            e.preventDefault();
            const vw = this._viewXMax - this._viewXMin;
            const vh = this._viewYMax - this._viewYMin;
            const dx = e.key === 'ArrowLeft' ? -PAN_STEP * vw : e.key === 'ArrowRight' ? PAN_STEP * vw : 0;
            const dy = e.key === 'ArrowUp' ? PAN_STEP * vh : e.key === 'ArrowDown' ? -PAN_STEP * vh : 0;
            this._view = (0, playerGeometry_1.panView)(this._view, dx, dy);
            this._renderFrame();
        }
        else if (isDelete && this._form.isMultiboxMode()) {
            e.preventDefault();
            this._form.removeActiveMultiboxEntry();
            this._renderFrame();
        }
        else if (isDelete && tool === 'fixed_duration') {
            e.preventDefault();
            this._form.setAnnotValue('startTime', null);
            this._form.setAnnotValue('endTime', null);
            this._renderFrame();
        }
    }
    /** Zoom by ``factor`` around the view center (< 1 zooms in). */
    _zoomBy(factor) {
        this._view = (0, playerGeometry_1.zoomView)(this._view, factor);
        this._updateCursorForZoom();
        this._renderFrame();
    }
    /** Show the whole spectrogram. */
    _resetZoom() {
        this._view = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
        this._updateCursorForZoom();
        this._renderFrame();
    }
    /** Canvas cursor for the current tool / zoom state (when not hovering anything). */
    _updateCursorForZoom() {
        const panCursor = (0, playerGeometry_1.isZoomed)(this._view) ? 'grab' : 'default';
        let cursor;
        if (this._zoomBoxActive) {
            cursor = 'crosshair';
        }
        else if (this._panToolActive) {
            cursor = panCursor;
        }
        else {
            cursor = this._form.getAnnotConfig() && this._form.getActiveTool() ? 'crosshair' : panCursor;
        }
        this._dom.canvasContainer.style.cursor = cursor;
    }
    // ── Private: capture ─────────────────────────────────────────
    /**
     * Default capture file name: the info-card title as a slug plus a timestamp, else
     * ``clip_<id>.png``.
     */
    async _buildCaptureFilename() {
        const row = this._currentRow;
        if (!row)
            return 'spectrogram.png';
        const resolved = this._titleTemplate ? (0, util_1.resolveTemplate)(this._titleTemplate, row) : '';
        if (!resolved)
            return `clip_${row[this._dataIndexCol]}.png`;
        const slug = (0, util_1.slugify)(resolved);
        try {
            const result = await this._kernel.exec((0, python_1.resolveOutputTemplates)(`${slug}.[[%Y%m%d-%H%M]].png`));
            return JSON.parse(result).resolved;
        }
        catch (e) {
            console.error('Failed to resolve capture filename template:', e);
            return `${slug}.png`;
        }
    }
    /**
     * Save the visible spectrogram (with shading and annotation, no axis) as a PNG, after
     * asking for the file name.
     */
    async _onCapture() {
        if (!this._specBitmap)
            return;
        const defaultName = await this._buildCaptureFilename();
        const suggested = this._captureDir ? `${this._captureDir}/${defaultName}` : defaultName;
        const filename = await (0, modal_1.promptText)({
            title: 'Save spectrogram as:', value: suggested, okLabel: 'Save',
        });
        if (!filename || !this._specBitmap)
            return;
        const b64 = this._renderCapture(this._specBitmap);
        if (!b64)
            return;
        try {
            await this._kernel.exec((0, python_1.savePng)(filename, b64));
            this.statusChanged.emit({ message: `✓ Saved ${filename}`, error: false });
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Save failed: ${(0, util_1.errorMessage)(e)}`, error: true });
        }
    }
    /**
     * Draw the capture image offscreen: the visible crop at the bitmap's horizontal resolution
     * and the display's aspect ratio (or the configured height).
     * @returns The PNG as base64, or null after reporting a failure.
     */
    _renderCapture(bitmap) {
        var _a;
        const fail = (why) => {
            this.statusChanged.emit({ message: `❌ Capture failed: ${why}`, error: true });
            return null;
        };
        const src = this._bitmapViewRect(bitmap);
        const W = Math.round(src.sw);
        const displayAspect = this._canvas.height / Math.max(1, this._canvas.width - Player.AXIS_W);
        const H = (_a = this._captureHeight) !== null && _a !== void 0 ? _a : Math.round(W * displayAspect);
        if (W <= 0 || H <= 0)
            return fail('zoom region too small');
        const offscreen = document.createElement('canvas');
        offscreen.width = W;
        offscreen.height = H;
        const ctx = offscreen.getContext('2d');
        if (!ctx)
            return fail('could not create canvas');
        ctx.drawImage(bitmap, src.sx, src.sy, src.sw, src.sh, 0, 0, W, H);
        if (this._segDuration > 0) {
            (0, playerRender_1.drawBufferShading)(ctx, this._timeToX(this._detectionStart, W, 0), this._timeToX(this._detectionEnd, W, 0), 0, W, H);
        }
        this._renderAnnotation(ctx, W, H, 0, 0); // capture canvas: no axis, no padding
        let dataUrl;
        try {
            dataUrl = offscreen.toDataURL('image/png');
        }
        catch (_b) {
            return fail('image too large to encode');
        }
        return dataUrl.split(',')[1] || fail('image too large to encode');
    }
}
exports.Player = Player;
/** Vertical padding (px) at top/bottom of canvas for freq axis labels. */
Player.SPEC_PAD_Y = 8;
/** Width (px) of the frequency axis strip on the left. */
Player.AXIS_W = 40;


/***/ },

/***/ "./lib/sections/annotationTools.js"
/*!*****************************************!*\
  !*** ./lib/sections/annotationTools.js ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AnnotationTools = exports.GRAB_PX = void 0;
/**
 * Mouse / keyboard behaviour of the annotation tools on the spectrogram canvas
 * (``time_select``, ``start_end_time_select``, ``bounding_box``, ``fixed_duration``,
 * ``multibox``).
 *
 * The Player handles zoom, pan, playhead and playback, and forwards the remaining canvas
 * events here. Values are read from and written to the FormPanel; canvas coordinates come
 * from the Player through ``ToolCanvas``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const boxEdges_1 = __webpack_require__(/*! ../boxEdges */ "./lib/boxEdges.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const playerGeometry_1 = __webpack_require__(/*! ./playerGeometry */ "./lib/sections/playerGeometry.js");
const playerRender_1 = __webpack_require__(/*! ./playerRender */ "./lib/sections/playerRender.js");
//
// Constants
//
/** How close (px) the pointer must be to an edge / line to grab it. */
exports.GRAB_PX = 10;
/** Smallest new multibox (px per side) that is kept on release. */
const MIN_BOX_PX = 5;
const FIXED_DURATION_NUDGE_SEC = 0.05;
//
// Public
//
/** Annotation-tool interaction for one Player. */
class AnnotationTools {
    /**
     * @param _form - Annotation config and values.
     * @param _canvas - Coordinates and redraws.
     */
    constructor(_form, _canvas) {
        this._form = _form;
        this._canvas = _canvas;
        this._drag = null;
    }
    /** True while an annotation drag is in progress. */
    get dragging() {
        return this._drag !== null;
    }
    /**
     * The form value of annotation ``field``, or ``noCol`` when the annotation has no column
     * for it.
     */
    value(field, noCol = null) {
        var _a, _b;
        const col = (_b = (_a = this._form.getAnnotConfig()) === null || _a === void 0 ? void 0 : _a[field]) === null || _b === void 0 ? void 0 : _b.col;
        return col ? this._form.getFormValue(col) : noCol;
    }
    /** All four annotation values (null when unset or not configured). */
    bounds() {
        return {
            st: this.value('startTime'),
            et: this.value('endTime'),
            flo: this.value('minFreq'),
            fhi: this.value('maxFreq'),
        };
    }
    /** The playback-bar readout for the current values (``⏱ 0:01.00 – 0:02.00 100–200 Hz``). */
    displayText() {
        const { st, et, flo, fhi } = this.bounds();
        const parts = [];
        if (st != null)
            parts.push((0, util_1.fmtTime)(st));
        if (et != null)
            parts.push(`– ${(0, util_1.fmtTime)(et)}`);
        if (flo != null && fhi != null)
            parts.push(`${Math.round(flo)}–${Math.round(fhi)} Hz`);
        return parts.length ? `⏱ ${parts.join(' ')}` : '';
    }
    /**
     * Mouse down at ``(cx, cy)`` with the active tool.
     * @returns true if fully handled; false if the caller should redraw and refresh the readout.
     */
    down(cx, cy) {
        switch (this._form.getActiveTool()) {
            case 'time_select':
                this._form.setAnnotValue('startTime', this._canvas.xToTime(cx));
                this._drag = { target: 'start' };
                return false;
            case 'start_end_time_select':
                this._downStartEnd(cx);
                return false;
            case 'bounding_box': return this._downBoundingBox(cx, cy);
            case 'fixed_duration': return this._downFixedDuration(cx);
            case 'multibox': return this._downMultibox(cx, cy);
            default: return false;
        }
    }
    /** Mouse move during a drag, at time ``t`` / frequency ``f`` (clamped to the segment). */
    move(t, f) {
        const drag = this._drag;
        if (!drag)
            return;
        if (drag.target === 'multibox-new') {
            this._renderNewBoxPreview(drag, t, f);
            return;
        }
        this._applyDrag(drag, t, f);
        this._canvas.renderFrame();
        this._canvas.updateAnnotDisplay();
    }
    /** Mouse up at ``(cx, cy)``: commit a new multibox if it is big enough; end the drag. */
    up(cx, cy) {
        const drag = this._drag;
        if ((drag === null || drag === void 0 ? void 0 : drag.target) === 'multibox-new') {
            const t = this._canvas.xToTime(cx);
            const f = this._canvas.yToFreq(cy);
            const tMin = Math.min(drag.anchorTime, t), tMax = Math.max(drag.anchorTime, t);
            const fMin = Math.min(drag.anchorFreq, f), fMax = Math.max(drag.anchorFreq, f);
            const box = this._canvas.pixelBox(tMin, tMax, fMin, fMax);
            if (Math.abs(box.ex - box.sx) > MIN_BOX_PX && Math.abs(box.ylo - box.yhi) > MIN_BOX_PX) {
                this._form.addMultiboxEntry(tMin, tMax, fMin, fMax);
            }
        }
        this._drag = null;
    }
    /** Abandon the current drag (pointer left the canvas). */
    cancel() {
        this._drag = null;
    }
    /** Double-click inside the annotation (or a multibox box) plays that range. */
    dblClick(cx, cy) {
        const tool = this._form.getActiveTool();
        if (tool === 'bounding_box' || tool === 'fixed_duration') {
            const { st, et, flo, fhi } = this.bounds();
            if (st == null || et == null)
                return;
            if (tool === 'fixed_duration') {
                if (cx >= this._canvas.timeToX(st) && cx <= this._canvas.timeToX(et)) {
                    this._canvas.playRange(st, et);
                }
            }
            else if (flo != null && fhi != null) {
                if ((0, playerGeometry_1.pointInBox)(cx, cy, this._canvas.pixelBox(st, et, flo, fhi))) {
                    this._canvas.playRange(st, et);
                }
            }
        }
        else if (tool === 'multibox') {
            const entries = this._form.getMultiboxEntries();
            for (let i = entries.length - 1; i >= 0; i--) {
                const b = entries[i];
                if ((0, playerGeometry_1.pointInBox)(cx, cy, this._canvas.pixelBox(b.startTime, b.endTime, b.minFreq, b.maxFreq))) {
                    this._form.setActiveBox(i);
                    this._canvas.playRange(b.startTime, b.endTime);
                    return;
                }
            }
        }
    }
    /** Hover cursor for the active tool: resize near grabbable lines/edges, else crosshair. */
    cursorAt(cx, cy) {
        const { st, et, flo, fhi } = this.bounds();
        const near = (t) => t != null && Math.abs(cx - this._canvas.timeToX(t)) <= exports.GRAB_PX;
        switch (this._form.getActiveTool()) {
            case 'time_select':
                return near(st) ? 'ew-resize' : 'crosshair';
            case 'start_end_time_select':
                return near(st) || near(et) ? 'ew-resize' : 'crosshair';
            case 'bounding_box': {
                if (st == null || et == null || flo == null || fhi == null)
                    return 'crosshair';
                const hit = (0, playerGeometry_1.hitTestBox)(cx, cy, this._canvas.pixelBox(st, et, flo, fhi), exports.GRAB_PX);
                if (hit === 'left' || hit === 'right')
                    return 'ew-resize';
                if (hit === 'top' || hit === 'bottom')
                    return 'ns-resize';
                return 'crosshair';
            }
            case 'fixed_duration':
                return st != null && et != null &&
                    cx >= this._canvas.timeToX(st) && cx <= this._canvas.timeToX(et) ? 'grab' : 'crosshair';
            default:
                return 'crosshair';
        }
    }
    /**
     * Move the fixed window by one nudge step (``direction`` -1 = left, 1 = right), staying in
     * the segment.
     * @returns false if there is no window to move.
     */
    nudgeFixedWindow(direction) {
        const { st, et } = this.bounds();
        if (st == null || et == null)
            return false;
        const [lo, hi] = this._canvas.segmentRange();
        const dur = et - st;
        let ns = st + direction * FIXED_DURATION_NUDGE_SEC;
        if (ns < lo)
            ns = lo;
        if (ns + dur > hi)
            ns = hi - dur;
        this._form.setAnnotValue('startTime', ns);
        this._form.setAnnotValue('endTime', ns + dur);
        return true;
    }
    // ── Private: mouse down per tool ─────────────────────────────
    /** start/end tool: grab the nearer line, else move the nearer bound to the click. */
    _downStartEnd(cx) {
        const { st, et } = this.bounds();
        const sx = st != null ? this._canvas.timeToX(st) : -Infinity;
        const ex = et != null ? this._canvas.timeToX(et) : Infinity;
        if (Math.abs(cx - sx) <= exports.GRAB_PX && Math.abs(cx - sx) <= Math.abs(cx - ex)) {
            this._drag = { target: 'start' };
        }
        else if (Math.abs(cx - ex) <= exports.GRAB_PX) {
            this._drag = { target: 'end' };
        }
        else if (cx < (sx + ex) / 2) {
            this._form.setAnnotValue('startTime', this._canvas.xToTime(cx));
            this._drag = { target: 'start' };
        }
        else {
            this._form.setAnnotValue('endTime', this._canvas.xToTime(cx));
            this._drag = { target: 'end' };
        }
    }
    /** Bounding box: grab an edge, ignore clicks inside, else start a new box at the click. */
    _downBoundingBox(cx, cy) {
        const { st, et, flo, fhi } = this.bounds();
        if (st != null && et != null && flo != null && fhi != null) {
            const hit = (0, playerGeometry_1.hitTestBox)(cx, cy, this._canvas.pixelBox(st, et, flo, fhi), exports.GRAB_PX);
            if (hit === 'inside')
                return true;
            if (hit) {
                this._drag = { target: `box-${hit}` };
                this._canvas.renderFrame();
                this._canvas.updateAnnotDisplay();
                return true;
            }
        }
        const t = this._canvas.xToTime(cx);
        const f = this._canvas.yToFreq(cy);
        this._form.setAnnotValue('startTime', t);
        this._form.setAnnotValue('endTime', t);
        this._form.setAnnotValue('minFreq', f);
        this._form.setAnnotValue('maxFreq', f);
        this._drag = { target: 'box-corner', anchorTime: t, anchorFreq: f };
        return false;
    }
    /** Fixed window: grab it to move it; a click elsewhere clears it, or places it when unset. */
    _downFixedDuration(cx) {
        const { st, et } = this.bounds();
        if (st != null && et != null) {
            const sx = this._canvas.timeToX(st), ex = this._canvas.timeToX(et);
            if (cx >= sx - exports.GRAB_PX && cx <= ex + exports.GRAB_PX) {
                this._drag = { target: 'fixed-move', anchorTime: this._canvas.xToTime(cx) - (st + et) / 2 };
                this._canvas.renderFrame();
                this._canvas.updateAnnotDisplay();
                return true;
            }
            this._form.setAnnotValue('startTime', null);
            this._form.setAnnotValue('endTime', null);
        }
        else {
            const dur = this._form.getFixedDuration();
            const [s, en] = this._clampToSegment(this._canvas.xToTime(cx) - dur / 2, dur);
            this._form.setAnnotValue('startTime', s);
            this._form.setAnnotValue('endTime', en);
        }
        return false;
    }
    /**
     * Multibox: grab any box's edge (top-most box first), else select the box under the
     * click, else start drawing a new box.
     */
    _downMultibox(cx, cy) {
        const hits = this._form.getMultiboxEntries().map(b => (0, playerGeometry_1.hitTestBox)(cx, cy, this._canvas.pixelBox(b.startTime, b.endTime, b.minFreq, b.maxFreq), exports.GRAB_PX));
        for (let i = hits.length - 1; i >= 0; i--) {
            const hit = hits[i];
            if (hit && hit !== 'inside') {
                this._form.setActiveBox(i);
                this._drag = { target: `mb-${hit}`, boxIndex: i };
                this._canvas.renderFrame();
                return true;
            }
        }
        for (let i = hits.length - 1; i >= 0; i--) {
            if (hits[i] === 'inside') {
                this._form.setActiveBox(i);
                this._canvas.renderFrame();
                return true;
            }
        }
        this._drag = {
            target: 'multibox-new',
            anchorTime: this._canvas.xToTime(cx),
            anchorFreq: this._canvas.yToFreq(cy),
        };
        return false;
    }
    // ── Private: dragging ────────────────────────────────────────
    /** Apply a drag to time ``t`` / frequency ``f``; edges never cross their opposite edge. */
    _applyDrag(drag, t, f) {
        var _a, _b, _c;
        const form = this._form;
        switch (drag.target) {
            case 'start': {
                const endVal = this.value('endTime', Infinity);
                const keepOrder = form.getActiveTool() === 'start_end_time_select' && endVal != null;
                form.setAnnotValue('startTime', keepOrder ? Math.min(t, endVal) : t);
                break;
            }
            case 'end':
            case 'box-right': {
                const startVal = this.value('startTime', -Infinity);
                if (startVal != null)
                    form.setAnnotValue('endTime', Math.max(t, startVal));
                break;
            }
            case 'box-corner': {
                const at = (_a = drag.anchorTime) !== null && _a !== void 0 ? _a : t;
                const af = (_b = drag.anchorFreq) !== null && _b !== void 0 ? _b : f;
                form.setAnnotValue('startTime', Math.min(at, t));
                form.setAnnotValue('endTime', Math.max(at, t));
                form.setAnnotValue('minFreq', Math.min(af, f));
                form.setAnnotValue('maxFreq', Math.max(af, f));
                break;
            }
            case 'box-left': {
                const endVal = this.value('endTime', Infinity);
                if (endVal != null)
                    form.setAnnotValue('startTime', Math.min(t, endVal));
                break;
            }
            case 'box-top': {
                const loVal = this.value('minFreq', 0);
                if (loVal != null)
                    form.setAnnotValue('maxFreq', Math.max(f, loVal));
                break;
            }
            case 'box-bottom': {
                const hiVal = this.value('maxFreq', Infinity);
                if (hiVal != null)
                    form.setAnnotValue('minFreq', Math.min(f, hiVal));
                break;
            }
            case 'fixed-move': {
                const dur = form.getFixedDuration();
                const [s, en] = this._clampToSegment(t - ((_c = drag.anchorTime) !== null && _c !== void 0 ? _c : 0) - dur / 2, dur);
                form.setAnnotValue('startTime', s);
                form.setAnnotValue('endTime', en);
                break;
            }
            default:
                // multibox edges use their own 'mb-*' targets: they used to share the single-box
                // 'box-*' names, so the branches above caught them and the box never moved
                if (drag.target.startsWith('mb-') && drag.boxIndex != null) {
                    const entry = form.getMultiboxEntries()[drag.boxIndex];
                    if (entry) {
                        const { field, value } = (0, boxEdges_1.dragBoxEdge)(entry, drag.target.slice(3), t, f);
                        form.updateMultiboxBounds(drag.boxIndex, field, value);
                    }
                }
        }
    }
    /** Redraw with a dashed preview of the multibox being drawn (committed on mouse up). */
    _renderNewBoxPreview(drag, t, f) {
        if (drag.anchorTime == null || drag.anchorFreq == null)
            return;
        this._canvas.renderFrame();
        const ctx = this._canvas.context();
        if (ctx) {
            const box = this._canvas.pixelBox(Math.min(drag.anchorTime, t), Math.max(drag.anchorTime, t), Math.min(drag.anchorFreq, f), Math.max(drag.anchorFreq, f));
            (0, playerRender_1.drawDashedRect)(ctx, box.sx, box.yhi, box.ex - box.sx, box.ylo - box.yhi, styles_1.COLORS.textPrimary, 1.5);
        }
        this._canvas.updateAnnotDisplay();
    }
    /** ``[start, start + dur]`` slid inside the loaded segment. */
    _clampToSegment(start, dur) {
        const [lo, hi] = this._canvas.segmentRange();
        return (0, playerGeometry_1.clampWindow)(start, dur, lo, hi);
    }
}
exports.AnnotationTools = AnnotationTools;


/***/ },

/***/ "./lib/sections/audioPath.js"
/*!***********************************!*\
  !*** ./lib/sections/audioPath.js ***!
  \***********************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveAudioPath = exports.applyPrefixSuffix = void 0;
//
// Constants
//
/** A remote path: scheme in group 1, the rest in group 2. */
const REMOTE_PATH_RE = /^(https?:\/\/|s3:\/\/|gs:\/\/)(.*)/;
//
// Public
//
/**
 * Join ``prefix`` / ``suffix`` onto a raw audio path with ``/``. For URLs (``type: url`` or
 * a ``http(s)://``, ``s3://``, ``gs://`` path) the prefix goes after the scheme
 * (``s3://prefix/rest``).
 */
function applyPrefixSuffix(raw, cfg) {
    const { prefix, suffix, type } = cfg;
    if (!prefix && !suffix)
        return raw;
    if (type === 'url' || raw.match(/^(https?|s3|gs):\/\//)) {
        const m = raw.match(REMOTE_PATH_RE);
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
exports.applyPrefixSuffix = applyPrefixSuffix;
/**
 * The audio path for ``row``: the configured path / URL, or (``type: column``) the row's
 * column value, falling back to ``fallback`` (used as-is, without prefix / suffix) when the
 * cell is empty. Returns '' when nothing is configured.
 */
function resolveAudioPath(cfg, row) {
    if (cfg.type === 'column') {
        const colVal = row === null || row === void 0 ? void 0 : row[cfg.value];
        if (colVal != null && String(colVal).trim())
            return applyPrefixSuffix(String(colVal), cfg);
        return cfg.fallback || '';
    }
    return applyPrefixSuffix(cfg.value, cfg);
}
exports.resolveAudioPath = resolveAudioPath;


/***/ },

/***/ "./lib/sections/form/annotationConfig.js"
/*!***********************************************!*\
  !*** ./lib/sections/form/annotationConfig.js ***!
  \***********************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseFixedDuration = exports.parseAnnotationConfig = void 0;
//
// Constants
//
/** Tools that set a start time / an end time / a frequency range. */
const TIME_TOOLS = ['time_select', 'start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration'];
const END_TIME_TOOLS = ['start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration'];
const FREQ_TOOLS = ['bounding_box', 'multibox'];
/** The four bounds: config key, AnnotConfig field, default column. */
const BOUND_KEYS = [
    ['start_time', 'startTime'],
    ['end_time', 'endTime'],
    ['min_frequency', 'minFreq'],
    ['max_frequency', 'maxFreq'],
];
//
// Public
//
/**
 * Parse an ``annotation`` element.
 *
 * - each bound is a column name or ``{column, label, source_value}``;
 * - ``tools`` is a name, a list of names / ``{fixed_duration: ...}``, or absent
 *   (``time_select``);
 * - bounds the chosen tools need but the config omits get default columns
 *   (``start_time``, ``end_time``, ``min_frequency``, ``max_frequency``).
 */
function parseAnnotationConfig(config) {
    var _a, _b;
    const ac = { tools: [] };
    const columns = [];
    for (const [key, field] of BOUND_KEYS) {
        const raw = config[key];
        if (!raw)
            continue;
        const c = typeof raw === 'string' ? { column: raw } : raw;
        const col = (_b = (_a = c.column) !== null && _a !== void 0 ? _a : c.label) !== null && _b !== void 0 ? _b : key;
        ac[field] = field === 'startTime' || field === 'endTime'
            ? { col, sourceValue: c.source_value }
            : { col };
        columns.push(col);
    }
    const rawTools = config.tools;
    if (typeof rawTools === 'string') {
        ac.tools = [rawTools];
    }
    else if (Array.isArray(rawTools)) {
        for (const t of rawTools) {
            if (typeof t === 'string') {
                ac.tools.push(t);
            }
            else if (typeof t === 'object' && t !== null && 'fixed_duration' in t) {
                ac.tools.push('fixed_duration');
                const fd = parseFixedDuration(t.fixed_duration);
                if (fd)
                    ac.fixedDuration = fd;
            }
        }
    }
    else {
        ac.tools = ['time_select'];
    }
    const uses = (tools) => ac.tools.some(t => tools.includes(t));
    if (uses(TIME_TOOLS) && !ac.startTime) {
        ac.startTime = { col: 'start_time', sourceValue: 'start_time' };
        columns.push('start_time');
    }
    if (uses(END_TIME_TOOLS) && !ac.endTime) {
        ac.endTime = { col: 'end_time', sourceValue: 'end_time' };
        columns.push('end_time');
    }
    if (uses(FREQ_TOOLS) && !ac.minFreq) {
        ac.minFreq = { col: 'min_frequency' };
        columns.push('min_frequency');
    }
    if (uses(FREQ_TOOLS) && !ac.maxFreq) {
        ac.maxFreq = { col: 'max_frequency' };
        columns.push('max_frequency');
    }
    if (config.form)
        ac.form = typeof config.form === 'string' ? config.form : null;
    return { config: ac, columns };
}
exports.parseAnnotationConfig = parseAnnotationConfig;
/**
 * A ``fixed_duration`` tool setting: a number (fixed window), or ``{window}`` (fixed) /
 * ``{initial_window, min, max, step}`` (user-editable). Null for anything else.
 */
function parseFixedDuration(raw) {
    var _a;
    if (typeof raw === 'number')
        return { value: raw, editable: false };
    if (typeof raw === 'object' && raw !== null) {
        const hasInitial = raw.initial_window != null;
        return {
            value: hasInitial ? raw.initial_window : ((_a = raw.window) !== null && _a !== void 0 ? _a : 1),
            editable: hasInitial,
            min: raw.min,
            max: raw.max,
            step: raw.step,
        };
    }
    return null;
}
exports.parseFixedDuration = parseFixedDuration;


/***/ },

/***/ "./lib/sections/form/formConfig.js"
/*!*****************************************!*\
  !*** ./lib/sections/form/formConfig.js ***!
  \*****************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.requiredColumns = exports.elementColumn = exports.asElementList = void 0;
/**
 * Small helpers for reading form config (no DOM, unit-tested).
 *
 * License: BSD 3-Clause
 */
//
// Public
//
/**
 * A form section as a list of ``{type: config}`` elements. Sections may be written as a
 * list or as a mapping (``{select: {...}, textbox: {...}}``, converted in key order).
 * Returns null for anything else.
 */
function asElementList(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === 'object')
        return Object.keys(raw).map(k => ({ [k]: raw[k] }));
    return null;
}
exports.asElementList = asElementList;
/** The output column of an input element: ``column``, else ``label``, else the type. */
function elementColumn(type, cfg) {
    var _a, _b;
    return (_b = (_a = cfg === null || cfg === void 0 ? void 0 : cfg.column) !== null && _a !== void 0 ? _a : cfg === null || cfg === void 0 ? void 0 : cfg.label) !== null && _b !== void 0 ? _b : type;
}
exports.elementColumn = elementColumn;
/** Output columns of the ``required`` inputs among ``elements``. */
function requiredColumns(elements) {
    var _a;
    const cols = [];
    for (const item of elements) {
        if (!item || typeof item !== 'object')
            continue;
        const [type] = Object.keys(item);
        const cfg = (_a = item[type]) !== null && _a !== void 0 ? _a : {};
        if (cfg.required)
            cols.push(elementColumn(type, cfg));
    }
    return cols;
}
exports.requiredColumns = requiredColumns;


/***/ },

/***/ "./lib/sections/form/inputs.js"
/*!*************************************!*\
  !*** ./lib/sections/form/inputs.js ***!
  \*************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.boxLabel = exports.buildSelect = void 0;
/**
 * DOM builders for form inputs shared by the main form and the per-box (multibox) forms:
 * the select (with optional filter box and "+ Add" custom value) and the small labelled
 * textbox / number / checkbox used inside box cards.
 *
 * Builders only create elements and report changes through callbacks; the FormPanel owns
 * the values.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const selectItems_1 = __webpack_require__(/*! ./selectItems */ "./lib/sections/form/selectItems.js");
//
// Constants
//
/** Rows shown when the filter box expands the select into a list. */
const FILTER_LIST_SIZE = 8;
/** Sizes for the main form vs. the compact per-box form. */
const SELECT_VARIANTS = {
    main: {
        select: `font-size:13px;max-width:260px;`,
        filter: (0, styles_1.inputStyle)('110px') + `font-size:13px;`,
        filterPlaceholder: 'filter options',
        filterClass: 'jp-BA-filter-input',
        add: `font-size:11px;padding:2px 6px;display:none;`,
        // main form: Enter keeps the filtered option list
        rebuildOnEnter: false,
    },
    box: {
        select: `font-size:11px;max-width:160px;`,
        filter: (0, styles_1.inputStyle)('80px') + `font-size:11px;`,
        filterPlaceholder: 'filter',
        filterClass: '',
        add: `font-size:10px;padding:2px 6px;display:none;`,
        rebuildOnEnter: true,
    },
};
//
// Public
//
/**
 * A select with an empty "— select —" option and ``items`` (``selected::`` defaults
 * pre-selected). With a filter box, typing narrows and expands the list, arrows move the
 * selection and Enter picks; with ``customValue`` an "+ Add" button adds the typed text.
 */
function buildSelect(opts) {
    const v = SELECT_VARIANTS[opts.variant];
    const { items } = opts;
    const sel = document.createElement('select');
    sel.style.cssText = (0, styles_1.selectStyle)() + v.select;
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— select —';
    sel.appendChild(emptyOpt);
    /** Re-fill the options (keeping the empty one), optionally filtered. */
    const rebuildOptions = (filter) => {
        while (sel.options.length > 1)
            sel.remove(1);
        const f = (filter !== null && filter !== void 0 ? filter : '').toLowerCase();
        for (const item of items) {
            if (f && !item.label.toLowerCase().includes(f) && !item.val.toLowerCase().includes(f))
                continue;
            const o = document.createElement('option');
            o.value = item.val;
            o.textContent = item.label;
            if (item.isDefault && !f)
                o.selected = true;
            sel.appendChild(o);
        }
    };
    rebuildOptions();
    sel.addEventListener('change', opts.onChange);
    if (!opts.filterBox && !opts.customValue)
        return { select: sel, element: sel };
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;
    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = v.filterPlaceholder;
    if (v.filterClass)
        filterInput.className = v.filterClass;
    filterInput.style.cssText = v.filter;
    let addBtn = null;
    if (opts.customValue) {
        const btn = document.createElement('button');
        btn.textContent = '+ Add';
        btn.style.cssText = (0, styles_1.btnStyle)() + v.add;
        btn.addEventListener('click', () => {
            const custom = filterInput.value.trim();
            if (!custom)
                return;
            items.push({ val: custom, label: custom, isDefault: false });
            rebuildOptions();
            sel.value = custom;
            filterInput.value = '';
            btn.style.display = 'none';
            opts.onChange();
        });
        addBtn = btn;
    }
    filterInput.addEventListener('input', () => {
        const f = filterInput.value.trim();
        rebuildOptions(f);
        // expand the list so the filtered results show; collapse when the filter is cleared
        sel.size = f ? Math.min(FILTER_LIST_SIZE, sel.options.length) : 0;
        if (addBtn)
            addBtn.style.display = f && !(0, selectItems_1.hasExactItem)(items, f) ? '' : 'none';
    });
    filterInput.addEventListener('keydown', e => {
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
                if (v.rebuildOnEnter)
                    rebuildOptions();
                opts.onChange();
            }
        }
    });
    sel.addEventListener('change', () => { sel.size = 0; }); // collapse after a pick
    wrapper.append(sel, filterInput);
    if (addBtn)
        wrapper.appendChild(addBtn);
    return { select: sel, element: wrapper };
}
exports.buildSelect = buildSelect;
/** A compact ``<label>text <control></label>`` for box cards. */
function boxLabel(text, control) {
    const lbl = document.createElement('label');
    lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
    lbl.textContent = text;
    lbl.appendChild(control);
    return lbl;
}
exports.boxLabel = boxLabel;


/***/ },

/***/ "./lib/sections/form/multiboxCards.js"
/*!********************************************!*\
  !*** ./lib/sections/form/multiboxCards.js ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildBoxForm = exports.buildBoxCard = void 0;
/**
 * Multibox box cards in the FormPanel: one card per drawn box (color dot, bounds, ×) with
 * an optional per-box form whose values live in ``entry.formValues``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const text_1 = __webpack_require__(/*! ../../text */ "./lib/text.js");
const formConfig_1 = __webpack_require__(/*! ./formConfig */ "./lib/sections/form/formConfig.js");
const inputs_1 = __webpack_require__(/*! ./inputs */ "./lib/sections/form/inputs.js");
const selectItems_1 = __webpack_require__(/*! ./selectItems */ "./lib/sections/form/selectItems.js");
//
// Public
//
/**
 * A box card (without its form): colored left strip, dot, ``t0–t1s  f0–f1 kHz`` and ×.
 * Highlighted when ``active``.
 */
function buildBoxCard(entry, index, active, h) {
    const card = document.createElement('div');
    card.dataset.multiboxIdx = String(index);
    card.style.cssText =
        `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
            `border-radius:4px;border-left:3px solid ${entry.color};` +
            `background:${active ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgMantle};cursor:pointer;`;
    card.addEventListener('click', h.onSelect);
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${entry.color};`;
    const bounds = document.createElement('span');
    bounds.style.cssText =
        `font-size:10px;color:${styles_1.COLORS.textSubtle};font-family:ui-monospace,monospace;white-space:nowrap;`;
    bounds.textContent =
        `${entry.startTime.toFixed(1)}–${entry.endTime.toFixed(1)}s` +
            `  ${(entry.minFreq / 1000).toFixed(1)}–${(entry.maxFreq / 1000).toFixed(1)} kHz`;
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.title = text_1.TOOLTIP.removeBox;
    delBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:14px;padding:0 6px;line-height:1;`;
    delBtn.addEventListener('click', e => {
        e.stopPropagation();
        h.onRemove();
    });
    headerRow.append(dot, bounds, spacer, delBtn);
    card.appendChild(headerRow);
    return card;
}
exports.buildBoxCard = buildBoxCard;
/**
 * Build a box's form into ``container``: text / break / line, and select / textbox /
 * number / checkbox inputs bound to ``entry.formValues`` (existing values are kept).
 *
 * @param loadItems - Resolves a select's ``items`` to raw items (files load in the kernel).
 * @param onChange - Called after any value changes (re-validate).
 */
async function buildBoxForm(elements, container, entry, loadItems, onChange) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const values = entry.formValues;
    for (const item of elements) {
        if (!item || typeof item !== 'object')
            continue;
        const [type] = Object.keys(item);
        const config = item[type];
        const cfg = config !== null && config !== void 0 ? config : {};
        const col = (0, formConfig_1.elementColumn)(type, cfg);
        switch (type) {
            case 'text': {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.mutedTextStyle)({ width: '100%', fontSize: 11 });
                d.textContent = String(config && typeof config === 'object' ? ((_a = config.value) !== null && _a !== void 0 ? _a : '') : config);
                container.appendChild(d);
                break;
            }
            case 'break':
                container.appendChild(document.createElement('br'));
                break;
            case 'line': {
                const d = document.createElement('div');
                d.style.cssText = (0, styles_1.fullWidthDividerStyle)();
                container.appendChild(d);
                break;
            }
            case 'select': {
                const flags = (0, selectItems_1.selectItemOptions)(cfg.items);
                const { items, selectedDefault } = (0, selectItems_1.parseSelectItems)(await loadItems(cfg.items), flags.notAvailable);
                const built = (0, inputs_1.buildSelect)({
                    items, filterBox: flags.filterBox, customValue: flags.customValue, variant: 'box',
                    onChange: () => { values[col] = built.select.value; onChange(); },
                });
                values[col] = (_b = values[col]) !== null && _b !== void 0 ? _b : selectedDefault;
                if (values[col])
                    built.select.value = values[col];
                container.appendChild((0, inputs_1.boxLabel)((_c = cfg.label) !== null && _c !== void 0 ? _c : col, built.element));
                break;
            }
            case 'textbox': {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.style.cssText = (0, styles_1.inputStyle)('100px') + `font-size:11px;`;
                inp.addEventListener('input', () => { values[col] = inp.value; onChange(); });
                values[col] = (_d = values[col]) !== null && _d !== void 0 ? _d : '';
                inp.value = values[col];
                container.appendChild((0, inputs_1.boxLabel)((_e = cfg.label) !== null && _e !== void 0 ? _e : col, inp));
                break;
            }
            case 'number': {
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
                    values[col] = inp.value === '' ? null : parseFloat(inp.value);
                    onChange();
                });
                values[col] = (_f = values[col]) !== null && _f !== void 0 ? _f : null;
                if (values[col] != null)
                    inp.value = String(values[col]);
                container.appendChild((0, inputs_1.boxLabel)((_g = cfg.label) !== null && _g !== void 0 ? _g : col, inp));
                break;
            }
            case 'checkbox': {
                const checkedVal = (_j = (_h = cfg.checked_value) !== null && _h !== void 0 ? _h : cfg.yes_value) !== null && _j !== void 0 ? _j : true;
                const uncheckedVal = (_l = (_k = cfg.unchecked_value) !== null && _k !== void 0 ? _k : cfg.no_value) !== null && _l !== void 0 ? _l : false;
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                inp.checked = Boolean((_m = values[col]) !== null && _m !== void 0 ? _m : cfg.default);
                inp.addEventListener('change', () => {
                    values[col] = inp.checked ? checkedVal : uncheckedVal;
                    onChange();
                });
                values[col] = inp.checked ? checkedVal : uncheckedVal;
                container.appendChild((0, inputs_1.boxLabel)((_o = cfg.label) !== null && _o !== void 0 ? _o : col, inp));
                break;
            }
        }
    }
}
exports.buildBoxForm = buildBoxForm;


/***/ },

/***/ "./lib/sections/form/progress.js"
/*!***************************************!*\
  !*** ./lib/sections/form/progress.js ***!
  \***************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isAccuracyValid = exports.accuracyPercent = exports.formatProgress = void 0;
/**
 * Progress-tracker text and accuracy for the FormPanel (no DOM, unit-tested).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
//
// Public
//
/**
 * The progress line: ``session s/N · total t/N · accuracy a%`` (session only once something
 * was saved this session; accuracy only when known). File rows count at most ``total``.
 */
function formatProgress(sessionCount, fileCount, total, accuracy) {
    const done = Math.min(fileCount, total) + sessionCount;
    const parts = [];
    if (sessionCount > 0)
        parts.push(`session ${sessionCount}/${total}`);
    parts.push(`total ${done}/${total}`);
    if (accuracy !== null)
        parts.push(`accuracy ${accuracy}%`);
    return parts.join(' · ');
}
exports.formatProgress = formatProgress;
/**
 * Percentage (rounded) of output rows whose accuracy column counts as correct: equal to the
 * configured value (case-insensitive), or truthy (``isTruthyValue``) when none is set.
 * Null for no rows.
 */
function accuracyPercent(rows, config) {
    if (rows.length === 0)
        return null;
    const valid = rows.filter(r => isAccuracyValid(r[config.column], config.value)).length;
    return Math.round(100 * valid / rows.length);
}
exports.accuracyPercent = accuracyPercent;
/** Whether one cell counts as correct for the accuracy check. */
function isAccuracyValid(cellValue, configValue) {
    if (configValue !== null) {
        return String(cellValue !== null && cellValue !== void 0 ? cellValue : '').toLowerCase() === configValue.toLowerCase();
    }
    return (0, util_1.isTruthyValue)(cellValue);
}
exports.isAccuracyValid = isAccuracyValid;


/***/ },

/***/ "./lib/sections/form/reviewed.js"
/*!***************************************!*\
  !*** ./lib/sections/form/reviewed.js ***!
  \***************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildReviewedView = exports.reviewedAnnotation = void 0;
/**
 * The "REVIEWED" view the FormPanel shows instead of the form for an already-submitted row
 * (when ``duplicate_entries`` is off): the saved values, Prev / Next, and "Delete this
 * review". Also works out which annotation to draw from the saved values.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
//
// Public
//
/**
 * Which annotation saved ``rows`` describe: several rows with times + frequencies are
 * multibox boxes; one such row is a bounding box; otherwise a start/end or a start time.
 */
function reviewedAnnotation(rows, ac) {
    var _a, _b, _c, _d;
    const result = { tool: '', boxes: [], values: {} };
    if (!ac || rows.length === 0)
        return result;
    const cols = {
        st: (_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col, et: (_b = ac.endTime) === null || _b === void 0 ? void 0 : _b.col, lo: (_c = ac.minFreq) === null || _c === void 0 ? void 0 : _c.col, hi: (_d = ac.maxFreq) === null || _d === void 0 ? void 0 : _d.col,
    };
    const first = rows[0];
    const has = (col) => !!col && first[col] != null && first[col] !== '';
    const num = (row, col) => parseFloat(String(row[col]));
    const hasTimes = has(cols.st) && has(cols.et);
    const hasFreqs = has(cols.lo) && has(cols.hi);
    const take = (...keys) => {
        for (const k of keys)
            result.values[cols[k]] = num(first, cols[k]);
    };
    if (rows.length > 1 && hasTimes && hasFreqs) {
        result.tool = 'multibox';
        result.boxes = rows.map((r, i) => ({
            id: i,
            startTime: num(r, cols.st),
            endTime: num(r, cols.et),
            minFreq: num(r, cols.lo),
            maxFreq: num(r, cols.hi),
            formValues: {},
            color: styles_1.DISPLAY_CHIP_COLORS[i % styles_1.DISPLAY_CHIP_COLORS.length],
        }));
    }
    else if (rows.length === 1 && hasTimes && hasFreqs) {
        result.tool = 'bounding_box';
        take('st', 'et', 'lo', 'hi');
    }
    else if (hasTimes) {
        result.tool = 'start_end_time_select';
        take('st', 'et');
    }
    else if (has(cols.st)) {
        result.tool = 'time_select';
        take('st');
    }
    return result;
}
exports.reviewedAnnotation = reviewedAnnotation;
/**
 * The reviewed view's elements, in order: title, saved-value cards (one per row, colored
 * when there are several), divider, button row.
 */
function buildReviewedView(rows, opts) {
    const title = document.createElement('div');
    title.style.cssText =
        `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${styles_1.COLORS.green};`;
    title.textContent = 'REVIEWED';
    const container = document.createElement('div');
    container.style.cssText = `display:flex;flex-direction:column;gap:6px;padding:4px 0;overflow-y:auto;`;
    rows.forEach((data, ri) => container.appendChild(_reviewedCard(data, ri, rows.length > 1)));
    const divider = document.createElement('div');
    divider.style.cssText = (0, styles_1.dividerStyle)('4px -2px');
    return [title, container, divider, _buttonRow(opts)];
}
exports.buildReviewedView = buildReviewedView;
//
// Internal
//
/** One saved row as ``key value`` lines (compact chips when ``multi``). */
function _reviewedCard(data, index, multi) {
    const card = document.createElement('div');
    card.style.cssText = multi
        ? `display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:4px 8px;` +
            `border-radius:4px;border-left:3px solid ${styles_1.DISPLAY_CHIP_COLORS[index % styles_1.DISPLAY_CHIP_COLORS.length]};`
        : `display:flex;flex-direction:column;gap:2px;`;
    for (const [key, val] of Object.entries(data)) {
        const line = document.createElement('span');
        line.style.cssText = multi
            ? `display:inline-flex;gap:4px;font-size:12px;white-space:nowrap;`
            : `display:flex;gap:8px;font-size:12px;`;
        const keyEl = document.createElement('span');
        keyEl.style.cssText = multi
            ? `color:${styles_1.COLORS.textMuted};`
            : `color:${styles_1.COLORS.textMuted};min-width:140px;flex-shrink:0;`;
        keyEl.textContent = key;
        const valEl = document.createElement('span');
        valEl.style.cssText = `color:${styles_1.COLORS.textPrimary};`;
        valEl.textContent = val != null && val !== '' ? String(val) : '—';
        line.append(keyEl, valEl);
        card.appendChild(line);
    }
    return card;
}
/** Prev / Next on the left, "Delete this review" on the right. */
function _buttonRow(opts) {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:2px;`;
    const navBtnStyle = (0, styles_1.btnStyle)() + `font-size:12px;width:75px;height:28px`;
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Prev';
    prevBtn.style.cssText = navBtnStyle;
    prevBtn.disabled = !opts.canPrev;
    prevBtn.addEventListener('click', opts.onPrev);
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = navBtnStyle;
    nextBtn.disabled = !opts.canNext;
    nextBtn.addEventListener('click', opts.onNext);
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete this review';
    deleteBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:12px;color:${styles_1.COLORS.red};`;
    deleteBtn.addEventListener('click', opts.onDelete);
    row.append(prevBtn, nextBtn, spacer, deleteBtn);
    return row;
}


/***/ },

/***/ "./lib/sections/form/selectItems.js"
/*!******************************************!*\
  !*** ./lib/sections/form/selectItems.js ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hasExactItem = exports.parseSelectItems = exports.notAvailableItem = exports.loadRawSelectItems = exports.selectItemOptions = void 0;
/**
 * Select-item parsing for form ``select`` inputs (no DOM, unit-tested).
 *
 * A select's ``items`` can be a list (strings, ``{label, value, form}`` objects or legacy
 * ``{value: label}`` pairs), a numeric range ``{min, max, step}``, or a file
 * (``'path.csv'`` / ``{path, value, label}``) loaded in the kernel. Any item may be marked
 * as the default with a ``selected::`` prefix; ``items.not_available`` prepends a
 * "not available" choice.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const util_1 = __webpack_require__(/*! ../../util */ "./lib/util.js");
//
// Constants
//
const NOT_AVAILABLE = 'not-available';
//
// Public
//
/** The ``filter_box`` / ``custom_value`` / ``not_available`` flags of a select's ``items``. */
function selectItemOptions(itemsCfg) {
    const isObj = !!itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg);
    return {
        filterBox: isObj && !!itemsCfg.filter_box,
        customValue: isObj && !!itemsCfg.custom_value,
        notAvailable: isObj ? itemsCfg.not_available : undefined,
    };
}
exports.selectItemOptions = selectItemOptions;
/**
 * Resolve ``items`` to raw ``[value, label, formRef?]`` tuples, loading files with
 * ``loadFile``. Unknown shapes give [].
 */
async function loadRawSelectItems(items, loadFile) {
    var _a, _b;
    if (!items)
        return [];
    if (Array.isArray(items))
        return items.map(_rawItem);
    if (typeof items === 'string')
        return loadFile(items);
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
        if ('path' in items)
            return loadFile(items.path, items.value, items.label);
    }
    return [];
}
exports.loadRawSelectItems = loadRawSelectItems;
/**
 * The ``[value, label]`` of the "not available" choice for an ``items.not_available``
 * setting (``true``, a string, or ``{label, value}``), or null when it is off.
 */
function notAvailableItem(cfg) {
    var _a, _b;
    if (!cfg)
        return null;
    if (typeof cfg === 'string')
        return [cfg, cfg];
    if (cfg !== true && typeof cfg === 'object') {
        const o = cfg;
        const label = (_a = o.label) !== null && _a !== void 0 ? _a : NOT_AVAILABLE;
        return [(_b = o.value) !== null && _b !== void 0 ? _b : label, label];
    }
    return [NOT_AVAILABLE, NOT_AVAILABLE];
}
exports.notAvailableItem = notAvailableItem;
/**
 * Parse raw items into options (stripping ``selected::``), with the "not available" choice
 * first when configured.
 *
 * @returns The options and the default value ('' when none is marked).
 */
function parseSelectItems(raw, notAvailable) {
    const all = [...raw];
    const na = notAvailableItem(notAvailable);
    if (na)
        all.unshift(na);
    let selectedDefault = '';
    const items = all.map(([v, l, formRef]) => {
        const { value, selected } = (0, util_1.splitSelected)(v);
        if (selected)
            selectedDefault = value;
        return { val: value, label: (0, util_1.splitSelected)(l).value, formRef, isDefault: selected };
    });
    return { items, selectedDefault };
}
exports.parseSelectItems = parseSelectItems;
/** True if ``text`` equals an option's value or label (case-insensitive). */
function hasExactItem(items, text) {
    const t = text.toLowerCase();
    return items.some(item => item.val.toLowerCase() === t || item.label.toLowerCase() === t);
}
exports.hasExactItem = hasExactItem;
//
// Internal
//
/** One list entry as a raw item. */
function _rawItem(item) {
    var _a, _b, _c, _d;
    if (typeof item === 'string')
        return [item, item];
    if (typeof item === 'object' && item !== null) {
        // {label, value, form} / {label, form}, or legacy {value: label}
        if ('label' in item || 'form' in item) {
            const label = (_b = (_a = item.label) !== null && _a !== void 0 ? _a : item.value) !== null && _b !== void 0 ? _b : '';
            const value = (_d = (_c = item.value) !== null && _c !== void 0 ? _c : item.label) !== null && _d !== void 0 ? _d : '';
            return [String(value), String(label), item.form];
        }
        const [k] = Object.keys(item);
        return [k, String(item[k])];
    }
    return [String(item), String(item)];
}


/***/ },

/***/ "./lib/sections/playerControls.js"
/*!****************************************!*\
  !*** ./lib/sections/playerControls.js ***!
  \****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildPlayerDom = void 0;
/**
 * DOM construction for the spectrogram Player: the controls bar (type, resolution, buffer,
 * Update, Capture), the view-bounds bar (time/frequency window, zoom-box, pan, Reset), the
 * canvas container and the playback bar.
 *
 * Only builds elements and forwards clicks/keys to handlers; the Player owns all state.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const text_1 = __webpack_require__(/*! ../text */ "./lib/text.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
//
// Constants
//
const PAN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
//
// Public
//
/**
 * Build the Player's bars, canvas and (hidden) audio element.
 *
 * @param h - Control handlers.
 * @param canvasHeight - Initial canvas container height (px).
 */
function buildPlayerDom(h, canvasHeight) {
    // ── Controls bar ──────────────────────────────────────────────
    const playerCtrls = document.createElement('div');
    playerCtrls.style.cssText = (0, styles_1.barBottomStyle)();
    const spectTypeSelect = _labeledSelect('Type', playerCtrls);
    const resolutionSelect = _labeledSelect('Res', playerCtrls);
    const bufferInput = _labeledNumber('Buffer (s)', '3', '50px', playerCtrls);
    const loadBtn = _button('Update', (0, styles_1.btnStyle)(true), h.onLoad);
    playerCtrls.appendChild(loadBtn);
    const loadOnEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            h.onLoad();
        }
    };
    bufferInput.addEventListener('input', h.onDirty);
    bufferInput.addEventListener('keydown', loadOnEnter);
    for (const sel of [spectTypeSelect, resolutionSelect]) {
        sel.addEventListener('change', h.onDirty);
        sel.addEventListener('keydown', loadOnEnter);
    }
    const captureBtn = _button('Capture', (0, styles_1.btnStyle)() + `display:none;margin-left:auto;`, h.onCapture);
    playerCtrls.appendChild(captureBtn);
    // ── View bounds bar ───────────────────────────────────────────
    const viewBar = document.createElement('div');
    viewBar.style.cssText = (0, styles_1.barBottomStyle)();
    const viewTimeMin = _labeledNumber('Time min (s)', '0', '70px', viewBar);
    const viewTimeMax = _labeledNumber('Time max (s)', '0', '70px', viewBar);
    const viewFreqMin = _labeledNumber('Freq min (kHz)', '0', '65px', viewBar);
    const viewFreqMax = _labeledNumber('Freq max (kHz)', '0', '65px', viewBar);
    for (const inp of [viewTimeMin, viewTimeMax, viewFreqMin, viewFreqMax]) {
        inp.addEventListener('change', h.onApplyViewBounds);
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                h.onApplyViewBounds();
            }
        });
    }
    const zoomBoxBtn = _button('⬚', (0, styles_1.btnStyle)() + `font-size:13px;padding:2px 8px;`, h.onToggleZoomBox);
    zoomBoxBtn.title = text_1.TOOLTIP.zoomBox;
    const panToolBtn = _button('', (0, styles_1.btnStyle)() + `font-size:13px;padding:2px 8px;display:inline-flex;align-items:center;`, h.onTogglePan);
    panToolBtn.innerHTML = PAN_ICON_SVG;
    panToolBtn.title = text_1.TOOLTIP.panTool;
    viewBar.append(zoomBoxBtn, panToolBtn, _button('Reset', (0, styles_1.btnStyle)(), h.onResetZoom));
    // ── Spectrogram canvas ────────────────────────────────────────
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText =
        `flex:0 0 ${canvasHeight}px;position:relative;background:${styles_1.COLORS.bgCrust};` +
            `overflow:hidden;cursor:default;transition:opacity 0.2s ease;`;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:100%;height:100%;`;
    canvas.tabIndex = 0; // focusable, for keyboard shortcuts
    canvas.style.outline = 'none';
    canvasContainer.appendChild(canvas);
    // ── Playback bar ──────────────────────────────────────────────
    const playBar = document.createElement('div');
    playBar.style.cssText = (0, styles_1.barTopBottomStyle)();
    const playBtn = _button('▶', (0, styles_1.btnStyle)() + `font-size:15px;width:34px;height:28px;`, h.onTogglePlay);
    const timeDisplay = document.createElement('span');
    timeDisplay.style.cssText = (0, styles_1.monoTextStyle)();
    timeDisplay.textContent = '0:00.00 / 0:00.00';
    const signalTimeDisplay = document.createElement('span');
    signalTimeDisplay.style.cssText =
        `margin-left:auto;font-size:11px;color:${styles_1.COLORS.mauve};font-family:ui-monospace,monospace;`;
    signalTimeDisplay.textContent = '';
    playBar.append(playBtn, timeDisplay, signalTimeDisplay);
    const audio = document.createElement('audio');
    audio.style.display = 'none';
    return {
        bars: [playerCtrls, viewBar, canvasContainer, playBar, audio],
        spectTypeSelect, resolutionSelect, bufferInput, loadBtn, captureBtn,
        viewTimeMin, viewTimeMax, viewFreqMin, viewFreqMax, zoomBoxBtn, panToolBtn,
        canvasContainer, canvas, playBtn, timeDisplay, signalTimeDisplay, audio,
    };
}
exports.buildPlayerDom = buildPlayerDom;
//
// Internal
//
/** A button with text, inline CSS and a click handler. */
function _button(text, css, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = css;
    btn.addEventListener('click', onClick);
    return btn;
}
/** ``<label>text <select></label>`` appended to ``parent``; returns the select. */
function _labeledSelect(text, parent) {
    const lbl = document.createElement('label');
    lbl.style.cssText = (0, styles_1.labelStyle)();
    lbl.textContent = text;
    const sel = document.createElement('select');
    sel.style.cssText = (0, styles_1.selectStyle)();
    lbl.appendChild(sel);
    parent.appendChild(lbl);
    return sel;
}
/** ``<label>text <input type=number></label>`` appended to ``parent``; returns the input. */
function _labeledNumber(text, value, width, parent) {
    const lbl = document.createElement('label');
    lbl.style.cssText = (0, styles_1.labelStyle)();
    lbl.textContent = text;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = value;
    inp.style.cssText = (0, styles_1.inputStyle)(width);
    lbl.appendChild(inp);
    parent.appendChild(lbl);
    return inp;
}


/***/ },

/***/ "./lib/sections/playerGeometry.js"
/*!****************************************!*\
  !*** ./lib/sections/playerGeometry.js ***!
  \****************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.niceTickInterval = exports.pointInBox = exports.hitTestBox = exports.clampWindow = exports.zoomToBox = exports.zoomView = exports.panView = exports.isTimeZoomed = exports.isZoomed = exports.yToFreq = exports.freqToY = exports.xToTime = exports.timeToX = exports.fracToFreq = exports.freqToFrac = exports.melToHz = exports.hzToMel = exports.FULL_VIEW = void 0;
//
// Constants
//
/** The whole spectrogram (no zoom). */
exports.FULL_VIEW = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
//
// Public
//
// ── Frequency scales ──────────────────────────────────────────
/** Hz -> mel (HTK formula). */
function hzToMel(f) {
    return 2595 * Math.log10(1 + f / 700);
}
exports.hzToMel = hzToMel;
/** mel -> Hz (inverse of ``hzToMel``). */
function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}
exports.melToHz = melToHz;
/** Map a frequency (Hz) to its 0..1 fraction on ``scale``. */
function freqToFrac(f, scale) {
    const { min: fMin, max: fMax } = scale;
    if (scale.kind === 'mel') {
        const melMin = hzToMel(fMin);
        const melMax = hzToMel(fMax);
        return (melMax - melMin) > 0 ? (hzToMel(f) - melMin) / (melMax - melMin) : 0;
    }
    else if (scale.kind === 'log') {
        const logMin = Math.log(Math.max(1, fMin));
        const logMax = Math.log(Math.max(1, fMax));
        return (logMax - logMin) > 0 ? (Math.log(Math.max(1, f)) - logMin) / (logMax - logMin) : 0;
    }
    else if (scale.kind === 'lut' && scale.lut) {
        // Interpolate: the frac value at position (f - fMin) / (fMax - fMin) in the LUT
        const lut = scale.lut;
        const pos = (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) * (lut.length - 1) : 0;
        const lo = Math.floor(pos), hi = Math.min(lo + 1, lut.length - 1);
        const t = pos - lo;
        return lut[lo] * (1 - t) + lut[hi] * t;
    }
    return (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) : 0;
}
exports.freqToFrac = freqToFrac;
/** Map a 0..1 fraction on ``scale`` back to a frequency (Hz); inverse of ``freqToFrac``. */
function fracToFreq(frac, scale) {
    const { min: fMin, max: fMax } = scale;
    if (scale.kind === 'mel') {
        const melMin = hzToMel(fMin);
        const melMax = hzToMel(fMax);
        return melToHz(melMin + frac * (melMax - melMin));
    }
    else if (scale.kind === 'log') {
        const logMin = Math.log(Math.max(1, fMin));
        const logMax = Math.log(Math.max(1, fMax));
        return Math.exp(logMin + frac * (logMax - logMin));
    }
    else if (scale.kind === 'lut' && scale.lut) {
        // Binary search for the frac in the LUT, then interpolate the frequency
        const lut = scale.lut;
        let lo = 0, hi = lut.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (lut[mid] <= frac)
                lo = mid;
            else
                hi = mid;
        }
        const t = (lut[hi] - lut[lo]) > 0 ? (frac - lut[lo]) / (lut[hi] - lut[lo]) : 0;
        return fMin + ((lo + t) / (lut.length - 1)) * (fMax - fMin);
    }
    return fMin + frac * (fMax - fMin);
}
exports.fracToFreq = fracToFreq;
// ── Canvas <-> data ───────────────────────────────────────────
/** Absolute time (s) -> canvas x, for a canvas ``canvasW`` px wide. */
function timeToX(t, seg, view, canvasW, axisW) {
    const frac = (t - seg.loadStart) / seg.duration;
    return axisW + ((frac - view.xMin) / (view.xMax - view.xMin)) * (canvasW - axisW);
}
exports.timeToX = timeToX;
/** Canvas x -> absolute time (s); inverse of ``timeToX``. */
function xToTime(x, seg, view, canvasW, axisW) {
    const viewFrac = view.xMin + ((x - axisW) / (canvasW - axisW)) * (view.xMax - view.xMin);
    return seg.loadStart + viewFrac * seg.duration;
}
exports.xToTime = xToTime;
/** Frequency (Hz) -> canvas y, for a canvas ``canvasH`` px tall with ``padY`` padding. */
function freqToY(f, scale, view, canvasH, padY) {
    const specH = canvasH - 2 * padY;
    const viewFrac = (freqToFrac(f, scale) - view.yMin) / (view.yMax - view.yMin);
    return padY + specH * (1 - viewFrac);
}
exports.freqToY = freqToY;
/** Canvas y -> frequency (Hz); inverse of ``freqToY``. */
function yToFreq(y, scale, view, canvasH, padY) {
    const specH = canvasH - 2 * padY;
    const viewFrac = 1 - (y - padY) / specH;
    return fracToFreq(view.yMin + viewFrac * (view.yMax - view.yMin), scale);
}
exports.yToFreq = yToFreq;
// ── View window ───────────────────────────────────────────────
/** True if the view is zoomed in on either axis. */
function isZoomed(view) {
    return view.xMin > 0 || view.xMax < 1 || view.yMin > 0 || view.yMax < 1;
}
exports.isZoomed = isZoomed;
/** True if the view is zoomed in on the time axis. */
function isTimeZoomed(view) {
    return view.xMin > 0 || view.xMax < 1;
}
exports.isTimeZoomed = isTimeZoomed;
/**
 * Move the view by ``dx`` / ``dy`` (fractions, +y = up), keeping its size and staying inside
 * the spectrogram.
 */
function panView(view, dx, dy) {
    const w = view.xMax - view.xMin;
    const h = view.yMax - view.yMin;
    const xMin = Math.max(0, Math.min(1 - w, view.xMin + dx));
    const yMin = Math.max(0, Math.min(1 - h, view.yMin + dy));
    return { xMin, xMax: xMin + w, yMin, yMax: yMin + h };
}
exports.panView = panView;
/**
 * Zoom the view by ``factor`` (< 1 zooms in) around a point given as a fraction of the
 * current view (default: its center), staying inside the spectrogram.
 */
function zoomView(view, factor, cx, cy) {
    const viewW = view.xMax - view.xMin;
    const viewH = view.yMax - view.yMin;
    const centerX = cx !== undefined ? view.xMin + cx * viewW : (view.xMin + view.xMax) / 2;
    const centerY = cy !== undefined ? view.yMin + cy * viewH : (view.yMin + view.yMax) / 2;
    const newW = Math.min(1, viewW * factor);
    const newH = Math.min(1, viewH * factor);
    let xMin = centerX - newW * ((centerX - view.xMin) / viewW);
    let yMin = centerY - newH * ((centerY - view.yMin) / viewH);
    xMin = Math.max(0, Math.min(1 - newW, xMin));
    yMin = Math.max(0, Math.min(1 - newH, yMin));
    return { xMin, xMax: xMin + newW, yMin, yMax: yMin + newH };
}
exports.zoomView = zoomView;
/**
 * Zoom into a box drawn on the canvas, given as fractions of the current view
 * (``x1 < x2`` left to right, ``y1 < y2`` top to bottom).
 */
function zoomToBox(view, x1, x2, y1, y2) {
    const vw = view.xMax - view.xMin;
    const vh = view.yMax - view.yMin;
    const xMin = view.xMin + x1 * vw;
    // y is inverted: the top of the canvas is the high frequency
    return {
        xMin,
        xMax: xMin + (x2 - x1) * vw,
        yMin: view.yMin + (1 - y2) * vh,
        yMax: view.yMin + (1 - y1) * vh,
    };
}
exports.zoomToBox = zoomToBox;
/**
 * Place a fixed-length window ``[start, start + dur]`` inside ``[lo, hi]``, sliding it
 * back in when it sticks out.
 */
function clampWindow(start, dur, lo, hi) {
    let s = start, e = start + dur;
    if (s < lo) {
        s = lo;
        e = lo + dur;
    }
    if (e > hi) {
        e = hi;
        s = hi - dur;
    }
    return [s, e];
}
exports.clampWindow = clampWindow;
// ── Hit testing / axis ────────────────────────────────────────
/**
 * Which edge of ``box`` the point is within ``grab`` px of (left, right, top, bottom — in that
 * order), else ``'inside'`` if it is inside the box, else null.
 */
function hitTestBox(cx, cy, box, grab) {
    const { sx, ex, yhi, ylo } = box;
    const inY = cy >= yhi - grab && cy <= ylo + grab;
    const inX = cx >= sx - grab && cx <= ex + grab;
    if (inY && Math.abs(cx - sx) <= grab)
        return 'left';
    if (inY && Math.abs(cx - ex) <= grab)
        return 'right';
    if (inX && Math.abs(cy - yhi) <= grab)
        return 'top';
    if (inX && Math.abs(cy - ylo) <= grab)
        return 'bottom';
    return pointInBox(cx, cy, box) ? 'inside' : null;
}
exports.hitTestBox = hitTestBox;
/** True if the point is inside ``box`` (edges included, no tolerance). */
function pointInBox(cx, cy, box) {
    return cx >= box.sx && cx <= box.ex && cy >= box.yhi && cy <= box.ylo;
}
exports.pointInBox = pointInBox;
/** A "nice" axis tick step (1, 2 or 5 x 10^n) giving about ``targetTicks`` ticks over ``range``. */
function niceTickInterval(range, targetTicks) {
    const raw = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm < 1.5)
        return mag;
    if (norm < 3.5)
        return 2 * mag;
    if (norm < 7.5)
        return 5 * mag;
    return 10 * mag;
}
exports.niceTickInterval = niceTickInterval;


/***/ },

/***/ "./lib/sections/playerRender.js"
/*!**************************************!*\
  !*** ./lib/sections/playerRender.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.drawFreqAxis = exports.drawDashedRect = exports.drawPlayhead = exports.drawBufferShading = exports.drawAnnotation = exports.ZOOM_BOX_FILL = void 0;
/**
 * Canvas drawing for the spectrogram Player: annotation overlays (per tool), playhead,
 * detection shading, frequency axis and drag previews.
 *
 * Functions here only draw: they get canvas coordinates (or projection functions) from the
 * Player and never read its state, so the same code draws the on-screen canvas and the
 * capture image.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const playerGeometry_1 = __webpack_require__(/*! ./playerGeometry */ "./lib/sections/playerGeometry.js");
//
// Constants
//
/** Translucent overlay colors (palette colors with alpha). */
const RGBA = {
    shade: 'rgba(0,0,0,0.25)',
    playhead: 'rgba(205,214,244,0.9)',
    blueLine: 'rgba(137,180,250,0.85)',
    blueFill: 'rgba(137,180,250,0.1)',
    blueBand: 'rgba(137,180,250,0.08)',
    greenLine: 'rgba(166,227,161,0.85)',
    redLine: 'rgba(243,139,168,0.85)',
    yellowLine: 'rgba(249,226,175,0.85)',
    yellowFill: 'rgba(249,226,175,0.12)',
};
const MARKER_HALF_W = 6;
const MARKER_H = 10;
const PLAYHEAD_MARKER_H = 11;
const HANDLE_RADIUS = 4;
const DASH = [4, 4];
const AXIS_FONT_SIZE = 10;
const AXIS_TICK_LEN = 4;
/** Target spacing (px) between frequency-axis ticks. */
const AXIS_TICK_SPACING = 40;
/** The zoom-box preview fill color. */
exports.ZOOM_BOX_FILL = RGBA.blueFill;
//
// Public
//
/** Draw the annotation overlay for ``view.tool`` (nothing for unset values). */
function drawAnnotation(ctx, p, view) {
    const { st, et, flo, fhi } = view.bounds;
    const H = p.height;
    switch (view.tool) {
        case 'time_select':
            if (st == null)
                return;
            _drawTimeLine(ctx, p.tx(st), H, RGBA.blueLine, styles_1.COLORS.blue);
            return;
        case 'start_end_time_select':
            if (st != null && et != null) {
                const sx = p.tx(st);
                ctx.fillStyle = RGBA.blueBand;
                ctx.fillRect(sx, 0, p.tx(et) - sx, H);
            }
            if (st != null)
                _drawTimeLine(ctx, p.tx(st), H, RGBA.greenLine, styles_1.COLORS.green);
            if (et != null)
                _drawTimeLine(ctx, p.tx(et), H, RGBA.redLine, styles_1.COLORS.red);
            return;
        case 'bounding_box': {
            if (st == null || et == null || flo == null || fhi == null)
                return;
            const sx = p.tx(st), ex = p.tx(et), yhi = p.ty(fhi), ylo = p.ty(flo);
            ctx.fillStyle = RGBA.blueFill;
            ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
            ctx.strokeStyle = RGBA.blueLine;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
            _drawCornerHandles(ctx, sx, ex, yhi, ylo, styles_1.COLORS.blue);
            return;
        }
        case 'fixed_duration': {
            if (st == null || et == null)
                return;
            const sx = p.tx(st), ex = p.tx(et);
            ctx.fillStyle = RGBA.yellowFill;
            ctx.fillRect(sx, 0, ex - sx, H);
            _drawTimeLine(ctx, sx, H, RGBA.yellowLine, styles_1.COLORS.yellow);
            _drawTimeLine(ctx, ex, H, RGBA.yellowLine, styles_1.COLORS.yellow);
            return;
        }
        case 'multibox':
            view.boxes.forEach((box, i) => _drawMultibox(ctx, p, box, i === view.activeBox));
            return;
    }
}
exports.drawAnnotation = drawAnnotation;
/**
 * Darken everything left of ``left`` and right of ``right`` (the buffer around the
 * detection), within ``[x0, width]``.
 */
function drawBufferShading(ctx, left, right, x0, width, height) {
    ctx.fillStyle = RGBA.shade;
    if (left > x0)
        ctx.fillRect(x0, 0, Math.floor(left) - x0, height);
    if (right < width) {
        const rx = Math.ceil(right);
        ctx.fillRect(rx, 0, width - rx, height);
    }
}
exports.drawBufferShading = drawBufferShading;
/** The playhead: a vertical line at ``x`` with a triangle marker on top. */
function drawPlayhead(ctx, x, height) {
    ctx.strokeStyle = RGBA.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    _drawMarker(ctx, x, styles_1.COLORS.textPrimary, PLAYHEAD_MARKER_H);
}
exports.drawPlayhead = drawPlayhead;
/** A dashed rectangle between two corners (drag previews), optionally filled. */
function drawDashedRect(ctx, x, y, w, h, stroke, lineWidth, fill) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(DASH);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
    }
}
exports.drawDashedRect = drawDashedRect;
/**
 * The frequency axis strip (``axisW`` px wide): kHz tick labels at "nice" intervals over the
 * visible range ``[fMin, fMax]``, positioned with ``freqToY`` (so mel/log scales are right).
 */
function drawFreqAxis(ctx, height, axisW, padY, fMin, fMax, freqToY) {
    const specH = height - 2 * padY;
    ctx.fillStyle = styles_1.COLORS.bgCrust;
    ctx.fillRect(0, 0, axisW, height);
    const targetTicks = Math.max(2, Math.floor(specH / AXIS_TICK_SPACING));
    const tickInterval = (0, playerGeometry_1.niceTickInterval)(fMax - fMin, targetTicks);
    const firstTick = Math.ceil(fMin / tickInterval) * tickInterval;
    ctx.fillStyle = styles_1.COLORS.textSubtle;
    ctx.strokeStyle = styles_1.COLORS.textMuted;
    ctx.lineWidth = 1;
    ctx.font = `${AXIS_FONT_SIZE}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let f = firstTick; f <= fMax; f += tickInterval) {
        const y = freqToY(f);
        ctx.beginPath();
        ctx.moveTo(axisW - AXIS_TICK_LEN, y);
        ctx.lineTo(axisW, y);
        ctx.stroke();
        // label in kHz (integer when possible)
        const khz = f / 1000;
        ctx.fillText(Number.isInteger(khz) ? String(khz) : khz.toFixed(1), axisW - AXIS_TICK_LEN - 2, y);
    }
    ctx.fillStyle = styles_1.COLORS.textMuted;
    ctx.font = `${AXIS_FONT_SIZE - 1}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('kHz', 2, AXIS_FONT_SIZE);
}
exports.drawFreqAxis = drawFreqAxis;
//
// Internal
//
/** A full-height vertical line with a triangle marker on top. */
function _drawTimeLine(ctx, x, height, line, marker) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    _drawMarker(ctx, x, marker);
}
/** A downward triangle at the top of the canvas, centered on ``x``. */
function _drawMarker(ctx, x, color, h = MARKER_H) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - MARKER_HALF_W, 0);
    ctx.lineTo(x + MARKER_HALF_W, 0);
    ctx.lineTo(x, h);
    ctx.closePath();
    ctx.fill();
}
/** Round handles on the four corners of a box. */
function _drawCornerHandles(ctx, sx, ex, yhi, ylo, color) {
    ctx.fillStyle = color;
    for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
        ctx.beginPath();
        ctx.arc(px, py, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}
/** One multibox box: solid with handles when active, faint and dashed otherwise. */
function _drawMultibox(ctx, p, box, isActive) {
    const sx = p.tx(box.startTime), ex = p.tx(box.endTime);
    const yhi = p.ty(box.maxFreq), ylo = p.ty(box.minFreq);
    ctx.fillStyle = isActive ? `${box.color}20` : `${box.color}0a`;
    ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
    ctx.strokeStyle = box.color;
    ctx.lineWidth = isActive ? 2.5 : 1;
    if (!isActive)
        ctx.setLineDash(DASH);
    ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
    ctx.setLineDash([]);
    if (isActive)
        _drawCornerHandles(ctx, sx, ex, yhi, ylo, box.color);
}


/***/ },

/***/ "./lib/styles.js"
/*!***********************!*\
  !*** ./lib/styles.js ***!
  \***********************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.injectGlobalStyles = exports.lockIconSvg = exports.cssSize = exports.filterChipDismissStyle = exports.filterChipStyle = exports.fullWidthDividerStyle = exports.dividerStyle = exports.formRowStyle = exports.mutedTextStyle = exports.monoTextStyle = exports.sectionTitleStyle = exports.formLabelStyle = exports.smallLabelStyle = exports.barTopBottomStyle = exports.barBottomStyle = exports.barStyle = exports.btnStyle = exports.labelStyle = exports.selectStyle = exports.inputStyle = exports.DISPLAY_CHIP_COLORS = exports.COLORS = void 0;
/**
 * Styling helpers shared by the annotator widget and the config builder.
 *
 * The color palette (Catppuccin Mocha) and the inline-CSS string factories live here so
 * components focus on behavior, not presentation. ``injectGlobalStyles`` adds the few rules
 * that can't be inline (placeholders, hover, table fixes), including some config-builder ones.
 *
 * License: BSD 3-Clause
 */
//
// Constants
//
/** The color palette (Catppuccin Mocha). */
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
    lockAmber: '#cf9268', // deadened peach — a locked file's lock toggle
};
/** Colors cycled through for multibox boxes and multi-row reviewed cards. */
exports.DISPLAY_CHIP_COLORS = [
    exports.COLORS.green, exports.COLORS.mauve, exports.COLORS.peach, exports.COLORS.sky, exports.COLORS.red,
];
/** Id of the injected global ``<style>`` element. */
const GLOBAL_STYLE_ID = 'jp-bioacoustic-global-styles';
//
// Public
//
// ── Inputs, buttons, bars ─────────────────────────────────────
/** Text / number input of width ``w``. */
const inputStyle = (w = '80px') => `background:${exports.COLORS.bgSurface0};border:1px solid ${exports.COLORS.bgSurface1};border-radius:4px;color:${exports.COLORS.textPrimary};` +
    `padding:3px 6px;font-size:12px;width:${w};box-sizing:border-box;`;
exports.inputStyle = inputStyle;
/** A ``<select>``. */
const selectStyle = () => `background:${exports.COLORS.bgSurface0};border:1px solid ${exports.COLORS.bgSurface1};border-radius:4px;color:${exports.COLORS.textPrimary};` +
    `padding:3px 5px;font-size:12px;`;
exports.selectStyle = selectStyle;
/** An inline label wrapping its control. */
const labelStyle = () => `display:flex;align-items:center;gap:5px;color:${exports.COLORS.textSubtle};font-size:11px;white-space:nowrap;`;
exports.labelStyle = labelStyle;
/** A button; ``primary`` is the filled blue call-to-action. */
const btnStyle = (primary = false) => primary
    ? `background:${exports.COLORS.blue};border:none;border-radius:4px;color:${exports.COLORS.bgBase};padding:4px 12px;` +
        `font-size:12px;cursor:pointer;font-weight:700;`
    : `background:${exports.COLORS.bgSurface1};border:none;border-radius:4px;color:${exports.COLORS.textPrimary};padding:4px 10px;` +
        `font-size:12px;cursor:pointer;`;
exports.btnStyle = btnStyle;
/** A horizontal toolbar row. */
const barStyle = () => `display:flex;align-items:center;gap:8px;padding:6px 12px;` +
    `background:${exports.COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;`;
exports.barStyle = barStyle;
/** Toolbar with a bottom border. */
const barBottomStyle = () => (0, exports.barStyle)() + `border-bottom:1px solid ${exports.COLORS.bgSurface0};`;
exports.barBottomStyle = barBottomStyle;
/** Toolbar with top and bottom borders. */
const barTopBottomStyle = () => (0, exports.barStyle)() +
    `border-top:1px solid ${exports.COLORS.bgSurface0};border-bottom:1px solid ${exports.COLORS.bgSurface0};`;
exports.barTopBottomStyle = barTopBottomStyle;
// ── Labels / text ─────────────────────────────────────────────
/** Small non-wrapping label. */
const smallLabelStyle = () => `color:${exports.COLORS.textSubtle};font-size:11px;white-space:nowrap;flex-shrink:0;`;
exports.smallLabelStyle = smallLabelStyle;
/** A form-field label (``fontSize`` px). */
const formLabelStyle = (fontSize = 13) => (0, exports.labelStyle)() + `font-size:${fontSize}px;gap:7px;`;
exports.formLabelStyle = formLabelStyle;
/** An upper-case section title. */
const sectionTitleStyle = () => `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${exports.COLORS.textMuted};`;
exports.sectionTitleStyle = sectionTitleStyle;
/** Small monospaced numbers (time displays). */
const monoTextStyle = () => `font-variant-numeric:tabular-nums;font-size:11px;color:${exports.COLORS.textSubtle};` +
    `font-family:ui-monospace,monospace;`;
exports.monoTextStyle = monoTextStyle;
/** Muted helper text, optionally with a width / font size. */
const mutedTextStyle = (opts = {}) => {
    var _a;
    const size = (_a = opts.fontSize) !== null && _a !== void 0 ? _a : 11;
    const width = opts.width ? `width:${opts.width};` : '';
    return `color:${exports.COLORS.textSubtle};font-size:${size}px;${width}`;
};
exports.mutedTextStyle = mutedTextStyle;
// ── Containers / dividers ─────────────────────────────────────
/** A wrapping row of form fields (``display:none`` when ``hidden``). */
const formRowStyle = (hidden = false) => `display:${hidden ? 'none' : 'flex'};align-items:center;gap:16px;flex-wrap:wrap;`;
exports.formRowStyle = formRowStyle;
/** Horizontal rule with the given margin. */
const dividerStyle = (margin = '0 -2px') => `border-top:1px solid ${exports.COLORS.bgSurface0};margin:${margin};`;
exports.dividerStyle = dividerStyle;
/** Full-width horizontal rule. */
const fullWidthDividerStyle = () => `border-top:1px solid ${exports.COLORS.bgSurface0};width:100%;margin:2px 0;`;
exports.fullWidthDividerStyle = fullWidthDividerStyle;
// ── Filter chips ──────────────────────────────────────────────
/** A clip-table filter chip. */
const filterChipStyle = () => `display:inline-flex;align-items:center;gap:4px;` +
    `background:${exports.COLORS.bgSurface1};color:${exports.COLORS.textPrimary};` +
    `border-radius:12px;padding:2px 6px 2px 10px;font-size:11px;` +
    `white-space:nowrap;margin:2px;`;
exports.filterChipStyle = filterChipStyle;
/** The × on a filter chip. */
const filterChipDismissStyle = () => `background:none;border:none;color:${exports.COLORS.textMuted};cursor:pointer;` +
    `font-size:14px;padding:0 2px;line-height:1;`;
exports.filterChipDismissStyle = filterChipDismissStyle;
// ── Utilities / icons ─────────────────────────────────────────
/** A config size as CSS: numbers are px, strings pass through (``'50%'``). */
const cssSize = (val) => typeof val === 'number' ? `${val}px` : String(val);
exports.cssSize = cssSize;
/**
 * Inline padlock SVG markup (closed when `locked`, open otherwise). Uses
 * `currentColor` so it inherits the element's text color. Set as innerHTML.
 */
const lockIconSvg = (locked, size = 14) => {
    const shackle = locked
        ? `<path d="M7 11V7a5 5 0 0 1 10 0v4"/>`
        : `<path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
    return (`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
        `stroke-linejoin="round" style="vertical-align:middle;">` +
        `<rect x="3" y="11" width="18" height="11" rx="2"/>${shackle}</svg>`);
};
exports.lockIconSvg = lockIconSvg;
// ── Global stylesheet ─────────────────────────────────────────
/**
 * Inject a <style> tag with rules that can't be applied via inline styles
 * (pseudo-elements, etc.). Idempotent — only injects once per document.
 */
function injectGlobalStyles() {
    if (document.getElementById(GLOBAL_STYLE_ID))
        return;
    const styleEl = document.createElement('style');
    styleEl.id = GLOBAL_STYLE_ID;
    styleEl.textContent = `
    .jp-BA-chip-dismiss:hover { color: ${exports.COLORS.red}; }
    .jp-BA-filter-input::placeholder {
      color: ${exports.COLORS.overlay} !important;
      opacity: 0.7 !important;
      font-style: italic;
    }
    [id^="jp-config-builder"] input::placeholder,
    [id^="jp-config-builder"] textarea::placeholder {
      color: ${exports.COLORS.textSubtle} !important;
      opacity: 0.6 !important;
    }
    /* When mounted inline (inline=True) the widget lives inside a notebook
       output's .jp-RenderedHTMLCommon, whose table CSS (table-layout: fixed;
       margin: auto; max-width) collapses the clip table so columns overlap.
       Restore content-sizing + horizontal scroll for our tables. */
    [id^="jp-bioacoustic-"] table {
      table-layout: auto !important;
      width: 100% !important;
      margin: 0 !important;
      max-width: none !important;
    }
    [id^="jp-bioacoustic-"] th,
    [id^="jp-bioacoustic-"] td {
      max-width: none !important;
    }
  `;
    document.head.appendChild(styleEl);
}
exports.injectGlobalStyles = injectGlobalStyles;


/***/ },

/***/ "./lib/text.js"
/*!*********************!*\
  !*** ./lib/text.js ***!
  \*********************/
(__unused_webpack_module, exports) {


/**
 * Centralized user-facing copy for the annotator widget.
 *
 * Keep wording here (rather than inline in components) so it can be edited
 * without touching component logic. Plain-text strings unless noted.
 *
 * License: BSD 3-Clause
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HINT = exports.TOOLTIP = exports.DIALOG = exports.PROJECT_PICKER = exports.LAUNCHER = void 0;
/** Launcher chooser dialog (three tiles). */
exports.LAUNCHER = {
    title: 'Bioacoustic Annotator',
    subtitle: 'Choose an option to get started',
    tiles: {
        notebook: { label: 'Notebook', desc: 'Start with a pre-configured Jupyter notebook' },
        annotator: { label: 'Annotator', desc: 'Open a project file to review and annotate clips' },
        builder: { label: 'Config Builder', desc: 'Create or edit configuration files with a GUI' },
    },
};
/** "Select Bioacoustic Project" file-picker dialog. */
exports.PROJECT_PICKER = {
    title: 'Select Bioacoustic Project',
    pathLabel: 'Project file path (local, s3://, gs://, or https://):',
    pathPlaceholder: 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml',
    browseLabel: 'Or browse files:',
    browseDisabledLabel: 'File browser (disabled for remote URIs)',
    remoteUriPlaceholder: 'Remote URI detected - file browser disabled',
};
/** Dialog titles / bodies. */
exports.DIALOG = {
    kernelFailed: 'Failed to start a Python kernel.',
    configValidationFailedTitle: 'Config Validation Failed',
    annotatorErrorTitle: 'Annotator Error',
};
/** Button / control tooltips. */
exports.TOOLTIP = {
    toggleInfo: 'Toggle configuration info',
    removeBox: 'Remove this box',
    removeFilter: 'Remove filter',
    refreshList: 'Refresh list',
    sortHeader: 'Click to sort · Shift-click to clear sort',
    zoomBox: 'Zoom to selection — draw a box on the spectrogram',
    panTool: 'Pan — click and drag to move around',
};
/** Inline hints. */
exports.HINT = {
    drawBoxes: 'Draw on spectrogram to add boxes',
};


/***/ },

/***/ "./lib/util.js"
/*!*********************!*\
  !*** ./lib/util.js ***!
  \*********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.showDialog = exports.isTruthyValue = exports.hasTemplatePlaceholders = exports.resolveTemplate = exports.parseAccuracyConfig = exports.splitSelected = exports.remoteScheme = exports.escPy = exports.fmtTime = exports.slugify = exports.errorMessage = exports.escapeHtml = exports.numberOr = exports.suppressNotebookShortcuts = exports.SELECTED_PREFIX = void 0;
/**
 * Small stateless utilities shared by the annotator and the config builder: escaping,
 * formatting, ``[[column]]`` templates, truthiness rules, and the ``showDialog`` message box.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
const modal_1 = __webpack_require__(/*! ./modal */ "./lib/modal.js");
//
// Constants
//
/** Matches a ``[[column]]`` / ``[[column||default]]`` template placeholder. */
const TEMPLATE_RE = /\[\[([^\]]+)\]\]/g;
/** Separates a placeholder's column from its default value. */
const DEFAULT_SEP = '||';
/** Words that count as "true" for accuracy / truthiness checks. */
const TRUTHY_WORDS = new Set(['yes', 'valid', 'true']);
/** Prefixes allowed before a truthy word (``is valid``, ``is-true``, ...). */
const IS_PREFIXES = ['is', 'is ', 'is-', 'is_'];
/** Prefix marking the default item of a select / resolution list (``selected::value``). */
exports.SELECTED_PREFIX = 'selected::';
//
// Public
//
/**
 * Stop JupyterLab keyboard shortcuts from firing for keys typed inside ``node``. Used for
 * widgets shown inline in a notebook output: there, with a canvas / select / checkbox
 * focused, notebook command-mode shortcuts would otherwise run (``d d`` deletes the cell,
 * ``0 0`` restarts the kernel).
 *
 * JupyterLab handles shortcuts in the capture phase (before the widget sees the key), so
 * the only off-switch is Lumino's ``data-lm-suppress-shortcuts`` attribute — and Lumino
 * only honours it on the focused element itself (it stops at the first element matching a
 * binding's selector). So every element that receives focus inside ``node`` is marked.
 */
function suppressNotebookShortcuts(node) {
    const mark = (el) => {
        if (el instanceof HTMLElement)
            el.setAttribute('data-lm-suppress-shortcuts', 'true');
    };
    mark(node);
    node.addEventListener('focusin', e => mark(e.target));
}
exports.suppressNotebookShortcuts = suppressNotebookShortcuts;
/**
 * ``text`` as a number, or ``fallback`` when it's blank or not a number. Unlike
 * ``parseInt(text) || fallback`` it keeps 0 and decimals (``min: 0`` used to become 1).
 */
function numberOr(text, fallback) {
    const n = Number(text);
    return text.trim() !== '' && Number.isFinite(n) ? n : fallback;
}
exports.numberOr = numberOr;
/** Escape text for HTML content and attribute values (never put raw data in innerHTML). */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
exports.escapeHtml = escapeHtml;
/** The message of a caught error (``catch (e: unknown)``), for status lines and dialogs. */
function errorMessage(e) {
    if (e instanceof Error)
        return e.message;
    if (e && typeof e === 'object' && 'message' in e) {
        return String(e.message);
    }
    return String(e);
}
exports.errorMessage = errorMessage;
/** ``name`` as a snake_case slug (lowercase, non-alphanumerics -> ``_``), matching core.py's slugs. */
function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
exports.slugify = slugify;
/** Format a time in seconds as "m:ss.cc", or "h:mm:ss.cc" from one hour up. */
function fmtTime(s) {
    const sign = s < 0 ? '-' : '';
    const abs = Math.abs(s);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const sec = Math.floor(abs % 60).toString().padStart(2, '0');
    const cs = Math.floor((abs % 1) * 100).toString().padStart(2, '0');
    if (h > 0) {
        const mm = m.toString().padStart(2, '0');
        return `${sign}${h}:${mm}:${sec}.${cs}`;
    }
    return `${sign}${m}:${sec}.${cs}`;
}
exports.fmtTime = fmtTime;
/** Escape a string for use inside a single-quoted Python string literal. */
function escPy(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
exports.escPy = escPy;
/**
 * Where ``path`` lives remotely: ``'url'`` (http/https), ``'s3'`` or ``'gcs'`` (gs://), or
 * null for a local path.
 */
function remoteScheme(path) {
    if (/^https?:\/\//.test(path))
        return 'url';
    if (path.startsWith('s3://'))
        return 's3';
    if (path.startsWith('gs://'))
        return 'gcs';
    return null;
}
exports.remoteScheme = remoteScheme;
/**
 * Split a ``selected::value`` list item into its value and whether it is the default.
 *
 * @example splitSelected('selected::2000') // { value: '2000', selected: true }
 */
function splitSelected(raw) {
    return raw.startsWith(exports.SELECTED_PREFIX)
        ? { value: raw.slice(exports.SELECTED_PREFIX.length), selected: true }
        : { value: raw, selected: false };
}
exports.splitSelected = splitSelected;
/**
 * Parse a form's ``progress_tracker`` setting into its accuracy check.
 *
 * @param progressTracker - ``true`` (counts only), a column name, or ``{accuracy: column}`` /
 *     ``{accuracy: {column, value}}``.
 * @returns The accuracy check, or null when none is configured.
 */
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
/** Replace [[column_name]] and [[column||default]] placeholders with row values. */
function resolveTemplate(template, row) {
    return template.replace(TEMPLATE_RE, (match, raw) => {
        let key;
        let fallback;
        if (raw.includes(DEFAULT_SEP)) {
            const idx = raw.indexOf(DEFAULT_SEP);
            key = raw.slice(0, idx).trim();
            fallback = raw.slice(idx + DEFAULT_SEP.length).trim();
        }
        else {
            key = raw.trim();
        }
        const val = row[key];
        if (val !== undefined)
            return String(val);
        if (fallback !== undefined)
            return fallback;
        return match;
    });
}
exports.resolveTemplate = resolveTemplate;
/** Return true if the string contains at least one [[...]] placeholder. */
function hasTemplatePlaceholders(text) {
    TEMPLATE_RE.lastIndex = 0;
    return TEMPLATE_RE.test(text);
}
exports.hasTemplatePlaceholders = hasTemplatePlaceholders;
/**
 * Whether a cell value means "yes": ``true``, ``1`` / ``'1.0'``, ``yes`` / ``valid`` / ``true``
 * (case-insensitive), optionally prefixed with ``is`` (``is valid``, ``is_true``...).
 */
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
    if (TRUTHY_WORDS.has(s))
        return true;
    for (const prefix of IS_PREFIXES) {
        if (s.startsWith(prefix) && TRUTHY_WORDS.has(s.slice(prefix.length)))
            return true;
    }
    return false;
}
exports.isTruthyValue = isTruthyValue;
/**
 * Show a themed message box (see ``modal.showMessage``).
 *
 * @param opts.title - Heading.
 * @param opts.body - Plain-text message.
 * @param opts.buttons - Buttons, left to right (default: a single "OK").
 * @returns The clicked button's label, or null if dismissed with Escape.
 */
function showDialog(opts) {
    return (0, modal_1.showMessage)(opts);
}
exports.showDialog = showDialog;


/***/ }

}]);
//# sourceMappingURL=lib_index_js.bdffa716a26a97851473.js.map