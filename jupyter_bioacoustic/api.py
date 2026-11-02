"""
BioacousticAnnotator

Opens the bioacoustic review panel from a notebook cell.

Usage (all args):
    BioacousticAnnotator(
        data=df, audio_path='test.flac',
        output='observations-test.jsonl',
    ).open()

Usage (config file):
    BioacousticAnnotator(config='config.yaml').open()

Usage (config + overrides):
    BioacousticAnnotator(
        data=df, audio_path='test.flac', config='config.yaml',
    ).open()

The source/config helpers live in ``_templates``, ``_data_sources``,
``_audio_sources`` and ``_config``; they are re-exported here under their
old underscore names (``_load_data``, ``_resolve_templates``, ...) because the
config builder, the TypeScript frontend and the tests import them from here.

License: BSD 3-Clause
"""  # noqa: D415
#
# Imports
#
from __future__ import annotations

import copy
import json
import logging
import os
import uuid
import warnings
from datetime import datetime
from typing import Any, Optional

import yaml
from IPython import get_ipython
from IPython.display import HTML, Javascript, Markdown, display

from ._audio_sources import (
    detect_audio_type as _detect_audio_type,  # noqa: F401 (re-export)
    resolve_audio_config as _resolve_audio_config,
    resolve_audio_from_source as _resolve_audio_from_source,  # noqa: F401 (re-export)
)
from ._config import (
    AUDIO_SOURCE_KEYS as _AUDIO_SOURCE_KEYS,
    CONFIG_PARAMS as _CONFIG_PARAMS,
    DATA_SOURCE_KEYS as _DATA_SOURCE_KEYS,
    MERGE_DICT_KEYS as _MERGE_DICT_KEYS,  # noqa: F401 (re-export)
    SOURCE_KEYS_MAP as _SOURCE_KEYS_MAP,  # noqa: F401 (re-export)
    filter_session_args as _filter_session_args,
    load_config as _load_config,
    load_config_from_remote as _load_config_from_remote,  # noqa: F401 (re-export)
    merge_project_over_config as _merge_project_over_config,
    section_with_index as _section_with_index,
)
from ._data_sources import (
    DATA_TYPE_MAP as _DATA_TYPE_MAP,
    cloud_get_bytes as _cloud_get_bytes,  # noqa: F401 (re-export)
    detect_data_type as _detect_data_type,  # noqa: F401 (re-export)
    load_data as _load_data,
    read_data as _read_data,
    read_data_from_api as _read_data_from_api,  # noqa: F401 (re-export)
    read_data_from_cloud as _read_data_from_cloud,  # noqa: F401 (re-export)
    read_data_from_sql as _read_data_from_sql,  # noqa: F401 (re-export)
    read_data_from_url as _read_data_from_url,  # noqa: F401 (re-export)
    resolve_data_config as _resolve_data_config,
    resolve_secrets as _resolve_secrets,
    temporary_environ as _temporary_environ,  # noqa: F401 (re-export)
)
from ._templates import (
    DEFAULT_SEP as _DEFAULT_SEP,  # noqa: F401 (re-export)
    TEMPLATE_RE as _TEMPLATE_RE,  # noqa: F401 (re-export)
    resolve_templates as _resolve_templates,
    resolve_templates_in_structure as _resolve_templates_in_structure,
)
from ._validation import validate_config


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.api')

_DESCRIPTION_FILE_EXTS = ('.md', '.markdown', '.txt')
# "argument not passed" marker (None is a meaningful value for many arguments)
_UNSET = object()

DEFAULT_OUTPUT_DIR = 'outputs'
DEFAULT_OUTPUT_PREFIX = 'annotation_output'
DEFAULT_OUTPUT_EXT = '.csv'
DEFAULT_OUTPUT_TS_FMT = '%y%m%d_%H%M'
DEFAULT_START_TIME_COL = 'start_time'
DEFAULT_END_TIME_COL = 'end_time'
DEFAULT_BUFFER = 3
DEFAULT_PROJECT_NAME = 'Jupyter Bioacoustic'
DEFAULT_CAPTURE_LABEL = 'Capture'
DEFAULT_SYNC_LABEL = 'Sync'
DEFAULT_SPEC_RESOLUTIONS = [1000, 2000, 4000]
DEFAULT_VISUALIZATIONS = ['linear', 'mel']
DEFAULT_INLINE = True
DEFAULT_WIDTH = '100%'
DEFAULT_CLIP_TABLE_HEIGHT = 175
DEFAULT_PLAYER_HEIGHT = 260
DEFAULT_INFO_CARD_HEIGHT = 34
DEFAULT_FORM_PANEL_HEIGHT = 175
DEFAULT_DESCRIPTION_HEIGHT = 0
_TOOLBAR_AND_PADDING_PX = 290
_BUILTIN_VIZ = ('linear', 'plain', 'mel')


#
# PUBLIC
#
def print_md(value: str) -> None:
    """Display a markdown string in the notebook output.

    Args:
        value: Markdown text.
    """
    display(Markdown(value))


class BioacousticAnnotator:
    """Main entry point for the bioacoustic annotation widget."""

    def __init__(
        self,
        project: Any = None,
        config: Any = _UNSET,
        form_config: Any = _UNSET,
        data: Any = _UNSET,
        data_source_type: Any = _UNSET,
        data_value: Any = _UNSET,
        data_path: Any = _UNSET,
        data_url: Any = _UNSET,
        data_sql: Any = _UNSET,
        data_api: Any = _UNSET,
        data_start_time: Any = _UNSET,
        data_end_time: Any = _UNSET,
        data_duration: Any = _UNSET,
        data_secrets: Any = _UNSET,
        data_index_column: Any = _UNSET,
        audio: Any = _UNSET,
        audio_source_type: Any = _UNSET,
        audio_value: Any = _UNSET,
        audio_path: Any = _UNSET,
        audio_url: Any = _UNSET,
        audio_uri: Any = _UNSET,
        audio_column: Any = _UNSET,
        audio_prefix: Any = _UNSET,
        audio_suffix: Any = _UNSET,
        audio_fallback: Any = _UNSET,
        audio_secrets: Any = _UNSET,
        audio_sql: Any = _UNSET,
        audio_api: Any = _UNSET,
        audio_property: Any = _UNSET,
        audio_response_index: Any = _UNSET,
        output: Any = _UNSET,
        output_path: Any = _UNSET,
        output_url: Any = _UNSET,
        output_uri: Any = _UNSET,
        output_sync_button: Any = _UNSET,
        output_recursive: Any = _UNSET,
        output_secrets: Any = _UNSET,
        output_index_column: Any = _UNSET,
        description: Any = _UNSET,
        description_title: Any = _UNSET,
        description_text: Any = _UNSET,
        description_path: Any = _UNSET,
        description_open: Any = _UNSET,
        description_height: Any = _UNSET,
        secrets: Any = _UNSET,
        project_name: Any = _UNSET,
        display_columns: Any = _UNSET,
        info_card_title: Any = _UNSET,
        info_card_text: Any = _UNSET,
        info_card_height: Any = _UNSET,
        visualizations: Any = _UNSET,
        spectrogram_resolution: Any = _UNSET,
        default_buffer: Any = _UNSET,
        capture: Any = _UNSET,
        capture_dir: Any = _UNSET,
        capture_height: Any = _UNSET,
        clip_table_height: Any = _UNSET,
        player_height: Any = _UNSET,
        form_panel_height: Any = _UNSET,
        width: Any = _UNSET,
        partial_download: Any = _UNSET,
        duplicate_entries: Any = _UNSET,
        sort: Any = _UNSET,
        sort_order: Any = _UNSET,
        session_args: Any = _UNSET,
        **kwargs: Any,
    ) -> None:
        """Create a BioacousticAnnotator instance.

        All parameters (except ``project``) may also be set via a YAML/JSON
        config file. Constructor arguments override config-file values.

        Args:
            project: Project file path (str) or dict. When set, no other
                config parameters may be passed.
            config: Path to a YAML/JSON config file.
            form_config: Form layout — YAML file path, dict, or None.
            data: Input data. DataFrame, file path, URL, ``api::url``,
                or SQL query (``SELECT ...``). Dict form:
                ``{value(+source_type)|path|url|uri|api|sql, secrets,
                columns}``. A bare string and the ``value`` dict key are
                auto-detected (path / URL / ``api::`` / SQL) when no
                ``source_type`` is given; ``path``/``url``/``api``/``sql``
                are explicit and skip detection.
            data_source_type: Forces how ``data_value`` (or a ``data``
                dict ``value``) is interpreted — one of ``path``, ``url``,
                ``uri``, ``sql``, ``api``. Falsey/omitted ⇒ auto-detect.
            data_value: Source string interpreted per ``data_source_type``;
                auto-detected when ``data_source_type`` is falsey (the same
                detection applied to a bare ``data`` string).
            data_path: Explicit file path (overrides ``data`` source).
            data_url: Explicit URL (overrides ``data`` source).
            data_sql: Explicit SQL query (overrides ``data`` source).
            data_api: Explicit API endpoint (overrides ``data`` source).
            data_start_time: Column name for clip start times.
            data_end_time: Column name for clip end times.
            data_duration: Column name or fixed number for clip duration.
            data_secrets: Auth for data loading. ``{key, value}`` pairs
                where value is ``env:VAR``, ``dialog``, or a literal.
            data_index_column: Column name that uniquely identifies
                each row in the input data. Required when a form is configured.
            audio: Audio source. String: local path, URL/URI, or column
                name (auto-detected). Dict form:
                ``{value(+source_type)|path|url|uri|column|sql|api,
                prefix, suffix, fallback, secrets, property,
                response_index}``.
            audio_source_type: Forces how ``audio_value`` (or an ``audio``
                dict ``value``) is interpreted — one of ``path``, ``url``,
                ``uri``, ``column``, ``sql``, ``api``. Falsey/omitted ⇒
                auto-detect (path / URL / column).
            audio_value: Audio source string interpreted per
                ``audio_source_type``; auto-detected when it is falsey.
            audio_path: Explicit local file path for audio.
            audio_url: Explicit URL for audio.
            audio_uri: Alias for ``audio_url``.
            audio_column: Explicit column name for per-row audio.
            audio_prefix: Prefix joined with ``/`` to audio paths.
            audio_suffix: Suffix joined with ``/`` to audio paths.
            audio_fallback: Fallback when ``audio`` is a column and the
                row value is empty.
            audio_secrets: Auth for audio loading (same format as
                ``data_secrets``).
            audio_sql: SQL query to resolve audio path.
            audio_api: API URL to resolve audio path.
            audio_property: Field/column to extract from SQL/API response
                as the audio path.
            audio_response_index: 1-based row index for SQL/API response.
            output: Output file path or sync config dict.
            output_path: Explicit local output file path.
            output_url: Remote sync destination.
            output_uri: Alias for ``output_url``.
            output_sync_button: Show a sync button (True = "Sync",
                string = custom label).
            output_recursive: Passed to ``io.write()`` for uploading
                directories.
            output_secrets: Auth for sync uploads.
            output_index_column: Column name for the row identifier
                in the output file. Defaults to ``data_index_column``.
            description: Description panel — a dict (``title``, ``text``,
                ``path``, ``open``, ``height``), markdown text, or a path to a
                ``.md``/``.markdown``/``.txt`` file.
            description_title: Description panel title.
            description_text: Description panel markdown text.
            description_path: Path to a ``.md`` file for description.
            description_open: Whether the description panel starts open.
            description_height: Description panel height in pixels.
            secrets: Global auth — fallback for ``data_secrets``,
                ``audio_secrets``, and ``output_secrets``.
            project_name: Widget header title. Auto-derived from project
                filename if not set.
            display_columns: Columns shown in the clip table.
            info_card_title: Info card title template — supports
                ``[[column_name]]`` placeholders. Also used for capture
                filenames.
            info_card_text: Info card text template — supports
                ``[[column_name]]`` placeholders.
            info_card_height: Info card height in pixels.
            visualizations: Visualization types for the dropdown.
                Built-in strings (``'linear'``, ``'mel'``,
                ``'log_frequency'``, ``'bandpass'``, ``'waveform'``)
                or custom callables.
            spectrogram_resolution: Spectrogram width in pixels. List for
                a dropdown selector, single value for fixed.
            default_buffer: Buffer time in seconds around each clip.
            capture: Capture button (False to hide, string for label).
            capture_dir: Directory prefix for captures.
            capture_height: Capture image height in pixels.
            clip_table_height: Clip table height in pixels.
            player_height: Player/spectrogram height in pixels.
            form_panel_height: Form panel height in pixels.
            width: Widget width (pixels or percentage string).
            partial_download: Use byte-range downloads for remote audio.
            duplicate_entries: Allow multiple submissions per row.
            sort: Column name to sort the clip table by. Defaults to None
                (file/input order — no sort applied).
            sort_order: Sort direction when ``sort`` is set —
                ``'asc'`` (default) or ``'desc'``.
            session_args: List of allowed ``**kwargs`` keys, or True to
                allow all.
            **kwargs: Fixed columns included in every output row.

        Raises:
            ValueError: If ``project`` is combined with other config
                parameters, or the data/audio/index-column settings are
                missing, ambiguous or invalid.
            TypeError: If ``project`` (or its nested ``config``) is neither a
                path nor a dict.
        """
        # Every config parameter the caller actually passed (precedence:
        # these > project > nested config > default; see _resolve()).
        self._init_overrides: dict[str, Any] = {
            k: v for k, v in locals().items()
            if k in _CONFIG_PARAMS and v is not _UNSET
        }

        # Paths of the files this instance was loaded from, and their contents
        self._project_file: Optional[str] = None
        self._config_file: Optional[str] = None
        self._form_file: Optional[str] = None
        self._project_cfg: Optional[dict] = None
        self._config_cfg: Optional[dict] = None

        if project is not None:
            self._merged_cfg = self._load_project(project)
        else:
            self._merged_cfg = self._load_config_file(config)

        self._project_name = self._resolve(
            'project_name', _default_project_name(project),
        )
        global_secrets = self._resolve('secrets', None)
        raw_data = self._init_data(global_secrets)
        self._init_index_columns(raw_data)
        self._init_audio(global_secrets)
        self._init_output(global_secrets)
        self._init_display_options()
        self._init_form(kwargs)
        self._init_spec_resolutions()
        self._init_visualizations()
        self._init_layout()
        self._init_description()
        self._resolve_init_templates()

    def setup(self) -> None:
        """Serialize data into kernel variables (the ``_BA_*`` globals the frontend reads).

        Raises:
            RuntimeError: If not called from inside a Jupyter kernel.
        """
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'BioacousticAnnotator.setup() must be '
                'called from inside a Jupyter kernel.'
            )

        ns = ip.user_ns
        ns['_BA_DATA'] = self._data.to_json(orient='records')
        ns['_BA_AUDIO'] = json.dumps(self._audio_config)
        ns['_BA_OUTPUT'] = self._resolved_output
        ns['_BA_SYNC_CONFIG'] = json.dumps({
            'uri': self.sync_uri,
            'button': self._sync_button,
            'recursive': self._sync_recursive,
        })
        ns['_BA_INFO_CARD_TITLE'] = self._info_card_title
        ns['_BA_APP_TITLE'] = self._project_name
        ns['_BA_INFO_CARD_TEXT'] = self._info_card_text
        ns['_BA_DATA_COLS'] = json.dumps(self._data_columns)

        ns['_BA_FORM_CONFIG'] = json.dumps(self._form_config)
        cap = self._capture
        if cap is True:
            cap = DEFAULT_CAPTURE_LABEL
        elif cap is False:
            cap = ''
        ns['_BA_CAPTURE'] = cap
        ns['_BA_CAPTURE_DIR'] = self._capture_dir or ''
        ns['_BA_CAPTURE_HEIGHT'] = str(self._capture_height) if self._capture_height else ''
        ns['_BA_SPEC_RESOLUTIONS'] = json.dumps(self._spec_resolutions)
        ns['_BA_VIZ_META'] = json.dumps(self._viz_meta)
        ns['_BA_DUPLICATE_ENTRIES'] = 'true' if self._duplicate_entries else ''
        ns['_BA_SORT'] = self._sort or ''
        ns['_BA_SORT_ORDER'] = self._sort_order or 'asc'
        ns['_BA_DEFAULT_BUFFER'] = str(self._default_buffer)
        ns['_BA_CLIP_TABLE_HEIGHT'] = str(self._clip_table_height)
        ns['_BA_PLAYER_HEIGHT'] = str(self._player_height)
        ns['_BA_INFO_CARD_HEIGHT'] = str(self._info_card_height)
        ns['_BA_FORM_PANEL_HEIGHT'] = str(self._form_panel_height)
        ns['_BA_DESCRIPTION'] = (
            json.dumps(self._description_config)
            if self._description_config
            else ''
        )
        ns['_BA_DESCRIPTION_HEIGHT'] = str(self._description_height)
        ns['_BA_DATA_INDEX_COL'] = self._data_index_column
        ns['_BA_OUTPUT_INDEX_COL'] = self._output_index_column
        ns['_BA_PROJECT_PATH'] = self._project_file or ''
        ns['_BA_CONFIG_PATH'] = self._config_file or ''
        ns['_BA_FORM_PATH'] = self._form_file or ''
        ns['_BA_MERGED_CONFIG'] = json.dumps(self._merged_cfg, default=str)
        ns['_BA_INSTANCE'] = self

    def validate(self) -> dict:
        """Validate the resolved configuration.

        Runs the same checks as the ``jba validate`` CLI and the config
        builder's Validate button, against the fully resolved
        :attr:`configuration` (so notebook arguments and nested config
        values are reflected).

        Returns:
            Dict with ``valid`` (bool), ``errors`` (list), and
            ``warnings`` (list).
        """
        cfg = self.configuration
        form = cfg.pop('form_config', None)
        return validate_config(
            config=cfg or None,
            form_config=form or None,
        )

    def open(self, inline: bool = DEFAULT_INLINE) -> None:
        """Serialize data and open the widget.

        Stripped session args and validation errors are reported as warnings;
        they do not stop the widget from opening.

        Args:
            inline: Open in the cell output (True) or in a JupyterLab tab.
        """
        if self._stripped_args:
            policy = self._session_args
            if isinstance(policy, list):
                permitted = sorted(policy)
            else:
                permitted = []
            warnings.warn(
                f'session_args not allowed: {self._stripped_args}. '
                f'Stripped from input.'
                + (f' Permitted: {permitted}' if permitted else ''),
                stacklevel=2,
            )
        result = self.validate()
        for msg in result['errors']:
            warnings.warn(f'Config error: {msg}', stacklevel=2)
        for msg in result['warnings']:
            _log.info('Config warning: %s', msg)
        self.setup()
        if inline:
            self._open_inline()
        else:
            display(Javascript(
                "window._bioacousticApp?.commands"
                ".execute('bioacoustic:open')"
            ))

    def sync(
        self,
        dest: Optional[str] = None,
        recursive: Optional[bool] = None,
        **kwargs: Any,
    ) -> str:
        """Upload the output file to the configured remote.

        Args:
            dest: Override the destination URI.
            recursive: Override recursive setting.
            **kwargs: Additional auth kwargs (merged over the output secrets).

        Returns:
            The result of ``audio.io.write`` (the destination written).

        Raises:
            ValueError: If no output path or no sync destination is configured.
            FileNotFoundError: If the output file does not exist yet.
        """
        from jupyter_bioacoustic.audio import io
        _log.info('sync requested: dest=%s recursive=%s', dest, recursive)

        src = self._resolved_output
        if not src:
            raise ValueError('No output path configured')
        if not os.path.exists(src):
            raise FileNotFoundError(f'Output file not found: {src}')

        target = dest or self.sync_uri
        if not target:
            raise ValueError(
                'No sync destination configured. '
                'Set output.uri/url in config or pass '
                'dest= to sync().'
            )

        rec = recursive if recursive is not None else self._sync_recursive

        merged_kwargs: dict[str, Any] = {}
        if self._sync_secrets_raw:
            merged_kwargs.update(_resolve_secrets(self._sync_secrets_raw))
        merged_kwargs.update(kwargs)

        _log.info('syncing %s -> %s (recursive=%s)', src, target, rec)
        result = io.write(src, target, recursive=rec, **merged_kwargs)
        _log.info('sync complete: %s', result)
        return result

    def describe(self, print_config: bool = True) -> None:
        """Print the configuration files and the resolved configuration.

        Args:
            print_config: Also print :attr:`configuration` as YAML.
        """
        if self.project_path or self.config_path or self.form_path:
            print_md('---')
            print_md('**Configuration Files**')
            if self.project_path:
                print(f'- Project: {self.project_path}')
            if self.config_path:
                print(f'- Config: {self.config_path}')
            if self.form_path:
                print(f'- Form: {self.form_path}')
        if print_config:
            print_md('---')
            print_md('**Configuration**')
            print(yaml.dump(self.configuration))
        print_md('---')

    def output(self, force: bool = False) -> Any:
        """Read and return the output file as a DataFrame.

        Args:
            force: Re-read even if a cached copy exists.

        Returns:
            pandas DataFrame, or None when there is no output file (yet).
        """
        if self._output_cache is not None and not force:
            return self._output_cache
        if not self._resolved_output:
            return None
        if not os.path.exists(self._resolved_output):
            return None
        self._output_cache = _read_data(self._resolved_output)
        return self._output_cache

    #
    # PROPERTIES
    #
    @property
    def project(self) -> Optional[dict]:
        """The project file contents as a dict, or None if no project was set."""
        return dict(self._project_cfg) if self._project_cfg else None

    @property
    def config(self) -> Optional[dict]:
        """The config file contents as a dict, or None if no config was set."""
        return dict(self._config_cfg) if self._config_cfg else None

    @property
    def form(self) -> Optional[dict]:
        """The form configuration as a dict, or None if no form was set."""
        return dict(self._form_config) if self._form_config else None

    @property
    def configuration(self) -> dict[str, Any]:
        """The fully resolved configuration as a single dict.

        Merges project + config + notebook arguments and inlines the
        resolved form (no ``config``/``form_config`` path references). The
        resolved index columns are kept inside their ``data``/``output``
        dict (data/output are consolidated to dicts), not hoisted to
        top-level keys. This is the canonical config ``validate()`` checks.
        """
        cfg = dict(self._merged_cfg)
        cfg.update(self._init_overrides)
        cfg.pop('config', None)
        cfg.pop('session_args', None)
        cfg.pop('form_config', None)
        if self._form_config:
            cfg['form_config'] = dict(self._form_config)
        # keep index columns inside their data/output dict, not at top level
        cfg.pop('data_index_column', None)
        cfg.pop('output_index_column', None)
        cfg['data'] = _section_with_index(
            cfg.get('data'), self._data_index_column, is_data=True,
        )
        out = _section_with_index(
            cfg.get('output'), self._output_index_column, is_data=False,
        )
        if out:
            cfg['output'] = out
        else:
            cfg.pop('output', None)
        return cfg

    @property
    def source(self) -> Any:
        """The input DataFrame passed as ``data``."""
        return self._data

    @property
    def project_path(self) -> Optional[str]:
        """Path to the project file, if loaded from a file."""
        return self._project_file

    @property
    def config_path(self) -> Optional[str]:
        """Path to the config file, if loaded from a file."""
        return self._config_file

    @property
    def form_path(self) -> Optional[str]:
        """Path to the form config file, if loaded from a file."""
        return self._form_file

    #
    # INTERNAL
    #
    def _resolve(self, key: str, default: Any) -> Any:
        """Return a setting: constructor argument > project/config value > default.

        A config key that is present with a ``None`` value counts as set.

        Args:
            key: Parameter / config key name (e.g. ``'audio_prefix'``).
            default: Value used when neither source sets *key*.

        Returns:
            The resolved value.
        """
        if key in self._init_overrides:
            return self._init_overrides[key]
        if key in self._merged_cfg:
            return self._merged_cfg[key]
        return default

    def _load_project(self, project: Any) -> dict:
        """Load a project (and its nested ``config``) into one merged config dict.

        Args:
            project: Project file path or dict.

        Returns:
            The nested config with the project merged over it (or just the
            project when it has no nested config).

        Raises:
            ValueError: If any other config parameter was also passed.
            TypeError: If *project* or its nested ``config`` has the wrong type.
        """
        if self._init_overrides:
            raise ValueError(
                f"When 'project' is set, no other "
                f"config parameters may be passed. "
                f"Got: {sorted(self._init_overrides)}"
            )
        if isinstance(project, str):
            _log.info('loading project file: %s', project)
            self._project_file = project
            proj_cfg = _load_config(project)
        elif isinstance(project, dict):
            proj_cfg = dict(project)
        else:
            raise TypeError(
                f"'project' must be a file path (str)"
                f" or dict, got "
                f"{type(project).__name__}"
            )
        self._project_cfg = dict(proj_cfg)
        nested = proj_cfg.pop('config', None)
        if not nested:
            return proj_cfg
        if isinstance(nested, str):
            _log.info('loading nested config: %s', nested)
            base = _load_config(nested)
            self._config_file = nested
        elif isinstance(nested, dict):
            base = dict(nested)
        else:
            raise TypeError(
                f"Nested 'config' in project must"
                f" be a file path or dict, got "
                f"{type(nested).__name__}"
            )
        self._config_cfg = dict(base)
        _merge_project_over_config(base, proj_cfg)
        return base

    def _load_config_file(self, config: Any) -> dict:
        """Load the ``config=`` file (no project).

        Args:
            config: Config file path, or ``_UNSET``/``None`` for none.

        Returns:
            The config dict (``{}`` when there is no config file).
        """
        if config in (_UNSET, None):
            return {}
        _log.info('loading config file: %s', config)
        cfg = _load_config(config)
        self._config_file = config
        self._config_cfg = dict(cfg)
        return cfg

    def _init_data(self, global_secrets: Any) -> Any:
        """Load the input data into ``self._data``.

        Args:
            global_secrets: The global ``secrets`` setting (data secrets fallback).

        Returns:
            The effective ``data`` setting (a copied dict with any flat
            ``data_*`` source applied, or the bare source), which
            :meth:`_init_index_columns` reads.
        """
        raw_data, top_dtype = self._resolve_raw_data()
        data_secrets = _cascade_secrets(self._resolve('data_secrets', None), global_secrets)
        source, dtype, resolved_secrets = _resolve_data_config(raw_data, data_secrets)
        if top_dtype and isinstance(source, str):
            dtype = top_dtype
        src_label = str(source)[:100] if isinstance(source, str) else type(source).__name__
        _log.info('loading data: dtype=%s source=%s', dtype, src_label)
        loaded_data = _load_data(source, dtype=dtype, secrets=resolved_secrets)
        _log.info(
            'data loaded: %d rows, %d columns',
            len(loaded_data), len(loaded_data.columns),
        )
        self._data = self._apply_time_columns(loaded_data, raw_data)
        return raw_data

    def _resolve_raw_data(self) -> tuple[Any, Optional[str]]:
        """Combine the ``data`` setting with a flat ``data_value/path/url/sql/api``.

        A flat source replaces the source keys of a ``data`` dict, or replaces
        a bare ``data`` value outright.

        Returns:
            ``(raw_data, forced_dtype)``. *forced_dtype* is set only when the
            result is a bare flat source string: the flat key's type, or
            ``data_source_type`` for ``data_value`` (``None`` = auto-detect).

        Raises:
            ValueError: If more than one flat source is set, or no data at all.
        """
        raw_data = self._resolve('data', _UNSET)
        if isinstance(raw_data, dict):
            raw_data = dict(raw_data)   # it may be the caller's / a config file's dict
        source_type = self._resolve('data_source_type', None)
        flat = _single_flat_source(
            {
                'value': self._resolve('data_value', None),
                'path': self._resolve('data_path', None),
                'url': self._resolve('data_url', None),
                'sql': self._resolve('data_sql', None),
                'api': self._resolve('data_api', None),
            },
            'data_value, data_path, data_url, data_sql, data_api',
        )
        if flat is None:
            if raw_data is _UNSET:
                raise ValueError(
                    "'data' is required — pass a DataFrame, "
                    "file path, URL, API endpoint, SQL query,"
                    " or dict. Alternatively use data_value, "
                    "data_path, data_url, data_sql, or data_api."
                )
            return raw_data, None

        key, val = flat
        if isinstance(raw_data, dict):
            _drop_keys(raw_data, _DATA_SOURCE_KEYS)
            if key == 'value':
                raw_data['value'] = val
                if source_type:
                    raw_data['source_type'] = source_type
            else:
                raw_data[key] = val
            return raw_data, None

        # A bare string source: force the dtype. Explicit data_path/url/sql/api
        # use their key; data_value uses data_source_type (falsey ⇒ auto-detect).
        if key == 'value':
            forced = _DATA_TYPE_MAP.get(source_type, source_type) if source_type else None
        else:
            forced = key
        return val, forced

    def _apply_time_columns(self, loaded_data: Any, raw_data: Any) -> Any:
        """Rename the clip time columns to ``start_time``/``end_time``.

        With a ``data_duration`` (a column name or a number), ``end_time`` is
        computed as ``start + duration``.

        Args:
            loaded_data: The loaded DataFrame.
            raw_data: The effective ``data`` setting (dict keys
                ``start_time``/``end_time``/``duration`` are the fallbacks).

        Returns:
            The DataFrame with normalized time columns.
        """
        data_dict = raw_data if isinstance(raw_data, dict) else {}
        st_col = (
            self._resolve('data_start_time', None)
            or data_dict.get('start_time')
            or DEFAULT_START_TIME_COL
        )
        et_col = (
            self._resolve('data_end_time', None)
            or data_dict.get('end_time')
            or DEFAULT_END_TIME_COL
        )
        dur_val = self._resolve('data_duration', None)
        if dur_val is None:
            dur_val = data_dict.get('duration')

        if dur_val is not None:
            if isinstance(dur_val, str):
                loaded_data['end_time'] = loaded_data[st_col] + loaded_data[dur_val]
            else:
                loaded_data['end_time'] = loaded_data[st_col] + dur_val
            if st_col != 'start_time':
                loaded_data = loaded_data.rename(columns={st_col: 'start_time'})
            return loaded_data

        renames = {}
        if st_col != 'start_time':
            renames[st_col] = 'start_time'
        if et_col != 'end_time':
            renames[et_col] = 'end_time'
        if renames:
            loaded_data = loaded_data.rename(columns=renames)
        return loaded_data

    def _init_index_columns(self, raw_data: Any) -> None:
        """Resolve ``self._data_index_column`` and ``self._output_index_column``.

        The data index column is required only when a form is configured;
        the output index column defaults to the data index column.

        Args:
            raw_data: The effective ``data`` setting from :meth:`_init_data`.

        Raises:
            ValueError: If a form needs an index column and none is set, or
                the column is not in the data.
        """
        idx_col = (
            self._resolve('data_index_column', None)
            or _dict_index_column(raw_data, self._merged_cfg.get('data'))
        )
        # data_index_column is only required when a form is configured
        # (form_config or a top-level 'form' key). Without a form the
        # widget is a player-only view and needs no index column.
        has_form = (
            self._resolve('form_config', None) is not None
            or bool(self._merged_cfg.get('form'))
        )
        if idx_col is None:
            if has_form:
                raise ValueError(
                    "'data_index_column' is required when a form "
                    "is configured — set it to the column that "
                    "uniquely identifies each row in the input data."
                )
            self._data_index_column = None
        else:
            if idx_col not in self._data.columns:
                raise ValueError(
                    f"data_index_column '{idx_col}' not found "
                    f"in data columns: "
                    f"{list(self._data.columns)}"
                )
            self._data_index_column = idx_col

        raw_output = self._resolve('output', _UNSET)
        self._output_index_column = (
            self._resolve('output_index_column', None)
            or _dict_index_column(raw_output, self._merged_cfg.get('output'))
            or idx_col
        )

    def _init_audio(self, global_secrets: Any) -> None:
        """Resolve ``self._audio_config`` (the ``_BA_AUDIO`` dict).

        Args:
            global_secrets: The global ``secrets`` setting (audio secrets fallback).
        """
        audio_secrets = _cascade_secrets(self._resolve('audio_secrets', None), global_secrets)
        self._audio_config = _resolve_audio_config(
            self._resolve_raw_audio(),
            self._resolve('audio_prefix', ''),
            self._resolve('audio_suffix', ''),
            self._resolve('audio_fallback', ''),
            audio_secrets=audio_secrets,
        )
        _log.info(
            'audio config resolved: type=%s value=%s',
            self._audio_config.get('type'),
            str(self._audio_config.get('value', ''))[:80],
        )

    def _resolve_raw_audio(self) -> Any:
        """Combine the ``audio`` setting with a flat ``audio_value/path/url/...``.

        A flat source replaces the source keys of an ``audio`` dict, or the
        bare ``audio`` value. ``audio_property``/``audio_response_index``
        are added to a dict result.

        Returns:
            The effective audio setting (a copied dict, or a source string).

        Raises:
            ValueError: If more than one flat source is set, or no audio at all.
        """
        raw_audio = self._resolve('audio', _UNSET)
        if isinstance(raw_audio, dict):
            raw_audio = dict(raw_audio)   # it may be the caller's / a config file's dict
        source_type = self._resolve('audio_source_type', None)
        flat = _single_flat_source(
            {
                'value': self._resolve('audio_value', None),
                'path': self._resolve('audio_path', None),
                'url': self._resolve('audio_url', None) or self._resolve('audio_uri', None),
                'column': self._resolve('audio_column', None),
                'sql': self._resolve('audio_sql', None),
                'api': self._resolve('audio_api', None),
            },
            'audio_value, audio_path, audio_url, audio_uri, audio_column, audio_sql, audio_api',
        )
        if flat is not None:
            key, val = flat
            if key == 'value':
                # 'value' carries an optional source_type; a falsey
                # source_type auto-detects in _resolve_audio_config.
                value_dict = {'value': val}
                if source_type:
                    value_dict['source_type'] = source_type
                if isinstance(raw_audio, dict):
                    _drop_keys(raw_audio, _AUDIO_SOURCE_KEYS)
                    raw_audio.update(value_dict)
                else:
                    raw_audio = value_dict
            elif raw_audio is _UNSET:
                raw_audio = {key: val} if key in ('sql', 'api') else val
            elif isinstance(raw_audio, dict):
                _drop_keys(raw_audio, _AUDIO_SOURCE_KEYS)
                raw_audio[key] = val
            else:
                raw_audio = val
        elif raw_audio is _UNSET:
            raise ValueError(
                "'audio' is required — pass a path, "
                "URL, column name, dict, or use "
                "audio_value/audio_path/audio_url/"
                "audio_column/audio_sql/audio_api."
            )

        if isinstance(raw_audio, dict):
            audio_property = self._resolve('audio_property', None)
            response_index = self._resolve('audio_response_index', None)
            if audio_property is not None:
                raw_audio.setdefault('property', audio_property)
            if response_index is not None:
                raw_audio['response_index'] = response_index
        return raw_audio

    def _init_output(self, global_secrets: Any) -> None:
        """Resolve the output path and the sync settings.

        Sets ``_output``, ``sync_uri``, ``_sync_button``, ``_sync_recursive``
        and ``_sync_secrets_raw``. Flat ``output_*`` settings override the
        ``output`` dict. A form without an output gets a timestamped default
        CSV path.

        Args:
            global_secrets: The global ``secrets`` setting (sync secrets fallback).
        """
        raw_output = self._resolve('output', '')
        output_path = self._resolve('output_path', None)
        output_url = self._resolve('output_url', None)
        output_uri = self._resolve('output_uri', None)
        sync_button = self._resolve('output_sync_button', None)
        recursive = self._resolve('output_recursive', None)
        output_secrets = _cascade_secrets(self._resolve('output_secrets', None), global_secrets)

        if isinstance(raw_output, dict):
            self._output = raw_output.get('path', '')
            self.sync_uri = raw_output.get('uri') or raw_output.get('url') or ''
            dict_button = raw_output.get('sync_button', None)
            if dict_button is None:
                self._sync_button = DEFAULT_SYNC_LABEL if self.sync_uri else ''
            else:
                self._sync_button = _sync_button_label(dict_button)
            self._sync_recursive = raw_output.get('recursive', False)
            self._sync_secrets_raw = raw_output.get('secrets')
        else:
            self._output = raw_output
            self.sync_uri = ''
            self._sync_button = ''
            self._sync_recursive = False
            self._sync_secrets_raw = None

        if output_path is not None:
            self._output = output_path
        if output_url is not None or output_uri is not None:
            self.sync_uri = output_url or output_uri or ''
        if sync_button is not None:
            self._sync_button = _sync_button_label(sync_button)
        if recursive is not None:
            self._sync_recursive = recursive
        if output_secrets is not None:
            self._sync_secrets_raw = output_secrets

        if self.sync_uri and not self._sync_button:
            self._sync_button = DEFAULT_SYNC_LABEL

        if not self._output and self._resolve('form_config', None) is not None:
            ts = datetime.now().strftime(DEFAULT_OUTPUT_TS_FMT)
            self._output = os.path.join(
                DEFAULT_OUTPUT_DIR,
                f'{DEFAULT_OUTPUT_PREFIX}-{ts}{DEFAULT_OUTPUT_EXT}',
            )

    def _init_display_options(self) -> None:
        """Resolve the info card, clip table, capture and playback options."""
        self._info_card_title = self._resolve('info_card_title', '')
        self._info_card_text = self._resolve('info_card_text', '')
        self._data_columns = self._resolve('display_columns', None) or []
        self._duplicate_entries = self._resolve('duplicate_entries', False)
        self._sort = self._resolve('sort', None)
        self._sort_order = self._resolve('sort_order', 'asc')
        self._default_buffer = self._resolve('default_buffer', DEFAULT_BUFFER)
        self._capture = self._resolve('capture', True)
        self._capture_dir = self._resolve('capture_dir', '')
        self._capture_height = self._resolve('capture_height', None)
        self._partial_download = self._resolve('partial_download', True)

    def _init_form(self, kwargs: dict[str, Any]) -> None:
        """Load the form config and add the session ``**kwargs`` as fixed values.

        Sets ``_form_file``, ``_session_args``, ``_stripped_args``,
        ``_init_kwargs`` and ``_form_config``.

        Args:
            kwargs: The extra constructor keyword arguments (fixed columns).
        """
        raw_form = self._resolve('form_config', None)
        if isinstance(raw_form, str):
            _log.info('loading form config: %s', raw_form)
            self._form_file = raw_form
            raw_form = _load_config(raw_form)
        self._session_args = self._resolve('session_args', None)
        kwargs, self._stripped_args = _filter_session_args(self._session_args, kwargs)
        self._init_kwargs = dict(kwargs)
        if kwargs:
            # copy: the form dict may be the caller's (or a config file's) and is reused across
            # annotators; writing this session's kwargs into it leaked them into later sessions
            raw_form = copy.deepcopy(raw_form) if raw_form is not None else {}
            raw_form['_fixed_kwargs'] = [
                {'fixed_value': {'column': k, 'value': v}}
                for k, v in kwargs.items()
            ]
        self._form_config = raw_form

    def _init_spec_resolutions(self) -> None:
        """Resolve ``self._spec_resolutions`` (spectrogram widths, as strings)."""
        raw_res = self._resolve('spectrogram_resolution', DEFAULT_SPEC_RESOLUTIONS)
        if isinstance(raw_res, (int, float)):
            self._spec_resolutions = [str(int(raw_res))]
        elif isinstance(raw_res, list):
            self._spec_resolutions = [str(r) for r in raw_res]
        else:
            self._spec_resolutions = [str(r) for r in DEFAULT_SPEC_RESOLUTIONS]

    def _init_visualizations(self) -> None:
        """Build ``self._visualizations`` and ``self._viz_meta`` from the setting.

        Entries may be names (builtin or ``utils.visualizations.REGISTRY``),
        callables, or dicts with a callable ``fn`` (and optional ``label``);
        anything else is skipped with a warning.

        Raises:
            ValueError: If a visualization name is unknown.
        """
        from jupyter_bioacoustic.utils.visualizations import REGISTRY as _VIZ_REGISTRY
        raw_viz = self._resolve('visualizations', DEFAULT_VISUALIZATIONS)
        self._visualizations: list[dict[str, Any]] = []
        self._viz_meta: list[dict[str, Any]] = []
        viz_list = raw_viz if isinstance(raw_viz, list) else [raw_viz]
        for i, v in enumerate(viz_list):
            if isinstance(v, str):
                self._add_viz_str(v, _VIZ_REGISTRY)
            elif callable(v):
                label = getattr(v, '__name__', f'custom_{i}')
                self._add_viz({'type': 'custom', 'fn': v, 'label': label})
            elif isinstance(v, dict) and callable(v.get('fn')):
                label = v.get('label', getattr(v['fn'], '__name__', f'custom_{i}'))
                self._add_viz({'type': 'custom', 'fn': v['fn'], 'label': label})
            else:
                warnings.warn(
                    f'Ignoring visualization {v!r}: expected a name, a callable, '
                    f"or a dict with a callable 'fn'"
                )

    def _add_viz(self, entry: dict[str, Any]) -> None:
        """Register a visualization and its frontend metadata.

        The metadata ``index`` is the entry's position in ``self._visualizations``: the frontend
        sends it back to pick the renderer (``_BA_INSTANCE._visualizations[index]``), so it must
        not be the position in the user's list (skipped entries would shift it).

        Args:
            entry: ``{'type': 'builtin', 'key', 'label', 'freq_scale'}`` or
                ``{'type': 'custom', 'fn', 'label'}``.
        """
        meta = {k: v for k, v in entry.items() if k != 'fn'}
        meta['index'] = len(self._visualizations)
        self._visualizations.append(entry)
        self._viz_meta.append(meta)

    def _add_viz_str(
        self,
        v: str,
        registry: dict[str, Any],
    ) -> None:
        """Register a visualization given by name (builtin or from ``registry``).

        Args:
            v: Visualization name.
            registry: Custom renderers by name (``utils.visualizations.REGISTRY``).

        Raises:
            ValueError: If the name is unknown.
        """
        if v in _BUILTIN_VIZ:
            key = 'linear' if v in ('plain', 'linear') else 'mel'
            self._add_viz({
                'type': 'builtin', 'key': key, 'label': key.title(),
                'freq_scale': 'mel' if key == 'mel' else 'linear',
            })
        elif v in registry:
            self._add_viz({
                'type': 'custom', 'fn': registry[v],
                'label': v.replace('_', ' ').title(),
            })
        else:
            raise ValueError(
                f"Unknown visualization '{v}'. "
                f"Available: "
                f"{', '.join(sorted(registry.keys()))}"
            )

    def _init_layout(self) -> None:
        """Resolve the widget width and the panel heights."""
        self._width = self._resolve('width', DEFAULT_WIDTH)
        self._clip_table_height = self._resolve('clip_table_height', DEFAULT_CLIP_TABLE_HEIGHT)
        self._player_height = self._resolve('player_height', DEFAULT_PLAYER_HEIGHT)
        self._info_card_height = self._resolve('info_card_height', DEFAULT_INFO_CARD_HEIGHT)
        self._form_panel_height = self._resolve('form_panel_height', DEFAULT_FORM_PANEL_HEIGHT)
        self._description_height = self._resolve(
            'description_height', DEFAULT_DESCRIPTION_HEIGHT,
        )

    def _init_description(self) -> None:
        """Resolve ``self._description_config`` (the description panel).

        ``description`` may be a dict, markdown text or a ``.md``/``.markdown``/
        ``.txt`` path; the flat ``description_*`` settings take precedence over
        the dict. A dict ``height`` applies unless ``description_height`` was
        passed. The panel is shown only when it has text.
        """
        raw_desc = self._resolve('description', None)
        desc_title = self._resolve('description_title', None)
        desc_text = self._resolve('description_text', None)
        desc_path = self._resolve('description_path', None)
        desc_open = self._resolve('description_open', None)
        if isinstance(raw_desc, str):
            # a bare string is a file path when it looks like one, else markdown text
            looks_like_path = ('\n' not in raw_desc and raw_desc.strip().lower().endswith(
                _DESCRIPTION_FILE_EXTS))
            raw_desc = {'path' if looks_like_path else 'text': raw_desc.strip()}
        elif raw_desc is not None and raw_desc is not False and not isinstance(raw_desc, dict):
            warnings.warn(
                f'description={raw_desc!r} has no text to show; pass markdown text, a .md '
                'file path, or a dict (title/text/path/open/height)'
            )
        if isinstance(raw_desc, dict):
            desc_title = desc_title or raw_desc.get('title')
            desc_text = desc_text or raw_desc.get('text')
            desc_path = desc_path or raw_desc.get('path')
            if desc_open is None:
                desc_open = raw_desc.get('open', True)
            if 'height' in raw_desc and 'description_height' not in self._init_overrides:
                self._description_height = raw_desc['height']
        if desc_path and not desc_text:
            try:
                with open(desc_path) as f:
                    desc_text = f.read()
                _log.debug('loaded description from %s', desc_path)
            except OSError as e:
                _log.warning('could not read description file %s: %s', desc_path, e)
                desc_text = f'(Could not read {desc_path})'
        self._description_config = (
            {
                'title': desc_title or '',
                'text': desc_text or '',
                'open': desc_open if desc_open is not None else True,
            }
            if desc_text
            else None
        )

    def _resolve_init_templates(self) -> None:
        """Resolve ``[[...]]`` templates in the output path, info card and form.

        Data-column placeholders in the info card and form are kept for
        per-row resolution in the frontend.
        """
        self._output_cache = None
        kw = self._init_kwargs or None
        cols = set(self._data.columns) if self._data is not None else None
        self._resolved_output = (
            _resolve_templates(self._output, kw, warn_missing=True)
            if self._output else self._output
        )
        if self._info_card_title:
            self._info_card_title = _resolve_templates(
                self._info_card_title, kw, columns=cols,
            )
        if self._info_card_text:
            self._info_card_text = _resolve_templates(
                self._info_card_text, kw, columns=cols,
            )
        if self._form_config:
            self._form_config = _resolve_templates_in_structure(
                self._form_config, kw, columns=cols,
            )

    def _invalidate_output_cache(self) -> None:
        """Force a re-read on the next output() call."""
        self._output_cache = None

    def _open_inline(self) -> None:
        """Inject the widget into the cell output area."""
        div_id = f'bioacoustic-{uuid.uuid4().hex[:8]}'
        w = self._width if isinstance(self._width, str) else f'{self._width}px'
        has_form = self._form_config is not None
        total_h = (
            int(self._clip_table_height)
            + int(self._player_height)
            + int(self._info_card_height)
            + (int(self._form_panel_height) if has_form else 0)
            + _TOOLBAR_AND_PADDING_PX
        )
        h = f'{total_h}px'

        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:{w};height:{h};'
            f'border:1px solid #313244;'
            f'border-radius:6px;'
            f'overflow:auto;position:relative;'
            f'resize:both;'
            f'"></div>'
        ))

        display(Javascript(
            f"window._bioacousticOpenInline && "
            f"window._bioacousticOpenInline('{div_id}')"
        ))


#
# INTERNAL
#
def _default_project_name(project: Any) -> str:
    """Return the default widget title: from the project file name, or generic.

    Args:
        project: The ``project`` argument (only a path is used).

    Returns:
        E.g. ``'My Survey'`` for ``projects/my_survey.yaml``, else
        :data:`DEFAULT_PROJECT_NAME`.
    """
    if not isinstance(project, str):
        return DEFAULT_PROJECT_NAME
    stem = os.path.splitext(os.path.basename(project))[0]
    return stem.replace('_', ' ').replace('-', ' ').title()


def _cascade_secrets(section_secrets: Any, global_secrets: Any) -> Any:
    """Apply the section-secrets fallback rule.

    Args:
        section_secrets: The section's setting (e.g. ``data_secrets``).
        global_secrets: The global ``secrets`` setting.

    Returns:
        *global_secrets* when the section setting is ``None``; ``None`` (no
        secrets) when it is ``False``; otherwise the section setting.
    """
    if section_secrets is None:
        return global_secrets
    if section_secrets is False:
        return None
    return section_secrets


def _single_flat_source(
    candidates: dict[str, Any],
    param_names: str,
) -> Optional[tuple[str, Any]]:
    """Return the one flat source that is set (e.g. ``data_path``), if any.

    Args:
        candidates: ``{source_key: value}``; ``None`` means "not set".
        param_names: Parameter names listed in the error message.

    Returns:
        ``(source_key, value)`` of the set source, or ``None`` when none is.

    Raises:
        ValueError: If more than one candidate is set.
    """
    found = {k: v for k, v in candidates.items() if v is not None}
    if len(found) > 1:
        raise ValueError(
            f"Only one of {param_names} may be set. "
            f"Got: {list(found.keys())}"
        )
    return next(iter(found.items())) if found else None


def _drop_keys(section: dict, keys: frozenset[str]) -> None:
    """Remove *keys* from *section* in place (missing keys are ignored).

    Args:
        section: The dict to modify.
        keys: Keys to remove.
    """
    for k in keys:
        section.pop(k, None)


def _dict_index_column(raw_section: Any, cfg_section: Any) -> Any:
    """Return the ``index_column`` of a data/output section dict.

    Args:
        raw_section: The effective section setting.
        cfg_section: The section from the merged config (used only when
            *raw_section* is not a dict).

    Returns:
        The ``index_column`` value, or None.
    """
    if isinstance(raw_section, dict):
        return raw_section.get('index_column')
    if isinstance(cfg_section, dict):
        return cfg_section.get('index_column')
    return None


def _sync_button_label(value: Any) -> str:
    """Return the sync button label for a ``sync_button`` setting.

    Args:
        value: A label string, or a truthy/falsey flag.

    Returns:
        The string itself, ``'Sync'`` for other truthy values, else ``''``.
    """
    if isinstance(value, str):
        return value
    return DEFAULT_SYNC_LABEL if value else ''
