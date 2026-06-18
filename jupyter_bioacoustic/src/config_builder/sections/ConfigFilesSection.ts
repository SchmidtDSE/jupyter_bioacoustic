/**
 * ConfigFilesSection
 *
 * Manages the project's output files (project / config / form): the enable
 * checkbox, linked naming, Duplicate / Rename, and per-file Lock. Owns the
 * `'project'` config routing (its getData feeds update_section('project')).
 *
 * Split out of SetupSection so the tabbed project entry (Create / Template /
 * Load) and the file management read as distinct sections.
 *
 * License: BSD 3-Clause
 */
import { Signal } from '@lumino/signaling';
import { COLORS, lockIconSvg } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';


//
// Constants
//
export interface FileLockStates { project: boolean; config: boolean; form: boolean; }

const FILE_TYPES = ['project', 'config', 'form'] as const;
const DIR_MAP: Record<string, string> = {
  project: 'annotator_config/projects',
  config: 'annotator_config/config',
  form: 'annotator_config/forms',
};


//
// Public
//
export class ConfigFilesSection extends CollapsibleSection {
  readonly projectEnabledChanged = new Signal<this, boolean>(this);
  readonly fileStatesChanged = new Signal<this, { project: boolean; config: boolean; form: boolean }>(this);
  readonly lockStatesChanged = new Signal<this, FileLockStates>(this);

  private _active = false;
  private _locked = true;
  private _linked = true;

  private _linkedToggle!: HTMLButtonElement;
  private _linkedNameEl!: HTMLElement;
  private _linkedNameInput!: HTMLInputElement;

  private _projectCb!: HTMLInputElement;
  private _configCb!: HTMLInputElement;
  private _formCb!: HTMLInputElement;
  private _lockBtns: Record<string, HTMLButtonElement> = {};
  private _fileLocked: Record<string, boolean> = { project: false, config: false, form: false };
  private _projectPathEl!: HTMLSpanElement;
  private _configPathEl!: HTMLSpanElement;
  private _formPathEl!: HTMLSpanElement;
  private _projectPathInput!: HTMLInputElement;
  private _configPathInput!: HTMLInputElement;
  private _formPathInput!: HTMLInputElement;
  private _duplicateBtn!: HTMLButtonElement;

  constructor() {
    super('Configuration Files', 'project', true);
    this._buildBody();
    this.setEnabled(false);
  }


  //
  // Public API
  //
  setEnabled(enabled: boolean): void {
    this._body.style.opacity = enabled ? '1' : '0.4';
    this._body.style.pointerEvents = enabled ? '' : 'none';
  }

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

  getLockStates(): FileLockStates {
    return {
      project: this._fileLocked.project,
      config: this._fileLocked.config,
      form: this._fileLocked.form,
    };
  }

  /** Initialize default paths for a freshly-created project (from its name). */
  initFromCreate(name: string): void {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    this._active = true;
    this._locked = true;
    this._linked = true;
    this.setEnabled(true);
    this._linkedToggle.disabled = true;
    this._linkedNameEl.textContent = this._titlize(slug);
    this._linkedNameInput.value = this._titlize(slug);
    this._setPaths(slug);
    this._updateLinkedToggle();
    this._applyLockState();
    this._emitFileStates();
    this._emitChanged();
  }

  activateFromLoad(name: string): void {
    this._active = true;
    this._locked = true;
    this._linked = true;
    this.setEnabled(true);

    const projFile = this._filename(this._projectPathInput.value);
    const confFile = this._filename(this._configPathInput.value);
    const formFile = this._filename(this._formPathInput.value);

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
    return {
      project_enabled: this._projectCb.checked,
      config_enabled: this._configCb.checked,
      form_enabled: this._formCb.checked,
      project_path: this._projectCb.checked ? (this._projectPathInput.value.trim() || undefined) : undefined,
      config_path: this._configCb.checked ? (this._configPathInput.value.trim() || undefined) : undefined,
      form_path: this._formCb.checked ? (this._formPathInput.value.trim() || undefined) : undefined,
      project_locked: this._fileLocked.project,
      config_locked: this._fileLocked.config,
      form_locked: this._fileLocked.form,
    };
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

    for (const ft of FILE_TYPES) {
      this._fileLocked[ft] = !!data[`${ft}_locked`];
      if (this._lockBtns[ft]) this._renderLockBtn(ft);
    }

    if (data.project_path || data.config_path || data.form_path) {
      this.activateFromLoad(data.project_name || '');
    }
  }


  //
  // Internal — UI
  //
  private _buildBody(): void {
    const help = document.createElement('div');
    help.style.cssText =
      `color:${COLORS.textMuted};font-size:11px;line-height:1.5;margin-bottom:4px;`;
    help.innerHTML =
      `A project is saved as up to three files — <b>project</b>, <b>config</b>, and <b>form</b>. ` +
      `Use the controls below to manage them:` +
      `<ul style="margin:4px 0 0 0;padding-left:16px;">` +
      `<li><b>Checkbox</b> — whether that file is written as a separate file (uncheck to inline it into its parent).</li>` +
      `<li><b>Linked</b> — keep all three filenames in sync from one name; unlink to set each path independently.</li>` +
      `<li><b>Duplicate / Rename</b> — unlock the paths to save under new filenames. Saving writes the new files and leaves the originals untouched — your chance to start a copy from an existing config.</li>` +
      `<li><b>Lock</b> (per file) — that file won't be saved and its fields are disabled, so you can't overwrite it.</li>` +
      `</ul>`;
    this._body.appendChild(help);

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
    this._linkedNameEl.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;

    this._linkedNameInput = this._makeInput('linked name', '160px');
    this._linkedNameInput.style.display = 'none';
    this._linkedNameInput.addEventListener('input', () => {
      if (this._linked && !this._locked) this._applyLinkedName();
      this._emitChanged();
    });

    linkedRow.append(this._linkedToggle, this._linkedNameEl, this._linkedNameInput);
    this._body.appendChild(linkedRow);

    for (const ft of FILE_TYPES) this._body.appendChild(this._buildFileRow(ft));

    this._duplicateBtn = this._makeButton('Duplicate / Rename');
    this._duplicateBtn.style.cssText += `margin-top:4px;align-self:flex-start;`;
    this._duplicateBtn.addEventListener('click', () => this._onDuplicateOrLock());
    this._body.appendChild(this._duplicateBtn);

    this._updateLinkedToggle();
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

    // Lock button — left of the checkbox; independent of the enable checkbox.
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.style.cssText =
      `background:none;border:none;cursor:pointer;padding:0;display:flex;` +
      `align-items:center;flex-shrink:0;color:${COLORS.textMuted};`;
    this._lockBtns[fileType] = lockBtn;
    this._renderLockBtn(fileType);
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
    lblText.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    lbl.append(cb, lblText);

    const pathEl = document.createElement('span');
    pathEl.textContent = '—';
    pathEl.style.cssText =
      `color:${COLORS.textMuted};font-size:12px;font-family:monospace;` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

    const pathInput = this._makeInput(`${DIR_MAP[fileType]}/<name>.yaml`, '200px');
    pathInput.style.display = 'none';
    pathInput.addEventListener('input', () => {
      pathEl.textContent = pathInput.value;
      this._emitChanged();
    });

    row.append(lockBtn, lbl, pathEl, pathInput);
    row.addEventListener('focusin', () => this.fieldFocused.emit(`${fileType} file`));

    if (fileType === 'project') {
      this._projectCb = cb;
      this._projectPathEl = pathEl;
      this._projectPathInput = pathInput;
      cb.addEventListener('change', () => this.projectEnabledChanged.emit(cb.checked));
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

  private _renderLockBtn(fileType: string): void {
    const btn = this._lockBtns[fileType];
    const locked = this._fileLocked[fileType];
    btn.innerHTML = lockIconSvg(locked, 14);
    btn.style.color = locked ? COLORS.lockAmber : COLORS.textMuted;
    btn.title = locked
      ? `Unlock ${fileType} file`
      : `Lock ${fileType} file — won't be saved and its fields are disabled`;
  }


  //
  // Internal — actions
  //
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
      this._duplicateBtn.textContent = 'Duplicate / Rename';
    }
    this._applyLockState();
  }

  private _setPaths(slug: string): void {
    const set = (input: HTMLInputElement, el: HTMLSpanElement, p: string) => {
      input.value = p; el.textContent = p;
    };
    set(this._projectPathInput, this._projectPathEl, `${DIR_MAP.project}/${slug}.yaml`);
    set(this._configPathInput, this._configPathEl, `${DIR_MAP.config}/${slug}.yaml`);
    set(this._formPathInput, this._formPathEl, `${DIR_MAP.form}/${slug}.yaml`);
  }

  private _applyLinkedName(): void {
    const raw = this._linkedNameInput.value.trim();
    if (!raw) return;
    this._setPaths(raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
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

  private _emitFileStates(): void {
    this.fileStatesChanged.emit({
      project: this._projectCb.checked,
      config: this._configCb.checked,
      form: this._formCb.checked,
    });
  }


  //
  // Internal — helpers
  //
  private _filename(path: string): string {
    return (path || '').split('/').pop() || '';
  }

  private _titlize(slug: string): string {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
