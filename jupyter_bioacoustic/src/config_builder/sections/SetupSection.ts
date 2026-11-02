/**
 * Setup section: tabbed project entry: Create New / Create from Template / Load Existing.
 * File management (paths, enable, Duplicate/Rename, lock) lives in the separate
 * ConfigFilesSection. This section only emits intent signals — `projectCreated`,
 * `loadConfigRequested`, and the template signals.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';
import { COLORS } from '../../styles';
import { makeButton, makeInput, makeLabel, makeSelect } from '../dom';
import type { TemplateSummary } from '../python';
import { SETUP_TAB_HELP } from '../text';
import { CollapsibleSection } from './CollapsibleSection';
import { TemplateApplyRequest, TemplateBrowseRequest, TemplateForm } from './TemplateForm';


//
// Constants
//
const MODE_CREATE = 'create';
const MODE_TEMPLATE = 'template';
const MODE_LOAD = 'load';


//
// Public
//
export class SetupSection extends CollapsibleSection {
  /** Load tab Browse clicked (``field``: the chosen file type). */
  readonly browseRequested = new Signal<this, { field: string; current: string }>(this);
  /** Load clicked (``field``: file type hint, ``path``: file to load). */
  readonly loadConfigRequested = new Signal<this, { field: string; path: string }>(this);
  /** Create clicked (payload: the project name). */
  readonly projectCreated = new Signal<this, string>(this);
  // Re-emitted TemplateForm signals (see TemplateForm).
  readonly templateListRequested = new Signal<this, void>(this);
  readonly templateSelected = new Signal<this, string>(this);
  readonly applyTemplateRequested = new Signal<this, TemplateApplyRequest>(this);
  readonly templateBrowseRequested = new Signal<this, TemplateBrowseRequest>(this);
  readonly templateColumnsRequested = new Signal<this, string>(this);

  private _createTab!: HTMLButtonElement;
  private _templateTab!: HTMLButtonElement;
  private _loadTab!: HTMLButtonElement;
  private _createPane!: HTMLDivElement;
  private _templatePane!: HTMLDivElement;
  private _loadPane!: HTMLDivElement;
  private _tabHelp!: HTMLDivElement;
  private _templateForm!: TemplateForm;

  private _createNameInput!: HTMLInputElement;
  private _createBtn!: HTMLButtonElement;
  private _loadTypeSelect!: HTMLSelectElement;
  private _loadPathInput!: HTMLInputElement;
  private _loadBtn!: HTMLButtonElement;

  constructor() {
    super('Setup', 'setup', true);

    this._body.appendChild(this._makeTabBar());

    this._tabHelp = document.createElement('div');
    this._tabHelp.style.cssText =
      `color:${COLORS.textSubtle};font-size:11px;line-height:1.5;margin:2px 0 4px;`;
    this._tabHelp.textContent = SETUP_TAB_HELP.create;
    this._body.appendChild(this._tabHelp);

    this._createPane = this._buildCreatePane();
    this._templatePane = this._buildTemplatePane();
    this._templatePane.style.display = 'none';
    this._loadPane = this._buildLoadPane();
    this._loadPane.style.display = 'none';
    this._body.append(this._createPane, this._templatePane, this._loadPane);
  }


  setTemplateList(items: TemplateSummary[]): void {
    this._templateForm.setList(items);
  }

  setTemplate(name: string, template: Record<string, any>): void {
    this._templateForm.setTemplate(name, template);
  }

  /** Lock the template form after its files were saved (Edit re-enables it). */
  markTemplateSaved(): void {
    this._templateForm.markSaved();
  }

  setTemplateFieldValue(key: string, value: string): void {
    this._templateForm.setFieldValue(key, value);
  }

  setTemplateColumns(path: string, cols: string[]): void {
    this._templateForm.setColumns(path, cols);
  }

  /** Fill the Load path (e.g. from Browse). */
  setLoadPath(path: string): void {
    this._loadPathInput.value = path;
    this._loadPathInput.focus();
  }

  /** Nothing: the tabs hold no persisted config. */
  getData(): Record<string, any> {
    return {};
  }

  setData(_data: Record<string, any>): void {
    /* tabs hold no persisted config; file state lives in ConfigFilesSection */
  }


  //
  // Internal — UI builders
  //
  private _makeTabBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;gap:0;border-radius:4px;overflow:hidden;border:1px solid ${COLORS.bgSurface1};`;

    this._createTab = document.createElement('button');
    this._createTab.textContent = 'Create New';
    this._createTab.style.cssText = this._tabStyle(true, true);
    this._createTab.addEventListener('click', () => this._switchMode(MODE_CREATE));

    this._templateTab = document.createElement('button');
    this._templateTab.textContent = 'Create from Template';
    this._templateTab.style.cssText = this._tabStyle(false, true);
    this._templateTab.addEventListener('click', () => this._switchMode(MODE_TEMPLATE));

    this._loadTab = document.createElement('button');
    this._loadTab.textContent = 'Load Existing';
    this._loadTab.style.cssText = this._tabStyle(false);
    this._loadTab.addEventListener('click', () => this._switchMode(MODE_LOAD));

    bar.append(this._createTab, this._templateTab, this._loadTab);
    return bar;
  }

  private _buildTemplatePane(): HTMLDivElement {
    const pane = document.createElement('div');
    pane.style.cssText = `display:flex;flex-direction:column;padding:4px 0;`;
    this._templateForm = new TemplateForm();
    this._templateForm.listRequested.connect(() => this.templateListRequested.emit());
    this._templateForm.templateSelected.connect((_, name) => this.templateSelected.emit(name));
    this._templateForm.applyRequested.connect((_, payload) =>
      this.applyTemplateRequested.emit(payload));
    this._templateForm.browseRequested.connect((_, payload) =>
      this.templateBrowseRequested.emit(payload));
    this._templateForm.columnsRequested.connect((_, path) =>
      this.templateColumnsRequested.emit(path));
    pane.appendChild(this._templateForm.element);
    return pane;
  }

  private _buildCreatePane(): HTMLDivElement {
    const pane = document.createElement('div');
    pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;`;

    const lbl = makeLabel('name');
    lbl.style.minWidth = '40px';
    this._createNameInput = makeInput('e.g. Bird Review', '400px');
    this._createNameInput.style.flexShrink = '1';
    this._createNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onCreate();
    });

    this._createBtn = makeButton('Create', true);
    this._createBtn.type = 'button';
    this._createBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onCreate(); });

    pane.append(lbl, this._createNameInput, this._createBtn);
    return pane;
  }

  private _buildLoadPane(): HTMLDivElement {
    const pane = document.createElement('div');
    pane.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;`;

    this._loadTypeSelect = makeSelect(['project', 'config', 'form'], 'project');

    this._loadPathInput = makeInput('path to configuration file', '400px');
    this._loadPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onLoad(); }
    });

    const loadBrowseBtn = makeButton('Browse');
    loadBrowseBtn.type = 'button';
    loadBrowseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.browseRequested.emit({
        field: this._loadTypeSelect.value,
        current: this._loadPathInput.value || '.',
      });
    });

    this._loadBtn = makeButton('Load', true);
    this._loadBtn.type = 'button';
    this._loadBtn.addEventListener('click', (e) => { e.stopPropagation(); this._onLoad(); });

    pane.append(this._loadTypeSelect, this._loadPathInput, loadBrowseBtn, this._loadBtn);
    return pane;
  }


  //
  // Internal — actions
  //
  private _switchMode(mode: string): void {
    this._createTab.style.cssText = this._tabStyle(mode === MODE_CREATE, true);
    this._templateTab.style.cssText = this._tabStyle(mode === MODE_TEMPLATE, true);
    this._loadTab.style.cssText = this._tabStyle(mode === MODE_LOAD);
    this._createPane.style.display = mode === MODE_CREATE ? 'flex' : 'none';
    this._templatePane.style.display = mode === MODE_TEMPLATE ? 'flex' : 'none';
    this._loadPane.style.display = mode === MODE_LOAD ? 'flex' : 'none';
    this._tabHelp.textContent =
      mode === MODE_TEMPLATE ? SETUP_TAB_HELP.template
      : mode === MODE_LOAD ? SETUP_TAB_HELP.load
      : SETUP_TAB_HELP.create;
    if (mode === MODE_TEMPLATE) this._templateForm.activate();
  }

  private _onCreate(): void {
    const name = this._createNameInput.value.trim();
    if (!name) return;
    this.projectCreated.emit(name);
  }

  private _onLoad(): void {
    const path = this._loadPathInput.value.trim();
    if (!path) return;
    this.loadConfigRequested.emit({ field: this._loadTypeSelect.value, path });
  }


  //
  // Internal — helpers
  //
  private _tabStyle(active: boolean, divider = false): string {
    return `flex:1;padding:6px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;` +
      `background:${active ? COLORS.blue : 'transparent'};` +
      `color:${active ? COLORS.bgBase : COLORS.textMuted};` +
      (divider ? `border-right:1px solid ${COLORS.bgSurface1};` : '');
  }
}
