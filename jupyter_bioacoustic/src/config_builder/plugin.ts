/**
 * The config builder's JupyterLab plugin: the "Bioacoustic Config Builder" command (main-area
 * widget on its own kernel), the inline opener used from notebooks
 * (``window._bioacousticOpenConfigBuilder``), and the widget shell around ConfigPanel (header
 * with cwd + status, bottom bar with Validate / Save / Open Annotator / Dismiss).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import type { Kernel } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';

import { COLORS, barBottomStyle, btnStyle, injectGlobalStyles } from '../styles';
import {
  KernelBridge, KernelSource, acquireKernel, execInKernel, notebookSession,
} from '../kernel';
import { errorMessage, showDialog, suppressNotebookShortcuts } from '../util';
import { ConfigPanel } from './ConfigPanel';
import { initBuilder, setupAnnotatorFromProject } from './python';


//
// Constants
//
const COMMAND_ID = 'bioacoustic:open-config-builder';

const builderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <line x1="10" y1="9" x2="8" y2="9"/>
</svg>`;

const builderIcon = new LabIcon({
  name: 'jupyter-bioacoustic:config-builder-icon',
  svgstr: builderIconSvg,
});


//
// Types
//
/** Globals shared with the annotator plugin and the notebook-side Python. */
interface BioacousticWindow {
  _bioacousticOpenConfigBuilder?: (divId: string) => void;
  _bioacousticOpenWithKernel?: (kernel: Kernel.IKernelConnection | null, inline: boolean) => void;
}


//
// Public
//
export const configBuilderPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-bioacoustic:config-builder',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  optional: [IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    fileBrowser: IDefaultFileBrowser | null,
  ) => {
    (window as BioacousticWindow)._bioacousticOpenConfigBuilder = (divId: string) => {
      const container = document.getElementById(divId);
      if (!container) return;
      const widget = new ConfigBuilderWidget({ session: notebookSession(tracker, container) });
      widget.node.style.cssText += `position:absolute;inset:0;`;
      suppressNotebookShortcuts(widget.node);
      Widget.attach(widget, container);
    };

    app.commands.addCommand(COMMAND_ID, {
      label: 'Bioacoustic Config Builder',
      icon: builderIcon,
      execute: () => _openBuilderCommand(app, tracker, fileBrowser),
    });

    palette.addItem({ command: COMMAND_ID, category: 'Bioacoustic' });
  }
};


//
// Internal
//
let _builderCounter = 0;


/** The builder command: start a kernel, initialise the builder there, open the widget. */
async function _openBuilderCommand(
  app: JupyterFrontEnd, tracker: INotebookTracker, fileBrowser: IDefaultFileBrowser | null,
): Promise<void> {
  const acquired = await acquireKernel(app, tracker);
  if (!acquired) {
    void showDialog({ title: 'Error', body: 'Failed to start a Python kernel.' });
    return;
  }
  const { kernel, owns: ownsKernel } = acquired;

  const browserPath = fileBrowser?.model.path || '';
  const serverRoot = PageConfig.getOption('serverRoot');
  const cwd = browserPath
    ? `${serverRoot}/${browserPath}`
    : serverRoot;
  const error = await execInKernel(kernel, initBuilder(cwd));

  if (error) {
    if (ownsKernel) kernel.shutdown().catch(() => {});
    void showDialog({ title: 'Config Builder Error', body: error });
    return;
  }

  const widget = new ConfigBuilderWidget(acquired.source, ownsKernel, cwd, browserPath);
  app.shell.add(widget, 'main');
  app.shell.activateById(widget.id);
}


/** The builder widget: header (title, cwd, status), ConfigPanel, bottom action bar. */
class ConfigBuilderWidget extends Widget {
  private _kernelBridge: KernelBridge;
  private _ownedKernel: Kernel.IKernelConnection | null;
  private _panel!: ConfigPanel;
  private _titleEl!: HTMLSpanElement;
  private _browserPath: string;

  /**
   * @param source - The kernel or notebook session this builder talks to (fixed for its lifetime).
   * @param ownsKernel - Shut ``source.kernel`` down when the builder is closed.
   * @param cwd - Kernel working directory the builder was opened in.
   * @param browserPath - File-browser path at open time (relative to the server root).
   */
  constructor(source: KernelSource, ownsKernel = false, cwd?: string, browserPath?: string) {
    super();
    this._kernelBridge = new KernelBridge(source, cwd);
    this._ownedKernel = ownsKernel ? source.kernel ?? null : null;
    this._browserPath = browserPath || '';
    this.id = `jp-config-builder-${_builderCounter++}`;
    this.title.label = 'Config Builder';
    this.title.closable = true;
    injectGlobalStyles();
    this._buildUI();
  }

  override dispose(): void {
    if (this._ownedKernel) {
      this._ownedKernel.shutdown().catch(() => {});
      this._ownedKernel = null;
    }
    super.dispose();
  }

  private _buildUI(): void {
    this.node.style.cssText =
      `display:flex;flex-direction:column;width:100%;height:100%;` +
      `background:${COLORS.bgBase};color:${COLORS.textPrimary};` +
      `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
      `overflow:hidden;box-sizing:border-box;`;

    const header = document.createElement('div');
    header.style.cssText = barBottomStyle();

    this._titleEl = document.createElement('span');
    this._titleEl.textContent = 'Config Builder';
    this._titleEl.style.cssText = `font-weight:700;font-size:13px;margin-right:6px;flex-shrink:0;`;

    this._panel = new ConfigPanel(this._kernelBridge);

    const initialCwd = this._kernelBridge.cwd || '.';
    let baseCwd = initialCwd;
    const cwdRelative = (p: string) => {
      if (p.startsWith(baseCwd + '/')) return p.slice(baseCwd.length + 1);
      if (p === baseCwd) return '.';
      return p.split('/').filter(Boolean).pop() || '.';
    };
    const cwdLabel = document.createElement('span');
    const displayPath = this._browserPath ? this._browserPath + '/' : '.';
    cwdLabel.textContent = displayPath;
    cwdLabel.title = initialCwd;
    this._panel.onCwdReady((cwd) => {
      baseCwd = cwd;
      cwdLabel.textContent = displayPath;
      cwdLabel.title = cwd;
    });
    cwdLabel.style.cssText =
      `font-size:11px;color:${COLORS.textMuted};font-family:monospace;cursor:pointer;` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto;` +
      `padding:2px 6px;border-radius:3px;`;
    cwdLabel.addEventListener('mouseenter', () => {
      cwdLabel.style.background = COLORS.bgSurface1;
    });
    cwdLabel.addEventListener('mouseleave', () => {
      cwdLabel.style.background = '';
    });
    const browseCwd = () => {
      this._panel.browseDirectory('.', (selectedDir) => {
        void (async () => {
          const newCwd = await this._panel.setCwd(selectedDir);
          if (newCwd) { cwdLabel.textContent = cwdRelative(newCwd); cwdLabel.title = newCwd; }
        })();
      });
    };
    cwdLabel.addEventListener('dblclick', browseCwd);

    const cwdBtn = document.createElement('button');
    cwdBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    cwdBtn.title = 'Change working directory';
    cwdBtn.style.cssText =
      `background:none;border:none;color:${COLORS.blue};opacity:0.6;cursor:pointer;` +
      `padding:2px 4px;display:inline-flex;align-items:center;flex-shrink:0;border-radius:3px;`;
    cwdBtn.addEventListener('mouseenter', () => { cwdBtn.style.opacity = '0.85'; });
    cwdBtn.addEventListener('mouseleave', () => { cwdBtn.style.opacity = '0.6'; });
    cwdBtn.addEventListener('click', browseCwd);

    header.append(this._titleEl, cwdLabel, cwdBtn, this._panel.statusEl);

    const bottomBar = document.createElement('div');
    bottomBar.style.cssText =
      `display:flex;gap:8px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-top:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    const validateBtn = document.createElement('button');
    validateBtn.textContent = 'Validate';
    validateBtn.style.cssText = btnStyle() + `font-size:11px;`;
    validateBtn.addEventListener('click', () => void this._panel.validate());

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Configuration Files';
    saveBtn.style.cssText = btnStyle() + `font-size:11px;`;
    saveBtn.addEventListener('click', () => void this._panel.saveToFile());

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open Annotator';
    openBtn.style.cssText = btnStyle(true) + `font-size:11px;`;
    openBtn.style.display = this._panel.isProjectConfigured ? '' : 'none';
    openBtn.addEventListener('click', () => void this._onSaveAndOpen());
    this._panel.onAnyChanged(() => {
      const ready = this._panel.isProjectConfigured;
      openBtn.style.display = ready ? '' : 'none';
      openBtn.textContent = this._panel.dirty ? 'Save & Open Annotator' : 'Open Annotator';
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = btnStyle() + `font-size:11px;`;
    dismissBtn.addEventListener('click', () => this._onDismiss());

    bottomBar.append(validateBtn, saveBtn, spacer, openBtn, dismissBtn);

    this.node.append(header, this._panel.element, bottomBar);
  }

  private async _onSaveAndOpen(): Promise<void> {
    const savedPath = this._panel.dirty
      ? await this._panel.saveAndOpenAnnotator()
      : await this._panel.validateAndOpen();
    if (!savedPath) return;
    try {
      await this._panel.kernel.exec(setupAnnotatorFromProject(savedPath));
    } catch (e: unknown) {
      void showDialog({ title: 'Annotator Error', body: errorMessage(e) });
      return;
    }
    const openFn = (window as BioacousticWindow)._bioacousticOpenWithKernel;
    if (openFn) {
      openFn(this._kernelBridge.activeKernel, false);
    }
  }

  private async _onDismiss(): Promise<void> {
    if (this._panel.dirty) {
      const choice = await showDialog({
        title: 'Unsaved Changes',
        body: 'You have unsaved changes. Dismiss anyway?',
        buttons: [
          { label: 'Cancel' },
          { label: 'Dismiss', primary: true },
        ],
      });
      if (choice !== 'Dismiss') return;
    }
    this.dispose();
  }
}
