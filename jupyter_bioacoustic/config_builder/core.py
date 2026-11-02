"""
Config Builder Core

The kernel side of the config builder UI: ``ConfigBuilder`` keeps the project / config / form
dicts being edited, routes each UI section's keys into them, loads and saves the YAML files,
and answers the UI's helper queries (columns, files, templates, validation).

The TypeScript builder drives it through Python code strings (``src/config_builder/python.ts``)
that call ``ConfigBuilder`` methods on the ``_CB_INSTANCE`` kernel variable.

Usage:
    from jupyter_bioacoustic import ConfigBuilder
    ConfigBuilder().open()

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Optional

import yaml
from IPython import get_ipython
from IPython.display import HTML, display

from .._validation import (
    SKIP_KEYS,
    validate_config,
)
from .files import (
    dump_yaml,
    ensure_ext,
    read_yaml,
    resolve_path,
    slugify,
    to_cwd_relative,
    write_yaml,
)


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.config_builder')

DEFAULT_PROJECT_DIR = 'projects'
DEFAULT_CONFIG_DIR = 'config'
DEFAULT_FORM_DIR = 'forms'
TEMPLATE_ROOT_DIR = 'annotator_config'      # where apply_template puts the three files
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
    'secrets',
})
DESCRIPTION_KEY = 'description'
DESCRIPTION_FLAT_KEYS = ('description_title', 'description_text', 'description_path',
                         'description_open', 'description_height')
# keys a split data/audio/output section writes to the project file (the rest go to config)
PROJECT_KEYS_BY_SECTION = {
    'data': DATA_PROJECT_KEYS,
    'audio': AUDIO_PROJECT_KEYS,
    'output': OUTPUT_PROJECT_KEYS,
}
# the config-file keys of a split section (reported to the UI by get_routing_keys)
CONFIG_KEYS_BY_SECTION = {
    'data': DATA_CONFIG_KEYS,
    'audio': AUDIO_CONFIG_KEYS,
    'output': OUTPUT_CONFIG_KEYS,
}
VALID_TARGETS = ('project', 'config', 'form_config', 'split')
# sections whose target is reset as a group when a file is loaded
ROUTED_SECTIONS = ('data', 'audio', 'output', 'app')
# file name -> (_build_file_contents content key, path key)
FILE_KEYS = {
    'project': ('project_cfg', 'p_path'),
    'config': ('config_cfg', 'c_path'),
    'form': ('form_cfg', 'f_path'),
}
# save_single(config_type) -> file name
_FILE_BY_CONFIG_TYPE = {'project': 'project', 'config': 'config', 'form_config': 'form'}


#
# PUBLIC
#
class ConfigBuilder:
    """Builds project / config / form YAML files from the config builder UI's sections.

    State lives in three dicts: ``_project`` (project-file keys plus the builder's own
    bookkeeping keys in ``SKIP_KEYS``: file paths, enabled and locked flags), ``_config`` and
    ``_form_config``. ``_section_targets`` says which file each UI section is written to:
    ``project``, ``config``, ``form_config`` or ``split`` (data/audio/output keys divided by
    ``PROJECT_KEYS_BY_SECTION``). Most public methods return ``_get_state()``, the JSON the UI
    renders.
    """
    def __init__(self) -> None:
        """Create an empty builder (see ``_reset``)."""
        self._reset()

    def get_config(self, config_type: str = 'project') -> dict:
        """Return a copy of one of the configuration dicts.

        Args:
            config_type: ``'project'`` (with ``form_config`` inlined when set), ``'config'``
                or ``'form_config'``.

        Returns:
            A shallow copy of that dict; ``{}`` for an unknown type.
        """
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
        """Return project and config merged (config wins), with ``form_config`` inlined.

        Returns:
            The merged configuration (a new dict).
        """
        cfg = dict(self._project)
        cfg.update(self._config)
        if self._form_config:
            cfg['form_config'] = dict(self._form_config)
        return cfg

    def update_section(self, section: str, data: dict, target: str | None = None) -> dict:
        """Replace one UI section's values.

        Args:
            section: ``project``, ``description``, ``data``, ``audio``, ``output``, ``app`` or
                ``form``. Other names only mark the builder dirty.
            data: The section's values from the UI. Empty values (None, ``''``, ``[]``) mean
                "not set" and are dropped.
            target: New target file for the section (optional; see ``set_section_target``
                to move existing values instead).

        Returns:
            The builder state (``_get_state()``).
        """
        if target is not None:
            self._section_targets[section] = target
        target = self._section_targets.get(section, 'project')
        _log.debug('update_section(%s) target=%s data_keys=%s',
                   section, target, list(data.keys()))

        if section == 'project':
            self._update_project_section(data)
        elif section == 'description':
            self._set_description(data)
        elif section in PROJECT_KEYS_BY_SECTION:
            values = {k: v for k, v in data.items() if _is_present(v)}
            self._store_section(section, values, target)
        elif section == 'app':
            self._update_app_section(data, target)
        elif section == 'form':
            self._form_config = data if isinstance(data, dict) else {}

        self._dirty = True
        return self._get_state()

    def set_section_target(self, section: str, target: str) -> None:
        """Change the file a section is written to, moving its existing values.

        Args:
            section: A section name from ``_section_targets``; unknown names are ignored.
            target: One of ``VALID_TARGETS``; anything else is ignored.
        """
        if section not in self._section_targets or target not in VALID_TARGETS:
            return
        old_target = self._section_targets[section]
        self._section_targets[section] = target
        if old_target == target:
            return
        if section in PROJECT_KEYS_BY_SECTION:
            self._move_section(section, old_target, target)
        elif section == 'app':
            old_dict = self._target_dict(old_target)
            new_dict = self._target_dict(target)
            for k in APP_KEYS:
                if k in old_dict:
                    new_dict[k] = old_dict.pop(k)

    def save(self, path: str | None = None, config_type: str = 'project') -> dict:
        """Save all enabled files (an alias of ``save_all``, kept for backward compatibility).

        Args:
            path: Ignored.
            config_type: Ignored.

        Returns:
            See ``save_all``.
        """
        return self.save_all()

    def save_all(self) -> dict:
        """Write every enabled, unlocked file.

        Returns:
            ``{file: path}`` for each file written (``project`` / ``config`` / ``form``).
        """
        _log.info('save_all() cwd=%s', os.getcwd())
        fc = self._build_file_contents()
        saved = {}
        for name, (content_key, path_key) in FILE_KEYS.items():
            if fc[f'{name}_enabled'] and not fc[f'{name}_locked']:
                saved[name] = write_yaml(fc[path_key], fc[content_key])
                _log.info('saved %s: %s', name, saved[name])
        self._saved_path = saved.get('project') or saved.get('config') or saved.get('form', '')
        self._dirty = False
        return saved

    def save_single(self, config_type: str = 'project') -> str:
        """Write one file (even if it is disabled), unless it is locked.

        Args:
            config_type: ``'project'``, ``'config'`` or ``'form_config'``.

        Returns:
            The path written, or ``''`` for an unknown type or a locked file.
        """
        _log.info('save_single(%s)', config_type)
        fc = self._build_file_contents()
        name = _FILE_BY_CONFIG_TYPE.get(config_type)
        if name is None:
            return ''
        if fc[f'{name}_locked']:
            _log.info('save_single(%s) skipped — file is locked', config_type)
            return ''
        content_key, path_key = FILE_KEYS[name]
        path = write_yaml(fc[path_key], fc[content_key])
        _log.info('saved %s: %s', config_type, path)
        return path

    def list_files(self, directory: str, extensions: list | None = None) -> list:
        """List a directory for the UI's file browser (hidden entries skipped).

        Args:
            directory: Directory to list.
            extensions: If given, only files ending in one of these (case-insensitive) are
                listed; directories are always listed.

        Returns:
            ``[{'name': str, 'is_dir': bool}]`` sorted by name; ``[]`` if the directory can't
            be read (logged).
        """
        try:
            entries = os.listdir(directory)
        except OSError as e:
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

    def read_columns(self, filepath: str) -> list[str]:
        """Read column names from a local data file (.csv, .tsv, .parquet, .json, .jsonl, .ndjson).

        Args:
            filepath: Local file path.

        Returns:
            Column names, or ``[]`` if the file can't be read (logged).
        """
        import pandas as pd
        _log.debug('read_columns: %s', filepath)
        ext = os.path.splitext(filepath)[1].lower()
        try:
            if ext in ('.csv', '.tsv'):
                sep = '\t' if ext == '.tsv' else ','
                return list(pd.read_csv(filepath, sep=sep, nrows=0).columns)
            if ext == '.parquet':
                import pyarrow.parquet as pq        # schema only: doesn't read the data
                names = pq.read_schema(filepath).names
                return [n for n in names if not n.startswith('__index_level_')]
            if ext in ('.jsonl', '.ndjson'):
                return list(pd.read_json(filepath, lines=True, nrows=1).columns)
            if ext == '.json':
                from ..api import _read_data        # a JSON document or JSON Lines
                return list(_read_data(filepath).columns)
        except Exception as e:
            _log.warning('read_columns failed for %s: %s', filepath, e)
        return []

    def read_columns_from_source(
        self,
        source_type: str,
        value: str,
        secrets: list | dict | None = None,
    ) -> list:
        """Load a remote/query data source and return its column names.

        Reuses the annotator's data loaders. Raises on failure so the caller can surface the
        error.

        Args:
            source_type: ``path``, ``url``, ``uri``, ``api`` or ``sql`` (unknown -> ``path``).
            value: The path / URL / URI / API endpoint / SQL query.
            secrets: Secrets spec; resolved and passed through to the loader.

        Returns:
            The column names.
        """
        from ..api import _load_data, _resolve_secrets
        _log.info('read_columns_from_source(%s): %s', source_type, str(value)[:120])
        dtype_map = {
            'path': 'path', 'url': 'url', 'uri': 'url', 'sql': 'sql', 'api': 'api',
        }
        dtype = dtype_map.get(source_type, 'path')
        resolved = _resolve_secrets(secrets) if secrets else None
        df = _load_data(value, dtype=dtype, secrets=resolved)
        return list(df.columns)

    def check_audio_url(self, value: str) -> dict:
        """Best-effort reachability check for a remote audio file.

        For FLAC, parses the file header (ffmpeg-free) for sample rate **and** duration. For
        other formats, or if the FLAC header can't be read, reads a short segment to confirm
        reachability + sample rate (no duration). Raises on failure so the caller can surface
        the error.

        Args:
            value: Audio URL or URI.

        Returns:
            ``{'ok': True, 'sample_rate': int, 'duration': float}`` (FLAC header) or
            ``{'ok': True, 'sample_rate': int, 'channels': int}`` (segment read).
        """
        from ..api import _cloud_get_bytes
        from ..audio import _partial, read_segment
        _log.info('check_audio_url: %s', str(value)[:120])

        if value.split('?')[0].lower().endswith('.flac'):
            try:
                header = _cloud_get_bytes(value, (0, _partial.HEADER_BYTES - 1))
                sr, dur = _partial.parse_flac_header(header)
                return {'ok': True, 'sample_rate': int(sr), 'duration': float(dur)}
            except Exception as err:
                # No ffmpeg-free duration available — fall back to a segment read.
                _log.info('FLAC header read failed (%s); using segment read', err)

        raw, sr = read_segment(value, 0.0, 0.5, partial=True)
        channels = raw.shape[1] if getattr(raw, 'ndim', 1) > 1 else 1
        return {'ok': True, 'sample_rate': int(sr), 'channels': int(channels)}

    def read_sample_data(self, filepath: str, n_rows: int = 5) -> list:
        """Read the first rows of a local .csv or .parquet file.

        Args:
            filepath: Local file path.
            n_rows: Number of rows.

        Returns:
            The rows as JSON records; ``[]`` for other formats or on error (logged).
        """
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

    def update_config_from_yaml(self, yaml_str: str, config_type: str = 'project') -> bool:
        """Replace one file's keys from YAML the user edited in the UI.

        Args:
            yaml_str: The edited YAML text.
            config_type: ``'project'``, ``'config'`` or ``'form_config'``.

        Returns:
            False if the YAML doesn't parse (nothing changes), else True.
        """
        _log.debug('update_config_from_yaml(%s) len=%d', config_type, len(yaml_str))
        try:
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
            self._apply_form_ref(parsed.pop('form_config', None))
            for k in list(self._project.keys()):
                if k not in SKIP_KEYS:
                    del self._project[k]
            for k, v in parsed.items():
                if k not in SKIP_KEYS:
                    self._project[k] = v
        elif config_type == 'config':
            form_ref = parsed.pop('form_config', None)
            self._config.clear()
            self._load_config_keys(parsed)
            self._apply_form_ref(form_ref)
        elif config_type == 'form_config':
            self._form_config = parsed

        self._dirty = True
        return True

    def load_config(self, path: str, file_type: str | None = None) -> dict:
        """Load a project, config or form file (and the files it references).

        Loading replaces the builder's state. The file type is detected from its keys unless
        ``file_type`` is given; a project's ``config:`` reference and a config's
        ``form_config:`` reference are followed, and the section targets are inferred from
        where the keys were found.

        Args:
            path: The YAML file.
            file_type: ``'project'``, ``'config'`` or ``'form'`` to skip detection.

        Returns:
            The builder state plus ``detected_type`` and ``loaded_paths``
            (``{'loaded': path, 'project'|'config'|'form': cwd-relative path}``).

        Raises:
            FileNotFoundError: If ``path`` doesn't exist.
        """
        _log.debug('load_config(%s, file_type=%s) cwd=%s', path, file_type, os.getcwd())
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        data = read_yaml(path)

        # loading replaces the builder's state (it used to merge into it: loading B after A
        # kept A's keys and saved them into B)
        self._reset()
        base_dir = os.path.dirname(path) or '.'
        loaded_paths = {'loaded': path}
        detected = _detect_file_type(data, file_type)
        if detected == 'form':
            self._load_form_file(data, path, loaded_paths)
        elif detected == 'project':
            self._load_project_file(data, path, base_dir, loaded_paths)
        else:
            self._load_config_file(data, path, base_dir, loaded_paths)

        self._dirty = False
        in_config_only = DESCRIPTION_KEY in self._config and DESCRIPTION_KEY not in self._project
        self._section_targets[DESCRIPTION_KEY] = 'config' if in_config_only else 'project'
        _log.debug('load_config result: detected=%s loaded_paths=%s', detected, loaded_paths)
        state = self._get_state()
        state['detected_type'] = detected
        state['loaded_paths'] = loaded_paths
        return state

    def get_routing_keys(self) -> dict:
        """Return the split-routing key sets per section (source of truth for the UI).

        For each split-capable section, ``project`` lists the keys routed to the project file
        and ``config`` the keys routed to the config file when the section target is
        ``split``. Used by the frontend to decide which fields to disable when a file is
        locked.

        Returns:
            ``{section: {'project': [keys], 'config': [keys]}}`` with sorted key lists.
        """
        return {
            section: {
                'project': sorted(PROJECT_KEYS_BY_SECTION[section]),
                'config': sorted(CONFIG_KEYS_BY_SECTION[section]),
            }
            for section in PROJECT_KEYS_BY_SECTION
        }

    def list_templates(self) -> list:
        """List the available "create from template" definitions.

        Returns:
            ``[{name, title, short_description}]`` (see ``templates.list_templates``).
        """
        from .templates import list_templates
        return list_templates()

    def load_template(self, name: str) -> dict:
        """Load the full parsed template dict for ``name`` (file stem).

        Args:
            name: Template file stem.

        Returns:
            The parsed template.
        """
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

        Substitutes the user's values into the template's per-section configuration, loads
        them into the three dicts, sets the project name / enabled flags / section targets so
        saving produces linked project/config/form files, and returns the resulting state
        (same shape as ``update_section``).

        Args:
            name: Template file stem.
            scope: ``'project'``, ``'config'`` or ``'form'``.
            project_name: Project name; also names the files (under ``TEMPLATE_ROOT_DIR``).
            values: ``{builder_element_key: value}`` entered by the user.

        Returns:
            The builder state.
        """
        from .templates import build_template_config
        template = self.load_template(name)
        sections = build_template_config(template, scope, values or {})

        self._reset()
        if 'project' in sections:
            self._project.update(sections['project'])
        if 'config' in sections:
            self._config.update(sections['config'])
        if 'form' in sections:
            self._form_config = sections['form']

        if project_name:
            self._project['project_name'] = project_name
            slug = slugify(project_name)
            for key, subdir in (('project_path', DEFAULT_PROJECT_DIR),
                                ('config_path', DEFAULT_CONFIG_DIR),
                                ('form_path', DEFAULT_FORM_DIR)):
                self._project[key] = f'{TEMPLATE_ROOT_DIR}/{subdir}/{slug}.yaml'
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
        """Validate the current configuration.

        Returns:
            ``validate_config``'s result (errors and warnings).
        """
        return validate_config(
            config=self._config or None,
            form_config=self._form_config or None,
            project=self._project or None,
        )

    def setup(self) -> None:
        """Publish this builder to the kernel as ``_CB_INSTANCE`` (and its state as ``_CB_STATE``).

        Raises:
            RuntimeError: If not running inside a Jupyter kernel.
        """
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'ConfigBuilder.setup() must be called from inside a Jupyter kernel.'
            )
        ip.user_ns['_CB_INSTANCE'] = self
        ip.user_ns['_CB_STATE'] = json.dumps(self._get_state())

    def open(self, inline: bool = True) -> None:
        """Open the config builder UI.

        Args:
            inline: Show it in the notebook output (True) or in a JupyterLab tab (False).
        """
        self.setup()
        if inline:
            self._open_inline()
        else:
            display(HTML(
                "<script>"
                "window._bioacousticApp?.commands.execute('bioacoustic:open-config-builder')"
                "</script>"
            ))

    def _reset(self) -> None:
        """Clear all configuration state (a fresh, empty builder)."""
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
            'description': 'project',
        }
        self._saved_path = None
        self._dirty = False

    def _target_dict(self, target: str) -> dict:
        """Return the dict a section target writes to (anything but ``project`` -> config).

        Args:
            target: A section target.

        Returns:
            ``_project`` or ``_config``.
        """
        return self._project if target == 'project' else self._config

    def _update_project_section(self, data: dict) -> None:
        """Apply a Configuration Files (``project``) section payload.

        Args:
            data: Builder keys (``SKIP_KEYS``: names, paths, enabled/locked flags), and the
                legacy ``output_path`` and description keys.
        """
        for k in SKIP_KEYS:
            if k in data:
                self._project[k] = data[k]
        if 'project_name' in data:
            _set_or_pop(self._project, 'project_name', data['project_name'])
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
        # legacy: description used to arrive with the project section. Only touch it when
        # the payload carries it (file paths / locks / names must not clear it)
        if DESCRIPTION_KEY in data or any(k in data for k in DESCRIPTION_FLAT_KEYS):
            self._set_description(data)

    def _update_app_section(self, data: dict, target: str) -> None:
        """Apply an Application section payload.

        ``project_name`` always goes to ``_project``; the ``APP_KEYS`` go to the target file
        (an empty value removes the key).

        Args:
            data: The section's values.
            target: The app section's target.
        """
        _set_or_pop(self._project, 'project_name', data.get('project_name', ''))
        dest = self._target_dict(target)
        for k in APP_KEYS:
            if k in data:
                if _is_present(data[k]):
                    dest[k] = data[k]
                else:
                    dest.pop(k, None)

    def _store_section(self, section: str, values: dict, target: str) -> None:
        """Store a data / audio / output section's values in the file(s) its target names.

        Args:
            section: ``data``, ``audio`` or ``output``.
            values: The section's values.
            target: ``split`` divides them by ``PROJECT_KEYS_BY_SECTION`` (an empty part is
                removed); ``project`` stores them in ``_project``, anything else in
                ``_config``, removing the section from the other dict.
        """
        if target == 'split':
            project_keys = PROJECT_KEYS_BY_SECTION[section]
            _set_or_pop(self._project, section,
                        {k: v for k, v in values.items() if k in project_keys})
            _set_or_pop(self._config, section,
                        {k: v for k, v in values.items() if k not in project_keys})
            return
        dest = self._target_dict(target)
        other = self._config if dest is self._project else self._project
        dest[section] = values
        other.pop(section, None)

    def _move_section(self, section: str, old_target: str, target: str) -> None:
        """Move a data / audio / output section's values to a new target.

        Args:
            section: ``data``, ``audio`` or ``output``.
            old_target: The previous target.
            target: The new target (different from ``old_target``).
        """
        if target == 'split':
            combined = _pop_merged(section, self._project, self._config)
            self._store_section(section, combined, 'split')
        elif old_target == 'split':
            combined = _pop_merged(section, self._config, self._project)
            if combined:
                self._target_dict(target)[section] = combined
        else:
            old_dict = self._target_dict(old_target)
            new_dict = self._target_dict(target)
            if section in old_dict:
                new_dict[section] = old_dict.pop(section)

    def _set_description(self, data: dict) -> None:
        """Replace the description from a Description-section payload.

        Absent or empty fields mean "cleared": an empty payload removes the description. It is
        stored in ``_project``; ``_build_file_contents`` writes it to the file chosen by the
        ``description`` section target.

        Args:
            data: ``{'description': {title, text, path, open}}`` and/or flat
                ``description_*`` keys.
        """
        desc = {}
        if isinstance(data.get(DESCRIPTION_KEY), dict):
            desc.update({k: v for k, v in data[DESCRIPTION_KEY].items() if _is_present(v)})
        for k in DESCRIPTION_FLAT_KEYS:
            if _is_present(data.get(k)):
                desc[k[len('description_'):]] = data[k]
        self._config.pop(DESCRIPTION_KEY, None)
        if desc:
            self._project[DESCRIPTION_KEY] = desc
        else:
            self._project.pop(DESCRIPTION_KEY, None)

    def _route_key(self, key: str, home: str) -> str:
        """Decide which file a key stored in ``home`` is written to.

        Args:
            key: A key of ``_project`` (home ``'project'``) or ``_config`` (home ``'config'``).
            home: ``'project'`` or ``'config'``.

        Returns:
            ``'project'`` or ``'config'``.
        """
        other = 'config' if home == 'project' else 'project'
        if key in SECTION_KEYS:
            return home if self._section_targets.get(key, 'project') in ('split', home) else other
        if key == DESCRIPTION_KEY:
            return ('config' if self._section_targets.get(DESCRIPTION_KEY, 'project') == 'config'
                    else 'project')
        if key in APP_KEYS:
            return home if self._section_targets.get('app', 'project') == home else other
        return home

    def _split_by_file(self) -> tuple[dict, dict]:
        """Divide ``_project`` and ``_config`` keys between the project and config files.

        Returns:
            (project-file keys, config-file keys); builder keys (``SKIP_KEYS``) are left out.
        """
        files: dict[str, dict] = {'project': {}, 'config': {}}
        for k, v in self._project.items():
            if k not in SKIP_KEYS:
                files[self._route_key(k, 'project')][k] = v
        for k, v in self._config.items():
            files[self._route_key(k, 'config')][k] = v
        return files['project'], files['config']

    def _build_file_contents(self) -> dict:
        """Compute what each file would contain, and where it is saved.

        Returns:
            ``project_cfg`` / ``config_cfg`` / ``form_cfg`` (contents), ``p_path`` /
            ``c_path`` / ``f_path`` (paths with the YAML extension), and the
            ``*_enabled`` / ``*_locked`` flags of the three files.
        """
        slug = slugify(self._project.get('project_name', 'config'))

        project_enabled = self._project.get('project_enabled', True)
        config_enabled = self._project.get('config_enabled', True)
        form_enabled = self._project.get('form_enabled', True)

        # A locked file is never written (independent of the enabled flag).
        project_locked = bool(self._project.get('project_locked', False))
        config_locked = bool(self._project.get('config_locked', False))
        form_locked = bool(self._project.get('form_locked', False))

        # the extension is added here, once, so the project's config:/form_config: references
        # name the files exactly as they are saved (e.g. 'cfgs/foo' -> 'cfgs/foo.yaml')
        p_path = ensure_ext(self._project.get('project_path') or f'{DEFAULT_PROJECT_DIR}/{slug}')
        c_path = ensure_ext(self._project.get('config_path') or f'{DEFAULT_CONFIG_DIR}/{slug}')
        f_path = ensure_ext(self._project.get('form_path') or f'{DEFAULT_FORM_DIR}/{slug}')

        form_cfg = dict(self._form_config) if self._form_config else {}
        proj_data, conf_data = self._split_by_file()

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
        if 'project_name' in self._project:
            project_cfg['project_name'] = self._project['project_name']

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
            'project_locked': project_locked,
            'config_locked': config_locked,
            'form_locked': form_locked,
            'p_path': p_path,
            'c_path': c_path,
            'f_path': f_path,
        }

    def _get_state(self) -> dict:
        """Return the builder state the UI renders (called by the TS builder too).

        Returns:
            The three dicts, the YAML text of each enabled non-empty file
            (``project_yaml`` / ``config_yaml`` / ``form_yaml``), ``section_targets``,
            ``saved_path`` and ``dirty``.
        """
        fc = self._build_file_contents()

        def file_yaml(name: str) -> str:
            """YAML text of one file, or ``''`` if it is empty or disabled.

            Args:
                name: ``'project'``, ``'config'`` or ``'form'``.

            Returns:
                The YAML text.
            """
            content = fc[FILE_KEYS[name][0]]
            return dump_yaml(content) if content and fc[f'{name}_enabled'] else ''

        return {
            'project': self._project,
            'config': self._config,
            'form_config': self._form_config,
            'project_yaml': file_yaml('project'),
            'config_yaml': file_yaml('config'),
            'form_yaml': file_yaml('form'),
            'section_targets': self._section_targets,
            'saved_path': self._saved_path or '',
            'dirty': self._dirty,
        }

    def _apply_form_ref(self, form_ref: Any) -> None:
        """Apply a ``form_config:`` value from edited YAML (a path or an inline form).

        Args:
            form_ref: A path (stored as ``form_path``), a dict (becomes the form config), or
                anything else (ignored).
        """
        if isinstance(form_ref, str):
            self._project['form_path'] = form_ref
        elif isinstance(form_ref, dict):
            self._form_config = form_ref

    def _load_config_keys(self, data: dict) -> None:
        """Copy a config file's keys into ``_config`` (builder keys are skipped).

        Args:
            data: The parsed config file (without its ``form_config``).
        """
        for k, v in data.items():
            if k not in SKIP_KEYS:
                self._config[k] = v

    def _set_targets(self, sections: tuple[str, ...], target: str) -> None:
        """Set several sections to the same target.

        Args:
            sections: Section names.
            target: The target.
        """
        for s in sections:
            self._section_targets[s] = target

    def _infer_section_targets(self) -> None:
        """Set the data/audio/output/app targets from where a loaded project + config put them."""
        for s in SECTION_KEYS:
            if s in self._project and s in self._config:
                self._section_targets[s] = 'split'
            elif s in self._config:
                self._section_targets[s] = 'config'
            else:
                self._section_targets[s] = 'project'
        in_config = any(k in self._config for k in APP_KEYS)
        self._section_targets['app'] = 'config' if in_config else 'project'

    def _load_form_file(self, data: dict, path: str, loaded_paths: dict) -> None:
        """Load a form file (only the form file is enabled).

        Args:
            data: The parsed form file.
            path: Its path.
            loaded_paths: ``load_config``'s loaded-path map (updated).
        """
        self._form_config = data
        rel_form = to_cwd_relative(path)
        self._project['form_path'] = rel_form
        self._project['form_enabled'] = True
        self._project['project_enabled'] = False
        self._project['config_enabled'] = False
        loaded_paths['form'] = rel_form

    def _load_project_file(self, data: dict, path: str, base_dir: str,
                           loaded_paths: dict) -> None:
        """Load a project file and follow its ``config:`` (or ``form_config:``) reference.

        Args:
            data: The parsed project file.
            path: Its path.
            base_dir: Its directory (references are resolved against it, then the cwd).
            loaded_paths: ``load_config``'s loaded-path map (updated).
        """
        if 'project_name' in data:
            self._project['project_name'] = data['project_name']
        rel_project = to_cwd_relative(path)
        self._project['project_path'] = rel_project
        self._project['project_enabled'] = True
        loaded_paths['project'] = rel_project

        for k, v in data.items():
            if k not in SKIP_KEYS and k != 'config' and k != 'form_config':
                self._project[k] = v

        config_ref = data.get('config')
        if isinstance(config_ref, str):
            self._load_config_ref(config_ref, base_dir, loaded_paths)
            return
        # no config file: everything lives in the project file
        self._project['config_enabled'] = False
        self._set_targets(ROUTED_SECTIONS, 'project')
        self._load_form_ref(data.get('form_config'), [base_dir], loaded_paths,
                            disable_if_absent=False)

    def _load_config_ref(self, config_ref: str, base_dir: str, loaded_paths: dict) -> None:
        """Follow a project's ``config:`` reference: load the config file and its form.

        A missing config file keeps the reference (so saving recreates it) and routes every
        section to the project file.

        Args:
            config_ref: The ``config:`` value.
            base_dir: The project file's directory.
            loaded_paths: ``load_config``'s loaded-path map (updated).
        """
        config_path = resolve_path(config_ref, base_dir)
        _log.debug('config ref=%s base_dir=%s resolved=%s', config_ref, base_dir, config_path)
        if not config_path:
            self._project['config_path'] = to_cwd_relative(
                os.path.normpath(os.path.join(base_dir, config_ref))
            )
            _log.warning('config ref not found: %s (tried %s and cwd %s)',
                         config_ref, os.path.join(base_dir, config_ref), os.getcwd())
            self._project['config_enabled'] = True
            self._project['form_enabled'] = False
            self._set_targets(ROUTED_SECTIONS, 'project')
            return

        rel_config = to_cwd_relative(config_path)
        self._project['config_path'] = rel_config
        config_data = read_yaml(config_path)
        self._project['config_enabled'] = True
        loaded_paths['config'] = rel_config

        form_ref = config_data.pop('form_config', None)
        self._load_config_keys(config_data)
        self._infer_section_targets()
        self._load_form_ref(form_ref, [os.path.dirname(config_path) or base_dir, base_dir],
                            loaded_paths)

    def _load_config_file(self, data: dict, path: str, base_dir: str,
                          loaded_paths: dict) -> None:
        """Load a config file (no project file) and follow its ``form_config:`` reference.

        Args:
            data: The parsed config file.
            path: Its path.
            base_dir: Its directory.
            loaded_paths: ``load_config``'s loaded-path map (updated).
        """
        rel_config = to_cwd_relative(path)
        self._project['config_path'] = rel_config
        self._project['config_enabled'] = True
        self._project['project_enabled'] = False
        loaded_paths['config'] = rel_config
        self._set_targets(ROUTED_SECTIONS, 'config')

        form_ref = data.pop('form_config', None)
        self._load_config_keys(data)
        self._load_form_ref(form_ref, [base_dir], loaded_paths)

    def _load_form_ref(self, form_ref: Any, search_dirs: list[str], loaded_paths: dict,
                       disable_if_absent: bool = True) -> None:
        """Load the form a ``form_config:`` value points to (or holds inline).

        Args:
            form_ref: A path (resolved against ``search_dirs`` in order, then the cwd), an
                inline form dict, or None.
            search_dirs: Directories to resolve a relative path against.
            loaded_paths: ``load_config``'s loaded-path map (updated).
            disable_if_absent: Mark the form file disabled when there is no reference.
        """
        if isinstance(form_ref, str):
            form_path = None
            for search_dir in search_dirs:
                form_path = resolve_path(form_ref, search_dir)
                if form_path:
                    break
            if form_path:
                rel_form = to_cwd_relative(form_path)
                self._form_config = read_yaml(form_path)
                self._project['form_path'] = rel_form
                self._project['form_enabled'] = True
                loaded_paths['form'] = rel_form
            else:
                self._project['form_enabled'] = False
        elif isinstance(form_ref, dict):
            self._form_config = form_ref
            self._project['form_enabled'] = False
        elif disable_if_absent:
            self._project['form_enabled'] = False

    def _open_inline(self) -> None:
        """Display a placeholder div in the notebook output and attach the builder UI to it."""
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


#
# INTERNAL
#
def _detect_file_type(data: Any, file_type: Optional[str]) -> str:
    """Decide whether loaded YAML is a project, config or form file.

    Args:
        data: The parsed file.
        file_type: ``'project'`` / ``'config'`` / ``'form'`` to force the type.

    Returns:
        ``'form'`` (only a ``form:`` list), ``'project'`` (a ``config:`` reference, or data +
        audio + form all inline), else ``'config'``.
    """
    has_form_key = 'form' in data and 'form_config' not in data
    has_config_key = 'config' in data and isinstance(data.get('config'), str)
    has_data = 'data' in data
    has_audio = 'audio' in data
    fully_specified = has_data and has_audio and ('form_config' in data or has_form_key)

    if file_type in ('project', 'config', 'form'):
        return file_type
    if has_form_key and not has_data and not has_audio and not has_config_key:
        return 'form'
    if has_config_key or fully_specified:
        return 'project'
    return 'config'


def _is_present(value: Any) -> bool:
    """Whether a UI value is set (not None, ``''`` or ``[]``).

    Args:
        value: The value.

    Returns:
        True if it is set.
    """
    return value is not None and value != '' and value != []


def _set_or_pop(d: dict, key: str, value: Any) -> None:
    """Store ``value`` under ``key`` if it is truthy, else remove ``key``.

    Args:
        d: The dict.
        key: The key.
        value: The value.
    """
    if value:
        d[key] = value
    else:
        d.pop(key, None)


def _pop_merged(section: str, first: dict, second: dict) -> dict:
    """Remove ``section`` from both dicts and return the two parts merged (``second`` wins).

    Args:
        section: The key to pop.
        first: Dict whose part is merged first.
        second: Dict whose part overrides.

    Returns:
        The merged section (``{}`` if neither had it).
    """
    combined = {}
    for d in (first, second):
        if section in d:
            combined.update(d.pop(section))
    return combined
