import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

import {
  COLORS,
  barBottomStyle,
  injectGlobalStyles,
} from './styles';
import { Detection } from './types';
import { KernelBridge } from './kernel';
import { readKernelVars, syncOutput } from './python';
import { FormPanel } from './sections/FormPanel';
import { Player } from './sections/Player';
import { ClipTable } from './sections/ClipTable';
import { InfoCard } from './sections/InfoCard';

// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TITLE = 'Jupyter Bioacoustic';
let _counter = 0;

class BioacousticWidget extends Widget {
  private _kernelBridge: KernelBridge;

  // ── Config (from kernel vars) ────────────────────────────────
  private _identCol = '';
  private _displayCols: string[] = [];

  // ── DOM refs ────────────────────────────────────────────────
  private _titleEl!: HTMLSpanElement;
  private _statusEl!: HTMLSpanElement;
  // ── Sections ─────────────────────────────────────────────────
  private _table!: ClipTable;
  private _infoCard!: InfoCard;
  private _player!: Player;
  private _form!: FormPanel;

  constructor(tracker: INotebookTracker) {
    super();
    this._kernelBridge = new KernelBridge(tracker);
    this.id = `jp-bioacoustic-${_counter++}`;
    this.title.label = DEFAULT_TITLE;
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
      `overflow-y:auto;overflow-x:hidden;box-sizing:border-box;`;

    // ── Header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = barBottomStyle();

    this._titleEl = document.createElement('span');
    this._titleEl.textContent = DEFAULT_TITLE;
    this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `flex:1;text-align:right;font-size:11px;color:${COLORS.green};` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    this._statusEl.textContent = 'Loading…';
    header.append(this._titleEl, this._statusEl);

    // ── Clip table (filter + table + pagination) ──────────────────

    // ── Sections ──────────────────────────────────────────────────
    this._form = new FormPanel(this._kernelBridge);
    this._player = new Player(this._kernelBridge, this._form);
    this._table = new ClipTable(this._form);
    this._infoCard = new InfoCard();

    // Wire InfoCard signals
    this._infoCard.prevRequested.connect(() => this._onPrev());
    this._infoCard.nextRequested.connect(() => this._onSkip());

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
    this._form.syncRequested.connect(() => void this._onSync());
    this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    // Wire Player signals
    this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    // ── Assemble widget ──────────────────────────────────────────
    this.node.append(
      header,
      this._table.element,
      this._infoCard.element,
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
      raw = await this._kernelBridge.exec(readKernelVars());
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
      return;
    }

    let cfg: {
      data: string; audio: string; output: string;
      ident_col: string; app_title: string; display_cols: string; data_cols: string;
      form_config: string; capture: string; capture_dir: string; duplicate_entries: string;
      default_buffer: string; spec_resolutions: string; viz_meta: string;
      sync_config: string;
    };
    try {
      cfg = JSON.parse(raw);
    } catch {
      this._setStatus('❌ Failed to parse kernel config', true);
      return;
    }

    this._identCol  = cfg.ident_col;
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

    // Set title
    const appTitle = cfg.app_title || DEFAULT_TITLE;
    this._titleEl.textContent = appTitle;
    this.title.label = appTitle;

    // Initialize form panel
    const syncConfig = JSON.parse(cfg.sync_config || '{}') as {
      uri?: string; button?: string; recursive?: boolean;
    };

    this._form.setContext({
      formConfig,
      rows,
      identCol: this._identCol,
      duplicateEntries,
      outputPath,
      syncConfig,
    });
    await this._form.build();
    await this._form.loadOutputFileProgress();
    await this._form.loadReviewedState();

    // Initialize player
    const audioConfig = JSON.parse(cfg.audio) as {
      type: string; value: string; prefix: string; suffix: string; fallback: string;
    };
    const specResolutions = JSON.parse(cfg.spec_resolutions || '["1000","2000","4000"]') as string[];
    const vizMeta = JSON.parse(cfg.viz_meta || '[]') as Array<{type: string; key?: string; label: string; freq_scale?: string; index: number}>;
    this._player.setContext({
      audioConfig,
      captureLabel: cfg.capture ?? '',
      captureDir: cfg.capture_dir ?? '',
      identCol: this._identCol,
      displayCols: this._displayCols,
      defaultBuffer: parseFloat(cfg.default_buffer) || 3,
      specResolutions,
      vizMeta,
      rows,
    });

    // Initialize table
    this._table.setData({
      rows,
      identCol: this._identCol,
      displayCols: this._displayCols,
      dataCols,
      duplicateEntries,
    });

    // Auto-select first row
    if (this._table.filtered.length > 0) {
      this._selectRow(0);
      await this._player.loadRow(this._table.filtered[0]);
    }

    this._setStatus(`✓ ${rows.length} clips loaded`);
  }

  /** Orchestrator: update info card + form for the selected row. */
  private _selectRow(filteredIdx: number): void {
    this._table.selectIndex(filteredIdx);
    const row = this._table.filtered[filteredIdx];
    if (!row) return;

    this._infoCard.render(row, {
      identCol: this._identCol,
      displayCols: this._displayCols,
      filteredIdx,
      filteredLength: this._table.filtered.length,
    });

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

  // ─── Sync ──────────────────────────────────────────────────

  private async _onSync(): Promise<void> {
    this._setStatus('Syncing…');
    try {
      await this._kernelBridge.exec(syncOutput());
      this._setStatus('✓ Sync complete');
    } catch (e: any) {
      this._setStatus(`❌ Sync failed: ${String(e.message ?? e)}`, true);
    }
    this._form._enableSyncBtn();
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
