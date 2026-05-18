import { COLORS } from '../../styles';

const S = {
  section: `padding:6px 10px;`,
  sectionTitle:
    `font-size:11px;font-weight:700;letter-spacing:0.6px;color:${COLORS.textMuted};` +
    `text-transform:uppercase;margin-bottom:2px;`,
  row: `display:flex;align-items:baseline;gap:6px;padding:1px 0;font-size:11px;line-height:1.5;`,
  key: `color:${COLORS.textSubtle};min-width:90px;flex-shrink:0;`,
  val: `color:${COLORS.textPrimary};word-break:break-word;`,
  muted: `color:${COLORS.textMuted};font-style:italic;`,
  hr: `border:none;border-top:1px solid ${COLORS.bgSurface0};margin:0;`,
  tag: `display:inline-block;background:${COLORS.bgSurface1};border-radius:3px;` +
    `padding:0 5px;font-size:10px;color:${COLORS.blue};margin-right:3px;`,
  dynTag: `display:inline-block;background:${COLORS.bgSurface0};border-radius:3px;` +
    `padding:0 5px;font-size:10px;color:${COLORS.mauve};margin-right:3px;`,
  indent: `margin-left:16px;padding-left:8px;border-left:2px solid ${COLORS.bgSurface1};`,
};

interface SummaryRow {
  key?: string;
  value?: string;
  muted?: boolean;
  tag?: string;
  children?: SummaryRow[];
}

interface SummarySection {
  title: string;
  rows: SummaryRow[];
}

export class ConfigSummary {
  readonly element: HTMLDetailsElement;
  private _body: HTMLDivElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.open = true;
    this.element.style.cssText =
      `border-top:2px solid ${COLORS.teal};margin-top:4px;`;

    const summary = document.createElement('summary');
    summary.textContent = 'Configuration Summary';
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgCrust};color:${COLORS.teal};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    this._body = document.createElement('div');
    this._body.style.cssText =
      `background:${COLORS.bgCrust};display:flex;flex-direction:column;`;

    this.element.append(summary, this._body);
  }

  update(sections: SummarySection[]): void {
    this._body.innerHTML = '';
    for (let i = 0; i < sections.length; i++) {
      if (i > 0) this._hr();
      this._renderSection(sections[i]);
    }
  }

  private _hr(): void {
    const hr = document.createElement('hr');
    hr.style.cssText = S.hr;
    this._body.appendChild(hr);
  }

  private _renderSection(section: SummarySection): void {
    const sec = document.createElement('div');
    sec.style.cssText = S.section;
    const t = document.createElement('div');
    t.style.cssText = S.sectionTitle;
    t.textContent = section.title;
    sec.appendChild(t);

    for (const row of section.rows) {
      this._renderRow(sec, row);
    }
    this._body.appendChild(sec);
  }

  private _renderRow(parent: HTMLElement, row: SummaryRow): void {
    const key = row.key || '';
    const value = row.value || '';
    const tag = row.tag || '';
    const muted = row.muted || false;

    if (key === 'FORM') {
      const header = document.createElement('div');
      header.style.cssText = S.sectionTitle + `margin-top:4px;`;
      header.textContent = 'FORM';
      parent.appendChild(header);
      const wrap = document.createElement('div');
      wrap.style.cssText = S.indent;
      for (const child of row.children || []) {
        this._renderRow(wrap, child);
      }
      parent.appendChild(wrap);
      return;
    }

    if (tag === 'dynamic') {
      const wrap = document.createElement('div');
      wrap.style.cssText = S.indent;
      const header = document.createElement('div');
      header.style.cssText = S.row;
      header.innerHTML =
        `<span style="${S.dynTag}">${this._esc(value)}</span>`;
      wrap.appendChild(header);
      for (const child of row.children || []) {
        this._renderRow(wrap, child);
      }
      parent.appendChild(wrap);
      return;
    }

    const el = document.createElement('div');
    el.style.cssText = S.row;

    if (tag) {
      el.innerHTML =
        `<span style="${S.tag}">${this._esc(tag)}</span>` +
        `<span style="${S.val}">${this._esc(value)}</span>`;
    } else if (key) {
      const k = document.createElement('span');
      k.style.cssText = S.key;
      k.textContent = key;
      const v = document.createElement('span');
      v.style.cssText = muted ? S.muted : S.val;
      v.textContent = value;
      el.append(k, v);
    } else if (value) {
      const v = document.createElement('span');
      v.style.cssText = muted ? S.muted : S.val;
      v.textContent = value;
      el.appendChild(v);
    }

    parent.appendChild(el);

    if (row.children) {
      const wrap = document.createElement('div');
      wrap.style.cssText = S.indent;
      for (const child of row.children) {
        this._renderRow(wrap, child);
      }
      parent.appendChild(wrap);
    }
  }

  private _esc(s: string): string {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }
}
