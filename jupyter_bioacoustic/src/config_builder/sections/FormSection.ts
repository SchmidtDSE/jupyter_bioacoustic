/**
 * Form section: builds the form YAML — element cards (add bar, drag / move / remove), dynamic
 * forms, and the round trip to YAML. The fields inside each card are built in formCards.ts
 * (with formAnnotationTools.ts and formSelectItems.ts); YAML conversion is formSerialization.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { makeButton, makeInput, makeRow } from '../dom';
import {
  CardConfig, ElementType, deserializeElement, serializeElement,
} from '../formSerialization';
import { FORM_ADD_HINT } from '../text';
import { CollapsibleSection } from './CollapsibleSection';
import { FormCardContext, buildElementFields, defaultElementConfig } from './formCards';


//
// Constants
//
/** Element types that make a following title / annotation / ... go into the ``form:`` list. */
const USER_INPUT_TYPES: ReadonlySet<string> = new Set([
  'select', 'multiselect', 'textbox', 'checkbox', 'number',
]);
/** Element types written as top-level keys when they come before any user input. */
const TOP_LEVEL_TYPES: ReadonlySet<string> = new Set(['title', 'annotation', 'pass_value', 'fixed_value']);
/** The add bar's button groups. */
const ADD_BAR_COLUMNS: ReadonlyArray<{ header: string; rows: ElementType[][] }> = [
  { header: 'Display', rows: [['title', 'text'], ['line', 'break']] },
  {
    header: 'User Input',
    rows: [['annotation', 'select', 'multiselect'], ['textbox', 'checkbox', 'number']],
  },
  { header: 'Data', rows: [['pass_value'], ['fixed_value']] },
  { header: 'Navigation', rows: [['submission_buttons']] },
];


//
// Types
//
/** One element card and the config it edits. */
interface FormElement {
  type: ElementType;
  config: CardConfig;
  el: HTMLDivElement;
}

/** A list of cards (the main form, or one dynamic form). */
interface CardList {
  elements: FormElement[];
  listEl: HTMLDivElement;
}

/** A named dynamic form. */
interface DynForm extends CardList {
  name: string;
  el: HTMLDivElement;
}


//
// Public
//
export class FormSection extends CollapsibleSection {
  /** A card wants a file picked (``callback`` gets the path). */
  readonly browseRequested = new Signal<this, { callback: (path: string) => void }>(this);
  /** A card wants a file's columns (``callback`` gets them). */
  readonly columnsRequested = new Signal<this, { path: string; callback: (cols: string[]) => void }>(this);

  private _elements: FormElement[] = [];
  private _dynForms: DynForm[] = [];
  private _listEl: HTMLDivElement;
  private _addBar: HTMLDivElement;
  private _dynFormsContainer: HTMLDivElement;
  private _dragSrcCard: HTMLDivElement | null = null;
  private _ctx: FormCardContext;

  constructor() {
    super('Form', 'form', false, true, ['project', 'config', 'form']);
    this._ctx = {
      changed: () => this._emitChanged(),
      fieldRow: (label, input) => this._makeFieldRow(label, input),
      checkbox: (label, checked) => this._makeCheckbox(label, checked),
      browse: (callback) => this.browseRequested.emit({ callback }),
      requestColumns: (path, callback) => this.columnsRequested.emit({ path, callback }),
    };

    const hint = document.createElement('div');
    hint.textContent = FORM_ADD_HINT;
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-style:italic;margin-bottom:4px;`;
    this._body.appendChild(hint);

    this._addBar = this._makeAddBar();
    this._body.appendChild(this._addBar);

    this._listEl = document.createElement('div');
    this._listEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
    this._body.appendChild(this._listEl);

    this._dynFormsContainer = document.createElement('div');
    this._dynFormsContainer.style.cssText =
      `display:flex;flex-direction:column;gap:6px;` +
      `border-top:1px solid ${COLORS.bgSurface0};padding-top:8px;margin-top:4px;`;

    const dynHeader = makeRow();
    const dynLabel = document.createElement('div');
    dynLabel.textContent = 'Dynamic Forms';
    dynLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.textMuted};letter-spacing:0.5px;`;
    const addDynBtn = makeButton('+ Dynamic Form');
    addDynBtn.style.fontSize = '11px';
    addDynBtn.addEventListener('click', () => this._promptAddDynForm());
    dynHeader.append(dynLabel, addDynBtn);
    this._dynFormsContainer.appendChild(dynHeader);
    this._body.appendChild(this._dynFormsContainer);
  }

  /**
   * The form YAML for the current elements. Title / annotation / pass_value / fixed_value
   * cards placed before the first user input are top-level keys; everything else goes in
   * the ``form:`` list. Every element (incl. dynamic forms) uses ``serializeElement``.
   */
  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    const formList: any[] = [];
    let submissionButtons: any = null;
    let seenUserInput = false;

    for (const elem of this._elements) {
      const val = serializeElement(elem.type, elem.config);
      if (elem.type === 'submission_buttons') {
        submissionButtons = val;
        continue;
      }
      if (USER_INPUT_TYPES.has(elem.type)) seenUserInput = true;
      if (!seenUserInput && TOP_LEVEL_TYPES.has(elem.type)) {
        result[elem.type] = val;
      } else {
        formList.push({ [elem.type]: val });
      }
    }
    if (formList.length > 0) result.form = formList;
    if (submissionButtons) result.submission_buttons = submissionButtons;

    if (this._dynForms.length > 0) {
      const dynDict: Record<string, any[]> = {};
      for (const df of this._dynForms) {
        dynDict[df.name] = df.elements.map(fe => ({ [fe.type]: serializeElement(fe.type, fe.config) }));
      }
      result.dynamic_forms = dynDict;
    }
    return result;
  }

  /** Rebuild the cards from form YAML (every element goes through ``deserializeElement``). */
  setData(data: Record<string, any>): void {
    this._elements = [];
    this._listEl.innerHTML = '';
    this._dynForms = [];
    while (this._dynFormsContainer.children.length > 1) {
      this._dynFormsContainer.removeChild(this._dynFormsContainer.lastChild!);
    }

    for (const key of ['title', 'pass_value', 'fixed_value', 'annotation'] as ElementType[]) {
      if (data[key] !== undefined && data[key] !== null) {
        this._addElement(key, deserializeElement(key, data[key]));
      }
    }

    if (Array.isArray(data.form)) {
      for (const item of data.form) {
        if (!item || typeof item !== 'object') continue;
        const [type] = Object.keys(item) as ElementType[];
        this._addElement(type, deserializeElement(type, item[type]));
      }
    } else {
      for (const key of [...USER_INPUT_TYPES] as ElementType[]) {
        if (data[key]) this._addElement(key, deserializeElement(key, data[key]));
      }
    }

    if (data.submission_buttons) {
      this._addElement('submission_buttons', deserializeElement('submission_buttons', data.submission_buttons));
    }

    const dynForms = data.dynamic_forms;
    if (dynForms && typeof dynForms === 'object' && !Array.isArray(dynForms)) {
      for (const [name, elems] of Object.entries(dynForms)) {
        const feList: FormElement[] = [];
        if (Array.isArray(elems)) {
          for (const el of elems) {
            if (el && typeof el === 'object') {
              const [type] = Object.keys(el) as ElementType[];
              feList.push({ type, config: deserializeElement(type, el[type]), el: document.createElement('div') });
            }
          }
        }
        this._createDynForm(name, feList);
      }
    }
  }

  private _makeAddBar(onAdd?: (type: ElementType) => void): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText =
      `display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px 8px;padding:6px 0;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};margin-bottom:4px;`;
    const columns = ADD_BAR_COLUMNS;
    const mkBtn = (t: ElementType) => {
      const btn = makeButton(`+ ${t}`);
      btn.style.fontSize = '11px';
      btn.style.padding = '3px 8px';
      btn.addEventListener('click', () => {
        this.fieldFocused.emit(t);
        if (onAdd) { onAdd(t); } else { this._addElement(t); }
      });
      btn.addEventListener('mouseenter', () => this.fieldFocused.emit(t));
      return btn;
    };
    for (const col of columns) {
      const hdr = document.createElement('div');
      hdr.textContent = col.header;
      hdr.style.cssText =
        `font-size:10px;font-weight:700;color:${COLORS.textMuted};text-transform:uppercase;` +
        `letter-spacing:0.5px;padding-bottom:2px;`;
      bar.appendChild(hdr);
    }
    for (const col of columns) {
      const cell = document.createElement('div');
      cell.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
      for (const row of col.rows) {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = `display:flex;gap:3px;`;
        for (const t of row) {
          const b = mkBtn(t);
          b.style.flex = '1';
          b.style.minWidth = '0';
          rowEl.appendChild(b);
        }
        cell.appendChild(rowEl);
      }
      bar.appendChild(cell);
    }
    return bar;
  }

  private _addElement(type: ElementType, config?: CardConfig, target?: CardList): void {
    const cfg = config || defaultElementConfig(type);
    const tgt = target || { elements: this._elements, listEl: this._listEl };
    const card = this._buildElementCard(type, cfg, tgt);
    const fe: FormElement = { type, config: cfg, el: card };
    tgt.elements.push(fe);
    tgt.listEl.appendChild(card);
    this._emitChanged();
  }

  private _buildElementCard(type: ElementType, cfg: CardConfig, target: CardList): HTMLDivElement {
    const card = document.createElement('div');
    card.draggable = true;
    card.style.cssText =
      `background:${COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
      `display:flex;flex-direction:column;gap:5px;cursor:grab;` +
      `border:1px solid transparent;`;
    card.addEventListener('focusin', () => this.fieldFocused.emit(type));
    card.addEventListener('click', () => this.fieldFocused.emit(type));

    card.addEventListener('dragstart', (e) => {
      this._dragSrcCard = card;
      card.style.opacity = '0.4';
      e.dataTransfer!.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
      this._dragSrcCard = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      card.style.borderColor = COLORS.blue;
    });
    card.addEventListener('dragleave', () => {
      card.style.borderColor = 'transparent';
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.style.borderColor = 'transparent';
      if (!this._dragSrcCard || this._dragSrcCard === card) return;
      const srcIdx = target.elements.findIndex(el => el.el === this._dragSrcCard);
      const dstIdx = target.elements.findIndex(el => el.el === card);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = target.elements.splice(srcIdx, 1);
      target.elements.splice(dstIdx, 0, moved);
      target.listEl.innerHTML = '';
      for (const el of target.elements) target.listEl.appendChild(el.el);
      this._emitChanged();
    });

    const header = makeRow();
    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    typeLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.blue};flex:1;`;

    const moveUp = makeButton('▲');
    moveUp.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveUp.addEventListener('click', () => this._moveElement(card, -1, target));

    const moveDown = makeButton('▼');
    moveDown.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveDown.addEventListener('click', () => this._moveElement(card, 1, target));

    const removeBtn = makeButton('✕');
    removeBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${COLORS.red};`;
    removeBtn.addEventListener('click', () => this._removeElement(card, target));

    header.append(typeLabel, moveUp, moveDown, removeBtn);
    card.appendChild(header);

    buildElementFields(this._ctx, card, type, cfg);
    return card;
  }

  private _promptAddDynForm(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;` +
      `background:rgba(0,0,0,0.5);`;

    const dialog = document.createElement('div');
    dialog.style.cssText =
      `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};border-radius:8px;` +
      `padding:16px;display:flex;flex-direction:column;gap:10px;min-width:260px;`;

    const title = document.createElement('div');
    title.textContent = 'New Dynamic Form';
    title.style.cssText = `font-size:13px;font-weight:700;color:${COLORS.textPrimary};`;

    const inp = makeInput('form name', '200px');
    inp.style.fontSize = '13px';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display:flex;gap:8px;justify-content:flex-end;`;

    const cancelBtn = makeButton('Cancel');
    cancelBtn.addEventListener('click', () => overlay.remove());

    const createBtn = makeButton('Create', true);
    createBtn.addEventListener('click', () => {
      const name = inp.value.trim();
      if (!name) return;
      if (this._dynForms.some(df => df.name === name)) return;
      this._createDynForm(name);
      overlay.remove();
      this._emitChanged();
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
      if (e.key === 'Escape') overlay.remove();
    });

    btnRow.append(cancelBtn, createBtn);
    dialog.append(title, inp, btnRow);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    inp.focus();
  }

  private _createDynForm(name: string, elements?: FormElement[]): void {
    const container = document.createElement('div');
    container.style.cssText =
      `background:${COLORS.bgMantle};border:1px solid ${COLORS.bgSurface1};border-radius:6px;` +
      `padding:8px 10px;display:flex;flex-direction:column;gap:6px;`;

    const header = makeRow();
    const lbl = document.createElement('span');
    lbl.textContent = name;
    lbl.style.cssText = `font-size:12px;font-weight:700;color:${COLORS.mauve};flex:1;cursor:pointer;`;
    lbl.title = 'Double-click to rename';

    const startRename = () => {
      const renameInp = makeInput(df.name, '160px');
      renameInp.value = df.name;
      renameInp.style.fontSize = '12px';
      renameInp.style.fontWeight = '700';
      lbl.replaceWith(renameInp);
      renameInp.focus();
      renameInp.select();
      const commit = () => {
        const newName = renameInp.value.trim();
        if (newName && newName !== df.name && !this._dynForms.some(d => d !== df && d.name === newName)) {
          df.name = newName;
        }
        lbl.textContent = df.name;
        renameInp.replaceWith(lbl);
        this._emitChanged();
      };
      renameInp.addEventListener('blur', commit);
      renameInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); renameInp.blur(); }
        if (e.key === 'Escape') { renameInp.value = df.name; renameInp.blur(); }
      });
    };

    lbl.addEventListener('dblclick', startRename);

    const renameBtn = makeButton('✎');
    renameBtn.title = 'Rename form';
    renameBtn.style.cssText += `font-size:12px;padding:2px 6px;color:${COLORS.textPrimary};`;
    renameBtn.addEventListener('click', startRename);

    const rmBtn = makeButton('✕');
    rmBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${COLORS.red};`;
    rmBtn.addEventListener('click', () => {
      const idx = this._dynForms.findIndex(d => d === df);
      if (idx >= 0) this._dynForms.splice(idx, 1);
      container.remove();
      this._emitChanged();
    });

    header.append(lbl, renameBtn, rmBtn);
    container.appendChild(header);

    const listEl = document.createElement('div');
    listEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
    container.appendChild(listEl);

    const df: DynForm = { name, elements: elements || [], el: container, listEl };

    for (const fe of df.elements) {
      const card = this._buildElementCard(fe.type, fe.config, df);
      fe.el = card;
      listEl.appendChild(card);
    }

    const addBar = this._makeAddBar((type) => this._addElement(type, undefined, df));
    addBar.style.borderBottom = 'none';
    addBar.style.paddingBottom = '0';
    container.appendChild(addBar);

    this._dynForms.push(df);
    this._dynFormsContainer.appendChild(container);
    requestAnimationFrame(() => container.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  private _moveElement(card: HTMLDivElement, direction: number, target: CardList): void {
    const idx = target.elements.findIndex(e => e.el === card);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= target.elements.length) return;
    const [el] = target.elements.splice(idx, 1);
    target.elements.splice(newIdx, 0, el);
    target.listEl.innerHTML = '';
    for (const e of target.elements) target.listEl.appendChild(e.el);
    this._emitChanged();
  }

  private _removeElement(card: HTMLDivElement, target: CardList): void {
    const idx = target.elements.findIndex(e => e.el === card);
    if (idx < 0) return;
    target.elements.splice(idx, 1);
    card.remove();
    this._emitChanged();
  }
}
