/**
 * Data section: where the annotator's rows come from (``data:`` — source_type + value, index
 * column, start/end time columns, duration, secrets). Loads the source's columns (local file,
 * url / s3://, sql, api) so the time / index fields — and the other sections' column pickers —
 * become dropdowns.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { DATA_FILE_RE } from '../constants';
import { fillSelect, makeButton, makeInput, makeSelect } from '../dom';
import type { FileFlags, SectionRouting } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';
import { autoDetectSourceType, makeStatusBadge, setStatusBadge } from './sourceValue';


//
// Constants
//
const AUTO_LOAD_DELAY_MS = 800;
const SECRETS_RETRY_DELAY_MS = 400;


//
// Types
//
/** A request to load the columns of a data source. */
export interface SourceLoadRequest {
  sourceType: string;
  value: string;
  /** The section's secrets (``SecretsEditor.getData()``). */
  secrets: unknown;
}


//
// Public
//
export class DataSection extends CollapsibleSection {
  /** The detected columns changed (empty when none are known). */
  readonly columnsLoaded = new Signal<this, string[]>(this);
  /** A local data file was picked via Browse; load its columns. */
  readonly fileLoadRequested = new Signal<this, string>(this);
  /** Browse clicked (payload: the current value, or ``.``). */
  readonly browseRequested = new Signal<this, string>(this);
  /** Load the columns of the current source (any source_type). */
  readonly sourceLoadRequested = new Signal<this, SourceLoadRequest>(this);

  private _sourceType: HTMLSelectElement;
  private _pathInput: HTMLInputElement;
  private _indexColSelect: HTMLSelectElement;
  private _indexColInput: HTMLInputElement;
  private _indexColRow: HTMLDivElement;
  private _startTimeSelect: HTMLSelectElement;
  private _endTimeSelect: HTMLSelectElement;
  private _durationInput: HTMLInputElement;
  private _browseBtn: HTMLButtonElement;
  private _loadBtn: HTMLButtonElement;
  private _loadStatus: HTMLSpanElement;
  private _detectedCols: string[] = [];
  private _secrets: SecretsEditor;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('Data', 'data', false, true, ['split', 'project', 'config']);

    this._sourceType = makeSelect(['path', 'url', 'sql', 'api'], 'path');
    this._sourceType.addEventListener('change', () => {
      this._updateValueUI();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));

    const pathRow = this._makeFocusRow('value', 'value', true);
    this._pathInput = makeInput('data/detections.csv', '220px');
    this._pathInput.addEventListener('input', () => {
      this._autoDetectSourceType();
      this._emitChanged();
      this.setLoadStatus(null);
      this._scheduleAutoLoad();
    });
    this._pathInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this._onValueEnter();
    });
    this._browseBtn = makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    // sql/api need an explicit Load (don't auto-run a query on each keystroke);
    // url auto-loads. Both fetch via the source-aware loader (handles s3://).
    this._loadBtn = makeButton('Load', true);
    this._loadBtn.style.display = 'none';
    this._loadBtn.addEventListener('click', () => this._triggerSourceLoad());
    this._loadStatus = makeStatusBadge();
    pathRow.append(this._pathInput, this._browseBtn, this._loadBtn, this._loadStatus);
    this._body.appendChild(pathRow);

    this._indexColInput = makeInput('e.g. id', '150px');
    this._indexColInput.addEventListener('input', () => this._emitChanged());
    this._indexColSelect = makeSelect([], '');
    this._indexColSelect.style.display = 'none';
    this._indexColSelect.addEventListener('change', () => this._emitChanged());
    this._indexColRow = this._makeFocusRow('index_column', 'index_column', true);
    this._indexColRow.append(this._indexColInput, this._indexColSelect);
    this._body.appendChild(this._indexColRow);

    this._startTimeSelect = makeSelect(['start_time'], 'start_time');
    this._startTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('start_time_col', this._startTimeSelect));

    this._endTimeSelect = makeSelect(['end_time'], 'end_time');
    this._endTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('end_time_col', this._endTimeSelect));

    this._durationInput = makeInput('duration or number', '150px');
    this._durationInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('duration', this._durationInput));

    this._secrets = new SecretsEditor(true);
    this._secrets.changed.connect(() => {
      this._emitChanged();
      this._retryLoadAfterSecrets();
    });
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  /** Set the load indicator next to the value: ✓ ok, ✗ failed, null clears. */
  setLoadStatus(ok: boolean | null): void {
    setStatusBadge(this._loadStatus, ok, 'Loaded', 'Load failed — see status bar');
  }

  /** Use ``cols`` for the index / time dropdowns and tell the other sections. */
  setDetectedColumns(cols: string[]): void {
    this._detectedCols = cols;
    this.columnsLoaded.emit(cols);
    this._rebuildTimeSelects();
  }

  /** The trimmed value (path, URL, query, ...). */
  getPath(): string {
    return this._pathInput.value.trim();
  }

  /** Set the value (e.g. from Browse) and load its columns if it is a data file. */
  setPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
    if (path && DATA_FILE_RE.test(path)) {
      this.fileLoadRequested.emit(path);
    }
  }

  /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
  applyLocks(locks: FileFlags, routing?: SectionRouting): void {
    this._applyRoutedLocks([
      { el: this._sourceType, key: 'source_type' },
      { el: this._pathInput, key: 'value' },
      { el: this._browseBtn, key: 'value' },
      { el: this._secrets.element, key: 'secrets' },
      { el: this._indexColInput, key: 'index_column' },
      { el: this._indexColSelect, key: 'index_column' },
      { el: this._startTimeSelect, key: 'start_time' },
      { el: this._endTimeSelect, key: 'end_time' },
      { el: this._durationInput, key: 'duration' },
    ], locks, routing);
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._pathInput.value) {
      result.source_type = this._sourceType.value;
      result.value = this._pathInput.value;
    }

    const idx = this._detectedCols.length > 0
      ? this._indexColSelect.value
      : this._indexColInput.value.trim();
    if (idx) result.index_column = idx;
    const st = this._startTimeSelect.value;
    const et = this._endTimeSelect.value;
    const dur = this._durationInput.value.trim();
    if (st && st !== 'start_time') result.start_time = st;
    if (et && et !== 'end_time') result.end_time = et;
    if (dur) {
      const num = parseFloat(dur);
      result.duration = isNaN(num) ? dur : num;
    }

    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;

    return result;
  }

  override reset(): void {
    this._sourceType.value = 'path';
    this._pathInput.value = '';
    this._indexColInput.value = '';
    this._indexColSelect.value = '';
    this._durationInput.value = '';
    this._detectedCols = [];
    this._rebuildTimeSelects();
    this._secrets.reset();
    this.setLoadStatus(null);
    this._updateValueUI();
  }

  setData(data: Record<string, any>): void {
    // Current form: source_type + value. Legacy form: an explicit
    // path/url/sql/api key (still loadable).
    if (data.value !== undefined || data.source_type) {
      const st = data.source_type === 'uri' ? 'url' : (data.source_type || 'path');
      this._sourceType.value = st;
      this._pathInput.value = data.value ?? '';
    }
    else if (data.path) { this._sourceType.value = 'path'; this._pathInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._pathInput.value = data.url; }
    else if (data.sql) { this._sourceType.value = 'sql'; this._pathInput.value = data.sql; }
    else if (data.api) { this._sourceType.value = 'api'; this._pathInput.value = data.api; }
    if (data.index_column) {
      this._indexColInput.value = data.index_column;
      if (this._detectedCols.includes(data.index_column)) {
        this._indexColSelect.value = data.index_column;
      }
    }
    if (data.start_time) this._fillTimeSelect(this._startTimeSelect, data.start_time, 'start_time');
    if (data.end_time) this._fillTimeSelect(this._endTimeSelect, data.end_time, 'end_time');
    if (data.duration !== undefined) this._durationInput.value = String(data.duration);
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }

  /** Switch source_type between path and url from the typed value. */
  private _autoDetectSourceType(): void {
    if (autoDetectSourceType(this._sourceType, this._pathInput.value, 'url')) {
      this._updateValueUI();
    }
  }

  /** Enter in the value: load now (sql/api/url, or a local data file). */
  private _onValueEnter(): void {
    this._autoDetectSourceType();
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._sourceType.value !== 'path') {
      this._triggerSourceLoad();
      return;
    }
    const path = this._pathInput.value.trim();
    if (path && DATA_FILE_RE.test(path)) {
      this._triggerSourceLoad();
    } else {
      this.setDetectedColumns([]);
    }
  }

  private _updateValueUI(): void {
    const type = this._sourceType.value;
    this._browseBtn.style.display = type === 'path' ? '' : 'none';
    // url auto-loads; sql/api use an explicit Load button.
    this._loadBtn.style.display = (type === 'sql' || type === 'api') ? '' : 'none';
    this.setLoadStatus(null);
  }

  private _retryLoadAfterSecrets(): void {
    if (this._sourceType.value === 'path' || !this._pathInput.value.trim()) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._triggerSourceLoad(), SECRETS_RETRY_DELAY_MS);
  }

  private _triggerSourceLoad(): void {
    const value = this._pathInput.value.trim();
    if (!value) return;
    this.sourceLoadRequested.emit({
      sourceType: this._sourceType.value,
      value,
      secrets: this._secrets.getData(),
    });
  }

  private _scheduleAutoLoad(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    const type = this._sourceType.value;
    this._debounceTimer = setTimeout(() => {
      const val = this._pathInput.value.trim();
      if (!val) return;
      if (type === 'path') {
        // Local file: auto-load (with ✓/✗) once it looks like a data file.
        if (DATA_FILE_RE.test(val)) this._triggerSourceLoad();
      } else if (type === 'url') {
        // url (incl. s3://) auto-loads via the source-aware loader.
        this._triggerSourceLoad();
      }
      // sql/api: explicit Load button only.
    }, AUTO_LOAD_DELAY_MS);
  }

  private _rebuildTimeSelects(): void {
    const currentIdx = this._indexColSelect.value;
    const currentStart = this._startTimeSelect.value;
    const currentEnd = this._endTimeSelect.value;

    fillSelect(this._indexColSelect, this._detectedCols, '— select —');
    const pending = currentIdx || this._indexColInput.value.trim();
    if (pending && this._detectedCols.includes(pending)) {
      this._indexColSelect.value = pending;
    }
    const hasCols = this._detectedCols.length > 0;
    this._indexColInput.style.display = hasCols ? 'none' : '';
    this._indexColSelect.style.display = hasCols ? '' : 'none';

    this._fillTimeSelect(this._startTimeSelect, currentStart, 'start_time');
    this._fillTimeSelect(this._endTimeSelect, currentEnd, 'end_time');
  }

  /**
   * Fill a time-column select with the detected columns (or just ``fallback`` before any are
   * loaded) and select ``keep``. A configured column the data doesn't (yet) list is kept as an
   * extra option instead of being silently replaced — that used to drop custom mappings.
   */
  private _fillTimeSelect(sel: HTMLSelectElement, keep: string, fallback: string): void {
    const cols = this._detectedCols.length > 0 ? this._detectedCols : [fallback];
    const options = keep && !cols.includes(keep) ? [...cols, keep] : cols;
    fillSelect(sel, options);
    sel.value = keep || (options.includes(fallback) ? fallback : options[0]);
  }
}
