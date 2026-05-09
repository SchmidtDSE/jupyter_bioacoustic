import { CollapsibleSection } from './CollapsibleSection';

export class ProjectSection extends CollapsibleSection {
  private _nameInput: HTMLInputElement;
  private _saveBtnCb: HTMLInputElement;

  constructor() {
    super('Project', 'project', true);

    this._nameInput = this._makeInput('e.g. Bird Review', '250px');
    this._nameInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('project_name', this._nameInput));

    const { row, input } = this._makeCheckbox('project_save_btn');
    this._saveBtnCb = input;
    this._saveBtnCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(row);
  }

  getData(): Record<string, any> {
    return {
      project_name: this._nameInput.value || undefined,
      project_save_btn: this._saveBtnCb.checked || undefined,
    };
  }

  setData(data: Record<string, any>): void {
    if (data.project_name !== undefined) this._nameInput.value = data.project_name;
    if (data.project_save_btn !== undefined) this._saveBtnCb.checked = !!data.project_save_btn;
  }
}
