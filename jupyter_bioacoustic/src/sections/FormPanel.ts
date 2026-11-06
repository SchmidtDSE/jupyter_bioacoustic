/**
 * FormPanel — the bottom panel of the BioacousticWidget.
 *
 * Owns the dynamic form built from `form_config`: all inputs, submission buttons, progress
 * tracker, annotation tool UI (incl. multibox cards), the reviewed view (for
 * already-submitted rows), and output file writing.
 *
 * Communicates with the rest of the widget via Lumino signals. Related modules under
 * ``form/``: ``annotationConfig`` (parsing the annotation element), ``selectItems`` /
 * ``inputs`` (select parsing and DOM), ``multiselect`` (tags: selection rules and output
 * encoding), ``multiboxCards`` (box cards and per-box forms),
 * ``reviewed`` (reviewed view), ``progress`` (progress text / accuracy), ``formConfig``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';

import { KernelBridge, KernelError } from '../kernel';
import {
  INVALIDATE_OUTPUT_CACHE, countOutputRows, deleteOutputRow, loadSelectItems, readOutputRows,
  writeOutputRows,
} from '../python';
import {
  COLORS,
  DISPLAY_CHIP_COLORS,
  btnStyle,
  cssSize,
  dividerStyle,
  formLabelStyle,
  formRowStyle,
  fullWidthDividerStyle,
  inputStyle,
  labelStyle,
  mutedTextStyle,
  sectionTitleStyle,
  selectStyle,
} from '../styles';
import { HINT } from '../text';
import { AnnotConfig, AnnotField, Detection, MultiboxEntry, SyncConfig } from '../types';
import {
  AccuracyConfig, errorMessage, escPy, hasTemplatePlaceholders, parseAccuracyConfig,
  resolveTemplate, showDialog,
} from '../util';
import { parseAnnotationConfig } from './form/annotationConfig';
import { asElementList, requiredColumns } from './form/formConfig';
import { buildMultiselect, buildSelect } from './form/inputs';
import { buildBoxCard, buildBoxForm } from './form/multiboxCards';
import {
  MultiselectSpec, decodeStored, encodeRow, multiselectItemsConfig, prepareMultiselect,
  selectionValid,
} from './form/multiselect';
import { accuracyPercent, formatProgress } from './form/progress';
import { buildReviewedView, reviewedAnnotation } from './form/reviewed';
import {
  RawSelectItem, loadRawSelectItems, parseSelectItems, selectItemOptions,
} from './form/selectItems';


//
// Constants
//
const DEFAULT_FORM_MIN_HEIGHT = 140;

/** Top-level form-config keys that are not named form sections. */
const TOPLEVEL_KEYS = new Set([
  'title', 'progress_tracker', 'pass_value', 'fixed_value',
  'submission_buttons', '_fixed_kwargs', 'dynamic_forms', 'form',
  'annotation',
]);

/** Input types allowed directly at the top level of a form config. */
const TOPLEVEL_INPUTS = new Set(['select', 'multiselect', 'textbox', 'checkbox', 'number']);

/** Annotation bounds in output-column order. */
const ANNOT_FIELDS: AnnotField[] = ['startTime', 'endTime', 'minFreq', 'maxFreq'];


//
// Types
//
/** A registered form input element. */
type InputEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;


//
// Public
//
/** The annotation form section of the annotator. */
export class FormPanel {
  /** The root element — append to the widget. */
  readonly element: HTMLDivElement;

  // ── Signals ──────────────────────────────────────────────────

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

  /** Sync button was clicked — orchestrator handles the kernel call. */
  readonly syncRequested = new Signal<this, void>(this);

  /** A status message to show in the widget header. */
  readonly statusChanged = new Signal<this, { message: string; error: boolean }>(this);

  // ── DOM refs ─────────────────────────────────────────────────
  private readonly _dynFormEl: HTMLDivElement;

  // ── Form state ───────────────────────────────────────────────
  private _formConfig: any = null;
  private _formValues: Record<string, any> = {};
  private _submitBtns: HTMLButtonElement[] = [];
  /** Named form sections (top-level config keys referenced by select form: items). */
  private readonly _namedSections: Map<string, HTMLDivElement> = new Map();
  private _requiredInputs: Array<{ col: string; el: HTMLElement }> = [];
  private readonly _inputRefs: Map<string, InputEl> = new Map();
  /** Each input's state right after build (value, or checked for checkboxes): restored per row. */
  private readonly _inputInitial: Map<string, string | boolean> = new Map();
  private _sourceValueFields: Array<{ col: string; sourceCol: string }> = [];
  /** Multiselects of the main form, by output column. */
  private readonly _multiselects: Map<string, MultiselectSpec> = new Map();
  /** Multiselects of the per-box (multibox) form, by output column. */
  private readonly _boxMultiselects: Map<string, MultiselectSpec> = new Map();
  private _passValueDefs: Array<{ sourceCol: string; col: string }> = [];
  private _templateElements: Array<{ el: HTMLElement | Text; template: string }> = [];

  // ── Progress tracking ────────────────────────────────────────
  private _sessionCount = 0;
  private _fileCount = 0;
  private _accuracy: number | null = null;
  private _progressEls: HTMLSpanElement[] = [];
  private _accuracyConfig: AccuracyConfig | null = null;

  // ── Annotation tool ──────────────────────────────────────────
  private _annotConfig: AnnotConfig | null = null;
  private _activeTool = '';
  private readonly _annotInputs: Map<string, HTMLInputElement> = new Map();
  private _fixedDurationValue = 0;
  private _fixedDurationInput: HTMLInputElement | null = null;
  private _fixedDurationLabel: HTMLLabelElement | null = null;

  // ── Multibox state ───────────────────────────────────────────
  private _multiboxEntries: MultiboxEntry[] = [];
  private _activeBoxIndex = -1;
  private _multiboxFormName: string | null = null;
  private _multiboxNextId = 0;
  private _multiboxColorIdx = 0;
  private _multiboxContainer: HTMLDivElement | null = null;

  // ── Reviewed state (for duplicate_entries=false) ─────────────
  private readonly _reviewedMap: Map<string | number, Record<string, any>[]> = new Map();
  private _showingReviewedView = false;
  private _reviewedTool = '';
  private _reviewedMultiboxEntries: MultiboxEntry[] = [];

  // ── Context provided by the orchestrator ─────────────────────
  private _rows: Detection[] = [];
  private _duplicateEntries = false;
  private _outputPath = '';
  private _dataIndexCol = '';
  private _outputIndexCol = '';
  private _syncConfig: SyncConfig = {};
  private _syncBtn: HTMLButtonElement | null = null;
  private _selectedIdx = -1;
  private _filteredLength = 0;
  /** The row the form is showing (needed by submit / delete). */
  private _currentRow: Detection | null = null;
  private _submitting = false;
  /** Async form-structure work (rebuilds) runs one job at a time, in call order. */
  private _formWork: Promise<void> = Promise.resolve();
  private _formWorkPending = 0;

  /** @param _kernel - Runs select-file loads and output-file reads/writes. */
  constructor(private readonly _kernel: KernelBridge) {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `flex:0 0 auto;min-height:${DEFAULT_FORM_MIN_HEIGHT}px;padding:10px 14px 12px;background:${COLORS.bgMantle};` +
      `border-top:1px solid ${COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;

    this._dynFormEl = document.createElement('div');
    this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
    this.element.append(this._dynFormEl);

    // Enter submits (when allowed) — except in textareas and text inputs
    this.element.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA') return;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
      const btn = this._submitBtns.find(b => !b.disabled);
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    });
  }

  // ── Public API: setup ────────────────────────────────────────

  /** Set context needed by the form (called once after reading kernel vars). */
  setContext(opts: {
    formConfig: any;
    rows: Detection[];
    duplicateEntries: boolean;
    outputPath: string;
    dataIndexCol: string;
    outputIndexCol: string;
    syncConfig?: SyncConfig;
    height?: number;
  }): void {
    if (opts.height) {
      this.element.style.minHeight = `${opts.height}px`;
    }
    this._formConfig = opts.formConfig;
    this._rows = opts.rows;
    this._duplicateEntries = opts.duplicateEntries;
    this._outputPath = opts.outputPath;
    this._dataIndexCol = opts.dataIndexCol;
    this._outputIndexCol = opts.outputIndexCol;
    this._syncConfig = opts.syncConfig ?? {};
  }

  /** Update selection info (called each time a row is selected). Used for
   *  Prev/Next disabled states in the reviewed view. */
  setSelectionInfo(selectedIdx: number, filteredLength: number): void {
    this._selectedIdx = selectedIdx;
    this._filteredLength = filteredLength;
  }

  /** Build the form from the current form config (top-level keys in config order). */
  async build(): Promise<void> {
    this._resetFormState();

    if (this._dataIndexCol) {
      const col = this._outputIndexCol || this._dataIndexCol;
      this._passValueDefs.push({ sourceCol: this._dataIndexCol, col });
      this._formValues[col] = null;
    }

    const cfg = this._formConfig;
    if (!cfg) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = 'flex';

    await this._registerDynamicForms(cfg.dynamic_forms);

    for (const key of Object.keys(cfg)) {
      if (key === 'title') {
        this._appendTitleEntry(cfg.title, this._dynFormEl);
      } else if (key === 'progress_tracker') {
        this._accuracyConfig = parseAccuracyConfig(cfg.progress_tracker);
        this._appendProgressTracker(this._dynFormEl);
      } else if (key === 'pass_value') {
        this._registerPassValue(cfg.pass_value);
      } else if (key === 'fixed_value') {
        this._registerFixedValue(cfg.fixed_value);
      } else if (key === 'annotation') {
        await this._buildAnnotationElement(cfg.annotation, this._dynFormEl);
      } else if (key === 'form') {
        if (Array.isArray(cfg.form)) await this._buildFormSection(cfg.form, this._dynFormEl);
      } else if (key === 'submission_buttons') {
        this._buildSubmissionButtons(cfg.submission_buttons);
      } else if (key === '_fixed_kwargs') {
        for (const item of cfg._fixed_kwargs) {
          if (item.fixed_value) this._registerFixedValue(item.fixed_value);
        }
      } else if (!TOPLEVEL_KEYS.has(key)) {
        const sectionData = cfg[key];
        if (Array.isArray(sectionData)) {
          const sectionDiv = this._createSectionDiv(key);
          await this._buildFormSection(sectionData, sectionDiv);
          this._dynFormEl.appendChild(sectionDiv);
          this._namedSections.set(key, sectionDiv);
        } else if (TOPLEVEL_INPUTS.has(key)) {
          await this._buildInputElement(key, sectionData, this._dynFormEl);
        }
      }
      // 'dynamic_forms' was handled above
    }

    for (const el of this._namedSections.values()) {
      if (!el.parentElement) this._dynFormEl.appendChild(el);
    }
    if (!cfg.submission_buttons) this._buildSubmissionButtons({ submit: true });
    this._validateForm();
  }

  /** Called each time a new row is selected. Rebuilds form vs. reviewed view. */
  updateFromRow(row: Detection): void {
    if (this._isRowReviewed(row)) {
      this._showReviewedResult(row);
      return;
    }
    if (this._showingReviewedView) {
      // the form was replaced by a reviewed result view: rebuild it
      this._showingReviewedView = false;
      this._reviewedTool = '';
      this._reviewedMultiboxEntries = [];
      void this._enqueue(async () => {
        await this.build();
        this._applyRow(row);
      });
    } else if (this._formWorkPending > 0) {
      void this._enqueue(() => this._applyRow(row));     // after the queued rebuilds, in order
    } else {
      this._applyRow(row);
    }
  }

  /** Load output-file progress counts (session + total + accuracy).
   *  Called once during init. */
  async loadOutputFileProgress(): Promise<void> {
    if (!this._outputPath) return;
    try {
      const raw = await this._kernel.exec(countOutputRows(this._outputPath, this._outputExt()));
      this._fileCount = (JSON.parse(raw) as { count: number }).count;
    } catch {
      // output file may not exist yet
    }
    await this._refreshAccuracy();
    this._updateProgress();
  }

  /** Load reviewed state from the output file (called during init when
   *  duplicate_entries=false). Matches output rows to input rows via
   *  the configured data/output index columns. */
  async loadReviewedState(): Promise<void> {
    if (this._duplicateEntries || !this._outputPath) return;
    this._reviewedMap.clear();

    let outputRows: Record<string, any>[];
    try {
      outputRows = JSON.parse(
        await this._kernel.exec(readOutputRows(this._outputPath, this._outputExt())));
    } catch { return; }

    const outCol = this._outputIndexCol;
    const srcCol = this._dataIndexCol;
    for (const outRow of outputRows) {
      if (!outCol || outRow[outCol] === undefined) continue;
      const outVal = outRow[outCol];
      const match = this._rows.find(r => String(r[srcCol]) === String(outVal));
      if (!match) continue;
      const key = match[srcCol];
      const arr = this._reviewedMap.get(key);
      if (arr) arr.push(outRow);
      else this._reviewedMap.set(key, [outRow]);
    }
  }

  // ── Public API: annotation (for Player) ──────────────────────

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

  /** Current fixed_duration value in seconds. */
  getFixedDuration(): number {
    return this._fixedDurationValue;
  }

  /** Read a single form value (for Player to read start_time/end_time/etc.). */
  getFormValue(col: string): any {
    return this._formValues[col];
  }

  /** True when the multibox tool is active. */
  isMultiboxMode(): boolean {
    return this._activeTool === 'multibox';
  }

  /** The drawn boxes (multibox mode), in drawing order. */
  getMultiboxEntries(): MultiboxEntry[] {
    return this._multiboxEntries;
  }

  /** Index of the active (highlighted) box, or -1. */
  getActiveBoxIndex(): number {
    return this._activeBoxIndex;
  }

  /** Add a drawn box (it becomes active, with the next chip color). */
  addMultiboxEntry(startTime: number, endTime: number, minFreq: number, maxFreq: number): void {
    const entry: MultiboxEntry = {
      id: this._multiboxNextId++,
      startTime, endTime, minFreq, maxFreq,
      formValues: {},
      color: DISPLAY_CHIP_COLORS[this._multiboxColorIdx++ % DISPLAY_CHIP_COLORS.length],
    };
    this._multiboxEntries.push(entry);
    this._activeBoxIndex = this._multiboxEntries.length - 1;
    this._syncAnnotInputsToBox(entry);
    void this._rebuildAnnotFormUI();
    this.annotationChanged.emit(void 0);
    this._validateForm();
  }

  /** Make box ``index`` active; the annotation inputs show its bounds. */
  setActiveBox(index: number): void {
    if (index < 0 || index >= this._multiboxEntries.length) return;
    this._activeBoxIndex = index;
    this._highlightActiveBoxCard();
    this._syncAnnotInputsToBox(this._multiboxEntries[index]);
    this.annotationChanged.emit(void 0);
  }

  /** Move one bound of box ``index`` (edge drag); the active box's inputs follow. */
  updateMultiboxBounds(index: number, field: AnnotField, value: number): void {
    const entry = this._multiboxEntries[index];
    if (!entry) return;
    entry[field] = value;
    if (index === this._activeBoxIndex && this._annotConfig?.[field]) {
      this._setAnnotValueInternal(field, value, false);
    }
    this.annotationChanged.emit(void 0);
  }

  /** Remove box ``index``. */
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

  /** Remove the active box (Delete key on the canvas). */
  removeActiveMultiboxEntry(): void {
    if (this._activeBoxIndex >= 0) this.removeMultiboxEntry(this._activeBoxIndex);
  }

  // ── Public API: reviewed state ───────────────────────────────

  /** Read the full reviewed map (for ClipTable row styling). */
  getReviewedMap(): Map<string | number, Record<string, any>[]> {
    return this._reviewedMap;
  }

  /** True if a row has been reviewed and duplicate_entries is off. */
  isReviewed(row: Detection): boolean {
    return this._isRowReviewed(row);
  }

  /** True while the reviewed view replaces the form. */
  isShowingReviewedView(): boolean {
    return this._showingReviewedView;
  }

  /** The tool the reviewed annotation is drawn with ('' for none). */
  getReviewedTool(): string {
    return this._reviewedTool;
  }

  /** The reviewed boxes (when ``getReviewedTool()`` is ``multibox``). */
  getReviewedMultiboxEntries(): MultiboxEntry[] {
    return this._reviewedMultiboxEntries;
  }

  /** Show the sync button busy ("Syncing…", disabled) or ready; the widget calls this when a sync ends. */
  setSyncBusy(busy: boolean): void {
    if (!this._syncBtn) return;
    this._syncBtn.disabled = busy;
    this._syncBtn.style.opacity = busy ? '0.4' : '1';
    this._syncBtn.textContent = busy ? 'Syncing…' : (this._syncConfig.button ?? 'Sync');
  }

  // ── Private: form building ───────────────────────────────────

  /** Clear everything ``build()`` creates. */
  private _resetFormState(): void {
    this._dynFormEl.innerHTML = '';
    this._formValues = {};
    this._submitBtns = [];
    this._namedSections.clear();
    this._requiredInputs = [];
    this._inputRefs.clear();
    this._inputInitial.clear();
    this._sourceValueFields = [];
    this._multiselects.clear();
    this._boxMultiselects.clear();
    this._passValueDefs = [];
    this._templateElements = [];
    this._annotConfig = null;
    this._activeTool = '';
    this._annotInputs.clear();
    this._showingReviewedView = false;
    this._sessionCount = 0;
    this._accuracy = null;
    this._progressEls = [];
    this._accuracyConfig = null;
  }

  /** A hidden named-section container (shown when a select / checkbox picks it). */
  private _createSectionDiv(name: string): HTMLDivElement {
    const div = document.createElement('div');
    div.dataset.formSection = name;
    div.style.cssText = formRowStyle(true);
    return div;
  }

  /** Build each ``dynamic_forms`` entry into a hidden named section. */
  private async _registerDynamicForms(dynForms: any): Promise<void> {
    if (!dynForms || typeof dynForms !== 'object' || Array.isArray(dynForms)) return;
    for (const [formName, rawElements] of Object.entries(dynForms)) {
      const elements = asElementList(rawElements);
      if (!elements) continue;
      const sectionDiv = this._createSectionDiv(formName);
      await this._buildFormSection(elements, sectionDiv);
      this._namedSections.set(formName, sectionDiv);
    }
  }

  /** Build a list of form elements (inputs, text, lines, titles...) into ``container``. */
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
        if (!this._accuracyConfig) this._accuracyConfig = parseAccuracyConfig(config);
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
        container.appendChild(this._textElement(config));
      } else {
        await this._buildInputElement(type, config, container);
      }
    }
  }

  /** A ``text`` element (``[[column]]`` templates are resolved per row). */
  private _textElement(config: any): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = mutedTextStyle({ width: '100%' });
    const textStr = String(config && typeof config === 'object' ? (config.value ?? '') : config);
    d.textContent = textStr;
    if (textStr.includes('\n')) d.style.whiteSpace = 'pre-wrap';
    if (hasTemplatePlaceholders(textStr)) this._templateElements.push({ el: d, template: textStr });
    return d;
  }

  /**
   * Build one input (textbox / select / multiselect / checkbox / number) with its label,
   * register it, and
   * append it plus any named sections it can reveal.
   */
  private async _buildInputElement(type: string, rawConfig: any, container: HTMLElement): Promise<void> {
    const cfg = (rawConfig === true || rawConfig === null || rawConfig === undefined) ? {} : rawConfig;
    const labelText: string = cfg.label ?? type;
    const col: string = cfg.column ?? labelText;

    let built: { input: InputEl; element: HTMLElement; sections: string[] } | null;
    if (type === 'textbox') built = this._buildTextbox(cfg, col);
    else if (type === 'select') built = await this._buildSelectInput(cfg, col);
    else if (type === 'multiselect') built = await this._buildMultiselectInput(cfg, col);
    else if (type === 'checkbox') built = this._buildCheckbox(cfg, col);
    else if (type === 'number') built = this._buildNumber(cfg, col);
    else built = null;
    if (!built) return;

    const lbl = document.createElement('label');
    lbl.style.cssText = formLabelStyle();
    const lblText = document.createTextNode(labelText);
    lbl.appendChild(lblText);
    if (hasTemplatePlaceholders(labelText)) {
      this._templateElements.push({ el: lblText, template: labelText });
    }

    if (cfg.source_value) this._sourceValueFields.push({ col, sourceCol: cfg.source_value });
    if (cfg.required ?? false) this._requiredInputs.push({ col, el: built.input });
    this._registerInput(col, built.input);
    lbl.appendChild(built.element);
    container.appendChild(lbl);
    for (const name of built.sections) {
      const sec = this._namedSections.get(name);
      if (sec) container.appendChild(sec);
    }
  }

  /** A textbox (``multiline`` -> textarea). */
  private _buildTextbox(cfg: any, col: string) {
    const css = inputStyle(cfg.width ? cssSize(cfg.width) : '220px');
    let input: HTMLInputElement | HTMLTextAreaElement;
    if (cfg.multiline) {
      const ta = document.createElement('textarea');
      ta.rows = 1;
      ta.style.cssText = css + `font-size:13px;resize:vertical;vertical-align:middle;height:28px;`;
      input = ta;
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.style.cssText = css + `font-size:13px;`;
      input = inp;
    }
    input.addEventListener('input', () => { this._formValues[col] = input.value; this._validateForm(); });
    input.value = cfg.default == null ? '' : String(cfg.default);
    this._formValues[col] = cfg.default ?? '';
    return { input, element: input, sections: [] };
  }

  /** A select; items with a ``form`` reveal that named section while selected. */
  private async _buildSelectInput(cfg: any, col: string) {
    const flags = selectItemOptions(cfg.items);
    const { items, selectedDefault } = parseSelectItems(
      await this._loadSelectItems(cfg.items), flags.notAvailable);
    const formRefs = new Map<string, string>();
    for (const item of items) if (item.formRef) formRefs.set(item.val, item.formRef);
    const allFormSections = new Set(formRefs.values());

    const built = buildSelect({
      items, filterBox: flags.filterBox, customValue: flags.customValue, variant: 'main',
      onChange: () => {
        const sel = built.select;
        this._formValues[col] = sel.value;
        if (allFormSections.size > 0) this._showOnly(allFormSections, formRefs.get(sel.value));
        this._validateForm();
      },
    });
    if (cfg.width) built.select.style.width = cssSize(cfg.width);
    if (cfg.default != null) built.select.value = String(cfg.default);
    this._formValues[col] = cfg.default ?? selectedDefault;
    return { input: built.select, element: built.element, sections: [...allFormSections] };
  }

  /**
   * A multiselect: picks become removable tags; its value is the list of labels. Items with a
   * ``form`` show that named section while they are tagged (several at once).
   */
  private async _buildMultiselectInput(cfg: any, col: string) {
    const flags = selectItemOptions(cfg.items);
    const { items, spec, initial } = prepareMultiselect(
      cfg, col, await this._loadSelectItems(multiselectItemsConfig(cfg.items)));
    this._multiselects.set(col, spec);
    const formRefs = new Map<string, string>();
    for (const item of items) if (item.formRef) formRefs.set(item.val, item.formRef);
    const allFormSections = new Set(formRefs.values());
    const built = buildMultiselect({
      items, spec, initial, filterBox: flags.filterBox, customValue: flags.customValue,
      variant: 'main',
      onChange: selected => {
        this._formValues[col] = selected;
        if (allFormSections.size > 0) {
          this._showOnly(allFormSections, new Set(selected.map(v => formRefs.get(v))));
        }
        this._validateForm();
      },
    });
    this._formValues[col] = initial;
    return { input: built.input, element: built.element, sections: [...allFormSections] };
  }

  /** A checkbox with checked/unchecked values; ``checked_form`` / ``unchecked_form`` sections. */
  private _buildCheckbox(cfg: any, col: string) {
    const checkedVal = cfg.checked_value ?? cfg.yes_value ?? true;
    const uncheckedVal = cfg.unchecked_value ?? cfg.no_value ?? false;
    const checkedForm = cfg.checked_form as string | undefined;
    const uncheckedForm = cfg.unchecked_form as string | undefined;
    const forms = new Set<string>();
    if (checkedForm) forms.add(checkedForm);
    if (uncheckedForm) forms.add(uncheckedForm);

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = Boolean(cfg.default);
    inp.addEventListener('change', () => {
      this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
      if (forms.size > 0) this._showOnly(forms, inp.checked ? checkedForm : uncheckedForm);
      this._validateForm();
    });
    this._formValues[col] = inp.checked ? checkedVal : uncheckedVal;
    const sections = [checkedForm, uncheckedForm].filter((f): f is string => !!f);
    return { input: inp, element: inp, sections };
  }

  /** A number input (``value`` is its initial value). */
  private _buildNumber(cfg: any, col: string) {
    const inp = document.createElement('input');
    inp.type = 'number';
    if (cfg.min !== undefined) inp.min = String(cfg.min);
    if (cfg.max !== undefined) inp.max = String(cfg.max);
    if (cfg.step !== undefined) inp.step = String(cfg.step);
    if (cfg.placeholder) inp.placeholder = String(cfg.placeholder);
    if (cfg.value !== undefined) inp.value = String(cfg.value);
    inp.style.cssText = inputStyle(cfg.width ? cssSize(cfg.width) : '80px') + `font-size:13px;`;
    inp.addEventListener('input', () => {
      this._formValues[col] = inp.value === '' ? null : parseFloat(inp.value);
      this._validateForm();
    });
    this._formValues[col] = cfg.value ?? null;
    return { input: inp, element: inp, sections: [] };
  }

  /** Show the named section(s) ``active`` and hide the other ``sections``. */
  private _showOnly(
    sections: Set<string>, active: string | undefined | Set<string | undefined>,
  ): void {
    const shown = active instanceof Set ? active : new Set([active]);
    for (const name of sections) {
      const el = this._namedSections.get(name);
      if (el) el.style.display = shown.has(name) ? 'flex' : 'none';
    }
  }

  /** A select's items as raw ``[value, label, formRef?]`` tuples (files load in the kernel). */
  private _loadSelectItems(items: any): Promise<RawSelectItem[]> {
    return loadRawSelectItems(items, async (path, valueCol, labelCol) => {
      try {
        const result = await this._kernel.exec(loadSelectItems(path, valueCol, labelCol));
        return JSON.parse(result) as RawSelectItem[];
      } catch {
        return [];
      }
    });
  }

  /** The submission row (Prev / Skip / Submit, sync button) plus inline extras. */
  private _buildSubmissionButtons(cfg: any): void {
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
        if (!this._accuracyConfig) this._accuracyConfig = parseAccuracyConfig(val);
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
        btnContainer.appendChild(this._submissionButton(key, val === true ? {} : (val as any)));
      }
    }

    if (this._syncConfig.button) {
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      btnContainer.appendChild(spacer);
      this._syncBtn = document.createElement('button');
      this._syncBtn.textContent = this._syncConfig.button;
      this._syncBtn.style.cssText = btnStyle() + `font-size:12px;`;
      this._syncBtn.addEventListener('click', () => this._onSync());
      btnContainer.appendChild(this._syncBtn);
    }

    this._dynFormEl.appendChild(btnContainer);
  }

  /** A ``previous`` / ``next`` / ``submit`` button (an empty button for unknown keys). */
  private _submissionButton(key: string, btnCfg: any): HTMLButtonElement {
    const btn = document.createElement('button');
    const showIcon = btnCfg.icon !== false;
    if (key === 'previous') {
      btn.textContent = btnCfg.label ?? '◀ Prev';
      btn.style.cssText = btnStyle() + `font-size:13px;`;
      btn.addEventListener('click', () => this.prevRequested.emit(void 0));
    } else if (key === 'next') {
      btn.textContent = (btnCfg.label ?? 'Skip') + (showIcon ? ' →' : '');
      btn.style.cssText = btnStyle() + `font-size:13px;`;
      btn.addEventListener('click', () => this.nextRequested.emit(void 0));
    } else if (key === 'submit') {
      btn.textContent = (showIcon ? '✓ ' : '') + (btnCfg.label ?? 'Submit');
      btn.style.cssText = btnStyle(true) + `font-size:13px;opacity:0.4;`;
      btn.disabled = true;
      btn.addEventListener('click', () => void this._onVerify());
      this._submitBtns.push(btn);
    }
    return btn;
  }

  /** Sync button: show it busy and ask the widget to sync. */
  private _onSync(): void {
    if (!this._syncBtn) return;
    this.setSyncBusy(true);
    this.syncRequested.emit(void 0);
  }

  // ── Private: annotation element ──────────────────────────────

  /**
   * Build the annotation element: tool dropdown (several tools), fixed-window input, the
   * bound inputs, and the annotation-form / multibox-card container.
   */
  private async _buildAnnotationElement(config: any, container: HTMLElement): Promise<void> {
    if (!config || typeof config !== 'object') return;
    const { config: ac, columns } = parseAnnotationConfig(config);
    for (const col of columns) this._formValues[col] = null;
    if (config.form) this._multiboxFormName = ac.form ?? null;
    this._annotConfig = ac;
    this._activeTool = ac.tools[0] ?? '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:flex;align-items:center;gap:12px;flex-wrap:wrap;`;
    if (ac.tools.length > 1) wrapper.appendChild(this._buildToolSelect(ac.tools));
    if (ac.fixedDuration) wrapper.appendChild(this._buildFixedDurationInput(ac));

    const labels: Record<AnnotField, string> = {
      startTime: config.start_time?.label ?? 'start_time',
      endTime: config.end_time?.label ?? 'end_time',
      minFreq: config.min_frequency?.label ?? 'min_frequency',
      maxFreq: config.max_frequency?.label ?? 'max_frequency',
    };
    for (const field of ANNOT_FIELDS) {
      if (ac[field]) wrapper.appendChild(this._buildAnnotInput(field, labels[field]));
    }
    container.appendChild(wrapper);

    // Annotation form container — per-box cards in multibox mode, or one form instance
    if (ac.form || ac.tools.includes('multibox')) {
      this._multiboxContainer = document.createElement('div');
      this._multiboxContainer.style.cssText = `display:flex;flex-direction:column;gap:6px;overflow-y:auto;`;
      container.appendChild(this._multiboxContainer);
      // Direct, not queued: build() may itself be running inside the queue.
      await this._renderAnnotFormUI();
    }
  }

  /** The "tool" dropdown. */
  private _buildToolSelect(tools: string[]): HTMLLabelElement {
    const lbl = document.createElement('label');
    lbl.style.cssText = formLabelStyle();
    lbl.textContent = 'tool';
    const sel = document.createElement('select');
    sel.style.cssText = selectStyle() + `font-size:13px;`;
    for (const t of tools) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t.replace(/_/g, ' ');
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      this._activeTool = sel.value;
      this._updateFixedDurationState();
      if (this._currentRow) this._applyAnnotValues(this._currentRow);
      void this._rebuildAnnotFormUI();
      this.activeToolChanged.emit(this._activeTool);
      this.annotationChanged.emit(void 0);
    });
    lbl.appendChild(sel);
    return lbl;
  }

  /** The fixed-duration "window" input (editable only for ``initial_window`` configs). */
  private _buildFixedDurationInput(ac: AnnotConfig): HTMLLabelElement {
    const fd = ac.fixedDuration!;
    this._fixedDurationValue = fd.value;
    const lbl = document.createElement('label');
    lbl.style.cssText = labelStyle() + `font-size:12px;gap:5px;`;
    lbl.textContent = 'window';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(fd.value);
    inp.style.cssText = inputStyle('70px') + `font-size:12px;`;
    if (fd.step) inp.step = String(fd.step);
    if (fd.min != null) inp.min = String(fd.min);
    if (fd.max != null) inp.max = String(fd.max);
    const commitValue = () => {
      let v = parseFloat(inp.value);
      if (isNaN(v) || v < 0) return;
      if (fd.min != null) v = Math.max(fd.min, v);
      if (fd.max != null) v = Math.min(fd.max, v);
      this._fixedDurationValue = v;
      inp.value = String(v);
      this._resizeFixedDuration();
    };
    inp.addEventListener('blur', commitValue);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitValue(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') requestAnimationFrame(commitValue);
    });
    inp.addEventListener('pointerup', () => requestAnimationFrame(commitValue));
    lbl.append(inp, this._unitSpan('s'));
    this._fixedDurationInput = inp;
    this._fixedDurationLabel = lbl;
    this._updateFixedDurationState();
    return lbl;
  }

  /** A number input for one annotation bound (typing updates the canvas). */
  private _buildAnnotInput(field: AnnotField, label: string): HTMLLabelElement {
    const lbl = document.createElement('label');
    lbl.style.cssText = labelStyle() + `font-size:12px;gap:5px;`;
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = field.includes('Freq') ? '1' : '0.01';
    inp.style.cssText = inputStyle('80px') + `font-size:12px;`;
    inp.addEventListener('input', () => {
      this._setAnnotValueInternal(field, inp.value === '' ? null : parseFloat(inp.value), true);
    });
    lbl.append(inp, this._unitSpan(field.includes('Freq') ? 'Hz' : 's'));
    this._annotInputs.set(field, inp);
    return lbl;
  }

  /** A small muted unit label (``s``, ``Hz``). */
  private _unitSpan(unit: string): HTMLSpanElement {
    const u = document.createElement('span');
    u.textContent = unit;
    u.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
    return u;
  }

  // ── Private: annotation form / multibox cards ────────────────

  /** Re-render the annotation form area (queued: rebuilds await the kernel and must not overlap). */
  private _rebuildAnnotFormUI(): Promise<void> {
    return this._enqueue(() => this._renderAnnotFormUI());
  }

  /** Run ``work`` after all previously queued form work, one job at a time. */
  private _enqueue(work: () => void | Promise<void>): Promise<void> {
    this._formWorkPending++;
    this._formWork = this._formWork
      .then(work)
      .catch(e => console.error('[JBA] form update failed:', e))
      .finally(() => { this._formWorkPending--; });
    return this._formWork;
  }

  /** Drop the registrations of inputs that live inside ``container`` (it's about to be rebuilt). */
  private _forgetInputsIn(container: HTMLElement): void {
    const inside = (el: Node | undefined) => !!el && container.contains(el);
    for (const [col, el] of this._inputRefs) {
      if (inside(el)) {
        this._inputRefs.delete(col);
        this._inputInitial.delete(col);
      }
    }
    this._requiredInputs = this._requiredInputs.filter(r => !inside(r.el));
    this._sourceValueFields = this._sourceValueFields.filter(f => this._inputRefs.has(f.col));
    this._templateElements = this._templateElements.filter(t => !inside(t.el));
  }

  /**
   * Fill the annotation form container: one instance of the annotation form (other tools),
   * or a card per box with its own form (multibox; a hint when there are no boxes).
   */
  private async _renderAnnotFormUI(): Promise<void> {
    const host = this._multiboxContainer;
    if (!host) return;
    this._forgetInputsIn(host);
    host.innerHTML = '';
    const formCfg = this._multiboxFormName
      ? asElementList(this._formConfig?.dynamic_forms?.[this._multiboxFormName])
      : null;

    if (!this.isMultiboxMode()) {
      if (formCfg) {
        const formDiv = document.createElement('div');
        formDiv.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;`;
        await this._buildFormSection(formCfg, formDiv);
        host.appendChild(formDiv);
      }
      this._validateForm();
      return;
    }

    if (this._multiboxEntries.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = mutedTextStyle({ fontSize: 11 });
      hint.textContent = HINT.drawBoxes;
      host.appendChild(hint);
      return;
    }

    for (let i = 0; i < this._multiboxEntries.length; i++) {
      const entry = this._multiboxEntries[i];
      const card = buildBoxCard(entry, i, i === this._activeBoxIndex, {
        onSelect: () => this.setActiveBox(i),
        onRemove: () => this.removeMultiboxEntry(i),
      });
      if (formCfg) {
        const formDiv = document.createElement('div');
        formDiv.style.cssText = `display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
        await buildBoxForm(
          formCfg, formDiv, entry, items => this._loadSelectItems(items), () => this._validateForm(),
          spec => this._boxMultiselects.set(spec.col, spec));
        card.appendChild(formDiv);
      }
      host.appendChild(card);
    }
    this._validateForm();
  }

  /** Recolor the cards' left strips: the active box's color, transparent for the others. */
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

  /** Copy a box's bounds into the annotation inputs / values. */
  private _syncAnnotInputsToBox(entry: MultiboxEntry | undefined): void {
    if (!entry || !this._annotConfig) return;
    for (const field of ANNOT_FIELDS) {
      if (this._annotConfig[field]) this._setAnnotValueInternal(field, entry[field], false);
    }
  }

  // ── Private: values ──────────────────────────────────────────

  /** Track an input and remember its just-built state, which ``_applyRow`` restores. */
  private _registerInput(col: string, el: InputEl): void {
    this._inputRefs.set(col, el);
    const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
    this._inputInitial.set(col, isCheckbox ? (el as HTMLInputElement).checked : el.value);
  }

  /**
   * Show ``row`` in the form: clear boxes, hide named sections, reset inputs to their
   * built state, then apply source values, annotation values, pass values and templates.
   */
  private _applyRow(row: Detection): void {
    this._currentRow = row;
    this._multiboxEntries = [];
    this._activeBoxIndex = -1;
    // multibox: clear the box cards. The single annotation sub-form is NOT rebuilt per row
    // (that re-registered its inputs every row); its inputs are reset below like the rest.
    if (this.isMultiboxMode()) void this._rebuildAnnotFormUI();

    for (const sectionEl of this._namedSections.values()) sectionEl.style.display = 'none';

    // Reset every input to its state right after build (defaults, selected:: items, number
    // values, checkbox checked/unchecked values). Firing the input's own event recomputes
    // _formValues and re-shows any form section the default reveals, exactly as at build.
    for (const [col, el] of this._inputRefs) {
      const initial = this._inputInitial.get(col);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = initial === true;
        el.dispatchEvent(new Event('change'));
      } else {
        el.value = typeof initial === 'string' ? initial : '';
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
      }
    }

    for (const { col, sourceCol } of this._sourceValueFields) {
      const val = row[sourceCol];
      const el = this._inputRefs.get(col);
      const spec = this._multiselects.get(col);
      if (val !== undefined && el && spec) {
        el.value = JSON.stringify(decodeStored(spec, val));
        el.dispatchEvent(new Event('input'));
      } else if (val !== undefined && el) {
        el.value = String(val);
        this._formValues[col] = val;
      }
    }

    this._applyAnnotValues(row);

    for (const { sourceCol, col } of this._passValueDefs) {
      this._formValues[col] = row[sourceCol] ?? null;
    }

    for (const { el, template } of this._templateElements) {
      el.textContent = resolveTemplate(template, row);
    }

    // Annotation rendering on the canvas depends on these values
    this.annotationChanged.emit(void 0);
    this._validateForm();
  }

  /**
   * Pre-fill the annotation from the row for the time tools (start / start+end from the
   * row or its ``source_value`` columns); clear everything else.
   */
  private _applyAnnotValues(row: Detection): void {
    const ac = this._annotConfig;
    if (!ac) return;
    const tool = this._activeTool;
    const fromRow = (sv: string | undefined, fallback: number) =>
      sv && row[sv] !== undefined ? parseFloat(String(row[sv])) : fallback;
    if (ac.startTime) {
      const fill = tool === 'time_select' || tool === 'start_end_time_select';
      this._setAnnotValueInternal(
        'startTime', fill ? fromRow(ac.startTime.sourceValue, row.start_time) : null, false);
    }
    if (ac.endTime) {
      const fill = tool === 'start_end_time_select';
      this._setAnnotValueInternal(
        'endTime', fill ? fromRow(ac.endTime.sourceValue, row.end_time) : null, false);
    }
    if (ac.minFreq) this._setAnnotValueInternal('minFreq', null, false);
    if (ac.maxFreq) this._setAnnotValueInternal('maxFreq', null, false);
  }

  /** Enable / dim the window input for the active tool. */
  private _updateFixedDurationState(): void {
    const ac = this._annotConfig;
    if (!ac?.fixedDuration || !this._fixedDurationInput || !this._fixedDurationLabel) return;
    const isActive = this._activeTool === 'fixed_duration';
    const canEdit = ac.fixedDuration.editable && isActive;
    this._fixedDurationInput.disabled = !canEdit;
    this._fixedDurationInput.style.opacity = canEdit ? '1' : '0.5';
    this._fixedDurationLabel.style.opacity = isActive ? '1' : '0.35';
  }

  /** Resize the placed fixed window around its center after the window length changed. */
  private _resizeFixedDuration(): void {
    const ac = this._annotConfig;
    const stCol = ac?.startTime?.col;
    const etCol = ac?.endTime?.col;
    if (!stCol || !etCol) return;
    const st = this._formValues[stCol];
    const et = this._formValues[etCol];
    if (st == null || et == null) return;
    const center = (st + et) / 2;
    const half = this._fixedDurationValue / 2;
    this._setAnnotValueInternal('startTime', center - half, false);
    this._setAnnotValueInternal('endTime', center + half, false);
    this.annotationChanged.emit(void 0);
  }

  /** Set an annotation bound's value and input; re-validate; optionally notify the Player. */
  private _setAnnotValueInternal(field: string, val: number | null, emit: boolean): void {
    const col = this._annotConfig?.[field as AnnotField]?.col;
    if (!col) return;
    this._formValues[col] = val;
    const inp = this._annotInputs.get(field);
    if (inp) inp.value = val != null ? val.toFixed(2) : '';
    this._validateForm();
    if (emit) this.annotationChanged.emit(void 0);
  }

  /**
   * Enable Submit when every visible required input has a value and, in multibox mode,
   * there is at least one box and every box's required fields are filled.
   */
  private _validateForm(): void {
    const filled = (val: any) =>
      Array.isArray(val) ? val.length > 0 : val !== null && val !== undefined && val !== '';
    const visible = (el: HTMLElement) => {
      if (!el.isConnected) return false; // stale refs from rebuilt multibox forms
      const section = el.closest('[data-form-section]') as HTMLElement | null;
      return !(section && section.style.display === 'none');
    };
    let allSatisfied = this._requiredInputs.every(
      ({ col, el }) => !visible(el) || filled(this._formValues[col]));
    for (const [col, spec] of this._multiselects) {
      const el = this._inputRefs.get(col);
      if (el && visible(el) && !selectionValid(spec, this._formValues[col] ?? [])) {
        allSatisfied = false;
      }
    }
    if (this.isMultiboxMode()) {
      if (this._multiboxEntries.length === 0) {
        allSatisfied = false;
      } else if (this._multiboxFormName) {
        const formCfg = asElementList(this._formConfig?.dynamic_forms?.[this._multiboxFormName]);
        const cols = formCfg ? requiredColumns(formCfg) : [];
        if (!this._multiboxEntries.every(e => cols.every(c => filled(e.formValues[c])))) {
          allSatisfied = false;
        }
        const boxSpecs = [...this._boxMultiselects.values()];
        if (!this._multiboxEntries.every(
          e => boxSpecs.every(spec => selectionValid(spec, e.formValues[spec.col] ?? [])))) {
          allSatisfied = false;
        }
      }
    }
    this._submitBtns.forEach(btn => {
      btn.disabled = !allSatisfied;
      btn.style.opacity = allSatisfied ? '1' : '0.4';
    });
  }

  /** ``pass_value``: copy a data column into the output (``name`` or ``{source_column, column}``). */
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

  /** ``fixed_value``: a constant output column (``{column, value}``). */
  private _registerFixedValue(config: any): void {
    if (!config || typeof config !== 'object') return;
    const col = config.column;
    if (!col) return;
    this._formValues[col] = config.value ?? null;
  }

  /** The output file's extension (lower case). */
  private _outputExt(): string {
    return this._outputPath.split('.').pop()?.toLowerCase() ?? '';
  }

  // ── Private: titles / progress ───────────────────────────────

  /** A section title, optionally with the progress line on the right. */
  private _appendTitleEntry(config: any, container: HTMLElement): void {
    if (!config) return;
    const isObj = typeof config === 'object';
    const text = isObj ? (config.value ?? '') : String(config);
    const withProgress = isObj && config.progress_tracker != null && config.progress_tracker !== false;

    const d = document.createElement('div');
    d.style.cssText = sectionTitleStyle() + `display:flex;align-items:baseline;`;
    const span = document.createElement('span');
    span.textContent = text;
    d.appendChild(span);

    if (withProgress) {
      if (!this._accuracyConfig) this._accuracyConfig = parseAccuracyConfig(config.progress_tracker);
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      d.append(spacer, this._createProgressEl());
    }
    container.appendChild(d);
  }

  /** A full-width progress line. */
  private _appendProgressTracker(container: HTMLElement): void {
    const d = document.createElement('div');
    d.style.cssText = `width:100%;`;
    d.appendChild(this._createProgressEl());
    container.appendChild(d);
  }

  /** A progress text element (kept up to date by ``_updateProgress``). */
  private _createProgressEl(): HTMLSpanElement {
    const el = document.createElement('span');
    el.style.cssText =
      `font-size:11px;font-weight:400;letter-spacing:0;color:${COLORS.textMuted};` +
      `font-family:ui-monospace,monospace;`;
    this._progressEls.push(el);
    this._updateProgress();
    return el;
  }

  /** Refresh every progress element. */
  private _updateProgress(): void {
    const text = formatProgress(this._sessionCount, this._fileCount, this._rows.length, this._accuracy);
    for (const el of this._progressEls) el.textContent = text;
  }

  /** Recompute the accuracy from the output file (null without an accuracy check / rows). */
  private async _refreshAccuracy(): Promise<void> {
    if (!this._accuracyConfig || !this._outputPath) {
      this._accuracy = null;
      return;
    }
    try {
      const rows = JSON.parse(
        await this._kernel.exec(readOutputRows(this._outputPath, this._outputExt()))) as Record<string, any>[];
      this._accuracy = accuracyPercent(rows, this._accuracyConfig);
    } catch {
      this._accuracy = null;
    }
  }

  // ── Private: reviewed view ───────────────────────────────────

  private _isRowReviewed(row: Detection): boolean {
    return !this._duplicateEntries && this._reviewedMap.has(row[this._dataIndexCol]);
  }

  /** Replace the form with the saved values of ``row`` and draw its saved annotation. */
  private _showReviewedResult(row: Detection): void {
    this._dynFormEl.innerHTML = '';
    this._submitBtns = [];
    this._showingReviewedView = true;
    const rows = this._reviewedMap.get(row[this._dataIndexCol]);
    if (!rows || rows.length === 0) return;

    this._dynFormEl.append(...buildReviewedView(rows, {
      canPrev: this._selectedIdx !== 0,
      canNext: this._selectedIdx < this._filteredLength - 1,
      onPrev: () => this.prevRequested.emit(void 0),
      onNext: () => this.nextRequested.emit(void 0),
      onDelete: () => void this._onDeleteReview(row),
    }));

    const ann = reviewedAnnotation(rows, this._annotConfig);
    this._reviewedTool = ann.tool;
    this._reviewedMultiboxEntries = ann.boxes;
    Object.assign(this._formValues, ann.values);
    this.annotationChanged.emit(void 0);
  }

  // ── Private: submit / delete ─────────────────────────────────

  /** Submit handler: one guarded write per submit (no double-clicks, no partial multibox saves). */
  private async _onVerify(): Promise<void> {
    if (this._submitting || !this._currentRow || !this._outputPath) return;
    this._submitting = true;
    this._setSubmitBusy(true);
    try {
      await this._writeSubmission(this._currentRow);
    } finally {
      this._submitting = false;
      this._setSubmitBusy(false);
    }
  }

  /** Write the current form (one row, or one row per multibox box) in a single kernel call. */
  private async _writeSubmission(activeRow: Detection): Promise<void> {
    const multibox = this.isMultiboxMode() && this._multiboxEntries.length > 0;
    const specs = new Map([...this._multiselects, ...this._boxMultiselects]);
    const rows = (multibox
      ? this._multiboxEntries.map(entry => this._multiboxRow(entry))
      : [{ ...this._formValues }]).map(row => encodeRow(row, specs));
    try {
      await this._kernel.exec(writeOutputRows(this._outputPath, rows));
    } catch (e: unknown) {
      if (e instanceof KernelError) console.error('[JBA] Write failed:', e.traceback);
      this.statusChanged.emit({ message: `❌ Write failed: ${errorMessage(e)}`, error: true });
      return;
    }
    const clipId = activeRow[this._dataIndexCol];
    this.statusChanged.emit({
      message: multibox
        ? `✓ Saved ${rows.length} boxes for clip ${clipId} → ${this._outputPath}`
        : `✓ Saved clip ${clipId} → ${this._outputPath}`,
      error: false,
    });
    this._sessionCount++;
    if (!this._duplicateEntries) {
      this._reviewedMap.set(clipId, rows.map(r => ({ ...r })));
    }
    void this._refreshAccuracy().then(() => this._updateProgress());
    void this._kernel.exec(INVALIDATE_OUTPUT_CACHE).catch(() => {});
    this.setSyncBusy(false);
    this.submitted.emit(multibox ? { _multibox: true, count: rows.length } : rows[0]);
  }

  /** One output row for a multibox box: shared form values + the box bounds + its own form. */
  private _multiboxRow(entry: MultiboxEntry): Record<string, any> {
    const row: Record<string, any> = { ...this._formValues };
    for (const field of ANNOT_FIELDS) {
      const col = this._annotConfig?.[field]?.col;
      if (col) {
        delete row[col];            // re-add so the bound columns come last, after the form
        row[col] = entry[field];
      }
    }
    return Object.assign(row, entry.formValues);
  }

  /** Disable the submit buttons while a write is in flight; re-validate afterwards. */
  private _setSubmitBusy(busy: boolean): void {
    if (busy) {
      for (const btn of this._submitBtns) btn.disabled = true;
    } else {
      this._validateForm();
    }
  }

  /** "Delete this review": confirm, delete the row's output rows, then show the form again. */
  private async _onDeleteReview(row: Detection): Promise<void> {
    const answer = await showDialog({
      title: 'Delete review',
      body: 'Delete this review? This cannot be undone.',
      buttons: [{ label: 'Cancel' }, { label: 'Delete', primary: true }],
    });
    if (answer !== 'Delete') return;

    const rowIdx = row[this._dataIndexCol];
    const matchExpr =
      `str(r.get('${escPy(this._outputIndexCol)}','')) == '${escPy(String(rowIdx))}'`;
    try {
      await this._kernel.exec(deleteOutputRow(this._outputPath, matchExpr));
    } catch (e: unknown) {
      this.statusChanged.emit({ message: `❌ Delete failed: ${errorMessage(e)}`, error: true });
      return;
    }

    this._reviewedMap.delete(rowIdx);
    this._reviewedTool = '';
    this._reviewedMultiboxEntries = [];
    // the deleted rows were counted in the file total: recount it (and restart the session)
    this._sessionCount = 0;
    this._fileCount = 0;
    await this.loadOutputFileProgress();

    await this._enqueue(async () => {
      await this.build();
      this._applyRow(row);
    });
    this.statusChanged.emit({ message: `✓ Review deleted for clip ${rowIdx}`, error: false });
    void this._kernel.exec(INVALIDATE_OUTPUT_CACHE).catch(() => {});
    this.reviewDeleted.emit(row);
  }
}
