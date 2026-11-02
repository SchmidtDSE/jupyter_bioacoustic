/**
 * Base class of every config-builder section: a collapsible ``<details>`` with a title bar,
 * an optional "target" dropdown (which file the section writes to), accordion / pin
 * behaviour, file-lock UI and the shared field-row factories.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { COLORS, lockIconSvg } from '../../styles';
import { fillSelect, makeButton, makeInput, makeLabel, makeRow, makeSelect } from '../dom';
import type { FileFlags, LockableField, SectionRouting } from '../types';


//
// Constants
//
const DEFAULT_TARGETS = ['project', 'config'];

/** The small lock icon shown after each disabled control. */
const lockMarkers = new WeakMap<HTMLElement, HTMLSpanElement>();


//
// Public
//
export abstract class CollapsibleSection {
  readonly element: HTMLDetailsElement;
  /** The title bar was clicked (payload: section name) — shows this section's docs. */
  readonly focused = new Signal<this, string>(this);
  /** A field was focused/clicked (payload: its docs key) — highlights it in the docs. */
  readonly fieldFocused = new Signal<this, string>(this);
  /** A value changed; the panel then sends ``getData()`` to the kernel. */
  readonly changed = new Signal<this, void>(this);
  /** The target dropdown changed. */
  readonly targetChanged = new Signal<this, { section: string; target: string }>(this);
  /** The section is about to open (the panel closes the other unpinned sections). */
  readonly opened = new Signal<this, void>(this);

  protected _body: HTMLDivElement;
  protected _sectionName: string;
  private _targetToggle: HTMLSelectElement | null = null;
  private _targetLockBadge: HTMLSpanElement | null = null;
  private _chevron: HTMLSpanElement;
  private _summary: HTMLElement;
  private _bodyLockBanner: HTMLDivElement | null = null;
  private _pinned = false;
  private _targetForceDisabled = false;
  private _optionsDisabled = false;

  /**
   * @param title - Title bar text.
   * @param sectionName - Name used for kernel calls and docs (``data``, ``app``, ...).
   * @param open - Start expanded.
   * @param showTargetToggle - Show the "target:" dropdown in the title bar.
   * @param targetOptions - The dropdown's options (default project / config).
   */
  constructor(
    title: string, sectionName: string, open = false, showTargetToggle = false,
    targetOptions?: string[],
  ) {
    this._sectionName = sectionName;

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
        this._pin();
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
      this._pin();
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

    if (showTargetToggle) summary.appendChild(this._buildTargetToggle(targetOptions));

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:10px 12px;display:flex;flex-direction:column;gap:8px;` +
      `background:${COLORS.bgBase};`;

    this._summary = summary;
    this.element.append(summary, this._body);
  }

  /** Pinned sections (Cmd/Ctrl-click or double-click) stay open when another one opens. */
  get isPinned(): boolean {
    return this._pinned;
  }

  /** Collapse and unpin. */
  close(): void {
    this.element.open = false;
    this._pinned = false;
    this._updateChevron();
  }

  /** The target dropdown's value (``project`` when the section has none). */
  getTarget(): string {
    return this._targetToggle?.value || 'project';
  }

  /** Select ``target`` in the dropdown (no ``targetChanged``). */
  setTarget(target: string): void {
    if (this._targetToggle) {
      this._targetToggle.value = target;
    }
  }

  /**
   * Replace the target choices (e.g. only the enabled files). Keeps the current target when
   * still offered, else picks the last option; a single option disables the dropdown.
   */
  setTargetOptions(options: string[]): void {
    if (!this._targetToggle) return;
    const current = this._targetToggle.value;
    fillSelect(this._targetToggle, options);
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

  /**
   * The section's YAML payload, sent to the kernel's ``update_section`` on every change.
   * Only keys the user set are included (defaults stay implicit).
   */
  abstract getData(): Record<string, any>;

  /**
   * Fill the fields from loaded YAML. Only the keys present in ``data`` are applied, so call
   * ``reset()`` first when replacing a whole file.
   */
  abstract setData(data: Record<string, any>): void;

  /**
   * Put every field back to its just-constructed state. Called before loading another file:
   * ``setData`` only fills the keys present in the new file, so without a reset the previous
   * file's values stayed on screen (and were sent back to the kernel on the next edit).
   */
  reset(): void {}

  /** A label + control row that highlights ``labelText`` in the docs when used. */
  protected _makeFieldRow(labelText: string, input: HTMLElement, required = false): HTMLDivElement {
    const row = makeRow();
    row.appendChild(makeLabel(labelText, required));
    row.appendChild(input);
    row.addEventListener('focusin', () => this.fieldFocused.emit(labelText));
    row.addEventListener('click', () => this.fieldFocused.emit(labelText));
    return row;
  }

  /**
   * A row holding only a label, for several controls (input + Browse, ...). Using the row
   * highlights ``fieldKey`` in the docs.
   *
   * @param fieldKey - Docs key to highlight.
   * @param labelText - Label text.
   * @param required - Colour the label as required.
   */
  protected _makeFocusRow(fieldKey: string, labelText: string, required = false): HTMLDivElement {
    const row = makeRow();
    row.addEventListener('focusin', () => this.fieldFocused.emit(fieldKey));
    row.addEventListener('click', () => this.fieldFocused.emit(fieldKey));
    row.appendChild(makeLabel(labelText, required));
    return row;
  }

  /** A labelled checkbox row (clicking it highlights ``label`` in the docs). */
  protected _makeCheckbox(label: string, checked = false): { row: HTMLDivElement; input: HTMLInputElement } {
    const row = makeRow();
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

  // Thin aliases of the dom.ts factories, for subclasses.
  protected _makeRow(): HTMLDivElement {
    return makeRow();
  }

  protected _makeLabel(text: string, required = false): HTMLLabelElement {
    return makeLabel(text, required);
  }

  protected _makeInput(placeholder = '', width = '200px'): HTMLInputElement {
    return makeInput(placeholder, width);
  }

  protected _makeSelect(options: string[], selected?: string): HTMLSelectElement {
    return makeSelect(options, selected);
  }

  protected _makeButton(text: string, primary = false): HTMLButtonElement {
    return makeButton(text, primary);
  }

  protected _emitChanged(): void {
    this.changed.emit(void 0);
  }

  /** Disable/grey a single control + show a small grey lock next to it. */
  protected _setControlDisabled(el: HTMLElement | null | undefined, disabled: boolean): void {
    if (!el) return;
    if ('disabled' in el) (el as HTMLInputElement).disabled = disabled;
    el.style.opacity = disabled ? '0.5' : '';
    el.style.pointerEvents = disabled ? 'none' : '';
    if (el.tagName !== 'BUTTON') this._toggleFieldLockMarker(el, disabled);
  }

  /**
   * Disable each control whose file is locked. A section targeting ``project`` or ``config``
   * writes every field there; a ``split`` section sends the keys in ``routing.project`` to the
   * project file and the rest to the config file.
   *
   * @param fields - Each control with the YAML key it edits.
   * @param locks - Which files are locked.
   * @param routing - The section's split routing (from ``get_routing_keys``).
   */
  protected _applyRoutedLocks(
    fields: readonly LockableField[], locks: FileFlags, routing?: SectionRouting,
  ): void {
    const projKeys = new Set(routing?.project ?? []);
    const target = this.getTarget();
    for (const { el, key } of fields) {
      const file = target === 'project' ? 'project'
        : target === 'config' ? 'config'
        : (projKeys.has(key) ? 'project' : 'config');
      this._setControlDisabled(el, !!locks[file]);
    }
  }

  private _buildTargetToggle(targetOptions?: string[]): HTMLSpanElement {
    const toggleWrap = document.createElement('span');
    toggleWrap.style.cssText = `display:flex;align-items:center;gap:4px;`;
    toggleWrap.addEventListener('click', (e) => e.stopPropagation());

    const lbl = document.createElement('span');
    lbl.textContent = 'target:';
    lbl.style.cssText = `font-size:11px;font-weight:400;color:${COLORS.textSubtle};`;

    const toggle = document.createElement('select');
    toggle.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:3px;color:${COLORS.textPrimary};padding:1px 4px;font-size:10px;cursor:pointer;`;
    fillSelect(toggle, targetOptions || DEFAULT_TARGETS);
    toggle.addEventListener('change', () => {
      this.targetChanged.emit({ section: this._sectionName, target: toggle.value });
    });
    this._targetToggle = toggle;

    this._targetLockBadge = document.createElement('span');
    this._targetLockBadge.style.cssText = `display:none;color:${COLORS.textMuted};line-height:0;`;
    this._targetLockBadge.innerHTML = lockIconSvg(true, 12);
    this._targetLockBadge.title = 'Target is locked while a file is locked';

    toggleWrap.append(lbl, toggle, this._targetLockBadge);
    return toggleWrap;
  }

  private _pin(): void {
    this._pinned = true;
    if (!this.element.open) this.element.open = true;
    this._updateChevron();
  }

  private _updateChevron(): void {
    this._chevron.textContent = this.element.open ? '▾' : '▸';
    this._summary.style.background = (this._pinned && this.element.open) ? COLORS.bgSurface0 : COLORS.bgMantle;
  }

  private _applyTargetDisabled(): void {
    if (this._targetToggle) {
      this._targetToggle.disabled = this._targetForceDisabled || this._optionsDisabled;
    }
  }

  private _toggleFieldLockMarker(el: HTMLElement, disabled: boolean): void {
    const marker = lockMarkers.get(el);
    if (disabled) {
      if (marker) return;
      const m = document.createElement('span');
      m.style.cssText =
        `display:inline-flex;color:${COLORS.textMuted};margin-left:5px;vertical-align:middle;`;
      m.innerHTML = lockIconSvg(true, 12);
      m.title = 'Locked — this field writes to a locked file';
      lockMarkers.set(el, m);
      el.insertAdjacentElement('afterend', m);
    } else if (marker) {
      marker.remove();
      lockMarkers.delete(el);
    }
  }
}
