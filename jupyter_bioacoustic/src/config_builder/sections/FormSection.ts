import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

type ElementType = 'title' | 'select' | 'textbox' | 'checkbox' | 'number' |
  'annotation' | 'pass_value' | 'fixed_value' | 'submission_buttons' | 'dynamic_form';

interface FormElement {
  type: ElementType;
  config: Record<string, any>;
  el: HTMLDivElement;
}

export class FormSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, { callback: (path: string) => void }>(this);
  readonly columnsRequested = new Signal<this, { path: string; callback: (cols: string[]) => void }>(this);

  private _elements: FormElement[] = [];
  private _dynamicForms: Record<string, any[]> = {};
  private _listEl: HTMLDivElement;
  private _addBar: HTMLDivElement;
  private _dynFormsEl: HTMLDivElement;

  constructor() {
    super('Form', 'form');

    const hint = document.createElement('div');
    hint.textContent = 'Click on the buttons below to add items to the form.';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;font-style:italic;margin-bottom:4px;`;
    this._body.appendChild(hint);

    this._addBar = document.createElement('div');
    this._addBar.style.cssText =
      `display:flex;gap:4px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid ${COLORS.bgSurface0};margin-bottom:4px;`;

    this._listEl = document.createElement('div');
    this._listEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;

    const types: ElementType[] = [
      'title', 'select', 'textbox', 'checkbox', 'number',
      'annotation', 'pass_value', 'fixed_value', 'submission_buttons', 'dynamic_form',
    ];
    for (const t of types) {
      const btn = this._makeButton(`+ ${t}`);
      btn.style.fontSize = '11px';
      btn.style.padding = '3px 8px';
      btn.addEventListener('click', () => this._addElement(t));
      this._addBar.appendChild(btn);
    }
    this._body.appendChild(this._addBar);
    this._body.appendChild(this._listEl);

    this._dynFormsEl = document.createElement('div');
    this._dynFormsEl.style.cssText =
      `display:flex;flex-direction:column;gap:6px;` +
      `border-top:1px solid ${COLORS.bgSurface0};padding-top:8px;margin-top:4px;`;

    const dynLabel = document.createElement('div');
    dynLabel.textContent = 'Dynamic Forms';
    dynLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.textMuted};letter-spacing:0.5px;`;

    const addDynBtn = this._makeButton('+ Section');
    addDynBtn.style.fontSize = '11px';
    addDynBtn.addEventListener('click', () => this._addDynamicSection());

    const dynHeader = this._makeRow();
    dynHeader.append(dynLabel, addDynBtn);
    this._dynFormsEl.appendChild(dynHeader);
    this._body.appendChild(this._dynFormsEl);
  }

  private _addElement(type: ElementType, config?: Record<string, any>): void {
    const cfg = config || this._defaultConfig(type);
    const card = this._buildElementCard(type, cfg);
    const fe: FormElement = { type, config: cfg, el: card };
    this._elements.push(fe);
    this._listEl.appendChild(card);
    this._emitChanged();
  }

  private _defaultConfig(type: ElementType): Record<string, any> {
    switch (type) {
      case 'title': return { value: 'REVIEW' };
      case 'select': return { label: '', column: '', required: false, items: [] };
      case 'textbox': return { label: '', column: '', multiline: false };
      case 'checkbox': return { label: '', column: '' };
      case 'number': return { label: '', column: '', min: 0, max: 1, step: 0.1 };
      case 'annotation': return { tools: ['start_end_time_select'] };
      case 'pass_value': return { source_column: '', column: '' };
      case 'fixed_value': return { column: '', value: '' };
      case 'submission_buttons': return { submit: { label: 'Submit' }, next: { label: 'Skip' } };
      case 'dynamic_form': return { name: '', elements: [] };
      default: return {};
    }
  }

  private _buildElementCard(type: ElementType, cfg: Record<string, any>): HTMLDivElement {
    const card = document.createElement('div');
    card.style.cssText =
      `background:${COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
      `display:flex;flex-direction:column;gap:5px;`;

    const header = this._makeRow();
    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    typeLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.blue};flex:1;`;

    const moveUp = this._makeButton('▲');
    moveUp.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveUp.addEventListener('click', () => this._moveElement(card, -1));

    const moveDown = this._makeButton('▼');
    moveDown.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveDown.addEventListener('click', () => this._moveElement(card, 1));

    const removeBtn = this._makeButton('✕');
    removeBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${COLORS.red};`;
    removeBtn.addEventListener('click', () => this._removeElement(card));

    header.append(typeLabel, moveUp, moveDown, removeBtn);
    card.appendChild(header);

    this._buildElementFields(card, type, cfg);
    return card;
  }

  private _buildElementFields(card: HTMLDivElement, type: ElementType, cfg: Record<string, any>): void {
    switch (type) {
      case 'title':
        this._addField(card, cfg, 'value', 'title text', '200px');
        this._addCheckboxField(card, cfg, 'progress_tracker', 'progress_tracker');
        break;
      case 'select':
        this._addField(card, cfg, 'label', 'label', '150px');
        this._addField(card, cfg, 'column', 'column', '150px');
        this._addCheckboxField(card, cfg, 'required', 'required');
        this._addSelectItemsBuilder(card, cfg);
        break;
      case 'textbox':
        this._addField(card, cfg, 'label', 'label', '150px');
        this._addField(card, cfg, 'column', 'column', '150px');
        this._addCheckboxField(card, cfg, 'multiline', 'multiline');
        break;
      case 'checkbox':
        this._addField(card, cfg, 'label', 'label', '150px');
        this._addField(card, cfg, 'column', 'column', '150px');
        this._addField(card, cfg, 'yes_value', 'yes_value', '100px');
        this._addField(card, cfg, 'no_value', 'no_value', '100px');
        break;
      case 'number':
        this._addField(card, cfg, 'label', 'label', '150px');
        this._addField(card, cfg, 'column', 'column', '150px');
        this._addNumField(card, cfg, 'min', 'min', '60px');
        this._addNumField(card, cfg, 'max', 'max', '60px');
        this._addNumField(card, cfg, 'step', 'step', '60px');
        break;
      case 'annotation': {
        const toolsSel = this._makeSelect(
          ['time_select', 'start_end_time_select', 'bounding_box', 'multibox'],
          Array.isArray(cfg.tools) ? cfg.tools[0] : 'start_end_time_select'
        );
        toolsSel.multiple = true;
        toolsSel.style.height = '60px';
        toolsSel.addEventListener('change', () => {
          cfg.tools = Array.from(toolsSel.selectedOptions).map(o => o.value);
          this._emitChanged();
        });
        card.appendChild(this._makeFieldRow('tools', toolsSel));

        this._addField(card, cfg, 'start_time_col', 'start_time col', '120px');
        this._addField(card, cfg, 'end_time_col', 'end_time col', '120px');
        this._addField(card, cfg, 'min_freq_col', 'min_freq col', '120px');
        this._addField(card, cfg, 'max_freq_col', 'max_freq col', '120px');
        break;
      }
      case 'pass_value':
        this._addField(card, cfg, 'source_column', 'source_column', '150px');
        this._addField(card, cfg, 'column', 'column', '150px');
        break;
      case 'fixed_value':
        this._addField(card, cfg, 'column', 'column', '150px');
        this._addField(card, cfg, 'value', 'value', '150px');
        break;
      case 'submission_buttons': {
        this._addCheckboxField(card, cfg, 'line', 'line divider');
        this._addCheckboxField(card, cfg, 'previous', 'previous btn');
        this._addField(card, cfg, 'next_label', 'next label', '100px');
        this._addField(card, cfg, 'submit_label', 'submit label', '100px');
        break;
      }
      case 'dynamic_form': {
        this._addField(card, cfg, 'name', 'form name', '150px');
        const dfHint = document.createElement('span');
        dfHint.textContent = 'Referenced via form:<name> in select items. Elements defined in YAML.';
        dfHint.style.cssText = `color:${COLORS.textSubtle};font-size:10px;`;
        card.appendChild(dfHint);
        break;
      }
    }
  }

  private _addField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string, width: string): void {
    const inp = this._makeInput(label, width);
    if (cfg[key] !== undefined && cfg[key] !== null) inp.value = String(cfg[key]);
    inp.addEventListener('input', () => {
      cfg[key] = inp.value;
      this._emitChanged();
    });
    const row = this._makeFieldRow(label, inp);
    card.appendChild(row);
  }

  private _addNumField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string, width: string): void {
    const inp = this._makeInput('', width);
    inp.type = 'number';
    inp.step = 'any';
    if (cfg[key] !== undefined) inp.value = String(cfg[key]);
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      cfg[key] = isNaN(v) ? undefined : v;
      this._emitChanged();
    });
    const row = this._makeFieldRow(label, inp);
    card.appendChild(row);
  }

  private _addCheckboxField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string): void {
    const { row, input } = this._makeCheckbox(label, !!cfg[key]);
    input.addEventListener('change', () => {
      cfg[key] = input.checked;
      this._emitChanged();
    });
    card.appendChild(row);
  }

  private _addSelectItemsBuilder(card: HTMLDivElement, cfg: Record<string, any>): void {
    const itemsArea = document.createElement('div');
    itemsArea.style.cssText =
      `display:flex;flex-direction:column;gap:4px;padding:4px 0;` +
      `border-top:1px solid ${COLORS.bgSurface1};margin-top:4px;`;

    const modeLabel = document.createElement('span');
    modeLabel.textContent = 'Items source:';
    modeLabel.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
    itemsArea.appendChild(modeLabel);

    const modeSel = this._makeSelect(['inline', 'from file', 'range', 'form'], 'inline');
    modeSel.addEventListener('change', () => this._rebuildItemsUI(itemsArea, modeSel.value, cfg));
    itemsArea.appendChild(modeSel);

    const itemsContent = document.createElement('div');
    itemsContent.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    itemsArea.appendChild(itemsContent);

    this._buildInlineItems(itemsContent, cfg);

    modeSel.addEventListener('change', () => {
      itemsContent.innerHTML = '';
      if (modeSel.value === 'inline') {
        this._buildInlineItems(itemsContent, cfg);
      } else if (modeSel.value === 'from file') {
        this._buildFileItems(itemsContent, cfg);
      } else if (modeSel.value === 'form') {
        this._buildFormItems(itemsContent, cfg);
      } else {
        this._buildRangeItems(itemsContent, cfg);
      }
    });

    card.appendChild(itemsArea);
  }

  private _buildInlineItems(container: HTMLDivElement, cfg: Record<string, any>): void {
    const textarea = document.createElement('textarea');
    textarea.style.cssText =
      `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:4px 8px;` +
      `font-size:11px;width:250px;height:60px;resize:vertical;font-family:monospace;`;
    textarea.placeholder = 'yes, no, maybe\nor one per line\nor: label::value';

    if (Array.isArray(cfg.items)) {
      textarea.value = cfg.items.map((it: any) => {
        if (typeof it === 'string') return it;
        if (it.label && it.value) return `${it.label}::${it.value}`;
        return String(it.label || it.value || it);
      }).join('\n');
    }

    textarea.addEventListener('input', () => {
      const raw = textarea.value;
      const tokens = raw.includes('\n')
        ? raw.split('\n')
        : raw.split(',');
      cfg.items = tokens.map(t => t.trim()).filter(Boolean).map(token => {
        if (token.includes('::')) {
          const [label, value] = token.split('::', 2);
          return { label: label.trim(), value: value.trim() };
        }
        return token;
      });
      this._emitChanged();
    });
    container.appendChild(textarea);

    const hint = document.createElement('span');
    hint.textContent = 'Comma-separated or one per line. Use label::value for separate labels.';
    hint.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
    container.appendChild(hint);
  }

  private _buildFileItems(container: HTMLDivElement, cfg: Record<string, any>): void {
    const pathRow = this._makeRow();
    pathRow.appendChild(this._makeLabel('file path'));
    const pathInp = this._makeInput('data/categories.csv', '160px');
    if (cfg.items && typeof cfg.items === 'object' && !Array.isArray(cfg.items) && cfg.items.path) {
      pathInp.value = cfg.items.path;
    }

    const valSel = this._makeSelect([], '');
    valSel.style.width = '150px';
    valSel.addEventListener('change', () => {
      if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
      cfg.items.value = valSel.value;
      this._emitChanged();
    });

    const lblSel = this._makeSelect(['(none)'], '');
    lblSel.style.width = '150px';
    lblSel.addEventListener('change', () => {
      if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
      cfg.items.label = lblSel.value || undefined;
      this._emitChanged();
    });

    const populateSelects = (cols: string[]) => {
      valSel.innerHTML = '';
      lblSel.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = ''; noneOpt.textContent = '(none)';
      lblSel.appendChild(noneOpt);
      for (const col of cols) {
        const o1 = document.createElement('option');
        o1.value = col; o1.textContent = col;
        valSel.appendChild(o1);
        const o2 = document.createElement('option');
        o2.value = col; o2.textContent = col;
        lblSel.appendChild(o2);
      }
      if (cfg.items?.value && cols.includes(cfg.items.value)) valSel.value = cfg.items.value;
      if (cfg.items?.label && cols.includes(cfg.items.label)) lblSel.value = cfg.items.label;
    };

    const loadCols = (path: string) => {
      if (path && /\.(csv|parquet|json|jsonl|tsv)$/i.test(path)) {
        this.columnsRequested.emit({ path, callback: populateSelects });
      }
    };

    pathInp.addEventListener('input', () => {
      if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items)) cfg.items = {};
      cfg.items.path = pathInp.value;
      this._emitChanged();
      loadCols(pathInp.value);
    });
    const browseBtn = this._makeButton('Browse');
    browseBtn.addEventListener('click', () => {
      this.browseRequested.emit({
        callback: (path: string) => {
          pathInp.value = path;
          if (!cfg.items || typeof cfg.items !== 'object' || Array.isArray(cfg.items)) cfg.items = {};
          cfg.items.path = path;
          this._emitChanged();
          loadCols(path);
        }
      });
    });
    pathRow.append(pathInp, browseBtn);
    container.appendChild(pathRow);

    container.appendChild(this._makeFieldRow('value col', valSel));
    container.appendChild(this._makeFieldRow('label col', lblSel));

    if (pathInp.value) loadCols(pathInp.value);

    const { row: fbRow, input: fbCb } = this._makeCheckbox('filter_box', !!cfg.items?.filter_box);
    fbCb.addEventListener('change', () => {
      if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
      cfg.items.filter_box = fbCb.checked;
      this._emitChanged();
    });
    container.appendChild(fbRow);

    const { row: cvRow, input: cvCb } = this._makeCheckbox('custom_value', !!cfg.items?.custom_value);
    cvCb.addEventListener('change', () => {
      if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
      cfg.items.custom_value = cvCb.checked;
      this._emitChanged();
    });
    container.appendChild(cvRow);

    const { row: naRow, input: naCb } = this._makeCheckbox('not_available', !!cfg.items?.not_available);
    naCb.addEventListener('change', () => {
      if (!cfg.items || typeof cfg.items !== 'object') cfg.items = {};
      cfg.items.not_available = naCb.checked;
      this._emitChanged();
    });
    container.appendChild(naRow);
  }

  private _buildRangeItems(container: HTMLDivElement, cfg: Record<string, any>): void {
    const minInp = this._makeInput('1', '60px');
    minInp.type = 'number';
    const maxInp = this._makeInput('10', '60px');
    maxInp.type = 'number';
    const stepInp = this._makeInput('1', '60px');
    stepInp.type = 'number';

    if (cfg.items?.min !== undefined) minInp.value = String(cfg.items.min);
    if (cfg.items?.max !== undefined) maxInp.value = String(cfg.items.max);
    if (cfg.items?.step !== undefined) stepInp.value = String(cfg.items.step);

    const update = () => {
      cfg.items = {
        min: parseInt(minInp.value) || 1,
        max: parseInt(maxInp.value) || 10,
        step: parseInt(stepInp.value) || 1,
      };
      this._emitChanged();
    };

    minInp.addEventListener('input', update);
    maxInp.addEventListener('input', update);
    stepInp.addEventListener('input', update);

    const row = this._makeRow();
    row.append(
      this._makeLabel('min'), minInp,
      this._makeLabel('max'), maxInp,
      this._makeLabel('step'), stepInp,
    );
    container.appendChild(row);
  }

  private _rebuildItemsUI(_container: HTMLDivElement, _mode: string, _cfg: Record<string, any>): void {
  }

  private _moveElement(card: HTMLDivElement, direction: number): void {
    const idx = this._elements.findIndex(e => e.el === card);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this._elements.length) return;
    const [el] = this._elements.splice(idx, 1);
    this._elements.splice(newIdx, 0, el);
    this._listEl.innerHTML = '';
    for (const e of this._elements) this._listEl.appendChild(e.el);
    this._emitChanged();
  }

  private _removeElement(card: HTMLDivElement): void {
    const idx = this._elements.findIndex(e => e.el === card);
    if (idx < 0) return;
    this._elements.splice(idx, 1);
    card.remove();
    this._emitChanged();
  }

  private _buildFormItems(container: HTMLDivElement, cfg: Record<string, any>): void {
    const nameInp = this._makeInput('form name', '150px');
    if (cfg.items && typeof cfg.items === 'string' && cfg.items.startsWith('form:')) {
      nameInp.value = cfg.items.slice(5);
    }
    nameInp.addEventListener('input', () => {
      cfg.items = nameInp.value ? `form:${nameInp.value}` : '';
      this._emitChanged();
    });
    container.appendChild(this._makeFieldRow('form name', nameInp));

    const hint = document.createElement('span');
    hint.textContent = 'References a dynamic_form element by name. Add a dynamic_form element to define its contents.';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:10px;`;
    container.appendChild(hint);
  }

  private _addDynamicSection(): void {
    this._addElement('dynamic_form');
  }

  private _rebuildDynFormsUI(): void {
    while (this._dynFormsEl.children.length > 1) {
      this._dynFormsEl.removeChild(this._dynFormsEl.lastChild!);
    }

    for (const [name, elements] of Object.entries(this._dynamicForms)) {
      const section = document.createElement('div');
      section.style.cssText =
        `background:${COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
        `display:flex;flex-direction:column;gap:4px;`;

      const hdr = this._makeRow();
      const lbl = document.createElement('span');
      lbl.textContent = name;
      lbl.style.cssText = `font-size:12px;font-weight:700;color:${COLORS.mauve};flex:1;`;

      const rmBtn = this._makeButton('✕');
      rmBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${COLORS.red};`;
      rmBtn.addEventListener('click', () => {
        delete this._dynamicForms[name];
        this._rebuildDynFormsUI();
        this._emitChanged();
      });

      hdr.append(lbl, rmBtn);
      section.appendChild(hdr);

      const hint = document.createElement('span');
      hint.textContent = `Elements for "${name}" section. Edit in YAML panel for now.`;
      hint.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
      section.appendChild(hint);

      this._dynFormsEl.appendChild(section);
    }
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const elem of this._elements) {
      const cfg = { ...elem.config };

      if (elem.type === 'annotation') {
        const annot: Record<string, any> = {};
        if (cfg.start_time_col) annot.start_time = { column: cfg.start_time_col, source_value: 'start_time' };
        if (cfg.end_time_col) annot.end_time = { column: cfg.end_time_col, source_value: 'end_time' };
        if (cfg.min_freq_col) annot.min_frequency = { column: cfg.min_freq_col };
        if (cfg.max_freq_col) annot.max_frequency = { column: cfg.max_freq_col };
        if (cfg.tools) annot.tools = cfg.tools;
        result.annotation = annot;
        continue;
      }

      if (elem.type === 'submission_buttons') {
        const sb: Record<string, any> = {};
        if (cfg.line) sb.line = true;
        if (cfg.previous) sb.previous = true;
        if (cfg.next_label) sb.next = { label: cfg.next_label };
        if (cfg.submit_label) sb.submit = { label: cfg.submit_label };
        result.submission_buttons = sb;
        continue;
      }

      if (elem.type === 'title') {
        if (cfg.progress_tracker) {
          result.title = { value: cfg.value || '', progress_tracker: true };
        } else {
          result.title = cfg.value || '';
        }
        continue;
      }

      if (elem.type === 'dynamic_form') {
        if (cfg.name) {
          if (!this._dynamicForms[cfg.name]) {
            this._dynamicForms[cfg.name] = cfg.elements || [];
          }
        }
        continue;
      }

      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (v !== undefined && v !== null && v !== '' && v !== false) {
          cleaned[k] = v;
        }
      }
      result[elem.type] = cleaned;
    }

    if (Object.keys(this._dynamicForms).length > 0) {
      result.dynamic_forms = this._dynamicForms;
    }

    return result;
  }

  setData(data: Record<string, any>): void {
    this._elements = [];
    this._listEl.innerHTML = '';
    this._dynamicForms = {};

    if (data.dynamic_forms) {
      this._dynamicForms = data.dynamic_forms;
      this._rebuildDynFormsUI();
      for (const [name, elements] of Object.entries(this._dynamicForms)) {
        this._addElement('dynamic_form', { name, elements });
      }
    }

    for (const [key, val] of Object.entries(data)) {
      if (key === 'dynamic_forms') continue;
      const type = key as ElementType;
      if (['title', 'select', 'textbox', 'checkbox', 'number',
        'annotation', 'pass_value', 'fixed_value', 'submission_buttons'].includes(type)) {
        let cfg: Record<string, any>;
        if (typeof val === 'string') {
          cfg = { value: val };
        } else {
          cfg = { ...val };
        }
        this._addElement(type, cfg);
      }
    }
  }
}
