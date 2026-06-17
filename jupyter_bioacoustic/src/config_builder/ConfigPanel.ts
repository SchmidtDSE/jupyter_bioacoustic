/**
 * ConfigPanel
 *
 * Main orchestrator for the config builder. Wires all sections together,
 * manages kernel communication, state syncing, and YAML preview.
 *
 * License: BSD 3-Clause
 */
import { COLORS, btnStyle } from '../styles';
import { showDialog } from '../util';
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
  getSummary,
  changeCwd,
  listTemplates,
  loadTemplate,
  applyTemplate,
} from './python';
import { FileBrowser } from './FileBrowser';
import { YamlPanel } from './YamlPanel';
import { SetupSection } from './sections/SetupSection';
import { DataSection } from './sections/DataSection';
import { AudioSection } from './sections/AudioSection';
import { OutputSection } from './sections/OutputSection';
import { AppSection } from './sections/AppSection';
import { FormSection } from './sections/FormSection';
import { DescriptionSection } from './sections/DescriptionSection';
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
  private _resolvedCwd = '';
  private _cwdCallbacks: Array<(cwd: string) => void> = [];
  private _dirtyCallbacks: Array<() => void> = [];

  private _setup: SetupSection;
  private _data: DataSection;
  private _audio: AudioSection;
  private _output: OutputSection;
  private _app: AppSection;
  private _form: FormSection;
  private _description: DescriptionSection;
  private _summary: ConfigSummary;

  constructor(kernel: KernelBridge) {
    this._kernel = kernel;

    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex:1;overflow:hidden;position:relative;`;

    const left = document.createElement('div');
    left.style.cssText =
      `display:flex;flex-direction:column;flex:1;overflow-y:auto;min-width:0;`;

    this._setup = new SetupSection();
    this._data = new DataSection();
    this._audio = new AudioSection();
    this._output = new OutputSection();
    this._app = new AppSection();
    this._form = new FormSection();
    this._description = new DescriptionSection();
    this._summary = new ConfigSummary();

    this._sections = new Map<string, CollapsibleSection>([
      ['project', this._setup],
      ['data', this._data],
      ['audio', this._audio],
      ['output', this._output],
      ['app', this._app],
      ['form', this._form],
      ['description', this._description],
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

    for (const sec of [this._data, this._audio, this._output, this._app, this._form, this._description]) {
      sec.targetChanged.connect((_, { section, target }) => {
        void this._onTargetChanged(section, target);
      });
    }
    this._app.setTarget('config');
    this._form.setTarget('form');
    this._description.setTarget('project');
    left.appendChild(this._summary.element);

    this._setup.browseRequested.connect((_, { field, current }) => {
      const configSubdirs: Record<string, string> = {
        project: 'annotator_config/projects',
        config: 'annotator_config/config',
        form: 'annotator_config/forms',
      };
      if (field === 'project' || field === 'config' || field === 'form') {
        const preferred = configSubdirs[field];
        if (preferred) {
          void this._resolveConfigDir(preferred).then(dir => {
            this._openBrowser(dir, ['.yaml', '.yml'], (p) => {
              this._setup.setLoadPath(p);
            });
          });
        } else {
          this._openBrowser(current, ['.yaml', '.yml'], (p) => {
            this._setup.setLoadPath(p);
          });
        }
      }
    });

    this._setup.projectCreated.connect((_, name) => {
      this._app.setProjectName(name);
      void this._onSectionChanged('project');
      void this._onSectionChanged('app');
    });

    this._setup.projectEnabledChanged.connect((_, enabled) => {
      void this._onProjectEnabledChanged(enabled);
    });
    this._setup.fileStatesChanged.connect((_, states) => {
      this._updateTargetOptions(states);
    });
    this._setup.loadConfigRequested.connect((_, { field, path }) => void this._onLoadConfig(path, field));

    this._setup.templateListRequested.connect(() => void this._onListTemplates());
    this._setup.templateSelected.connect((_, name) => void this._onLoadTemplate(name));
    this._setup.applyTemplateRequested.connect((_, payload) => void this._onApplyTemplate(payload));

    this._data.fileLoadRequested.connect((_, path) => void this._onLoadColumns(path));
    this._data.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, ['.csv', '.parquet', '.json', '.tsv', '.jsonl'], (p) => this._data.setPath(p));
    });
    this._data.columnsLoaded.connect((_, cols) => {
      this._app.setColumnOptions(cols);
      this._audio.setColumnOptions(cols);
      this._output.setColumnOptions(cols);
    });

    this._audio.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac'], (p) => this._audio.setPath(p));
    });

    this._output.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, ['.csv', '.parquet', '.json', '.tsv'], (p) => this._output.setOutputPath(p));
    });

    this._app.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, [], (p) => this._app.setCaptureDir(p), true);
    });

    this._description.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, ['.md', '.txt', '.html'], (p) => this._description.setDescriptionPath(p));
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
    this._yamlPanel.refreshRequested.connect(() => {
      void this._confirmAndRefresh();
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
      this._resolvedCwd = result.cwd || '';
      if (this._debug) {
        console.debug('[JBA] ConfigPanel ready, cwd:', result.cwd);
      }
      for (const cb of this._cwdCallbacks) cb(this._resolvedCwd);
      this._cwdCallbacks = [];
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

    let data = section.getData();
    let pySection = sectionName;
    const uiTarget = section.getTarget();
    const target = uiTarget === 'form' ? 'form_config' : uiTarget;
    this._dbg('sectionChanged', sectionName, data, 'target=', target);
    this._setStatus('Updating…');

    if (sectionName === 'description') {
      pySection = 'project';
    }

    if (sectionName === 'output') {
      try {
        const raw = await this._kernel.exec(updateSection('output', data, target));
        const state = JSON.parse(extractJson(raw));
        this._applyStatePartial(state, sectionName);
        void this._updateSummary();
        this._setStatus('Ready');
      } catch (e: any) {
        this._setStatus(`Error: ${String(e.message ?? e)}`, true);
      }
      return;
    }

    try {
      const raw = await this._kernel.exec(updateSection(pySection, data, target));
      const state = JSON.parse(extractJson(raw));
      this._applyStatePartial(state, sectionName);
      void this._updateSummary();
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _resolveConfigDir(preferred: string): Promise<string> {
    try {
      const raw = await this._kernel.exec(checkFileExists(preferred));
      const result = JSON.parse(extractJson(raw));
      if (result.exists) return preferred;
    } catch { /* ignore */ }
    return '.';
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
      '.',
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
    await this._validateAndSave(false);
  }

  async saveAndOpenAnnotator(): Promise<string | null> {
    return this._validateAndSave(true);
  }

  async validateAndOpen(): Promise<string | null> {
    await this._readyPromise;
    if (!this._ready) return null;

    const projectData = this._setup.getData();
    const enabled = [
      projectData.project_enabled && projectData.project_path,
      projectData.config_enabled && projectData.config_path,
      projectData.form_enabled && projectData.form_path,
    ].filter(Boolean);

    if (enabled.length === 0) {
      this._setStatus('Enable at least one output file in Setup section', true);
      return null;
    }

    this._setStatus('Validating…');
    try {
      const vRaw = await this._kernel.exec(validateConfig());
      const vResult = JSON.parse(extractJson(vRaw));
      const msgs: string[] = [];
      if (vResult.errors?.length) msgs.push('Errors:\n• ' + vResult.errors.join('\n• '));
      if (vResult.warnings?.length) msgs.push('Warnings:\n• ' + vResult.warnings.join('\n• '));
      if (!vResult.valid) {
        await showDialog({ title: 'Validation Failed', body: msgs.join('\n\n') });
        this._setStatus('Validation failed', true);
        return null;
      }
      if (msgs.length > 0) {
        const choice = await showDialog({
          title: 'Validation Warnings',
          body: msgs.join('\n\n'),
          buttons: [
            { label: 'Cancel' },
            { label: 'Open Anyway', primary: true },
          ],
        });
        if (choice !== 'Open Anyway') {
          this._setStatus('Cancelled', false, true);
          return null;
        }
      }
    } catch (e: any) {
      this._setStatus(`Validation error: ${String(e.message ?? e)}`, true);
      return null;
    }

    const path = (projectData.project_enabled && projectData.project_path) ||
      (projectData.config_enabled && projectData.config_path) ||
      (projectData.form_enabled && projectData.form_path) || '';
    this._setStatus('Ready');
    return path || null;
  }

  async refreshActive(): Promise<void> {
    const { path } = this._activeFilePath();
    if (!path) {
      this._setStatus('No active file to refresh', true);
      return;
    }
    await this._onLoadConfig(path);
  }

  private _activeFilePath(): { path: string; label: string } {
    const d = this._setup.getData();
    if (d.project_enabled && d.project_path) return { path: d.project_path, label: 'project' };
    if (d.config_enabled && d.config_path) return { path: d.config_path, label: 'config' };
    if (d.form_enabled && d.form_path) return { path: d.form_path, label: 'form' };
    return { path: '', label: '' };
  }

  private async _confirmAndRefresh(): Promise<void> {
    const { path } = this._activeFilePath();
    if (!path) {
      this._setStatus('No active file to reload', true);
      return;
    }
    const choice = await showDialog({
      title: 'Reload YAML',
      body: 'Reloading will erase unsaved changes. Continue?',
      buttons: [
        { label: 'Cancel' },
        { label: 'Reload', primary: true },
      ],
    });
    if (choice !== 'Reload') return;
    await this._onLoadConfig(path);
  }

  get isProjectConfigured(): boolean {
    const d = this._setup.getData();
    return !!(d.project_enabled && d.project_path);
  }

  private async _validateAndSave(blockOnErrors: boolean): Promise<string | null> {
    await this._readyPromise;
    if (!this._ready) return null;

    const projectData = this._setup.getData();
    const enabled = [
      projectData.project_enabled && projectData.project_path,
      projectData.config_enabled && projectData.config_path,
      projectData.form_enabled && projectData.form_path,
    ].filter(Boolean);

    if (enabled.length === 0) {
      this._setStatus('Enable at least one output file in Setup section', true);
      return null;
    }

    this._setStatus('Validating…');
    try {
      const vRaw = await this._kernel.exec(validateConfig());
      const vResult = JSON.parse(extractJson(vRaw));
      const msgs: string[] = [];
      if (vResult.errors?.length) msgs.push('Errors:\n• ' + vResult.errors.join('\n• '));
      if (vResult.warnings?.length) msgs.push('Warnings:\n• ' + vResult.warnings.join('\n• '));
      if (!vResult.valid) {
        if (blockOnErrors) {
          await showDialog({ title: 'Validation Failed', body: msgs.join('\n\n') });
          this._setStatus('Save cancelled — validation errors', true);
          return null;
        }
        const choice = await showDialog({
          title: 'Validation Failed',
          body: msgs.join('\n\n'),
          buttons: [
            { label: 'Cancel' },
            { label: 'Save Anyway', primary: true },
          ],
        });
        if (choice !== 'Save Anyway') {
          this._setStatus('Save cancelled', false, true);
          return null;
        }
      } else if (msgs.length > 0) {
        const choice = await showDialog({
          title: 'Validation Warnings',
          body: msgs.join('\n\n'),
          buttons: [
            { label: 'Cancel' },
            { label: 'Save Anyway', primary: true },
          ],
        });
        if (choice !== 'Save Anyway') {
          this._setStatus('Save cancelled', false, true);
          return null;
        }
      }
    } catch (e: any) {
      this._setStatus(`Validation error: ${String(e.message ?? e)}`, true);
      return null;
    }

    const checkPath = (projectData.project_enabled && projectData.project_path) ||
      (projectData.config_enabled && projectData.config_path) || '';
    if (checkPath) {
      try {
        const existsRaw = await this._kernel.exec(checkFileExists(checkPath));
        const exists = JSON.parse(extractJson(existsRaw)).exists as boolean;
        if (exists) {
          const choice = await showDialog({
            title: 'Overwrite Files?',
            body: 'Configuration files already exist at the specified paths.',
            buttons: [
              { label: 'Cancel' },
              { label: 'Overwrite', primary: true },
            ],
          });
          if (choice !== 'Overwrite') return null;
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
      for (const cb of this._dirtyCallbacks) cb();
      return this._savedPath;
    } catch (e: any) {
      this._setStatus(`Save failed: ${String(e.message ?? e)}`, true);
      return null;
    }
  }

  private _applyStatePartial(state: any, skipSection: string): void {
    this._yamls = {
      project_yaml: state.project_yaml || '',
      config_yaml: state.config_yaml || '',
      form_yaml: state.form_yaml || '',
    };
    const wasDirty = this._dirty;
    this._dirty = !!state.dirty;
    this._savedPath = state.saved_path || '';
    this._yamlPanel.updateYaml(this._yamls);
    if (this._dirty !== wasDirty) {
      for (const cb of this._dirtyCallbacks) cb();
    }
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
        this._setup.setData(proj);
        const targets = state.section_targets || {};

        if (proj.project_name) {
          this._app.setProjectName(proj.project_name);
        }

        const mergedData = this._resolveSectionData('data', targets, proj, conf);
        if (mergedData) this._data.setData(mergedData);
        const mergedAudio = this._resolveSectionData('audio', targets, proj, conf);
        if (mergedAudio) this._audio.setData(mergedAudio);

        const mergedOutput = this._resolveSectionData('output', targets, proj, conf);
        const outputData: Record<string, any> = mergedOutput ? { ...mergedOutput } : {};
        const outputPath = proj.output?.path || proj.output_path;
        if (outputPath) outputData.path = outputPath;
        if (Object.keys(outputData).length > 0) this._output.setData(outputData);

        const appSource = targets.app === 'config' ? { ...proj, ...conf } : proj;
        this._app.setData(appSource);

        const descData: Record<string, any> = {};
        for (const src of [proj, conf]) {
          if (src.description) descData.description = src.description;
          if (src.description_title) descData.description_title = src.description_title;
          if (src.description_text) descData.description_text = src.description_text;
          if (src.description_path) descData.description_path = src.description_path;
          if (src.description_open !== undefined) descData.description_open = src.description_open;
          if (src.description_height) descData.description_height = src.description_height;
        }
        if (Object.keys(descData).length > 0) this._description.setData(descData);
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

      void this._updateSummary();
    } finally {
      this._suppressChanges = false;
    }
    for (const cb of this._dirtyCallbacks) cb();
  }

  get dirty(): boolean {
    return this._dirty;
  }

  get kernel(): KernelBridge {
    return this._kernel;
  }

  onProjectStateChanged(cb: () => void): void {
    this._setup.projectEnabledChanged.connect(() => cb());
    this._setup.changed.connect(() => cb());
  }

  onAnyChanged(cb: () => void): void {
    for (const [, section] of this._sections) {
      section.changed.connect(() => cb());
    }
    this._dirtyCallbacks.push(cb);
  }

  get cwd(): string {
    return this._resolvedCwd || this._kernel.cwd || '.';
  }

  onCwdReady(cb: (cwd: string) => void): void {
    if (this._resolvedCwd) {
      cb(this._resolvedCwd);
    } else {
      this._cwdCallbacks.push(cb);
    }
  }

  async setCwd(newDir: string): Promise<string | null> {
    await this._readyPromise;
    if (!this._ready) return null;
    try {
      const raw = await this._kernel.exec(changeCwd(newDir));
      const result = JSON.parse(extractJson(raw));
      this._resolvedCwd = result.cwd || '';
      return result.cwd as string;
    } catch (e: any) {
      this._setStatus(`chdir failed: ${String(e.message ?? e)}`, true);
      return null;
    }
  }

  browseDirectory(startDir: string, onSelect: (path: string) => void): void {
    this._openBrowser(startDir, [], onSelect, true);
  }

  private async _onListTemplates(): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(listTemplates());
      const items = JSON.parse(extractJson(raw)).templates || [];
      this._setup.setTemplateList(items);
    } catch (e: any) {
      this._setStatus(`Failed to list templates: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onLoadTemplate(name: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(loadTemplate(name));
      const tpl = JSON.parse(extractJson(raw)).template || {};
      this._setup.setTemplate(name, tpl);
    } catch (e: any) {
      this._setStatus(`Failed to load template: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onApplyTemplate(payload: {
    name: string; scope: string; projectName: string; values: Record<string, string>;
  }): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Applying template…');
    try {
      const raw = await this._kernel.exec(
        applyTemplate(payload.name, payload.scope, payload.projectName, payload.values),
      );
      const state = JSON.parse(extractJson(raw));
      this._applyState(state);
      const dataPath = this._data.getPath();
      if (dataPath && /\.(csv|parquet|json|jsonl|tsv)$/i.test(dataPath)) {
        void this._onLoadColumns(dataPath);
      }
    } catch (e: any) {
      this._setStatus(`Template failed: ${String(e.message ?? e)}`, true);
      return;
    }
    // Reuse the standard validate → overwrite-prompt → save flow.
    const saved = await this._validateAndSave(true);
    if (saved) {
      this._setup.resetTemplateForm();
      this._setup.close();
      this._setStatus(`Created ${payload.projectName} — ${saved}`);
    }
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
      const dataPath = this._data.getPath();
      if (dataPath && /\.(csv|parquet|json|jsonl|tsv)$/i.test(dataPath)) {
        void this._onLoadColumns(dataPath);
      }
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
        await showDialog({ title: 'Validation Passed', body: 'No issues found.' });
      } else if (result.valid) {
        this._setStatus('Validation passed with warnings', false, true);
        await showDialog({ title: 'Validation Passed', body: msgs.join('\n\n') });
      } else {
        this._setStatus('Validation failed', true);
        await showDialog({ title: 'Validation Failed', body: msgs.join('\n\n') });
      }
    } catch (e: any) {
      this._setStatus(`Validate error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onProjectEnabledChanged(_enabled: boolean): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(updateSection('project', this._setup.getData()));
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
    this._output.setTargetOptions(splitOpts);
    this._app.setTargetOptions(baseOpts);
    this._description.setTargetOptions(baseOpts);

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

  private async _updateSummary(): Promise<void> {
    if (!this._ready) return;
    try {
      const raw = await this._kernel.exec(getSummary());
      const sections = JSON.parse(extractJson(raw));
      this._summary.update(sections);
    } catch { /* ignore summary errors */ }
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

  private _setStatus(msg: string, error = false, warning = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : warning ? COLORS.yellow : COLORS.green;
  }
}
