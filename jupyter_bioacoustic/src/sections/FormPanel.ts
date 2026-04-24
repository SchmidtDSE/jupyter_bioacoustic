/**
 * FormPanel — the bottom panel of the BioacousticWidget.
 *
 * Owns the dynamic form built from `form_config`: all inputs, submission
 * buttons, progress tracker, annotation tool UI, reviewed-view (for
 * already-submitted rows), and output file writing.
 *
 * Communicates with the rest of the widget via Lumino signals.
 */
import { Signal } from '@lumino/signaling';
import { Detection, AnnotConfig, MultiboxEntry } from '../types';
import { KernelBridge } from '../kernel';
import { escPy } from '../util';
import {
  countOutputProgress,
  readOutputRows,
  writeOutputRow,
  deleteOutputRow,
  loadSelectItemsCsv,
  loadSelectItemsParquet,
  loadSelectItemsJsonl,
  loadSelectItemsYaml,
  loadSelectItemsText,
  INVALIDATE_OUTPUT_CACHE,
} from '../python';
import {
  COLORS,
  DISPLAY_CHIP_COLORS,
  inputStyle,
  selectStyle,
  labelStyle,
  btnStyle,
  formLabelStyle,
  sectionTitleStyle,
  mutedTextStyle,
  formRowStyle,
  dividerStyle,
  fullWidthDividerStyle,
  cssSize,
} from '../styles';

export class FormPanel {
  /** The root element — append to the widget. */
  readonly element: HTMLDivElement;

  // ─── Signals ───────────────────────────────────────────────

  /** Emitted after a successful submit. Values have been written to the output file. */
  readonly submitted = new Signal<this, Record<string, any>>(this);

  /** Reviewed-view Prev button clicked. */
  readonly prevRequested = new Signal<this, void>(this);

  /** Reviewed-view Next button clicked (also fires after submit via _onSkip equivalent). */
  readonly nextRequested = new Signal<this, void>(this);

  /** A review was deleted — orchestrator should re-render the table. */
  readonly reviewDeleted = new Signal<this, Detection>(this);

  /** An annotation field was changed from inside the form (not from the canvas).
   *  Orchestrator forwards this to the Player to re-render the spectrogram. */
  readonly annotationChanged = new Signal<this, void>(this);

  /** The active annotation tool changed (via the dropdown). */
  readonly activeToolChanged = new Signal<this, string>(this);

  /** A status message to show in the widget header. */
  readonly statusChanged = new Signal<this, { message: string; error: boolean }>(this);

  // ─── DOM refs ──────────────────────────────────────────────

  private _dynFormEl!: HTMLDivElement;

  // ─── Form state ────────────────────────────────────────────

  private _formConfig: any = null;
  private _formValues: Record<string, any> = {};
  private _submitBtns: HTMLButtonElement[] = [];
  /** Named form sections (top-level config keys referenced by select form: items). */
  private _namedSections: Map<string, HTMLDivElement> = new Map();
  private _requiredInputs: Array<{ col: string; el: HTMLElement }> = [];
  private _inputRefs: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = new Map();
  private _sourceValueFields: Array<{ col: string; sourceCol: string }> = [];
  private _passValueDefs: Array<{ sourceCol: string; col: string }> = [];

  // Progress tracking
  private _sessionCount = 0;
  private _sessionValid = 0;
  private _fileCount = 0;
  private _fileValid = 0;
  private _progressEls: HTMLSpanElement[] = [];

  // Annotation tool
  private _annotConfig: AnnotConfig | null = null;
  private _activeTool = '';
  private _annotInputs: Map<string, HTMLInputElement> = new Map();

  // Multibox state
  private _multiboxEntries: MultiboxEntry[] = [];
  private _activeBoxIndex = -1;
  private _multiboxFormName: string | null = null;
  private _multiboxNextId = 0;
  private _multiboxColorIdx = 0;
  private _multiboxContainer: HTMLDivElement | null = null;

  // Reviewed state (for duplicate_entries=false)
  private _reviewedMap: Map<number, Record<string, any>> = new Map();
  private _showingReviewedView = false;

  // Context provided by the orchestrator
  private _rows: Detection[] = [];
  private _identCol = '';
  private _duplicateEntries = false;
  private _outputPath = '';
  private _selectedIdx = -1;
  private _filteredLength = 0;

  constructor(private _kernel: KernelBridge) {
    // Build the section shell
    this.element = document.createElement('div');
    this.element.style.cssText =
      `flex:0 0 auto;min-height:140px;padding:10px 14px 12px;background:${COLORS.bgMantle};` +
      `border-top:1px solid ${COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;

    this._dynFormEl = document.createElement('div');
    this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
    this.element.append(this._dynFormEl);

    // Enter to submit when form is focused
    this.element.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Don't intercept Enter in textareas or inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA') return;
        if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
        // Check if submit is enabled
        const btn = this._submitBtns.find(b => !b.disabled);
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    });
  }

  // ─── Public API ────────────────────────────────────────────

  /** Set context needed by the form (called once after reading kernel vars). */
  setContext(opts: {
    formConfig: any;
    rows: Detection[];
    identCol: string;
    duplicateEntries: boolean;
    outputPath: string;
  }): void {
    this._formConfig = opts.formConfig;
    this._rows = opts.rows;
    this._identCol = opts.identCol;
    this._duplicateEntries = opts.duplicateEntries;
    this._outputPath = opts.outputPath;
  }

  /** Update selection info (called each time a row is selected). Used for
   *  Prev/Next disabled states in the reviewed view. */
  setSelectionInfo(selectedIdx: number, filteredLength: number): void {
    this._selectedIdx = selectedIdx;
    this._filteredLength = filteredLength;
  }

  /** Build the form from the current form config. */
  async build(): Promise<void> {
    this._dynFormEl.innerHTML = '';
    this._formValues = {};
    this._submitBtns = [];
    this._namedSections.clear();
    this._requiredInputs = [];
    this._inputRefs.clear();
    this._sourceValueFields = [];
    this._passValueDefs = [];
    this._annotConfig = null;
    this._activeTool = '';
    this._annotInputs.clear();
    this._sessionCount = 0;
    this._sessionValid = 0;
    this._progressEls = [];

    const cfg = this._formConfig;
    if (!cfg) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = 'flex';

    // Known top-level keys (not named form sections)
    const RESERVED_KEYS = new Set([
      'title', 'progress_tracker', 'pass_value', 'fixed_value',
      'submission_buttons', '_fixed_kwargs', 'dynamic_forms',
    ]);

    // First pass: build inline elements and submission buttons
    for (const key of Object.keys(cfg)) {
      if (key === 'title') {
        this._appendTitleEntry(cfg.title, this._dynFormEl);
      } else if (key === 'progress_tracker') {
        this._appendProgressTracker(this._dynFormEl);
      } else if (key === 'pass_value') {
        this._registerPassValue(cfg.pass_value);
      } else if (key === 'fixed_value') {
        this._registerFixedValue(cfg.fixed_value);
      } else if (key === 'submission_buttons') {
        await this._buildSubmissionButtons(cfg.submission_buttons);
      } else if (key === '_fixed_kwargs') {
        for (const item of cfg._fixed_kwargs) {
          if (item.fixed_value) this._registerFixedValue(item.fixed_value);
        }
      } else if (key === 'dynamic_forms') {
        // Explicit named form sections container
        const forms = cfg.dynamic_forms;
        if (forms && typeof forms === 'object') {
          for (const formName of Object.keys(forms)) {
            let formElements = forms[formName];
            // Accept both array of elements and a single element dict
            if (!Array.isArray(formElements)) {
              if (formElements && typeof formElements === 'object') {
                // Wrap single element: {select: {...}} → [{select: {...}}]
                formElements = Object.keys(formElements).map(k => ({ [k]: formElements[k] }));
              } else {
                continue;
              }
            }
            const sectionDiv = document.createElement('div');
            sectionDiv.dataset.formSection = formName;
            sectionDiv.style.cssText = formRowStyle(true); // hidden by default
            await this._buildFormSection(formElements, sectionDiv);
            this._dynFormEl.appendChild(sectionDiv);
            this._namedSections.set(formName, sectionDiv);
          }
        }
      } else if (!RESERVED_KEYS.has(key)) {
        // Any other top-level key is a named form section or inline element
        const sectionData = cfg[key];
        if (Array.isArray(sectionData)) {
          // Array of form elements → named section (hidden until a select references it)
          const sectionDiv = document.createElement('div');
          sectionDiv.dataset.formSection = key;
          sectionDiv.style.cssText = formRowStyle(true); // hidden by default
          await this._buildFormSection(sectionData, sectionDiv);
          this._dynFormEl.appendChild(sectionDiv);
          this._namedSections.set(key, sectionDiv);
        } else if (key === 'annotation') {
          await this._buildAnnotationElement(sectionData, this._dynFormEl);
        } else {
          // Single element (e.g. a top-level select, textbox, etc.)
          await this._buildInputElement(key, sectionData, this._dynFormEl);
        }
      }
    }

    // Default submission buttons if none were configured
    if (!cfg.submission_buttons) {
      await this._buildSubmissionButtons({ submit: true });
    }

    this._validateForm();
  }

  /** Called each time a new row is selected. Rebuilds form vs. reviewed view. */
  updateFromRow(row: Detection): void {
    if (this._isRowReviewed(row)) {
      this._showReviewedResult(row);
      return;
    }
    // Rebuild form if it was replaced by a reviewed result view
    if (this._showingReviewedView) {
      this._showingReviewedView = false;
      void this.build().then(() => this._applyRow(row));
    } else {
      this._applyRow(row);
    }
  }

  /** External setter used by the canvas drag (from Player). Does NOT re-emit
   *  annotationChanged to avoid circular updates. */
  setAnnotValue(field: string, val: number | null): void {
    this._setAnnotValueInternal(field, val, /*emit*/ false);
  }

  /** The parsed annotation config (for Player to know if annotation is active). */
  getAnnotConfig(): AnnotConfig | null {
    return this._annotConfig;
  }

  /** The currently active annotation tool (for Player mouse handling). */
  getActiveTool(): string {
    return this._activeTool;
  }

  /** Read a single form value (for Player to read start_time/end_time/etc.). */
  getFormValue(col: string): any {
    return this._formValues[col];
  }

  // ─── Multibox public API (for Player) ───────────────────────

  isMultiboxMode(): boolean {
    return this._activeTool === 'multibox';
  }

  getMultiboxEntries(): MultiboxEntry[] {
    return this._multiboxEntries;
  }

  getActiveBoxIndex(): number {
    return this._activeBoxIndex;
  }

  addMultiboxEntry(startTime: number, endTime: number, minFreq: number, maxFreq: number): void {
    const colors = DISPLAY_CHIP_COLORS;
    const entry: MultiboxEntry = {
      id: this._multiboxNextId++,
      startTime, endTime, minFreq, maxFreq,
      formValues: {},
      color: colors[this._multiboxColorIdx++ % colors.length],
    };
    this._multiboxEntries.push(entry);
    this._activeBoxIndex = this._multiboxEntries.length - 1;
    // Sync annotation inputs
    if (this._annotConfig) {
      if (this._annotConfig.startTime) this._setAnnotValueInternal('startTime', startTime, false);
      if (this._annotConfig.endTime) this._setAnnotValueInternal('endTime', endTime, false);
      if (this._annotConfig.minFreq) this._setAnnotValueInternal('minFreq', minFreq, false);
      if (this._annotConfig.maxFreq) this._setAnnotValueInternal('maxFreq', maxFreq, false);
    }
    void this._rebuildAnnotFormUI();
    this.annotationChanged.emit(void 0);
    this._validateForm();
  }

  setActiveBox(index: number): void {
    if (index >= 0 && index < this._multiboxEntries.length) {
      this._activeBoxIndex = index;
      this._highlightActiveBoxCard();
      // Update annotation inputs to reflect the active box
      const entry = this._multiboxEntries[index];
      if (entry && this._annotConfig) {
        if (this._annotConfig.startTime) this._setAnnotValueInternal('startTime', entry.startTime, false);
        if (this._annotConfig.endTime) this._setAnnotValueInternal('endTime', entry.endTime, false);
        if (this._annotConfig.minFreq) this._setAnnotValueInternal('minFreq', entry.minFreq, false);
        if (this._annotConfig.maxFreq) this._setAnnotValueInternal('maxFreq', entry.maxFreq, false);
      }
      this.annotationChanged.emit(void 0);
    }
  }

  updateMultiboxBounds(index: number, field: 'startTime' | 'endTime' | 'minFreq' | 'maxFreq', value: number): void {
    const entry = this._multiboxEntries[index];
    if (!entry) return;
    entry[field] = value;
    this.annotationChanged.emit(void 0);
  }

  removeMultiboxEntry(index: number): void {
    if (index < 0 || index >= this._multiboxEntries.length) return;
    this._multiboxEntries.splice(index, 1);
    if (this._activeBoxIndex >= this._multiboxEntries.length) {
      this._activeBoxIndex = this._multiboxEntries.length - 1;
    }
    void this._rebuildAnnotFormUI();
    this.annotationChanged.emit(void 0);
    this._validateForm();
  }

  removeActiveMultiboxEntry(): void {
    if (this._activeBoxIndex >= 0) this.removeMultiboxEntry(this._activeBoxIndex);
  }

  // ─── End multibox API ──────────────────────────────────────

  /** Read the full reviewed map (for ClipTable row styling). */
  getReviewedMap(): Map<number, Record<string, any>> {
    return this._reviewedMap;
  }

  /** True if a row has been reviewed and duplicate_entries is off. */
  isReviewed(row: Detection): boolean {
    return this._isRowReviewed(row);
  }

  /** Load output-file progress counts (session + total + accuracy).
   *  Called once during init. */
  async loadOutputFileProgress(): Promise<void> {
    if (!this._outputPath) return;
    const ext = this._outputPath.split('.').pop()?.toLowerCase() ?? '';
    const code = countOutputProgress(this._outputPath, ext, '', '');

    try {
      const raw = await this._kernel.exec(code);
      const result = JSON.parse(raw) as { count: number; valid: number };
      this._fileCount = result.count;
      this._fileValid = result.valid;
      this._updateProgress();
    } catch {
      // output file may not exist yet — that's fine
    }
  }

  /** Load reviewed state from the output file (called during init when
   *  duplicate_entries=false). Matches output rows to input rows by
   *  pass_value id mapping, or start_time+end_time fallback. */
  async loadReviewedState(): Promise<void> {
    if (this._duplicateEntries || !this._outputPath) return;
    this._reviewedMap.clear();

    const ext = this._outputPath.split('.').pop()?.toLowerCase() ?? '';
    const code = readOutputRows(this._outputPath, ext);

    let outputRows: Record<string, any>[];
    try {
      outputRows = JSON.parse(await this._kernel.exec(code));
    } catch { return; }

    const idMapping = this._passValueDefs.find(pv => pv.sourceCol === 'id');
    const outIdCol = idMapping?.col;

    for (const outRow of outputRows) {
      let inputId: number | null = null;
      if (outIdCol && outRow[outIdCol] !== undefined) {
        inputId = Number(outRow[outIdCol]);
      } else {
        const st = Number(outRow['start_time'] ?? NaN);
        const et = Number(outRow['end_time'] ?? NaN);
        if (!isNaN(st) && !isNaN(et)) {
          const match = this._rows.find(r =>
            Math.abs(r.start_time - st) < 0.01 && Math.abs(r.end_time - et) < 0.01);
          if (match) inputId = match.id;
        }
      }
      if (inputId !== null) {
        this._reviewedMap.set(inputId, outRow);
      }
    }
  }

  // ─── Private: form building ────────────────────────────────

  private async _buildFormSection(elements: any[], container: HTMLElement): Promise<void> {
    for (const item of elements) {
      if (!item || typeof item !== 'object') continue;
      const [type] = Object.keys(item);
      const config = item[type];
      if (type === 'pass_value') {
        this._registerPassValue(config);
      } else if (type === 'title') {
        this._appendTitleEntry(config, container);
      } else if (type === 'progress_tracker') {
        this._appendProgressTracker(container);
      } else if (type === 'annotation') {
        await this._buildAnnotationElement(config, container);
      } else if (type === 'break') {
        container.appendChild(document.createElement('br'));
      } else if (type === 'line') {
        const d = document.createElement('div');
        d.style.cssText = fullWidthDividerStyle();
        container.appendChild(d);
      } else if (type === 'text') {
        const d = document.createElement('div');
        d.style.cssText = mutedTextStyle({ width: '100%' });
        d.textContent = String(config);
        container.appendChild(d);
      } else {
        await this._buildInputElement(type, config, container);
      }
    }
  }

  private async _buildInputElement(
    type: string,
    rawConfig: any,
    container: HTMLElement
  ): Promise<void> {
    const cfg = (rawConfig === true || rawConfig === null || rawConfig === undefined) ? {} : rawConfig;

    let labelText: string;
    let col: string;
    let required: boolean;

    labelText = cfg.label ?? type;
    col = cfg.column ?? labelText;
    required = cfg.required ?? false;

    const lbl = document.createElement('label');
    lbl.style.cssText = formLabelStyle();
    lbl.textContent = labelText;

    let inputEl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (type === 'textbox') {
      if (cfg.multiline) {
        const ta = document.createElement('textarea');
        ta.rows = 1;
        ta.style.cssText =
          inputStyle(cfg.width ? cssSize(cfg.width) : '220px') +
          `font-size:13px;resize:vertical;vertical-align:middle;height:28px;`;
        ta.addEventListener('input', () => { this._formValues[col] = ta.value; this._validateForm(); });
        inputEl = ta;
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.style.cssText =
          inputStyle(cfg.width ? cssSize(cfg.width) : '220px') + `font-size:13px;`;
        inp.addEventListener('input', () => { this._formValues[col] = inp.value; this._validateForm(); });
        inputEl = inp;
      }
      this._formValues[col] = cfg.default ?? '';

    } else if (type === 'select') {
      const sel = document.createElement('select');
      sel.style.cssText = selectStyle() + `font-size:13px;max-width:260px;`;
      if (cfg.width) sel.style.width = cssSize(cfg.width);
      const emptyOpt = document.createElement('option');
      emptyOpt.value = ''; emptyOpt.textContent = '— select —';
      sel.appendChild(emptyOpt);

      // Parse items config options
      const itemsCfg = cfg.items;
      const hasFilterBox = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) && itemsCfg.filter_box;
      const hasCustomValue = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) && itemsCfg.custom_value;
      const notAvailCfg = itemsCfg && typeof itemsCfg === 'object' && !Array.isArray(itemsCfg) ? itemsCfg.not_available : undefined;

      const items = await this._loadSelectItems(cfg.items);

      // Prepend not_available option if configured
      if (notAvailCfg) {
        let naVal: string, naLabel: string;
        if (notAvailCfg === true) {
          naVal = naLabel = 'not-available';
        } else if (typeof notAvailCfg === 'string') {
          naVal = naLabel = notAvailCfg;
        } else if (typeof notAvailCfg === 'object') {
          naLabel = notAvailCfg.label ?? 'not-available';
          naVal = notAvailCfg.value ?? naLabel;
        } else {
          naVal = naLabel = 'not-available';
        }
        items.unshift([naVal, naLabel]);
      }

      // Build all option data: [{val, label, formRef, isDefault}]
      const allItems: Array<{ val: string; label: string; formRef?: string; isDefault: boolean }> = [];
      const formRefs = new Map<string, string>();
      let selectedDefault = '';
      items.forEach(([v, l, formRef]) => {
        const isDefault = v.startsWith('selected::');
        const cleanVal = isDefault ? v.slice(10) : v;
        const cleanLabel = l.startsWith('selected::') ? l.slice(10) : l;
        allItems.push({ val: cleanVal, label: cleanLabel, formRef, isDefault });
        if (isDefault) selectedDefault = cleanVal;
        if (formRef) formRefs.set(cleanVal, formRef);
      });
      const allFormSections = new Set(formRefs.values());

      // Helper: rebuild select options from filtered items
      const rebuildOptions = (filter?: string) => {
        // Remove all options except the empty one
        while (sel.options.length > 1) sel.remove(1);
        const f = (filter ?? '').toLowerCase();
        allItems.forEach(item => {
          if (f && !item.label.toLowerCase().includes(f) && !item.val.toLowerCase().includes(f)) return;
          const o = document.createElement('option');
          o.value = item.val; o.textContent = item.label;
          if (item.isDefault && !f) o.selected = true;
          sel.appendChild(o);
        });
      };
      rebuildOptions();

      // Change handler (shared)
      const onSelectChange = () => {
        this._formValues[col] = sel.value;
        if (allFormSections.size > 0) {
          const activeSection = formRefs.get(sel.value);
          for (const sectionName of allFormSections) {
            const sectionEl = this._namedSections.get(sectionName);
            if (sectionEl) {
              sectionEl.style.display = sectionName === activeSection ? 'flex' : 'none';
            }
          }
        }
        this._validateForm();
      };
      sel.addEventListener('change', onSelectChange);

      if (hasFilterBox || hasCustomValue) {
        // Wrap select with a filter input to the right (and optional Add button)
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;

        // Inject placeholder style directly into wrapper (avoids global stylesheet issues)
        const phStyle = document.createElement('style');
        phStyle.textContent = `.jp-BA-filter-input::placeholder{color:${COLORS.overlay}!important;opacity:0.7;font-style:italic;}`;
        wrapper.appendChild(phStyle);

        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = 'filter options';
        filterInput.className = 'jp-BA-filter-input';
        filterInput.style.cssText = inputStyle('110px') + `font-size:13px;`;

        let addBtn: HTMLButtonElement | null = null;
        if (hasCustomValue) {
          addBtn = document.createElement('button');
          addBtn.textContent = '+ Add';
          addBtn.style.cssText = btnStyle() + `font-size:11px;padding:2px 6px;display:none;`;
          addBtn.addEventListener('click', () => {
            const custom = filterInput.value.trim();
            if (!custom) return;
            allItems.push({ val: custom, label: custom, isDefault: false });
            rebuildOptions();
            sel.value = custom;
            filterInput.value = '';
            if (addBtn) addBtn.style.display = 'none';
            onSelectChange();
          });
        }

        filterInput.addEventListener('input', () => {
          const f = filterInput.value.trim();
          rebuildOptions(f);
          // Open the dropdown so the user sees filtered results
          sel.size = Math.min(8, sel.options.length);
          if (!f) sel.size = 0; // collapse back when filter is cleared
          // Show Add button if custom_value enabled and no exact match
          if (addBtn) {
            const hasExact = f && allItems.some(
              item => item.val.toLowerCase() === f.toLowerCase() || item.label.toLowerCase() === f.toLowerCase());
            addBtn.style.display = (f && !hasExact) ? '' : 'none';
          }
        });

        // Arrow keys in filter input navigate the select; Enter selects
        filterInput.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            sel.selectedIndex = Math.min(sel.selectedIndex + 1, sel.options.length - 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            sel.selectedIndex = Math.max(sel.selectedIndex - 1, 0);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (sel.value) {
              sel.size = 0;
              filterInput.value = '';
              onSelectChange();
            }
          }
        });

        // Collapse the expanded list when a selection is made
        sel.addEventListener('change', () => { sel.size = 0; });

        wrapper.append(sel, filterInput);
        if (addBtn) wrapper.appendChild(addBtn);

        // Replace the simple select with the wrapper in the label
        this._formValues[col] = cfg.default ?? selectedDefault;
        this._inputRefs.set(col, sel);
        if (cfg.source_value) this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
        if (required) this._requiredInputs.push({ col, el: sel });
        lbl.appendChild(wrapper);
        container.appendChild(lbl);
        return;
      }

      this._formValues[col] = cfg.default ?? selectedDefault;
      inputEl = sel;

    } else if (type === 'checkbox') {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = Boolean(cfg.default);
      inp.addEventListener('change', () => {
        this._formValues[col] = inp.checked ? (cfg.yes_value ?? true) : (cfg.no_value ?? false);
        this._validateForm();
      });
      this._formValues[col] = inp.checked ? (cfg.yes_value ?? true) : (cfg.no_value ?? false);
      inputEl = inp;

    } else if (type === 'number') {
      const inp = document.createElement('input');
      inp.type = 'number';
      if (cfg.min !== undefined) inp.min = String(cfg.min);
      if (cfg.max !== undefined) inp.max = String(cfg.max);
      if (cfg.step !== undefined) inp.step = String(cfg.step);
      if (cfg.placeholder) inp.placeholder = String(cfg.placeholder);
      if (cfg.value !== undefined) inp.value = String(cfg.value);
      inp.style.cssText =
        inputStyle(cfg.width ? cssSize(cfg.width) : '80px') + `font-size:13px;`;
      inp.addEventListener('input', () => {
        this._formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
        this._validateForm();
      });
      this._formValues[col] = cfg.value ?? null;
      inputEl = inp;

    } else {
      return;
    }

    if (cfg.source_value) {
      this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
    }
    if (required) this._requiredInputs.push({ col, el: inputEl });
    this._inputRefs.set(col, inputEl);
    lbl.appendChild(inputEl);
    container.appendChild(lbl);
  }

  /**
   * Load select items. Returns [value, label, formRef?] tuples.
   * formRef is the name of a named form section to show when this item is selected.
   */
  private async _loadSelectItems(items: any): Promise<Array<[string, string, string?]>> {
    if (!items) return [];

    if (Array.isArray(items)) {
      return items.map(item => {
        if (typeof item === 'string') return [item, item] as [string, string];
        if (typeof item === 'object' && item !== null) {
          // New form: {label, value, form} or {label, form} or legacy {key: val}
          if ('label' in item || 'form' in item) {
            const label = item.label ?? item.value ?? '';
            const value = item.value ?? item.label ?? '';
            const form = item.form as string | undefined;
            return [String(value), String(label), form] as [string, string, string?];
          }
          const [k] = Object.keys(item);
          return [k, String(item[k])] as [string, string];
        }
        return [String(item), String(item)] as [string, string];
      });
    }

    if (typeof items === 'string') {
      return this._loadSelectItemsFromFile(items);
    }

    if (typeof items === 'object') {
      if ('max' in items) {
        const min = items.min ?? 0;
        const max = items.max;
        const step = items.step ?? 1;
        const result: Array<[string, string]> = [];
        for (let i = min; i <= max; i += step) result.push([String(i), String(i)]);
        return result;
      }
      if ('path' in items) {
        return this._loadSelectItemsFromFile(items.path, items.value, items.label);
      }
    }

    return [];
  }

  private async _loadSelectItemsFromFile(
    path: string,
    valueCol?: string,
    labelCol?: string
  ): Promise<Array<[string, string]>> {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    let code: string;

    if (ext === 'csv') {
      code = loadSelectItemsCsv(path, valueCol, labelCol);
    } else if (ext === 'parquet') {
      code = loadSelectItemsParquet(path, valueCol, labelCol);
    } else if (ext === 'jsonl' || ext === 'ndjson') {
      code = loadSelectItemsJsonl(path, valueCol, labelCol);
    } else if (ext === 'yaml' || ext === 'yml') {
      code = loadSelectItemsYaml(path, valueCol, labelCol);
    } else {
      code = loadSelectItemsText(path);
    }

    try {
      const result = await this._kernel.exec(code);
      return JSON.parse(result) as Array<[string, string]>;
    } catch {
      return [];
    }
  }

  private async _buildSubmissionButtons(cfg: any): Promise<void> {
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px;`;

    for (const [key, val] of Object.entries(cfg)) {
      if (key === 'pass_value') {
        this._registerPassValue(val);
      } else if (key === 'fixed_value') {
        this._registerFixedValue(val);
      } else if (key === 'title') {
        this._appendTitleEntry(val, this._dynFormEl);
      } else if (key === 'progress_tracker') {
        this._appendProgressTracker(this._dynFormEl);
      } else if (key === 'line') {
        const d = document.createElement('div');
        d.style.cssText = dividerStyle();
        this._dynFormEl.appendChild(d);
      } else if (key === 'break') {
        this._dynFormEl.appendChild(document.createElement('br'));
      } else if (key === 'text') {
        const d = document.createElement('div');
        d.style.cssText = mutedTextStyle();
        d.textContent = String(val);
        this._dynFormEl.appendChild(d);
      } else {
        const btnCfg = (val === true) ? {} : (val as any);
        const btn = document.createElement('button');
        if (key === 'previous') {
          btn.textContent = btnCfg.label ?? '◀ Prev';
          btn.style.cssText = btnStyle() + `font-size:13px;`;
          btn.addEventListener('click', () => this.prevRequested.emit(void 0));
        } else if (key === 'next') {
          const showIcon = btnCfg.icon !== false;
          btn.textContent = (btnCfg.label ?? 'Skip') + (showIcon ? ' →' : '');
          btn.style.cssText = btnStyle() + `font-size:13px;`;
          btn.addEventListener('click', () => this.nextRequested.emit(void 0));
        } else if (key === 'submit') {
          const showIcon = btnCfg.icon !== false;
          btn.textContent = (showIcon ? '✓ ' : '') + (btnCfg.label ?? 'Submit');
          btn.style.cssText = btnStyle(true) + `font-size:13px;opacity:0.4;`;
          btn.disabled = true;
          btn.addEventListener('click', () => void this._onVerify());
          this._submitBtns.push(btn);
        }
        btnContainer.appendChild(btn);
      }
    }

    this._dynFormEl.appendChild(btnContainer);
  }

  private async _buildAnnotationElement(config: any, container: HTMLElement): Promise<void> {
    if (!config || typeof config !== 'object') return;

    const ac: AnnotConfig = { tools: [] };

    if (config.start_time) {
      const c = typeof config.start_time === 'string' ? { column: config.start_time } : config.start_time;
      const col = c.column ?? c.label ?? 'start_time';
      ac.startTime = { col, sourceValue: c.source_value };
      this._formValues[col] = null;
    }
    if (config.end_time) {
      const c = typeof config.end_time === 'string' ? { column: config.end_time } : config.end_time;
      const col = c.column ?? c.label ?? 'end_time';
      ac.endTime = { col, sourceValue: c.source_value };
      this._formValues[col] = null;
    }
    if (config.min_frequency) {
      const c = typeof config.min_frequency === 'string' ? { column: config.min_frequency } : config.min_frequency;
      const col = c.column ?? c.label ?? 'min_frequency';
      ac.minFreq = { col };
      this._formValues[col] = null;
    }
    if (config.max_frequency) {
      const c = typeof config.max_frequency === 'string' ? { column: config.max_frequency } : config.max_frequency;
      const col = c.column ?? c.label ?? 'max_frequency';
      ac.maxFreq = { col };
      this._formValues[col] = null;
    }

    const rawTools = config.tools;
    if (typeof rawTools === 'string') {
      ac.tools = [rawTools];
    } else if (Array.isArray(rawTools)) {
      ac.tools = rawTools.filter((t: any) => typeof t === 'string');
    } else {
      ac.tools = ['time_select'];
    }

    // Parse annotation.form for multibox per-box forms
    if (config.form) {
      ac.form = typeof config.form === 'string' ? config.form : null;
      this._multiboxFormName = ac.form;
    }

    this._annotConfig = ac;
    this._activeTool = ac.tools[0] ?? '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:flex;align-items:center;gap:12px;flex-wrap:wrap;`;

    if (ac.tools.length > 1) {
      const lbl = document.createElement('label');
      lbl.style.cssText = formLabelStyle();
      lbl.textContent = 'tool';
      const sel = document.createElement('select');
      sel.style.cssText = selectStyle() + `font-size:13px;`;
      ac.tools.forEach(t => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t.replace(/_/g, ' ');
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        this._activeTool = sel.value;
        void this._rebuildAnnotFormUI();
        this.activeToolChanged.emit(this._activeTool);
        this.annotationChanged.emit(void 0);
      });
      lbl.appendChild(sel);
      wrapper.appendChild(lbl);
    }

    const mkInput = (field: string, label: string, unit = ''): void => {
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle() + `font-size:12px;gap:5px;`;
      lbl.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = field.includes('Freq') ? '1' : '0.01';
      inp.style.cssText = inputStyle('80px') + `font-size:12px;`;
      inp.addEventListener('input', () => {
        const v = inp.value === '' ? null : parseFloat(inp.value);
        this._setAnnotValueInternal(field, v, /*emit*/ true);
      });
      if (unit) {
        const u = document.createElement('span');
        u.textContent = unit;
        u.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
        lbl.append(inp, u);
      } else {
        lbl.appendChild(inp);
      }
      this._annotInputs.set(field, inp);
      wrapper.appendChild(lbl);
    };

    if (ac.startTime) mkInput('startTime', config.start_time?.label ?? 'start', 's');
    if (ac.endTime) mkInput('endTime', config.end_time?.label ?? 'end', 's');
    if (ac.minFreq) mkInput('minFreq', config.min_frequency?.label ?? 'min freq', 'Hz');
    if (ac.maxFreq) mkInput('maxFreq', config.max_frequency?.label ?? 'max freq', 'Hz');

    container.appendChild(wrapper);

    // Annotation form container — shows per-box forms in multibox mode,
    // or a single form instance for other annotation tools
    if (ac.form) {
      this._multiboxContainer = document.createElement('div');
      this._multiboxContainer.style.cssText =
        `display:flex;flex-direction:column;gap:6px;overflow-y:auto;`;
      container.appendChild(this._multiboxContainer);
      // Build initial single-form view (will switch to multibox cards when tool changes)
      await this._rebuildAnnotFormUI();
    }
  }

  // ─── Private: multibox UI ──────────────────────────────────

  private async _rebuildAnnotFormUI(): Promise<void> {
    if (!this._multiboxContainer) return;
    this._multiboxContainer.innerHTML = '';

    // Non-multibox mode: show a single form instance
    if (!this.isMultiboxMode()) {
      if (this._multiboxFormName) {
        let formCfg = this._formConfig?.dynamic_forms?.[this._multiboxFormName];
        if (formCfg) {
          if (!Array.isArray(formCfg) && typeof formCfg === 'object') {
            formCfg = Object.keys(formCfg).map((k: string) => ({ [k]: formCfg[k] }));
          }
          if (Array.isArray(formCfg)) {
            const formDiv = document.createElement('div');
            formDiv.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;`;
            await this._buildFormSection(formCfg, formDiv);
            this._multiboxContainer.appendChild(formDiv);
          }
        }
      }
      this._validateForm();
      return;
    }

    // Multibox mode
    if (this._multiboxEntries.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = mutedTextStyle({ fontSize: 11 });
      hint.textContent = 'Draw on spectrogram to add boxes';
      this._multiboxContainer.appendChild(hint);
      return;
    }

    for (let i = 0; i < this._multiboxEntries.length; i++) {
      const entry = this._multiboxEntries[i];
      const card = document.createElement('div');
      card.dataset.multiboxIdx = String(i);
      card.style.cssText =
        `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
        `border-radius:4px;border-left:3px solid ${entry.color};` +
        `background:${i === this._activeBoxIndex ? COLORS.bgSurface0 : COLORS.bgMantle};cursor:pointer;`;
      card.addEventListener('click', () => this.setActiveBox(i));

      // Header row: color dot + bounds + delete button
      const headerRow = document.createElement('div');
      headerRow.style.cssText = `display:flex;align-items:center;gap:8px;`;

      const dot = document.createElement('span');
      dot.style.cssText =
        `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${entry.color};`;
      headerRow.appendChild(dot);

      const bounds = document.createElement('span');
      bounds.style.cssText = `font-size:10px;color:${COLORS.textSubtle};font-family:ui-monospace,monospace;white-space:nowrap;`;
      bounds.textContent =
        `${entry.startTime.toFixed(1)}–${entry.endTime.toFixed(1)}s` +
        `  ${(entry.minFreq / 1000).toFixed(1)}–${(entry.maxFreq / 1000).toFixed(1)} kHz`;
      headerRow.appendChild(bounds);

      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      headerRow.appendChild(spacer);

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = 'Remove this box';
      delBtn.style.cssText = btnStyle() + `font-size:14px;padding:0 6px;line-height:1;`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeMultiboxEntry(i);
      });
      headerRow.appendChild(delBtn);
      card.appendChild(headerRow);

      // Per-box form (if configured)
      if (this._multiboxFormName) {
        let formCfg = this._formConfig?.dynamic_forms?.[this._multiboxFormName];
        if (formCfg) {
          if (!Array.isArray(formCfg) && typeof formCfg === 'object') {
            formCfg = Object.keys(formCfg).map((k: string) => ({ [k]: formCfg[k] }));
          }
          if (Array.isArray(formCfg)) {
            const formDiv = document.createElement('div');
            formDiv.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
            await this._buildMultiboxFormSection(formCfg, formDiv, entry);
            card.appendChild(formDiv);
          }
        }
      }

      this._multiboxContainer.appendChild(card);
    }
    this._validateForm();
  }

  /** Build form elements for a multibox entry, writing to entry.formValues. */
  private async _buildMultiboxFormSection(
    elements: any[], container: HTMLElement, entry: MultiboxEntry
  ): Promise<void> {
    for (const item of elements) {
      if (!item || typeof item !== 'object') continue;
      const [type] = Object.keys(item);
      const config = item[type];
      if (type === 'select') {
        const cfg = config ?? {};
        const col = cfg.column ?? cfg.label ?? type;
        const sel = document.createElement('select');
        sel.style.cssText = selectStyle() + `font-size:11px;max-width:160px;`;
        const emptyOpt = document.createElement('option');
        emptyOpt.value = ''; emptyOpt.textContent = '— select —';
        sel.appendChild(emptyOpt);
        const items = await this._loadSelectItems(cfg.items);
        items.forEach(([v, l]) => {
          const isDefault = v.startsWith('selected::');
          const cleanVal = isDefault ? v.slice(10) : v;
          const cleanLabel = l.startsWith('selected::') ? l.slice(10) : l;
          const o = document.createElement('option');
          o.value = cleanVal; o.textContent = cleanLabel;
          if (isDefault) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => { entry.formValues[col] = sel.value; this._validateForm(); });
        entry.formValues[col] = entry.formValues[col] ?? '';
        if (entry.formValues[col]) sel.value = entry.formValues[col];
        const lbl = document.createElement('label');
        lbl.style.cssText = labelStyle() + `font-size:11px;`;
        lbl.textContent = cfg.label ?? col;
        lbl.appendChild(sel);
        container.appendChild(lbl);
      } else if (type === 'textbox') {
        const cfg = config ?? {};
        const col = cfg.column ?? cfg.label ?? type;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.style.cssText = inputStyle('100px') + `font-size:11px;`;
        inp.addEventListener('input', () => { entry.formValues[col] = inp.value; this._validateForm(); });
        entry.formValues[col] = entry.formValues[col] ?? '';
        inp.value = entry.formValues[col];
        const lbl = document.createElement('label');
        lbl.style.cssText = labelStyle() + `font-size:11px;`;
        lbl.textContent = cfg.label ?? col;
        lbl.appendChild(inp);
        container.appendChild(lbl);
      } else if (type === 'number') {
        const cfg = config ?? {};
        const col = cfg.column ?? cfg.label ?? type;
        const inp = document.createElement('input');
        inp.type = 'number';
        if (cfg.min !== undefined) inp.min = String(cfg.min);
        if (cfg.max !== undefined) inp.max = String(cfg.max);
        if (cfg.step !== undefined) inp.step = String(cfg.step);
        inp.style.cssText = inputStyle('60px') + `font-size:11px;`;
        inp.addEventListener('input', () => {
          entry.formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
          this._validateForm();
        });
        entry.formValues[col] = entry.formValues[col] ?? null;
        if (entry.formValues[col] != null) inp.value = String(entry.formValues[col]);
        const lbl = document.createElement('label');
        lbl.style.cssText = labelStyle() + `font-size:11px;`;
        lbl.textContent = cfg.label ?? col;
        lbl.appendChild(inp);
        container.appendChild(lbl);
      } else if (type === 'checkbox') {
        const cfg = config ?? {};
        const col = cfg.column ?? cfg.label ?? type;
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = Boolean(entry.formValues[col] ?? cfg.default);
        inp.addEventListener('change', () => {
          entry.formValues[col] = inp.checked ? (cfg.yes_value ?? true) : (cfg.no_value ?? false);
          this._validateForm();
        });
        entry.formValues[col] = inp.checked ? (cfg.yes_value ?? true) : (cfg.no_value ?? false);
        const lbl = document.createElement('label');
        lbl.style.cssText = labelStyle() + `font-size:11px;`;
        lbl.textContent = cfg.label ?? col;
        lbl.appendChild(inp);
        container.appendChild(lbl);
      }
    }
  }

  private _highlightActiveBoxCard(): void {
    if (!this._multiboxContainer) return;
    const cards = this._multiboxContainer.querySelectorAll('[data-multibox-idx]');
    cards.forEach((card, i) => {
      const entry = this._multiboxEntries[i];
      if (!entry) return;
      (card as HTMLElement).style.borderColor =
        i === this._activeBoxIndex ? entry.color : 'transparent';
    });
  }

  // ─── Private: value management ─────────────────────────────

  private _applyRow(row: Detection): void {
    this._currentRow = row;
    // Clear multibox state
    this._multiboxEntries = [];
    this._activeBoxIndex = -1;
    void this._rebuildAnnotFormUI();

    // Hide all named form sections
    for (const sectionEl of this._namedSections.values()) {
      sectionEl.style.display = 'none';
    }

    // Reset all tracked inputs to empty
    for (const [col, el] of this._inputRefs) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = false;
        this._formValues[col] = false;
      } else {
        (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = '';
        this._formValues[col] = '';
      }
    }

    // Apply source_value fields
    for (const { col, sourceCol } of this._sourceValueFields) {
      const val = row[sourceCol];
      if (val !== undefined) {
        const el = this._inputRefs.get(col);
        if (el) {
          (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(val);
          this._formValues[col] = val;
        }
      }
    }

    // Apply annotation fields from row
    if (this._annotConfig) {
      const ac = this._annotConfig;
      if (ac.startTime) {
        const sv = ac.startTime.sourceValue;
        const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.start_time;
        this._setAnnotValueInternal('startTime', v, /*emit*/ false);
      }
      if (ac.endTime) {
        const sv = ac.endTime.sourceValue;
        const v = sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : row.end_time;
        this._setAnnotValueInternal('endTime', v, /*emit*/ false);
      }
      if (ac.minFreq) this._setAnnotValueInternal('minFreq', null, /*emit*/ false);
      if (ac.maxFreq) this._setAnnotValueInternal('maxFreq', null, /*emit*/ false);
    }

    // Apply pass_value fields
    for (const { sourceCol, col } of this._passValueDefs) {
      this._formValues[col] = row[sourceCol] ?? null;
    }

    // Annotation rendering on the canvas depends on these values
    this.annotationChanged.emit(void 0);
    this._validateForm();
  }

  private _setAnnotValueInternal(field: string, val: number | null, emit: boolean): void {
    const ac = this._annotConfig;
    if (!ac) return;
    let col: string | undefined;
    if (field === 'startTime') col = ac.startTime?.col;
    else if (field === 'endTime') col = ac.endTime?.col;
    else if (field === 'minFreq') col = ac.minFreq?.col;
    else if (field === 'maxFreq') col = ac.maxFreq?.col;
    if (!col) return;
    this._formValues[col] = val;
    const inp = this._annotInputs.get(field);
    if (inp) inp.value = val != null ? val.toFixed(2) : '';
    this._validateForm();
    if (emit) this.annotationChanged.emit(void 0);
  }

  private _validateForm(): void {
    // Check main form required inputs (skip those in detached/hidden sections)
    let allSatisfied = this._requiredInputs.every(({ col, el }) => {
      if (!el.isConnected) return true; // skip stale refs from rebuilt multibox forms
      const section = el.closest('[data-form-section]') as HTMLElement | null;
      if (section && section.style.display === 'none') return true;
      const val = this._formValues[col];
      return val !== null && val !== undefined && val !== '';
    });
    // In multibox mode, require at least one box and check per-box required fields
    if (this.isMultiboxMode()) {
      if (this._multiboxEntries.length === 0) {
        allSatisfied = false;
      } else if (this._multiboxFormName) {
        // Check each box has its required fields filled
        let formCfg = this._formConfig?.dynamic_forms?.[this._multiboxFormName];
        if (formCfg && !Array.isArray(formCfg) && typeof formCfg === 'object') {
          formCfg = Object.keys(formCfg).map((k: string) => ({ [k]: formCfg[k] }));
        }
        if (Array.isArray(formCfg)) {
          const requiredCols: string[] = [];
          for (const item of formCfg) {
            if (!item || typeof item !== 'object') continue;
            const [type] = Object.keys(item);
            const cfg = item[type] ?? {};
            if (cfg.required) requiredCols.push(cfg.column ?? cfg.label ?? type);
          }
          if (requiredCols.length > 0) {
            for (const entry of this._multiboxEntries) {
              for (const col of requiredCols) {
                const val = entry.formValues[col];
                if (val === null || val === undefined || val === '') {
                  allSatisfied = false;
                  break;
                }
              }
              if (!allSatisfied) break;
            }
          }
        }
      }
    }
    this._submitBtns.forEach(btn => {
      btn.disabled = !allSatisfied;
      btn.style.opacity = allSatisfied ? '1' : '0.4';
    });
  }

  private _registerPassValue(config: any): void {
    if (typeof config === 'string') {
      this._passValueDefs.push({ sourceCol: config, col: config });
      this._formValues[config] = null;
    } else if (config && typeof config === 'object') {
      const sourceCol = config.source_column;
      const col = config.column ?? sourceCol;
      this._passValueDefs.push({ sourceCol, col });
      this._formValues[col] = null;
    }
  }

  private _registerFixedValue(config: any): void {
    if (!config || typeof config !== 'object') return;
    const col = config.column;
    if (!col) return;
    this._formValues[col] = config.value ?? null;
  }

  private _collectFormValues(): Record<string, any> {
    return { ...this._formValues };
  }

  // ─── Private: display elements ────────────────────────────

  private _appendTitleEntry(config: any, container: HTMLElement): void {
    if (!config) return;
    const isObj = typeof config === 'object';
    const text = isObj ? (config.value ?? '') : String(config);
    const withProgress = isObj && config.progress_tracker === true;

    const d = document.createElement('div');
    d.style.cssText = sectionTitleStyle() + `display:flex;align-items:baseline;`;

    const span = document.createElement('span');
    span.textContent = text;
    d.appendChild(span);

    if (withProgress) {
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      d.append(spacer, this._createProgressEl());
    }

    container.appendChild(d);
  }

  private _appendProgressTracker(container: HTMLElement): void {
    const d = document.createElement('div');
    d.style.cssText = `width:100%;`;
    d.appendChild(this._createProgressEl());
    container.appendChild(d);
  }

  private _createProgressEl(): HTMLSpanElement {
    const el = document.createElement('span');
    el.style.cssText =
      `font-size:11px;font-weight:400;letter-spacing:0;color:${COLORS.textMuted};` +
      `font-family:ui-monospace,monospace;`;
    this._progressEls.push(el);
    this._updateProgress();
    return el;
  }

  private _updateProgress(): void {
    const total = this._rows.length;
    const fileN = Math.min(this._fileCount, total);
    const fileV = Math.min(this._fileValid, fileN);
    const totalDone = fileN + this._sessionCount;
    const parts: string[] = [];
    if (this._sessionCount > 0) {
      parts.push(`session ${this._sessionCount}/${total}`);
    }
    parts.push(`total ${totalDone}/${total}`);
    // Accuracy tracking removed — no longer tied to a specific is_valid column
    const text = parts.join(' · ');
    for (const el of this._progressEls) {
      el.textContent = text;
    }
  }

  // ─── Private: reviewed state ────────────────────────────────

  private _isRowReviewed(row: Detection): boolean {
    return !this._duplicateEntries && this._reviewedMap.has(row.id);
  }

  private _showReviewedResult(row: Detection): void {
    this._dynFormEl.innerHTML = '';
    this._submitBtns = [];
    this._showingReviewedView = true;
    const data = this._reviewedMap.get(row.id);
    if (!data) return;

    // Title (same as sectionTitleStyle but green)
    const title = document.createElement('div');
    title.style.cssText =
      `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${COLORS.green};`;
    title.textContent = 'REVIEWED';
    this._dynFormEl.appendChild(title);

    // Key-value pairs
    const container = document.createElement('div');
    container.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:4px 0;`;
    for (const [key, val] of Object.entries(data)) {
      const line = document.createElement('div');
      line.style.cssText = `display:flex;gap:8px;font-size:12px;`;
      const keyEl = document.createElement('span');
      keyEl.style.cssText = `color:${COLORS.textMuted};min-width:140px;flex-shrink:0;`;
      keyEl.textContent = key;
      const valEl = document.createElement('span');
      valEl.style.cssText = `color:${COLORS.textPrimary};`;
      valEl.textContent = val != null && val !== '' ? String(val) : '—';
      line.append(keyEl, valEl);
      container.appendChild(line);
    }
    this._dynFormEl.appendChild(container);

    // Divider + buttons
    const divider = document.createElement('div');
    divider.style.cssText = dividerStyle('4px -2px');
    this._dynFormEl.appendChild(divider);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:2px;`;

    const navBtnStyle = btnStyle() + `font-size:12px;width:75px;height:28px`;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Prev';
    prevBtn.style.cssText = navBtnStyle;
    prevBtn.disabled = this._selectedIdx === 0;
    prevBtn.addEventListener('click', () => this.prevRequested.emit(void 0));

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = navBtnStyle;
    nextBtn.disabled = this._selectedIdx >= this._filteredLength - 1;
    nextBtn.addEventListener('click', () => this.nextRequested.emit(void 0));

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete this review';
    deleteBtn.style.cssText = btnStyle() + `font-size:12px;color:${COLORS.red};`;
    deleteBtn.addEventListener('click', () => void this._onDeleteReview(row));

    btnRow.append(prevBtn, nextBtn, spacer, deleteBtn);
    this._dynFormEl.appendChild(btnRow);
  }

  // ─── Private: submit / delete ─────────────────────────────

  private async _onVerify(): Promise<void> {
    if (!this._currentRow || !this._outputPath) return;
    const activeRow = this._currentRow;
    const ac = this._annotConfig;

    // Multibox mode: write one row per box
    if (this.isMultiboxMode() && this._multiboxEntries.length > 0) {
      const baseValues = this._collectFormValues();
      // Remove annotation columns from base (they come from each box)
      if (ac?.startTime) delete baseValues[ac.startTime.col];
      if (ac?.endTime) delete baseValues[ac.endTime.col];
      if (ac?.minFreq) delete baseValues[ac.minFreq.col];
      if (ac?.maxFreq) delete baseValues[ac.maxFreq.col];

      const n = this._multiboxEntries.length;
      try {
        for (const entry of this._multiboxEntries) {
          const rowValues: Record<string, any> = { ...baseValues };
          if (ac?.startTime) rowValues[ac.startTime.col] = entry.startTime;
          if (ac?.endTime) rowValues[ac.endTime.col] = entry.endTime;
          if (ac?.minFreq) rowValues[ac.minFreq.col] = entry.minFreq;
          if (ac?.maxFreq) rowValues[ac.maxFreq.col] = entry.maxFreq;
          // Merge per-box form values
          Object.assign(rowValues, entry.formValues);
          const code = writeOutputRow(this._outputPath, rowValues);
          await this._kernel.exec(code);
        }
        this.statusChanged.emit({
          message: `✓ Saved ${n} boxes for clip ${activeRow.id} → ${this._outputPath}`,
          error: false,
        });
      } catch (e: any) {
        this.statusChanged.emit({ message: `❌ Write failed: ${String(e.message ?? e)}`, error: true });
        return;
      }
      this._sessionCount++;
      if (!this._duplicateEntries) {
        this._reviewedMap.set(activeRow.id, { _multibox: true, count: n });
      }
      this._updateProgress();
      void this._kernel.exec(INVALIDATE_OUTPUT_CACHE).catch(() => {});
      this.submitted.emit({ _multibox: true, count: n });
      return;
    }

    // Standard single-row submit
    const values = this._collectFormValues();
    const code = writeOutputRow(this._outputPath, values);
    try {
      await this._kernel.exec(code);
      this.statusChanged.emit({ message: `✓ Saved clip ${activeRow.id} → ${this._outputPath}`, error: false });
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Write failed: ${String(e.message ?? e)}`, error: true });
      return;
    }
    this._sessionCount++;
    if (!this._duplicateEntries) {
      this._reviewedMap.set(activeRow.id, { ...values });
    }
    this._updateProgress();
    void this._kernel.exec(INVALIDATE_OUTPUT_CACHE).catch(() => {});
    this.submitted.emit(values);
  }

  private _currentRow: Detection | null = null;
  private _currentRowId(): number { return this._currentRow?.id ?? -1; }
  private _rowById(id: number): number {
    return this._rows.findIndex(r => r.id === id);
  }

  private async _onDeleteReview(row: Detection): Promise<void> {
    if (!confirm('Delete this review? This cannot be undone.')) return;

    const idMapping = this._passValueDefs.find(pv => pv.sourceCol === 'id');
    const outIdCol = idMapping?.col;
    const matchExpr = outIdCol
      ? `str(r.get('${escPy(outIdCol)}','')) == '${row.id}'`
      : `abs(float(r.get('start_time',0))-${row.start_time})<0.01 and abs(float(r.get('end_time',0))-${row.end_time})<0.01`;
    const code = deleteOutputRow(this._outputPath, matchExpr);

    try {
      await this._kernel.exec(code);
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Delete failed: ${String(e.message ?? e)}`, error: true });
      return;
    }

    this._reviewedMap.delete(row.id);
    this._sessionCount = Math.max(0, this._sessionCount - 1);
    this._fileCount = Math.max(0, this._fileCount - 1);
    this._updateProgress();

    // Rebuild the form and show it
    await this.build();
    this._applyRow(row);
    this.statusChanged.emit({ message: `✓ Review deleted for clip ${row.id}`, error: false });

    void this._kernel.exec(
      INVALIDATE_OUTPUT_CACHE
    ).catch(() => {});

    this.reviewDeleted.emit(row);
  }

  // Override _applyRow to remember the current row (needed by _onVerify and
  // because the reviewed view is built from the row directly).
  // We could refactor _applyRow to return/accept the row, but keeping a
  // _currentRow field is simpler and the row is already passed in.

}
