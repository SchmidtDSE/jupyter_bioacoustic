"""
Template Resolution

Resolve ``[[...]]`` placeholders in annotator strings (output path, info card
title/text) and in nested form configs. Used by ``BioacousticAnnotator`` and,
through ``jupyter_bioacoustic.api._resolve_templates``, by the frontend.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.api')

TEMPLATE_RE = re.compile(r'\[\[([^\]]+)\]\]')
DEFAULT_SEP = '||'


#
# PUBLIC
#
def resolve_templates(
    text: str,
    kwargs: dict[str, Any] | None = None,
    resolve_dates: bool = True,
    warn_missing: bool = False,
    columns: set[str] | None = None,
) -> str:
    """Replace ``[[...]]`` placeholders in a template string.

    Supports default values via ``[[key || default]]``.

    Resolution order:

    1. Date patterns (contain ``%``): ``[[%Y%m%d]]`` -> ``20260527``
    2. Kwarg values: ``[[reviewer_name]]`` -> kwarg value
    3. Column names (if *columns* provided): left as ``[[key]]``
       or ``[[key||default]]`` for later per-row resolution
    4. Default value (if ``||`` present and key is not a column):
       returns the default
    5. Otherwise: left as ``[[key]]`` unresolved

    Args:
        text: The template string.
        kwargs: Fixed-value keyword arguments to resolve.
        resolve_dates: Whether to resolve date format patterns.
        warn_missing: Warn when a non-date placeholder has no match.
        columns: Source data column names. When provided, placeholders
            matching a column are preserved for later per-row resolution.

    Returns:
        The text with every resolvable placeholder replaced.
    """
    now = datetime.now()
    kw = kwargs or {}
    cols = columns or set()

    def _replace(m: re.Match) -> str:
        """Return the replacement for one ``[[...]]`` match.

        Args:
            m: The placeholder match (group 1 is the inner text).

        Returns:
            The resolved value, or the original placeholder text.
        """
        raw = m.group(1)
        if DEFAULT_SEP in raw:
            key, default = raw.split(DEFAULT_SEP, 1)
            key = key.strip()
            default = default.strip()
        else:
            key = raw.strip()
            default = None
        if resolve_dates and '%' in key:
            return now.strftime(key)
        if key in kw:
            return str(kw[key])
        if key in cols:
            return m.group(0)
        if default is not None:
            return default
        if warn_missing:
            _log.warning('unresolved template placeholder: [[%s]]', key)
        return m.group(0)

    return TEMPLATE_RE.sub(_replace, text)


def resolve_templates_in_structure(
    obj: Any,
    kwargs: dict[str, Any] | None = None,
    resolve_dates: bool = True,
    columns: set[str] | None = None,
) -> Any:
    """Recursively resolve ``[[...]]`` templates in nested dicts/lists.

    Strings are resolved via :func:`resolve_templates`.
    Dicts and lists are traversed recursively.
    All other types are returned unchanged.

    Args:
        obj: A string, dict, list, or any other value.
        kwargs: Fixed-value keyword arguments to resolve.
        resolve_dates: Whether to resolve date format patterns.
        columns: Source data column names (kept for per-row resolution).

    Returns:
        A new structure with every string resolved.
    """
    if isinstance(obj, str):
        return resolve_templates(obj, kwargs, resolve_dates, columns=columns)
    if isinstance(obj, dict):
        return {
            k: resolve_templates_in_structure(v, kwargs, resolve_dates, columns)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [
            resolve_templates_in_structure(v, kwargs, resolve_dates, columns)
            for v in obj
        ]
    return obj
