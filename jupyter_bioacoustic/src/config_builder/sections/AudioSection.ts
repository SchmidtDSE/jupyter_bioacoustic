/**
 * Audio section: where each row's audio comes from (``audio:`` — a single path, a url/uri, or
 * a data column per row, plus prefix / suffix / fallback and secrets). A remote value can be
 * checked for reachability (Validate).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { REMOTE_SCHEME_RE } from '../constants';
import { fillSelect, makeButton, makeInput, makeSelect } from '../dom';
import type { FileFlags, SectionRouting } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';
import { autoDetectSourceType, makeStatusBadge, setStatusBadge } from './sourceValue';


//
// Constants
//
/** The UI's single remote option; ``getData`` writes it as ``url`` (http/https) or ``uri``. */
const REMOTE_TYPE = 'url/uri';


//
// Public
//
export class AudioSection extends CollapsibleSection {
  /** Browse clicked (payload: the current value, or ``.``). */
  readonly browseRequested = new Signal<this, string>(this);
  /** Validate clicked: check the remote audio is reachable. */
  readonly validateRequested = new Signal<this, string>(this);

  private _sourceType: HTMLSelectElement;
  private _valueInput: HTMLInputElement;
  private _colSelect: HTMLSelectElement;
  private _colInput: HTMLInputElement;
  private _browseBtn: HTMLButtonElement;
  private _validateBtn: HTMLButtonElement;
  private _validateStatus: HTMLSpanElement;
  private _pathRow: HTMLDivElement;
  private _prefixInput: HTMLInputElement;
  private _suffixInput: HTMLInputElement;
  private _fallbackInput: HTMLInputElement;
  private _secrets: SecretsEditor;
  private _availableCols: string[] = [];

  constructor() {
    super('Audio', 'audio', false, true, ['split', 'project', 'config']);

    this._sourceType = makeSelect(['path', REMOTE_TYPE, 'column'], 'path');
    this._sourceType.addEventListener('change', () => {
      this._updateValueUI();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));

    this._pathRow = this._makeFocusRow('value', 'value', true);
    this._valueInput = makeInput('audio/recording.flac', '200px');
    this._valueInput.addEventListener('input', () => {
      this._autoDetectSourceType();
      this._emitChanged();
      this.setValidateStatus(null);
    });
    this._colSelect = makeSelect([], '');
    this._colSelect.style.display = 'none';
    this._colSelect.addEventListener('change', () => this._emitChanged());
    this._colInput = makeInput('column name', '150px');
    this._colInput.style.display = 'none';
    this._colInput.addEventListener('input', () => this._emitChanged());
    this._browseBtn = makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._valueInput.value || '.');
    });
    // For url/uri audio, confirm the remote file is reachable.
    this._validateBtn = makeButton('Validate');
    this._validateBtn.style.display = 'none';
    this._validateBtn.addEventListener('click', () => {
      const v = this._valueInput.value.trim();
      if (v) this.validateRequested.emit(v);
    });
    this._validateStatus = makeStatusBadge();
    this._pathRow.append(
      this._valueInput, this._colSelect, this._colInput,
      this._browseBtn, this._validateBtn, this._validateStatus,
    );
    this._body.appendChild(this._pathRow);

    this._prefixInput = makeInput('optional prefix', '200px');
    this._prefixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('prefix', this._prefixInput));

    this._suffixInput = makeInput('optional suffix', '200px');
    this._suffixInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('suffix', this._suffixInput));

    this._fallbackInput = makeInput('fallback path', '200px');
    this._fallbackInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('fallback', this._fallbackInput));

    this._secrets = new SecretsEditor(true);
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  /** Set the value (e.g. from Browse). */
  setPath(path: string): void {
    this._valueInput.value = path;
    this._emitChanged();
  }

  /** Offer the data columns for the ``column`` source type (dropdown instead of text). */
  setColumnOptions(cols: string[]): void {
    this._availableCols = cols;
    fillSelect(this._colSelect, cols);
    const pending = this._colInput.value.trim();
    if (pending && cols.includes(pending)) {
      this._colSelect.value = pending;
    }
    this._updateValueUI();
  }

  /** Set the validate indicator next to the button: ✓ ok, ✗ failed, null clears. */
  setValidateStatus(ok: boolean | null): void {
    setStatusBadge(this._validateStatus, ok, 'Reachable', 'Not reachable — see status bar');
  }

  /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
  applyLocks(locks: FileFlags, routing?: SectionRouting): void {
    this._applyRoutedLocks([
      { el: this._sourceType, key: 'source_type' },
      { el: this._valueInput, key: 'value' },
      { el: this._colSelect, key: 'value' },
      { el: this._colInput, key: 'value' },
      { el: this._browseBtn, key: 'value' },
      { el: this._secrets.element, key: 'secrets' },
      { el: this._prefixInput, key: 'prefix' },
      { el: this._suffixInput, key: 'suffix' },
      { el: this._fallbackInput, key: 'fallback' },
    ], locks, routing);
  }

  getData(): Record<string, any> {
    const uiType = this._sourceType.value;
    const result: Record<string, any> = {};
    let val = uiType === 'column'
      ? (this._availableCols.length > 0 ? this._colSelect.value : this._colInput.value.trim())
      : this._valueInput.value;

    if (val && uiType === REMOTE_TYPE) {
      // Auto-detect protocol and choose url (http/https) vs uri (s3, gs, ...)
      if (!REMOTE_SCHEME_RE.test(val)) {
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

  override reset(): void {
    this._sourceType.value = 'path';
    for (const el of [this._valueInput, this._colInput, this._prefixInput, this._suffixInput,
                      this._fallbackInput]) {
      el.value = '';
    }
    this._colSelect.value = '';
    this._secrets.reset();
    this.setValidateStatus(null);
    this._updateValueUI();
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
        this._sourceType.value = REMOTE_TYPE;
        this._valueInput.value = data.value ?? '';
      } else {
        // 'path' or a falsey/auto source_type
        this._sourceType.value = 'path';
        this._valueInput.value = data.value ?? '';
      }
    }
    else if (data.path) { this._sourceType.value = 'path'; this._valueInput.value = data.path; }
    else if (data.url || data.uri) {
      this._sourceType.value = REMOTE_TYPE;
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

  /** Switch source_type between path and url/uri from the typed value. */
  private _autoDetectSourceType(): void {
    if (autoDetectSourceType(this._sourceType, this._valueInput.value, REMOTE_TYPE)) {
      this._updateValueUI();
    }
  }

  private _updateValueUI(): void {
    const sourceType = this._sourceType.value;
    const isCol = sourceType === 'column';
    const hasCols = this._availableCols.length > 0;
    this._valueInput.style.display = isCol ? 'none' : '';
    this._colSelect.style.display = (isCol && hasCols) ? '' : 'none';
    this._colInput.style.display = (isCol && !hasCols) ? '' : 'none';
    this._browseBtn.style.display = (sourceType === 'path') ? '' : 'none';
    this._validateBtn.style.display = (sourceType === REMOTE_TYPE) ? '' : 'none';
    this.setValidateStatus(null);
  }
}
