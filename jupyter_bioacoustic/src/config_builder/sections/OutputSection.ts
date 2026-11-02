/**
 * Output section: where submissions are written (``output:`` — path, index column, sync
 * uri / button, recursive scan, secrets).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { makeButton, makeInput } from '../dom';
import type { FileFlags, SectionRouting } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { SecretsEditor } from './SecretsEditor';


//
// Public
//
export class OutputSection extends CollapsibleSection {
  /** Browse clicked (payload: the current path, or ``.``). */
  readonly browseRequested = new Signal<this, string>(this);

  private _pathInput: HTMLInputElement;
  private _indexColInput: HTMLInputElement;
  private _uriInput: HTMLInputElement;
  private _syncBtnCb: HTMLInputElement;
  private _syncLabelInput: HTMLInputElement;
  private _recursiveCb: HTMLInputElement;
  private _browseBtn: HTMLButtonElement;
  private _secrets: SecretsEditor;

  constructor() {
    super('Output', 'output', false, true, ['split', 'project', 'config']);

    this._indexColInput = makeInput('e.g. id', '150px');
    this._indexColInput.addEventListener('input', () => this._emitChanged());
    this._body.appendChild(this._makeFieldRow('index_column', this._indexColInput, true));

    const pathRow = this._makeFocusRow('output path', 'path');
    this._pathInput = makeInput('outputs/my_project.csv', '200px');
    this._pathInput.addEventListener('input', () => this._emitChanged());
    this._browseBtn = makeButton('Browse');
    this._browseBtn.addEventListener('click', () => {
      this.browseRequested.emit(this._pathInput.value || '.');
    });
    pathRow.append(this._pathInput, this._browseBtn);
    this._body.appendChild(pathRow);

    this._uriInput = makeInput('s3://bucket/reviews.csv', '250px');
    this._uriInput.addEventListener('input', () => {
      this._autoCheckSync();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('sync_uri', this._uriInput));

    const { row: syncRow, input: syncCb } = this._makeCheckbox('sync_button');
    this._syncBtnCb = syncCb;
    this._syncBtnCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(syncRow);

    this._syncLabelInput = makeInput('Sync', '150px');
    this._syncLabelInput.addEventListener('input', () => {
      this._autoCheckSync();
      this._emitChanged();
    });
    this._body.appendChild(this._makeFieldRow('sync_label', this._syncLabelInput));

    const { row: recRow, input: recCb } = this._makeCheckbox('recursive');
    this._recursiveCb = recCb;
    this._recursiveCb.addEventListener('change', () => this._emitChanged());
    this._body.appendChild(recRow);

    this._secrets = new SecretsEditor(true);
    this._secrets.changed.connect(() => this._emitChanged());
    this._secrets.focused.connect(() => this.fieldFocused.emit('secrets'));
    this._body.appendChild(this._secrets.element);
  }

  /** Set the output path (e.g. from Browse). */
  setOutputPath(path: string): void {
    this._pathInput.value = path;
    this._emitChanged();
  }

  /** Disable the fields that write to a locked file (see ``_applyRoutedLocks``). */
  applyLocks(locks: FileFlags, routing?: SectionRouting): void {
    this._applyRoutedLocks([
      { el: this._pathInput, key: 'path' },
      { el: this._browseBtn, key: 'path' },
      { el: this._uriInput, key: 'uri' },
      { el: this._syncBtnCb, key: 'sync_button' },
      { el: this._syncLabelInput, key: 'sync_button' },
      { el: this._recursiveCb, key: 'recursive' },
      { el: this._secrets.element, key: 'secrets' },
      { el: this._indexColInput, key: 'index_column' },
    ], locks, routing);
  }

  getData(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this._pathInput.value) result.path = this._pathInput.value;
    if (this._indexColInput.value) result.index_column = this._indexColInput.value;
    if (this._uriInput.value) result.uri = this._uriInput.value;
    if (this._syncBtnCb.checked) {
      result.sync_button = this._syncLabelInput.value || true;
    }
    if (this._recursiveCb.checked) result.recursive = true;
    const secrets = this._secrets.getData();
    if (secrets !== undefined) result.secrets = secrets;
    return result;
  }

  /** No-op: the output index_column is free-form text (it may differ from the data's). */
  setColumnOptions(_cols: string[]): void {}

  override reset(): void {
    for (const el of [this._pathInput, this._indexColInput, this._uriInput, this._syncLabelInput]) {
      el.value = '';
    }
    this._syncBtnCb.checked = false;
    this._recursiveCb.checked = false;
    this._secrets.reset();
  }

  setData(data: Record<string, any>): void {
    if (data.path) this._pathInput.value = data.path;
    if (data.index_column) this._indexColInput.value = data.index_column;
    if (data.uri || data.url) this._uriInput.value = data.uri || data.url;
    if (data.sync_button) {
      this._syncBtnCb.checked = true;
      if (typeof data.sync_button === 'string') this._syncLabelInput.value = data.sync_button;
    }
    if (data.recursive) this._recursiveCb.checked = true;
    if (data.secrets !== undefined) this._secrets.setData(data.secrets);
  }

  /**
   * Entering a sync URI or a sync button label implies the user wants the sync button shown,
   * so check it automatically.
   */
  private _autoCheckSync(): void {
    if (this._uriInput.value || this._syncLabelInput.value) {
      this._syncBtnCb.checked = true;
    }
  }
}
