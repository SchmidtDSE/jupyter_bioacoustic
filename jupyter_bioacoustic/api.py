"""
BioacousticAnnotator — opens the bioacoustic review panel from a notebook cell.

Usage (all args):
    BioacousticAnnotator(data=df, audio_path='test.flac',
                 output='observations-test.jsonl').open()

Usage (config file):
    BioacousticAnnotator(config='config.yaml').open()

Usage (config + overrides):
    BioacousticAnnotator(data=df, audio_path='test.flac', config='config.yaml').open()
"""

import json
import os
import re
import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML

# Sentinel — distinguishes "caller passed nothing" from a real default value
_UNSET = object()

# ─── Defaults ─────────────────────────────────────────────────

DEFAULT_OUTPUT_DIR = 'outputs'
DEFAULT_OUTPUT_PREFIX = 'annotation_output'
DEFAULT_OUTPUT_EXT = '.csv'
DEFAULT_OUTPUT_TS_FMT = '%y%m%d_%H%M'
DEFAULT_START_TIME_COL = 'start_time'
DEFAULT_END_TIME_COL = 'end_time'
DEFAULT_BUFFER = 3
DEFAULT_APP_TITLE = 'Jupyter Bioacoustic'
DEFAULT_CAPTURE_LABEL = 'Capture'
DEFAULT_SPEC_RESOLUTIONS = [1000, 2000, 4000]
DEFAULT_VISUALIZATIONS = ['plain', 'mel']
DEFAULT_INLINE = True
DEFAULT_WIDTH = '100%'
DEFAULT_HEIGHT = 900


# ─── Secret resolution ────────────────────────────────────────

def _resolve_secrets(data_secrets) -> dict:
    """Resolve a data_secrets param into a plain {key: value} dict.

    Each entry is ``{key: str, value: str}`` where value can be:
    - ``env:VAR_NAME`` → reads ``os.environ['VAR_NAME']``
    - ``dialog`` (case-insensitive) → prompts the user via getpass
    - anything else → used literally
    """
    if not data_secrets:
        return {}
    if isinstance(data_secrets, dict):
        data_secrets = [data_secrets]

    import getpass
    resolved = {}
    for entry in data_secrets:
        k = entry['key']
        v = entry['value']
        if isinstance(v, str) and re.match(r'^env:', v, re.IGNORECASE):
            env_var = v[4:]
            resolved[k] = os.environ.get(env_var, '')
            if not resolved[k]:
                raise ValueError(
                    f"Environment variable {env_var!r} not set (for secret {k!r})")
        elif isinstance(v, str) and v.lower() == 'dialog':
            resolved[k] = getpass.getpass(f'Enter value for {k!r}: ')
        else:
            resolved[k] = v
    return resolved


# ─── Data type detection ───────────────────────────────────────

def _detect_data_type(data_str: str) -> str:
    """Detect whether a data string is sql, api, url, or path.

    - Contains 'SELECT ' (case-insensitive, trailing space) → 'sql'
    - Starts with 'api::' → 'api'
    - Starts with http://, https://, s3://, gs:// → 'url'
    - Otherwise → 'path'
    """
    if re.search(r'\bSELECT\s', data_str, re.IGNORECASE):
        return 'sql'
    if data_str.lower().startswith('api::'):
        return 'api'
    if data_str.startswith(('http://', 'https://', 's3://', 'gs://')):
        return 'url'
    return 'path'


# ─── Data loading ──────────────────────────────────────────────

def _read_data(path: str):
    """Read a DataFrame from a local file path, inferring format from extension."""
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


def _read_data_from_url(url: str, cookies: dict = None):
    """Fetch data from a URL. Auto-detects file vs JSON response.

    - If Content-Type is application/json or the body parses as JSON → DataFrame
    - If Content-Type suggests JSONL/NDJSON → line-delimited JSON
    - Otherwise → download to temp file and read with _read_data
    """
    import pandas as pd
    import requests as req
    import tempfile

    resp = req.get(url, cookies=cookies or {}, timeout=120)
    resp.raise_for_status()

    ct = resp.headers.get('Content-Type', '').lower()

    # JSON response → DataFrame directly
    if 'application/json' in ct:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            # Try common wrappers: {data: [...], results: [...]}
            for key in ('data', 'results', 'items', 'records', 'rows'):
                if key in data and isinstance(data[key], list):
                    return pd.DataFrame(data[key])
            return pd.DataFrame([data])

    # NDJSON / JSONL
    if 'ndjson' in ct or 'jsonl' in ct:
        import io
        return pd.read_json(io.StringIO(resp.text), lines=True)

    # Try to parse as JSON anyway (some servers don't set Content-Type)
    try:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
    except (ValueError, TypeError):
        pass

    # Fall back to downloading as a file
    ext = os.path.splitext(url.split('?')[0])[1].lower() or '.csv'
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(resp.content)
        tmp_path = f.name
    try:
        return _read_data(tmp_path)
    finally:
        os.unlink(tmp_path)


def _read_data_from_api(url: str, cookies: dict = None):
    """Fetch data from an API endpoint. Strips 'api::' prefix if present."""
    if url.lower().startswith('api::'):
        url = url[5:]
    return _read_data_from_url(url, cookies=cookies)


def _read_data_from_sql(query: str, secrets: dict = None):
    """Execute a SQL query with duckdb and return a DataFrame.

    Automatically loads the httpfs extension if the query references
    s3:// or gs:// paths. Secrets with S3/GCS-related keys are applied
    as duckdb SET commands; others are set as environment variables.

    For public S3 buckets, pass ``data_secrets={'key': 's3_region', 'value': 'us-west-2'}``.
    DuckDB will use unsigned requests by default when no credentials are provided.
    """
    try:
        import duckdb
    except ImportError:
        raise ImportError(
            "duckdb is required for SQL queries: pip install duckdb"
        )

    conn = duckdb.connect(':memory:')

    # Auto-load httpfs if query references cloud storage
    if re.search(r"s3://|gs://|https?://", query, re.IGNORECASE):
        try:
            conn.execute("INSTALL httpfs")
        except Exception:
            pass  # may already be installed
        conn.execute("LOAD httpfs")

    # Duckdb S3/GCS settings that can be SET directly
    _DUCKDB_SET_KEYS = {
        's3_access_key_id', 's3_secret_access_key', 's3_region',
        's3_endpoint', 's3_session_token', 's3_url_style',
        's3_use_ssl', 's3_url_compatibility_mode',
    }

    # Apply secrets
    has_credentials = False
    if secrets:
        for k, v in secrets.items():
            if k.lower() in _DUCKDB_SET_KEYS:
                conn.execute(f"SET {k} = '{v}'")
                if k.lower() in ('s3_access_key_id', 's3_secret_access_key'):
                    has_credentials = True
            else:
                os.environ[k] = str(v)

    # For S3 queries without explicit credentials, try the AWS credential chain
    if re.search(r"s3://", query, re.IGNORECASE) and not has_credentials:
        try:
            conn.execute(
                "CREATE SECRET IF NOT EXISTS (_type = 's3', provider = 'credential_chain')"
            )
        except Exception:
            pass  # credential chain may not be available — duckdb will try unsigned

    result = conn.execute(query).df()
    conn.close()
    return result


def _resolve_data_config(data, data_secrets, data_columns):
    """Normalize the data parameter into (source_str, dtype, secrets, columns).

    Handles:
    - DataFrame → returned as-is with None dtype
    - str → auto-detected type
    - dict → explicit keys: {path|url|uri|api|sql, secrets, columns}

    Returns:
        (data_value, dtype_or_none, resolved_secrets, columns_list)
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return data, None, _resolve_secrets(data_secrets), data_columns or []

    if isinstance(data, dict):
        # Dict form: extract source type + value
        type_keys = {'path', 'url', 'uri', 'api', 'sql'}
        found = [k for k in type_keys if k in data]
        if len(found) != 1:
            raise ValueError(
                f"data dict must have exactly one of {type_keys}, "
                f"got: {found or 'none'}"
            )
        key = found[0]
        source = data[key]

        # Param secrets/columns override dict (explicit args take precedence)
        secrets_raw = data_secrets if data_secrets is not None else data.get('secrets')
        secrets = _resolve_secrets(secrets_raw)

        columns = data_columns if data_columns is not None else data.get('columns') or []

        # Map key to dtype
        dtype_map = {
            'path': 'path',
            'url': 'url',
            'uri': 'url',
            'api': 'api',
            'sql': 'sql',
        }
        return source, dtype_map[key], secrets, columns

    if isinstance(data, str):
        secrets = _resolve_secrets(data_secrets)
        dtype = _detect_data_type(data)
        return data, dtype, secrets, data_columns or []

    raise ValueError(
        f"'data' must be a DataFrame, str, or dict. Got {type(data).__name__}."
    )


def _load_data(data, dtype: str = None, secrets: dict = None):
    """Load data from any supported source.

    Args:
        data: DataFrame, file path, URL, API URL, or SQL query string
        dtype: Explicit type ('path', 'url', 'api', 'sql') or None for auto-detect
        secrets: resolved {key: value} dict for auth

    Returns:
        pandas DataFrame
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return data

    if not isinstance(data, str):
        raise ValueError(
            f"'data' must be a DataFrame or string. Got {type(data).__name__}."
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


def _load_config(path: str) -> dict:
    """Load a JSON or YAML config file, returning a plain dict."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        with open(path) as f:
            return json.load(f) or {}
    else:
        # .yaml, .yml, or no extension — all treated as YAML
        try:
            import yaml
        except ImportError:
            raise ImportError(
                "pyyaml is required to load YAML config files: pip install pyyaml"
            )
        with open(path) as f:
            return yaml.safe_load(f) or {}


def _detect_audio_type(value: str) -> str:
    """Detect whether an audio string is a url, column name, or local path.

    - Starts with http://, https://, s3://, gs:// → 'url'
    - Contains no '/' and no '.' → 'column'
    - Otherwise → 'path'
    """
    if value.startswith(('http://', 'https://', 's3://', 'gs://')):
        return 'url'
    if '/' not in value and '.' not in value:
        return 'column'
    return 'path'


def _resolve_audio_from_source(source_type, source_value, prop, index, secrets):
    """Resolve an audio path from an SQL query or API endpoint.

    Args:
        source_type: 'sql' or 'api'
        source_value: the SQL query or API URL
        prop: property/column name to extract from the result row
        index: 1-based row index (default 1 = first row)
        secrets: resolved secrets dict

    Returns:
        str — the resolved audio path/URL
    """
    # Convert 1-based to 0-based
    if index is None:
        index = 1
    idx = max(0, index - 1)

    if not prop:
        raise ValueError(
            f"'property' is required when using audio.{source_type} "
            f"to specify which field contains the audio path."
        )

    if source_type == 'sql':
        query = source_value
        # Append LIMIT if not already present
        if not re.search(r'\bLIMIT\b', query, re.IGNORECASE):
            query = query.rstrip().rstrip(';') + f' LIMIT {idx + 1}'
        df = _read_data_from_sql(query, secrets=secrets)
        if len(df) <= idx:
            raise ValueError(
                f"SQL returned {len(df)} rows, but response_index={index} (row {idx})")
        val = df.iloc[idx][prop]
    elif source_type == 'api':
        import requests as req
        cookies = secrets or {}
        resp = req.get(source_value, cookies=cookies, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            # Try common wrappers
            for k in ('data', 'results', 'items', 'records', 'rows'):
                if k in data and isinstance(data[k], list):
                    data = data[k]
                    break
        if not isinstance(data, list) or len(data) <= idx:
            raise ValueError(
                f"API returned {len(data) if isinstance(data, list) else 'non-list'} "
                f"items, but response_index={index} (row {idx})")
        val = data[idx][prop]
    else:
        raise ValueError(f"Unknown audio source type: {source_type}")

    return str(val)


def _resolve_audio_config(audio, audio_prefix, audio_suffix, audio_fallback,
                          audio_secrets=None) -> dict:
    """Normalize the audio parameter into a standard dict.

    Returns dict with keys: type, value, prefix, suffix, fallback, secrets.

    For sql/api sources, the audio path is resolved at init time by
    executing the query/request and extracting the specified property.
    """
    prefix = audio_prefix or ''
    suffix = audio_suffix or ''
    fallback = audio_fallback or ''

    if isinstance(audio, dict):
        source_keys = {'sql', 'api'}
        guess_keys = {'src'}
        static_keys = {'path', 'url', 'uri', 'column'}
        all_type_keys = source_keys | guess_keys | static_keys
        found = [k for k in all_type_keys if k in audio]
        if len(found) != 1:
            raise ValueError(
                f"audio dict must have exactly one of {all_type_keys}, "
                f"got: {found or 'none'}"
            )
        key = found[0]

        secrets_raw = audio_secrets if audio_secrets is not None else audio.get('secrets')
        resolved_secrets = _resolve_secrets(secrets_raw)

        if key in source_keys:
            prop = audio.get('property')
            index = audio.get('response_index')
            resolved_value = _resolve_audio_from_source(
                key, audio[key], prop, index, resolved_secrets)
            atype = _detect_audio_type(resolved_value)
            return {
                'type': atype,
                'value': resolved_value,
                'prefix': prefix or audio.get('prefix', ''),
                'suffix': suffix or audio.get('suffix', ''),
                'fallback': fallback or audio.get('fallback', ''),
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
            'fallback': fallback or audio.get('fallback', ''),
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
        "'audio' is required — pass a path, URL, column name, or dict. "
        "See documentation for details."
    )


class BioacousticAnnotator:
    def __init__(
        self,
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
        secrets=_UNSET,
        output=_UNSET,
        ident_column=_UNSET,
        app_title=_UNSET,
        display_columns=_UNSET,
        data_columns=_UNSET,
        form_config=_UNSET,
        duplicate_entries=_UNSET,
        default_buffer=_UNSET,
        capture=_UNSET,
        capture_dir=_UNSET,
        spectrogram_resolution=_UNSET,
        visualizations=_UNSET,
        partial_download=_UNSET,
        width=_UNSET,
        height=_UNSET,
        config=None,
        **kwargs,
    ):
        """
        Parameters
        ----------
        data : pandas.DataFrame or str, optional
            Rows with at minimum: id, start_time, end_time.
            If a string, treated as a file path; .csv, .parquet, .jsonl,
            and .ndjson are supported.
        audio_path : str, optional
            Local path or s3:// URI to the audio file.
        output : str, optional
            Path where rows are appended on each submit.
            Format is inferred from extension: .csv, .parquet, or .jsonl/.ndjson.
            Parent directories are created automatically.
            Defaults to ``outputs/annotation_output-YYMMDD_HHMM.csv``
            when a ``form_config`` is set and no output is provided.
        ident_column : str, optional
            Name of the column in ``data`` to highlight in the info
            card (e.g. ``'common_name'``).
        display_columns : list of str, optional
            Extra columns from ``data`` to display in the player info card.
        data_columns : list of str, optional
            Ordered list of columns to display in the clip table.
            Overrides the default column selection.
        width : int or str, optional
            Width of the inline widget. Integers are treated as pixels.
            Default '100%'.
        height : int or str, optional
            Height of the inline widget. Integers are treated as pixels.
            Default 900 (px).
        config : str, optional
            Path to a JSON or YAML config file (.json, .yaml, .yml; no
            extension assumes YAML). Any parameter above can be set in the
            file. Explicitly passed arguments always take precedence over
            config file values.
        """
        cfg = _load_config(config) if config else {}

        def resolve(val, key, default):
            """Return val if explicitly provided, else config value, else default."""
            if val is not _UNSET:
                return val
            if key in cfg:
                return cfg[key]
            return default

        # Global secrets — fallback for data_secrets and audio_secrets
        raw_global_secrets = resolve(secrets, 'secrets', None)

        raw_data = resolve(data, 'data', _UNSET)
        raw_data_path = resolve(data_path, 'data_path', None)
        raw_data_url = resolve(data_url, 'data_url', None)
        raw_data_sql = resolve(data_sql, 'data_sql', None)
        raw_data_api = resolve(data_api, 'data_api', None)

        # Top-level data_path/url/sql/api can serve as or override the source
        _top_level_data = {
            'path': raw_data_path, 'url': raw_data_url,
            'sql': raw_data_sql, 'api': raw_data_api,
        }
        _top_found = {k: v for k, v in _top_level_data.items() if v is not None}

        if len(_top_found) > 1:
            raise ValueError(
                f"Only one of data_path, data_url, data_sql, data_api may be set. "
                f"Got: {list(_top_found.keys())}"
            )

        if _top_found:
            # A top-level source param was provided
            _tkey, _tval = next(iter(_top_found.items()))
            if raw_data is _UNSET:
                # No data param at all — use top-level as the source
                raw_data = _tval
            elif isinstance(raw_data, dict):
                # Inject/override the source key in the data dict
                # Remove any existing source keys first
                for k in ('path', 'url', 'uri', 'api', 'sql'):
                    raw_data.pop(k, None)
                raw_data[_tkey] = _tval
            else:
                # data is a str or DataFrame — top-level overrides it
                raw_data = _tval
        elif raw_data is _UNSET:
            raise ValueError(
                "'data' is required — pass a DataFrame, file path, URL, "
                "API endpoint, SQL query, or dict. "
                "Alternatively use data_path, data_url, data_sql, or data_api."
            )

        # Determine dtype for top-level source params
        _top_dtype = next(iter(_top_found.keys()), None) if _top_found else None

        # data_secrets > secrets > data.secrets
        raw_data_secrets = resolve(data_secrets, 'data_secrets', None)
        if raw_data_secrets is None:
            raw_data_secrets = raw_global_secrets
        raw_data_columns = resolve(data_columns, 'data_columns', None)

        # Resolve data config — handles str, dict, and DataFrame
        source, dtype, resolved_secrets, resolved_columns = _resolve_data_config(
            raw_data, raw_data_secrets, raw_data_columns)
        # Top-level type hint overrides auto-detection (for str sources)
        if _top_dtype and isinstance(source, str):
            dtype = _top_dtype
        loaded_data = _load_data(source, dtype=dtype, secrets=resolved_secrets)

        # Normalize start_time / end_time / duration columns
        # Resolve from: top-level param > config > data dict > default
        _dict_st = raw_data.get('start_time') if isinstance(raw_data, dict) else None
        _dict_et = raw_data.get('end_time') if isinstance(raw_data, dict) else None
        _dict_dur = raw_data.get('duration') if isinstance(raw_data, dict) else None
        st_col = resolve(data_start_time, 'data_start_time', None) or _dict_st or DEFAULT_START_TIME_COL
        et_col = resolve(data_end_time, 'data_end_time', None) or _dict_et or DEFAULT_END_TIME_COL
        dur_val = resolve(data_duration, 'data_duration', None)
        if dur_val is None:
            dur_val = _dict_dur

        if dur_val is not None:
            # duration: compute end_time from start + duration
            if isinstance(dur_val, str):
                # dur_val is a column name
                loaded_data['end_time'] = loaded_data[st_col] + loaded_data[dur_val]
            else:
                # dur_val is a fixed number
                loaded_data['end_time'] = loaded_data[st_col] + dur_val
            # Rename start col if needed
            if st_col != 'start_time':
                loaded_data = loaded_data.rename(columns={st_col: 'start_time'})
        else:
            # Rename columns if they differ from defaults
            renames = {}
            if st_col != 'start_time':
                renames[st_col] = 'start_time'
            if et_col != 'end_time':
                renames[et_col] = 'end_time'
            if renames:
                loaded_data = loaded_data.rename(columns=renames)

        # Resolve audio
        # audio_secrets > secrets > audio.secrets
        raw_audio = resolve(audio, 'audio', _UNSET)
        raw_audio_src = resolve(audio_src, 'audio_src', None)
        raw_audio_path = resolve(audio_path, 'audio_path', None)
        raw_audio_url = resolve(audio_url, 'audio_url', None)
        raw_audio_uri = resolve(audio_uri, 'audio_uri', None)
        raw_audio_column = resolve(audio_column, 'audio_column', None)
        raw_prefix = resolve(audio_prefix, 'audio_prefix', '')
        raw_suffix = resolve(audio_suffix, 'audio_suffix', '')
        raw_fallback = resolve(audio_fallback, 'audio_fallback', '')
        raw_audio_secrets = resolve(audio_secrets, 'audio_secrets', None)
        raw_audio_sql = resolve(audio_sql, 'audio_sql', None)
        raw_audio_api = resolve(audio_api, 'audio_api', None)
        raw_audio_property = resolve(audio_property, 'audio_property', None)
        raw_audio_response_index = resolve(audio_response_index, 'audio_response_index', None)
        if raw_audio_secrets is None:
            raw_audio_secrets = raw_global_secrets

        _top_audio = {
            'src': raw_audio_src,
            'path': raw_audio_path, 'url': raw_audio_url or raw_audio_uri,
            'column': raw_audio_column,
            'sql': raw_audio_sql, 'api': raw_audio_api,
        }
        _top_audio_found = {k: v for k, v in _top_audio.items() if v is not None}

        if len(_top_audio_found) > 1:
            raise ValueError(
                f"Only one of audio_src, audio_path, audio_url, audio_uri, "
                f"audio_column, audio_sql, audio_api may be set. "
                f"Got: {list(_top_audio_found.keys())}"
            )

        if _top_audio_found:
            _akey, _aval = next(iter(_top_audio_found.items()))
            if raw_audio is _UNSET:
                if _akey == 'src':
                    raw_audio = _aval
                elif _akey in ('sql', 'api'):
                    raw_audio = {_akey: _aval}
                else:
                    raw_audio = _aval
            elif isinstance(raw_audio, dict):
                for k in ('src', 'path', 'url', 'uri', 'column', 'sql', 'api'):
                    raw_audio.pop(k, None)
                if _akey == 'src':
                    raw_audio = _aval
                else:
                    raw_audio[_akey] = _aval
            else:
                raw_audio = _aval
        elif raw_audio is _UNSET:
            raise ValueError(
                "'audio' is required — pass a path, URL, column name, dict, "
                "or use audio_src/audio_path/audio_url/audio_column/audio_sql/audio_api."
            )

        # Inject top-level property/response_index into dict if audio is a dict
        if isinstance(raw_audio, dict):
            if raw_audio_property is not None:
                raw_audio.setdefault('property', raw_audio_property)
            if raw_audio_response_index is not None:
                raw_audio['response_index'] = raw_audio_response_index

        self._audio_config = _resolve_audio_config(
            raw_audio, raw_prefix, raw_suffix, raw_fallback,
            audio_secrets=raw_audio_secrets)

        self._data             = loaded_data
        raw_output = resolve(output, 'output', '')
        if isinstance(raw_output, dict):
            self._output = raw_output.get('path', '')
            self._sync_uri = raw_output.get('uri') or raw_output.get('url') or ''
            sync_btn_raw = raw_output.get('sync_button', None)
            if sync_btn_raw is None:
                self._sync_button = 'Sync' if self._sync_uri else ''
            elif isinstance(sync_btn_raw, str):
                self._sync_button = sync_btn_raw
            elif sync_btn_raw:
                self._sync_button = 'Sync'
            else:
                self._sync_button = ''
            self._sync_recursive = raw_output.get('recursive', False)
            self._sync_secrets_raw = raw_output.get('secrets')
        else:
            self._output = raw_output
            self._sync_uri = ''
            self._sync_button = ''
            self._sync_recursive = False
            self._sync_secrets_raw = None
        self._ident_column = resolve(ident_column, 'ident_column', '')
        self._app_title        = resolve(app_title,         'app_title',         DEFAULT_APP_TITLE)

        # Default output filename when a form is configured but no output path given
        raw_form_check = resolve(form_config, 'form_config', None)
        if not self._output and raw_form_check is not None:
            from datetime import datetime
            ts = datetime.now().strftime(DEFAULT_OUTPUT_TS_FMT)
            self._output = os.path.join(DEFAULT_OUTPUT_DIR, f'{DEFAULT_OUTPUT_PREFIX}-{ts}{DEFAULT_OUTPUT_EXT}')
        self._display_columns  = resolve(display_columns,  'display_columns',  None) or []
        self._data_columns     = resolved_columns
        raw_form = resolve(form_config, 'form_config', None)
        if isinstance(raw_form, str):
            raw_form = _load_config(raw_form)
        # Append **kwargs as fixed_value entries to the form config
        if kwargs:
            if raw_form is None:
                raw_form = {}
            # Build a list of fixed_value entries; append after submission_buttons
            fv_list = [{'fixed_value': {'column': k, 'value': v}} for k, v in kwargs.items()]
            raw_form.setdefault('_fixed_kwargs', fv_list)
        self._form_config = raw_form   # dict or None
        self._duplicate_entries = resolve(duplicate_entries, 'duplicate_entries', False)
        self._default_buffer   = resolve(default_buffer,   'default_buffer',   DEFAULT_BUFFER)
        self._capture          = resolve(capture,          'capture',          True)
        self._capture_dir      = resolve(capture_dir,     'capture_dir',      '')
        raw_res = resolve(spectrogram_resolution, 'spectrogram_resolution', DEFAULT_SPEC_RESOLUTIONS)
        # Normalize to list of strings (preserves "selected::" prefix)
        if isinstance(raw_res, (int, float)):
            self._spec_resolutions = [str(int(raw_res))]
        elif isinstance(raw_res, list):
            self._spec_resolutions = [str(r) for r in raw_res]
        else:
            self._spec_resolutions = [str(r) for r in DEFAULT_SPEC_RESOLUTIONS]
        # Normalize visualizations list
        from jupyter_bioacoustic.utils.visualizations import REGISTRY as _VIZ_REGISTRY
        raw_viz = resolve(visualizations, 'visualizations', DEFAULT_VISUALIZATIONS)
        self._visualizations = []
        self._viz_meta = []  # JSON-serializable metadata for TS side
        for i, v in enumerate(raw_viz if isinstance(raw_viz, list) else [raw_viz]):
            if isinstance(v, str):
                if v in ('plain', 'mel'):
                    # Legacy built-in: handled by the TS py_chunks pipeline
                    fs = 'mel' if v == 'mel' else 'linear'
                    label = v.replace('_', ' ').title()
                    self._visualizations.append({'type': 'builtin', 'key': v, 'label': label, 'freq_scale': fs})
                    self._viz_meta.append({'type': 'builtin', 'key': v, 'label': label, 'freq_scale': fs, 'index': i})
                elif v in _VIZ_REGISTRY:
                    # Registered visualization function (by name)
                    fn = _VIZ_REGISTRY[v]
                    label = v.replace('_', ' ').title()
                    self._visualizations.append({'type': 'custom', 'fn': fn, 'label': label})
                    self._viz_meta.append({'type': 'custom', 'label': label, 'index': i})
                else:
                    raise ValueError(
                        f"Unknown visualization '{v}'. "
                        f"Available: {', '.join(sorted(_VIZ_REGISTRY.keys()))}"
                    )
            elif callable(v):
                label = getattr(v, '__name__', f'custom_{i}')
                self._visualizations.append({'type': 'custom', 'fn': v, 'label': label})
                self._viz_meta.append({'type': 'custom', 'label': label, 'index': i})
            elif isinstance(v, dict) and 'fn' in v and callable(v['fn']):
                label = v.get('label', getattr(v['fn'], '__name__', f'custom_{i}'))
                self._visualizations.append({'type': 'custom', 'fn': v['fn'], 'label': label})
                self._viz_meta.append({'type': 'custom', 'label': label, 'index': i})

        self._partial_download = resolve(partial_download, 'partial_download', True)
        self._width            = resolve(width,            'width',            DEFAULT_WIDTH)
        self._height           = resolve(height,           'height',           DEFAULT_HEIGHT)
        self._output_cache     = None

    @property
    def source(self):
        """The input DataFrame passed as ``data``."""
        return self._data

    def output(self, force: bool = False):
        """Read and return the output file as a DataFrame.

        Parameters
        ----------
        force : bool, optional
            If True, re-read the file even if a cached copy exists.
            Default False.
        """
        if self._output_cache is not None and not force:
            return self._output_cache
        if not self._output:
            return None
        if not os.path.exists(self._output):
            return None
        self._output_cache = _read_data(self._output)
        return self._output_cache

    def _invalidate_output_cache(self):
        """Called by the widget after each submit to force a re-read."""
        self._output_cache = None

    def open(self, inline: bool = DEFAULT_INLINE) -> None:
        """Serialize data into kernel variables and open the widget.

        Parameters
        ----------
        inline : bool, optional
            If True, embed the widget below the cell instead of opening
            a split-right panel. Default True.
        """
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'BioacousticAnnotator.open() must be called from inside a Jupyter kernel.'
            )

        ip.user_ns['_BA_DATA']           = self._data.to_json(orient='records')
        ip.user_ns['_BA_AUDIO']          = json.dumps(self._audio_config)
        ip.user_ns['_BA_OUTPUT']         = self._output
        ip.user_ns['_BA_SYNC_CONFIG']    = json.dumps({
            'uri': self._sync_uri,
            'button': self._sync_button,
            'recursive': self._sync_recursive,
        })
        ip.user_ns['_BA_IDENT_COL']      = self._ident_column
        ip.user_ns['_BA_APP_TITLE']      = self._app_title
        ip.user_ns['_BA_DISPLAY_COLS']   = json.dumps(self._display_columns)
        ip.user_ns['_BA_DATA_COLS']      = json.dumps(self._data_columns)

        ip.user_ns['_BA_FORM_CONFIG'] = json.dumps(self._form_config)
        # capture: True → default label, str → that string, False → ''
        cap = self._capture
        if cap is True:
            cap = DEFAULT_CAPTURE_LABEL
        elif cap is False:
            cap = ''
        ip.user_ns['_BA_CAPTURE'] = cap
        ip.user_ns['_BA_CAPTURE_DIR'] = self._capture_dir or ''
        ip.user_ns['_BA_SPEC_RESOLUTIONS'] = json.dumps(self._spec_resolutions)
        ip.user_ns['_BA_VIZ_META'] = json.dumps(self._viz_meta)
        ip.user_ns['_BA_DUPLICATE_ENTRIES'] = 'true' if self._duplicate_entries else ''
        ip.user_ns['_BA_DEFAULT_BUFFER'] = str(self._default_buffer)
        ip.user_ns['_BA_INSTANCE'] = self

        if inline:
            self._open_inline()
        else:
            display(Javascript(
                "window._bioacousticApp?.commands.execute('bioacoustic:open')"
            ))

    def sync(self, dest: str = None, recursive: bool = None, **kwargs) -> str:
        """Upload the current output file to the configured remote location.

        Parameters
        ----------
        dest : str, optional
            Override the destination URI. Defaults to the configured
            ``output.uri`` / ``output.url``.
        recursive : bool, optional
            Override the configured ``output.recursive`` setting.
        **kwargs
            Additional auth kwargs passed to ``io.write()``
            (e.g. profile_name, client, cookies, token).
            Overrides any configured ``output.secrets``.
        """
        from jupyter_bioacoustic.audio import io

        src = self._output
        if not src:
            raise ValueError('No output path configured')
        if not os.path.exists(src):
            raise FileNotFoundError(f'Output file not found: {src}')

        target = dest or self._sync_uri
        if not target:
            raise ValueError(
                'No sync destination configured. '
                'Set output.uri/url in config or pass dest= to sync().'
            )

        rec = recursive if recursive is not None else self._sync_recursive

        merged_kwargs = {}
        if self._sync_secrets_raw:
            merged_kwargs.update(_resolve_secrets(self._sync_secrets_raw))
        merged_kwargs.update(kwargs)

        return io.write(src, target, recursive=rec, **merged_kwargs)

    def _open_inline(self) -> None:
        """Inject the widget into the cell output area."""
        div_id = f'bioacoustic-{uuid.uuid4().hex[:8]}'
        w = self._width if isinstance(self._width, str) else f'{self._width}px'
        h = self._height if isinstance(self._height, str) else f'{self._height}px'

        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:{w};height:{h};'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:auto;position:relative;resize:both;'
            f'"></div>'
        ))

        display(Javascript(
            f"window._bioacousticOpenInline && window._bioacousticOpenInline('{div_id}')"
        ))
