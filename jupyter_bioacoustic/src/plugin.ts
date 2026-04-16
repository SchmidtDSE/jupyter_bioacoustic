import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

import {
  COLORS,
  DISPLAY_CHIP_COLORS,
  inputStyle,
  selectStyle,
  labelStyle,
  btnStyle,
  barStyle,
  barBottomStyle,
  barTopBottomStyle,
  smallLabelStyle,
  formLabelStyle,
  sectionTitleStyle,
  monoTextStyle,
  mutedTextStyle,
  formRowStyle,
  dividerStyle,
  fullWidthDividerStyle,
  cssSize,
  injectGlobalStyles,
} from './styles';
import { Detection, FilterClause } from './types';
import { fmtTime } from './util';
import { KernelBridge } from './kernel';
import { FormPanel } from './sections/FormPanel';
import { Player } from './sections/Player';

// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════

let _counter = 0;

class BioacousticWidget extends Widget {
  private _kernelBridge: KernelBridge;

  // ── Data state ─────────────────────────────────────────────
  private _rows: Detection[] = [];
  private _filtered: Detection[] = [];
  private _sortCol = 'id';
  private _sortAsc = true;
  private _page = 0;
  private _pageSize = 10;
  private _selectedIdx = -1;
  private _filterExpr = '';
  private _viewMode: 'all' | 'pending' | 'reviewed' = 'all';
  private _categoryPath = '';
  private _outputPath = '';

  // ── Mode state ──────────────────────────────────────────────
  private _predictionCol = '';
  private _displayCols: string[] = [];
  private _dataCols: string[] = [];
  private _duplicateEntries = false;


  // ── DOM refs — header/filter ────────────────────────────────
  private _titleEl!: HTMLSpanElement;
  private _statusEl!: HTMLSpanElement;
  private _filterInput!: HTMLInputElement;
  private _viewModeSelect!: HTMLSelectElement;
  private _refreshBtn!: HTMLButtonElement;

  // ── DOM refs — table ────────────────────────────────────────
  private _tableCols: Array<{ key: string; label: string }> = [];
  private _thead!: HTMLTableSectionElement;
  private _tableBody!: HTMLTableSectionElement;
  private _pageInfo!: HTMLSpanElement;
  private _pageSizeSelect!: HTMLSelectElement;
  private _customPageSizeInput!: HTMLInputElement;
  private _pageInput!: HTMLInputElement;

  // ── DOM refs — info card ────────────────────────────────────
  private _infoCard!: HTMLDivElement;

  // ── Sections (extracted) ─────────────────────────────────────
  private _player!: Player;
  private _form!: FormPanel;

  constructor(tracker: INotebookTracker) {
    super();
    this._kernelBridge = new KernelBridge(tracker);
    this.id = `jp-bioacoustic-${_counter++}`;
    this.title.label = 'Bioacoustic Reviewer';
    this.title.closable = true;
    injectGlobalStyles();
    this._buildUI();
  }

  // ─── UI construction ────────────────────────────────────────

  private _buildUI(): void {
    this.node.style.cssText =
      `display:flex;flex-direction:column;width:100%;height:100%;` +
      `background:${COLORS.bgBase};color:${COLORS.textPrimary};` +
      `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
      `overflow:hidden;box-sizing:border-box;`;

    // ── Header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = barBottomStyle();

    this._titleEl = document.createElement('span');
    this._titleEl.textContent = 'Bioacoustic Reviewer';
    this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `flex:1;text-align:right;font-size:11px;color:${COLORS.green};` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    this._statusEl.textContent = 'Loading…';
    header.append(this._titleEl, this._statusEl);

    // ── Filter bar ───────────────────────────────────────────────
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
      this._applyFilterAndSort();
      this._renderTable();
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
      this._applyFilterAndSort();
      this._renderTable();
      // Auto-select first row in new view
      if (this._filtered.length > 0) {
        this._selectRow(0);
        void this._player.loadRow(this._filtered[0]);
      }
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh list';
    refreshBtn.style.cssText = btnStyle() + `font-size:14px;padding:2px 7px;display:none;`;
    refreshBtn.addEventListener('click', () => {
      this._page = 0;
      this._applyFilterAndSort();
      this._renderTable();
      if (this._filtered.length > 0) {
        this._selectRow(0);
        void this._player.loadRow(this._filtered[0]);
      }
    });
    this._refreshBtn = refreshBtn;

    filterBar.append(filterLbl, this._filterInput, applyBtn, clearBtn, this._viewModeSelect, refreshBtn);

    // ── Table ────────────────────────────────────────────────────
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText =
      `flex:0 0 auto;overflow-y:auto;max-height:175px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    const table = document.createElement('table');
    table.style.cssText = `width:100%;border-collapse:collapse;font-size:12px;`;

    this._thead = document.createElement('thead');
    this._thead.style.cssText = `background:${COLORS.bgMantle};position:sticky;top:0;z-index:1;`;

    // Default cols — rebuilt in _configureFormForMode once mode is known
    this._tableCols = [
      { key: 'id',          label: 'ID' },
      { key: 'common_name', label: 'Common Name' },
      { key: 'confidence',  label: 'Conf' },
      { key: 'rank',        label: 'Rank' },
      { key: 'start_time',  label: 'Start (s)' },
      { key: 'end_time',    label: 'End (s)' },
    ];
    this._rebuildTableHeader();
    this._tableBody = document.createElement('tbody');
    table.append(this._thead, this._tableBody);
    tableWrap.appendChild(table);

    // ── Pagination bar ───────────────────────────────────────────
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
    const prevBtn  = mkPagBtn('◀', () => {
      if (this._page > 0) { this._page--; this._renderTable(); }
    });
    const nextBtn  = mkPagBtn('▶', () => {
      const max = Math.max(0, Math.ceil(this._filtered.length / this._pageSize) - 1);
      if (this._page < max) { this._page++; this._renderTable(); }
    });
    const lastBtn  = mkPagBtn('⏭', () => {
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

    // ── Info card ────────────────────────────────────────────────
    this._infoCard = document.createElement('div');
    this._infoCard.style.cssText =
      `display:flex;align-items:center;gap:10px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;min-height:34px;`;
    this._infoCard.innerHTML =
      `<span style="font-size:12px;color:${COLORS.textMuted};font-style:italic;">No selection</span>`;

    // ── Sections ──────────────────────────────────────────────────
    this._form = new FormPanel(this._kernelBridge);
    this._player = new Player(this._kernelBridge, this._form);

    // Wire FormPanel signals
    this._form.submitted.connect(() => this._onSkip());
    this._form.prevRequested.connect(() => this._onPrev());
    this._form.nextRequested.connect(() => this._onSkip());
    this._form.reviewDeleted.connect(() => this._renderTable());
    this._form.annotationChanged.connect(() => this._player.renderFrame());
    this._form.activeToolChanged.connect(() => {
      this._player.updateCursor();
      this._player.renderFrame();
    });
    this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    // Wire Player signals
    this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    // ── Assemble widget ──────────────────────────────────────────
    this.node.append(
      header, filterBar, tableWrap, pagBar,
      this._infoCard,
      this._player.element,
      this._form.element
    );
  }

  // ─── Lumino lifecycle ────────────────────────────────────────

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._player.attach();
    void this._init();
  }

  protected onBeforeDetach(msg: Message): void {
    this._player.detach();
    super.onBeforeDetach(msg);
  }

  // ─── Initialization ──────────────────────────────────────────

  private async _init(): Promise<void> {
    this._setStatus('Reading kernel variables…');
    let raw: string;
    try {
      raw = await this._kernelBridge.exec(
        `import json as _j\n` +
        `print(_j.dumps({\n` +
        `  'data': _BA_DATA,\n` +
        `  'audio_path': _BA_AUDIO_PATH,\n` +
        `  'audio_col': _BA_AUDIO_COL,\n` +
        `  'category_path': _BA_CATEGORY_PATH,\n` +
        `  'output': _BA_OUTPUT,\n` +
        `  'prediction_col': _BA_PREDICTION_COL,\n` +
        `  'display_cols': _BA_DISPLAY_COLS,\n` +
        `  'data_cols': _BA_DATA_COLS,\n` +
        `  'form_config': _BA_FORM_CONFIG,\n` +
        `  'capture': _BA_CAPTURE,\n` +
        `  'capture_dir': _BA_CAPTURE_DIR,\n` +
        `  'duplicate_entries': _BA_DUPLICATE_ENTRIES,\n` +
        `  'default_buffer': _BA_DEFAULT_BUFFER,\n` +
        `}))`
      );
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
      return;
    }

    let cfg: {
      data: string; audio_path: string; audio_col: string; category_path: string; output: string;
      prediction_col: string; display_cols: string; data_cols: string;
      form_config: string; capture: string; capture_dir: string; duplicate_entries: string; default_buffer: string;
    };
    try {
      cfg = JSON.parse(raw);
    } catch {
      this._setStatus('❌ Failed to parse kernel config', true);
      return;
    }

    this._categoryPath   = cfg.category_path;
    this._outputPath     = cfg.output;
    this._predictionCol  = cfg.prediction_col;
    this._displayCols    = JSON.parse(cfg.display_cols) as string[];
    this._dataCols       = JSON.parse(cfg.data_cols) as string[];
    const formConfig     = JSON.parse(cfg.form_config);
    this._duplicateEntries = !!cfg.duplicate_entries;

    try {
      this._rows = JSON.parse(cfg.data) as Detection[];
    } catch {
      this._setStatus('❌ Failed to parse detection data', true);
      return;
    }

    this._configureFormForMode();

    // Set title from mode
    if (this._predictionCol) {
      this._titleEl.textContent = 'Bioacoustic Reviewer';
      this.title.label = 'Bioacoustic Reviewer';
    } else {
      this._titleEl.textContent = 'Bioacoustic Annotator';
      this.title.label = 'Bioacoustic Annotator';
    }

    // Initialize form panel
    this._form.setContext({
      formConfig,
      rows: this._rows,
      predictionCol: this._predictionCol,
      duplicateEntries: this._duplicateEntries,
      outputPath: this._outputPath,
    });
    await this._form.build();
    await this._form.loadOutputFileProgress();
    await this._form.loadReviewedState();

    // Initialize player
    this._player.setContext({
      audioPath: cfg.audio_path,
      audioCol: cfg.audio_col,
      captureLabel: cfg.capture ?? '',
      captureDir: cfg.capture_dir ?? '',
      predictionCol: this._predictionCol,
      displayCols: this._displayCols,
      defaultBuffer: parseFloat(cfg.default_buffer) || 3,
      rows: this._rows,
    });

    // Show view mode toggle and default to pending when duplicate prevention is on
    if (!this._duplicateEntries) {
      this._viewModeSelect.style.display = '';
      this._refreshBtn.style.display = '';
      this._viewMode = 'pending';
      this._viewModeSelect.value = 'pending';
    }

    this._applyFilterAndSort();
    this._renderTable();

    if (this._filtered.length > 0) {
      this._selectRow(0);
      await this._player.loadRow(this._filtered[0]);
    }

    const noun = this._predictionCol ? 'detections' : 'clips';
    this._setStatus(`✓ ${this._rows.length} ${noun} loaded`);
  }

  private _configureFormForMode(): void {
    const prettify = (k: string) =>
      k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (this._dataCols.length > 0) {
      this._tableCols = this._dataCols.map(k => ({ key: k, label: prettify(k) }));
    } else if (this._rows.length > 0 && !this._predictionCol && this._displayCols.length === 0) {
      this._tableCols = Object.keys(this._rows[0]).map(k => ({ key: k, label: prettify(k) }));
    } else {
      const baseCols = [
        { key: 'id', label: 'ID' },
        { key: 'start_time', label: 'Start (s)' },
        { key: 'end_time', label: 'End (s)' },
      ];
      const extraCols = this._displayCols.map(k => ({ key: k, label: prettify(k) }));
      if (this._predictionCol) {
        this._tableCols = [
          { key: 'id', label: 'ID' },
          { key: this._predictionCol, label: prettify(this._predictionCol) },
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

  // ─── Form methods removed — now in FormPanel ────────────────
  // (See src/sections/FormPanel.ts)


  // ─── Table header ────────────────────────────────────────────

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
        this._applyFilterAndSort();
        this._renderTable();
      });
      headerRow.appendChild(th);
    });
    this._thead.appendChild(headerRow);
  }

  // ─── Table ───────────────────────────────────────────────────

  private _parseFilters(expr: string): FilterClause[] {
    if (!expr.trim()) return [];
    return expr.split(/\s+and\s+/i).map(clause => {
      const m = clause.trim().match(/^(\w+)\s*(=|!=|>=|<=|>|<|contains)\s*(.+)$/i);
      if (!m) return null;
      const col = m[1];
      const op  = m[2];
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
    this._applyFilterAndSort();
    this._renderTable();
  }

  private _applyFilterAndSort(): void {
    const filters = this._parseFilters(this._filterExpr);

    let rows = this._rows.filter(row => {
      return filters.every(f => {
        const v = (row as any)[f.col];
        const vs  = String(v).toLowerCase();
        const fvs = String(f.val).toLowerCase();
        if (f.op === '=')        return vs === fvs;
        if (f.op === '!=')       return vs !== fvs;
        if (f.op === 'contains') return vs.includes(fvs);
        const n   = parseFloat(String(v));
        const fvn = typeof f.val === 'number' ? f.val : parseFloat(String(f.val));
        if (f.op === '>=') return n >= fvn;
        if (f.op === '<=') return n <= fvn;
        if (f.op === '>')  return n > fvn;
        if (f.op === '<')  return n < fvn;
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

  private _renderTable(): void {
    this._tableBody.innerHTML = '';
    const total   = this._filtered.length;
    const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
    this._page    = Math.min(this._page, maxPage);

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
        const v   = typeof raw === 'number' && !Number.isInteger(raw)
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
        this._selectRow(globalIdx);
        void this._player.loadRow(this._filtered[globalIdx]);
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

  private _selectRow(filteredIdx: number, autoUpdateInputs = true): void {
    this._selectedIdx = filteredIdx;
    const row = this._filtered[filteredIdx];
    if (!row) return;

    // ── Info card ──
    this._infoCard.innerHTML = '';

    const sep = () => {
      const s = document.createElement('span');
      s.style.cssText = `color:${COLORS.bgSurface1};font-size:11px;flex-shrink:0;`;
      s.textContent = '|';
      return s;
    };

    const mkChip = (text: string, color: string) => {
      const s = document.createElement('span');
      s.style.cssText = `font-size:12px;color:${color};flex-shrink:0;`;
      s.textContent = text;
      return s;
    };

    const items: HTMLElement[] = [];

    items.push(mkChip(
      `${fmtTime(row.start_time)} – ${fmtTime(row.end_time)}`,
      COLORS.textSubtle
    ));

    if (this._predictionCol && row[this._predictionCol] !== undefined) {
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-size:13px;font-weight:600;color:${COLORS.textPrimary};flex-shrink:0;`;
      nameSpan.textContent = String(row[this._predictionCol]);
      items.unshift(nameSpan);
    }

    const colColors = DISPLAY_CHIP_COLORS;
    this._displayCols.forEach((col, i) => {
      if (row[col] === undefined) return;
      const val = typeof row[col] === 'number' && !Number.isInteger(row[col])
        ? (row[col] as number).toFixed(3)
        : String(row[col]);
      items.push(mkChip(`${col}: ${val}`, colColors[i % colColors.length]));
    });

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Prev';
    prevBtn.style.cssText = btnStyle() + `font-size:11px;`;
    prevBtn.disabled = filteredIdx === 0;
    prevBtn.addEventListener('click', () => this._onPrev());

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = btnStyle() + `font-size:11px;`;
    nextBtn.disabled = filteredIdx >= this._filtered.length - 1;
    nextBtn.addEventListener('click', () => this._onSkip());

    const cardChildren: HTMLElement[] = [];
    items.forEach((el, i) => {
      cardChildren.push(el);
      if (i < items.length - 1) cardChildren.push(sep());
    });
    cardChildren.push(spacer, prevBtn, nextBtn);
    this._infoCard.append(...cardChildren);

    this._renderTable();
    this._form.setSelectionInfo(filteredIdx, this._filtered.length);
    this._form.updateFromRow(row);

    // Update signal time display based on annotation state
    this._player.signalTimeDisplay.textContent = this._form.getAnnotConfig()
      ? 'drag on spectrogram to annotate' : '';
  }

  private _ensurePageShowsSelected(): void {
    if (this._selectedIdx < 0) return;
    const newPage = Math.floor(this._selectedIdx / this._pageSize);
    if (newPage !== this._page) {
      this._page = newPage;
      this._renderTable();
    }
  }

  private _onPrev(): void {
    if (this._selectedIdx > 0) {
      this._selectRow(this._selectedIdx - 1);
      this._ensurePageShowsSelected();
      void this._player.loadRow(this._filtered[this._selectedIdx]);
    }
  }

  private _onSkip(): void {
    if (this._selectedIdx < this._filtered.length - 1) {
      this._selectRow(this._selectedIdx + 1);
      this._ensurePageShowsSelected();
      void this._player.loadRow(this._filtered[this._selectedIdx]);
    }
  }

  // ─── Capture ─────────────────────────────────────────────────


  // ─── Kernel helpers ──────────────────────────────────────────


  // ─── Utilities ───────────────────────────────────────────────

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : COLORS.green;
  }

}

// ═══════════════════════════════════════════════════════════════
// Plugin registration
// ═══════════════════════════════════════════════════════════════

export const bioacousticPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-bioacoustic:plugin',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker
  ) => {
    (window as any)._bioacousticApp = app;

    (window as any)._bioacousticOpenInline = (divId: string) => {
      const container = document.getElementById(divId);
      if (!container) return;
      const widget = new BioacousticWidget(tracker);
      widget.node.style.cssText += `position:absolute;inset:0;`;
      Widget.attach(widget, container);
    };

    app.commands.addCommand('bioacoustic:open', {
      label: 'Open Bioacoustic Reviewer',
      execute: () => {
        const widget = new BioacousticWidget(tracker);
        app.shell.add(widget, 'main', { mode: 'split-right' });
        app.shell.activateById(widget.id);
      }
    });

    palette.addItem({ command: 'bioacoustic:open', category: 'Bioacoustic' });
    console.log('jupyter-bioacoustic activated');
  }
};

export default bioacousticPlugin;
