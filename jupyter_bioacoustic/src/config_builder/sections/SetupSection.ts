/**
 * SetupSection
 *
 * Two-mode project setup: Create New or Load Existing.
 * Configuration Files subsection with linked/rename/lock workflow.
 *
 * License: BSD 3-Clause
 */
import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';


//
// Constants
//
const MODE_CREATE = 'create';
const MODE_LOAD = 'load';
const FILE_TYPES = ['project', 'config', 'form'] as const;
const DIR_MAP: Record<string, string> = {
  project: 'annotator_config/projects',
  config: 'annotator_config/config',
  form: 'annotator_config/forms',
};


//
// Public
//
export class SetupSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, { field: string; current: string }>(this);
  readonly loadConfigRequested = new Signal<this, { field: string; path: string }>(this);
  readonly projectCreated = new Signal<this, string>(this);
  readonly projectEnabledChanged = new Signal<this, boolean>(this);
  readonly fileStatesChanged = new Signal<this, { project: boolean; config: boolean; form: boolean }>(this);

  private _mode = MODE_CREATE;
  private _active = false;
  private _locked = true;
  private _linked = true;

  private _createTab: HTMLButtonElement;
  private _loadTab: HTMLButtonElement;
  private _createPane: HTMLDivElement;
  private _loadPane: HTMLDivElement;

  private _createNameInput: HTMLInputElement;
  private _createBtn: HTMLButtonElement;

  private _loadTypeSelect: HTMLSelectElement;
  private _loadPathInput: HTMLInputElement;
  private _loadBrowseBtn: HTMLButtonElement;
  private _loadBtn: HTMLButtonElement;

  private _configFilesSection: HTMLDivElement;
  private _linkedToggle: HTMLButtonElement;
  private _linkedNameEl: HTMLElement;
  private _linkedNameInput: HTMLInputElement;

  private _projectCb: HTMLInputElement;
  private _configCb: HTMLInputElement;
  private _formCb: HTMLInputElement;
  private _projectPathEl: HTMLSpanElement;
  private _configPathEl: HTMLSpanElement;
  private _formPathEl: HTMLSpanElement;
  private _projectPathInput: HTMLInputElement;
  private _configPathInput: HTMLInputElement;
  private _formPathInput: HTMLInputElement;

  private _duplicateBtn: HTMLButtonElement;

  constructor() {
    super('Setup', 'project', true);

    const tabBar = this._makeTabBar();
    this._body.appendChild(tabBar);

    this._createPane = this._buildCreatePane();
    this._loadPane = this._buildLoadPane();
    this._loadPane.style.display = 'none';
    this._body.append(this._createPane, this._loadPane);

    this._body.appendChild(this._makeSeparator());

    this._configFilesSection = this._buildConfigFilesSection();
    this._setConfigFilesEnabled(false);
    this._body.appendChild(this._configFilesSection);
  }


  //
  // Public API
  //
  setProjectPath(path: string): void {
    this._projectPathInput.value = path;
    this._projectPathEl.textContent = path;
    this._emitChanged();
  }

  setConfigPath(path: string): void {
    this._configPathInput.value = path;
    this._configPathEl.textContent = path;
    this._emitChanged();
  }

  setFormPath(path: string): void {
    this._formPathInput.value = path;
    this._formPathEl.textContent = path;
    this._emitChanged();
  }

  setCheckedStates(project: boolean, config: boolean, form: boolean): void {
    this._projectCb.checked = project;
    this._configCb.checked = config;
    this._formCb.checked = form;
  }

  activateFromLoad(name: string): void {
    this._active = true;
    this._locked = true;
    this._linked = true;
    this._setConfigFilesEnabled(true);

    const projPath = this._projectPathInput.value;
    const confPath = this._configPathInput.value;
    const formPath = this._formPathInput.value;
    const projFile = this._filename(projPath);
    const confFile = this._filename(confPath);
    const formFile = this._filename(formPath);

    const allSame = projFile && projFile === confFile && confFile === formFile;
    if (allSame) {
      this._linked = true;
      const stem = projFile.replace(/\.(yaml|yml)$/i, '');
      this._linkedNameEl.textContent = this._titlize(stem);
      this._linkedNameInput.value = this._titlize(stem);
    } else if (name) {
      this._linkedNameEl.textContent = this._titlize(name);
      this._linkedNameInput.value = this._titlize(name);
      this._linked = false;
    } else {
      this._linked = false;
      this._linkedNameEl.textContent = '—';
      this._linkedNameInput.value = '';
    }

    this._updateLinkedToggle();
    this._linkedToggle.disabled = true;
    this._applyLockState();
    this._emitFileStates();
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {
      project_enabled: this._projectCb.checked,
      config_enabled: this._configCb.checked,
      form_enabled: this._formCb.checked,
      project_path: this._projectCb.checked ? (this._getProjectPath() || undefined) : undefined,
      config_path: this._configCb.checked ? (this._getConfigPath() || undefined) : undefined,
      form_path: this._formCb.checked ? (this._getFormPath() || undefined) : undefined,
    };
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.project_path) {
      this._projectPathInput.value = data.project_path;
      this._projectPathEl.textContent = data.project_path;
    }
    if (data.config_path) {
      this._configPathInput.value = data.config_path;
      this._configPathEl.textContent = data.config_path;
    }
    if (data.form_path) {
      this._formPathInput.value = data.form_path;
      this._formPathEl.textContent = data.form_path;
    }
    if (data.project_enabled !== undefined) this._projectCb.checked = !!data.project_enabled;
    if (data.config_enabled !== undefined) this._configCb.checked = !!data.config_enabled;
    if (data.form_enabled !== undefined) this._formCb.checked = !!data.form_enabled;

    if (data.project_path || data.config_path || data.form_path) {
      const name = data.project_name || '';
      this.activateFromLoad(name);
    }
  }


  //
  // Internal — UI builders
  //
  private _makeTabBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;gap:0;border-radius:4px;overflow:hidden;border:1px solid ${COLORS.bgSurface1};`;

    this._createTab = document.createElement('button');
    this._createTab.textContent = 'Create New';
    this._createTab.style.cssText = this._tabStyle(true);
    this._createTab.addEventListener('click', () => this._switchMode(MODE_CREATE));

    this._loadTab = document.createElement('button');
    this._loadTab.textContent = 'Load Existing';
    this._loadTab.style.cssText = this._tabStyle(false);
    this._loadTab.addEventListener('click', () => this._switchMode(MODE_LOAD));

    bar.append(this._createTab, this._loadTab);
    return bar;
  }

  private _buildCreatePane(): HTMLDivElement {
    const pane = document.createElement('div');
    pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;`;

    const lbl = this._makeLabel('name');
    lbl.style.minWidth = '40px';
    this._createNameInput = this._makeInput('e.g. Bird Review', '400px');
    this._createNameInput.style.flexShrink = '1';
    this._createNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onCreate();
    });

    this._createBtn = this._makeButton('Create', true);
    this._createBtn.type = 'button';
    this._createBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onCreate(); });

    pane.append(lbl, this._createNameInput, this._createBtn);
    return pane;
  }

  private _buildLoadPane(): HTMLDivElement {
    const pane = document.createElement('div');
    pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;`;

    this._loadTypeSelect = this._makeSelect(['project', 'config', 'form'], 'project');

    this._loadPathInput = this._makeInput('path to configuration file', '400px');
    this._loadPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onLoad(); }
    });

    this._loadBrowseBtn = this._makeButton('Browse');
    this._loadBrowseBtn.type = 'button';
    this._loadBrowseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = this._loadTypeSelect.value;
      const current = this._loadPathInput.value || '.';
      this.browseRequested.emit({ field, current });
    });

    this._loadBtn = this._makeButton('Load', true);
    this._loadBtn.type = 'button';
    this._loadBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onLoad(); });

    pane.append(this._loadTypeSelect, this._loadPathInput, this._loadBrowseBtn, this._loadBtn);
    return pane;
  }

  private _buildConfigFilesSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `display:flex;flex-direction:column;gap:6px;`;

    const header = document.createElement('div');
    header.textContent = 'Configuration Files';
    header.style.cssText =
      `color:${COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
    section.appendChild(header);

    const linkedRow = document.createElement('div');
    linkedRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:4px;`;

    this._linkedToggle = document.createElement('button');
    this._linkedToggle.style.cssText =
      `background:${COLORS.bgSurface1};border:1px solid ${COLORS.bgSurface1};border-radius:4px;` +
      `color:${COLORS.textPrimary};padding:2px 8px;font-size:11px;cursor:pointer;min-width:60px;`;
    this._linkedToggle.disabled = true;
    this._linkedToggle.addEventListener('click', () => {
      this._linked = !this._linked;
      this._updateLinkedToggle();
      this._applyLockState();
      if (this._linked) this._applyLinkedName();
    });

    this._linkedNameEl = document.createElement('span');
    this._linkedNameEl.textContent = '—';
    this._linkedNameEl.style.cssText =
      `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;

    this._linkedNameInput = this._makeInput('linked name', '160px');
    this._linkedNameInput.style.display = 'none';
    this._linkedNameInput.addEventListener('input', () => {
      if (this._linked && !this._locked) this._applyLinkedName();
      this._emitChanged();
    });

    linkedRow.append(this._linkedToggle, this._linkedNameEl, this._linkedNameInput);
    section.appendChild(linkedRow);

    for (const ft of FILE_TYPES) {
      section.appendChild(this._buildFileRow(ft));
    }

    this._duplicateBtn = this._makeButton('Rename');
    this._duplicateBtn.style.cssText += `margin-top:4px;align-self:flex-start;`;
    this._duplicateBtn.addEventListener('click', () => this._onDuplicateOrLock());
    section.appendChild(this._duplicateBtn);

    this._updateLinkedToggle();
    return section;
  }

  private _buildFileRow(fileType: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:6px;`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.cssText = `accent-color:${COLORS.blue};flex-shrink:0;`;
    cb.addEventListener('change', () => {
      this._emitFileStates();
      this._emitChanged();
    });

    const lbl = document.createElement('label');
    lbl.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;min-width:60px;`;
    const lblText = document.createElement('span');
    lblText.textContent = fileType;
    lblText.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    lbl.append(cb, lblText);

    const pathEl = document.createElement('span');
    pathEl.textContent = '—';
    pathEl.style.cssText =
      `color:${COLORS.textMuted};font-size:12px;font-family:monospace;` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

    const pathInput = this._makeInput(`${DIR_MAP[fileType]}/<name>.yaml`, '200px');
    pathInput.style.display = 'none';
    pathInput.addEventListener('input', () => this._emitChanged());

    row.append(lbl, pathEl, pathInput);
    row.addEventListener('focusin', () => this.fieldFocused.emit(`${fileType} file`));

    if (fileType === 'project') {
      this._projectCb = cb;
      this._projectPathEl = pathEl;
      this._projectPathInput = pathInput;
      cb.addEventListener('change', () => {
        this.projectEnabledChanged.emit(cb.checked);
      });
    } else if (fileType === 'config') {
      this._configCb = cb;
      this._configPathEl = pathEl;
      this._configPathInput = pathInput;
    } else {
      this._formCb = cb;
      this._formPathEl = pathEl;
      this._formPathInput = pathInput;
    }

    return row;
  }


  //
  // Internal — actions
  //
  private _switchMode(mode: string): void {
    this._mode = mode;
    this._createTab.style.cssText = this._tabStyle(mode === MODE_CREATE);
    this._loadTab.style.cssText = this._tabStyle(mode === MODE_LOAD);
    this._createPane.style.display = mode === MODE_CREATE ? 'flex' : 'none';
    this._loadPane.style.display = mode === MODE_LOAD ? 'flex' : 'none';
  }

  private _onCreate(): void {
    const name = this._createNameInput.value.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    this._active = true;
    this._locked = true;
    this._linked = true;

    this._setConfigFilesEnabled(true);
    this._linkedToggle.disabled = true;
    this._linkedNameEl.textContent = this._titlize(slug);
    this._linkedNameInput.value = this._titlize(slug);

    const pp = `${DIR_MAP.project}/${slug}.yaml`;
    const cp = `${DIR_MAP.config}/${slug}.yaml`;
    const fp = `${DIR_MAP.form}/${slug}.yaml`;

    this._projectPathInput.value = pp;
    this._projectPathEl.textContent = pp;
    this._configPathInput.value = cp;
    this._configPathEl.textContent = cp;
    this._formPathInput.value = fp;
    this._formPathEl.textContent = fp;

    this._updateLinkedToggle();
    this._applyLockState();
    this._emitFileStates();
    this._emitChanged();
    this.projectCreated.emit(name);
  }

  private _onLoad(): void {
    const path = this._loadPathInput.value.trim();
    if (!path) return;
    const field = this._loadTypeSelect.value;
    this.loadConfigRequested.emit({ field, path });
  }

  private _onDuplicateOrLock(): void {
    if (this._locked) {
      this._locked = false;
      this._linkedToggle.disabled = false;
      this._duplicateBtn.textContent = 'Lock';

      const projPath = this._projectPathInput.value;
      if (projPath) {
        const stem = this._filename(projPath).replace(/\.(yaml|yml)$/i, '');
        this._linkedNameEl.textContent = this._titlize(stem);
        this._linkedNameInput.value = this._titlize(stem);
      }
    } else {
      this._locked = true;
      this._linkedToggle.disabled = true;
      this._duplicateBtn.textContent = 'Rename';
    }
    this._applyLockState();
  }

  private _applyLinkedName(): void {
    const raw = this._linkedNameInput.value.trim();
    if (!raw) return;
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const pp = `${DIR_MAP.project}/${slug}.yaml`;
    const cp = `${DIR_MAP.config}/${slug}.yaml`;
    const fp = `${DIR_MAP.form}/${slug}.yaml`;

    this._projectPathInput.value = pp;
    this._projectPathEl.textContent = pp;
    this._configPathInput.value = cp;
    this._configPathEl.textContent = cp;
    this._formPathInput.value = fp;
    this._formPathEl.textContent = fp;
  }

  private _applyLockState(): void {
    const editable = !this._locked && this._active;

    for (const inp of [this._projectPathInput, this._configPathInput, this._formPathInput]) {
      inp.style.display = editable ? '' : 'none';
    }
    for (const el of [this._projectPathEl, this._configPathEl, this._formPathEl]) {
      el.style.display = editable ? 'none' : '';
    }

    if (editable && this._linked) {
      this._linkedNameInput.style.display = '';
      this._linkedNameEl.style.display = 'none';
    } else {
      this._linkedNameInput.style.display = 'none';
      this._linkedNameEl.style.display = '';
    }
  }

  private _updateLinkedToggle(): void {
    this._linkedToggle.textContent = this._linked ? 'Linked' : 'Unlinked';
    this._linkedToggle.style.background = this._linked ? COLORS.blue : COLORS.bgSurface1;
    this._linkedToggle.style.color = this._linked ? COLORS.bgBase : COLORS.textPrimary;
  }

  private _setConfigFilesEnabled(enabled: boolean): void {
    this._configFilesSection.style.opacity = enabled ? '1' : '0.4';
    this._configFilesSection.style.pointerEvents = enabled ? '' : 'none';
  }

  private _emitFileStates(): void {
    this.fileStatesChanged.emit({
      project: this._projectCb.checked,
      config: this._configCb.checked,
      form: this._formCb.checked,
    });
  }

  setLoadPath(path: string): void {
    this._loadPathInput.value = path;
    this._loadPathInput.focus();
  }

  getLoadType(): string {
    return this._loadTypeSelect.value;
  }


  //
  // Internal — helpers
  //
  private _getProjectPath(): string {
    return this._projectPathInput.value.trim();
  }

  private _getConfigPath(): string {
    return this._configPathInput.value.trim();
  }

  private _getFormPath(): string {
    return this._formPathInput.value.trim();
  }

  private _filename(path: string): string {
    return (path || '').split('/').pop() || '';
  }

  private _titlize(slug: string): string {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private _tabStyle(active: boolean): string {
    return `flex:1;padding:6px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;` +
      `background:${active ? COLORS.blue : 'transparent'};` +
      `color:${active ? COLORS.bgBase : COLORS.textMuted};`;
  }

  private _makeSeparator(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.style.cssText = `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    return sep;
  }
}
