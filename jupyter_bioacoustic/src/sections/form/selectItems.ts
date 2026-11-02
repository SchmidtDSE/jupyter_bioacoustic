/**
 * Select-item parsing for form ``select`` inputs (no DOM, unit-tested).
 *
 * A select's ``items`` can be a list (strings, ``{label, value, form}`` objects or legacy
 * ``{value: label}`` pairs), a numeric range ``{min, max, step}``, or a file
 * (``'path.csv'`` / ``{path, value, label}``) loaded in the kernel. Any item may be marked
 * as the default with a ``selected::`` prefix; ``items.not_available`` prepends a
 * "not available" choice.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { splitSelected } from '../../util';


//
// Constants
//
const NOT_AVAILABLE = 'not-available';


//
// Types
//
/** A raw item: ``[value, label, formRef?]`` (formRef: dynamic form shown when chosen). */
export type RawSelectItem = [string, string, string?];

/** A parsed option. */
export interface SelectItem {
  val: string;
  label: string;
  /** Name of the dynamic form section shown while this item is selected. */
  formRef?: string;
  /** Marked ``selected::`` (the default). */
  isDefault: boolean;
}

/** The ``items`` options that change the widget (only when ``items`` is an object). */
export interface SelectItemOptions {
  filterBox: boolean;
  customValue: boolean;
  notAvailable: unknown;
}

/** Loads ``[value, label]`` pairs from a file in the kernel. */
export type SelectFileLoader = (
  path: string, valueCol?: string, labelCol?: string,
) => Promise<RawSelectItem[]>;


//
// Public
//
/** The ``filter_box`` / ``custom_value`` / ``not_available`` flags of a select's ``items``. */
export function selectItemOptions(itemsCfg: any): SelectItemOptions {
  const isObj = !!itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg);
  return {
    filterBox: isObj && !!itemsCfg.filter_box,
    customValue: isObj && !!itemsCfg.custom_value,
    notAvailable: isObj ? itemsCfg.not_available : undefined,
  };
}


/**
 * Resolve ``items`` to raw ``[value, label, formRef?]`` tuples, loading files with
 * ``loadFile``. Unknown shapes give [].
 */
export async function loadRawSelectItems(
  items: any, loadFile: SelectFileLoader,
): Promise<RawSelectItem[]> {
  if (!items) return [];
  if (Array.isArray(items)) return items.map(_rawItem);
  if (typeof items === 'string') return loadFile(items);
  if (typeof items === 'object') {
    if ('max' in items) {
      const min = items.min ?? 0;
      const max = items.max;
      const step = items.step ?? 1;
      const result: RawSelectItem[] = [];
      for (let i = min; i <= max; i += step) result.push([String(i), String(i)]);
      return result;
    }
    if ('path' in items) return loadFile(items.path, items.value, items.label);
  }
  return [];
}


/**
 * The ``[value, label]`` of the "not available" choice for an ``items.not_available``
 * setting (``true``, a string, or ``{label, value}``), or null when it is off.
 */
export function notAvailableItem(cfg: unknown): RawSelectItem | null {
  if (!cfg) return null;
  if (typeof cfg === 'string') return [cfg, cfg];
  if (cfg !== true && typeof cfg === 'object') {
    const o = cfg as { label?: string; value?: string };
    const label = o.label ?? NOT_AVAILABLE;
    return [o.value ?? label, label];
  }
  return [NOT_AVAILABLE, NOT_AVAILABLE];
}


/**
 * Parse raw items into options (stripping ``selected::``), with the "not available" choice
 * first when configured.
 *
 * @returns The options and the default value ('' when none is marked).
 */
export function parseSelectItems(
  raw: RawSelectItem[], notAvailable: unknown,
): { items: SelectItem[]; selectedDefault: string } {
  const all = [...raw];
  const na = notAvailableItem(notAvailable);
  if (na) all.unshift(na);
  let selectedDefault = '';
  const items = all.map(([v, l, formRef]) => {
    const { value, selected } = splitSelected(v);
    if (selected) selectedDefault = value;
    return { val: value, label: splitSelected(l).value, formRef, isDefault: selected };
  });
  return { items, selectedDefault };
}


/** True if ``text`` equals an option's value or label (case-insensitive). */
export function hasExactItem(items: SelectItem[], text: string): boolean {
  const t = text.toLowerCase();
  return items.some(item => item.val.toLowerCase() === t || item.label.toLowerCase() === t);
}


//
// Internal
//
/** One list entry as a raw item. */
function _rawItem(item: any): RawSelectItem {
  if (typeof item === 'string') return [item, item];
  if (typeof item === 'object' && item !== null) {
    // {label, value, form} / {label, form}, or legacy {value: label}
    if ('label' in item || 'form' in item) {
      const label = item.label ?? item.value ?? '';
      const value = item.value ?? item.label ?? '';
      return [String(value), String(label), item.form as string | undefined];
    }
    const [k] = Object.keys(item);
    return [k, String(item[k])];
  }
  return [String(item), String(item)];
}
