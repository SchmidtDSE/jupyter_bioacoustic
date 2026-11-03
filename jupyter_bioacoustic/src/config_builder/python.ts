/**
 * Python source generators for the config builder's kernel calls.
 *
 * Each function returns a snippet that calls one method of the kernel-side ``ConfigBuilder``
 * instance (``_CB_INSTANCE``, from ``jupyter_bioacoustic/config_builder/core.py``) and prints
 * its JSON reply between ``___CB_JSON___`` markers. Run the snippet with ``KernelBridge.exec``
 * and parse the output with ``extractJson``; the reply shapes are the ``*Reply`` types below.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { escPy } from '../util';


//
// Constants
//
const DELIM = '___CB_JSON___';


//
// Types
//
/**
 * The builder's state snapshot (``ConfigBuilder._get_state()``), returned by every call that
 * changes it. The optional extras are added by specific calls (noted per field).
 */
export interface BuilderState {
  project?: Record<string, any>;
  config?: Record<string, any>;
  form_config?: Record<string, any>;
  project_yaml?: string;
  config_yaml?: string;
  form_yaml?: string;
  /** Where each section is written: ``project`` / ``config`` / ``split`` / ``form_config``. */
  section_targets?: Record<string, string>;
  saved_path?: string;
  dirty?: boolean;
  /** ``updateConfigFromYaml``: whether the edited YAML parsed. */
  update_ok?: boolean;
  /** ``saveAll``: the paths written, keyed by file type. */
  saved_paths?: Partial<Record<'project' | 'config' | 'form', string>>;
  /** ``loadConfig``: what the loaded file was detected as. */
  detected_type?: string;
  /** ``loadConfig``: the files loaded, keyed by file type (plus ``loaded``). */
  loaded_paths?: Record<string, string>;
}

/** ``ensureSetup`` reply. */
export interface ReadyReply {
  ready: boolean;
  debug: boolean;
  cwd: string;
}

/** ``readColumns`` / ``readColumnsFromSource`` reply. */
export interface ColumnsReply {
  columns: string[];
}

/** ``listFiles`` reply: directory entries plus the resolved directory (and root). */
export interface ListFilesReply {
  files: Array<{ name: string; is_dir: boolean }>;
  resolved: string;
  root_resolved: string | null;
}

/** ``checkAudioUrl`` reply (``duration`` for FLAC headers, ``channels`` otherwise). */
export interface AudioCheckReply {
  ok: boolean;
  sample_rate: number;
  duration?: number;
  channels?: number;
}

/** One entry of the ``listTemplates`` reply. */
export interface TemplateSummary {
  name: string;
  title: string;
  short_description: string;
}

/** ``validateConfig`` reply. */
export interface ValidationReply {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}


//
// Public
//
/**
 * The JSON text a builder snippet printed between the ``___CB_JSON___`` markers.
 *
 * @param raw - The snippet's stdout.
 * @throws Error when the markers are missing or empty.
 */
export function extractJson(raw: string): string {
  const start = raw.indexOf(DELIM);
  const end = raw.lastIndexOf(DELIM);
  if (start >= 0 && end > start) {
    const content = raw.substring(start + DELIM.length, end).trim();
    if (content) return content;
  }
  throw new Error('No valid JSON in kernel output');
}


/**
 * Create the kernel's ``ConfigBuilder`` once (``ConfigBuilder().setup()``), optionally after
 * ``chdir`` to ``cwd``. Reply: ``ReadyReply``.
 *
 * @param cwd - Directory to change to first.
 */
export function ensureSetup(cwd?: string): string {
  const lines = [`import json as _j, os as _os`];
  if (cwd) {
    lines.push(`_os.chdir(_os.path.expanduser('${escPy(cwd)}'))`);
  }
  lines.push(
    `try:`,
    `    _CB_INSTANCE`,
    `except NameError:`,
    `    from jupyter_bioacoustic.config_builder import ConfigBuilder as _CB_cls`,
    `    _cb = _CB_cls()`,
    `    _cb.setup()`,
  );
  lines.push(wp(`_j.dumps({'ready': True, 'debug': bool(_os.environ.get('JBA_DEBUG_MODE')), 'cwd': _os.getcwd()})`));
  return lines.join('\n');
}


/**
 * ``chdir`` to ``cwd`` and create + ``setup()`` a fresh ``ConfigBuilder`` — run once when the
 * builder command opens, before the widget exists. No JSON reply.
 *
 * @param cwd - Directory the builder works in (``~`` expanded).
 */
export function initBuilder(cwd: string): string {
  return [
    `import os as _os`,
    `_os.chdir(_os.path.expanduser('${escPy(cwd)}'))`,
    `from jupyter_bioacoustic.config_builder import ConfigBuilder`,
    `_cb = ConfigBuilder()`,
    `_cb.setup()`,
  ].join('\n');
}


/**
 * ``update_section(section, data, target=...)``. Reply: ``BuilderState``.
 *
 * @param section - Builder section name (``data``, ``app``, ``project``, ...).
 * @param data - The section's ``getData()`` payload.
 * @param target - Python-side target (``form_config`` for the form file).
 */
export function updateSection(section: string, data: Record<string, any>, target?: string): string {
  const dataJson = JSON.stringify(data);
  const targetArg = target ? `, target='${escPy(target)}'` : '';
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.update_section('${escPy(section)}', _j.loads('${escPy(dataJson)}')${targetArg})`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/**
 * ``update_config_from_yaml(yaml, config_type)`` then ``_get_state()``.
 * Reply: ``BuilderState`` with ``update_ok``.
 *
 * @param yamlStr - Edited YAML text.
 * @param configType - ``project`` / ``config`` / ``form_config``.
 */
export function updateConfigFromYaml(yamlStr: string, configType: string): string {
  const yamlJson = JSON.stringify(yamlStr);
  return [
    `import json as _j`,
    `_ok = _CB_INSTANCE.update_config_from_yaml(_j.loads(${JSON.stringify(yamlJson)}), '${escPy(configType)}')`,
    `_state = _CB_INSTANCE._get_state()`,
    `_state['update_ok'] = _ok`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/** ``save_all()`` then ``_get_state()``. Reply: ``BuilderState`` with ``saved_paths``. */
export function saveAll(): string {
  return [
    `import json as _j`,
    `_paths = _CB_INSTANCE.save_all()`,
    `_state = _CB_INSTANCE._get_state()`,
    `_state['saved_paths'] = _paths`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/**
 * ``save_single(config_type)``. Reply: ``{saved_to: string}``.
 *
 * @param configType - ``project`` / ``config`` / ``form_config``.
 */
export function saveSingleFile(configType: string): string {
  return [
    `import json as _j`,
    `_path = _CB_INSTANCE.save_single('${escPy(configType)}')`,
    wp(`_j.dumps({'saved_to': _path})`),
  ].join('\n');
}


/**
 * ``list_files(directory, extensions)`` plus the resolved directory. Reply: ``ListFilesReply``.
 *
 * @param directory - Directory to list.
 * @param extensions - Only list files with these extensions (all files when omitted).
 * @param rootDir - Root the browser shows paths relative to (resolved into ``root_resolved``).
 */
export function listFiles(
  directory: string, extensions?: readonly string[], rootDir?: string,
): string {
  const extArg = extensions ? `[${extensions.map(e => `'${escPy(e)}'`).join(',')}]` : 'None';
  const rootLine = rootDir
    ? `_r = _os.path.realpath('${escPy(rootDir)}')`
    : `_r = None`;
  return [
    `import json as _j, os as _os`,
    `_d = _os.path.realpath('${escPy(directory)}')`,
    rootLine,
    wp(`_j.dumps({'files': _CB_INSTANCE.list_files('${escPy(directory)}', ${extArg}), 'resolved': _d, 'root_resolved': _r})`),
  ].join('\n');
}


/**
 * ``os.makedirs(dirPath, exist_ok=True)``. Reply: ``{created: string}``.
 *
 * @param dirPath - Directory to create.
 */
export function createDirectory(dirPath: string): string {
  return [
    `import json as _j, os as _os`,
    `_os.makedirs('${escPy(dirPath)}', exist_ok=True)`,
    wp(`_j.dumps({'created': '${escPy(dirPath)}'})`),
  ].join('\n');
}


/**
 * ``read_columns(filepath)`` for a local data file. Reply: ``ColumnsReply``.
 *
 * @param filepath - Local data file.
 */
export function readColumns(filepath: string): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({'columns': _CB_INSTANCE.read_columns('${escPy(filepath)}')})`),
  ].join('\n');
}


/**
 * ``read_columns_from_source(source_type, value, secrets)`` for any data source (path, url incl.
 * s3://, sql, api). Reply: ``ColumnsReply``.
 *
 * @param sourceType - The data ``source_type``.
 * @param value - The data ``value`` (path, URL, query, endpoint).
 * @param secrets - The data section's secrets (``SecretsEditor.getData()``).
 */
export function readColumnsFromSource(
  sourceType: string,
  value: string,
  secrets?: unknown,
): string {
  const secretsJson = JSON.stringify(secrets ?? null);
  return [
    `import json as _j`,
    `_cols = _CB_INSTANCE.read_columns_from_source('${escPy(sourceType)}', '${escPy(value)}', _j.loads('${escPy(secretsJson)}'))`,
    wp(`_j.dumps({'columns': _cols})`),
  ].join('\n');
}


/**
 * ``check_audio_url(value)`` — raises (so ``exec`` throws) when the audio isn't reachable.
 * Reply: ``AudioCheckReply``.
 *
 * @param value - Remote audio URL / URI.
 */
export function checkAudioUrl(value: string): string {
  return [
    `import json as _j`,
    wp(`_j.dumps(_CB_INSTANCE.check_audio_url('${escPy(value)}'))`),
  ].join('\n');
}


/**
 * ``os.path.exists(path)``. Reply: ``{exists: boolean}``.
 *
 * @param path - Path to check (relative to the kernel's cwd).
 */
export function checkFileExists(path: string): string {
  return [
    `import os, json`,
    wp(`json.dumps({'exists': os.path.exists('${escPy(path)}')})`),
  ].join('\n');
}


/**
 * ``set_section_target(section, target)`` then ``_get_state()``. Reply: ``BuilderState``.
 *
 * @param section - Builder section name.
 * @param target - Python-side target (``project`` / ``config`` / ``split`` / ``form_config``).
 */
export function setSectionTarget(section: string, target: string): string {
  return [
    `import json as _j`,
    `_CB_INSTANCE.set_section_target('${escPy(section)}', '${escPy(target)}')`,
    `_state = _CB_INSTANCE._get_state()`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/** ``validate()``. Reply: ``ValidationReply``. */
export function validateConfig(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps(_CB_INSTANCE.validate())`),
  ].join('\n');
}


/**
 * ``load_config(path, file_type=...)`` (cascades project -> config -> form).
 * Reply: ``BuilderState`` with ``detected_type`` and ``loaded_paths``.
 *
 * @param path - File to load.
 * @param fileType - ``project`` / ``config`` / ``form`` hint (auto-detected when omitted).
 */
export function loadConfig(path: string, fileType?: string): string {
  const hint = fileType ? `, file_type='${escPy(fileType)}'` : '';
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.load_config('${escPy(path)}'${hint})`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/** ``get_routing_keys()``. Reply: ``RoutingKeys`` (see ``types.ts``). */
export function getRoutingKeys(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps(_CB_INSTANCE.get_routing_keys())`),
  ].join('\n');
}


/** ``list_templates()``. Reply: ``{templates: TemplateSummary[]}``. */
export function listTemplates(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({'templates': _CB_INSTANCE.list_templates()})`),
  ].join('\n');
}


/**
 * ``load_template(name)``. Reply: ``{template: Record<string, any>}`` (the parsed template).
 *
 * @param name - Template file stem.
 */
export function loadTemplate(name: string): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({'template': _CB_INSTANCE.load_template('${escPy(name)}')})`),
  ].join('\n');
}


/**
 * ``apply_template(name, scope, project_name, values)``. Reply: ``BuilderState``.
 *
 * @param name - Template file stem.
 * @param scope - What to create: ``project`` / ``config`` / ``form``.
 * @param projectName - Project name (sets the linked file names).
 * @param values - The user's value per template placeholder.
 */
export function applyTemplate(
  name: string,
  scope: string,
  projectName: string,
  values: Record<string, string>,
): string {
  const valuesJson = JSON.stringify(values);
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.apply_template('${escPy(name)}', '${escPy(scope)}', '${escPy(projectName)}', _j.loads('${escPy(valuesJson)}'))`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}


/**
 * ``summary.build_summary_from_builder(_CB_INSTANCE)``.
 * Reply: the Configuration Summary sections (``ConfigSummary.update``'s input).
 */
export function getSummary(): string {
  return [
    `import json as _j`,
    `from jupyter_bioacoustic.config_builder.summary import build_summary_from_builder as _bsfb`,
    wp(`_j.dumps(_bsfb(_CB_INSTANCE))`),
  ].join('\n');
}


/**
 * ``os.chdir(newDir)``. Reply: ``{cwd: string}`` (the new absolute cwd).
 *
 * @param newDir - Directory to change to (``~`` expanded).
 */
export function changeCwd(newDir: string): string {
  return [
    `import json as _j, os as _os`,
    `_os.chdir(_os.path.expanduser('${escPy(newDir)}'))`,
    wp(`_j.dumps({'cwd': _os.getcwd()})`),
  ].join('\n');
}


/**
 * ``BioacousticAnnotator(project=projectPath).setup()`` — prepares the annotator for the
 * saved project. No JSON reply.
 *
 * @param projectPath - Saved project (or config) file.
 */
export function setupAnnotatorFromProject(projectPath: string): string {
  return [
    `from jupyter_bioacoustic import BioacousticAnnotator as _BA`,
    `_ba = _BA(project='${escPy(projectPath)}')`,
    `_ba.setup()`,
  ].join('\n');
}


//
// Internal
//
/** A Python statement printing ``expr`` between the JSON markers. */
function wp(expr: string): string {
  return `print('${DELIM}'); print(${expr}); print('${DELIM}')`;
}
