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
            'app': 'project',
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
            for k in ('project_name', 'project_save_btn', 'project_path', 'config_path',
                      'form_path', 'project_enabled', 'config_enabled', 'form_enabled'):
                if k in data:
                    self._project[k] = data[k]

        elif section == 'data':
            data_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    data_dict[k] = v
            if target == 'project':
                self._project['data'] = data_dict
            else:
                self._config['data'] = data_dict

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
                'ident_column', 'display_columns', 'data_columns',
                'duplicate_entries', 'default_buffer', 'capture', 'capture_dir',
                'spectrogram_resolution', 'visualizations', 'partial_download',
                'width', 'clip_table_height', 'player_height',
                'info_card_height', 'form_panel_height',
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
        if section in self._section_targets and target in ('project', 'config', 'form_config'):
            self._section_targets[section] = target

    def save(self, path=None, config_type='project'):
        return self.save_all()

    def save_all(self):
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        name = self._project.get('project_name', 'config')
        slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')

        project_enabled = self._project.get('project_enabled', True)
        config_enabled = self._project.get('config_enabled', True)
        form_enabled = self._project.get('form_enabled', True)

        p_path = self._project.get('project_path') or f'config/projects/{slug}.yaml'
        c_path = self._project.get('config_path') or f'config/application/{slug}.yaml'
        f_path = self._project.get('form_path') or f'config/forms/{slug}.yaml'

        skip_keys = ('project_name', 'project_save_btn', 'project_path', 'config_path',
                     'form_path', 'project_enabled', 'config_enabled', 'form_enabled')

        form_cfg = dict(self._form_config) if self._form_config else {}

        config_cfg = {}
        for k, v in self._project.items():
            if k in skip_keys:
                continue
            config_cfg[k] = v
        if self._config:
            config_cfg.update(self._config)

        if form_enabled and config_enabled:
            config_cfg['form_config'] = f_path
        elif not form_enabled and config_enabled:
            if form_cfg:
                config_cfg['form_config'] = form_cfg

        project_cfg = {}
        for k in ('project_name', 'project_save_btn'):
            if k in self._project:
                project_cfg[k] = self._project[k]

        if config_enabled and project_enabled:
            project_cfg['config'] = c_path
        elif not config_enabled and project_enabled:
            project_cfg.update(config_cfg)

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

        name = self._project.get('project_name', 'config')
        slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')

        skip_keys = ('project_name', 'project_save_btn', 'project_path', 'config_path',
                     'form_path', 'project_enabled', 'config_enabled', 'form_enabled')

        if config_type == 'project':
            path = self._project.get('project_path') or f'config/projects/{slug}.yaml'
            content = {}
            for k in ('project_name', 'project_save_btn'):
                if k in self._project:
                    content[k] = self._project[k]
            c_path = self._project.get('config_path') or f'config/application/{slug}.yaml'
            content['config'] = c_path
        elif config_type == 'config':
            path = self._project.get('config_path') or f'config/application/{slug}.yaml'
            content = {}
            for k, v in self._project.items():
                if k in skip_keys:
                    continue
                content[k] = v
            if self._config:
                content.update(self._config)
            f_path = self._project.get('form_path') or f'config/forms/{slug}.yaml'
            if self._form_config:
                content['form_config'] = f_path
        elif config_type == 'form_config':
            path = self._project.get('form_path') or f'config/forms/{slug}.yaml'
            content = dict(self._form_config) if self._form_config else {}
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
        name = self._project.get('project_name', 'config')
        slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')

        project_enabled = self._project.get('project_enabled', True)
        config_enabled = self._project.get('config_enabled', True)
        form_enabled = self._project.get('form_enabled', True)

        c_path = self._project.get('config_path') or f'config/application/{slug}.yaml'
        f_path = self._project.get('form_path') or f'config/forms/{slug}.yaml'

        skip_keys = ('project_name', 'project_save_btn', 'project_path', 'config_path',
                     'form_path', 'project_enabled', 'config_enabled', 'form_enabled')

        form_content = dict(self._form_config) if self._form_config else {}

        config_content = {}
        for k, v in self._project.items():
            if k in skip_keys:
                continue
            config_content[k] = v
        if self._config:
            config_content.update(self._config)

        if form_enabled and config_enabled:
            config_content['form_config'] = f_path
        elif not form_enabled and config_enabled:
            if form_content:
                config_content['form_config'] = form_content

        project_content = {}
        for k in ('project_name', 'project_save_btn'):
            if k in self._project:
                project_content[k] = self._project[k]

        if config_enabled and project_enabled:
            project_content['config'] = c_path
        elif not config_enabled and project_enabled:
            project_content.update(config_content)

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
            for k in ('project_name', 'project_save_btn'):
                if k in parsed:
                    self._project[k] = parsed[k]
                elif k in self._project:
                    del self._project[k]
            if 'config' in parsed and isinstance(parsed['config'], str):
                self._project['config_path'] = parsed['config']
        elif config_type == 'config':
            form_ref = parsed.pop('form_config', None)
            skip = ('project_name', 'project_save_btn', 'project_path', 'config_path', 'form_path')
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
