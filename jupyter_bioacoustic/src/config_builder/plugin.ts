import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon } from '@jupyterlab/ui-components';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

import { COLORS, barBottomStyle, btnStyle, injectGlobalStyles } from '../styles';
import { KernelBridge } from '../kernel';
import { escPy, showDialog } from '../util';
import { ConfigPanel } from './ConfigPanel';
import { openAnnotatorFromProject } from './python';

let _builderCounter = 0;

class ConfigBuilderWidget extends Widget {
  private _kernelBridge: KernelBridge;
  private _ownedKernel: any;
  private _panel!: ConfigPanel;
  private _titleEl!: HTMLSpanElement;

  constructor(tracker: INotebookTracker, directKernel?: any, cwd?: string) {
    super();
    this._kernelBridge = new KernelBridge(
      directKernel ? null : tracker,
      directKernel,
      cwd,
    );
    this._ownedKernel = directKernel ?? null;
    this.id = `jp-config-builder-${_builderCounter++}`;
    this.title.label = 'Config Builder';
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

    header.append(this._titleEl, this._panel.statusEl);

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
    openBtn.textContent = 'Save & Open Annotator';
    openBtn.style.cssText = btnStyle(true) + `font-size:11px;`;
    openBtn.style.display = this._panel.isProjectConfigured ? '' : 'none';
    openBtn.addEventListener('click', () => void this._onSaveAndOpen());
    this._panel.onProjectStateChanged(() => {
      openBtn.style.display = this._panel.isProjectConfigured ? '' : 'none';
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = btnStyle() + `font-size:11px;`;
    dismissBtn.addEventListener('click', () => this._onDismiss());

    bottomBar.append(validateBtn, saveBtn, spacer, openBtn, dismissBtn);

    this.node.append(header, this._panel.element, bottomBar);
  }

  protected onAfterAttach(_msg: Message): void {
    super.onAfterAttach(_msg);
  }

  private async _onSaveAndOpen(): Promise<void> {
    const savedPath = await this._panel.saveAndOpenAnnotator();
    if (!savedPath) return;
    try {
      await this._panel.kernel.exec(openAnnotatorFromProject(savedPath));
    } catch (e: any) {
      void showDialog({ title: 'Annotator Error', body: String(e.message ?? e) });
      return;
    }
    this._ownedKernel = null;
    this.dispose();
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

function escPyLocal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function startKernel(app: JupyterFrontEnd): Promise<any | null> {
  try {
    return await app.serviceManager.kernels.startNew({ name: 'python3' });
  } catch (e) {
    console.error('config-builder: failed to start kernel', e);
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
    (window as any)._bioacousticOpenConfigBuilder = (divId: string) => {
      const container = document.getElementById(divId);
      if (!container) return;
      const widget = new ConfigBuilderWidget(tracker);
      widget.node.style.cssText += `position:absolute;inset:0;`;
      Widget.attach(widget, container);
    };

    app.commands.addCommand('bioacoustic:open-config-builder', {
      label: 'Bioacoustic Config Builder',
      icon: builderIcon,
      execute: async () => {
        const kernel = getExistingKernel(tracker) ?? await startKernel(app);
        if (!kernel) {
          void showDialog({ title: 'Error', body: 'Failed to start a Python kernel.' });
          return;
        }
        const ownsKernel = !getExistingKernel(tracker);

        const browserPath = fileBrowser?.model.path || '';
        const serverRoot = PageConfig.getOption('serverRoot');
        const cwd = browserPath
          ? `${serverRoot}/${browserPath}`
          : serverRoot;
        const error = await execInKernel(kernel, [
          `import os as _os`,
          `_os.chdir(_os.path.expanduser('${escPyLocal(cwd)}'))`,
          `from jupyter_bioacoustic.config_builder import ConfigBuilder`,
          `_cb = ConfigBuilder()`,
          `_cb.setup()`,
        ].join('\n'));

        if (error) {
          if (ownsKernel) kernel.shutdown().catch(() => {});
          void showDialog({ title: 'Config Builder Error', body: error });
          return;
        }

        const widget = new ConfigBuilderWidget(
          tracker,
          ownsKernel ? kernel : undefined,
          cwd,
        );
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
      }
    });

    palette.addItem({ command: 'bioacoustic:open-config-builder', category: 'Bioacoustic' });
  }
};
