"use strict";
(self["webpackChunkjupyter_bioacoustic"] = self["webpackChunkjupyter_bioacoustic"] || []).push([["lib_index_js"],{

/***/ "./lib/config_builder/ConfigPanel.js"
/*!*******************************************!*\
  !*** ./lib/config_builder/ConfigPanel.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigPanel = void 0;
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
const FileBrowser_1 = __webpack_require__(/*! ./FileBrowser */ "./lib/config_builder/FileBrowser.js");
const YamlPanel_1 = __webpack_require__(/*! ./YamlPanel */ "./lib/config_builder/YamlPanel.js");
const ProjectSection_1 = __webpack_require__(/*! ./sections/ProjectSection */ "./lib/config_builder/sections/ProjectSection.js");
const DataSection_1 = __webpack_require__(/*! ./sections/DataSection */ "./lib/config_builder/sections/DataSection.js");
const AudioSection_1 = __webpack_require__(/*! ./sections/AudioSection */ "./lib/config_builder/sections/AudioSection.js");
const OutputSection_1 = __webpack_require__(/*! ./sections/OutputSection */ "./lib/config_builder/sections/OutputSection.js");
const AppSection_1 = __webpack_require__(/*! ./sections/AppSection */ "./lib/config_builder/sections/AppSection.js");
const FormSection_1 = __webpack_require__(/*! ./sections/FormSection */ "./lib/config_builder/sections/FormSection.js");
const ConfigSummary_1 = __webpack_require__(/*! ./sections/ConfigSummary */ "./lib/config_builder/sections/ConfigSummary.js");
class ConfigPanel {
    constructor(kernel) {
        this._yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
        this._dirty = false;
        this._savedPath = '';
        this._suppressChanges = false;
        this._ready = false;
        this._debug = false;
        this._kernel = kernel;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;flex:1;overflow:hidden;position:relative;`;
        const left = document.createElement('div');
        left.style.cssText =
            `display:flex;flex-direction:column;flex:1;overflow-y:auto;min-width:0;`;
        this._project = new ProjectSection_1.ProjectSection();
        this._data = new DataSection_1.DataSection();
        this._audio = new AudioSection_1.AudioSection();
        this._output = new OutputSection_1.OutputSection();
        this._app = new AppSection_1.AppSection();
        this._form = new FormSection_1.FormSection();
        this._summary = new ConfigSummary_1.ConfigSummary();
        this._sections = new Map([
            ['project', this._project],
            ['data', this._data],
            ['audio', this._audio],
            ['output', this._output],
            ['app', this._app],
            ['form', this._form],
        ]);
        for (const [name, section] of this._sections) {
            section.focused.connect(() => this._onSectionFocused(name));
            section.fieldFocused.connect((_, field) => {
                if (field.startsWith('description')) {
                    this._yamlPanel.switchToTab('config');
                }
                this._yamlPanel.scrollToField(field);
            });
            section.changed.connect(() => void this._onSectionChanged(name));
            section.opened.connect(() => this._onAccordionOpen(section));
            left.appendChild(section.element);
        }
        this._form.changed.connect(() => void this._updateSummary());
        for (const sec of [this._data, this._audio, this._output, this._app, this._form]) {
            sec.targetChanged.connect((_, { section, target }) => {
                void this._onTargetChanged(section, target);
            });
        }
        this._app.setTarget('config');
        this._form.setTarget('form');
        left.appendChild(this._summary.element);
        this._project.browseRequested.connect((_, { field, current }) => {
            if (field === 'output_path') {
                this._openBrowser(current, ['.csv', '.parquet', '.json', '.tsv'], (p) => this._project.setOutputPath(p));
            }
            else if (field === 'description_path') {
                this._openBrowser(current, ['.md', '.txt', '.html'], (p) => this._project.setDescriptionPath(p));
            }
            else {
                this._openBrowser(current, ['.yaml', '.yml'], (p) => {
                    if (field === 'project')
                        this._project.setProjectPath(p);
                    else if (field === 'config')
                        this._project.setConfigPath(p);
                    else if (field === 'form')
                        this._project.setFormPath(p);
                });
            }
        });
        this._project.projectEnabledChanged.connect((_, enabled) => {
            void this._onProjectEnabledChanged(enabled);
        });
        this._project.fileStatesChanged.connect((_, states) => {
            this._updateTargetOptions(states);
        });
        this._project.loadConfigRequested.connect((_, { field, path }) => void this._onLoadConfig(path, field));
        this._data.fileLoadRequested.connect((_, path) => void this._onLoadColumns(path));
        this._data.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, ['.csv', '.parquet', '.json', '.tsv', '.jsonl'], (p) => this._data.setPath(p));
        });
        this._data.columnsLoaded.connect((_, cols) => {
            this._app.setColumnOptions(cols);
            this._audio.setColumnOptions(cols);
        });
        this._audio.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac'], (p) => this._audio.setPath(p));
        });
        this._app.browseRequested.connect((_, dir) => {
            this._openBrowser(dir, [], (p) => this._app.setCaptureDir(p), true);
        });
        this._form.browseRequested.connect((_, { callback }) => {
            this._openBrowser('.', ['.csv', '.parquet', '.json', '.tsv', '.txt'], callback);
        });
        this._form.columnsRequested.connect((_, { path, callback }) => {
            void this._loadColumnsForCallback(path, callback);
        });
        this._yamlPanel = new YamlPanel_1.YamlPanel();
        this._yamlPanel.configEdited.connect((_, { yaml, configType }) => {
            void this._onYamlEdited(yaml, configType);
        });
        this._yamlPanel.saveSingleRequested.connect((_, configType) => {
            void this._saveSingleFile(configType);
        });
        const handle = document.createElement('div');
        handle.style.cssText =
            `width:5px;cursor:col-resize;background:${styles_1.COLORS.bgSurface0};flex-shrink:0;` +
                `display:flex;align-items:center;justify-content:center;`;
        const grip = document.createElement('div');
        grip.style.cssText =
            `width:3px;height:28px;border-radius:2px;background:${styles_1.COLORS.overlay};`;
        handle.appendChild(grip);
        let dragging = false;
        let startX = 0;
        let startW = 0;
        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            startW = this._yamlPanel.element.offsetWidth;
            this._yamlPanel.element.style.transition = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging)
                return;
            const delta = startX - e.clientX;
            const newW = Math.max(200, Math.min(800, startW + delta));
            this._yamlPanel.element.style.width = `${newW}px`;
        });
        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                this._yamlPanel.element.style.transition = '';
            }
        });
        this.element.append(left, handle, this._yamlPanel.element);
        this._statusEl = document.createElement('span');
        this._statusEl.style.cssText =
            `font-size:11px;color:${styles_1.COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        this._readyPromise = this._ensureReady();
    }
    async _ensureReady() {
        var _a;
        this._setStatus('Initializing…');
        try {
            const raw = await this._kernel.exec((0, python_1.ensureSetup)(this._kernel.cwd));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            this._ready = true;
            this._debug = !!result.debug;
            if (this._debug) {
                console.debug('[JBA] ConfigPanel ready, cwd:', result.cwd);
            }
            this._setStatus('Ready');
        }
        catch (e) {
            this._setStatus(`Init failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    _dbg(...args) {
        if (this._debug)
            console.debug('[JBA]', ...args);
    }
    get statusEl() {
        return this._statusEl;
    }
    _onSectionFocused(name) {
        this._yamlPanel.showForSection(name, this._yamls);
    }
    async _onSectionChanged(sectionName) {
        var _a;
        if (this._suppressChanges)
            return;
        await this._readyPromise;
        if (!this._ready)
            return;
        const section = this._sections.get(sectionName);
        if (!section)
            return;
        const data = section.getData();
        const uiTarget = section.getTarget();
        const target = uiTarget === 'form' ? 'form_config' : uiTarget;
        this._dbg('sectionChanged', sectionName, data, 'target=', target);
        this._setStatus('Updating…');
        try {
            const raw = await this._kernel.exec((0, python_1.updateSection)(sectionName, data, target));
            const state = JSON.parse((0, python_1.extractJson)(raw));
            this._applyStatePartial(state, sectionName);
            void this._updateSummary();
            this._setStatus('Ready');
        }
        catch (e) {
            this._setStatus(`Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    _openBrowser(dir, extensions, onSelect, dirOnly = false) {
        if (this.element.querySelector('.jp-cb-filebrowser'))
            return;
        const overlay = document.createElement('div');
        overlay.className = 'jp-cb-filebrowser';
        overlay.style.cssText =
            `position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;` +
                `background:rgba(0,0,0,0.5);padding:24px;`;
        const browserWrap = document.createElement('div');
        browserWrap.style.cssText =
            `position:relative;width:100%;max-width:500px;height:400px;`;
        const browser = new FileBrowser_1.FileBrowser(this._kernel, dir || '.', extensions, dirOnly);
        browser.fileSelected.connect((_, path) => {
            onSelect(path);
            this._setStatus(`Selected: ${path}`);
            overlay.remove();
        });
        browser.dismissed.connect(() => {
            overlay.remove();
        });
        browserWrap.appendChild(browser.element);
        overlay.appendChild(browserWrap);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay)
                overlay.remove();
        });
        this.element.appendChild(overlay);
    }
    async _saveSingleFile(configType) {
        var _a;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._setStatus(`Saving ${configType} file…`);
        try {
            const raw = await this._kernel.exec((0, python_1.saveSingleFile)(configType));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            this._setStatus(`Saved: ${result.saved_to}`);
        }
        catch (e) {
            this._setStatus(`Save failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    async _loadColumnsForCallback(path, callback) {
        await this._readyPromise;
        if (!this._ready)
            return;
        try {
            const raw = await this._kernel.exec((0, python_1.readColumns)(path));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            callback(result.columns);
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
    async _onLoadColumns(pathOrDir) {
        var _a;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._setStatus('Loading columns…');
        try {
            const raw = await this._kernel.exec((0, python_1.readColumns)(pathOrDir));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            const cols = result.columns;
            this._data.setDetectedColumns(cols);
            this._setStatus(`${cols.length} columns loaded`);
        }
        catch (e) {
            this._setStatus(`Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    async _onYamlEdited(yaml, configType) {
        var _a;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._setStatus('Applying edits…');
        try {
            const raw = await this._kernel.exec((0, python_1.updateConfigFromYaml)(yaml, configType));
            const state = JSON.parse((0, python_1.extractJson)(raw));
            if (state.update_ok) {
                this._applyState(state);
                this._setStatus('Config updated');
            }
            else {
                this._setStatus('Invalid YAML', true);
            }
        }
        catch (e) {
            this._setStatus(`Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    async saveToFile() {
        var _a, _b, _c, _d;
        await this._readyPromise;
        if (!this._ready)
            return;
        const projectData = this._project.getData();
        const enabled = [
            projectData.project_enabled && projectData.project_path,
            projectData.config_enabled && projectData.config_path,
            projectData.form_enabled && projectData.form_path,
        ].filter(Boolean);
        if (enabled.length === 0) {
            this._setStatus('Enable at least one output file in Project section', true);
            return;
        }
        this._setStatus('Validating…');
        try {
            const vRaw = await this._kernel.exec((0, python_1.validateConfig)());
            const vResult = JSON.parse((0, python_1.extractJson)(vRaw));
            const msgs = [];
            if ((_a = vResult.errors) === null || _a === void 0 ? void 0 : _a.length)
                msgs.push('Errors:\n• ' + vResult.errors.join('\n• '));
            if ((_b = vResult.warnings) === null || _b === void 0 ? void 0 : _b.length)
                msgs.push('Warnings:\n• ' + vResult.warnings.join('\n• '));
            if (!vResult.valid) {
                const choice = await (0, util_1.showDialog)({
                    title: 'Validation Failed',
                    body: msgs.join('\n\n'),
                    buttons: [
                        { label: 'Cancel' },
                        { label: 'Save Anyway', primary: true },
                    ],
                });
                if (choice !== 'Save Anyway') {
                    this._setStatus('Save cancelled', false, true);
                    return;
                }
            }
            else if (msgs.length > 0) {
                this._setStatus('Validation passed with warnings');
            }
        }
        catch (e) {
            this._setStatus(`Validation error: ${String((_c = e.message) !== null && _c !== void 0 ? _c : e)}`, true);
            return;
        }
        const checkPath = (projectData.project_enabled && projectData.project_path) ||
            (projectData.config_enabled && projectData.config_path) || '';
        if (checkPath) {
            try {
                const existsRaw = await this._kernel.exec((0, python_1.checkFileExists)(checkPath));
                const exists = JSON.parse((0, python_1.extractJson)(existsRaw)).exists;
                if (exists) {
                    const choice = await (0, util_1.showDialog)({
                        title: 'Overwrite Files?',
                        body: 'Configuration files already exist at the specified paths.',
                        buttons: [
                            { label: 'Cancel' },
                            { label: 'Overwrite', primary: true },
                        ],
                    });
                    if (choice !== 'Overwrite')
                        return;
                }
            }
            catch ( /* proceed */_e) { /* proceed */ }
        }
        this._dbg('saveToFile', { enabled });
        this._setStatus(`Saving ${enabled.length} file(s)…`);
        try {
            const raw = await this._kernel.exec((0, python_1.saveAll)());
            const state = JSON.parse((0, python_1.extractJson)(raw));
            this._dirty = false;
            const paths = state.saved_paths || {};
            this._dbg('saved', paths);
            const savedList = Object.values(paths).join(', ');
            this._savedPath = paths.project || paths.config || paths.form || '';
            this._setStatus(`Saved: ${savedList}`);
        }
        catch (e) {
            this._setStatus(`Save failed: ${String((_d = e.message) !== null && _d !== void 0 ? _d : e)}`, true);
        }
    }
    _applyStatePartial(state, skipSection) {
        this._yamls = {
            project_yaml: state.project_yaml || '',
            config_yaml: state.config_yaml || '',
            form_yaml: state.form_yaml || '',
        };
        this._dirty = !!state.dirty;
        this._savedPath = state.saved_path || '';
        this._yamlPanel.updateYaml(this._yamls);
    }
    _applyState(state) {
        this._dbg('applyState', { targets: state.section_targets, projectKeys: Object.keys(state.project || {}), configKeys: Object.keys(state.config || {}) });
        this._suppressChanges = true;
        try {
            this._yamls = {
                project_yaml: state.project_yaml || '',
                config_yaml: state.config_yaml || '',
                form_yaml: state.form_yaml || '',
            };
            this._dirty = !!state.dirty;
            this._savedPath = state.saved_path || '';
            this._yamlPanel.updateYaml(this._yamls);
            if (state.project) {
                const proj = state.project || {};
                const conf = state.config || {};
                const projWithDesc = Object.assign({}, proj);
                if (conf.description)
                    projWithDesc.description = conf.description;
                if (conf.description_title)
                    projWithDesc.description_title = conf.description_title;
                if (conf.description_text)
                    projWithDesc.description_text = conf.description_text;
                if (conf.description_path)
                    projWithDesc.description_path = conf.description_path;
                if (conf.description_open !== undefined)
                    projWithDesc.description_open = conf.description_open;
                if (conf.description_height)
                    projWithDesc.description_height = conf.description_height;
                this._project.setData(projWithDesc);
                const targets = state.section_targets || {};
                const mergedData = this._resolveSectionData('data', targets, proj, conf);
                if (mergedData)
                    this._data.setData(mergedData);
                const mergedAudio = this._resolveSectionData('audio', targets, proj, conf);
                if (mergedAudio)
                    this._audio.setData(mergedAudio);
                const outputSource = targets.output === 'config' ? conf : proj;
                if (outputSource.output && typeof outputSource.output === 'object') {
                    this._output.setData(outputSource.output);
                }
                const appSource = targets.app === 'config' ? Object.assign(Object.assign({}, proj), conf) : proj;
                this._app.setData(appSource);
            }
            if (state.form_config && typeof state.form_config === 'object') {
                this._form.setData(state.form_config);
            }
            if (state.section_targets) {
                const targets = state.section_targets;
                if (targets.data)
                    this._data.setTarget(targets.data);
                if (targets.audio)
                    this._audio.setTarget(targets.audio);
                if (targets.output)
                    this._output.setTarget(targets.output);
                if (targets.app)
                    this._app.setTarget(targets.app);
                if (targets.form)
                    this._form.setTarget(targets.form === 'form_config' ? 'form' : targets.form);
            }
            void this._updateSummary();
        }
        finally {
            this._suppressChanges = false;
        }
    }
    get dirty() {
        return this._dirty;
    }
    async _onLoadConfig(path, fileType) {
        var _a;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._dbg('loadConfig', path, fileType);
        this._setStatus(`Loading ${path}…`);
        try {
            const raw = await this._kernel.exec((0, python_1.loadConfig)(path, fileType));
            const state = JSON.parse((0, python_1.extractJson)(raw));
            this._applyState(state);
            const detected = state.detected_type || 'config';
            const paths = state.loaded_paths || {};
            const loaded = Object.values(paths).filter(Boolean);
            const projectData = state.project || {};
            const missing = [];
            if (projectData.config_enabled && projectData.config_path && !paths.config) {
                missing.push(`config not found: ${projectData.config_path}`);
            }
            if (projectData.form_enabled && projectData.form_path && !paths.form) {
                missing.push(`form not found: ${projectData.form_path}`);
            }
            const warn = missing.length ? ` (⚠ ${missing.join(', ')})` : '';
            this._setStatus(`Loaded as ${detected}: ${loaded.join(', ')}${warn}`, missing.length > 0);
        }
        catch (e) {
            const msg = String((_a = e.message) !== null && _a !== void 0 ? _a : e);
            const fnf = msg.match(/FileNotFoundError:\s*(.+)/);
            this._setStatus(fnf ? `File not found: ${fnf[1]}` : `Load failed: ${msg}`, true);
        }
    }
    async validate() {
        var _a, _b, _c;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._setStatus('Validating…');
        try {
            const raw = await this._kernel.exec((0, python_1.validateConfig)());
            const result = JSON.parse((0, python_1.extractJson)(raw));
            const msgs = [];
            if ((_a = result.errors) === null || _a === void 0 ? void 0 : _a.length)
                msgs.push('Errors:\n• ' + result.errors.join('\n• '));
            if ((_b = result.warnings) === null || _b === void 0 ? void 0 : _b.length)
                msgs.push('Warnings:\n• ' + result.warnings.join('\n• '));
            if (result.valid && msgs.length === 0) {
                this._setStatus('Validation passed');
                await (0, util_1.showDialog)({ title: 'Validation Passed', body: 'No issues found.' });
            }
            else if (result.valid) {
                this._setStatus('Validation passed with warnings', false, true);
                await (0, util_1.showDialog)({ title: 'Validation Passed', body: msgs.join('\n\n') });
            }
            else {
                this._setStatus('Validation failed', true);
                await (0, util_1.showDialog)({ title: 'Validation Failed', body: msgs.join('\n\n') });
            }
        }
        catch (e) {
            this._setStatus(`Validate error: ${String((_c = e.message) !== null && _c !== void 0 ? _c : e)}`, true);
        }
    }
    async _onProjectEnabledChanged(_enabled) {
        await this._readyPromise;
        if (!this._ready)
            return;
        try {
            const raw = await this._kernel.exec((0, python_1.updateSection)('project', this._project.getData()));
            const state = JSON.parse((0, python_1.extractJson)(raw));
            this._applyStatePartial(state, 'project');
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
    async _onTargetChanged(section, target) {
        var _a;
        await this._readyPromise;
        if (!this._ready)
            return;
        this._setStatus('Updating target…');
        const pyTarget = target === 'form' ? 'form_config' : target;
        try {
            const raw = await this._kernel.exec((0, python_1.setSectionTarget)(section, pyTarget));
            const state = JSON.parse((0, python_1.extractJson)(raw));
            this._applyStatePartial(state, section);
            this._setStatus('Ready');
        }
        catch (e) {
            this._setStatus(`Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
        }
    }
    _updateTargetOptions(states) {
        const baseOpts = [];
        if (states.project)
            baseOpts.push('project');
        if (states.config)
            baseOpts.push('config');
        if (baseOpts.length === 0)
            baseOpts.push('project');
        const splitOpts = states.project && states.config
            ? ['split', ...baseOpts] : [...baseOpts];
        for (const sec of [this._data, this._audio]) {
            sec.setTargetOptions(splitOpts);
        }
        for (const sec of [this._output, this._app]) {
            sec.setTargetOptions(baseOpts);
        }
        const formOpts = [...baseOpts];
        if (states.form)
            formOpts.push('form');
        this._form.setTargetOptions(formOpts);
    }
    _onAccordionOpen(opened) {
        for (const [, section] of this._sections) {
            if (section !== opened && !section.isPinned) {
                section.close();
            }
        }
    }
    async _updateSummary() {
        if (!this._ready)
            return;
        try {
            const raw = await this._kernel.exec((0, python_1.getSummary)());
            const sections = JSON.parse((0, python_1.extractJson)(raw));
            this._summary.update(sections);
        }
        catch ( /* ignore summary errors */_a) { /* ignore summary errors */ }
    }
    _resolveSectionData(section, targets, proj, conf) {
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
    _setStatus(msg, error = false, warning = false) {
        this._statusEl.textContent = msg;
        this._statusEl.style.color = error ? styles_1.COLORS.red : warning ? styles_1.COLORS.yellow : styles_1.COLORS.green;
    }
}
exports.ConfigPanel = ConfigPanel;


/***/ },

/***/ "./lib/config_builder/FileBrowser.js"
/*!*******************************************!*\
  !*** ./lib/config_builder/FileBrowser.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FileBrowser = void 0;
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/config_builder/python.js");
class FileBrowser {
    constructor(kernel, startDir, extensions, dirOnly = false) {
        this.fileSelected = new signaling_1.Signal(this);
        this.dismissed = new signaling_1.Signal(this);
        this._kernel = kernel;
        this._cwd = startDir || '.';
        this._extensions = extensions;
        this._dirOnly = dirOnly;
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
        this._filenameInput.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
                `font-size:11px;flex:1;box-sizing:border-box;`;
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
        void this._loadDir(this._cwd);
    }
    async _loadDir(dir) {
        var _a;
        this._cwd = dir;
        this._pathBar.textContent = dir;
        this._listEl.innerHTML = '';
        this._statusEl.textContent = 'Loading…';
        try {
            const raw = await this._kernel.exec((0, python_1.listFiles)(dir, this._extensions));
            const result = JSON.parse((0, python_1.extractJson)(raw));
            const entries = result.files;
            this._renderEntries(entries);
            this._statusEl.textContent = `${entries.length} items`;
        }
        catch (e) {
            this._statusEl.textContent = `Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`;
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
            selectRow.textContent = `\u2713 Select this folder: ${this._cwd}`;
            selectRow.addEventListener('click', () => {
                this.fileSelected.emit(this._cwd);
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
            nfInput.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
                    `font-size:11px;flex:1;box-sizing:border-box;`;
            const nfBtn = document.createElement('button');
            nfBtn.textContent = '+ New Folder';
            nfBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;padding:3px 8px;`;
            const doCreate = async () => {
                var _a;
                const name = nfInput.value.trim();
                if (!name)
                    return;
                const newPath = this._cwd === '.' ? name : `${this._cwd}/${name}`;
                try {
                    await this._kernel.exec((0, python_1.createDirectory)(newPath));
                    void this._loadDir(newPath);
                }
                catch (e) {
                    this._statusEl.textContent = `Error: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`;
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
            if (this._cwd === '.' || this._cwd === '/' || this._cwd === '') {
                void this._loadDir('..');
            }
            else {
                const parts = this._cwd.replace(/\/$/, '').split('/');
                parts.pop();
                const parent = parts.length === 0 ? '.' : parts.join('/');
                void this._loadDir(parent);
            }
        });
        this._listEl.appendChild(upRow);
        for (const entry of entries) {
            if (this._dirOnly && !entry.is_dir)
                continue;
            const icon = entry.is_dir ? '📁' : '📄';
            const row = this._makeEntryRow(icon, entry.name, entry.is_dir);
            if (entry.is_dir) {
                row.addEventListener('click', () => {
                    const newPath = this._cwd === '.' ? entry.name : `${this._cwd}/${entry.name}`;
                    void this._loadDir(newPath);
                });
            }
            else {
                row.addEventListener('click', () => {
                    const filePath = this._cwd === '.' ? entry.name : `${this._cwd}/${entry.name}`;
                    this.fileSelected.emit(filePath);
                });
            }
            this._listEl.appendChild(row);
        }
    }
    _confirmFilename() {
        const name = this._filenameInput.value.trim();
        if (!name)
            return;
        const filePath = this._cwd === '.' ? name : `${this._cwd}/${name}`;
        this.fileSelected.emit(filePath);
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
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const docs_1 = __webpack_require__(/*! ./docs */ "./lib/config_builder/docs.js");
class YamlPanel {
    constructor() {
        this.configEdited = new signaling_1.Signal(this);
        this.saveSingleRequested = new signaling_1.Signal(this);
        this._expanded = true;
        this._editing = false;
        this._configType = 'project';
        this._mode = 'docs';
        this._currentSection = 'project';
        this._yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
        this._yamlTabs = new Map();
        this._activeField = null;
        this.element = document.createElement('div');
        this.element.style.cssText =
            `display:flex;flex-direction:column;width:350px;overflow:hidden;` +
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
        for (const t of ['project', 'config', 'form_config']) {
            const btn = document.createElement('button');
            btn.textContent = t === 'form_config' ? 'form' : t;
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
        header.append(this._editBtn, saveFileBtn);
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
    toggle() {
        this._expanded = !this._expanded;
        if (this._expanded) {
            this.element.style.width = '350px';
            this._modeBar.style.display = 'flex';
            this._setMode(this._mode);
        }
        else {
            this.element.style.width = '36px';
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
    get configType() {
        return this._configType;
    }
    switchToTab(tab) {
        this._switchYamlTab(tab);
    }
    _switchYamlTab(tab) {
        this._configType = tab;
        for (const [t, btn] of this._yamlTabs) {
            btn.style.background = t === tab ? styles_1.COLORS.bgSurface0 : 'transparent';
            btn.style.color = t === tab ? styles_1.COLORS.textPrimary : styles_1.COLORS.textMuted;
        }
        if (this._editing)
            this._cancelEdit();
        this._updateYamlDisplay(this._yamls);
    }
    updateYaml(yamls) {
        this._yamls = yamls;
        this._updateYamlDisplay(yamls);
    }
    showForSection(section, yamls) {
        this._currentSection = section;
        if (section === 'form') {
            this._configType = 'form_config';
        }
        else if (section === 'project') {
            this._configType = 'project';
        }
        else {
            this._configType = 'config';
        }
        for (const [t, btn] of this._yamlTabs) {
            btn.style.background = t === this._configType ? styles_1.COLORS.bgSurface0 : 'transparent';
            btn.style.color = t === this._configType ? styles_1.COLORS.textPrimary : styles_1.COLORS.textMuted;
        }
        this._yamls = yamls;
        this._updateYamlDisplay(yamls);
        this._renderDocs(section);
    }
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
    _renderDocs(section) {
        this._activeField = null;
        this._docsContent.innerHTML = '';
        const docs = docs_1.DOCS[section];
        if (!docs) {
            this._docsContent.textContent = `No documentation for "${section}".`;
            return;
        }
        const sectionTitles = { project: 'Setup' };
        const title = document.createElement('h3');
        title.textContent = sectionTitles[section] || section;
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
            const fieldEl = document.createElement('div');
            fieldEl.setAttribute('data-field', key);
            fieldEl.style.cssText =
                `margin-bottom:10px;padding:8px;background:${styles_1.COLORS.bgSurface0};border-radius:4px;` +
                    `border-left:3px solid ${styles_1.COLORS.bgSurface1};transition:border-color 0.15s ease;`;
            const nameEl = document.createElement('div');
            nameEl.textContent = key;
            nameEl.style.cssText =
                `font-size:12px;font-weight:700;color:${styles_1.COLORS.mauve};margin-bottom:4px;font-family:monospace;`;
            const descEl = document.createElement('div');
            descEl.style.cssText =
                `font-size:11px;color:${styles_1.COLORS.textSubtle};line-height:1.5;white-space:pre-wrap;`;
            descEl.textContent = text;
            fieldEl.append(nameEl, descEl);
            this._docsContent.appendChild(fieldEl);
        }
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
        this._editing = false;
        this._editor.style.display = 'none';
        this._display.style.display = 'block';
        this._editBar.style.display = 'none';
        this._editBtn.style.display = '';
        this.configEdited.emit({ yaml, configType: this._configType });
    }
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

/***/ "./lib/config_builder/docs.js"
/*!************************************!*\
  !*** ./lib/config_builder/docs.js ***!
  \************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DOCS = void 0;
exports.DOCS = {
    project: {
        _intro: `Setup controls the project identity, file paths, and an optional description panel shown at the top of the annotator.`,
        project_name: `(optional) Widget header title displayed at the top of the annotator.\nIf not set, it is auto-derived from the project filename.`,
        '_sub:Configuration File Paths': `Configure where config files are saved and load existing configs. Enable or disable each file with the checkbox. With all three enabled, the project file references the config file, which references the form file. Uncheck a file to inline its contents into the parent.\n\nEach row has Browse and Load buttons. Click Load to read an existing file and populate the builder. Loading cascades: a project file loads its referenced config, which loads its referenced form.`,
        'project file': `Project-specific configuration — data sources, audio paths, output locations, and anything unique to this particular review task. References the config file for shared app settings.\nLoad: populates all sections and cascades into config and form files if referenced.`,
        'config file': `Application setup shared across multiple projects — layout options, column visibility, capture settings, heights, and general widget behavior. Referenced by the project file; references the form file.\nLoad: populates app/layout sections and cascades into the form file if referenced. The project file is updated to point to this config.`,
        'form file': `Form definition only — the annotation interface controls (selects, textboxes, checkboxes, etc.) and dynamic forms. Kept separate so the same form can be reused across different project/config combinations.\nLoad: populates the form section only.`,
        '_sub:Description Panel': `Add an optional collapsible section at the top of the annotator for project descriptions, reviewer instructions, or other guidance. Accepts inline markdown or a path to a markdown file.`,
        title: `(optional) Title shown in the collapsible description bar.\nDefault: "Description".`,
        text: `(optional) Markdown-formatted text displayed in the description panel.\nSupports headings, lists, bold, italic, code blocks, links, and horizontal rules.`,
        path: `(optional) Path to a markdown file whose contents populate the description panel.\nOverridden by text if both are set.`,
        open: `(optional) Whether the description panel starts expanded.\nDefault: true.`,
        height: `(optional) Max height in pixels for the description body.\nLeave empty for auto height. Set to constrain long descriptions with scroll.`,
    },
    data: {
        _intro: `Data is where you define your clip source — a table of detections or segments to review. Each row represents one clip. The table must have at minimum a start_time column (or you must map one). Supported formats: CSV, Parquet, JSON, JSONL.`,
        source_type: `(required) How to load data:\n• path: local file (CSV, Parquet, JSON)\n• url: remote file URL\n• sql: DuckDB SQL query\n• api: REST endpoint`,
        path: `(required) Path to the data file relative to the working directory.\nExample: data/detections.csv`,
        data_columns: `(optional) Subset of columns to load from the file.\nIf empty, all columns are included. Use this to limit what's shown in the clip table and reduce memory for large files.`,
        start_time_col: `(optional) Column name containing the segment start time in seconds.\nDefault: "start_time". Remap if your file uses a different name.`,
        end_time_col: `(optional) Column name containing the segment end time in seconds.\nDefault: "end_time". Remap if your file uses a different name.`,
        duration: `(optional) Column name or fixed number (seconds) to compute end_time from start_time.\nUse this if your data has duration instead of end_time.\nExample: "duration" (column) or 5.0 (fixed seconds).`,
        secrets: `(optional) Key-value pairs for credentials needed to access data.\nExample: API tokens, database passwords. Stored in the session only, never written to config files.`,
    },
    audio: {
        _intro: `Audio defines where to find the sound files for each clip.\nYou can point to a single file, a URL, or a per-row column that holds the path for each detection.`,
        source_type: `(required) Audio source mode:\n• path: single audio file for all clips\n• url: remote audio file URL\n• column: per-row column from the data table`,
        value: `(required) The file path, URL, or column name depending on source type.\nFor "column" mode, select which data column holds the audio paths.`,
        prefix: `(optional) Prepended to the audio path with "/" separator.\nUseful for base directories or URL roots.\nExample: "audio/" turns "recording.flac" into "audio/recording.flac"`,
        suffix: `(optional) Appended to the audio path.\nUseful for adding file extensions when paths are stored without them.`,
        fallback: `(optional) Fallback audio file used when column mode yields an empty value.`,
        secrets: `(optional) Key-value pairs for credentials needed to access audio.\nExample: storage tokens or signed URL secrets.`,
    },
    output: {
        _intro: `Output controls where annotation results are saved.\nResults are written as a table (CSV/Parquet) with one row per submission. Optionally sync to remote storage.`,
        path: `(optional) Output file path for saved annotations.\nAuto-generated from project name if form is configured.\nExample: outputs/reviews.csv`,
        sync_uri: `(optional) Remote URI to sync the output file after writes.\nExample: s3://my-bucket/annotations/reviews.csv`,
        sync_button: `(optional) Show a sync button in the widget.\nSet to true for default "Sync" label, or provide a custom string.`,
        sync_label: `(optional) Text label shown next to the sync button.`,
        recursive: `(optional) Write output after every submission instead of waiting for session end. Default: false.`,
        secrets: `(optional) Key-value pairs for credentials needed for output sync.\nExample: S3 access keys for remote sync.`,
    },
    app: {
        _intro: `Application settings control the widget layout, visible columns, and interaction features like capture and buffering.`,
        ident_column: `(optional) Column shown prominently in the info card (no label prefix) and used for naming captured audio files.\nExample: "common_name" or "species_id"`,
        display_columns: `(optional) Extra columns shown in the info card below the ident.\nThese provide context about the current clip.`,
        data_columns: `(optional) Columns visible in the clip table.\nControls which columns appear as sortable table headers.`,
        duplicate_entries: `(optional) Allow multiple submissions per row. Default: false.\nEnable for tasks where the same clip needs multiple annotations.`,
        default_buffer: `(optional) Buffer time in seconds added before/after the audio segment.\nDefault: 3. Increase for more context around short clips.`,
        capture: `(optional) Capture button lets users save audio clips.\nSet to false to hide, true for default label, or a string for custom label.`,
        capture_dir: `(optional) Directory where captured audio clips are saved.\nDefault: "captures/"`,
        width: `(optional) Inline widget width. Default: "100%".\nCan be pixels ("800px") or percentage.`,
        clip_table_height: `(optional) Clip table height in pixels. Default: 175.`,
        player_height: `(optional) Player/spectrogram height in pixels. Default: 260.\nAlso determines the spectrogram resolution.`,
        info_card_height: `(optional) Info card height in pixels. Default: 34.`,
        form_panel_height: `(optional) Form panel height in pixels. Default: 140.`,
        capture_height: `(optional) Capture image height in pixels.\nDefaults to player_height if not set.`,
        secrets: `(optional) Global key-value pairs for credentials available to all sections.\nSection-level secrets override global ones with the same key.`,
    },
    form: {
        _intro: `Form defines the annotation interface — the controls users interact with to label each clip. Elements are rendered in order. Each element writes its value to a specified output column.\n\nElement types: title, select, textbox, checkbox, number, annotation, pass_value, fixed_value, submission_buttons.`,
        '_sub:Display': `Static elements that show information but do not collect user input.`,
        title: `Display title at the top of the form. Set "value" for the text.\nEnable "progress_tracker" to show completion percentage.`,
        text: `Static text displayed in the form. Set "value" for the text content.`,
        line: `Horizontal rule divider between form elements.`,
        break: `Visual spacer that adds vertical space between form elements.`,
        '_sub:User Input': `Interactive elements that collect user input and write to output columns.`,
        annotation: `Spectrogram interaction tools for time/frequency selection.\nTools: time_select, start_end_time_select, bounding_box, multibox.\nMap outputs to columns via start_time_col, end_time_col, etc.`,
        select: `Dropdown selector. Requires "label", "column", and "items".\nItems can be inline (list of strings or label::value pairs), from a file (path + value column + optional label column), or a numeric range (min, max, step).`,
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

/***/ "./lib/config_builder/index.js"
/*!*************************************!*\
  !*** ./lib/config_builder/index.js ***!
  \*************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.configBuilderPlugin = void 0;
var plugin_1 = __webpack_require__(/*! ./plugin */ "./lib/config_builder/plugin.js");
Object.defineProperty(exports, "configBuilderPlugin", ({ enumerable: true, get: function () { return plugin_1.configBuilderPlugin; } }));


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
const ui_components_1 = __webpack_require__(/*! @jupyterlab/ui-components */ "webpack/sharing/consume/default/@jupyterlab/ui-components");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const kernel_1 = __webpack_require__(/*! ../kernel */ "./lib/kernel.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const ConfigPanel_1 = __webpack_require__(/*! ./ConfigPanel */ "./lib/config_builder/ConfigPanel.js");
let _builderCounter = 0;
class ConfigBuilderWidget extends widgets_1.Widget {
    constructor(tracker, directKernel, cwd) {
        super();
        this._kernelBridge = new kernel_1.KernelBridge(directKernel ? null : tracker, directKernel, cwd);
        this._ownedKernel = directKernel !== null && directKernel !== void 0 ? directKernel : null;
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
        header.append(this._titleEl, this._panel.statusEl);
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
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:11px;`;
        dismissBtn.addEventListener('click', () => this._onDismiss());
        bottomBar.append(validateBtn, saveBtn, spacer, dismissBtn);
        this.node.append(header, this._panel.element, bottomBar);
    }
    onAfterAttach(_msg) {
        super.onAfterAttach(_msg);
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
function escPyLocal(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
async function startKernel(app) {
    try {
        return await app.serviceManager.kernels.startNew({ name: 'python3' });
    }
    catch (e) {
        console.error('config-builder: failed to start kernel', e);
        return null;
    }
}
function getExistingKernel(tracker) {
    var _a, _b, _c, _d;
    return (_d = (_c = (_b = (_a = tracker.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext) === null || _b === void 0 ? void 0 : _b.session) === null || _c === void 0 ? void 0 : _c.kernel) !== null && _d !== void 0 ? _d : null;
}
async function execInKernel(kernel, code) {
    const future = kernel.requestExecute({ code });
    let error = '';
    future.onIOPub = (msg) => {
        var _a;
        if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.msg_type) === 'error') {
            error = msg.content.evalue || (msg.content.traceback || []).join('\n') || 'Unknown error';
        }
    };
    await future.done;
    return error;
}
const builderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <line x1="10" y1="9" x2="8" y2="9"/>
</svg>`;
const builderIcon = new ui_components_1.LabIcon({
    name: 'jupyter-bioacoustic:config-builder-icon',
    svgstr: builderIconSvg,
});
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
            const widget = new ConfigBuilderWidget(tracker);
            widget.node.style.cssText += `position:absolute;inset:0;`;
            widgets_1.Widget.attach(widget, container);
        };
        app.commands.addCommand('bioacoustic:open-config-builder', {
            label: 'Bioacoustic Config Builder',
            icon: builderIcon,
            execute: async () => {
                var _a;
                const kernel = (_a = getExistingKernel(tracker)) !== null && _a !== void 0 ? _a : await startKernel(app);
                if (!kernel) {
                    void (0, util_1.showDialog)({ title: 'Error', body: 'Failed to start a Python kernel.' });
                    return;
                }
                const ownsKernel = !getExistingKernel(tracker);
                const browserPath = (fileBrowser === null || fileBrowser === void 0 ? void 0 : fileBrowser.model.path) || '';
                const serverRoot = coreutils_1.PageConfig.getOption('serverRoot');
                const cwd = browserPath
                    ? `${serverRoot}/${browserPath}`
                    : serverRoot;
                const error = await execInKernel(kernel, [
                    `import os as _os`,
                    `_os.chdir(_os.path.expanduser('${escPyLocal(cwd)}'))`,
                    `from jupyter_bioacoustic.config_builder import ConfigBuilder`,
                    `_cb = ConfigBuilder()`,
                    `_cb.setup()`,
                ].join('\n'));
                if (error) {
                    if (ownsKernel)
                        kernel.shutdown().catch(() => { });
                    void (0, util_1.showDialog)({ title: 'Config Builder Error', body: error });
                    return;
                }
                const widget = new ConfigBuilderWidget(tracker, ownsKernel ? kernel : undefined, cwd);
                app.shell.add(widget, 'main');
                app.shell.activateById(widget.id);
            }
        });
        palette.addItem({ command: 'bioacoustic:open-config-builder', category: 'Bioacoustic' });
    }
};


/***/ },

/***/ "./lib/config_builder/python.js"
/*!**************************************!*\
  !*** ./lib/config_builder/python.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSummary = exports.loadConfig = exports.validateConfig = exports.setSectionTarget = exports.checkFileExists = exports.readSampleData = exports.readColumns = exports.createDirectory = exports.listFiles = exports.saveSingleFile = exports.saveAll = exports.updateConfigFromYaml = exports.updateSection = exports.readState = exports.ensureSetup = exports.extractJson = void 0;
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const DELIM = '___CB_JSON___';
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
function wp(expr) {
    return `print('${DELIM}'); print(${expr}); print('${DELIM}')`;
}
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
function readState() {
    return [
        `import json as _j`,
        wp(`_CB_STATE`),
    ].join('\n');
}
exports.readState = readState;
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
function saveSingleFile(configType) {
    return [
        `import json as _j`,
        `_path = _CB_INSTANCE.save_single('${(0, util_1.escPy)(configType)}')`,
        wp(`_j.dumps({'saved_to': _path})`),
    ].join('\n');
}
exports.saveSingleFile = saveSingleFile;
function listFiles(directory, extensions) {
    const extArg = extensions ? `[${extensions.map(e => `'${(0, util_1.escPy)(e)}'`).join(',')}]` : 'None';
    return [
        `import json as _j`,
        wp(`_j.dumps({'files': _CB_INSTANCE.list_files('${(0, util_1.escPy)(directory)}', ${extArg})})`),
    ].join('\n');
}
exports.listFiles = listFiles;
function createDirectory(dirPath) {
    return [
        `import json as _j, os as _os`,
        `_os.makedirs('${(0, util_1.escPy)(dirPath)}', exist_ok=True)`,
        wp(`_j.dumps({'created': '${(0, util_1.escPy)(dirPath)}'})`),
    ].join('\n');
}
exports.createDirectory = createDirectory;
function readColumns(filepath) {
    return [
        `import json as _j`,
        wp(`_j.dumps({'columns': _CB_INSTANCE.read_columns('${(0, util_1.escPy)(filepath)}')})`),
    ].join('\n');
}
exports.readColumns = readColumns;
function readSampleData(filepath, nRows = 5) {
    return [
        `import json as _j`,
        wp(`_j.dumps({'rows': _CB_INSTANCE.read_sample_data('${(0, util_1.escPy)(filepath)}', ${nRows})})`),
    ].join('\n');
}
exports.readSampleData = readSampleData;
function checkFileExists(path) {
    return [
        `import os, json`,
        wp(`json.dumps({'exists': os.path.exists('${(0, util_1.escPy)(path)}')})`),
    ].join('\n');
}
exports.checkFileExists = checkFileExists;
function setSectionTarget(section, target) {
    return [
        `import json as _j`,
        `_CB_INSTANCE.set_section_target('${(0, util_1.escPy)(section)}', '${(0, util_1.escPy)(target)}')`,
        `_state = _CB_INSTANCE._get_state()`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.setSectionTarget = setSectionTarget;
function validateConfig() {
    return [
        `import json as _j`,
        wp(`_j.dumps(_CB_INSTANCE.validate())`),
    ].join('\n');
}
exports.validateConfig = validateConfig;
function loadConfig(path, fileType) {
    const hint = fileType ? `, file_type='${(0, util_1.escPy)(fileType)}'` : '';
    return [
        `import json as _j`,
        `_state = _CB_INSTANCE.load_config('${(0, util_1.escPy)(path)}'${hint})`,
        wp(`_j.dumps(_state)`),
    ].join('\n');
}
exports.loadConfig = loadConfig;
function getSummary() {
    return [
        `import json as _j`,
        `from jupyter_bioacoustic.config_builder.summary import build_summary_from_builder as _bsfb`,
        wp(`_j.dumps(_bsfb(_CB_INSTANCE))`),
    ].join('\n');
}
exports.getSummary = getSummary;


/***/ },

/***/ "./lib/config_builder/sections/AppSection.js"
/*!***************************************************!*\
  !*** ./lib/config_builder/sections/AppSection.js ***!
  \***************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppSection = void 0;
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
class AppSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Application', 'app', false, true);
        this.browseRequested = new signaling_1.Signal(this);
        this._displayCols = [];
        this._availableCols = [];
        this._identColSelect = this._makeSelect(['(none)'], '(none)');
        this._identColSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('ident_column', this._identColSelect));
        this._displayChipsArea = this._makeChipsArea();
        this._displayPickerArea = this._makePickerArea();
        const displayWrap = this._makeColumnGroupWrapper();
        displayWrap.append(this._makeSectionLabel('display_columns'), this._displayChipsArea, this._displayPickerArea);
        this._body.appendChild(displayWrap);
        const { row: saveBtnRow, input: saveBtnCb } = this._makeCheckbox('project_save_btn');
        this._saveBtnCb = saveBtnCb;
        this._saveBtnCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(saveBtnRow);
        const { row: dupRow, input: dupCb } = this._makeCheckbox('duplicate_entries');
        this._duplicateCb = dupCb;
        this._duplicateCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(dupRow);
        this._bufferInput = this._makeInput('3', '80px');
        this._bufferInput.type = 'number';
        this._bufferInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('default_buffer', this._bufferInput));
        const { row: capRow, input: capCb } = this._makeCheckbox('capture');
        this._captureCb = capCb;
        this._captureCb.checked = true;
        this._captureCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(capRow);
        const capDirRow = this._makeRow();
        capDirRow.addEventListener('focusin', () => this.fieldFocused.emit('capture_dir'));
        capDirRow.addEventListener('click', () => this.fieldFocused.emit('capture_dir'));
        capDirRow.appendChild(this._makeLabel('capture_dir'));
        this._captureDirInput = this._makeInput('captures/', '160px');
        this._captureDirInput.addEventListener('input', () => this._emitChanged());
        const capDirBrowse = this._makeButton('Browse');
        capDirBrowse.addEventListener('click', () => {
            this.browseRequested.emit(this._captureDirInput.value || '.');
        });
        capDirRow.append(this._captureDirInput, capDirBrowse);
        this._body.appendChild(capDirRow);
        this._widthInput = this._makeInput('100%', '100px');
        this._widthInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('width', this._widthInput));
        const heightRow = this._makeRow();
        heightRow.addEventListener('focusin', () => this.fieldFocused.emit('clip_table_height'));
        heightRow.addEventListener('click', () => this.fieldFocused.emit('clip_table_height'));
        heightRow.appendChild(this._makeLabel('heights'));
        this._clipTableHeightInput = this._makeInput('175', '60px');
        this._clipTableHeightInput.type = 'number';
        this._playerHeightInput = this._makeInput('260', '60px');
        this._playerHeightInput.type = 'number';
        this._infoCardHeightInput = this._makeInput('34', '60px');
        this._infoCardHeightInput.type = 'number';
        this._formPanelHeightInput = this._makeInput('140', '60px');
        this._formPanelHeightInput.type = 'number';
        for (const inp of [this._clipTableHeightInput, this._playerHeightInput,
            this._infoCardHeightInput, this._formPanelHeightInput]) {
            inp.addEventListener('input', () => this._emitChanged());
        }
        this._captureHeightInput = this._makeInput('', '60px');
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
    _makeSectionLabel(text) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
        const lbl = document.createElement('span');
        lbl.textContent = text;
        lbl.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        row.append(lbl);
        row.addEventListener('click', () => this.fieldFocused.emit(text));
        return row;
    }
    setCaptureDir(path) {
        this._captureDirInput.value = path;
        this._emitChanged();
    }
    setColumnOptions(cols) {
        this._availableCols = cols;
        this._rebuildIdentSelect();
        this._rebuildPicker(this._displayPickerArea, this._displayCols, 'display');
    }
    _rebuildIdentSelect() {
        const current = this._identColSelect.value;
        this._identColSelect.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '(none)';
        this._identColSelect.appendChild(none);
        for (const col of this._availableCols) {
            const o = document.createElement('option');
            o.value = col;
            o.textContent = col;
            this._identColSelect.appendChild(o);
        }
        if (this._availableCols.includes(current))
            this._identColSelect.value = current;
    }
    _rebuildPicker(area, selected, which) {
        area.innerHTML = '';
        if (this._availableCols.length === 0) {
            area.style.display = 'none';
            return;
        }
        area.style.display = 'flex';
        const hint = document.createElement('span');
        hint.textContent = 'Click to add:';
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;width:100%;`;
        area.appendChild(hint);
        for (const col of this._availableCols) {
            if (selected.includes(col))
                continue;
            const chip = document.createElement('button');
            chip.textContent = `+ ${col}`;
            chip.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;
            chip.addEventListener('click', () => {
                selected.push(col);
                this._rebuildChips(this._displayChipsArea, selected, which);
                this._rebuildPicker(area, selected, which);
                this._emitChanged();
            });
            area.appendChild(chip);
        }
    }
    _rebuildChips(area, selected, which) {
        area.innerHTML = '';
        if (selected.length === 0) {
            const hint = document.createElement('span');
            hint.textContent = '(none)';
            hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-style:italic;`;
            area.appendChild(hint);
            return;
        }
        let dragIdx = -1;
        for (let i = 0; i < selected.length; i++) {
            const col = selected[i];
            const chip = document.createElement('span');
            chip.draggable = true;
            chip.style.cssText =
                `display:inline-flex;align-items:center;gap:4px;` +
                    `background:${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;cursor:grab;`;
            chip.addEventListener('dragstart', (e) => {
                dragIdx = i;
                chip.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });
            chip.addEventListener('dragend', () => { chip.style.opacity = '1'; });
            chip.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
            chip.addEventListener('drop', (e) => {
                e.preventDefault();
                if (dragIdx < 0 || dragIdx === i)
                    return;
                const [moved] = selected.splice(dragIdx, 1);
                selected.splice(i, 0, moved);
                this._rebuildChips(area, selected, which);
                this._emitChanged();
            });
            const name = document.createElement('span');
            name.textContent = col;
            const rm = document.createElement('button');
            rm.textContent = '✕';
            rm.style.cssText =
                `background:none;border:none;color:${styles_1.COLORS.textMuted};cursor:pointer;` +
                    `font-size:12px;padding:0 2px;line-height:1;`;
            rm.addEventListener('click', () => {
                const idx = selected.indexOf(col);
                if (idx >= 0)
                    selected.splice(idx, 1);
                this._rebuildChips(area, selected, which);
                this._rebuildPicker(this._displayPickerArea, selected, which);
                this._emitChanged();
            });
            chip.append(name, rm);
            area.appendChild(chip);
        }
    }
    getData() {
        const result = {};
        const ident = this._identColSelect.value;
        if (ident)
            result.ident_column = ident;
        if (this._displayCols.length > 0)
            result.display_columns = [...this._displayCols];
        if (this._saveBtnCb.checked)
            result.project_save_btn = true;
        if (this._duplicateCb.checked)
            result.duplicate_entries = true;
        const buf = parseFloat(this._bufferInput.value);
        if (!isNaN(buf) && buf !== 3)
            result.default_buffer = buf;
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
    setData(data) {
        if (data.ident_column)
            this._identColSelect.value = data.ident_column;
        if (data.display_columns && Array.isArray(data.display_columns)) {
            this._displayCols = [...data.display_columns];
            this._rebuildChips(this._displayChipsArea, this._displayCols, 'display');
            this._rebuildPicker(this._displayPickerArea, this._displayCols, 'display');
        }
        if (data.project_save_btn !== undefined)
            this._saveBtnCb.checked = !!data.project_save_btn;
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
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
class AudioSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Audio', 'audio', false, true, ['split', 'project', 'config']);
        this.browseRequested = new signaling_1.Signal(this);
        this._availableCols = [];
        this._sourceType = this._makeSelect(['path', 'url', 'column'], 'path');
        this._sourceType.addEventListener('change', () => {
            this._updateValueUI();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('source_type', this._sourceType));
        this._pathRow = this._makeRow();
        this._pathRow.addEventListener('focusin', () => this.fieldFocused.emit('value'));
        this._pathRow.addEventListener('click', () => this.fieldFocused.emit('value'));
        this._pathRow.appendChild(this._makeLabel('value'));
        this._valueInput = this._makeInput('audio/recording.flac', '200px');
        this._valueInput.addEventListener('input', () => this._emitChanged());
        this._colSelect = this._makeSelect([], '');
        this._colSelect.style.display = 'none';
        this._colSelect.addEventListener('change', () => this._emitChanged());
        this._browseBtn = this._makeButton('Browse');
        this._browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._valueInput.value || '.');
        });
        this._pathRow.append(this._valueInput, this._colSelect, this._browseBtn);
        this._body.appendChild(this._pathRow);
        this._prefixInput = this._makeInput('optional prefix', '200px');
        this._prefixInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('prefix', this._prefixInput));
        this._suffixInput = this._makeInput('optional suffix', '200px');
        this._suffixInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('suffix', this._suffixInput));
        this._fallbackInput = this._makeInput('fallback path', '200px');
        this._fallbackInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('fallback', this._fallbackInput));
        this._secrets = new SecretsEditor_1.SecretsEditor(true);
        this._secrets.changed.connect(() => this._emitChanged());
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    setPath(path) {
        this._valueInput.value = path;
        this._emitChanged();
    }
    setColumnOptions(cols) {
        this._availableCols = cols;
        this._colSelect.innerHTML = '';
        for (const col of cols) {
            const o = document.createElement('option');
            o.value = col;
            o.textContent = col;
            this._colSelect.appendChild(o);
        }
        this._updateValueUI();
    }
    _updateValueUI() {
        const isCol = this._sourceType.value === 'column';
        this._valueInput.style.display = isCol ? 'none' : '';
        this._colSelect.style.display = isCol ? '' : 'none';
        this._browseBtn.style.display = (this._sourceType.value === 'path') ? '' : 'none';
    }
    getData() {
        const sourceKey = this._sourceType.value;
        const result = {};
        const val = sourceKey === 'column' ? this._colSelect.value : this._valueInput.value;
        if (val)
            result[sourceKey] = val;
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
    setData(data) {
        if (data.path) {
            this._sourceType.value = 'path';
            this._valueInput.value = data.path;
        }
        else if (data.url) {
            this._sourceType.value = 'url';
            this._valueInput.value = data.url;
        }
        else if (data.column) {
            this._sourceType.value = 'column';
            this._colSelect.value = data.column;
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
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
class CollapsibleSection {
    constructor(title, sectionName, open = false, showTargetToggle = false, targetOptions) {
        this.focused = new signaling_1.Signal(this);
        this.fieldFocused = new signaling_1.Signal(this);
        this.changed = new signaling_1.Signal(this);
        this.targetChanged = new signaling_1.Signal(this);
        this.opened = new signaling_1.Signal(this);
        this._targetToggle = null;
        this._pinned = false;
        this._sectionName = sectionName;
        this._hasTargetToggle = showTargetToggle;
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
                this._pinned = true;
                if (!this.element.open)
                    this.element.open = true;
                this._updateChevron();
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
            this._pinned = true;
            if (!this.element.open)
                this.element.open = true;
            this._updateChevron();
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
        if (showTargetToggle) {
            const toggleWrap = document.createElement('span');
            toggleWrap.style.cssText = `display:flex;align-items:center;gap:4px;`;
            toggleWrap.addEventListener('click', (e) => e.stopPropagation());
            const lbl = document.createElement('span');
            lbl.textContent = 'target:';
            lbl.style.cssText = `font-size:11px;font-weight:400;color:${styles_1.COLORS.textSubtle};`;
            this._targetToggle = document.createElement('select');
            this._targetToggle.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:3px;color:${styles_1.COLORS.textPrimary};padding:1px 4px;font-size:10px;cursor:pointer;`;
            const opts = targetOptions || ['project', 'config'];
            for (const val of opts) {
                const o = document.createElement('option');
                o.value = val;
                o.textContent = val;
                this._targetToggle.appendChild(o);
            }
            this._targetToggle.addEventListener('change', () => {
                this.targetChanged.emit({ section: this._sectionName, target: this._targetToggle.value });
            });
            toggleWrap.append(lbl, this._targetToggle);
            summary.appendChild(toggleWrap);
        }
        this._body = document.createElement('div');
        this._body.style.cssText =
            `padding:10px 12px;display:flex;flex-direction:column;gap:8px;` +
                `background:${styles_1.COLORS.bgBase};`;
        this._summary = summary;
        this.element.append(summary, this._body);
    }
    get isPinned() {
        return this._pinned;
    }
    close() {
        this.element.open = false;
        this._pinned = false;
        this._updateChevron();
    }
    unpin() {
        this._pinned = false;
        this._updateChevron();
    }
    _updateChevron() {
        this._chevron.textContent = this.element.open ? '\u25be' : '\u25b8';
        this._summary.style.background = (this._pinned && this.element.open) ? styles_1.COLORS.bgSurface0 : styles_1.COLORS.bgMantle;
    }
    getTarget() {
        var _a;
        return ((_a = this._targetToggle) === null || _a === void 0 ? void 0 : _a.value) || 'project';
    }
    setTarget(target) {
        if (this._targetToggle) {
            this._targetToggle.value = target;
        }
    }
    setTargetOptions(options) {
        if (!this._targetToggle)
            return;
        const current = this._targetToggle.value;
        this._targetToggle.innerHTML = '';
        for (const val of options) {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = val;
            this._targetToggle.appendChild(o);
        }
        if (options.includes(current))
            this._targetToggle.value = current;
        else if (options.length > 0)
            this._targetToggle.value = options[options.length - 1];
        this._targetToggle.disabled = options.length <= 1;
    }
    _makeRow() {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
        return row;
    }
    _makeLabel(text) {
        const lbl = document.createElement('label');
        lbl.textContent = text;
        lbl.style.cssText =
            `color:${styles_1.COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
        return lbl;
    }
    _makeInput(placeholder = '', width = '200px') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = placeholder;
        inp.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:4px 8px;` +
                `font-size:12px;width:${width};box-sizing:border-box;`;
        return inp;
    }
    _makeSelect(options, selected) {
        const sel = document.createElement('select');
        sel.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:4px 6px;font-size:12px;`;
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
    _makeCheckbox(label, checked = false) {
        const row = this._makeRow();
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
    _makeButton(text, primary = false) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = primary
            ? `background:${styles_1.COLORS.blue};border:none;border-radius:4px;color:${styles_1.COLORS.bgBase};padding:4px 12px;font-size:12px;cursor:pointer;font-weight:700;`
            : `background:${styles_1.COLORS.bgSurface1};border:none;border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:4px 10px;font-size:12px;cursor:pointer;`;
        return btn;
    }
    _makeFieldRow(labelText, input) {
        const row = this._makeRow();
        row.appendChild(this._makeLabel(labelText));
        row.appendChild(input);
        row.addEventListener('focusin', () => this.fieldFocused.emit(labelText));
        row.addEventListener('click', () => this.fieldFocused.emit(labelText));
        return row;
    }
    _emitChanged() {
        this.changed.emit(void 0);
    }
}
exports.CollapsibleSection = CollapsibleSection;


/***/ },

/***/ "./lib/config_builder/sections/ConfigSummary.js"
/*!******************************************************!*\
  !*** ./lib/config_builder/sections/ConfigSummary.js ***!
  \******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigSummary = void 0;
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
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
                `<span style="${S.dynTag}">${this._esc(value)}</span>`;
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
                `<span style="${S.tag}">${this._esc(tag)}</span>` +
                    `<span style="${S.val}">${this._esc(value)}</span>`;
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
    _esc(s) {
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
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
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
class DataSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Data', 'data', false, true, ['split', 'project', 'config']);
        this.columnsLoaded = new signaling_1.Signal(this);
        this.fileLoadRequested = new signaling_1.Signal(this);
        this.browseRequested = new signaling_1.Signal(this);
        this._detectedCols = [];
        this._selectedCols = [];
        this._debounceTimer = null;
        this._sourceType = this._makeSelect(['path', 'url', 'sql', 'api'], 'path');
        this._sourceType.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('source_type', this._sourceType));
        const pathRow = this._makeRow();
        pathRow.addEventListener('focusin', () => this.fieldFocused.emit('path'));
        pathRow.addEventListener('click', () => this.fieldFocused.emit('path'));
        pathRow.appendChild(this._makeLabel('path / url'));
        this._pathInput = this._makeInput('data/detections.csv', '220px');
        this._pathInput.addEventListener('input', () => {
            this._emitChanged();
            this._scheduleAutoLoad();
        });
        this._browseBtn = this._makeButton('Browse');
        this._browseBtn.addEventListener('click', () => {
            this.browseRequested.emit(this._pathInput.value || '.');
        });
        pathRow.append(this._pathInput, this._browseBtn);
        this._body.appendChild(pathRow);
        const colLabel = document.createElement('div');
        colLabel.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
        const colLabelText = document.createElement('span');
        colLabelText.textContent = 'columns';
        colLabelText.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        colLabel.append(colLabelText);
        colLabel.addEventListener('click', () => this.fieldFocused.emit('data_columns'));
        this._selectedChipsArea = document.createElement('div');
        this._selectedChipsArea.style.cssText =
            `display:flex;flex-wrap:wrap;gap:4px;min-height:24px;padding:2px 0;`;
        this._colPickerArea = document.createElement('div');
        this._colPickerArea.style.cssText =
            `display:none;flex-wrap:wrap;gap:4px;padding:4px 0;` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface0};margin-top:2px;`;
        const colWrap = document.createElement('div');
        colWrap.style.cssText =
            `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
                `background:${styles_1.COLORS.bgSurface0};border-radius:6px;`;
        colWrap.append(colLabel, this._selectedChipsArea, this._colPickerArea);
        this._body.appendChild(colWrap);
        const colSeparator = document.createElement('div');
        colSeparator.style.cssText =
            `height:1px;background:${styles_1.COLORS.bgSurface1};margin:6px 0;`;
        this._body.appendChild(colSeparator);
        this._startTimeSelect = this._makeSelect(['start_time'], 'start_time');
        this._startTimeSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('start_time_col', this._startTimeSelect));
        this._endTimeSelect = this._makeSelect(['end_time'], 'end_time');
        this._endTimeSelect.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('end_time_col', this._endTimeSelect));
        this._durationInput = this._makeInput('duration or number', '150px');
        this._durationInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('duration', this._durationInput));
        this._secrets = new SecretsEditor_1.SecretsEditor(true);
        this._secrets.changed.connect(() => this._emitChanged());
        this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
        this._body.appendChild(this._secrets.element);
    }
    _scheduleAutoLoad() {
        if (this._debounceTimer)
            clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            const path = this._pathInput.value.trim();
            if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
                this.fileLoadRequested.emit(path);
            }
        }, 800);
    }
    setDetectedColumns(cols) {
        this._detectedCols = cols;
        this.columnsLoaded.emit(cols);
        this._rebuildColPicker();
        this._rebuildTimeSelects();
    }
    getDetectedColumns() {
        return this._detectedCols;
    }
    setPath(path) {
        this._pathInput.value = path;
        this._emitChanged();
        if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
            this.fileLoadRequested.emit(path);
        }
    }
    _rebuildColPicker() {
        this._colPickerArea.innerHTML = '';
        if (this._detectedCols.length === 0) {
            this._colPickerArea.style.display = 'none';
            return;
        }
        this._colPickerArea.style.display = 'flex';
        const hint = document.createElement('span');
        hint.textContent = 'Click to add:';
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;width:100%;`;
        this._colPickerArea.appendChild(hint);
        for (const col of this._detectedCols) {
            if (this._selectedCols.includes(col))
                continue;
            const chip = document.createElement('button');
            chip.textContent = `+ ${col}`;
            chip.style.cssText =
                `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;
            chip.addEventListener('click', () => {
                this._selectedCols.push(col);
                this._rebuildColPicker();
                this._rebuildSelectedChips();
                this._emitChanged();
            });
            this._colPickerArea.appendChild(chip);
        }
    }
    _rebuildSelectedChips() {
        this._selectedChipsArea.innerHTML = '';
        if (this._selectedCols.length === 0) {
            const hint = document.createElement('span');
            hint.textContent = 'all columns (none selected)';
            hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-style:italic;`;
            this._selectedChipsArea.appendChild(hint);
            return;
        }
        let dragIdx = -1;
        for (let i = 0; i < this._selectedCols.length; i++) {
            const col = this._selectedCols[i];
            const chip = document.createElement('span');
            chip.draggable = true;
            chip.style.cssText =
                `display:inline-flex;align-items:center;gap:4px;` +
                    `background:${styles_1.COLORS.bgSurface1};border-radius:12px;` +
                    `color:${styles_1.COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;cursor:grab;`;
            chip.addEventListener('dragstart', (e) => {
                dragIdx = i;
                chip.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });
            chip.addEventListener('dragend', () => { chip.style.opacity = '1'; });
            chip.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
            chip.addEventListener('drop', (e) => {
                e.preventDefault();
                if (dragIdx < 0 || dragIdx === i)
                    return;
                const [moved] = this._selectedCols.splice(dragIdx, 1);
                this._selectedCols.splice(i, 0, moved);
                this._rebuildSelectedChips();
                this._emitChanged();
            });
            const name = document.createElement('span');
            name.textContent = col;
            const rm = document.createElement('button');
            rm.textContent = '✕';
            rm.style.cssText =
                `background:none;border:none;color:${styles_1.COLORS.textMuted};cursor:pointer;` +
                    `font-size:12px;padding:0 2px;line-height:1;`;
            rm.addEventListener('click', () => {
                this._selectedCols = this._selectedCols.filter(c => c !== col);
                this._rebuildColPicker();
                this._rebuildSelectedChips();
                this._emitChanged();
            });
            chip.append(name, rm);
            this._selectedChipsArea.appendChild(chip);
        }
    }
    _rebuildTimeSelects() {
        const currentStart = this._startTimeSelect.value;
        const currentEnd = this._endTimeSelect.value;
        this._startTimeSelect.innerHTML = '';
        this._endTimeSelect.innerHTML = '';
        const cols = this._detectedCols.length > 0 ? this._detectedCols : ['start_time'];
        for (const col of cols) {
            const o1 = document.createElement('option');
            o1.value = col;
            o1.textContent = col;
            this._startTimeSelect.appendChild(o1);
        }
        for (const col of (this._detectedCols.length > 0 ? this._detectedCols : ['end_time'])) {
            const o2 = document.createElement('option');
            o2.value = col;
            o2.textContent = col;
            this._endTimeSelect.appendChild(o2);
        }
        if (cols.includes(currentStart))
            this._startTimeSelect.value = currentStart;
        else if (cols.includes('start_time'))
            this._startTimeSelect.value = 'start_time';
        const endCols = this._detectedCols.length > 0 ? this._detectedCols : ['end_time'];
        if (endCols.includes(currentEnd))
            this._endTimeSelect.value = currentEnd;
        else if (endCols.includes('end_time'))
            this._endTimeSelect.value = 'end_time';
    }
    getData() {
        const sourceKey = this._sourceType.value;
        const result = {};
        result[sourceKey] = this._pathInput.value || undefined;
        if (this._selectedCols.length > 0)
            result.columns = [...this._selectedCols];
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
    setData(data) {
        if (data.path) {
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
        if (data.columns && Array.isArray(data.columns)) {
            this._selectedCols = [...data.columns];
            this._rebuildSelectedChips();
            this._rebuildColPicker();
        }
        if (data.start_time)
            this._startTimeSelect.value = data.start_time;
        if (data.end_time)
            this._endTimeSelect.value = data.end_time;
        if (data.duration !== undefined)
            this._durationInput.value = String(data.duration);
        if (data.secrets !== undefined)
            this._secrets.setData(data.secrets);
    }
}
exports.DataSection = DataSection;


/***/ },

/***/ "./lib/config_builder/sections/FormSection.js"
/*!****************************************************!*\
  !*** ./lib/config_builder/sections/FormSection.js ***!
  \****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FormSection = void 0;
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
class FormSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Form', 'form', false, true, ['project', 'config', 'form']);
        this.browseRequested = new signaling_1.Signal(this);
        this.columnsRequested = new signaling_1.Signal(this);
        this._elements = [];
        this._dynForms = [];
        const hint = document.createElement('div');
        hint.textContent = 'Click on the buttons below to add items to the form.';
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
        const dynHeader = this._makeRow();
        const dynLabel = document.createElement('div');
        dynLabel.textContent = 'Dynamic Forms';
        dynLabel.style.cssText =
            `font-size:12px;font-weight:700;color:${styles_1.COLORS.textMuted};letter-spacing:0.5px;`;
        const addDynBtn = this._makeButton('+ Dynamic Form');
        addDynBtn.style.fontSize = '11px';
        addDynBtn.addEventListener('click', () => this._promptAddDynForm());
        dynHeader.append(dynLabel, addDynBtn);
        this._dynFormsContainer.appendChild(dynHeader);
        this._body.appendChild(this._dynFormsContainer);
    }
    _makeAddBar(onAdd) {
        const bar = document.createElement('div');
        bar.style.cssText =
            `display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px 8px;padding:6px 0;` +
                `border-bottom:1px solid ${styles_1.COLORS.bgSurface0};margin-bottom:4px;`;
        const columns = [
            { header: 'Display', rows: [['title', 'text'], ['line', 'break']] },
            { header: 'User Input', rows: [['annotation', 'select'], ['textbox', 'checkbox', 'number']] },
            { header: 'Data', rows: [['pass_value'], ['fixed_value']] },
            { header: 'Navigation', rows: [['submission_buttons']] },
        ];
        const mkBtn = (t) => {
            const btn = this._makeButton(`+ ${t}`);
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
        const cfg = config || this._defaultConfig(type);
        const tgt = target || { elements: this._elements, listEl: this._listEl };
        const card = this._buildElementCard(type, cfg, tgt);
        const fe = { type, config: cfg, el: card };
        tgt.elements.push(fe);
        tgt.listEl.appendChild(card);
        this._emitChanged();
    }
    _defaultConfig(type) {
        switch (type) {
            case 'title': return { value: 'REVIEW' };
            case 'select': return { label: '', column: '', required: false, items: [] };
            case 'textbox': return { label: '', column: '', multiline: false };
            case 'checkbox': return { label: '', column: '' };
            case 'number': return { label: '', column: '', min: 0, max: 1, step: 0.1 };
            case 'annotation': return { tools: ['start_end_time_select'] };
            case 'pass_value': return { source_column: '', column: '' };
            case 'fixed_value': return { column: '', value: '' };
            case 'submission_buttons': return { submit: { label: 'Submit' }, next: { label: 'Skip' } };
            case 'break': return {};
            case 'line': return {};
            case 'text': return { value: '' };
            default: return {};
        }
    }
    _buildElementCard(type, cfg, target) {
        const card = document.createElement('div');
        card.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
                `display:flex;flex-direction:column;gap:5px;`;
        card.addEventListener('focusin', () => this.fieldFocused.emit(type));
        card.addEventListener('click', () => this.fieldFocused.emit(type));
        const header = this._makeRow();
        const typeLabel = document.createElement('span');
        typeLabel.textContent = type;
        typeLabel.style.cssText =
            `font-size:12px;font-weight:700;color:${styles_1.COLORS.blue};flex:1;`;
        const moveUp = this._makeButton('▲');
        moveUp.style.cssText += `font-size:10px;padding:2px 6px;`;
        moveUp.addEventListener('click', () => this._moveElement(card, -1, target));
        const moveDown = this._makeButton('▼');
        moveDown.style.cssText += `font-size:10px;padding:2px 6px;`;
        moveDown.addEventListener('click', () => this._moveElement(card, 1, target));
        const removeBtn = this._makeButton('✕');
        removeBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${styles_1.COLORS.red};`;
        removeBtn.addEventListener('click', () => this._removeElement(card, target));
        header.append(typeLabel, moveUp, moveDown, removeBtn);
        card.appendChild(header);
        this._buildElementFields(card, type, cfg);
        return card;
    }
    _buildElementFields(card, type, cfg) {
        switch (type) {
            case 'title':
                this._addField(card, cfg, 'value', 'title text', '200px');
                this._addCheckboxField(card, cfg, 'progress_tracker', 'progress_tracker');
                break;
            case 'select':
                this._addLabelColumnFields(card, cfg);
                this._addCheckboxField(card, cfg, 'required', 'required');
                this._addSelectItemsBuilder(card, cfg);
                break;
            case 'textbox':
                this._addLabelColumnFields(card, cfg);
                this._addCheckboxField(card, cfg, 'multiline', 'multiline');
                break;
            case 'checkbox':
                this._addLabelColumnFields(card, cfg);
                this._addField(card, cfg, 'checked_value', 'checked_value', '100px');
                this._addField(card, cfg, 'unchecked_value', 'unchecked_value', '100px');
                this._addField(card, cfg, 'checked_form', 'checked_form', '150px');
                this._addField(card, cfg, 'unchecked_form', 'unchecked_form', '150px');
                break;
            case 'number':
                this._addLabelColumnFields(card, cfg);
                this._addNumField(card, cfg, 'min', 'min', '60px');
                this._addNumField(card, cfg, 'max', 'max', '60px');
                this._addNumField(card, cfg, 'step', 'step', '60px');
                break;
            case 'annotation': {
                const existingTools = Array.isArray(cfg.tools) ? cfg.tools : ['start_end_time_select'];
                const toolsSel = this._makeSelect(['time_select', 'start_end_time_select', 'bounding_box', 'multibox']);
                toolsSel.multiple = true;
                toolsSel.style.width = '140px';
                toolsSel.style.height = '75px';
                for (const opt of toolsSel.options) {
                    opt.selected = existingTools.includes(opt.value);
                }
                toolsSel.addEventListener('change', () => {
                    cfg.tools = Array.from(toolsSel.selectedOptions).map(o => o.value);
                    this._emitChanged();
                });
                card.appendChild(this._makeFieldRow('tools', toolsSel));
                this._addField(card, cfg, 'start_time_col', 'start_time col', '120px');
                this._addField(card, cfg, 'end_time_col', 'end_time col', '120px');
                this._addField(card, cfg, 'min_freq_col', 'min_freq col', '120px');
                this._addField(card, cfg, 'max_freq_col', 'max_freq col', '120px');
                this._addField(card, cfg, 'form', 'form (dynamic)', '150px');
                break;
            }
            case 'pass_value':
                this._addField(card, cfg, 'source_column', 'source_column', '150px');
                this._addField(card, cfg, 'column', 'column', '150px');
                break;
            case 'fixed_value':
                this._addField(card, cfg, 'column', 'column', '150px');
                this._addField(card, cfg, 'value', 'value', '150px');
                break;
            case 'submission_buttons': {
                this._addCheckboxField(card, cfg, 'line', 'line divider');
                this._addCheckboxField(card, cfg, 'previous', 'previous btn');
                this._addField(card, cfg, 'next_label', 'next label', '100px');
                this._addField(card, cfg, 'submit_label', 'submit label', '100px');
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
                    this._emitChanged();
                });
                card.appendChild(this._makeFieldRow('text', ta));
                break;
            }
            case 'break':
            case 'line':
                break;
        }
    }
    _addLabelColumnFields(card, cfg) {
        const labelInp = this._makeInput('label', '150px');
        if (cfg.label != null)
            labelInp.value = String(cfg.label);
        const colInp = this._makeInput('column', '150px');
        if (cfg.column != null)
            colInp.value = String(cfg.column);
        const userEditedCol = { value: !!cfg.column };
        labelInp.addEventListener('input', () => {
            cfg.label = labelInp.value;
            if (!userEditedCol.value) {
                const snake = labelInp.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                colInp.value = snake;
                cfg.column = snake;
            }
            this._emitChanged();
        });
        colInp.addEventListener('input', () => {
            userEditedCol.value = !!colInp.value;
            cfg.column = colInp.value;
            this._emitChanged();
        });
        card.appendChild(this._makeFieldRow('label', labelInp));
        card.appendChild(this._makeFieldRow('column', colInp));
    }
    _addField(card, cfg, key, label, width) {
        const inp = this._makeInput(label, width);
        if (cfg[key] !== undefined && cfg[key] !== null)
            inp.value = String(cfg[key]);
        inp.addEventListener('input', () => {
            cfg[key] = inp.value;
            this._emitChanged();
        });
        card.appendChild(this._makeFieldRow(label, inp));
    }
    _addNumField(card, cfg, key, label, width) {
        const inp = this._makeInput('', width);
        inp.type = 'number';
        inp.step = 'any';
        if (cfg[key] !== undefined)
            inp.value = String(cfg[key]);
        inp.addEventListener('input', () => {
            const v = parseFloat(inp.value);
            cfg[key] = isNaN(v) ? undefined : v;
            this._emitChanged();
        });
        card.appendChild(this._makeFieldRow(label, inp));
    }
    _addCheckboxField(card, cfg, key, label) {
        const { row, input } = this._makeCheckbox(label, !!cfg[key]);
        input.addEventListener('change', () => {
            cfg[key] = input.checked;
            this._emitChanged();
        });
        card.appendChild(row);
    }
    _addSelectItemsBuilder(card, cfg) {
        const itemsArea = document.createElement('div');
        itemsArea.style.cssText =
            `display:flex;flex-direction:column;gap:4px;padding:4px 0;` +
                `border-top:1px solid ${styles_1.COLORS.bgSurface1};margin-top:4px;`;
        const modeLabel = document.createElement('span');
        modeLabel.textContent = 'Items source:';
        modeLabel.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;`;
        itemsArea.appendChild(modeLabel);
        const modeSel = this._makeSelect(['add items', 'from file', 'paste values', 'range'], 'add items');
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
                this._buildAddItems(itemsContent, cfg);
            }
            else if (m === 'from file') {
                this._buildFileItems(itemsContent, cfg);
            }
            else if (m === 'paste values') {
                this._buildPasteValues(itemsContent, cfg);
            }
            else {
                this._buildRangeItems(itemsContent, cfg);
            }
        };
        buildForMode(mode);
        modeSel.addEventListener('change', () => buildForMode(modeSel.value));
        card.appendChild(itemsArea);
    }
    _buildAddItems(container, cfg) {
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
                const rm = this._makeButton('✕');
                rm.style.cssText += `font-size:9px;padding:1px 4px;color:${styles_1.COLORS.red};`;
                rm.addEventListener('click', () => {
                    cfg.items.splice(i, 1);
                    renderList();
                    this._emitChanged();
                });
                row.append(txt, rm);
                listEl.appendChild(row);
            }
        };
        renderList();
        container.appendChild(listEl);
        const addRow = document.createElement('div');
        addRow.style.cssText = `display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;`;
        const labelInp = this._makeInput('label', '90px');
        const valueInp = this._makeInput('value', '90px');
        const formInp = this._makeInput('form (opt)', '90px');
        const addBtn = this._makeButton('+ Add');
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
            this._emitChanged();
        });
        addRow.append(labelInp, valueInp, formInp, addBtn);
        container.appendChild(addRow);
        const hint = document.createElement('span');
        hint.textContent = 'Add items one at a time. Use form field to reference a dynamic form.';
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;`;
        container.appendChild(hint);
    }
    _buildPasteValues(container, cfg) {
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
        const sepInp = this._makeInput(',', '40px');
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
            this._emitChanged();
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
    _buildFileItems(container, cfg) {
        var _a, _b, _c;
        const pathRow = this._makeRow();
        pathRow.appendChild(this._makeLabel('file path'));
        const pathInp = this._makeInput('data/categories.csv', '160px');
        if (cfg.items && typeof cfg.items === 'object' && !Array.isArray(cfg.items) && cfg.items.path) {
            pathInp.value = cfg.items.path;
        }
        const valSel = this._makeSelect([], '');
        valSel.style.width = '150px';
        valSel.addEventListener('change', () => {
            if (!cfg.items || typeof cfg.items !== 'object')
                cfg.items = {};
            cfg.items.value = valSel.value;
            this._emitChanged();
        });
        const lblSel = this._makeSelect(['(none)'], '');
        lblSel.style.width = '150px';
        lblSel.addEventListener('change', () => {
            if (!cfg.items || typeof cfg.items !== 'object')
                cfg.items = {};
            cfg.items.label = lblSel.value || undefined;
            this._emitChanged();
        });
        const populateSelects = (cols) => {
            var _a, _b;
            valSel.innerHTML = '';
            lblSel.innerHTML = '';
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = '(none)';
            lblSel.appendChild(noneOpt);
            for (const col of cols) {
                const o1 = document.createElement('option');
                o1.value = col;
                o1.textContent = col;
                valSel.appendChild(o1);
                const o2 = document.createElement('option');
                o2.value = col;
                o2.textContent = col;
                lblSel.appendChild(o2);
            }
            if (((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.value) && cols.includes(cfg.items.value))
                valSel.value = cfg.items.value;
            if (((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.label) && cols.includes(cfg.items.label))
                lblSel.value = cfg.items.label;
        };
        const loadCols = (path) => {
            if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
                this.columnsRequested.emit({ path, callback: populateSelects });
            }
        };
        pathInp.addEventListener('input', () => {
            if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items))
                cfg.items = {};
            cfg.items.path = pathInp.value;
            this._emitChanged();
            loadCols(pathInp.value);
        });
        const browseBtn = this._makeButton('Browse');
        browseBtn.addEventListener('click', () => {
            this.browseRequested.emit({
                callback: (path) => {
                    pathInp.value = path;
                    if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items))
                        cfg.items = {};
                    cfg.items.path = path;
                    this._emitChanged();
                    loadCols(path);
                }
            });
        });
        pathRow.append(pathInp, browseBtn);
        container.appendChild(pathRow);
        container.appendChild(this._makeFieldRow('value col', valSel));
        container.appendChild(this._makeFieldRow('label col', lblSel));
        if (pathInp.value)
            loadCols(pathInp.value);
        const { row: fbRow, input: fbCb } = this._makeCheckbox('filter_box', !!((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.filter_box));
        fbCb.addEventListener('change', () => {
            if (!cfg.items || typeof cfg.items !== 'object')
                cfg.items = {};
            cfg.items.filter_box = fbCb.checked;
            this._emitChanged();
        });
        container.appendChild(fbRow);
        const { row: cvRow, input: cvCb } = this._makeCheckbox('custom_value', !!((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.custom_value));
        cvCb.addEventListener('change', () => {
            if (!cfg.items || typeof cfg.items !== 'object')
                cfg.items = {};
            cfg.items.custom_value = cvCb.checked;
            this._emitChanged();
        });
        container.appendChild(cvRow);
        const { row: naRow, input: naCb } = this._makeCheckbox('not_available', !!((_c = cfg.items) === null || _c === void 0 ? void 0 : _c.not_available));
        naCb.addEventListener('change', () => {
            if (!cfg.items || typeof cfg.items !== 'object')
                cfg.items = {};
            cfg.items.not_available = naCb.checked;
            this._emitChanged();
        });
        container.appendChild(naRow);
    }
    _buildRangeItems(container, cfg) {
        var _a, _b, _c;
        const minInp = this._makeInput('1', '60px');
        minInp.type = 'number';
        const maxInp = this._makeInput('10', '60px');
        maxInp.type = 'number';
        const stepInp = this._makeInput('1', '60px');
        stepInp.type = 'number';
        if (((_a = cfg.items) === null || _a === void 0 ? void 0 : _a.min) !== undefined)
            minInp.value = String(cfg.items.min);
        if (((_b = cfg.items) === null || _b === void 0 ? void 0 : _b.max) !== undefined)
            maxInp.value = String(cfg.items.max);
        if (((_c = cfg.items) === null || _c === void 0 ? void 0 : _c.step) !== undefined)
            stepInp.value = String(cfg.items.step);
        const update = () => {
            cfg.items = {
                min: parseInt(minInp.value) || 1,
                max: parseInt(maxInp.value) || 10,
                step: parseInt(stepInp.value) || 1,
            };
            this._emitChanged();
        };
        minInp.addEventListener('input', update);
        maxInp.addEventListener('input', update);
        stepInp.addEventListener('input', update);
        const row = this._makeRow();
        row.append(this._makeLabel('min'), minInp, this._makeLabel('max'), maxInp, this._makeLabel('step'), stepInp);
        container.appendChild(row);
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
        const inp = this._makeInput('form name', '200px');
        inp.style.fontSize = '13px';
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display:flex;gap:8px;justify-content:flex-end;`;
        const cancelBtn = this._makeButton('Cancel');
        cancelBtn.addEventListener('click', () => overlay.remove());
        const createBtn = this._makeButton('Create', true);
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
        const header = this._makeRow();
        const lbl = document.createElement('span');
        lbl.textContent = name;
        lbl.style.cssText = `font-size:12px;font-weight:700;color:${styles_1.COLORS.mauve};flex:1;cursor:pointer;`;
        lbl.title = 'Double-click to rename';
        const startRename = () => {
            const renameInp = this._makeInput(df.name, '160px');
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
        const renameBtn = this._makeButton('✎');
        renameBtn.title = 'Rename form';
        renameBtn.style.cssText += `font-size:12px;padding:2px 6px;color:${styles_1.COLORS.textPrimary};`;
        renameBtn.addEventListener('click', startRename);
        const rmBtn = this._makeButton('✕');
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
    getData() {
        const USER_INPUT_TYPES = new Set(['select', 'textbox', 'checkbox', 'number']);
        const result = {};
        const formList = [];
        let submissionButtons = null;
        let seenUserInput = false;
        for (const elem of this._elements) {
            const cfg = Object.assign({}, elem.config);
            if (elem.type === 'submission_buttons') {
                const sb = {};
                if (cfg.line)
                    sb.line = true;
                if (cfg.previous)
                    sb.previous = true;
                if (cfg.next_label)
                    sb.next = { label: cfg.next_label };
                if (cfg.submit_label)
                    sb.submit = { label: cfg.submit_label };
                submissionButtons = sb;
                continue;
            }
            if (USER_INPUT_TYPES.has(elem.type))
                seenUserInput = true;
            const serialized = this._serializeElement(elem.type, cfg);
            if (serialized === null)
                continue;
            const isSpecial = elem.type === 'title' || elem.type === 'annotation' ||
                elem.type === 'pass_value' || elem.type === 'fixed_value';
            const hasWrapper = typeof serialized === 'object' && serialized !== null &&
                !Array.isArray(serialized) && '__key' in serialized;
            const val = hasWrapper ? serialized.__val : serialized;
            if (!seenUserInput && isSpecial) {
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
                const elems = [];
                for (const fe of df.elements) {
                    const cfg = Object.assign({}, fe.config);
                    const cleaned = {};
                    for (const [k, v] of Object.entries(cfg)) {
                        if (v !== undefined && v !== null && v !== '' && v !== false) {
                            cleaned[k] = v;
                        }
                    }
                    elems.push({ [fe.type]: cleaned });
                }
                dynDict[df.name] = elems;
            }
            result.dynamic_forms = dynDict;
        }
        return result;
    }
    _serializeElement(type, cfg) {
        if (type === 'title') {
            if (cfg.progress_tracker) {
                return { __key: 'title', __val: { value: cfg.value || '', progress_tracker: true } };
            }
            return { __key: 'title', __val: cfg.value || '' };
        }
        if (type === 'pass_value') {
            return { __key: 'pass_value', __val: { source_column: cfg.source_column || '', column: cfg.column || '' } };
        }
        if (type === 'fixed_value') {
            return { __key: 'fixed_value', __val: { column: cfg.column || '', value: cfg.value || '' } };
        }
        if (type === 'annotation') {
            const annot = {};
            if (cfg.start_time_col)
                annot.start_time = { column: cfg.start_time_col, source_value: 'start_time' };
            if (cfg.end_time_col)
                annot.end_time = { column: cfg.end_time_col, source_value: 'end_time' };
            if (cfg.min_freq_col)
                annot.min_frequency = { column: cfg.min_freq_col };
            if (cfg.max_freq_col)
                annot.max_frequency = { column: cfg.max_freq_col };
            if (cfg.tools)
                annot.tools = cfg.tools;
            if (cfg.form)
                annot.form = cfg.form;
            return { __key: 'annotation', __val: annot };
        }
        if (type === 'break' || type === 'line')
            return true;
        if (type === 'text')
            return cfg.value || '';
        const cleaned = {};
        for (const [k, v] of Object.entries(cfg)) {
            if (v !== undefined && v !== null && v !== '' && v !== false) {
                cleaned[k] = v;
            }
        }
        return cleaned;
    }
    setData(data) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this._elements = [];
        this._listEl.innerHTML = '';
        this._dynForms = [];
        while (this._dynFormsContainer.children.length > 1) {
            this._dynFormsContainer.removeChild(this._dynFormsContainer.lastChild);
        }
        if (data.title !== undefined) {
            const titleCfg = typeof data.title === 'string'
                ? { value: data.title }
                : { value: ((_a = data.title) === null || _a === void 0 ? void 0 : _a.value) || '', progress_tracker: !!((_b = data.title) === null || _b === void 0 ? void 0 : _b.progress_tracker) };
            this._addElement('title', titleCfg);
        }
        if (data.pass_value) {
            this._addElement('pass_value', Object.assign({}, data.pass_value));
        }
        if (data.fixed_value) {
            this._addElement('fixed_value', Object.assign({}, data.fixed_value));
        }
        if (data.annotation) {
            const a = data.annotation;
            const cfg = {};
            if (a.start_time)
                cfg.start_time_col = ((_c = a.start_time) === null || _c === void 0 ? void 0 : _c.column) || a.start_time;
            if (a.end_time)
                cfg.end_time_col = ((_d = a.end_time) === null || _d === void 0 ? void 0 : _d.column) || a.end_time;
            if (a.min_frequency)
                cfg.min_freq_col = ((_e = a.min_frequency) === null || _e === void 0 ? void 0 : _e.column) || a.min_frequency;
            if (a.max_frequency)
                cfg.max_freq_col = ((_f = a.max_frequency) === null || _f === void 0 ? void 0 : _f.column) || a.max_frequency;
            if (a.tools)
                cfg.tools = a.tools;
            if (a.form)
                cfg.form = a.form;
            this._addElement('annotation', cfg);
        }
        if (Array.isArray(data.form)) {
            for (const item of data.form) {
                if (!item || typeof item !== 'object')
                    continue;
                const [type] = Object.keys(item);
                const cfg = typeof item[type] === 'object' && item[type] !== null ? Object.assign({}, item[type]) : { value: item[type] };
                this._addElement(type, cfg);
            }
        }
        else {
            for (const key of ['select', 'textbox', 'checkbox', 'number']) {
                if (data[key]) {
                    const cfg = typeof data[key] === 'object' ? Object.assign({}, data[key]) : { value: data[key] };
                    this._addElement(key, cfg);
                }
            }
        }
        if (data.submission_buttons) {
            const sb = data.submission_buttons;
            const cfg = {};
            if (sb.line)
                cfg.line = true;
            if (sb.previous)
                cfg.previous = true;
            if ((_g = sb.next) === null || _g === void 0 ? void 0 : _g.label)
                cfg.next_label = sb.next.label;
            if ((_h = sb.submit) === null || _h === void 0 ? void 0 : _h.label)
                cfg.submit_label = sb.submit.label;
            this._addElement('submission_buttons', cfg);
        }
        const dynForms = data.dynamic_forms;
        if (dynForms && typeof dynForms === 'object' && !Array.isArray(dynForms)) {
            for (const [name, elems] of Object.entries(dynForms)) {
                const feList = [];
                if (Array.isArray(elems)) {
                    for (const el of elems) {
                        if (el && typeof el === 'object') {
                            const [type] = Object.keys(el);
                            const cfg = typeof el[type] === 'object' && el[type] !== null ? Object.assign({}, el[type]) : { value: el[type] };
                            feList.push({ type: type, config: cfg, el: document.createElement('div') });
                        }
                    }
                }
                this._createDynForm(name, feList);
            }
        }
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
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
const SecretsEditor_1 = __webpack_require__(/*! ./SecretsEditor */ "./lib/config_builder/sections/SecretsEditor.js");
class OutputSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Output', 'output', false, true);
        this._uriInput = this._makeInput('s3://bucket/reviews.csv', '250px');
        this._uriInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('sync_uri', this._uriInput));
        const { row: syncRow, input: syncCb } = this._makeCheckbox('sync_button');
        this._syncBtnCb = syncCb;
        this._syncBtnCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(syncRow);
        this._syncLabelInput = this._makeInput('Sync', '150px');
        this._syncLabelInput.addEventListener('input', () => this._emitChanged());
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
    getData() {
        const result = {};
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
    setData(data) {
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
}
exports.OutputSection = OutputSection;


/***/ },

/***/ "./lib/config_builder/sections/ProjectSection.js"
/*!*******************************************************!*\
  !*** ./lib/config_builder/sections/ProjectSection.js ***!
  \*******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProjectSection = void 0;
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
const CollapsibleSection_1 = __webpack_require__(/*! ./CollapsibleSection */ "./lib/config_builder/sections/CollapsibleSection.js");
class ProjectSection extends CollapsibleSection_1.CollapsibleSection {
    constructor() {
        super('Setup', 'project', true);
        this.browseRequested = new signaling_1.Signal(this);
        this.loadConfigRequested = new signaling_1.Signal(this);
        this.projectEnabledChanged = new signaling_1.Signal(this);
        this.fileStatesChanged = new signaling_1.Signal(this);
        this._nameInput = this._makeInput('e.g. Bird Review', '250px');
        this._nameInput.addEventListener('input', () => {
            this._updateDefaultPaths();
            this._emitChanged();
        });
        this._body.appendChild(this._makeFieldRow('project_name', this._nameInput));
        const sep = document.createElement('div');
        sep.style.cssText = `height:1px;background:${styles_1.COLORS.bgSurface1};margin:6px 0;`;
        this._body.appendChild(sep);
        const pathLabel = document.createElement('div');
        pathLabel.textContent = 'Configuration File Paths';
        pathLabel.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
        this._body.appendChild(pathLabel);
        const pathHint = document.createElement('div');
        pathHint.textContent =
            'Check which files to create. With all 3, project references config and config references form. ' +
                'Uncheck config to inline everything into project. Uncheck form to embed form_config as a dict in config. ' +
                'Only need one file? Uncheck the others and everything gets inlined.';
        pathHint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.4;margin-bottom:4px;`;
        this._body.appendChild(pathHint);
        const pRow = this._makeFileRow('project');
        this._projectCb = pRow.cb;
        this._projectPathInput = pRow.input;
        this._projectBrowseBtn = pRow.btn;
        this._projectLoadBtn = pRow.loadBtn;
        this._projectCb.addEventListener('change', () => {
            this.projectEnabledChanged.emit(this._projectCb.checked);
            this._emitFileStates();
        });
        this._body.appendChild(pRow.row);
        const cRow = this._makeFileRow('config');
        this._configCb = cRow.cb;
        this._configPathInput = cRow.input;
        this._configBrowseBtn = cRow.btn;
        this._configLoadBtn = cRow.loadBtn;
        this._configCb.addEventListener('change', () => this._emitFileStates());
        this._body.appendChild(cRow.row);
        const fRow = this._makeFileRow('form');
        this._formCb = fRow.cb;
        this._formPathInput = fRow.input;
        this._formBrowseBtn = fRow.btn;
        this._formLoadBtn = fRow.loadBtn;
        this._formCb.addEventListener('change', () => this._emitFileStates());
        this._body.appendChild(fRow.row);
        const outSep = document.createElement('div');
        outSep.style.cssText = `height:1px;background:${styles_1.COLORS.bgSurface1};margin:6px 0;`;
        this._body.appendChild(outSep);
        const outLabel = document.createElement('div');
        outLabel.textContent = 'Output';
        outLabel.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
        this._body.appendChild(outLabel);
        const outRow = this._makeRow();
        outRow.addEventListener('focusin', () => this.fieldFocused.emit('output path'));
        outRow.addEventListener('click', () => this.fieldFocused.emit('output path'));
        outRow.appendChild(this._makeLabel('path'));
        this._outputPathInput = this._makeInput('outputs/my_project.csv', '200px');
        this._outputPathInput.addEventListener('input', () => this._emitChanged());
        this._outputBrowseBtn = this._makeButton('Browse');
        this._outputBrowseBtn.addEventListener('click', () => {
            this.browseRequested.emit({ field: 'output_path', current: this._outputPathInput.value || '.' });
        });
        outRow.append(this._outputPathInput, this._outputBrowseBtn);
        this._body.appendChild(outRow);
        const descSep = document.createElement('div');
        descSep.style.cssText = `height:1px;background:${styles_1.COLORS.bgSurface1};margin:6px 0;`;
        this._body.appendChild(descSep);
        const descLabel = document.createElement('div');
        descLabel.textContent = 'Description Panel';
        descLabel.style.cssText = `color:${styles_1.COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
        this._body.appendChild(descLabel);
        this._descTitleInput = this._makeInput('', '200px');
        this._descTitleInput.placeholder = 'e.g. Instructions';
        this._descTitleInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('description title', this._descTitleInput));
        this._descTextArea = document.createElement('textarea');
        this._descTextArea.style.cssText =
            `background:${styles_1.COLORS.bgSurface0};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:4px;` +
                `color:${styles_1.COLORS.textPrimary};padding:4px 6px;font-size:12px;width:100%;min-height:60px;` +
                `box-sizing:border-box;resize:vertical;font-family:monospace;`;
        this._descTextArea.placeholder = 'Markdown text (or use path for a file)';
        this._descTextArea.addEventListener('keydown', (e) => e.stopPropagation());
        this._descTextArea.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('description text', this._descTextArea));
        this._descPathInput = this._makeInput('', '200px');
        this._descPathInput.placeholder = 'docs/instructions.md';
        this._descPathInput.addEventListener('input', () => this._emitChanged());
        const descPathRow = this._makeRow();
        descPathRow.addEventListener('focusin', () => this.fieldFocused.emit('description_path'));
        descPathRow.addEventListener('click', () => this.fieldFocused.emit('description_path'));
        descPathRow.appendChild(this._makeLabel('path'));
        const descPathBrowse = this._makeButton('Browse');
        descPathBrowse.addEventListener('click', () => {
            this.browseRequested.emit({ field: 'description_path', current: this._descPathInput.value || '.' });
        });
        descPathRow.append(this._descPathInput, descPathBrowse);
        this._body.appendChild(descPathRow);
        const { row: descOpenRow, input: descOpenCb } = this._makeCheckbox('description open');
        this._descOpenCb = descOpenCb;
        this._descOpenCb.checked = true;
        this._descOpenCb.addEventListener('change', () => this._emitChanged());
        this._body.appendChild(descOpenRow);
        this._descHeightInput = this._makeInput('', '60px');
        this._descHeightInput.type = 'number';
        this._descHeightInput.placeholder = 'auto';
        this._descHeightInput.addEventListener('input', () => this._emitChanged());
        this._body.appendChild(this._makeFieldRow('description height', this._descHeightInput));
    }
    _emitFileStates() {
        this.fileStatesChanged.emit({
            project: this._projectCb.checked,
            config: this._configCb.checked,
            form: this._formCb.checked,
        });
    }
    _makeFileRow(field) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.cssText = `accent-color:${styles_1.COLORS.blue};flex-shrink:0;`;
        const lbl = document.createElement('label');
        lbl.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;min-width:70px;`;
        const lblText = document.createElement('span');
        lblText.textContent = field;
        lblText.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:12px;font-weight:600;`;
        lbl.append(cb, lblText);
        const defaults = {
            project: 'projects/',
            config: 'config/',
            form: 'forms/',
        };
        const inp = this._makeInput(`${defaults[field]}my_project.yaml`, '180px');
        inp.addEventListener('input', () => this._emitChanged());
        const btn = this._makeButton('Browse');
        btn.addEventListener('click', () => {
            this.browseRequested.emit({ field, current: inp.value || '.' });
        });
        const loadBtn = this._makeButton('Load');
        loadBtn.addEventListener('click', () => {
            const p = inp.value.trim();
            if (p)
                this.loadConfigRequested.emit({ field, path: p });
        });
        cb.addEventListener('change', () => {
            const on = cb.checked;
            inp.disabled = !on;
            btn.disabled = !on;
            loadBtn.disabled = !on;
            inp.style.opacity = on ? '1' : '0.4';
            btn.style.opacity = on ? '1' : '0.4';
            loadBtn.style.opacity = on ? '1' : '0.4';
            this._emitChanged();
        });
        row.append(lbl, inp, btn, loadBtn);
        row.addEventListener('focusin', () => this.fieldFocused.emit(`${field} file`));
        return { row, cb, input: inp, btn, loadBtn };
    }
    _updateDefaultPaths() {
        const name = this._nameInput.value.trim();
        if (!name)
            return;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const update = (inp, defaultDir) => {
            if (!inp.value || inp.value.includes('/')) {
                const cur = inp.value;
                const dir = cur ? cur.replace(/[^/]+$/, '') : defaultDir;
                inp.value = `${dir}${slug}.yaml`;
            }
        };
        update(this._projectPathInput, 'annotator_config/projects/');
        update(this._configPathInput, 'annotator_config/config/');
        update(this._formPathInput, 'annotator_config/forms/');
        if (!this._outputPathInput.value || this._outputPathInput.value.includes('/')) {
            const cur = this._outputPathInput.value;
            const dir = cur ? cur.replace(/[^/]+$/, '') : 'outputs/';
            this._outputPathInput.value = `${dir}${slug}.csv`;
        }
    }
    setProjectPath(path) {
        this._projectPathInput.value = path;
        this._emitChanged();
    }
    setConfigPath(path) {
        this._configPathInput.value = path;
        this._emitChanged();
    }
    setFormPath(path) {
        this._formPathInput.value = path;
        this._emitChanged();
    }
    setCheckedStates(project, config, form) {
        this._projectCb.checked = project;
        this._projectPathInput.disabled = !project;
        this._projectBrowseBtn.disabled = !project;
        this._projectPathInput.style.opacity = project ? '1' : '0.4';
        this._projectBrowseBtn.style.opacity = project ? '1' : '0.4';
        this._configCb.checked = config;
        this._configPathInput.disabled = !config;
        this._configBrowseBtn.disabled = !config;
        this._configPathInput.style.opacity = config ? '1' : '0.4';
        this._configBrowseBtn.style.opacity = config ? '1' : '0.4';
        this._formCb.checked = form;
        this._formPathInput.disabled = !form;
        this._formBrowseBtn.disabled = !form;
        this._formPathInput.style.opacity = form ? '1' : '0.4';
        this._formBrowseBtn.style.opacity = form ? '1' : '0.4';
    }
    setOutputPath(path) {
        this._outputPathInput.value = path;
        this._emitChanged();
    }
    getOutputPath() {
        return this._outputPathInput.value;
    }
    setDescriptionPath(path) {
        this._descPathInput.value = path;
        this._emitChanged();
    }
    getData() {
        const result = {
            project_name: this._nameInput.value || undefined,
            project_enabled: this._projectCb.checked,
            config_enabled: this._configCb.checked,
            form_enabled: this._formCb.checked,
            project_path: this._projectCb.checked ? (this._projectPathInput.value || undefined) : undefined,
            config_path: this._configCb.checked ? (this._configPathInput.value || undefined) : undefined,
            form_path: this._formCb.checked ? (this._formPathInput.value || undefined) : undefined,
            output_path: this._outputPathInput.value || undefined,
        };
        const dh = parseInt(this._descHeightInput.value);
        if (!isNaN(dh) && dh > 0)
            result.description_height = dh;
        const descTitle = this._descTitleInput.value.trim();
        const descText = this._descTextArea.value;
        const descPath = this._descPathInput.value.trim();
        const descOpen = this._descOpenCb.checked;
        if (descTitle || descText || descPath) {
            const desc = {};
            if (descTitle)
                desc.title = descTitle;
            if (descText)
                desc.text = descText;
            if (descPath)
                desc.path = descPath;
            if (!descOpen)
                desc.open = false;
            result.description = desc;
        }
        return result;
    }
    setData(data) {
        var _a;
        if (data.project_name !== undefined)
            this._nameInput.value = data.project_name;
        if (data.project_path)
            this._projectPathInput.value = data.project_path;
        if (data.config_path)
            this._configPathInput.value = data.config_path;
        if (data.form_path)
            this._formPathInput.value = data.form_path;
        if (data.output_path)
            this._outputPathInput.value = data.output_path;
        else if ((_a = data.output) === null || _a === void 0 ? void 0 : _a.path)
            this._outputPathInput.value = data.output.path;
        if (data.description_height)
            this._descHeightInput.value = String(data.description_height);
        if (data.description) {
            const d = typeof data.description === 'object' ? data.description : {};
            if (d.title)
                this._descTitleInput.value = d.title;
            if (d.text)
                this._descTextArea.value = d.text;
            if (d.path)
                this._descPathInput.value = d.path;
            if (d.open === false)
                this._descOpenCb.checked = false;
        }
        if (data.description_title)
            this._descTitleInput.value = data.description_title;
        if (data.description_text)
            this._descTextArea.value = data.description_text;
        if (data.description_path)
            this._descPathInput.value = data.description_path;
        if (data.description_open === false)
            this._descOpenCb.checked = false;
        if (data.project_enabled !== undefined) {
            const on = !!data.project_enabled;
            this._projectCb.checked = on;
            this._projectPathInput.disabled = !on;
            this._projectBrowseBtn.disabled = !on;
            this._projectLoadBtn.disabled = !on;
            this._projectPathInput.style.opacity = on ? '1' : '0.4';
            this._projectBrowseBtn.style.opacity = on ? '1' : '0.4';
            this._projectLoadBtn.style.opacity = on ? '1' : '0.4';
        }
        if (data.config_enabled !== undefined) {
            const on = !!data.config_enabled;
            this._configCb.checked = on;
            this._configPathInput.disabled = !on;
            this._configBrowseBtn.disabled = !on;
            this._configLoadBtn.disabled = !on;
            this._configPathInput.style.opacity = on ? '1' : '0.4';
            this._configBrowseBtn.style.opacity = on ? '1' : '0.4';
            this._configLoadBtn.style.opacity = on ? '1' : '0.4';
        }
        if (data.form_enabled !== undefined) {
            const on = !!data.form_enabled;
            this._formCb.checked = on;
            this._formPathInput.disabled = !on;
            this._formBrowseBtn.disabled = !on;
            this._formLoadBtn.disabled = !on;
            this._formPathInput.style.opacity = on ? '1' : '0.4';
            this._formBrowseBtn.style.opacity = on ? '1' : '0.4';
            this._formLoadBtn.style.opacity = on ? '1' : '0.4';
        }
    }
}
exports.ProjectSection = ProjectSection;


/***/ },

/***/ "./lib/config_builder/sections/SecretsEditor.js"
/*!******************************************************!*\
  !*** ./lib/config_builder/sections/SecretsEditor.js ***!
  \******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SecretsEditor = void 0;
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const styles_1 = __webpack_require__(/*! ../../styles */ "./lib/styles.js");
class SecretsEditor {
    constructor(showOptOut = false) {
        this.changed = new signaling_1.Signal(this);
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
        hint.textContent = 'Each entry is {key, value}. Value: env:VAR, dialog, or literal.';
        hint.style.cssText = `color:${styles_1.COLORS.textSubtle};font-size:11px;line-height:1.3;`;
        this.element.appendChild(hint);
        this._listEl = document.createElement('div');
        this._listEl.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
        this.element.appendChild(this._listEl);
    }
    _rebuild() {
        this._listEl.innerHTML = '';
        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:4px;`;
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.placeholder = 'key (e.g. Authorization)';
            keyInput.value = entry.key;
            keyInput.style.cssText =
                `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
                    `font-size:11px;width:130px;box-sizing:border-box;`;
            keyInput.addEventListener('input', () => {
                this._entries[i].key = keyInput.value;
                this.changed.emit(void 0);
            });
            const valInput = document.createElement('input');
            valInput.type = 'text';
            valInput.placeholder = 'value (env:VAR / dialog / literal)';
            valInput.value = entry.value;
            valInput.style.cssText =
                `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};` +
                    `border-radius:4px;color:${styles_1.COLORS.textPrimary};padding:3px 6px;` +
                    `font-size:11px;width:170px;box-sizing:border-box;`;
            valInput.addEventListener('input', () => {
                this._entries[i].value = valInput.value;
                this.changed.emit(void 0);
            });
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
    getData() {
        if (this._showOptOut && this._optedOut)
            return false;
        const valid = this._entries.filter(e => e.key && e.value);
        if (valid.length === 0)
            return undefined;
        return valid.map(e => ({ key: e.key, value: e.value }));
    }
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
            this._optedOut = false;
            this._optOutCb.checked = false;
            this._listEl.style.display = 'flex';
            this._entries = [{ key: String(data.key || ''), value: String(data.value || '') }];
        }
        else {
            this._entries = [];
        }
        this._rebuild();
    }
}
exports.SecretsEditor = SecretsEditor;


/***/ },

/***/ "./lib/index.js"
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const plugin_1 = __webpack_require__(/*! ./plugin */ "./lib/plugin.js");
const config_builder_1 = __webpack_require__(/*! ./config_builder */ "./lib/config_builder/index.js");
exports["default"] = [plugin_1.bioacousticPlugin, config_builder_1.configBuilderPlugin];


/***/ },

/***/ "./lib/kernel.js"
/*!***********************!*\
  !*** ./lib/kernel.js ***!
  \***********************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.KernelBridge = exports.KernelError = void 0;
class KernelError extends Error {
    constructor(message, traceback) {
        super(message);
        this.name = 'KernelError';
        this.traceback = traceback;
    }
}
exports.KernelError = KernelError;
class KernelBridge {
    constructor(tracker, directKernel, cwd) {
        this._tracker = tracker;
        this._directKernel = directKernel !== null && directKernel !== void 0 ? directKernel : null;
        this.cwd = cwd;
    }
    _kernel() {
        var _a, _b, _c, _d, _e;
        return (_e = (_a = this._directKernel) !== null && _a !== void 0 ? _a : (_d = (_c = (_b = this._tracker) === null || _b === void 0 ? void 0 : _b.currentWidget) === null || _c === void 0 ? void 0 : _c.sessionContext.session) === null || _d === void 0 ? void 0 : _d.kernel) !== null && _e !== void 0 ? _e : null;
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
        let summary = '';
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
                summary = ((_f = (_e = msg.content) === null || _e === void 0 ? void 0 : _e.ename) !== null && _f !== void 0 ? _f : '') + ': ' + ((_h = (_g = msg.content) === null || _g === void 0 ? void 0 : _g.evalue) !== null && _h !== void 0 ? _h : '');
                err += summary + '\n' + tb.join('\n');
            }
        };
        await future.done;
        if (!out.trim() && err) {
            const e = new KernelError(summary || err.trim(), err.trim());
            throw e;
        }
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
const coreutils_1 = __webpack_require__(/*! @jupyterlab/coreutils */ "webpack/sharing/consume/default/@jupyterlab/coreutils");
const filebrowser_1 = __webpack_require__(/*! @jupyterlab/filebrowser */ "webpack/sharing/consume/default/@jupyterlab/filebrowser");
const launcher_1 = __webpack_require__(/*! @jupyterlab/launcher */ "webpack/sharing/consume/default/@jupyterlab/launcher");
const notebook_1 = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
const ui_components_1 = __webpack_require__(/*! @jupyterlab/ui-components */ "webpack/sharing/consume/default/@jupyterlab/ui-components");
const widgets_1 = __webpack_require__(/*! @lumino/widgets */ "webpack/sharing/consume/default/@lumino/widgets");
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
const kernel_1 = __webpack_require__(/*! ./kernel */ "./lib/kernel.js");
const python_1 = __webpack_require__(/*! ./python */ "./lib/python.js");
const FormPanel_1 = __webpack_require__(/*! ./sections/FormPanel */ "./lib/sections/FormPanel.js");
const Player_1 = __webpack_require__(/*! ./sections/Player */ "./lib/sections/Player.js");
const ClipTable_1 = __webpack_require__(/*! ./sections/ClipTable */ "./lib/sections/ClipTable.js");
const InfoCard_1 = __webpack_require__(/*! ./sections/InfoCard */ "./lib/sections/InfoCard.js");
const DescriptionPanel_1 = __webpack_require__(/*! ./sections/DescriptionPanel */ "./lib/sections/DescriptionPanel.js");
// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════
const DEFAULT_TITLE = 'Jupyter Bioacoustic';
const VALID_ANNOTATION_TOOLS = new Set([
    'time_select', 'start_end_time_select', 'bounding_box', 'multibox',
]);
let _counter = 0;
class BioacousticWidget extends widgets_1.Widget {
    constructor(tracker, directKernel) {
        super();
        // ── Config (from kernel vars) ────────────────────────────────
        this._identCol = '';
        this._displayCols = [];
        this._kernelBridge = new kernel_1.KernelBridge(directKernel ? null : tracker, directKernel);
        this._ownedKernel = directKernel !== null && directKernel !== void 0 ? directKernel : null;
        this.id = `jp-bioacoustic-${_counter++}`;
        this.title.label = DEFAULT_TITLE;
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
                `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;`;
        this._statusEl.textContent = 'Loading…';
        // ── Info toggle button ──────────────────────────────────────────
        this._infoToggle = document.createElement('button');
        this._infoToggle.innerHTML = `&#9432;`;
        this._infoToggle.style.cssText =
            `background:none;border:none;cursor:pointer;padding:2px;` +
                `flex-shrink:0;transition:all 0.15s;font-size:14px;color:${styles_1.COLORS.textSubtle};`;
        this._infoToggle.title = 'Toggle configuration info';
        this._infoToggle.onclick = () => this._toggleInfoPanel();
        // Hover effect
        this._infoToggle.onmouseenter = () => {
            this._infoToggle.style.backgroundColor = styles_1.COLORS.bgHover;
        };
        this._infoToggle.onmouseleave = () => {
            this._infoToggle.style.backgroundColor = 'transparent';
        };
        header.append(this._titleEl, this._statusEl, this._infoToggle);
        // ── Info panel ──────────────────────────────────────────────────
        this._infoPanel = document.createElement('div');
        this._infoPanel.style.cssText =
            `display:none;background:${styles_1.COLORS.bgSurface0};border-bottom:1px solid ${styles_1.COLORS.bgSurface1};` +
                `padding:12px 16px;font-size:11px;line-height:1.4;`;
        this._infoPanel.innerHTML = `<div style="color:${styles_1.COLORS.textSubtle};">Loading configuration info...</div>`;
        // ── Clip table (filter + table + pagination) ──────────────────
        // ── Sections ──────────────────────────────────────────────────
        this._description = new DescriptionPanel_1.DescriptionPanel();
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
        this._form.syncRequested.connect(() => void this._onSync());
        this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));
        // Wire Player signals
        this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error, s.warning));
        // ── Assemble widget ──────────────────────────────────────────
        this.node.append(header, this._infoPanel, this._description.element, this._table.element, this._infoCard.element, this._player.element, this._form.element);
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
        const configErrors = _validateFormConfig(formConfig);
        if (configErrors.length > 0) {
            this._setStatus('❌ Config validation failed', true);
            await (0, util_1.showDialog)({
                title: 'Config Validation Failed',
                body: '• ' + configErrors.join('\n• '),
            });
            return;
        }
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
        if (cfg.description) {
            try {
                const descCfg = JSON.parse(cfg.description);
                const descHeight = parseInt(cfg.description_height) || undefined;
                this._description.setConfig(descCfg, descHeight);
            }
            catch ( /* no description */_f) { /* no description */ }
        }
        // Initialize form panel
        const syncConfig = JSON.parse(cfg.sync_config || '{}');
        this._form.setContext({
            formConfig,
            rows,
            identCol: this._identCol,
            duplicateEntries,
            outputPath,
            syncConfig,
            height: parseInt(cfg.form_panel_height) || undefined,
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
            captureHeight: parseInt(cfg.capture_height) || undefined,
            identCol: this._identCol,
            displayCols: this._displayCols,
            defaultBuffer: parseFloat(cfg.default_buffer) || 3,
            specResolutions,
            vizMeta,
            rows,
            height: parseInt(cfg.player_height) || undefined,
        });
        // Initialize table
        this._table.setData({
            rows,
            identCol: this._identCol,
            displayCols: this._displayCols,
            dataCols,
            duplicateEntries,
            height: parseInt(cfg.clip_table_height) || undefined,
        });
        this._infoCard.setHeight(parseInt(cfg.info_card_height) || undefined);
        // Auto-select first row
        if (this._table.filtered.length > 0) {
            this._selectRow(0);
            await this._player.loadRow(this._table.filtered[0]);
        }
        this._setStatus(`✓ ${rows.length} clips loaded`);
        const mergedConfig = cfg.merged_config ? JSON.parse(cfg.merged_config) : {};
        this._populateInfoPanel(cfg, audioConfig, outputPath, syncConfig, mergedConfig);
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
    // ─── Sync ──────────────────────────────────────────────────
    async _onSync() {
        var _a;
        this._setStatus('Syncing…');
        try {
            await this._kernelBridge.exec((0, python_1.syncOutput)());
            this._setStatus('✓ Sync complete');
            this._form._resetSyncBtnLabel();
        }
        catch (e) {
            this._setStatus(`❌ Sync failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, true);
            this._form._enableSyncBtn();
        }
    }
    // ─── Capture ─────────────────────────────────────────────────
    // ─── Kernel helpers ──────────────────────────────────────────
    // ─── Info Panel ──────────────────────────────────────────────
    _toggleInfoPanel() {
        const isVisible = this._infoPanel.style.display !== 'none';
        if (isVisible) {
            this._infoPanel.style.display = 'none';
            // Closed state: outline info icon
            this._infoToggle.innerHTML = `&#9432;`;
            this._infoToggle.style.color = styles_1.COLORS.textSubtle;
        }
        else {
            this._infoPanel.style.display = 'block';
            // Open state: white filled circle with black i
            this._infoToggle.innerHTML = `<span style="
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
            this._infoToggle.style.color = styles_1.COLORS.blue;
        }
    }
    _populateInfoPanel(cfg, audioConfig, outputPath, syncConfig, mergedConfig) {
        const formatPath = (path, type) => {
            if (!path)
                return `<span style="color:${styles_1.COLORS.textSubtle};">Not specified</span>`;
            if (path.startsWith('http://') || path.startsWith('https://')) {
                return `<span style="color:${styles_1.COLORS.blue};">(url)</span> ${path}`;
            }
            if (path.startsWith('s3://') || path.startsWith('gs://')) {
                return `<span style="color:${styles_1.COLORS.blue};">(${path.startsWith('s3://') ? 's3' : 'gcs'})</span> ${path}`;
            }
            return `<span style="color:${styles_1.COLORS.blue};">(${type})</span> ${path}`;
        };
        const mcData = mergedConfig.data;
        const dataInfo = cfg.data ? JSON.parse(cfg.data) : [];
        const rowCount = Array.isArray(dataInfo) ? dataInfo.length : 0;
        let dataSourceText;
        if (typeof mcData === 'object' && mcData !== null) {
            const srcKey = ['path', 'url', 'uri', 'sql', 'api'].find(k => k in mcData);
            const src = srcKey ? String(mcData[srcKey]) : '';
            dataSourceText = src
                ? `${formatPath(src, srcKey)} — ${rowCount} rows`
                : `<span style="color:${styles_1.COLORS.blue};">(kernel)</span> ${rowCount} rows loaded`;
        }
        else if (typeof mcData === 'string') {
            dataSourceText = `${formatPath(mcData, 'path')} — ${rowCount} rows`;
        }
        else {
            dataSourceText = `<span style="color:${styles_1.COLORS.blue};">(kernel)</span> ${rowCount} rows loaded`;
        }
        let audioSourceText = '';
        if (audioConfig.type === 'column') {
            audioSourceText = `<span style="color:${styles_1.COLORS.blue};">(column)</span> ${audioConfig.value}`;
        }
        else if (audioConfig.type && audioConfig.value) {
            audioSourceText = formatPath(audioConfig.value, audioConfig.type);
        }
        else {
            audioSourceText = `<span style="color:${styles_1.COLORS.textSubtle};">Unknown audio source</span>`;
        }
        const mcOutput = mergedConfig.output;
        let outputText;
        if (typeof mcOutput === 'object' && mcOutput !== null) {
            outputText = formatPath(mcOutput.path || outputPath, 'local');
            const syncUri = mcOutput.uri || mcOutput.url || (syncConfig && syncConfig.uri) || '';
            if (syncUri) {
                outputText += `<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:${styles_1.COLORS.blue};">(sync)</span> ${syncUri}`;
            }
        }
        else {
            outputText = formatPath(outputPath, 'local');
            if (syncConfig && syncConfig.uri) {
                outputText += `<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:${styles_1.COLORS.blue};">(sync)</span> ${syncConfig.uri}`;
            }
        }
        // Configuration file paths
        let configText = '';
        if (cfg.project_path) {
            configText += `<div style="margin-bottom:4px;">• <strong>project:</strong> ${formatPath(cfg.project_path, 'file')}</div>`;
        }
        if (cfg.config_path) {
            configText += `<div style="margin-bottom:4px;">• <strong>config:</strong> ${formatPath(cfg.config_path, 'file')}</div>`;
        }
        if (cfg.form_path) {
            configText += `<div style="margin-bottom:4px;">• <strong>form:</strong> ${formatPath(cfg.form_path, 'file')}</div>`;
        }
        if (!configText) {
            configText = `<div style="color:${styles_1.COLORS.textSubtle};">No configuration files loaded</div>`;
        }
        this._infoPanel.innerHTML = `
      <div style="font-family:monospace;">
        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Data Sources & Output</div>
        <div style="margin-bottom:4px;">• <strong>data:</strong> ${dataSourceText}</div>
        <div style="margin-bottom:4px;">• <strong>audio:</strong> ${audioSourceText}</div>
        <div style="margin-bottom:12px;">• <strong>output:</strong><br>&nbsp;&nbsp;&nbsp;&nbsp;${outputText}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Configuration Files</div>
        <div style="margin-bottom:12px;">${configText}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${styles_1.COLORS.textPrimary};">Documentation</div>
        <div style="margin-bottom:4px;">• <strong>site:</strong> <a href="https://schmidtdse.github.io/jupyter_bioacoustic" target="_blank" style="color:${styles_1.COLORS.blue};">schmidtdse.github.io/jupyter_bioacoustic</a></div>
        <div>• <strong>docs:</strong> <a href="https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki" target="_blank" style="color:${styles_1.COLORS.blue};">github.com/SchmidtDSE/jupyter_bioacoustic/wiki</a></div>
      </div>
    `;
    }
    // ─── Utilities ───────────────────────────────────────────────
    _setStatus(msg, error = false, warning = false) {
        this._statusEl.textContent = msg;
        this._statusEl.style.color = error ? styles_1.COLORS.red : warning ? styles_1.COLORS.yellow : styles_1.COLORS.green;
    }
}
// ═══════════════════════════════════════════════════════════════
// Plugin registration
// ═══════════════════════════════════════════════════════════════
function _validateFormConfig(fc) {
    if (!fc || typeof fc !== 'object')
        return [];
    const errors = [];
    const checkAnnotTools = (annot) => {
        if (!annot || typeof annot !== 'object')
            return;
        let tools = [];
        if (typeof annot.tools === 'string')
            tools = [annot.tools];
        else if (Array.isArray(annot.tools))
            tools = annot.tools;
        for (const t of tools) {
            if (typeof t === 'string' && !VALID_ANNOTATION_TOOLS.has(t)) {
                errors.push(`Unknown annotation tool "${t}". ` +
                    `Valid tools: ${[...VALID_ANNOTATION_TOOLS].sort().join(', ')}`);
            }
        }
    };
    if (fc.annotation)
        checkAnnotTools(fc.annotation);
    if (Array.isArray(fc.form)) {
        for (const el of fc.form) {
            if (el && typeof el === 'object' && el.annotation) {
                checkAnnotTools(el.annotation);
            }
        }
    }
    return errors;
}
function escPy(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
async function getOptimalProjectPath(browser, currentPath) {
    if (!browser)
        return currentPath;
    const manager = browser.model.manager;
    // Helper function to check if a directory exists
    const dirExists = async (path) => {
        try {
            const contents = await manager.services.contents.get(path);
            return contents.type === 'directory';
        }
        catch (_a) {
            return false;
        }
    };
    // Check for annotator_config/projects in current directory first
    const localProjectsPath = currentPath ? `${currentPath}/annotator_config/projects` : 'annotator_config/projects';
    if (await dirExists(localProjectsPath)) {
        return localProjectsPath;
    }
    // Check for annotator_config in current directory
    const localConfigPath = currentPath ? `${currentPath}/annotator_config` : 'annotator_config';
    if (await dirExists(localConfigPath)) {
        return localConfigPath;
    }
    // Fallback to workspace root annotator_config/projects
    if (await dirExists('annotator_config/projects')) {
        return 'annotator_config/projects';
    }
    // Fallback to workspace root annotator_config
    if (await dirExists('annotator_config')) {
        return 'annotator_config';
    }
    // Use current directory as final fallback
    return currentPath;
}
async function pickProjectFile(browser, defaultPath) {
    var _a;
    if (browser) {
        // Get optimal starting path based on annotator_config directory structure
        const optimalPath = await getOptimalProjectPath(browser, defaultPath);
        return showProjectFileDialog(browser, optimalPath, defaultPath);
    }
    const path = window.prompt('Project file path (.yaml)');
    return (_a = path === null || path === void 0 ? void 0 : path.trim()) !== null && _a !== void 0 ? _a : '';
}
async function showProjectFileDialog(browser, initialPath, cwdPath) {
    // Create a custom dialog with file browser + text input
    const dialog = document.createElement('div');
    dialog.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: white; border: 1px solid #ccc; border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000;
    width: 600px; max-height: 500px; display: flex; flex-direction: column;
    font-family: var(--jp-ui-font-family);
  `;
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
    font-weight: 600; font-size: 16px;
  `;
    header.textContent = 'Select Bioacoustic Project';
    // Path input section
    const inputSection = document.createElement('div');
    inputSection.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  `;
    const inputLabel = document.createElement('div');
    inputLabel.style.cssText = `
    margin-bottom: 8px; font-size: 13px; font-weight: 500; color: #333;
  `;
    inputLabel.textContent = 'Project file path (local, s3://, gs://, or https://):';
    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml';
    pathInput.style.cssText = `
    width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px;
    font-size: 13px; font-family: monospace; box-sizing: border-box;
  `;
    inputSection.appendChild(inputLabel);
    inputSection.appendChild(pathInput);
    // File browser section
    const browserSection = document.createElement('div');
    browserSection.style.cssText = `
    flex: 1; overflow: hidden; display: flex; flex-direction: column;
    min-height: 200px;
  `;
    const browserLabel = document.createElement('div');
    browserLabel.style.cssText = `
    padding: 12px 20px; font-size: 13px; font-weight: 500; color: #555;
    border-bottom: 1px solid #f0f0f0;
  `;
    browserLabel.textContent = 'Or browse files:';
    const browserContainer = document.createElement('div');
    browserContainer.style.cssText = `
    flex: 1; overflow: auto; padding: 16px 20px;
  `;
    browserSection.appendChild(browserLabel);
    browserSection.appendChild(browserContainer);
    // Buttons
    const buttonSection = document.createElement('div');
    buttonSection.style.cssText = `
    padding: 16px 20px; border-top: 1px solid #e0e0e0;
    display: flex; justify-content: flex-end; gap: 12px;
  `;
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
    padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  `;
    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Select';
    selectBtn.style.cssText = `
    padding: 8px 16px; border: none; background: #2196F3; color: white; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  `;
    buttonSection.appendChild(cancelBtn);
    buttonSection.appendChild(selectBtn);
    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(inputSection);
    dialog.appendChild(browserSection);
    dialog.appendChild(buttonSection);
    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 9999;
  `;
    document.body.appendChild(overlay);
    overlay.appendChild(dialog);
    // State tracking
    let selectedFile = '';
    let selectedFromBrowser = false;
    let currentBrowserPath = initialPath;
    pathInput.addEventListener('input', () => { selectedFromBrowser = false; });
    // Update path input based on current browser directory and handle remote URIs
    const updatePathContext = () => {
        const currentValue = pathInput.value.trim();
        const isRemoteUri = currentValue.startsWith('s3://') ||
            currentValue.startsWith('gs://') ||
            currentValue.startsWith('http://') ||
            currentValue.startsWith('https://');
        if (isRemoteUri) {
            // Disable and grey out file browser for remote URIs
            browserSection.style.opacity = '0.4';
            browserSection.style.pointerEvents = 'none';
            browserLabel.textContent = 'File browser (disabled for remote URIs)';
            browserLabel.style.color = '#999';
            pathInput.placeholder = 'Remote URI detected - file browser disabled';
        }
        else {
            // Enable file browser for local paths
            browserSection.style.opacity = '1';
            browserSection.style.pointerEvents = 'auto';
            browserLabel.textContent = 'Or browse files:';
            browserLabel.style.color = '#555';
            if (currentValue && !currentValue.startsWith('/')) {
                // If user typed a relative path, combine with current browser path
                pathInput.placeholder = `Current dir: ${currentBrowserPath}/`;
            }
            else {
                pathInput.placeholder = 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml';
            }
        }
    };
    // Simulate file browser (simplified version)
    const loadFileBrowser = async (path) => {
        browserContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Loading...</div>';
        try {
            const contents = await browser.model.manager.services.contents.get(path);
            browserContainer.innerHTML = '';
            // Add parent directory link if not at server root
            if (path !== '') {
                const parentDir = path.split('/').slice(0, -1).join('/') || '';
                const parentItem = document.createElement('div');
                parentItem.style.cssText = `
          padding: 6px 0; cursor: pointer; color: #2196F3;
          border-bottom: 1px solid #f0f0f0;
        `;
                parentItem.innerHTML = '📁 ..';
                parentItem.onclick = () => {
                    currentBrowserPath = parentDir;
                    loadFileBrowser(parentDir);
                    updatePathContext();
                };
                browserContainer.appendChild(parentItem);
            }
            if (contents.content) {
                for (const item of contents.content) {
                    const itemEl = document.createElement('div');
                    itemEl.style.cssText = `
            padding: 6px 0; cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
          `;
                    if (item.type === 'directory') {
                        itemEl.innerHTML = `📁 ${item.name}`;
                        itemEl.onclick = () => {
                            currentBrowserPath = item.path;
                            loadFileBrowser(item.path);
                            updatePathContext();
                        };
                    }
                    else if (item.name.toLowerCase().match(/\.(yaml|yml|json)$/)) {
                        itemEl.innerHTML = `📄 ${item.name}`;
                        const selectFile = () => {
                            selectedFile = item.path;
                            selectedFromBrowser = true;
                            const displayPath = cwdPath && item.path.startsWith(cwdPath + '/')
                                ? item.path.substring(cwdPath.length + 1)
                                : item.path;
                            pathInput.value = displayPath;
                        };
                        itemEl.onclick = selectFile;
                        itemEl.ondblclick = () => {
                            selectFile();
                            selectBtn.click();
                        };
                        itemEl.onmouseover = () => itemEl.style.backgroundColor = '#f0f0f0';
                        itemEl.onmouseout = () => itemEl.style.backgroundColor = 'transparent';
                    }
                    else {
                        itemEl.innerHTML = `📄 ${item.name}`;
                        itemEl.style.color = '#ccc';
                    }
                    browserContainer.appendChild(itemEl);
                }
            }
        }
        catch (error) {
            browserContainer.innerHTML = `<div style="color: #f44336; padding: 20px;">Error loading directory: ${error}</div>`;
        }
    };
    // Load initial browser
    loadFileBrowser(initialPath);
    updatePathContext();
    // Input handling
    pathInput.addEventListener('input', updatePathContext);
    // Promise-based dialog
    return new Promise((resolve) => {
        let onKeydown = null;
        const cleanup = () => {
            if (onKeydown)
                document.removeEventListener('keydown', onKeydown);
            document.body.removeChild(overlay);
        };
        cancelBtn.onclick = () => {
            cleanup();
            resolve('');
        };
        selectBtn.onclick = () => {
            let finalPath = pathInput.value.trim();
            if (!finalPath) {
                alert('Please enter a file path or select a file.');
                return;
            }
            // Handle relative paths — only prepend currentBrowserPath for manually typed paths,
            // not for paths set by clicking a file in the browser (those are already full paths)
            if (!selectedFromBrowser && finalPath && !finalPath.includes('://') && !finalPath.startsWith('/') && currentBrowserPath) {
                finalPath = `${currentBrowserPath}/${finalPath}`.replace(/\/+/g, '/');
            }
            cleanup();
            resolve(finalPath);
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve('');
            }
        };
        onKeydown = (e) => {
            if (e.key === 'Enter' && pathInput.value.trim()) {
                selectBtn.click();
            }
            else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        };
        document.addEventListener('keydown', onKeydown);
        // Focus the input
        pathInput.focus();
    });
}
function createLoadingWidget() {
    const w = new widgets_1.Widget();
    w.id = `jp-bioacoustic-loading-${_counter++}`;
    w.title.label = 'Bioacoustic Annotator';
    w.title.closable = true;
    w.title.icon = bioacousticIcon;
    w.node.style.cssText =
        `display:flex;align-items:center;justify-content:center;` +
            `width:100%;height:100%;background:${styles_1.COLORS.bgBase};`;
    const wrap = document.createElement('div');
    wrap.style.cssText = `text-align:center;`;
    const label = document.createElement('div');
    label.textContent = 'Loading\u2026';
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
    if (!document.getElementById('jba-fill-style')) {
        const style = document.createElement('style');
        style.id = 'jba-fill-style';
        style.textContent = '@keyframes jba-fill{to{width:100%}}';
        document.head.appendChild(style);
    }
    track.appendChild(bar);
    wrap.appendChild(label);
    wrap.appendChild(track);
    w.node.appendChild(wrap);
    return w;
}
async function startKernel(app) {
    try {
        const kernel = await app.serviceManager.kernels.startNew({ name: 'python3' });
        return kernel;
    }
    catch (e) {
        console.error('bioacoustic: failed to start kernel', e);
        return null;
    }
}
function getExistingKernel(tracker) {
    var _a, _b, _c, _d;
    return (_d = (_c = (_b = (_a = tracker.currentWidget) === null || _a === void 0 ? void 0 : _a.sessionContext) === null || _b === void 0 ? void 0 : _b.session) === null || _c === void 0 ? void 0 : _c.kernel) !== null && _d !== void 0 ? _d : null;
}
async function execInKernel(kernel, code) {
    const future = kernel.requestExecute({ code });
    let error = '';
    future.onIOPub = (msg) => {
        var _a;
        if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.msg_type) === 'error') {
            error = msg.content.evalue || (msg.content.traceback || []).join('\n') || 'Unknown error';
        }
    };
    await future.done;
    return error;
}
const bioacousticIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 12 C2 12 4 6 6 6 C8 6 8 18 10 18 C12 18 12 3 14 3 C16 3 16 21 18 21 C20 21 22 12 22 12"/>
  <circle cx="12" cy="12" r="11" stroke-width="1"/>
</svg>`;
const bioacousticIcon = new ui_components_1.LabIcon({
    name: 'jupyter-bioacoustic:icon',
    svgstr: bioacousticIconSvg,
});
exports.bioacousticPlugin = {
    id: 'jupyter-bioacoustic:plugin',
    autoStart: true,
    requires: [apputils_1.ICommandPalette, notebook_1.INotebookTracker],
    optional: [launcher_1.ILauncher, filebrowser_1.IDefaultFileBrowser],
    activate: (app, palette, tracker, launcher, defaultBrowser) => {
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
        app.commands.addCommand('bioacoustic:open-project', {
            label: 'Bioacoustic Annotator',
            icon: bioacousticIcon,
            execute: async () => {
                var _a, _b;
                const browserPath = (_a = defaultBrowser === null || defaultBrowser === void 0 ? void 0 : defaultBrowser.model.path) !== null && _a !== void 0 ? _a : '';
                const projectPath = await pickProjectFile(defaultBrowser, browserPath);
                if (!projectPath)
                    return;
                const placeholder = createLoadingWidget();
                app.shell.add(placeholder, 'main');
                app.shell.activateById(placeholder.id);
                const kernel = (_b = getExistingKernel(tracker)) !== null && _b !== void 0 ? _b : await startKernel(app);
                if (!kernel) {
                    placeholder.dispose();
                    void (0, util_1.showDialog)({ title: 'Error', body: 'Failed to start a Python kernel.' });
                    return;
                }
                const ownsKernel = !getExistingKernel(tracker);
                const serverRoot = coreutils_1.PageConfig.getOption('serverRoot');
                const workDir = browserPath
                    ? serverRoot + '/' + browserPath
                    : serverRoot;
                const relPath = browserPath && projectPath.startsWith(browserPath + '/')
                    ? projectPath.substring(browserPath.length + 1)
                    : projectPath;
                const error = await execInKernel(kernel, [
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
                ].join('\n'));
                placeholder.dispose();
                if (error) {
                    if (ownsKernel)
                        kernel.shutdown().catch(() => { });
                    void (0, util_1.showDialog)({ title: 'Annotator Error', body: error });
                    return;
                }
                const widget = new BioacousticWidget(tracker, ownsKernel ? kernel : undefined);
                app.shell.add(widget, 'main');
                app.shell.activateById(widget.id);
            }
        });
        app.commands.addCommand('bioacoustic:launcher-dialog', {
            label: 'Bioacoustic Annotator',
            icon: bioacousticIcon,
            execute: () => {
                var _a;
                const browserPath = (_a = defaultBrowser === null || defaultBrowser === void 0 ? void 0 : defaultBrowser.model.path) !== null && _a !== void 0 ? _a : '';
                const serverRoot = coreutils_1.PageConfig.getOption('serverRoot');
                const cwd = browserPath
                    ? `${serverRoot}/${browserPath}`
                    : serverRoot;
                showLauncherDialog(() => app.commands.execute('bioacoustic:open-project'), () => app.commands.execute('bioacoustic:open-config-builder'), async () => {
                    var _a;
                    const kernel = (_a = getExistingKernel(tracker)) !== null && _a !== void 0 ? _a : await startKernel(app);
                    if (!kernel) {
                        void (0, util_1.showDialog)({ title: 'Error', body: 'Failed to start Python kernel.' });
                        return;
                    }
                    const ownsKernel = !getExistingKernel(tracker);
                    const code = [
                        `import os as _os; _os.chdir(_os.path.expanduser('${escPy(cwd)}'))`,
                        `from jupyter_bioacoustic.config_builder.notebook import copy_starter_notebook`,
                        `import json; print(json.dumps(copy_starter_notebook('.')))`,
                    ].join('\n');
                    const future = kernel.requestExecute({ code });
                    let result = '';
                    future.onIOPub = (msg) => {
                        var _a, _b, _c;
                        if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.msg_type) === 'stream' && ((_b = msg.content) === null || _b === void 0 ? void 0 : _b.name) === 'stdout') {
                            result += msg.content.text;
                        }
                        if (((_c = msg.header) === null || _c === void 0 ? void 0 : _c.msg_type) === 'error') {
                            result = '';
                        }
                    };
                    await future.done;
                    if (ownsKernel)
                        kernel.shutdown().catch(() => { });
                    if (result.trim()) {
                        try {
                            const parsed = JSON.parse(result.trim());
                            const rel = parsed.relative || parsed.path;
                            const nbPath = browserPath ? `${browserPath}/${rel}` : rel;
                            app.commands.execute('docmanager:open', { path: nbPath });
                        }
                        catch ( /* ignore parse errors */_b) { /* ignore parse errors */ }
                    }
                    if (defaultBrowser) {
                        defaultBrowser.model.refresh();
                    }
                });
            }
        });
        palette.addItem({ command: 'bioacoustic:open', category: 'Bioacoustic' });
        palette.addItem({ command: 'bioacoustic:open-project', category: 'Bioacoustic' });
        palette.addItem({ command: 'bioacoustic:launcher-dialog', category: 'Bioacoustic' });
        if (launcher) {
            launcher.add({
                command: 'bioacoustic:launcher-dialog',
                category: 'Other',
            });
        }
        console.log('jupyter-bioacoustic activated');
    }
};
function showLauncherDialog(onAnnotator, onConfigBuilder, onNotebook) {
    const overlay = document.createElement('div');
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;` +
            `background:rgba(0,0,0,0.55);`;
    const dialog = document.createElement('div');
    dialog.style.cssText =
        `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:12px;` +
            `padding:24px 28px;display:flex;flex-direction:column;gap:16px;min-width:340px;` +
            `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);`;
    const title = document.createElement('div');
    title.textContent = 'Bioacoustic Annotator';
    title.style.cssText =
        `font-size:20px;font-weight:700;color:${styles_1.COLORS.textPrimary};text-align:center;`;
    dialog.appendChild(title);
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Choose an option to get started';
    subtitle.style.cssText =
        `font-size:14px;color:${styles_1.COLORS.textMuted};text-align:center;margin-top:-8px;`;
    dialog.appendChild(subtitle);
    const tileRow = document.createElement('div');
    tileRow.style.cssText = `display:flex;gap:12px;justify-content:center;`;
    const tiles = [];
    let focusedIdx = 0;
    const setFocused = (idx) => {
        focusedIdx = idx;
        for (let i = 0; i < tiles.length; i++) {
            tiles[i].style.borderColor = i === idx ? styles_1.COLORS.blue : styles_1.COLORS.bgSurface1;
        }
    };
    const makeTile = (label, desc, iconSvg, onClick) => {
        var _a, _b;
        const tile = document.createElement('button');
        tile.style.cssText =
            `background:${styles_1.COLORS.bgMantle};border:2px solid ${styles_1.COLORS.bgSurface1};border-radius:8px;` +
                `padding:16px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;` +
                `cursor:pointer;flex:1;min-width:130px;transition:border-color 0.15s;outline:none;`;
        tile.addEventListener('mouseenter', () => setFocused(tiles.indexOf(tile)));
        tile.addEventListener('mouseleave', () => setFocused(focusedIdx));
        const icon = document.createElement('div');
        icon.innerHTML = iconSvg;
        icon.style.cssText = `width:40px;height:40px;color:${styles_1.COLORS.blue};`;
        (_a = icon.querySelector('svg')) === null || _a === void 0 ? void 0 : _a.setAttribute('width', '40');
        (_b = icon.querySelector('svg')) === null || _b === void 0 ? void 0 : _b.setAttribute('height', '40');
        const lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.style.cssText = `font-size:15px;font-weight:600;color:${styles_1.COLORS.textPrimary};`;
        const d = document.createElement('div');
        d.textContent = desc;
        d.style.cssText = `font-size:12px;color:${styles_1.COLORS.textMuted};text-align:center;line-height:1.4;`;
        tile.append(icon, lbl, d);
        tile.addEventListener('click', () => {
            overlay.remove();
            onClick();
        });
        tiles.push(tile);
        return tile;
    };
    const notebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16v16H4z"/>
    <path d="M8 4v16"/>
    <line x1="12" y1="8" x2="18" y2="8"/>
    <line x1="12" y1="12" x2="18" y2="12"/>
    <line x1="12" y1="16" x2="16" y2="16"/>
  </svg>`;
    tileRow.appendChild(makeTile('Notebook', 'Start with a pre-configured Jupyter notebook', notebookSvg, onNotebook));
    tileRow.appendChild(makeTile('Annotator', 'Open a project file to review and annotate clips', bioacousticIconSvg, onAnnotator));
    const builderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>`;
    tileRow.appendChild(makeTile('Config Builder', 'Create or edit configuration files with a GUI', builderSvg, onConfigBuilder));
    dialog.appendChild(tileRow);
    setFocused(0);
    overlay.addEventListener('keydown', (e) => {
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
        else if (e.key === 'Escape') {
            overlay.remove();
        }
    });
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            overlay.remove();
    });
    overlay.tabIndex = -1;
    document.body.appendChild(overlay);
    overlay.focus();
}
exports["default"] = exports.bioacousticPlugin;


/***/ },

/***/ "./lib/python.js"
/*!***********************!*\
  !*** ./lib/python.js ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.checkFileExists = exports.saveProject = exports.getDefaultProjectPath = exports.syncOutput = exports.INVALIDATE_OUTPUT_CACHE = exports.savePng = exports.deleteOutputRow = exports.writeOutputRow = exports.readOutputRows = exports.countOutputRows = exports.loadSelectItems = exports.spectrogramPipeline = exports.buildSpectrogram = exports.readAudio = exports.readKernelVars = void 0;
const util_1 = __webpack_require__(/*! ./util */ "./lib/util.js");
//
// Constants
//
const HELPERS = 'from jupyter_bioacoustic._kernel_helpers import';
const DEFAULT_SPEC_WIDTH = 2000;
//
// Kernel variable reading (plugin.ts _init)
//
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
        `  'capture_height': _BA_CAPTURE_HEIGHT,`,
        `  'duplicate_entries': _BA_DUPLICATE_ENTRIES,`,
        `  'default_buffer': _BA_DEFAULT_BUFFER,`,
        `  'spec_resolutions': _BA_SPEC_RESOLUTIONS,`,
        `  'viz_meta': _BA_VIZ_META,`,
        `  'sync_config': _BA_SYNC_CONFIG,`,
        `  'clip_table_height': _BA_CLIP_TABLE_HEIGHT,`,
        `  'player_height': _BA_PLAYER_HEIGHT,`,
        `  'info_card_height': _BA_INFO_CARD_HEIGHT,`,
        `  'form_panel_height': _BA_FORM_PANEL_HEIGHT,`,
        `  'project_save_btn': _BA_PROJECT_SAVE_BTN,`,
        `  'description': _BA_DESCRIPTION,`,
        `  'description_height': _BA_DESCRIPTION_HEIGHT,`,
        `  'project_path': _BA_PROJECT_PATH,`,
        `  'config_path': _BA_CONFIG_PATH,`,
        `  'form_path': _BA_FORM_PATH,`,
        `  'merged_config': _BA_MERGED_CONFIG,`,
        `}))`,
    ].join('\n');
}
exports.readKernelVars = readKernelVars;
//
// Spectrogram + WAV generation (Player)
//
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
function buildSpectrogram(spectType, resolutionW, resolutionH) {
    const w = resolutionW !== null && resolutionW !== void 0 ? resolutionW : DEFAULT_SPEC_WIDTH;
    const h = resolutionH ? `, height=${resolutionH}` : '';
    return [
        `${HELPERS} build_spectrogram as _build_spec`,
        `print(_build_spec(_raw, _sr, spec_type='${spectType}', width=${w}${h}))`,
    ].join('\n');
}
exports.buildSpectrogram = buildSpectrogram;
function spectrogramPipeline(path, startSec, durSec, vizType, builtinKey, vizIndex, resolutionW, resolutionH) {
    const readCode = readAudio(path, startSec, durSec);
    if (vizType === 'custom' && vizIndex != null) {
        return readCode + '\n' + _customVizCode(vizIndex, resolutionW !== null && resolutionW !== void 0 ? resolutionW : DEFAULT_SPEC_WIDTH, resolutionH);
    }
    const spectType = builtinKey === 'mel' ? 'mel' : 'linear';
    return readCode + '\n' + buildSpectrogram(spectType, resolutionW, resolutionH);
}
exports.spectrogramPipeline = spectrogramPipeline;
//
// Select items loading (FormPanel)
//
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
//
// Output file operations (FormPanel)
//
function countOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    return [
        `${HELPERS} count_output_rows as _count`,
        `print(_count('${p}', '${ext}'))`,
    ].join('\n');
}
exports.countOutputRows = countOutputRows;
function readOutputRows(path, ext) {
    const p = (0, util_1.escPy)(path);
    return [
        `${HELPERS} read_output_rows as _read`,
        `print(_read('${p}', '${ext}'))`,
    ].join('\n');
}
exports.readOutputRows = readOutputRows;
function writeOutputRow(path, values) {
    var _a, _b;
    const outPath = (0, util_1.escPy)(path);
    const ext = (_b = (_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    const cols = Object.keys(values);
    const rowDict = `{\n${cols.map(c => `  '${c}': ${_pyRepr(values[c])}`).join(',\n')}\n}`;
    const colsPy = `[${cols.map(c => `'${c}'`).join(',')}]`;
    return [
        `${HELPERS} write_output_row as _write`,
        `_row = ${rowDict}`,
        `print(_write('${outPath}', _row, ${colsPy}, '${ext}'))`,
    ].join('\n');
}
exports.writeOutputRow = writeOutputRow;
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
//
// Capture (Player)
//
function savePng(filename, b64Data) {
    const esc = (0, util_1.escPy)(filename);
    return [
        `${HELPERS} save_png as _save_png`,
        `print(_save_png('${esc}', '${b64Data}'))`,
    ].join('\n');
}
exports.savePng = savePng;
//
// Cache & project operations
//
exports.INVALIDATE_OUTPUT_CACHE = 'if hasattr(_BA_INSTANCE, "_invalidate_output_cache"): _BA_INSTANCE._invalidate_output_cache()';
function syncOutput(dest) {
    const destArg = dest ? `dest='${(0, util_1.escPy)(dest)}'` : '';
    return [
        `_BA_INSTANCE.sync(${destArg})`,
        `print('ok')`,
    ].join('\n');
}
exports.syncOutput = syncOutput;
function getDefaultProjectPath() {
    return [
        `import os as _os, re as _re, json as _json`,
        `_slug = _re.sub(r'[^a-z0-9]+', '_', _BA_INSTANCE._project_name.lower()).strip('_')`,
        `_def_path = _os.path.join('projects', _slug + '.yaml')`,
        `print(_json.dumps({'path': _def_path}))`,
    ].join('\n');
}
exports.getDefaultProjectPath = getDefaultProjectPath;
function saveProject(path, overwrite = false) {
    return [
        `import os as _os, json as _json`,
        `_folder = _os.path.dirname('${(0, util_1.escPy)(path)}') or '.'`,
        `_fname = _os.path.basename('${(0, util_1.escPy)(path)}')`,
        `_ow = ${overwrite ? 'True' : 'False'}`,
        `_path = _BA_INSTANCE.save_as_project(`,
        `  filename=_fname, folder=_folder, overwrite=_ow)`,
        `print(_json.dumps({'path': _path}))`,
    ].join('\n');
}
exports.saveProject = saveProject;
function checkFileExists(path) {
    return [
        `import os, json`,
        `print(json.dumps({'exists': os.path.exists('${(0, util_1.escPy)(path)}')}))`,
    ].join('\n');
}
exports.checkFileExists = checkFileExists;
//
// Internal
//
function _customVizCode(vizIndex, resolutionW, resolutionH) {
    const h = resolutionH ? `, height=${resolutionH}` : '';
    return [
        `${HELPERS} run_custom_viz as _run_viz`,
        `_viz_entry = _BA_INSTANCE._visualizations[${vizIndex}]`,
        `print(_run_viz(_raw, _sr, _viz_entry, width=${resolutionW}${h}))`,
    ].join('\n');
}
function _pyRepr(val) {
    if (val === null || val === undefined)
        return 'None';
    if (typeof val === 'boolean')
        return val ? 'True' : 'False';
    if (typeof val === 'number')
        return String(val);
    return `'${(0, util_1.escPy)(String(val)).replace(/\n/g, ' ')}'`;
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
// ─── Constants ────────────────────────────────────────────────
const DEFAULT_TABLE_MAX_HEIGHT = 175;
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
        if (opts.height) {
            this._tableWrap.style.maxHeight = `${opts.height}px`;
        }
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

/***/ "./lib/sections/DescriptionPanel.js"
/*!******************************************!*\
  !*** ./lib/sections/DescriptionPanel.js ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DescriptionPanel = void 0;
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
const DEFAULT_DESCRIPTION_TITLE = 'Description';
function renderMarkdown(src) {
    const lines = src.split('\n');
    const out = [];
    let inList = '';
    let inCode = false;
    const inline = (s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
 * Owns the dynamic form built from `form_config`: all inputs, submission
 * buttons, progress tracker, annotation tool UI, reviewed-view (for
 * already-submitted rows), and output file writing.
 *
 * Communicates with the rest of the widget via Lumino signals.
 */
const signaling_1 = __webpack_require__(/*! @lumino/signaling */ "webpack/sharing/consume/default/@lumino/signaling");
const kernel_1 = __webpack_require__(/*! ../kernel */ "./lib/kernel.js");
const util_1 = __webpack_require__(/*! ../util */ "./lib/util.js");
const python_1 = __webpack_require__(/*! ../python */ "./lib/python.js");
const styles_1 = __webpack_require__(/*! ../styles */ "./lib/styles.js");
// ─── Constants ────────────────────────────────────────────────
const DEFAULT_FORM_MIN_HEIGHT = 140;
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
        /** Sync button was clicked — orchestrator handles the kernel call. */
        this.syncRequested = new signaling_1.Signal(this);
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
        this._reviewedTool = '';
        // Context provided by the orchestrator
        this._rows = [];
        this._identCol = '';
        this._duplicateEntries = false;
        this._outputPath = '';
        this._syncConfig = {};
        this._syncBtn = null;
        this._selectedIdx = -1;
        this._filteredLength = 0;
        this._reviewedMultiboxEntries = [];
        this._currentRow = null;
        // Build the section shell
        this.element = document.createElement('div');
        this.element.style.cssText =
            `flex:0 0 auto;min-height:${DEFAULT_FORM_MIN_HEIGHT}px;padding:10px 14px 12px;background:${styles_1.COLORS.bgMantle};` +
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
        var _a;
        if (opts.height) {
            this.element.style.minHeight = `${opts.height}px`;
        }
        this._formConfig = opts.formConfig;
        this._rows = opts.rows;
        this._identCol = opts.identCol;
        this._duplicateEntries = opts.duplicateEntries;
        this._outputPath = opts.outputPath;
        this._syncConfig = (_a = opts.syncConfig) !== null && _a !== void 0 ? _a : {};
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
        await this._registerDynamicForms(cfg.dynamic_forms);
        const TOPLEVEL_KEYS = new Set([
            'title', 'progress_tracker', 'pass_value', 'fixed_value',
            'submission_buttons', '_fixed_kwargs', 'dynamic_forms', 'form',
            'annotation',
        ]);
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
                if (Array.isArray(cfg.form)) {
                    await this._buildFormSection(cfg.form, this._dynFormEl);
                }
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
                // already handled above
            }
            else if (!TOPLEVEL_KEYS.has(key)) {
                const sectionData = cfg[key];
                if (Array.isArray(sectionData)) {
                    const sectionDiv = document.createElement('div');
                    sectionDiv.dataset.formSection = key;
                    sectionDiv.style.cssText = (0, styles_1.formRowStyle)(true);
                    await this._buildFormSection(sectionData, sectionDiv);
                    this._dynFormEl.appendChild(sectionDiv);
                    this._namedSections.set(key, sectionDiv);
                }
                else if (key === 'select' || key === 'textbox' || key === 'checkbox' || key === 'number') {
                    await this._buildInputElement(key, sectionData, this._dynFormEl);
                }
            }
        }
        for (const [name, el] of this._namedSections) {
            if (!el.parentElement)
                this._dynFormEl.appendChild(el);
        }
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
            this._reviewedTool = '';
            this._reviewedMultiboxEntries = [];
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
                const arr = this._reviewedMap.get(inputId);
                if (arr)
                    arr.push(outRow);
                else
                    this._reviewedMap.set(inputId, [outRow]);
            }
        }
    }
    // ─── Private: form building ────────────────────────────────
    async _registerDynamicForms(dynForms) {
        if (!dynForms || typeof dynForms !== 'object' || Array.isArray(dynForms))
            return;
        for (const [formName, rawElements] of Object.entries(dynForms)) {
            let formElements = rawElements;
            if (!Array.isArray(formElements)) {
                if (formElements && typeof formElements === 'object') {
                    formElements = Object.keys(formElements).map((k) => ({ [k]: formElements[k] }));
                }
                else {
                    continue;
                }
            }
            const sectionDiv = document.createElement('div');
            sectionDiv.dataset.formSection = formName;
            sectionDiv.style.cssText = (0, styles_1.formRowStyle)(true);
            await this._buildFormSection(formElements, sectionDiv);
            this._namedSections.set(formName, sectionDiv);
        }
    }
    async _buildFormSection(elements, container) {
        var _a;
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
                const textVal = config && typeof config === 'object' ? ((_a = config.value) !== null && _a !== void 0 ? _a : '') : config;
                d.textContent = String(textVal);
                if (String(textVal).includes('\n'))
                    d.style.whiteSpace = 'pre-wrap';
                container.appendChild(d);
            }
            else {
                await this._buildInputElement(type, config, container);
            }
        }
    }
    async _buildInputElement(type, rawConfig, container) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
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
        const pendingFormSections = [];
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
                for (const sn of allFormSections) {
                    const sec = this._namedSections.get(sn);
                    if (sec)
                        container.appendChild(sec);
                }
                return;
            }
            this._formValues[col] = (_h = cfg.default) !== null && _h !== void 0 ? _h : selectedDefault;
            for (const sn of allFormSections)
                pendingFormSections.push(sn);
            inputEl = sel;
        }
        else if (type === 'checkbox') {
            const checkedVal = (_k = (_j = cfg.checked_value) !== null && _j !== void 0 ? _j : cfg.yes_value) !== null && _k !== void 0 ? _k : true;
            const uncheckedVal = (_m = (_l = cfg.unchecked_value) !== null && _l !== void 0 ? _l : cfg.no_value) !== null && _m !== void 0 ? _m : false;
            const checkedForm = cfg.checked_form;
            const uncheckedForm = cfg.unchecked_form;
            const allCbForms = new Set();
            if (checkedForm)
                allCbForms.add(checkedForm);
            if (uncheckedForm)
                allCbForms.add(uncheckedForm);
            const inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = Boolean(cfg.default);
            const updateCbForms = () => {
                this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
                if (allCbForms.size > 0) {
                    const activeForm = inp.checked ? checkedForm : uncheckedForm;
                    for (const sn of allCbForms) {
                        const el = this._namedSections.get(sn);
                        if (el)
                            el.style.display = sn === activeForm ? 'flex' : 'none';
                    }
                }
                this._validateForm();
            };
            inp.addEventListener('change', updateCbForms);
            this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
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
            this._formValues[col] = (_o = cfg.value) !== null && _o !== void 0 ? _o : null;
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
        if (type === 'checkbox') {
            const cf = cfg.checked_form;
            const uf = cfg.unchecked_form;
            for (const fn of [cf, uf]) {
                if (fn)
                    pendingFormSections.push(fn);
            }
        }
        for (const sn of pendingFormSections) {
            const sec = this._namedSections.get(sn);
            if (sec)
                container.appendChild(sec);
        }
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
        try {
            const result = await this._kernel.exec((0, python_1.loadSelectItems)(path, valueCol, labelCol));
            return JSON.parse(result);
        }
        catch (_a) {
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
        if (this._syncConfig.button) {
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            btnContainer.appendChild(spacer);
            this._syncBtn = document.createElement('button');
            this._syncBtn.textContent = this._syncConfig.button;
            this._syncBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:12px;`;
            this._syncBtn.addEventListener('click', () => void this._onSync());
            btnContainer.appendChild(this._syncBtn);
        }
        this._dynFormEl.appendChild(btnContainer);
    }
    async _onSync() {
        var _a;
        if (!this._syncBtn)
            return;
        const label = (_a = this._syncBtn.textContent) !== null && _a !== void 0 ? _a : 'Sync';
        this._syncBtn.disabled = true;
        this._syncBtn.textContent = 'Syncing…';
        this._syncBtn.style.opacity = '0.4';
        this.syncRequested.emit(void 0);
    }
    _resetSyncBtnLabel() {
        var _a;
        this._syncBtn.textContent = (_a = this._syncConfig.button) !== null && _a !== void 0 ? _a : 'Sync';
    }
    _enableSyncBtn() {
        if (!this._syncBtn)
            return;
        this._resetSyncBtnLabel();
        this._syncBtn.disabled = false;
        this._syncBtn.style.opacity = '1';
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
        const needsTime = ac.tools.some(t => ['time_select', 'start_end_time_select', 'bounding_box', 'multibox'].includes(t));
        const needsEndTime = ac.tools.some(t => ['start_end_time_select', 'bounding_box', 'multibox'].includes(t));
        const needsFreq = ac.tools.some(t => ['bounding_box', 'multibox'].includes(t));
        if (needsTime && !ac.startTime) {
            ac.startTime = { col: 'start_time', sourceValue: 'start_time' };
            this._formValues['start_time'] = null;
        }
        if (needsEndTime && !ac.endTime) {
            ac.endTime = { col: 'end_time', sourceValue: 'end_time' };
            this._formValues['end_time'] = null;
        }
        if (needsFreq && !ac.minFreq) {
            ac.minFreq = { col: 'min_frequency' };
            this._formValues['min_frequency'] = null;
        }
        if (needsFreq && !ac.maxFreq) {
            ac.maxFreq = { col: 'max_frequency' };
            this._formValues['max_frequency'] = null;
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
                if (this._currentRow)
                    this._applyAnnotValues(this._currentRow);
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
            mkInput('startTime', (_l = (_k = config.start_time) === null || _k === void 0 ? void 0 : _k.label) !== null && _l !== void 0 ? _l : 'start_time', 's');
        if (ac.endTime)
            mkInput('endTime', (_o = (_m = config.end_time) === null || _m === void 0 ? void 0 : _m.label) !== null && _o !== void 0 ? _o : 'end_time', 's');
        if (ac.minFreq)
            mkInput('minFreq', (_q = (_p = config.min_frequency) === null || _p === void 0 ? void 0 : _p.label) !== null && _q !== void 0 ? _q : 'min_frequency', 'Hz');
        if (ac.maxFreq)
            mkInput('maxFreq', (_s = (_r = config.max_frequency) === null || _r === void 0 ? void 0 : _r.label) !== null && _s !== void 0 ? _s : 'max_frequency', 'Hz');
        container.appendChild(wrapper);
        // Annotation form container — shows per-box forms in multibox mode,
        // or a single form instance for other annotation tools
        if (ac.form || ac.tools.includes('multibox')) {
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
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
                const checkedVal = (_r = (_q = cfg.checked_value) !== null && _q !== void 0 ? _q : cfg.yes_value) !== null && _r !== void 0 ? _r : true;
                const uncheckedVal = (_t = (_s = cfg.unchecked_value) !== null && _s !== void 0 ? _s : cfg.no_value) !== null && _t !== void 0 ? _t : false;
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                inp.checked = Boolean((_u = entry.formValues[col]) !== null && _u !== void 0 ? _u : cfg.default);
                inp.addEventListener('change', () => {
                    entry.formValues[col] = inp.checked ? checkedVal : uncheckedVal;
                    this._validateForm();
                });
                entry.formValues[col] = inp.checked ? checkedVal : uncheckedVal;
                const lbl = document.createElement('label');
                lbl.style.cssText = (0, styles_1.labelStyle)() + `font-size:11px;`;
                lbl.textContent = (_v = cfg.label) !== null && _v !== void 0 ? _v : col;
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
        this._applyAnnotValues(row);
        // Apply pass_value fields
        for (const { sourceCol, col } of this._passValueDefs) {
            this._formValues[col] = (_a = row[sourceCol]) !== null && _a !== void 0 ? _a : null;
        }
        // Annotation rendering on the canvas depends on these values
        this.annotationChanged.emit(void 0);
        this._validateForm();
    }
    _applyAnnotValues(row) {
        if (!this._annotConfig)
            return;
        const ac = this._annotConfig;
        const tool = this._activeTool;
        const fillStart = tool === 'time_select' || tool === 'start_end_time_select';
        const fillEnd = tool === 'start_end_time_select';
        if (ac.startTime) {
            if (fillStart) {
                const sv = ac.startTime.sourceValue;
                const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.start_time;
                this._setAnnotValueInternal('startTime', v, false);
            }
            else {
                this._setAnnotValueInternal('startTime', null, false);
            }
        }
        if (ac.endTime) {
            if (fillEnd) {
                const sv = ac.endTime.sourceValue;
                const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.end_time;
                this._setAnnotValueInternal('endTime', v, false);
            }
            else {
                this._setAnnotValueInternal('endTime', null, false);
            }
        }
        if (ac.minFreq)
            this._setAnnotValueInternal('minFreq', null, false);
        if (ac.maxFreq)
            this._setAnnotValueInternal('maxFreq', null, false);
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
        const rows = this._reviewedMap.get(row.id);
        if (!rows || rows.length === 0)
            return;
        const title = document.createElement('div');
        title.style.cssText =
            `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${styles_1.COLORS.green};`;
        title.textContent = 'REVIEWED';
        this._dynFormEl.appendChild(title);
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:6px;padding:4px 0;overflow-y:auto;`;
        const colors = styles_1.DISPLAY_CHIP_COLORS;
        for (let ri = 0; ri < rows.length; ri++) {
            const data = rows[ri];
            const card = document.createElement('div');
            if (rows.length > 1) {
                card.style.cssText =
                    `display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:4px 8px;` +
                        `border-radius:4px;border-left:3px solid ${colors[ri % colors.length]};`;
            }
            else {
                card.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
            }
            for (const [key, val] of Object.entries(data)) {
                const line = document.createElement('span');
                if (rows.length > 1) {
                    line.style.cssText = `display:inline-flex;gap:4px;font-size:12px;white-space:nowrap;`;
                }
                else {
                    line.style.cssText = `display:flex;gap:8px;font-size:12px;`;
                }
                const keyEl = document.createElement('span');
                keyEl.style.cssText = rows.length > 1
                    ? `color:${styles_1.COLORS.textMuted};`
                    : `color:${styles_1.COLORS.textMuted};min-width:140px;flex-shrink:0;`;
                keyEl.textContent = key;
                const valEl = document.createElement('span');
                valEl.style.cssText = `color:${styles_1.COLORS.textPrimary};`;
                valEl.textContent = val != null && val !== '' ? String(val) : '—';
                line.append(keyEl, valEl);
                card.appendChild(line);
            }
            container.appendChild(card);
        }
        this._dynFormEl.appendChild(container);
        this._setReviewedAnnotations(rows);
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
    getReviewedTool() {
        return this._reviewedTool;
    }
    getReviewedMultiboxEntries() {
        return this._reviewedMultiboxEntries;
    }
    isShowingReviewedView() {
        return this._showingReviewedView;
    }
    _setReviewedAnnotations(rows) {
        var _a, _b, _c, _d;
        this._reviewedTool = '';
        this._reviewedMultiboxEntries = [];
        const ac = this._annotConfig;
        if (!ac || rows.length === 0) {
            this.annotationChanged.emit(void 0);
            return;
        }
        const stCol = (_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col;
        const etCol = (_b = ac.endTime) === null || _b === void 0 ? void 0 : _b.col;
        const loCol = (_c = ac.minFreq) === null || _c === void 0 ? void 0 : _c.col;
        const hiCol = (_d = ac.maxFreq) === null || _d === void 0 ? void 0 : _d.col;
        const first = rows[0];
        const hasSt = stCol && first[stCol] != null && first[stCol] !== '';
        const hasEt = etCol && first[etCol] != null && first[etCol] !== '';
        const hasLo = loCol && first[loCol] != null && first[loCol] !== '';
        const hasHi = hiCol && first[hiCol] != null && first[hiCol] !== '';
        const hasFreqs = hasLo && hasHi;
        if (rows.length > 1 && hasSt && hasEt && hasFreqs) {
            this._reviewedTool = 'multibox';
            const colors = styles_1.DISPLAY_CHIP_COLORS;
            this._reviewedMultiboxEntries = rows.map((r, i) => ({
                id: i,
                startTime: parseFloat(String(r[stCol])),
                endTime: parseFloat(String(r[etCol])),
                minFreq: parseFloat(String(r[loCol])),
                maxFreq: parseFloat(String(r[hiCol])),
                formValues: {},
                color: colors[i % colors.length],
            }));
        }
        else if (rows.length === 1 && hasSt && hasEt && hasFreqs) {
            this._reviewedTool = 'bounding_box';
            this._formValues[stCol] = parseFloat(String(first[stCol]));
            this._formValues[etCol] = parseFloat(String(first[etCol]));
            this._formValues[loCol] = parseFloat(String(first[loCol]));
            this._formValues[hiCol] = parseFloat(String(first[hiCol]));
        }
        else if (hasSt && hasEt) {
            this._reviewedTool = 'start_end_time_select';
            this._formValues[stCol] = parseFloat(String(first[stCol]));
            this._formValues[etCol] = parseFloat(String(first[etCol]));
        }
        else if (hasSt) {
            this._reviewedTool = 'time_select';
            this._formValues[stCol] = parseFloat(String(first[stCol]));
        }
        this.annotationChanged.emit(void 0);
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
                const summary = e instanceof kernel_1.KernelError ? e.message : String((_a = e.message) !== null && _a !== void 0 ? _a : e);
                if (e instanceof kernel_1.KernelError)
                    console.error('[JBA] Write failed:', e.traceback);
                this.statusChanged.emit({ message: `❌ Write failed: ${summary}`, error: true });
                return;
            }
            this._sessionCount++;
            if (!this._duplicateEntries) {
                const multiRows = this._multiboxEntries.map(entry => {
                    const rv = Object.assign({}, this._collectFormValues());
                    if (ac === null || ac === void 0 ? void 0 : ac.startTime) {
                        delete rv[ac.startTime.col];
                        rv[ac.startTime.col] = entry.startTime;
                    }
                    if (ac === null || ac === void 0 ? void 0 : ac.endTime) {
                        delete rv[ac.endTime.col];
                        rv[ac.endTime.col] = entry.endTime;
                    }
                    if (ac === null || ac === void 0 ? void 0 : ac.minFreq) {
                        delete rv[ac.minFreq.col];
                        rv[ac.minFreq.col] = entry.minFreq;
                    }
                    if (ac === null || ac === void 0 ? void 0 : ac.maxFreq) {
                        delete rv[ac.maxFreq.col];
                        rv[ac.maxFreq.col] = entry.maxFreq;
                    }
                    Object.assign(rv, entry.formValues);
                    return rv;
                });
                this._reviewedMap.set(activeRow.id, multiRows);
            }
            void this._refreshAccuracy().then(() => this._updateProgress());
            void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
            this._enableSyncBtn();
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
            const summary = e instanceof kernel_1.KernelError ? e.message : String((_b = e.message) !== null && _b !== void 0 ? _b : e);
            if (e instanceof kernel_1.KernelError)
                console.error('[JBA] Write failed:', e.traceback);
            this.statusChanged.emit({ message: `❌ Write failed: ${summary}`, error: true });
            return;
        }
        this._sessionCount++;
        if (!this._duplicateEntries) {
            this._reviewedMap.set(activeRow.id, [Object.assign({}, values)]);
        }
        void this._refreshAccuracy().then(() => this._updateProgress());
        void this._kernel.exec(python_1.INVALIDATE_OUTPUT_CACHE).catch(() => { });
        this._enableSyncBtn();
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
            : `abs(_sf(r.get('start_time'))-${row.start_time})<0.01 and abs(_sf(r.get('end_time'))-${row.end_time})<0.01`;
        const code = (0, python_1.deleteOutputRow)(this._outputPath, matchExpr);
        try {
            await this._kernel.exec(code);
        }
        catch (e) {
            this.statusChanged.emit({ message: `❌ Delete failed: ${String((_a = e.message) !== null && _a !== void 0 ? _a : e)}`, error: true });
            return;
        }
        this._reviewedMap.delete(row.id);
        this._reviewedTool = '';
        this._reviewedMultiboxEntries = [];
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
// ─── Constants ────────────────────────────────────────────────
const DEFAULT_INFO_CARD_MIN_HEIGHT = 34;
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
// ─── Constants ────────────────────────────────────────────────
const DEFAULT_CANVAS_HEIGHT = 260;
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
        this._panToolActive = false;
        this._zoomBoxDrag = null;
        this._zoomBoxMoveHandler = null;
        this._zoomBoxUpHandler = null;
        this._specResolutions = ['1000', '2000', '4000'];
        this._canvasHeight = DEFAULT_CANVAS_HEIGHT;
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
        if (opts.height) {
            this._canvasHeight = opts.height;
            this._canvasContainer.style.flex = `0 0 ${opts.height}px`;
        }
        this._audioConfig = opts.audioConfig;
        this._captureLabel = opts.captureLabel;
        this._captureDir = opts.captureDir;
        this._captureHeight = opts.captureHeight;
        this._identCol = opts.identCol;
        this._displayCols = opts.displayCols;
        this._rows = opts.rows;
        this._bufferInput.value = String(opts.defaultBuffer);
        this._specResolutions = opts.specResolutions;
        this._rebuildResolutionSelect();
        this._vizMeta = opts.vizMeta.length > 0 ? opts.vizMeta : [
            { type: 'builtin', key: 'linear', label: 'Linear', freq_scale: 'linear', index: 0 },
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
            if (this._zoomBoxActive)
                this._panToolActive = false;
            this._zoomBoxBtn.style.background = this._zoomBoxActive ? styles_1.COLORS.overlay : styles_1.COLORS.bgSurface1;
            this._panToolBtn.style.background = styles_1.COLORS.bgSurface1;
            this._updateCursorForZoom();
        });
        viewBar.appendChild(this._zoomBoxBtn);
        this._panToolBtn = document.createElement('button');
        this._panToolBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
        this._panToolBtn.title = 'Pan — click and drag to move around';
        this._panToolBtn.style.cssText = (0, styles_1.btnStyle)() + `font-size:13px;padding:2px 8px;display:inline-flex;align-items:center;`;
        this._panToolBtn.addEventListener('click', () => {
            this._panToolActive = !this._panToolActive;
            if (this._panToolActive)
                this._zoomBoxActive = false;
            this._panToolBtn.style.background = this._panToolActive ? styles_1.COLORS.overlay : styles_1.COLORS.bgSurface1;
            this._zoomBoxBtn.style.background = styles_1.COLORS.bgSurface1;
            this._updateCursorForZoom();
        });
        viewBar.appendChild(this._panToolBtn);
        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.textContent = 'Reset';
        zoomResetBtn.style.cssText = (0, styles_1.btnStyle)();
        zoomResetBtn.addEventListener('click', () => this._resetZoom());
        viewBar.appendChild(zoomResetBtn);
        // Spectrogram canvas
        this._canvasContainer = document.createElement('div');
        this._canvasContainer.style.cssText =
            `flex:0 0 ${DEFAULT_CANVAS_HEIGHT}px;position:relative;background:${styles_1.COLORS.bgCrust};overflow:hidden;cursor:default;` +
                `transition:opacity 0.2s ease;`;
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
            console.error('[JBA] No audio configured — set audio param');
            this.statusChanged.emit({ message: '❌ No audio configured — set audio param', error: true });
            return;
        }
        // Disable Update button while loading
        this._loadBtn.disabled = true;
        this._loadBtn.textContent = 'Updating…';
        this._loadBtn.style.opacity = '0.4';
        this._canvasContainer.style.opacity = '0.5';
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
            const raw = await this._kernel.exec((0, python_1.spectrogramPipeline)(audioPath, loadStart, loadDur, viz.type === 'custom' ? 'custom' : 'builtin', viz.key, viz.index, resW, this._canvasHeight));
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
        if (result.audio_warning) {
            this.statusChanged.emit({
                message: `⚠ ${fname}: ${result.audio_warning}`,
                error: false,
                warning: true,
            });
        }
        else {
            this.statusChanged.emit({
                message: `✓ ${fname}  ${(0, util_1.fmtTime)(loadStart)}–${(0, util_1.fmtTime)(loadStart + result.duration)}`,
                error: false,
            });
        }
    }
    _enableLoadBtn() {
        this._loadBtn.disabled = false;
        this._loadBtn.textContent = 'Update';
        this._loadBtn.style.opacity = '1';
        this._canvasContainer.style.opacity = '1';
    }
    _renderFrame() {
        const ctx = this._canvas.getContext('2d');
        if (!ctx)
            return;
        const W = this._canvas.width, H = this._canvas.height;
        if (!W || !H)
            return;
        const padY = Player.SPEC_PAD_Y;
        const AX = Player.AXIS_W;
        const specW = W - AX;
        ctx.fillStyle = styles_1.COLORS.bgCrust;
        ctx.fillRect(0, 0, W, padY);
        ctx.fillRect(0, H - padY, W, padY);
        ctx.fillRect(0, 0, AX, H);
        if (this._specBitmap) {
            const bw = this._specBitmap.width;
            const bh = this._specBitmap.height;
            const sx = this._viewXMin * bw;
            const sw = (this._viewXMax - this._viewXMin) * bw;
            const sy = (1 - this._viewYMax) * bh;
            const sh = (this._viewYMax - this._viewYMin) * bh;
            ctx.drawImage(this._specBitmap, sx, sy, sw, sh, AX, padY, specW, H - 2 * padY);
        }
        else {
            ctx.fillStyle = styles_1.COLORS.bgCrust;
            ctx.fillRect(0, 0, W, H);
        }
        if (this._specBitmap && this._segDuration > 0) {
            const detStartFrac = (this._detectionStart - this._segLoadStart) / this._segDuration;
            const detEndFrac = (this._detectionEnd - this._segLoadStart) / this._segDuration;
            const viewW = this._viewXMax - this._viewXMin;
            const toScreen = (frac) => AX + ((frac - this._viewXMin) / viewW) * specW;
            const bufLeft = toScreen(detStartFrac);
            const bufRight = toScreen(detEndFrac);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            if (bufLeft > AX)
                ctx.fillRect(AX, 0, Math.floor(bufLeft) - AX, H);
            if (bufRight < W) {
                const rx = Math.ceil(bufRight);
                ctx.fillRect(rx, 0, W - rx, H);
            }
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = Math.floor(Math.max(AX, Math.min(W, toScreen(playFrac))));
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
    _timeToX(t, canvasW, axisW) {
        const AX = axisW !== null && axisW !== void 0 ? axisW : Player.AXIS_W;
        const specW = (canvasW !== null && canvasW !== void 0 ? canvasW : this._canvas.width) - AX;
        const frac = (t - this._segLoadStart) / this._segDuration;
        return AX + ((frac - this._viewXMin) / (this._viewXMax - this._viewXMin)) * specW;
    }
    /** Convert screen X to absolute time, accounting for zoom. */
    _xToTime(x) {
        const AX = Player.AXIS_W;
        const specW = this._canvas.width - AX;
        const viewFrac = this._viewXMin + ((x - AX) / specW) * (this._viewXMax - this._viewXMin);
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
            const AX = Player.AXIS_W;
            const specW = this._canvas.width - AX;
            const viewW = this._viewXMax - this._viewXMin;
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = AX + ((playFrac - this._viewXMin) / viewW) * specW;
            if (Math.abs(cx - ph) <= 10) {
                this._playheadDrag = true;
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
        }
        // Pan mode: when pan tool is active, or no annotation tool is active and zoomed in
        const ac = this._form.getAnnotConfig();
        const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
        if ((this._panToolActive || (!ac || !this._form.getActiveTool())) && isZoomed && this._specBitmap) {
            this._panDrag = {
                startX: e.clientX, startY: e.clientY,
                origXMin: this._viewXMin, origXMax: this._viewXMax,
                origYMin: this._viewYMin, origYMax: this._viewYMax,
            };
            this._canvasContainer.style.cursor = 'grabbing';
            return;
        }
        if (!ac || !this._specBitmap || this._segDuration === 0 || this._form.isShowingReviewedView())
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
            const AX = Player.AXIS_W;
            const specW = this._canvas.width - AX;
            const viewW = this._viewXMax - this._viewXMin;
            const frac = this._viewXMin + ((cx - AX) / specW) * viewW;
            const newTime = Math.max(0, Math.min(this._segDuration, frac * this._segDuration));
            this._audio.currentTime = newTime;
            this._renderFrame();
            return;
        }
        // Handle pan drag
        if (this._panDrag) {
            const rect = this._canvas.getBoundingClientRect();
            const specCssW = rect.width * (1 - Player.AXIS_W / this._canvas.width);
            const dx = (e.clientX - this._panDrag.startX) / specCssW;
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
            const AX = Player.AXIS_W;
            const specW = this._canvas.width - AX;
            const viewW = this._viewXMax - this._viewXMin;
            const playFrac = this._audio.currentTime / this._segDuration;
            const ph = AX + ((playFrac - this._viewXMin) / viewW) * specW;
            if (Math.abs(cx - ph) <= 10) {
                this._canvasContainer.style.cursor = 'ew-resize';
                return;
            }
            if (ac && !this._form.isShowingReviewedView()) {
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
    _renderAnnotation(ctx, W, H, axisW) {
        var _a, _b, _c, _d, _e, _f, _g;
        const ac = this._form.getAnnotConfig();
        if (!ac || this._segDuration === 0)
            return;
        const reviewed = this._form.isShowingReviewedView();
        const tool = reviewed ? this._form.getReviewedTool() : this._form.getActiveTool();
        const ax = axisW !== null && axisW !== void 0 ? axisW : Player.AXIS_W;
        const tx = (t) => this._timeToX(t, W, ax);
        if (tool === 'time_select') {
            const st = ((_a = ac.startTime) === null || _a === void 0 ? void 0 : _a.col) ? this._form.getFormValue(ac.startTime.col) : null;
            if (st == null)
                return;
            const x = tx(st);
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
                const sx = tx(st), ex = tx(et);
                ctx.fillStyle = 'rgba(137,180,250,0.08)';
                ctx.fillRect(sx, 0, ex - sx, H);
            }
            if (st != null) {
                const x = tx(st);
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
                const x = tx(et);
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
            const sx = tx(st), ex = tx(et);
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
            const entries = reviewed ? this._form.getReviewedMultiboxEntries() : this._form.getMultiboxEntries();
            const activeIdx = reviewed ? -1 : this._form.getActiveBoxIndex();
            entries.forEach((entry, i) => {
                const sx = tx(entry.startTime);
                const ex = tx(entry.endTime);
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
        const AXIS_W = Player.AXIS_W;
        const FONT_SIZE = 10;
        const TICK_LEN = 4;
        const padY = Player.SPEC_PAD_Y;
        const specH = H - 2 * padY;
        ctx.fillStyle = styles_1.COLORS.bgCrust;
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
        const AX = Player.AXIS_W;
        const specW = W - AX;
        const x1 = Math.max(0, Math.min(this._zoomBoxDrag.startCx, cx) - AX) / specW;
        const x2 = Math.max(0, Math.max(this._zoomBoxDrag.startCx, cx) - AX) / specW;
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
        if (this._zoomBoxActive) {
            this._canvasContainer.style.cursor = 'crosshair';
            return;
        }
        if (this._panToolActive) {
            const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
            this._canvasContainer.style.cursor = isZoomed ? 'grab' : 'default';
            return;
        }
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
        var _a, _b;
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
        const displayAspect = this._canvas.height / Math.max(1, this._canvas.width - Player.AXIS_W);
        const H = (_a = this._captureHeight) !== null && _a !== void 0 ? _a : Math.round(W * displayAspect);
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
        this._renderAnnotation(ctx, W, H, 0);
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
            this.statusChanged.emit({ message: `❌ Save failed: ${String((_b = e.message) !== null && _b !== void 0 ? _b : e)}`, error: true });
        }
    }
}
exports.Player = Player;
/** Vertical padding (px) at top/bottom of canvas for freq axis labels. */
Player.SPEC_PAD_Y = 8;
/** Width (px) of the frequency axis strip on the left. */
Player.AXIS_W = 40;


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
    [id^="jp-config-builder"] input::placeholder,
    [id^="jp-config-builder"] textarea::placeholder {
      color: ${exports.COLORS.textSubtle} !important;
      opacity: 0.6 !important;
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
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.showDialog = exports.isTruthyValue = exports.parseAccuracyConfig = exports.escPy = exports.fmtTime = void 0;
/**
 * Small stateless utilities used across sections.
 */
const styles_1 = __webpack_require__(/*! ./styles */ "./lib/styles.js");
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
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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
function showDialog(opts) {
    var _a;
    const buttons = (_a = opts.buttons) !== null && _a !== void 0 ? _a : [{ label: 'OK', primary: true }];
    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.style.cssText =
            `position:fixed;inset:0;z-index:100000;display:flex;align-items:center;` +
                `justify-content:center;background:rgba(0,0,0,0.55);`;
        const card = document.createElement('div');
        card.style.cssText =
            `background:${styles_1.COLORS.bgBase};border:1px solid ${styles_1.COLORS.bgSurface1};border-radius:8px;` +
                `padding:20px 24px;max-width:520px;width:90%;max-height:80vh;display:flex;` +
                `flex-direction:column;gap:12px;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
        if (opts.title) {
            const h = document.createElement('div');
            h.textContent = opts.title;
            h.style.cssText =
                `font-size:14px;font-weight:700;color:${styles_1.COLORS.textPrimary};`;
            card.appendChild(h);
        }
        const bodyEl = document.createElement('div');
        bodyEl.style.cssText =
            `font-size:12px;color:${styles_1.COLORS.textSubtle};white-space:pre-wrap;` +
                `overflow-y:auto;max-height:50vh;line-height:1.5;`;
        bodyEl.textContent = opts.body;
        card.appendChild(bodyEl);
        const row = document.createElement('div');
        row.style.cssText = `display:flex;gap:8px;justify-content:flex-end;margin-top:4px;`;
        for (const b of buttons) {
            const btn = document.createElement('button');
            btn.textContent = b.label;
            btn.style.cssText = (0, styles_1.btnStyle)(b.primary);
            btn.addEventListener('click', () => { backdrop.remove(); resolve(b.label); });
            row.appendChild(btn);
        }
        card.appendChild(row);
        backdrop.appendChild(card);
        backdrop.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                backdrop.remove();
                resolve(null);
            }
        });
        document.body.appendChild(backdrop);
        const firstPrimary = row.querySelector('button:last-child');
        firstPrimary === null || firstPrimary === void 0 ? void 0 : firstPrimary.focus();
    });
}
exports.showDialog = showDialog;


/***/ }

}]);
//# sourceMappingURL=lib_index_js.0e391104279bb22e78bd.js.map