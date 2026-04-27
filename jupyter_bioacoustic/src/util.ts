/**
 * Small stateless utilities used across sections.
 */

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
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
