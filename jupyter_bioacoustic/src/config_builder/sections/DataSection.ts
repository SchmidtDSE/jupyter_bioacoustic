import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

export class DataSection extends CollapsibleSection {
  readonly columnsLoaded = new Signal<this, string[]>(this);
  readonly fileLoadRequested = new Signal<this, string>(this);

  private _sourceType: HTMLSelectElement;
  private _pathInput: HTMLInputElement;
  private _columnsInput: HTMLInputElement;
  private _startTimeInput: HTMLInputElement;
  private _endTimeInput: HTMLInputElement;
  private _durationInput: HTMLInputElement;

  private _browseBtn: HTMLButtonElement;
  private _loadColsBtn: HTMLButtonElement;
  private _detectedCols: string[] = [];

  constructor() {
    super('Data', 'data');

    this._sourceType = this._makeSelect(['path', 'url', 'sql', 'api'], 'path');
    this._sourceType.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('source type', this._sourceType));

    const pathRow = this._makeRow();
    pathRow.appendChild(this._makeLabel('path / url'));
    this._pathInput = this._makeInput('data/detections.csv', '220px');
    this._pathInput.addEventListener('input', () => this._emitChanged());
    this._browseBtn = this._makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.fileLoadRequested.emit(this._pathInput.value || 'data');
    });
    this._loadColsBtn = this._makeButton('Load Columns');
    this._loadColsBtn.addEventListener('click', () => {
      if (this._pathInput.value) {
        this.fileLoadRequested.emit(this._pathInput.value);
      }
    });
    pathRow.append(this._pathInput, this._browseBtn, this._loadColsBtn);
    this._body.appendChild(pathRow);

    this._columnsInput = this._makeInput('col1, col2, ...', '300px');
    this._columnsInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('data_columns', this._columnsInput));

    this._startTimeInput = this._makeInput('start_time', '150px');
    this._startTimeInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('start_time col', this._startTimeInput));

    this._endTimeInput = this._makeInput('end_time', '150px');
    this._endTimeInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('end_time col', this._endTimeInput));

    this._durationInput = this._makeInput('duration or number', '150px');
    this._durationInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('duration', this._durationInput));
  }

  setDetectedColumns(cols: string[]): void {
    this._detectedCols = cols;
    this.columnsLoaded.emit(cols);
    if (!this._columnsInput.value && cols.length > 0) {
      this._columnsInput.placeholder = cols.join(', ');
    }
  }

  getDetectedColumns(): string[] {
    return this._detectedCols;
  }

  getData(): Record<string, any> {
    const sourceKey = this._sourceType.value;
    const result: Record<string, any> = {};
    result[sourceKey] = this._pathInput.value || undefined;

    const cols = this._columnsInput.value
      ? this._columnsInput.value.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    if (cols && cols.length > 0) result.columns = cols;

    const st = this._startTimeInput.value.trim();
    const et = this._endTimeInput.value.trim();
    const dur = this._durationInput.value.trim();
    if (st && st !== 'start_time') result.data_start_time = st;
    if (et && et !== 'end_time') result.data_end_time = et;
    if (dur) {
      const num = parseFloat(dur);
      result.data_duration = isNaN(num) ? dur : num;
    }

    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.path) { this._sourceType.value = 'path'; this._pathInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._pathInput.value = data.url; }
    else if (data.sql) { this._sourceType.value = 'sql'; this._pathInput.value = data.sql; }
    else if (data.api) { this._sourceType.value = 'api'; this._pathInput.value = data.api; }
    if (data.columns) this._columnsInput.value = Array.isArray(data.columns) ? data.columns.join(', ') : '';
    if (data.data_start_time) this._startTimeInput.value = data.data_start_time;
    if (data.data_end_time) this._endTimeInput.value = data.data_end_time;
    if (data.data_duration !== undefined) this._durationInput.value = String(data.data_duration);
  }
}
