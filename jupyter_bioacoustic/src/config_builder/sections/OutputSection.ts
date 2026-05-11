import { Signal } from '@lumino/signaling';
import { CollapsibleSection } from './CollapsibleSection';

export class OutputSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _pathInput: HTMLInputElement;
  private _browseBtn: HTMLButtonElement;
  private _uriInput: HTMLInputElement;
  private _syncBtnCb: HTMLInputElement;
  private _syncLabelInput: HTMLInputElement;
  private _recursiveCb: HTMLInputElement;

  constructor() {
    super('Output', 'output');

    const pathRow = this._makeRow();
    pathRow.appendChild(this._makeLabel('path'));
    this._pathInput = this._makeInput('outputs/reviews.csv', '200px');
    this._pathInput.addEventListener('input', () => this._emitChanged());
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    pathRow.append(this._pathInput, this._browseBtn);
    this._body.appendChild(pathRow);

    this._uriInput = this._makeInput('s3://bucket/reviews.csv', '250px');
    this._uriInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('sync uri', this._uriInput));

    const { row: syncRow, input: syncCb } = this._makeCheckbox('sync_button');
    this._syncBtnCb = syncCb;
    this._syncBtnCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(syncRow);

    this._syncLabelInput = this._makeInput('Sync', '150px');
    this._syncLabelInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('sync label', this._syncLabelInput));

    const { row: recRow, input: recCb } = this._makeCheckbox('recursive');
    this._recursiveCb = recCb;
    this._recursiveCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(recRow);
  }

  setPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._pathInput.value) result.path = this._pathInput.value;
    if (this._uriInput.value) result.uri = this._uriInput.value;
    if (this._syncBtnCb.checked) {
      result.sync_button = this._syncLabelInput.value || true;
    }
    if (this._recursiveCb.checked) result.recursive = true;
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.path) this._pathInput.value = data.path;
    if (data.uri || data.url) this._uriInput.value = data.uri || data.url;
    if (data.sync_button) {
      this._syncBtnCb.checked = true;
      if (typeof data.sync_button === 'string') this._syncLabelInput.value = data.sync_button;
    }
    if (data.recursive) this._recursiveCb.checked = true;
  }
}
