# CONFIG_FORMS Implementation Plan

## Summary of changes

Two files change: `api.py` and `plugin.ts`. No other files need touching.

---

## 1. `api.py` changes

### 1a. New parameter `form_config`

Add to `__init__` signature (alongside the existing `config` parameter):

```python
form_config=_UNSET,   # dict | str | None
```

### 1b. `resolve()` form_config, handle string path

In `__init__`, after the existing `resolve()` calls:

```python
raw_form = resolve(form_config, 'form_config', None)
if isinstance(raw_form, str):
    raw_form = _load_config(raw_form)   # reuse existing YAML/JSON loader
self._form_config = raw_form   # dict or None
```

### 1c. Default form config generation

Add two module-level helpers (after `_load_config`):

```python
def _default_verification_form(category_path: str) -> dict:
    # Returns the YAML-equivalent dict for the default review form.
    # Includes is_valid_form with is_valid_select + notes textbox + time_select,
    # no_form with category select (if category_path set) + confidence select,
    # submission_buttons with Skip/Verify.

def _default_annotation_form(category_path: str) -> dict:
    # Returns the YAML-equivalent dict for the default annotation form.
    # Includes annotate_form with category select + confidence + notes + time_select,
    # submission_buttons with Skip/Submit.
```

### 1d. Pass form config to kernel in `open()`

```python
fc = self._form_config
if fc is None:
    if self._prediction_column:
        fc = _default_verification_form(self._category_path)
    else:
        fc = _default_annotation_form(self._category_path)
ip.user_ns['_BA_FORM_CONFIG'] = json.dumps(fc)
```

---

## 2. `plugin.ts` changes

### 2a. Remove these class-level DOM refs

```
_isValidLbl, _isValidSelect
_notesInput
_signalStartLbl, _signalStartInput
_secondaryForm
_verifiedNameLbl, _verifiedNameSelect
_verificationConfLbl, _verificationConfSelect
_verifyBtn
```

Keep: `_formTitle`, `_titleEl`, `_signalTimeDisplay`.

### 2b. Add new class-level state

```typescript
private _formConfig: any = null;
private _formValues: Record<string, any> = {};     // column → current value
private _timeSelectInputs: Map<string, HTMLInputElement> = new Map(); // col → input
private _isValidEl: HTMLSelectElement | null = null;
private _isValidYesVal: any = 'yes';
private _isValidNoVal: any = 'no';
private _yesFormEl: HTMLDivElement | null = null;
private _noFormEl: HTMLDivElement | null = null;
private _dynFormEl!: HTMLDivElement;               // inner dynamic container
private _submitBtns: HTMLButtonElement[] = [];
private _requiredInputs: Array<{ col: string; el: HTMLElement }> = [];
```

### 2c. `_buildUI()` — replace form section

Replace the entire "// ── Verification form" block (formSection → formBtns) with:

```typescript
const formSection = document.createElement('div');
formSection.style.cssText =
  `flex-shrink:0;min-height:140px;padding:10px 14px 12px;background:#181825;` +
  `border-top:1px solid #313244;display:flex;flex-direction:column;gap:10px;`;

this._formTitle = document.createElement('div');
this._formTitle.style.cssText =
  `font-size:11px;font-weight:700;letter-spacing:1.2px;color:#6c7086;`;

this._dynFormEl = document.createElement('div');
this._dynFormEl.style.cssText = `display:flex;flex-direction:column;gap:10px;`;

formSection.append(this._formTitle, this._dynFormEl);
```

Also remove `_signalTimeDisplay` initialization from the playBar section and keep it as-is (it stays in the play bar, still needed).

### 2d. `_init()` — read `_BA_FORM_CONFIG`

Add `'form_config': _BA_FORM_CONFIG,` to the Python snippet.
After parsing cfg:
```typescript
this._formConfig = JSON.parse(cfg.form_config);
```
Then call `await this._buildForm()` after `_configureFormForMode()`.

### 2e. New method: `async _buildForm()`

High-level orchestration:

```
1. Clear _dynFormEl.innerHTML, reset all form state maps
2. If 'is_valid_form' in config → review mode → set titles
   Else 'annotate_form' in config → annotation mode → set titles
3. Build each section in order:
     is_valid_form → div (always visible)
     yes_form      → div (display:none initially)
     no_form       → div (display:none initially)
   OR annotate_form → div (always visible)
4. Build submission_buttons
5. Wire up is_valid_select → show/hide yes_form/no_form
6. Call _validateForm()
```

### 2f. New method: `_buildFormSection(elements, container)`

Iterate elements list. For each `{ type: config }` entry:
- `break` → `<br>`
- `line` → styled divider div
- `text` → styled div with textContent
- anything else → `await this._buildInputElement(type, config, container)`

### 2g. New method: `async _buildInputElement(type, config, container)`

Creates label + input, registers in state, appends to container.

**For each type:**

| type | DOM | special |
|---|---|---|
| `textbox` | `<textarea>` or `<input type=text>` based on `multiline` | — |
| `select` | `<select>` | calls `_loadSelectItems()` to populate |
| `checkbox` | `<input type=checkbox>` | yes_value/no_value written to formValues |
| `number` | `<input type=number>` with min/max/step/placeholder | — |
| `is_valid_select` | `<select>` with yes/no options + empty | sets `_isValidEl`, `_isValidYesVal`, `_isValidNoVal`; always required |
| `time_select` | `<input type=number>` | registers in `_timeSelectInputs`; init from `source_value` or `init_value` |

All inputs: on `change`/`input` → update `_formValues[col]` → call `_validateForm()`.

If `source_value` is set: register column for `_updateFormFromRow()`.

### 2h. New method: `async _loadSelectItems(itemsConfig)`

Returns `Array<[value: string, label: string]>`.

```
if Array   → map each item: string → [s,s]; {k:v} → [k, v]
if string  → treat as file path → _loadSelectItemsFromFile(path)
if object:
  'max' key → generate integer range
  'path' key → _loadSelectItemsFromFile(path, value?, label?)
```

### 2i. New method: `async _loadSelectItemsFromFile(path, valueCol?, labelCol?)`

Executes Python snippet in kernel. Supports: `.csv`, `.parquet`, `.jsonl`/`.ndjson`, `.yaml`/`.yml`, plain text.
Returns `Array<[string, string]>`.

Python snippet reads the file, extracts value+label columns, returns JSON list of `[[v,l], ...]`.

### 2j. New method: `_buildSubmissionButtons(cfg)`

Iterates the submission_buttons mapping.
- `line`/`break`/`text` → static elements (as in section builder)
- `previous` → button, click calls `_onPrev()`
- `next` → button, click calls `_onSkip()`
- `submit` → button, click calls `_onVerify()`, pushed to `_submitBtns`

Button config: `true` → all defaults. Object: `label` overrides text, `icon: false` removes arrow/checkmark.

### 2k. New method: `_updateFormFromRow(row)`

Called from `_selectRow()`. For every registered field:
- If `source_value` is set and `row[source_value]` exists → set `_formValues[col]` and update DOM input
- If `time_select` and `init_value` is a string column name → set from `row[init_value]`
- If `time_select` and `init_value` is a number → set that literal value
Reset is_valid subforms to hidden, reset _isValidEl to empty.
Call `_validateForm()`.

### 2l. New method: `_validateForm()`

Checks all entries in `_requiredInputs`:
- An input is "active required" if it is required AND its parent container is visible
  (check `el.closest('[data-form-section]')?.style.display !== 'none'` or similar)
- If any active required input has empty/null value → disable all `_submitBtns`
- Otherwise → enable all `_submitBtns`

### 2m. New method: `_collectFormValues()`

Returns `Record<string, any>`:
```typescript
{ detection_id: row.id, ...this._formValues }
```
Fields in hidden subforms (yes_form/no_form) get their current value included — matching existing behaviour (empty string when not shown).

### 2n. Modify `_onVerify()`

Replace all the hardcoded field reads with:
```typescript
const values = this._collectFormValues();
```
Then use `_buildOutputCode()` as-is (cols = Object.keys(values), rowDict built from values).

### 2o. Modify `_onCanvasClick()`

Replace the hardcoded `_signalStartInput` update with:
```typescript
for (const [col, input] of this._timeSelectInputs) {
  input.value = signalTime.toFixed(2);
  this._formValues[col] = signalTime;
}
```
Keep the `_signalTimeDisplay` update as-is.

### 2p. Modify `_resetForm(row?)`

```typescript
this._formValues = {};
this._timeSelectInputs.clear();
// Reset all inputs to default (walk _dynFormEl and clear)
// OR: call _buildForm() again (simpler but slower)
// Recommended: call _updateFormFromRow(row) which resets to source_value/init defaults
```

The simplest reliable approach: call `_buildForm()` on row change if performance is acceptable. Otherwise maintain a `_inputRefs` map of col → HTMLInputElement for targeted reset.

**Decision: use `_inputRefs` map** (Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) maintained during `_buildInputElement`. `_resetForm(row)` iterates it, sets each to default/source_value.

### 2q. Modify `_configureFormForMode()`

Remove all form-related code. Keep only the table column logic (the part that sets `_tableCols` and calls `_rebuildTableHeader()`). The title/mode changes are now handled inside `_buildForm()`.

### 2r. Delete these methods entirely

- `_onIsValidChange()` → replaced by inline handler in `_buildInputElement` for is_valid_select
- `_populateCategoryDropdown()` → replaced by `_loadSelectItemsFromFile`

---

## 3. Commit sequence

1. `api.py` — form_config param, default helpers, kernel var
2. `plugin.ts` — full form renderer replacement
3. README update — new `form_config` parameter, link to CONFIG_FORMS.md

---

## 4. Risk notes

- `_loadSelectItemsFromFile` adds async kernel calls during form build — test with slow kernels
- `_buildForm()` is called after each row selection if using rebuild approach — consider caching
- The `_collectFormValues()` → `_buildOutputCode()` pipeline must handle both string and numeric values without breaking the Python dict literal syntax (escape strings, pass numbers unquoted)
- Required field validation must correctly identify hidden subform fields as non-blocking
