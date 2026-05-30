import { Signal } from '@lumino/signaling';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class OutputSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _pathInput: HTMLInputElement;
  private _indexColInput: HTMLInputElement;
  private _uriInput: HTMLInputElement;
  private _syncBtnCb: HTMLInputElement;
  private _syncLabelInput: HTMLInputElement;
  private _recursiveCb: HTMLInputElement;
  private _secrets: SecretsEditor;

  constructor() {
    super('Output', 'output', false, true, ['split', 'project', 'config']);

    this._indexColInput = this._makeInput('e.g. id', '150px');
    this._indexColInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('index_column', this._indexColInput, true));

    const pathRow = this._makeRow();
    pathRow.addEventListener('focusin', () => this.fieldFocused.emit('output path'));
    pathRow.addEventListener('click', () => this.fieldFocused.emit('output path'));
    pathRow.appendChild(this._makeLabel('path'));
    this._pathInput = this._makeInput('outputs/my_project.csv', '200px');
    this._pathInput.addEventListener('input', () => this._emitChanged());
    const browseBtn = this._makeButton('Browse');
    browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    pathRow.append(this._pathInput, browseBtn);
    this._body.appendChild(pathRow);

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

  setOutputPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
  }

  getOutputPath(): string {
    return this._pathInput.value;
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._pathInput.value) result.path = this._pathInput.value;
    if (this._indexColInput.value) result.index_column = this._indexColInput.value;
    if (this._uriInput.value) result.uri = this._uriInput.value;
    if (this._syncBtnCb.checked) {
      result.sync_button = this._syncLabelInput.value || true;
    }
    if (this._recursiveCb.checked) result.recursive = true;
    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;
    return result;
  }

  setColumnOptions(_cols: string[]): void {
    // Output index_column is free-form text (may differ from data columns)
  }

  setData(data: Record<string, any>): void {
    if (data.path) this._pathInput.value = data.path;
    if (data.index_column) this._indexColInput.value = data.index_column;
    if (data.uri || data.url) this._uriInput.value = data.uri || data.url;
    if (data.sync_button) {
      this._syncBtnCb.checked = true;
      if (typeof data.sync_button === 'string') this._syncLabelInput.value = data.sync_button;
    }
    if (data.recursive) this._recursiveCb.checked = true;
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }
}
