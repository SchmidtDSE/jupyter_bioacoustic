/**
 * Keyboard helpers for the annotator (no DOM state, unit-tested): hot key parsing, the
 * select options a ``hot_keys`` map points at, and which elements take typed text (where
 * j / k, arrows and hot keys must not be intercepted).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { SelectItem } from './selectItems';


//
// Constants
//
/** ``<input>`` types that take typed text. */
const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel']);


//
// Types
//
/** A select option reached by a hot key. */
export interface PinnedItem {
  key: string;
  item: SelectItem;
}


//
// Public
//
/** A hot key as the single character ``KeyboardEvent.key`` gives, or null when invalid. */
export function normalizeHotKey(raw: unknown): string | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  const key = String(raw);
  return key.length === 1 && key !== ' ' ? key : null;
}


/**
 * The options a select's ``hot_keys`` map (key -> value) points at, in the map's order. A
 * value matches an item's value first, then its label; keys that are invalid or match no
 * item are skipped.
 */
export function resolveHotKeys(hotKeys: unknown, items: SelectItem[]): PinnedItem[] {
  if (!hotKeys || typeof hotKeys !== 'object' || Array.isArray(hotKeys)) return [];
  const out: PinnedItem[] = [];
  for (const [rawKey, rawValue] of Object.entries(hotKeys as Record<string, unknown>)) {
    const key = normalizeHotKey(rawKey);
    if (!key || rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue);
    const item = items.find(i => i.val === value) ?? items.find(i => i.label === value);
    if (item) out.push({ key, item });
  }
  return out;
}


/** True when ``el`` takes typed text (text-like inputs, textareas, editable content). */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return true;
  return el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type);
}


/** True for a key press with Ctrl, Meta or Alt (left to the browser / JupyterLab). */
export function hasCommandModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}
