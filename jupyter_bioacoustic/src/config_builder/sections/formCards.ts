/**
 * Form-builder cards: the fields inside each element card (label / column, checkboxes,
 * numbers, submission buttons, ...) and each element type's default card config. Cards edit
 * their config object in place and call ``ctx.changed()``; serialisation to form YAML is in
 * formSerialization.ts.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../../styles';
import { slugify } from '../../util';
import { makeInput, makeRow, makeSelect } from '../dom';
import type { CardConfig, ElementType } from '../formSerialization';
import { buildAnnotationToolList } from './formAnnotationTools';
import { addSelectItemsBuilder } from './formSelectItems';


//
// Types
//
/** What a card builder needs from its FormSection. */
export interface FormCardContext {
  /** A card's config changed. */
  changed(): void;
  /** A label + control row that highlights ``label`` in the docs. */
  fieldRow(label: string, input: HTMLElement): HTMLDivElement;
  /** A labelled checkbox row. */
  checkbox(label: string, checked?: boolean): { row: HTMLDivElement; input: HTMLInputElement };
  /** Open the file browser; ``callback`` gets the picked path. */
  browse(callback: (path: string) => void): void;
  /** Load a data file's columns; ``callback`` gets them (not called on failure). */
  requestColumns(path: string, callback: (cols: string[]) => void): void;
}


//
// Public
//
/** The card config a newly added element of ``type`` starts with. */
export function defaultElementConfig(type: ElementType): CardConfig {
  switch (type) {
    case 'title': return { value: 'REVIEW' };
    case 'select': return { label: '', column: '', required: false, items: [] };
    case 'multiselect': return { label: '', column: '', required: false, items: [] };
    case 'textbox': return { label: '', column: '', multiline: false };
    case 'checkbox': return { label: '', column: '' };
    case 'number': return { label: '', column: '', min: 0, max: 1, step: 0.1 };
    case 'annotation': return { tools: ['start_end_time_select'] };
    case 'pass_value': return { source_column: '', column: '' };
    case 'fixed_value': return { column: '', value: '' };
    case 'submission_buttons': return { show_icon: true, submit: true, next: false, previous: false };
    case 'break': return {};
    case 'line': return {};
    case 'text': return { value: '' };
    default: return {};
  }
}


/**
 * Add the fields for an element of ``type`` to ``card``; they edit ``cfg`` in place.
 *
 * @param ctx - The owning section's hooks.
 * @param card - The card element.
 * @param type - Element type.
 * @param cfg - The element's card config.
 */
export function buildElementFields(
  ctx: FormCardContext, card: HTMLDivElement, type: ElementType, cfg: CardConfig,
): void {
  switch (type) {
    case 'title':
      _addField(ctx, card, cfg, 'value', 'title text', '200px');
      _addCheckboxField(ctx, card, cfg, 'progress_tracker', 'progress_tracker');
      break;
    case 'select':
      _addLabelColumnFields(ctx, card, cfg);
      _addCheckboxField(ctx, card, cfg, 'required', 'required');
      addSelectItemsBuilder(ctx, card, cfg);
      break;
    case 'multiselect':
      _addMultiselectLabelAndOutput(ctx, card, cfg);
      _addCheckboxField(ctx, card, cfg, 'required', 'required');
      _addNumField(ctx, card, cfg, 'min', 'min tags', '60px');
      _addNumField(ctx, card, cfg, 'max', 'max tags', '60px');
      addSelectItemsBuilder(ctx, card, cfg, { idColumn: true });
      break;
    case 'textbox':
      _addLabelColumnFields(ctx, card, cfg);
      _addCheckboxField(ctx, card, cfg, 'multiline', 'multiline');
      break;
    case 'checkbox':
      _addLabelColumnFields(ctx, card, cfg);
      _addField(ctx, card, cfg, 'checked_value', 'checked_value', '100px');
      _addField(ctx, card, cfg, 'unchecked_value', 'unchecked_value', '100px');
      _addField(ctx, card, cfg, 'checked_form', 'checked_form', '150px');
      _addField(ctx, card, cfg, 'unchecked_form', 'unchecked_form', '150px');
      break;
    case 'number':
      _addLabelColumnFields(ctx, card, cfg);
      _addNumField(ctx, card, cfg, 'min', 'min', '60px');
      _addNumField(ctx, card, cfg, 'max', 'max', '60px');
      _addNumField(ctx, card, cfg, 'step', 'step', '60px');
      break;
    case 'annotation': {
      buildAnnotationToolList(ctx, card, cfg);
      _addField(ctx, card, cfg, 'start_time_col', 'start_time col', '120px');
      _addField(ctx, card, cfg, 'end_time_col', 'end_time col', '120px');
      _addField(ctx, card, cfg, 'min_freq_col', 'min_freq col', '120px');
      _addField(ctx, card, cfg, 'max_freq_col', 'max_freq col', '120px');
      _addField(ctx, card, cfg, 'form', 'form (dynamic)', '150px');
      break;
    }
    case 'pass_value':
      _addField(ctx, card, cfg, 'source_column', 'source_column', '150px');
      _addField(ctx, card, cfg, 'column', 'column', '150px');
      break;
    case 'fixed_value':
      _addField(ctx, card, cfg, 'column', 'column', '150px');
      _addField(ctx, card, cfg, 'value', 'value', '150px');
      break;
    case 'submission_buttons': {
      _addCheckboxField(ctx, card, cfg, 'line', 'line divider');
      _addCheckboxField(ctx, card, cfg, 'show_icon', 'show icon');
      _addInlineButtonField(ctx, card, cfg, 'previous', 'previous btn');
      _addInlineButtonField(ctx, card, cfg, 'next', 'next btn');
      _addInlineButtonField(ctx, card, cfg, 'submit', 'submit btn');
      break;
    }
    case 'text': {
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:4px;color:${COLORS.textPrimary};padding:4px 8px;` +
        `font-size:12px;width:250px;resize:vertical;font-family:inherit;box-sizing:border-box;`;
      if (cfg.value != null) ta.value = String(cfg.value);
      ta.addEventListener('input', () => {
        cfg.value = ta.value;
        ctx.changed();
      });
      card.appendChild(ctx.fieldRow('text', ta));
      break;
    }
    case 'break':
    case 'line':
      break;
  }
}


//
// Internal
//
/** label + column inputs; the column follows the label (slugified) until edited. */
function _addLabelColumnFields(ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig): void {
  card.append(..._labelColumnRows(ctx, cfg));
}


/**
 * The label row and the column row. The column follows the label (slugified) until it is
 * edited, and only while ``linked()`` is true (a multiselect with one-hot columns has none).
 */
function _labelColumnRows(
  ctx: FormCardContext, cfg: CardConfig, linked: () => boolean = () => true,
): [HTMLDivElement, HTMLDivElement] {
  const labelInp = makeInput('label', '150px');
  if (cfg.label != null) labelInp.value = String(cfg.label);
  const colInp = makeInput('column', '150px');
  if (cfg.column != null) colInp.value = String(cfg.column);
  const userEditedCol = { value: !!cfg.column };
  labelInp.addEventListener('input', () => {
    cfg.label = labelInp.value;
    if (!userEditedCol.value && linked()) {
      const snake = slugify(labelInp.value.trim());
      colInp.value = snake;
      cfg.column = snake;
    }
    ctx.changed();
  });
  colInp.addEventListener('input', () => {
    userEditedCol.value = !!colInp.value;
    cfg.column = colInp.value;
    ctx.changed();
  });
  return [ctx.fieldRow('label', labelInp), ctx.fieldRow('column', colInp)];
}


function _addField(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig, key: string, label: string, width: string,
): void {
  const inp = makeInput(label, width);
  if (cfg[key] !== undefined && cfg[key] !== null) inp.value = String(cfg[key]);
  inp.addEventListener('input', () => {
    cfg[key] = inp.value;
    ctx.changed();
  });
  card.appendChild(ctx.fieldRow(label, inp));
}


function _addNumField(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig, key: string, label: string, width: string,
): void {
  const inp = makeInput('', width);
  inp.type = 'number';
  inp.step = 'any';
  if (cfg[key] !== undefined) inp.value = String(cfg[key]);
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    cfg[key] = isNaN(v) ? undefined : v;
    ctx.changed();
  });
  card.appendChild(ctx.fieldRow(label, inp));
}


function _addCheckboxField(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig, key: string, label: string,
): void {
  const { row, input } = ctx.checkbox(label, !!cfg[key]);
  input.addEventListener('change', () => {
    cfg[key] = input.checked;
    ctx.changed();
  });
  card.appendChild(row);
}


/**
 * A multiselect's label, then its ``output``. ``list`` shows the (required) output column,
 * which follows the label until edited, and the optional delimiter; ``columns`` shows the
 * optional column prefix and true / false values instead (one column per item, so no column).
 */
function _addMultiselectLabelAndOutput(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig,
): void {
  const isList = () => cfg.output?.format !== 'columns';
  const [labelRow, columnRow] = _labelColumnRows(ctx, cfg, isList);
  card.appendChild(labelRow);

  const area = document.createElement('div');
  area.style.cssText =
    `display:flex;flex-direction:column;gap:4px;padding:4px 0;` +
    `border-top:1px solid ${COLORS.bgSurface1};border-bottom:1px solid ${COLORS.bgSurface1};`;
  const title = document.createElement('span');
  title.textContent = 'Output:';
  title.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
  area.appendChild(title);

  const output = (): Record<string, any> => {
    if (!cfg.output || typeof cfg.output !== 'object') cfg.output = {};
    return cfg.output;
  };
  const format = makeSelect(['list', 'columns'], isList() ? 'list' : 'columns');
  const columnInp = columnRow.querySelector('input') as HTMLInputElement;
  format.addEventListener('change', () => {
    output().format = format.value;
    if (format.value === 'columns') {
      delete cfg.column;                       // one column per item: no output column
    } else if (!cfg.column) {
      cfg.column = slugify(String(cfg.label ?? '').trim());
    }
    columnInp.value = cfg.column ?? '';
    showFormat();
    ctx.changed();
  });
  area.appendChild(ctx.fieldRow('format', format));

  /** A text field for ``output[key]``; ``parse`` turns the text into the stored value. */
  const field = (key: string, label: string, placeholder: string, parse: (t: string) => any) => {
    const inp = makeInput(placeholder, '120px');
    if (cfg.output?.[key] != null) inp.value = String(cfg.output[key]);
    inp.addEventListener('input', () => {
      const value = parse(inp.value);
      if (value === undefined) delete output()[key];
      else output()[key] = value;
      ctx.changed();
    });
    const row = ctx.fieldRow(label, inp);
    area.appendChild(row);
    return row;
  };
  const withHint = (row: HTMLDivElement, text: string) => {
    const hint = document.createElement('span');
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:12px;white-space:nowrap;`;
    hint.textContent = `| ${text}`;
    row.appendChild(hint);
    return row;
  };
  const text = (t: string) => t || undefined;

  area.appendChild(withHint(columnRow, 'required: the output column holding the tags'));
  const listRows = [
    columnRow,
    withHint(field('delimiter', 'delimiter', '', text),
      'blank: save a list ["a", "b"] · a delimiter (e.g. ;) saves the text "a;b"'),
  ];
  const columnRows = [
    withHint(field('column_prefix', 'column_prefix', 'none', text),
      'optional: put before each item\'s value to name its column, e.g. has_ → has_owl'),
    field('true_value', 'true_value', '1', _parseScalar),
    field('false_value', 'false_value', '0', _parseScalar),
  ];
  const showFormat = () => {
    const columns = format.value === 'columns';
    // 'flex', not '': clearing display would drop the row's flex layout (and its gaps)
    for (const row of listRows) row.style.display = columns ? 'none' : 'flex';
    for (const row of columnRows) row.style.display = columns ? 'flex' : 'none';
  };
  showFormat();
  card.appendChild(area);
}


/** A typed value from text: '' -> unset, true / false -> booleans, numbers -> numbers. */
function _parseScalar(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  if (t === 'true' || t === 'false') return t === 'true';
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}


/** A submission button toggle with an optional custom label (typing enables it). */
function _addInlineButtonField(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig, key: string, label: string,
): void {
  const row = makeRow();

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.cssText = `accent-color:${COLORS.blue};margin-right:6px;`;

  // Use existing value if defined, otherwise use defaults from _defaultConfig
  if (cfg[key] === undefined) {
    const defaults = defaultElementConfig('submission_buttons');
    cfg[key] = defaults[key] ?? false;
  }
  checkbox.checked = !!cfg[key];

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  labelSpan.style.cssText = `color:${COLORS.textSubtle};font-size:11px;margin-left:-7px;width:70px;`;

  const textInput = makeInput(`custom ${label.replace(' btn', '')} label`, '140px');
  textInput.style.fontSize = '11px';

  const labelKey = `${key}_label`;
  if (cfg[labelKey]) textInput.value = cfg[labelKey];

  // Update text input enabled state
  const updateTextInputState = () => {
    textInput.disabled = !checkbox.checked;
    textInput.style.opacity = checkbox.checked ? '1' : '0.5';
    textInput.style.backgroundColor = checkbox.checked ? COLORS.bgSurface0 : COLORS.bgSurface1;
  };
  updateTextInputState();

  // Checkbox change handler
  checkbox.addEventListener('change', () => {
    cfg[key] = checkbox.checked;
    updateTextInputState();
    ctx.changed();
  });

  // Text input change handler
  textInput.addEventListener('input', () => {
    cfg[labelKey] = textInput.value;
    // Auto-check checkbox if user types in text field
    if (textInput.value && !checkbox.checked) {
      checkbox.checked = true;
      cfg[key] = true;
      updateTextInputState();
    }
    ctx.changed();
  });

  row.append(checkbox, labelSpan, textInput);
  card.appendChild(row);
}
