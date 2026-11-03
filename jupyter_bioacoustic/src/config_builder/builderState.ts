/**
 * Pure helpers for ConfigPanel: which files are written / opened, validation messages, and
 * splitting a loaded ``BuilderState`` into each section's ``setData`` payload.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { CONFIG_FILE_TYPES } from './constants';
import type { ValidationReply } from './python';
import type { ConfigFilesData, ConfigFileType } from './types';


//
// Constants
//
/** Flat description keys a project / config file may carry. */
const DESCRIPTION_KEYS = [
  'description', 'description_title', 'description_text', 'description_path',
  'description_open', 'description_height',
];


//
// Public
//
/** ``path`` with a ``.yaml`` extension unless it has .yaml/.yml (as the kernel saves it). */
export function withYamlExt(path: string): string {
  return /\.ya?ml$/i.test(path) ? path : `${path}.yaml`;
}


/** The paths save will write: enabled, unlocked files that have a path (project, config, form). */
export function writableFiles(files: ConfigFilesData): string[] {
  const paths: string[] = [];
  for (const ft of CONFIG_FILE_TYPES) {
    const path = files[`${ft}_path`];
    if (files[`${ft}_enabled`] && !files[`${ft}_locked`] && path) paths.push(path);
  }
  return paths;
}


/**
 * The file the annotator opens / Reload re-reads: the first enabled file with a path, in
 * project -> config -> form order (a locked file still counts — it exists, it's just not
 * rewritten).
 */
export function activeFilePath(files: ConfigFilesData): { path: string; label: ConfigFileType | '' } {
  for (const ft of CONFIG_FILE_TYPES) {
    const path = files[`${ft}_path`];
    if (files[`${ft}_enabled`] && path) return { path, label: ft };
  }
  return { path: '', label: '' };
}


/** The validation errors / warnings as dialog text (``''`` when there are none). */
export function formatValidation(reply: ValidationReply): string {
  const msgs: string[] = [];
  if (reply.errors?.length) msgs.push('Errors:\n• ' + reply.errors.join('\n• '));
  if (reply.warnings?.length) msgs.push('Warnings:\n• ' + reply.warnings.join('\n• '));
  return msgs.join('\n\n');
}


/**
 * A split-capable section's data from the loaded project / config dicts: the file its target
 * names, or both merged (project wins) for ``split``. Null when there is none.
 *
 * @param section - ``data`` / ``audio`` / ``output``.
 * @param targets - ``section_targets`` from the state.
 * @param proj - The loaded project dict.
 * @param conf - The loaded config dict.
 */
export function resolveSectionData(
  section: string,
  targets: Record<string, string>,
  proj: Record<string, any>,
  conf: Record<string, any>,
): Record<string, any> | null {
  const t = targets[section];
  const pData = proj[section];
  const cData = conf[section];
  if (t === 'split') {
    if (!pData && !cData) return null;
    return { ...(typeof cData === 'object' ? cData : {}), ...(typeof pData === 'object' ? pData : {}) };
  }
  const source = t === 'config' ? cData : pData;
  return source && typeof source === 'object' ? source : null;
}


/**
 * The Description section's data: the description keys set in ``proj`` then ``conf`` (the
 * config file wins). Falsy values are skipped, except an explicit ``description_open``.
 */
export function collectDescriptionData(
  proj: Record<string, any>, conf: Record<string, any>,
): Record<string, any> {
  const descData: Record<string, any> = {};
  for (const src of [proj, conf]) {
    for (const key of DESCRIPTION_KEYS) {
      const keep = key === 'description_open' ? src[key] !== undefined : !!src[key];
      if (keep) descData[key] = src[key];
    }
  }
  return descData;
}
