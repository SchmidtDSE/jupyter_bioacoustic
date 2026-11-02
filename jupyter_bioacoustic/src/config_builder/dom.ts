/**
 * Small DOM factories for the config builder's forms (rows, labels, inputs, selects, buttons),
 * styled with the shared ``styles.ts`` helpers so every section looks the same.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, btnStyle, inputStyle, selectStyle } from '../styles';


//
// Public
//
/** A horizontal, wrapping row for a label and its control(s). */
export function makeRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
  return row;
}


/**
 * A fixed-width field label.
 *
 * @param text - Label text (usually the YAML key).
 * @param required - Colour it as a required field.
 */
export function makeLabel(text: string, required = false): HTMLLabelElement {
  const lbl = document.createElement('label');
  lbl.textContent = text;
  lbl.style.cssText =
    `color:${required ? COLORS.teal : COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
  return lbl;
}


/**
 * A text input (``inputStyle`` with the builder's roomier padding).
 *
 * @param placeholder - Placeholder text.
 * @param width - CSS width.
 */
export function makeInput(placeholder = '', width = '200px'): HTMLInputElement {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = placeholder;
  inp.style.cssText = inputStyle(width) + `padding:4px 8px;`;
  return inp;
}


/**
 * A select with one option per value.
 *
 * @param options - Option values (also used as their text).
 * @param selected - Value to select initially.
 */
export function makeSelect(options: readonly string[], selected?: string): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.style.cssText = selectStyle() + `padding:4px 6px;`;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}


/**
 * A button (``btnStyle``).
 *
 * @param text - Button text.
 * @param primary - Use the highlighted primary style.
 */
export function makeButton(text: string, primary = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = btnStyle(primary);
  return btn;
}


/**
 * Replace a select's options with ``values`` (value = text). Does not change the selection;
 * callers restore it afterwards.
 *
 * @param sel - The select to refill.
 * @param values - Option values.
 * @param placeholder - When given, a first option with value ``''`` and this text.
 */
export function fillSelect(
  sel: HTMLSelectElement, values: readonly string[], placeholder?: string,
): void {
  sel.innerHTML = '';
  if (placeholder !== undefined) {
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    sel.appendChild(ph);
  }
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
}
