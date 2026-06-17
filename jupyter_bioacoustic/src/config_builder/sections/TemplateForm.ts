/**
 * TemplateForm
 *
 * "Create from Template" UI for the config-builder Setup section: a selectable
 * template list plus the per-template input form. Phase 1 renders builder
 * elements as plain text inputs; the dynamic source/column widgets land in a
 * later phase.
 *
 * License: BSD 3-Clause
 */
import { Signal } from '@lumino/signaling';
import { COLORS, inputStyle, selectStyle, btnStyle } from '../../styles';
import { showDialog } from '../../util';
import { renderMarkdown } from '../../sections/DescriptionPanel';


//
// Constants
//
const SCOPE_SECTIONS: Record<string, string[]> = {
  project: ['project', 'config', 'form'],
  config: ['config', 'form'],
  form: ['form'],
};


//
// Types
//
export interface TemplateSummary {
  name: string;
  title: string;
  short_description: string;
}

interface Field {
  key: string;
  required: boolean;
  input: HTMLInputElement;
}

interface ElementSpec {
  required: boolean;
  default: any;
  label?: string;
  description?: string;
}


//
// Public
//
export class TemplateForm {
  readonly element: HTMLDivElement;
  readonly listRequested = new Signal<this, void>(this);
  readonly templateSelected = new Signal<this, string>(this);
  readonly applyRequested = new Signal<this, {
    name: string; scope: string; projectName: string; values: Record<string, string>;
  }>(this);

  private _listEl: HTMLDivElement;
  private _detailEl: HTMLDivElement;
  private _rows = new Map<string, HTMLDivElement>();
  private _selectedName = '';
  private _template: Record<string, any> | null = null;
  private _requested = false;

  private _scopeSelect!: HTMLSelectElement;
  private _nameInput!: HTMLInputElement;
  private _formEl!: HTMLDivElement;
  private _saveBtn!: HTMLButtonElement;
  private _fields: Field[] = [];

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText = `display:flex;flex-direction:column;gap:8px;padding:4px 0;`;

    this._listEl = document.createElement('div');
    this._listEl.style.cssText =
      `display:flex;flex-direction:column;border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;max-height:240px;overflow-y:auto;`;

    this._detailEl = document.createElement('div');
    this._detailEl.style.cssText = `display:none;flex-direction:column;gap:8px;`;

    this.element.append(this._listEl, this._detailEl);
    this._renderListPlaceholder('Loading templates…');
  }

  /** Called when the tab becomes visible; requests the list once. */
  activate(): void {
    if (!this._requested) {
      this._requested = true;
      this.listRequested.emit();
    }
  }

  setList(items: TemplateSummary[]): void {
    this._listEl.innerHTML = '';
    this._rows.clear();
    if (!items.length) {
      this._renderListPlaceholder('No templates found.');
      return;
    }
    for (const it of items) {
      const row = document.createElement('div');
      row.style.cssText =
        `padding:8px 10px;cursor:pointer;border-bottom:1px solid ${COLORS.bgSurface1};` +
        `display:flex;flex-direction:column;gap:2px;`;
      const title = document.createElement('div');
      title.textContent = it.title;
      title.style.cssText = `color:${COLORS.textPrimary};font-size:12px;font-weight:600;`;
      const desc = document.createElement('div');
      desc.textContent = it.short_description;
      desc.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
      row.append(title, desc);
      row.addEventListener('mouseenter', () => {
        if (it.name !== this._selectedName) row.style.background = COLORS.bgSurface0;
      });
      row.addEventListener('mouseleave', () => {
        if (it.name !== this._selectedName) row.style.background = '';
      });
      row.addEventListener('click', () => this._onSelect(it.name));
      this._rows.set(it.name, row);
      this._listEl.appendChild(row);
    }
  }

  setTemplate(name: string, template: Record<string, any>): void {
    if (name !== this._selectedName) return;
    this._template = template;
    this._renderDetail();
  }

  reset(): void {
    this._selectedName = '';
    this._template = null;
    this._detailEl.style.display = 'none';
    this._detailEl.innerHTML = '';
    for (const row of this._rows.values()) row.style.background = '';
  }


  //
  // Internal — actions
  //
  private _onSelect(name: string): void {
    this._selectedName = name;
    for (const [n, row] of this._rows) {
      row.style.background = n === name ? COLORS.bgSurface1 : '';
    }
    this._detailEl.style.display = 'none';
    this.templateSelected.emit(name);
  }

  private _onSave(): void {
    if (this._saveBtn.disabled) return;
    const values: Record<string, string> = {};
    for (const f of this._fields) {
      const v = f.input.value.trim();
      if (v) values[f.key] = v;
    }
    this.applyRequested.emit({
      name: this._selectedName,
      scope: this._scopeSelect.value,
      projectName: this._nameInput.value.trim(),
      values,
    });
  }

  private async _onDismiss(): Promise<void> {
    const choice = await showDialog({
      title: 'Discard template?',
      body: 'Your template inputs will be lost. Proceed?',
      buttons: [{ label: 'Cancel' }, { label: 'Discard', primary: true }],
    });
    if (choice === 'Discard') this.reset();
  }


  //
  // Internal — rendering
  //
  private _renderDetail(): void {
    const tpl = this._template!;
    this._detailEl.innerHTML = '';
    this._detailEl.style.display = 'flex';

    const head = document.createElement('div');
    head.innerHTML = renderMarkdown(`# ${tpl.title ?? this._selectedName}\n\n${tpl.description ?? ''}`);
    head.style.cssText = `color:${COLORS.textPrimary};font-size:12px;`;
    this._detailEl.appendChild(head);

    const scopeRow = document.createElement('div');
    scopeRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
    this._scopeSelect = document.createElement('select');
    this._scopeSelect.style.cssText = selectStyle();
    for (const s of ['project', 'config', 'form']) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      this._scopeSelect.appendChild(o);
    }
    this._scopeSelect.value = 'project';
    this._scopeSelect.addEventListener('change', () => this._renderForm());
    scopeRow.append(this._label('create'), this._scopeSelect);
    this._detailEl.appendChild(scopeRow);

    const nameRow = document.createElement('div');
    nameRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
    this._nameInput = document.createElement('input');
    this._nameInput.style.cssText = inputStyle('300px');
    this._nameInput.placeholder = 'e.g. Bird Review';
    this._nameInput.addEventListener('input', () => this._updateSaveEnabled());
    nameRow.append(this._label('name *'), this._nameInput);
    this._detailEl.appendChild(nameRow);

    this._formEl = document.createElement('div');
    this._formEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
    this._detailEl.appendChild(this._formEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display:flex;gap:8px;margin-top:4px;`;
    this._saveBtn = document.createElement('button');
    this._saveBtn.textContent = 'Save';
    this._saveBtn.style.cssText = btnStyle(true);
    this._saveBtn.addEventListener('click', () => this._onSave());
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = btnStyle(false);
    dismissBtn.addEventListener('click', () => this._onDismiss());
    btnRow.append(this._saveBtn, dismissBtn);
    this._detailEl.appendChild(btnRow);

    this._renderForm();
  }

  private _renderForm(): void {
    this._formEl.innerHTML = '';
    this._fields = [];
    const tpl = this._template!;
    const scope = this._scopeSelect.value;
    for (const section of SCOPE_SECTIONS[scope] ?? []) {
      const sec = tpl[section];
      if (!sec || typeof sec !== 'object') continue;
      if (sec.template_description) {
        const d = document.createElement('div');
        d.innerHTML = renderMarkdown(String(sec.template_description));
        d.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
        this._formEl.appendChild(d);
      }
      if (Array.isArray(sec.builder_elements)) {
        this._renderElements(sec.builder_elements, this._formEl);
      }
    }
    this._updateSaveEnabled();
  }

  private _renderElements(elements: any[], parent: HTMLElement): void {
    for (const item of elements) {
      if (!item || typeof item !== 'object') continue;
      if (item.group && typeof item.group === 'object') {
        const g = item.group;
        const box = document.createElement('div');
        box.style.cssText =
          `display:flex;flex-direction:column;gap:6px;` +
          `border-left:2px solid ${COLORS.bgSurface1};padding-left:8px;`;
        if (g.group_name) {
          const t = document.createElement('div');
          t.textContent = g.group_name;
          t.style.cssText =
            `color:${COLORS.textSubtle};font-size:11px;font-weight:600;text-transform:uppercase;`;
          box.appendChild(t);
        }
        if (g.group_description) {
          const dd = document.createElement('div');
          dd.textContent = g.group_description;
          dd.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
          box.appendChild(dd);
        }
        if (Array.isArray(g.elements)) this._renderElements(g.elements, box);
        parent.appendChild(box);
        continue;
      }
      const key = Object.keys(item)[0];
      if (key) this._renderField(key, item[key], parent);
    }
  }

  private _renderField(key: string, spec: any, parent: HTMLElement): void {
    const norm = this._normalize(spec);
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;`;
    const lbl = this._label((norm.label || key) + (norm.required ? ' *' : ''));
    if (norm.description) lbl.title = norm.description;
    const input = document.createElement('input');
    input.style.cssText = inputStyle('300px');
    if (norm.default != null) input.value = String(norm.default);
    if (norm.description) input.placeholder = norm.description;
    input.addEventListener('input', () => this._updateSaveEnabled());
    row.append(lbl, input);
    parent.appendChild(row);
    this._fields.push({ key, required: norm.required, input });
  }

  private _updateSaveEnabled(): void {
    const nameOk = !!this._nameInput.value.trim();
    const requiredOk = this._fields.every(f => !f.required || !!f.input.value.trim());
    this._saveBtn.disabled = !(nameOk && requiredOk);
    this._saveBtn.style.opacity = this._saveBtn.disabled ? '0.5' : '1';
    this._saveBtn.style.cursor = this._saveBtn.disabled ? 'not-allowed' : 'pointer';
  }

  private _normalize(spec: any): ElementSpec {
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      return {
        required: !!spec.required,
        default: spec.default ?? null,
        label: spec.label,
        description: spec.description,
      };
    }
    if (spec === true) return { required: true, default: null };
    if (spec === false) return { required: false, default: null };
    return { required: false, default: spec };
  }

  private _label(text: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = `color:${COLORS.textSubtle};font-size:12px;min-width:140px;`;
    return s;
  }

  private _renderListPlaceholder(msg: string): void {
    this._listEl.innerHTML = '';
    const p = document.createElement('div');
    p.textContent = msg;
    p.style.cssText = `padding:10px;color:${COLORS.textMuted};font-size:11px;`;
    this._listEl.appendChild(p);
  }
}
