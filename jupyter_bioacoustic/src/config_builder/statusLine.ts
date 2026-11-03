/**
 * The builder's one-line status message (shown in the widget header).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../styles';


//
// Types
//
/** How a status message is coloured. */
export type StatusLevel = 'ok' | 'warning' | 'error';


//
// Public
//
export class StatusLine {
  readonly element: HTMLSpanElement;

  constructor() {
    this.element = document.createElement('span');
    this.element.style.cssText =
      `font-size:11px;color:${COLORS.green};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
  }

  /**
   * Show ``msg``.
   *
   * @param msg - Message text.
   * @param level - ``ok`` (green), ``warning`` (yellow) or ``error`` (red).
   */
  set(msg: string, level: StatusLevel = 'ok'): void {
    this.element.textContent = msg;
    this.element.style.color =
      level === 'error' ? COLORS.red : level === 'warning' ? COLORS.yellow : COLORS.green;
  }
}
