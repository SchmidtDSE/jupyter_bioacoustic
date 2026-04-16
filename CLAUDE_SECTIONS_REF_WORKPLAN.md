# Plugin.ts Refactor — Section Extraction Workplan

## Context

The TypeScript widget `BioacousticWidget` in `jupyter_bioacoustic/src/plugin.ts` has grown to ~2635 lines with ~65 private methods and ~80 private fields. The user wants to split it into focused, single-responsibility modules.

**Working branch:** `ref/plugin-sections` (already checked out)

## What's Already Done

### Phase 1 — Styles extraction (COMPLETE, 2 commits on `ref/plugin-sections`):

1. **`styles: extract CSS helpers and colors into styles.ts`** — created `src/styles.ts`:
   - `COLORS` palette (Catppuccin Mocha) — named exports like `COLORS.bgBase`, `COLORS.textSubtle`, etc.
   - `DISPLAY_CHIP_COLORS` array (for info card chips)
   - Base CSS helpers: `inputStyle`, `selectStyle`, `labelStyle`, `btnStyle`, `barStyle`
   - Repeated-pattern helpers: `barBottomStyle`, `barTopBottomStyle`, `smallLabelStyle`, `formLabelStyle`, `sectionTitleStyle`, `monoTextStyle`, `mutedTextStyle`, `formRowStyle`, `dividerStyle`, `fullWidthDividerStyle`
   - `cssSize` utility
   - `injectGlobalStyles()` — injects a `<style>` tag with rules for pseudo-elements (`::placeholder` fix for filter input)

2. **`labextension: rebuild after styles.ts extraction`** — regenerated JS bundle from updated source.

All hardcoded hex values in `plugin.ts` now reference `COLORS.xxx`. Repeated inline style patterns replaced with helper calls. **Phase 1 is done and working.**

## What's Next — Phase 2: Pattern A Section Split

### Target architecture

Pattern A (plain component classes + Lumino signals for cross-talk). Each "section" is a plain TS class that:
- Owns an `element: HTMLElement` (its DOM subtree)
- Exposes public methods for state updates
- Emits `Signal` events for things the orchestrator needs to react to
- Does NOT import other sections directly — only the orchestrator wires them

The `BioacousticWidget` becomes a thin orchestrator: creates sections, connects their signals, and owns the kernel bridge.

### Target file structure

```
src/
├── index.ts                       # plugin entry (tiny)
├── plugin.ts                      # BioacousticWidget — orchestrator only (~400 lines target)
├── types.ts                       # Detection, FilterClause, FormConfig types
├── styles.ts                      # DONE
├── kernel.ts                      # _execPython helper
├── util.ts                        # _fmtTime and other small utilities
├── sections/
│   ├── Header.ts                  # title + status + filter bar + view mode toggle + refresh
│   ├── ClipTable.ts               # sortable/paginated table
│   ├── Pagination.ts              # page controls (may fold into ClipTable)
│   ├── InfoCard.ts                # selected row info card with prev/next
│   ├── Player.ts                  # spectrogram canvas + playback + annotation tools
│   └── FormPanel.ts               # dynamic form + reviewed view
└── form/
    ├── builder.ts                 # _buildForm, _buildFormSection, _buildSubmissionButtons
    ├── elements.ts                # _buildInputElement for textbox/select/checkbox/number/is_valid_select
    ├── items.ts                   # _loadSelectItems, _loadSelectItemsFromFile
    ├── annotation.ts              # annotation tool logic (_buildAnnotationElement + canvas mouse handlers)
    ├── progress.ts                # _appendProgressTracker, _updateProgress, _loadOutputFileProgress
    └── output.ts                  # _buildOutputCode + _onVerify wiring
```

The exact granularity is flexible. The minimum viable split is 3 sections: **ClipTable**, **Player**, **FormPanel**. `form/` submodules can be folded into `FormPanel.ts` if separating them isn't helping.

### Why Pattern A

- Each section is a plain class, testable in isolation
- Sections don't depend on each other — only the orchestrator does
- Signals decouple emitters from listeners (e.g. `rowSelected` fires once, multiple sections can subscribe)
- No nested Lumino `Widget` overhead

### Signal design (cross-section events)

Use `@lumino/signaling`. Example signals the orchestrator will connect:

- **Header**
  - `filterApplied: Signal<Header, string>` — user typed + pressed Apply
  - `viewModeChanged: Signal<Header, 'all' | 'pending' | 'reviewed'>`
  - `refreshRequested: Signal<Header, void>`

- **ClipTable**
  - `rowSelected: Signal<ClipTable, Detection>` — user clicked a row
  - `sortChanged: Signal<ClipTable, { col: string; asc: boolean }>`

- **InfoCard**
  - `prevRequested: Signal<InfoCard, void>`
  - `nextRequested: Signal<InfoCard, void>`

- **Player**
  - `spectrogramClicked: Signal<Player, { time: number; freq: number }>` — ONLY when annotation is active
  - `annotationChanged: Signal<Player, { field: string; value: number }>` — dragged a marker/box
  - `captureRequested: Signal<Player, void>`
  - `loadRequested: Signal<Player, void>` — user clicked Update

- **FormPanel**
  - `submitted: Signal<FormPanel, Record<string, any>>` — user clicked Verify/Submit
  - `prevRequested: Signal<FormPanel, void>` — from reviewed-view Prev
  - `nextRequested: Signal<FormPanel, void>` — from reviewed-view Next / Skip
  - `deleteReviewRequested: Signal<FormPanel, Detection>`

Orchestrator connects them. Example:
```typescript
this._table.rowSelected.connect((_, row) => {
  void this._player.loadRow(row);
  this._form.updateFromRow(row);
});

this._player.spectrogramClicked.connect((_, { time, freq }) => {
  this._form.updateAnnotation(time, freq);
});

this._form.submitted.connect((_, values) => {
  void this._writeOutput(values);
  this._table.markReviewed(values.detection_id);
});
```

## Step-by-Step Plan (ordered safest → riskiest)

Each step ends with **`pixi run build`** + **hard browser refresh** + **manual test** (open demo notebook, confirm widget loads, select rows, play audio, submit a review, etc.). Commit after each green step so we can roll back cleanly if needed.

### Step 0: Scaffolding and types ✅ COMPLETE

1. ✅ Created `src/types.ts` — `Detection`, `FilterClause`, `TableCol`, `AnnotConfig`, `SegmentInfo`. Plugin.ts now imports `Detection, FilterClause` from it.
2. ✅ Created `src/util.ts` — `fmtTime(s)` as a pure function + `escPy(s)` helper for Python string escaping. All 5 `this._fmtTime(...)` call sites updated.
3. ✅ Created `src/kernel.ts` — `KernelBridge` class. Plugin.ts field `_kernelBridge` replaces the old `_kernel()` method + `_execPython()`. All 12 call sites updated from `this._execPython(...)` to `this._kernelBridge.exec(...)`. The `_tracker` field was removed entirely (only used by the bridge now).

**Notes:**
- TypeScript compile check passes; actual `pixi run build` must be run on the user's Mac (pixi env not available in dev container).
- The `KernelBridge` captures the tracker at construction. `currentWidget` is still looked up at call time, so kernel-before-ready timing is preserved.

**Commit:** `refactor: extract types, util, kernel helper`

### Step 1: Extract `FormPanel` (biggest win, self-contained) ✅ COMPLETE

The form logic is the largest subsystem (~1000 lines of builder/state methods). It already has a clean boundary: takes a form config + current row, emits `submitted`.

1. Create `src/sections/FormPanel.ts` with class `FormPanel`:
   - Fields: all `_formConfig`, `_formValues`, `_isValidEl`, `_yesFormEl`, `_noFormEl`, `_submitBtns`, `_requiredInputs`, `_inputRefs`, `_sourceValueFields`, `_passValueDefs`, `_reviewedMap`, `_showingReviewedView`, `_sessionCount`, `_sessionValid`, `_fileCount`, `_fileValid`, `_progressEls`, `_annotConfig`, `_activeTool`, `_annotInputs`, `_isValidCol`, `_isValidYesVal`, `_isValidNoVal`
   - DOM refs: `_formSection`, `_dynFormEl`, `_formTitle` (if still present), etc.
   - Methods: `_buildForm`, `_buildFormSection`, `_buildInputElement`, `_loadSelectItems`, `_loadSelectItemsFromFile`, `_buildSubmissionButtons`, `_buildAnnotationElement`, `_validateForm`, `_updateFormFromRow`, `_registerPassValue`, `_registerFixedValue`, `_collectFormValues`, `_appendTitleEntry`, `_appendProgressTracker`, `_createProgressEl`, `_updateProgress`, `_loadOutputFileProgress`, `_loadReviewedState`, `_isRowReviewed`, `_showReviewedResult`, `_onDeleteReview`, `_setAnnotValue`
   - Public API:
     - `element: HTMLElement` — the form container
     - `setConfig(formConfig: any)` — called once during init
     - `setMode(predictionCol: string, duplicateEntries: boolean, outputPath: string)` — init mode info
     - `updateFromRow(row: Detection)` — called when a new row is selected
     - `handleSpectrogramClick(time: number)` — updates annotation time fields
     - `handleAnnotationDrag(field, value)` — updates annotation values during drag
     - `markReviewed(row: Detection, values: Record<string, any>)` — after submit
     - `getAnnotationConfig()` — for Player to know if annotation is active
   - Signals:
     - `submitted: Signal<FormPanel, Record<string, any>>`
     - `prevRequested: Signal<FormPanel, void>`
     - `nextRequested: Signal<FormPanel, void>`
     - `deleteReviewRequested: Signal<FormPanel, Detection>`
     - `annotationChanged: Signal<FormPanel, { field: string; value: number }>` — when form inputs update annotation
2. The FormPanel needs a reference to the `KernelBridge` (for loadSelectItemsFromFile, output writes, reviewed state loading). Inject via constructor.
3. Update `plugin.ts`: remove the moved fields/methods, replace with `this._form = new FormPanel(kernel)`, connect signals, call `this._form.setConfig(...)` in init, call `this._form.updateFromRow(row)` when selecting a row, etc.

**Status: Step 1a DONE — FormPanel.ts created and compiles (631 lines). Step 1b TODO — wire into plugin.ts.**

**Step 1a notes:**
- Created `src/sections/FormPanel.ts` (631 lines). It uses Lumino `Signal` for all cross-section communication.
- FormPanel owns: form config, form values, form DOM (dynFormEl), all input building, select item loading, submission buttons, annotation tool UI (config + inputs + tool dropdown), progress tracker, reviewed map + reviewed-view + delete, output file writing.
- Signals emitted: `submitted`, `prevRequested`, `nextRequested`, `reviewDeleted`, `annotationChanged`, `activeToolChanged`, `statusChanged`.
- Public API: `setContext({...})`, `setSelectionInfo(idx, len)`, `build()`, `updateFromRow(row)`, `setAnnotValue(field, val)`, `getAnnotConfig()`, `getActiveTool()`, `getFormValue(col)`, `getReviewedMap()`, `isReviewed(row)`, `loadOutputFileProgress()`, `loadReviewedState()`.
- `_setAnnotValueInternal(field, val, emit)` avoids circular updates: Player calls `setAnnotValue()` which passes `emit=false`; form input handler passes `emit=true`.
- `_currentRow` field tracks the row that `_applyRow` was last called with so `_onVerify` can reference it.
- Uses `escPy()` from `util.ts` instead of inline escape functions.

**Step 1b — what remains:**
1. Import FormPanel in plugin.ts
2. Remove all form-related fields and methods from BioacousticWidget:
   - Fields: `_formConfig`, `_formValues`, `_isValidEl`, `_isValidYesVal`, `_isValidNoVal`, `_isValidCol`, `_yesFormEl`, `_noFormEl`, `_submitBtns`, `_requiredInputs`, `_inputRefs`, `_sourceValueFields`, `_passValueDefs`, `_sessionCount`, `_sessionValid`, `_fileCount`, `_fileValid`, `_progressEls`, `_formSection`, `_dynFormEl`, `_reviewedMap`, `_showingReviewedView`, `_annotConfig`, `_activeTool`, `_annotInputs`
   - Methods: `_buildForm`, `_buildFormSection`, `_buildInputElement`, `_loadSelectItems`, `_loadSelectItemsFromFile`, `_buildSubmissionButtons`, `_buildAnnotationElement`, `_validateForm`, `_updateFormFromRow`, `_registerPassValue`, `_registerFixedValue`, `_collectFormValues`, `_appendTitleEntry`, `_appendProgressTracker`, `_createProgressEl`, `_updateProgress`, `_loadOutputFileProgress`, `_loadReviewedState`, `_isRowReviewed`, `_showReviewedResult`, `_onDeleteReview`, `_setAnnotValue`, `_onVerify`, `_buildOutputCode`
3. In `_buildUI()`:
   - Replace the form section DOM creation with `this._form = new FormPanel(this._kernelBridge); this.node.append(..., this._form.element);`
4. In `_init()`:
   - Replace `this._formConfig = ...` with `this._form.setContext({...})`
   - Replace `await this._buildForm()` with `await this._form.build()`
   - Replace `await this._loadOutputFileProgress()` with `await this._form.loadOutputFileProgress()`
   - Replace `await this._loadReviewedState()` with `await this._form.loadReviewedState()`
   - Remove the viewMode/reviewed init code and instead query `this._form.getReviewedMap().size`
5. In `_selectRow()`:
   - Replace `this._updateFormFromRow(row)` / `this._showReviewedResult(row)` / `this._showingReviewedView` logic with `this._form.setSelectionInfo(idx, len); this._form.updateFromRow(row);`
6. In canvas mouse handlers (`_onCanvasMouseDown`, `_onCanvasMouseMove`, etc.):
   - Replace `this._annotConfig` with `this._form.getAnnotConfig()`
   - Replace `this._activeTool` with `this._form.getActiveTool()`
   - Replace `this._setAnnotValue(field, val)` with `this._form.setAnnotValue(field, val)`
   - Replace `this._formValues[col]` with `this._form.getFormValue(col)`
7. In `_renderAnnotation()`:
   - Same substitutions as canvas handlers
8. Wire signals in constructor or init:
   - `this._form.submitted.connect(() => this._onSkip())`
   - `this._form.prevRequested.connect(() => this._onPrev())`
   - `this._form.nextRequested.connect(() => this._onSkip())`
   - `this._form.reviewDeleted.connect(() => this._renderTable())`
   - `this._form.annotationChanged.connect(() => this._renderFrame())`
   - `this._form.activeToolChanged.connect((_, tool) => { this._canvasContainer.style.cursor = tool ? 'crosshair' : 'default'; this._renderFrame(); })`
   - `this._form.statusChanged.connect((_, s) => this._setStatus(s.message, s.error))`
9. Remove `_isRowReviewed` usage in `_renderTable` — query `this._form.isReviewed(row)` instead
10. Remove `_signalTimeDisplay.textContent = ...` from the old `_updateFormFromRow` (now in FormPanel via signal) — actually FormPanel doesn't have access to `_signalTimeDisplay`. Either:
    - Emit a signal with the annotation status text, or
    - The orchestrator updates it based on `getAnnotConfig()` after `updateFromRow`

**Step 1b DONE — wired FormPanel into plugin.ts.**

**Step 1b notes:**
- Removed ~1070 lines from plugin.ts (2589 → 1522). FormPanel.ts is 1231 lines.
- Removed state fields: `_formConfig`, `_formValues`, `_isValidEl`, `_isValidYesVal`, `_isValidNoVal`, `_isValidCol`, `_yesFormEl`, `_noFormEl`, `_submitBtns`, `_requiredInputs`, `_inputRefs`, `_sourceValueFields`, `_passValueDefs`, `_sessionCount`, `_sessionValid`, `_fileCount`, `_fileValid`, `_progressEls`, `_formSection`, `_dynFormEl`, `_reviewedMap`, `_showingReviewedView`, `_annotConfig`, `_activeTool`, `_annotInputs`.
- Removed methods: `_buildForm`, `_buildFormSection`, `_buildInputElement`, `_loadSelectItems`, `_loadSelectItemsFromFile`, `_buildSubmissionButtons`, `_buildAnnotationElement`, `_validateForm`, `_updateFormFromRow`, `_registerPassValue`, `_registerFixedValue`, `_collectFormValues`, `_appendTitleEntry`, `_appendProgressTracker`, `_createProgressEl`, `_updateProgress`, `_loadOutputFileProgress`, `_loadReviewedState`, `_isRowReviewed`, `_showReviewedResult`, `_onDeleteReview`, `_setAnnotValue`, `_onVerify`, `_buildOutputCode`.
- Canvas handlers now call `this._form.getAnnotConfig()`, `this._form.getActiveTool()`, `this._form.setAnnotValue()`, `this._form.getFormValue()`.
- `_selectRow` now calls `this._form.setSelectionInfo(idx, len)` + `this._form.updateFromRow(row)`.
- Title mode (Reviewer vs Annotator) now set in `_init()` not in `_buildForm`.
- Signals wired in `_buildUI()`: submitted→onSkip, prevRequested→onPrev, nextRequested→onSkip, reviewDeleted→renderTable, annotationChanged→renderFrame, activeToolChanged→cursor+renderFrame, statusChanged→setStatus.
- View mode filter in `_applyFilterAndSort` now uses `this._form.getReviewedMap()`.
- `_signalTimeDisplay` text update moved to `_selectRow` after `updateFromRow`.

**Test needed:** build on Mac, refresh, verify full form workflow.

**Commit:** `refactor: wire FormPanel into plugin.ts (Step 1b)`

### Step 2: Extract `Player`

The player section owns the spectrogram canvas, playback controls, and annotation mouse handlers.

1. Create `src/sections/Player.ts` with class `Player`:
   - Fields: `_specBitmap`, `_segLoadStart`, `_segDuration`, `_detectionStart`, `_detectionEnd`, `_bufferSec`, `_playing`, `_rafId`, `_resizeObserver`, `_resizeTimer`, `_sampleRate`, `_freqMin`, `_freqMax`, `_annotConfig`, `_activeTool`, `_annotDrag`
   - DOM refs: `_spectTypeSelect`, `_bufferInput`, `_startInput`, `_endInput`, `_canvas`, `_canvasContainer`, `_playBtn`, `_timeDisplay`, `_signalTimeDisplay`, `_captureBtn`
   - Methods: `_loadAudio`, `_buildPythonCode`, `_renderFrame`, `_togglePlay`, `_canvasXY`, `_timeToX`, `_xToTime`, `_freqToY`, `_yToFreq`, `_onCanvasMouseDown`, `_onCanvasMouseMove`, `_onCanvasMouseUp`, `_updateAnnotCursor`, `_updateAnnotDisplay`, `_renderAnnotation`, `_buildCaptureFilename`, `_onCapture`, `_resolveAudioPath`
   - Public API:
     - `element: HTMLElement`
     - `setContext({ audioPath, audioCol, captureLabel, captureDir, defaultBuffer })`
     - `loadRow(row: Detection, row_info: {predictionCol, displayCols})` — triggers audio load
     - `setAnnotationConfig(annotConfig: any)` — called by FormPanel via orchestrator
     - `setAnnotationField(field: string, value: number)` — when form input changes
   - Signals:
     - `spectrogramClicked: Signal<Player, { time: number }>` — used when no annotation
     - `annotationChanged: Signal<Player, { field: string; value: number }>`
     - `statusChanged: Signal<Player, { message: string; error: boolean }>` — for header status line
2. Inject `KernelBridge` for Python calls.

**Test:** build, refresh. Playback, spectrogram rendering, annotation tools, capture button all work.

**Commit:** `refactor: extract Player section`

### Step 3: Extract `ClipTable`

Table rendering, filtering, sorting, pagination.

1. Create `src/sections/ClipTable.ts`:
   - Fields: `_rows`, `_filtered`, `_sortCol`, `_sortAsc`, `_page`, `_pageSize`, `_selectedIdx`, `_filterExpr`, `_viewMode`, `_tableCols`, `_reviewedMap` (shared with FormPanel via orchestrator updates)
   - DOM refs: `_thead`, `_tableBody`, `_pageInfo`, `_pageSizeSelect`, `_customPageSizeInput`, `_pageInput`
   - Methods: `_parseFilters`, `_applyFilter`, `_applyFilterAndSort`, `_renderTable`, `_selectRow`, `_ensurePageShowsSelected`, `_rebuildTableHeader`, `_configureFormForMode` (table cols portion only)
   - Public API:
     - `element: HTMLElement`
     - `setRows(rows: Detection[], tableCols: Array<{key, label}>)`
     - `setFilter(expr: string)`
     - `setViewMode(mode: 'all' | 'pending' | 'reviewed')`
     - `setReviewedMap(map: Map<number, Record<string, any>>)` — for styling
     - `refresh()` — re-filter and render
     - `selectIndex(idx: number)` — programmatic selection (e.g. after submit → next pending)
     - `selectNext()`, `selectPrev()`
   - Signals:
     - `rowSelected: Signal<ClipTable, Detection>`

**Test:** filtering, sorting, pagination, view mode toggle, row selection propagation.

**Commit:** `refactor: extract ClipTable section`

### Step 4: Extract `Header` and `InfoCard`

Small, mostly-presentational:

1. `src/sections/Header.ts` — title, status message, filter bar, view mode dropdown, refresh button. Emits `filterApplied`, `viewModeChanged`, `refreshRequested`. Exposes `setStatus(msg, error)`, `setTitle(title)`, `showViewMode(enabled)`.

2. `src/sections/InfoCard.ts` — renders the selected-row info card. Public: `render(row, predictionCol, displayCols)`. Emits `prevRequested`, `nextRequested`.

**Test:** filter entry, status messages, prev/next navigation all work.

**Commit:** `refactor: extract Header and InfoCard sections`

### Step 5: Plugin.ts cleanup

At this point `plugin.ts` should just contain:
- The `BioacousticWidget` class extending `Widget`
- `_buildUI()` — creates each section, appends elements in order
- `_init()` — reads kernel vars, wires section signals, triggers initial row selection
- The plugin registration block at the bottom

Target: under 500 lines. If it's still bigger, something didn't get fully extracted.

**Commit:** `refactor: slim plugin.ts to orchestration only`

### Step 6: Further decomposition (optional, only if helpful)

If `FormPanel.ts` is still 1500+ lines, split into:
- `form/builder.ts` — builds DOM from config
- `form/elements.ts` — per-element-type builders
- `form/items.ts` — select items loading
- `form/annotation.ts` — canvas interaction logic (might stay in Player.ts instead)
- `form/progress.ts` — progress tracker
- `form/output.ts` — output file writing and reviewed-state loading

## Important Gotchas

### Fork-based issues
- **Kernel access timing:** `KernelBridge` captures `tracker.currentWidget` at call time (not at construction). Currently `plugin.ts` does this via `_kernel()`. Preserve this — it's needed because the kernel may not exist when the widget first loads.
- **Signal cleanup:** Lumino `Signal` has `Signal.clearData(emitter)` — call on dispose in each section's equivalent-of-destructor. The widget's `onBeforeDetach` is a good place.

### State ownership
- `_reviewedMap` is read by BOTH ClipTable (for styling) and FormPanel (for showing reviewed view). Pattern:
  - FormPanel OWNS the map (it's loaded from the output file via kernel calls)
  - FormPanel emits `reviewedMapChanged: Signal<FormPanel, Map<...>>` whenever it updates (after submit, after delete)
  - Orchestrator forwards to `ClipTable.setReviewedMap(map)`
  - Alternatively, share a plain object reference — simpler but mutable state across sections. **Prefer signal-based approach** for cleanliness.

### Annotation config sharing
- The annotation config lives in FormPanel (parsed from the form config) but the Player uses it for mouse handling and rendering.
- Pattern: FormPanel emits `annotationConfigChanged` after `_buildForm` finishes. Orchestrator forwards to `Player.setAnnotationConfig(cfg)`.
- When the user drags on the canvas, Player emits `annotationChanged` → orchestrator → `FormPanel.setAnnotationField(...)` → updates the form inputs and `_formValues`.
- When the user types in the form input, FormPanel emits `annotationChanged` → orchestrator → `Player.setAnnotationField(...)` → triggers a canvas re-render.
- To avoid circular updates, sections should not emit if the value came from an external setter (use a flag or compare-before-set).

### Initial row selection
- On init: parse kernel vars → load form config → load reviewed state → apply filter → render table → select first row (auto-scroll to first pending if `!duplicateEntries`). This flow is currently in `_init`. Preserve the ordering.

### Output cache invalidation
- `api.py` registers the instance as `_BA_INSTANCE`. After each submit, plugin.ts runs a Python snippet: `_BA_INSTANCE._invalidate_output_cache()`. This MUST still happen after extraction. Likely home: FormPanel's `_onVerify`.

### Capture button rendering context
- The capture button renders a PNG of the current spectrogram via `canvas.toDataURL()`. That code must stay in Player since it owns the canvas.
- The save dialog and filename generation use `prediction_column`/`display_columns`. Player needs those passed in via `setContext(...)`.

## Testing Checklist (after each step)

Run through the demo notebooks (`simple-example.ipynb`, `geo-analysis-example.ipynb`):

- [ ] Widget loads without console errors
- [ ] Filter bar works (apply, clear)
- [ ] View mode toggle (pending/reviewed/all) + refresh button
- [ ] Table: sort by clicking column headers, pagination, row click selects
- [ ] Info card shows prediction value + display columns
- [ ] Prev/Next buttons in info card
- [ ] Player: buffer/start/end inputs, Update button, play/pause, type (plain/mel) switch
- [ ] Spectrogram click (when annotation tool active): draggable line / two lines / bounding box
- [ ] Annotation form inputs update when dragging on canvas, and vice versa
- [ ] Tool dropdown switches between time_select / start_end_time_select / bounding_box
- [ ] Form: textbox, select, checkbox, number, is_valid_select
- [ ] Form: no_form expands when is_valid = no (for review forms)
- [ ] Progress tracker updates after submit (session + total + accuracy)
- [ ] Submit writes to output file (check `ja.output()` returns updated data)
- [ ] Reviewed row shows faded green style in table
- [ ] Clicking reviewed row shows read-only view with Prev/Next/Delete buttons
- [ ] Delete review removes from file, restores form
- [ ] Capture button saves spectrogram PNG
- [ ] `ja.source` and `ja.output()` work correctly

## Build & commit after each step

```bash
pixi run build
# then in browser: hard refresh
# verify via the checklist above, then:
git add <files>
git commit -m "refactor: <step description>"
```

## If something goes wrong

Since each step is a standalone commit, you can roll back one step at a time:

```bash
git reset --hard HEAD~1
pixi run build
```

## When to stop

The goal is focused, testable modules — not a file-count contest. Stop when:
- `plugin.ts` is a thin orchestrator (~400-500 lines)
- Each section is independently understandable (no section exceeds ~800 lines)
- Cross-section communication is all through signals
- Adding a new form element type or annotation tool doesn't require touching 4 files

If a section is naturally small, don't split it further. If `FormPanel.ts` stays at 1200 lines and that's the logical boundary, that's fine.
