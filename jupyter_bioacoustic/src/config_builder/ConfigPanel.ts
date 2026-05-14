import { COLORS, btnStyle } from '../styles';
import { KernelBridge } from '../kernel';
import {
  extractJson,
  ensureSetup,
  updateSection,
  readColumns,
  updateConfigFromYaml,
  saveAll,
  saveSingleFile,
  checkFileExists,
  validateConfig,
  loadConfig,
  setSectionTarget,
} from './python';
import { FileBrowser } from './FileBrowser';
import { YamlPanel } from './YamlPanel';
import { ProjectSection } from './sections/ProjectSection';
import { DataSection } from './sections/DataSection';
import { AudioSection } from './sections/AudioSection';
import { OutputSection } from './sections/OutputSection';
import { AppSection } from './sections/AppSection';
import { FormSection } from './sections/FormSection';
import { CollapsibleSection } from './sections/CollapsibleSection';
import { ConfigSummary } from './sections/ConfigSummary';

export class ConfigPanel {
  readonly element: HTMLDivElement;

  private _kernel: KernelBridge;
  private _yamlPanel: YamlPanel;
  private _statusEl: HTMLSpanElement;
  private _sections: Map<string, CollapsibleSection>;
  private _yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
  private _dirty = false;
  private _savedPath = '';
  private _suppressChanges = false;
  private _ready = false;
  private _debug = false;
  private _readyPromise: Promise<void>;

  private _project: ProjectSection;
  private _data: DataSection;
  private _audio: AudioSection;
  private _output: OutputSection;
  private _app: AppSection;
  private _form: FormSection;
  private _summary: ConfigSummary;

  constructor(kernel: KernelBridge) {
    this._kernel = kernel;

    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex:1;overflow:hidden;position:relative;`;

    const left = document.createElement('div');
    left.style.cssText =
      `display:flex;flex-direction:column;flex:1;overflow-y:auto;min-width:0;`;

    this._project = new ProjectSection();
    this._data = new DataSection();
    this._audio = new AudioSection();
    this._output = new OutputSection();
    this._app = new AppSection();
    this._form = new FormSection();
    this._summary = new ConfigSummary();

    this._sections = new Map<string, CollapsibleSection>([
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

    this._form.changed.connect(() => this._updateSummary());

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
      } else if (field === 'description_path') {
        this._openBrowser(current, ['.md', '.txt', '.html'], (p) => this._project.setDescriptionPath(p));
      } else {
        this._openBrowser(current, ['.yaml', '.yml'], (p) => {
          if (field === 'project') this._project.setProjectPath(p);
          else if (field === 'config') this._project.setConfigPath(p);
          else if (field === 'form') this._project.setFormPath(p);
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

    this._yamlPanel = new YamlPanel();
    this._yamlPanel.configEdited.connect((_, { yaml, configType }) => {
      void this._onYamlEdited(yaml, configType);
    });
    this._yamlPanel.saveSingleRequested.connect((_, configType) => {
      void this._saveSingleFile(configType);
    });

    const handle = document.createElement('div');
    handle.style.cssText =
      `width:5px;cursor:col-resize;background:${COLORS.bgSurface0};flex-shrink:0;` +
      `display:flex;align-items:center;justify-content:center;`;
    const grip = document.createElement('div');
    grip.style.cssText =
      `width:3px;height:28px;border-radius:2px;background:${COLORS.overlay};`;
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
      if (!dragging) return;
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
      `font-size:11px;color:${COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

    this._readyPromise = this._ensureReady();
  }

  private async _ensureReady(): Promise<void> {
    this._setStatus('Initializing…');
    try {
      const raw = await this._kernel.exec(ensureSetup(this._kernel.cwd));
      const result = JSON.parse(extractJson(raw));
      this._ready = true;
      this._debug = !!result.debug;
      if (this._debug) {
        console.debug('[JBA] ConfigPanel ready, cwd:', result.cwd);
      }
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Init failed: ${String(e.message ?? e)}`, true);
    }
  }

  private _dbg(...args: any[]): void {
    if (this._debug) console.debug('[JBA]', ...args);
  }

  get statusEl(): HTMLSpanElement {
    return this._statusEl;
  }

  private _onSectionFocused(name: string): void {
    this._yamlPanel.showForSection(name, this._yamls);
  }

  private async _onSectionChanged(sectionName: string): Promise<void> {
    if (this._suppressChanges) return;
    await this._readyPromise;
    if (!this._ready) return;
    const section = this._sections.get(sectionName);
    if (!section) return;

    const data = section.getData();
    this._dbg('sectionChanged', sectionName, data);
    this._setStatus('Updating…');

    try {
      const raw = await this._kernel.exec(updateSection(sectionName, data));
      const state = JSON.parse(extractJson(raw));
      this._applyStatePartial(state, sectionName);
      this._updateSummary();
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private _openBrowser(
    dir: string,
    extensions: string[],
    onSelect: (path: string) => void,
    dirOnly = false,
  ): void {
    if (this.element.querySelector('.jp-cb-filebrowser')) return;

    const overlay = document.createElement('div');
    overlay.className = 'jp-cb-filebrowser';
    overlay.style.cssText =
      `position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;` +
      `background:rgba(0,0,0,0.5);padding:24px;`;

    const browserWrap = document.createElement('div');
    browserWrap.style.cssText =
      `position:relative;width:100%;max-width:500px;height:400px;`;

    const browser = new FileBrowser(
      this._kernel,
      dir || '.',
      extensions,
      dirOnly,
    );

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
      if (e.target === overlay) overlay.remove();
    });
    this.element.appendChild(overlay);
  }

  private async _saveSingleFile(configType: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus(`Saving ${configType} file…`);
    try {
      const raw = await this._kernel.exec(saveSingleFile(configType));
      const result = JSON.parse(extractJson(raw));
      this._setStatus(`Saved: ${result.saved_to}`);
    } catch (e: any) {
      this._setStatus(`Save failed: ${String(e.message ?? e)}`, true);
    }
  }

  private async _loadColumnsForCallback(path: string, callback: (cols: string[]) => void): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(readColumns(path));
      const result = JSON.parse(extractJson(raw));
      callback(result.columns as string[]);
    } catch { /* ignore */ }
  }

  private async _onLoadColumns(pathOrDir: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Loading columns…');
    try {
      const raw = await this._kernel.exec(readColumns(pathOrDir));
      const result = JSON.parse(extractJson(raw));
      const cols = result.columns as string[];
      this._data.setDetectedColumns(cols);
      this._setStatus(`${cols.length} columns loaded`);
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onYamlEdited(yaml: string, configType: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Applying edits…');
    try {
      const raw = await this._kernel.exec(updateConfigFromYaml(yaml, configType));
      const state = JSON.parse(extractJson(raw));
      if (state.update_ok) {
        this._applyState(state);
        this._setStatus('Config updated');
      } else {
        this._setStatus('Invalid YAML', true);
      }
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  async saveToFile(): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;

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

    const checkPath = (projectData.project_enabled && projectData.project_path) ||
      (projectData.config_enabled && projectData.config_path) || '';
    if (checkPath) {
      try {
        const existsRaw = await this._kernel.exec(checkFileExists(checkPath));
        const exists = JSON.parse(extractJson(existsRaw)).exists as boolean;
        if (exists) {
          const ok = window.confirm(`Files already exist. Overwrite?`);
          if (!ok) return;
        }
      } catch { /* proceed */ }
    }

    this._dbg('saveToFile', { enabled });
    this._setStatus(`Saving ${enabled.length} file(s)…`);
    try {
      const raw = await this._kernel.exec(saveAll());
      const state = JSON.parse(extractJson(raw));
      this._dirty = false;
      const paths = state.saved_paths || {};
      this._dbg('saved', paths);
      const savedList = Object.values(paths).join(', ');
      this._savedPath = paths.project || paths.config || paths.form || '';
      this._setStatus(`Saved: ${savedList}`);
    } catch (e: any) {
      this._setStatus(`Save failed: ${String(e.message ?? e)}`, true);
    }
  }

  private _applyStatePartial(state: any, skipSection: string): void {
    this._yamls = {
      project_yaml: state.project_yaml || '',
      config_yaml: state.config_yaml || '',
      form_yaml: state.form_yaml || '',
    };
    this._dirty = !!state.dirty;
    this._savedPath = state.saved_path || '';
    this._yamlPanel.updateYaml(this._yamls);
  }

  private _applyState(state: any): void {
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
        const projWithDesc = { ...proj };
        if (conf.description) projWithDesc.description = conf.description;
        if (conf.description_title) projWithDesc.description_title = conf.description_title;
        if (conf.description_text) projWithDesc.description_text = conf.description_text;
        if (conf.description_path) projWithDesc.description_path = conf.description_path;
        if (conf.description_open !== undefined) projWithDesc.description_open = conf.description_open;
        if (conf.description_height) projWithDesc.description_height = conf.description_height;
        this._project.setData(projWithDesc);
        const targets = state.section_targets || {};

        const mergedData = this._resolveSectionData('data', targets, proj, conf);
        if (mergedData) this._data.setData(mergedData);
        const mergedAudio = this._resolveSectionData('audio', targets, proj, conf);
        if (mergedAudio) this._audio.setData(mergedAudio);
        const outputSource = targets.output === 'config' ? conf : proj;
        if (outputSource.output && typeof outputSource.output === 'object') {
          this._output.setData(outputSource.output);
        }
        const appSource = targets.app === 'config' ? { ...proj, ...conf } : proj;
        this._app.setData(appSource);
      }
      if (state.form_config && typeof state.form_config === 'object') {
        this._form.setData(state.form_config);
      }

      if (state.section_targets) {
        const targets = state.section_targets as Record<string, string>;
        if (targets.data) this._data.setTarget(targets.data);
        if (targets.audio) this._audio.setTarget(targets.audio);
        if (targets.output) this._output.setTarget(targets.output);
        if (targets.app) this._app.setTarget(targets.app);
        if (targets.form) this._form.setTarget(targets.form === 'form_config' ? 'form' : targets.form);
      }

      this._updateSummary();
    } finally {
      this._suppressChanges = false;
    }
  }

  get dirty(): boolean {
    return this._dirty;
  }

  private async _onLoadConfig(path: string, fileType?: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._dbg('loadConfig', path, fileType);
    this._setStatus(`Loading ${path}…`);
    try {
      const raw = await this._kernel.exec(loadConfig(path, fileType));
      const state = JSON.parse(extractJson(raw));
      this._applyState(state);
      const detected = state.detected_type || 'config';
      const paths = state.loaded_paths || {};
      const loaded = Object.values(paths).filter(Boolean);
      const projectData = state.project || {};
      const missing: string[] = [];
      if (projectData.config_enabled && projectData.config_path && !paths.config) {
        missing.push(`config not found: ${projectData.config_path}`);
      }
      if (projectData.form_enabled && projectData.form_path && !paths.form) {
        missing.push(`form not found: ${projectData.form_path}`);
      }
      const warn = missing.length ? ` (⚠ ${missing.join(', ')})` : '';
      this._setStatus(`Loaded as ${detected}: ${loaded.join(', ')}${warn}`, missing.length > 0);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const fnf = msg.match(/FileNotFoundError:\s*(.+)/);
      this._setStatus(fnf ? `File not found: ${fnf[1]}` : `Load failed: ${msg}`, true);
    }
  }

  async validate(): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Validating…');
    try {
      const raw = await this._kernel.exec(validateConfig());
      const result = JSON.parse(extractJson(raw));
      const msgs: string[] = [];
      if (result.errors?.length) msgs.push('Errors:\n• ' + result.errors.join('\n• '));
      if (result.warnings?.length) msgs.push('Warnings:\n• ' + result.warnings.join('\n• '));
      if (result.valid && msgs.length === 0) {
        this._setStatus('Validation passed');
        window.alert('Validation passed – no issues found.');
      } else if (result.valid) {
        this._setStatus('Validation passed with warnings');
        window.alert('Validation passed with warnings:\n\n' + msgs.join('\n\n'));
      } else {
        this._setStatus('Validation failed', true);
        window.alert('Validation failed:\n\n' + msgs.join('\n\n'));
      }
    } catch (e: any) {
      this._setStatus(`Validate error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onProjectEnabledChanged(_enabled: boolean): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(updateSection('project', this._project.getData()));
      const state = JSON.parse(extractJson(raw));
      this._applyStatePartial(state, 'project');
    } catch { /* ignore */ }
  }

  private async _onTargetChanged(section: string, target: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Updating target…');
    const pyTarget = target === 'form' ? 'form_config' : target;
    try {
      const raw = await this._kernel.exec(setSectionTarget(section, pyTarget));
      const state = JSON.parse(extractJson(raw));
      this._applyStatePartial(state, section);
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private _updateTargetOptions(states: { project: boolean; config: boolean; form: boolean }): void {
    const baseOpts: string[] = [];
    if (states.project) baseOpts.push('project');
    if (states.config) baseOpts.push('config');
    if (baseOpts.length === 0) baseOpts.push('project');

    const splitOpts = states.project && states.config
      ? ['split', ...baseOpts] : [...baseOpts];
    for (const sec of [this._data, this._audio]) {
      sec.setTargetOptions(splitOpts);
    }
    for (const sec of [this._output, this._app]) {
      sec.setTargetOptions(baseOpts);
    }

    const formOpts: string[] = [...baseOpts];
    if (states.form) formOpts.push('form');
    this._form.setTargetOptions(formOpts);
  }

  private _onAccordionOpen(opened: CollapsibleSection): void {
    for (const [, section] of this._sections) {
      if (section !== opened && !section.isPinned) {
        section.close();
      }
    }
  }

  private _updateSummary(): void {
    const outputData = this._output.getData();
    const outputPath = this._project.getOutputPath();
    if (outputPath) outputData.path = outputPath;
    this._summary.update({
      project: this._project.getData(),
      data: this._data.getData(),
      audio: this._audio.getData(),
      output: outputData,
      app: this._app.getData(),
      form: this._form.getData(),
    });
  }

  private _resolveSectionData(
    section: string,
    targets: Record<string, string>,
    proj: Record<string, any>,
    conf: Record<string, any>,
  ): Record<string, any> | null {
    const t = targets[section];
    const pData = proj[section];
    const cData = conf[section];
    if (t === 'split') {
      if (!pData && !cData) return null;
      return { ...(typeof cData === 'object' ? cData : {}), ...(typeof pData === 'object' ? pData : {}) };
    }
    const source = t === 'config' ? cData : pData;
    return source && typeof source === 'object' ? source : null;
  }

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : COLORS.green;
  }
}
