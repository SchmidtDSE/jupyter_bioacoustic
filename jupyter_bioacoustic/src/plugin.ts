/**
 * The annotator's JupyterLab plugin: registers the commands, palette and launcher items,
 * and the ``window`` hooks Python uses to open a ``BioacousticWidget``.
 *
 * Ways an annotator opens:
 * - Python ``BioacousticAnnotator.open()`` -> ``window._bioacousticOpenInline`` (in the output
 *   cell) or ``window._bioacousticOpenWithKernel`` (as a tab);
 * - command ``bioacoustic:open-project`` -> pick a project file, set it up in a kernel, open;
 * - command ``bioacoustic:launcher-dialog`` -> the Notebook / Annotator / Builder chooser.
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
import { ILauncher } from '@jupyterlab/launcher';
import { INotebookTracker } from '@jupyterlab/notebook';
import type { Kernel } from '@jupyterlab/services';
import { Widget } from '@lumino/widgets';

import { BioacousticWidget } from './BioacousticWidget';
import { showLauncherDialog } from './dialogs/launcherDialog';
import { pickProjectFile } from './dialogs/projectPicker';
import { bioacousticIcon } from './icons';
import { KernelBridge, acquireKernel, execInKernel, notebookSession } from './kernel';
import { copyStarterNotebook, openProjectInKernel } from './python';
import { COLORS } from './styles';
import { DIALOG } from './text';
import { showDialog, suppressNotebookShortcuts } from './util';


//
// Constants
//
const CMD_OPEN = 'bioacoustic:open';
const CMD_OPEN_PROJECT = 'bioacoustic:open-project';
const CMD_LAUNCHER_DIALOG = 'bioacoustic:launcher-dialog';
const CMD_OPEN_CONFIG_BUILDER = 'bioacoustic:open-config-builder';
const PALETTE_CATEGORY = 'Bioacoustic';
const LOADING_FILL_STYLE_ID = 'jba-fill-style';

/** Makes loading-placeholder ids unique: ``jp-bioacoustic-loading-<n>``. */
let loadingCounter = 0;


//
// Types
//
declare global {
  interface Window {
    /** The JupyterLab app (used by the Python side's JavaScript). */
    _bioacousticApp?: JupyterFrontEnd;
    /** Mount an annotator inside the output ``<div id=divId>`` of the calling notebook. */
    _bioacousticOpenInline?: (divId: string) => void;
    /** Open an annotator tab on ``kernel`` (shut down on close when ``ownsKernel``). */
    _bioacousticOpenWithKernel?: (kernel: Kernel.IKernelConnection, ownsKernel?: boolean) => void;
  }
}


//
// Public
//
/** The annotator plugin (registered from ``index.ts``). */
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
    _registerWindowHooks(app, tracker);

    app.commands.addCommand(CMD_OPEN, {
      label: 'Open Bioacoustic Reviewer',
      execute: () => {
        const widget = new BioacousticWidget({ session: notebookSession(tracker) });
        app.shell.add(widget, 'main', { mode: 'split-right' });
        app.shell.activateById(widget.id);
      },
    });

    app.commands.addCommand(CMD_OPEN_PROJECT, {
      label: 'Bioacoustic Annotator',
      icon: bioacousticIcon,
      execute: () => _openProject(app, tracker, defaultBrowser),
    });

    app.commands.addCommand(CMD_LAUNCHER_DIALOG, {
      label: 'Bioacoustic Annotator',
      icon: bioacousticIcon,
      execute: () => {
        showLauncherDialog({
          onNotebook: () => void _openStarterNotebook(app, tracker, defaultBrowser),
          onAnnotator: () => void app.commands.execute(CMD_OPEN_PROJECT),
          onConfigBuilder: () => void app.commands.execute(CMD_OPEN_CONFIG_BUILDER),
        });
      },
    });

    for (const command of [CMD_OPEN, CMD_OPEN_PROJECT, CMD_LAUNCHER_DIALOG]) {
      palette.addItem({ command, category: PALETTE_CATEGORY });
    }
    launcher?.add({ command: CMD_LAUNCHER_DIALOG, category: 'Other' });
  },
};


//
// Internal
//
/** Install the ``window._bioacoustic*`` hooks the Python side calls to open a widget. */
function _registerWindowHooks(app: JupyterFrontEnd, tracker: INotebookTracker): void {
  window._bioacousticApp = app;

  window._bioacousticOpenInline = (divId: string) => {
    const container = document.getElementById(divId);
    if (!container) return;
    const widget = new BioacousticWidget({ session: notebookSession(tracker, container) });
    widget.node.style.cssText += `position:absolute;inset:0;`;
    suppressNotebookShortcuts(widget.node);
    Widget.attach(widget, container);
  };

  window._bioacousticOpenWithKernel = (kernel, ownsKernel = true) => {
    const widget = new BioacousticWidget({ kernel }, ownsKernel);
    app.shell.add(widget, 'main');
    app.shell.activateById(widget.id);
  };
}


/** The kernel cwd for the file browser's directory (absolute, server-side). */
function _serverDir(browserPath: string): string {
  const serverRoot = PageConfig.getOption('serverRoot');
  return browserPath ? `${serverRoot}/${browserPath}` : serverRoot;
}


/**
 * ``bioacoustic:open-project``: pick a project file, set it up in the focused notebook's
 * kernel (or a new one), then open the annotator on it. A loading tab shows meanwhile.
 */
async function _openProject(
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  browser: IDefaultFileBrowser | null,
): Promise<void> {
  const browserPath = browser?.model.path ?? '';
  const projectPath = await pickProjectFile(browser, browserPath);
  if (!projectPath) return;

  const placeholder = _createLoadingWidget();
  app.shell.add(placeholder, 'main');
  app.shell.activateById(placeholder.id);

  const acquired = await acquireKernel(app, tracker);
  if (!acquired) {
    placeholder.dispose();
    void showDialog({ title: 'Error', body: DIALOG.kernelFailed });
    return;
  }
  const { kernel, owns: ownsKernel } = acquired;

  const relPath = browserPath && projectPath.startsWith(browserPath + '/')
    ? projectPath.substring(browserPath.length + 1)
    : projectPath;
  const error = await execInKernel(kernel, openProjectInKernel(_serverDir(browserPath), relPath));
  placeholder.dispose();

  if (error) {
    if (ownsKernel) kernel.shutdown().catch(() => {});
    void showDialog({ title: DIALOG.annotatorErrorTitle, body: error });
    return;
  }

  const widget = new BioacousticWidget(acquired.source, ownsKernel);
  app.shell.add(widget, 'main');
  app.shell.activateById(widget.id);
}


/**
 * The launcher's "Notebook" tile: copy the starter notebook into the file browser's
 * directory and open it. Failures are silent (the browser is refreshed either way).
 */
async function _openStarterNotebook(
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  browser: IDefaultFileBrowser | null,
): Promise<void> {
  const browserPath = browser?.model.path ?? '';
  const acquired = await acquireKernel(app, tracker);
  if (!acquired) {
    void showDialog({ title: 'Error', body: DIALOG.kernelFailed });
    return;
  }
  const { kernel, owns: ownsKernel } = acquired;
  let result = '';
  try {
    result = await new KernelBridge({ kernel }).exec(copyStarterNotebook(_serverDir(browserPath)));
  } catch { /* copy failed: nothing to open */ }
  if (ownsKernel) kernel.shutdown().catch(() => {});
  if (result) {
    try {
      const parsed = JSON.parse(result);
      const rel = parsed.relative || parsed.path;
      const nbPath = browserPath ? `${browserPath}/${rel}` : rel;
      void app.commands.execute('docmanager:open', { path: nbPath });
    } catch { /* ignore parse errors */ }
  }
  if (browser) void browser.model.refresh();
}


/** A placeholder tab with a filling progress bar, shown while a project loads. */
function _createLoadingWidget(): Widget {
  const w = new Widget();
  w.id = `jp-bioacoustic-loading-${loadingCounter++}`;
  w.title.label = 'Bioacoustic Annotator';
  w.title.closable = true;
  w.title.icon = bioacousticIcon;
  w.node.style.cssText =
    `display:flex;align-items:center;justify-content:center;` +
    `width:100%;height:100%;background:${COLORS.bgBase};`;

  const wrap = document.createElement('div');
  wrap.style.cssText = `text-align:center;`;

  const label = document.createElement('div');
  label.textContent = 'Loading…';
  label.style.cssText =
    `color:${COLORS.textSubtle};font-size:14px;letter-spacing:0.5px;margin-bottom:14px;` +
    `font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);`;

  const track = document.createElement('div');
  track.style.cssText =
    `width:240px;height:3px;background:${COLORS.bgSurface0};` +
    `border-radius:2px;overflow:hidden;margin:0 auto;`;

  const bar = document.createElement('div');
  bar.style.cssText =
    `width:0%;height:100%;background:${COLORS.blue};border-radius:2px;` +
    `animation:jba-fill 10s ease-out forwards;`;

  if (!document.getElementById(LOADING_FILL_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = LOADING_FILL_STYLE_ID;
    style.textContent = '@keyframes jba-fill{to{width:100%}}';
    document.head.appendChild(style);
  }

  track.appendChild(bar);
  wrap.append(label, track);
  w.node.appendChild(wrap);
  return w;
}
