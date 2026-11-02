/**
 * Small stateless utilities shared by the annotator and the config builder: escaping,
 * formatting, ``[[column]]`` templates, truthiness rules, and the ``showDialog`` message box.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { DialogButton, showMessage } from './modal';


//
// Constants
//
/** Matches a ``[[column]]`` / ``[[column||default]]`` template placeholder. */
const TEMPLATE_RE = /\[\[([^\]]+)\]\]/g;
/** Separates a placeholder's column from its default value. */
const DEFAULT_SEP = '||';
/** Words that count as "true" for accuracy / truthiness checks. */
const TRUTHY_WORDS = new Set(['yes', 'valid', 'true']);
/** Prefixes allowed before a truthy word (``is valid``, ``is-true``, ...). */
const IS_PREFIXES = ['is', 'is ', 'is-', 'is_'];
/** Prefix marking the default item of a select / resolution list (``selected::value``). */
export const SELECTED_PREFIX = 'selected::';


//
// Types
//
export type { DialogButton } from './modal';

/** Parsed ``progress_tracker.accuracy`` setting. */
export interface AccuracyConfig {
  /** Output column whose values are checked. */
  column: string;
  /** Value that counts as correct (case-insensitive), or null to use ``isTruthyValue``. */
  value: string | null;
}

/** The kind of remote location a path points at (see ``remoteScheme``). */
export type RemoteScheme = 'url' | 's3' | 'gcs';


//
// Public
//
/**
 * Stop JupyterLab keyboard shortcuts from firing for keys typed inside ``node``. Used for
 * widgets shown inline in a notebook output: there, with a canvas / select / checkbox
 * focused, notebook command-mode shortcuts would otherwise run (``d d`` deletes the cell,
 * ``0 0`` restarts the kernel).
 *
 * JupyterLab handles shortcuts in the capture phase (before the widget sees the key), so
 * the only off-switch is Lumino's ``data-lm-suppress-shortcuts`` attribute — and Lumino
 * only honours it on the focused element itself (it stops at the first element matching a
 * binding's selector). So every element that receives focus inside ``node`` is marked.
 */
export function suppressNotebookShortcuts(node: HTMLElement): void {
  const mark = (el: EventTarget | null) => {
    if (el instanceof HTMLElement) el.setAttribute('data-lm-suppress-shortcuts', 'true');
  };
  mark(node);
  node.addEventListener('focusin', e => mark(e.target));
}


/**
 * ``text`` as a number, or ``fallback`` when it's blank or not a number. Unlike
 * ``parseInt(text) || fallback`` it keeps 0 and decimals (``min: 0`` used to become 1).
 */
export function numberOr(text: string, fallback: number): number {
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) ? n : fallback;
}


/** Escape text for HTML content and attribute values (never put raw data in innerHTML). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/** The message of a caught error (``catch (e: unknown)``), for status lines and dialogs. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}


/** ``name`` as a snake_case slug (lowercase, non-alphanumerics -> ``_``), matching core.py's slugs. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}


/** Format a time in seconds as "m:ss.cc", or "h:mm:ss.cc" from one hour up. */
export function fmtTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = Math.floor(abs % 60).toString().padStart(2, '0');
  const cs = Math.floor((abs % 1) * 100).toString().padStart(2, '0');
  if (h > 0) {
    const mm = m.toString().padStart(2, '0');
    return `${sign}${h}:${mm}:${sec}.${cs}`;
  }
  return `${sign}${m}:${sec}.${cs}`;
}


/** Escape a string for use inside a single-quoted Python string literal. */
export function escPy(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}


/**
 * Where ``path`` lives remotely: ``'url'`` (http/https), ``'s3'`` or ``'gcs'`` (gs://), or
 * null for a local path.
 */
export function remoteScheme(path: string): RemoteScheme | null {
  if (/^https?:\/\//.test(path)) return 'url';
  if (path.startsWith('s3://')) return 's3';
  if (path.startsWith('gs://')) return 'gcs';
  return null;
}


/**
 * Split a ``selected::value`` list item into its value and whether it is the default.
 *
 * @example splitSelected('selected::2000') // { value: '2000', selected: true }
 */
export function splitSelected(raw: string): { value: string; selected: boolean } {
  return raw.startsWith(SELECTED_PREFIX)
    ? { value: raw.slice(SELECTED_PREFIX.length), selected: true }
    : { value: raw, selected: false };
}


/**
 * Parse a form's ``progress_tracker`` setting into its accuracy check.
 *
 * @param progressTracker - ``true`` (counts only), a column name, or ``{accuracy: column}`` /
 *     ``{accuracy: {column, value}}``.
 * @returns The accuracy check, or null when none is configured.
 */
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


/** Replace [[column_name]] and [[column||default]] placeholders with row values. */
export function resolveTemplate(template: string, row: Record<string, any>): string {
  return template.replace(TEMPLATE_RE, (match, raw: string) => {
    let key: string;
    let fallback: string | undefined;
    if (raw.includes(DEFAULT_SEP)) {
      const idx = raw.indexOf(DEFAULT_SEP);
      key = raw.slice(0, idx).trim();
      fallback = raw.slice(idx + DEFAULT_SEP.length).trim();
    } else {
      key = raw.trim();
    }
    const val = row[key];
    if (val !== undefined) return String(val);
    if (fallback !== undefined) return fallback;
    return match;
  });
}


/** Return true if the string contains at least one [[...]] placeholder. */
export function hasTemplatePlaceholders(text: string): boolean {
  TEMPLATE_RE.lastIndex = 0;
  return TEMPLATE_RE.test(text);
}


/**
 * Whether a cell value means "yes": ``true``, ``1`` / ``'1.0'``, ``yes`` / ``valid`` / ``true``
 * (case-insensitive), optionally prefixed with ``is`` (``is valid``, ``is_true``...).
 */
export function isTruthyValue(val: any): boolean {
  if (val === true) return true;
  if (val === 1) return true;
  if (typeof val === 'number') return false;

  const s = String(val).trim().toLowerCase();
  if (s === '' || s === 'null' || s === 'undefined' || s === 'none') return false;

  const n = parseFloat(s);
  if (!isNaN(n)) return n === 1 || s === '1.0';

  if (TRUTHY_WORDS.has(s)) return true;
  for (const prefix of IS_PREFIXES) {
    if (s.startsWith(prefix) && TRUTHY_WORDS.has(s.slice(prefix.length))) return true;
  }

  return false;
}


/**
 * Show a themed message box (see ``modal.showMessage``).
 *
 * @param opts.title - Heading.
 * @param opts.body - Plain-text message.
 * @param opts.buttons - Buttons, left to right (default: a single "OK").
 * @returns The clicked button's label, or null if dismissed with Escape.
 */
export function showDialog(opts: {
  title?: string;
  body: string;
  buttons?: DialogButton[];
}): Promise<string | null> {
  return showMessage(opts);
}
