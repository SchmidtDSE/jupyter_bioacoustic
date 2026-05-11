import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';

export abstract class CollapsibleSection {
  readonly element: HTMLDetailsElement;
  readonly focused = new Signal<this, string>(this);
  readonly fieldFocused = new Signal<this, string>(this);
  readonly changed = new Signal<this, void>(this);
  readonly targetChanged = new Signal<this, { section: string; target: string }>(this);

  protected _body: HTMLDivElement;
  protected _sectionName: string;
  private _targetToggle: HTMLSelectElement | null = null;
  private _hasTargetToggle: boolean;

  constructor(title: string, sectionName: string, open = false, showTargetToggle = false) {
    this._sectionName = sectionName;
    this._hasTargetToggle = showTargetToggle;

    this.element = document.createElement('details');
    if (open) this.element.open = true;
    this.element.style.cssText =
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    const summary = document.createElement('summary');
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgMantle};color:${COLORS.textPrimary};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};` +
      `display:flex;align-items:center;justify-content:space-between;`;
    summary.addEventListener('click', () => {
      this.focused.emit(this._sectionName);
    });

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    summary.appendChild(titleSpan);

    if (showTargetToggle) {
      const toggleWrap = document.createElement('span');
      toggleWrap.style.cssText = `display:flex;align-items:center;gap:4px;`;
      toggleWrap.addEventListener('click', (e) => e.stopPropagation());

      const lbl = document.createElement('span');
      lbl.textContent = 'target:';
      lbl.style.cssText = `font-size:11px;font-weight:400;color:${COLORS.textSubtle};`;

      this._targetToggle = document.createElement('select');
      this._targetToggle.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:3px;color:${COLORS.textPrimary};padding:1px 4px;font-size:10px;cursor:pointer;`;
      const optP = document.createElement('option');
      optP.value = 'project'; optP.textContent = 'project';
      const optC = document.createElement('option');
      optC.value = 'config'; optC.textContent = 'config';
      this._targetToggle.append(optP, optC);
      this._targetToggle.addEventListener('change', () => {
        this.targetChanged.emit({ section: this._sectionName, target: this._targetToggle!.value });
      });

      toggleWrap.append(lbl, this._targetToggle);
      summary.appendChild(toggleWrap);
    }

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:10px 12px;display:flex;flex-direction:column;gap:8px;` +
      `background:${COLORS.bgBase};`;

    this.element.append(summary, this._body);
  }

  getTarget(): string {
    return this._targetToggle?.value || 'project';
  }

  setTarget(target: string): void {
    if (this._targetToggle && (target === 'project' || target === 'config')) {
      this._targetToggle.value = target;
    }
  }

  protected _makeRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
    return row;
  }

  protected _makeLabel(text: string): HTMLLabelElement {
    const lbl = document.createElement('label');
    lbl.textContent = text;
    lbl.style.cssText =
      `color:${COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
    return lbl;
  }

  protected _makeInput(placeholder = '', width = '200px'): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = placeholder;
    inp.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:4px 8px;` +
      `font-size:12px;width:${width};box-sizing:border-box;`;
    return inp;
  }

  protected _makeSelect(options: string[], selected?: string): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:4px 6px;font-size:12px;`;
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === selected) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }

  protected _makeCheckbox(label: string, checked = false): { row: HTMLDivElement; input: HTMLInputElement } {
    const row = this._makeRow();
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.style.cssText = `accent-color:${COLORS.blue};`;
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = `color:${COLORS.textSubtle};font-size:12px;cursor:pointer;`;
    lbl.prepend(cb);
    lbl.style.display = 'flex';
    lbl.style.alignItems = 'center';
    lbl.style.gap = '6px';
    row.appendChild(lbl);
    row.addEventListener('click', () => this.fieldFocused.emit(label));
    return { row, input: cb };
  }

  protected _makeButton(text: string, primary = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = primary
      ? `background:${COLORS.blue};border:none;border-radius:4px;color:${COLORS.bgBase};padding:4px 12px;font-size:12px;cursor:pointer;font-weight:700;`
      : `background:${COLORS.bgSurface1};border:none;border-radius:4px;color:${COLORS.textPrimary};padding:4px 10px;font-size:12px;cursor:pointer;`;
    return btn;
  }


  protected _makeFieldRow(labelText: string, input: HTMLElement): HTMLDivElement {
    const row = this._makeRow();
    row.appendChild(this._makeLabel(labelText));
    row.appendChild(input);
    row.addEventListener('focusin', () => this.fieldFocused.emit(labelText));
    row.addEventListener('click', () => this.fieldFocused.emit(labelText));
    return row;
  }

  protected _emitChanged(): void {
    this.changed.emit(void 0);
  }

  abstract getData(): Record<string, any>;

  abstract setData(data: Record<string, any>): void;
}
