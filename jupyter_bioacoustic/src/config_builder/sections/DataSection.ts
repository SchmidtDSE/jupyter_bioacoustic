import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

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
  private _selectedCols: string[] = [];
  private _colPickerArea: HTMLDivElement;
  private _selectedChipsArea: HTMLDivElement;
  private _debounceTimer: any = null;

  constructor() {
    super('Data', 'data');

    this._sourceType = this._makeSelect(['path', 'url', 'sql', 'api'], 'path');
    this._sourceType.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('source type', this._sourceType));

    const pathRow = this._makeRow();
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

    const colLabel = document.createElement('div');
    colLabel.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
    const colLabelText = document.createElement('span');
    colLabelText.textContent = 'columns';
    colLabelText.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    colLabel.append(colLabelText);
    colLabel.addEventListener('click', () => this.fieldFocused.emit('columns'));

    this._selectedChipsArea = document.createElement('div');
    this._selectedChipsArea.style.cssText =
      `display:flex;flex-wrap:wrap;gap:4px;min-height:24px;padding:2px 0;`;

    this._colPickerArea = document.createElement('div');
    this._colPickerArea.style.cssText =
      `display:none;flex-wrap:wrap;gap:4px;padding:4px 0;` +
      `border-top:1px solid ${COLORS.bgSurface0};margin-top:2px;`;

    const colWrap = document.createElement('div');
    colWrap.style.cssText =
      `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
      `background:${COLORS.bgSurface0};border-radius:6px;`;
    colWrap.append(colLabel, this._selectedChipsArea, this._colPickerArea);
    this._body.appendChild(colWrap);

    const colSeparator = document.createElement('div');
    colSeparator.style.cssText =
      `height:1px;background:${COLORS.bgSurface1};margin:6px 0;`;
    this._body.appendChild(colSeparator);

    this._startTimeSelect = this._makeSelect(['start_time'], 'start_time');
    this._startTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('start_time col', this._startTimeSelect));

    this._endTimeSelect = this._makeSelect(['end_time'], 'end_time');
    this._endTimeSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('end_time col', this._endTimeSelect));

    this._durationInput = this._makeInput('duration or number', '150px');
    this._durationInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('duration', this._durationInput));
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
    this._rebuildColPicker();
    this._rebuildTimeSelects();
  }

  getDetectedColumns(): string[] {
    return this._detectedCols;
  }

  setPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
    if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
      this.fileLoadRequested.emit(path);
    }
  }

  private _rebuildColPicker(): void {
    this._colPickerArea.innerHTML = '';
    if (this._detectedCols.length === 0) {
      this._colPickerArea.style.display = 'none';
      return;
    }
    this._colPickerArea.style.display = 'flex';

    const hint = document.createElement('span');
    hint.textContent = 'Click to add:';
    hint.style.cssText = `color:${COLORS.textMuted};font-size:10px;width:100%;`;
    this._colPickerArea.appendChild(hint);

    for (const col of this._detectedCols) {
      if (this._selectedCols.includes(col)) continue;
      const chip = document.createElement('button');
      chip.textContent = `+ ${col}`;
      chip.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;
      chip.addEventListener('click', () => {
        this._selectedCols.push(col);
        this._rebuildColPicker();
        this._rebuildSelectedChips();
        this._emitChanged();
      });
      this._colPickerArea.appendChild(chip);
    }
  }

  private _rebuildSelectedChips(): void {
    this._selectedChipsArea.innerHTML = '';
    if (this._selectedCols.length === 0) {
      const hint = document.createElement('span');
      hint.textContent = 'all columns (none selected)';
      hint.style.cssText = `color:${COLORS.textMuted};font-size:11px;font-style:italic;`;
      this._selectedChipsArea.appendChild(hint);
      return;
    }
    for (const col of this._selectedCols) {
      const chip = document.createElement('span');
      chip.style.cssText =
        `display:inline-flex;align-items:center;gap:4px;` +
        `background:${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;`;

      const name = document.createElement('span');
      name.textContent = col;

      const rm = document.createElement('button');
      rm.textContent = '✕';
      rm.style.cssText =
        `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
        `font-size:12px;padding:0 2px;line-height:1;`;
      rm.addEventListener('click', () => {
        this._selectedCols = this._selectedCols.filter(c => c !== col);
        this._rebuildColPicker();
        this._rebuildSelectedChips();
        this._emitChanged();
      });

      chip.append(name, rm);
      this._selectedChipsArea.appendChild(chip);
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

    if (this._selectedCols.length > 0) result.columns = [...this._selectedCols];

    const st = this._startTimeSelect.value;
    const et = this._endTimeSelect.value;
    const dur = this._durationInput.value.trim();
    if (st && st !== 'start_time') result.start_time = st;
    if (et && et !== 'end_time') result.end_time = et;
    if (dur) {
      const num = parseFloat(dur);
      result.duration = isNaN(num) ? dur : num;
    }

    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.path) { this._sourceType.value = 'path'; this._pathInput.value = data.path; }
    else if (data.url) { this._sourceType.value = 'url'; this._pathInput.value = data.url; }
    else if (data.sql) { this._sourceType.value = 'sql'; this._pathInput.value = data.sql; }
    else if (data.api) { this._sourceType.value = 'api'; this._pathInput.value = data.api; }
    if (data.columns && Array.isArray(data.columns)) {
      this._selectedCols = [...data.columns];
      this._rebuildSelectedChips();
      this._rebuildColPicker();
    }
    if (data.start_time) this._startTimeSelect.value = data.start_time;
    if (data.end_time) this._endTimeSelect.value = data.end_time;
    if (data.duration !== undefined) this._durationInput.value = String(data.duration);
  }
}
