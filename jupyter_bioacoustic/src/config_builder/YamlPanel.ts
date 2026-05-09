import { Signal } from '@lumino/signaling';
import { COLORS, btnStyle, inputStyle } from '../styles';

export class YamlPanel {
  readonly element: HTMLDivElement;
  readonly configEdited = new Signal<this, { yaml: string; configType: string }>(this);

  private _expanded = true;
  private _editing = false;
  private _configType = 'project';

  private _toggleBtn: HTMLButtonElement;
  private _content: HTMLDivElement;
  private _display: HTMLPreElement;
  private _editor: HTMLTextAreaElement;
  private _editBtn: HTMLButtonElement;
  private _saveBtn: HTMLButtonElement;
  private _cancelBtn: HTMLButtonElement;
  private _editBar: HTMLDivElement;
  private _typeLabel: HTMLSpanElement;
  private _tabBar: HTMLDivElement;
  private _tabs: Map<string, HTMLButtonElement> = new Map();

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;width:350px;overflow:hidden;` +
      `border-left:1px solid ${COLORS.bgSurface0};transition:width 0.2s ease;flex-shrink:0;`;

    const header = document.createElement('div');
    header.style.cssText =
      `display:flex;align-items:center;gap:6px;padding:6px 10px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._toggleBtn.textContent = 'YAML ▶';
    this._toggleBtn.addEventListener('click', () => this.toggle());

    this._typeLabel = document.createElement('span');
    this._typeLabel.style.cssText = `font-size:11px;color:${COLORS.textMuted};flex:1;`;
    this._typeLabel.textContent = 'project';

    this._editBtn = document.createElement('button');
    this._editBtn.textContent = 'Edit';
    this._editBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._editBtn.addEventListener('click', () => this._startEdit());

    header.append(this._toggleBtn, this._typeLabel, this._editBtn);

    this._tabBar = document.createElement('div');
    this._tabBar.style.cssText =
      `display:flex;gap:0;background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    for (const t of ['project', 'config', 'form_config']) {
      const btn = document.createElement('button');
      btn.textContent = t === 'form_config' ? 'form' : t;
      btn.style.cssText =
        `flex:1;padding:4px 8px;font-size:11px;border:none;cursor:pointer;` +
        `background:${t === 'project' ? COLORS.bgSurface0 : 'transparent'};` +
        `color:${t === 'project' ? COLORS.textPrimary : COLORS.textMuted};`;
      btn.addEventListener('click', () => this._switchTab(t));
      this._tabs.set(t, btn);
      this._tabBar.appendChild(btn);
    }

    this._content = document.createElement('div');
    this._content.style.cssText = `flex:1;overflow:auto;position:relative;`;

    this._display = document.createElement('pre');
    this._display.style.cssText =
      `margin:0;padding:10px;font-size:12px;line-height:1.6;font-family:monospace;` +
      `color:${COLORS.textPrimary};white-space:pre-wrap;word-wrap:break-word;` +
      `background:${COLORS.bgMantle};`;
    this._display.textContent = '# (empty)';

    this._editor = document.createElement('textarea');
    this._editor.style.cssText =
      inputStyle() +
      `width:100%;height:100%;box-sizing:border-box;resize:none;font-family:monospace;` +
      `font-size:12px;line-height:1.6;padding:10px;display:none;border:none;border-radius:0;` +
      `position:absolute;inset:0;`;

    this._editBar = document.createElement('div');
    this._editBar.style.cssText =
      `display:none;gap:6px;padding:6px 10px;` +
      `background:${COLORS.bgMantle};border-top:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    this._saveBtn = document.createElement('button');
    this._saveBtn.textContent = 'Apply';
    this._saveBtn.style.cssText = btnStyle() + `font-size:11px;`;
    this._saveBtn.addEventListener('click', () => this._applyEdit());

    this._cancelBtn = document.createElement('button');
    this._cancelBtn.textContent = 'Cancel';
    this._cancelBtn.style.cssText = btnStyle() + `font-size:11px;`;
    this._cancelBtn.addEventListener('click', () => this._cancelEdit());

    this._editBar.append(this._saveBtn, this._cancelBtn);

    this._content.append(this._display, this._editor);
    this.element.append(header, this._tabBar, this._content, this._editBar);
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this.element.style.width = this._expanded ? '350px' : '0';
    this._toggleBtn.textContent = this._expanded ? 'YAML ▶' : '◀ YAML';
  }

  get configType(): string {
    return this._configType;
  }

  private _switchTab(tab: string): void {
    this._configType = tab;
    this._typeLabel.textContent = tab;
    for (const [t, btn] of this._tabs) {
      btn.style.background = t === tab ? COLORS.bgSurface0 : 'transparent';
      btn.style.color = t === tab ? COLORS.textPrimary : COLORS.textMuted;
    }
    if (this._editing) this._cancelEdit();
  }

  updateYaml(yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
    this._updateDisplay(yamls);
  }

  showForSection(section: string, yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
    if (section === 'form') {
      this._switchTab('form_config');
    } else {
      this._switchTab('project');
    }
    this._updateDisplay(yamls);
  }

  private _updateDisplay(yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
    let yaml = '';
    if (this._configType === 'project') yaml = yamls.project_yaml;
    else if (this._configType === 'config') yaml = yamls.config_yaml;
    else if (this._configType === 'form_config') yaml = yamls.form_yaml;
    this._display.textContent = yaml || '# (empty)';
  }

  private _startEdit(): void {
    this._editing = true;
    this._editor.value = this._display.textContent || '';
    this._editor.style.display = 'block';
    this._display.style.display = 'none';
    this._editBar.style.display = 'flex';
    this._editBtn.style.display = 'none';
    this._editor.focus();
  }

  private _applyEdit(): void {
    const yaml = this._editor.value;
    this._editing = false;
    this._editor.style.display = 'none';
    this._display.style.display = 'block';
    this._editBar.style.display = 'none';
    this._editBtn.style.display = '';
    this.configEdited.emit({ yaml, configType: this._configType });
  }

  private _cancelEdit(): void {
    this._editing = false;
    this._editor.style.display = 'none';
    this._display.style.display = 'block';
    this._editBar.style.display = 'none';
    this._editBtn.style.display = '';
  }
}
