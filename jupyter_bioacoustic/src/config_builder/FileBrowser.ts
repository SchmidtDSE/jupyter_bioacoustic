import { Signal } from '@lumino/signaling';
import { COLORS, btnStyle } from '../styles';
import { KernelBridge } from '../kernel';
import { extractJson, listFiles, createDirectory } from './python';

interface FileEntry {
  name: string;
  is_dir: boolean;
}

export class FileBrowser {
  readonly element: HTMLDivElement;
  readonly fileSelected = new Signal<this, string>(this);
  readonly dismissed = new Signal<this, void>(this);

  private _kernel: KernelBridge;
  private _cwd: string;
  private _extensions: string[];
  private _dirOnly: boolean;
  private _pathBar: HTMLDivElement;
  private _listEl: HTMLDivElement;
  private _statusEl: HTMLSpanElement;
  private _filenameInput: HTMLInputElement;
  private _confirmBtn: HTMLButtonElement;
  private _footerRow: HTMLDivElement;

  constructor(kernel: KernelBridge, startDir: string, extensions: string[], dirOnly = false) {
    this._kernel = kernel;
    this._cwd = startDir || '.';
    this._extensions = extensions;
    this._dirOnly = dirOnly;

    this.element = document.createElement('div');
    this.element.style.cssText =
      `position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;` +
      `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};border-radius:6px;` +
      `box-shadow:0 8px 24px rgba(0,0,0,0.5);overflow:hidden;`;

    const header = document.createElement('div');
    header.style.cssText =
      `display:flex;align-items:center;gap:8px;padding:8px 12px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    const title = document.createElement('span');
    title.textContent = dirOnly ? 'Select Folder' : 'Browse Files';
    title.style.cssText = `font-size:13px;font-weight:700;color:${COLORS.textPrimary};flex:1;`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = btnStyle() + `font-size:12px;padding:2px 8px;`;
    closeBtn.addEventListener('click', () => this.dismissed.emit(void 0));

    header.append(title, closeBtn);

    this._pathBar = document.createElement('div');
    this._pathBar.style.cssText =
      `padding:6px 12px;font-size:11px;color:${COLORS.textSubtle};font-family:monospace;` +
      `background:${COLORS.bgSurface0};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

    this._listEl = document.createElement('div');
    this._listEl.style.cssText =
      `flex:1;overflow-y:auto;display:flex;flex-direction:column;`;

    this._footerRow = document.createElement('div');
    this._footerRow.style.cssText =
      `display:${dirOnly ? 'none' : 'flex'};align-items:center;gap:6px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-top:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    const fnLabel = document.createElement('span');
    fnLabel.textContent = 'Filename:';
    fnLabel.style.cssText = `color:${COLORS.textSubtle};font-size:11px;flex-shrink:0;`;

    this._filenameInput = document.createElement('input');
    this._filenameInput.type = 'text';
    this._filenameInput.placeholder = 'new_file.yaml';
    this._filenameInput.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:3px 6px;` +
      `font-size:11px;flex:1;box-sizing:border-box;`;
    this._filenameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this._confirmFilename();
    });

    this._confirmBtn = document.createElement('button');
    this._confirmBtn.textContent = 'Select';
    this._confirmBtn.style.cssText = btnStyle(true) + `font-size:11px;padding:3px 10px;`;
    this._confirmBtn.addEventListener('click', () => this._confirmFilename());

    this._footerRow.append(fnLabel, this._filenameInput, this._confirmBtn);

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `padding:4px 12px;font-size:11px;color:${COLORS.textMuted};flex-shrink:0;` +
      `background:${COLORS.bgMantle};`;

    this.element.append(header, this._pathBar, this._listEl, this._footerRow, this._statusEl);
    void this._loadDir(this._cwd);
  }

  private async _loadDir(dir: string): Promise<void> {
    this._cwd = dir;
    this._pathBar.textContent = dir;
    this._listEl.innerHTML = '';
    this._statusEl.textContent = 'Loading…';

    try {
      const raw = await this._kernel.exec(listFiles(dir, this._extensions));
      const result = JSON.parse(extractJson(raw));
      const entries = result.files as FileEntry[];
      this._renderEntries(entries);
      this._statusEl.textContent = `${entries.length} items`;
    } catch (e: any) {
      this._statusEl.textContent = `Error: ${String(e.message ?? e)}`;
    }
  }

  private _renderEntries(entries: FileEntry[]): void {
    this._listEl.innerHTML = '';

    if (this._dirOnly) {
      const selectRow = document.createElement('div');
      selectRow.style.cssText =
        `display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;` +
        `font-size:12px;color:${COLORS.green};font-weight:700;` +
        `border-bottom:1px solid ${COLORS.bgSurface0};background:${COLORS.bgSurface0};`;
      selectRow.textContent = `\u2713 Select this folder: ${this._cwd}`;
      selectRow.addEventListener('click', () => {
        this.fileSelected.emit(this._cwd);
      });
      selectRow.addEventListener('mouseenter', () => { selectRow.style.background = COLORS.bgHover; });
      selectRow.addEventListener('mouseleave', () => { selectRow.style.background = COLORS.bgSurface0; });
      this._listEl.appendChild(selectRow);

      const newFolderRow = document.createElement('div');
      newFolderRow.style.cssText =
        `display:flex;align-items:center;gap:6px;padding:4px 12px;` +
        `border-bottom:1px solid ${COLORS.bgSurface0};`;
      const nfInput = document.createElement('input');
      nfInput.type = 'text';
      nfInput.placeholder = 'new folder name';
      nfInput.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:4px;color:${COLORS.textPrimary};padding:3px 6px;` +
        `font-size:11px;flex:1;box-sizing:border-box;`;
      const nfBtn = document.createElement('button');
      nfBtn.textContent = '+ New Folder';
      nfBtn.style.cssText = btnStyle() + `font-size:11px;padding:3px 8px;`;
      const doCreate = async () => {
        const name = nfInput.value.trim();
        if (!name) return;
        const newPath = this._cwd === '.' ? name : `${this._cwd}/${name}`;
        try {
          await this._kernel.exec(createDirectory(newPath));
          void this._loadDir(newPath);
        } catch (e: any) {
          this._statusEl.textContent = `Error: ${String(e.message ?? e)}`;
        }
      };
      nfBtn.addEventListener('click', doCreate);
      nfInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doCreate(); });
      newFolderRow.append(nfInput, nfBtn);
      this._listEl.appendChild(newFolderRow);
    }

    const upRow = this._makeEntryRow('📁', '..', true);
    upRow.addEventListener('click', () => {
      if (this._cwd === '.' || this._cwd === '/' || this._cwd === '') {
        void this._loadDir('..');
      } else {
        const parts = this._cwd.replace(/\/$/, '').split('/');
        parts.pop();
        const parent = parts.length === 0 ? '.' : parts.join('/');
        void this._loadDir(parent);
      }
    });
    this._listEl.appendChild(upRow);

    for (const entry of entries) {
      if (this._dirOnly && !entry.is_dir) continue;
      const icon = entry.is_dir ? '📁' : '📄';
      const row = this._makeEntryRow(icon, entry.name, entry.is_dir);

      if (entry.is_dir) {
        row.addEventListener('click', () => {
          const newPath = this._cwd === '.' ? entry.name : `${this._cwd}/${entry.name}`;
          void this._loadDir(newPath);
        });
      } else {
        row.addEventListener('click', () => {
          const filePath = this._cwd === '.' ? entry.name : `${this._cwd}/${entry.name}`;
          this.fileSelected.emit(filePath);
        });
      }

      this._listEl.appendChild(row);
    }
  }

  private _confirmFilename(): void {
    const name = this._filenameInput.value.trim();
    if (!name) return;
    const filePath = this._cwd === '.' ? name : `${this._cwd}/${name}`;
    this.fileSelected.emit(filePath);
  }

  private _makeEntryRow(icon: string, name: string, isDir: boolean): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText =
      `display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;` +
      `font-size:12px;color:${isDir ? COLORS.blue : COLORS.textPrimary};` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;
    row.addEventListener('mouseenter', () => { row.style.background = COLORS.bgHover; });
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
