/**
 * The config builder's main panel: composes the sections, the docs / YAML pane and the
 * summary; forwards every section change to the kernel-side ``ConfigBuilder`` and applies the
 * state it returns.
 *
 * Kernel calls go through ``BuilderKernel.call`` (builderKernel.ts); the sections and the
 * logic spanning all of them are in builderSections.ts, the validate / save flows in
 * saveFlow.ts, state helpers in builderState.ts, and the file-browser overlay / resize handle
 * in panelChrome.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { KernelBridge } from '../kernel';
import { errorMessage, showDialog } from '../util';
import { BuilderKernel } from './builderKernel';
import { BuilderSections } from './builderSections';
import { activeFilePath, withYamlExt } from './builderState';
import {
  AUDIO_EXTS, CONFIG_DIRS, DATA_EXTS, DATA_FILE_RE, DESCRIPTION_EXTS, ITEMS_FILE_EXTS,
  OUTPUT_EXTS, YAML_EXTS,
} from './constants';
import { makeResizeHandle, openFileBrowserOverlay } from './panelChrome';
import {
  AudioCheckReply, BuilderState, ColumnsReply, TemplateSummary, applyTemplate, checkAudioUrl,
  checkFileExists, getSummary, listTemplates, loadConfig, loadTemplate, readColumns,
  readColumnsFromSource, saveSingleFile, setSectionTarget, updateConfigFromYaml, updateSection,
} from './python';
import { SaveFlow } from './saveFlow';
import { CollapsibleSection } from './sections/CollapsibleSection';
import { ConfigSummary, SummarySection } from './sections/ConfigSummary';
import type { SourceLoadRequest } from './sections/DataSection';
import type { TemplateApplyRequest } from './sections/TemplateForm';
import { StatusLine } from './statusLine';
import type { YamlTexts } from './types';
import { YamlPanel } from './YamlPanel';


//
// Constants
//
const MAX_STATUS_LABEL = 60;


//
// Public
//
export class ConfigPanel {
  readonly element: HTMLDivElement;

  private _bk: BuilderKernel;
  private _status = new StatusLine();
  private _saveFlow: SaveFlow;
  private _yamlPanel: YamlPanel;
  private _s = new BuilderSections();
  private _yamls: YamlTexts = { project_yaml: '', config_yaml: '', form_yaml: '' };
  private _dirty = false;
  private _savedPath = '';
  private _suppressChanges = false;
  private _dirtyCallbacks: Array<() => void> = [];

  private _summary = new ConfigSummary();

  /** @param kernel - The builder widget's kernel (setup starts immediately). */
  constructor(kernel: KernelBridge) {
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

    this.element.append(left, makeResizeHandle(this._yamlPanel.element), this._yamlPanel.element);

    this._bk = new BuilderKernel(kernel, this._status);
    this._saveFlow = new SaveFlow(this._bk, this._status, () => this._s.configFiles.getData());
  }

  /** The status message element (placed in the widget header). */
  get statusEl(): HTMLSpanElement {
    return this._status.element;
  }

  /** Unsaved changes in the kernel-side builder. */
  get dirty(): boolean {
    return this._dirty;
  }

  /** The builder's kernel. */
  get kernel(): KernelBridge {
    return this._bk.bridge;
  }

  /** Whether an enabled project file with a path is configured (Open Annotator shown). */
  get isProjectConfigured(): boolean {
    const d = this._s.configFiles.getData();
    return !!(d.project_enabled && d.project_path);
  }

  /** Run ``cb`` with the kernel's cwd once known. */
  onCwdReady(cb: (cwd: string) => void): void {
    this._bk.onCwdReady(cb);
  }

  /** Call ``cb`` on any section change and whenever the dirty flag may have changed. */
  onAnyChanged(cb: () => void): void {
    for (const section of this._s.all.values()) {
      section.changed.connect(() => cb());
    }
    this._dirtyCallbacks.push(cb);
  }

  /** ``chdir`` the kernel; resolves to the new cwd or null. */
  async setCwd(newDir: string): Promise<string | null> {
    return this._bk.setCwd(newDir);
  }

  /** Pick a folder with the overlay file browser. */
  browseDirectory(startDir: string, onSelect: (path: string) => void): void {
    this._openBrowser(startDir, [], onSelect, true);
  }

  /** Validate and report the result. */
  async validate(): Promise<void> {
    await this._saveFlow.validate();
  }

  /** Validate (letting the user save despite errors) and save. */
  async saveToFile(): Promise<void> {
    await this._validateAndSave(false);
  }

  /** Validate (errors block) and save; resolves to the file to open, or null. */
  async saveAndOpenAnnotator(): Promise<string | null> {
    return this._validateAndSave(true);
  }

  /** Validate the unchanged files before opening; resolves to the file to open, or null. */
  async validateAndOpen(): Promise<string | null> {
    return this._saveFlow.validateForOpen();
  }

  private _wireSection(name: string, section: CollapsibleSection): void {
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
  private _wireSetup(): void {
    this._s.setup.browseRequested.connect((_, { field }) => {
      if (field === 'project' || field === 'config' || field === 'form') {
        void this._resolveConfigDir(CONFIG_DIRS[field]).then(dir => {
          this._openBrowser(dir, YAML_EXTS, (p) => this._s.setup.setLoadPath(p));
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
  private _wireSources(): void {
    this._s.data.fileLoadRequested.connect((_, path) => void this._onLoadColumns(path));
    this._s.data.sourceLoadRequested.connect((_, req) => void this._onLoadSourceColumns(req));
    this._s.data.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, DATA_EXTS, (p) => this._s.data.setPath(p));
    });
    this._s.data.columnsLoaded.connect((_, cols) => {
      this._s.app.setColumnOptions(cols);
      this._s.audio.setColumnOptions(cols);
      this._s.output.setColumnOptions(cols);
    });

    this._s.audio.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, AUDIO_EXTS, (p) => this._s.audio.setPath(p));
    });
    this._s.audio.validateRequested.connect((_, value) => void this._onValidateAudio(value));

    this._s.output.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, OUTPUT_EXTS, (p) => this._s.output.setOutputPath(p));
    });
    this._s.app.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, [], (p) => this._s.app.setCaptureDir(p), true);
    });
    this._s.description.browseRequested.connect((_, dir) => {
      this._openBrowser(dir, DESCRIPTION_EXTS, (p) => this._s.description.setDescriptionPath(p));
    });
    this._s.form.browseRequested.connect((_, { callback }) => {
      this._openBrowser('.', ITEMS_FILE_EXTS, callback);
    });
    this._s.form.columnsRequested.connect((_, { path, callback }) => {
      void this._bk.call(readColumns(path), null, (r: ColumnsReply) => callback(r.columns));
    });
  }

  private async _onSectionChanged(sectionName: string): Promise<void> {
    if (this._suppressChanges) return;
    await this._bk.ready;
    if (!this._bk.isReady) return;
    const section = this._s.all.get(sectionName);
    if (!section) return;

    const data = section.getData();
    const uiTarget = section.getTarget();
    const target = uiTarget === 'form' ? 'form_config' : uiTarget;
    this._bk.dbg('sectionChanged', sectionName, data, 'target=', target);
    this._status.set('Updating…');
    await this._bk.run(updateSection(sectionName, data, target), 'Error', (state: BuilderState) => {
      this._applyStatePartial(state);
      void this._updateSummary();
      this._status.set('Ready');
    });
  }

  private async _onProjectEnabledChanged(): Promise<void> {
    await this._bk.call(
      updateSection('project', this._s.configFiles.getData()), null,
      (state: BuilderState) => this._applyStatePartial(state),
    );
  }

  private async _onTargetChanged(section: string, target: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set('Updating target…');
    const pyTarget = target === 'form' ? 'form_config' : target;
    await this._bk.run(setSectionTarget(section, pyTarget), 'Error', (state: BuilderState) => {
      this._applyStatePartial(state);
      this._applyFileLocks();
      this._status.set('Ready');
    });
  }

  /** ``preferred`` if it exists in the kernel's cwd, else ``.``. */
  private async _resolveConfigDir(preferred: string): Promise<string> {
    const exists = await this._bk.run(
      checkFileExists(preferred), null, (r: { exists: boolean }) => r.exists);
    return exists ? preferred : '.';
  }

  private _openBrowser(
    dir: string,
    extensions: readonly string[],
    onSelect: (path: string) => void,
    dirOnly = false,
  ): void {
    openFileBrowserOverlay(this.element, this._bk.bridge, {
      dir, extensions, dirOnly,
      onSelect: (path) => {
        onSelect(path);
        this._status.set(`Selected: ${path}`);
      },
    });
  }

  private async _saveSingleFile(configType: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set(`Saving ${configType} file…`);
    await this._bk.run(saveSingleFile(configType), 'Save failed', (r: { saved_to: string }) => {
      this._status.set(`Saved: ${r.saved_to}`);
    });
  }

  private async _onLoadColumns(pathOrDir: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set('Loading columns…');
    await this._bk.run(readColumns(pathOrDir), 'Error', (r: ColumnsReply) => {
      this._s.data.setDetectedColumns(r.columns);
      this._status.set(`${r.columns.length} columns loaded`);
    });
  }

  /** Load the data columns for ``path`` if it is a data file (after a load / template). */
  private _loadDataColumnsIfFile(): void {
    const dataPath = this._s.data.getPath();
    if (dataPath && DATA_FILE_RE.test(dataPath)) {
      void this._onLoadColumns(dataPath);
    }
  }

  private async _onLoadSourceColumns(req: SourceLoadRequest): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    const label = this._shortLabel(req.value);
    this._status.set(`Loading ${label}…`);
    await this._bk.run(
      readColumnsFromSource(req.sourceType, req.value, req.secrets),
      (e) => {
        this._s.data.setDetectedColumns([]);
        this._s.data.setLoadStatus(false);
        this._status.set(`Load failed: ${errorMessage(e)}`, 'error');
      },
      (r: ColumnsReply) => {
        const cols = r.columns || [];
        this._s.data.setDetectedColumns(cols);
        this._s.data.setLoadStatus(true);
        this._status.set(`Loaded ${cols.length} columns from ${label}`);
      },
    );
  }

  private async _onValidateAudio(value: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set(`Checking ${this._shortLabel(value)}…`);
    await this._bk.run(
      checkAudioUrl(value),
      (e) => {
        this._s.audio.setValidateStatus(false);
        this._status.set(`Audio not reachable: ${errorMessage(e)}`, 'error');
      },
      (info: AudioCheckReply) => {
        const parts: string[] = [];
        if (typeof info.duration === 'number') parts.push(_fmtDuration(info.duration));
        parts.push(`${info.sample_rate} Hz`);
        if ((info.channels ?? 0) > 1) parts.push(`${info.channels} ch`);
        this._s.audio.setValidateStatus(true);
        this._status.set(`Audio reachable — ${parts.join(' · ')}`);
      },
    );
  }

  private async _onYamlEdited(yaml: string, configType: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set('Applying edits…');
    await this._bk.run(updateConfigFromYaml(yaml, configType), 'Error', (state: BuilderState) => {
      if (state.update_ok) {
        this._applyState(state);
        this._status.set('Config updated');
      } else {
        this._status.set('Invalid YAML', 'error');
      }
    });
  }

  private async _confirmAndRefresh(): Promise<void> {
    const { path } = activeFilePath(this._s.configFiles.getData());
    if (!path) {
      this._status.set('No active file to reload', 'error');
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

  private async _validateAndSave(blockOnErrors: boolean): Promise<string | null> {
    return this._saveFlow.validateAndSave(blockOnErrors, (state) => {
      this._dirty = false;
      const paths = state.saved_paths || {};
      this._bk.dbg('saved', paths);
      const savedList = Object.values(paths).join(', ');
      // open the project file when it's enabled, even if locked (not rewritten, but it exists)
      const active = activeFilePath(this._s.configFiles.getData()).path;
      this._savedPath =
        (active && withYamlExt(active)) || paths.project || paths.config || paths.form || '';
      this._status.set(`Saved: ${savedList}`);
      for (const cb of this._dirtyCallbacks) cb();
      return this._savedPath;
    });
  }

  private async _onListTemplates(): Promise<void> {
    await this._bk.call(
      listTemplates(), 'Failed to list templates',
      (r: { templates?: TemplateSummary[] }) => this._s.setup.setTemplateList(r.templates || []),
    );
  }

  private async _onTemplateColumns(path: string): Promise<void> {
    // a bad/missing path just leaves the dropdown empty
    await this._bk.call(readColumns(path), null, (r: ColumnsReply) => {
      this._s.setup.setTemplateColumns(path, r.columns || []);
    });
  }

  private async _onLoadTemplate(name: string): Promise<void> {
    await this._bk.call(
      loadTemplate(name), 'Failed to load template',
      (r: { template?: Record<string, any> }) => this._s.setup.setTemplate(name, r.template || {}),
    );
  }

  private async _onApplyTemplate(payload: TemplateApplyRequest): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._status.set('Applying template…');
    const applied = await this._bk.run(
      applyTemplate(payload.name, payload.scope, payload.projectName, payload.values),
      'Template failed',
      (state: BuilderState) => {
        this._applyState(state);
        this._loadDataColumnsIfFile();
        return true;
      },
    );
    if (!applied) return;
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

  private async _onLoadConfig(path: string, fileType?: string): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    this._bk.dbg('loadConfig', path, fileType);
    this._status.set(`Loading ${path}…`);
    await this._bk.run(
      loadConfig(path, fileType),
      (e) => {
        const msg = errorMessage(e);
        const fnf = msg.match(/FileNotFoundError:\s*(.+)/);
        this._status.set(fnf ? `File not found: ${fnf[1]}` : `Load failed: ${msg}`, 'error');
      },
      (state: BuilderState) => {
        this._applyState(state);
        this._loadDataColumnsIfFile();
        this._reportLoaded(state);
      },
    );
  }

  /** Status after a load: what was loaded, plus referenced files that weren't found. */
  private _reportLoaded(state: BuilderState): void {
    const detected = state.detected_type || 'config';
    const paths = state.loaded_paths || {};
    const loaded = Object.values(paths).filter(Boolean);
    const projectData = state.project || {};
    const missing: string[] = [];
    for (const ft of ['config', 'form'] as const) {
      if (projectData[`${ft}_enabled`] && projectData[`${ft}_path`] && !paths[ft]) {
        missing.push(`${ft} not found: ${projectData[`${ft}_path`]}`);
      }
    }
    const warn = missing.length ? ` (⚠ ${missing.join(', ')})` : '';
    this._status.set(`Loaded as ${detected}: ${loaded.join(', ')}${warn}`,
      missing.length > 0 ? 'error' : 'ok');
  }

  /** Take the kernel's YAML previews and dirty flag (after an edit; sections untouched). */
  private _applyStatePartial(state: BuilderState): void {
    this._setYamls(state);
    const wasDirty = this._dirty;
    this._dirty = !!state.dirty;
    this._savedPath = state.saved_path || '';
    if (this._dirty !== wasDirty) {
      for (const cb of this._dirtyCallbacks) cb();
    }
  }

  /** Replace every section's contents with a loaded / applied state. */
  private _applyState(state: BuilderState): void {
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
    } finally {
      this._suppressChanges = false;
    }
    this._applyFileLocks();
    for (const cb of this._dirtyCallbacks) cb();
  }

  private _setYamls(state: BuilderState): void {
    this._yamls = {
      project_yaml: state.project_yaml || '',
      config_yaml: state.config_yaml || '',
      form_yaml: state.form_yaml || '',
    };
    this._yamlPanel.updateYaml(this._yamls);
  }

  private _applyFileLocks(): void {
    this._s.applyFileLocks(this._bk.routingKeys);
  }

  private async _updateSummary(): Promise<void> {
    if (!this._bk.isReady) return;
    await this._bk.run(getSummary(), null, (sections: SummarySection[]) => {
      this._summary.update(sections);
    });
  }

  /** ``value`` cut to the status line's width. */
  private _shortLabel(value: string): string {
    return value.length > MAX_STATUS_LABEL ? value.slice(0, MAX_STATUS_LABEL - 3) + '…' : value;
  }
}


//
// Internal
//
/** ``sec`` as "1h 2m" / "3m 4s" / "5s". */
function _fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${rem}s`;
  return `${rem}s`;
}
