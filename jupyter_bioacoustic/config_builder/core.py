"""
ConfigBuilder — GUI-driven configuration file builder for BioacousticAnnotator.

Usage:
    from jupyter_bioacoustic import ConfigBuilder
    ConfigBuilder().open()
"""

import json
import os
import re
import uuid

from IPython import get_ipython
from IPython.display import display, HTML


_UNSET = object()
DEFAULT_PATH = 'projects'


def _resolve_path(ref, base_dir):
    if os.path.isabs(ref):
        return ref if os.path.exists(ref) else None
    candidate = os.path.join(base_dir, ref)
    if os.path.exists(candidate):
        return candidate
    if os.path.exists(ref):
        return ref
    return None


class ConfigBuilder:
    def __init__(self, path=DEFAULT_PATH):
        self._path = path
        self._project = {}
        self._config = {}
        self._form_config = {}
        self._section_targets = {
            'project': 'project',
            'data': 'project',
            'audio': 'project',
            'output': 'project',
            'app': 'config',
            'form': 'form_config',
        }
        self._saved_path = None
        self._dirty = False

    def get_config(self, config_type='project'):
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

    def get_merged_config(self):
        cfg = dict(self._project)
        cfg.update(self._config)
        if self._form_config:
            cfg['form_config'] = dict(self._form_config)
        return cfg

    def update_section(self, section, data):
        target = self._section_targets.get(section, 'project')

        if section == 'project':
            for k in ('project_name', 'project_path', 'config_path',
                      'form_path', 'project_enabled', 'config_enabled', 'form_enabled'):
                if k in data:
                    self._project[k] = data[k]
            for k in ('description', 'description_title', 'description_text',
                      'description_path', 'description_open', 'description_height'):
                if k in data:
                    val = data[k]
                    if val is not None and val != '' and val != []:
                        self._project[k] = val
                    elif k in self._project:
                        del self._project[k]

        elif section == 'data':
            data_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    data_dict[k] = v
            dest = self._project if target == 'project' else self._config
            dest['data'] = data_dict

        elif section == 'audio':
            audio_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    audio_dict[k] = v
            if target == 'project':
                self._project['audio'] = audio_dict
            else:
                self._config['audio'] = audio_dict

        elif section == 'output':
            output_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    output_dict[k] = v
            if target == 'project':
                self._project['output'] = output_dict
            else:
                self._config['output'] = output_dict

        elif section == 'app':
            app_keys = (
                'project_save_btn', 'ident_column', 'display_columns',
                'duplicate_entries', 'default_buffer', 'capture', 'capture_dir',
                'spectrogram_resolution', 'visualizations', 'partial_download',
                'width', 'clip_table_height', 'player_height',
                'info_card_height', 'form_panel_height',
                'description', 'description_title', 'description_text',
                'description_path', 'description_open', 'description_height',
                'secrets',
            )
            dest = self._project if target == 'project' else self._config
            for k in app_keys:
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

    def set_section_target(self, section, target):
        if section not in self._section_targets or target not in ('project', 'config', 'form_config'):
            return
        old_target = self._section_targets[section]
        self._section_targets[section] = target

        if section in ('data', 'audio', 'output') and old_target != target:
            old_dict = self._project if old_target == 'project' else self._config
            new_dict = self._project if target == 'project' else self._config
            if section in old_dict:
                new_dict[section] = old_dict.pop(section)
        if section == 'app' and old_target != target:
            app_keys = (
                'project_save_btn', 'ident_column', 'display_columns',
                'duplicate_entries', 'default_buffer', 'capture', 'capture_dir',
                'spectrogram_resolution', 'visualizations', 'partial_download',
                'width', 'clip_table_height', 'player_height',
                'info_card_height', 'form_panel_height',
                'description', 'description_title', 'description_text',
                'description_path', 'description_open', 'description_height',
                'secrets',
            )
            old_dict = self._project if old_target == 'project' else self._config
            new_dict = self._project if target == 'project' else self._config
            for k in app_keys:
                if k in old_dict:
                    new_dict[k] = old_dict.pop(k)

    def save(self, path=None, config_type='project'):
        return self.save_all()

    def _build_file_contents(self):
        name = self._project.get('project_name', 'config')
        slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')

        project_enabled = self._project.get('project_enabled', True)
        config_enabled = self._project.get('config_enabled', True)
        form_enabled = self._project.get('form_enabled', True)

        p_path = self._project.get('project_path') or f'config/projects/{slug}.yaml'
        c_path = self._project.get('config_path') or f'config/application/{slug}.yaml'
        f_path = self._project.get('form_path') or f'config/forms/{slug}.yaml'

        skip_keys = ('project_name', 'project_path', 'config_path',
                     'form_path', 'project_enabled', 'config_enabled', 'form_enabled')
        section_keys = ('data', 'audio', 'output')
        app_keys = (
            'project_save_btn', 'ident_column', 'display_columns',
            'duplicate_entries', 'default_buffer', 'capture', 'capture_dir',
            'spectrogram_resolution', 'visualizations', 'partial_download',
            'width', 'clip_table_height', 'player_height',
            'info_card_height', 'form_panel_height',
            'description', 'description_title', 'description_text',
            'description_path', 'description_open', 'description_height',
            'secrets',
        )

        form_cfg = dict(self._form_config) if self._form_config else {}

        proj_data = {}
        conf_data = {}

        for k, v in self._project.items():
            if k in skip_keys:
                continue
            if k in section_keys:
                if self._section_targets.get(k, 'project') == 'project':
                    proj_data[k] = v
                else:
                    conf_data[k] = v
            elif k in app_keys:
                if self._section_targets.get('app', 'project') == 'project':
                    proj_data[k] = v
                else:
                    conf_data[k] = v
            else:
                proj_data[k] = v

        for k, v in self._config.items():
            if k in section_keys:
                if self._section_targets.get(k, 'project') == 'config':
                    conf_data[k] = v
                else:
                    proj_data[k] = v
            elif k in app_keys:
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

    def save_all(self):
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

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
            if not p_path.endswith(('.yaml', '.yml')):
                p_path += '.yaml'
            os.makedirs(os.path.dirname(p_path) or '.', exist_ok=True)
            with open(p_path, 'w') as f:
                yaml.dump(project_cfg, f, default_flow_style=False, sort_keys=False)
            saved['project'] = p_path

        if config_enabled:
            if not c_path.endswith(('.yaml', '.yml')):
                c_path += '.yaml'
            os.makedirs(os.path.dirname(c_path) or '.', exist_ok=True)
            with open(c_path, 'w') as f:
                yaml.dump(config_cfg, f, default_flow_style=False, sort_keys=False)
            saved['config'] = c_path

        if form_enabled:
            if not f_path.endswith(('.yaml', '.yml')):
                f_path += '.yaml'
            os.makedirs(os.path.dirname(f_path) or '.', exist_ok=True)
            with open(f_path, 'w') as f:
                yaml.dump(form_cfg, f, default_flow_style=False, sort_keys=False)
            saved['form'] = f_path

        self._saved_path = saved.get('project') or saved.get('config') or saved.get('form', '')
        self._dirty = False
        return saved

    def save_single(self, config_type='project'):
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

        if not path.endswith(('.yaml', '.yml')):
            path += '.yaml'
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w') as f:
            yaml.dump(content, f, default_flow_style=False, sort_keys=False)
        return path

    def list_files(self, directory, extensions=None):
        try:
            entries = os.listdir(directory)
        except (OSError, FileNotFoundError):
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

    def read_columns(self, filepath):
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
        except Exception:
            pass
        return []

    def read_sample_data(self, filepath, n_rows=5):
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
        except Exception:
            pass
        return []

    def _get_state(self):
        fc = self._build_file_contents()
        project_content = fc['project_cfg']
        config_content = fc['config_cfg']
        form_content = fc['form_cfg']
        project_enabled = fc['project_enabled']
        config_enabled = fc['config_enabled']
        form_enabled = fc['form_enabled']

        try:
            import yaml
            project_yaml = yaml.dump(
                project_content, default_flow_style=False, sort_keys=False
            ) if project_content and project_enabled else ''
            config_yaml = yaml.dump(
                config_content, default_flow_style=False, sort_keys=False
            ) if config_content and config_enabled else ''
            form_yaml = yaml.dump(
                form_content, default_flow_style=False, sort_keys=False
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

    def update_config_from_yaml(self, yaml_str, config_type='project'):
        try:
            import yaml
            parsed = yaml.safe_load(yaml_str) or {}
        except Exception:
            return False

        if config_type == 'project':
            for k in ('project_name',):
                if k in parsed:
                    self._project[k] = parsed[k]
                elif k in self._project:
                    del self._project[k]
            if 'config' in parsed and isinstance(parsed['config'], str):
                self._project['config_path'] = parsed['config']
        elif config_type == 'config':
            form_ref = parsed.pop('form_config', None)
            skip = ('project_name', 'project_path', 'config_path', 'form_path')
            for k in list(self._project.keys()):
                if k not in skip:
                    del self._project[k]
            for k, v in parsed.items():
                if k not in skip:
                    self._project[k] = v
            if form_ref and isinstance(form_ref, str):
                self._project['form_path'] = form_ref
        elif config_type == 'form_config':
            self._form_config = parsed

        self._dirty = True
        return True

    def load_config(self, path, file_type=None):
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

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
            loaded_paths['form'] = path

        elif detected == 'project':
            skip_keys = ('project_name', 'project_path', 'config_path',
                         'form_path', 'project_enabled', 'config_enabled', 'form_enabled')
            for k in ('project_name',):
                if k in data:
                    self._project[k] = data[k]
            self._project['project_path'] = path
            self._project['project_enabled'] = True
            loaded_paths['project'] = path

            for s in ('data', 'audio', 'output', 'app'):
                self._section_targets[s] = 'project'

            config_ref = data.get('config')
            if isinstance(config_ref, str):
                config_path = _resolve_path(config_ref, base_dir)
                if config_path:
                    with open(config_path) as f:
                        config_data = yaml.safe_load(f) or {}
                    self._project['config_path'] = config_ref
                    self._project['config_enabled'] = True
                    loaded_paths['config'] = config_ref

                    form_ref = config_data.pop('form_config', None)
                    for k, v in config_data.items():
                        if k not in skip_keys:
                            self._project[k] = v

                    if isinstance(form_ref, str):
                        form_path = _resolve_path(form_ref, base_dir)
                        if form_path:
                            with open(form_path) as f:
                                self._form_config = yaml.safe_load(f) or {}
                            self._project['form_path'] = form_ref
                            self._project['form_enabled'] = True
                            loaded_paths['form'] = form_ref
                        else:
                            self._project['form_enabled'] = False
                    elif isinstance(form_ref, dict):
                        self._form_config = form_ref
                        self._project['form_enabled'] = False
                    else:
                        self._project['form_enabled'] = False
                else:
                    self._project['config_enabled'] = False
                    self._project['form_enabled'] = False
            else:
                self._project['config_enabled'] = False
                form_ref = data.get('form_config')
                for k, v in data.items():
                    if k not in skip_keys and k != 'config':
                        self._project[k] = v
                if isinstance(form_ref, str):
                    form_path = _resolve_path(form_ref, base_dir)
                    if form_path:
                        with open(form_path) as f:
                            self._form_config = yaml.safe_load(f) or {}
                        self._project['form_path'] = form_ref
                        self._project['form_enabled'] = True
                        loaded_paths['form'] = form_ref
                    else:
                        self._project['form_enabled'] = False
                elif isinstance(form_ref, dict):
                    self._form_config = form_ref
                    self._project['form_enabled'] = False

        elif detected == 'config':
            self._project['config_path'] = path
            self._project['config_enabled'] = True
            self._project['project_enabled'] = False
            loaded_paths['config'] = path

            for s in ('data', 'audio', 'output', 'app'):
                self._section_targets[s] = 'config'

            skip_keys = ('project_name', 'project_path', 'config_path',
                         'form_path', 'project_enabled', 'config_enabled', 'form_enabled')
            form_ref = data.pop('form_config', None)
            for k, v in data.items():
                if k not in skip_keys:
                    self._config[k] = v

            if isinstance(form_ref, str):
                form_path = _resolve_path(form_ref, base_dir)
                if form_path:
                    with open(form_path) as f:
                        self._form_config = yaml.safe_load(f) or {}
                    self._project['form_path'] = form_ref
                    self._project['form_enabled'] = True
                    loaded_paths['form'] = form_ref
                else:
                    self._project['form_enabled'] = False
            elif isinstance(form_ref, dict):
                self._form_config = form_ref
                self._project['form_enabled'] = False
            else:
                self._project['form_enabled'] = False

        self._dirty = False
        state = self._get_state()
        state['detected_type'] = detected
        state['loaded_paths'] = loaded_paths
        return state

    def validate(self):
        errors = []
        warnings = []
        fc = self._form_config or {}

        defined_forms = set()
        dyn = fc.get('dynamic_forms')
        if isinstance(dyn, list):
            for item in dyn:
                if isinstance(item, dict):
                    defined_forms.update(item.keys())
        elif isinstance(dyn, dict):
            defined_forms.update(dyn.keys())

        referenced_forms = set()

        def _scan_items(items):
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict) and 'form' in it:
                        referenced_forms.add(it['form'])

        def _scan_elements(elements):
            if not isinstance(elements, list):
                return
            for el in elements:
                if not isinstance(el, dict):
                    continue
                for etype, ecfg in el.items():
                    if not isinstance(ecfg, dict):
                        continue
                    if etype == 'select' and 'items' in ecfg:
                        _scan_items(ecfg['items'])
                    if etype == 'checkbox':
                        for fkey in ('checked_form', 'unchecked_form'):
                            if ecfg.get(fkey):
                                referenced_forms.add(ecfg[fkey])

        form_list = fc.get('form')
        if isinstance(form_list, list):
            _scan_elements(form_list)

        for top_key in ('select', 'checkbox'):
            if top_key in fc and isinstance(fc[top_key], dict):
                cfg = fc[top_key]
                if top_key == 'select' and 'items' in cfg:
                    _scan_items(cfg['items'])
                for fkey in ('checked_form', 'unchecked_form'):
                    if cfg.get(fkey):
                        referenced_forms.add(cfg[fkey])

        if isinstance(dyn, list):
            for item in dyn:
                if isinstance(item, dict):
                    for _, elems in item.items():
                        _scan_elements(elems if isinstance(elems, list) else [])
        elif isinstance(dyn, dict):
            for _, elems in dyn.items():
                _scan_elements(elems if isinstance(elems, list) else [])

        missing_forms = referenced_forms - defined_forms
        unreferenced_forms = defined_forms - referenced_forms

        if 'annotation' in fc and isinstance(fc['annotation'], dict):
            annot_form = fc['annotation'].get('form')
            if annot_form:
                referenced_forms.add(annot_form)
                if annot_form in unreferenced_forms:
                    unreferenced_forms.discard(annot_form)
                if annot_form not in defined_forms:
                    missing_forms.add(annot_form)

        for f in sorted(missing_forms):
            errors.append(f'Referenced dynamic form "{f}" is not defined')
        for f in sorted(unreferenced_forms):
            warnings.append(f'Dynamic form "{f}" is defined but never referenced')

        has_form = bool(fc.get('form'))
        has_legacy = any(k in fc for k in ('select', 'textbox', 'checkbox', 'number'))
        has_annotation = 'annotation' in fc
        if not has_form and not has_legacy and not has_annotation:
            warnings.append('No form input elements configured')

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
        }

    def setup(self):
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'ConfigBuilder.setup() must be called from inside a Jupyter kernel.'
            )
        ip.user_ns['_CB_INSTANCE'] = self
        ip.user_ns['_CB_STATE'] = json.dumps(self._get_state())

    def open(self, inline=True):
        self.setup()
        if inline:
            self._open_inline()
        else:
            display(HTML(
                "<script>"
                "window._bioacousticApp?.commands.execute('bioacoustic:open-config-builder')"
                "</script>"
            ))

    def _open_inline(self):
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
