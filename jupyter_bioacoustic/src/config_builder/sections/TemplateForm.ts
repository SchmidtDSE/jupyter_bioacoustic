/**
 * TemplateForm
 *
 * "Create from Template" UI for the config-builder Setup section: a selectable
 * template list plus the per-template input form.
 *
 * The widget for each builder element is inferred from where its
 * ``__placeholder__`` sits in the template's ``configuration`` (a scoped
 * positional inference):
 *  - a ``*.source_type`` placeholder → a dropdown that live-reconfigures its
 *    paired ``value`` control (path ⇒ Browse, column ⇒ column picker, else text);
 *  - an index/select column → a **text input until the source file's columns are
 *    loaded**, then a dropdown of those columns (preserving the typed value);
 *  - a source path → text + Browse; everything else → text.
 * Columns and Browse reuse the kernel's read_columns + FileBrowser via ConfigPanel.
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
const DATA_EXTS = ['.csv', '.parquet', '.json', '.tsv', '.jsonl'];
const AUDIO_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac'];
const OUTPUT_EXTS = ['.csv', '.parquet', '.json', '.tsv'];
const COLUMN_FILE_RE = /\.(csv|parquet|json|jsonl|tsv)$/i;
const PLACEHOLDER_RE = /^__([a-zA-Z0-9_]+)__$/;
const SOURCE_TYPE_OPTIONS: Record<string, string[]> = {
  data: ['path', 'url', 'sql', 'api'],
  audio: ['path', 'url', 'uri', 'column'],
};


//
// Types
//
export interface TemplateSummary {
  name: string;
  title: string;
  short_description: string;
}

type Role = 'plain' | 'source_type' | 'value' | 'column' | 'pathfile';

interface Descriptor {
  role: Role;
  section?: 'data' | 'audio';
  exts?: string[];
  sourceTypeKey?: string;     // value: sibling source_type placeholder key (dynamic)
  literalSourceType?: string; // value: fixed source_type literal from config
  providerKey?: string;       // column / value(column): field holding the source file
}

interface Field {
  key: string;
  required: boolean;
  role: Role;
  default: any;
  value: string;              // source of truth (survives control swaps)
  host: HTMLDivElement;       // container the control(s) render into
  section?: 'data' | 'audio';
  exts?: string[];
  sourceTypeKey?: string;
  literalSourceType?: string;
  providerKey?: string;
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
  readonly browseRequested = new Signal<this, { key: string; exts: string[]; current: string }>(this);
  readonly columnsRequested = new Signal<this, string>(this);

  private _listEl: HTMLDivElement;
  private _detailEl: HTMLDivElement;
  private _rows = new Map<string, HTMLDivElement>();
  private _selectedName = '';
  private _template: Record<string, any> | null = null;
  private _requested = false;

  private _scopeSelect!: HTMLSelectElement;
  private _nameInput!: HTMLInputElement;
  private _editableEl!: HTMLDivElement;
  private _formEl!: HTMLDivElement;
  private _btnRow!: HTMLDivElement;
  private _saveBtn!: HTMLButtonElement;
  private _locked = false;
  private _fields: Field[] = [];
  private _fieldByKey = new Map<string, Field>();
  private _columnsByPath = new Map<string, string[]>();
  private _providerKeys = new Set<string>();
  private _debounce = new Map<string, any>();

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

  /** After a successful save: grey out + lock the form, show an Edit button. */
  markSaved(): void {
    this._setLocked(true);
  }

  /** Set a field's value (e.g. after a Browse pick) and refresh dependents. */
  setFieldValue(key: string, value: string): void {
    const f = this._fieldByKey.get(key);
    if (!f) return;
    f.value = value;
    this._renderControl(f);
    if (this._providerKeys.has(key)) {
      this._refreshColumnDependents(key);
      this._maybeRequestColumns(value);
    }
    this._updateSaveEnabled();
  }

  /** Populate column dropdowns whose source file is ``path``. */
  setColumns(path: string, cols: string[]): void {
    this._columnsByPath.set(path, cols);
    for (const f of this._fields) {
      if (this._isColumnConsumer(f) && this._providerValue(f) === path) {
        this._renderControl(f);
      }
    }
    this._updateSaveEnabled();
  }

  reset(): void {
    this._selectedName = '';
    this._template = null;
    this._locked = false;
    this._fields = [];
    this._fieldByKey.clear();
    this._columnsByPath.clear();
    this._providerKeys.clear();
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
      const v = (f.value || '').trim();
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

  private _maybeRequestColumns(path: string): void {
    const p = (path || '').trim();
    if (p && COLUMN_FILE_RE.test(p)) this.columnsRequested.emit(p);
  }


  //
  // Internal — detail + form rendering
  //
  private _renderDetail(): void {
    const tpl = this._template!;
    this._detailEl.innerHTML = '';
    this._detailEl.style.display = 'flex';

    this._locked = false;

    const head = document.createElement('div');
    head.innerHTML = renderMarkdown(`# ${tpl.title ?? this._selectedName}\n\n${tpl.description ?? ''}`);
    head.style.cssText = `color:${COLORS.textPrimary};font-size:12px;`;
    this._detailEl.appendChild(head);

    // Everything the Edit/Save state greys out lives in _editableEl.
    this._editableEl = document.createElement('div');
    this._editableEl.style.cssText = `display:flex;flex-direction:column;gap:8px;`;

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
    this._editableEl.appendChild(scopeRow);

    const nameRow = document.createElement('div');
    nameRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
    this._nameInput = document.createElement('input');
    this._nameInput.style.cssText = inputStyle('300px');
    this._nameInput.placeholder = 'e.g. Bird Review';
    this._nameInput.addEventListener('input', () => this._updateSaveEnabled());
    nameRow.append(this._label('name', true), this._nameInput);
    this._editableEl.appendChild(nameRow);

    this._formEl = document.createElement('div');
    this._formEl.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
    this._editableEl.appendChild(this._formEl);
    this._detailEl.appendChild(this._editableEl);

    this._btnRow = document.createElement('div');
    this._btnRow.style.cssText = `display:flex;gap:8px;margin-top:4px;`;
    this._detailEl.appendChild(this._btnRow);
    this._renderButtons();

    this._renderForm();
  }

  private _renderButtons(): void {
    this._btnRow.innerHTML = '';
    if (this._locked) {
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.style.cssText = btnStyle(true);
      edit.addEventListener('click', () => this._setLocked(false));
      this._btnRow.appendChild(edit);
      return;
    }
    this._saveBtn = document.createElement('button');
    this._saveBtn.textContent = 'Save';
    this._saveBtn.style.cssText = btnStyle(true);
    this._saveBtn.addEventListener('click', () => this._onSave());
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = btnStyle(false);
    dismissBtn.addEventListener('click', () => this._onDismiss());
    this._btnRow.append(this._saveBtn, dismissBtn);
    this._updateSaveEnabled();
  }

  private _setLocked(locked: boolean): void {
    this._locked = locked;
    this._editableEl.style.opacity = locked ? '0.55' : '1';
    this._editableEl.style.pointerEvents = locked ? 'none' : '';
    this._renderButtons();
  }

  private _renderForm(): void {
    this._formEl.innerHTML = '';
    this._fields = [];
    this._fieldByKey.clear();
    const tpl = this._template!;
    const scope = this._scopeSelect.value;
    const descriptors = this._analyze(scope);

    for (const section of SCOPE_SECTIONS[scope] ?? []) {
      const sec = tpl[section];
      if (!sec || typeof sec !== 'object') continue;
      const hasElements = Array.isArray(sec.builder_elements) && sec.builder_elements.length > 0;
      const hasDesc = !!sec.template_description;
      // A section with neither inputs nor a description (e.g. a fixed `config`)
      // contributes no UI — not even a title.
      if (!hasElements && !hasDesc) continue;
      this._formEl.appendChild(this._sectionHeader(section));
      if (hasDesc) {
        const d = document.createElement('div');
        d.innerHTML = renderMarkdown(String(sec.template_description));
        d.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
        this._formEl.appendChild(d);
      }
      if (hasElements) {
        this._renderElements(sec.builder_elements, this._formEl, descriptors);
      }
    }

    this._providerKeys = new Set(
      this._fields.map(f => f.providerKey).filter((k): k is string => !!k),
    );
    for (const f of this._fields) this._renderControl(f);
    // Seed columns from any path provider that already has a value.
    for (const f of this._fields) {
      if (this._providerKeys.has(f.key) && f.value) this._maybeRequestColumns(f.value);
    }
    this._updateSaveEnabled();
  }

  private _renderElements(
    elements: any[], parent: HTMLElement, descriptors: Map<string, Descriptor>,
  ): void {
    for (const item of elements) {
      if (!item || typeof item !== 'object') continue;
      if (item.group && typeof item.group === 'object') {
        const g = item.group;
        // The group header (name + description) sits at the parent indent…
        const groupWrap = document.createElement('div');
        groupWrap.style.cssText = `display:flex;flex-direction:column;gap:4px;margin-bottom:12px;`;
        if (g.group_name) {
          const t = document.createElement('div');
          t.textContent = g.group_name;
          t.style.cssText =
            `color:${COLORS.textSubtle};font-size:11px;font-weight:600;text-transform:uppercase;`;
          groupWrap.appendChild(t);
        }
        if (g.group_description) {
          const dd = document.createElement('div');
          dd.textContent = g.group_description;
          dd.style.cssText = `color:${COLORS.textMuted};font-size:11px;`;
          groupWrap.appendChild(dd);
        }
        // …only the fields are indented under the left bar.
        const inner = document.createElement('div');
        inner.style.cssText =
          `display:flex;flex-direction:column;gap:6px;margin-top:4px;` +
          `border-left:2px solid ${COLORS.bgSurface1};padding-left:10px;`;
        if (Array.isArray(g.elements)) this._renderElements(g.elements, inner, descriptors);
        groupWrap.appendChild(inner);
        parent.appendChild(groupWrap);
        continue;
      }
      const key = Object.keys(item)[0];
      if (key) this._addField(key, item[key], parent, descriptors.get(key));
    }
  }

  private _addField(
    key: string, spec: any, parent: HTMLElement, desc?: Descriptor,
  ): void {
    const norm = this._normalize(spec);
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;`;
    const lbl = this._label(norm.label || key, norm.required);
    if (norm.description) lbl.title = norm.description;
    const host = document.createElement('div');
    host.style.cssText = `display:flex;align-items:center;gap:6px;flex:1;`;
    row.append(lbl, host);
    parent.appendChild(row);

    const field: Field = {
      key, required: norm.required, role: desc?.role ?? 'plain',
      default: norm.default, value: norm.default != null ? String(norm.default) : '',
      host, section: desc?.section, exts: desc?.exts,
      sourceTypeKey: desc?.sourceTypeKey, literalSourceType: desc?.literalSourceType,
      providerKey: desc?.providerKey,
    };
    this._fields.push(field);
    this._fieldByKey.set(key, field);
  }


  //
  // Internal — per-field control rendering
  //
  private _renderControl(field: Field): void {
    field.host.innerHTML = '';
    switch (field.role) {
      case 'source_type':
        this._renderSourceType(field);
        break;
      case 'pathfile':
        this._renderPath(field, field.exts ?? DATA_EXTS);
        break;
      case 'value': {
        const eff = this._effSourceType(field);
        if (eff === 'path') this._renderPath(field, field.exts ?? DATA_EXTS);
        else if (eff === 'column') this._renderColumn(field);
        else this._renderText(field);
        break;
      }
      case 'column':
        this._renderColumn(field);
        break;
      default:
        this._renderText(field);
    }
  }

  private _renderSourceType(field: Field): void {
    const select = document.createElement('select');
    select.style.cssText = selectStyle() + 'min-width:120px;';
    const opts = SOURCE_TYPE_OPTIONS[field.section ?? 'data'] ?? [];
    if (!field.value) {
      const ph = document.createElement('option');
      ph.value = ''; ph.textContent = '— select —';
      select.appendChild(ph);
    }
    for (const opt of opts) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      select.appendChild(o);
    }
    select.value = field.value;
    select.addEventListener('change', () => {
      field.value = select.value;
      // re-render the paired value field(s) — their widget depends on this.
      for (const vf of this._fields) {
        if (vf.role === 'value' && vf.sourceTypeKey === field.key) this._renderControl(vf);
      }
      this._updateSaveEnabled();
    });
    field.host.appendChild(select);
  }

  private _renderText(field: Field): void {
    const input = document.createElement('input');
    input.style.cssText = inputStyle('300px');
    input.value = field.value;
    input.addEventListener('input', () => {
      field.value = input.value;
      this._updateSaveEnabled();
    });
    field.host.appendChild(input);
  }

  private _renderPath(field: Field, exts: string[]): void {
    const input = document.createElement('input');
    input.style.cssText = inputStyle('300px');
    input.value = field.value;
    input.addEventListener('input', () => {
      field.value = input.value;
      this._updateSaveEnabled();
      if (this._providerKeys.has(field.key)) this._scheduleProvide(field);
    });
    const browse = document.createElement('button');
    browse.textContent = 'Browse';
    browse.style.cssText = btnStyle(false);
    browse.addEventListener('click', () =>
      this.browseRequested.emit({ key: field.key, exts, current: field.value || '.' }));
    field.host.append(input, browse);
  }

  private _renderColumn(field: Field): void {
    const providerVal = this._providerValue(field);
    const cols = providerVal ? this._columnsByPath.get(providerVal) : undefined;
    if (cols && cols.length) {
      const select = document.createElement('select');
      select.style.cssText = selectStyle() + 'min-width:200px;';
      const current = field.value;
      if (!field.required || !current) {
        const ph = document.createElement('option');
        ph.value = ''; ph.textContent = '— select —';
        select.appendChild(ph);
      }
      const opts = [...cols];
      if (current && !opts.includes(current)) opts.unshift(current);
      for (const c of opts) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        select.appendChild(o);
      }
      select.value = current;
      select.addEventListener('change', () => {
        field.value = select.value;
        this._updateSaveEnabled();
      });
      field.host.appendChild(select);
    } else {
      // No columns yet — a plain text input until the source file loads.
      const input = document.createElement('input');
      input.style.cssText = inputStyle('300px');
      input.value = field.value;
      input.placeholder = 'type a column, or pick the file above';
      input.addEventListener('input', () => {
        field.value = input.value;
        this._updateSaveEnabled();
      });
      field.host.appendChild(input);
    }
  }


  //
  // Internal — dynamic helpers
  //
  private _effSourceType(field: Field): string | undefined {
    if (field.sourceTypeKey) {
      const st = this._fieldByKey.get(field.sourceTypeKey);
      return st ? st.value || undefined : field.literalSourceType;
    }
    return field.literalSourceType;
  }

  private _isColumnConsumer(field: Field): boolean {
    return field.role === 'column'
      || (field.role === 'value' && this._effSourceType(field) === 'column');
  }

  private _providerValue(field: Field): string {
    if (!field.providerKey) return '';
    return this._fieldByKey.get(field.providerKey)?.value.trim() ?? '';
  }

  private _refreshColumnDependents(providerKey: string): void {
    for (const f of this._fields) {
      if (this._isColumnConsumer(f) && f.providerKey === providerKey) this._renderControl(f);
    }
  }

  private _scheduleProvide(field: Field): void {
    const prev = this._debounce.get(field.key);
    if (prev) clearTimeout(prev);
    this._debounce.set(field.key, setTimeout(() => {
      this._refreshColumnDependents(field.key);
      this._maybeRequestColumns(field.value);
    }, 500));
  }

  private _updateSaveEnabled(): void {
    if (this._locked) return;
    const nameOk = !!this._nameInput.value.trim();
    const requiredOk = this._fields.every(f => !f.required || !!(f.value || '').trim());
    this._saveBtn.disabled = !(nameOk && requiredOk);
    this._saveBtn.style.opacity = this._saveBtn.disabled ? '0.5' : '1';
    this._saveBtn.style.cursor = this._saveBtn.disabled ? 'not-allowed' : 'pointer';
  }


  //
  // Internal — placeholder analysis (location → descriptor)
  //
  private _analyze(scope: string): Map<string, Descriptor> {
    const map = new Map<string, Descriptor>();
    const tpl = this._template!;
    const dataProvider = this._findDataProvider();
    for (const section of SCOPE_SECTIONS[scope] ?? []) {
      const cfg = tpl[section]?.configuration;
      if (cfg && typeof cfg === 'object') this._walk(cfg, [], map, dataProvider);
    }
    return map;
  }

  private _findDataProvider(): string | undefined {
    const data = this._template?.['project']?.configuration?.data;
    if (!data || typeof data !== 'object') return undefined;
    return this._ph(data.value) || this._ph(data.path) || undefined;
  }

  private _walk(
    node: any, path: string[], map: Map<string, Descriptor>, dataProvider?: string,
  ): void {
    if (Array.isArray(node)) {
      for (const item of node) this._walk(item, path, map, dataProvider);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const tail = path[path.length - 1];
    for (const [k, v] of Object.entries(node)) {
      const key = typeof v === 'string' ? this._ph(v) : '';
      if (key) {
        map.set(key, this._classify(tail, k, node, dataProvider));
      } else {
        this._walk(v, [...path, k], map, dataProvider);
      }
    }
  }

  private _classify(
    tail: string, key: string, parent: any, dataProvider?: string,
  ): Descriptor {
    const stMeta = {
      sourceTypeKey: this._ph(parent.source_type) || undefined,
      literalSourceType: (typeof parent.source_type === 'string' && !this._ph(parent.source_type))
        ? parent.source_type : undefined,
    };
    if (tail === 'data') {
      if (key === 'source_type') return { role: 'source_type', section: 'data' };
      if (key === 'path') return { role: 'pathfile', exts: DATA_EXTS };
      if (key === 'value') return { role: 'value', section: 'data', exts: DATA_EXTS, ...stMeta };
      if (key === 'index_column') return { role: 'column', providerKey: dataProvider };
    } else if (tail === 'audio') {
      if (key === 'source_type') return { role: 'source_type', section: 'audio' };
      if (key === 'column') return { role: 'column', providerKey: dataProvider };
      if (key === 'value') {
        return { role: 'value', section: 'audio', exts: AUDIO_EXTS, providerKey: dataProvider, ...stMeta };
      }
    } else if (tail === 'output') {
      if (key === 'path') return { role: 'pathfile', exts: OUTPUT_EXTS };
    } else if (tail === 'items') {
      if (key === 'path') return { role: 'pathfile', exts: DATA_EXTS };
      if (key === 'value') return { role: 'column', providerKey: this._ph(parent.path) || undefined };
    }
    if (key === 'source_type') return { role: 'source_type', section: 'data' };
    return { role: 'plain' };
  }

  private _ph(v: any): string {
    if (typeof v !== 'string') return '';
    const m = v.match(PLACEHOLDER_RE);
    return m ? m[1] : '';
  }


  //
  // Internal — helpers
  //
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

  private _sectionHeader(name: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;flex-direction:column;gap:3px;margin-top:8px;`;
    const title = document.createElement('div');
    title.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    title.style.cssText = `color:${COLORS.textPrimary};font-size:14px;font-weight:700;padding-bottom:4px;`;
    const hr = document.createElement('div');
    hr.style.cssText = `height:1px;background:${COLORS.bgSurface1};`;
    wrap.append(title, hr);
    return wrap;
  }

  private _label(text: string, required = false): HTMLSpanElement {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText =
      `color:${required ? COLORS.teal : COLORS.textSubtle};font-size:12px;min-width:140px;`;
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
