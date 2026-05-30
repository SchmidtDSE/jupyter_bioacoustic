/**
 * DescriptionSection
 *
 * Collapsible section for the optional annotator description panel.
 * Contains title, text (markdown), path, open toggle, and height.
 *
 * License: BSD 3-Clause
 */
import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';


//
// Public
//
export class DescriptionSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _titleInput: HTMLInputElement;
  private _textArea: HTMLTextAreaElement;
  private _pathInput: HTMLInputElement;
  private _openCb: HTMLInputElement;
  private _heightInput: HTMLInputElement;

  constructor() {
    super('Description', 'description', false, true, ['project', 'config']);

    this._titleInput = this._makeInput('', '200px');
    this._titleInput.placeholder = 'e.g. Instructions';
    this._titleInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('title', this._titleInput));

    this._textArea = document.createElement('textarea');
    this._textArea.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;` +
      `color:${COLORS.textPrimary};padding:4px 6px;font-size:12px;width:100%;min-height:60px;` +
      `box-sizing:border-box;resize:vertical;font-family:monospace;`;
    this._textArea.placeholder = 'Markdown text (or use path for a file)';
    this._textArea.addEventListener('keydown', (e) => e.stopPropagation());
    this._textArea.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('text', this._textArea));

    const pathRow = this._makeRow();
    pathRow.addEventListener('focusin', () => this.fieldFocused.emit('description_path'));
    pathRow.addEventListener('click', () => this.fieldFocused.emit('description_path'));
    pathRow.appendChild(this._makeLabel('path'));
    this._pathInput = this._makeInput('docs/instructions.md', '200px');
    this._pathInput.addEventListener('input', () => this._emitChanged());
    const browseBtn = this._makeButton('Browse');
    browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    pathRow.append(this._pathInput, browseBtn);
    this._body.appendChild(pathRow);

    const { row: openRow, input: openCb } = this._makeCheckbox('open');
    this._openCb = openCb;
    this._openCb.checked = true;
    this._openCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(openRow);

    this._heightInput = this._makeInput('', '60px');
    this._heightInput.type = 'number';
    this._heightInput.placeholder = 'auto';
    this._heightInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('height', this._heightInput));
  }

  setDescriptionPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    const title = this._titleInput.value.trim();
    const text = this._textArea.value;
    const path = this._pathInput.value.trim();
    const open = this._openCb.checked;
    const h = parseInt(this._heightInput.value);

    if (title || text || path) {
      const desc: Record<string, any> = {};
      if (title) desc.title = title;
      if (text) desc.text = text;
      if (path) desc.path = path;
      if (!open) desc.open = false;
      result.description = desc;
    }
    if (!isNaN(h) && h > 0) result.description_height = h;
    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.description_height) this._heightInput.value = String(data.description_height);
    const d = data.description;
    if (d && typeof d === 'object') {
      if (d.title) this._titleInput.value = d.title;
      if (d.text) this._textArea.value = d.text;
      if (d.path) this._pathInput.value = d.path;
      if (d.open === false) this._openCb.checked = false;
    }
    if (data.description_title) this._titleInput.value = data.description_title;
    if (data.description_text) this._textArea.value = data.description_text;
    if (data.description_path) this._pathInput.value = data.description_path;
    if (data.description_open === false) this._openCb.checked = false;
  }
}
