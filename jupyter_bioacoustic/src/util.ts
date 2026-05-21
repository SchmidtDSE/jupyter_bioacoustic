/**
 * Small stateless utilities used across sections.
 */
import { COLORS, btnStyle } from './styles';

/** Format a time in seconds as "m:ss.cc" (with leading - sign if negative). */
export function fmtTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = Math.floor(abs % 60).toString().padStart(2, '0');
  const cs = Math.floor((abs % 1) * 100).toString().padStart(2, '0');
  return `${sign}${m}:${sec}.${cs}`;
}

/** Escape a string for use inside a single-quoted Python string literal. */
export function escPy(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export interface AccuracyConfig {
  column: string;
  value: string | null;
}

export function parseAccuracyConfig(progressTracker: any): AccuracyConfig | null {
  if (!progressTracker || progressTracker === true) return null;

  if (typeof progressTracker === 'string') {
    return { column: progressTracker, value: null };
  }

  if (typeof progressTracker === 'object') {
    const acc = progressTracker.accuracy;
    if (!acc) return null;
    if (typeof acc === 'string') {
      return { column: acc, value: null };
    }
    if (typeof acc === 'object' && acc.column) {
      return { column: acc.column, value: acc.value != null ? String(acc.value) : null };
    }
  }
  return null;
}

const TEMPLATE_RE = /\[\[([^\]]+)\]\]/g;

/** Replace [[column_name]] placeholders with values from a row object. */
export function resolveTemplate(template: string, row: Record<string, any>): string {
  return template.replace(TEMPLATE_RE, (_, col: string) => {
    const val = row[col.trim()];
    return val !== undefined ? String(val) : `[[${col}]]`;
  });
}

/** Return true if the string contains at least one [[...]] placeholder. */
export function hasTemplatePlaceholders(text: string): boolean {
  TEMPLATE_RE.lastIndex = 0;
  return TEMPLATE_RE.test(text);
}

const _TRUTHY_WORDS = new Set(['yes', 'valid', 'true']);
const _IS_PREFIXES = ['is', 'is ', 'is-', 'is_'];

export function isTruthyValue(val: any): boolean {
  if (val === true) return true;
  if (val === 1) return true;
  if (typeof val === 'number') return false;

  const s = String(val).trim().toLowerCase();
  if (s === '' || s === 'null' || s === 'undefined' || s === 'none') return false;

  const n = parseFloat(s);
  if (!isNaN(n)) return n === 1 || s === '1.0';

  if (_TRUTHY_WORDS.has(s)) return true;
  for (const prefix of _IS_PREFIXES) {
    if (s.startsWith(prefix) && _TRUTHY_WORDS.has(s.slice(prefix.length))) return true;
  }

  return false;
}


export interface DialogButton {
  label: string;
  primary?: boolean;
}

export function showDialog(opts: {
  title?: string;
  body: string;
  buttons?: DialogButton[];
}): Promise<string | null> {
  const buttons = opts.buttons ?? [{ label: 'OK', primary: true }];

  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText =
      `position:fixed;inset:0;z-index:100000;display:flex;align-items:center;` +
      `justify-content:center;background:rgba(0,0,0,0.55);`;

    const card = document.createElement('div');
    card.style.cssText =
      `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};border-radius:8px;` +
      `padding:20px 24px;max-width:520px;width:90%;max-height:80vh;display:flex;` +
      `flex-direction:column;gap:12px;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;

    if (opts.title) {
      const h = document.createElement('div');
      h.textContent = opts.title;
      h.style.cssText =
        `font-size:14px;font-weight:700;color:${COLORS.textPrimary};`;
      card.appendChild(h);
    }

    const bodyEl = document.createElement('div');
    bodyEl.style.cssText =
      `font-size:12px;color:${COLORS.textSubtle};white-space:pre-wrap;` +
      `overflow-y:auto;max-height:50vh;line-height:1.5;`;
    bodyEl.textContent = opts.body;
    card.appendChild(bodyEl);

    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:8px;justify-content:flex-end;margin-top:4px;`;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.style.cssText = btnStyle(b.primary);
      btn.addEventListener('click', () => { backdrop.remove(); resolve(b.label); });
      row.appendChild(btn);
    }
    card.appendChild(row);

    backdrop.appendChild(card);
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { backdrop.remove(); resolve(null); }
    });
    document.body.appendChild(backdrop);
    const firstPrimary = row.querySelector('button:last-child') as HTMLButtonElement | null;
    firstPrimary?.focus();
  });
}
