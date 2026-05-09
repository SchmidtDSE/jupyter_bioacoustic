import { Signal } from '@lumino/signaling';
import { COLORS, btnStyle, inputStyle } from '../styles';

export class ConfigPreview {
  readonly element: HTMLDivElement;

  readonly configEdited = new Signal<this, string>(this);

  private _expanded = false;
  private _editing = false;
  private _toggleBtn: HTMLButtonElement;
  private _content: HTMLDivElement;
  private _display: HTMLPreElement;
  private _editor: HTMLTextAreaElement;
  private _editBtn: HTMLButtonElement;
  private _saveBtn: HTMLButtonElement;
  private _cancelBtn: HTMLButtonElement;
  private _editBar: HTMLDivElement;
  private _typeLabel: HTMLSpanElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;width:0;overflow:hidden;` +
      `border-left:1px solid ${COLORS.bgSurface0};transition:width 0.2s ease;flex-shrink:0;`;

    const header = document.createElement('div');
    header.style.cssText =
      `display:flex;align-items:center;gap:6px;padding:6px 10px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._toggleBtn.textContent = '◀ Config';
    this._toggleBtn.addEventListener('click', () => this.toggle());

    this._typeLabel = document.createElement('span');
    this._typeLabel.style.cssText = `font-size:11px;color:${COLORS.textMuted};flex:1;`;
    this._typeLabel.textContent = '';

    this._editBtn = document.createElement('button');
    this._editBtn.textContent = 'Edit';
    this._editBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 8px;`;
    this._editBtn.addEventListener('click', () => this._startEdit());

    header.append(this._toggleBtn, this._typeLabel, this._editBtn);

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
    this.element.append(header, this._content, this._editBar);
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this.element.style.width = this._expanded ? '350px' : '0';
    this._toggleBtn.textContent = this._expanded ? 'Config ▶' : '◀ Config';
  }

  expand(): void {
    if (!this._expanded) this.toggle();
  }

  updateConfig(yamlStr: string, configType?: string): void {
    this._display.textContent = yamlStr || '# (empty)';
    if (configType) {
      this._typeLabel.textContent = configType;
    }
    if (this._editing) {
      this._cancelEdit();
    }
    if (yamlStr && !this._expanded) {
      this.toggle();
    }
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
    this.configEdited.emit(yaml);
  }

  private _cancelEdit(): void {
    this._editing = false;
    this._editor.style.display = 'none';
    this._display.style.display = 'block';
    this._editBar.style.display = 'none';
    this._editBtn.style.display = '';
  }
}
