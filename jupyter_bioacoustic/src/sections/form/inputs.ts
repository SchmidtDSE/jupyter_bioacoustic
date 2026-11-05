/**
 * DOM builders for form inputs shared by the main form and the per-box (multibox) forms:
 * the select (with optional filter box and "+ Add" custom value), the multiselect (a select
 * that adds removable tags) and the small labelled textbox / number / checkbox used inside
 * box cards.
 *
 * Builders only create elements and report changes through callbacks; the FormPanel owns
 * the values.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import {
  btnStyle, filterChipDismissStyle, filterChipStyle, inputStyle, labelStyle, mutedTextStyle,
  selectStyle,
} from '../../styles';
import {
  MultiselectSpec, addLabel, decodeMultiselect, removeLabel, selectionFull,
} from './multiselect';
import { SelectItem, hasExactItem } from './selectItems';


//
// Constants
//
/** Rows shown when the filter box expands the select into a list. */
const FILTER_LIST_SIZE = 8;

/** Sizes for the main form vs. the compact per-box form. */
const SELECT_VARIANTS = {
  main: {
    select: `font-size:13px;max-width:260px;`,
    filter: inputStyle('110px') + `font-size:13px;`,
    filterPlaceholder: 'filter options',
    filterClass: 'jp-BA-filter-input',
    add: `font-size:11px;padding:2px 6px;display:none;`,
    // main form: Enter keeps the filtered option list
    rebuildOnEnter: false,
  },
  box: {
    select: `font-size:11px;max-width:160px;`,
    filter: inputStyle('80px') + `font-size:11px;`,
    filterPlaceholder: 'filter',
    filterClass: '',
    add: `font-size:10px;padding:2px 6px;display:none;`,
    rebuildOnEnter: true,
  },
};


//
// Types
//
/** Options for ``buildSelect``. */
export interface SelectOptions {
  /** Options (custom values added with "+ Add" are pushed onto this array). */
  items: SelectItem[];
  /** Show a filter box next to the select. */
  filterBox: boolean;
  /** Allow adding the filter text as a new option (implies the filter box). */
  customValue: boolean;
  /** ``main`` form or compact per-``box`` form sizing. */
  variant: keyof typeof SELECT_VARIANTS;
  /** Called after the user picks (or adds) a value. */
  onChange: () => void;
}

/** A built select. */
export interface BuiltSelect {
  select: HTMLSelectElement;
  /** What to put in the label: the select, or a wrapper with the filter box / Add button. */
  element: HTMLElement;
}

/** Options for ``buildMultiselect``. */
export interface MultiselectOptions {
  items: SelectItem[];
  filterBox: boolean;
  customValue: boolean;
  variant: keyof typeof SELECT_VARIANTS;
  spec: MultiselectSpec;
  /** Labels shown at first. */
  initial: string[];
  /** Called with the labels after every add / remove (and after ``input`` events). */
  onChange: (selected: string[]) => void;
}

/** A built multiselect. */
export interface BuiltMultiselect {
  /**
   * Hidden input holding the labels as a JSON array. Setting its value and dispatching
   * ``input`` replaces the labels (how the form resets inputs for each row).
   */
  input: HTMLInputElement;
  /** The picker with the tags under it. */
  element: HTMLElement;
}


//
// Public
//
/**
 * A select with an empty "— select —" option and ``items`` (``selected::`` defaults
 * pre-selected). With a filter box, typing narrows and expands the list, arrows move the
 * selection and Enter picks; with ``customValue`` an "+ Add" button adds the typed text.
 */
export function buildSelect(opts: SelectOptions): BuiltSelect {
  const v = SELECT_VARIANTS[opts.variant];
  const { items } = opts;
  const sel = document.createElement('select');
  sel.style.cssText = selectStyle() + v.select;
  const emptyOpt = document.createElement('option');
  emptyOpt.value = ''; emptyOpt.textContent = '— select —';
  sel.appendChild(emptyOpt);

  /** Re-fill the options (keeping the empty one), optionally filtered. */
  const rebuildOptions = (filter?: string) => {
    while (sel.options.length > 1) sel.remove(1);
    const f = (filter ?? '').toLowerCase();
    for (const item of items) {
      if (f && !item.label.toLowerCase().includes(f) && !item.val.toLowerCase().includes(f)) continue;
      const o = document.createElement('option');
      o.value = item.val; o.textContent = item.label;
      if (item.isDefault && !f) o.selected = true;
      sel.appendChild(o);
    }
  };
  rebuildOptions();
  sel.addEventListener('change', opts.onChange);

  if (!opts.filterBox && !opts.customValue) return { select: sel, element: sel };

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;

  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = v.filterPlaceholder;
  if (v.filterClass) filterInput.className = v.filterClass;
  filterInput.style.cssText = v.filter;

  let addBtn: HTMLButtonElement | null = null;
  if (opts.customValue) {
    const btn = document.createElement('button');
    btn.textContent = '+ Add';
    btn.style.cssText = btnStyle() + v.add;
    btn.addEventListener('click', () => {
      const custom = filterInput.value.trim();
      if (!custom) return;
      items.push({ val: custom, label: custom, isDefault: false });
      rebuildOptions();
      sel.value = custom;
      filterInput.value = '';
      btn.style.display = 'none';
      opts.onChange();
    });
    addBtn = btn;
  }

  filterInput.addEventListener('input', () => {
    const f = filterInput.value.trim();
    rebuildOptions(f);
    // expand the list so the filtered results show; collapse when the filter is cleared
    sel.size = f ? Math.min(FILTER_LIST_SIZE, sel.options.length) : 0;
    if (addBtn) addBtn.style.display = f && !hasExactItem(items, f) ? '' : 'none';
  });

  filterInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel.selectedIndex = Math.min(sel.selectedIndex + 1, sel.options.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel.selectedIndex = Math.max(sel.selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel.value) {
        sel.size = 0;
        filterInput.value = '';
        if (v.rebuildOnEnter) rebuildOptions();
        opts.onChange();
      }
    }
  });

  sel.addEventListener('change', () => { sel.size = 0; });   // collapse after a pick

  wrapper.append(sel, filterInput);
  if (addBtn) wrapper.appendChild(addBtn);
  return { select: sel, element: wrapper };
}


/**
 * A multiselect: a select (with the same filter box / "+ Add" options) whose picks become
 * tags under it, each removed with its ×.
 */
export function buildMultiselect(opts: MultiselectOptions): BuiltMultiselect {
  const { spec, items } = opts;
  let selected = [...opts.initial];

  const input = document.createElement('input');
  input.type = 'hidden';
  input.value = JSON.stringify(selected);

  const tags = document.createElement('div');
  tags.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:2px;min-height:22px;`;

  const picker = buildSelect({
    items, filterBox: opts.filterBox, customValue: opts.customValue, variant: opts.variant,
    onChange: () => {
      const value = picker.select.value;
      picker.select.value = '';
      set(addLabel(spec, selected, value));
    },
  });
  picker.select.value = '';           // ``selected::`` items start as tags, not as the pick

  const labelOf = (value: string) => items.find(i => i.val === value)?.label ?? value;

  const render = () => {
    tags.replaceChildren();
    for (const value of selected) {
      const tag = document.createElement('span');
      tag.style.cssText = filterChipStyle();
      tag.dataset.tag = value;
      tag.append(labelOf(value));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'jp-BA-chip-dismiss';
      x.textContent = '×';
      x.title = `Remove ${labelOf(value)}`;
      x.style.cssText = filterChipDismissStyle();
      x.addEventListener('click', () => set(removeLabel(selected, value)));
      tag.append(x);
      tags.appendChild(tag);
    }
    if (selected.length === 0) {
      const none = document.createElement('span');
      none.style.cssText = mutedTextStyle({ fontSize: 11 });
      none.textContent = 'no tags';
      tags.appendChild(none);
    }
    const full = selectionFull(spec, selected);
    picker.select.disabled = full;
    picker.element.style.opacity = full ? '0.5' : '1';
  };

  const set = (next: string[]) => {
    selected = next;
    input.value = JSON.stringify(selected);
    render();
    opts.onChange(selected);
  };

  input.addEventListener('input', () => {
    selected = decodeMultiselect(input.value, null);
    render();
    opts.onChange(selected);
  });

  render();
  const element = document.createElement('div');
  element.style.cssText = `display:inline-flex;flex-direction:column;align-items:flex-start;gap:4px;`;
  element.append(picker.element, tags, input);
  return { input, element };
}


/** A compact ``<label>text <control></label>`` for box cards. */
export function boxLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const lbl = document.createElement('label');
  lbl.style.cssText = labelStyle() + `font-size:11px;`;
  lbl.textContent = text;
  lbl.appendChild(control);
  return lbl;
}
