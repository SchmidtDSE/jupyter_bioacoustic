import { COLORS, btnStyle } from '../styles';
import { KernelBridge } from '../kernel';
import {
  extractJson,
  updateSection,
  readColumns,
  updateConfigFromYaml,
  saveConfig,
  getDefaultSavePath,
  checkFileExists,
  listFiles,
} from './python';
import { YamlPanel } from './YamlPanel';
import { ProjectSection } from './sections/ProjectSection';
import { DataSection } from './sections/DataSection';
import { AudioSection } from './sections/AudioSection';
import { OutputSection } from './sections/OutputSection';
import { AppSection } from './sections/AppSection';
import { FormSection } from './sections/FormSection';
import { CollapsibleSection } from './sections/CollapsibleSection';

export class ConfigPanel {
  readonly element: HTMLDivElement;

  private _kernel: KernelBridge;
  private _yamlPanel: YamlPanel;
  private _statusEl: HTMLSpanElement;
  private _sections: Map<string, CollapsibleSection>;
  private _yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };
  private _dirty = false;
  private _savedPath = '';

  private _project: ProjectSection;
  private _data: DataSection;
  private _audio: AudioSection;
  private _output: OutputSection;
  private _app: AppSection;
  private _form: FormSection;

  constructor(kernel: KernelBridge) {
    this._kernel = kernel;

    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex:1;overflow:hidden;`;

    const left = document.createElement('div');
    left.style.cssText =
      `display:flex;flex-direction:column;flex:1;overflow-y:auto;min-width:0;`;

    this._project = new ProjectSection();
    this._data = new DataSection();
    this._audio = new AudioSection();
    this._output = new OutputSection();
    this._app = new AppSection();
    this._form = new FormSection();

    this._sections = new Map<string, CollapsibleSection>([
      ['project', this._project],
      ['data', this._data],
      ['audio', this._audio],
      ['output', this._output],
      ['app', this._app],
      ['form', this._form],
    ]);

    for (const [name, section] of this._sections) {
      section.focused.connect(() => this._onSectionFocused(name));
      section.changed.connect(() => void this._onSectionChanged(name));
      left.appendChild(section.element);
    }

    this._data.fileLoadRequested.connect((_, path) => void this._onLoadColumns(path));
    this._data.columnsLoaded.connect((_, cols) => {
      this._app.setColumnOptions(cols);
      this._audio.setColumnOptions(cols);
    });

    this._yamlPanel = new YamlPanel();
    this._yamlPanel.configEdited.connect((_, { yaml, configType }) => {
      void this._onYamlEdited(yaml, configType);
    });

    this.element.append(left, this._yamlPanel.element);

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText =
      `font-size:11px;color:${COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
  }

  get statusEl(): HTMLSpanElement {
    return this._statusEl;
  }

  private _onSectionFocused(name: string): void {
    this._yamlPanel.showForSection(name, this._yamls);
  }

  private async _onSectionChanged(sectionName: string): Promise<void> {
    const section = this._sections.get(sectionName);
    if (!section) return;

    const data = section.getData();
    this._setStatus('Updating…');

    try {
      const raw = await this._kernel.exec(updateSection(sectionName, data));
      const state = JSON.parse(extractJson(raw));
      this._applyState(state);
      this._setStatus('Ready');
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onLoadColumns(pathOrDir: string): Promise<void> {
    this._setStatus('Loading columns…');
    try {
      const raw = await this._kernel.exec(readColumns(pathOrDir));
      const result = JSON.parse(extractJson(raw));
      const cols = result.columns as string[];
      this._data.setDetectedColumns(cols);
      this._setStatus(`${cols.length} columns loaded`);
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  private async _onYamlEdited(yaml: string, configType: string): Promise<void> {
    this._setStatus('Applying edits…');
    try {
      const raw = await this._kernel.exec(updateConfigFromYaml(yaml, configType));
      const state = JSON.parse(extractJson(raw));
      if (state.update_ok) {
        this._applyState(state);
        this._setStatus('Config updated');
      } else {
        this._setStatus('Invalid YAML', true);
      }
    } catch (e: any) {
      this._setStatus(`Error: ${String(e.message ?? e)}`, true);
    }
  }

  async saveToFile(): Promise<void> {
    try {
      const defRaw = await this._kernel.exec(getDefaultSavePath());
      const defPath = JSON.parse(extractJson(defRaw)).path as string;

      const chosen = window.prompt('Save config as:', this._savedPath || defPath);
      if (!chosen) return;
      const savePath = chosen.trim();

      try {
        const existsRaw = await this._kernel.exec(checkFileExists(savePath));
        const exists = JSON.parse(extractJson(existsRaw)).exists as boolean;
        if (exists) {
          const ok = window.confirm(`${savePath} already exists. Overwrite?`);
          if (!ok) return;
        }
      } catch { /* proceed */ }

      this._setStatus('Saving…');
      const configType = this._yamlPanel.configType;
      const raw = await this._kernel.exec(saveConfig(savePath, configType));
      const state = JSON.parse(extractJson(raw));
      this._dirty = false;
      this._savedPath = state.saved_to || savePath;
      this._setStatus(`Saved: ${this._savedPath}`);
    } catch (e: any) {
      this._setStatus(`Save failed: ${String(e.message ?? e)}`, true);
    }
  }

  private _applyState(state: any): void {
    this._yamls = {
      project_yaml: state.project_yaml || '',
      config_yaml: state.config_yaml || '',
      form_yaml: state.form_yaml || '',
    };
    this._dirty = !!state.dirty;
    this._savedPath = state.saved_path || '';
    this._yamlPanel.updateYaml(this._yamls);

    if (state.project) {
      this._project.setData(state.project);
      if (state.project.data && typeof state.project.data === 'object') {
        this._data.setData(state.project.data);
      }
      if (state.project.audio && typeof state.project.audio === 'object') {
        this._audio.setData(state.project.audio);
      }
      if (state.project.output && typeof state.project.output === 'object') {
        this._output.setData(state.project.output);
      }
      this._app.setData(state.project);
    }
    if (state.form_config && typeof state.form_config === 'object') {
      this._form.setData(state.form_config);
    }
  }

  get dirty(): boolean {
    return this._dirty;
  }

  private _setStatus(msg: string, error = false): void {
    this._statusEl.textContent = msg;
    this._statusEl.style.color = error ? COLORS.red : COLORS.green;
  }
}
