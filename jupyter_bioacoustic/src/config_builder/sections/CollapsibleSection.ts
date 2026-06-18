import { Signal } from '@lumino/signaling';
import { COLORS, lockIconSvg } from '../../styles';

export abstract class CollapsibleSection {
  readonly element: HTMLDetailsElement;
  readonly focused = new Signal<this, string>(this);
  readonly fieldFocused = new Signal<this, string>(this);
  readonly changed = new Signal<this, void>(this);
  readonly targetChanged = new Signal<this, { section: string; target: string }>(this);
  readonly opened = new Signal<this, void>(this);

  protected _body: HTMLDivElement;
  protected _sectionName: string;
  private _targetToggle: HTMLSelectElement | null = null;
  private _targetLockBadge: HTMLSpanElement | null = null;
  private _hasTargetToggle: boolean;
  private _chevron: HTMLSpanElement;
  private _summary: HTMLElement;
  private _bodyLockBanner: HTMLDivElement | null = null;
  private _pinned = false;
  private _targetForceDisabled = false;
  private _optionsDisabled = false;

  constructor(title: string, sectionName: string, open = false, showTargetToggle = false, targetOptions?: string[]) {
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

    summary.addEventListener('click', (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        this._pinned = true;
        if (!this.element.open) this.element.open = true;
        this._updateChevron();
        return;
      }
      if (!this.element.open) {
        this.opened.emit(void 0);
      } else {
        this._pinned = false;
      }
      this.focused.emit(this._sectionName);
    });

    summary.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      this._pinned = true;
      if (!this.element.open) this.element.open = true;
      this._updateChevron();
    });

    const leftGroup = document.createElement('span');
    leftGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;

    this._chevron = document.createElement('span');
    this._chevron.style.cssText =
      `font-size:20px;line-height:0;margin-top:-3px;color:${COLORS.textMuted};flex-shrink:0;width:16px;text-align:center;`;
    this._chevron.textContent = open ? '▾' : '▸';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;

    leftGroup.append(this._chevron, titleSpan);
    summary.appendChild(leftGroup);

    this.element.addEventListener('toggle', () => this._updateChevron());

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
      const opts = targetOptions || ['project', 'config'];
      for (const val of opts) {
        const o = document.createElement('option');
        o.value = val; o.textContent = val;
        this._targetToggle.appendChild(o);
      }
      this._targetToggle.addEventListener('change', () => {
        this.targetChanged.emit({ section: this._sectionName, target: this._targetToggle!.value });
      });

      this._targetLockBadge = document.createElement('span');
      this._targetLockBadge.style.cssText = `display:none;color:${COLORS.textMuted};line-height:0;`;
      this._targetLockBadge.innerHTML = lockIconSvg(true, 12);
      this._targetLockBadge.title = 'Target is locked while a file is locked';

      toggleWrap.append(lbl, this._targetToggle, this._targetLockBadge);
      summary.appendChild(toggleWrap);
    }

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:10px 12px;display:flex;flex-direction:column;gap:8px;` +
      `background:${COLORS.bgBase};`;

    this._summary = summary;
    this.element.append(summary, this._body);
  }

  get isPinned(): boolean {
    return this._pinned;
  }

  close(): void {
    this.element.open = false;
    this._pinned = false;
    this._updateChevron();
  }

  unpin(): void {
    this._pinned = false;
    this._updateChevron();
  }

  private _updateChevron(): void {
    this._chevron.textContent = this.element.open ? '\u25be' : '\u25b8';
    this._summary.style.background = (this._pinned && this.element.open) ? COLORS.bgSurface0 : COLORS.bgMantle;
  }

  getTarget(): string {
    return this._targetToggle?.value || 'project';
  }

  setTarget(target: string): void {
    if (this._targetToggle) {
      this._targetToggle.value = target;
    }
  }

  setTargetOptions(options: string[]): void {
    if (!this._targetToggle) return;
    const current = this._targetToggle.value;
    this._targetToggle.innerHTML = '';
    for (const val of options) {
      const o = document.createElement('option');
      o.value = val; o.textContent = val;
      this._targetToggle.appendChild(o);
    }
    if (options.includes(current)) this._targetToggle.value = current;
    else if (options.length > 0) this._targetToggle.value = options[options.length - 1];
    this._optionsDisabled = options.length <= 1;
    this._applyTargetDisabled();
  }

  /** Grey out + disable the field body while keeping the section expandable. */
  setFieldsLocked(locked: boolean): void {
    this._body.style.opacity = locked ? '0.5' : '';
    this._body.style.pointerEvents = locked ? 'none' : '';
    if (locked && !this._bodyLockBanner) {
      const b = document.createElement('div');
      b.style.cssText =
        `display:flex;align-items:center;gap:6px;color:${COLORS.textMuted};font-size:11px;`;
      b.innerHTML = `${lockIconSvg(true, 12)}<span>Writes to a locked file — unlock it to edit</span>`;
      this._bodyLockBanner = b;
      this._body.insertBefore(b, this._body.firstChild);
    } else if (!locked && this._bodyLockBanner) {
      this._bodyLockBanner.remove();
      this._bodyLockBanner = null;
    }
  }

  /** Enable/disable the header target dropdown (e.g. frozen while files are locked). */
  setTargetEnabled(enabled: boolean): void {
    this._targetForceDisabled = !enabled;
    if (this._targetLockBadge) this._targetLockBadge.style.display = enabled ? 'none' : '';
    this._applyTargetDisabled();
  }

  private _applyTargetDisabled(): void {
    if (this._targetToggle) {
      this._targetToggle.disabled = this._targetForceDisabled || this._optionsDisabled;
    }
  }

  protected _makeRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
    return row;
  }

  protected _makeLabel(text: string, required = false): HTMLLabelElement {
    const lbl = document.createElement('label');
    lbl.textContent = text;
    lbl.style.cssText =
      `color:${required ? COLORS.teal : COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
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


  protected _makeFieldRow(labelText: string, input: HTMLElement, required = false): HTMLDivElement {
    const row = this._makeRow();
    row.appendChild(this._makeLabel(labelText, required));
    row.appendChild(input);
    row.addEventListener('focusin', () => this.fieldFocused.emit(labelText));
    row.addEventListener('click', () => this.fieldFocused.emit(labelText));
    return row;
  }

  protected _emitChanged(): void {
    this.changed.emit(void 0);
  }

  /** Disable/grey a single control + show a small grey lock next to it. */
  protected _setControlDisabled(el: HTMLElement | null | undefined, disabled: boolean): void {
    if (!el) return;
    const anyEl = el as any;
    if ('disabled' in anyEl) anyEl.disabled = disabled;
    el.style.opacity = disabled ? '0.5' : '';
    el.style.pointerEvents = disabled ? 'none' : '';
    if (el.tagName !== 'BUTTON') this._toggleFieldLockMarker(el, disabled);
  }

  private _toggleFieldLockMarker(el: HTMLElement, disabled: boolean): void {
    const a = el as any;
    if (disabled) {
      if (a._lockMarker) return;
      const m = document.createElement('span');
      m.style.cssText =
        `display:inline-flex;color:${COLORS.textMuted};margin-left:5px;vertical-align:middle;`;
      m.innerHTML = lockIconSvg(true, 12);
      m.title = 'Locked — this field writes to a locked file';
      a._lockMarker = m;
      el.insertAdjacentElement('afterend', m);
    } else if (a._lockMarker) {
      a._lockMarker.remove();
      a._lockMarker = null;
    }
  }

  abstract getData(): Record<string, any>;

  abstract setData(data: Record<string, any>): void;
}
