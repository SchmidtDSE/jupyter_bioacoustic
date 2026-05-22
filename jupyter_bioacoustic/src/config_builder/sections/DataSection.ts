import { Signal } from '@lumino/signaling';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class DataSection extends CollapsibleSection {
  readonly columnsLoaded = new Signal<this, string[]>(this);
  readonly fileLoadRequested = new Signal<this, string>(this);
  readonly browseRequested = new Signal<this, string>(this);

  private _sourceType: HTMLSelectElement;
  private _pathInput: HTMLInputElement;
  private _startTimeSelect: HTMLSelectElement;
  private _endTimeSelect: HTMLSelectElement;
  private _durationInput: HTMLInputElement;

  private _browseBtn: HTMLButtonElement;
  private _detectedCols: string[] = [];
  private _secrets: SecretsEditor;
  private _debounceTimer: any = null;

  constructor() {
    super('Data', 'data', false, true, ['split', 'project', 'config']);

    this._sourceType = this._makeSelect(['path', 'url', 'sql', 'api'], 'path');
    this._sourceType.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('source_type', this._sourceType));

    const pathRow = this._makeRow();
    pathRow.addEventListener('focusin', () => this.fieldFocused.emit('path'));
    pathRow.addEventListener('click', () => this.fieldFocused.emit('path'));
    pathRow.appendChild(this._makeLabel('path / url'));
    this._pathInput = this._makeInput('data/detections.csv', '220px');
    this._pathInput.addEventListener('input', () => {
      this._emitChanged();
      this._scheduleAutoLoad();
    });
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    pathRow.append(this._pathInput, this._browseBtn);
    this._body.appendChild(pathRow);

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
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  private _scheduleAutoLoad(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      const path = this._pathInput.value.trim();
      if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
        this.fileLoadRequested.emit(path);
      }
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
    const currentStart = this._startTimeSelect.value;
    const currentEnd = this._endTimeSelect.value;

    this._startTimeSelect.innerHTML = '';
    this._endTimeSelect.innerHTML = '';

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

  getData(): Record<string, any> {
    const sourceKey = this._sourceType.value;
    const result: Record<string, any> = {};
    result[sourceKey] = this._pathInput.value || undefined;

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
    if (data.path) { this._sourceType.value = 'path'; this._pathInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._pathInput.value = data.url; }
    else if (data.sql) { this._sourceType.value = 'sql'; this._pathInput.value = data.sql; }
    else if (data.api) { this._sourceType.value = 'api'; this._pathInput.value = data.api; }
    if (data.start_time) this._startTimeSelect.value = data.start_time;
    if (data.end_time) this._endTimeSelect.value = data.end_time;
    if (data.duration !== undefined) this._durationInput.value = String(data.duration);
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }
}
