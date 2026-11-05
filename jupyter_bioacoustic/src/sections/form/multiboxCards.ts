/**
 * Multibox box cards in the FormPanel: one card per drawn box (color dot, bounds, ×) with
 * an optional per-box form whose values live in ``entry.formValues``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, btnStyle, fullWidthDividerStyle, inputStyle, mutedTextStyle } from '../../styles';
import { TOOLTIP } from '../../text';
import { MultiboxEntry } from '../../types';
import { elementColumn } from './formConfig';
import { boxLabel, buildMultiselect, buildSelect } from './inputs';
import { MultiselectSpec, multiselectItemsConfig, prepareMultiselect } from './multiselect';
import { RawSelectItem, parseSelectItems, selectItemOptions } from './selectItems';


//
// Types
//
/** Card callbacks. */
export interface BoxCardHandlers {
  /** The card was clicked (make its box active). */
  onSelect: () => void;
  /** The × was clicked. */
  onRemove: () => void;
}


//
// Public
//
/**
 * A box card (without its form): colored left strip, dot, ``t0–t1s  f0–f1 kHz`` and ×.
 * Highlighted when ``active``.
 */
export function buildBoxCard(
  entry: MultiboxEntry, index: number, active: boolean, h: BoxCardHandlers,
): HTMLDivElement {
  const card = document.createElement('div');
  card.dataset.multiboxIdx = String(index);
  card.style.cssText =
    `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
    `border-radius:4px;border-left:3px solid ${entry.color};` +
    `background:${active ? COLORS.bgSurface0 : COLORS.bgMantle};cursor:pointer;`;
  card.addEventListener('click', h.onSelect);

  const headerRow = document.createElement('div');
  headerRow.style.cssText = `display:flex;align-items:center;gap:8px;`;

  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${entry.color};`;

  const bounds = document.createElement('span');
  bounds.style.cssText =
    `font-size:10px;color:${COLORS.textSubtle};font-family:ui-monospace,monospace;white-space:nowrap;`;
  bounds.textContent =
    `${entry.startTime.toFixed(1)}–${entry.endTime.toFixed(1)}s` +
    `  ${(entry.minFreq / 1000).toFixed(1)}–${(entry.maxFreq / 1000).toFixed(1)} kHz`;

  const spacer = document.createElement('span');
  spacer.style.flex = '1';

  const delBtn = document.createElement('button');
  delBtn.textContent = '×';
  delBtn.title = TOOLTIP.removeBox;
  delBtn.style.cssText = btnStyle() + `font-size:14px;padding:0 6px;line-height:1;`;
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    h.onRemove();
  });

  headerRow.append(dot, bounds, spacer, delBtn);
  card.appendChild(headerRow);
  return card;
}


/**
 * Build a box's form into ``container``: text / break / line, and select / multiselect /
 * textbox / number / checkbox inputs bound to ``entry.formValues`` (existing values are kept).
 *
 * @param loadItems - Resolves a select's ``items`` to raw items (files load in the kernel).
 * @param onChange - Called after any value changes (re-validate).
 * @param onMultiselect - Called with each multiselect's output spec (to encode its rows).
 */
export async function buildBoxForm(
  elements: any[],
  container: HTMLElement,
  entry: MultiboxEntry,
  loadItems: (items: any) => Promise<RawSelectItem[]>,
  onChange: () => void,
  onMultiselect: (spec: MultiselectSpec) => void = () => {},
): Promise<void> {
  const values = entry.formValues;
  for (const item of elements) {
    if (!item || typeof item !== 'object') continue;
    const [type] = Object.keys(item);
    const config = item[type];
    const cfg = config ?? {};
    const col = elementColumn(type, cfg);
    switch (type) {
      case 'text': {
        const d = document.createElement('div');
        d.style.cssText = mutedTextStyle({ width: '100%', fontSize: 11 });
        d.textContent = String(config && typeof config === 'object' ? (config.value ?? '') : config);
        container.appendChild(d);
        break;
      }
      case 'break':
        container.appendChild(document.createElement('br'));
        break;
      case 'line': {
        const d = document.createElement('div');
        d.style.cssText = fullWidthDividerStyle();
        container.appendChild(d);
        break;
      }
      case 'select': {
        const flags = selectItemOptions(cfg.items);
        const { items, selectedDefault } = parseSelectItems(
          await loadItems(cfg.items), flags.notAvailable);
        const built = buildSelect({
          items, filterBox: flags.filterBox, customValue: flags.customValue, variant: 'box',
          onChange: () => { values[col] = built.select.value; onChange(); },
        });
        values[col] = values[col] ?? selectedDefault;
        if (values[col]) built.select.value = values[col];
        container.appendChild(boxLabel(cfg.label ?? col, built.element));
        break;
      }
      case 'multiselect': {
        const flags = selectItemOptions(cfg.items);
        const { items, spec, initial } = prepareMultiselect(
          cfg, col, await loadItems(multiselectItemsConfig(cfg.items)));
        onMultiselect(spec);
        values[col] = Array.isArray(values[col]) ? values[col] : initial;
        const built = buildMultiselect({
          items, spec, initial: values[col], filterBox: flags.filterBox,
          customValue: flags.customValue, variant: 'box',
          onChange: selected => { values[col] = selected; onChange(); },
        });
        container.appendChild(boxLabel(cfg.label ?? col, built.element));
        break;
      }
      case 'textbox': {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.style.cssText = inputStyle('100px') + `font-size:11px;`;
        inp.addEventListener('input', () => { values[col] = inp.value; onChange(); });
        values[col] = values[col] ?? '';
        inp.value = values[col];
        container.appendChild(boxLabel(cfg.label ?? col, inp));
        break;
      }
      case 'number': {
        const inp = document.createElement('input');
        inp.type = 'number';
        if (cfg.min !== undefined) inp.min = String(cfg.min);
        if (cfg.max !== undefined) inp.max = String(cfg.max);
        if (cfg.step !== undefined) inp.step = String(cfg.step);
        inp.style.cssText = inputStyle('60px') + `font-size:11px;`;
        inp.addEventListener('input', () => {
          values[col] = inp.value === '' ? null : parseFloat(inp.value);
          onChange();
        });
        values[col] = values[col] ?? null;
        if (values[col] != null) inp.value = String(values[col]);
        container.appendChild(boxLabel(cfg.label ?? col, inp));
        break;
      }
      case 'checkbox': {
        const checkedVal = cfg.checked_value ?? cfg.yes_value ?? true;
        const uncheckedVal = cfg.unchecked_value ?? cfg.no_value ?? false;
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = Boolean(values[col] ?? cfg.default);
        inp.addEventListener('change', () => {
          values[col] = inp.checked ? checkedVal : uncheckedVal;
          onChange();
        });
        values[col] = inp.checked ? checkedVal : uncheckedVal;
        container.appendChild(boxLabel(cfg.label ?? col, inp));
        break;
      }
    }
  }
}
