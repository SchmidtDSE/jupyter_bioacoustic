import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

export class ProjectSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, { field: string; current: string }>(this);

  private _nameInput: HTMLInputElement;
  private _saveBtnCb: HTMLInputElement;

  private _projectCb: HTMLInputElement;
  private _configCb: HTMLInputElement;
  private _formCb: HTMLInputElement;

  private _projectPathInput: HTMLInputElement;
  private _configPathInput: HTMLInputElement;
  private _formPathInput: HTMLInputElement;

  private _projectBrowseBtn: HTMLButtonElement;
  private _configBrowseBtn: HTMLButtonElement;
  private _formBrowseBtn: HTMLButtonElement;

  constructor() {
    super('Project', 'project', true);

    this._nameInput = this._makeInput('e.g. Bird Review', '250px');
    this._nameInput.addEventListener('input', () => {
      this._updateDefaultPaths();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('project_name', this._nameInput));

    const { row, input } = this._makeCheckbox('project_save_btn');
    this._saveBtnCb = input;
    this._saveBtnCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(row);

    const sep = document.createElement('div');
    sep.style.cssText = `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    this._body.appendChild(sep);

    const pathLabel = document.createElement('div');
    pathLabel.textContent = 'Output files';
    pathLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
    this._body.appendChild(pathLabel);

    const pathHint = document.createElement('div');
    pathHint.textContent =
      'Check which files to create. With all 3, project references config and config references form. ' +
      'Uncheck config to inline everything into project. Uncheck form to embed form_config as a dict in config. ' +
      'Only need one file? Uncheck the others and everything gets inlined.';
    pathHint.style.cssText = `color:${COLORS.textSubtle};font-size:10px;line-height:1.4;margin-bottom:4px;`;
    this._body.appendChild(pathHint);

    const pRow = this._makeFileRow('project');
    this._projectCb = pRow.cb;
    this._projectPathInput = pRow.input;
    this._projectBrowseBtn = pRow.btn;
    this._body.appendChild(pRow.row);

    const cRow = this._makeFileRow('config');
    this._configCb = cRow.cb;
    this._configPathInput = cRow.input;
    this._configBrowseBtn = cRow.btn;
    this._body.appendChild(cRow.row);

    const fRow = this._makeFileRow('form');
    this._formCb = fRow.cb;
    this._formPathInput = fRow.input;
    this._formBrowseBtn = fRow.btn;
    this._body.appendChild(fRow.row);
  }

  private _makeFileRow(field: string): {
    row: HTMLDivElement; cb: HTMLInputElement; input: HTMLInputElement; btn: HTMLButtonElement;
  } {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.cssText = `accent-color:${COLORS.blue};flex-shrink:0;`;

    const lbl = document.createElement('label');
    lbl.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;min-width:70px;`;
    const lblText = document.createElement('span');
    lblText.textContent = field;
    lblText.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    lbl.append(cb, lblText);

    const defaults: Record<string, string> = {
      project: 'config/projects/',
      config: 'config/application/',
      form: 'config/forms/',
    };

    const inp = this._makeInput(`${defaults[field]}my_project.yaml`, '180px');
    inp.addEventListener('input', () => this._emitChanged());

    const btn = this._makeButton('Browse');
    btn.addEventListener('click', () => {
      this.browseRequested.emit({ field, current: inp.value || '.' });
    });

    cb.addEventListener('change', () => {
      inp.disabled = !cb.checked;
      btn.disabled = !cb.checked;
      inp.style.opacity = cb.checked ? '1' : '0.4';
      btn.style.opacity = cb.checked ? '1' : '0.4';
      this._emitChanged();
    });

    row.append(lbl, inp, btn);
    row.addEventListener('focusin', () => this.fieldFocused.emit(`${field} file`));
    return { row, cb, input: inp, btn };
  }

  private _updateDefaultPaths(): void {
    const name = this._nameInput.value.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const update = (inp: HTMLInputElement, defaultDir: string) => {
      if (!inp.value || inp.value.includes('/')) {
        const cur = inp.value;
        const dir = cur ? cur.replace(/[^/]+$/, '') : defaultDir;
        inp.value = `${dir}${slug}.yaml`;
      }
    };

    update(this._projectPathInput, 'config/projects/');
    update(this._configPathInput, 'config/application/');
    update(this._formPathInput, 'config/forms/');
  }

  setProjectPath(path: string): void {
    this._projectPathInput.value = path;
    this._emitChanged();
  }

  setConfigPath(path: string): void {
    this._configPathInput.value = path;
    this._emitChanged();
  }

  setFormPath(path: string): void {
    this._formPathInput.value = path;
    this._emitChanged();
  }

  getData(): Record<string, any> {
    return {
      project_name: this._nameInput.value || undefined,
      project_save_btn: this._saveBtnCb.checked || undefined,
      project_enabled: this._projectCb.checked,
      config_enabled: this._configCb.checked,
      form_enabled: this._formCb.checked,
      project_path: this._projectCb.checked ? (this._projectPathInput.value || undefined) : undefined,
      config_path: this._configCb.checked ? (this._configPathInput.value || undefined) : undefined,
      form_path: this._formCb.checked ? (this._formPathInput.value || undefined) : undefined,
    };
  }

  setData(data: Record<string, any>): void {
    if (data.project_name !== undefined) this._nameInput.value = data.project_name;
    if (data.project_save_btn !== undefined) this._saveBtnCb.checked = !!data.project_save_btn;
    if (data.project_path) this._projectPathInput.value = data.project_path;
    if (data.config_path) this._configPathInput.value = data.config_path;
    if (data.form_path) this._formPathInput.value = data.form_path;
    if (data.project_enabled !== undefined) {
      this._projectCb.checked = !!data.project_enabled;
      this._projectPathInput.disabled = !this._projectCb.checked;
      this._projectBrowseBtn.disabled = !this._projectCb.checked;
    }
    if (data.config_enabled !== undefined) {
      this._configCb.checked = !!data.config_enabled;
      this._configPathInput.disabled = !this._configCb.checked;
      this._configBrowseBtn.disabled = !this._configCb.checked;
    }
    if (data.form_enabled !== undefined) {
      this._formCb.checked = !!data.form_enabled;
      this._formPathInput.disabled = !this._formCb.checked;
      this._formBrowseBtn.disabled = !this._formCb.checked;
    }
  }
}
