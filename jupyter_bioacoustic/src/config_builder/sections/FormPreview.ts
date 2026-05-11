import { COLORS } from '../../styles';

export class FormPreview {
  readonly element: HTMLDetailsElement;

  private _body: HTMLDivElement;
  private _empty = true;

  constructor() {
    this.element = document.createElement('details');
    this.element.style.cssText =
      `border-top:2px solid ${COLORS.mauve};margin-top:4px;`;

    const summary = document.createElement('summary');
    summary.textContent = 'Form Preview';
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgCrust};color:${COLORS.mauve};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:12px;background:${COLORS.bgCrust};display:flex;flex-direction:column;gap:10px;`;

    this.element.append(summary, this._body);
    this._renderEmpty();
  }

  update(formData: Record<string, any>): void {
    const hasElements = Object.keys(formData).length > 0;
    this._empty = !hasElements;
    this._body.innerHTML = '';

    if (!hasElements) {
      this._renderEmpty();
      return;
    }

    this.element.style.opacity = '1';

    for (const [key, val] of Object.entries(formData)) {
      if (key === 'dynamic_forms') continue;
      this._renderElement(key, val);
    }
  }

  private _renderEmpty(): void {
    this.element.style.opacity = '0.5';
    const msg = document.createElement('div');
    msg.textContent = 'No form elements configured.';
    msg.style.cssText = `color:${COLORS.textMuted};font-size:12px;font-style:italic;padding:8px 0;`;
    this._body.appendChild(msg);
  }

  private _renderElement(type: string, cfg: any): void {
    switch (type) {
      case 'title':
        this._renderTitle(cfg);
        break;
      case 'select':
        this._renderSelect(cfg);
        break;
      case 'textbox':
        this._renderTextbox(cfg);
        break;
      case 'checkbox':
        this._renderCheckbox(cfg);
        break;
      case 'number':
        this._renderNumber(cfg);
        break;
      case 'annotation':
        this._renderAnnotation(cfg);
        break;
      case 'pass_value':
      case 'fixed_value':
        this._renderHidden(type, cfg);
        break;
      case 'submission_buttons':
        this._renderButtons(cfg);
        break;
    }
  }

  private _renderTitle(cfg: any): void {
    const text = typeof cfg === 'string' ? cfg : cfg?.value || 'TITLE';
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `font-size:14px;font-weight:700;color:${COLORS.textPrimary};` +
      `letter-spacing:0.5px;padding:4px 0;border-bottom:1px solid ${COLORS.bgSurface1};`;
    this._body.appendChild(el);
  }

  private _renderSelect(cfg: any): void {
    const wrapper = this._fieldWrapper(cfg.label || 'Select');
    const sel = document.createElement('select');
    sel.disabled = true;
    sel.style.cssText = this._inputCss() + `width:180px;`;
    const items = cfg.items;
    if (Array.isArray(items)) {
      for (const it of items.slice(0, 10)) {
        const o = document.createElement('option');
        o.textContent = typeof it === 'string' ? it : it.label || it.value || '';
        sel.appendChild(o);
      }
      if (items.length > 10) {
        const o = document.createElement('option');
        o.textContent = `… +${items.length - 10} more`;
        sel.appendChild(o);
      }
    } else if (items && typeof items === 'object' && items.path) {
      const o = document.createElement('option');
      o.textContent = `[from: ${items.path}]`;
      sel.appendChild(o);
    } else if (typeof items === 'string' && items.startsWith('form:')) {
      const o = document.createElement('option');
      o.textContent = `[dynamic: ${items.slice(5)}]`;
      sel.appendChild(o);
    }
    if (sel.options.length === 0) {
      const o = document.createElement('option');
      o.textContent = '(no items)';
      sel.appendChild(o);
    }
    wrapper.appendChild(sel);
    if (cfg.required) {
      const req = document.createElement('span');
      req.textContent = '*';
      req.style.cssText = `color:${COLORS.red};font-weight:700;margin-left:4px;`;
      wrapper.appendChild(req);
    }
    this._body.appendChild(wrapper);
  }

  private _renderTextbox(cfg: any): void {
    const wrapper = this._fieldWrapper(cfg.label || 'Text');
    if (cfg.multiline) {
      const ta = document.createElement('textarea');
      ta.disabled = true;
      ta.rows = 2;
      ta.style.cssText = this._inputCss() + `width:200px;resize:none;`;
      wrapper.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.disabled = true;
      inp.type = 'text';
      inp.style.cssText = this._inputCss() + `width:200px;`;
      wrapper.appendChild(inp);
    }
    this._body.appendChild(wrapper);
  }

  private _renderCheckbox(cfg: any): void {
    const wrapper = this._fieldWrapper(cfg.label || 'Checkbox');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.disabled = true;
    cb.style.cssText = `accent-color:${COLORS.blue};`;
    wrapper.appendChild(cb);
    this._body.appendChild(wrapper);
  }

  private _renderNumber(cfg: any): void {
    const wrapper = this._fieldWrapper(cfg.label || 'Number');
    const inp = document.createElement('input');
    inp.disabled = true;
    inp.type = 'number';
    inp.min = String(cfg.min ?? 0);
    inp.max = String(cfg.max ?? 1);
    inp.step = String(cfg.step ?? 0.1);
    inp.style.cssText = this._inputCss() + `width:80px;`;
    const range = document.createElement('span');
    range.textContent = `(${cfg.min ?? 0} – ${cfg.max ?? 1})`;
    range.style.cssText = `color:${COLORS.textMuted};font-size:10px;margin-left:6px;`;
    wrapper.append(inp, range);
    this._body.appendChild(wrapper);
  }

  private _renderAnnotation(cfg: any): void {
    const el = document.createElement('div');
    el.style.cssText =
      `padding:6px 10px;border:1px dashed ${COLORS.bgSurface2};border-radius:4px;` +
      `color:${COLORS.textSubtle};font-size:11px;`;
    const tools = cfg.tools ? cfg.tools.join(', ') : 'start_end_time_select';
    el.textContent = `[Annotation: ${tools}]`;
    this._body.appendChild(el);
  }

  private _renderHidden(type: string, cfg: any): void {
    const el = document.createElement('div');
    el.style.cssText = `color:${COLORS.textMuted};font-size:10px;font-style:italic;`;
    if (type === 'pass_value') {
      el.textContent = `(hidden: ${cfg.source_column || '?'} → ${cfg.column || '?'})`;
    } else {
      el.textContent = `(fixed: ${cfg.column || '?'} = ${cfg.value || '?'})`;
    }
    this._body.appendChild(el);
  }

  private _renderButtons(cfg: any): void {
    if (cfg.line) {
      const hr = document.createElement('hr');
      hr.style.cssText = `border:none;border-top:1px solid ${COLORS.bgSurface1};margin:4px 0;`;
      this._body.appendChild(hr);
    }
    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:8px;justify-content:flex-end;`;

    if (cfg.previous) {
      row.appendChild(this._previewBtn('Previous', false));
    }
    if (cfg.next) {
      const label = typeof cfg.next === 'object' ? cfg.next.label : 'Skip';
      row.appendChild(this._previewBtn(label || 'Skip', false));
    }
    const submitLabel = typeof cfg.submit === 'object' ? cfg.submit.label : 'Submit';
    row.appendChild(this._previewBtn(submitLabel || 'Submit', true));

    this._body.appendChild(row);
  }

  private _previewBtn(text: string, primary: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.disabled = true;
    btn.style.cssText = primary
      ? `background:${COLORS.blue};border:none;border-radius:4px;color:${COLORS.bgBase};padding:5px 14px;font-size:12px;font-weight:700;opacity:0.8;`
      : `background:${COLORS.bgSurface1};border:none;border-radius:4px;color:${COLORS.textPrimary};padding:5px 12px;font-size:12px;opacity:0.8;`;
    return btn;
  }

  private _fieldWrapper(label: string): HTMLDivElement {
    const w = document.createElement('div');
    w.style.cssText = `display:flex;align-items:center;gap:10px;`;
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = `color:${COLORS.textSubtle};font-size:12px;min-width:100px;flex-shrink:0;`;
    w.appendChild(lbl);
    return w;
  }

  private _inputCss(): string {
    return `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:4px 8px;font-size:12px;`;
  }
}
