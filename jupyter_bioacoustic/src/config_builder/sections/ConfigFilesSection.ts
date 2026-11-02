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
import { Signal } from '@lumino/signaling';
import { COLORS, lockIconSvg } from '../../styles';
import { slugify } from '../../util';
import { CONFIG_DIRS, CONFIG_FILE_TYPES, YAML_FILE_RE } from '../constants';
import { makeButton, makeInput } from '../dom';
import { CONFIG_FILES_HELP } from '../text';
import type { ConfigFileType, ConfigFilesData, FileFlags } from '../types';
import { CollapsibleSection } from './CollapsibleSection';


//
// Types
//
/** The controls of one file row. */
interface FileRow {
  checkbox: HTMLInputElement;
  /** Read-only path display (shown while the paths are locked). */
  pathEl: HTMLSpanElement;
  /** Editable path (shown after Duplicate). */
  pathInput: HTMLInputElement;
  lockBtn: HTMLButtonElement;
}


//
// Public
//
export class ConfigFilesSection extends CollapsibleSection {
  /** The project file's enable checkbox changed. */
  readonly projectEnabledChanged = new Signal<this, boolean>(this);
  /** Which files are enabled (drives the other sections' target options). */
  readonly fileStatesChanged = new Signal<this, FileFlags>(this);
  /** A file was locked / unlocked. */
  readonly lockStatesChanged = new Signal<this, FileFlags>(this);

  private _active = false;
  private _locked = true;
  private _linked = true;

  private _linkedToggle!: HTMLButtonElement;
  private _linkedNameEl!: HTMLElement;
  private _linkedNameInput!: HTMLInputElement;
  private _rows = {} as Record<ConfigFileType, FileRow>;
  private _fileLocked: FileFlags = { project: false, config: false, form: false };
  private _duplicateBtn!: HTMLButtonElement;

  constructor() {
    super('Configuration Files', 'project', false);
    this._buildBody();
    this.setEnabled(false);
  }

  /** Grey out the section until a project is created or loaded. */
  setEnabled(enabled: boolean): void {
    this._body.style.opacity = enabled ? '1' : '0.4';
    this._body.style.pointerEvents = enabled ? '' : 'none';
  }

  /** Which files are locked (won't be saved; their fields are disabled). */
  getLockStates(): FileFlags {
    return { ...this._fileLocked };
  }

  /** Initialize default paths for a freshly-created project (from its name). */
  initFromCreate(name: string): void {
    const slug = slugify(name);
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
  activateFromLoad(name: string): void {
    this._active = true;
    this._locked = true;
    this._linked = true;
    this.setEnabled(true);

    const [projFile, confFile, formFile] =
      CONFIG_FILE_TYPES.map(ft => this._filename(this._rows[ft].pathInput.value));

    const allSame = projFile && projFile === confFile && confFile === formFile;
    if (allSame) {
      this._linked = true;
      this._setLinkedName(this._titlize(projFile.replace(YAML_FILE_RE, '')));
    } else if (name) {
      this._setLinkedName(this._titlize(name));
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

  getData(): ConfigFilesData {
    const enabled = (ft: ConfigFileType) => this._rows[ft].checkbox.checked;
    const path = (ft: ConfigFileType) =>
      enabled(ft) ? (this._rows[ft].pathInput.value.trim() || undefined) : undefined;
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

  override reset(): void {
    for (const ft of CONFIG_FILE_TYPES) this._setPath(ft, '');
    for (const ft of CONFIG_FILE_TYPES) {
      this._rows[ft].checkbox.checked = true;
      this._fileLocked[ft] = false;
      this._renderLockBtn(ft);
    }
  }

  /** Load the ``*_path`` / ``*_enabled`` / ``*_locked`` keys; activates when a path is set. */
  setData(data: Record<string, any>): void {
    for (const ft of CONFIG_FILE_TYPES) {
      const row = this._rows[ft];
      const path = data[`${ft}_path`];
      if (path) {
        row.pathInput.value = path;
        row.pathEl.textContent = path;
      }
      const enabled = data[`${ft}_enabled`];
      if (enabled !== undefined) row.checkbox.checked = !!enabled;
    }

    for (const ft of CONFIG_FILE_TYPES) {
      this._fileLocked[ft] = !!data[`${ft}_locked`];
      this._renderLockBtn(ft);
    }

    if (data.project_path || data.config_path || data.form_path) {
      this.activateFromLoad(data.project_name || '');
    }
  }

  private _buildBody(): void {
    const help = document.createElement('div');
    help.style.cssText =
      `color:${COLORS.textSubtle};font-size:11px;line-height:1.5;margin-bottom:4px;`;
    help.innerHTML = CONFIG_FILES_HELP;
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

    this._linkedNameInput = makeInput('linked name', '160px');
    this._linkedNameInput.style.display = 'none';
    this._linkedNameInput.addEventListener('input', () => {
      if (this._linked && !this._locked) this._applyLinkedName();
      this._emitChanged();
    });

    linkedRow.append(this._linkedToggle, this._linkedNameEl, this._linkedNameInput);
    this._body.appendChild(linkedRow);

    for (const ft of CONFIG_FILE_TYPES) this._body.appendChild(this._buildFileRow(ft));

    this._duplicateBtn = makeButton('Duplicate');
    this._duplicateBtn.style.cssText += `margin-top:4px;align-self:flex-start;`;
    this._duplicateBtn.addEventListener('click', () => this._onDuplicateOrLock());
    this._body.appendChild(this._duplicateBtn);

    this._updateLinkedToggle();
  }

  private _buildFileRow(fileType: ConfigFileType): HTMLDivElement {
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
    if (fileType === 'project') {
      cb.addEventListener('change', () => this.projectEnabledChanged.emit(cb.checked));
    }

    // Lock button — left of the checkbox; independent of the enable checkbox.
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.style.cssText =
      `background:none;border:none;cursor:pointer;padding:0;display:flex;` +
      `align-items:center;flex-shrink:0;color:${COLORS.textMuted};`;
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

    const pathInput = makeInput(`${CONFIG_DIRS[fileType]}/<name>.yaml`, '200px');
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

  private _renderLockBtn(fileType: ConfigFileType): void {
    const btn = this._rows[fileType].lockBtn;
    const locked = this._fileLocked[fileType];
    btn.innerHTML = lockIconSvg(locked, 14);
    btn.style.color = locked ? COLORS.lockAmber : COLORS.textMuted;
    btn.title = locked
      ? `Unlock ${fileType} file`
      : `Lock ${fileType} file — won't be saved and its fields are disabled`;
  }

  /** Duplicate unlocks the paths for editing; clicking again (Lock) freezes them. */
  private _onDuplicateOrLock(): void {
    if (this._locked) {
      this._locked = false;
      this._linkedToggle.disabled = false;
      this._duplicateBtn.textContent = 'Lock';
      const projPath = this._rows.project.pathInput.value;
      if (projPath) {
        this._setLinkedName(this._titlize(this._filename(projPath).replace(YAML_FILE_RE, '')));
      }
    } else {
      this._locked = true;
      this._linkedToggle.disabled = true;
      this._duplicateBtn.textContent = 'Duplicate';
    }
    this._applyLockState();
  }

  /** Set one file's path (input + display) and notify. */
  private _setPath(fileType: ConfigFileType, path: string): void {
    this._rows[fileType].pathInput.value = path;
    this._rows[fileType].pathEl.textContent = path;
    this._emitChanged();
  }

  /** Point all three files at ``<default dir>/<slug>.yaml``. */
  private _setPaths(slug: string): void {
    for (const ft of CONFIG_FILE_TYPES) {
      const p = `${CONFIG_DIRS[ft]}/${slug}.yaml`;
      this._rows[ft].pathInput.value = p;
      this._rows[ft].pathEl.textContent = p;
    }
  }

  private _setLinkedName(name: string): void {
    this._linkedNameEl.textContent = name;
    this._linkedNameInput.value = name;
  }

  private _applyLinkedName(): void {
    const raw = this._linkedNameInput.value.trim();
    if (!raw) return;
    this._setPaths(slugify(raw));
  }

  private _applyLockState(): void {
    const editable = !this._locked && this._active;
    for (const ft of CONFIG_FILE_TYPES) {
      this._rows[ft].pathInput.style.display = editable ? '' : 'none';
      this._rows[ft].pathEl.style.display = editable ? 'none' : '';
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
      project: this._rows.project.checkbox.checked,
      config: this._rows.config.checkbox.checked,
      form: this._rows.form.checkbox.checked,
    });
  }

  private _filename(path: string): string {
    return (path || '').split('/').pop() || '';
  }

  private _titlize(slug: string): string {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
