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

License: BSD 3-Clause
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
import warnings
from datetime import datetime
from typing import Any, Optional
from pprint import pprint
from IPython import get_ipython
from IPython.display import display, Javascript, HTML, Markdown

from ._validation import validate_config


#
# Constants
#
_log = logging.getLogger('jupyter_bioacoustic.api')

_UNSET = object()
_OUTPUT_TEMPLATE_RE = re.compile(r'\[\[([^\]]*%[^\]]*)\]\]')

DEFAULT_OUTPUT_DIR = 'outputs'
DEFAULT_OUTPUT_PREFIX = 'annotation_output'
DEFAULT_OUTPUT_EXT = '.csv'
DEFAULT_OUTPUT_TS_FMT = '%y%m%d_%H%M'
DEFAULT_START_TIME_COL = 'start_time'
DEFAULT_END_TIME_COL = 'end_time'
DEFAULT_BUFFER = 3
DEFAULT_PROJECT_NAME = 'Jupyter Bioacoustic'
DEFAULT_CAPTURE_LABEL = 'Capture'
DEFAULT_SPEC_RESOLUTIONS = [1000, 2000, 4000]
DEFAULT_VISUALIZATIONS = ['linear', 'mel']
DEFAULT_INLINE = True
DEFAULT_WIDTH = '100%'
DEFAULT_CLIP_TABLE_HEIGHT = 175
DEFAULT_PLAYER_HEIGHT = 260
DEFAULT_INFO_CARD_HEIGHT = 34
DEFAULT_FORM_PANEL_HEIGHT = 140
DEFAULT_DESCRIPTION_HEIGHT = 0
_TOOLBAR_AND_PADDING_PX = 290


#
# Output path template resolution
#
def _resolve_output_templates(path: str) -> str:
    """Replace ``[[strftime_format]]`` placeholders in an output path.

    For example ``outputs/annotations-[[%Y%m%d-%H%M]].csv`` becomes
    ``outputs/annotations-20260521-1430.csv`` (using the current time).
    Only placeholders containing at least one ``%`` character are resolved.
    """
    now = datetime.now()
    return _OUTPUT_TEMPLATE_RE.sub(
        lambda m: now.strftime(m.group(1)), path,
    )


#
# Secret resolution
#
def _resolve_secrets(
    data_secrets: Any,
) -> dict[str, str]:
    """Resolve a data_secrets param into a plain dict.

    Each entry is ``{key: str, value: str}`` where value can be:
    - ``env:VAR_NAME`` -> reads ``os.environ['VAR_NAME']``
    - ``dialog`` (case-insensitive) -> prompts via getpass
    - anything else -> used literally
    """
    if not data_secrets:
        return {}
    if isinstance(data_secrets, dict):
        data_secrets = [data_secrets]

    import getpass
    resolved: dict[str, str] = {}
    for entry in data_secrets:
        k = entry['key']
        v = entry['value']
        if isinstance(v, str) and re.match(
            r'^env:', v, re.IGNORECASE,
        ):
            env_var = v[4:]
            resolved[k] = os.environ.get(env_var, '')
            if not resolved[k]:
                _log.error(
                    'Environment variable %r not set '
                    '(for secret %r)', env_var, k,
                )
                raise ValueError(
                    f"Environment variable {env_var!r} "
                    f"not set (for secret {k!r})"
                )
        elif isinstance(v, str) and v.lower() == 'dialog':
            resolved[k] = getpass.getpass(
                f'Enter value for {k!r}: ',
            )
        else:
            resolved[k] = v
    return resolved


#
# Data type detection
#
def _detect_data_type(data_str: str) -> str:
    """Detect whether a data string is sql, api, url, or path.

    - Contains 'SELECT ' (case-insensitive) -> 'sql'
    - Starts with 'api::' -> 'api'
    - Starts with http/https/s3/gs -> 'url'
    - Otherwise -> 'path'
    """
    if re.search(r'\bSELECT\s', data_str, re.IGNORECASE):
        return 'sql'
    if data_str.lower().startswith('api::'):
        return 'api'
    if data_str.startswith(
        ('http://', 'https://', 's3://', 'gs://'),
    ):
        return 'url'
    return 'path'


#
# Data loading
#
def _read_data(path: str) -> Any:
    """Read a DataFrame from a local file path."""
    import pandas as pd
    ext = os.path.splitext(path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(path)
    elif ext == '.parquet':
        return pd.read_parquet(path)
    elif ext in ('.jsonl', '.ndjson'):
        return pd.read_json(path, lines=True)
    elif ext == '.json':
        return pd.read_json(path)
    else:
        raise ValueError(
            f"Unsupported data file extension {ext!r}. "
            f"Expected .csv, .parquet, .jsonl, or .ndjson."
        )


def _read_data_from_url(
    url: str,
    cookies: Optional[dict] = None,
) -> Any:
    """Fetch data from a URL.

    Auto-detects file vs JSON response.
    """
    import pandas as pd
    import requests as req
    import tempfile

    _log.info('fetching data from URL: %s', url[:120])
    resp = req.get(url, cookies=cookies or {}, timeout=120)
    resp.raise_for_status()
    ct_header = resp.headers.get('Content-Type', '')
    _log.debug(
        'URL response: status=%d content-type=%s',
        resp.status_code, ct_header,
    )

    ct = ct_header.lower()

    if 'application/json' in ct:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            for key in (
                'data', 'results', 'items', 'records', 'rows',
            ):
                if key in data and isinstance(
                    data[key], list,
                ):
                    return pd.DataFrame(data[key])
            return pd.DataFrame([data])

    if 'ndjson' in ct or 'jsonl' in ct:
        import io
        return pd.read_json(
            io.StringIO(resp.text), lines=True,
        )

    try:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
    except (ValueError, TypeError):
        _log.debug(
            'URL response is not JSON, '
            'falling back to file download',
        )

    ext = (
        os.path.splitext(url.split('?')[0])[1].lower()
        or '.csv'
    )
    with tempfile.NamedTemporaryFile(
        suffix=ext, delete=False,
    ) as f:
        f.write(resp.content)
        tmp_path = f.name
    try:
        return _read_data(tmp_path)
    finally:
        os.unlink(tmp_path)


def _read_data_from_api(
    url: str,
    cookies: Optional[dict] = None,
) -> Any:
    """Fetch data from an API endpoint."""
    if url.lower().startswith('api::'):
        url = url[5:]
    return _read_data_from_url(url, cookies=cookies)


def _read_data_from_sql(
    query: str,
    secrets: Optional[dict] = None,
) -> Any:
    """Execute a SQL query with duckdb and return a DataFrame.

    Automatically loads the httpfs extension if the query
    references s3:// or gs:// paths.
    """
    try:
        import duckdb
    except ImportError:
        raise ImportError(
            "duckdb is required for SQL queries: "
            "pip install duckdb"
        )

    conn = duckdb.connect(':memory:')

    if re.search(
        r"s3://|gs://|https?://", query, re.IGNORECASE,
    ):
        try:
            conn.execute("INSTALL httpfs")
        except Exception:
            pass
        conn.execute("LOAD httpfs")
        _log.debug('duckdb: loaded httpfs extension')

    _DUCKDB_SET_KEYS = {
        's3_access_key_id', 's3_secret_access_key',
        's3_region', 's3_endpoint', 's3_session_token',
        's3_url_style', 's3_use_ssl',
        's3_url_compatibility_mode',
    }

    has_credentials = False
    if secrets:
        for k, v in secrets.items():
            if k.lower() in _DUCKDB_SET_KEYS:
                conn.execute(f"SET {k} = '{v}'")
                if k.lower() in (
                    's3_access_key_id',
                    's3_secret_access_key',
                ):
                    has_credentials = True
            else:
                os.environ[k] = str(v)

    if (
        re.search(r"s3://", query, re.IGNORECASE)
        and not has_credentials
    ):
        try:
            conn.execute(
                "CREATE SECRET IF NOT EXISTS "
                "(_type = 's3', "
                "provider = 'credential_chain')"
            )
        except Exception as e:
            _log.debug(
                'duckdb: credential chain not '
                'available: %s', e,
            )

    _log.info(
        'executing SQL query (%d chars)', len(query),
    )
    result = conn.execute(query).df()
    _log.info(
        'SQL query returned %d rows, %d columns',
        len(result), len(result.columns),
    )
    conn.close()
    return result


def _resolve_data_config(
    data: Any,
    data_secrets: Any,
) -> tuple[Any, Optional[str], dict]:
    """Normalize the data parameter.

    Returns:
        (data_value, dtype_or_none, resolved_secrets)
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return (
            data, None,
            _resolve_secrets(data_secrets),
        )

    if isinstance(data, dict):
        type_keys = {'path', 'url', 'uri', 'api', 'sql'}
        found = [k for k in type_keys if k in data]
        if len(found) != 1:
            raise ValueError(
                f"data dict must have exactly one of "
                f"{type_keys}, got: {found or 'none'}"
            )
        key = found[0]
        source = data[key]

        secrets_raw = (
            data_secrets
            if data_secrets is not None
            else data.get('secrets')
        )
        secrets = _resolve_secrets(secrets_raw)

        dtype_map = {
            'path': 'path', 'url': 'url', 'uri': 'url',
            'api': 'api', 'sql': 'sql',
        }
        return source, dtype_map[key], secrets

    if isinstance(data, str):
        secrets = _resolve_secrets(data_secrets)
        dtype = _detect_data_type(data)
        return data, dtype, secrets

    raise ValueError(
        f"'data' must be a DataFrame, str, or dict. "
        f"Got {type(data).__name__}."
    )


def _load_data(
    data: Any,
    dtype: Optional[str] = None,
    secrets: Optional[dict] = None,
) -> Any:
    """Load data from any supported source.

    Returns:
        pandas DataFrame
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return data

    if not isinstance(data, str):
        raise ValueError(
            f"'data' must be a DataFrame or string. "
            f"Got {type(data).__name__}."
        )

    if dtype is None:
        dtype = _detect_data_type(data)

    if dtype == 'sql':
        return _read_data_from_sql(data, secrets=secrets)
    elif dtype == 'api':
        return _read_data_from_api(data, cookies=secrets)
    elif dtype == 'url':
        return _read_data_from_url(data, cookies=secrets)
    else:
        return _read_data(data)


def _load_config_from_remote(uri: str) -> dict:
    """Load a JSON or YAML config file from a remote URI (HTTP/S3/GCS)."""
    import os
    import tempfile
    from urllib.parse import urlparse

    _log.info('fetching config from remote URI: %s', uri[:120])

    # Get file extension from URI path
    parsed = urlparse(uri)
    ext = os.path.splitext(parsed.path)[1].lower()

    if uri.startswith(('http://', 'https://')):
        # Handle HTTP/HTTPS URLs
        import requests as req
        resp = req.get(uri, timeout=120)
        resp.raise_for_status()

        # If no extension in URL, try to detect from content-type
        if not ext:
            ct_header = resp.headers.get('Content-Type', '')
            if 'json' in ct_header:
                ext = '.json'
            elif 'yaml' in ct_header or 'yml' in ct_header:
                ext = '.yaml'
            else:
                # Default to YAML as most config files are YAML
                ext = '.yaml'

        content = resp.text
    else:
        # Handle S3/GCS URIs using the audio.io module
        from .audio import io

        # Create a temporary file to download to
        with tempfile.NamedTemporaryFile(mode='w+', suffix=ext or '.yaml', delete=False) as tmp_file:
            temp_path = tmp_file.name

        try:
            # Download the file using audio.io which handles S3/GCS auth
            io.read(uri, dest=temp_path)

            # Read the content from the temporary file
            with open(temp_path, 'r', encoding='utf-8') as f:
                content = f.read()
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

        # Default to YAML if no extension detected
        if not ext:
            ext = '.yaml'

    # Parse the content based on extension
    if ext == '.json':
        return json.loads(content) or {}
    else:
        try:
            import yaml
        except ImportError:
            raise ImportError(
                "pyyaml is required to load YAML config "
                "files: pip install pyyaml"
            )
        return yaml.safe_load(content) or {}


def _load_config(path: str) -> dict:
    """Load a JSON or YAML config file from local path or remote URI."""
    # Check if this is a remote URI (HTTP/HTTPS/S3/GCS)
    if path.startswith(('http://', 'https://', 's3://', 'gs://')):
        return _load_config_from_remote(path)

    # Local file loading
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        with open(path) as f:
            return json.load(f) or {}
    else:
        try:
            import yaml
        except ImportError:
            raise ImportError(
                "pyyaml is required to load YAML config "
                "files: pip install pyyaml"
            )
        with open(path) as f:
            return yaml.safe_load(f) or {}


#
# Audio resolution
#
def _detect_audio_type(value: str) -> str:
    """Detect whether an audio string is url, column, or path."""
    if value.startswith(
        ('http://', 'https://', 's3://', 'gs://'),
    ):
        return 'url'
    if '/' not in value and '.' not in value:
        return 'column'
    return 'path'


def _resolve_audio_from_source(
    source_type: str,
    source_value: str,
    prop: Optional[str],
    index: Optional[int],
    secrets: Optional[dict],
) -> str:
    """Resolve an audio path from an SQL query or API."""
    if index is None:
        index = 1
    idx = max(0, index - 1)

    if not prop:
        raise ValueError(
            f"'property' is required when using "
            f"audio.{source_type} to specify which "
            f"field contains the audio path."
        )

    if source_type == 'sql':
        query = source_value
        if not re.search(
            r'\bLIMIT\b', query, re.IGNORECASE,
        ):
            query = (
                query.rstrip().rstrip(';')
                + f' LIMIT {idx + 1}'
            )
        df = _read_data_from_sql(query, secrets=secrets)
        if len(df) <= idx:
            raise ValueError(
                f"SQL returned {len(df)} rows, but "
                f"response_index={index} (row {idx})"
            )
        val = df.iloc[idx][prop]
    elif source_type == 'api':
        import requests as req
        cookies = secrets or {}
        resp = req.get(
            source_value, cookies=cookies, timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            for k in (
                'data', 'results', 'items',
                'records', 'rows',
            ):
                if k in data and isinstance(
                    data[k], list,
                ):
                    data = data[k]
                    break
        if (
            not isinstance(data, list)
            or len(data) <= idx
        ):
            n = (
                len(data)
                if isinstance(data, list)
                else 'non-list'
            )
            raise ValueError(
                f"API returned {n} items, but "
                f"response_index={index} (row {idx})"
            )
        val = data[idx][prop]
    else:
        raise ValueError(
            f"Unknown audio source type: {source_type}"
        )

    return str(val)


def _resolve_audio_config(
    audio: Any,
    audio_prefix: str,
    audio_suffix: str,
    audio_fallback: str,
    audio_secrets: Any = None,
) -> dict[str, Any]:
    """Normalize the audio parameter into a standard dict.

    Returns dict with keys: type, value, prefix, suffix,
    fallback, secrets.
    """
    prefix = audio_prefix or ''
    suffix = audio_suffix or ''
    fallback = audio_fallback or ''

    if isinstance(audio, dict):
        source_keys = {'sql', 'api'}
        guess_keys = {'src'}
        static_keys = {'path', 'url', 'uri', 'column'}
        all_type_keys = (
            source_keys | guess_keys | static_keys
        )
        found = [k for k in all_type_keys if k in audio]
        if len(found) != 1:
            raise ValueError(
                f"audio dict must have exactly one of "
                f"{all_type_keys}, "
                f"got: {found or 'none'}"
            )
        key = found[0]

        secrets_raw = (
            audio_secrets
            if audio_secrets is not None
            else audio.get('secrets')
        )
        resolved_secrets = _resolve_secrets(secrets_raw)

        if key in source_keys:
            prop = audio.get('property')
            index = audio.get('response_index')
            resolved_value = _resolve_audio_from_source(
                key, audio[key], prop, index,
                resolved_secrets,
            )
            atype = _detect_audio_type(resolved_value)
            return {
                'type': atype,
                'value': resolved_value,
                'prefix': (
                    prefix or audio.get('prefix', '')
                ),
                'suffix': (
                    suffix or audio.get('suffix', '')
                ),
                'fallback': (
                    fallback
                    or audio.get('fallback', '')
                ),
                'secrets': resolved_secrets,
            }

        if key == 'src':
            atype = _detect_audio_type(audio[key])
        elif key in ('url', 'uri'):
            atype = 'url'
        else:
            atype = key
        return {
            'type': atype,
            'value': audio[key],
            'prefix': prefix or audio.get('prefix', ''),
            'suffix': suffix or audio.get('suffix', ''),
            'fallback': (
                fallback or audio.get('fallback', '')
            ),
            'secrets': resolved_secrets,
        }

    if isinstance(audio, str) and audio:
        return {
            'type': _detect_audio_type(audio),
            'value': audio,
            'prefix': prefix,
            'suffix': suffix,
            'fallback': fallback,
            'secrets': _resolve_secrets(audio_secrets),
        }

    raise ValueError(
        "'audio' is required — pass a path, URL, "
        "column name, or dict. "
        "See documentation for details."
    )


_DATA_SOURCE_KEYS = frozenset(
    {'path', 'url', 'uri', 'api', 'sql'},
)
_AUDIO_SOURCE_KEYS = frozenset(
    {'src', 'path', 'url', 'uri', 'column', 'sql', 'api'},
)
_MERGE_DICT_KEYS = frozenset(
    {'data', 'audio', 'output', 'description'},
)
_SOURCE_KEYS_MAP = {
    'data': _DATA_SOURCE_KEYS,
    'audio': _AUDIO_SOURCE_KEYS,
}




def _merge_project_over_config(
    base: dict,
    proj: dict,
) -> None:
    """Merge project overrides on top of base config."""
    for k, v in proj.items():
        if (
            k in _MERGE_DICT_KEYS
            and isinstance(v, dict)
            and isinstance(base.get(k), dict)
        ):
            merged = dict(base[k])
            source_keys = _SOURCE_KEYS_MAP.get(k)
            if source_keys:
                proj_sources = source_keys & v.keys()
                if proj_sources:
                    for sk in source_keys:
                        merged.pop(sk, None)
            merged.update(v)
            base[k] = merged
        else:
            base[k] = v


def _filter_session_args(
    policy: object,
    kwargs: dict[str, object],
) -> tuple[dict[str, object], list[str]]:
    """Filter kwargs according to the session_args policy.

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


_CONFIG_PARAMS = {
    'data', 'data_path', 'data_url', 'data_sql',
    'data_api', 'data_start_time', 'data_end_time',
    'data_duration', 'data_secrets',
    'audio', 'audio_src', 'audio_path', 'audio_url',
    'audio_uri', 'audio_column', 'audio_prefix',
    'audio_suffix', 'audio_fallback', 'audio_secrets',
    'audio_sql', 'audio_api', 'audio_property',
    'audio_response_index',
    'secrets',
    'output', 'output_path', 'output_url', 'output_uri',
    'output_sync_button', 'output_recursive',
    'output_secrets',
    'info_card_title', 'info_card_text', 'display_columns',
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


#
# Public API
#
def print_md(value):
    """ print markdown utility """
    display(Markdown(value))


class BioacousticAnnotator:
    """Main entry point for the bioacoustic annotation widget."""

    def __init__(
        self,
        project=None,
        config=_UNSET,
        form_config=_UNSET,
        data=_UNSET,
        data_path=_UNSET,
        data_url=_UNSET,
        data_sql=_UNSET,
        data_api=_UNSET,
        data_start_time=_UNSET,
        data_end_time=_UNSET,
        data_duration=_UNSET,
        data_secrets=_UNSET,
        audio=_UNSET,
        audio_src=_UNSET,
        audio_path=_UNSET,
        audio_url=_UNSET,
        audio_uri=_UNSET,
        audio_column=_UNSET,
        audio_prefix=_UNSET,
        audio_suffix=_UNSET,
        audio_fallback=_UNSET,
        audio_secrets=_UNSET,
        audio_sql=_UNSET,
        audio_api=_UNSET,
        audio_property=_UNSET,
        audio_response_index=_UNSET,
        output=_UNSET,
        output_path=_UNSET,
        output_url=_UNSET,
        output_uri=_UNSET,
        output_sync_button=_UNSET,
        output_recursive=_UNSET,
        output_secrets=_UNSET,
        description=_UNSET,
        description_title=_UNSET,
        description_text=_UNSET,
        description_path=_UNSET,
        description_open=_UNSET,
        description_height=_UNSET,
        secrets=_UNSET,
        project_name=_UNSET,
        display_columns=_UNSET,
        info_card_title=_UNSET,
        info_card_text=_UNSET,
        info_card_height=_UNSET,
        visualizations=_UNSET,
        spectrogram_resolution=_UNSET,
        default_buffer=_UNSET,
        capture=_UNSET,
        capture_dir=_UNSET,
        capture_height=_UNSET,
        clip_table_height=_UNSET,
        player_height=_UNSET,
        form_panel_height=_UNSET,
        width=_UNSET,
        partial_download=_UNSET,
        duplicate_entries=_UNSET,
        session_args=_UNSET,
        **kwargs,
    ):
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
                ``{path|url|uri|api|sql, secrets, columns}``.
            data_path: Explicit file path (overrides ``data`` source).
            data_url: Explicit URL (overrides ``data`` source).
            data_sql: Explicit SQL query (overrides ``data`` source).
            data_api: Explicit API endpoint (overrides ``data`` source).
            data_start_time: Column name for clip start times.
            data_end_time: Column name for clip end times.
            data_duration: Column name or fixed number for clip duration.
            data_secrets: Auth for data loading. ``{key, value}`` pairs
                where value is ``env:VAR``, ``dialog``, or a literal.
            audio: Audio source. String: local path, URL/URI, or column
                name (auto-detected). Dict form:
                ``{path|url|uri|column|sql|api|src, prefix, suffix,
                fallback, secrets, property, response_index}``.
            audio_src: Audio source string (auto-detected as path, URL,
                or column name).
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
            description: Description panel config — True, string (markdown
                text), file path, or dict.
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
            session_args: List of allowed ``**kwargs`` keys, or True to
                allow all.
            **kwargs: Fixed columns included in every output row.
        """
        # Initialize path tracking variables
        self._project_file = None
        self._config_file = None
        self._form_file = None

        if project is not None:
            passed = {
                k for k in _CONFIG_PARAMS
                if locals().get(k, _UNSET) is not _UNSET
            }
            if passed:
                raise ValueError(
                    f"When 'project' is set, no other "
                    f"config parameters may be passed. "
                    f"Got: {sorted(passed)}"
                )
            if isinstance(project, str):
                _log.info(
                    'loading project file: %s', project,
                )
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
            nested = proj_cfg.pop('config', None)
            if nested:
                if isinstance(nested, str):
                    _log.info(
                        'loading nested config: %s',
                        nested,
                    )
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
                _merge_project_over_config(
                    base, proj_cfg,
                )
                cfg = base
            else:
                cfg = proj_cfg
        else:
            if config not in (_UNSET, None):
                _log.info(
                    'loading config file: %s', config,
                )
                cfg = _load_config(config)
                self._config_file = config
            else:
                cfg = {}


        if project_name is not _UNSET:
            self._project_name = project_name
        elif 'project_name' in cfg:
            self._project_name = cfg['project_name']
        elif isinstance(project, str):
            self._project_name = (
                os.path.splitext(
                    os.path.basename(project),
                )[0]
                .replace('_', ' ')
                .replace('-', ' ')
                .title()
            )
        else:
            self._project_name = DEFAULT_PROJECT_NAME

        self._merged_cfg = dict(cfg)

        _init_cfg = dict(cfg)
        _init_overrides = {}
        for _k in _CONFIG_PARAMS:
            _v = locals().get(_k, _UNSET)
            if _v is not _UNSET:
                _init_overrides[_k] = _v
        _init_cfg.update(_init_overrides)
        _init_cfg.pop('config', None)
        _init_cfg.pop('session_args', None)
        import pandas as _pd
        self._init_args = {
            k: v for k, v in _init_cfg.items()
            if (
                v is not _UNSET
                and v is not None
                and not isinstance(v, _pd.DataFrame)
            )
        }
        def resolve(val, key, default):
            if val is not _UNSET:
                return val
            if key in cfg:
                return cfg[key]
            return default

        raw_global_secrets = resolve(
            secrets, 'secrets', None,
        )

        raw_data = resolve(data, 'data', _UNSET)
        raw_data_path = resolve(
            data_path, 'data_path', None,
        )
        raw_data_url = resolve(
            data_url, 'data_url', None,
        )
        raw_data_sql = resolve(
            data_sql, 'data_sql', None,
        )
        raw_data_api = resolve(
            data_api, 'data_api', None,
        )

        _top_level_data = {
            'path': raw_data_path,
            'url': raw_data_url,
            'sql': raw_data_sql,
            'api': raw_data_api,
        }
        _top_found = {
            k: v for k, v in _top_level_data.items()
            if v is not None
        }

        if len(_top_found) > 1:
            raise ValueError(
                f"Only one of data_path, data_url, "
                f"data_sql, data_api may be set. "
                f"Got: {list(_top_found.keys())}"
            )

        if _top_found:
            _tkey, _tval = next(iter(_top_found.items()))
            if raw_data is _UNSET:
                raw_data = _tval
            elif isinstance(raw_data, dict):
                for k in (
                    'path', 'url', 'uri', 'api', 'sql',
                ):
                    raw_data.pop(k, None)
                raw_data[_tkey] = _tval
            else:
                raw_data = _tval
        elif raw_data is _UNSET:
            raise ValueError(
                "'data' is required — pass a DataFrame, "
                "file path, URL, API endpoint, SQL query,"
                " or dict. Alternatively use data_path, "
                "data_url, data_sql, or data_api."
            )

        _top_dtype = (
            next(iter(_top_found.keys()), None)
            if _top_found else None
        )

        raw_data_secrets = resolve(
            data_secrets, 'data_secrets', None,
        )
        if raw_data_secrets is None:
            raw_data_secrets = raw_global_secrets
        elif raw_data_secrets is False:
            raw_data_secrets = None
        raw_display_columns = resolve(
            display_columns, 'display_columns', None,
        )

        (
            source, dtype, resolved_secrets,
        ) = _resolve_data_config(
            raw_data, raw_data_secrets,
        )
        if _top_dtype and isinstance(source, str):
            dtype = _top_dtype
        src_label = (
            str(source)[:100]
            if isinstance(source, str)
            else type(source).__name__
        )
        _log.info(
            'loading data: dtype=%s source=%s',
            dtype, src_label,
        )
        loaded_data = _load_data(
            source, dtype=dtype, secrets=resolved_secrets,
        )
        _log.info(
            'data loaded: %d rows, %d columns',
            len(loaded_data), len(loaded_data.columns),
        )

        _dict_st = (
            raw_data.get('start_time')
            if isinstance(raw_data, dict) else None
        )
        _dict_et = (
            raw_data.get('end_time')
            if isinstance(raw_data, dict) else None
        )
        _dict_dur = (
            raw_data.get('duration')
            if isinstance(raw_data, dict) else None
        )
        st_col = (
            resolve(
                data_start_time, 'data_start_time', None,
            )
            or _dict_st
            or DEFAULT_START_TIME_COL
        )
        et_col = (
            resolve(
                data_end_time, 'data_end_time', None,
            )
            or _dict_et
            or DEFAULT_END_TIME_COL
        )
        dur_val = resolve(
            data_duration, 'data_duration', None,
        )
        if dur_val is None:
            dur_val = _dict_dur

        if dur_val is not None:
            if isinstance(dur_val, str):
                loaded_data['end_time'] = (
                    loaded_data[st_col]
                    + loaded_data[dur_val]
                )
            else:
                loaded_data['end_time'] = (
                    loaded_data[st_col] + dur_val
                )
            if st_col != 'start_time':
                loaded_data = loaded_data.rename(
                    columns={st_col: 'start_time'},
                )
        else:
            renames = {}
            if st_col != 'start_time':
                renames[st_col] = 'start_time'
            if et_col != 'end_time':
                renames[et_col] = 'end_time'
            if renames:
                loaded_data = loaded_data.rename(
                    columns=renames,
                )

        self._init_audio(
            resolve, cfg, audio, audio_src, audio_path,
            audio_url, audio_uri, audio_column,
            audio_prefix, audio_suffix, audio_fallback,
            audio_secrets, audio_sql, audio_api,
            audio_property, audio_response_index,
            raw_global_secrets,
        )

        self._data = loaded_data
        self._data_source = (
            source if isinstance(source, str) else None
        )
        self._data_start_time = st_col
        self._data_end_time = et_col

        self._init_output(
            resolve, output, output_path, output_url,
            output_uri, output_sync_button,
            output_recursive, output_secrets,
            raw_global_secrets,
        )

        self._info_card_title = resolve(
            info_card_title, 'info_card_title', '',
        )

        raw_form_check = resolve(
            form_config, 'form_config', None,
        )
        if not self._output and raw_form_check is not None:
            ts = datetime.now().strftime(
                DEFAULT_OUTPUT_TS_FMT,
            )
            self._output = os.path.join(
                DEFAULT_OUTPUT_DIR,
                f'{DEFAULT_OUTPUT_PREFIX}-{ts}'
                f'{DEFAULT_OUTPUT_EXT}',
            )

        self._info_card_text = resolve(
            info_card_text, 'info_card_text', '',
        )
        self._data_columns = raw_display_columns or []

        raw_form = resolve(
            form_config, 'form_config', None,
        )
        if isinstance(raw_form, str):
            _log.info(
                'loading form config: %s', raw_form,
            )
            self._form_file = raw_form
            raw_form = _load_config(raw_form)
        self._session_args = resolve(
            session_args, 'session_args', None,
        )
        kwargs, self._stripped_args = _filter_session_args(
            self._session_args, kwargs,
        )
        self._init_kwargs = dict(kwargs)
        if kwargs:
            if raw_form is None:
                raw_form = {}
            fv_list = [
                {'fixed_value': {'column': k, 'value': v}}
                for k, v in kwargs.items()
            ]
            raw_form.setdefault('_fixed_kwargs', fv_list)
        self._form_config = raw_form

        self._duplicate_entries = resolve(
            duplicate_entries, 'duplicate_entries', False,
        )
        self._default_buffer = resolve(
            default_buffer, 'default_buffer',
            DEFAULT_BUFFER,
        )
        self._capture = resolve(
            capture, 'capture', True,
        )
        self._capture_dir = resolve(
            capture_dir, 'capture_dir', '',
        )
        self._capture_height = resolve(
            capture_height, 'capture_height', None,
        )

        self._init_spec_resolutions(
            resolve, spectrogram_resolution,
        )
        self._init_visualizations(resolve, visualizations)

        self._partial_download = resolve(
            partial_download, 'partial_download', True,
        )
        self._width = resolve(
            width, 'width', DEFAULT_WIDTH,
        )
        self._clip_table_height = resolve(
            clip_table_height, 'clip_table_height',
            DEFAULT_CLIP_TABLE_HEIGHT,
        )
        self._player_height = resolve(
            player_height, 'player_height',
            DEFAULT_PLAYER_HEIGHT,
        )
        self._info_card_height = resolve(
            info_card_height, 'info_card_height',
            DEFAULT_INFO_CARD_HEIGHT,
        )
        self._form_panel_height = resolve(
            form_panel_height, 'form_panel_height',
            DEFAULT_FORM_PANEL_HEIGHT,
        )
        self._description_height = resolve(
            description_height, 'description_height',
            DEFAULT_DESCRIPTION_HEIGHT,
        )

        self._init_description(
            resolve, description, description_title,
            description_text, description_path,
            description_open, description_height,
        )

        self._output_cache = None
        self._resolved_output = (
            _resolve_output_templates(self._output)
            if self._output else self._output
        )


    def setup(self) -> None:
        """Serialize data into kernel variables."""
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'BioacousticAnnotator.setup() must be '
                'called from inside a Jupyter kernel.'
            )

        ns = ip.user_ns
        ns['_BA_DATA'] = self._data.to_json(
            orient='records',
        )
        ns['_BA_AUDIO'] = json.dumps(
            self._audio_config,
        )
        ns['_BA_OUTPUT'] = self._resolved_output
        ns['_BA_SYNC_CONFIG'] = json.dumps({
            'uri': self._sync_uri,
            'button': self._sync_button,
            'recursive': self._sync_recursive,
        })
        ns['_BA_INFO_CARD_TITLE'] = self._info_card_title
        ns['_BA_APP_TITLE'] = self._project_name
        ns['_BA_INFO_CARD_TEXT'] = self._info_card_text
        ns['_BA_DATA_COLS'] = json.dumps(
            self._data_columns,
        )

        ns['_BA_FORM_CONFIG'] = json.dumps(
            self._form_config,
        )
        cap = self._capture
        if cap is True:
            cap = DEFAULT_CAPTURE_LABEL
        elif cap is False:
            cap = ''
        ns['_BA_CAPTURE'] = cap
        ns['_BA_CAPTURE_DIR'] = self._capture_dir or ''
        ns['_BA_CAPTURE_HEIGHT'] = (
            str(self._capture_height)
            if self._capture_height
            else ''
        )
        ns['_BA_SPEC_RESOLUTIONS'] = json.dumps(
            self._spec_resolutions,
        )
        ns['_BA_VIZ_META'] = json.dumps(self._viz_meta)
        ns['_BA_DUPLICATE_ENTRIES'] = (
            'true' if self._duplicate_entries else ''
        )
        ns['_BA_DEFAULT_BUFFER'] = str(
            self._default_buffer,
        )
        ns['_BA_CLIP_TABLE_HEIGHT'] = str(
            self._clip_table_height,
        )
        ns['_BA_PLAYER_HEIGHT'] = str(
            self._player_height,
        )
        ns['_BA_INFO_CARD_HEIGHT'] = str(
            self._info_card_height,
        )
        ns['_BA_FORM_PANEL_HEIGHT'] = str(
            self._form_panel_height,
        )
        ns['_BA_DESCRIPTION'] = (
            json.dumps(self._description_config)
            if self._description_config
            else ''
        )
        ns['_BA_DESCRIPTION_HEIGHT'] = str(
            self._description_height,
        )
        ns['_BA_PROJECT_PATH'] = self._project_file or ''
        ns['_BA_CONFIG_PATH'] = self._config_file or ''
        ns['_BA_FORM_PATH'] = self._form_file or ''
        ns['_BA_MERGED_CONFIG'] = json.dumps(
            self._merged_cfg, default=str,
        )
        ns['_BA_INSTANCE'] = self

    def open(self, inline: bool = DEFAULT_INLINE) -> None:
        """Serialize data and open the widget."""
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
        result = validate_config(
            config=self._init_args or None,
            form_config=self._form_config or None,
        )
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
            **kwargs: Additional auth kwargs.
        """
        from jupyter_bioacoustic.audio import io
        _log.info(
            'sync requested: dest=%s recursive=%s',
            dest, recursive,
        )

        src = self._resolved_output
        if not src:
            raise ValueError('No output path configured')
        if not os.path.exists(src):
            raise FileNotFoundError(
                f'Output file not found: {src}',
            )

        target = dest or self._sync_uri
        if not target:
            raise ValueError(
                'No sync destination configured. '
                'Set output.uri/url in config or pass '
                'dest= to sync().'
            )

        rec = (
            recursive
            if recursive is not None
            else self._sync_recursive
        )

        merged_kwargs: dict[str, Any] = {}
        if self._sync_secrets_raw:
            merged_kwargs.update(
                _resolve_secrets(self._sync_secrets_raw),
            )
        merged_kwargs.update(kwargs)

        _log.info(
            'syncing %s -> %s (recursive=%s)',
            src, target, rec,
        )
        result = io.write(
            src, target, recursive=rec, **merged_kwargs,
        )
        _log.info('sync complete: %s', result)
        return result


    def describe(self) -> None:
        """ print description of instance """
        print_md('---')
        print_md('**Configuration Files**')
        print(f'- Project: {self.project_path}')
        print(f'- Config: {self.config_path}')
        print(f'- Form: {self.form_path}')
        print_md('---')
        print_md('**Configuration:**')
        pprint(self.config)
        print_md('---')


    #
    # PROPERTIES
    #
    @property
    def config(self) -> dict[str, Any]:
        """The fully merged configuration after all files and overrides."""
        return dict(self._merged_cfg)

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

    def output(self, force: bool = False) -> Any:
        """Read and return the output file as a DataFrame.

        Args:
            force: Re-read even if a cached copy exists.
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
    # INTERNAL
    #
    def _init_audio(
        self, resolve, cfg, audio, audio_src, audio_path,
        audio_url, audio_uri, audio_column, audio_prefix,
        audio_suffix, audio_fallback, audio_secrets,
        audio_sql, audio_api, audio_property,
        audio_response_index, raw_global_secrets,
    ):
        raw_audio = resolve(audio, 'audio', _UNSET)
        raw_audio_src = resolve(
            audio_src, 'audio_src', None,
        )
        raw_audio_path = resolve(
            audio_path, 'audio_path', None,
        )
        raw_audio_url = resolve(
            audio_url, 'audio_url', None,
        )
        raw_audio_uri = resolve(
            audio_uri, 'audio_uri', None,
        )
        raw_audio_column = resolve(
            audio_column, 'audio_column', None,
        )
        raw_prefix = resolve(
            audio_prefix, 'audio_prefix', '',
        )
        raw_suffix = resolve(
            audio_suffix, 'audio_suffix', '',
        )
        raw_fallback = resolve(
            audio_fallback, 'audio_fallback', '',
        )
        raw_audio_secrets = resolve(
            audio_secrets, 'audio_secrets', None,
        )
        raw_audio_sql = resolve(
            audio_sql, 'audio_sql', None,
        )
        raw_audio_api = resolve(
            audio_api, 'audio_api', None,
        )
        raw_audio_property = resolve(
            audio_property, 'audio_property', None,
        )
        raw_audio_response_index = resolve(
            audio_response_index,
            'audio_response_index', None,
        )
        if raw_audio_secrets is None:
            raw_audio_secrets = raw_global_secrets
        elif raw_audio_secrets is False:
            raw_audio_secrets = None

        _top_audio = {
            'src': raw_audio_src,
            'path': raw_audio_path,
            'url': raw_audio_url or raw_audio_uri,
            'column': raw_audio_column,
            'sql': raw_audio_sql,
            'api': raw_audio_api,
        }
        _top_audio_found = {
            k: v for k, v in _top_audio.items()
            if v is not None
        }

        if len(_top_audio_found) > 1:
            raise ValueError(
                f"Only one of audio_src, audio_path, "
                f"audio_url, audio_uri, audio_column, "
                f"audio_sql, audio_api may be set. "
                f"Got: {list(_top_audio_found.keys())}"
            )

        if _top_audio_found:
            _akey, _aval = next(
                iter(_top_audio_found.items()),
            )
            if raw_audio is _UNSET:
                if _akey == 'src':
                    raw_audio = _aval
                elif _akey in ('sql', 'api'):
                    raw_audio = {_akey: _aval}
                else:
                    raw_audio = _aval
            elif isinstance(raw_audio, dict):
                for k in (
                    'src', 'path', 'url', 'uri',
                    'column', 'sql', 'api',
                ):
                    raw_audio.pop(k, None)
                if _akey == 'src':
                    raw_audio = _aval
                else:
                    raw_audio[_akey] = _aval
            else:
                raw_audio = _aval
        elif raw_audio is _UNSET:
            raise ValueError(
                "'audio' is required — pass a path, "
                "URL, column name, dict, or use "
                "audio_src/audio_path/audio_url/"
                "audio_column/audio_sql/audio_api."
            )

        if isinstance(raw_audio, dict):
            if raw_audio_property is not None:
                raw_audio.setdefault(
                    'property', raw_audio_property,
                )
            if raw_audio_response_index is not None:
                raw_audio['response_index'] = (
                    raw_audio_response_index
                )

        self._audio_config = _resolve_audio_config(
            raw_audio, raw_prefix, raw_suffix,
            raw_fallback, audio_secrets=raw_audio_secrets,
        )
        _log.info(
            'audio config resolved: type=%s value=%s',
            self._audio_config.get('type'),
            str(
                self._audio_config.get('value', ''),
            )[:80],
        )

    def _init_output(
        self, resolve, output, output_path, output_url,
        output_uri, output_sync_button, output_recursive,
        output_secrets, raw_global_secrets,
    ):
        raw_output = resolve(output, 'output', '')
        raw_output_path = resolve(
            output_path, 'output_path', None,
        )
        raw_output_url = resolve(
            output_url, 'output_url', None,
        )
        raw_output_uri = resolve(
            output_uri, 'output_uri', None,
        )
        raw_output_sync_button = resolve(
            output_sync_button, 'output_sync_button',
            None,
        )
        raw_output_recursive = resolve(
            output_recursive, 'output_recursive', None,
        )
        raw_output_secrets = resolve(
            output_secrets, 'output_secrets', None,
        )
        if raw_output_secrets is None:
            raw_output_secrets = raw_global_secrets
        elif raw_output_secrets is False:
            raw_output_secrets = None

        if isinstance(raw_output, dict):
            self._output = raw_output.get('path', '')
            self._sync_uri = (
                raw_output.get('uri')
                or raw_output.get('url')
                or ''
            )
            sync_btn_raw = raw_output.get(
                'sync_button', None,
            )
            if sync_btn_raw is None:
                self._sync_button = (
                    'Sync' if self._sync_uri else ''
                )
            elif isinstance(sync_btn_raw, str):
                self._sync_button = sync_btn_raw
            elif sync_btn_raw:
                self._sync_button = 'Sync'
            else:
                self._sync_button = ''
            self._sync_recursive = raw_output.get(
                'recursive', False,
            )
            self._sync_secrets_raw = raw_output.get(
                'secrets',
            )
        else:
            self._output = raw_output
            self._sync_uri = ''
            self._sync_button = ''
            self._sync_recursive = False
            self._sync_secrets_raw = None

        if raw_output_path is not None:
            self._output = raw_output_path
        if (
            raw_output_url is not None
            or raw_output_uri is not None
        ):
            self._sync_uri = (
                raw_output_url or raw_output_uri or ''
            )
        if raw_output_sync_button is not None:
            if isinstance(raw_output_sync_button, str):
                self._sync_button = (
                    raw_output_sync_button
                )
            elif raw_output_sync_button:
                self._sync_button = 'Sync'
            else:
                self._sync_button = ''
        if raw_output_recursive is not None:
            self._sync_recursive = raw_output_recursive
        if raw_output_secrets is not None:
            self._sync_secrets_raw = raw_output_secrets

        if self._sync_uri and not self._sync_button:
            self._sync_button = 'Sync'

    def _init_spec_resolutions(
        self, resolve, spectrogram_resolution,
    ):
        raw_res = resolve(
            spectrogram_resolution,
            'spectrogram_resolution',
            DEFAULT_SPEC_RESOLUTIONS,
        )
        if isinstance(raw_res, (int, float)):
            self._spec_resolutions = [str(int(raw_res))]
        elif isinstance(raw_res, list):
            self._spec_resolutions = [
                str(r) for r in raw_res
            ]
        else:
            self._spec_resolutions = [
                str(r) for r in DEFAULT_SPEC_RESOLUTIONS
            ]

    def _init_visualizations(
        self, resolve, visualizations,
    ):
        from jupyter_bioacoustic.utils.visualizations \
            import REGISTRY as _VIZ_REGISTRY
        raw_viz = resolve(
            visualizations, 'visualizations',
            DEFAULT_VISUALIZATIONS,
        )
        self._visualizations = []
        self._viz_meta = []
        viz_list = (
            raw_viz
            if isinstance(raw_viz, list)
            else [raw_viz]
        )
        for i, v in enumerate(viz_list):
            if isinstance(v, str):
                self._add_viz_str(
                    v, i, _VIZ_REGISTRY,
                )
            elif callable(v):
                label = getattr(
                    v, '__name__', f'custom_{i}',
                )
                self._visualizations.append(
                    {'type': 'custom', 'fn': v,
                     'label': label},
                )
                self._viz_meta.append(
                    {'type': 'custom', 'label': label,
                     'index': i},
                )
            elif (
                isinstance(v, dict)
                and 'fn' in v
                and callable(v['fn'])
            ):
                label = v.get(
                    'label',
                    getattr(
                        v['fn'], '__name__',
                        f'custom_{i}',
                    ),
                )
                self._visualizations.append(
                    {'type': 'custom', 'fn': v['fn'],
                     'label': label},
                )
                self._viz_meta.append(
                    {'type': 'custom', 'label': label,
                     'index': i},
                )

    def _add_viz_str(
        self,
        v: str,
        i: int,
        registry: dict,
    ) -> None:
        if v in ('linear', 'plain', 'mel'):
            key = (
                'linear'
                if v in ('plain', 'linear')
                else 'mel'
            )
            fs = 'mel' if key == 'mel' else 'linear'
            label = key.replace('_', ' ').title()
            self._visualizations.append({
                'type': 'builtin', 'key': key,
                'label': label, 'freq_scale': fs,
            })
            self._viz_meta.append({
                'type': 'builtin', 'key': key,
                'label': label, 'freq_scale': fs,
                'index': i,
            })
        elif v in registry:
            fn = registry[v]
            label = v.replace('_', ' ').title()
            self._visualizations.append(
                {'type': 'custom', 'fn': fn,
                 'label': label},
            )
            self._viz_meta.append(
                {'type': 'custom', 'label': label,
                 'index': i},
            )
        else:
            raise ValueError(
                f"Unknown visualization '{v}'. "
                f"Available: "
                f"{', '.join(sorted(registry.keys()))}"
            )

    def _init_description(
        self, resolve, description, description_title,
        description_text, description_path,
        description_open, description_height,
    ):
        raw_desc = resolve(
            description, 'description', None,
        )
        raw_desc_title = resolve(
            description_title, 'description_title', None,
        )
        raw_desc_text = resolve(
            description_text, 'description_text', None,
        )
        raw_desc_path = resolve(
            description_path, 'description_path', None,
        )
        raw_desc_open = resolve(
            description_open, 'description_open', None,
        )
        if isinstance(raw_desc, dict):
            raw_desc_title = (
                raw_desc_title
                or raw_desc.get('title')
            )
            raw_desc_text = (
                raw_desc_text or raw_desc.get('text')
            )
            raw_desc_path = (
                raw_desc_path or raw_desc.get('path')
            )
            if raw_desc_open is None:
                raw_desc_open = raw_desc.get('open', True)
            if (
                'height' in raw_desc
                and description_height is _UNSET
            ):
                self._description_height = (
                    raw_desc['height']
                )
        if raw_desc_path and not raw_desc_text:
            try:
                with open(raw_desc_path) as _f:
                    raw_desc_text = _f.read()
                _log.debug(
                    'loaded description from %s',
                    raw_desc_path,
                )
            except OSError as e:
                _log.warning(
                    'could not read description '
                    'file %s: %s',
                    raw_desc_path, e,
                )
                raw_desc_text = (
                    f'(Could not read {raw_desc_path})'
                )
        self._description_config = (
            {
                'title': raw_desc_title or '',
                'text': raw_desc_text or '',
                'open': (
                    raw_desc_open
                    if raw_desc_open is not None
                    else True
                ),
            }
            if raw_desc_text
            else None
        )


    def _invalidate_output_cache(self) -> None:
        """Force a re-read on the next output() call."""
        self._output_cache = None


    def _open_inline(self) -> None:
        """Inject the widget into the cell output area."""
        div_id = f'bioacoustic-{uuid.uuid4().hex[:8]}'
        w = (
            self._width
            if isinstance(self._width, str)
            else f'{self._width}px'
        )
        has_form = self._form_config is not None
        total_h = (
            int(self._clip_table_height)
            + int(self._player_height)
            + int(self._info_card_height)
            + (
                int(self._form_panel_height)
                if has_form else 0
            )
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
