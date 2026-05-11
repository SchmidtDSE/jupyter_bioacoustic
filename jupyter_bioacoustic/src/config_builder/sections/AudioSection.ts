import { Signal } from '@lumino/signaling';
import { CollapsibleSection } from './CollapsibleSection';

export class AudioSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _sourceType: HTMLSelectElement;
  private _valueInput: HTMLInputElement;
  private _colSelect: HTMLSelectElement;
  private _browseBtn: HTMLButtonElement;
  private _pathRow: HTMLDivElement;
  private _prefixInput: HTMLInputElement;
  private _suffixInput: HTMLInputElement;
  private _fallbackInput: HTMLInputElement;
  private _secretInput: HTMLInputElement;
  private _availableCols: string[] = [];

  constructor() {
    super('Audio', 'audio', false, true);

    this._sourceType = this._makeSelect(['path', 'url', 'column'], 'path');
    this._sourceType.addEventListener('change', () => {
      this._updateValueUI();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('source type', this._sourceType));

    this._pathRow = this._makeRow();
    this._pathRow.appendChild(this._makeLabel('value'));
    this._valueInput = this._makeInput('audio/recording.flac', '200px');
    this._valueInput.addEventListener('input', () => this._emitChanged());
    this._colSelect = this._makeSelect([], '');
    this._colSelect.style.display = 'none';
    this._colSelect.addEventListener('change', () => this._emitChanged());
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._valueInput.value || '.');
    });
    this._pathRow.append(this._valueInput, this._colSelect, this._browseBtn);
    this._body.appendChild(this._pathRow);

    this._prefixInput = this._makeInput('optional prefix', '200px');
    this._prefixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('prefix', this._prefixInput));

    this._suffixInput = this._makeInput('optional suffix', '200px');
    this._suffixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('suffix', this._suffixInput));

    this._fallbackInput = this._makeInput('fallback path', '200px');
    this._fallbackInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('fallback', this._fallbackInput));

    this._secretInput = this._makeInput('API key or token', '200px');
    this._secretInput.type = 'password';
    this._secretInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('secret', this._secretInput));
  }

  setPath(path: string): void {
    this._valueInput.value = path;
    this._emitChanged();
  }

  setColumnOptions(cols: string[]): void {
    this._availableCols = cols;
    this._colSelect.innerHTML = '';
    for (const col of cols) {
      const o = document.createElement('option');
      o.value = col; o.textContent = col;
      this._colSelect.appendChild(o);
    }
    this._updateValueUI();
  }

  private _updateValueUI(): void {
    const isCol = this._sourceType.value === 'column';
    this._valueInput.style.display = isCol ? 'none' : '';
    this._colSelect.style.display = isCol ? '' : 'none';
    this._browseBtn.style.display = (this._sourceType.value === 'path') ? '' : 'none';
  }

  getData(): Record<string, any> {
    const sourceKey = this._sourceType.value;
    const result: Record<string, any> = {};
    const val = sourceKey === 'column' ? this._colSelect.value : this._valueInput.value;
    if (val) result[sourceKey] = val;
    if (this._prefixInput.value) result.prefix = this._prefixInput.value;
    if (this._suffixInput.value) result.suffix = this._suffixInput.value;
    if (this._fallbackInput.value) result.fallback = this._fallbackInput.value;
    if (this._secretInput.value) result.secret = this._secretInput.value;
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.path) { this._sourceType.value = 'path'; this._valueInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._valueInput.value = data.url; }
    else if (data.column) { this._sourceType.value = 'column'; this._colSelect.value = data.column; }
    if (data.prefix) this._prefixInput.value = data.prefix;
    if (data.suffix) this._suffixInput.value = data.suffix;
    if (data.fallback) this._fallbackInput.value = data.fallback;
    if (data.secret) this._secretInput.value = data.secret;
    this._updateValueUI();
  }
}
