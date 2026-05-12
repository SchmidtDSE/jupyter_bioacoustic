import { marked } from 'marked';
import { COLORS } from '../styles';

export interface DescriptionConfig {
  title: string;
  text: string;
  open: boolean;
}

export class DescriptionPanel {
  readonly element: HTMLDetailsElement;
  private _body: HTMLDivElement;
  private _chevron: HTMLSpanElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.style.cssText =
      `border-bottom:1px solid ${COLORS.bgSurface0};flex-shrink:0;`;

    const summary = document.createElement('summary');
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgMantle};color:${COLORS.textPrimary};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};` +
      `display:flex;align-items:center;gap:6px;`;

    this._chevron = document.createElement('span');
    this._chevron.style.cssText =
      `font-size:10px;color:${COLORS.textMuted};flex-shrink:0;width:12px;text-align:center;`;
    this._chevron.textContent = '▾';

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:10px 16px;background:${COLORS.bgBase};color:${COLORS.textPrimary};` +
      `font-size:13px;line-height:1.6;overflow-y:auto;`;

    summary.appendChild(this._chevron);
    this.element.appendChild(summary);
    this.element.appendChild(this._body);

    this.element.addEventListener('toggle', () => {
      this._chevron.textContent = this.element.open ? '▾' : '▸';
    });

    this.element.style.display = 'none';
  }

  setConfig(cfg: DescriptionConfig, height?: number): void {
    if (!cfg.title && !cfg.text) {
      this.element.style.display = 'none';
      return;
    }

    const summary = this.element.querySelector('summary')!;
    const titleSpan = summary.querySelector('span:last-child') as HTMLSpanElement | null;
    if (titleSpan && titleSpan !== this._chevron) {
      titleSpan.textContent = cfg.title || 'Description';
    } else {
      const s = document.createElement('span');
      s.textContent = cfg.title || 'Description';
      summary.appendChild(s);
    }

    if (cfg.text) {
      this._body.innerHTML = marked.parse(cfg.text) as string;
      this._applyContentStyles();
    }

    if (height) {
      this._body.style.maxHeight = `${height}px`;
    }

    this.element.open = cfg.open;
    this._chevron.textContent = cfg.open ? '▾' : '▸';
    this.element.style.display = '';
  }

  private _applyContentStyles(): void {
    for (const h of this._body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      (h as HTMLElement).style.cssText =
        `color:${COLORS.textPrimary};margin:12px 0 6px;font-size:14px;`;
    }
    for (const p of this._body.querySelectorAll('p')) {
      (p as HTMLElement).style.cssText = `margin:6px 0;color:${COLORS.textPrimary};`;
    }
    for (const a of this._body.querySelectorAll('a')) {
      (a as HTMLElement).style.cssText = `color:${COLORS.blue};text-decoration:underline;`;
      (a as HTMLAnchorElement).target = '_blank';
      (a as HTMLAnchorElement).rel = 'noopener noreferrer';
    }
    for (const ol of this._body.querySelectorAll('ol,ul')) {
      (ol as HTMLElement).style.cssText = `margin:6px 0;padding-left:24px;`;
    }
    for (const li of this._body.querySelectorAll('li')) {
      (li as HTMLElement).style.cssText = `margin:2px 0;color:${COLORS.textPrimary};`;
    }
    for (const code of this._body.querySelectorAll('code')) {
      (code as HTMLElement).style.cssText =
        `background:${COLORS.bgSurface0};color:${COLORS.textPrimary};padding:1px 4px;border-radius:3px;font-size:12px;`;
    }
    for (const pre of this._body.querySelectorAll('pre')) {
      (pre as HTMLElement).style.cssText =
        `background:${COLORS.bgSurface0};color:${COLORS.textPrimary};padding:8px 12px;border-radius:4px;overflow-x:auto;font-size:12px;`;
    }
    for (const strong of this._body.querySelectorAll('strong')) {
      (strong as HTMLElement).style.color = COLORS.textPrimary;
    }
    for (const em of this._body.querySelectorAll('em')) {
      (em as HTMLElement).style.color = COLORS.textPrimary;
    }
    for (const hr of this._body.querySelectorAll('hr')) {
      (hr as HTMLElement).style.cssText = `border:none;border-top:1px solid ${COLORS.bgSurface1};margin:12px 0;`;
    }
  }
}
