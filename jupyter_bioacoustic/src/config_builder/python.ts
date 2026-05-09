import { escPy } from '../util';

const DELIM = '___CB_JSON___';

export function extractJson(raw: string): string {
  const start = raw.indexOf(DELIM);
  const end = raw.lastIndexOf(DELIM);
  if (start >= 0 && end > start) {
    return raw.substring(start + DELIM.length, end).trim();
  }
  return raw.trim();
}

function wp(expr: string): string {
  return `print('${DELIM}'); print(${expr}); print('${DELIM}')`;
}

export function readState(): string {
  return [
    `import json as _j`,
    wp(`_CB_STATE`),
  ].join('\n');
}

export function updateSection(section: string, data: Record<string, any>): string {
  const dataJson = JSON.stringify(data);
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.update_section('${escPy(section)}', _j.loads('${escPy(dataJson)}'))`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function updateConfigFromYaml(yamlStr: string, configType: string): string {
  return [
    `import json as _j`,
    `_ok = _CB_INSTANCE.update_config_from_yaml('''${yamlStr.replace(/'/g, "\\'")}''', '${escPy(configType)}')`,
    `_state = _CB_INSTANCE._get_state()`,
    `_state['update_ok'] = _ok`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function saveConfig(path: string, configType: string): string {
  return [
    `import json as _j`,
    `_path = _CB_INSTANCE.save('${escPy(path)}', '${escPy(configType)}')`,
    `_state = _CB_INSTANCE._get_state()`,
    `_state['saved_to'] = _path`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function getDefaultSavePath(): string {
  return [
    `import os as _os, re as _re, json as _j`,
    `_name = _CB_INSTANCE._project.get('project_name', 'config')`,
    `_slug = _re.sub(r'[^a-z0-9]+', '_', str(_name).lower()).strip('_')`,
    `_def = _os.path.join(_CB_INSTANCE._path, _slug + '.yaml')`,
    wp(`_j.dumps({'path': _def})`),
  ].join('\n');
}

export function listFiles(directory: string, extensions?: string[]): string {
  const extArg = extensions ? `[${extensions.map(e => `'${escPy(e)}'`).join(',')}]` : 'None';
  return [
    `import json as _j`,
    wp(`_j.dumps({'files': _CB_INSTANCE.list_files('${escPy(directory)}', ${extArg})})`),
  ].join('\n');
}

export function readColumns(filepath: string): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({'columns': _CB_INSTANCE.read_columns('${escPy(filepath)}')})`),
  ].join('\n');
}

export function readSampleData(filepath: string, nRows = 5): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({'rows': _CB_INSTANCE.read_sample_data('${escPy(filepath)}', ${nRows})})`),
  ].join('\n');
}

export function checkFileExists(path: string): string {
  return [
    `import os, json`,
    wp(`json.dumps({'exists': os.path.exists('${escPy(path)}')})`),
  ].join('\n');
}

export function setSectionTarget(section: string, target: string): string {
  return [
    `import json as _j`,
    `_CB_INSTANCE.set_section_target('${escPy(section)}', '${escPy(target)}')`,
    wp(`_j.dumps({'ok': True})`),
  ].join('\n');
}
