import { Signal } from '@lumino/signaling';
import { COLORS, btnStyle, inputStyle } from '../styles';
import { DOCS } from './docs';

export class YamlPanel {
  readonly element: HTMLDivElement;
  readonly configEdited = new Signal<this, { yaml: string; configType: string }>(this);
  readonly saveSingleRequested = new Signal<this, string>(this);

  private _expanded = true;
  private _editing = false;
  private _configType = 'project';
  private _mode: 'docs' | 'yaml' = 'docs';
  private _currentSection = 'project';
  private _yamls = { project_yaml: '', config_yaml: '', form_yaml: '' };

  private _toggleBtn: HTMLButtonElement;
  private _modeBar: HTMLDivElement;
  private _docsBtn: HTMLButtonElement;
  private _yamlBtn: HTMLButtonElement;

  private _docsContent: HTMLDivElement;
  private _yamlContent: HTMLDivElement;

  private _display: HTMLPreElement;
  private _editor: HTMLTextAreaElement;
  private _editBtn: HTMLButtonElement;
  private _saveBtn: HTMLButtonElement;
  private _cancelBtn: HTMLButtonElement;
  private _editBar: HTMLDivElement;
  private _yamlTabBar: HTMLDivElement;
  private _yamlTabs: Map<string, HTMLButtonElement> = new Map();
  private _activeField: HTMLElement | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;width:350px;overflow:hidden;` +
      `border-left:1px solid ${COLORS.bgSurface0};transition:width 0.2s ease;flex-shrink:0;`;

    const header = document.createElement('div');
    header.style.cssText =
      `display:flex;align-items:center;gap:6px;padding:6px 10px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;` +
      `overflow:hidden;white-space:nowrap;`;

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._toggleBtn.textContent = '▶';
    this._toggleBtn.addEventListener('click', () => this.toggle());

    header.appendChild(this._toggleBtn);

    this._modeBar = document.createElement('div');
    this._modeBar.style.cssText =
      `display:flex;gap:0;background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    this._docsBtn = document.createElement('button');
    this._docsBtn.textContent = 'docs';
    this._docsBtn.style.cssText = this._modeTabStyle(true);
    this._docsBtn.addEventListener('click', () => this._setMode('docs'));

    this._yamlBtn = document.createElement('button');
    this._yamlBtn.textContent = 'yaml';
    this._yamlBtn.style.cssText = this._modeTabStyle(false);
    this._yamlBtn.addEventListener('click', () => this._setMode('yaml'));

    this._modeBar.append(this._docsBtn, this._yamlBtn);

    this._docsContent = document.createElement('div');
    this._docsContent.style.cssText =
      `flex:1;overflow-y:auto;padding:12px;font-size:12px;line-height:1.6;` +
      `color:${COLORS.textPrimary};background:${COLORS.bgBase};`;

    this._yamlContent = document.createElement('div');
    this._yamlContent.style.cssText =
      `flex:1;overflow:auto;position:relative;display:none;flex-direction:column;`;

    this._yamlTabBar = document.createElement('div');
    this._yamlTabBar.style.cssText =
      `display:none;gap:0;background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    for (const t of ['project', 'config', 'form_config']) {
      const btn = document.createElement('button');
      btn.textContent = t === 'form_config' ? 'form' : t;
      btn.style.cssText =
        `flex:1;padding:4px 8px;font-size:11px;border:none;cursor:pointer;` +
        `background:${t === 'project' ? COLORS.bgSurface0 : 'transparent'};` +
        `color:${t === 'project' ? COLORS.textPrimary : COLORS.textMuted};`;
      btn.addEventListener('click', () => this._switchYamlTab(t));
      this._yamlTabs.set(t, btn);
      this._yamlTabBar.appendChild(btn);
    }

    this._display = document.createElement('pre');
    this._display.style.cssText =
      `margin:0;padding:10px;font-size:12px;line-height:1.6;font-family:monospace;` +
      `color:${COLORS.textPrimary};white-space:pre-wrap;word-wrap:break-word;` +
      `background:${COLORS.bgMantle};flex:1;`;
    this._display.textContent = '# (empty)';

    this._editor = document.createElement('textarea');
    this._editor.style.cssText =
      inputStyle() +
      `width:100%;height:100%;box-sizing:border-box;resize:none;font-family:monospace;` +
      `font-size:12px;line-height:1.6;padding:10px;display:none;border:none;border-radius:0;` +
      `position:absolute;inset:0;`;

    this._editBtn = document.createElement('button');
    this._editBtn.textContent = 'Edit';
    this._editBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._editBtn.addEventListener('click', () => this._startEdit());

    const saveFileBtn = document.createElement('button');
    saveFileBtn.textContent = 'Save File';
    saveFileBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    saveFileBtn.addEventListener('click', () => {
      this.saveSingleRequested.emit(this._configType);
    });

    header.append(this._editBtn, saveFileBtn);

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

    this._yamlContent.append(this._display, this._editor);
    this.element.append(header, this._modeBar, this._yamlTabBar, this._docsContent, this._yamlContent, this._editBar);

    this._renderDocs('project');
  }

  private _modeTabStyle(active: boolean): string {
    return `flex:1;padding:5px 8px;font-size:11px;font-weight:600;border:none;cursor:pointer;` +
      `background:${active ? COLORS.bgSurface0 : 'transparent'};` +
      `color:${active ? COLORS.textPrimary : COLORS.textMuted};`;
  }

  private _setMode(mode: 'docs' | 'yaml'): void {
    this._mode = mode;
    this._docsBtn.style.cssText = this._modeTabStyle(mode === 'docs');
    this._yamlBtn.style.cssText = this._modeTabStyle(mode === 'yaml');

    if (mode === 'docs') {
      this._docsContent.style.display = 'block';
      this._yamlContent.style.display = 'none';
      this._yamlTabBar.style.display = 'none';
      this._editBtn.style.display = 'none';
      if (this._editing) this._cancelEdit();
    } else {
      this._docsContent.style.display = 'none';
      this._yamlContent.style.display = 'flex';
      this._yamlTabBar.style.display = 'flex';
      this._editBtn.style.display = '';
    }
  }

  toggle(): void {
    this._expanded = !this._expanded;
    if (this._expanded) {
      this.element.style.width = '350px';
      this._modeBar.style.display = 'flex';
      this._setMode(this._mode);
    } else {
      this.element.style.width = '36px';
      this._modeBar.style.display = 'none';
      this._docsContent.style.display = 'none';
      this._yamlContent.style.display = 'none';
      this._yamlTabBar.style.display = 'none';
      this._editBtn.style.display = 'none';
      if (this._editing) this._cancelEdit();
    }
    this._toggleBtn.textContent = this._expanded ? '▶' : '◀';
  }

  get configType(): string {
    return this._configType;
  }

  switchToTab(tab: string): void {
    this._switchYamlTab(tab);
  }

  private _switchYamlTab(tab: string): void {
    this._configType = tab;
    for (const [t, btn] of this._yamlTabs) {
      btn.style.background = t === tab ? COLORS.bgSurface0 : 'transparent';
      btn.style.color = t === tab ? COLORS.textPrimary : COLORS.textMuted;
    }
    if (this._editing) this._cancelEdit();
    this._updateYamlDisplay(this._yamls);
  }

  updateYaml(yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
    this._yamls = yamls;
    this._updateYamlDisplay(yamls);
  }

  showForSection(section: string, yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
    this._currentSection = section;

    if (section === 'form') {
      this._configType = 'form_config';
    } else if (section === 'project') {
      this._configType = 'project';
    } else {
      this._configType = 'config';
    }
    for (const [t, btn] of this._yamlTabs) {
      btn.style.background = t === this._configType ? COLORS.bgSurface0 : 'transparent';
      btn.style.color = t === this._configType ? COLORS.textPrimary : COLORS.textMuted;
    }

    this._yamls = yamls;
    this._updateYamlDisplay(yamls);
    this._renderDocs(section);
  }

  scrollToField(fieldKey: string): void {
    if (this._activeField) {
      this._activeField.style.borderLeftColor = COLORS.bgSurface1;
    }
    const el = this._docsContent.querySelector(`[data-field="${fieldKey}"]`) as HTMLElement | null;
    if (el) {
      el.style.borderLeftColor = COLORS.sapphire;
      this._activeField = el;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      this._activeField = null;
    }
  }

  private _renderDocs(section: string): void {
    this._activeField = null;
    this._docsContent.innerHTML = '';
    const docs = DOCS[section];
    if (!docs) {
      this._docsContent.textContent = `No documentation for "${section}".`;
      return;
    }

    const sectionTitles: Record<string, string> = { project: 'Setup' };
    const title = document.createElement('h3');
    title.textContent = sectionTitles[section] || section;
    title.style.cssText =
      `margin:0 0 8px 0;font-size:14px;font-weight:700;color:${COLORS.blue};` +
      `text-transform:capitalize;`;
    this._docsContent.appendChild(title);

    if (docs._intro) {
      const intro = document.createElement('p');
      intro.textContent = docs._intro;
      intro.style.cssText =
        `margin:0 0 12px 0;color:${COLORS.textSubtle};font-size:12px;line-height:1.5;`;
      this._docsContent.appendChild(intro);
    }

    for (const [key, text] of Object.entries(docs)) {
      if (key === '_intro') continue;

      if (key.startsWith('_sub:')) {
        const hr = document.createElement('hr');
        hr.style.cssText = `border:none;border-top:1px solid ${COLORS.bgSurface1};margin:12px 0 8px;`;
        this._docsContent.appendChild(hr);

        const subTitle = document.createElement('h4');
        subTitle.textContent = key.slice(5);
        subTitle.style.cssText =
          `margin:0 0 4px 0;font-size:12px;font-weight:700;color:${COLORS.textPrimary};`;
        this._docsContent.appendChild(subTitle);

        const subIntro = document.createElement('p');
        subIntro.textContent = text as string;
        subIntro.style.cssText =
          `margin:0 0 10px 0;color:${COLORS.textSubtle};font-size:11px;line-height:1.5;`;
        this._docsContent.appendChild(subIntro);
        continue;
      }

      if (key.startsWith('_group:') && typeof text === 'object') {
        const group = document.createElement('div');
        group.style.cssText =
          `border-left:2px solid ${COLORS.lavender};margin:0 0 10px 3px;padding-left:8px;`;
        for (const [childKey, childText] of Object.entries(text)) {
          group.appendChild(this._makeFieldCard(childKey, childText));
        }
        this._docsContent.appendChild(group);
        continue;
      }

      this._docsContent.appendChild(this._makeFieldCard(key, text as string));
    }
  }

  private _makeFieldCard(key: string, text: string): HTMLDivElement {
    const fieldEl = document.createElement('div');
    fieldEl.setAttribute('data-field', key);
    fieldEl.style.cssText =
      `margin-bottom:10px;padding:8px;background:${COLORS.bgSurface0};border-radius:4px;` +
      `border-left:3px solid ${COLORS.bgSurface1};transition:border-color 0.15s ease;`;

    const nameEl = document.createElement('div');
    nameEl.textContent = key;
    nameEl.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.mauve};margin-bottom:4px;font-family:monospace;`;

    const descEl = document.createElement('div');
    descEl.style.cssText =
      `font-size:11px;color:${COLORS.textSubtle};line-height:1.5;white-space:pre-wrap;`;
    descEl.textContent = text;

    fieldEl.append(nameEl, descEl);
    return fieldEl;
  }

  private _updateYamlDisplay(yamls: { project_yaml: string; config_yaml: string; form_yaml: string }): void {
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
