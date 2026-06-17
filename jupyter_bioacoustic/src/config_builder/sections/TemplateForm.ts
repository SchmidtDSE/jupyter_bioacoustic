/**
 * TemplateForm
 *
 * "Create from Template" UI for the config-builder Setup section: a selectable
 * template list plus the per-template input form.
 *
 * The widget for each builder element is inferred from where its
 * ``__placeholder__`` sits in the template's ``configuration`` (a scoped
 * positional inference): a source path → text + Browse; a data/audio index or
 * select column → a dropdown populated from the chosen file; everything else →
 * a text input. This reuses the builder's read_columns + FileBrowser via the
 * panel (see ConfigPanel) rather than duplicating the section widgets.
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

type WidgetKind = 'text' | 'path' | 'column' | 'source_type';

interface Descriptor {
  widget: WidgetKind;
  exts?: string[];
  providerKey?: string;   // column: the field whose value is the source file
  section?: string;       // source_type: which section's options
}

interface Field {
  key: string;
  required: boolean;
  widget: WidgetKind;
  el: HTMLInputElement | HTMLSelectElement;
  default: any;
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
  private _formEl!: HTMLDivElement;
  private _saveBtn!: HTMLButtonElement;
  private _fields: Field[] = [];
  private _fieldByKey = new Map<string, Field>();
  private _columnsByPath = new Map<string, string[]>();

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

  /** Set a field's value (e.g. after a Browse pick) and refresh dependents. */
  setFieldValue(key: string, value: string): void {
    const f = this._fieldByKey.get(key);
    if (!f) return;
    f.el.value = value;
    this._maybeRequestColumns(value);
    this._updateSaveEnabled();
  }

  /** Populate column dropdowns whose source file is ``path``. */
  setColumns(path: string, cols: string[]): void {
    this._columnsByPath.set(path, cols);
    for (const f of this._fields) {
      if (f.widget !== 'column' || !f.providerKey) continue;
      const provVal = this._fieldByKey.get(f.providerKey)?.el.value.trim();
      if (provVal === path) this._populateColumn(f, cols);
    }
  }

  reset(): void {
    this._selectedName = '';
    this._template = null;
    this._fields = [];
    this._fieldByKey.clear();
    this._columnsByPath.clear();
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
      const v = f.el.value.trim();
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
    if (path && COLUMN_FILE_RE.test(path)) this.columnsRequested.emit(path);
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
    this._fieldByKey.clear();
    const tpl = this._template!;
    const scope = this._scopeSelect.value;
    const descriptors = this._analyze(scope);

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
        this._renderElements(sec.builder_elements, this._formEl, descriptors);
      }
    }

    // Seed column dropdowns from any path provider that already has a value
    // (e.g. a defaulted species-list file populates its column dropdown).
    for (const f of this._fields) {
      if (f.widget === 'path') {
        const v = f.el.value.trim();
        if (v) this._maybeRequestColumns(v);
      }
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
        if (Array.isArray(g.elements)) this._renderElements(g.elements, box, descriptors);
        parent.appendChild(box);
        continue;
      }
      const key = Object.keys(item)[0];
      if (key) this._renderField(key, item[key], parent, descriptors.get(key));
    }
  }

  private _renderField(
    key: string, spec: any, parent: HTMLElement, desc?: Descriptor,
  ): void {
    const norm = this._normalize(spec);
    const widget = desc?.widget ?? 'text';
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;`;
    const lbl = this._label((norm.label || key) + (norm.required ? ' *' : ''));
    if (norm.description) lbl.title = norm.description;
    row.appendChild(lbl);

    let el: HTMLInputElement | HTMLSelectElement;
    if (widget === 'column' || widget === 'source_type') {
      const select = document.createElement('select');
      select.style.cssText = selectStyle() + 'min-width:200px;';
      if (widget === 'source_type') {
        for (const opt of SOURCE_TYPE_OPTIONS[desc?.section ?? 'data'] ?? []) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          select.appendChild(o);
        }
        if (norm.default != null) select.value = String(norm.default);
      } else {
        this._fillColumnOptions(select, [], norm.default, norm.required);
      }
      select.addEventListener('change', () => this._updateSaveEnabled());
      row.appendChild(select);
      el = select;
    } else {
      const input = document.createElement('input');
      input.style.cssText = inputStyle('300px');
      if (norm.default != null) input.value = String(norm.default);
      if (norm.description) input.placeholder = norm.description;
      input.addEventListener('input', () => this._updateSaveEnabled());
      if (widget === 'path') {
        const exts = desc?.exts ?? DATA_EXTS;
        input.addEventListener('change', () => this._maybeRequestColumns(input.value.trim()));
        const browse = document.createElement('button');
        browse.textContent = 'Browse';
        browse.style.cssText = btnStyle(false);
        browse.addEventListener('click', () =>
          this.browseRequested.emit({ key, exts, current: input.value || '.' }));
        row.append(input, browse);
      } else {
        row.appendChild(input);
      }
      el = input;
    }

    parent.appendChild(row);
    const field: Field = {
      key, required: norm.required, widget, el,
      default: norm.default, providerKey: desc?.providerKey,
    };
    this._fields.push(field);
    this._fieldByKey.set(key, field);
  }

  private _fillColumnOptions(
    select: HTMLSelectElement, cols: string[], def: any, required: boolean,
  ): void {
    const current = select.value || (def != null ? String(def) : '');
    select.innerHTML = '';
    if (!required || !current) {
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
  }

  private _populateColumn(f: Field, cols: string[]): void {
    this._fillColumnOptions(f.el as HTMLSelectElement, cols, f.default, f.required);
    this._updateSaveEnabled();
  }

  private _updateSaveEnabled(): void {
    const nameOk = !!this._nameInput.value.trim();
    const requiredOk = this._fields.every(f => !f.required || !!f.el.value.trim());
    this._saveBtn.disabled = !(nameOk && requiredOk);
    this._saveBtn.style.opacity = this._saveBtn.disabled ? '0.5' : '1';
    this._saveBtn.style.cursor = this._saveBtn.disabled ? 'not-allowed' : 'pointer';
  }


  //
  // Internal — placeholder analysis (location → widget)
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
    if (tail === 'data') {
      if (key === 'path') return { widget: 'path', exts: DATA_EXTS };
      if (key === 'value') {
        const st = parent.source_type;
        return (st === undefined || st === 'path' || this._ph(st))
          ? { widget: 'path', exts: DATA_EXTS } : { widget: 'text' };
      }
      if (key === 'index_column') return { widget: 'column', providerKey: dataProvider };
      if (key === 'source_type') return { widget: 'source_type', section: 'data' };
    } else if (tail === 'audio') {
      if (key === 'source_type') return { widget: 'source_type', section: 'audio' };
      if (key === 'column') return { widget: 'column', providerKey: dataProvider };
      if (key === 'value') {
        const st = parent.source_type;
        if (st === 'column') return { widget: 'column', providerKey: dataProvider };
        if (st === 'path') return { widget: 'path', exts: AUDIO_EXTS };
        return { widget: 'text' };
      }
    } else if (tail === 'output') {
      if (key === 'path') return { widget: 'path', exts: OUTPUT_EXTS };
    } else if (tail === 'items') {
      if (key === 'path') return { widget: 'path', exts: DATA_EXTS };
      if (key === 'value') return { widget: 'column', providerKey: this._ph(parent.path) };
    }
    if (key === 'source_type') return { widget: 'source_type', section: 'data' };
    return { widget: 'text' };
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
