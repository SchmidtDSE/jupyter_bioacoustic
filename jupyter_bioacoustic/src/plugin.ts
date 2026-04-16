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
import { ClipTable } from './sections/ClipTable';

// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════

let _counter = 0;

class BioacousticWidget extends Widget {
  private _kernelBridge: KernelBridge;

  // ── Config (from kernel vars) ────────────────────────────────
  private _predictionCol = '';
  private _displayCols: string[] = [];

  // ── DOM refs ────────────────────────────────────────────────
  private _titleEl!: HTMLSpanElement;
  private _statusEl!: HTMLSpanElement;
  private _infoCard!: HTMLDivElement;

  // ── Sections (extracted) ─────────────────────────────────────
  private _table!: ClipTable;
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

    // ── Clip table (filter + table + pagination) ──────────────────

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
    this._table = new ClipTable(this._form);

    // Wire ClipTable signals
    this._table.rowSelected.connect((_, { row, filteredIdx }) => {
      this._selectRow(filteredIdx);
      void this._player.loadRow(row);
    });

    // Wire FormPanel signals
    this._form.submitted.connect(() => this._onSkip());
    this._form.prevRequested.connect(() => this._onPrev());
    this._form.nextRequested.connect(() => this._onSkip());
    this._form.reviewDeleted.connect(() => this._table.refresh());
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
      header,
      this._table.element,
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

    this._predictionCol  = cfg.prediction_col;
    this._displayCols    = JSON.parse(cfg.display_cols) as string[];
    const dataCols       = JSON.parse(cfg.data_cols) as string[];
    const formConfig     = JSON.parse(cfg.form_config);
    const duplicateEntries = !!cfg.duplicate_entries;
    const outputPath     = cfg.output;

    let rows: Detection[];
    try {
      rows = JSON.parse(cfg.data) as Detection[];
    } catch {
      this._setStatus('❌ Failed to parse detection data', true);
      return;
    }

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
      rows,
      predictionCol: this._predictionCol,
      duplicateEntries,
      outputPath,
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
      rows,
    });

    // Initialize table
    this._table.setData({
      rows,
      predictionCol: this._predictionCol,
      displayCols: this._displayCols,
      dataCols,
      duplicateEntries,
    });

    // Auto-select first row
    if (this._table.filtered.length > 0) {
      this._selectRow(0);
      await this._player.loadRow(this._table.filtered[0]);
    }

    const noun = this._predictionCol ? 'detections' : 'clips';
    this._setStatus(`✓ ${rows.length} ${noun} loaded`);
  }

  /** Orchestrator: update info card + form for the selected row. */
  private _selectRow(filteredIdx: number): void {
    this._table.selectIndex(filteredIdx);
    const row = this._table.filtered[filteredIdx];
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
    nextBtn.disabled = filteredIdx >= this._table.filtered.length - 1;
    nextBtn.addEventListener('click', () => this._onSkip());

    const cardChildren: HTMLElement[] = [];
    items.forEach((el, i) => {
      cardChildren.push(el);
      if (i < items.length - 1) cardChildren.push(sep());
    });
    cardChildren.push(spacer, prevBtn, nextBtn);
    this._infoCard.append(...cardChildren);

    this._form.setSelectionInfo(filteredIdx, this._table.filtered.length);
    this._form.updateFromRow(row);

    this._player.signalTimeDisplay.textContent = this._form.getAnnotConfig()
      ? 'drag on spectrogram to annotate' : '';
  }

  private _onPrev(): void {
    const idx = this._table.selectedIdx;
    if (idx > 0) {
      this._selectRow(idx - 1);
      this._table.ensurePageShowsSelected();
      void this._player.loadRow(this._table.filtered[idx - 1]);
    }
  }

  private _onSkip(): void {
    const idx = this._table.selectedIdx;
    if (idx < this._table.filtered.length - 1) {
      this._selectRow(idx + 1);
      this._table.ensurePageShowsSelected();
      void this._player.loadRow(this._table.filtered[idx + 1]);
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
