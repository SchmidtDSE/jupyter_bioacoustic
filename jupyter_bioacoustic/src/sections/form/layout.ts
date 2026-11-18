/**
 * Layout containers for form elements (parsing and styling; no DOM, unit-tested).
 *
 * - ``row``: its items side by side (wrapping when they don't fit).
 * - ``column``: its items stacked.
 * - ``grid``: its items filling ``columns`` aligned columns, left to right, top to bottom.
 *
 * Each takes a list of elements, or ``{items, gap, align}`` (``grid`` also ``columns``).
 * Containers nest: a column of rows of different lengths gives e.g. 3 / 2 / 3 per line.
 * ``gap`` is px (or a CSS size); ``align`` is ``start`` / ``center`` / ``end`` (along the row,
 * across the column, within each grid cell).
 *
 * Button keys, passed on to the buttons inside (a button's own ``column`` wins):
 * ``column`` (the output column), ``unique`` (a container with ``unique`` makes its buttons
 * one group: ``true`` = pressing one un-presses the others, ``false`` = any number pressed)
 * and ``delimiter`` (joins the pressed values of a non-unique shared column; default ``,``).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { cssSize } from '../../styles';
import { asElementList } from './formConfig';


//
// Constants
//
/** The layout container element types. */
export const LAYOUT_TYPES: ReadonlySet<string> = new Set(['row', 'column', 'grid']);

const DEFAULT_GAP: Record<LayoutKind, number> = { row: 8, column: 6, grid: 6 };
/** Joins the pressed values of a non-unique group's shared column. */
export const DEFAULT_DELIMITER = ',';
const FLEX_ALIGN: Record<LayoutAlign, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
};


//
// Types
//
export type LayoutKind = 'row' | 'column' | 'grid';
export type LayoutAlign = 'start' | 'center' | 'end';

/** A parsed layout container. */
export interface Layout {
  kind: LayoutKind;
  /** The contained elements (``{type: config}`` dicts). */
  items: any[];
  gap: number | string;
  align: LayoutAlign;
  /** Grid columns (``grid`` only; defaults to one row of all its items). */
  columns: number;
  /** Output column for the buttons inside that don't set one. */
  column: string | null;
  /** Set: the buttons inside form one group (unique or not); unset: inherited / per column. */
  unique: boolean | null;
  delimiter: string | null;
}


//
// Public
//
/** Parse a ``row`` / ``column`` / ``grid`` element; null if ``type`` isn't one or has no items. */
export function parseLayout(type: string, raw: any): Layout | null {
  if (!LAYOUT_TYPES.has(type)) return null;
  const kind = type as LayoutKind;
  const isList = Array.isArray(raw);
  const opts = !isList && raw && typeof raw === 'object' ? raw : {};
  const items = asElementList(isList ? raw : opts.items);
  if (!items) return null;
  const cols = Number(opts.columns);
  return {
    kind,
    items,
    gap: opts.gap ?? DEFAULT_GAP[kind],
    align: ['start', 'center', 'end'].includes(opts.align) ? opts.align : 'start',
    columns: Number.isInteger(cols) && cols > 0 ? cols : Math.max(1, items.length),
    column: opts.column != null && opts.column !== '' ? String(opts.column) : null,
    unique: typeof opts.unique === 'boolean' ? opts.unique : null,
    delimiter: opts.delimiter != null ? String(opts.delimiter) : null,
  };
}


/** Inline CSS for a layout container. */
export function layoutStyle(layout: Layout): string {
  // containers fill the form's width: a click beside their items still lands on them
  const gap = `gap:${cssSize(layout.gap)};`;
  const align = FLEX_ALIGN[layout.align];
  if (layout.kind === 'grid') {
    return (
      `display:grid;grid-template-columns:repeat(${layout.columns},max-content);` +
      `align-items:center;justify-items:${layout.align};${gap}`
    );
  }
  if (layout.kind === 'row') {
    return (
      `display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;` +
      `justify-content:${align};${gap}`
    );
  }
  return `display:flex;flex-direction:column;align-items:${align};${gap}`;
}


/**
 * ``elements`` with every row / column / grid replaced by its items (recursively), for the
 * code that only needs the inputs (required columns, the compact per-box form).
 */
export function flattenLayout(elements: any[]): any[] {
  const out: any[] = [];
  for (const item of elements) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const [type] = Object.keys(item);
      const layout = parseLayout(type, item[type]);
      if (layout) {
        out.push(...flattenLayout(layout.items));
        continue;
      }
    }
    out.push(item);
  }
  return out;
}
