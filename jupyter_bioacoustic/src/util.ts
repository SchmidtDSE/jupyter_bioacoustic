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
