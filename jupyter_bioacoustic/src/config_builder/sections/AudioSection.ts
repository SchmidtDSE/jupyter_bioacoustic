import { Signal } from '@lumino/signaling';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class AudioSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _sourceType: HTMLSelectElement;
  private _valueInput: HTMLInputElement;
  private _colSelect: HTMLSelectElement;
  private _colInput: HTMLInputElement;
  private _browseBtn: HTMLButtonElement;
  private _pathRow: HTMLDivElement;
  private _prefixInput: HTMLInputElement;
  private _suffixInput: HTMLInputElement;
  private _fallbackInput: HTMLInputElement;
  private _secrets: SecretsEditor;
  private _availableCols: string[] = [];

  constructor() {
    super('Audio', 'audio', false, true, ['split', 'project', 'config']);

    this._sourceType = this._makeSelect(['path', 'url/uri', 'column'], 'path');
    this._sourceType.addEventListener('change', () => {
      this._updateValueUI();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));

    this._pathRow = this._makeRow();
    this._pathRow.addEventListener('focusin', () => this.fieldFocused.emit('value'));
    this._pathRow.addEventListener('click', () => this.fieldFocused.emit('value'));
    this._pathRow.appendChild(this._makeLabel('value', true));
    this._valueInput = this._makeInput('audio/recording.flac', '200px');
    this._valueInput.addEventListener('input', () => this._emitChanged());
    this._colSelect = this._makeSelect([], '');
    this._colSelect.style.display = 'none';
    this._colSelect.addEventListener('change', () => this._emitChanged());
    this._colInput = this._makeInput('column name', '150px');
    this._colInput.style.display = 'none';
    this._colInput.addEventListener('input', () => this._emitChanged());
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._valueInput.value || '.');
    });
    this._pathRow.append(this._valueInput, this._colSelect, this._colInput, this._browseBtn);
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

    this._secrets = new SecretsEditor(true);
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
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
    const pending = this._colInput.value.trim();
    if (pending && cols.includes(pending)) {
      this._colSelect.value = pending;
    }
    this._updateValueUI();
  }

  private _updateValueUI(): void {
    const sourceType = this._sourceType.value;
    const isCol = sourceType === 'column';
    const hasCols = this._availableCols.length > 0;
    this._valueInput.style.display = isCol ? 'none' : '';
    this._colSelect.style.display = (isCol && hasCols) ? '' : 'none';
    this._colInput.style.display = (isCol && !hasCols) ? '' : 'none';
    this._browseBtn.style.display = (sourceType === 'path') ? '' : 'none';
  }

  getData(): Record<string, any> {
    const uiType = this._sourceType.value;
    const result: Record<string, any> = {};
    let val = uiType === 'column'
      ? (this._availableCols.length > 0 ? this._colSelect.value : this._colInput.value.trim())
      : this._valueInput.value;

    if (val && uiType === 'url/uri') {
      // Auto-detect protocol and choose url (http/https) vs uri (s3, gs, ...)
      const hasProtocol = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(val);
      if (!hasProtocol) {
        // Default to https:// if no protocol specified
        val = `https://${val}`;
      }
      result.source_type =
        (val.startsWith('https://') || val.startsWith('http://')) ? 'url' : 'uri';
      result.value = val;
    } else if (val) {
      // 'path' or 'column' map directly to source_type
      result.source_type = uiType;
      result.value = val;
    }

    if (this._prefixInput.value) result.prefix = this._prefixInput.value;
    if (this._suffixInput.value) result.suffix = this._suffixInput.value;
    if (this._fallbackInput.value) result.fallback = this._fallbackInput.value;
    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;
    return result;
  }

  setData(data: Record<string, any>): void {
    // Current form: source_type + value. Legacy form: an explicit
    // path/url/uri/column key (still loadable).
    if (data.value !== undefined || data.source_type) {
      const st = data.source_type;
      if (st === 'column') {
        this._sourceType.value = 'column';
        this._colInput.value = data.value ?? '';
        if (this._availableCols.includes(data.value)) {
          this._colSelect.value = data.value;
        }
      } else if (st === 'url' || st === 'uri') {
        this._sourceType.value = 'url/uri';
        this._valueInput.value = data.value ?? '';
      } else {
        // 'path' or a falsey/auto source_type
        this._sourceType.value = 'path';
        this._valueInput.value = data.value ?? '';
      }
    }
    else if (data.path) { this._sourceType.value = 'path'; this._valueInput.value = data.path; }
    else if (data.url || data.uri) {
      this._sourceType.value = 'url/uri';
      this._valueInput.value = data.url || data.uri;
    }
    else if (data.column) {
      this._sourceType.value = 'column';
      this._colInput.value = data.column;
      if (this._availableCols.includes(data.column)) {
        this._colSelect.value = data.column;
      }
    }
    if (data.prefix) this._prefixInput.value = data.prefix;
    if (data.suffix) this._suffixInput.value = data.suffix;
    if (data.fallback) this._fallbackInput.value = data.fallback;
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
    this._updateValueUI();
  }
}
