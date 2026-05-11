import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';

export class SecretsEditor {
  readonly element: HTMLDivElement;
  readonly changed = new Signal<this, void>(this);

  private _entries: { key: string; value: string }[] = [];
  private _listEl: HTMLDivElement;
  private _optOutCb: HTMLInputElement;
  private _optedOut = false;
  private _showOptOut: boolean;

  constructor(showOptOut = false) {
    this._showOptOut = showOptOut;
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
      `background:${COLORS.bgSurface0};border-radius:6px;`;

    const header = document.createElement('div');
    header.style.cssText = `display:flex;align-items:center;justify-content:space-between;`;

    const label = document.createElement('span');
    label.textContent = 'secrets';
    label.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-weight:600;`;
    header.appendChild(label);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText =
      `background:${COLORS.bgSurface1};border:none;border-radius:4px;` +
      `color:${COLORS.textPrimary};padding:2px 8px;font-size:11px;cursor:pointer;`;
    addBtn.addEventListener('click', () => {
      this._entries.push({ key: '', value: '' });
      this._rebuild();
      this.changed.emit(void 0);
    });
    header.appendChild(addBtn);
    this.element.appendChild(header);

    if (showOptOut) {
      const optRow = document.createElement('div');
      optRow.style.cssText = `display:flex;align-items:center;gap:6px;`;
      this._optOutCb = document.createElement('input');
      this._optOutCb.type = 'checkbox';
      this._optOutCb.style.cssText = `accent-color:${COLORS.blue};`;
      this._optOutCb.addEventListener('change', () => {
        this._optedOut = this._optOutCb.checked;
        this._listEl.style.display = this._optedOut ? 'none' : 'flex';
        this.changed.emit(void 0);
      });
      const optLabel = document.createElement('span');
      optLabel.textContent = 'opt out of global secrets';
      optLabel.style.cssText = `color:${COLORS.textSubtle};font-size:11px;`;
      optRow.append(this._optOutCb, optLabel);
      this.element.appendChild(optRow);
    } else {
      this._optOutCb = document.createElement('input');
    }

    const hint = document.createElement('span');
    hint.textContent = 'Each entry is {key, value}. Value: env:VAR, dialog, or literal.';
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;line-height:1.3;`;
    this.element.appendChild(hint);

    this._listEl = document.createElement('div');
    this._listEl.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    this.element.appendChild(this._listEl);
  }

  private _rebuild(): void {
    this._listEl.innerHTML = '';
    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i];
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:4px;`;

      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.placeholder = 'key (e.g. Authorization)';
      keyInput.value = entry.key;
      keyInput.style.cssText =
        `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:4px;color:${COLORS.textPrimary};padding:3px 6px;` +
        `font-size:11px;width:130px;box-sizing:border-box;`;
      keyInput.addEventListener('input', () => {
        this._entries[i].key = keyInput.value;
        this.changed.emit(void 0);
      });

      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.placeholder = 'value (env:VAR / dialog / literal)';
      valInput.value = entry.value;
      valInput.style.cssText =
        `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:4px;color:${COLORS.textPrimary};padding:3px 6px;` +
        `font-size:11px;width:170px;box-sizing:border-box;`;
      valInput.addEventListener('input', () => {
        this._entries[i].value = valInput.value;
        this.changed.emit(void 0);
      });

      const rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.style.cssText =
        `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
        `font-size:12px;padding:0 2px;line-height:1;`;
      rmBtn.addEventListener('click', () => {
        this._entries.splice(i, 1);
        this._rebuild();
        this.changed.emit(void 0);
      });

      row.append(keyInput, valInput, rmBtn);
      this._listEl.appendChild(row);
    }
  }

  getData(): any {
    if (this._showOptOut && this._optedOut) return false;
    const valid = this._entries.filter(e => e.key && e.value);
    if (valid.length === 0) return undefined;
    return valid.map(e => ({ key: e.key, value: e.value }));
  }

  setData(data: any): void {
    if (data === false) {
      this._optedOut = true;
      this._optOutCb.checked = true;
      this._listEl.style.display = 'none';
      this._entries = [];
    } else if (Array.isArray(data)) {
      this._optedOut = false;
      this._optOutCb.checked = false;
      this._listEl.style.display = 'flex';
      this._entries = data.map((e: any) => ({
        key: String(e.key || ''),
        value: String(e.value || ''),
      }));
    } else if (data && typeof data === 'object' && 'key' in data) {
      this._optedOut = false;
      this._optOutCb.checked = false;
      this._listEl.style.display = 'flex';
      this._entries = [{ key: String(data.key || ''), value: String(data.value || '') }];
    } else {
      this._entries = [];
    }
    this._rebuild();
  }
}
