import { escPy } from '../util';

const DELIM = '___AB_JSON___';

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

export function readBuilderVars(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps({
  'config': _AB_CONFIG,
  'config_type': _AB_CONFIG_TYPE,
  'messages': _AB_MESSAGES,
  'saved_path': _AB_SAVED_PATH,
  'dirty': _AB_DIRTY,
  'welcome': _AB_WELCOME,
  'mode': _AB_MODE,
})`),
  ].join('\n');
}

export function sendMessage(text: string): string {
  return [
    `import json as _j`,
    `_resp = _AB_INSTANCE._call_llm('${escPy(text)}')`,
    `_state = _AB_INSTANCE._get_state()`,
    `_state['response'] = _resp`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function updateConfigFromYaml(yamlStr: string): string {
  return [
    `import json as _j`,
    `_ok = _AB_INSTANCE._update_config_from_yaml('''${yamlStr.replace(/'/g, "\\'")}''')`,
    `_state = _AB_INSTANCE._get_state()`,
    `_state['update_ok'] = _ok`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function saveConfig(path: string): string {
  return [
    `import json as _j`,
    `_path = _AB_INSTANCE.save('${escPy(path)}')`,
    `_state = _AB_INSTANCE._get_state()`,
    `_state['saved_to'] = _path`,
    wp(`_j.dumps(_state)`),
  ].join('\n');
}

export function validateConfig(): string {
  return [
    `import json as _j`,
    `_issues = _AB_INSTANCE.validate()`,
    wp(`_j.dumps({'issues': _issues})`),
  ].join('\n');
}

export function getDefaultSavePath(): string {
  return [
    `import os as _os, re as _re, json as _j`,
    `_name = _AB_INSTANCE._config.get('project_name', 'config')`,
    `_slug = _re.sub(r'[^a-z0-9]+', '_', str(_name).lower()).strip('_')`,
    `_def = _os.path.join(_AB_INSTANCE._path, _slug + '.yaml')`,
    wp(`_j.dumps({'path': _def})`),
  ].join('\n');
}

export function setConfigType(configType: string): string {
  return [
    `_AB_INSTANCE._config_type = '${escPy(configType)}'`,
    `import json as _j`,
    wp(`_j.dumps({'ok': True})`),
  ].join('\n');
}

export function checkFileExists(path: string): string {
  return [
    `import os, json`,
    wp(`json.dumps({'exists': os.path.exists('${escPy(path)}')})`),
  ].join('\n');
}

export function checkApiKey(): string {
  return [
    `import json as _j`,
    wp(`_j.dumps(_AB_INSTANCE.check_api_key())`),
  ].join('\n');
}

export function setApiKey(envVar: string, value: string): string {
  return [
    `import json as _j`,
    `_AB_INSTANCE.set_api_key('${escPy(envVar)}', '${escPy(value)}')`,
    wp(`_j.dumps({'ok': True})`),
  ].join('\n');
}
