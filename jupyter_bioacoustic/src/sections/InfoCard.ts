/**
 * InfoCard — displays metadata for the currently selected row.
 *
 * Shows time range, prediction value, display columns as colored chips,
 * and Prev/Next navigation buttons.
 */
import { Signal } from '@lumino/signaling';
import { Detection } from '../types';
import { fmtTime } from '../util';
import { COLORS, DISPLAY_CHIP_COLORS, btnStyle } from '../styles';

export class InfoCard {
  readonly element: HTMLDivElement;

  readonly prevRequested = new Signal<this, void>(this);
  readonly nextRequested = new Signal<this, void>(this);

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;align-items:center;gap:10px;padding:6px 12px;` +
      `background:${COLORS.bgMantle};border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;min-height:34px;`;
    this.element.innerHTML =
      `<span style="font-size:12px;color:${COLORS.textMuted};font-style:italic;">No selection</span>`;
  }

  /** Render the info card for the given row. */
  render(row: Detection, opts: {
    predictionCol: string;
    displayCols: string[];
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

    const mkChip = (text: string, color: string) => {
      const s = document.createElement('span');
      s.style.cssText = `font-size:12px;color:${color};flex-shrink:0;`;
      s.textContent = text;
      return s;
    };

    const items: HTMLElement[] = [];

    items.push(mkChip(
      `${fmtTime(row.start_time)} – ${fmtTime(row.end_time)}`,
      COLORS.textSubtle
    ));

    if (opts.predictionCol && row[opts.predictionCol] !== undefined) {
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-size:13px;font-weight:600;color:${COLORS.textPrimary};flex-shrink:0;`;
      nameSpan.textContent = String(row[opts.predictionCol]);
      items.unshift(nameSpan);
    }

    const colColors = DISPLAY_CHIP_COLORS;
    opts.displayCols.forEach((col, i) => {
      if (row[col] === undefined) return;
      const val = typeof row[col] === 'number' && !Number.isInteger(row[col])
        ? (row[col] as number).toFixed(3)
        : String(row[col]);
      items.push(mkChip(`${col}: ${val}`, colColors[i % colColors.length]));
    });

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
    this.element.append(...cardChildren);
  }
}
