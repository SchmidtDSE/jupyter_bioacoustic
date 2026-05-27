import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class AppSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _titleInput: HTMLInputElement;
  private _textInput: HTMLInputElement;
  private _dispCols: string[] = [];
  private _dispColsSet = false; // Track if display_columns was explicitly set
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
  private _dispChipsArea: HTMLDivElement;
  private _dispPickerArea: HTMLDivElement;
  private _secrets: SecretsEditor;

  constructor() {
    super('Application', 'app', false, true);

    this._dispChipsArea = this._makeChipsArea();
    this._dispPickerArea = this._makePickerArea();
    const dispWrap = this._makeColumnGroupWrapper();
    dispWrap.append(this._makeSectionLabel('display_columns', 'display columns'), this._dispChipsArea, this._dispPickerArea);
    this._body.appendChild(dispWrap);

    this._titleInput = this._makeInput('[[common_name]]', '220px');
    this._titleInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('info_card_title', this._titleInput));

    this._textInput = this._makeInput('species: [[species]] | confidence: [[confidence]]', '220px');
    this._textInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('info_card_text', this._textInput));

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

  private _makeSectionLabel(fieldKey: string, displayText?: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
    const lbl = document.createElement('span');
    lbl.textContent = displayText || fieldKey;
    lbl.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    row.append(lbl);
    row.addEventListener('click', () => this.fieldFocused.emit(fieldKey));
    return row;
  }

  setCaptureDir(path: string): void {
    this._captureDirInput.value = path;
    this._emitChanged();
  }

  setColumnOptions(cols: string[]): void {
    this._availableCols = cols;
    this._rebuildPicker(this._dispPickerArea, this._dispCols);
  }

  private _rebuildPicker(area: HTMLDivElement, selected: string[]): void {
    area.innerHTML = '';
    if (this._availableCols.length === 0) {
      area.style.display = 'none';
      return;
    }
    area.style.display = 'flex';
    const hint = document.createElement('span');
    hint.textContent = 'Click or drag to add:';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;width:100%;`;
    area.appendChild(hint);

    for (const col of this._availableCols) {
      if (selected.includes(col)) continue;
      const chip = document.createElement('button');
      chip.textContent = `+ ${col}`;
      chip.draggable = true;
      chip.style.cssText =
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textSubtle};padding:2px 8px;font-size:11px;cursor:pointer;`;

      // Click functionality (existing)
      chip.addEventListener('click', () => {
        this._dispColsSet = true;
        selected.push(col);
        this._rebuildChips(this._dispChipsArea, selected);
        this._rebuildPicker(area, selected);
        this._emitChanged();
      });

      // Drag functionality (new)
      chip.addEventListener('dragstart', (e) => {
        chip.style.opacity = '0.4';
        e.dataTransfer!.effectAllowed = 'copyMove';
        e.dataTransfer!.setData('text/plain', col);
      });
      chip.addEventListener('dragend', () => {
        chip.style.opacity = '1';
      });

      area.appendChild(chip);
    }
  }

  private _rebuildChips(area: HTMLDivElement, selected: string[]): void {
    area.innerHTML = '';

    if (selected.length === 0) {
      const hint = document.createElement('span');
      hint.textContent = '(none)';
      hint.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-style:italic;`;
      area.appendChild(hint);

      // Add drop zone for empty state
      area.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
        area.style.background = COLORS.bgSurface1;
      });
      area.addEventListener('dragleave', () => {
        area.style.background = '';
      });
      area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.background = '';
        const col = e.dataTransfer!.getData('text/plain');
        if (col && !selected.includes(col)) {
          this._dispColsSet = true;
          selected.push(col);
          this._rebuildChips(area, selected);
          this._rebuildPicker(this._dispPickerArea, selected);
          this._emitChanged();
        }
      });
      return;
    }

    // Create container for chips with drop zones
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;';

    let draggedIdx = -1;

    // Helper to create drop zone
    const createDropZone = (insertIdx: number, isEnd = false) => {
      const zone = document.createElement('div');
      zone.style.cssText = isEnd
        ? 'flex:1;min-width:40px;min-height:20px;'
        : 'width:12px;min-height:20px;transition:all 0.2s;border-radius:4px;';

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        if (isEnd) {
          zone.style.background = COLORS.bgSurface1;
        } else {
          zone.style.width = '28px';
          zone.style.background = COLORS.textPrimary;
        }
      });

      zone.addEventListener('dragleave', () => {
        zone.style.background = '';
        if (!isEnd) zone.style.width = '12px';
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.style.background = '';
        if (!isEnd) zone.style.width = '12px';

        const isReorder = e.dataTransfer!.getData('reorder') === 'true';
        const newCol = e.dataTransfer!.getData('text/plain');

        if (isReorder && draggedIdx >= 0) {
          // Reordering existing chips
          if (draggedIdx !== insertIdx && draggedIdx !== insertIdx - 1) {
            this._dispColsSet = true;
            const [moved] = selected.splice(draggedIdx, 1);
            const targetIdx = draggedIdx < insertIdx ? insertIdx - 1 : insertIdx;
            selected.splice(targetIdx, 0, moved);
            this._dispCols = [...selected];
            this._rebuildChips(area, this._dispCols);
            this._emitChanged();
          }
        } else if (!isReorder && newCol && !selected.includes(newCol)) {
          this._dispColsSet = true;
          selected.splice(insertIdx, 0, newCol);
          this._dispCols = [...selected];
          this._rebuildChips(area, this._dispCols);
          this._rebuildPicker(this._dispPickerArea, this._dispCols);
          this._emitChanged();
        }
      });

      return zone;
    };

    for (let i = 0; i < selected.length; i++) {
      // Add drop zone before each chip
      if (i === 0) {
        container.appendChild(createDropZone(0));
      }

      const col = selected[i];
      const chip = document.createElement('span');
      chip.draggable = true;
      chip.dataset.index = String(i);
      chip.style.cssText =
        `display:inline-flex;align-items:center;gap:4px;margin:0 2px;` +
        `background:${COLORS.bgSurface1};border-radius:12px;` +
        `color:${COLORS.textPrimary};padding:2px 6px 2px 10px;font-size:11px;cursor:grab;`;

      chip.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedIdx = i;
        chip.style.opacity = '0.4';
        e.dataTransfer!.effectAllowed = 'copyMove';
        e.dataTransfer!.setData('reorder', 'true');
        e.dataTransfer!.setData('text/plain', col);
      });

      chip.addEventListener('dragend', () => {
        chip.style.opacity = '1';
      });

      // Prevent chip from being a drop target
      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      const name = document.createElement('span');
      name.textContent = col;

      const rm = document.createElement('button');
      rm.textContent = '\u2715';
      rm.style.cssText =
        `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
        `font-size:12px;padding:0 2px;line-height:1;`;
      rm.addEventListener('click', () => {
        const idx = selected.indexOf(col);
        if (idx >= 0) {
          this._dispColsSet = true;
          selected.splice(idx, 1);
          this._dispCols = [...selected];
          this._rebuildChips(area, this._dispCols);
          this._rebuildPicker(this._dispPickerArea, this._dispCols);
          this._emitChanged();
        }
      });

      chip.append(name, rm);
      container.appendChild(chip);

      // Add drop zone after each chip
      container.appendChild(createDropZone(i + 1, i === selected.length - 1));
    }

    area.appendChild(container);
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._dispColsSet) result.display_columns = this._dispCols.length > 0 ? [...this._dispCols] : [];

    result.info_card_title = this._titleInput.value.trim();
    result.info_card_text = this._textInput.value.trim();

    if (this._duplicateCb.checked) result.duplicate_entries = true;

    const bufStr = this._bufferInput.value.trim();
    if (bufStr !== '') {
      const buf = parseFloat(bufStr);
      if (!isNaN(buf) && buf !== 3) result.default_buffer = buf;
    }

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
    if ('display_columns' in data && Array.isArray(data.display_columns)) {
      this._dispCols = [...data.display_columns];
      this._dispColsSet = true;
      this._rebuildChips(this._dispChipsArea, this._dispCols);
      this._rebuildPicker(this._dispPickerArea, this._dispCols);
    }
    if (data.info_card_title) this._titleInput.value = data.info_card_title;
    if (data.info_card_text) this._textInput.value = data.info_card_text;
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
