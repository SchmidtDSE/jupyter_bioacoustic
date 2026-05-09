"""
AnnotatorBuilder — LLM-assisted configuration file builder for BioacousticAnnotator.

Usage (interactive):
    from jupyter_bioacoustic import AnnotatorBuilder
    builder = AnnotatorBuilder(model='anthropic/claude-sonnet-4-20250514')
    builder.open()

Usage (programmatic):
    builder = AnnotatorBuilder(model='ollama/llama3')
    builder.instruction('Create a review project for bird detections in data/birds.csv')
"""

import json
import os
import re
import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML

from .prompts import (
    build_system_prompt,
    WELCOME_MESSAGE,
    SCHEMA_REFERENCE,
)

_UNSET = object()

DEFAULT_PATH = 'projects'
DEFAULT_MODE = 'conversational'

PROVIDER_KEY_MAP = {
    'anthropic': 'ANTHROPIC_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'google': 'GEMINI_API_KEY',
    'vertex_ai': 'GOOGLE_APPLICATION_CREDENTIALS',
    'cohere': 'COHERE_API_KEY',
    'mistral': 'MISTRAL_API_KEY',
    'groq': 'GROQ_API_KEY',
    'together_ai': 'TOGETHER_API_KEY',
    'fireworks_ai': 'FIREWORKS_AI_API_KEY',
    'deepseek': 'DEEPSEEK_API_KEY',
}


class AnnotatorBuilder:
    def __init__(
        self,
        model='anthropic/claude-sonnet-4-20250514',
        instructions=_UNSET,
        path=DEFAULT_PATH,
        mode=DEFAULT_MODE,
        **model_kwargs,
    ):
        try:
            import litellm  # noqa: F401
        except ImportError:
            raise ImportError(
                "litellm is required for AnnotatorBuilder: pip install litellm"
            )

        self._model = model
        self._user_instructions = instructions if instructions is not _UNSET else None
        self._path = path
        self._mode = mode
        self._model_kwargs = model_kwargs

        self._config = {}
        self._config_type = None
        self._messages = []
        self._saved_path = None
        self._dirty = False

        if isinstance(path, str) and os.path.isfile(path):
            self._load_existing(path)

    def _load_existing(self, path):
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")
        with open(path) as f:
            loaded = yaml.safe_load(f) or {}
        self._config = loaded
        self._saved_path = path
        self._dirty = False
        if 'form_config' in loaded and not any(
            k in loaded for k in ('data', 'data_path', 'audio', 'audio_path')
        ):
            self._config_type = 'form_config'
        elif any(k in loaded for k in ('data', 'data_path', 'audio', 'audio_path')):
            self._config_type = 'project'
        else:
            self._config_type = 'config'

    def _build_system_prompt(self):
        try:
            import yaml
            config_yaml = yaml.dump(
                self._config, default_flow_style=False, sort_keys=False
            ) if self._config else ''
        except ImportError:
            config_yaml = json.dumps(self._config, indent=2) if self._config else ''

        prompt = build_system_prompt(self._mode, self._config_type or 'project', config_yaml)

        if self._user_instructions:
            prompt += f"\n\n## Additional User Instructions\n{self._user_instructions}\n"

        return prompt

    def _get_provider(self):
        if '/' in self._model:
            return self._model.split('/')[0]
        return 'openai'

    def check_api_key(self):
        provider = self._get_provider()
        if provider in ('ollama', 'ollama_chat'):
            return {'ok': True}
        env_var = PROVIDER_KEY_MAP.get(provider)
        if env_var and not os.environ.get(env_var):
            return {
                'ok': False,
                'env_var': env_var,
                'provider': provider,
            }
        return {'ok': True}

    def set_api_key(self, env_var, value):
        os.environ[env_var] = value

    def _call_llm(self, user_message):
        import io
        import sys
        import litellm

        litellm.suppress_debug_info = True

        self._messages.append({'role': 'user', 'content': user_message})

        system_prompt = self._build_system_prompt()
        messages = [{'role': 'system', 'content': system_prompt}] + self._messages

        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            response = litellm.completion(
                model=self._model,
                messages=messages,
                **self._model_kwargs,
            )
        finally:
            sys.stdout = old_stdout

        assistant_msg = response.choices[0].message.content
        self._messages.append({'role': 'assistant', 'content': assistant_msg})

        self._parse_response(assistant_msg)
        return assistant_msg

    def _parse_response(self, text):
        yaml_match = re.search(
            r'```yaml-config\s*\n(.*?)```', text, re.DOTALL
        )
        if yaml_match:
            try:
                import yaml
                new_config = yaml.safe_load(yaml_match.group(1)) or {}
                self._config = new_config
                self._dirty = True
            except Exception:
                pass

        if self._config_type is None:
            lower = text.lower()
            if 'project' in lower and ('1' in lower or 'project' in lower[:200]):
                self._config_type = 'project'
            elif 'form' in lower and ('3' in lower or 'form_config' in lower[:200] or 'form config' in lower[:200]):
                self._config_type = 'form_config'
            elif 'config' in lower and ('2' in lower):
                self._config_type = 'config'

        save_match = re.search(r'```save-config\s*\n(.*?)```', text, re.DOTALL)
        if save_match:
            save_path = save_match.group(1).strip()
            if save_path:
                self.save(save_path)

    def instruction(self, text, feedback=True):
        response = self._call_llm(text)
        if feedback:
            return response
        return None

    def save(self, path=None):
        try:
            import yaml
        except ImportError:
            raise ImportError("pyyaml is required: pip install pyyaml")

        if path is None:
            path = self._saved_path
        if path is None:
            name = self._config.get('project_name', 'config')
            slug = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')
            path = os.path.join(self._path, f'{slug}.yaml')

        if not path.endswith(('.yaml', '.yml', '.json')):
            path += '.yaml'

        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)

        with open(path, 'w') as f:
            yaml.dump(self._config, f, default_flow_style=False, sort_keys=False)

        self._saved_path = path
        self._dirty = False
        return path

    def get_config(self):
        return dict(self._config)

    def setup(self):
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'AnnotatorBuilder.setup() must be called from inside a Jupyter kernel.'
            )

        try:
            import yaml
            config_yaml = yaml.dump(
                self._config, default_flow_style=False, sort_keys=False
            ) if self._config else ''
        except ImportError:
            config_yaml = json.dumps(self._config, indent=2) if self._config else ''

        ip.user_ns['_AB_INSTANCE'] = self
        ip.user_ns['_AB_CONFIG'] = config_yaml
        ip.user_ns['_AB_CONFIG_TYPE'] = self._config_type or ''
        ip.user_ns['_AB_MESSAGES'] = json.dumps(self._messages)
        ip.user_ns['_AB_SAVED_PATH'] = self._saved_path or ''
        ip.user_ns['_AB_DIRTY'] = 'true' if self._dirty else ''
        ip.user_ns['_AB_WELCOME'] = WELCOME_MESSAGE
        ip.user_ns['_AB_MODE'] = self._mode

    def open(self, inline=True):
        self.setup()

        if inline:
            self._open_inline()
        else:
            display(Javascript(
                "window._bioacousticApp?.commands.execute('bioacoustic:open-builder')"
            ))

    def _open_inline(self):
        div_id = f'builder-{uuid.uuid4().hex[:8]}'
        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:100%;height:600px;'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:hidden;position:relative;resize:both;'
            f'"></div>'
            f'<script>'
            f'(function() {{'
            f'  function tryAttach(retries) {{'
            f'    var el = document.getElementById("{div_id}");'
            f'    if (el && window._bioacousticOpenBuilder) {{'
            f'      window._bioacousticOpenBuilder("{div_id}");'
            f'    }} else if (retries > 0) {{'
            f'      setTimeout(function() {{ tryAttach(retries - 1); }}, 200);'
            f'    }}'
            f'  }}'
            f'  tryAttach(25);'
            f'}})();'
            f'</script>'
        ))

    def _get_state(self):
        try:
            import yaml
            config_yaml = yaml.dump(
                self._config, default_flow_style=False, sort_keys=False
            ) if self._config else ''
        except ImportError:
            config_yaml = json.dumps(self._config, indent=2) if self._config else ''

        return {
            'config': config_yaml,
            'config_type': self._config_type or '',
            'messages': self._messages,
            'saved_path': self._saved_path or '',
            'dirty': self._dirty,
        }

    def _update_config_from_yaml(self, yaml_str):
        try:
            import yaml
            new_config = yaml.safe_load(yaml_str) or {}
            self._config = new_config
            self._dirty = True
            return True
        except Exception:
            return False

    def validate(self):
        issues = []
        if self._config_type == 'project':
            has_data = any(
                k in self._config
                for k in ('data', 'data_path', 'data_url', 'data_sql', 'data_api')
            )
            if not has_data:
                issues.append("Missing required 'data' parameter (or data_path/data_url/data_sql/data_api)")
            has_audio = any(
                k in self._config
                for k in ('audio', 'audio_path', 'audio_url', 'audio_uri',
                          'audio_column', 'audio_sql', 'audio_api', 'audio_src')
            )
            if not has_audio:
                issues.append("Missing required 'audio' parameter (or audio_path/audio_url etc.)")
        return issues
