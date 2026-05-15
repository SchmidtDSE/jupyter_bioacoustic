import { escPy } from '../util';

const DELIM = '___CB_JSON___';

export function extractJson(raw: string): string {
  const start = raw.indexOf(DELIM);
  const end = raw.lastIndexOf(DELIM);
  if (start >= 0 && end > start) {
    const content = raw.substring(start + DELIM.length, end).trim();
    if (content) return content;
  }
  throw new Error('No valid JSON in kernel output');
}

function wp(expr: string): string {
  return `print('${DELIM}'); print(${expr}); print('${DELIM}')`;
}

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

export function readState(): string {
  return [
    `import json as _j`,
    wp(`_CB_STATE`),
  ].join('\n');
}

export function updateSection(section: string, data: Record<string, any>, target?: string): string {
  const dataJson = JSON.stringify(data);
  const targetArg = target ? `, target='${escPy(target)}'` : '';
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.update_section('${escPy(section)}', _j.loads('${escPy(dataJson)}')${targetArg})`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

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

export function saveAll(): string {
  return [
    `import json as _j`,
    `_paths = _CB_INSTANCE.save_all()`,
    `_state = _CB_INSTANCE._get_state()`,
    `_state['saved_paths'] = _paths`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function saveSingleFile(configType: string): string {
  return [
    `import json as _j`,
    `_path = _CB_INSTANCE.save_single('${escPy(configType)}')`,
    wp(`_j.dumps({'saved_to': _path})`),
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
    `_state = _CB_INSTANCE._get_state()`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function validateConfig(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps(_CB_INSTANCE.validate())`),
  ].join('\n');
}

export function loadConfig(path: string, fileType?: string): string {
  const hint = fileType ? `, file_type='${escPy(fileType)}'` : '';
  return [
    `import json as _j`,
    `_state = _CB_INSTANCE.load_config('${escPy(path)}'${hint})`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}
