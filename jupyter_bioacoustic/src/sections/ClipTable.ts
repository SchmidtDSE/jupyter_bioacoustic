/**
 * ClipTable — GUI filter builder, sortable/paginated data table, view mode toggle.
 *
 * Owns column-type detection, filter GUI (column/operator/value dropdowns + chips),
 * sorting, pagination, row rendering, and reviewed-row styling.
 * Emits `rowSelected` when the user clicks a row or navigates via controls.
 */
import { Signal } from '@lumino/signaling';
import { Detection, FilterClause, FilterColumnMeta } from '../types';
import { FormPanel } from './FormPanel';
import {
  COLORS,
  inputStyle,
  selectStyle,
  btnStyle,
  barBottomStyle,
  smallLabelStyle,
  filterChipStyle,
  filterChipDismissStyle,
} from '../styles';

// ─── Operator definitions ────────────────────────────────────

interface OpDef { value: string; label: string; needsValue: boolean; }

const FLOAT_OPS: OpDef[] = [
  { value: '=',            label: '=',            needsValue: true },
  { value: '!=',           label: '!=',           needsValue: true },
  { value: '>=',           label: '>=',           needsValue: true },
  { value: '<=',           label: '<=',           needsValue: true },
  { value: '>',            label: '>',            needsValue: true },
  { value: '<',            label: '<',            needsValue: true },
  { value: 'is_null',      label: 'is null',      needsValue: false },
  { value: 'is_not_null',  label: 'is not null',  needsValue: false },
  { value: 'is_empty',     label: 'is empty',     needsValue: false },
  { value: 'is_not_empty', label: 'is not empty', needsValue: false },
];

const STRING_OPS: OpDef[] = [
  { value: '=',            label: 'equals',        needsValue: true },
  { value: '!=',           label: 'not equals',    needsValue: true },
  { value: 'starts_with',  label: 'starts with',   needsValue: true },
  { value: 'ends_with',    label: 'ends with',     needsValue: true },
  { value: 'contains',     label: 'contains',      needsValue: true },
  { value: 'is_null',      label: 'is null',       needsValue: false },
  { value: 'is_not_null',  label: 'is not null',   needsValue: false },
  { value: 'is_empty',     label: 'is empty',      needsValue: false },
  { value: 'is_not_empty', label: 'is not empty',  needsValue: false },
];

// Human-readable label for an operator (used in chips)
const OP_LABELS: Record<string, string> = {};
[...FLOAT_OPS, ...STRING_OPS].forEach(o => { OP_LABELS[o.value] = o.label; });

export class ClipTable {
  /** Root element — contains filter bar, chip bar, table wrapper, pagination bar. */
  readonly element: HTMLDivElement;

  // ─── Signals ───────────────────────────────────────────────

  readonly rowSelected = new Signal<this, { row: Detection; filteredIdx: number }>(this);

  // ─── Data state ────────────────────────────────────────────

  private _rows: Detection[] = [];
  private _filtered: Detection[] = [];
  private _sortCol = 'id';
  private _sortAsc = true;
  private _page = 0;
  private _pageSize = 10;
  private _selectedIdx = -1;
  private _activeFilters: FilterClause[] = [];
  private _viewMode: 'all' | 'pending' | 'reviewed' = 'all';
  private _tableCols: Array<{ key: string; label: string }> = [];
  private _filterColMeta: FilterColumnMeta[] = [];

  // ─── DOM refs ──────────────────────────────────────────────

  private _colSelect!: HTMLSelectElement;
  private _opSelect!: HTMLSelectElement;
  private _valueContainer!: HTMLDivElement;
  private _chipContainer!: HTMLDivElement;
  private _viewModeSelect!: HTMLSelectElement;
  private _refreshBtn!: HTMLButtonElement;
  private _thead!: HTMLTableSectionElement;
  private _tableBody!: HTMLTableSectionElement;
  private _pageInfo!: HTMLSpanElement;
  private _pageSizeSelect!: HTMLSelectElement;
  private _customPageSizeInput!: HTMLInputElement;
  private _pageInput!: HTMLInputElement;

  constructor(private _form: FormPanel) {
    this.element = document.createElement('div');
    this.element.style.cssText = `display:contents;`;
    this._buildUI();
  }

  // ─── Public API ────────────────────────────────────────────

  setData(opts: {
    rows: Detection[];
    identCol: string;
    displayCols: string[];
    dataCols: string[];
    duplicateEntries: boolean;
  }): void {
    this._rows = opts.rows;
    this._configureColumns(opts);
    this._detectColumnTypes();

    if (!opts.duplicateEntries) {
      this._viewModeSelect.style.display = '';
      this._refreshBtn.style.display = '';
      this._viewMode = 'pending';
      this._viewModeSelect.value = 'pending';
    }

    this.refresh();
  }

  refresh(): void {
    this._applyFilterAndSort();
    this._renderTable();
  }

  selectIndex(filteredIdx: number): void {
    this._selectedIdx = filteredIdx;
    this._renderTable();
  }

  get selectedIdx(): number { return this._selectedIdx; }
  get filtered(): Detection[] { return this._filtered; }
  get rows(): Detection[] { return this._rows; }

  ensurePageShowsSelected(): void {
    if (this._selectedIdx < 0) return;
    const newPage = Math.floor(this._selectedIdx / this._pageSize);
    if (newPage !== this._page) {
      this._page = newPage;
      this._renderTable();
    }
  }

  // ─── Private: column type detection ────────────────────────

  private _detectColumnTypes(): void {
    const prettify = (k: string) =>
      k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Use all columns present in the data (superset of table cols)
    const allKeys = new Set<string>();
    // Table cols first (in order), then any remaining data keys
    this._tableCols.forEach(c => allKeys.add(c.key));
    if (this._rows.length > 0) {
      Object.keys(this._rows[0]).forEach(k => allKeys.add(k));
    }

    const meta: FilterColumnMeta[] = [];
    const sampleSize = Math.min(50, this._rows.length);

    allKeys.forEach(key => {
      let isFloat = true;
      let checked = 0;
      for (let i = 0; i < sampleSize; i++) {
        const v = (this._rows[i] as any)[key];
        if (v === null || v === undefined || v === '') continue;
        checked++;
        if (typeof v === 'number') continue;
        const n = parseFloat(String(v));
        if (isNaN(n) || !isFinite(n)) { isFloat = false; break; }
      }
      // If we found no non-empty values, default to string
      if (checked === 0) isFloat = false;

      const label = this._tableCols.find(c => c.key === key)?.label ?? prettify(key);
      meta.push({ key, label, dtype: isFloat ? 'float' : 'string' });
    });

    this._filterColMeta = meta;
    this._rebuildColSelect();
  }

  private _rebuildColSelect(): void {
    this._colSelect.innerHTML = '';
    this._filterColMeta.forEach(m => {
      const o = document.createElement('option');
      o.value = m.key;
      o.textContent = m.label;
      this._colSelect.appendChild(o);
    });
    this._updateOpSelect();
  }

  // ─── Private: filter GUI interactions ──────────────────────

  private _getSelectedColMeta(): FilterColumnMeta | undefined {
    return this._filterColMeta.find(m => m.key === this._colSelect.value);
  }

  private _updateOpSelect(): void {
    const meta = this._getSelectedColMeta();
    const ops = meta?.dtype === 'float' ? FLOAT_OPS : STRING_OPS;
    this._opSelect.innerHTML = '';
    ops.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      this._opSelect.appendChild(opt);
    });
    this._updateValueInput();
  }

  private _currentOpNeedsValue(): boolean {
    const meta = this._getSelectedColMeta();
    const ops = meta?.dtype === 'float' ? FLOAT_OPS : STRING_OPS;
    const op = ops.find(o => o.value === this._opSelect.value);
    return op ? op.needsValue : true;
  }

  private _updateValueInput(): void {
    this._valueContainer.innerHTML = '';
    if (!this._currentOpNeedsValue()) return;

    const meta = this._getSelectedColMeta();
    if (meta?.dtype === 'float') {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.style.cssText = inputStyle('100px');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this._addFilter(); });
      this._valueContainer.appendChild(inp);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'value';
      inp.style.cssText = inputStyle('140px');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this._addFilter(); });
      this._valueContainer.appendChild(inp);
    }
  }

  private _addFilter(): void {
    const col = this._colSelect.value;
    const op = this._opSelect.value;

    if (!this._currentOpNeedsValue()) {
      this._activeFilters.push({ col, op, val: null });
    } else {
      const inp = this._valueContainer.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
      if (!inp || !inp.value.trim()) return;
      const raw = inp.value.trim();
      const meta = this._getSelectedColMeta();
      const val: string | number = meta?.dtype === 'float' ? parseFloat(raw) : raw;
      if (meta?.dtype === 'float' && isNaN(val as number)) return;
      this._activeFilters.push({ col, op, val });
      inp.value = '';
    }

    this._page = 0;
    this._renderChips();
    this.refresh();
  }

  private _removeFilter(index: number): void {
    this._activeFilters.splice(index, 1);
    this._page = 0;
    this._renderChips();
    this.refresh();
  }

  private _clearAllFilters(): void {
    this._activeFilters = [];
    this._page = 0;
    this._renderChips();
    this.refresh();
  }

  private _renderChips(): void {
    this._chipContainer.innerHTML = '';
    if (this._activeFilters.length === 0) {
      this._chipContainer.style.display = 'none';
      return;
    }
    this._chipContainer.style.display = 'flex';

    this._activeFilters.forEach((f, i) => {
      const chip = document.createElement('span');
      chip.style.cssText = filterChipStyle();

      const colMeta = this._filterColMeta.find(m => m.key === f.col);
      const colLabel = colMeta?.label ?? f.col;
      const opLabel = OP_LABELS[f.op] ?? f.op;

      let text = `${colLabel} ${opLabel}`;
      if (f.val !== null) {
        text += typeof f.val === 'string' ? ` "${f.val}"` : ` ${f.val}`;
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = text;

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'jp-BA-chip-dismiss';
      dismissBtn.style.cssText = filterChipDismissStyle();
      dismissBtn.textContent = '\u00d7';
      dismissBtn.title = 'Remove filter';
      dismissBtn.addEventListener('click', () => this._removeFilter(i));

      chip.append(labelSpan, dismissBtn);
      this._chipContainer.appendChild(chip);
    });

    // Clear all button
    if (this._activeFilters.length > 1) {
      const clearAll = document.createElement('button');
      clearAll.textContent = 'Clear all';
      clearAll.style.cssText = btnStyle() + `font-size:10px;padding:2px 8px;margin-left:4px;`;
      clearAll.addEventListener('click', () => this._clearAllFilters());
      this._chipContainer.appendChild(clearAll);
    }
  }

  // ─── Private: UI build ─────────────────────────────────────

  private _buildUI(): void {
    // Filter builder bar
    const filterBar = document.createElement('div');
    filterBar.style.cssText = barBottomStyle();

    const filterLbl = document.createElement('span');
    filterLbl.style.cssText = smallLabelStyle();
    filterLbl.textContent = 'Filter:';

    this._colSelect = document.createElement('select');
    this._colSelect.style.cssText = selectStyle() + `max-width:140px;`;
    this._colSelect.addEventListener('change', () => this._updateOpSelect());

    this._opSelect = document.createElement('select');
    this._opSelect.style.cssText = selectStyle() + `max-width:130px;`;
    this._opSelect.addEventListener('change', () => this._updateValueInput());

    this._valueContainer = document.createElement('div');
    this._valueContainer.style.cssText = `display:inline-flex;`;

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = btnStyle(true);
    addBtn.addEventListener('click', () => this._addFilter());

    this._viewModeSelect = document.createElement('select');
    this._viewModeSelect.style.cssText = selectStyle() + `font-size:11px;margin-left:auto;display:none;`;
    (['all', 'pending', 'reviewed'] as const).forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      this._viewModeSelect.appendChild(o);
    });
    this._viewModeSelect.addEventListener('change', () => {
      this._viewMode = this._viewModeSelect.value as any;
      this._page = 0;
      this.refresh();
      if (this._filtered.length > 0) {
        this._selectedIdx = 0;
        this.rowSelected.emit({ row: this._filtered[0], filteredIdx: 0 });
      }
    });

    this._refreshBtn = document.createElement('button');
    this._refreshBtn.textContent = '↻';
    this._refreshBtn.title = 'Refresh list';
    this._refreshBtn.style.cssText = btnStyle() + `font-size:17px;padding:1px 7px 3px;display:none;`;
    this._refreshBtn.addEventListener('click', () => {
      this._page = 0;
      this.refresh();
      if (this._filtered.length > 0) {
        this._selectedIdx = 0;
        this.rowSelected.emit({ row: this._filtered[0], filteredIdx: 0 });
      }
    });

    filterBar.append(
      filterLbl, this._colSelect, this._opSelect, this._valueContainer,
      addBtn, this._viewModeSelect, this._refreshBtn,
    );

    // Chip bar (hidden until filters are added)
    this._chipContainer = document.createElement('div');
    this._chipContainer.style.cssText =
      `display:none;align-items:center;gap:4px;padding:4px 12px;` +
      `background:${COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText =
      `flex:0 0 auto;overflow-y:auto;max-height:175px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    const table = document.createElement('table');
    table.style.cssText = `width:100%;border-collapse:collapse;font-size:12px;`;

    this._thead = document.createElement('thead');
    this._thead.style.cssText = `background:${COLORS.bgMantle};position:sticky;top:0;z-index:1;`;

    this._tableCols = [
      { key: 'id', label: 'ID' },
      { key: 'common_name', label: 'Common Name' },
      { key: 'start_time', label: 'Start (s)' },
      { key: 'end_time', label: 'End (s)' },
    ];
    this._rebuildTableHeader();
    this._tableBody = document.createElement('tbody');
    table.append(this._thead, this._tableBody);
    tableWrap.appendChild(table);

    // Pagination bar
    const pagBar = document.createElement('div');
    pagBar.style.cssText = barBottomStyle() + `gap:5px;`;

    const mkPagBtn = (label: string, action: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = btnStyle() + `padding:2px 7px;font-size:11px;`;
      b.addEventListener('click', action);
      return b;
    };

    const firstBtn = mkPagBtn('⏮', () => { this._page = 0; this._renderTable(); });
    const prevBtn = mkPagBtn('◀', () => {
      if (this._page > 0) { this._page--; this._renderTable(); }
    });
    const nextBtn = mkPagBtn('▶', () => {
      const max = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
      if (this._page < max) { this._page++; this._renderTable(); }
    });
    const lastBtn = mkPagBtn('⏭', () => {
      this._page = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
      this._renderTable();
    });

    this._pageInput = document.createElement('input');
    this._pageInput.type = 'number';
    this._pageInput.min = '1';
    this._pageInput.value = '1';
    this._pageInput.style.cssText = inputStyle('44px') + `text-align:center;`;
    this._pageInput.addEventListener('change', () => {
      const max = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
      this._page = Math.max(0, Math.min(parseInt(this._pageInput.value) - 1, max));
      this._renderTable();
    });

    this._pageInfo = document.createElement('span');
    this._pageInfo.style.cssText = `font-size:11px;color:${COLORS.textSubtle};white-space:nowrap;`;

    const rowsLbl = document.createElement('span');
    rowsLbl.style.cssText = smallLabelStyle() + `margin-left:6px;`;
    rowsLbl.textContent = 'Rows:';

    this._pageSizeSelect = document.createElement('select');
    this._pageSizeSelect.style.cssText = selectStyle() + `font-size:11px;`;
    ['5', '10', '20', 'custom'].forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      if (v === '10') o.selected = true;
      this._pageSizeSelect.appendChild(o);
    });
    this._pageSizeSelect.addEventListener('change', () => {
      if (this._pageSizeSelect.value === 'custom') {
        this._customPageSizeInput.style.display = 'inline-block';
      } else {
        this._customPageSizeInput.style.display = 'none';
        this._pageSize = parseInt(this._pageSizeSelect.value);
        this._page = 0;
        this._renderTable();
      }
    });

    this._customPageSizeInput = document.createElement('input');
    this._customPageSizeInput.type = 'number';
    this._customPageSizeInput.min = '1';
    this._customPageSizeInput.value = '10';
    this._customPageSizeInput.style.cssText = inputStyle('48px');
    this._customPageSizeInput.style.display = 'none';
    this._customPageSizeInput.addEventListener('change', () => {
      const n = parseInt(this._customPageSizeInput.value);
      if (n > 0) { this._pageSize = n; this._page = 0; this._renderTable(); }
    });

    pagBar.append(firstBtn, prevBtn, this._pageInput, this._pageInfo, nextBtn, lastBtn,
                  rowsLbl, this._pageSizeSelect, this._customPageSizeInput);

    this.element.append(filterBar, this._chipContainer, tableWrap, pagBar);
  }

  // ─── Private: columns ──────────────────────────────────────

  private _configureColumns(opts: {
    rows: Detection[];
    identCol: string;
    displayCols: string[];
    dataCols: string[];
  }): void {
    const prettify = (k: string) =>
      k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (opts.dataCols.length > 0) {
      this._tableCols = opts.dataCols.map(k => ({ key: k, label: prettify(k) }));
    } else if (opts.rows.length > 0 && !opts.identCol && opts.displayCols.length === 0) {
      this._tableCols = Object.keys(opts.rows[0]).map(k => ({ key: k, label: prettify(k) }));
    } else {
      const baseCols = [
        { key: 'id', label: 'ID' },
        { key: 'start_time', label: 'Start (s)' },
        { key: 'end_time', label: 'End (s)' },
      ];
      const extraCols = opts.displayCols.map(k => ({ key: k, label: prettify(k) }));
      if (opts.identCol) {
        this._tableCols = [
          { key: 'id', label: 'ID' },
          { key: opts.identCol, label: prettify(opts.identCol) },
          ...extraCols,
          { key: 'start_time', label: 'Start (s)' },
          { key: 'end_time', label: 'End (s)' },
        ];
      } else {
        this._tableCols = [...baseCols, ...extraCols];
      }
    }
    this._rebuildTableHeader();
  }

  private _rebuildTableHeader(): void {
    this._thead.innerHTML = '';
    const headerRow = document.createElement('tr');
    this._tableCols.forEach(({ key, label }) => {
      const th = document.createElement('th');
      th.dataset.col = key;
      th.style.cssText =
        `padding:5px 8px;text-align:left;color:${COLORS.blue};font-size:11px;` +
        `cursor:pointer;user-select:none;white-space:nowrap;` +
        `border-bottom:2px solid ${COLORS.bgSurface0};`;
      th.textContent = label;
      th.addEventListener('click', () => {
        if (this._sortCol === key) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortCol = key;
          this._sortAsc = true;
        }
        this._thead.querySelectorAll('th').forEach(t => {
          const col = (t as HTMLElement).dataset.col!;
          const entry = this._tableCols.find(c => c.key === col);
          if (entry) t.textContent = entry.label + (col === this._sortCol ? (this._sortAsc ? ' ▲' : ' ▼') : '');
        });
        this._page = 0;
        this.refresh();
      });
      headerRow.appendChild(th);
    });
    this._thead.appendChild(headerRow);
  }

  // ─── Private: filter + sort ────────────────────────────────

  private _applyFilterAndSort(): void {
    const filters = this._activeFilters;

    let rows = this._rows.filter(row => {
      return filters.every(f => {
        const v = (row as any)[f.col];

        // Null / empty operators (no value comparison)
        if (f.op === 'is_null') return v === null || v === undefined;
        if (f.op === 'is_not_null') return v !== null && v !== undefined;
        if (f.op === 'is_empty') return v === null || v === undefined || String(v).trim() === '';
        if (f.op === 'is_not_empty') return v !== null && v !== undefined && String(v).trim() !== '';

        // Value-based operators
        const vs = String(v).toLowerCase();
        const fvs = String(f.val).toLowerCase();
        if (f.op === '=') return vs === fvs;
        if (f.op === '!=') return vs !== fvs;
        if (f.op === 'contains') return vs.includes(fvs);
        if (f.op === 'starts_with') return vs.startsWith(fvs);
        if (f.op === 'ends_with') return vs.endsWith(fvs);

        // Numeric operators
        const n = parseFloat(String(v));
        const fvn = typeof f.val === 'number' ? f.val : parseFloat(String(f.val));
        if (f.op === '>=') return n >= fvn;
        if (f.op === '<=') return n <= fvn;
        if (f.op === '>') return n > fvn;
        if (f.op === '<') return n < fvn;

        return true;
      });
    });

    rows.sort((a, b) => {
      const av = (a as any)[this._sortCol];
      const bv = (b as any)[this._sortCol];
      let cmp = 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      } else {
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return this._sortAsc ? cmp : -cmp;
    });

    // Apply view mode filter
    if (this._viewMode === 'pending') {
      rows = rows.filter(r => !this._form.getReviewedMap().has(r.id));
    } else if (this._viewMode === 'reviewed') {
      rows = rows.filter(r => this._form.getReviewedMap().has(r.id));
    }

    this._filtered = rows;
  }

  // ─── Private: render ───────────────────────────────────────

  private _renderTable(): void {
    this._tableBody.innerHTML = '';
    const total = this._filtered.length;
    const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
    this._page = Math.min(this._page, maxPage);

    const start = this._page * this._pageSize;
    const slice = this._filtered.slice(start, start + this._pageSize);

    slice.forEach((row, i) => {
      const globalIdx = start + i;
      const isSelected = globalIdx === this._selectedIdx;
      const reviewed = this._form.isReviewed(row);
      const tr = document.createElement('tr');
      const baseBg = i % 2 === 0 ? COLORS.bgBase : COLORS.bgAltRow;
      tr.style.cssText =
        `cursor:pointer;border-bottom:1px solid ${COLORS.bgHover};` +
        (isSelected
          ? `background:${COLORS.bgSelected};`
          : reviewed
            ? `background:${COLORS.bgReviewed};`
            : `background:${baseBg};`);

      this._tableCols.forEach(({ key }) => {
        const raw = row[key];
        const v = typeof raw === 'number' && !Number.isInteger(raw)
          ? raw.toFixed(key === 'confidence' ? 3 : 2)
          : raw ?? '—';
        const td = document.createElement('td');
        td.textContent = String(v);
        td.style.cssText =
          `padding:4px 8px;font-size:12px;white-space:nowrap;` +
          `color:${reviewed ? COLORS.textMuted : COLORS.textPrimary};`;
        tr.appendChild(td);
      });

      tr.addEventListener('click', () => {
        this._selectedIdx = globalIdx;
        this._renderTable();
        this.rowSelected.emit({ row, filteredIdx: globalIdx });
      });
      tr.addEventListener('mouseenter', () => {
        if (globalIdx !== this._selectedIdx) tr.style.background = COLORS.bgHover;
      });
      tr.addEventListener('mouseleave', () => {
        if (globalIdx !== this._selectedIdx)
          tr.style.background = reviewed ? COLORS.bgReviewed : baseBg;
      });

      this._tableBody.appendChild(tr);
    });

    const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
    this._pageInput.value = String(this._page + 1);
    this._pageInfo.textContent = `/ ${totalPages}  (${total} rows)`;
  }
}
