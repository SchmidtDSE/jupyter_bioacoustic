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
  private _audioPath = '';
  private _audioCol = '';
  private _categoryPath = '';
  private _outputPath = '';

  // ── Mode state ──────────────────────────────────────────────
  private _predictionCol = '';
  private _displayCols: string[] = [];
  private _dataCols: string[] = [];
  private _captureLabel = '';   // empty = hidden
  private _captureDir = '';
  private _duplicateEntries = false;

  // ── Player state ────────────────────────────────────────────
  private _specBitmap: ImageBitmap | null = null;
  private _segLoadStart = 0;
  private _segDuration = 0;
  private _detectionStart = 0;
  private _detectionEnd = 0;
  private _bufferSec = 5;
  private _playing = false;
  private _rafId = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;

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

  // ── DOM refs — player ───────────────────────────────────────
  private _spectTypeSelect!: HTMLSelectElement;
  private _bufferInput!: HTMLInputElement;
  private _startInput!: HTMLInputElement;
  private _endInput!: HTMLInputElement;
  private _canvas!: HTMLCanvasElement;
  private _canvasContainer!: HTMLDivElement;
  private _playBtn!: HTMLButtonElement;
  private _timeDisplay!: HTMLSpanElement;
  private _signalTimeDisplay!: HTMLSpanElement;
  private _audio!: HTMLAudioElement;
  private _captureBtn!: HTMLButtonElement;

  // ── Form section (extracted) ────────────────────────────────
  private _form!: FormPanel;

  // ── Annotation / canvas drag state (stays in widget until Player extraction) ──
  private _annotDrag: { target: string; anchorTime?: number; anchorFreq?: number } | null = null;
  private _sampleRate = 0;
  private _freqMin = 0;
  private _freqMax = 0;

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
        void this._loadAudio();
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
        void this._loadAudio();
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

    // ── Player controls ──────────────────────────────────────────
    const playerCtrls = document.createElement('div');
    playerCtrls.style.cssText = barBottomStyle();

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

    const typeLbl = document.createElement('label');
    typeLbl.style.cssText = labelStyle();
    typeLbl.textContent = 'Type';
    this._spectTypeSelect = document.createElement('select');
    this._spectTypeSelect.style.cssText = selectStyle();
    ['plain', 'mel'].forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      this._spectTypeSelect.appendChild(o);
    });
    typeLbl.appendChild(this._spectTypeSelect);
    playerCtrls.appendChild(typeLbl);

    this._bufferInput = mkNumLabel('Buffer (s)', '3',  '50px');
    this._startInput  = mkNumLabel('Start (s)',  '0',  '70px');
    this._endInput    = mkNumLabel('End (s)',    '12', '70px');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Update';
    loadBtn.style.cssText = btnStyle(true);
    loadBtn.addEventListener('click', () => void this._loadAudio());
    playerCtrls.appendChild(loadBtn);

    const ctrNote = document.createElement('span');
    ctrNote.textContent = '← update after changes';
    ctrNote.style.cssText = `font-size:10px;color:${COLORS.textMuted};white-space:nowrap;`;
    playerCtrls.appendChild(ctrNote);

    this._captureBtn = document.createElement('button');
    this._captureBtn.textContent = 'Capture';
    this._captureBtn.style.cssText = btnStyle() + `display:none;margin-left:auto;`;
    this._captureBtn.addEventListener('click', () => void this._onCapture());
    playerCtrls.appendChild(this._captureBtn);

    // ── Spectrogram canvas ───────────────────────────────────────
    this._canvasContainer = document.createElement('div');
    this._canvasContainer.style.cssText =
      `flex:1;position:relative;min-height:80px;background:${COLORS.bgCrust};overflow:hidden;cursor:crosshair;`;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
    this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
    this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
    this._canvas.addEventListener('mouseup', () => this._onCanvasMouseUp());
    this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseUp());
    this._canvasContainer.appendChild(this._canvas);

    // ── Playback bar ─────────────────────────────────────────────
    const playBar = document.createElement('div');
    playBar.style.cssText = barTopBottomStyle();

    this._playBtn = document.createElement('button');
    this._playBtn.textContent = '▶';
    this._playBtn.style.cssText = btnStyle() + `font-size:15px;width:34px;height:28px;`;
    this._playBtn.addEventListener('click', () => this._togglePlay());

    this._timeDisplay = document.createElement('span');
    this._timeDisplay.style.cssText = monoTextStyle();
    this._timeDisplay.textContent = '0:00.00 / 0:00.00';

    this._signalTimeDisplay = document.createElement('span');
    this._signalTimeDisplay.style.cssText =
      `margin-left:auto;font-size:11px;color:${COLORS.mauve};font-family:ui-monospace,monospace;`;
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

    // ── Form panel (extracted section) ─────────────────────────
    this._form = new FormPanel(this._kernelBridge);

    // Wire FormPanel signals
    this._form.submitted.connect(() => this._onSkip());
    this._form.prevRequested.connect(() => this._onPrev());
    this._form.nextRequested.connect(() => this._onSkip());
    this._form.reviewDeleted.connect(() => this._renderTable());
    this._form.annotationChanged.connect(() => this._renderFrame());
    this._form.activeToolChanged.connect(() => {
      this._canvasContainer.style.cursor = this._form.getAnnotConfig() ? 'crosshair' : 'default';
      this._renderFrame();
    });
    this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    // ── Assemble widget ──────────────────────────────────────────
    this.node.append(
      header, filterBar, tableWrap, pagBar,
      this._infoCard,
      playerCtrls, this._canvasContainer, playBar,
      this._audio, this._form.element
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

    this._audioPath      = cfg.audio_path;
    this._audioCol       = cfg.audio_col;
    this._categoryPath   = cfg.category_path;
    this._outputPath     = cfg.output;
    this._predictionCol  = cfg.prediction_col;
    this._displayCols    = JSON.parse(cfg.display_cols) as string[];
    this._dataCols       = JSON.parse(cfg.data_cols) as string[];
    const formConfig     = JSON.parse(cfg.form_config);
    this._captureLabel   = cfg.capture ?? '';
    this._captureDir     = cfg.capture_dir ?? '';
    this._duplicateEntries = !!cfg.duplicate_entries;
    const defaultBuffer = parseFloat(cfg.default_buffer) || 3;
    this._bufferInput.value = String(defaultBuffer);
    if (this._captureLabel) {
      this._captureBtn.textContent = this._captureLabel;
      this._captureBtn.style.display = '';
    }

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

    // Set cursor based on annotation config
    this._canvasContainer.style.cursor =
      this._form.getAnnotConfig() ? 'crosshair' : 'default';

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
      await this._loadAudio();
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
        void this._loadAudio();
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

    if (autoUpdateInputs) {
      this._startInput.value = String(row.start_time);
      this._endInput.value   = String(row.end_time);
    }

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
    this._signalTimeDisplay.textContent = this._form.getAnnotConfig()
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

  // ─── Player ──────────────────────────────────────────────────

  private _resolveAudioPath(): string {
    if (this._audioCol) {
      const row = this._filtered[this._selectedIdx];
      if (row) {
        const val = row[this._audioCol];
        if (val != null && String(val).trim()) return String(val);
      }
    }
    return this._audioPath;
  }

  private async _loadAudio(): Promise<void> {
    const audioPath = this._resolveAudioPath();
    if (!audioPath) {
      this._setStatus('❌ No audio path — set audio_path or audio_column', true);
      return;
    }

    // Stop any current playback
    if (this._playing) {
      this._audio.pause();
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
    }

    const bufVal = parseFloat(this._bufferInput.value);
    this._bufferSec        = Math.max(0, isNaN(bufVal) ? 0 : bufVal);
    const startTime        = parseFloat(this._startInput.value) || 0;
    const endTime          = parseFloat(this._endInput.value)   || startTime + 12;
    const loadStart        = Math.max(0, startTime - this._bufferSec);
    const loadDur          = (endTime + this._bufferSec) - loadStart;

    this._detectionStart   = startTime;
    this._detectionEnd     = endTime;
    this._segLoadStart     = loadStart;

    this._setStatus('Running Python (soundfile + numpy + matplotlib)…');

    let result: { spec: string; wav: string; duration: number; sample_rate: number; freq_min: number; freq_max: number };
    try {
      const raw = await this._kernelBridge.exec(this._buildPythonCode(audioPath, loadStart, loadDur));
      result = JSON.parse(raw) as typeof result;
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
      return;
    }

    this._segDuration = result.duration;
    this._sampleRate = result.sample_rate;
    this._freqMin = result.freq_min;
    this._freqMax = result.freq_max;

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

    const fname = audioPath.split('/').pop() ?? audioPath;
    this._setStatus(
      `✓ ${fname}  ${fmtTime(loadStart)}–${fmtTime(loadStart + result.duration)}`
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
      ...(this._spectTypeSelect.value === 'mel' ? [
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
      ] : [
        `_f_min, _f_max = 0.0, _sr / 2.0`,
        `_S = _mag`,
      ]),
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
      `  'sample_rate': int(_sr),`,
      `  'freq_min': float(_f_min) if '_f_min' in dir() else 0.0,`,
      `  'freq_max': float(_f_max) if '_f_max' in dir() else float(_sr / 2),`,
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
      ctx.fillStyle = COLORS.bgCrust;
      ctx.fillRect(0, 0, W, H);
    }

    if (this._specBitmap && this._segDuration > 0) {
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

      const ph = Math.floor(
        Math.max(0, Math.min(1, this._audio.currentTime / this._segDuration)) * (W - 1)
      );
      ctx.strokeStyle = 'rgba(205,214,244,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ph, 0); ctx.lineTo(ph, H); ctx.stroke();

      ctx.fillStyle = COLORS.textPrimary;
      ctx.beginPath();
      ctx.moveTo(ph - 6, 0); ctx.lineTo(ph + 6, 0); ctx.lineTo(ph, 11);
      ctx.closePath(); ctx.fill();
    }

    this._renderAnnotation(ctx, W, H);

    const absNow = this._segLoadStart + this._audio.currentTime;
    const absEnd = this._segLoadStart + this._segDuration;
    this._timeDisplay.textContent = `${fmtTime(absNow)} / ${fmtTime(absEnd)}`;
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

  // ─── Canvas mouse interaction (annotation tools) ──────────

  private _canvasXY(e: MouseEvent): { cx: number; cy: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (this._canvas.width / rect.width),
      cy: (e.clientY - rect.top) * (this._canvas.height / rect.height),
    };
  }

  private _timeToX(t: number): number {
    return ((t - this._segLoadStart) / this._segDuration) * this._canvas.width;
  }
  private _xToTime(x: number): number {
    return this._segLoadStart + (x / this._canvas.width) * this._segDuration;
  }
  private _freqToY(f: number): number {
    const H = this._canvas.height;
    let frac: number;
    if (this._spectTypeSelect.value === 'mel') {
      const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
      const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
      const mel = 2595 * Math.log10(1 + f / 700);
      frac = (melMax - melMin) > 0 ? (mel - melMin) / (melMax - melMin) : 0;
    } else {
      frac = (this._freqMax - this._freqMin) > 0
        ? (f - this._freqMin) / (this._freqMax - this._freqMin) : 0;
    }
    return H * (1 - frac);
  }
  private _yToFreq(y: number): number {
    const H = this._canvas.height;
    const frac = 1 - y / H;
    if (this._spectTypeSelect.value === 'mel') {
      const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
      const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
      const mel = melMin + frac * (melMax - melMin);
      return 700 * (Math.pow(10, mel / 2595) - 1);
    }
    return this._freqMin + frac * (this._freqMax - this._freqMin);
  }


  private _onCanvasMouseDown(e: MouseEvent): void {
    if (!this._form.getAnnotConfig() || !this._specBitmap || this._segDuration === 0) return;
    const { cx, cy } = this._canvasXY(e);
    const ac = this._form.getAnnotConfig();
    const tool = this._form.getActiveTool();
    const GRAB = 10;

    if (tool === 'time_select') {
      const t = this._xToTime(cx);
      this._form.setAnnotValue('startTime', t);
      this._annotDrag = { target: 'start' };
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const sx = st != null ? this._timeToX(st) : -Infinity;
      const ex = et != null ? this._timeToX(et) : Infinity;
      if (Math.abs(cx - sx) <= GRAB && Math.abs(cx - sx) <= Math.abs(cx - ex)) {
        this._annotDrag = { target: 'start' };
      } else if (Math.abs(cx - ex) <= GRAB) {
        this._annotDrag = { target: 'end' };
      } else if (cx < (sx + ex) / 2) {
        this._form.setAnnotValue('startTime', this._xToTime(cx));
        this._annotDrag = { target: 'start' };
      } else {
        this._form.setAnnotValue('endTime', this._xToTime(cx));
        this._annotDrag = { target: 'end' };
      }
    } else if (tool === 'bounding_box') {
      // Check if near an existing edge
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st != null && et != null && flo != null && fhi != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
        const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
        const inX = cx >= sx - GRAB && cx <= ex + GRAB;
        if (inY && Math.abs(cx - sx) <= GRAB) { this._annotDrag = { target: 'box-left' }; return; }
        if (inY && Math.abs(cx - ex) <= GRAB) { this._annotDrag = { target: 'box-right' }; return; }
        if (inX && Math.abs(cy - yhi) <= GRAB) { this._annotDrag = { target: 'box-top' }; return; }
        if (inX && Math.abs(cy - ylo) <= GRAB) { this._annotDrag = { target: 'box-bottom' }; return; }
      }
      // Start new box — store anchor for the fixed corner
      const t = this._xToTime(cx);
      const f = this._yToFreq(cy);
      this._form.setAnnotValue('startTime', t);
      this._form.setAnnotValue('endTime', t);
      this._form.setAnnotValue('minFreq', f);
      this._form.setAnnotValue('maxFreq', f);
      this._annotDrag = { target: 'box-corner', anchorTime: t, anchorFreq: f };
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseMove(e: MouseEvent): void {
    if (!this._form.getAnnotConfig() || !this._specBitmap || this._segDuration === 0) return;
    const { cx, cy } = this._canvasXY(e);
    const ac = this._form.getAnnotConfig();

    if (!this._annotDrag) {
      // Update cursor based on proximity to handles
      this._updateAnnotCursor(cx, cy);
      return;
    }

    const t = Math.max(this._segLoadStart, Math.min(
      this._segLoadStart + this._segDuration, this._xToTime(cx)));
    const f = Math.max(0, this._yToFreq(Math.max(0, Math.min(this._canvas.height, cy))));
    const tgt = this._annotDrag.target;

    if (tgt === 'start') {
      const endCol = ac.endTime?.col;
      const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
      if (this._form.getActiveTool() === 'start_end_time_select' && endVal != null) {
        this._form.setAnnotValue('startTime', Math.min(t, endVal));
      } else {
        this._form.setAnnotValue('startTime', t);
      }
    } else if (tgt === 'end') {
      const startCol = ac.startTime?.col;
      const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
      if (startVal != null) this._form.setAnnotValue('endTime', Math.max(t, startVal));
    } else if (tgt === 'box-corner') {
      const at = this._annotDrag.anchorTime ?? t;
      const af = this._annotDrag.anchorFreq ?? f;
      this._form.setAnnotValue('startTime', Math.min(at, t));
      this._form.setAnnotValue('endTime', Math.max(at, t));
      this._form.setAnnotValue('minFreq', Math.min(af, f));
      this._form.setAnnotValue('maxFreq', Math.max(af, f));
    } else if (tgt === 'box-left') {
      const endCol = ac.endTime?.col;
      const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
      if (endVal != null) this._form.setAnnotValue('startTime', Math.min(t, endVal));
    } else if (tgt === 'box-right') {
      const startCol = ac.startTime?.col;
      const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
      if (startVal != null) this._form.setAnnotValue('endTime', Math.max(t, startVal));
    } else if (tgt === 'box-top') {
      const loCol = ac.minFreq?.col;
      const loVal = loCol ? this._form.getFormValue(loCol) : 0;
      if (loVal != null) this._form.setAnnotValue('maxFreq', Math.max(f, loVal));
    } else if (tgt === 'box-bottom') {
      const hiCol = ac.maxFreq?.col;
      const hiVal = hiCol ? this._form.getFormValue(hiCol) : Infinity;
      if (hiVal != null) this._form.setAnnotValue('minFreq', Math.min(f, hiVal));
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseUp(): void {
    this._annotDrag = null;
  }

  private _updateAnnotCursor(cx: number, cy: number): void {
    const ac = this._form.getAnnotConfig();
    if (!ac) return;
    const GRAB = 10;
    const tool = this._form.getActiveTool();

    if (tool === 'time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      if (st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) {
        this._canvasContainer.style.cursor = 'ew-resize';
        return;
      }
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      if ((st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) ||
          (et != null && Math.abs(cx - this._timeToX(et)) <= GRAB)) {
        this._canvasContainer.style.cursor = 'ew-resize';
        return;
      }
    } else if (tool === 'bounding_box') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st != null && et != null && flo != null && fhi != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
        const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
        const inX = cx >= sx - GRAB && cx <= ex + GRAB;
        if (inY && (Math.abs(cx - sx) <= GRAB || Math.abs(cx - ex) <= GRAB)) {
          this._canvasContainer.style.cursor = 'ew-resize'; return;
        }
        if (inX && (Math.abs(cy - yhi) <= GRAB || Math.abs(cy - ylo) <= GRAB)) {
          this._canvasContainer.style.cursor = 'ns-resize'; return;
        }
      }
    }
    this._canvasContainer.style.cursor = 'crosshair';
  }

  private _updateAnnotDisplay(): void {
    const ac = this._form.getAnnotConfig();
    if (!ac) return;
    const parts: string[] = [];
    const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
    const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
    if (st != null) parts.push(fmtTime(st));
    if (et != null) parts.push(`– ${fmtTime(et)}`);
    const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
    const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
    if (flo != null && fhi != null) parts.push(`${Math.round(flo)}–${Math.round(fhi)} Hz`);
    this._signalTimeDisplay.textContent = parts.length ? `⏱ ${parts.join(' ')}` : '';
  }

  private _renderAnnotation(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const ac = this._form.getAnnotConfig();
    if (!ac || this._segDuration === 0) return;
    const tool = this._form.getActiveTool();

    if (tool === 'time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      if (st == null) return;
      const x = this._timeToX(st);
      ctx.strokeStyle = 'rgba(137,180,250,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = COLORS.blue;
      ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
      ctx.closePath(); ctx.fill();
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      if (st != null && et != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        ctx.fillStyle = 'rgba(137,180,250,0.08)';
        ctx.fillRect(sx, 0, ex - sx, H);
      }
      if (st != null) {
        const x = this._timeToX(st);
        ctx.strokeStyle = 'rgba(166,227,161,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = COLORS.green;
        ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
        ctx.closePath(); ctx.fill();
      }
      if (et != null) {
        const x = this._timeToX(et);
        ctx.strokeStyle = 'rgba(243,139,168,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = COLORS.red;
        ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
        ctx.closePath(); ctx.fill();
      }
    } else if (tool === 'bounding_box') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st == null || et == null || flo == null || fhi == null) return;
      const sx = this._timeToX(st), ex = this._timeToX(et);
      const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
      ctx.fillStyle = 'rgba(137,180,250,0.1)';
      ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
      ctx.strokeStyle = 'rgba(137,180,250,0.85)'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
      ctx.fillStyle = COLORS.blue;
      for (const [px, py] of [[sx,yhi],[ex,yhi],[sx,ylo],[ex,ylo]]) {
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private _onPrev(): void {
    if (this._selectedIdx > 0) {
      this._selectRow(this._selectedIdx - 1);
      this._ensurePageShowsSelected();
      void this._loadAudio();
    }
  }

  private _onSkip(): void {
    if (this._selectedIdx < this._filtered.length - 1) {
      this._selectRow(this._selectedIdx + 1);
      this._ensurePageShowsSelected();
      void this._loadAudio();
    }
  }

  // ─── Capture ─────────────────────────────────────────────────

  private _buildCaptureFilename(): string {
    const row = this._filtered[this._selectedIdx];
    if (!row) return 'spectrogram.png';
    const parts: string[] = [];
    if (this._predictionCol && row[this._predictionCol] !== undefined) {
      parts.push(String(row[this._predictionCol]));
    }
    for (const col of this._displayCols) {
      if (row[col] !== undefined) {
        const v = typeof row[col] === 'number' && !Number.isInteger(row[col])
          ? (row[col] as number).toFixed(3) : String(row[col]);
        parts.push(`${col}_${v}`);
      }
    }
    if (!parts.length) parts.push(`clip_${row.id}`);
    return parts.join('.')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[:.]+/g, '_')
      .replace(/[^a-z0-9._-]/g, '') + '.png';
  }

  private async _onCapture(): Promise<void> {
    if (!this._specBitmap) return;
    const defaultName = this._buildCaptureFilename();
    const suggested = this._captureDir
      ? `${this._captureDir}/${defaultName}` : defaultName;
    const filename = prompt('Save spectrogram as:', suggested);
    if (!filename) return;

    // Render a clean capture canvas (spec + overlays, no playhead)
    const W = this._canvas.width, H = this._canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this._specBitmap, 0, 0, W, H);

    // Buffer overlay
    if (this._segDuration > 0) {
      const dsf = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
      const def = Math.min(1, (this._detectionEnd - this._segLoadStart) / this._segDuration);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (dsf > 0) ctx.fillRect(0, 0, Math.floor(dsf * W), H);
      if (def < 1) { const rx = Math.ceil(def * W); ctx.fillRect(rx, 0, W - rx, H); }
    }

    // Annotation overlays
    this._renderAnnotation(ctx, W, H);

    // Convert to blob and save via kernel
    const dataUrl = offscreen.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1];
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    try {
      await this._kernelBridge.exec(
        `import base64 as _b64, os as _os\n` +
        `_p = '${esc(filename)}'\n` +
        `_d = _os.path.dirname(_p)\n` +
        `if _d: _os.makedirs(_d, exist_ok=True)\n` +
        `with open(_p, 'wb') as _f:\n` +
        `    _f.write(_b64.b64decode('${b64}'))\n` +
        `print('ok')`
      );
      this._setStatus(`✓ Saved ${filename}`);
    } catch (e: any) {
      this._setStatus(`❌ Save failed: ${String(e.message ?? e)}`, true);
    }
  }

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
