/**
 * Editor for a section's ``secrets:`` list ({key, value} pairs such as an Authorization
 * header), with an optional "opt out of global" checkbox that writes ``secrets: false``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { SECRETS_HINT } from '../text';


//
// Types
//
/** One secret: ``value`` is ``env:VAR``, ``dialog`` or a literal. */
export interface SecretEntry {
  key: string;
  value: string;
}


//
// Public
//
export class SecretsEditor {
  readonly element: HTMLDivElement;
  /** An entry or the opt-out changed. */
  readonly changed = new Signal<this, void>(this);
  /** The editor was clicked / focused (highlights ``secrets`` in the docs). */
  readonly focused = new Signal<this, void>(this);

  private _entries: SecretEntry[] = [];
  private _listEl: HTMLDivElement;
  private _optOutCb: HTMLInputElement;
  private _optedOut = false;
  private _showOptOut: boolean;

  /** @param showOptOut - Show the "opt out of global" checkbox (section-level secrets). */
  constructor(showOptOut = false) {
    this._showOptOut = showOptOut;
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;gap:4px;padding:6px 8px;` +
      `background:${COLORS.bgSurface0};border-radius:6px;`;

    const header = document.createElement('div');
    header.style.cssText = `display:flex;align-items:center;gap:8px;`;

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
      this.focused.emit(void 0);
    });
    header.appendChild(addBtn);

    if (showOptOut) {
      this._optOutCb = document.createElement('input');
      this._optOutCb.type = 'checkbox';
      this._optOutCb.style.cssText = `accent-color:${COLORS.blue};`;
      this._optOutCb.addEventListener('change', () => {
        this._optedOut = this._optOutCb.checked;
        this._listEl.style.display = this._optedOut ? 'none' : 'flex';
        this.changed.emit(void 0);
      });
      const optLabel = document.createElement('label');
      optLabel.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto;`;
      const optText = document.createElement('span');
      optText.textContent = 'opt out of global';
      optText.style.cssText = `color:${COLORS.textSubtle};font-size:11px;`;
      optLabel.append(this._optOutCb, optText);
      header.appendChild(optLabel);
    } else {
      this._optOutCb = document.createElement('input');
    }

    this.element.addEventListener('focusin', () => this.focused.emit(void 0));
    this.element.addEventListener('click', () => this.focused.emit(void 0));
    this.element.appendChild(header);

    const hint = document.createElement('span');
    hint.textContent = SECRETS_HINT;
    hint.style.cssText = `color:${COLORS.textSubtle};font-size:11px;line-height:1.3;`;
    this.element.appendChild(hint);

    this._listEl = document.createElement('div');
    this._listEl.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    this.element.appendChild(this._listEl);
  }

  /**
   * The ``secrets`` value to write:
   * - ``false`` — opted out of the global secrets (only with the opt-out checkbox);
   * - ``undefined`` — no complete entries, so omit the key;
   * - otherwise the entries that have both a key and a value.
   */
  getData(): SecretEntry[] | false | undefined {
    if (this._showOptOut && this._optedOut) return false;
    const valid = this._entries.filter(e => e.key && e.value);
    if (valid.length === 0) return undefined;
    return valid.map(e => ({ key: e.key, value: e.value }));
  }

  /** Back to the empty, not-opted-out state. */
  reset(): void {
    this._optedOut = false;
    if (this._optOutCb) this._optOutCb.checked = false;
    this._listEl.style.display = 'flex';
    this._entries = [];
    this._rebuild();
  }

  /** Load ``secrets`` YAML: ``false`` (opted out), a list of entries, or a single entry. */
  setData(data: unknown): void {
    if (data === false) {
      this._optedOut = true;
      this._optOutCb.checked = true;
      this._listEl.style.display = 'none';
      this._entries = [];
    } else if (Array.isArray(data)) {
      this._optedOut = false;
      this._optOutCb.checked = false;
      this._listEl.style.display = 'flex';
      this._entries = data.map((e: Partial<SecretEntry>) => ({
        key: String(e.key || ''),
        value: String(e.value || ''),
      }));
    } else if (data && typeof data === 'object' && 'key' in data) {
      const entry = data as Partial<SecretEntry>;
      this._optedOut = false;
      this._optOutCb.checked = false;
      this._listEl.style.display = 'flex';
      this._entries = [{ key: String(entry.key || ''), value: String(entry.value || '') }];
    } else {
      this._entries = [];
    }
    this._rebuild();
  }

  private _rebuild(): void {
    this._listEl.innerHTML = '';
    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i];
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:4px;`;

      const keyInput = this._makeEntryInput(
        'key (e.g. Authorization)', entry.key, '130px', v => { this._entries[i].key = v; });
      const valInput = this._makeEntryInput(
        'value (env:VAR / dialog / literal)', entry.value, '170px',
        v => { this._entries[i].value = v; });

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

  private _makeEntryInput(
    placeholder: string, value: string, width: string, onInput: (value: string) => void,
  ): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value;
    input.style.cssText =
      `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};` +
      `border-radius:4px;color:${COLORS.textPrimary};padding:3px 6px;` +
      `font-size:11px;width:${width};box-sizing:border-box;`;
    input.addEventListener('input', () => {
      onInput(input.value);
      this.changed.emit(void 0);
    });
    return input;
  }
}
