import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

const ALL_ANNOTATION_TOOLS = [
  'time_select', 'start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration',
];

type ElementType = 'title' | 'select' | 'textbox' | 'checkbox' | 'number' |
  'annotation' | 'pass_value' | 'fixed_value' | 'submission_buttons' |
  'break' | 'line' | 'text';

interface FormElement {
  type: ElementType;
  config: Record<string, any>;
  el: HTMLDivElement;
}

interface DynForm {
  name: string;
  elements: FormElement[];
  el: HTMLDivElement;
  listEl: HTMLDivElement;
}

export class FormSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, { callback: (path: string) => void }>(this);
  readonly columnsRequested = new Signal<this, { path: string; callback: (cols: string[]) => void }>(this);

  private _elements: FormElement[] = [];
  private _dynForms: DynForm[] = [];
  private _listEl: HTMLDivElement;
  private _addBar: HTMLDivElement;
  private _dynFormsContainer: HTMLDivElement;

  constructor() {
    super('Form', 'form', false, true, ['project', 'config', 'form']);

    const hint = document.createElement('div');
    hint.textContent = 'Click on the buttons below to add items to the form.';
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

    const dynHeader = this._makeRow();
    const dynLabel = document.createElement('div');
    dynLabel.textContent = 'Dynamic Forms';
    dynLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.textMuted};letter-spacing:0.5px;`;
    const addDynBtn = this._makeButton('+ Dynamic Form');
    addDynBtn.style.fontSize = '11px';
    addDynBtn.addEventListener('click', () => this._promptAddDynForm());
    dynHeader.append(dynLabel, addDynBtn);
    this._dynFormsContainer.appendChild(dynHeader);
    this._body.appendChild(this._dynFormsContainer);
  }

  private _makeAddBar(onAdd?: (type: ElementType) => void): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText =
      `display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px 8px;padding:6px 0;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};margin-bottom:4px;`;
    const columns: { header: string; rows: ElementType[][] }[] = [
      { header: 'Display', rows: [['title', 'text'], ['line', 'break']] },
      { header: 'User Input', rows: [['annotation', 'select'], ['textbox', 'checkbox', 'number']] },
      { header: 'Data', rows: [['pass_value'], ['fixed_value']] },
      { header: 'Navigation', rows: [['submission_buttons']] },
    ];
    const mkBtn = (t: ElementType) => {
      const btn = this._makeButton(`+ ${t}`);
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

  private _addElement(type: ElementType, config?: Record<string, any>, target?: { elements: FormElement[]; listEl: HTMLDivElement }): void {
    const cfg = config || this._defaultConfig(type);
    const tgt = target || { elements: this._elements, listEl: this._listEl };
    const card = this._buildElementCard(type, cfg, tgt);
    const fe: FormElement = { type, config: cfg, el: card };
    tgt.elements.push(fe);
    tgt.listEl.appendChild(card);
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
      case 'submission_buttons': return { show_icon: true, submit: true, next: false, previous: false };
      case 'break': return {};
      case 'line': return {};
      case 'text': return { value: '' };
      default: return {};
    }
  }

  private _buildElementCard(type: ElementType, cfg: Record<string, any>, target: { elements: FormElement[]; listEl: HTMLDivElement }): HTMLDivElement {
    const card = document.createElement('div');
    card.style.cssText =
      `background:${COLORS.bgSurface0};border-radius:6px;padding:8px 10px;` +
      `display:flex;flex-direction:column;gap:5px;`;
    card.addEventListener('focusin', () => this.fieldFocused.emit(type));
    card.addEventListener('click', () => this.fieldFocused.emit(type));

    const header = this._makeRow();
    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    typeLabel.style.cssText =
      `font-size:12px;font-weight:700;color:${COLORS.blue};flex:1;`;

    const moveUp = this._makeButton('▲');
    moveUp.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveUp.addEventListener('click', () => this._moveElement(card, -1, target));

    const moveDown = this._makeButton('▼');
    moveDown.style.cssText += `font-size:10px;padding:2px 6px;`;
    moveDown.addEventListener('click', () => this._moveElement(card, 1, target));

    const removeBtn = this._makeButton('✕');
    removeBtn.style.cssText += `font-size:10px;padding:2px 6px;color:${COLORS.red};`;
    removeBtn.addEventListener('click', () => this._removeElement(card, target));

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
        this._addLabelColumnFields(card, cfg);
        this._addCheckboxField(card, cfg, 'required', 'required');
        this._addSelectItemsBuilder(card, cfg);
        break;
      case 'textbox':
        this._addLabelColumnFields(card, cfg);
        this._addCheckboxField(card, cfg, 'multiline', 'multiline');
        break;
      case 'checkbox':
        this._addLabelColumnFields(card, cfg);
        this._addField(card, cfg, 'checked_value', 'checked_value', '100px');
        this._addField(card, cfg, 'unchecked_value', 'unchecked_value', '100px');
        this._addField(card, cfg, 'checked_form', 'checked_form', '150px');
        this._addField(card, cfg, 'unchecked_form', 'unchecked_form', '150px');
        break;
      case 'number':
        this._addLabelColumnFields(card, cfg);
        this._addNumField(card, cfg, 'min', 'min', '60px');
        this._addNumField(card, cfg, 'max', 'max', '60px');
        this._addNumField(card, cfg, 'step', 'step', '60px');
        break;
      case 'annotation': {
        this._buildAnnotationToolList(card, cfg);
        this._addField(card, cfg, 'start_time_col', 'start_time col', '120px');
        this._addField(card, cfg, 'end_time_col', 'end_time col', '120px');
        this._addField(card, cfg, 'min_freq_col', 'min_freq col', '120px');
        this._addField(card, cfg, 'max_freq_col', 'max_freq col', '120px');
        this._addField(card, cfg, 'form', 'form (dynamic)', '150px');
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
        this._addCheckboxField(card, cfg, 'show_icon', 'show icon');
        this._addInlineButtonField(card, cfg, 'previous', 'previous btn');
        this._addInlineButtonField(card, cfg, 'next', 'next btn');
        this._addInlineButtonField(card, cfg, 'submit', 'submit btn');
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
          this._emitChanged();
        });
        card.appendChild(this._makeFieldRow('text', ta));
        break;
      }
      case 'break':
      case 'line':
        break;
    }
  }

  private _addLabelColumnFields(card: HTMLDivElement, cfg: Record<string, any>): void {
    const labelInp = this._makeInput('label', '150px');
    if (cfg.label != null) labelInp.value = String(cfg.label);
    const colInp = this._makeInput('column', '150px');
    if (cfg.column != null) colInp.value = String(cfg.column);
    const userEditedCol = { value: !!cfg.column };
    labelInp.addEventListener('input', () => {
      cfg.label = labelInp.value;
      if (!userEditedCol.value) {
        const snake = labelInp.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        colInp.value = snake;
        cfg.column = snake;
      }
      this._emitChanged();
    });
    colInp.addEventListener('input', () => {
      userEditedCol.value = !!colInp.value;
      cfg.column = colInp.value;
      this._emitChanged();
    });
    card.appendChild(this._makeFieldRow('label', labelInp));
    card.appendChild(this._makeFieldRow('column', colInp));
  }

  private _buildAnnotationToolList(card: HTMLDivElement, cfg: Record<string, any>): void {
    if (!Array.isArray(cfg.tools)) cfg.tools = ['start_end_time_select'];

    const TOOL_ROW_W = '400px';
    const FD_INPUT_W = '60px';

    const toolName = (t: any): string =>
      typeof t === 'string' ? t : (typeof t === 'object' && t ? Object.keys(t)[0] : '');

    const listEl = document.createElement('div');
    listEl.style.cssText = `display:flex;flex-direction:column;gap:3px;width:${TOOL_ROW_W};`;

    let dragSrcIdx: number | null = null;

    const rebuild = () => {
      listEl.innerHTML = '';
      const currentEnabled = new Set((cfg.tools as any[]).map(toolName));
      const currentDisabled = ALL_ANNOTATION_TOOLS.filter(t => !currentEnabled.has(t));

      (cfg.tools as any[]).forEach((tool: any, idx: number) => {
        const name = toolName(tool);
        const row = document.createElement('div');
        row.draggable = true;
        row.style.cssText =
          `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
          `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
          `border-radius:4px;font-size:12px;color:${COLORS.textPrimary};cursor:grab;`;

        row.addEventListener('dragstart', (e) => {
          dragSrcIdx = idx;
          row.style.opacity = '0.4';
          e.dataTransfer!.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          row.style.opacity = '1';
          dragSrcIdx = null;
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = 'move';
          row.style.borderColor = COLORS.blue;
        });
        row.addEventListener('dragleave', () => {
          row.style.borderColor = COLORS.bgSurface1;
        });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.style.borderColor = COLORS.bgSurface1;
          if (dragSrcIdx == null || dragSrcIdx === idx) return;
          const [moved] = cfg.tools.splice(dragSrcIdx, 1);
          cfg.tools.splice(idx, 0, moved);
          dragSrcIdx = null;
          this._emitChanged();
          rebuild();
        });

        const label = document.createElement('span');
        label.textContent = name.replace(/_/g, ' ');
        label.style.cssText = `flex:1;`;
        row.appendChild(label);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.title = 'Disable tool';
        removeBtn.style.cssText =
          `background:none;border:none;color:${COLORS.red};cursor:pointer;` +
          `font-size:14px;padding:0 2px;line-height:1;`;
        removeBtn.addEventListener('click', () => {
          cfg.tools.splice(idx, 1);
          this._emitChanged();
          rebuild();
        });
        row.appendChild(removeBtn);

        listEl.appendChild(row);

        if (name === 'fixed_duration') {
          let fdCfg: Record<string, any>;
          if (typeof tool === 'object' && tool.fixed_duration != null) {
            fdCfg = typeof tool.fixed_duration === 'object'
              ? tool.fixed_duration : { window: tool.fixed_duration };
          } else {
            fdCfg = { window: 3 };
            cfg.tools[idx] = { fixed_duration: fdCfg };
          }

          const isInitial = fdCfg.initial_window != null;

          const detail = document.createElement('div');
          detail.style.cssText =
            `display:flex;gap:6px;flex-wrap:wrap;padding:2px 0 2px 12px;`;

          const mkNum = (
            key: string, placeholder: string, disabled = false,
          ): HTMLInputElement => {
            const inp = this._makeInput(placeholder, FD_INPUT_W);
            inp.type = 'number';
            inp.step = 'any';
            if (fdCfg[key] != null) inp.value = String(fdCfg[key]);
            inp.disabled = disabled;
            inp.style.opacity = disabled ? '0.35' : '1';
            inp.addEventListener('input', () => {
              const v = parseFloat(inp.value);
              if (inp.value === '') { delete fdCfg[key]; }
              else if (!isNaN(v)) { fdCfg[key] = v; }
              this._emitChanged();
            });
            return inp;
          };

          const valKey = isInitial ? 'initial_window' : 'window';
          const modeSel = this._makeSelect(['window', 'initial_window'], valKey);
          modeSel.style.cssText += `width:120px;font-size:11px;`;
          modeSel.addEventListener('change', () => {
            const v = fdCfg.window ?? fdCfg.initial_window ?? 3;
            delete fdCfg.window;
            delete fdCfg.initial_window;
            fdCfg[modeSel.value] = v;
            if (modeSel.value === 'initial_window') {
              if (fdCfg.step == null) fdCfg.step = 1;
            } else {
              delete fdCfg.min;
              delete fdCfg.max;
              delete fdCfg.step;
            }
            this._emitChanged();
            rebuild();
          });
          detail.appendChild(modeSel);
          detail.appendChild(mkNum(valKey, valKey));
          detail.appendChild(mkNum('min', 'min', !isInitial));
          detail.appendChild(mkNum('max', 'max', !isInitial));
          detail.appendChild(mkNum('step', 'step', !isInitial));

          listEl.appendChild(detail);
        }
      });

      if (currentDisabled.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText =
          `border-top:1px solid ${COLORS.bgSurface1};margin:4px 0 2px;`;
        listEl.appendChild(divider);

        for (const name of currentDisabled) {
          const row = document.createElement('div');
          row.style.cssText =
            `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
            `background:${COLORS.bgCrust};border:1px solid ${COLORS.bgSurface0};` +
            `border-radius:4px;font-size:12px;color:${COLORS.textMuted};opacity:0.6;`;

          const label = document.createElement('span');
          label.textContent = name.replace(/_/g, ' ');
          label.style.cssText = `flex:1;`;
          row.appendChild(label);

          const addBtn = document.createElement('button');
          addBtn.textContent = '+';
          addBtn.title = 'Enable tool';
          addBtn.style.cssText =
            `background:none;border:none;color:${COLORS.green};cursor:pointer;` +
            `font-size:16px;padding:0 2px;line-height:1;font-weight:bold;`;
          addBtn.addEventListener('click', () => {
            if (name === 'fixed_duration') {
              cfg.tools.push({ fixed_duration: { window: 3 } });
            } else {
              cfg.tools.push(name);
            }
            this._emitChanged();
            rebuild();
          });
          row.appendChild(addBtn);

          listEl.appendChild(row);
        }
      }
    };

    rebuild();

    const container = document.createElement('div');
    container.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    container.appendChild(listEl);
    card.appendChild(this._makeFieldRow('tools', container));
  }

  private _addField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string, width: string): void {
    const inp = this._makeInput(label, width);
    if (cfg[key] !== undefined && cfg[key] !== null) inp.value = String(cfg[key]);
    inp.addEventListener('input', () => {
      cfg[key] = inp.value;
      this._emitChanged();
    });
    card.appendChild(this._makeFieldRow(label, inp));
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
    card.appendChild(this._makeFieldRow(label, inp));
  }

  private _addCheckboxField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string): void {
    const { row, input } = this._makeCheckbox(label, !!cfg[key]);
    input.addEventListener('change', () => {
      cfg[key] = input.checked;
      this._emitChanged();
    });
    card.appendChild(row);
  }

  private _addInlineButtonField(card: HTMLDivElement, cfg: Record<string, any>, key: string, label: string): void {
    const row = this._makeRow();

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cssText = `accent-color:${COLORS.blue};margin-right:6px;`;

    // Use existing value if defined, otherwise use defaults from _defaultConfig
    if (cfg[key] === undefined) {
      const defaults = this._defaultConfig('submission_buttons');
      cfg[key] = defaults[key] ?? false;
    }
    checkbox.checked = !!cfg[key];

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.cssText = `color:${COLORS.textSubtle};font-size:11px;margin-left:-7px;width:70px;`;

    const textInput = this._makeInput(`custom ${label.replace(' btn', '')} label`, '140px');
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
      this._emitChanged();
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
      this._emitChanged();
    });

    row.append(checkbox, labelSpan, textInput);
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

    const modeSel = this._makeSelect(['add items', 'from file', 'paste values', 'range'], 'add items');
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
        this._buildAddItems(itemsContent, cfg);
      } else if (m === 'from file') {
        this._buildFileItems(itemsContent, cfg);
      } else if (m === 'paste values') {
        this._buildPasteValues(itemsContent, cfg);
      } else {
        this._buildRangeItems(itemsContent, cfg);
      }
    };
    buildForMode(mode);

    modeSel.addEventListener('change', () => buildForMode(modeSel.value));
    card.appendChild(itemsArea);
  }

  private _buildAddItems(container: HTMLDivElement, cfg: Record<string, any>): void {
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

        const rm = this._makeButton('✕');
        rm.style.cssText += `font-size:9px;padding:1px 4px;color:${COLORS.red};`;
        rm.addEventListener('click', () => {
          cfg.items.splice(i, 1);
          renderList();
          this._emitChanged();
        });

        row.append(txt, rm);
        listEl.appendChild(row);
      }
    };
    renderList();
    container.appendChild(listEl);

    const addRow = document.createElement('div');
    addRow.style.cssText = `display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;`;

    const labelInp = this._makeInput('label', '90px');
    const valueInp = this._makeInput('value', '90px');
    const formInp = this._makeInput('form (opt)', '90px');

    const addBtn = this._makeButton('+ Add');
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
      this._emitChanged();
    });

    addRow.append(labelInp, valueInp, formInp, addBtn);
    container.appendChild(addRow);

    const hint = document.createElement('span');
    hint.textContent = 'Add items one at a time. Use form field to reference a dynamic form.';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;`;
    container.appendChild(hint);
  }

  private _buildPasteValues(container: HTMLDivElement, cfg: Record<string, any>): void {
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

    const sepInp = this._makeInput(',', '40px');
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
      this._emitChanged();
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

    const inp = this._makeInput('form name', '200px');
    inp.style.fontSize = '13px';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display:flex;gap:8px;justify-content:flex-end;`;

    const cancelBtn = this._makeButton('Cancel');
    cancelBtn.addEventListener('click', () => overlay.remove());

    const createBtn = this._makeButton('Create', true);
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

    const header = this._makeRow();
    const lbl = document.createElement('span');
    lbl.textContent = name;
    lbl.style.cssText = `font-size:12px;font-weight:700;color:${COLORS.mauve};flex:1;cursor:pointer;`;
    lbl.title = 'Double-click to rename';

    const startRename = () => {
      const renameInp = this._makeInput(df.name, '160px');
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

    const renameBtn = this._makeButton('✎');
    renameBtn.title = 'Rename form';
    renameBtn.style.cssText += `font-size:12px;padding:2px 6px;color:${COLORS.textPrimary};`;
    renameBtn.addEventListener('click', startRename);

    const rmBtn = this._makeButton('✕');
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

  private _moveElement(card: HTMLDivElement, direction: number, target: { elements: FormElement[]; listEl: HTMLDivElement }): void {
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

  private _removeElement(card: HTMLDivElement, target: { elements: FormElement[]; listEl: HTMLDivElement }): void {
    const idx = target.elements.findIndex(e => e.el === card);
    if (idx < 0) return;
    target.elements.splice(idx, 1);
    card.remove();
    this._emitChanged();
  }

  getData(): Record<string, any> {
    const USER_INPUT_TYPES: Set<string> = new Set(['select', 'textbox', 'checkbox', 'number']);
    const result: Record<string, any> = {};
    const formList: any[] = [];
    let submissionButtons: Record<string, any> | null = null;
    let seenUserInput = false;

    for (const elem of this._elements) {
      const cfg = { ...elem.config };

      if (elem.type === 'submission_buttons') {
        const sb: Record<string, any> = {};
        if (cfg.line) sb.line = true;
        if (cfg.previous) {
          if (cfg.previous_label) {
            sb.previous = {
              label: cfg.previous_label,
              icon: cfg.show_icon !== false
            };
          } else {
            sb.previous = true;
          }
        }
        if (cfg.next_label) {
          sb.next = {
            label: cfg.next_label,
            icon: cfg.show_icon !== false
          };
        } else if (cfg.next) {
          sb.next = true;
        }
        if (cfg.submit_label) {
          sb.submit = {
            label: cfg.submit_label,
            icon: cfg.show_icon !== false
          };
        } else if (cfg.submit) {
          sb.submit = true;
        }
        submissionButtons = sb;
        continue;
      }

      if (USER_INPUT_TYPES.has(elem.type)) seenUserInput = true;

      const serialized = this._serializeElement(elem.type, cfg);
      if (serialized === null) continue;

      const isSpecial = elem.type === 'title' || elem.type === 'annotation' ||
        elem.type === 'pass_value' || elem.type === 'fixed_value';
      const hasWrapper = typeof serialized === 'object' && serialized !== null &&
        !Array.isArray(serialized) && '__key' in serialized;
      const val = hasWrapper ? serialized.__val : serialized;

      if (!seenUserInput && isSpecial) {
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
        const elems: any[] = [];
        for (const fe of df.elements) {
          const cfg = { ...fe.config };
          const cleaned: Record<string, any> = {};
          for (const [k, v] of Object.entries(cfg)) {
            if (v !== undefined && v !== null && v !== '' && v !== false) {
              cleaned[k] = v;
            }
          }
          elems.push({ [fe.type]: cleaned });
        }
        dynDict[df.name] = elems;
      }
      result.dynamic_forms = dynDict;
    }

    return result;
  }

  private _serializeElement(type: ElementType, cfg: Record<string, any>): any {
    if (type === 'title') {
      if (cfg.progress_tracker) {
        return { __key: 'title', __val: { value: cfg.value || '', progress_tracker: true } };
      }
      return { __key: 'title', __val: cfg.value || '' };
    }

    if (type === 'pass_value') {
      return { __key: 'pass_value', __val: { source_column: cfg.source_column || '', column: cfg.column || '' } };
    }

    if (type === 'fixed_value') {
      return { __key: 'fixed_value', __val: { column: cfg.column || '', value: cfg.value || '' } };
    }

    if (type === 'annotation') {
      const annot: Record<string, any> = {};
      if (cfg.start_time_col) annot.start_time = { column: cfg.start_time_col, source_value: 'start_time' };
      if (cfg.end_time_col) annot.end_time = { column: cfg.end_time_col, source_value: 'end_time' };
      if (cfg.min_freq_col) annot.min_frequency = { column: cfg.min_freq_col };
      if (cfg.max_freq_col) annot.max_frequency = { column: cfg.max_freq_col };
      if (cfg.tools) annot.tools = cfg.tools;
      if (cfg.form) annot.form = cfg.form;
      return { __key: 'annotation', __val: annot };
    }

    if (type === 'break' || type === 'line') return true;
    if (type === 'text') return cfg.value || '';

    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  }

  setData(data: Record<string, any>): void {
    this._elements = [];
    this._listEl.innerHTML = '';
    this._dynForms = [];
    while (this._dynFormsContainer.children.length > 1) {
      this._dynFormsContainer.removeChild(this._dynFormsContainer.lastChild!);
    }

    if (data.title !== undefined) {
      const titleCfg = typeof data.title === 'string'
        ? { value: data.title }
        : { value: data.title?.value || '', progress_tracker: !!data.title?.progress_tracker };
      this._addElement('title', titleCfg);
    }

    if (data.pass_value) {
      this._addElement('pass_value', { ...data.pass_value });
    }

    if (data.fixed_value) {
      this._addElement('fixed_value', { ...data.fixed_value });
    }

    if (data.annotation) {
      const a = data.annotation;
      const cfg: Record<string, any> = {};
      if (a.start_time) cfg.start_time_col = a.start_time?.column || a.start_time;
      if (a.end_time) cfg.end_time_col = a.end_time?.column || a.end_time;
      if (a.min_frequency) cfg.min_freq_col = a.min_frequency?.column || a.min_frequency;
      if (a.max_frequency) cfg.max_freq_col = a.max_frequency?.column || a.max_frequency;
      if (a.tools) cfg.tools = a.tools;
      if (a.form) cfg.form = a.form;
      this._addElement('annotation', cfg);
    }

    if (Array.isArray(data.form)) {
      for (const item of data.form) {
        if (!item || typeof item !== 'object') continue;
        const [type] = Object.keys(item);
        const cfg = typeof item[type] === 'object' && item[type] !== null ? { ...item[type] } : { value: item[type] };
        this._addElement(type as ElementType, cfg);
      }
    } else {
      for (const key of ['select', 'textbox', 'checkbox', 'number']) {
        if (data[key]) {
          const cfg = typeof data[key] === 'object' ? { ...data[key] } : { value: data[key] };
          this._addElement(key as ElementType, cfg);
        }
      }
    }

    if (data.submission_buttons) {
      const sb = data.submission_buttons;
      const cfg: Record<string, any> = {};
      if (sb.line) cfg.line = true;

      // Handle icon setting from any button
      const hasIcon = sb.previous?.icon !== false || sb.next?.icon !== false || sb.submit?.icon !== false;
      cfg.show_icon = hasIcon;

      if (sb.previous) {
        cfg.previous = true;
        if (typeof sb.previous === 'object' && sb.previous.label) {
          cfg.previous_label = sb.previous.label;
        }
      }
      if (sb.next) {
        cfg.next = true;
        if (typeof sb.next === 'object' && sb.next.label) {
          cfg.next_label = sb.next.label;
        }
      }
      if (sb.submit) {
        cfg.submit = true;
        if (typeof sb.submit === 'object' && sb.submit.label) {
          cfg.submit_label = sb.submit.label;
        }
      }
      this._addElement('submission_buttons', cfg);
    }

    const dynForms = data.dynamic_forms;
    if (dynForms && typeof dynForms === 'object' && !Array.isArray(dynForms)) {
      for (const [name, elems] of Object.entries(dynForms)) {
        const feList: FormElement[] = [];
        if (Array.isArray(elems)) {
          for (const el of elems) {
            if (el && typeof el === 'object') {
              const [type] = Object.keys(el);
              const cfg = typeof el[type] === 'object' && el[type] !== null ? { ...el[type] } : { value: el[type] };
              feList.push({ type: type as ElementType, config: cfg, el: document.createElement('div') });
            }
          }
        }
        this._createDynForm(name, feList);
      }
    }
  }
}
