import { CollapsibleSection } from './CollapsibleSection';

export class AudioSection extends CollapsibleSection {
  private _sourceType: HTMLSelectElement;
  private _valueInput: HTMLInputElement;
  private _prefixInput: HTMLInputElement;
  private _suffixInput: HTMLInputElement;
  private _fallbackInput: HTMLInputElement;

  constructor() {
    super('Audio', 'audio');

    this._sourceType = this._makeSelect(['path', 'url', 'column'], 'path');
    this._sourceType.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('source type', this._sourceType));

    this._valueInput = this._makeInput('audio/recording.flac', '250px');
    this._valueInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('path / url / col', this._valueInput));

    this._prefixInput = this._makeInput('optional prefix', '200px');
    this._prefixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('prefix', this._prefixInput));

    this._suffixInput = this._makeInput('optional suffix', '200px');
    this._suffixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('suffix', this._suffixInput));

    this._fallbackInput = this._makeInput('fallback path', '200px');
    this._fallbackInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('fallback', this._fallbackInput));
  }

  setColumnOptions(cols: string[]): void {
    if (this._sourceType.value === 'column' && cols.length > 0) {
      this._valueInput.placeholder = cols.join(', ');
    }
  }

  getData(): Record<string, any> {
    const sourceKey = this._sourceType.value;
    const result: Record<string, any> = {};
    if (this._valueInput.value) result[sourceKey] = this._valueInput.value;
    if (this._prefixInput.value) result.prefix = this._prefixInput.value;
    if (this._suffixInput.value) result.suffix = this._suffixInput.value;
    if (this._fallbackInput.value) result.fallback = this._fallbackInput.value;
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.path) { this._sourceType.value = 'path'; this._valueInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._valueInput.value = data.url; }
    else if (data.column) { this._sourceType.value = 'column'; this._valueInput.value = data.column; }
    if (data.prefix) this._prefixInput.value = data.prefix;
    if (data.suffix) this._suffixInput.value = data.suffix;
    if (data.fallback) this._fallbackInput.value = data.fallback;
  }
}
