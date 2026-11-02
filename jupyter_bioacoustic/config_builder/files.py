"""
Config Builder Files

File helpers for the config builder: YAML read/write (multi-line strings written as ``|``
blocks, keys in insertion order), resolving file references, and file-name slugs.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional, TextIO

import yaml


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.config_builder')


#
# PUBLIC
#
class LiteralStr(str):
    """A string YAML should write as a ``|`` block (multi-line text)."""


def represent_literal_str(dumper: yaml.Dumper, data: str) -> yaml.ScalarNode:
    """Represent a ``LiteralStr`` as a literal block scalar.

    Args:
        dumper: The YAML dumper.
        data: The string.

    Returns:
        The scalar node.
    """
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')


class LiteralDumper(yaml.Dumper):
    """``yaml.Dumper`` that writes ``LiteralStr`` as a ``|`` block.

    The representer is registered on this subclass only, so PyYAML's global ``Dumper`` is
    left untouched.
    """
    yaml_representers = {**yaml.Dumper.yaml_representers, LiteralStr: represent_literal_str}


def prep_for_yaml(obj: Any) -> Any:
    """Mark every multi-line string in ``obj`` (recursively) as a ``LiteralStr``.

    Args:
        obj: A config value (dicts and lists are copied).

    Returns:
        The value, with multi-line strings wrapped.
    """
    if isinstance(obj, dict):
        return {k: prep_for_yaml(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [prep_for_yaml(v) for v in obj]
    if isinstance(obj, str) and '\n' in obj:
        return LiteralStr(obj)
    return obj


def dump_yaml(obj: Any, stream: Optional[TextIO] = None) -> Optional[str]:
    """Dump a config as block-style YAML in key order (multi-line strings as ``|`` blocks).

    Args:
        obj: The config.
        stream: File to write to; None returns the text.

    Returns:
        The YAML text when ``stream`` is None, else None.
    """
    return yaml.dump(prep_for_yaml(obj), stream, Dumper=LiteralDumper,
                     default_flow_style=False, sort_keys=False)


def write_yaml(path: str, obj: Any) -> str:
    """Write a config to a YAML file, creating its directory.

    Args:
        path: Destination (the ``.yaml`` extension is added if missing).
        obj: The config.

    Returns:
        The path written.
    """
    path = ensure_ext(path)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w') as f:
        dump_yaml(obj, f)
    return path


def read_yaml(path: str) -> Any:
    """Parse a YAML file.

    Args:
        path: The file.

    Returns:
        The parsed content; ``{}`` for an empty file.
    """
    with open(path) as f:
        return yaml.safe_load(f) or {}


def slugify(name: Any) -> str:
    """Turn a project name into a file-name slug (``'My Proj!'`` -> ``'my_proj'``).

    Args:
        name: The project name.

    Returns:
        Lower-case letters and digits joined by ``_``.
    """
    return re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')


def ensure_ext(path: str, extensions: tuple = ('.yaml', '.yml'),
                default: str = '.yaml') -> str:
    """Add ``default`` to ``path`` unless it already ends in one of ``extensions``.

    Args:
        path: A file path.
        extensions: Accepted extensions.
        default: Extension to add.

    Returns:
        The path with an extension.
    """
    if not path.endswith(tuple(extensions)):
        path += default
    return path


def resolve_path(ref: str, base_dir: str) -> str | None:
    """Resolve a file reference relative to ``base_dir``, then the cwd.

    Args:
        ref: The referenced path.
        base_dir: Directory of the referencing file.

    Returns:
        An existing path, or None.
    """
    if os.path.isabs(ref):
        return ref if os.path.exists(ref) else None
    candidate = os.path.join(base_dir, ref)
    if os.path.exists(candidate):
        return candidate
    if os.path.exists(ref):
        return ref
    _log.debug('resolve_path failed: ref=%s base_dir=%s cwd=%s', ref, base_dir,
               os.getcwd())
    return None


def to_cwd_relative(resolved: str) -> str:
    """Convert a path to be relative to the current working directory.

    Args:
        resolved: A path.

    Returns:
        The cwd-relative path (unchanged if it can't be made relative, e.g. another drive).
    """
    try:
        return os.path.relpath(resolved)
    except ValueError:
        return resolved
