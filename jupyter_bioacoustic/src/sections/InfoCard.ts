/**
 * InfoCard — displays metadata for the currently selected row.
 *
 * Shows time range, resolved title/text templates, and Prev/Next navigation. A ``leading``
 * element (the playlist's collapse toggle) stays at its start across renders.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { Detection } from '../types';
import { fmtTime, resolveTemplate } from '../util';
import { COLORS, btnStyle } from '../styles';



//
// Constants
//
const DEFAULT_INFO_CARD_MIN_HEIGHT = 34;


//
// Public
//
/** The info card at the top of the playlist (above the filter bar and clip table). */
export class InfoCard {
  readonly element: HTMLDivElement;
  private _leading: HTMLElement | null = null;

  readonly prevRequested = new Signal<this, void>(this);
  readonly nextRequested = new Signal<this, void>(this);

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;align-items:center;gap:10px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;min-height:${DEFAULT_INFO_CARD_MIN_HEIGHT}px;`;
    this.element.innerHTML =
      `<span style="font-size:12px;color:${COLORS.textMuted};font-style:italic;">No selection</span>`;
  }

  /** Keep ``el`` as the card's first item (now and after every ``render``). */
  setLeading(el: HTMLElement): void {
    this._leading = el;
    this.element.prepend(el);
  }

  setHeight(h?: number): void {
    if (h) {
      this.element.style.minHeight = `${h}px`;
    }
  }

  render(row: Detection, opts: {
    titleTemplate: string;
    textTemplate: string;
    filteredIdx: number;
    filteredLength: number;
  }): void {
    this.element.innerHTML = '';

    const sep = () => {
      const s = document.createElement('span');
      s.style.cssText = `color:${COLORS.bgSurface1};font-size:11px;flex-shrink:0;`;
      s.textContent = '|';
      return s;
    };

    const items: HTMLElement[] = [];

    items.push((() => {
      const s = document.createElement('span');
      s.style.cssText = `font-size:12px;color:${COLORS.textSubtle};flex-shrink:0;`;
      s.textContent = `${fmtTime(row.start_time)} – ${fmtTime(row.end_time)}`;
      return s;
    })());

    if (opts.titleTemplate) {
      const resolved = resolveTemplate(opts.titleTemplate, row);
      if (resolved) {
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = `font-size:13px;font-weight:600;color:${COLORS.textPrimary};flex-shrink:0;`;
        titleSpan.textContent = resolved;
        items.unshift(titleSpan);
      }
    }

    if (opts.textTemplate) {
      const resolved = resolveTemplate(opts.textTemplate, row);
      if (resolved) {
        const textSpan = document.createElement('span');
        textSpan.style.cssText = `font-size:12px;color:${COLORS.textSubtle};flex-shrink:0;`;
        textSpan.textContent = resolved;
        items.push(textSpan);
      }
    }

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Prev';
    prevBtn.style.cssText = btnStyle() + `font-size:11px;`;
    prevBtn.disabled = opts.filteredIdx === 0;
    prevBtn.addEventListener('click', () => this.prevRequested.emit(void 0));

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = btnStyle() + `font-size:11px;`;
    nextBtn.disabled = opts.filteredIdx >= opts.filteredLength - 1;
    nextBtn.addEventListener('click', () => this.nextRequested.emit(void 0));

    const cardChildren: HTMLElement[] = [];
    items.forEach((el, i) => {
      cardChildren.push(el);
      if (i < items.length - 1) cardChildren.push(sep());
    });
    cardChildren.push(spacer, prevBtn, nextBtn);
    if (this._leading) cardChildren.unshift(this._leading);
    this.element.append(...cardChildren);
  }
}
