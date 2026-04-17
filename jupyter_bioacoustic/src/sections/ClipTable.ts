/**
 * ClipTable — filter bar, sortable/paginated data table, view mode toggle.
 *
 * Owns the filter expression parsing, sorting, pagination, row rendering,
 * and the reviewed-row styling. Emits `rowSelected` when the user clicks
 * a row or navigates via the view-mode/refresh controls.
 */
import { Signal } from '@lumino/signaling';
import { Detection, FilterClause } from '../types';
import { FormPanel } from './FormPanel';
import {
  COLORS,
  inputStyle,
  selectStyle,
  btnStyle,
  barBottomStyle,
  smallLabelStyle,
  injectGlobalStyles,
} from '../styles';

export class ClipTable {
  /** Root element — contains filter bar, table wrapper, pagination bar. */
  readonly element: HTMLDivElement;

  // ─── Signals ───────────────────────────────────────────────

  /** A row was clicked in the table. */
  readonly rowSelected = new Signal<this, { row: Detection; filteredIdx: number }>(this);

  // ─── Data state ────────────────────────────────────────────

  private _rows: Detection[] = [];
  private _filtered: Detection[] = [];
  private _sortCol = 'id';
  private _sortAsc = true;
  private _page = 0;
  private _pageSize = 10;
  private _selectedIdx = -1;
  private _filterExpr = '';
  private _viewMode: 'all' | 'pending' | 'reviewed' = 'all';
  private _tableCols: Array<{ key: string; label: string }> = [];

  // ─── DOM refs ──────────────────────────────────────────────

  private _filterInput!: HTMLInputElement;
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

  /** Set data and column config. Call after reading kernel vars. */
  setData(opts: {
    rows: Detection[];
    predictionCol: string;
    displayCols: string[];
    dataCols: string[];
    duplicateEntries: boolean;
  }): void {
    this._rows = opts.rows;
    this._configureColumns(opts);

    if (!opts.duplicateEntries) {
      this._viewModeSelect.style.display = '';
      this._refreshBtn.style.display = '';
      this._viewMode = 'pending';
      this._viewModeSelect.value = 'pending';
    }

    this.refresh();
  }

  /** Re-apply filters and re-render. */
  refresh(): void {
    this._applyFilterAndSort();
    this._renderTable();
  }

  /** Programmatically select a row by filtered index. Does NOT emit rowSelected. */
  selectIndex(filteredIdx: number): void {
    this._selectedIdx = filteredIdx;
    this._renderTable();
  }

  /** Get the currently selected filtered index. */
  get selectedIdx(): number { return this._selectedIdx; }

  /** Get the filtered rows array. */
  get filtered(): Detection[] { return this._filtered; }

  /** Get total input rows. */
  get rows(): Detection[] { return this._rows; }

  /** Scroll pagination to show the selected row. */
  ensurePageShowsSelected(): void {
    if (this._selectedIdx < 0) return;
    const newPage = Math.floor(this._selectedIdx / this._pageSize);
    if (newPage !== this._page) {
      this._page = newPage;
      this._renderTable();
    }
  }

  // ─── Private: UI ───────────────────────────────────────────

  private _buildUI(): void {
    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.style.cssText = barBottomStyle();

    const filterLbl = document.createElement('span');
    filterLbl.style.cssText = smallLabelStyle();
    filterLbl.textContent = 'Filter:';

    this._filterInput = document.createElement('input');
    this._filterInput.type = 'text';
    this._filterInput.className = 'jp-BA-filter-input';
    this._filterInput.placeholder = `common_name = 'Barred owl' and confidence >= 0.5`;
    this._filterInput.style.cssText = inputStyle('340px');
    this._filterInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._applyFilter();
    });

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = btnStyle(true);
    applyBtn.addEventListener('click', () => this._applyFilter());

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = btnStyle();
    clearBtn.addEventListener('click', () => {
      this._filterInput.value = '';
      this._filterExpr = '';
      this._page = 0;
      this.refresh();
    });

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

    filterBar.append(filterLbl, this._filterInput, applyBtn, clearBtn, this._viewModeSelect, this._refreshBtn);

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

    this.element.append(filterBar, tableWrap, pagBar);
  }

  // ─── Private: columns ──────────────────────────────────────

  private _configureColumns(opts: {
    rows: Detection[];
    predictionCol: string;
    displayCols: string[];
    dataCols: string[];
  }): void {
    const prettify = (k: string) =>
      k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (opts.dataCols.length > 0) {
      this._tableCols = opts.dataCols.map(k => ({ key: k, label: prettify(k) }));
    } else if (opts.rows.length > 0 && !opts.predictionCol && opts.displayCols.length === 0) {
      this._tableCols = Object.keys(opts.rows[0]).map(k => ({ key: k, label: prettify(k) }));
    } else {
      const baseCols = [
        { key: 'id', label: 'ID' },
        { key: 'start_time', label: 'Start (s)' },
        { key: 'end_time', label: 'End (s)' },
      ];
      const extraCols = opts.displayCols.map(k => ({ key: k, label: prettify(k) }));
      if (opts.predictionCol) {
        this._tableCols = [
          { key: 'id', label: 'ID' },
          { key: opts.predictionCol, label: prettify(opts.predictionCol) },
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

  private _parseFilters(expr: string): FilterClause[] {
    if (!expr.trim()) return [];
    return expr.split(/\s+and\s+/i).map(clause => {
      const m = clause.trim().match(/^(\w+)\s*(=|!=|>=|<=|>|<|contains)\s*(.+)$/i);
      if (!m) return null;
      const col = m[1];
      const op = m[2];
      const rawVal = m[3].trim();
      let val: string | number;
      if (/^['"]/.test(rawVal)) {
        val = rawVal.replace(/^['"]|['"]$/g, '');
      } else {
        val = parseFloat(rawVal);
      }
      return { col, op, val } as FilterClause;
    }).filter((x): x is FilterClause => x !== null);
  }

  private _applyFilter(): void {
    this._filterExpr = this._filterInput.value;
    this._page = 0;
    this.refresh();
  }

  private _applyFilterAndSort(): void {
    const filters = this._parseFilters(this._filterExpr);

    let rows = this._rows.filter(row => {
      return filters.every(f => {
        const v = (row as any)[f.col];
        const vs = String(v).toLowerCase();
        const fvs = String(f.val).toLowerCase();
        if (f.op === '=') return vs === fvs;
        if (f.op === '!=') return vs !== fvs;
        if (f.op === 'contains') return vs.includes(fvs);
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
