import { COLORS } from '../styles';

const DEFAULT_DESCRIPTION_TITLE = 'Description';

export interface DescriptionConfig {
  title: string;
  text: string;
  open: boolean;
}

export function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inList: 'ol' | 'ul' | '' = '';
  let inCode = false;

  const inline = (s: string): string =>
    s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const closeList = () => {
    if (inList) { out.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = ''; }
  };

  let baseIndent = -1;
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length > 0) {
    baseIndent = Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)![1].length));
  }
  const deindent = (s: string): string =>
    baseIndent > 0 && s.length >= baseIndent ? s.slice(baseIndent) : s;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { closeList(); out.push('<pre><code>'); inCode = true; }
      continue;
    }
    if (inCode) {
      const codeLine = deindent(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      out.push(codeLine);
      continue;
    }

    if (/^\s*$/.test(trimmed)) { closeList(); continue; }

    if (/^---+$/.test(trimmed.trim()) || /^\*\*\*+$/.test(trimmed.trim()) || /^___+$/.test(trimmed.trim())) {
      closeList();
      out.push('<hr>');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      continue;
    }

    const olMatch = trimmed.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }

    const ulMatch = trimmed.match(/^\s*[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
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
      `padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgMantle};color:${COLORS.textPrimary};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};` +
      `display:flex;align-items:center;gap:6px;`;

    this._chevron = document.createElement('span');
    this._chevron.style.cssText =
      `font-size:20px;line-height:0;margin-top:-3px;color:${COLORS.textMuted};flex-shrink:0;width:16px;text-align:center;`;
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
    if (!cfg.text) {
      this.element.style.display = 'none';
      return;
    }

    const title = cfg.title || DEFAULT_DESCRIPTION_TITLE;
    const summary = this.element.querySelector('summary')!;
    const titleSpan = summary.querySelector('span:last-child') as HTMLSpanElement | null;
    if (titleSpan && titleSpan !== this._chevron) {
      titleSpan.textContent = title;
    } else {
      const s = document.createElement('span');
      s.textContent = title;
      summary.appendChild(s);
    }

    if (cfg.text) {
      this._body.innerHTML = renderMarkdown(cfg.text);
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
        `color:${COLORS.textPrimary};margin:12px 0 6px;font-weight:700;`;
    }
    for (const h1 of this._body.querySelectorAll('h1')) {
      (h1 as HTMLElement).style.fontSize = '15px';
    }
    for (const h2 of this._body.querySelectorAll('h2')) {
      (h2 as HTMLElement).style.fontSize = '14px';
    }
    for (const h3 of this._body.querySelectorAll('h3')) {
      (h3 as HTMLElement).style.fontSize = '13px';
    }
    for (const p of this._body.querySelectorAll('p')) {
      (p as HTMLElement).style.cssText = `margin:6px 0;color:${COLORS.textPrimary};`;
    }
    for (const a of this._body.querySelectorAll('a')) {
      (a as HTMLElement).style.cssText = `color:${COLORS.blue};text-decoration:underline;`;
    }
    for (const ol of this._body.querySelectorAll('ol,ul')) {
      (ol as HTMLElement).style.cssText = `margin:6px 0;padding-left:24px;color:${COLORS.textPrimary};`;
    }
    for (const li of this._body.querySelectorAll('li')) {
      (li as HTMLElement).style.cssText = `margin:2px 0;color:${COLORS.textPrimary};`;
    }
    for (const code of this._body.querySelectorAll('pre > code')) {
      (code as HTMLElement).style.cssText = `color:${COLORS.textPrimary};font-size:12px;background:transparent;padding:0;border-radius:0;display:block;`;
    }
    for (const code of this._body.querySelectorAll('code')) {
      if ((code as HTMLElement).parentElement?.tagName !== 'PRE') {
        (code as HTMLElement).style.cssText =
          `background:${COLORS.bgSurface0};color:${COLORS.textPrimary};padding:1px 4px;border-radius:3px;font-size:12px;`;
      }
    }
    for (const pre of this._body.querySelectorAll('pre')) {
      (pre as HTMLElement).style.cssText =
        `background:${COLORS.bgSurface0};color:${COLORS.textPrimary};padding:8px 12px;border-radius:4px;overflow-x:auto;font-size:12px;margin:6px 0;`;
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
