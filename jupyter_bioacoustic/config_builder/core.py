"""
ConfigBuilder — GUI-driven configuration file builder for BioacousticAnnotator.

Usage:
    from jupyter_bioacoustic import ConfigBuilder
    ConfigBuilder().open()

License: BSD 3-Clause
"""
from __future__ import annotations

import json
import logging
import os
import re

import uuid

from IPython import get_ipython
from IPython.display import display, HTML

from .._validation import (
    SKIP_KEYS,
    VALID_ANNOTATION_TOOLS,
    VALID_CONFIG_KEYS,
    VALID_FORM_KEYS,
    validate_config,
)

#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.config_builder')

_UNSET = object()
DEFAULT_PROJECT_DIR = 'projects'
DEFAULT_CONFIG_DIR = 'config'
DEFAULT_FORM_DIR = 'forms'
DATA_PROJECT_KEYS = frozenset({
    'value', 'source_type', 'path', 'url', 'sql', 'api', 'secrets'
})
DATA_CONFIG_KEYS = frozenset({'start_time', 'end_time', 'duration', 'index_column'})
AUDIO_PROJECT_KEYS = frozenset({
    'value', 'source_type', 'path', 'url', 'uri', 'sql', 'api',
    'secrets', 'response_index'
})
AUDIO_CONFIG_KEYS = frozenset({'column', 'prefix', 'suffix', 'fallback', 'property'})
OUTPUT_PROJECT_KEYS = frozenset({
    'path', 'uri', 'url', 'sync_button', 'recursive', 'secrets',
})
OUTPUT_CONFIG_KEYS = frozenset({'index_column'})
SECTION_KEYS = frozenset({'data', 'audio', 'output'})
APP_KEYS = frozenset({
    'info_card_title', 'info_card_text',
    'display_columns',
    'sort', 'sort_order',
    'duplicate_entries', 'default_buffer', 'capture', 'capture_dir',
    'spectrogram_resolution', 'visualizations', 'partial_download',
    'width', 'clip_table_height', 'player_height',
    'info_card_height', 'form_panel_height',
    'description',
    'secrets',
})

#
# Internal helpers
#
class _LiteralStr(str):
    pass


def _literal_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')


def _prep_for_yaml(obj):
    if isinstance(obj, dict):
        return {k: _prep_for_yaml(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_prep_for_yaml(v) for v in obj]
    if isinstance(obj, str) and '\n' in obj:
        return _LiteralStr(obj)
    return obj


def _ensure_ext(path: str, extensions: tuple = ('.yaml', '.yml'),
                default: str = '.yaml') -> str:
    if not path.endswith(tuple(extensions)):
        path += default
    return path


def _resolve_path(ref: str, base_dir: str) -> str | None:
    """Resolve a file reference relative to base_dir or cwd."""
    if os.path.isabs(ref):
        return ref if os.path.exists(ref) else None
    candidate = os.path.join(base_dir, ref)
    if os.path.exists(candidate):
        return candidate
    if os.path.exists(ref):
        return ref
    _log.debug('_resolve_path failed: ref=%s base_dir=%s cwd=%s', ref, base_dir,
               os.getcwd())
    return None


def _to_cwd_relative(resolved: str) -> str:
    """Convert a resolved path to be relative to the current working directory."""
    try:
        return os.path.relpath(resolved)
    except ValueError:
        return resolved

#
# Public API
#
class ConfigBuilder:
    def __init__(self) -> None:
        self._project = {}
        self._config = {}
        self._form_config = {}
        self._section_targets = {
            'project': 'project',
            'data': 'split',
            'audio': 'split',
            'output': 'split',
            'app': 'config',
            'form': 'form_config',
        }
        self._saved_path = None
        self._dirty = False

    def get_config(self, config_type: str = 'project') -> dict:
        """Get configuration data for the specified type."""
        if config_type == 'project':
            cfg = dict(self._project)
            if self._form_config:
                cfg['form_config'] = dict(self._form_config)
            return cfg
        elif config_type == 'config':
            return dict(self._config)
        elif config_type == 'form_config':
            return dict(self._form_config)
        return {}

    def get_merged_config(self) -> dict:
        """Get merged configuration from all sources."""
        cfg = dict(self._project)
        cfg.update(self._config)
        if self._form_config:
            cfg['form_config'] = dict(self._form_config)
        return cfg

    def update_section(self, section: str, data: dict, target: str | None = None):
        """Update configuration section with provided data."""
        if target is not None:
            self._section_targets[section] = target
        target = self._section_targets.get(section, 'project')
        _log.debug('update_section(%s) target=%s data_keys=%s',
                   section, target, list(data.keys()))

        if section == 'project':
            for k in SKIP_KEYS:
                if k in data:
                    self._project[k] = data[k]
            if 'project_name' in data:
                pn = data['project_name']
                if pn:
                    self._project['project_name'] = pn
                else:
                    self._project.pop('project_name', None)
            if 'output_path' in data:
                op = data['output_path']
                if op:
                    out = self._project.get('output', {})
                    if not isinstance(out, dict):
                        out = {}
                    out['path'] = op
                    self._project['output'] = out
                elif 'output' in self._project and isinstance(self._project['output'], dict):
                    self._project['output'].pop('path', None)
            desc_dict = {}
            if 'description' in data and isinstance(data['description'], dict):
                for k, v in data['description'].items():
                    if v is not None and v != '' and v != []:
                        desc_dict[k] = v
            for k in ('description_title', 'description_text', 'description_path',
                       'description_open', 'description_height'):
                if k in data:
                    val = data[k]
                    if val is not None and val != '' and val != []:
                        desc_dict[k.replace('description_', '')] = val
            if desc_dict:
                self._project['description'] = desc_dict
            elif 'description' in self._project:
                del self._project['description']
            self._config.pop('description', None)

        elif section == 'data':
            data_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    data_dict[k] = v
            if target == 'split':
                proj_part = {k: v for k, v in data_dict.items() if k in DATA_PROJECT_KEYS}
                conf_part = {k: v for k, v in data_dict.items() if k not in DATA_PROJECT_KEYS}
                if proj_part:
                    self._project['data'] = proj_part
                elif 'data' in self._project:
                    del self._project['data']
                if conf_part:
                    self._config['data'] = conf_part
                elif 'data' in self._config:
                    del self._config['data']
            else:
                dest = self._project if target == 'project' else self._config
                other = self._config if target == 'project' else self._project
                dest['data'] = data_dict
                other.pop('data', None)

        elif section == 'audio':
            audio_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    audio_dict[k] = v
            if target == 'split':
                proj_part = {k: v for k, v in audio_dict.items() if k in AUDIO_PROJECT_KEYS}
                conf_part = {k: v for k, v in audio_dict.items() if k not in AUDIO_PROJECT_KEYS}
                if proj_part:
                    self._project['audio'] = proj_part
                elif 'audio' in self._project:
                    del self._project['audio']
                if conf_part:
                    self._config['audio'] = conf_part
                elif 'audio' in self._config:
                    del self._config['audio']
            else:
                dest = self._project if target == 'project' else self._config
                other = self._config if target == 'project' else self._project
                dest['audio'] = audio_dict
                other.pop('audio', None)

        elif section == 'output':
            output_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    output_dict[k] = v
            if target == 'split':
                proj_part = {
                    k: v for k, v in output_dict.items()
                    if k in OUTPUT_PROJECT_KEYS
                }
                conf_part = {
                    k: v for k, v in output_dict.items()
                    if k not in OUTPUT_PROJECT_KEYS
                }
                if proj_part:
                    self._project['output'] = proj_part
                elif 'output' in self._project:
                    del self._project['output']
                if conf_part:
                    self._config['output'] = conf_part
                elif 'output' in self._config:
                    del self._config['output']
            elif target == 'project':
                self._project['output'] = output_dict
                self._config.pop('output', None)
            else:
                self._config['output'] = output_dict
                self._project.pop('output', None)

        elif section == 'app':
            pn = data.get('project_name', '')
            if pn:
                self._project['project_name'] = pn
            else:
                self._project.pop('project_name', None)
            dest = self._project if target == 'project' else self._config
            for k in APP_KEYS:
                if k in data:
                    val = data[k]
                    if val is not None and val != '' and val != []:
                        dest[k] = val
                    elif k in dest:
                        del dest[k]

        elif section == 'form':
            self._form_config = data if isinstance(data, dict) else {}

        self._dirty = True
        return self._get_state()

    def set_section_target(self, section: str, target: str) -> None:
        """Set the target configuration for a section."""
        valid = ('project', 'config', 'form_config', 'split')
        if section not in self._section_targets or target not in valid:
            return
        old_target = self._section_targets[section]
        self._section_targets[section] = target

        if section in ('data', 'audio', 'output') and old_target != target:
            if target == 'split':
                combined = {}
                for d in (self._project, self._config):
                    if section in d:
                        combined.update(d.pop(section))
                split_keys = (DATA_PROJECT_KEYS if section == 'data'
                              else AUDIO_PROJECT_KEYS if section == 'audio'
                              else frozenset())
                proj_part = {k: v for k, v in combined.items() if k in split_keys}
                conf_part = {k: v for k, v in combined.items() if k not in split_keys}
                if proj_part:
                    self._project[section] = proj_part
                if conf_part:
                    self._config[section] = conf_part
            elif old_target == 'split':
                combined = {}
                for d in (self._config, self._project):
                    if section in d:
                        combined.update(d.pop(section))
                dest = self._project if target == 'project' else self._config
                if combined:
                    dest[section] = combined
            else:
                old_dict = self._project if old_target == 'project' else self._config
                new_dict = self._project if target == 'project' else self._config
                if section in old_dict:
                    new_dict[section] = old_dict.pop(section)
        if section == 'app' and old_target != target:
            old_dict = self._project if old_target == 'project' else self._config
            new_dict = self._project if target == 'project' else self._config
            for k in APP_KEYS:
                if k in old_dict:
                    new_dict[k] = old_dict.pop(k)

    def save(self, path: str | None = None, config_type: str = 'project') -> dict:
        """Save configuration files."""
        return self.save_all()

    def _build_file_contents(self) -> dict:
        name = self._project.get('project_name', 'config')
        slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')

        project_enabled = self._project.get('project_enabled', True)
        config_enabled = self._project.get('config_enabled', True)
        form_enabled = self._project.get('form_enabled', True)

        p_path = self._project.get('project_path') or f'{DEFAULT_PROJECT_DIR}/{slug}.yaml'
        c_path = self._project.get('config_path') or f'{DEFAULT_CONFIG_DIR}/{slug}.yaml'
        f_path = self._project.get('form_path') or f'{DEFAULT_FORM_DIR}/{slug}.yaml'

        form_cfg = dict(self._form_config) if self._form_config else {}

        proj_data = {}
        conf_data = {}

        for k, v in self._project.items():
            if k in SKIP_KEYS:
                continue
            if k in SECTION_KEYS:
                t = self._section_targets.get(k, 'project')
                if t == 'split':
                    proj_data[k] = v
                elif t == 'project':
                    proj_data[k] = v
                else:
                    conf_data[k] = v
            elif k in APP_KEYS:
                if self._section_targets.get('app', 'project') == 'project':
                    proj_data[k] = v
                else:
                    conf_data[k] = v
            else:
                proj_data[k] = v

        for k, v in self._config.items():
            if k in SECTION_KEYS:
                t = self._section_targets.get(k, 'project')
                if t == 'split':
                    conf_data[k] = v
                elif t == 'config':
                    conf_data[k] = v
                else:
                    proj_data[k] = v
            elif k in APP_KEYS:
                if self._section_targets.get('app', 'project') == 'config':
                    conf_data[k] = v
                else:
                    proj_data[k] = v
            else:
                conf_data[k] = v

        form_target = self._section_targets.get('form', 'form_config')
        if form_target == 'form_config' and form_enabled:
            if config_enabled:
                conf_data['form_config'] = f_path
            else:
                proj_data['form_config'] = f_path
        elif form_target == 'config':
            if form_cfg:
                conf_data['form_config'] = form_cfg
        elif form_target == 'project':
            if form_cfg:
                proj_data['form_config'] = form_cfg
        elif not form_enabled and form_cfg:
            conf_data['form_config'] = form_cfg

        project_cfg = {}
        for k in ('project_name',):
            if k in self._project:
                project_cfg[k] = self._project[k]

        if config_enabled and project_enabled:
            project_cfg['config'] = c_path
            project_cfg.update(proj_data)
            config_cfg = dict(conf_data)
        elif not config_enabled and project_enabled:
            project_cfg.update(proj_data)
            project_cfg.update(conf_data)
            config_cfg = {}
        elif config_enabled and not project_enabled:
            config_cfg = {}
            config_cfg.update(proj_data)
            config_cfg.update(conf_data)
        else:
            config_cfg = {}

        return {
            'project_cfg': project_cfg,
            'config_cfg': config_cfg,
            'form_cfg': form_cfg,
            'project_enabled': project_enabled,
            'config_enabled': config_enabled,
            'form_enabled': form_enabled,
            'p_path': p_path,
            'c_path': c_path,
            'f_path': f_path,
        }

    def save_all(self) -> dict:
        """Save all configuration files."""
        _log.info('save_all() cwd=%s', os.getcwd())
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        yaml.add_representer(_LiteralStr, _literal_representer)
        fc = self._build_file_contents()
        project_cfg = fc['project_cfg']
        config_cfg = fc['config_cfg']
        form_cfg = fc['form_cfg']
        project_enabled = fc['project_enabled']
        config_enabled = fc['config_enabled']
        form_enabled = fc['form_enabled']
        p_path = fc['p_path']
        c_path = fc['c_path']
        f_path = fc['f_path']

        saved = {}

        if project_enabled:
            p_path = _ensure_ext(p_path)
            os.makedirs(os.path.dirname(p_path) or '.', exist_ok=True)
            with open(p_path, 'w') as f:
                yaml.dump(_prep_for_yaml(project_cfg), f,
                          default_flow_style=False, sort_keys=False)
            saved['project'] = p_path
            _log.info('saved project: %s', p_path)

        if config_enabled:
            c_path = _ensure_ext(c_path)
            os.makedirs(os.path.dirname(c_path) or '.', exist_ok=True)
            with open(c_path, 'w') as f:
                yaml.dump(_prep_for_yaml(config_cfg), f,
                          default_flow_style=False, sort_keys=False)
            saved['config'] = c_path
            _log.info('saved config: %s', c_path)

        if form_enabled:
            f_path = _ensure_ext(f_path)
            os.makedirs(os.path.dirname(f_path) or '.', exist_ok=True)
            with open(f_path, 'w') as f:
                yaml.dump(_prep_for_yaml(form_cfg), f,
                          default_flow_style=False, sort_keys=False)
            saved['form'] = f_path
            _log.info('saved form: %s', f_path)

        self._saved_path = saved.get('project') or saved.get('config') or saved.get('form', '')
        self._dirty = False
        return saved

    def save_single(self, config_type: str = 'project') -> str:
        """Save a single configuration file."""
        _log.info('save_single(%s)', config_type)
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        fc = self._build_file_contents()
        if config_type == 'project':
            path = fc['p_path']
            content = fc['project_cfg']
        elif config_type == 'config':
            path = fc['c_path']
            content = fc['config_cfg']
        elif config_type == 'form_config':
            path = fc['f_path']
            content = fc['form_cfg']
        else:
            return ''

        path = _ensure_ext(path)
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        yaml.add_representer(_LiteralStr, _literal_representer)
        with open(path, 'w') as f:
            yaml.dump(_prep_for_yaml(content), f,
                      default_flow_style=False, sort_keys=False)
        _log.info('saved %s: %s', config_type, path)
        return path

    def list_files(self, directory: str, extensions: list | None = None) -> list:
        """List files in directory with optional extension filtering."""
        try:
            entries = os.listdir(directory)
        except (OSError, FileNotFoundError) as e:
            _log.warning('list_files failed for %s: %s', directory, e)
            return []
        results = []
        for e in sorted(entries):
            if e.startswith('.'):
                continue
            full = os.path.join(directory, e)
            is_dir = os.path.isdir(full)
            if is_dir:
                results.append({'name': e, 'is_dir': True})
            elif extensions:
                if e.lower().endswith(tuple(extensions)):
                    results.append({'name': e, 'is_dir': False})
            else:
                results.append({'name': e, 'is_dir': False})
        return results

    def read_columns(self, filepath: str) -> list:
        """Read column names from a data file."""
        _log.debug('read_columns: %s', filepath)
        ext = os.path.splitext(filepath)[1].lower()
        try:
            if ext == '.csv':
                import pandas as pd
                df = pd.read_csv(filepath, nrows=0)
                return list(df.columns)
            elif ext == '.parquet':
                import pandas as pd
                df = pd.read_parquet(filepath, columns=[])
                return list(df.columns)
            elif ext in ('.json', '.jsonl'):
                import pandas as pd
                df = pd.read_json(filepath, lines=(ext == '.jsonl'), nrows=1)
                return list(df.columns)
        except Exception as e:
            _log.warning('read_columns failed for %s: %s', filepath, e)
        return []

    def read_sample_data(self, filepath: str, n_rows: int = 5) -> list:
        """Read sample data from a file."""
        _log.debug('read_sample_data: %s (n_rows=%d)', filepath, n_rows)
        ext = os.path.splitext(filepath)[1].lower()
        try:
            if ext == '.csv':
                import pandas as pd
                df = pd.read_csv(filepath, nrows=n_rows)
                return json.loads(df.to_json(orient='records'))
            elif ext == '.parquet':
                import pandas as pd
                df = pd.read_parquet(filepath).head(n_rows)
                return json.loads(df.to_json(orient='records'))
        except Exception as e:
            _log.warning('read_sample_data failed for %s: %s', filepath, e)
        return []

    def _get_state(self) -> dict:
        fc = self._build_file_contents()
        project_content = fc['project_cfg']
        config_content = fc['config_cfg']
        form_content = fc['form_cfg']
        project_enabled = fc['project_enabled']
        config_enabled = fc['config_enabled']
        form_enabled = fc['form_enabled']

        try:
            import yaml
            yaml.add_representer(_LiteralStr, _literal_representer)
            project_yaml = yaml.dump(
                _prep_for_yaml(project_content), default_flow_style=False,
                sort_keys=False
            ) if project_content and project_enabled else ''
            config_yaml = yaml.dump(
                _prep_for_yaml(config_content), default_flow_style=False,
                sort_keys=False
            ) if config_content and config_enabled else ''
            form_yaml = yaml.dump(
                _prep_for_yaml(form_content), default_flow_style=False,
                sort_keys=False
            ) if form_content and form_enabled else ''
        except ImportError:
            project_yaml = json.dumps(project_content, indent=2) if project_enabled else ''
            config_yaml = json.dumps(config_content, indent=2) if config_enabled else ''
            form_yaml = json.dumps(form_content, indent=2) if form_enabled else ''

        return {
            'project': self._project,
            'config': self._config,
            'form_config': self._form_config,
            'project_yaml': project_yaml,
            'config_yaml': config_yaml,
            'form_yaml': form_yaml,
            'section_targets': self._section_targets,
            'saved_path': self._saved_path or '',
            'dirty': self._dirty,
        }

    def update_config_from_yaml(self, yaml_str: str, config_type: str = 'project') -> bool:
        """Update configuration from YAML string."""
        _log.debug('update_config_from_yaml(%s) len=%d', config_type, len(yaml_str))
        try:
            import yaml
            parsed = yaml.safe_load(yaml_str) or {}
        except Exception as e:
            _log.warning('YAML parse failed for %s: %s', config_type, e)
            return False

        if config_type == 'project':
            if 'project_name' in parsed:
                self._project['project_name'] = parsed.pop('project_name')
            elif 'project_name' in self._project:
                del self._project['project_name']
            config_ref = parsed.pop('config', None)
            if isinstance(config_ref, str):
                self._project['config_path'] = config_ref
            form_ref = parsed.pop('form_config', None)
            if isinstance(form_ref, str):
                self._project['form_path'] = form_ref
            elif isinstance(form_ref, dict):
                self._form_config = form_ref
            for k in list(self._project.keys()):
                if k not in SKIP_KEYS:
                    del self._project[k]
            for k, v in parsed.items():
                if k not in SKIP_KEYS:
                    self._project[k] = v
        elif config_type == 'config':
            form_ref = parsed.pop('form_config', None)
            for k in list(self._config.keys()):
                self._config.pop(k)
            for k, v in parsed.items():
                if k not in SKIP_KEYS:
                    self._config[k] = v
            if isinstance(form_ref, str):
                self._project['form_path'] = form_ref
            elif isinstance(form_ref, dict):
                self._form_config = form_ref
        elif config_type == 'form_config':
            self._form_config = parsed

        self._dirty = True
        return True

    def load_config(self, path: str, file_type: str | None = None) -> dict:
        """Load configuration from file."""
        _log.debug('load_config(%s, file_type=%s) cwd=%s', path, file_type, os.getcwd())
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        if not os.path.exists(path):
            raise FileNotFoundError(path)

        with open(path) as f:
            data = yaml.safe_load(f) or {}

        base_dir = os.path.dirname(path) or '.'
        detected = 'config'
        loaded_paths = {'loaded': path}

        has_form_key = 'form' in data and 'form_config' not in data
        has_config_key = 'config' in data and isinstance(data.get('config'), str)
        has_data = 'data' in data
        has_audio = 'audio' in data
        fully_specified = has_data and has_audio and ('form_config' in data or has_form_key)

        if file_type in ('project', 'config', 'form'):
            detected = file_type
        elif has_form_key and not has_data and not has_audio and not has_config_key:
            detected = 'form'
        elif has_config_key or fully_specified:
            detected = 'project'
        else:
            detected = 'config'

        if detected == 'form':
            self._form_config = data
            rel_form = _to_cwd_relative(path)
            self._project['form_path'] = rel_form
            self._project['form_enabled'] = True
            self._project['project_enabled'] = False
            self._project['config_enabled'] = False
            loaded_paths['form'] = rel_form

        elif detected == 'project':
            for k in ('project_name',):
                if k in data:
                    self._project[k] = data[k]
            rel_project = _to_cwd_relative(path)
            self._project['project_path'] = rel_project
            self._project['project_enabled'] = True
            loaded_paths['project'] = rel_project

            for k, v in data.items():
                if k not in SKIP_KEYS and k != 'config' and k != 'form_config':
                    self._project[k] = v

            config_ref = data.get('config')
            if isinstance(config_ref, str):
                config_path = _resolve_path(config_ref, base_dir)
                _log.debug('config ref=%s base_dir=%s resolved=%s',
                           config_ref, base_dir, config_path)
                if config_path:
                    rel_config = _to_cwd_relative(config_path)
                    self._project['config_path'] = rel_config
                    with open(config_path) as f:
                        config_data = yaml.safe_load(f) or {}
                    self._project['config_enabled'] = True
                    loaded_paths['config'] = rel_config

                    form_ref = config_data.pop('form_config', None)
                    for k, v in config_data.items():
                        if k not in SKIP_KEYS:
                            self._config[k] = v

                    for s in SECTION_KEYS:
                        if s in self._project and s in self._config:
                            self._section_targets[s] = 'split'
                        elif s in self._config:
                            self._section_targets[s] = 'config'
                        else:
                            self._section_targets[s] = 'project'
                    for s in APP_KEYS:
                        if s in self._config:
                            self._section_targets['app'] = 'config'
                            break
                    else:
                        self._section_targets['app'] = 'project'

                    if isinstance(form_ref, str):
                        form_path = _resolve_path(form_ref,
                                                  os.path.dirname(config_path) or base_dir)
                        if not form_path:
                            form_path = _resolve_path(form_ref, base_dir)
                        if form_path:
                            rel_form = _to_cwd_relative(form_path)
                            with open(form_path) as f:
                                self._form_config = yaml.safe_load(f) or {}
                            self._project['form_path'] = rel_form
                            self._project['form_enabled'] = True
                            loaded_paths['form'] = rel_form
                        else:
                            self._project['form_enabled'] = False
                    elif isinstance(form_ref, dict):
                        self._form_config = form_ref
                        self._project['form_enabled'] = False
                    else:
                        self._project['form_enabled'] = False
                else:
                    self._project['config_path'] = _to_cwd_relative(
                        os.path.normpath(os.path.join(base_dir, config_ref))
                    )
                    _log.warning('config ref not found: %s (tried %s and cwd %s)',
                                 config_ref, os.path.join(base_dir, config_ref),
                                 os.getcwd())
                    self._project['config_enabled'] = True
                    self._project['form_enabled'] = False
                    for s in ('data', 'audio', 'output', 'app'):
                        self._section_targets[s] = 'project'
            else:
                self._project['config_enabled'] = False
                for s in ('data', 'audio', 'output', 'app'):
                    self._section_targets[s] = 'project'
                form_ref = data.get('form_config')
                if isinstance(form_ref, str):
                    form_path = _resolve_path(form_ref, base_dir)
                    if form_path:
                        rel_form = _to_cwd_relative(form_path)
                        with open(form_path) as f:
                            self._form_config = yaml.safe_load(f) or {}
                        self._project['form_path'] = rel_form
                        self._project['form_enabled'] = True
                        loaded_paths['form'] = rel_form
                    else:
                        self._project['form_enabled'] = False
                elif isinstance(form_ref, dict):
                    self._form_config = form_ref
                    self._project['form_enabled'] = False

        elif detected == 'config':
            rel_config = _to_cwd_relative(path)
            self._project['config_path'] = rel_config
            self._project['config_enabled'] = True
            self._project['project_enabled'] = False
            loaded_paths['config'] = rel_config

            for s in ('data', 'audio', 'output', 'app'):
                self._section_targets[s] = 'config'

            form_ref = data.pop('form_config', None)
            for k, v in data.items():
                if k not in SKIP_KEYS:
                    self._config[k] = v

            if isinstance(form_ref, str):
                form_path = _resolve_path(form_ref, base_dir)
                if form_path:
                    rel_form = _to_cwd_relative(form_path)
                    with open(form_path) as f:
                        self._form_config = yaml.safe_load(f) or {}
                    self._project['form_path'] = rel_form
                    self._project['form_enabled'] = True
                    loaded_paths['form'] = rel_form
                else:
                    self._project['form_enabled'] = False
            elif isinstance(form_ref, dict):
                self._form_config = form_ref
                self._project['form_enabled'] = False
            else:
                self._project['form_enabled'] = False

        self._dirty = False
        _log.debug('load_config result: detected=%s loaded_paths=%s', detected, loaded_paths)
        state = self._get_state()
        state['detected_type'] = detected
        state['loaded_paths'] = loaded_paths
        return state

    def list_templates(self) -> list:
        """List available "create from template" definitions."""
        from .templates import list_templates
        return list_templates()

    def load_template(self, name: str) -> dict:
        """Load the full parsed template dict for ``name`` (file stem)."""
        from .templates import load_template
        return load_template(name)

    def apply_template(
        self,
        name: str,
        scope: str,
        project_name: str,
        values: dict | None = None,
    ) -> dict:
        """Apply a template at ``scope`` with the user's ``values`` and load the result.

        Substitutes the user's values into the template's per-section configuration,
        loads them into the three dicts, sets the project name / enabled flags /
        section targets so saving produces linked project/config/form files, and
        returns the resulting state (same shape as ``load_config``).
        """
        from .templates import build_template_config
        template = self.load_template(name)
        sections = build_template_config(template, scope, values or {})

        self._project = {}
        self._config = {}
        self._form_config = {}
        if 'project' in sections:
            self._project.update(sections['project'])
        if 'config' in sections:
            self._config.update(sections['config'])
        if 'form' in sections:
            self._form_config = sections['form']

        if project_name:
            self._project['project_name'] = project_name
            slug = re.sub(r'[^a-z0-9]+', '_', project_name.lower()).strip('_')
            self._project['project_path'] = f'annotator_config/{DEFAULT_PROJECT_DIR}/{slug}.yaml'
            self._project['config_path'] = f'annotator_config/{DEFAULT_CONFIG_DIR}/{slug}.yaml'
            self._project['form_path'] = f'annotator_config/{DEFAULT_FORM_DIR}/{slug}.yaml'
        self._project['project_enabled'] = scope == 'project'
        self._project['config_enabled'] = scope in ('project', 'config')
        self._project['form_enabled'] = bool(self._form_config)
        self._section_targets.update({
            'data': 'project', 'audio': 'project', 'output': 'project',
            'app': 'config', 'form': 'form_config',
        })
        self._saved_path = None
        self._dirty = True
        _log.info('apply_template(%s) scope=%s name=%s', name, scope, project_name)
        return self._get_state()

    def validate(self) -> dict:
        """Validate configuration and return errors/warnings."""
        return validate_config(
            config=self._config or None,
            form_config=self._form_config or None,
            project=self._project or None,
        )

    def setup(self) -> None:
        """Setup ConfigBuilder in Jupyter environment."""
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'ConfigBuilder.setup() must be called from inside a Jupyter kernel.'
            )
        ip.user_ns['_CB_INSTANCE'] = self
        ip.user_ns['_CB_STATE'] = json.dumps(self._get_state())

    def open(self, inline: bool = True) -> None:
        """Open the configuration builder interface."""
        self.setup()
        if inline:
            self._open_inline()
        else:
            display(HTML(
                "<script>"
                "window._bioacousticApp?.commands.execute('bioacoustic:open-config-builder')"
                "</script>"
            ))

    def _open_inline(self) -> None:
        div_id = f'config-builder-{uuid.uuid4().hex[:8]}'
        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:100%;height:700px;'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:hidden;position:relative;resize:both;'
            f'"></div>'
            f'<script>'
            f'(function() {{'
            f'  function tryAttach(retries) {{'
            f'    var el = document.getElementById("{div_id}");'
            f'    if (el && window._bioacousticOpenConfigBuilder) {{'
            f'      window._bioacousticOpenConfigBuilder("{div_id}");'
            f'    }} else if (retries > 0) {{'
            f'      setTimeout(function() {{ tryAttach(retries - 1); }}, 200);'
            f'    }}'
            f'  }}'
            f'  tryAttach(25);'
            f'}})();'
            f'</script>'
        ))