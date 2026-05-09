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
            for k in ('project_name', 'project_save_btn'):
                if k in data:
                    self._project[k] = data[k]

        elif section == 'data':
            data_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    data_dict[k] = v
            if target == 'project':
                self._project['data'] = data_dict if len(data_dict) > 1 or 'path' not in data_dict else data_dict.get('path', '')
                for k in ('data_columns', 'data_start_time', 'data_end_time', 'data_duration'):
                    if k in data:
                        self._project[k] = data[k]
                    elif k in self._project:
                        del self._project[k]
            else:
                self._config['data'] = data_dict

        elif section == 'audio':
            audio_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    audio_dict[k] = v
            if target == 'project':
                self._project['audio'] = audio_dict if len(audio_dict) > 1 or 'path' not in audio_dict else audio_dict.get('path', '')
            else:
                self._config['audio'] = audio_dict

        elif section == 'output':
            output_dict = {}
            for k, v in data.items():
                if v is not None and v != '' and v != []:
                    output_dict[k] = v
            if target == 'project':
                self._project['output'] = output_dict if len(output_dict) > 1 or 'path' not in output_dict else output_dict.get('path', '')
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
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        if path is None:
            path = self._saved_path
        if path is None:
            name = self._project.get('project_name', 'config')
            slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')
            path = os.path.join(self._path, f'{slug}.yaml')

        if not path.endswith(('.yaml', '.yml', '.json')):
            path += '.yaml'

        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)

        cfg = self.get_config(config_type)
        with open(path, 'w') as f:
            yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)

        self._saved_path = path
        self._dirty = False
        return path

    def list_files(self, directory, extensions=None):
        try:
            entries = os.listdir(directory)
        except (OSError, FileNotFoundError):
            return []
        if extensions:
            exts = tuple(extensions)
            entries = [e for e in entries if e.lower().endswith(exts)]
        entries.sort()
        return entries

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
        try:
            import yaml
            project_yaml = yaml.dump(
                self.get_config('project'),
                default_flow_style=False, sort_keys=False
            ) if self._project or self._form_config else ''
            config_yaml = yaml.dump(
                self.get_config('config'),
                default_flow_style=False, sort_keys=False
            ) if self._config else ''
            form_yaml = yaml.dump(
                self._form_config,
                default_flow_style=False, sort_keys=False
            ) if self._form_config else ''
        except ImportError:
            project_yaml = json.dumps(self.get_config('project'), indent=2)
            config_yaml = json.dumps(self.get_config('config'), indent=2)
            form_yaml = json.dumps(self._form_config, indent=2)

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
            fc = parsed.pop('form_config', None)
            self._project = parsed
            if fc is not None:
                self._form_config = fc
        elif config_type == 'config':
            self._config = parsed
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
