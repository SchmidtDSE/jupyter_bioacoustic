"""
Annotator Config Files

Load project/config/form files (local, http(s), s3 or gs), merge a project
over its nested config, and filter session ``**kwargs``. Also holds the list
of ``BioacousticAnnotator`` constructor keys that a config file may set.

These helpers are re-exported from ``jupyter_bioacoustic.api`` under their
old underscore names (``_load_config``, ``_merge_project_over_config``, ...).

License: BSD 3-Clause
"""  # noqa: D415
#
# Imports
#
from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any, Optional
from urllib.parse import urlparse

import yaml

from ._data_sources import REMOTE_PREFIXES, REQUEST_TIMEOUT_S, detect_data_type


#
# CONSTANTS
#
# same logger name as before the split out of api.py, so log output is unchanged
_log = logging.getLogger('jupyter_bioacoustic.api')

# Keys that identify where a section's data comes from. A project section that
# sets any of them replaces all of them from the base config.
DATA_SOURCE_KEYS = frozenset(
    {'value', 'source_type', 'path', 'url', 'uri', 'api', 'sql'},
)
AUDIO_SOURCE_KEYS = frozenset(
    {'value', 'source_type', 'path', 'url', 'uri', 'column', 'sql', 'api'},
)
# Dict-valued keys that are merged key-by-key (not replaced) by a project.
MERGE_DICT_KEYS = frozenset(
    {'data', 'audio', 'output', 'description'},
)
SOURCE_KEYS_MAP = {
    'data': DATA_SOURCE_KEYS,
    'audio': AUDIO_SOURCE_KEYS,
}

# BioacousticAnnotator constructor parameters that a config/project may set
# (every parameter except ``project`` and the ``**kwargs`` fixed columns).
CONFIG_PARAMS = {
    'data', 'data_source_type', 'data_value',
    'data_path', 'data_url', 'data_sql',
    'data_api', 'data_start_time', 'data_end_time',
    'data_duration', 'data_secrets',
    'data_index_column',
    'audio', 'audio_source_type', 'audio_value',
    'audio_path', 'audio_url',
    'audio_uri', 'audio_column', 'audio_prefix',
    'audio_suffix', 'audio_fallback', 'audio_secrets',
    'audio_sql', 'audio_api', 'audio_property',
    'audio_response_index',
    'secrets',
    'output', 'output_path', 'output_url', 'output_uri',
    'output_sync_button', 'output_recursive',
    'output_secrets', 'output_index_column',
    'info_card_title', 'info_card_text', 'display_columns',
    'sort', 'sort_order',
    'form_config', 'duplicate_entries', 'default_buffer',
    'capture', 'capture_dir', 'spectrogram_resolution',
    'visualizations', 'partial_download',
    'width', 'clip_table_height', 'player_height',
    'capture_height',
    'info_card_height', 'form_panel_height',
    'description', 'description_title',
    'description_text', 'description_path',
    'description_open', 'description_height',
    'project_name',
    'config', 'session_args',
}

_DEFAULT_CONFIG_EXT = '.yaml'


#
# PUBLIC
#
def load_config(path: str) -> dict:
    """Load a JSON or YAML config file from a local path or remote URI.

    Args:
        path: Local path, or ``http(s)://``, ``s3://`` or ``gs://`` URI.
            ``.json`` is parsed as JSON, anything else as YAML.

    Returns:
        The parsed dict (``{}`` for an empty file).
    """
    if path.startswith(REMOTE_PREFIXES):
        return load_config_from_remote(path)

    ext = os.path.splitext(path)[1].lower()
    with open(path) as f:
        if ext == '.json':
            return json.load(f) or {}
        return yaml.safe_load(f) or {}


def load_config_from_remote(uri: str) -> dict:
    """Load a JSON or YAML config file from a remote URI (HTTP/S3/GCS).

    HTTP(S) is fetched with ``requests``; other schemes go through
    ``audio.io.read`` (which handles S3/GCS auth). Without a file extension
    the format comes from the HTTP Content-Type, defaulting to YAML.

    Args:
        uri: The remote URI.

    Returns:
        The parsed dict (``{}`` for an empty file).
    """
    _log.info('fetching config from remote URI: %s', uri[:120])
    ext = os.path.splitext(urlparse(uri).path)[1].lower()

    if uri.startswith(('http://', 'https://')):
        import requests as req
        resp = req.get(uri, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()
        if not ext:
            ct_header = resp.headers.get('Content-Type', '')
            ext = '.json' if 'json' in ct_header else _DEFAULT_CONFIG_EXT
        content = resp.text
    else:
        content = _read_remote_text(uri, ext or _DEFAULT_CONFIG_EXT)
        ext = ext or _DEFAULT_CONFIG_EXT

    if ext == '.json':
        return json.loads(content) or {}
    return yaml.safe_load(content) or {}


def merge_project_over_config(base: dict, proj: dict) -> None:
    """Merge project overrides on top of a base config, in place.

    For ``data``/``audio``/``output``/``description`` dicts the merge is
    per key; a project ``data``/``audio`` dict that names any source key
    drops all source keys inherited from *base* first. Other keys replace.

    Args:
        base: The nested config dict (modified in place).
        proj: The project dict.
    """
    for k, v in proj.items():
        if (
            k in MERGE_DICT_KEYS
            and isinstance(v, dict)
            and isinstance(base.get(k), dict)
        ):
            merged = dict(base[k])
            source_keys = SOURCE_KEYS_MAP.get(k)
            if source_keys and source_keys & v.keys():
                for sk in source_keys:
                    merged.pop(sk, None)
            merged.update(v)
            base[k] = merged
        else:
            base[k] = v


def filter_session_args(
    policy: object,
    kwargs: dict[str, object],
) -> tuple[dict[str, object], list[str]]:
    """Filter kwargs according to the session_args policy.

    Args:
        policy: ``None``/``True``/``'*'`` (allow all), ``False`` (allow
            none) or a list of allowed names. Anything else allows all.
        kwargs: The extra constructor keyword arguments.

    Returns:
        Tuple of (allowed kwargs dict, sorted list of stripped key names).
    """
    if not kwargs:
        return kwargs, []
    if policy is None or policy is True or policy == '*':
        return kwargs, []
    if policy is False:
        return {}, sorted(kwargs)
    if isinstance(policy, list):
        allowed = set(policy)
        stripped = sorted(set(kwargs) - allowed)
        filtered = {k: v for k, v in kwargs.items() if k in allowed}
        return filtered, stripped
    return kwargs, []


def section_with_index(
    value: Any, index_col: Optional[str], is_data: bool,
) -> dict:
    """Return a data/output section as a dict carrying its index_column.

    Consolidates a bare source (string path/url/sql/api, or DataFrame) into
    a dict so the resolved ``index_column`` lives inside the section rather
    than at the top level.

    Args:
        value: The section value (dict, source string, DataFrame or None).
        index_col: The resolved index column (not added when None).
        is_data: True for the data section (string sources are typed by
            :func:`detect_data_type`; output strings are paths).

    Returns:
        The section dict, or ``{}`` when there is no section.
    """
    if isinstance(value, dict):
        section = dict(value)
    elif value is not None:
        key = (
            detect_data_type(value)
            if is_data and isinstance(value, str)
            else 'path'
        )
        section = {key: value}
    else:
        return {}
    if index_col is not None:
        section['index_column'] = index_col
    return section


#
# INTERNAL
#
def _read_remote_text(uri: str, suffix: str) -> str:
    """Download a remote (S3/GCS) text file with ``audio.io.read``.

    Args:
        uri: The remote URI.
        suffix: Suffix for the temporary download file.

    Returns:
        The file contents (UTF-8).
    """
    from .audio import io
    with tempfile.NamedTemporaryFile(mode='w+', suffix=suffix, delete=False) as tmp_file:
        temp_path = tmp_file.name
    try:
        io.read(uri, dest=temp_path)
        with open(temp_path, 'r', encoding='utf-8') as f:
            return f.read()
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
