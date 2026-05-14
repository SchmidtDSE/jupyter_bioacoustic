import { COLORS } from '../../styles';

const S = {
  section: `padding:6px 10px;`,
  sectionTitle:
    `font-size:11px;font-weight:700;letter-spacing:0.6px;color:${COLORS.textMuted};` +
    `text-transform:uppercase;margin-bottom:2px;`,
  row: `display:flex;align-items:baseline;gap:6px;padding:1px 0;font-size:11px;line-height:1.5;`,
  key: `color:${COLORS.textSubtle};min-width:90px;flex-shrink:0;`,
  val: `color:${COLORS.textPrimary};word-break:break-word;`,
  muted: `color:${COLORS.textMuted};font-style:italic;`,
  hr: `border:none;border-top:1px solid ${COLORS.bgSurface0};margin:0;`,
  tag: `display:inline-block;background:${COLORS.bgSurface1};border-radius:3px;` +
    `padding:0 5px;font-size:10px;color:${COLORS.blue};margin-right:3px;`,
  dynTag: `display:inline-block;background:${COLORS.bgSurface0};border-radius:3px;` +
    `padding:0 5px;font-size:10px;color:${COLORS.mauve};margin-right:3px;`,
  indent: `margin-left:16px;padding-left:8px;border-left:2px solid ${COLORS.bgSurface1};`,
  secretsTag: `display:inline-block;background:${COLORS.bgSurface0};border-radius:3px;` +
    `padding:0 5px;font-size:10px;color:${COLORS.peach};margin-right:3px;`,
};

const USER_INPUT_TYPES = new Set(['select', 'textbox', 'checkbox', 'number']);

export class ConfigSummary {
  readonly element: HTMLDetailsElement;
  private _body: HTMLDivElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.open = true;
    this.element.style.cssText =
      `border-top:2px solid ${COLORS.teal};margin-top:4px;`;

    const summary = document.createElement('summary');
    summary.textContent = 'Configuration Summary';
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgCrust};color:${COLORS.teal};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    this._body = document.createElement('div');
    this._body.style.cssText =
      `background:${COLORS.bgCrust};display:flex;flex-direction:column;`;

    this.element.append(summary, this._body);
  }

  update(sections: {
    project: Record<string, any>;
    data: Record<string, any>;
    audio: Record<string, any>;
    output: Record<string, any>;
    app: Record<string, any>;
    form: Record<string, any>;
  }): void {
    this._body.innerHTML = '';
    this._addProjectSection(sections.project);
    this._hr();
    this._addDataSection(sections.data);
    this._hr();
    this._addAudioSection(sections.audio);
    this._hr();
    this._addOutputSection(sections.output);
    this._hr();
    this._addAppSection(sections.app);
    this._hr();
    this._addFormSection(sections.form);
  }

  private _hr(): void {
    const hr = document.createElement('hr');
    hr.style.cssText = S.hr;
    this._body.appendChild(hr);
  }

  private _section(title: string): HTMLDivElement {
    const sec = document.createElement('div');
    sec.style.cssText = S.section;
    const t = document.createElement('div');
    t.style.cssText = S.sectionTitle;
    t.textContent = title;
    sec.appendChild(t);
    this._body.appendChild(sec);
    return sec;
  }

  private _row(parent: HTMLElement, key: string, value: string, muted = false): void {
    const row = document.createElement('div');
    row.style.cssText = S.row;
    const k = document.createElement('span');
    k.style.cssText = S.key;
    k.textContent = key;
    const v = document.createElement('span');
    v.style.cssText = muted ? S.muted : S.val;
    v.textContent = value;
    row.append(k, v);
    parent.appendChild(row);
  }

  private _rowHtml(parent: HTMLElement, key: string, valueHtml: string): void {
    const row = document.createElement('div');
    row.style.cssText = S.row;
    const k = document.createElement('span');
    k.style.cssText = S.key;
    k.textContent = key;
    const v = document.createElement('span');
    v.style.cssText = S.val;
    v.innerHTML = valueHtml;
    row.append(k, v);
    parent.appendChild(row);
  }

  private _secretsSummary(secrets: any): string {
    if (secrets === false) return '<span style="' + S.muted + '">opted out</span>';
    if (Array.isArray(secrets)) {
      return secrets.map((s: any) =>
        `<span style="${S.secretsTag}">${this._esc(s.key)}</span>`
      ).join('');
    }
    if (secrets && typeof secrets === 'object' && 'key' in secrets) {
      return `<span style="${S.secretsTag}">${this._esc(secrets.key)}</span>`;
    }
    return '';
  }

  private _esc(s: any): string {
    const str = String(s ?? '');
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  private _addProjectSection(d: Record<string, any>): void {
    const sec = this._section('Project');
    this._row(sec, 'name', d.project_name || '(unnamed)', !d.project_name);
    const files = [];
    if (d.project_enabled && d.project_path) files.push('project: ' + d.project_path);
    if (d.config_enabled && d.config_path) files.push('config: ' + d.config_path);
    if (d.form_enabled && d.form_path) files.push('form: ' + d.form_path);
    if (files.length > 0) {
      for (const f of files) {
        const [label, path] = f.split(': ', 2);
        this._row(sec, label, path);
      }
    } else {
      this._row(sec, 'files', 'none configured', true);
    }
    if (d.output_path) this._row(sec, 'output', d.output_path);
  }

  private _addDataSection(d: Record<string, any>): void {
    const sec = this._section('Data');
    const sourceKey = ['path', 'url', 'sql', 'api'].find(k => d[k]) || '';
    if (sourceKey) {
      this._row(sec, sourceKey, String(d[sourceKey]));
    } else {
      this._row(sec, 'source', 'not set', true);
    }
    if (d.columns?.length) this._row(sec, 'columns', d.columns.join(', '));
    if (d.start_time && d.start_time !== 'start_time') this._row(sec, 'start_time', d.start_time);
    if (d.end_time && d.end_time !== 'end_time') this._row(sec, 'end_time', d.end_time);
    if (d.duration !== undefined) this._row(sec, 'duration', String(d.duration));
    if (d.secrets !== undefined) this._rowHtml(sec, 'secrets', this._secretsSummary(d.secrets));
  }

  private _addAudioSection(d: Record<string, any>): void {
    const sec = this._section('Audio');
    const sourceKey = ['path', 'url', 'column'].find(k => d[k]) || '';
    if (sourceKey) {
      this._row(sec, sourceKey, String(d[sourceKey]));
    } else {
      this._row(sec, 'source', 'not set', true);
    }
    if (d.prefix) this._row(sec, 'prefix', d.prefix);
    if (d.suffix) this._row(sec, 'suffix', d.suffix);
    if (d.fallback) this._row(sec, 'fallback', d.fallback);
    if (d.secrets !== undefined) this._rowHtml(sec, 'secrets', this._secretsSummary(d.secrets));
  }

  private _addOutputSection(d: Record<string, any>): void {
    const sec = this._section('Output');
    if (d.path) this._row(sec, 'path', d.path);
    else this._row(sec, 'path', 'not set', true);
    if (d.uri) this._row(sec, 'sync uri', d.uri);
    if (d.sync_button) this._row(sec, 'sync button', typeof d.sync_button === 'string' ? d.sync_button : 'yes');
    if (d.recursive) this._row(sec, 'recursive', 'yes');
    if (d.secrets !== undefined) this._rowHtml(sec, 'secrets', this._secretsSummary(d.secrets));
  }

  private _addAppSection(d: Record<string, any>): void {
    const sec = this._section('Application');
    if (d.ident_column) this._row(sec, 'ident', d.ident_column);
    if (d.display_columns?.length) this._row(sec, 'display', d.display_columns.join(', '));
    if (d.project_save_btn) this._row(sec, 'save button', 'yes');
    if (d.duplicate_entries) this._row(sec, 'duplicates', 'allowed');
    if (d.default_buffer !== undefined && d.default_buffer !== 3) this._row(sec, 'buffer', String(d.default_buffer));
    this._row(sec, 'capture', d.capture === false ? 'off' : 'on');
    if (d.capture_dir) this._row(sec, 'capture_dir', d.capture_dir);
    if (d.secrets !== undefined) this._rowHtml(sec, 'secrets', this._secretsSummary(d.secrets));
  }

  private _addFormSection(d: Record<string, any>): void {
    const isEmpty = Object.keys(d).length === 0;
    if (isEmpty) {
      const sec = this._section('Form Config');
      this._row(sec, '', 'no form configured', true);
      return;
    }

    const dynFormsMap = new Map<string, any[]>();
    if (d.dynamic_forms) {
      const dfs = d.dynamic_forms;
      if (Array.isArray(dfs)) {
        for (const item of dfs) {
          if (item && typeof item === 'object') {
            for (const [name, elems] of Object.entries(item)) {
              dynFormsMap.set(name, Array.isArray(elems) ? elems : [elems]);
            }
          }
        }
      } else if (typeof dfs === 'object') {
        for (const [name, elems] of Object.entries(dfs)) {
          dynFormsMap.set(name, Array.isArray(elems) ? elems : [elems]);
        }
      }
    }

    interface FormItem {
      type: string;
      cfg: any;
      zone: 'top' | 'form' | 'buttons';
    }
    const items: FormItem[] = [];

    if (d.title) items.push({ type: 'title', cfg: d.title, zone: 'top' });

    const ordered: Array<{ type: string; cfg: any }> = [];
    const elementOrder: string[] = Array.isArray(d._element_order) ? d._element_order : [];

    const topLevelMap: Record<string, any> = {};
    if (d.annotation) topLevelMap.annotation = d.annotation;
    if (d.pass_value) topLevelMap.pass_value = d.pass_value;
    if (d.fixed_value) topLevelMap.fixed_value = d.fixed_value;

    const formQueue = Array.isArray(d.form) ? [...d.form] : [];

    if (elementOrder.length > 0) {
      for (const etype of elementOrder) {
        if (etype === 'title' || etype === 'submission_buttons') continue;
        if (etype in topLevelMap) {
          ordered.push({ type: etype, cfg: topLevelMap[etype] });
          delete topLevelMap[etype];
        } else if (formQueue.length > 0) {
          const item = formQueue.shift()!;
          if (item && typeof item === 'object') {
            const [type] = Object.keys(item);
            ordered.push({ type, cfg: item[type] });
          }
        }
      }
    } else {
      for (const key of Object.keys(topLevelMap)) {
        ordered.push({ type: key, cfg: topLevelMap[key] });
      }
      for (const item of formQueue) {
        if (!item || typeof item !== 'object') continue;
        const [type] = Object.keys(item);
        ordered.push({ type, cfg: item[type] });
      }
    }

    let inFormZone = false;
    for (const entry of ordered) {
      if (!inFormZone && USER_INPUT_TYPES.has(entry.type)) {
        inFormZone = true;
      }
      if (inFormZone) {
        items.push({ type: entry.type, cfg: entry.cfg, zone: 'form' });
      } else {
        items.push({ type: entry.type, cfg: entry.cfg, zone: 'top' });
      }
    }

    if (d.submission_buttons) {
      items.push({ type: 'submission_buttons', cfg: d.submission_buttons, zone: 'buttons' });
    }

    const sec = this._section('Form Config');

    const topItems = items.filter(i => i.zone === 'top');
    const formItems = items.filter(i => i.zone === 'form');
    const buttonItems = items.filter(i => i.zone === 'buttons');

    for (const item of topItems) {
      this._renderFormItem(sec, item.type, item.cfg, dynFormsMap);
    }

    if (formItems.length > 0) {
      const formDiv = document.createElement('div');
      formDiv.style.cssText = S.sectionTitle + `margin-top:4px;`;
      formDiv.textContent = 'FORM';
      sec.appendChild(formDiv);

      const formWrap = document.createElement('div');
      formWrap.style.cssText = S.indent;
      sec.appendChild(formWrap);
      for (const item of formItems) {
        this._renderFormItem(formWrap, item.type, item.cfg, dynFormsMap);
      }
    }

    if (buttonItems.length > 0) {
      const btnDiv = document.createElement('div');
      btnDiv.style.cssText = S.sectionTitle + `margin-top:4px;`;
      btnDiv.textContent = 'SUBMIT BUTTONS';
      sec.appendChild(btnDiv);
      for (const item of buttonItems) {
        this._renderFormItem(sec, item.type, item.cfg, dynFormsMap);
      }
    }

    for (const [name, elems] of dynFormsMap) {
      this._addNestedDynForm(sec, name, elems);
    }
  }

  private _renderFormItem(
    parent: HTMLElement,
    type: string,
    cfg: any,
    dynFormsMap: Map<string, any[]>,
  ): void {
    if (type === 'title') {
      const titleVal = typeof cfg === 'string' ? cfg : cfg?.value || '';
      const tracker = (typeof cfg === 'object' && cfg?.progress_tracker) ? ' + tracker' : '';
      this._row(parent, 'title', titleVal + tracker);
      return;
    }

    if (type === 'submission_buttons') {
      const sb = cfg;
      const parts = [];
      if (sb.previous) parts.push('previous');
      if (sb.next) parts.push(sb.next?.label || 'next');
      if (sb.submit) parts.push(sb.submit?.label || 'submit');
      this._row(parent, 'buttons', parts.join(', ') || 'default');
      return;
    }

    if (type === 'annotation') {
      const a = cfg;
      const tools = Array.isArray(a.tools) ? a.tools.join(', ') : '';
      this._row(parent, 'annotation', tools || 'configured');
      const refs = this._getReferencedForms('annotation', cfg);
      for (const formName of refs) {
        const dynElems = dynFormsMap.get(formName);
        if (dynElems) {
          this._addNestedDynForm(parent, formName, dynElems);
          dynFormsMap.delete(formName);
        }
      }
      return;
    }

    if (type === 'pass_value') {
      const pv = cfg;
      this._row(parent, 'pass_value', `${pv.source_column || '?'} → ${pv.column || '?'}`);
      return;
    }

    if (type === 'fixed_value') {
      this._row(parent, 'fixed_value', `${cfg.column || '?'} = ${cfg.value || '?'}`);
      return;
    }

    if (type === 'break' || type === 'line') return;

    if (type === 'text') {
      const val = typeof cfg === 'object' ? (cfg.value || '') : String(cfg ?? '');
      if (val) this._rowHtml(parent, '', `<span style="${S.tag}">text</span>${this._esc(val)}`);
      return;
    }

    const line = this._summarizeFormElement(type, cfg);
    this._rowHtml(parent, '', `<span style="${S.tag}">${this._esc(type)}</span>${line}`);

    const refs = this._getReferencedForms(type, cfg);
    for (const formName of refs) {
      const dynElems = dynFormsMap.get(formName);
      if (dynElems) {
        this._addNestedDynForm(parent, formName, dynElems);
        dynFormsMap.delete(formName);
      }
    }
  }

  private _addNestedDynForm(parent: HTMLElement, name: string, elems: any[]): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = S.indent;

    const header = document.createElement('div');
    header.style.cssText = S.row;
    header.innerHTML = `<span style="${S.dynTag}">dynamic form: ${this._esc(name)}</span>`;
    wrap.appendChild(header);

    for (const el of elems) {
      if (!el || typeof el !== 'object') continue;
      const [type] = Object.keys(el);
      const cfg = el[type];
      const line = this._summarizeFormElement(type, cfg);
      const row = document.createElement('div');
      row.style.cssText = S.row;
      row.innerHTML = `<span style="${S.tag}">${this._esc(type)}</span>${line}`;
      wrap.appendChild(row);
    }

    parent.appendChild(wrap);
  }

  private _getReferencedForms(type: string, cfg: any): string[] {
    const forms: string[] = [];
    if (type === 'select' && cfg && Array.isArray(cfg.items)) {
      for (const it of cfg.items) {
        if (it && typeof it === 'object' && it.form) forms.push(it.form);
      }
    }
    if (type === 'checkbox' && cfg) {
      if (cfg.checked_form) forms.push(cfg.checked_form);
      if (cfg.unchecked_form) forms.push(cfg.unchecked_form);
    }
    if (type === 'annotation' && cfg?.form) forms.push(cfg.form);
    return forms;
  }

  private _summarizeFormElement(type: string, cfg: any): string {
    if (!cfg || typeof cfg !== 'object') {
      if (cfg === true) return '';
      return this._esc(String(cfg ?? ''));
    }
    switch (type) {
      case 'select': {
        const label = cfg.label || cfg.column || '';
        const itemCount = Array.isArray(cfg.items) ? cfg.items.length :
          (cfg.items?.path ? 'file' : '?');
        const req = cfg.required ? ' *' : '';
        const forms = this._getReferencedForms('select', cfg);
        const formRef = forms.length ? ` → ${forms.join(', ')}` : '';
        return `${this._esc(label)} (${itemCount} items${req})${formRef}`;
      }
      case 'textbox':
        return this._esc(cfg.label || cfg.column || '') + (cfg.multiline ? ' (multiline)' : '');
      case 'checkbox': {
        const parts = [this._esc(cfg.label || cfg.column || '')];
        if (cfg.checked_form) parts.push(`✓→${cfg.checked_form}`);
        if (cfg.unchecked_form) parts.push(`✗→${cfg.unchecked_form}`);
        return parts.join(' ');
      }
      case 'number': {
        const label = cfg.label || cfg.column || '';
        const range = (cfg.min !== undefined || cfg.max !== undefined)
          ? ` [${cfg.min ?? ''}..${cfg.max ?? ''}]` : '';
        return this._esc(label) + range;
      }
      case 'break':
      case 'line':
        return '';
      case 'text':
        return this._esc(cfg.value || '');
      default:
        return this._esc(cfg.label || cfg.column || cfg.value || '');
    }
  }
}
