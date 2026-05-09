import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { FileDialog, IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon } from '@jupyterlab/ui-components';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

import { COLORS, barBottomStyle, btnStyle, injectGlobalStyles } from '../styles';
import { KernelBridge } from '../kernel';
import {
  readBuilderVars,
  sendMessage,
  updateConfigFromYaml,
  saveConfig,
  getDefaultSavePath,
  checkFileExists,
  checkApiKey,
  setApiKey,
  extractJson,
} from './python';
import { escPy } from '../util';
import { ChatPanel } from './ChatPanel';
import { ConfigPreview } from './ConfigPreview';

let _builderCounter = 0;

class BuilderWidget extends Widget {
  private _kernelBridge: KernelBridge;
  private _ownedKernel: any;

  private _titleEl!: HTMLSpanElement;
  private _statusEl!: HTMLSpanElement;
  private _chat!: ChatPanel;
  private _preview!: ConfigPreview;

  private _dirty = false;
  private _savedPath = '';

  constructor(tracker: INotebookTracker, directKernel?: any) {
    super();
    this._kernelBridge = new KernelBridge(
      directKernel ? null : tracker,
      directKernel,
    );
    this._ownedKernel = directKernel ?? null;
    this.id = `jp-builder-${_builderCounter++}`;
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

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `flex:1;text-align:right;font-size:11px;color:${COLORS.green};` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    this._statusEl.textContent = 'Loading…';

    header.append(this._titleEl, this._statusEl);

    const body = document.createElement('div');
    body.style.cssText = `display:flex;flex:1;overflow:hidden;`;

    this._chat = new ChatPanel();
    this._preview = new ConfigPreview();

    this._chat.messageSent.connect((_, text) => void this._onSendMessage(text));
    this._preview.configEdited.connect((_, yaml) => void this._onConfigEdited(yaml));

    body.append(this._chat.element, this._preview.element);

    const bottomBar = document.createElement('div');
    bottomBar.style.cssText =
      `display:flex;gap:8px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-top:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    const previewToggle = document.createElement('button');
    previewToggle.textContent = 'Toggle Config';
    previewToggle.style.cssText = btnStyle() + `font-size:11px;`;
    previewToggle.addEventListener('click', () => this._preview.toggle());

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Config';
    saveBtn.style.cssText = btnStyle() + `font-size:11px;`;
    saveBtn.addEventListener('click', () => void this._onSaveConfig());

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load Existing';
    loadBtn.style.cssText = btnStyle() + `font-size:11px;`;
    loadBtn.addEventListener('click', () => void this._onLoadExisting());

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = btnStyle() + `font-size:11px;`;
    dismissBtn.addEventListener('click', () => this._onDismiss());

    bottomBar.append(previewToggle, saveBtn, loadBtn, spacer, dismissBtn);

    this.node.append(header, body, bottomBar);
  }

  protected onAfterAttach(_msg: Message): void {
    super.onAfterAttach(_msg);
    void this._init();
  }

  private async _promptApiKey(envVar: string, provider: string): Promise<boolean> {
    const value = window.prompt(
      `Enter your ${provider.toUpperCase()} API key (${envVar}):`,
    );
    if (!value) return false;
    try {
      await this._kernelBridge.exec(setApiKey(envVar, value.trim()));
      return true;
    } catch {
      return false;
    }
  }

  private async _init(): Promise<void> {
    this._setStatus('Reading builder state…');
    try {
      const keyRaw = await this._kernelBridge.exec(checkApiKey());
      const keyState = JSON.parse(extractJson(keyRaw));
      if (!keyState.ok) {
        const ok = await this._promptApiKey(keyState.env_var, keyState.provider);
        if (!ok) {
          this._setStatus('API key required', true);
          this._chat.addMessage({
            role: 'system',
            content: `API key (${keyState.env_var}) is required. Click a message to retry.`,
          });
          return;
        }
      }

      const raw = await this._kernelBridge.exec(readBuilderVars());
      const state = JSON.parse(extractJson(raw));

      this._dirty = !!state.dirty;
      this._savedPath = state.saved_path || '';

      if (state.config) {
        this._preview.updateConfig(state.config, state.config_type);
      }

      const messages = JSON.parse(state.messages || '[]') as Array<{role: string; content: string}>;
      if (messages.length > 0) {
        for (const m of messages) {
          this._chat.addMessage({ role: m.role as any, content: m.content });
        }
      }

      this._chat.addMessage({
        role: 'assistant',
        content: state.welcome || 'Hello! What would you like to build?',
      });

      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
    }
  }

  private async _ensureApiKey(): Promise<boolean> {
    try {
      const keyRaw = await this._kernelBridge.exec(checkApiKey());
      const keyState = JSON.parse(extractJson(keyRaw));
      if (!keyState.ok) {
        return await this._promptApiKey(keyState.env_var, keyState.provider);
      }
    } catch { /* proceed */ }
    return true;
  }

  private async _onSendMessage(text: string): Promise<void> {
    this._chat.addMessage({ role: 'user', content: text });
    this._chat.setLoading(true);
    this._setStatus('Thinking…');

    try {
      if (!await this._ensureApiKey()) {
        this._chat.addMessage({ role: 'system', content: 'API key required.' });
        this._setStatus('API key required', true);
        return;
      }
      const raw = await this._kernelBridge.exec(sendMessage(text));
      const state = JSON.parse(extractJson(raw));

      this._dirty = !!state.dirty;
      this._savedPath = state.saved_path || '';

      if (state.config) {
        this._preview.updateConfig(state.config, state.config_type);
      }

      this._chat.addMessage({ role: 'assistant', content: state.response });
      this._setStatus('Ready');
    } catch (e: any) {
      this._chat.addMessage({
        role: 'system',
        content: `Error: ${String(e.message ?? e)}`,
      });
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
    } finally {
      this._chat.setLoading(false);
    }
  }

  private async _onConfigEdited(yaml: string): Promise<void> {
    this._setStatus('Applying edits…');
    try {
      const raw = await this._kernelBridge.exec(updateConfigFromYaml(yaml));
      const state = JSON.parse(extractJson(raw));

      if (state.update_ok) {
        this._dirty = !!state.dirty;
        this._preview.updateConfig(state.config, state.config_type);
        this._chat.addMessage({
          role: 'system',
          content: 'Config updated from manual edit.',
        });
        this._setStatus('Config updated');
      } else {
        this._setStatus('❌ Invalid YAML', true);
      }
    } catch (e: any) {
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
    }
  }

  private async _onSaveConfig(): Promise<void> {
    try {
      const defRaw = await this._kernelBridge.exec(getDefaultSavePath());
      const defPath = JSON.parse(extractJson(defRaw)).path as string;

      const chosen = window.prompt('Save config as:', this._savedPath || defPath);
      if (!chosen) return;
      const savePath = chosen.trim();

      try {
        const existsRaw = await this._kernelBridge.exec(checkFileExists(savePath));
        const exists = JSON.parse(extractJson(existsRaw)).exists as boolean;
        if (exists) {
          const ok = window.confirm(`${savePath} already exists. Overwrite?`);
          if (!ok) return;
        }
      } catch { /* proceed */ }

      this._setStatus('Saving…');
      const raw = await this._kernelBridge.exec(saveConfig(savePath));
      const state = JSON.parse(extractJson(raw));
      this._dirty = false;
      this._savedPath = state.saved_to || savePath;
      this._setStatus(`✓ Saved: ${this._savedPath}`);
      this._chat.addMessage({
        role: 'system',
        content: `Config saved to \`${this._savedPath}\``,
      });
    } catch (e: any) {
      this._setStatus(`❌ Save failed: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onLoadExisting(): Promise<void> {
    const path = window.prompt('Path to existing config file:');
    if (!path) return;

    this._chat.addMessage({
      role: 'user',
      content: `Load and continue editing: ${path.trim()}`,
    });
    this._chat.setLoading(true);
    this._setStatus('Loading…');

    try {
      const raw = await this._kernelBridge.exec(sendMessage(
        `I want to load and edit the existing config at "${path.trim()}". ` +
        `Please read it, set it as the current config, and summarize what it contains.`
      ));
      const state = JSON.parse(extractJson(raw));
      this._dirty = !!state.dirty;
      this._savedPath = state.saved_path || '';
      if (state.config) {
        this._preview.updateConfig(state.config, state.config_type);
        this._preview.expand();
      }
      this._chat.addMessage({ role: 'assistant', content: state.response });
      this._setStatus('Ready');
    } catch (e: any) {
      this._chat.addMessage({
        role: 'system',
        content: `Error loading: ${String(e.message ?? e)}`,
      });
      this._setStatus(`❌ ${String(e.message ?? e)}`, true);
    } finally {
      this._chat.setLoading(false);
    }
  }

  private _onDismiss(): void {
    if (this._dirty) {
      const ok = window.confirm('You have unsaved changes. Dismiss anyway?');
      if (!ok) return;
    }
    this.dispose();
  }

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : COLORS.green;
  }
}

function escPyLocal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function startKernel(app: JupyterFrontEnd): Promise<any | null> {
  try {
    return await app.serviceManager.kernels.startNew({ name: 'python3' });
  } catch (e) {
    console.error('builder: failed to start kernel', e);
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
  name: 'jupyter-bioacoustic:builder-icon',
  svgstr: builderIconSvg,
});

export const builderPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-bioacoustic:builder',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  optional: [ILauncher, IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    launcher: ILauncher | null,
    _defaultBrowser: IDefaultFileBrowser | null,
  ) => {
    (window as any)._bioacousticOpenBuilder = (divId: string) => {
      const container = document.getElementById(divId);
      if (!container) return;
      const widget = new BuilderWidget(tracker);
      widget.node.style.cssText += `position:absolute;inset:0;`;
      Widget.attach(widget, container);
    };

    app.commands.addCommand('bioacoustic:open-builder', {
      label: 'Config Builder',
      icon: builderIcon,
      execute: async () => {
        const kernel = getExistingKernel(tracker) ?? await startKernel(app);
        if (!kernel) {
          window.alert('Failed to start a Python kernel.');
          return;
        }
        const ownsKernel = !getExistingKernel(tracker);

        const serverRoot = PageConfig.getOption('serverRoot');
        const error = await execInKernel(kernel, [
          `import os as _os`,
          `_os.chdir(_os.path.expanduser('${escPyLocal(serverRoot)}'))`,
          `from jupyter_bioacoustic.builder import AnnotatorBuilder`,
          `_ab = AnnotatorBuilder()`,
          `_ab.setup()`,
        ].join('\n'));

        if (error) {
          if (ownsKernel) kernel.shutdown().catch(() => {});
          window.alert(`Config Builder error:\n${error}`);
          return;
        }

        const widget = new BuilderWidget(
          tracker,
          ownsKernel ? kernel : undefined,
        );
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
      }
    });

    palette.addItem({ command: 'bioacoustic:open-builder', category: 'Bioacoustic' });

    if (launcher) {
      launcher.add({
        command: 'bioacoustic:open-builder',
        category: 'Other',
      });
    }
  }
};
