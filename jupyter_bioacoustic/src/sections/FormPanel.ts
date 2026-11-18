/**
 * FormPanel — the bottom panel of the BioacousticWidget.
 *
 * Owns the dynamic form built from `form_config`: all inputs, submission buttons, progress
 * tracker, annotation tool UI (incl. multibox cards), the reviewed view (for
 * already-submitted rows), and output file writing.
 *
 * Keyboard: the form is a list of focusable items (each top-level element; a whole row /
 * column / grid; the button row). The focused item gets a grey background; ← / → and Tab move
 * between items, Enter steps into a container (or a textbox) and Esc steps back out, Enter / Space
 * click a focused button or checkbox, and hot keys (a button's ``hot_key``, a select's
 * ``hot_keys``) work while their item is focused.
 *
 * Communicates with the rest of the widget via Lumino signals. Related modules under
 * ``form/``: ``annotationConfig`` (parsing the annotation element), ``selectItems`` /
 * ``inputs`` (select parsing and DOM), ``multiselect`` (tags: selection rules and output
 * encoding), ``multiboxCards`` (box cards and per-box forms),
 * ``reviewed`` (reviewed view), ``progress`` (progress text / accuracy), ``buttons`` (the
 * ``button`` element), ``layout`` (``row`` / ``column`` / ``grid`` containers), ``formConfig``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';

import { KernelBridge, KernelError } from '../kernel';
import {
  INVALIDATE_OUTPUT_CACHE, countOutputRows, deleteOutputRow, loadSelectItems, readImageDataUrl,
  readOutputRows, writeOutputRows,
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
import {
  BADGE_ICON_OFFSET, ButtonFace, ToggleStart, formButtonStyle, hotKeyBadgeStyle, isDirectImageSrc,
  nextToggleIndex, parseFormButton, toggleStart,
} from './form/buttons';
import { asElementList, requiredColumns } from './form/formConfig';
import { buildMultiselect, buildSelect } from './form/inputs';
import { hasCommandModifier, isTypingTarget, resolveHotKeys } from './form/hotkeys';
import { DEFAULT_DELIMITER, flattenLayout, layoutStyle, parseLayout } from './form/layout';
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
/** Selector for the controls inside an item that keyboard focus can land on. */
const FOCUSABLE = 'button, select, textarea, input:not([type=hidden])';
/** Class on the focused form item (greyed by the global stylesheet). */
const ITEM_FOCUS_CLASS = 'jp-BA-item-focus';
/** The form panel's padding (a side form uses less). */
const FORM_PADDING = '10px 14px 12px';
/** Height of the collapse toggle's own row (forms without a title / progress row). */
const TOGGLE_ROW_PX = 12;

/** Input types allowed directly at the top level of a form config. */
const TOPLEVEL_INPUTS = new Set(['select', 'multiselect', 'textbox', 'checkbox', 'number']);

/** Annotation bounds in output-column order. */
const ANNOT_FIELDS: AnnotField[] = ['startTime', 'endTime', 'minFreq', 'maxFreq'];


//
// Types
//
/** A registered form input element. */
type InputEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** A built ``button`` element. */
interface FormButton {
  el: HTMLButtonElement;
  spec: ReturnType<typeof parseFormButton>;
  /** A toggle's current state (-1: not clicked yet). */
  toggleIdx: number;
  /** A plain button with a column: pressed or not. */
  pressed: boolean;
  /** Its group (plain buttons with a column), else null. */
  group: ButtonGroup | null;
}

/** A hot key and what it does (click a button, pick a select / multiselect option). */
interface HotKeyTarget {
  el: HTMLElement;
  key: string;
  act: () => void;
}

/** Buttons that press / un-press together (a container with ``unique``, or one column). */
interface ButtonGroup {
  unique: boolean;
  buttons: FormButton[];
}

/** What a row / column / grid passes on to the buttons inside it. */
interface LayoutContext {
  column: string | null;
  /** The group set by the nearest container with ``unique`` (null: group per column). */
  group: ButtonGroup | null;
  delimiter: string;
}


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
  /** Plain ``button`` elements with a column, by output column. */
  private readonly _columnButtons: Map<string, FormButton[]> = new Map();
  /** A button column's ``initial_value`` (its value while none of its buttons is pressed). */
  private readonly _buttonInitial: Map<string, any> = new Map();
  /** Delimiter joining the pressed values of a non-unique shared button column. */
  private readonly _buttonDelimiter: Map<string, string> = new Map();
  /** Per-column groups of buttons outside any container with ``unique``. */
  private readonly _columnGroups: Map<string, ButtonGroup> = new Map();
  /** ``button`` elements with a ``toggle`` (each owns its column). */
  private _toggleBtns: FormButton[] = [];
  /** ``button`` elements with ``submit: true``. */
  private _submitFormBtns: FormButton[] = [];
  /** Image ``data:`` URLs read in the kernel, by path (kept across rebuilds). */
  private readonly _imageUrls: Map<string, Promise<string>> = new Map();
  /** The same, once read (so re-rendering a button doesn't flicker). */
  private readonly _imageSrcs: Map<string, string> = new Map();
  private _minHeight = `${DEFAULT_FORM_MIN_HEIGHT}px`;
  /** The collapse toggle, kept at the start of the button row across rebuilds. */
  private _leading: HTMLElement | null = null;
  /** Beside the spectrogram (``side_form``) rather than below it. */
  private _sideMode = false;
  /** Hot keys of the current form (looked up within the focused item). */
  private _hotKeys: HotKeyTarget[] = [];
  /** The highlighted (focused) item. */
  private _focusedItem: HTMLElement | null = null;
  /** Item index to focus after the next row is shown (null: leave focus alone). */
  private _pendingFocus: number | null = null;

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
      `flex:0 0 auto;min-height:${DEFAULT_FORM_MIN_HEIGHT}px;padding:${FORM_PADDING};background:${COLORS.bgMantle};` +
      `border-top:1px solid ${COLORS.bgSurface0};display:none;flex-direction:column;gap:10px;`;

    this._dynFormEl = document.createElement('div');
    this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;
    this.element.append(this._dynFormEl);

    this.element.addEventListener('keydown', e => this._onKeyDown(e));
    this.element.addEventListener('focusin', e => this._setFocusedItem(this._itemOf(e.target)));
    this.element.addEventListener('focusout', e => {
      if (!this.element.contains(e.relatedTarget as Node | null)) this._setFocusedItem(null);
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
      this._minHeight = `${opts.height}px`;
      if (this.element.style.minHeight !== '0px') this.element.style.minHeight = this._minHeight;
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

  /** Keep ``el`` (the collapse toggle) at the start of the title row (see ``_placeLeading``). */
  setLeading(el: HTMLElement): void {
    this._leading = el;
    this._placeLeading();
  }

  /** Focus the form: its highlighted item if any, else the first one. False when it has none. */
  focusForm(): boolean {
    const items = this._items();
    const item = this._focusedItem && items.includes(this._focusedItem) ? this._focusedItem : items[0];
    if (!item) return false;
    this._focusItem(item);
    return true;
  }

  /**
   * Show a notice at the top of the form (below its title), e.g. "all done" after the last
   * clip, with an optional action button. Removed when another row is shown.
   */
  showNotice(text: string, action?: { label: string; onClick: () => void }): void {
    this._dynFormEl.querySelector(':scope > [data-form-notice]')?.remove();
    const notice = document.createElement('div');
    notice.dataset.formNotice = '';
    notice.style.cssText =
      `display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 10px;` +
      `border-radius:4px;background:${COLORS.bgReviewed};color:${COLORS.green};font-size:12px;`;
    notice.append(text);
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = btnStyle() + `font-size:12px;`;
      btn.addEventListener('click', action.onClick);
      notice.appendChild(btn);
      this._makeItem(notice);
    }
    const heading = this._dynFormEl.querySelector(':scope > [data-form-heading]');
    if (heading) heading.after(notice);
    else this._dynFormEl.prepend(notice);
  }

  /** Collapse to the row holding the toggle (title / progress, else buttons), or expand. */
  setCollapsed(collapsed: boolean): void {
    this._dynFormEl.classList.toggle('jp-BA-collapsed', collapsed);
    this.element.classList.toggle('jp-BA-form-collapsed', collapsed);
    this.element.style.minHeight = collapsed || this._sideMode ? '0px' : this._minHeight;
  }

  /**
   * Show the form beside the spectrogram (``side_form``): a left border instead of a top one,
   * no minimum height, and its own scrolling. Collapsed, it becomes a narrow strip with the
   * toggle and (if any) the title running vertically (the global stylesheet).
   */
  setSideMode(side: boolean, stacked = false): void {
    this._sideMode = side && !stacked;
    this.element.classList.toggle('jp-BA-side-form', this._sideMode);
    this.element.style.borderTop = this._sideMode ? 'none' : `1px solid ${COLORS.bgSurface0}`;
    this.element.style.overflowY = this._sideMode ? 'auto' : '';
    this.element.style.minWidth = this._sideMode ? '0' : '';
    // a side form can be very narrow (e.g. a column of buttons): tighter padding
    this.element.style.padding = this._sideMode ? '8px 8px 10px' : FORM_PADDING;
    this.setCollapsed(this._dynFormEl.classList.contains('jp-BA-collapsed'));
  }

  /** Build the form from the current form config (top-level keys in config order). */
  async build(): Promise<void> {
    this._keepFocusAcrossRebuild();
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
        // false: no Prev / Skip / Submit row (submit with a button's ``submit: true``)
        if (cfg.submission_buttons !== false) this._buildSubmissionButtons(cfg.submission_buttons);
        else if (this._syncConfig.button) this._buildSubmissionButtons({});
      } else if (key === '_fixed_kwargs') {
        for (const item of cfg._fixed_kwargs) {
          if (item.fixed_value) this._registerFixedValue(item.fixed_value);
        }
      } else if (TOPLEVEL_INPUTS.has(key)) {
        await this._buildInputElement(key, cfg[key], this._dynFormEl);
      }
      // 'dynamic_forms' was handled above; named forms must live there
    }

    for (const el of this._namedSections.values()) {
      if (!el.parentElement) this._dynFormEl.appendChild(el);
    }
    if (cfg.submission_buttons === undefined || cfg.submission_buttons === null) {
      this._buildSubmissionButtons({ submit: true });
    }
    this._placeLeading();
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

  /** ``duplicate_entries``: several submissions per clip allowed (no reviewed view). */
  get duplicateEntries(): boolean {
    return this._duplicateEntries;
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

  // ── Private: keyboard navigation ─────────────────────────────

  /**
   * Form keys (see the module docstring). Text boxes keep their keys except Esc (back to the
   * item) and Tab (next item); handled keys are stopped so the widget's j / k don't fire.
   */
  private _onKeyDown(e: KeyboardEvent): void {
    if (hasCommandModifier(e)) return;
    const target = e.target as HTMLElement | null;
    const item = this._itemOf(target);
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'Escape') {
      if (item && target !== item) {
        handled();
        this._focusItemElement(item);
      }
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      handled();
      this._moveItem(item, 1);
      return;
    }
    if (isTypingTarget(target)) {
      // Enter in a number box submits (as before); in a text box / textarea it doesn't
      if (e.key === 'Enter' && (target as HTMLInputElement).type === 'number') this._onEnter(e, target);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      handled();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      if (item && target !== item && this._isContainerItem(item)) this._moveInner(item, target!, step);
      else this._moveItem(item, step);
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && item) {
      const hot = this._hotKeys.find(h => h.key === e.key && item.contains(h.el));
      if (hot) {
        handled();
        hot.act();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && item && target === item && !item.matches(FOCUSABLE)) {
      handled();
      this._innerFocusables(item)[0]?.focus();      // step into a container / label item
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) this._onEnter(e, target);
  }

  /** Enter on a button / checkbox clicks it; elsewhere it submits (when allowed). */
  private _onEnter(e: KeyboardEvent, target: HTMLElement | null): void {
    const tag = target?.tagName;
    const isCheckbox = tag === 'INPUT' && (target as HTMLInputElement).type === 'checkbox';
    if (tag === 'BUTTON' || isCheckbox) {
      e.preventDefault();
      if (!(target as HTMLButtonElement | HTMLInputElement).disabled) target!.click();
      return;
    }
    const btn = this._submitBtns.find(b => !b.disabled);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  }

  /** Mark the elements added to ``container`` after ``before`` as items (skip text, lines...). */
  private _markItems(container: HTMLElement, before: Element | null): void {
    let el = before ? before.nextElementSibling : container.firstElementChild;
    for (; el; el = el.nextElementSibling) {
      const d = (el as HTMLElement).dataset;
      if (!d || el.tagName === 'BR') continue;
      if (d.formSection !== undefined || d.formLine !== undefined || d.formHeading !== undefined
        || d.formText !== undefined || d.formToggleRow !== undefined) continue;
      if (!el.querySelector(FOCUSABLE) && !el.matches(FOCUSABLE)) continue;
      this._makeItem(el as HTMLElement);
    }
  }

  /**
   * Make ``el`` a form item: a click anywhere on it (e.g. beside a row's buttons) focuses it
   * (``tabIndex = -1``), so it is highlighted and its hot keys work.
   */
  private _makeItem(el: HTMLElement): void {
    el.dataset.formItem = '';
    if (!el.matches(FOCUSABLE) && !el.hasAttribute('tabindex')) el.tabIndex = -1;
  }

  /** The shown items, in order (an item that holds items, e.g. the annotation host, is skipped). */
  private _items(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>('[data-form-item]')].filter(
      el => this._isShown(el) && !el.querySelector('[data-form-item]'));
  }

  /** The item holding ``target``, or null. */
  private _itemOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const items = this._items();
    return items.find(it => it === target || it.contains(target)) ?? null;
  }

  /** False when ``el`` (or a parent up to the panel) is hidden or collapsed away. */
  private _isShown(el: HTMLElement): boolean {
    const collapsed = this._dynFormEl.classList.contains('jp-BA-collapsed');
    for (let e: HTMLElement | null = el; e && e !== this.element; e = e.parentElement) {
      if (e.style.display === 'none') return false;
      if (collapsed && e.parentElement === this._dynFormEl && e.dataset.collapseKeep === undefined) {
        return false;
      }
    }
    return true;
  }

  /** True for an item that holds several controls (row / column / grid, a button row). */
  private _isContainerItem(item: HTMLElement): boolean {
    return item.classList.contains('jp-BA-layout') || item.dataset.formButtons !== undefined;
  }

  /** The enabled, shown controls of ``item``, in order. */
  private _innerFocusables(item: HTMLElement): HTMLElement[] {
    const all = item.matches(FOCUSABLE) ? [item] : [...item.querySelectorAll<HTMLElement>(FOCUSABLE)];
    return all.filter(el => !(el as HTMLButtonElement).disabled && this._isShown(el)
      && !el.closest('[data-collapse-toggle]'));
  }

  /** Focus an item: a single control directly (a textbox gets the cursor), else the item. */
  private _focusItem(item: HTMLElement): void {
    const controls = this._innerFocusables(item);
    if (!this._isContainerItem(item) && controls.length === 1) controls[0].focus();
    else this._focusItemElement(item);
  }

  /** Focus the item element itself (highlighted, no control focused). */
  private _focusItemElement(item: HTMLElement): void {
    if (item.tabIndex < 0 || !item.hasAttribute('tabindex')) item.tabIndex = -1;
    item.focus();
  }

  /** Move to the item ``step`` away from ``item`` (wrapping); the first item when none. */
  private _moveItem(item: HTMLElement | null, step: number): void {
    const items = this._items();
    if (items.length === 0) return;
    const idx = item ? items.indexOf(item) : -1;
    const next = idx < 0 ? 0 : (idx + step + items.length) % items.length;
    this._focusItem(items[next]);
  }

  /** Move between the controls inside a container item (stopping at its ends). */
  private _moveInner(item: HTMLElement, target: HTMLElement, step: number): void {
    const controls = this._innerFocusables(item);
    const idx = controls.findIndex(c => c === target || c.contains(target));
    const next = controls[Math.max(0, Math.min(controls.length - 1, idx + step))];
    next?.focus();
  }

  /** Highlight ``item`` (and un-highlight the previous one). */
  private _setFocusedItem(item: HTMLElement | null): void {
    if (item === this._focusedItem) return;
    this._focusedItem?.classList.remove(ITEM_FOCUS_CLASS);
    this._focusedItem = item;
    item?.classList.add(ITEM_FOCUS_CLASS);
  }

  /** Before the form is replaced: if it has focus, refocus the same item afterwards. */
  private _keepFocusAcrossRebuild(): void {
    if (this._pendingFocus !== null || !this.element.contains(document.activeElement)) return;
    const idx = this._focusedItem ? this._items().indexOf(this._focusedItem) : 0;
    this._pendingFocus = Math.max(0, idx);
  }

  /** Focus the item saved by ``_keepFocusAcrossRebuild`` / a submit (clamped). */
  private _restoreFocus(): void {
    if (this._pendingFocus === null) return;
    const items = this._items();
    const idx = Math.min(this._pendingFocus, items.length - 1);
    this._pendingFocus = null;
    if (idx >= 0) this._focusItem(items[idx]);
  }

  /**
   * Put the collapse toggle at the start of the form's first title / progress row (the
   * reviewed view's REVIEWED title), or, without one, in a slim row of its own at the top.
   * That row is the one a collapsed form keeps.
   */
  private _placeLeading(): void {
    if (!this._leading) return;
    let row = this._dynFormEl.querySelector<HTMLElement>(':scope > [data-form-heading]');
    if (!row) {
      row = this._dynFormEl.querySelector<HTMLElement>(':scope > [data-form-toggle-row]');
      if (!row) {
        row = document.createElement('div');
        row.dataset.formToggleRow = '';
        row.style.cssText = `display:flex;align-items:center;height:${TOGGLE_ROW_PX}px;`;
        this._dynFormEl.prepend(row);
      }
    }
    for (const el of this._dynFormEl.querySelectorAll<HTMLElement>(':scope > [data-collapse-keep]')) {
      delete el.dataset.collapseKeep;
    }
    row.dataset.collapseKeep = '';
    if (row.dataset.formHeading !== undefined) {
      row.style.display = 'flex';
      row.style.alignItems = 'center';
    }
    row.prepend(this._leading);
  }

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
    this._columnButtons.clear();
    this._buttonInitial.clear();
    this._buttonDelimiter.clear();
    this._columnGroups.clear();
    this._hotKeys = [];
    this._toggleBtns = [];
    this._submitFormBtns = [];
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

  /**
   * Build a list of form elements (inputs, text, lines, titles, row / column / grid
   * containers...) into ``container``. Inside a container, the named sections an input can
   * reveal are collected in ``deferred`` and placed after the outermost container instead.
   */
  private async _buildFormSection(
    elements: any[], container: HTMLElement, deferred?: HTMLElement[], ctx?: LayoutContext,
  ): Promise<void> {
    for (const item of elements) {
      if (!item || typeof item !== 'object') continue;
      const before = container.lastElementChild;
      await this._buildFormElement(item, container, deferred, ctx);
      if (!ctx) this._markItems(container, before);
    }
  }

  /** Build one form element of a section (see ``_buildFormSection``). */
  private async _buildFormElement(
    item: any, container: HTMLElement, deferred?: HTMLElement[], ctx?: LayoutContext,
  ): Promise<void> {
    const [type] = Object.keys(item);
    const config = item[type];
    const layout = parseLayout(type, config);
    if (layout) {
      const box = document.createElement('div');
      box.className = `jp-BA-layout jp-BA-layout-${layout.kind}`;
      box.style.cssText = layoutStyle(layout);
      const sections = deferred ?? [];
      const inner: LayoutContext = {
        column: layout.column ?? ctx?.column ?? null,
        group: layout.unique !== null ? { unique: layout.unique, buttons: [] } : ctx?.group ?? null,
        delimiter: layout.delimiter ?? ctx?.delimiter ?? DEFAULT_DELIMITER,
      };
      await this._buildFormSection(layout.items, box, sections, inner);
      container.appendChild(box);
      if (!deferred) for (const sec of sections) container.appendChild(sec);
    } else if (type === 'pass_value') {
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
      d.dataset.formLine = '';
      container.appendChild(d);
    } else if (type === 'text') {
      container.appendChild(this._textElement(config));
    } else if (type === 'button') {
      container.appendChild(this._buildButton(config, ctx));
    } else {
      await this._buildInputElement(type, config, container, deferred);
    }
  }

  /** A ``text`` element (``[[column]]`` templates are resolved per row). */
  private _textElement(config: any): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = mutedTextStyle({ width: '100%' });
    const textStr = String(config && typeof config === 'object' ? (config.value ?? '') : config);
    d.dataset.formText = '';
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
  private async _buildInputElement(
    type: string, rawConfig: any, container: HTMLElement, deferred?: HTMLElement[],
  ): Promise<void> {
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
      if (sec && deferred) deferred.push(sec);
      else if (sec) container.appendChild(sec);
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

    const hotKeyed = resolveHotKeys(cfg.hot_keys, items);
    const built = buildSelect({
      items, filterBox: flags.filterBox, customValue: flags.customValue, variant: 'main',
      pinned: cfg.pin_hot_keys ? hotKeyed : undefined,
      onChange: () => {
        const sel = built.select;
        this._formValues[col] = sel.value;
        if (allFormSections.size > 0) this._showOnly(allFormSections, formRefs.get(sel.value));
        this._validateForm();
      },
    });
    for (const { key, item } of hotKeyed) {
      this._hotKeys.push({
        el: built.select, key,
        act: () => {
          built.select.value = item.val;
          built.select.dispatchEvent(new Event('change'));
        },
      });
    }
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
    const hotKeyed = resolveHotKeys(cfg.hot_keys, items);
    const built = buildMultiselect({
      items, spec, initial, filterBox: flags.filterBox, customValue: flags.customValue,
      variant: 'main', pinned: cfg.pin_hot_keys ? hotKeyed : undefined,
      onChange: selected => {
        this._formValues[col] = selected;
        if (allFormSections.size > 0) {
          this._showOnly(allFormSections, new Set(selected.map(v => formRefs.get(v))));
        }
        this._validateForm();
      },
    });
    for (const { key, item } of hotKeyed) {
      // toggle the tag: remove it (its × button) when tagged, else pick it
      this._hotKeys.push({
        el: built.element, key,
        act: () => {
          const tag = [...built.element.querySelectorAll<HTMLElement>('[data-tag]')]
            .find(t => t.dataset.tag === item.val);
          const picker = built.element.querySelector('select');
          if (tag) tag.querySelector('button')?.click();
          else if (picker && !picker.disabled) {
            picker.value = item.val;
            picker.dispatchEvent(new Event('change'));
          }
        },
      });
    }
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

  /**
   * A ``button`` element (see ``form/buttons``). A plain button with a column is pressed /
   * un-pressed (in a unique group, pressing it un-presses the others) and its column is
   * recomputed; a toggle moves to its next state; ``submit`` submits (after pressing).
   * ``ctx`` (the enclosing row / column / grid) gives the column, group and delimiter.
   */
  private _buildButton(rawConfig: any, ctx?: LayoutContext): HTMLButtonElement {
    const spec = parseFormButton(rawConfig);
    if (!spec.column && ctx?.column) spec.column = ctx.column;
    const el = document.createElement('button');
    el.type = 'button';
    const btn: FormButton = { el, spec, toggleIdx: -1, pressed: false, group: null };
    const col = spec.column;

    if (spec.toggle && col) {
      this._toggleBtns.push(btn);
      this._setToggle(btn, toggleStart(spec));
    } else if (col) {
      btn.group = ctx?.group ?? this._columnGroup(col);
      btn.group.buttons.push(btn);
      const colButtons = this._columnButtons.get(col);
      if (colButtons) colButtons.push(btn);
      else this._columnButtons.set(col, [btn]);
      if (spec.hasInitialValue && !this._buttonInitial.has(col)) {
        this._buttonInitial.set(col, spec.initialValue);
      }
      if (ctx?.group && !ctx.group.unique) this._buttonDelimiter.set(col, ctx.delimiter);
      if (spec.required) this._requiredInputs.push({ col, el });
      this._resetButtonGroup(btn.group);
    } else {
      this._renderButton(btn);
    }
    if (spec.submit) this._submitFormBtns.push(btn);
    if (spec.hotKey) this._hotKeys.push({ el, key: spec.hotKey, act: () => el.click() });

    el.addEventListener('click', () => {
      if (spec.toggle && col) {
        const next = nextToggleIndex(spec, btn.toggleIdx);
        this._setToggle(btn, { index: next, value: spec.toggle[next].value });
      } else if (btn.group) {
        this._pressButton(btn, spec.submit ? true : !btn.pressed);
      }
      this._validateForm();
      if (spec.submit && !el.disabled) void this._onVerify();
    });
    return el;
  }

  /** The per-column group of ``col`` (buttons outside any container with ``unique``). */
  private _columnGroup(col: string): ButtonGroup {
    let group = this._columnGroups.get(col);
    if (!group) {
      group = { unique: true, buttons: [] };
      this._columnGroups.set(col, group);
    }
    return group;
  }

  /** Press / un-press a grouped button (a unique group un-presses the rest); update columns. */
  private _pressButton(btn: FormButton, pressed: boolean): void {
    const group = btn.group!;
    if (group.unique && pressed) for (const b of group.buttons) b.pressed = false;
    btn.pressed = pressed;
    this._refreshButtonGroup(group);
  }

  /** Press the buttons of ``group`` that hold their column's initial value; update columns. */
  private _resetButtonGroup(group: ButtonGroup): void {
    for (const b of group.buttons) {
      const col = b.spec.column!;
      const initial = this._buttonInitial.get(col);
      const delimiter = this._buttonDelimiter.get(col);
      b.pressed = initial != null && b.spec.value != null && (
        delimiter && typeof initial === 'string'
          ? initial.split(delimiter).includes(String(b.spec.value))
          : initial === b.spec.value);
    }
    if (group.unique) {
      // at most one pressed in a unique group: keep the first
      let seen = false;
      for (const b of group.buttons) {
        if (b.pressed && seen) b.pressed = false;
        seen ||= b.pressed;
      }
    }
    this._refreshButtonGroup(group);
  }

  /** Recompute the columns of ``group``'s buttons and redraw them. */
  private _refreshButtonGroup(group: ButtonGroup): void {
    const cols = new Set(group.buttons.map(b => b.spec.column!));
    for (const col of cols) this._formValues[col] = this._buttonColumnValue(col);
    for (const b of group.buttons) this._renderButton(b);
  }

  /** A button column's value: the pressed value(s) (joined when several), else its initial value. */
  private _buttonColumnValue(col: string): any {
    const pressed = (this._columnButtons.get(col) ?? []).filter(b => b.pressed);
    if (pressed.length === 0) return this._buttonInitial.get(col) ?? null;
    if (pressed.length === 1) return pressed[0].spec.value;
    return pressed.map(b => String(b.spec.value))
      .join(this._buttonDelimiter.get(col) ?? DEFAULT_DELIMITER);
  }

  /** Put a toggle in a state (or unset) and write its value. */
  private _setToggle(btn: FormButton, state: ToggleStart): void {
    btn.toggleIdx = state.index;
    if (btn.spec.column) this._formValues[btn.spec.column] = state.value;
    this._renderButton(btn);
  }

  /** Draw a button for its current state: face, colours, pressed ring / faded group. */
  private _renderButton(btn: FormButton): void {
    const { el, spec } = btn;
    let face: ButtonFace = spec.face;
    let pressed = false;
    let faded = false;
    let dimmed = false;
    if (spec.toggle) {
      face = btn.toggleIdx >= 0 ? spec.toggle[btn.toggleIdx].face
        : spec.hasOwnFace ? spec.face : spec.toggle[0].face;
      dimmed = btn.toggleIdx < 0 && !spec.hasOwnFace;
    } else if (btn.group) {
      face = btn.pressed ? spec.pressedFace : spec.face;
      pressed = btn.pressed && spec.highlight;
      faded = spec.highlight && !btn.pressed && btn.group.unique
        && btn.group.buttons.some(b => b.pressed);
    }
    const disabled = el.disabled;
    el.style.cssText = formButtonStyle(spec, face, { pressed, faded, dimmed });
    if (disabled) el.style.opacity = '0.4';
    const keyHint = spec.hotKey ? `(${spec.hotKey})` : '';
    el.title = [face.label, keyHint].filter(Boolean).join(' ');
    if (face.label) el.setAttribute('aria-label', face.label);
    else el.removeAttribute('aria-label');
    if (spec.hotKey) el.setAttribute('aria-keyshortcuts', spec.hotKey);
    el.setAttribute('aria-pressed', String(btn.pressed));
    el.textContent = '';
    if (face.image) this._setButtonImage(el, face);
    else el.textContent = face.icon;
    if (spec.hotKey && spec.showHotKey) {
      if (!face.image) el.style.cssText += BADGE_ICON_OFFSET;
      const badge = document.createElement('span');
      badge.dataset.hotKeyBadge = '';
      badge.textContent = spec.hotKey;
      badge.style.cssText = hotKeyBadgeStyle();
      el.appendChild(badge);
    }
  }

  /** Put ``face``'s image in the button: URLs as is, file paths read in the kernel (cached). */
  private _setButtonImage(el: HTMLButtonElement, face: ButtonFace): void {
    const img = document.createElement('img');
    img.alt = face.label;
    img.style.cssText = `max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;`;
    el.appendChild(img);
    const path = face.image;
    const known = isDirectImageSrc(path) ? path : this._imageSrcs.get(path);
    if (known) {
      img.src = known;
      return;
    }
    let url = this._imageUrls.get(path);
    if (!url) {
      url = this._kernel.exec(readImageDataUrl(path)).then(out => {
        const src = out.trim();
        this._imageSrcs.set(path, src);
        return src;
      });
      this._imageUrls.set(path, url);
    }
    url.then(src => { img.src = src; }).catch((e: unknown) => {
      this._imageUrls.delete(path);    // retry on the next build
      img.replaceWith(face.label || '?');
      this.statusChanged.emit({
        message: `❌ Button image ${path}: ${errorMessage(e)}`, error: true,
      });
    });
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
    btnContainer.dataset.formButtons = '';
    this._makeItem(btnContainer);

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
    this._dynFormEl.querySelector(':scope > [data-form-notice]')?.remove();
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

    const groups = new Set<ButtonGroup>();
    for (const buttons of this._columnButtons.values()) {
      for (const b of buttons) groups.add(b.group!);
    }
    for (const group of groups) this._resetButtonGroup(group);
    for (const btn of this._toggleBtns) this._setToggle(btn, toggleStart(btn.spec));

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
    this._restoreFocus();
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
   * Enable Submit when the form is valid (``_formValid``). A submit ``button`` that sets a
   * column is checked without that column, since clicking it fills it.
   */
  private _validateForm(): void {
    const valid = this._formValid();
    const enable = (btn: HTMLButtonElement, ok: boolean) => {
      btn.disabled = !ok;
      btn.style.opacity = ok ? '1' : '0.4';
    };
    this._submitBtns.forEach(btn => enable(btn, valid));
    for (const { el, spec } of this._submitFormBtns) {
      enable(el, spec.column ? this._formValid(spec.column) : valid);
    }
  }

  /**
   * True when every visible required input (other than ``ignoreCol``) has a value and, in
   * multibox mode, there is at least one box and every box's required fields are filled.
   */
  private _formValid(ignoreCol?: string): boolean {
    const filled = (val: any) =>
      Array.isArray(val) ? val.length > 0 : val !== null && val !== undefined && val !== '';
    const visible = (el: HTMLElement) => {
      if (!el.isConnected) return false; // stale refs from rebuilt multibox forms
      const section = el.closest('[data-form-section]') as HTMLElement | null;
      return !(section && section.style.display === 'none');
    };
    let allSatisfied = this._requiredInputs.every(
      ({ col, el }) => col === ignoreCol || !visible(el) || filled(this._formValues[col]));
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
        const cols = formCfg ? requiredColumns(flattenLayout(formCfg)) : [];
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
    return allSatisfied;
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
    d.dataset.formHeading = '';
    const span = document.createElement('span');
    span.textContent = text;
    span.dataset.formTitleText = '';         // shown vertically in a collapsed side form
    if (hasTemplatePlaceholders(text)) this._templateElements.push({ el: span, template: text });
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
    d.dataset.formHeading = '';
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
    this._keepFocusAcrossRebuild();
    this._dynFormEl.innerHTML = '';
    this._submitBtns = [];
    this._submitFormBtns = [];
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
    const reviewedButtons = this._dynFormEl.querySelector<HTMLElement>(':scope > [data-form-buttons]');
    if (reviewedButtons) this._makeItem(reviewedButtons);
    this._placeLeading();
    this._restoreFocus();

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
    // without duplicate entries a clip keeps exactly one entry: a re-submit replaces it
    const clipKey = activeRow[this._dataIndexCol];
    const replace = !this._duplicateEntries && this._outputIndexCol && clipKey != null
      ? { column: this._outputIndexCol, value: String(clipKey) } : undefined;
    try {
      await this._kernel.exec(writeOutputRows(this._outputPath, rows, replace));
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
    // a replaced entry isn't a new one: it doesn't add to the progress count
    if (!(replace && this._reviewedMap.has(clipId))) this._sessionCount++;
    if (!this._duplicateEntries) {
      this._reviewedMap.set(clipId, rows.map(r => ({ ...r })));
    }
    void this._refreshAccuracy().then(() => this._updateProgress());
    void this._kernel.exec(INVALIDATE_OUTPUT_CACHE).catch(() => {});
    this.setSyncBusy(false);
    if (this.element.contains(document.activeElement)) this._pendingFocus = 0;
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
      for (const { el } of this._submitFormBtns) el.disabled = true;
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
