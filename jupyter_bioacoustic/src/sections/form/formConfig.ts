/**
 * Small helpers for reading form config (no DOM, unit-tested).
 *
 * License: BSD 3-Clause
 */
//
// Public
//
/**
 * A form section as a list of ``{type: config}`` elements. Sections may be written as a
 * list or as a mapping (``{select: {...}, textbox: {...}}``, converted in key order).
 * Returns null for anything else.
 */
export function asElementList(raw: any): any[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.keys(raw).map(k => ({ [k]: raw[k] }));
  return null;
}


/** The output column of an input element: ``column``, else ``label``, else the type. */
export function elementColumn(type: string, cfg: any): string {
  return cfg?.column ?? cfg?.label ?? type;
}


/** Output columns of the ``required`` inputs among ``elements``. */
export function requiredColumns(elements: any[]): string[] {
  const cols: string[] = [];
  for (const item of elements) {
    if (!item || typeof item !== 'object') continue;
    const [type] = Object.keys(item);
    const cfg = item[type] ?? {};
    if (cfg.required) cols.push(elementColumn(type, cfg));
  }
  return cols;
}
