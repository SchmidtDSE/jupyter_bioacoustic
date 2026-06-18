import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class DataSection extends CollapsibleSection {
  readonly columnsLoaded = new Signal<this, string[]>(this);
  readonly fileLoadRequested = new Signal<this, string>(this);
  readonly browseRequested = new Signal<this, string>(this);
  readonly sourceLoadRequested = new Signal<this, { sourceType: string; value: string; secrets: any }>(this);

  private _sourceType: HTMLSelectElement;
  private _pathInput: HTMLInputElement;
  private _indexColSelect: HTMLSelectElement;
  private _indexColInput: HTMLInputElement;
  private _indexColRow: HTMLDivElement;
  private _startTimeSelect: HTMLSelectElement;
  private _endTimeSelect: HTMLSelectElement;
  private _durationInput: HTMLInputElement;

  private _browseBtn: HTMLButtonElement;
  private _loadBtn!: HTMLButtonElement;
  private _loadStatus!: HTMLSpanElement;
  private _detectedCols: string[] = [];
  private _secrets: SecretsEditor;
  private _debounceTimer: any = null;

  constructor() {
    super('Data', 'data', false, true, ['split', 'project', 'config']);

    this._sourceType = this._makeSelect(['path', 'url', 'sql', 'api'], 'path');
    this._sourceType.addEventListener('change', () => {
      this._updateValueUI();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('source_type', this._sourceType, true));

    const pathRow = this._makeRow();
    pathRow.addEventListener('focusin', () => this.fieldFocused.emit('value'));
    pathRow.addEventListener('click', () => this.fieldFocused.emit('value'));
    pathRow.appendChild(this._makeLabel('value', true));
    this._pathInput = this._makeInput('data/detections.csv', '220px');
    this._pathInput.addEventListener('input', () => {
      this._autoDetectSourceType();
      this._emitChanged();
      this.setLoadStatus(null);
      this._scheduleAutoLoad();
    });
    this._pathInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      this._autoDetectSourceType();
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      if (this._sourceType.value !== 'path') {
        this._triggerSourceLoad();
        return;
      }
      const path = this._pathInput.value.trim();
      if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
        this._triggerSourceLoad();
      } else {
        this.setDetectedColumns([]);
      }
    });
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    // sql/api need an explicit Load (don't auto-run a query on each keystroke);
    // url auto-loads. Both fetch via the source-aware loader (handles s3://).
    this._loadBtn = this._makeButton('Load', true);
    this._loadBtn.style.display = 'none';
    this._loadBtn.addEventListener('click', () => this._triggerSourceLoad());
    this._loadStatus = document.createElement('span');
    this._loadStatus.style.cssText = `font-size:14px;font-weight:700;display:none;`;
    pathRow.append(this._pathInput, this._browseBtn, this._loadBtn, this._loadStatus);
    this._body.appendChild(pathRow);

    this._indexColInput = this._makeInput('e.g. id', '150px');
    this._indexColInput.addEventListener('input', () => this._emitChanged());
    this._indexColSelect = this._makeSelect([], '');
    this._indexColSelect.style.display = 'none';
    this._indexColSelect.addEventListener('change', () => this._emitChanged());
    this._indexColRow = this._makeRow();
    this._indexColRow.appendChild(this._makeLabel('index_column', true));
    this._indexColRow.append(this._indexColInput, this._indexColSelect);
    this._indexColRow.addEventListener('focusin', () => this.fieldFocused.emit('index_column'));
    this._indexColRow.addEventListener('click', () => this.fieldFocused.emit('index_column'));
    this._body.appendChild(this._indexColRow);

    this._startTimeSelect = this._makeSelect(['start_time'], 'start_time');
    this._startTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('start_time_col', this._startTimeSelect));

    this._endTimeSelect = this._makeSelect(['end_time'], 'end_time');
    this._endTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('end_time_col', this._endTimeSelect));

    this._durationInput = this._makeInput('duration or number', '150px');
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

  /**
   * Drive `source_type` from the value: a remote scheme (e.g. `https://`,
   * `s3://`) selects `url`, otherwise `path`. Only switches between the two
   * value-detectable types — a deliberate `sql`/`api` choice is left alone.
   */
  private _autoDetectSourceType(): void {
    const type = this._sourceType.value;
    if (type !== 'path' && type !== 'url') return;
    const val = this._pathInput.value.trim();
    if (!val) return;
    const detected = /^[a-z][a-z0-9+.-]*:\/\//i.test(val) ? 'url' : 'path';
    if (detected !== type) {
      this._sourceType.value = detected;
      this._updateValueUI();
    }
  }

  private _updateValueUI(): void {
    const type = this._sourceType.value;
    this._browseBtn.style.display = type === 'path' ? '' : 'none';
    // url auto-loads; sql/api use an explicit Load button.
    this._loadBtn.style.display = (type === 'sql' || type === 'api') ? '' : 'none';
    this.setLoadStatus(null);
  }

  /** Set the load indicator next to the value: ✓ ok, ✗ failed, null clears. */
  setLoadStatus(ok: boolean | null): void {
    if (ok === null) { this._loadStatus.style.display = 'none'; return; }
    this._loadStatus.style.display = '';
    this._loadStatus.textContent = ok ? '✓' : '✗';
    this._loadStatus.style.color = ok ? COLORS.green : COLORS.red;
    this._loadStatus.title = ok ? 'Loaded' : 'Load failed — see status bar';
  }

  private _retryLoadAfterSecrets(): void {
    if (this._sourceType.value === 'path' || !this._pathInput.value.trim()) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._triggerSourceLoad(), 400);
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
        if (/\.(csv|parquet|json|jsonl|tsv)$/i.test(val)) this._triggerSourceLoad();
      } else if (type === 'url') {
        // url (incl. s3://) auto-loads via the source-aware loader.
        this._triggerSourceLoad();
      }
      // sql/api: explicit Load button only.
    }, 800);
  }

  setDetectedColumns(cols: string[]): void {
    this._detectedCols = cols;
    this.columnsLoaded.emit(cols);
    this._rebuildTimeSelects();
  }

  getDetectedColumns(): string[] {
    return this._detectedCols;
  }

  getPath(): string {
    return this._pathInput.value.trim();
  }

  setPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
    if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
      this.fileLoadRequested.emit(path);
    }
  }

  private _rebuildTimeSelects(): void {
    const currentIdx = this._indexColSelect.value;
    const currentStart = this._startTimeSelect.value;
    const currentEnd = this._endTimeSelect.value;

    this._startTimeSelect.innerHTML = '';
    this._endTimeSelect.innerHTML = '';

    this._indexColSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = '— select —';
    this._indexColSelect.appendChild(placeholder);
    for (const col of this._detectedCols) {
      const o = document.createElement('option');
      o.value = col; o.textContent = col;
      this._indexColSelect.appendChild(o);
    }
    const pending = currentIdx || this._indexColInput.value.trim();
    if (pending && this._detectedCols.includes(pending)) {
      this._indexColSelect.value = pending;
    }
    if (this._detectedCols.length > 0) {
      this._indexColInput.style.display = 'none';
      this._indexColSelect.style.display = '';
    } else {
      this._indexColInput.style.display = '';
      this._indexColSelect.style.display = 'none';
    }

    const cols = this._detectedCols.length > 0 ? this._detectedCols : ['start_time'];
    for (const col of cols) {
      const o1 = document.createElement('option');
      o1.value = col; o1.textContent = col;
      this._startTimeSelect.appendChild(o1);
    }
    for (const col of (this._detectedCols.length > 0 ? this._detectedCols : ['end_time'])) {
      const o2 = document.createElement('option');
      o2.value = col; o2.textContent = col;
      this._endTimeSelect.appendChild(o2);
    }

    if (cols.includes(currentStart)) this._startTimeSelect.value = currentStart;
    else if (cols.includes('start_time')) this._startTimeSelect.value = 'start_time';

    const endCols = this._detectedCols.length > 0 ? this._detectedCols : ['end_time'];
    if (endCols.includes(currentEnd)) this._endTimeSelect.value = currentEnd;
    else if (endCols.includes('end_time')) this._endTimeSelect.value = 'end_time';
  }

  applyLocks(
    locks: { project: boolean; config: boolean; form: boolean },
    routing?: { project: string[]; config: string[] },
  ): void {
    const projKeys = new Set(routing?.project ?? []);
    const target = this.getTarget();
    const fields: { el: HTMLElement; key: string }[] = [
      { el: this._sourceType, key: 'source_type' },
      { el: this._pathInput, key: 'value' },
      { el: this._browseBtn, key: 'value' },
      { el: this._secrets.element, key: 'secrets' },
      { el: this._indexColInput, key: 'index_column' },
      { el: this._indexColSelect, key: 'index_column' },
      { el: this._startTimeSelect, key: 'start_time' },
      { el: this._endTimeSelect, key: 'end_time' },
      { el: this._durationInput, key: 'duration' },
    ];
    for (const { el, key } of fields) {
      const file = target === 'project' ? 'project'
        : target === 'config' ? 'config'
        : (projKeys.has(key) ? 'project' : 'config');
      this._setControlDisabled(el, !!locks[file]);
    }
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
    if (data.start_time) this._startTimeSelect.value = data.start_time;
    if (data.end_time) this._endTimeSelect.value = data.end_time;
    if (data.duration !== undefined) this._durationInput.value = String(data.duration);
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }

}
