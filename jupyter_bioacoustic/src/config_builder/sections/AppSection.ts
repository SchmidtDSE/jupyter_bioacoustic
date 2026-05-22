import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class AppSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _identColSelect: HTMLSelectElement;
  private _displayCols: string[] = [];
  private _duplicateCb: HTMLInputElement;
  private _bufferInput: HTMLInputElement;
  private _captureCb: HTMLInputElement;
  private _captureDirInput: HTMLInputElement;
  private _widthInput: HTMLInputElement;
  private _clipTableHeightInput: HTMLInputElement;
  private _playerHeightInput: HTMLInputElement;
  private _infoCardHeightInput: HTMLInputElement;
  private _formPanelHeightInput: HTMLInputElement;
  private _captureHeightInput: HTMLInputElement;

  private _availableCols: string[] = [];
  private _displayChipsArea: HTMLDivElement;
  private _displayPickerArea: HTMLDivElement;
  private _secrets: SecretsEditor;

  constructor() {
    super('Application', 'app', false, true);

    this._identColSelect = this._makeSelect(['(none)'], '(none)');
    this._identColSelect.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('info_card_ident_column', this._identColSelect));

    this._displayChipsArea = this._makeChipsArea();
    this._displayPickerArea = this._makePickerArea();
    const displayWrap = this._makeColumnGroupWrapper();
    displayWrap.append(this._makeSectionLabel('info_card_display_columns'), this._displayChipsArea, this._displayPickerArea);
    this._body.appendChild(displayWrap);


    const { row: dupRow, input: dupCb } = this._makeCheckbox('duplicate_entries');
    this._duplicateCb = dupCb;
    this._duplicateCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(dupRow);

    this._bufferInput = this._makeInput('3', '80px');
    this._bufferInput.type = 'number';
    this._bufferInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('default_buffer', this._bufferInput));

    const { row: capRow, input: capCb } = this._makeCheckbox('capture');
    this._captureCb = capCb;
    this._captureCb.checked = true;
    this._captureCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(capRow);

    const capDirRow = this._makeRow();
    capDirRow.addEventListener('focusin', () => this.fieldFocused.emit('capture_dir'));
    capDirRow.addEventListener('click', () => this.fieldFocused.emit('capture_dir'));
    capDirRow.appendChild(this._makeLabel('capture_dir'));
    this._captureDirInput = this._makeInput('captures/', '160px');
    this._captureDirInput.addEventListener('input', () => this._emitChanged());
    const capDirBrowse = this._makeButton('Browse');
    capDirBrowse.addEventListener('click', () => {
      this.browseRequested.emit(this._captureDirInput.value || '.');
    });
    capDirRow.append(this._captureDirInput, capDirBrowse);
    this._body.appendChild(capDirRow);

    this._widthInput = this._makeInput('100%', '100px');
    this._widthInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('width', this._widthInput));

    const heightRow = this._makeRow();
    heightRow.addEventListener('focusin', () => this.fieldFocused.emit('clip_table_height'));
    heightRow.addEventListener('click', () => this.fieldFocused.emit('clip_table_height'));
    heightRow.appendChild(this._makeLabel('heights'));

    this._clipTableHeightInput = this._makeInput('175', '60px');
    this._clipTableHeightInput.type = 'number';
    this._playerHeightInput = this._makeInput('260', '60px');
    this._playerHeightInput.type = 'number';
    this._infoCardHeightInput = this._makeInput('34', '60px');
    this._infoCardHeightInput.type = 'number';
    this._formPanelHeightInput = this._makeInput('140', '60px');
    this._formPanelHeightInput.type = 'number';

    for (const inp of [this._clipTableHeightInput, this._playerHeightInput,
      this._infoCardHeightInput, this._formPanelHeightInput]) {
      inp.addEventListener('input', () => this._emitChanged());
    }

    this._captureHeightInput = this._makeInput('', '60px');
    this._captureHeightInput.type = 'number';
    this._captureHeightInput.addEventListener('input', () => this._emitChanged());

    const hLabels = ['clip_table', 'player', 'info_card', 'form_panel', 'capture'];
    const hInputs = [this._clipTableHeightInput, this._playerHeightInput,
      this._infoCardHeightInput, this._formPanelHeightInput, this._captureHeightInput];

    for (let i = 0; i < hLabels.length; i++) {
      const mini = document.createElement('span');
      mini.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
      mini.textContent = hLabels[i];
      heightRow.append(mini, hInputs[i]);
    }
    this._body.appendChild(heightRow);

    this._secrets = new SecretsEditor(false);
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  private _makeChipsArea(): HTMLDivElement {
    const area = document.createElement('div');
    area.style.cssText = `display:flex;flex-wrap:wrap;gap:4px;min-height:22px;padding:2px 0;`;
    return area;
  }

  private _makePickerArea(): HTMLDivElement {
    const area = document.createElement('div');
    area.style.cssText =
      `display:none;flex-wrap:wrap;gap:4px;padding:4px 0;` +
      `border-top:1px solid ${COLORS.bgSurface0};margin-top:2px;`;
    return area;
  }

  private _makeColumnGroupWrapper(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
      `background:${COLORS.bgSurface0};border-radius:6px;`;
    return wrap;
  }

  private _makeSectionLabel(text: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
    const lbl = document.createElement('span');
    lbl.textContent = text;
    lbl.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    row.append(lbl);
    row.addEventListener('click', () => this.fieldFocused.emit(text));
    return row;
  }

  setCaptureDir(path: string): void {
    this._captureDirInput.value = path;
    this._emitChanged();
  }

  setColumnOptions(cols: string[]): void {
    this._availableCols = cols;
    this._rebuildIdentSelect();
    this._rebuildPicker(this._displayPickerArea, this._displayCols, 'display');
  }

  private _rebuildIdentSelect(): void {
    const current = this._identColSelect.value;
    this._identColSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = ''; none.textContent = '(none)';
    this._identColSelect.appendChild(none);
    for (const col of this._availableCols) {
      const o = document.createElement('option');
      o.value = col; o.textContent = col;
      this._identColSelect.appendChild(o);
    }
    if (this._availableCols.includes(current)) this._identColSelect.value = current;
  }

  private _rebuildPicker(area: HTMLDivElement, selected: string[], which: string): void {
    area.innerHTML = '';
    if (this._availableCols.length === 0) {
      area.style.display = 'none';
      return;
    }
    area.style.display = 'flex';
    const hint = document.createElement('span');
    hint.textContent = 'Click to add:';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;width:100%;`;
    area.appendChild(hint);

    for (const col of this._availableCols) {
      if (selected.includes(col)) continue;
      const chip = document.createElement('button');
      chip.textContent = `+ ${col}`;
      chip.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;
      chip.addEventListener('click', () => {
        selected.push(col);
        this._rebuildChips(this._displayChipsArea, selected, which);
        this._rebuildPicker(area, selected, which);
        this._emitChanged();
      });
      area.appendChild(chip);
    }
  }

  private _rebuildChips(area: HTMLDivElement, selected: string[], which: string): void {
    area.innerHTML = '';
    if (selected.length === 0) {
      const hint = document.createElement('span');
      hint.textContent = '(none)';
      hint.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-style:italic;`;
      area.appendChild(hint);
      return;
    }
    let dragIdx = -1;
    for (let i = 0; i < selected.length; i++) {
      const col = selected[i];
      const chip = document.createElement('span');
      chip.draggable = true;
      chip.style.cssText =
        `display:inline-flex;align-items:center;gap:4px;` +
        `background:${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;cursor:grab;`;

      chip.addEventListener('dragstart', (e) => {
        dragIdx = i;
        chip.style.opacity = '0.4';
        e.dataTransfer!.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => { chip.style.opacity = '1'; });
      chip.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; });
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragIdx < 0 || dragIdx === i) return;
        const [moved] = selected.splice(dragIdx, 1);
        selected.splice(i, 0, moved);
        this._rebuildChips(area, selected, which);
        this._emitChanged();
      });

      const name = document.createElement('span');
      name.textContent = col;

      const rm = document.createElement('button');
      rm.textContent = '✕';
      rm.style.cssText =
        `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
        `font-size:12px;padding:0 2px;line-height:1;`;
      rm.addEventListener('click', () => {
        const idx = selected.indexOf(col);
        if (idx >= 0) selected.splice(idx, 1);
        this._rebuildChips(area, selected, which);
        this._rebuildPicker(this._displayPickerArea, selected, which);
        this._emitChanged();
      });

      chip.append(name, rm);
      area.appendChild(chip);
    }
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    const ident = this._identColSelect.value;
    if (ident) result.info_card_ident_column = ident;

    if (this._displayCols.length > 0) result.info_card_display_columns = [...this._displayCols];

    if (this._duplicateCb.checked) result.duplicate_entries = true;

    const buf = parseFloat(this._bufferInput.value);
    if (!isNaN(buf) && buf !== 3) result.default_buffer = buf;

    if (this._captureCb.checked) result.capture = true;
    else result.capture = false;
    if (this._captureDirInput.value) result.capture_dir = this._captureDirInput.value;

    const w = this._widthInput.value;
    if (w && w !== '100%') result.width = w;

    const cth = parseInt(this._clipTableHeightInput.value);
    if (!isNaN(cth) && cth !== 175) result.clip_table_height = cth;
    const ph = parseInt(this._playerHeightInput.value);
    if (!isNaN(ph) && ph !== 260) result.player_height = ph;
    const ich = parseInt(this._infoCardHeightInput.value);
    if (!isNaN(ich) && ich !== 34) result.info_card_height = ich;
    const fph = parseInt(this._formPanelHeightInput.value);
    if (!isNaN(fph) && fph !== 140) result.form_panel_height = fph;
    const ch = parseInt(this._captureHeightInput.value);
    if (!isNaN(ch) && ch > 0) result.capture_height = ch;

    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;

    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.info_card_ident_column) this._identColSelect.value = data.info_card_ident_column;
    if (data.info_card_display_columns && Array.isArray(data.info_card_display_columns)) {
      this._displayCols = [...data.info_card_display_columns];
      this._rebuildChips(this._displayChipsArea, this._displayCols, 'display');
      this._rebuildPicker(this._displayPickerArea, this._displayCols, 'display');
    }
    if (data.duplicate_entries) this._duplicateCb.checked = true;
    if (data.default_buffer !== undefined) this._bufferInput.value = String(data.default_buffer);
    if (data.capture === false) this._captureCb.checked = false;
    if (data.capture_dir) this._captureDirInput.value = data.capture_dir;
    if (data.width) this._widthInput.value = String(data.width);
    if (data.clip_table_height) this._clipTableHeightInput.value = String(data.clip_table_height);
    if (data.player_height) this._playerHeightInput.value = String(data.player_height);
    if (data.info_card_height) this._infoCardHeightInput.value = String(data.info_card_height);
    if (data.form_panel_height) this._formPanelHeightInput.value = String(data.form_panel_height);
    if (data.capture_height) this._captureHeightInput.value = String(data.capture_height);
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }
}
