import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Detection {
  id: number;
  common_name: string;
  scientific_name: string;
  confidence: number;
  rank: number;
  start_time: number;
  end_time: number;
}

interface FilterClause {
  col: string;
  op: string;
  val: string | number;
}

// ═══════════════════════════════════════════════════════════════
// CSS helpers (module-level, shared across widget instances)
// ═══════════════════════════════════════════════════════════════

const inputStyle = (w = '80px') =>
  `background:#313244;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;` +
  `padding:3px 6px;font-size:12px;width:${w};box-sizing:border-box;`;

const selectStyle = () =>
  `background:#313244;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;` +
  `padding:3px 5px;font-size:12px;`;

const labelStyle = () =>
  `display:flex;align-items:center;gap:5px;color:#a6adc8;font-size:11px;white-space:nowrap;`;

const btnStyle = (primary = false) =>
  primary
    ? `background:#89b4fa;border:none;border-radius:4px;color:#1e1e2e;padding:4px 12px;` +
      `font-size:12px;cursor:pointer;font-weight:700;`
    : `background:#45475a;border:none;border-radius:4px;color:#cdd6f4;padding:4px 10px;` +
      `font-size:12px;cursor:pointer;`;

const barStyle = () =>
  `display:flex;align-items:center;gap:8px;padding:6px 12px;` +
  `background:#181825;flex-wrap:wrap;flex-shrink:0;`;

// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════

let _counter = 0;

class BioacousticWidget extends Widget {
  private _tracker: INotebookTracker;

  // ── Data state ─────────────────────────────────────────────
  private _rows: Detection[] = [];
  private _filtered: Detection[] = [];
  private _sortCol = 'id';
  private _sortAsc = true;
  private _page = 0;
  private _pageSize = 10;
  private _selectedIdx = -1;  // index into _filtered
  private _filterExpr = '';
  private _categories: string[] = [];
  private _audioPath = '';
  private _categoryPath = '';
  private _outputPath = '';

  // ── Player state ────────────────────────────────────────────
  private _specBitmap: ImageBitmap | null = null;
  private _segLoadStart = 0;    // absolute audio start of loaded segment (start_time - buffer, ≥ 0)
  private _segDuration = 0;     // duration of loaded audio
  private _detectionStart = 0;  // row.start_time
  private _detectionEnd = 0;    // row.end_time
  private _bufferSec = 5;
  private _playing = false;
  private _rafId = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── DOM refs — header/filter ────────────────────────────────
  private _statusEl!: HTMLSpanElement;
  private _filterInput!: HTMLInputElement;

  // ── DOM refs — table ────────────────────────────────────────
  private _tableBody!: HTMLTableSectionElement;
  private _pageInfo!: HTMLSpanElement;
  private _pageSizeSelect!: HTMLSelectElement;
  private _customPageSizeInput!: HTMLInputElement;
  private _pageInput!: HTMLInputElement;

  // ── DOM refs — info card ────────────────────────────────────
  private _infoCard!: HTMLDivElement;

  // ── DOM refs — player ───────────────────────────────────────
  private _bufferInput!: HTMLInputElement;
  private _startInput!: HTMLInputElement;
  private _endInput!: HTMLInputElement;
  private _canvas!: HTMLCanvasElement;
  private _canvasContainer!: HTMLDivElement;
  private _playBtn!: HTMLButtonElement;
  private _timeDisplay!: HTMLSpanElement;
  private _signalTimeDisplay!: HTMLSpanElement;
  private _audio!: HTMLAudioElement;

  // ── DOM refs — form ─────────────────────────────────────────
  private _isValidSelect!: HTMLSelectElement;
  private _notesInput!: HTMLTextAreaElement;
  private _signalStartInput!: HTMLInputElement;
  private _secondaryForm!: HTMLDivElement;
  private _verifiedNameSelect!: HTMLSelectElement;
  private _verificationConfSelect!: HTMLSelectElement;
  private _verifyBtn!: HTMLButtonElement;

  constructor(tracker: INotebookTracker) {
    super();
    this._tracker = tracker;
    this.id = `jp-bioacoustic-${_counter++}`;
    this.title.label = '🔬 Bioacoustic';
    this.title.closable = true;
    this._buildUI();
  }

  // ─── UI construction ────────────────────────────────────────

  private _buildUI(): void {
    this.node.style.cssText =
      `display:flex;flex-direction:column;width:100%;height:100%;` +
      `background:#1e1e2e;color:#cdd6f4;` +
      `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
      `overflow:hidden;box-sizing:border-box;`;

    // ── Header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = barStyle() + `border-bottom:1px solid #313244;`;

    const titleEl = document.createElement('span');
    titleEl.textContent = '🔬 Bioacoustic Reviewer';
    titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `flex:1;text-align:right;font-size:11px;color:#a6e3a1;` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    this._statusEl.textContent = 'Loading…';
    header.append(titleEl, this._statusEl);

    // ── Filter bar ───────────────────────────────────────────────
    const filterBar = document.createElement('div');
    filterBar.style.cssText = barStyle() + `border-bottom:1px solid #313244;`;

    const filterLbl = document.createElement('span');
    filterLbl.style.cssText = `color:#a6adc8;font-size:11px;white-space:nowrap;flex-shrink:0;`;
    filterLbl.textContent = 'Filter:';

    this._filterInput = document.createElement('input');
    this._filterInput.type = 'text';
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

    filterBar.append(filterLbl, this._filterInput, applyBtn, clearBtn);

    // ── Table ────────────────────────────────────────────────────
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText =
      `flex:0 0 auto;overflow-y:auto;max-height:175px;` +
      `border-bottom:1px solid #313244;`;

    const table = document.createElement('table');
    table.style.cssText = `width:100%;border-collapse:collapse;font-size:12px;`;

    const thead = document.createElement('thead');
    thead.style.cssText = `background:#181825;position:sticky;top:0;z-index:1;`;

    const headerRow = document.createElement('tr');
    const COLS: Array<{ key: string; label: string }> = [
      { key: 'id',          label: 'ID' },
      { key: 'common_name', label: 'Common Name' },
      { key: 'confidence',  label: 'Conf' },
      { key: 'rank',        label: 'Rank' },
      { key: 'start_time',  label: 'Start (s)' },
      { key: 'end_time',    label: 'End (s)' },
    ];
    COLS.forEach(({ key, label }) => {
      const th = document.createElement('th');
      th.dataset.col = key;
      th.style.cssText =
        `padding:5px 8px;text-align:left;color:#89b4fa;font-size:11px;` +
        `cursor:pointer;user-select:none;white-space:nowrap;` +
        `border-bottom:2px solid #313244;`;
      th.addEventListener('click', () => {
        if (this._sortCol === key) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortCol = key;
          this._sortAsc = true;
        }
        // Update sort indicators
        thead.querySelectorAll('th').forEach(t => {
          const col = (t as HTMLElement).dataset.col;
          const arrow = col === this._sortCol ? (this._sortAsc ? ' ▲' : ' ▼') : '';
          t.textContent = COLS.find(c => c.key === col)!.label + arrow;
        });
        this._page = 0;
        this._applyFilterAndSort();
        this._renderTable();
      });
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    this._tableBody = document.createElement('tbody');
    table.append(thead, this._tableBody);
    tableWrap.appendChild(table);

    // ── Pagination bar ───────────────────────────────────────────
    const pagBar = document.createElement('div');
    pagBar.style.cssText = barStyle() + `border-bottom:1px solid #313244;gap:5px;`;

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
    this._pageInfo.style.cssText = `font-size:11px;color:#a6adc8;white-space:nowrap;`;

    const rowsLbl = document.createElement('span');
    rowsLbl.style.cssText = `font-size:11px;color:#a6adc8;margin-left:6px;white-space:nowrap;flex-shrink:0;`;
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
      `background:#181825;border-bottom:1px solid #313244;flex-shrink:0;min-height:34px;`;
    this._infoCard.innerHTML =
      `<span style="font-size:12px;color:#6c7086;font-style:italic;">No selection</span>`;

    // ── Player controls ──────────────────────────────────────────
    const playerCtrls = document.createElement('div');
    playerCtrls.style.cssText = barStyle() + `border-bottom:1px solid #313244;`;

    const mkNumLabel = (labelText: string, def: string, w = '65px'): HTMLInputElement => {
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle();
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = def;
      inp.style.cssText = inputStyle(w);
      lbl.appendChild(inp);
      playerCtrls.appendChild(lbl);
      return inp;
    };

    this._bufferInput = mkNumLabel('Buffer (s)', '5',  '50px');
    this._startInput  = mkNumLabel('Start (s)',  '0',  '70px');
    this._endInput    = mkNumLabel('End (s)',    '12', '70px');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.style.cssText = btnStyle(true);
    loadBtn.addEventListener('click', () => void this._loadAudio());
    playerCtrls.appendChild(loadBtn);

    const ctrNote = document.createElement('span');
    ctrNote.textContent = '← re-load after changes';
    ctrNote.style.cssText = `font-size:10px;color:#6c7086;white-space:nowrap;`;
    playerCtrls.appendChild(ctrNote);

    // ── Spectrogram canvas ───────────────────────────────────────
    this._canvasContainer = document.createElement('div');
    this._canvasContainer.style.cssText =
      `flex:1;position:relative;min-height:80px;background:#11111b;overflow:hidden;cursor:crosshair;`;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
    this._canvas.addEventListener('click', e => void this._onCanvasClick(e));
    this._canvasContainer.appendChild(this._canvas);

    // ── Playback bar ─────────────────────────────────────────────
    const playBar = document.createElement('div');
    playBar.style.cssText = barStyle() + `border-top:1px solid #313244;border-bottom:1px solid #313244;`;

    this._playBtn = document.createElement('button');
    this._playBtn.textContent = '▶';
    this._playBtn.style.cssText = btnStyle() + `font-size:15px;width:34px;height:28px;`;
    this._playBtn.addEventListener('click', () => this._togglePlay());

    this._timeDisplay = document.createElement('span');
    this._timeDisplay.style.cssText =
      `font-variant-numeric:tabular-nums;font-size:11px;color:#a6adc8;font-family:ui-monospace,monospace;`;
    this._timeDisplay.textContent = '0:00.00 / 0:00.00';

    this._signalTimeDisplay = document.createElement('span');
    this._signalTimeDisplay.style.cssText =
      `margin-left:auto;font-size:11px;color:#cba6f7;font-family:ui-monospace,monospace;`;
    this._signalTimeDisplay.textContent = 'click spectrogram to mark signal';

    playBar.append(this._playBtn, this._timeDisplay, this._signalTimeDisplay);

    // ── Hidden audio element ─────────────────────────────────────
    this._audio = document.createElement('audio');
    this._audio.style.display = 'none';
    this._audio.addEventListener('ended', () => {
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
      this._renderFrame();
    });

    // ── Verification form ────────────────────────────────────────
    const formSection = document.createElement('div');
    formSection.style.cssText =
      `flex-shrink:0;padding:8px 12px;background:#181825;` +
      `border-top:1px solid #313244;display:flex;flex-direction:column;gap:6px;`;

    const mkFormLabel = (text: string): HTMLLabelElement => {
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle() + `font-size:12px;`;
      lbl.textContent = text;
      return lbl;
    };

    // Row 1: primary fields
    const formRow1 = document.createElement('div');
    formRow1.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;

    const ivLbl = mkFormLabel('is_valid');
    this._isValidSelect = document.createElement('select');
    this._isValidSelect.style.cssText = selectStyle();
    [['', '— select —'], ['yes', 'yes'], ['no', 'no']].forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      this._isValidSelect.appendChild(o);
    });
    this._isValidSelect.addEventListener('change', () => this._onIsValidChange());
    ivLbl.appendChild(this._isValidSelect);

    const notesLbl = mkFormLabel('notes');
    this._notesInput = document.createElement('textarea');
    this._notesInput.rows = 1;
    this._notesInput.style.cssText =
      inputStyle('200px') + `resize:vertical;vertical-align:middle;height:26px;`;
    notesLbl.appendChild(this._notesInput);

    const sstLbl = mkFormLabel('signal_start (s)');
    this._signalStartInput = document.createElement('input');
    this._signalStartInput.type = 'number';
    this._signalStartInput.step = '0.01';
    this._signalStartInput.style.cssText = inputStyle('85px');
    sstLbl.appendChild(this._signalStartInput);

    formRow1.append(ivLbl, notesLbl, sstLbl);

    // Row 2: secondary form (hidden until is_valid = no)
    this._secondaryForm = document.createElement('div');
    this._secondaryForm.style.cssText =
      `display:none;align-items:center;gap:10px;flex-wrap:wrap;`;

    const vnLbl = mkFormLabel('verified name');
    this._verifiedNameSelect = document.createElement('select');
    this._verifiedNameSelect.style.cssText = selectStyle() + `max-width:240px;`;
    vnLbl.appendChild(this._verifiedNameSelect);

    const vcLbl = mkFormLabel('verif. confidence');
    this._verificationConfSelect = document.createElement('select');
    this._verificationConfSelect.style.cssText = selectStyle();
    ['low', 'medium', 'high'].forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      this._verificationConfSelect.appendChild(o);
    });
    vcLbl.appendChild(this._verificationConfSelect);

    this._secondaryForm.append(vnLbl, vcLbl);

    // Row 3: action buttons
    const formBtns = document.createElement('div');
    formBtns.style.cssText = `display:flex;align-items:center;gap:8px;`;

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip →';
    skipBtn.style.cssText = btnStyle();
    skipBtn.addEventListener('click', () => this._onSkip());

    this._verifyBtn = document.createElement('button');
    this._verifyBtn.textContent = '✓ Verify';
    this._verifyBtn.style.cssText = btnStyle(true) + `opacity:0.4;`;
    this._verifyBtn.disabled = true;
    this._verifyBtn.addEventListener('click', () => void this._onVerify());

    formBtns.append(skipBtn, this._verifyBtn);
    formSection.append(formRow1, this._secondaryForm, formBtns);

    // ── Assemble widget ──────────────────────────────────────────
    this.node.append(
      header, filterBar, tableWrap, pagBar,
      this._infoCard,
      playerCtrls, this._canvasContainer, playBar,
      this._audio, formSection
    );
  }

  // ─── Lumino lifecycle ────────────────────────────────────────

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
          this._canvas.width  = Math.floor(width);
          this._canvas.height = Math.floor(height);
          if (this._specBitmap) this._renderFrame();
        }, 150);
      }
    });
    this._resizeObserver.observe(this._canvasContainer);
    void this._init();
  }

  protected onBeforeDetach(msg: Message): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
    cancelAnimationFrame(this._rafId);
    super.onBeforeDetach(msg);
  }

  // ─── Initialization ──────────────────────────────────────────

  private async _init(): Promise<void> {
    this._setStatus('Reading kernel variables…');
    let raw: string;
    try {
      raw = await this._execPython(
        `import json as _j\n` +
        `print(_j.dumps({\n` +
        `  'data': _BA_DATA,\n` +
        `  'audio_path': _BA_AUDIO_PATH,\n` +
        `  'category_path': _BA_CATEGORY_PATH,\n` +
        `  'output': _BA_OUTPUT,\n` +
        `}))`
      );
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
      return;
    }

    let cfg: { data: string; audio_path: string; category_path: string; output: string };
    try {
      cfg = JSON.parse(raw);
    } catch {
      this._setStatus('❌ Failed to parse kernel config', true);
      return;
    }

    this._audioPath    = cfg.audio_path;
    this._categoryPath = cfg.category_path;
    this._outputPath   = cfg.output;

    try {
      this._rows = JSON.parse(cfg.data) as Detection[];
    } catch {
      this._setStatus('❌ Failed to parse detection data', true);
      return;
    }

    this._applyFilterAndSort();
    this._renderTable();

    // Load categories for the verified-name dropdown
    if (this._categoryPath) {
      try {
        const p = this._categoryPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const catJson = await this._execPython(
          `import csv as _csv, json as _j\n` +
          `with open('${p}') as _f:\n` +
          `    _rows = list(_csv.DictReader(_f))\n` +
          `print(_j.dumps([r['common_name'] for r in _rows]))`
        );
        this._categories = JSON.parse(catJson) as string[];
      } catch {
        this._categories = [];
      }
    }
    this._populateCategoryDropdown();

    // Auto-select first row and load audio
    if (this._filtered.length > 0) {
      this._selectRow(0, false);
      await this._loadAudio();
    }

    this._setStatus(`✓ ${this._rows.length} detections loaded`);
  }

  private _populateCategoryDropdown(): void {
    this._verifiedNameSelect.innerHTML = '';
    [...this._categories, 'unknown', 'noise'].forEach(name => {
      const o = document.createElement('option');
      o.value = o.textContent = name;
      this._verifiedNameSelect.appendChild(o);
    });
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
      const tr = document.createElement('tr');
      tr.style.cssText =
        `cursor:pointer;border-bottom:1px solid #2a2a3d;` +
        (isSelected
          ? `background:#2d3f5e;`
          : `background:${i % 2 === 0 ? '#1e1e2e' : '#252538'};`);

      [
        row.id,
        row.common_name,
        row.confidence.toFixed(3),
        row.rank,
        row.start_time.toFixed(2),
        row.end_time.toFixed(2),
      ].forEach(v => {
        const td = document.createElement('td');
        td.textContent = String(v);
        td.style.cssText = `padding:4px 8px;font-size:12px;white-space:nowrap;`;
        tr.appendChild(td);
      });

      tr.addEventListener('click', () => {
        this._selectRow(globalIdx);
        void this._loadAudio();
      });
      tr.addEventListener('mouseenter', () => {
        if (globalIdx !== this._selectedIdx) tr.style.background = '#2a2a3d';
      });
      tr.addEventListener('mouseleave', () => {
        if (globalIdx !== this._selectedIdx)
          tr.style.background = i % 2 === 0 ? '#1e1e2e' : '#252538';
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

    if (autoUpdateInputs) {
      this._startInput.value        = String(row.start_time);
      this._endInput.value          = String(row.end_time);
      this._signalStartInput.value  = row.start_time.toFixed(2);
    }

    // ── Info card ──
    this._infoCard.innerHTML = '';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `font-size:13px;font-weight:600;color:#cdd6f4;flex-shrink:0;`;
    nameSpan.textContent = row.common_name;

    const sep = () => {
      const s = document.createElement('span');
      s.style.cssText = `color:#45475a;font-size:11px;flex-shrink:0;`;
      s.textContent = '|';
      return s;
    };

    const timeSpan = document.createElement('span');
    timeSpan.style.cssText = `font-size:12px;color:#a6adc8;flex-shrink:0;`;
    timeSpan.textContent = `${this._fmtTime(row.start_time)} – ${this._fmtTime(row.end_time)}`;

    const confSpan = document.createElement('span');
    confSpan.style.cssText = `font-size:12px;color:#a6e3a1;flex-shrink:0;`;
    confSpan.textContent = `conf: ${row.confidence.toFixed(3)}`;

    const rankSpan = document.createElement('span');
    rankSpan.style.cssText = `font-size:12px;color:#cba6f7;flex-shrink:0;`;
    rankSpan.textContent = `rank: ${row.rank}`;

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Prev';
    prevBtn.style.cssText = btnStyle() + `font-size:11px;`;
    prevBtn.disabled = filteredIdx === 0;
    prevBtn.addEventListener('click', () => {
      if (this._selectedIdx > 0) {
        this._selectRow(this._selectedIdx - 1);
        this._ensurePageShowsSelected();
        void this._loadAudio();
      }
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = btnStyle() + `font-size:11px;`;
    nextBtn.disabled = filteredIdx >= this._filtered.length - 1;
    nextBtn.addEventListener('click', () => {
      if (this._selectedIdx < this._filtered.length - 1) {
        this._selectRow(this._selectedIdx + 1);
        this._ensurePageShowsSelected();
        void this._loadAudio();
      }
    });

    this._infoCard.append(nameSpan, sep(), timeSpan, sep(), confSpan, sep(), rankSpan,
                          spacer, prevBtn, nextBtn);

    // Re-render table so selected row is highlighted
    this._renderTable();
    this._resetForm(row);
  }

  private _ensurePageShowsSelected(): void {
    if (this._selectedIdx < 0) return;
    const newPage = Math.floor(this._selectedIdx / this._pageSize);
    if (newPage !== this._page) {
      this._page = newPage;
      this._renderTable();
    }
  }

  // ─── Player ──────────────────────────────────────────────────

  private async _loadAudio(): Promise<void> {
    if (!this._audioPath) return;

    this._bufferSec        = Math.max(0, parseFloat(this._bufferInput.value) || 5);
    const startTime        = parseFloat(this._startInput.value) || 0;
    const endTime          = parseFloat(this._endInput.value)   || startTime + 12;
    const loadStart        = Math.max(0, startTime - this._bufferSec);
    const loadDur          = (endTime + this._bufferSec) - loadStart;

    this._detectionStart   = startTime;
    this._detectionEnd     = endTime;
    this._segLoadStart     = loadStart;

    this._setStatus('Running Python (soundfile + numpy + matplotlib)…');

    let result: { spec: string; wav: string; duration: number };
    try {
      const raw = await this._execPython(this._buildPythonCode(this._audioPath, loadStart, loadDur));
      result = JSON.parse(raw) as typeof result;
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
      return;
    }

    this._segDuration = result.duration;

    this._setStatus('Decoding spectrogram…');
    try {
      const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: 'image/png' });
      if (this._specBitmap) this._specBitmap.close();
      this._specBitmap = await createImageBitmap(blob);
    } catch (e: any) {
      this._setStatus(`❌ Image decode: ${String(e.message ?? e)}`, true);
      return;
    }

    this._audio.src = `data:audio/wav;base64,${result.wav}`;
    this._audio.load();
    this._renderFrame();

    const fname = this._audioPath.split('/').pop() ?? this._audioPath;
    this._setStatus(
      `✓ ${fname}  ${this._fmtTime(loadStart)}–${this._fmtTime(loadStart + result.duration)}`
    );
  }

  private _buildPythonCode(path: string, startSec: number, durSec: number): string {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    let readLines: string[];
    if (path.startsWith('s3://')) {
      const noProto = path.slice(5);
      const slash   = noProto.indexOf('/');
      const bucket  = esc(slash < 0 ? noProto : noProto.slice(0, slash));
      const key     = slash < 0 ? '' : esc(noProto.slice(slash + 1));
      readLines = [
        `import boto3 as _b3, tempfile as _tmp, os as _os, soundfile as _sf`,
        `with _tmp.NamedTemporaryFile(suffix='.flac', delete=False) as _t:`,
        `    _b3.client('s3').download_fileobj('${bucket}', '${key}', _t)`,
        `    _tp = _t.name`,
        `with _sf.SoundFile(_tp) as _f:`,
        `    _sr = _f.samplerate`,
        `    _f.seek(int(${startSec} * _sr))`,
        `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
        `_os.unlink(_tp)`,
      ];
    } else {
      readLines = [
        `import soundfile as _sf`,
        `with _sf.SoundFile('${esc(path)}') as _f:`,
        `    _sr = _f.samplerate`,
        `    _f.seek(int(${startSec} * _sr))`,
        `    _raw = _f.read(int(${durSec} * _sr), dtype='float32', always_2d=True)`,
      ];
    }

    return [
      ...readLines,
      `import numpy as _np, io as _io, base64 as _b64, json as _j`,
      `import matplotlib as _mpl; _mpl.use('Agg')`,
      `import matplotlib.pyplot as _plt`,
      `_mono = _raw.mean(axis=1) if _raw.shape[1] > 1 else _raw[:, 0]`,
      `_actual_dur = len(_mono) / _sr`,
      `_fft = 512; _hop = 128; _n_mels = 80`,
      `_win = 0.5 * (1 - _np.cos(2 * _np.pi * _np.arange(_fft) / (_fft - 1)))`,
      `_n_frames = max(1, (len(_mono) - _fft) // _hop + 1)`,
      `_idx = _np.arange(_fft)[None,:] + _hop * _np.arange(_n_frames)[:,None]`,
      `_idx = _np.clip(_idx, 0, len(_mono) - 1)`,
      `_mag = _np.abs(_np.fft.rfft(_mono[_idx] * _win, axis=1)[:, :_fft//2]).T`,
      `_f_min, _f_max = 80.0, _sr / 2.0`,
      `_mel_pts = _np.linspace(2595*_np.log10(1+_f_min/700), 2595*_np.log10(1+_f_max/700), _n_mels+2)`,
      `_hz_pts  = 700 * (10 ** (_mel_pts / 2595) - 1)`,
      `_bin_pts = (_hz_pts / (_sr / 2.0) * (_fft // 2 - 1)).astype(int).clip(0, _fft // 2 - 1)`,
      `_fb = _np.zeros((_n_mels, _fft // 2))`,
      `for _m in range(1, _n_mels + 1):`,
      `    _lo, _pk, _hi = _bin_pts[_m-1], _bin_pts[_m], _bin_pts[_m+1]`,
      `    if _pk > _lo: _fb[_m-1, _lo:_pk] = (_np.arange(_lo, _pk) - _lo) / (_pk - _lo)`,
      `    if _hi > _pk: _fb[_m-1, _pk:_hi] = (_hi - _np.arange(_pk, _hi)) / (_hi - _pk)`,
      `_S = _fb @ _mag`,
      `_S_db   = 20 * _np.log10(_np.maximum(_S, 1e-10))`,
      `_S_db   = _np.clip(_S_db, _S_db.max() - 80, _S_db.max())`,
      `_S_norm = (_S_db - _S_db.min()) / max(float(_S_db.max() - _S_db.min()), 1e-10)`,
      `_fig = _plt.figure(figsize=(20, 5), dpi=100)`,
      `_ax  = _fig.add_axes([0, 0, 1, 1])`,
      `_ax.imshow(_S_norm, aspect='auto', cmap='magma', origin='lower', interpolation='bilinear')`,
      `_ax.set_axis_off()`,
      `_pb = _io.BytesIO()`,
      `_fig.savefig(_pb, format='png', dpi=100, bbox_inches='tight', pad_inches=0)`,
      `_plt.close(_fig)`,
      `import soundfile as _sf2`,
      `_wb = _io.BytesIO()`,
      `_sf2.write(_wb, (_mono * 32767).astype(_np.int16)[:, None], _sr, format='WAV', subtype='PCM_16')`,
      `print(_j.dumps({`,
      `  'spec': _b64.b64encode(_pb.getvalue()).decode(),`,
      `  'wav':  _b64.b64encode(_wb.getvalue()).decode(),`,
      `  'duration': float(_actual_dur),`,
      `}))`,
    ].join('\n');
  }

  private _renderFrame(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const W = this._canvas.width, H = this._canvas.height;
    if (!W || !H) return;

    if (this._specBitmap) {
      ctx.drawImage(this._specBitmap, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#11111b';
      ctx.fillRect(0, 0, W, H);
    }

    if (this._specBitmap && this._segDuration > 0) {
      // Buffer overlay — darken regions outside the detection window
      const detStartFrac = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
      const detEndFrac   = Math.min(1, (this._detectionEnd   - this._segLoadStart) / this._segDuration);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (detStartFrac > 0) {
        ctx.fillRect(0, 0, Math.floor(detStartFrac * W), H);
      }
      if (detEndFrac < 1) {
        const rx = Math.ceil(detEndFrac * W);
        ctx.fillRect(rx, 0, W - rx, H);
      }

      // Playhead
      const ph = Math.floor(
        Math.max(0, Math.min(1, this._audio.currentTime / this._segDuration)) * (W - 1)
      );
      ctx.strokeStyle = 'rgba(205,214,244,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ph, 0); ctx.lineTo(ph, H); ctx.stroke();

      ctx.fillStyle = '#cdd6f4';
      ctx.beginPath();
      ctx.moveTo(ph - 6, 0); ctx.lineTo(ph + 6, 0); ctx.lineTo(ph, 11);
      ctx.closePath(); ctx.fill();
    }

    const absNow = this._segLoadStart + this._audio.currentTime;
    const absEnd = this._segLoadStart + this._segDuration;
    this._timeDisplay.textContent = `${this._fmtTime(absNow)} / ${this._fmtTime(absEnd)}`;
  }

  private _togglePlay(): void {
    if (!this._specBitmap) return;
    if (this._playing) {
      this._audio.pause();
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
    } else {
      void this._audio.play();
      this._playing = true;
      this._playBtn.textContent = '⏸';
      const loop = () => {
        this._renderFrame();
        if (this._playing) this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }
  }

  private async _onCanvasClick(e: MouseEvent): Promise<void> {
    if (!this._specBitmap || this._segDuration === 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const frac  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    // Seek audio
    this._audio.currentTime = frac * this._segDuration;
    this._renderFrame();

    // signal_start_time = detection start_time + position_in_clip
    // position_in_clip is 0 at start_time, negative in left buffer region
    const absTime    = this._segLoadStart + frac * this._segDuration;
    const posInClip  = absTime - this._detectionStart;   // negative in left buffer
    const signalTime = absTime;                            // absolute position in audio file

    this._signalStartInput.value = signalTime.toFixed(2);
    this._signalTimeDisplay.textContent =
      `⏱ ${this._fmtTime(signalTime)}  (pos: ${posInClip >= 0 ? '+' : ''}${posInClip.toFixed(2)}s)`;
  }

  // ─── Form ────────────────────────────────────────────────────

  private _resetForm(row?: Detection): void {
    this._isValidSelect.value = '';
    this._notesInput.value    = '';
    this._signalStartInput.value = row ? row.start_time.toFixed(2) : '';
    this._secondaryForm.style.display = 'none';
    this._verifyBtn.disabled    = true;
    this._verifyBtn.style.opacity = '0.4';
    this._signalTimeDisplay.textContent = 'click spectrogram to mark signal';
  }

  private _onIsValidChange(): void {
    const val = this._isValidSelect.value;
    this._secondaryForm.style.display = val === 'no' ? 'flex' : 'none';
    this._verifyBtn.disabled      = val === '';
    this._verifyBtn.style.opacity = val === '' ? '0.4' : '1';
  }

  private async _onVerify(): Promise<void> {
    const row = this._filtered[this._selectedIdx];
    if (!row || !this._outputPath) return;

    const isValid        = this._isValidSelect.value;
    const notes          = this._notesInput.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
    const signalStart    = parseFloat(this._signalStartInput.value) || row.start_time;
    const verifiedName   = isValid === 'no' ? this._verifiedNameSelect.value : '';
    const verifConf      = isValid === 'no' ? this._verificationConfSelect.value : '';
    const esc            = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const outPath        = esc(this._outputPath);

    const code = [
      `import csv as _csv, os as _os`,
      `_cols = ['detection_id','is_valid','signal_start_time','notes','verified_common_name','verification_confidence']`,
      `_row  = {`,
      `  'detection_id':            ${row.id},`,
      `  'is_valid':                '${isValid}',`,
      `  'signal_start_time':       ${signalStart.toFixed(4)},`,
      `  'notes':                   '${notes}',`,
      `  'verified_common_name':    '${esc(verifiedName)}',`,
      `  'verification_confidence': '${esc(verifConf)}',`,
      `}`,
      `_exists = _os.path.exists('${outPath}')`,
      `with open('${outPath}', 'a', newline='') as _f:`,
      `  _w = _csv.DictWriter(_f, fieldnames=_cols)`,
      `  if not _exists: _w.writeheader()`,
      `  _w.writerow(_row)`,
      `print('ok')`,
    ].join('\n');

    try {
      await this._execPython(code);
      this._setStatus(`✓ Verified detection ${row.id} → ${this._outputPath}`);
    } catch (e: any) {
      this._setStatus(`❌ Write failed: ${String(e.message ?? e)}`, true);
      return;
    }

    this._onSkip();
  }

  private _onSkip(): void {
    if (this._selectedIdx < this._filtered.length - 1) {
      this._selectRow(this._selectedIdx + 1);
      this._ensurePageShowsSelected();
      void this._loadAudio();
    }
  }

  // ─── Kernel helpers ──────────────────────────────────────────

  private _kernel(): any {
    return this._tracker.currentWidget?.sessionContext.session?.kernel ?? null;
  }

  private async _execPython(code: string): Promise<string> {
    const kernel = this._kernel();
    if (!kernel) throw new Error('No active kernel');
    let out = '', err = '';
    const future = kernel.requestExecute({ code });
    future.onIOPub = (msg: any) => {
      const t = msg.header.msg_type;
      if (t === 'stream') {
        if (msg.content?.name === 'stdout') out += msg.content.text as string;
        if (msg.content?.name === 'stderr') err += msg.content.text as string;
      } else if (t === 'error') {
        const tb: string[] = msg.content?.traceback ?? [];
        err += (msg.content?.ename ?? '') + ': ' + (msg.content?.evalue ?? '') +
               '\n' + tb.join('\n');
      }
    };
    await future.done;
    if (!out.trim() && err) throw new Error(err.trim());
    return out.trim();
  }

  // ─── Utilities ───────────────────────────────────────────────

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? '#f38ba8' : '#a6e3a1';
  }

  private _fmtTime(s: number): string {
    const sign = s < 0 ? '-' : '';
    const abs  = Math.abs(s);
    const m    = Math.floor(abs / 60);
    const sec  = Math.floor(abs % 60).toString().padStart(2, '0');
    const cs   = Math.floor((abs % 1) * 100).toString().padStart(2, '0');
    return `${sign}${m}:${sec}.${cs}`;
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
    // Expose app so Python's display(Javascript(...)) can reach it
    (window as any)._bioacousticApp = app;

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
