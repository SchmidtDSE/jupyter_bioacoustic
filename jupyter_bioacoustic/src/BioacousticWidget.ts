/**
 * BioacousticWidget — the annotator tab (or inline notebook output).
 *
 * Orchestrates the sections, top to bottom: header (title, status, ⓘ info panel),
 * DescriptionPanel, ClipTable, InfoCard, Player and FormPanel. On attach it reads the
 * ``_BA_*`` config globals from its kernel, validates the form config, hands each section
 * its slice of the config and selects the first row. Sections talk to each other only
 * through this class (Lumino signals in, method calls out).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import type { Kernel } from '@jupyterlab/services';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

import { INFO_ICON_CLOSED, INFO_ICON_OPEN, infoPanelHtml } from './infoPanel';
import { KernelBridge, KernelSource } from './kernel';
import { readKernelVars, syncOutput, validateFormConfig } from './python';
import { ClipTable } from './sections/ClipTable';
import { DescriptionConfig, DescriptionPanel } from './sections/DescriptionPanel';
import { FormPanel } from './sections/FormPanel';
import { InfoCard } from './sections/InfoCard';
import { Player } from './sections/Player';
import { COLORS, barBottomStyle, injectGlobalStyles } from './styles';
import { DIALOG, TOOLTIP } from './text';
import { AudioConfig, Detection, KernelVars, SyncConfig, VizMeta } from './types';
import { errorMessage, showDialog } from './util';


//
// Constants
//
/** Tab / header title until the config's ``app_title`` is read. */
export const DEFAULT_TITLE = 'Jupyter Bioacoustic';
const DEFAULT_SPEC_RESOLUTIONS = '["1000","2000","4000"]';
const DEFAULT_BUFFER_SEC = 3;

/** Makes widget ids unique: ``jp-bioacoustic-<n>``. */
let widgetCounter = 0;


//
// Public
//
/** The annotator widget; one per open annotator, bound to one kernel for its lifetime. */
export class BioacousticWidget extends Widget {
  private readonly _kernelBridge: KernelBridge;
  private _ownedKernel: Kernel.IKernelConnection | null;

  // ── Config (from kernel vars) ────────────────────────────────
  private _titleTemplate = '';
  private _textTemplate = '';

  // ── DOM refs ────────────────────────────────────────────────
  private _titleEl!: HTMLSpanElement;
  private _statusEl!: HTMLSpanElement;
  private _infoToggle!: HTMLButtonElement;
  private _infoPanel!: HTMLDivElement;

  // ── Sections ─────────────────────────────────────────────────
  private _table!: ClipTable;
  private _infoCard!: InfoCard;
  private _player!: Player;
  private _form!: FormPanel;
  private _description!: DescriptionPanel;

  /**
   * @param source - The kernel or notebook session this widget talks to (fixed for its lifetime).
   * @param ownsKernel - Shut ``source.kernel`` down when the widget is closed.
   */
  constructor(source: KernelSource, ownsKernel = false) {
    super();
    this._kernelBridge = new KernelBridge(source);
    this._ownedKernel = ownsKernel ? source.kernel ?? null : null;
    this.id = `jp-bioacoustic-${widgetCounter++}`;
    this.title.label = DEFAULT_TITLE;
    this.title.closable = true;
    injectGlobalStyles();
    this._buildUI();
  }

  /** Close the widget, shutting down its kernel if it started one. */
  override dispose(): void {
    if (this._ownedKernel) {
      this._ownedKernel.shutdown().catch(() => {});
      this._ownedKernel = null;
    }
    super.dispose();
  }

  // ── Lumino lifecycle ─────────────────────────────────────────

  protected override onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._player.attach();
    void this._init();
  }

  protected override onBeforeDetach(msg: Message): void {
    this._player.detach();
    super.onBeforeDetach(msg);
  }

  // ── UI construction ──────────────────────────────────────────

  /** Build the header + info panel, create the sections and wire their signals. */
  private _buildUI(): void {
    this.node.style.cssText =
      `display:flex;flex-direction:column;width:100%;height:100%;` +
      `background:${COLORS.bgBase};color:${COLORS.textPrimary};` +
      `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
      `overflow-y:auto;overflow-x:hidden;box-sizing:border-box;`;

    const header = this._buildHeader();

    this._infoPanel = document.createElement('div');
    this._infoPanel.style.cssText =
      `display:none;background:${COLORS.bgSurface0};border-bottom:1px solid ${COLORS.bgSurface1};` +
      `padding:12px 16px;font-size:11px;line-height:1.4;`;
    this._infoPanel.innerHTML =
      `<div style="color:${COLORS.textSubtle};">Loading configuration info...</div>`;

    this._description = new DescriptionPanel();
    this._form = new FormPanel(this._kernelBridge);
    this._player = new Player(this._kernelBridge, this._form);
    this._table = new ClipTable(this._form);
    this._infoCard = new InfoCard();
    this._connectSignals();

    this.node.append(
      header,
      this._infoPanel,
      this._description.element,
      this._table.element,
      this._infoCard.element,
      this._player.element,
      this._form.element,
    );
  }

  /** The header bar: title, status line and the ⓘ info toggle. */
  private _buildHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = barBottomStyle();

    this._titleEl = document.createElement('span');
    this._titleEl.textContent = DEFAULT_TITLE;
    this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `flex:1;text-align:right;font-size:11px;color:${COLORS.green};` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;`;
    this._statusEl.textContent = 'Loading…';

    this._infoToggle = document.createElement('button');
    this._infoToggle.innerHTML = INFO_ICON_CLOSED;
    this._infoToggle.style.cssText =
      `background:none;border:none;cursor:pointer;padding:2px;` +
      `flex-shrink:0;transition:all 0.15s;font-size:14px;color:${COLORS.textSubtle};`;
    this._infoToggle.title = TOOLTIP.toggleInfo;
    this._infoToggle.onclick = () => this._toggleInfoPanel();
    this._infoToggle.onmouseenter = () => {
      this._infoToggle.style.backgroundColor = COLORS.bgHover;
    };
    this._infoToggle.onmouseleave = () => {
      this._infoToggle.style.backgroundColor = 'transparent';
    };

    header.append(this._titleEl, this._statusEl, this._infoToggle);
    return header;
  }

  /** Wire section signals to the orchestration methods. */
  private _connectSignals(): void {
    this._infoCard.prevRequested.connect(() => this._onPrev());
    this._infoCard.nextRequested.connect(() => this._onSkip());

    this._table.rowSelected.connect((_, { row, filteredIdx }) => {
      this._selectRow(filteredIdx);
      void this._player.loadRow(row);
    });

    this._form.submitted.connect(() => this._onSkip());
    this._form.prevRequested.connect(() => this._onPrev());
    this._form.nextRequested.connect(() => this._onSkip());
    this._form.reviewDeleted.connect(() => {
      // In the reviewed view keep the deleted item visible (just un-grey it): refreshing
      // would remove it from the list.
      if (this._table.viewMode === 'reviewed') {
        this._table.updateCurrentRowStyle();
      } else {
        this._table.refresh();
      }
    });
    this._form.annotationChanged.connect(() => this._player.renderFrame());
    this._form.activeToolChanged.connect(() => {
      this._player.updateCursor();
      this._player.renderFrame();
    });
    this._form.syncRequested.connect(() => void this._onSync());
    this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error));

    this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error, s.warning));
  }

  // ── Initialization ───────────────────────────────────────────

  /**
   * Read the kernel config, validate the form config, initialize every section and select
   * the first row. Errors end up in the status line (and a dialog for invalid config).
   */
  private async _init(): Promise<void> {
    this._setStatus('Reading kernel variables…');
    let raw: string;
    try {
      raw = await this._kernelBridge.exec(readKernelVars());
    } catch (e: unknown) {
      this._setStatus(`❌ ${errorMessage(e)}`, true);
      return;
    }

    let cfg: KernelVars;
    try {
      cfg = JSON.parse(raw);
    } catch {
      this._setStatus('❌ Failed to parse kernel config', true);
      return;
    }

    this._titleTemplate = cfg.info_card_title || '';
    this._textTemplate = cfg.info_card_text || '';
    const formConfig = JSON.parse(cfg.form_config);
    if (!(await this._validateFormConfig(formConfig))) return;

    let rows: Detection[];
    try {
      rows = JSON.parse(cfg.data) as Detection[];
    } catch {
      this._setStatus('❌ Failed to parse detection data', true);
      return;
    }

    const appTitle = cfg.app_title || DEFAULT_TITLE;
    this._titleEl.textContent = appTitle;
    this.title.label = appTitle;

    if (cfg.description) {
      try {
        const descCfg = JSON.parse(cfg.description) as DescriptionConfig;
        this._description.setConfig(descCfg, _parseHeight(cfg.description_height));
      } catch { /* no description */ }
    }

    const syncConfig = JSON.parse(cfg.sync_config || '{}') as SyncConfig;
    const audioConfig = await this._initSections(cfg, formConfig, rows, syncConfig);

    if (this._table.filtered.length > 0) {
      this._selectRow(0);
      await this._player.loadRow(this._table.filtered[0]);
    }

    this._setStatus(`✓ ${rows.length} clips loaded`);

    this._infoPanel.innerHTML = infoPanelHtml({
      cfg,
      audioConfig,
      outputPath: cfg.output,
      syncConfig,
      mergedConfig: cfg.merged_config ? JSON.parse(cfg.merged_config) : {},
      rowCount: Array.isArray(rows) ? rows.length : 0,
    });
  }

  /**
   * Validate the form config in the kernel.
   * @returns false (after reporting the problem) if it is invalid or validation failed.
   */
  private async _validateFormConfig(formConfig: unknown): Promise<boolean> {
    try {
      const valRaw = await this._kernelBridge.exec(
        validateFormConfig(JSON.stringify(formConfig)),
      );
      const configErrors = JSON.parse(valRaw) as string[];
      if (configErrors.length > 0) {
        this._setStatus('❌ Config validation failed', true);
        await showDialog({
          title: DIALOG.configValidationFailedTitle,
          body: '• ' + configErrors.join('\n• '),
        });
        return false;
      }
    } catch (e: unknown) {
      this._setStatus(`❌ Validation error: ${errorMessage(e)}`, true);
      return false;
    }
    return true;
  }

  /**
   * Hand each section its config: form (built and loaded with output progress), player
   * and table, plus the info card height.
   * @returns The parsed audio config (for the info panel).
   */
  private async _initSections(
    cfg: KernelVars,
    formConfig: unknown,
    rows: Detection[],
    syncConfig: SyncConfig,
  ): Promise<AudioConfig> {
    const duplicateEntries = !!cfg.duplicate_entries;
    const dataIndexCol = cfg.data_index_col;

    this._form.setContext({
      formConfig,
      rows,
      duplicateEntries,
      outputPath: cfg.output,
      dataIndexCol,
      outputIndexCol: cfg.output_index_col,
      syncConfig,
      height: _parseHeight(cfg.form_panel_height),
    });
    await this._form.build();
    await this._form.loadOutputFileProgress();
    await this._form.loadReviewedState();

    const audioConfig = JSON.parse(cfg.audio) as AudioConfig;
    this._player.setContext({
      audioConfig,
      captureLabel: cfg.capture ?? '',
      captureDir: cfg.capture_dir ?? '',
      captureHeight: _parseHeight(cfg.capture_height),
      titleTemplate: this._titleTemplate,
      defaultBuffer: cfg.default_buffer !== undefined && cfg.default_buffer !== ''
        ? parseFloat(cfg.default_buffer) : DEFAULT_BUFFER_SEC,
      specResolutions: JSON.parse(cfg.spec_resolutions || DEFAULT_SPEC_RESOLUTIONS) as string[],
      vizMeta: JSON.parse(cfg.viz_meta || '[]') as VizMeta[],
      dataIndexCol,
      height: _parseHeight(cfg.player_height),
    });

    this._table.setData({
      rows,
      dataCols: JSON.parse(cfg.data_cols) as string[],
      duplicateEntries,
      dataIndexCol,
      sort: cfg.sort || '',
      sortOrder: cfg.sort_order || 'asc',
      height: _parseHeight(cfg.clip_table_height),
    });

    this._infoCard.setHeight(_parseHeight(cfg.info_card_height));
    return audioConfig;
  }

  // ── Row navigation ───────────────────────────────────────────

  /** Select a row of the filtered list: table highlight, info card and form follow it. */
  private _selectRow(filteredIdx: number): void {
    this._table.selectIndex(filteredIdx);
    const row = this._table.filtered[filteredIdx];
    if (!row) return;

    this._infoCard.render(row, {
      titleTemplate: this._titleTemplate,
      textTemplate: this._textTemplate,
      filteredIdx,
      filteredLength: this._table.filtered.length,
    });

    this._form.setSelectionInfo(filteredIdx, this._table.filtered.length);
    this._form.updateFromRow(row);
    this._player.clearAnnotDisplay();
  }

  /** Go to the previous row (if any) and load its audio. */
  private _onPrev(): void {
    this._step(-1);
  }

  /** Go to the next row (if any) and load its audio — after submit, Skip or Next. */
  private _onSkip(): void {
    this._step(1);
  }

  /** Move the selection by ``delta`` rows when the target row exists. */
  private _step(delta: number): void {
    const target = this._table.selectedIdx + delta;
    if (target < 0 || target >= this._table.filtered.length) return;
    this._selectRow(target);
    this._table.ensurePageShowsSelected();
    void this._player.loadRow(this._table.filtered[target]);
  }

  // ── Sync / info panel / status ───────────────────────────────

  /** Upload the output file to its sync URI (the form's sync button). */
  private async _onSync(): Promise<void> {
    this._setStatus('Syncing…');
    try {
      await this._kernelBridge.exec(syncOutput());
      this._setStatus('✓ Sync complete');
    } catch (e: unknown) {
      this._setStatus(`❌ Sync failed: ${errorMessage(e)}`, true);
    } finally {
      this._form.setSyncBusy(false);     // re-syncing is always allowed (it re-uploads)
    }
  }

  /** Show / hide the ⓘ info panel. */
  private _toggleInfoPanel(): void {
    const isVisible = this._infoPanel.style.display !== 'none';
    this._infoPanel.style.display = isVisible ? 'none' : 'block';
    this._infoToggle.innerHTML = isVisible ? INFO_ICON_CLOSED : INFO_ICON_OPEN;
    this._infoToggle.style.color = isVisible ? COLORS.textSubtle : COLORS.blue;
  }

  /** Show ``msg`` in the header status line (red for errors, yellow for warnings). */
  private _setStatus(msg: string, error = false, warning = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : warning ? COLORS.yellow : COLORS.green;
  }
}


//
// Internal
//
/** A section height from the config (px), or undefined for "use the default". */
function _parseHeight(raw: string): number | undefined {
  return parseInt(raw) || undefined;
}
