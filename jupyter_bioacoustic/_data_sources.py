"""
Data Sources

Load the annotator's input table from a DataFrame, a local file, an
http(s)/s3/gs URL, an ``api::`` endpoint or a DuckDB SQL query, and resolve
the ``secrets`` entries those sources need.

These helpers are re-exported from ``jupyter_bioacoustic.api`` under their
old underscore names (``_load_data``, ``_read_data``, ...).

License: BSD 3-Clause
"""  # noqa: D415
#
# Imports
#
from __future__ import annotations

import contextlib
import getpass
import io
import logging
import os
import re
import tempfile
from typing import Any, Iterator, Optional


#
# CONSTANTS
#
# same logger name as before the split out of api.py, so log output is unchanged
_log = logging.getLogger('jupyter_bioacoustic.api')

# Maps a data 'source_type' to the loader dtype ('uri' is a URL alias).
DATA_TYPE_MAP = {
    'path': 'path', 'url': 'url', 'uri': 'url',
    'api': 'api', 'sql': 'sql',
}
# Explicit source keys of a ``data:`` dict (the alternative to ``value``).
DATA_EXPLICIT_KEYS = frozenset({'path', 'url', 'uri', 'api', 'sql'})
# String prefixes treated as remote URLs (data, config and audio detection).
REMOTE_PREFIXES = ('http://', 'https://', 's3://', 'gs://')
# Keys of a JSON object response that may hold the list of records.
RECORD_LIST_KEYS = ('data', 'results', 'items', 'records', 'rows')
REQUEST_TIMEOUT_S = 120

_CLOUD_PREFIXES = ('s3://', 'gs://', 'gcs://')
_ENV_DEFAULT = '__IS_ENV'
_DUCKDB_SET_KEYS = frozenset({
    's3_access_key_id', 's3_secret_access_key',
    's3_region', 's3_endpoint', 's3_session_token',
    's3_url_style', 's3_use_ssl',
    's3_url_compatibility_mode',
})
_DUCKDB_CREDENTIAL_KEYS = ('s3_access_key_id', 's3_secret_access_key')


#
# PUBLIC
#
def resolve_secrets(data_secrets: Any) -> dict[str, str]:
    """Resolve a ``secrets`` param into a plain dict.

    Each entry is ``{key: str, value: str}`` where value can be:
    - missing -> reads the environment variable named *key*
    - ``env:VAR_NAME`` -> reads ``os.environ['VAR_NAME']``
    - ``dialog`` (case-insensitive) -> prompts via getpass
    - anything else -> used literally

    Args:
        data_secrets: One entry dict, a list of entry dicts, or a falsey value.

    Returns:
        ``{key: resolved_value}`` (empty when *data_secrets* is falsey).

    Raises:
        ValueError: If a referenced environment variable is unset or empty.
    """
    if not data_secrets:
        return {}
    if isinstance(data_secrets, dict):
        data_secrets = [data_secrets]

    resolved: dict[str, str] = {}
    for entry in data_secrets:
        k = entry['key']
        v = entry.get('value', _ENV_DEFAULT)
        if v == _ENV_DEFAULT:
            env_var = k
        elif isinstance(v, str) and re.match(r'^env:', v, re.IGNORECASE):
            env_var = v[4:]
        else:
            env_var = None
        if env_var:
            resolved[k] = os.environ.get(env_var, '')
            if not resolved[k]:
                _log.error('Environment variable %r not set (for secret %r)', env_var, k)
                raise ValueError(
                    f"Environment variable {env_var!r} "
                    f"not set (for secret {k!r})"
                )
        elif isinstance(v, str) and v.lower() == 'dialog':
            resolved[k] = getpass.getpass(f'Enter value for {k!r}: ')
        else:
            resolved[k] = v
    return resolved


def detect_data_type(data_str: str) -> str:
    """Detect whether a data string is sql, api, url, or path.

    - Contains 'SELECT ' (case-insensitive) -> 'sql'
    - Starts with 'api::' -> 'api'
    - Starts with http/https/s3/gs -> 'url'
    - Otherwise -> 'path'

    Args:
        data_str: The data source string.

    Returns:
        ``'sql'``, ``'api'``, ``'url'`` or ``'path'``.
    """
    if re.search(r'\bSELECT\s', data_str, re.IGNORECASE):
        return 'sql'
    if data_str.lower().startswith('api::'):
        return 'api'
    if data_str.startswith(REMOTE_PREFIXES):
        return 'url'
    return 'path'


def check_source_keys(
    section: dict,
    explicit_keys: set[str] | frozenset[str],
    label: str,
) -> tuple[bool, list[str]]:
    """Check that a data/audio dict names exactly one source.

    A section uses either ``value`` (with an optional ``source_type``) or
    exactly one explicit source key such as ``path`` or ``sql``.

    Args:
        section: The ``data:`` or ``audio:`` dict.
        explicit_keys: The explicit source keys allowed for this section.
        label: ``'data'`` or ``'audio'`` (used in error messages).

    Returns:
        ``(has_value, found)``: whether ``value`` is set, and the explicit
        source keys present.

    Raises:
        ValueError: If both ``value`` and an explicit key are set, or if
            neither (or more than one explicit key) is set.
    """
    has_value = section.get('value') is not None
    found = [k for k in explicit_keys if k in section]
    if has_value and found:
        raise ValueError(
            f"{label} dict: use either 'value' (with optional "
            f"'source_type') or one explicit source key "
            f"{explicit_keys}, not both. "
            f"Got: value + {found}"
        )
    if not has_value and len(found) != 1:
        raise ValueError(
            f"{label} dict must have exactly one of 'value' or "
            f"{explicit_keys}, got: {found or 'none'}"
        )
    return has_value, found


def unwrap_records(obj: Any) -> Any:
    """Return the record list wrapped in a JSON object response, if any.

    Looks for the first of :data:`RECORD_LIST_KEYS` whose value is a list.

    Args:
        obj: A decoded JSON object (dict).

    Returns:
        The wrapped list, or *obj* unchanged when none is found.
    """
    for key in RECORD_LIST_KEYS:
        if key in obj and isinstance(obj[key], list):
            return obj[key]
    return obj


def read_data(path: str) -> Any:
    """Read a DataFrame from a local file path.

    Args:
        path: A ``.csv``, ``.parquet``, ``.jsonl``/``.ndjson`` or ``.json``
            file (``.json`` may be a JSON document or JSON Lines).

    Returns:
        pandas DataFrame.

    Raises:
        ValueError: If the extension is not supported.
    """
    import pandas as pd
    ext = os.path.splitext(path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(path)
    elif ext == '.parquet':
        return pd.read_parquet(path)
    elif ext in ('.jsonl', '.ndjson'):
        return pd.read_json(path, lines=True)
    elif ext == '.json':
        # a JSON document, or JSON Lines (the annotator writes .json outputs one row per line)
        try:
            return pd.read_json(path)
        except ValueError:
            return pd.read_json(path, lines=True)
    else:
        raise ValueError(
            f"Unsupported data file extension {ext!r}. "
            f"Expected .csv, .parquet, .json, .jsonl, or .ndjson."
        )


def cloud_get_bytes(
    url: str,
    byte_range: Optional[tuple[int, int]] = None,
) -> bytes:
    """Fetch bytes from a local path or http(s)/s3/gs URL.

    Optionally fetches an inclusive ``[start, end]`` byte range (e.g. just a
    file header). Cloud schemes fall back to unsigned/anonymous access so
    public buckets work without credentials.

    Args:
        url: Local path, or ``http(s)://``, ``s3://``, ``gs://``/``gcs://`` URL.
        byte_range: Optional inclusive ``(start, end)`` byte range.

    Returns:
        The fetched bytes.
    """
    if url.startswith(('http://', 'https://')):
        import requests
        headers = (
            {'Range': f'bytes={byte_range[0]}-{byte_range[1]}'}
            if byte_range else None
        )
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()
        return resp.content
    if url.startswith('s3://'):
        import boto3
        bucket, key = url[len('s3://'):].split('/', 1)
        kw: dict[str, Any] = {'Bucket': bucket, 'Key': key}
        if byte_range:
            kw['Range'] = f'bytes={byte_range[0]}-{byte_range[1]}'
        try:
            return boto3.client('s3').get_object(**kw)['Body'].read()
        except Exception as err:
            from botocore import UNSIGNED
            from botocore.config import Config
            _log.info('s3 default creds failed (%s); retrying unsigned', err)
            return boto3.client(
                's3', config=Config(signature_version=UNSIGNED),
            ).get_object(**kw)['Body'].read()
    if url.startswith(('gs://', 'gcs://')):
        from google.cloud import storage
        bucket, blob = url.split('://', 1)[1].split('/', 1)
        try:
            client = storage.Client()
        except Exception as err:
            _log.info('gcs default creds failed (%s); using anonymous', err)
            client = storage.Client.create_anonymous_client()
        b = client.bucket(bucket).blob(blob)
        if byte_range:
            return b.download_as_bytes(start=byte_range[0], end=byte_range[1])
        return b.download_as_bytes()
    with open(url, 'rb') as f:
        if byte_range:
            f.seek(byte_range[0])
            return f.read(byte_range[1] - byte_range[0] + 1)
        return f.read()


def read_data_from_cloud(url: str) -> Any:
    """Download a data file from s3:// or gs:// and read it as a DataFrame.

    Uses the native client (not requests, which has no adapter for these
    schemes) via :func:`cloud_get_bytes`.

    Args:
        url: ``s3://``, ``gs://`` or ``gcs://`` URL of a data file.

    Returns:
        pandas DataFrame.
    """
    return _read_bytes_as_df(cloud_get_bytes(url), url)


def read_data_from_url(
    url: str,
    cookies: Optional[dict] = None,
) -> Any:
    """Fetch data from a URL.

    Auto-detects file vs JSON response. Cloud-storage schemes (s3://, gs://)
    are routed to their native clients rather than HTTP.

    Args:
        url: The data URL.
        cookies: Cookies sent with the HTTP request (resolved secrets).

    Returns:
        pandas DataFrame.
    """
    import pandas as pd
    import requests as req

    if url.startswith(_CLOUD_PREFIXES):
        return read_data_from_cloud(url)

    _log.info('fetching data from URL: %s', url[:120])
    resp = req.get(url, cookies=cookies or {}, timeout=REQUEST_TIMEOUT_S)
    resp.raise_for_status()
    ct_header = resp.headers.get('Content-Type', '')
    _log.debug('URL response: status=%d content-type=%s', resp.status_code, ct_header)

    ct = ct_header.lower()

    if 'application/json' in ct:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            records = unwrap_records(data)
            if isinstance(records, list):
                return pd.DataFrame(records)
            return pd.DataFrame([data])

    if 'ndjson' in ct or 'jsonl' in ct:
        return pd.read_json(io.StringIO(resp.text), lines=True)

    try:
        data = resp.json()
        if isinstance(data, list):
            return pd.DataFrame(data)
    except (ValueError, TypeError):
        _log.debug('URL response is not JSON, falling back to file download')

    return _read_bytes_as_df(resp.content, url)


def read_data_from_api(
    url: str,
    cookies: Optional[dict] = None,
) -> Any:
    """Fetch data from an API endpoint.

    Args:
        url: The endpoint, optionally prefixed with ``api::``.
        cookies: Cookies sent with the HTTP request (resolved secrets).

    Returns:
        pandas DataFrame.
    """
    if url.lower().startswith('api::'):
        url = url[5:]
    return read_data_from_url(url, cookies=cookies)


def read_data_from_sql(
    query: str,
    secrets: Optional[dict] = None,
) -> Any:
    """Execute a SQL query with duckdb and return a DataFrame.

    Automatically loads the httpfs extension if the query references
    s3://, gs:// or http(s):// paths. DuckDB ``s3_*`` settings among the
    secrets are applied with ``SET``; any other secret is visible as an
    environment variable only while the query runs.

    Args:
        query: The SQL query.
        secrets: Resolved secrets (``{name: value}``).

    Returns:
        pandas DataFrame.

    Raises:
        ImportError: If duckdb is not installed.
    """
    try:
        import duckdb
    except ImportError:
        raise ImportError(
            "duckdb is required for SQL queries: "
            "pip install duckdb"
        )

    conn = duckdb.connect(':memory:')

    if re.search(r"s3://|gs://|https?://", query, re.IGNORECASE):
        try:
            conn.execute("INSTALL httpfs")
        except Exception:
            pass
        conn.execute("LOAD httpfs")
        _log.debug('duckdb: loaded httpfs extension')

    has_credentials = False
    env_secrets = {}
    for k, v in (secrets or {}).items():
        if k.lower() in _DUCKDB_SET_KEYS:
            # k is from the allow-list; the value is quoted as a SQL string literal
            value = str(v).replace("'", "''")
            conn.execute(f"SET {k} = '{value}'")
            if k.lower() in _DUCKDB_CREDENTIAL_KEYS:
                has_credentials = True
        else:
            env_secrets[k] = str(v)

    try:
        # other secrets (e.g. AWS_PROFILE for the credential chain) are visible as environment
        # variables only while the query runs, not for the rest of the kernel session
        with temporary_environ(env_secrets):
            if re.search(r"s3://", query, re.IGNORECASE) and not has_credentials:
                try:
                    conn.execute(
                        "CREATE SECRET IF NOT EXISTS "
                        "(_type = 's3', provider = 'credential_chain')"
                    )
                except Exception as e:
                    _log.debug('duckdb: credential chain not available: %s', e)
            _log.info('executing SQL query (%d chars)', len(query))
            result = conn.execute(query).df()
    finally:
        conn.close()
    _log.info('SQL query returned %d rows, %d columns', len(result), len(result.columns))
    return result


@contextlib.contextmanager
def temporary_environ(updates: dict[str, str]) -> Iterator[None]:
    """Set environment variables for the duration of the block, then restore them.

    Args:
        updates: Variables to set.

    Yields:
        None, while the variables are set.
    """
    saved = {k: os.environ.get(k) for k in updates}
    os.environ.update(updates)
    try:
        yield
    finally:
        for k, old in saved.items():
            if old is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = old


def resolve_data_config(
    data: Any,
    data_secrets: Any,
) -> tuple[Any, Optional[str], dict]:
    """Normalize the data parameter.

    Args:
        data: A DataFrame, a source string, or a ``data:`` dict.
        data_secrets: Section secrets; for a dict, ``None`` falls back to
            the dict's own ``secrets`` key.

    Returns:
        ``(data_value, dtype_or_none, resolved_secrets)``.

    Raises:
        ValueError: If *data* has an unsupported type or a dict names no
            (or more than one) source.
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return data, None, resolve_secrets(data_secrets)

    if isinstance(data, dict):
        has_value, found = check_source_keys(data, set(DATA_EXPLICIT_KEYS), 'data')
        secrets_raw = data_secrets if data_secrets is not None else data.get('secrets')
        secrets = resolve_secrets(secrets_raw)

        if has_value:
            # An explicit 'source_type' forces the type; a falsey
            # 'source_type' auto-detects (like a bare string source).
            source = data['value']
            stype = data.get('source_type') or None
            if stype:
                dtype = DATA_TYPE_MAP.get(stype, stype)
            elif isinstance(source, str):
                dtype = detect_data_type(source)
            else:
                dtype = None
            return source, dtype, secrets

        key = found[0]
        return data[key], DATA_TYPE_MAP[key], secrets

    if isinstance(data, str):
        secrets = resolve_secrets(data_secrets)
        dtype = detect_data_type(data)
        return data, dtype, secrets

    raise ValueError(
        f"'data' must be a DataFrame, str, or dict. "
        f"Got {type(data).__name__}."
    )


def load_data(
    data: Any,
    dtype: Optional[str] = None,
    secrets: Optional[dict] = None,
) -> Any:
    """Load data from any supported source.

    Args:
        data: A DataFrame (returned as-is) or a source string.
        dtype: ``'sql'``, ``'api'``, ``'url'`` or ``'path'``; ``None``
            auto-detects from *data*.
        secrets: Resolved secrets (SQL settings, or HTTP cookies).

    Returns:
        pandas DataFrame.

    Raises:
        ValueError: If *data* is neither a DataFrame nor a string.
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
        dtype = detect_data_type(data)

    if dtype == 'sql':
        return read_data_from_sql(data, secrets=secrets)
    elif dtype == 'api':
        return read_data_from_api(data, cookies=secrets)
    elif dtype == 'url':
        return read_data_from_url(data, cookies=secrets)
    else:
        return read_data(data)


#
# INTERNAL
#
def _read_bytes_as_df(body: bytes, url: str) -> Any:
    """Write downloaded file bytes to a temp file and read it as a DataFrame.

    Args:
        body: The file contents.
        url: The source URL; its extension (default ``.csv``) picks the reader.

    Returns:
        pandas DataFrame.
    """
    ext = os.path.splitext(url.split('?')[0])[1].lower() or '.csv'
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(body)
        tmp_path = f.name
    try:
        return read_data(tmp_path)
    finally:
        os.unlink(tmp_path)
