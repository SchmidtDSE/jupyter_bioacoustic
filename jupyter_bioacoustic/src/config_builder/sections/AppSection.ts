import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';

export class AppSection extends CollapsibleSection {
  readonly browseRequested = new Signal<this, string>(this);

  private _infoCardTitleInput: HTMLInputElement;
  private _infoCardTextInput: HTMLInputElement;
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

  private _secrets: SecretsEditor;

  constructor() {
    super('Application', 'app', false, true);

    this._infoCardTitleInput = this._makeInput('', '220px');
    this._infoCardTitleInput.placeholder = '[[column_name]]';
    this._infoCardTitleInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('info_card_title', this._infoCardTitleInput));

    this._infoCardTextInput = this._makeInput('', '220px');
    this._infoCardTextInput.placeholder = 'label: [[col]] | label: [[col]]';
    this._infoCardTextInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('info_card_text', this._infoCardTextInput));


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

  setColumnOptions(_cols: string[]): void {
    // no-op: info_card_title/info_card_text are free-text templates
  }

  setCaptureDir(path: string): void {
    this._captureDirInput.value = path;
    this._emitChanged();
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    const title = this._infoCardTitleInput.value;
    if (title) result.info_card_title = title;

    const text = this._infoCardTextInput.value;
    if (text) result.info_card_text = text;

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
    if (data.info_card_title) this._infoCardTitleInput.value = data.info_card_title;
    if (data.info_card_text) this._infoCardTextInput.value = data.info_card_text;
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
