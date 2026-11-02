"""
Audio Sources

Normalize the annotator's ``audio`` setting (a path, URL, column name, or a
dict that may resolve the path through a SQL query or an API) into the
``_BA_AUDIO`` dict the frontend reads.

These helpers are re-exported from ``jupyter_bioacoustic.api`` under their
old underscore names (``_resolve_audio_config``, ...).

License: BSD 3-Clause
"""  # noqa: D415
#
# Imports
#
from __future__ import annotations

import re
from typing import Any, Optional

from ._data_sources import (
    REMOTE_PREFIXES,
    REQUEST_TIMEOUT_S,
    check_source_keys,
    read_data_from_sql,
    resolve_secrets,
    unwrap_records,
)


#
# CONSTANTS
#
# Audio dict keys whose value is a query/endpoint that yields the audio path.
AUDIO_LOOKUP_KEYS = frozenset({'sql', 'api'})
# Audio dict keys whose value is the audio source itself.
AUDIO_STATIC_KEYS = frozenset({'path', 'url', 'uri', 'column'})


#
# PUBLIC
#
def detect_audio_type(value: str) -> str:
    """Detect whether an audio string is url, column, or path.

    A string with no ``/`` and no ``.`` is treated as a column name.

    Args:
        value: The audio source string.

    Returns:
        ``'url'``, ``'column'`` or ``'path'``.
    """
    if value.startswith(REMOTE_PREFIXES):
        return 'url'
    if '/' not in value and '.' not in value:
        return 'column'
    return 'path'


def resolve_audio_from_source(
    source_type: str,
    source_value: str,
    prop: Optional[str],
    index: Optional[int],
    secrets: Optional[dict],
) -> str:
    """Resolve an audio path from an SQL query or API.

    Args:
        source_type: ``'sql'`` or ``'api'``.
        source_value: The SQL query or the API URL.
        prop: Column/field holding the audio path.
        index: 1-based row index into the response (default 1).
        secrets: Resolved secrets (SQL settings, or HTTP cookies).

    Returns:
        The audio path, as a string.

    Raises:
        ValueError: If *prop* is missing, the response has too few rows, or
            *source_type* is unknown.
    """
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
        if not re.search(r'\bLIMIT\b', query, re.IGNORECASE):
            query = query.rstrip().rstrip(';') + f' LIMIT {idx + 1}'
        df = read_data_from_sql(query, secrets=secrets)
        if len(df) <= idx:
            raise ValueError(
                f"SQL returned {len(df)} rows, but "
                f"response_index={index} (row {idx})"
            )
        val = df.iloc[idx][prop]
    elif source_type == 'api':
        import requests as req
        resp = req.get(source_value, cookies=secrets or {}, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            data = unwrap_records(data)
        if not isinstance(data, list) or len(data) <= idx:
            n = len(data) if isinstance(data, list) else 'non-list'
            raise ValueError(
                f"API returned {n} items, but "
                f"response_index={index} (row {idx})"
            )
        val = data[idx][prop]
    else:
        raise ValueError(f"Unknown audio source type: {source_type}")

    return str(val)


def resolve_audio_config(
    audio: Any,
    audio_prefix: str,
    audio_suffix: str,
    audio_fallback: str,
    audio_secrets: Any = None,
) -> dict[str, Any]:
    """Normalize the audio parameter into a standard dict.

    Args:
        audio: A source string, or an ``audio:`` dict.
        audio_prefix: Prefix (overrides the dict's ``prefix`` when truthy).
        audio_suffix: Suffix (overrides the dict's ``suffix`` when truthy).
        audio_fallback: Fallback (overrides the dict's ``fallback`` when truthy).
        audio_secrets: Section secrets; for a dict, ``None`` falls back to
            the dict's own ``secrets`` key.

    Returns:
        Dict with keys ``type``, ``value``, ``prefix``, ``suffix``,
        ``fallback`` and ``secrets``.

    Raises:
        ValueError: If *audio* is empty/unsupported or a dict names no (or
            more than one) source.
    """
    prefix = audio_prefix or ''
    suffix = audio_suffix or ''
    fallback = audio_fallback or ''

    if isinstance(audio, dict):
        explicit_keys = set(AUDIO_LOOKUP_KEYS) | set(AUDIO_STATIC_KEYS)
        has_value, found = check_source_keys(audio, explicit_keys, 'audio')
        secrets_raw = audio_secrets if audio_secrets is not None else audio.get('secrets')
        resolved_secrets = resolve_secrets(secrets_raw)

        common = {
            'prefix': prefix or audio.get('prefix', ''),
            'suffix': suffix or audio.get('suffix', ''),
            'fallback': fallback or audio.get('fallback', ''),
            'secrets': resolved_secrets,
        }

        # Resolve the effective source type and raw value. 'value' with a
        # falsey 'source_type' auto-detects (like a bare string); an
        # explicit 'source_type' (or explicit key) forces the type.
        if has_value:
            raw_value = audio['value']
            stype = audio.get('source_type') or None
            if stype in ('url', 'uri'):
                stype = 'url'
        else:
            key = found[0]
            raw_value = audio[key]
            stype = 'url' if key in ('url', 'uri') else key

        if stype in AUDIO_LOOKUP_KEYS:
            resolved_value = resolve_audio_from_source(
                stype, raw_value, audio.get('property'), audio.get('response_index'),
                resolved_secrets,
            )
            return {
                'type': detect_audio_type(resolved_value),
                'value': resolved_value,
                **common,
            }

        atype = detect_audio_type(raw_value) if stype is None else stype
        return {'type': atype, 'value': raw_value, **common}

    if isinstance(audio, str) and audio:
        return {
            'type': detect_audio_type(audio),
            'value': audio,
            'prefix': prefix,
            'suffix': suffix,
            'fallback': fallback,
            'secrets': resolve_secrets(audio_secrets),
        }

    raise ValueError(
        "'audio' is required — pass a path, URL, "
        "column name, or dict. "
        "See documentation for details."
    )
