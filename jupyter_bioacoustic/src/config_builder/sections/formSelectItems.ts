/**
 * The select card's "Items source" builder: add items one by one, paste values, read them from
 * a file (value / label columns, filter box, custom value, not-available option) or a numeric
 * range.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../../styles';
import { numberOr } from '../../util';
import { DATA_FILE_RE } from '../constants';
import { fillSelect, makeButton, makeInput, makeLabel, makeRow, makeSelect } from '../dom';
import type { CardConfig } from '../formSerialization';
import { FORM_ADD_ITEMS_HINT } from '../text';
import type { FormCardContext } from './formCards';


//
// Public
//
/**
 * Add the "Items source" picker to a select card; the chosen mode's editor writes
 * ``cfg.items`` (a list, ``{path, value, label, ...}`` or ``{min, max, step}``).
 *
 * @param ctx - The owning section's hooks.
 * @param card - The select card.
 * @param cfg - The select's card config.
 */
export function addSelectItemsBuilder(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig,
): void {
  const itemsArea = document.createElement('div');
  itemsArea.style.cssText =
    `display:flex;flex-direction:column;gap:4px;padding:4px 0;` +
    `border-top:1px solid ${COLORS.bgSurface1};margin-top:4px;`;

  const modeLabel = document.createElement('span');
  modeLabel.textContent = 'Items source:';
  modeLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
  itemsArea.appendChild(modeLabel);

  const modeSel = makeSelect(['add items', 'from file', 'paste values', 'range'], 'add items');
  itemsArea.appendChild(modeSel);

  const itemsContent = document.createElement('div');
  itemsContent.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
  itemsArea.appendChild(itemsContent);

  const detectMode = (): string => {
    const items = cfg.items;
    if (items && typeof items === 'object' && !Array.isArray(items)) {
      if ('path' in items) return 'from file';
      if ('max' in items) return 'range';
    }
    return 'add items';
  };
  const mode = detectMode();
  modeSel.value = mode;

  const buildForMode = (m: string) => {
    itemsContent.innerHTML = '';
    if (m === 'add items') {
      _buildAddItems(ctx, itemsContent, cfg);
    } else if (m === 'from file') {
      _buildFileItems(ctx, itemsContent, cfg);
    } else if (m === 'paste values') {
      _buildPasteValues(ctx, itemsContent, cfg);
    } else {
      _buildRangeItems(ctx, itemsContent, cfg);
    }
  };
  buildForMode(mode);

  modeSel.addEventListener('change', () => buildForMode(modeSel.value));
  card.appendChild(itemsArea);
}


//
// Internal
//
function _buildAddItems(ctx: FormCardContext, container: HTMLDivElement, cfg: CardConfig): void {
  if (!Array.isArray(cfg.items)) cfg.items = [];

  const listEl = document.createElement('div');
  listEl.style.cssText = `display:flex;flex-direction:column;gap:2px;max-height:150px;overflow-y:auto;`;

  const renderList = () => {
    listEl.innerHTML = '';
    if (!Array.isArray(cfg.items) || cfg.items.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = '(no items)';
      empty.style.cssText = `color:${COLORS.textSubtle};font-size:11px;font-style:italic;`;
      listEl.appendChild(empty);
      return;
    }
    for (let i = 0; i < cfg.items.length; i++) {
      const it = cfg.items[i];
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:4px;font-size:11px;`;

      const txt = document.createElement('span');
      txt.style.cssText = `flex:1;color:${COLORS.textPrimary};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
      if (typeof it === 'string') {
        txt.textContent = it;
      } else if (it && typeof it === 'object') {
        const parts = [];
        if (it.label) parts.push(it.label);
        if (it.value && it.value !== it.label) parts.push(`= ${it.value}`);
        if (it.form) parts.push(`→ ${it.form}`);
        txt.textContent = parts.join(' ');
      }

      const rm = makeButton('✕');
      rm.style.cssText += `font-size:9px;padding:1px 4px;color:${COLORS.red};`;
      rm.addEventListener('click', () => {
        cfg.items.splice(i, 1);
        renderList();
        ctx.changed();
      });

      row.append(txt, rm);
      listEl.appendChild(row);
    }
  };
  renderList();
  container.appendChild(listEl);

  const addRow = document.createElement('div');
  addRow.style.cssText = `display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;`;

  const labelInp = makeInput('label', '90px');
  const valueInp = makeInput('value', '90px');
  const formInp = makeInput('form (opt)', '90px');

  const addBtn = makeButton('+ Add');
  addBtn.style.fontSize = '11px';
  addBtn.addEventListener('click', () => {
    const label = labelInp.value.trim();
    const value = valueInp.value.trim();
    const form = formInp.value.trim();
    if (!label && !value) return;
    if (!Array.isArray(cfg.items)) cfg.items = [];
    const item: Record<string, any> = {};
    if (label) item.label = label;
    if (value) item.value = value;
    else if (label) item.value = label;
    if (form) item.form = form;
    if (!item.label && item.value && !form) {
      cfg.items.push(item.value);
    } else {
      if (!item.label) item.label = item.value;
      cfg.items.push(item);
    }
    labelInp.value = '';
    valueInp.value = '';
    formInp.value = '';
    renderList();
    ctx.changed();
  });

  addRow.append(labelInp, valueInp, formInp, addBtn);
  container.appendChild(addRow);

  const hint = document.createElement('span');
  hint.textContent = FORM_ADD_ITEMS_HINT;
  hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;`;
  container.appendChild(hint);
}


function _buildPasteValues(ctx: FormCardContext, container: HTMLDivElement, cfg: CardConfig): void {
  const sepRow = document.createElement('div');
  sepRow.style.cssText = `display:flex;align-items:center;gap:6px;`;

  const lineDelimCb = document.createElement('input');
  lineDelimCb.type = 'checkbox';
  lineDelimCb.style.cssText = `accent-color:${COLORS.blue};`;

  const lineLabel = document.createElement('label');
  lineLabel.style.cssText = `display:flex;align-items:center;gap:4px;color:${COLORS.textSubtle};font-size:11px;cursor:pointer;`;
  lineLabel.textContent = 'line delimited';
  lineLabel.prepend(lineDelimCb);

  const sepLabel = document.createElement('span');
  sepLabel.textContent = 'separator:';
  sepLabel.style.cssText = `color:${COLORS.textSubtle};font-size:11px;`;

  const sepInp = makeInput(',', '40px');
  sepInp.style.fontSize = '11px';

  sepRow.append(sepLabel, sepInp, lineLabel);
  container.appendChild(sepRow);

  const textarea = document.createElement('textarea');
  textarea.style.cssText =
    `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
    `border-radius:4px;color:${COLORS.textPrimary};padding:4px 8px;` +
    `font-size:11px;width:250px;height:60px;resize:vertical;font-family:monospace;`;
  textarea.placeholder = 'yes, no, maybe';

  if (Array.isArray(cfg.items)) {
    textarea.value = cfg.items.map((it: any) => {
      if (typeof it === 'string') return it;
      if (it && it.label) return it.label;
      return String(it);
    }).join(', ');
  }

  const parse = () => {
    const raw = textarea.value;
    const sep = lineDelimCb.checked ? '\n' : (sepInp.value || ',');
    const tokens = raw.split(sep);
    cfg.items = tokens.map(t => t.trim()).filter(Boolean);
    ctx.changed();
  };

  textarea.addEventListener('input', parse);
  sepInp.addEventListener('input', parse);
  lineDelimCb.addEventListener('change', () => {
    sepInp.disabled = lineDelimCb.checked;
    sepInp.style.opacity = lineDelimCb.checked ? '0.4' : '1';
    parse();
  });

  container.appendChild(textarea);
}


/** ``items: {path, value, label}`` from a data file, with column pickers once loaded. */
function _buildFileItems(ctx: FormCardContext, container: HTMLDivElement, cfg: CardConfig): void {
  const pathRow = makeRow();
  pathRow.appendChild(makeLabel('file path'));
  const pathInp = makeInput('data/categories.csv', '160px');
  if (cfg.items && typeof cfg.items === 'object' && !Array.isArray(cfg.items) && cfg.items.path) {
    pathInp.value = cfg.items.path;
  }

  const valSel = makeSelect([], '');
  valSel.style.width = '150px';
  valSel.style.display = 'none';
  valSel.addEventListener('change', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.value = valSel.value;
    ctx.changed();
  });

  const valInput = makeInput('value column', '150px');
  if (cfg.items?.value) valInput.value = cfg.items.value;
  valInput.addEventListener('input', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.value = valInput.value.trim();
    ctx.changed();
  });

  const lblSel = makeSelect(['(none)'], '');
  lblSel.style.width = '150px';
  lblSel.style.display = 'none';
  lblSel.addEventListener('change', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.label = lblSel.value || undefined;
    ctx.changed();
  });

  const lblInput = makeInput('label column (optional)', '150px');
  if (cfg.items?.label) lblInput.value = cfg.items.label;
  lblInput.addEventListener('input', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.label = lblInput.value.trim() || undefined;
    ctx.changed();
  });

  const populateSelects = (cols: string[]) => {
    fillSelect(valSel, cols);
    fillSelect(lblSel, cols, '(none)');
    const pendingVal = valInput.value.trim();
    if (pendingVal && cols.includes(pendingVal)) valSel.value = pendingVal;
    else if (cfg.items?.value && cols.includes(cfg.items.value)) valSel.value = cfg.items.value;
    const pendingLbl = lblInput.value.trim();
    if (pendingLbl && cols.includes(pendingLbl)) lblSel.value = pendingLbl;
    else if (cfg.items?.label && cols.includes(cfg.items.label)) lblSel.value = cfg.items.label;
    valInput.style.display = 'none';
    valSel.style.display = '';
    lblInput.style.display = 'none';
    lblSel.style.display = '';
  };

  const revertToText = () => {
    valSel.style.display = 'none';
    valInput.style.display = '';
    valInput.value = valSel.value || valInput.value;
    lblSel.style.display = 'none';
    lblInput.style.display = '';
    lblInput.value = lblSel.value || lblInput.value;
  };

  const loadCols = (path: string) => {
    if (path && DATA_FILE_RE.test(path)) {
      ctx.requestColumns(path, populateSelects);
    } else {
      revertToText();
    }
  };

  pathInp.addEventListener('input', () => {
    if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items)) cfg.items = {};
    cfg.items.path = pathInp.value;
    ctx.changed();
  });
  pathInp.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    loadCols(pathInp.value.trim());
  });
  const browseBtn = makeButton('Browse');
  browseBtn.addEventListener('click', () => {
    ctx.browse((path: string) => {
      pathInp.value = path;
      if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items)) cfg.items = {};
      cfg.items.path = path;
      ctx.changed();
      loadCols(path);
    });
  });
  pathRow.append(pathInp, browseBtn);
  container.appendChild(pathRow);

  const hintStyle = `color:${COLORS.textSubtle};font-size:12px;white-space:nowrap;`;

  const valRow = makeRow();
  valRow.appendChild(makeLabel('value column'));
  valRow.append(valInput, valSel);
  const valHint = document.createElement('span');
  valHint.style.cssText = hintStyle;
  valHint.textContent = '| source column whose value is written to output dataset';
  valRow.appendChild(valHint);
  container.appendChild(valRow);

  const lblRow = makeRow();
  lblRow.appendChild(makeLabel('label column'));
  lblRow.append(lblInput, lblSel);
  const lblHint = document.createElement('span');
  lblHint.style.cssText = hintStyle;
  lblHint.textContent = '| source column whose value is shown in dropdown (defaults to value column)';
  lblRow.appendChild(lblHint);
  container.appendChild(lblRow);

  if (pathInp.value) loadCols(pathInp.value);

  const { row: fbRow, input: fbCb } = ctx.checkbox('filter_box', !!cfg.items?.filter_box);
  fbCb.addEventListener('change', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.filter_box = fbCb.checked;
    ctx.changed();
  });
  container.appendChild(fbRow);

  const { row: cvRow, input: cvCb } = ctx.checkbox('custom_value', !!cfg.items?.custom_value);
  cvCb.addEventListener('change', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    cfg.items.custom_value = cvCb.checked;
    ctx.changed();
  });
  container.appendChild(cvRow);

  const naRow = makeRow();
  const naCb = document.createElement('input');
  naCb.type = 'checkbox';
  naCb.style.cssText = `accent-color:${COLORS.blue};margin-right:6px;`;
  const naVal = cfg.items?.not_available;
  naCb.checked = !!naVal;

  const naLabel = document.createElement('span');
  naLabel.textContent = 'not_available';
  naLabel.style.cssText = `color:${COLORS.textSubtle};font-size:11px;width:90px;`;

  const naTextInput = makeInput('custom label', '140px');
  naTextInput.style.fontSize = '11px';
  if (typeof naVal === 'string') naTextInput.value = naVal;

  const updateNaTextState = () => {
    naTextInput.disabled = !naCb.checked;
    naTextInput.style.opacity = naCb.checked ? '1' : '0.5';
    naTextInput.style.backgroundColor = naCb.checked ? COLORS.bgSurface0 : COLORS.bgSurface1;
  };
  updateNaTextState();

  naCb.addEventListener('change', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    if (naCb.checked) {
      const label = naTextInput.value.trim();
      cfg.items.not_available = label || true;
    } else {
      delete cfg.items.not_available;
    }
    updateNaTextState();
    ctx.changed();
  });

  naTextInput.addEventListener('input', () => {
    if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
    const label = naTextInput.value.trim();
    if (label && !naCb.checked) {
      naCb.checked = true;
      updateNaTextState();
    }
    cfg.items.not_available = label || true;
    ctx.changed();
  });

  naRow.append(naCb, naLabel, naTextInput);
  container.appendChild(naRow);
}


function _buildRangeItems(ctx: FormCardContext, container: HTMLDivElement, cfg: CardConfig): void {
  const minInp = makeInput('1', '60px');
  minInp.type = 'number';
  const maxInp = makeInput('10', '60px');
  maxInp.type = 'number';
  const stepInp = makeInput('1', '60px');
  stepInp.type = 'number';

  if (cfg.items?.min !== undefined) minInp.value = String(cfg.items.min);
  if (cfg.items?.max !== undefined) maxInp.value = String(cfg.items.max);
  if (cfg.items?.step !== undefined) stepInp.value = String(cfg.items.step);

  const update = () => {
    cfg.items = {
      min: numberOr(minInp.value, 1),
      max: numberOr(maxInp.value, 10),
      step: numberOr(stepInp.value, 1) > 0 ? numberOr(stepInp.value, 1) : 1,
    };
    ctx.changed();
  };

  minInp.addEventListener('input', update);
  maxInp.addEventListener('input', update);
  stepInp.addEventListener('input', update);

  const row = makeRow();
  row.append(
    makeLabel('min'), minInp,
    makeLabel('max'), maxInp,
    makeLabel('step'), stepInp,
  );
  container.appendChild(row);
}
