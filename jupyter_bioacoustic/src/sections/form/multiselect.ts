/**
 * Multiselect ("tags") inputs: several labels for one clip or box (no DOM, unit-tested).
 *
 * While editing, the form keeps a multiselect's value as a list of item values. Its
 * ``output.format`` decides how that list is written:
 *
 * - ``list`` (default): one column holding the list (a JSON array in CSV, a real list in
 *   parquet / JSON Lines), or a delimited string when ``output.delimiter`` is set.
 * - ``columns``: one column per item, ``<column_prefix><value>`` (no prefix by default),
 *   holding ``true_value`` / ``false_value`` (default 1 / 0): one-hot. Needs a closed item list.
 *
 * With ``items.id`` (a column of the items file) the stored value is that column, e.g. a
 * class index, and the tag shows ``items.label`` (else ``items.value``). Integer ids are
 * stored as numbers.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import {
  RawSelectItem, SelectItem, notAvailableItem, parseSelectItems, selectItemOptions,
} from './selectItems';


//
// Constants
//
const INTEGER = /^-?\d+$/;


//
// Types
//
/** How a multiselect is written to the output. */
export interface MultiselectSpec {
  /** The output column (``list``); the form's key for the tags in both formats. */
  col: string;
  format: 'list' | 'columns';
  /** ``list`` only: join the labels with this instead of writing a list. */
  delimiter: string | null;
  /** ``columns`` only: prefix of each item's column ('' for none). */
  prefix: string;
  trueValue: unknown;
  falseValue: unknown;
  /** Stored values of every item, in item order (the ``columns`` and the sort order). */
  vocabulary: string[];
  /** Stored value of the "not available" item, which excludes every other label. */
  notAvailable: string | null;
  /** Store integer ids as numbers (``items.id`` with integer values). */
  numeric: boolean;
  /** Fewest labels to submit (``required`` means at least 1). */
  min: number;
  /** Most labels allowed (null: no limit). */
  max: number | null;
}

/** A multiselect ready to build: its options, output spec and initial labels. */
export interface PreparedMultiselect {
  items: SelectItem[];
  spec: MultiselectSpec;
  initial: string[];
}


//
// Public
//
/**
 * The ``items`` config to load: with ``items.id`` the loader's value column is the id and
 * its label column the label (else value) column, so tags show names but store ids.
 */
export function multiselectItemsConfig(items: any): any {
  if (!items || typeof items !== 'object' || Array.isArray(items) || !items.id) return items;
  return { ...items, value: items.id, label: items.label ?? items.value };
}


/**
 * Parse a multiselect config and its loaded raw items (see ``multiselectItemsConfig``).
 *
 * @param cfg - The ``multiselect`` element config.
 * @param col - Its output column.
 * @param raw - Its items as loaded.
 */
export function prepareMultiselect(
  cfg: any, col: string, raw: RawSelectItem[],
): PreparedMultiselect {
  const flags = selectItemOptions(cfg.items);
  const { items } = parseSelectItems(raw, flags.notAvailable);
  const na = notAvailableItem(flags.notAvailable);
  const output = cfg.output && typeof cfg.output === 'object' ? cfg.output : {};
  const vocabulary = items.map(i => i.val);
  const spec: MultiselectSpec = {
    col,
    format: output.format === 'columns' ? 'columns' : 'list',
    delimiter: typeof output.delimiter === 'string' && output.delimiter ? output.delimiter : null,
    prefix: output.column_prefix ?? '',
    trueValue: output.true_value ?? 1,
    falseValue: output.false_value ?? 0,
    vocabulary,
    notAvailable: na ? na[0] : null,
    numeric: !!cfg.items?.id && vocabulary.length > 0 && vocabulary.every(v => INTEGER.test(v)),
    min: Math.max(Number(cfg.min) || 0, cfg.required ? 1 : 0),
    max: cfg.max == null ? null : Number(cfg.max),
  };
  const configured: unknown[] =
    Array.isArray(cfg.default) ? cfg.default : cfg.default != null ? [cfg.default] : [];
  const defaults = [...items.filter(i => i.isDefault).map(i => i.val), ...configured.map(String)];
  let initial: string[] = [];
  for (const v of defaults) initial = addLabel(spec, initial, v);
  return { items, spec, initial };
}


/**
 * ``selected`` plus ``value``. The "not available" label replaces everything else (and
 * any other label replaces it); nothing is added once ``max`` labels are chosen.
 */
export function addLabel(spec: MultiselectSpec, selected: string[], value: string): string[] {
  if (!value || selected.includes(value)) return selected;
  if (value === spec.notAvailable) return [value];
  const rest = selected.filter(v => v !== spec.notAvailable);
  if (spec.max != null && rest.length >= spec.max) return selected;
  return [...rest, value];
}


/** ``selected`` without ``value``. */
export function removeLabel(selected: string[], value: string): string[] {
  return selected.filter(v => v !== value);
}


/** True when ``selected`` has between ``min`` and ``max`` labels. */
export function selectionValid(spec: MultiselectSpec, selected: string[]): boolean {
  return selected.length >= spec.min && (spec.max == null || selected.length <= spec.max);
}


/** True when no more labels can be added. */
export function selectionFull(spec: MultiselectSpec, selected: string[]): boolean {
  return spec.max != null && selected.length >= spec.max;
}


/**
 * The output cells for ``selected``: ``{col: list}`` (labels in item order, custom labels
 * last; joined when ``delimiter`` is set) or one cell per item for ``columns``.
 */
export function encodeMultiselect(
  spec: MultiselectSpec, selected: string[],
): Record<string, unknown> {
  if (spec.format === 'columns') {
    const cells: Record<string, unknown> = {};
    for (const v of spec.vocabulary) {
      cells[spec.prefix + v] = selected.includes(v) ? spec.trueValue : spec.falseValue;
    }
    return cells;
  }
  const rank = (v: string) => {
    const i = spec.vocabulary.indexOf(v);
    return i < 0 ? spec.vocabulary.length : i;
  };
  const ordered = [...selected].sort((a, b) => rank(a) - rank(b));
  if (spec.delimiter) return { [spec.col]: ordered.join(spec.delimiter) };
  return { [spec.col]: spec.numeric ? ordered.map(Number) : ordered };
}


/**
 * ``row`` with each multiselect's list replaced by its output cells, in place of the
 * list's column (so the column order of the form is kept).
 */
export function encodeRow(
  row: Record<string, any>, specs: Map<string, MultiselectSpec>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const spec = specs.get(key);
    if (spec && Array.isArray(value)) Object.assign(out, encodeMultiselect(spec, value));
    else out[key] = value;
  }
  return out;
}


/**
 * The labels in a stored (or source-data) value: a list, a JSON array string, a string
 * joined by ``delimiter``, or a single label. Empty values give [].
 */
export function decodeMultiselect(value: unknown, delimiter: string | null): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // not JSON: fall through
    }
  }
  if (delimiter) return text.split(delimiter).map(s => s.trim()).filter(Boolean);
  return [text];
}


/** The labels of a ``columns``-format row: the items whose column holds ``trueValue``. */
export function decodeColumns(spec: MultiselectSpec, row: Record<string, any>): string[] {
  const yes = String(spec.trueValue).toLowerCase();
  return spec.vocabulary.filter(v => String(row[spec.prefix + v] ?? '').toLowerCase() === yes);
}
