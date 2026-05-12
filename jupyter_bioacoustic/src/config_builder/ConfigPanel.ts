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
      section.fieldFocused.connect((_, field) => this._yamlPanel.scrollToField(field));
      section.changed.connect(() => void this._onSectionChanged(name));
      left.appendChild(section.element);
    }

    this._form.changed.connect(() => this._updateSummary());

    for (const sec of [this._data, this._audio, this._output]) {
      sec.targetChanged.connect((_, { section, target }) => {
        void this._onTargetChanged(section, target);
      });
    }
    left.appendChild(this._summary.element);

    this._project.browseRequested.connect((_, { field, current }) => {
      this._openBrowser(current, ['.yaml', '.yml'], (p) => {
        if (field === 'project') this._project.setProjectPath(p);
        else if (field === 'config') this._project.setConfigPath(p);
        else if (field === 'form') this._project.setFormPath(p);
      });
    });

    this._project.projectEnabledChanged.connect((_, enabled) => {
      void this._onProjectEnabledChanged(enabled);
    });
    this._project.loadConfigRequested.connect((_, path) => void this._onLoadConfig(path));
    this._project.loadBrowseRequested.connect(() => {
      this._openBrowser('.', ['.yaml', '.yml', '.json'], (p) => {
        this._project.setLoadPath(p);
        void this._onLoadConfig(p);
      });
    });

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

    this._output.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, ['.csv', '.parquet', '.json', '.tsv'], (p) => this._output.setPath(p));
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

    this.element.append(left, this._yamlPanel.element);

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `font-size:11px;color:${COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

    this._readyPromise = this._ensureReady();
  }

  private async _ensureReady(): Promise<void> {
    this._setStatus('Initializing…');
    try {
      await this._kernel.exec(ensureSetup(this._kernel.cwd));
      this._ready = true;
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Init failed: ${String(e.message ?? e)}`, true);
    }
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

    this._setStatus(`Saving ${enabled.length} file(s)…`);
    try {
      const raw = await this._kernel.exec(saveAll());
      const state = JSON.parse(extractJson(raw));
      this._dirty = false;
      const paths = state.saved_paths || {};
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
        this._project.setData(state.project);
        const targets = state.section_targets || {};
        const dataSource = targets.data === 'config' ? (state.config || {}) : state.project;
        const audioSource = targets.audio === 'config' ? (state.config || {}) : state.project;
        const outputSource = targets.output === 'config' ? (state.config || {}) : state.project;

        if (dataSource.data && typeof dataSource.data === 'object') {
          this._data.setData(dataSource.data);
        }
        if (audioSource.audio && typeof audioSource.audio === 'object') {
          this._audio.setData(audioSource.audio);
        }
        if (outputSource.output && typeof outputSource.output === 'object') {
          this._output.setData(outputSource.output);
        }
        const appSource = targets.app === 'config' ? { ...state.project, ...(state.config || {}) } : state.project;
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
      }

      this._updateSummary();
    } finally {
      this._suppressChanges = false;
    }
  }

  get dirty(): boolean {
    return this._dirty;
  }

  private async _onLoadConfig(path: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus(`Loading ${path}…`);
    try {
      const raw = await this._kernel.exec(loadConfig(path));
      const state = JSON.parse(extractJson(raw));
      this._applyState(state);
      const detected = state.detected_type || 'config';
      const paths = state.loaded_paths || {};
      const loaded = Object.values(paths).filter(Boolean);
      this._setStatus(`Loaded as ${detected}: ${loaded.join(', ')}`);
    } catch (e: any) {
      this._setStatus(`Load failed: ${String(e.message ?? e)}`, true);
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

  private async _onProjectEnabledChanged(enabled: boolean): Promise<void> {
    const newTarget = enabled ? 'project' : 'config';
    for (const sec of [this._data, this._audio, this._output]) {
      sec.setTarget(newTarget);
    }
    await this._readyPromise;
    if (!this._ready) return;
    for (const name of ['data', 'audio', 'output', 'app']) {
      try {
        const raw = await this._kernel.exec(setSectionTarget(name, newTarget));
        const state = JSON.parse(extractJson(raw));
        this._yamls = {
          project_yaml: state.project_yaml || '',
          config_yaml: state.config_yaml || '',
          form_yaml: state.form_yaml || '',
        };
        this._yamlPanel.updateYaml(this._yamls);
      } catch { /* ignore */ }
    }
  }

  private async _onTargetChanged(section: string, target: string): Promise<void> {
    await this._readyPromise;
    if (!this._ready) return;
    this._setStatus('Updating target…');
    try {
      const raw = await this._kernel.exec(setSectionTarget(section, target));
      const state = JSON.parse(extractJson(raw));
      this._applyStatePartial(state, section);
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private _updateSummary(): void {
    this._summary.update({
      project: this._project.getData(),
      data: this._data.getData(),
      audio: this._audio.getData(),
      output: this._output.getData(),
      app: this._app.getData(),
      form: this._form.getData(),
    });
  }

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : COLORS.green;
  }
}
