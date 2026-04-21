"""
JupyterAudio — opens the bioacoustic review panel from a notebook cell.

Usage (all args):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.jsonl').open()

Usage (config file):
    JupyterAudio(config='config.yaml').open()

Usage (config + overrides):
    JupyterAudio(data=df, audio_path='test.flac', config='config.yaml').open()
"""

import json
import os
import re
import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML

# Sentinel — distinguishes "caller passed nothing" from a real default value
_UNSET = object()


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


def _resolve_audio_config(audio, audio_prefix, audio_suffix, audio_fallback) -> dict:
    """Normalize the audio parameter into a standard dict.

    Returns dict with keys: type, value, prefix, suffix, fallback.
    """
    prefix = audio_prefix or ''
    suffix = audio_suffix or ''
    fallback = audio_fallback or ''

    if isinstance(audio, dict):
        # Explicit dict form: must have exactly one of path/url/uri/column
        type_keys = {'path', 'url', 'uri', 'column'}
        found = [k for k in type_keys if k in audio]
        if len(found) != 1:
            raise ValueError(
                f"audio dict must have exactly one of {type_keys}, "
                f"got: {found or 'none'}"
            )
        key = found[0]
        atype = 'url' if key in ('url', 'uri') else key
        return {
            'type': atype,
            'value': audio[key],
            'prefix': prefix or audio.get('prefix', ''),
            'suffix': suffix or audio.get('suffix', ''),
            'fallback': fallback or audio.get('fallback', ''),
        }

    if isinstance(audio, str) and audio:
        return {
            'type': _detect_audio_type(audio),
            'value': audio,
            'prefix': prefix,
            'suffix': suffix,
            'fallback': fallback,
        }

    raise ValueError(
        "'audio' is required — pass a path, URL, column name, or dict. "
        "See documentation for details."
    )


class JupyterAudio:
    def __init__(
        self,
        data=_UNSET,
        data_secrets=_UNSET,
        audio=_UNSET,
        audio_prefix=_UNSET,
        audio_suffix=_UNSET,
        audio_fallback=_UNSET,
        category_path=_UNSET,
        output=_UNSET,
        prediction_column=_UNSET,
        display_columns=_UNSET,
        data_columns=_UNSET,
        form_config=_UNSET,
        duplicate_entries=_UNSET,
        default_buffer=_UNSET,
        capture=_UNSET,
        capture_dir=_UNSET,
        inline=_UNSET,
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
        category_path : str, optional
            Path to categories.csv (used to populate the name dropdown).
        output : str, optional
            Path where rows are appended on Verify/Submit.
            Format is inferred from extension: .csv, .parquet, or .jsonl/.ndjson.
            Defaults to line-delimited JSON for any other/missing extension.
        prediction_column : str, optional
            Name of the column in ``data`` that holds the model's predicted
            class (e.g. ``'common_name'``).  When set, the widget operates in
            **verification mode**. When empty (default), operates in
            **annotation mode**.
        display_columns : list of str, optional
            Extra columns from ``data`` to display in the player info card.
        data_columns : list of str, optional
            Ordered list of columns to display in the clip table.
            Overrides the default column selection.
        inline : bool, optional
            If True, embed the widget below the cell instead of opening a
            split-right panel. Default False.
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

        raw_data = resolve(data, 'data', _UNSET)
        if raw_data is _UNSET:
            raise ValueError(
                "'data' is required — pass a DataFrame, file path, URL, "
                "API endpoint, SQL query, or dict."
            )
        raw_data_secrets = resolve(data_secrets, 'data_secrets', None)
        raw_data_columns = resolve(data_columns, 'data_columns', None)

        # Resolve data config — handles str, dict, and DataFrame
        source, dtype, secrets, resolved_columns = _resolve_data_config(
            raw_data, raw_data_secrets, raw_data_columns)
        loaded_data = _load_data(source, dtype=dtype, secrets=secrets)

        # Resolve audio
        raw_audio = resolve(audio, 'audio', _UNSET)
        raw_prefix = resolve(audio_prefix, 'audio_prefix', '')
        raw_suffix = resolve(audio_suffix, 'audio_suffix', '')
        raw_fallback = resolve(audio_fallback, 'audio_fallback', '')

        self._audio_config = _resolve_audio_config(
            raw_audio, raw_prefix, raw_suffix, raw_fallback)

        self._data             = loaded_data
        self._category_path    = resolve(category_path,    'category_path',    '')
        self._output           = resolve(output,           'output',           '')
        self._prediction_column = resolve(prediction_column, 'prediction_column', '')
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
        self._default_buffer   = resolve(default_buffer,   'default_buffer',   3)
        self._capture          = resolve(capture,          'capture',          True)
        self._capture_dir      = resolve(capture_dir,     'capture_dir',      '')
        self._inline           = resolve(inline,           'inline',           False)
        self._width            = resolve(width,            'width',            '100%')
        self._height           = resolve(height,           'height',           900)
        self._output_cache     = None

    @property
    def source(self):
        """The input DataFrame passed as ``data``."""
        return self._data

    def output(self):
        """Read and return the output file as a DataFrame.

        Caches the result until the next call to ``open()`` (which resets it),
        so repeated calls don't re-read the file.
        """
        if self._output_cache is not None:
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

    def open(self) -> None:
        """Serialize data into kernel variables and open the review panel."""
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'JupyterAudio.open() must be called from inside a Jupyter kernel.'
            )

        ip.user_ns['_BA_DATA']           = self._data.to_json(orient='records')
        ip.user_ns['_BA_AUDIO']          = json.dumps(self._audio_config)
        ip.user_ns['_BA_CATEGORY_PATH']  = self._category_path
        ip.user_ns['_BA_OUTPUT']         = self._output
        ip.user_ns['_BA_PREDICTION_COL'] = self._prediction_column
        ip.user_ns['_BA_DISPLAY_COLS']   = json.dumps(self._display_columns)
        ip.user_ns['_BA_DATA_COLS']      = json.dumps(self._data_columns)

        ip.user_ns['_BA_FORM_CONFIG'] = json.dumps(self._form_config)
        # capture: True → 'Capture', str → that string, False → ''
        cap = self._capture
        if cap is True:
            cap = 'Capture'
        elif cap is False:
            cap = ''
        ip.user_ns['_BA_CAPTURE'] = cap
        ip.user_ns['_BA_CAPTURE_DIR'] = self._capture_dir or ''
        ip.user_ns['_BA_DUPLICATE_ENTRIES'] = 'true' if self._duplicate_entries else ''
        ip.user_ns['_BA_DEFAULT_BUFFER'] = str(self._default_buffer)
        ip.user_ns['_BA_INSTANCE'] = self

        if self._inline:
            self._open_inline()
        else:
            display(Javascript(
                "window._bioacousticApp?.commands.execute('bioacoustic:open')"
            ))

    def _open_inline(self) -> None:
        """Inject the widget into the cell output area."""
        div_id = f'bioacoustic-{uuid.uuid4().hex[:8]}'
        w = self._width if isinstance(self._width, str) else f'{self._width}px'
        h = self._height if isinstance(self._height, str) else f'{self._height}px'

        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:{w};height:{h};'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:hidden;position:relative;'
            f'"></div>'
        ))

        display(Javascript(
            f"window._bioacousticOpenInline && window._bioacousticOpenInline('{div_id}')"
        ))
