import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { FileDialog, IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon } from '@jupyterlab/ui-components';
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
import { DescriptionPanel, DescriptionConfig } from './sections/DescriptionPanel';

// ═══════════════════════════════════════════════════════════════
// BioacousticWidget
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TITLE = 'Jupyter Bioacoustic';
const VALID_ANNOTATION_TOOLS = new Set([
  'time_select', 'start_end_time_select', 'bounding_box', 'multibox',
]);
let _counter = 0;

class BioacousticWidget extends Widget {
  private _kernelBridge: KernelBridge;
  private _ownedKernel: any;

  // ── Config (from kernel vars) ────────────────────────────────
  private _identCol = '';
  private _displayCols: string[] = [];

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

  constructor(tracker: INotebookTracker, directKernel?: any) {
    super();
    this._kernelBridge = new KernelBridge(
      directKernel ? null : tracker,
      directKernel,
    );
    this._ownedKernel = directKernel ?? null;
    this.id = `jp-bioacoustic-${_counter++}`;
    this.title.label = DEFAULT_TITLE;
    this.title.closable = true;
    injectGlobalStyles();
    this._buildUI();
  }

  dispose(): void {
    if (this._ownedKernel) {
      this._ownedKernel.shutdown().catch(() => {});
      this._ownedKernel = null;
    }
    super.dispose();
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
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;`;
    this._statusEl.textContent = 'Loading…';

    // ── Info toggle button ──────────────────────────────────────────
    this._infoToggle = document.createElement('button');
    this._infoToggle.innerHTML = `&#9432;`;
    this._infoToggle.style.cssText =
      `background:none;border:none;cursor:pointer;padding:2px;` +
      `flex-shrink:0;transition:all 0.15s;font-size:14px;color:${COLORS.textSubtle};`;
    this._infoToggle.title = 'Toggle configuration info';
    this._infoToggle.onclick = () => this._toggleInfoPanel();

    // Hover effect
    this._infoToggle.onmouseenter = () => {
      this._infoToggle.style.backgroundColor = COLORS.bgHover;
    };
    this._infoToggle.onmouseleave = () => {
      this._infoToggle.style.backgroundColor = 'transparent';
    };

    header.append(this._titleEl, this._statusEl, this._infoToggle);

    // ── Info panel ──────────────────────────────────────────────────
    this._infoPanel = document.createElement('div');
    this._infoPanel.style.cssText =
      `display:none;background:${COLORS.bgSurface0};border-bottom:1px solid ${COLORS.bgSurface1};` +
      `padding:12px 16px;font-size:11px;line-height:1.4;`;
    this._infoPanel.innerHTML = `<div style="color:${COLORS.textSubtle};">Loading configuration info...</div>`;

    // ── Clip table (filter + table + pagination) ──────────────────

    // ── Sections ──────────────────────────────────────────────────
    this._description = new DescriptionPanel();
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
    this._player.statusChanged.connect((_, s) => this._setStatus(s.message, s.error, s.warning));

    // ── Assemble widget ──────────────────────────────────────────
    this.node.append(
      header,
      this._infoPanel,
      this._description.element,
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
      form_config: string; capture: string; capture_dir: string; capture_height: string; duplicate_entries: string;
      default_buffer: string; spec_resolutions: string; viz_meta: string;
      sync_config: string;
      clip_table_height: string; player_height: string;
      info_card_height: string; form_panel_height: string;
      project_save_btn: string;
      description: string;
      description_height: string;
      project_path: string;
      config_path: string;
      form_path: string;
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

    const configErrors = _validateFormConfig(formConfig);
    if (configErrors.length > 0) {
      this._setStatus('❌ Config validation failed', true);
      window.alert('Config validation failed:\n\n• ' + configErrors.join('\n• '));
      return;
    }

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

    if (cfg.description) {
      try {
        const descCfg = JSON.parse(cfg.description) as DescriptionConfig;
        const descHeight = parseInt(cfg.description_height) || undefined;
        this._description.setConfig(descCfg, descHeight);
      } catch { /* no description */ }
    }

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
      height: parseInt(cfg.form_panel_height) || undefined,
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
      captureHeight: parseInt(cfg.capture_height) || undefined,
      identCol: this._identCol,
      displayCols: this._displayCols,
      defaultBuffer: parseFloat(cfg.default_buffer) || 3,
      specResolutions,
      vizMeta,
      rows,
      height: parseInt(cfg.player_height) || undefined,
    });

    // Initialize table
    this._table.setData({
      rows,
      identCol: this._identCol,
      displayCols: this._displayCols,
      dataCols,
      duplicateEntries,
      height: parseInt(cfg.clip_table_height) || undefined,
    });

    this._infoCard.setHeight(parseInt(cfg.info_card_height) || undefined);

    // Auto-select first row
    if (this._table.filtered.length > 0) {
      this._selectRow(0);
      await this._player.loadRow(this._table.filtered[0]);
    }

    this._setStatus(`✓ ${rows.length} clips loaded`);

    // Populate info panel with configuration details
    this._populateInfoPanel(cfg, audioConfig, outputPath, syncConfig);
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
      this._form._resetSyncBtnLabel()
    } catch (e: any) {
      this._setStatus(`❌ Sync failed: ${String(e.message ?? e)}`, true);
      this._form._enableSyncBtn();
    }
  }

  // ─── Capture ─────────────────────────────────────────────────


  // ─── Kernel helpers ──────────────────────────────────────────


  // ─── Info Panel ──────────────────────────────────────────────

  private _toggleInfoPanel(): void {
    const isVisible = this._infoPanel.style.display !== 'none';
    if (isVisible) {
      this._infoPanel.style.display = 'none';
      // Closed state: outline info icon
      this._infoToggle.innerHTML = `&#9432;`;
      this._infoToggle.style.color = COLORS.textSubtle;
    } else {
      this._infoPanel.style.display = 'block';
      // Open state: white filled circle with black i
      this._infoToggle.innerHTML = `<span style="
        display:inline-block;
        width:14px;
        height:14px;
        border-radius:50%;
        background:white;
        color:black;
        text-align:center;
        line-height:14px;
        font-size:10px;
        font-weight:bold;
      ">i</span>`;
      this._infoToggle.style.color = COLORS.blue;
    }
  }

  private _populateInfoPanel(cfg: any, audioConfig: any, outputPath: string, syncConfig: any): void {
    // Helper function to format paths
    const formatPath = (path: string, type: string) => {
      if (!path) return `<span style="color:${COLORS.textSubtle};">Not specified</span>`;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return `<span style="color:${COLORS.blue};">(url)</span> ${path}`;
      }
      if (path.startsWith('s3://') || path.startsWith('gs://')) {
        return `<span style="color:${COLORS.blue};">(${path.startsWith('s3://') ? 's3' : 'gcs'})</span> ${path}`;
      }
      return `<span style="color:${COLORS.blue};">(${type})</span> ${path}`;
    };

    // Data source info
    const dataInfo = cfg.data ? JSON.parse(cfg.data) : [];
    const dataSourceText = Array.isArray(dataInfo)
      ? `<span style="color:${COLORS.blue};">(kernel)</span> ${dataInfo.length} rows loaded`
      : `<span style="color:${COLORS.blue};">(kernel)</span> Data loaded`;

    // Audio source info
    let audioSourceText = '';
    if (audioConfig.type === 'column') {
      audioSourceText = `<span style="color:${COLORS.blue};">(column)</span> ${audioConfig.value}`;
    } else if (audioConfig.type === 'value') {
      audioSourceText = formatPath(audioConfig.value, 'path');
    } else {
      audioSourceText = `<span style="color:${COLORS.textSubtle};">Unknown audio source</span>`;
    }

    // Output info
    let outputText = formatPath(outputPath, 'local');
    if (syncConfig && syncConfig.uri) {
      outputText += `<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:${COLORS.blue};">(sync)</span> ${syncConfig.uri}`;
    }

    // Configuration file paths
    let configText = '';
    if (cfg.project_path) {
      configText += `<div style="margin-bottom:4px;">• <strong>project:</strong> ${formatPath(cfg.project_path, 'file')}</div>`;
    }
    if (cfg.config_path) {
      configText += `<div style="margin-bottom:4px;">• <strong>config:</strong> ${formatPath(cfg.config_path, 'file')}</div>`;
    }
    if (cfg.form_path) {
      configText += `<div style="margin-bottom:4px;">• <strong>form:</strong> ${formatPath(cfg.form_path, 'file')}</div>`;
    }
    if (!configText) {
      configText = `<div style="color:${COLORS.textSubtle};">No configuration files loaded</div>`;
    }

    this._infoPanel.innerHTML = `
      <div style="font-family:monospace;">
        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Data Sources & Output</div>
        <div style="margin-bottom:4px;">• <strong>data:</strong> ${dataSourceText}</div>
        <div style="margin-bottom:4px;">• <strong>audio:</strong> ${audioSourceText}</div>
        <div style="margin-bottom:12px;">• <strong>output:</strong><br>&nbsp;&nbsp;&nbsp;&nbsp;${outputText}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Configuration Files</div>
        <div style="margin-bottom:12px;">${configText}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Documentation</div>
        <div style="margin-bottom:4px;">• <strong>site:</strong> <a href="https://schmidtdse.github.io/jupyter_bioacoustic" target="_blank" style="color:${COLORS.blue};">schmidtdse.github.io/jupyter_bioacoustic</a></div>
        <div>• <strong>docs:</strong> <a href="https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki" target="_blank" style="color:${COLORS.blue};">github.com/SchmidtDSE/jupyter_bioacoustic/wiki</a></div>
      </div>
    `;
  }

  // ─── Utilities ───────────────────────────────────────────────

  private _setStatus(msg: string, error = false, warning = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : warning ? COLORS.yellow : COLORS.green;
  }

}

// ═══════════════════════════════════════════════════════════════
// Plugin registration
// ═══════════════════════════════════════════════════════════════

function _validateFormConfig(fc: any): string[] {
  if (!fc || typeof fc !== 'object') return [];
  const errors: string[] = [];

  const checkAnnotTools = (annot: any) => {
    if (!annot || typeof annot !== 'object') return;
    let tools: any[] = [];
    if (typeof annot.tools === 'string') tools = [annot.tools];
    else if (Array.isArray(annot.tools)) tools = annot.tools;
    for (const t of tools) {
      if (typeof t === 'string' && !VALID_ANNOTATION_TOOLS.has(t)) {
        errors.push(
          `Unknown annotation tool "${t}". ` +
          `Valid tools: ${[...VALID_ANNOTATION_TOOLS].sort().join(', ')}`,
        );
      }
    }
  };

  if (fc.annotation) checkAnnotTools(fc.annotation);
  if (Array.isArray(fc.form)) {
    for (const el of fc.form) {
      if (el && typeof el === 'object' && el.annotation) {
        checkAnnotTools(el.annotation);
      }
    }
  }
  return errors;
}

function escPy(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getOptimalProjectPath(
  browser: IDefaultFileBrowser | null,
  currentPath: string,
): Promise<string> {
  if (!browser) return currentPath;

  const manager = browser.model.manager;

  // Helper function to check if a directory exists
  const dirExists = async (path: string): Promise<boolean> => {
    try {
      const contents = await manager.services.contents.get(path);
      return contents.type === 'directory';
    } catch {
      return false;
    }
  };

  // Check for annotator_config/projects in current directory first
  const localProjectsPath = currentPath ? `${currentPath}/annotator_config/projects` : 'annotator_config/projects';
  if (await dirExists(localProjectsPath)) {
    return localProjectsPath;
  }

  // Check for annotator_config in current directory
  const localConfigPath = currentPath ? `${currentPath}/annotator_config` : 'annotator_config';
  if (await dirExists(localConfigPath)) {
    return localConfigPath;
  }

  // Fallback to workspace root annotator_config/projects
  if (await dirExists('annotator_config/projects')) {
    return 'annotator_config/projects';
  }

  // Fallback to workspace root annotator_config
  if (await dirExists('annotator_config')) {
    return 'annotator_config';
  }

  // Use current directory as final fallback
  return currentPath;
}

async function pickProjectFile(
  browser: IDefaultFileBrowser | null,
  defaultPath: string,
): Promise<string> {
  if (browser) {
    // Get optimal starting path based on annotator_config directory structure
    const optimalPath = await getOptimalProjectPath(browser, defaultPath);

    return showProjectFileDialog(browser, optimalPath, defaultPath);
  }
  const path = window.prompt('Project file path (.yaml)');
  return path?.trim() ?? '';
}

async function showProjectFileDialog(
  browser: IDefaultFileBrowser,
  initialPath: string,
  cwdPath: string,
): Promise<string> {
  // Create a custom dialog with file browser + text input
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: white; border: 1px solid #ccc; border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000;
    width: 600px; max-height: 500px; display: flex; flex-direction: column;
    font-family: var(--jp-ui-font-family);
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
    font-weight: 600; font-size: 16px;
  `;
  header.textContent = 'Select Bioacoustic Project';

  // Path input section
  const inputSection = document.createElement('div');
  inputSection.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  `;

  const inputLabel = document.createElement('div');
  inputLabel.style.cssText = `
    margin-bottom: 8px; font-size: 13px; font-weight: 500; color: #333;
  `;
  inputLabel.textContent = 'Project file path (local, s3://, gs://, or https://):';

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.placeholder = 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml';
  pathInput.style.cssText = `
    width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px;
    font-size: 13px; font-family: monospace; box-sizing: border-box;
  `;

  inputSection.appendChild(inputLabel);
  inputSection.appendChild(pathInput);

  // File browser section
  const browserSection = document.createElement('div');
  browserSection.style.cssText = `
    flex: 1; overflow: hidden; display: flex; flex-direction: column;
    min-height: 200px;
  `;

  const browserLabel = document.createElement('div');
  browserLabel.style.cssText = `
    padding: 12px 20px; font-size: 13px; font-weight: 500; color: #555;
    border-bottom: 1px solid #f0f0f0;
  `;
  browserLabel.textContent = 'Or browse files:';

  const browserContainer = document.createElement('div');
  browserContainer.style.cssText = `
    flex: 1; overflow: auto; padding: 16px 20px;
  `;

  browserSection.appendChild(browserLabel);
  browserSection.appendChild(browserContainer);

  // Buttons
  const buttonSection = document.createElement('div');
  buttonSection.style.cssText = `
    padding: 16px 20px; border-top: 1px solid #e0e0e0;
    display: flex; justify-content: flex-end; gap: 12px;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  `;

  const selectBtn = document.createElement('button');
  selectBtn.textContent = 'Select';
  selectBtn.style.cssText = `
    padding: 8px 16px; border: none; background: #2196F3; color: white; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  `;

  buttonSection.appendChild(cancelBtn);
  buttonSection.appendChild(selectBtn);

  // Assemble dialog
  dialog.appendChild(header);
  dialog.appendChild(inputSection);
  dialog.appendChild(browserSection);
  dialog.appendChild(buttonSection);

  // Overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 9999;
  `;

  document.body.appendChild(overlay);
  overlay.appendChild(dialog);

  // State tracking
  let selectedFile = '';
  let selectedFromBrowser = false;
  let currentBrowserPath = initialPath;

  pathInput.addEventListener('input', () => { selectedFromBrowser = false; });

  // Update path input based on current browser directory and handle remote URIs
  const updatePathContext = () => {
    const currentValue = pathInput.value.trim();
    const isRemoteUri = currentValue.startsWith('s3://') ||
                       currentValue.startsWith('gs://') ||
                       currentValue.startsWith('http://') ||
                       currentValue.startsWith('https://');

    if (isRemoteUri) {
      // Disable and grey out file browser for remote URIs
      browserSection.style.opacity = '0.4';
      browserSection.style.pointerEvents = 'none';
      browserLabel.textContent = 'File browser (disabled for remote URIs)';
      browserLabel.style.color = '#999';
      pathInput.placeholder = 'Remote URI detected - file browser disabled';
    } else {
      // Enable file browser for local paths
      browserSection.style.opacity = '1';
      browserSection.style.pointerEvents = 'auto';
      browserLabel.textContent = 'Or browse files:';
      browserLabel.style.color = '#555';

      if (currentValue && !currentValue.startsWith('/')) {
        // If user typed a relative path, combine with current browser path
        pathInput.placeholder = `Current dir: ${currentBrowserPath}/`;
      } else {
        pathInput.placeholder = 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml';
      }
    }
  };

  // Simulate file browser (simplified version)
  const loadFileBrowser = async (path: string) => {
    browserContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Loading...</div>';

    try {
      const contents = await browser.model.manager.services.contents.get(path);
      browserContainer.innerHTML = '';

      // Add parent directory link if not at server root
      if (path !== '') {
        const parentDir = path.split('/').slice(0, -1).join('/') || '';
        const parentItem = document.createElement('div');
        parentItem.style.cssText = `
          padding: 6px 0; cursor: pointer; color: #2196F3;
          border-bottom: 1px solid #f0f0f0;
        `;
        parentItem.innerHTML = '📁 ..';
        parentItem.onclick = () => {
          currentBrowserPath = parentDir;
          loadFileBrowser(parentDir);
          updatePathContext();
        };
        browserContainer.appendChild(parentItem);
      }

      if (contents.content) {
        for (const item of contents.content) {
          const itemEl = document.createElement('div');
          itemEl.style.cssText = `
            padding: 6px 0; cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
          `;

          if (item.type === 'directory') {
            itemEl.innerHTML = `📁 ${item.name}`;
            itemEl.onclick = () => {
              currentBrowserPath = item.path;
              loadFileBrowser(item.path);
              updatePathContext();
            };
          } else if (item.name.toLowerCase().match(/\.(yaml|yml|json)$/)) {
            itemEl.innerHTML = `📄 ${item.name}`;
            const selectFile = () => {
              selectedFile = item.path;
              selectedFromBrowser = true;
              const displayPath = cwdPath && item.path.startsWith(cwdPath + '/')
                ? item.path.substring(cwdPath.length + 1)
                : item.path;
              pathInput.value = displayPath;
            };
            itemEl.onclick = selectFile;
            itemEl.ondblclick = () => {
              selectFile();
              selectBtn.click();
            };
            itemEl.onmouseover = () => itemEl.style.backgroundColor = '#f0f0f0';
            itemEl.onmouseout = () => itemEl.style.backgroundColor = 'transparent';
          } else {
            itemEl.innerHTML = `📄 ${item.name}`;
            itemEl.style.color = '#ccc';
          }

          browserContainer.appendChild(itemEl);
        }
      }
    } catch (error) {
      browserContainer.innerHTML = `<div style="color: #f44336; padding: 20px;">Error loading directory: ${error}</div>`;
    }
  };

  // Load initial browser
  loadFileBrowser(initialPath);
  updatePathContext();

  // Input handling
  pathInput.addEventListener('input', updatePathContext);

  // Promise-based dialog
  return new Promise<string>((resolve) => {
    let onKeydown: ((e: KeyboardEvent) => void) | null = null;
    const cleanup = () => {
      if (onKeydown) document.removeEventListener('keydown', onKeydown);
      document.body.removeChild(overlay);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve('');
    };

    selectBtn.onclick = () => {
      let finalPath = pathInput.value.trim();

      if (!finalPath) {
        alert('Please enter a file path or select a file.');
        return;
      }

      // Handle relative paths — only prepend currentBrowserPath for manually typed paths,
      // not for paths set by clicking a file in the browser (those are already full paths)
      if (!selectedFromBrowser && finalPath && !finalPath.includes('://') && !finalPath.startsWith('/') && currentBrowserPath) {
        finalPath = `${currentBrowserPath}/${finalPath}`.replace(/\/+/g, '/');
      }

      cleanup();
      resolve(finalPath);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve('');
      }
    };

    onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && pathInput.value.trim()) {
        selectBtn.click();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    };
    document.addEventListener('keydown', onKeydown);

    // Focus the input
    pathInput.focus();
  });
}

async function startKernel(app: JupyterFrontEnd): Promise<any | null> {
  try {
    const kernel = await app.serviceManager.kernels.startNew({ name: 'python3' });
    return kernel;
  } catch (e) {
    console.error('bioacoustic: failed to start kernel', e);
    return null;
  }
}

function getExistingKernel(tracker: INotebookTracker): any | null {
  return tracker.currentWidget?.sessionContext?.session?.kernel ?? null;
}

async function execInKernel(kernel: any, code: string): Promise<string> {
  const future = kernel.requestExecute({ code });
  let error = '';
  future.onIOPub = (msg: any) => {
    if (msg.header?.msg_type === 'error') {
      error = msg.content.evalue || (msg.content.traceback || []).join('\n') || 'Unknown error';
    }
  };
  await future.done;
  return error;
}

const bioacousticIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 12 C2 12 4 6 6 6 C8 6 8 18 10 18 C12 18 12 3 14 3 C16 3 16 21 18 21 C20 21 22 12 22 12"/>
  <circle cx="12" cy="12" r="11" stroke-width="1"/>
</svg>`;

const bioacousticIcon = new LabIcon({
  name: 'jupyter-bioacoustic:icon',
  svgstr: bioacousticIconSvg,
});

export const bioacousticPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-bioacoustic:plugin',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  optional: [ILauncher, IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    launcher: ILauncher | null,
    defaultBrowser: IDefaultFileBrowser | null,
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

    app.commands.addCommand('bioacoustic:open-project', {
      label: 'Bioacoustic Annotator',
      icon: bioacousticIcon,
      execute: async () => {
        const browserPath = defaultBrowser?.model.path ?? '';
        const projectPath = await pickProjectFile(defaultBrowser, browserPath);
        if (!projectPath) return;

        const kernel = getExistingKernel(tracker) ?? await startKernel(app);
        if (!kernel) {
          window.alert('Failed to start a Python kernel.');
          return;
        }
        const ownsKernel = !getExistingKernel(tracker);

        const serverRoot = PageConfig.getOption('serverRoot');
        const workDir = browserPath
          ? serverRoot + '/' + browserPath
          : serverRoot;
        const relPath = browserPath && projectPath.startsWith(browserPath + '/')
          ? projectPath.substring(browserPath.length + 1)
          : projectPath;

        const error = await execInKernel(kernel, [
          `import os as _os`,
          `_os.chdir(_os.path.expanduser('${escPy(workDir)}'))`,
          `from jupyter_bioacoustic import BioacousticAnnotator`,
          `_ba = BioacousticAnnotator(project='${escPy(relPath)}')`,
          `_ba.setup()`,
        ].join('\n'));

        if (error) {
          if (ownsKernel) kernel.shutdown().catch(() => {});
          window.alert(`Bioacoustic Annotator error:\n${error}`);
          return;
        }

        const widget = new BioacousticWidget(
          tracker,
          ownsKernel ? kernel : undefined,
        );
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
      }
    });

    app.commands.addCommand('bioacoustic:launcher-dialog', {
      label: 'Bioacoustic Annotator',
      icon: bioacousticIcon,
      execute: () => {
        const browserPath = defaultBrowser?.model.path ?? '';
        const serverRoot = PageConfig.getOption('serverRoot');
        const cwd = browserPath
          ? `${serverRoot}/${browserPath}`
          : serverRoot;
        showLauncherDialog(
          () => app.commands.execute('bioacoustic:open-project'),
          () => app.commands.execute('bioacoustic:open-config-builder'),
          async () => {
            const kernel = getExistingKernel(tracker) ?? await startKernel(app);
            if (!kernel) { window.alert('Failed to start Python kernel.'); return; }
            const ownsKernel = !getExistingKernel(tracker);
            const code = [
              `import os as _os; _os.chdir(_os.path.expanduser('${escPy(cwd)}'))`,
              `from jupyter_bioacoustic.config_builder.notebook import copy_starter_notebook`,
              `import json; print(json.dumps(copy_starter_notebook('.')))`,
            ].join('\n');
            const future = kernel.requestExecute({ code });
            let result = '';
            future.onIOPub = (msg: any) => {
              if (msg.header?.msg_type === 'stream' && msg.content?.name === 'stdout') {
                result += msg.content.text;
              }
              if (msg.header?.msg_type === 'error') {
                result = '';
              }
            };
            await future.done;
            if (ownsKernel) kernel.shutdown().catch(() => {});
            if (result.trim()) {
              try {
                const parsed = JSON.parse(result.trim());
                const rel = parsed.relative || parsed.path;
                const nbPath = browserPath ? `${browserPath}/${rel}` : rel;
                app.commands.execute('docmanager:open', { path: nbPath });
              } catch { /* ignore parse errors */ }
            }
            if (defaultBrowser) {
              defaultBrowser.model.refresh();
            }
          },
        );
      }
    });

    palette.addItem({ command: 'bioacoustic:open', category: 'Bioacoustic' });
    palette.addItem({ command: 'bioacoustic:open-project', category: 'Bioacoustic' });
    palette.addItem({ command: 'bioacoustic:launcher-dialog', category: 'Bioacoustic' });

    if (launcher) {
      launcher.add({
        command: 'bioacoustic:launcher-dialog',
        category: 'Other',
      });
    }

    console.log('jupyter-bioacoustic activated');
  }
};

function showLauncherDialog(
  onAnnotator: () => void,
  onConfigBuilder: () => void,
  onNotebook: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;` +
    `background:rgba(0,0,0,0.55);`;

  const dialog = document.createElement('div');
  dialog.style.cssText =
    `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};border-radius:12px;` +
    `padding:24px 28px;display:flex;flex-direction:column;gap:16px;min-width:340px;` +
    `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);`;

  const title = document.createElement('div');
  title.textContent = 'Bioacoustic Annotator';
  title.style.cssText =
    `font-size:20px;font-weight:700;color:${COLORS.textPrimary};text-align:center;`;
  dialog.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Choose an option to get started';
  subtitle.style.cssText =
    `font-size:14px;color:${COLORS.textMuted};text-align:center;margin-top:-8px;`;
  dialog.appendChild(subtitle);

  const tileRow = document.createElement('div');
  tileRow.style.cssText = `display:flex;gap:12px;justify-content:center;`;

  const tiles: HTMLButtonElement[] = [];
  let focusedIdx = 0;

  const setFocused = (idx: number) => {
    focusedIdx = idx;
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].style.borderColor = i === idx ? COLORS.blue : COLORS.bgSurface1;
    }
  };

  const makeTile = (label: string, desc: string, iconSvg: string, onClick: () => void) => {
    const tile = document.createElement('button');
    tile.style.cssText =
      `background:${COLORS.bgMantle};border:2px solid ${COLORS.bgSurface1};border-radius:8px;` +
      `padding:16px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;` +
      `cursor:pointer;flex:1;min-width:130px;transition:border-color 0.15s;outline:none;`;
    tile.addEventListener('mouseenter', () => setFocused(tiles.indexOf(tile)));
    tile.addEventListener('mouseleave', () => setFocused(focusedIdx));

    const icon = document.createElement('div');
    icon.innerHTML = iconSvg;
    icon.style.cssText = `width:40px;height:40px;color:${COLORS.blue};`;
    icon.querySelector('svg')?.setAttribute('width', '40');
    icon.querySelector('svg')?.setAttribute('height', '40');

    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = `font-size:15px;font-weight:600;color:${COLORS.textPrimary};`;

    const d = document.createElement('div');
    d.textContent = desc;
    d.style.cssText = `font-size:12px;color:${COLORS.textMuted};text-align:center;line-height:1.4;`;

    tile.append(icon, lbl, d);
    tile.addEventListener('click', () => {
      overlay.remove();
      onClick();
    });
    tiles.push(tile);
    return tile;
  };

  const notebookSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16v16H4z"/>
    <path d="M8 4v16"/>
    <line x1="12" y1="8" x2="18" y2="8"/>
    <line x1="12" y1="12" x2="18" y2="12"/>
    <line x1="12" y1="16" x2="16" y2="16"/>
  </svg>`;

  tileRow.appendChild(makeTile(
    'Notebook',
    'Start with a pre-configured Jupyter notebook',
    notebookSvg,
    onNotebook,
  ));

  tileRow.appendChild(makeTile(
    'Annotator',
    'Open a project file to review and annotate clips',
    bioacousticIconSvg,
    onAnnotator,
  ));

  const builderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>`;

  tileRow.appendChild(makeTile(
    'Config Builder',
    'Create or edit configuration files with a GUI',
    builderSvg,
    onConfigBuilder,
  ));

  dialog.appendChild(tileRow);
  setFocused(0);

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocused((focusedIdx + 1) % tiles.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocused((focusedIdx - 1 + tiles.length) % tiles.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      tiles[focusedIdx].click();
    } else if (e.key === 'Escape') {
      overlay.remove();
    }
  });

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.tabIndex = -1;
  document.body.appendChild(overlay);
  overlay.focus();
}

export default bioacousticPlugin;
