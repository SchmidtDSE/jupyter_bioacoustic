/**
 * The builder's sections and the logic that works on all of them at once: filling them from a
 * loaded state, file-lock disabling, target options and the accordion.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { collectDescriptionData, resolveSectionData } from './builderState';
import type { BuilderState } from './python';
import { AppSection } from './sections/AppSection';
import { AudioSection } from './sections/AudioSection';
import { CollapsibleSection } from './sections/CollapsibleSection';
import { ConfigFilesSection } from './sections/ConfigFilesSection';
import { DataSection } from './sections/DataSection';
import { DescriptionSection } from './sections/DescriptionSection';
import { FormSection } from './sections/FormSection';
import { OutputSection } from './sections/OutputSection';
import { SetupSection } from './sections/SetupSection';
import type { ConfigFileType, FileFlags, RoutingKeys } from './types';


//
// Public
//
export class BuilderSections {
  readonly setup = new SetupSection();
  readonly configFiles = new ConfigFilesSection();
  readonly data = new DataSection();
  readonly audio = new AudioSection();
  readonly output = new OutputSection();
  readonly app = new AppSection();
  readonly form = new FormSection();
  readonly description = new DescriptionSection();
  /** Every section by its kernel section name, in display order. */
  readonly all: ReadonlyMap<string, CollapsibleSection>;
  /** The sections with a target dropdown. */
  readonly targeted: readonly CollapsibleSection[];

  constructor() {
    this.all = new Map<string, CollapsibleSection>([
      ['setup', this.setup],
      ['project', this.configFiles],
      ['data', this.data],
      ['audio', this.audio],
      ['output', this.output],
      ['app', this.app],
      ['form', this.form],
      ['description', this.description],
    ]);
    this.targeted = [this.data, this.audio, this.output, this.app, this.form, this.description];
    this.app.setTarget('config');
    this.form.setTarget('form');
    this.description.setTarget('project');
  }

  /**
   * Replace every section's contents with a loaded / applied state (reset first, since
   * ``setData`` only adds).
   */
  fill(state: BuilderState): void {
    for (const section of this.all.values()) section.reset();
    if (state.project) this._fillProjectData(state);
    if (state.form_config && typeof state.form_config === 'object') {
      this.form.setData(state.form_config);
    }
    if (state.section_targets) this._applyTargets(state.section_targets);
  }

  /**
   * Disable whatever writes to a locked file, and freeze the target dropdowns while any file
   * is locked (so routing can't shift fields into/out of a locked file).
   *
   * @param routing - Split routing per section (null: lock split sections per section).
   */
  applyFileLocks(routing: RoutingKeys | null): void {
    const locks = this.configFiles.getLockStates();
    const anyLocked = locks.project || locks.config || locks.form;
    const fileOf = (t: string): ConfigFileType =>
      t === 'form' ? 'form' : t === 'config' ? 'config' : 'project';

    for (const [name, section] of this.all) {
      if (name !== 'project') section.setTargetEnabled(!anyLocked);
    }

    // Whole-section-target sections route entirely to one file.
    this.app.setFieldsLocked(locks[fileOf(this.app.getTarget())]);
    this.description.setFieldsLocked(locks[fileOf(this.description.getTarget())]);
    this.form.setFieldsLocked(locks[fileOf(this.form.getTarget())]);

    // Split sections disable per-field by routing (project-group vs config-group).
    this.data.applyLocks(locks, routing?.data);
    this.audio.applyLocks(locks, routing?.audio);
    this.output.applyLocks(locks, routing?.output);
  }

  /** Offer only the enabled files as targets (``split`` needs project and config). */
  updateTargetOptions(states: FileFlags): void {
    const baseOpts: string[] = [];
    if (states.project) baseOpts.push('project');
    if (states.config) baseOpts.push('config');
    if (baseOpts.length === 0) baseOpts.push('project');

    const splitOpts = states.project && states.config
      ? ['split', ...baseOpts] : [...baseOpts];
    for (const sec of [this.data, this.audio, this.output]) {
      sec.setTargetOptions(splitOpts);
    }
    this.app.setTargetOptions(baseOpts);
    this.description.setTargetOptions(baseOpts);

    const formOpts: string[] = [...baseOpts];
    if (states.form) formOpts.push('form');
    this.form.setTargetOptions(formOpts);
  }

  /** Accordion: opening one section closes the others unless pinned. */
  closeOthers(opened: CollapsibleSection): void {
    for (const section of this.all.values()) {
      if (section !== opened && !section.isPinned) {
        section.close();
      }
    }
  }

  /** Fill the file / data / audio / output / app / description sections. */
  private _fillProjectData(state: BuilderState): void {
    const proj = state.project || {};
    const conf = state.config || {};
    this.configFiles.setData(proj);
    const targets = state.section_targets || {};

    if (proj.project_name) {
      this.app.setProjectName(proj.project_name);
    }

    const mergedData = resolveSectionData('data', targets, proj, conf);
    if (mergedData) this.data.setData(mergedData);
    const mergedAudio = resolveSectionData('audio', targets, proj, conf);
    if (mergedAudio) this.audio.setData(mergedAudio);

    const mergedOutput = resolveSectionData('output', targets, proj, conf);
    const outputData: Record<string, any> = mergedOutput ? { ...mergedOutput } : {};
    const outputPath = proj.output?.path || proj.output_path;
    if (outputPath) outputData.path = outputPath;
    if (Object.keys(outputData).length > 0) this.output.setData(outputData);

    const appSource = targets.app === 'config' ? { ...proj, ...conf } : proj;
    this.app.setData(appSource);

    const descData = collectDescriptionData(proj, conf);
    if (Object.keys(descData).length > 0) this.description.setData(descData);
  }

  /** Set each section's target dropdown from ``section_targets``. */
  private _applyTargets(targets: Record<string, string>): void {
    if (targets.data) this.data.setTarget(targets.data);
    if (targets.audio) this.audio.setTarget(targets.audio);
    if (targets.output) this.output.setTarget(targets.output);
    if (targets.app) this.app.setTarget(targets.app);
    if (targets.form) this.form.setTarget(targets.form === 'form_config' ? 'form' : targets.form);
    if (targets.description) this.description.setTarget(targets.description);
  }
}
