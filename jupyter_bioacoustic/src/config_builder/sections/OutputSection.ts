import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class OutputSection extends CollapsibleSection {
  private _uriInput: HTMLInputElement;
  private _syncBtnCb: HTMLInputElement;
  private _syncLabelInput: HTMLInputElement;
  private _recursiveCb: HTMLInputElement;
  private _secrets: SecretsEditor;

  constructor() {
    super('Output', 'output', false, true);

    this._uriInput = this._makeInput('s3://bucket/reviews.csv', '250px');
    this._uriInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('sync_uri', this._uriInput));

    const { row: syncRow, input: syncCb } = this._makeCheckbox('sync_button');
    this._syncBtnCb = syncCb;
    this._syncBtnCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(syncRow);

    this._syncLabelInput = this._makeInput('Sync', '150px');
    this._syncLabelInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('sync_label', this._syncLabelInput));

    const { row: recRow, input: recCb } = this._makeCheckbox('recursive');
    this._recursiveCb = recCb;
    this._recursiveCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(recRow);

    this._secrets = new SecretsEditor(true);
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._uriInput.value) result.uri = this._uriInput.value;
    if (this._syncBtnCb.checked) {
      result.sync_button = this._syncLabelInput.value || true;
    }
    if (this._recursiveCb.checked) result.recursive = true;
    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.uri || data.url) this._uriInput.value = data.uri || data.url;
    if (data.sync_button) {
      this._syncBtnCb.checked = true;
      if (typeof data.sync_button === 'string') this._syncLabelInput.value = data.sync_button;
    }
    if (data.recursive) this._recursiveCb.checked = true;
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }
}
