import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

export class ProjectSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, { field: string; current: string }>(this);
  readonly loadConfigRequested = new Signal<this, { field: string; path: string }>(this);
  readonly projectEnabledChanged = new Signal<this, boolean>(this);
  readonly fileStatesChanged = new Signal<this, { project: boolean; config: boolean; form: boolean }>(this);

  private _nameInput: HTMLInputElement;

  private _projectCb: HTMLInputElement;
  private _configCb: HTMLInputElement;
  private _formCb: HTMLInputElement;

  private _projectPathInput: HTMLInputElement;
  private _configPathInput: HTMLInputElement;
  private _formPathInput: HTMLInputElement;

  private _projectBrowseBtn: HTMLButtonElement;
  private _configBrowseBtn: HTMLButtonElement;
  private _formBrowseBtn: HTMLButtonElement;

  private _projectLoadBtn: HTMLButtonElement;
  private _configLoadBtn: HTMLButtonElement;
  private _formLoadBtn: HTMLButtonElement;

  private _outputPathInput: HTMLInputElement;
  private _outputBrowseBtn: HTMLButtonElement;

  private _descTitleInput: HTMLInputElement;
  private _descTextArea: HTMLTextAreaElement;
  private _descPathInput: HTMLInputElement;
  private _descOpenCb: HTMLInputElement;
  private _descHeightInput: HTMLInputElement;

  constructor() {
    super('Setup', 'project', true);

    this._nameInput = this._makeInput('e.g. Bird Review', '250px');
    this._nameInput.addEventListener('input', () => {
      this._updateDefaultPaths();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('project_name', this._nameInput));

    const sep = document.createElement('div');
    sep.style.cssText = `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    this._body.appendChild(sep);

    const pathLabel = document.createElement('div');
    pathLabel.textContent = 'Configuration File Paths';
    pathLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
    this._body.appendChild(pathLabel);

    const pathHint = document.createElement('div');
    pathHint.textContent =
      'Check which files to create. With all 3, project references config and config references form. ' +
      'Uncheck config to inline everything into project. Uncheck form to embed form_config as a dict in config. ' +
      'Only need one file? Uncheck the others and everything gets inlined.';
    pathHint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;line-height:1.4;margin-bottom:4px;`;
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
    outSep.style.cssText = `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    this._body.appendChild(outSep);

    const outLabel = document.createElement('div');
    outLabel.textContent = 'Output';
    outLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
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
    descSep.style.cssText = `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    this._body.appendChild(descSep);

    const descLabel = document.createElement('div');
    descLabel.textContent = 'Description Panel';
    descLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;`;
    this._body.appendChild(descLabel);

    this._descTitleInput = this._makeInput('', '200px');
    this._descTitleInput.placeholder = 'e.g. Instructions';
    this._descTitleInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('description title', this._descTitleInput));

    this._descTextArea = document.createElement('textarea');
    this._descTextArea.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;` +
      `color:${COLORS.textPrimary};padding:4px 6px;font-size:12px;width:100%;min-height:60px;` +
      `box-sizing:border-box;resize:vertical;font-family:monospace;`;
    this._descTextArea.placeholder = 'Markdown text (or use path for a file)';
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

  private _emitFileStates(): void {
    this.fileStatesChanged.emit({
      project: this._projectCb.checked,
      config: this._configCb.checked,
      form: this._formCb.checked,
    });
  }

  private _makeFileRow(field: string): {
    row: HTMLDivElement; cb: HTMLInputElement; input: HTMLInputElement;
    btn: HTMLButtonElement; loadBtn: HTMLButtonElement;
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
      if (p) this.loadConfigRequested.emit({ field, path: p });
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

    update(this._projectPathInput, 'annotator_config/projects/');
    update(this._configPathInput, 'annotator_config/config/');
    update(this._formPathInput, 'annotator_config/forms/');

    if (!this._outputPathInput.value || this._outputPathInput.value.includes('/')) {
      const cur = this._outputPathInput.value;
      const dir = cur ? cur.replace(/[^/]+$/, '') : 'outputs/';
      this._outputPathInput.value = `${dir}${slug}.csv`;
    }
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

  setCheckedStates(project: boolean, config: boolean, form: boolean): void {
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

  setOutputPath(path: string): void {
    this._outputPathInput.value = path;
    this._emitChanged();
  }

  getOutputPath(): string {
    return this._outputPathInput.value;
  }

  setDescriptionPath(path: string): void {
    this._descPathInput.value = path;
    this._emitChanged();
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {
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
    if (!isNaN(dh) && dh > 0) result.description_height = dh;

    const descTitle = this._descTitleInput.value.trim();
    const descText = this._descTextArea.value;
    const descPath = this._descPathInput.value.trim();
    const descOpen = this._descOpenCb.checked;
    if (descTitle || descText || descPath) {
      const desc: Record<string, any> = {};
      if (descTitle) desc.title = descTitle;
      if (descText) desc.text = descText;
      if (descPath) desc.path = descPath;
      if (!descOpen) desc.open = false;
      result.description = desc;
    }

    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.project_name !== undefined) this._nameInput.value = data.project_name;
    if (data.project_path) this._projectPathInput.value = data.project_path;
    if (data.config_path) this._configPathInput.value = data.config_path;
    if (data.form_path) this._formPathInput.value = data.form_path;
    if (data.output_path) this._outputPathInput.value = data.output_path;
    else if (data.output?.path) this._outputPathInput.value = data.output.path;
    if (data.description_height) this._descHeightInput.value = String(data.description_height);
    if (data.description) {
      const d = typeof data.description === 'object' ? data.description : {};
      if (d.title) this._descTitleInput.value = d.title;
      if (d.text) this._descTextArea.value = d.text;
      if (d.path) this._descPathInput.value = d.path;
      if (d.open === false) this._descOpenCb.checked = false;
    }
    if (data.description_title) this._descTitleInput.value = data.description_title;
    if (data.description_text) this._descTextArea.value = data.description_text;
    if (data.description_path) this._descPathInput.value = data.description_path;
    if (data.description_open === false) this._descOpenCb.checked = false;
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
