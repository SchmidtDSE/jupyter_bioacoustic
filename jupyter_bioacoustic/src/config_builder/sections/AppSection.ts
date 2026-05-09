import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';

export class AppSection extends CollapsibleSection {
  private _identColInput: HTMLInputElement;
  private _displayColsInput: HTMLInputElement;
  private _dataColsInput: HTMLInputElement;
  private _duplicateCb: HTMLInputElement;
  private _bufferInput: HTMLInputElement;
  private _captureCb: HTMLInputElement;
  private _captureDirInput: HTMLInputElement;
  private _widthInput: HTMLInputElement;
  private _clipTableHeightInput: HTMLInputElement;
  private _playerHeightInput: HTMLInputElement;
  private _infoCardHeightInput: HTMLInputElement;
  private _formPanelHeightInput: HTMLInputElement;

  private _colPickerArea: HTMLDivElement;

  constructor() {
    super('Application', 'app');

    this._identColInput = this._makeInput('e.g. common_name', '200px');
    this._identColInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('ident_column', this._identColInput));

    this._displayColsInput = this._makeInput('col1, col2, ...', '250px');
    this._displayColsInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('display_columns', this._displayColsInput));

    this._dataColsInput = this._makeInput('col1, col2, ...', '250px');
    this._dataColsInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('data_columns', this._dataColsInput));

    this._colPickerArea = document.createElement('div');
    this._colPickerArea.style.cssText =
      `display:none;flex-wrap:wrap;gap:4px;padding:4px 0;`;
    this._body.appendChild(this._colPickerArea);

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

    this._captureDirInput = this._makeInput('captures/', '200px');
    this._captureDirInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('capture_dir', this._captureDirInput));

    this._widthInput = this._makeInput('100%', '100px');
    this._widthInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('width', this._widthInput));

    const heightRow = this._makeRow();
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

    const hLabels = ['clip_table', 'player', 'info_card', 'form_panel'];
    const hInputs = [this._clipTableHeightInput, this._playerHeightInput,
      this._infoCardHeightInput, this._formPanelHeightInput];

    for (let i = 0; i < hLabels.length; i++) {
      const mini = document.createElement('span');
      mini.style.cssText = `color:${COLORS.textMuted};font-size:10px;`;
      mini.textContent = hLabels[i];
      heightRow.append(mini, hInputs[i]);
    }
    this._body.appendChild(heightRow);
  }

  setColumnOptions(cols: string[]): void {
    this._colPickerArea.innerHTML = '';
    if (cols.length === 0) {
      this._colPickerArea.style.display = 'none';
      return;
    }
    this._colPickerArea.style.display = 'flex';

    const label = document.createElement('span');
    label.textContent = 'Available columns:';
    label.style.cssText = `color:${COLORS.textMuted};font-size:11px;width:100%;margin-bottom:2px;`;
    this._colPickerArea.appendChild(label);

    for (const col of cols) {
      const chip = document.createElement('button');
      chip.textContent = col;
      chip.style.cssText =
        `background:${COLORS.bgSurface1};border:none;border-radius:12px;` +
        `color:${COLORS.textPrimary};padding:2px 10px;font-size:11px;cursor:pointer;`;
      chip.addEventListener('click', () => {
        const current = this._dataColsInput.value;
        const cols = current ? current.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (!cols.includes(col)) {
          cols.push(col);
          this._dataColsInput.value = cols.join(', ');
          this._emitChanged();
        }
      });
      this._colPickerArea.appendChild(chip);
    }
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._identColInput.value) result.ident_column = this._identColInput.value;

    const dc = this._displayColsInput.value;
    if (dc) result.display_columns = dc.split(',').map(s => s.trim()).filter(Boolean);

    const dataCols = this._dataColsInput.value;
    if (dataCols) result.data_columns = dataCols.split(',').map(s => s.trim()).filter(Boolean);

    if (this._duplicateCb.checked) result.duplicate_entries = true;

    const buf = parseFloat(this._bufferInput.value);
    if (!isNaN(buf) && buf !== 3) result.default_buffer = buf;

    if (!this._captureCb.checked) result.capture = false;
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

    return result;
  }

  setData(data: Record<string, any>): void {
    if (data.ident_column) this._identColInput.value = data.ident_column;
    if (data.display_columns) this._displayColsInput.value = Array.isArray(data.display_columns) ? data.display_columns.join(', ') : '';
    if (data.data_columns) this._dataColsInput.value = Array.isArray(data.data_columns) ? data.data_columns.join(', ') : '';
    if (data.duplicate_entries) this._duplicateCb.checked = true;
    if (data.default_buffer !== undefined) this._bufferInput.value = String(data.default_buffer);
    if (data.capture === false) this._captureCb.checked = false;
    if (data.capture_dir) this._captureDirInput.value = data.capture_dir;
    if (data.width) this._widthInput.value = String(data.width);
    if (data.clip_table_height) this._clipTableHeightInput.value = String(data.clip_table_height);
    if (data.player_height) this._playerHeightInput.value = String(data.player_height);
    if (data.info_card_height) this._infoCardHeightInput.value = String(data.info_card_height);
    if (data.form_panel_height) this._formPanelHeightInput.value = String(data.form_panel_height);
  }
}
