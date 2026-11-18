/**
 * CollapseToggle — the ▾ / ▸ chevron (plus an optional title) that expands / collapses an
 * annotator section. It sits at the start of the row the section keeps when collapsed: the
 * info card (playlist), the play row (spectrogram) and the button row (form). What a
 * collapsed section hides is up to the section (``onToggle``).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, sectionChevronStyle } from '../styles';


//
// Constants
//
const CHEVRON_OPEN = '▾';
const CHEVRON_CLOSED = '▸';


//
// Public
//
/** A chevron + title button that toggles a section. */
export class CollapseToggle {
  readonly element: HTMLButtonElement;
  private readonly _chevron: HTMLSpanElement;
  private readonly _title: HTMLSpanElement;
  private _open = true;

  /**
   * @param title - Text after the chevron ('' for none).
   * @param _onToggle - Called with the new state on every ``setOpen`` (and click).
   */
  constructor(title: string, private readonly _onToggle: (open: boolean) => void) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.dataset.collapseToggle = '';
    this.element.style.cssText =
      // min-height: the chevron has line-height 0, so without it an untitled toggle has no
      // height (hard to hit, and invisible to focus rings)
      `display:inline-flex;align-items:center;gap:4px;flex-shrink:0;padding:0 4px 0 0;` +
      `min-height:16px;` +
      `background:none;border:none;cursor:pointer;color:${COLORS.textPrimary};` +
      `font-size:12px;font-weight:700;letter-spacing:0.5px;font-family:inherit;`;

    this._chevron = document.createElement('span');
    this._chevron.style.cssText = sectionChevronStyle();
    this._title = document.createElement('span');
    this.element.append(this._chevron, this._title);
    this.setTitle(title);
    this._render();

    this.element.addEventListener('click', () => this.setOpen(!this._open));
  }

  /** True while the section is expanded. */
  get open(): boolean {
    return this._open;
  }

  /** Set the text after the chevron ('' hides it). */
  setTitle(title: string): void {
    this._title.textContent = title;
    this._title.style.display = title ? '' : 'none';
    this.element.title = title ? `Collapse / expand ${title}` : 'Collapse / expand';
  }

  /** Expand or collapse the section (updates the chevron and calls ``onToggle``). */
  setOpen(open: boolean): void {
    this._open = open;
    this._render();
    this._onToggle(open);
  }

  private _render(): void {
    this._chevron.textContent = this._open ? CHEVRON_OPEN : CHEVRON_CLOSED;
    this.element.setAttribute('aria-expanded', String(this._open));
  }
}
