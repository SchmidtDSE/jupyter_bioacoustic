"""
Config-Builder Templates

Load "create from template" definitions and apply them to a ConfigBuilder.

A template is a YAML file under ``jupyter_bioacoustic/templates/`` with a ``title``,
``description``, and up to three sections (``project``/``config``/``form``). Each
section may carry ``builder_elements`` (the inputs shown to the user) and a
``configuration`` block — a normal config dict whose leaf values may be
``__placeholder__`` strings that reference builder-element keys. Applying a template
substitutes the user's values into the configuration and produces the per-file dicts.

License: BSD 3-Clause
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import yaml

#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.config_builder.templates')

TEMPLATES_DIR = Path(__file__).parent.parent / 'templates'
SHORT_DESCRIPTION_CHARS = 90
_DROP = object()  # sentinel: a substituted node that should be omitted
_PLACEHOLDER_RE = re.compile(r'__([a-zA-Z0-9_]+)__')
# Which template sections each scope includes, in saved order.
SCOPE_SECTIONS = {
    'project': ('project', 'config', 'form'),
    'config': ('config', 'form'),
    'form': ('form',),
}


#
# PUBLIC
#
def list_templates() -> list[dict[str, str]]:
    """Return available templates as ``[{name, title, short_description}]`` (sorted)."""
    items: list[dict[str, str]] = []
    if not TEMPLATES_DIR.is_dir():
        return items
    for path in sorted(TEMPLATES_DIR.glob('*.y*ml')):
        try:
            data = yaml.safe_load(path.read_text()) or {}
        except yaml.YAMLError as err:
            _log.warning('skipping unparseable template %s: %s', path.name, err)
            continue
        if not isinstance(data, dict):
            continue
        items.append({
            'name': path.stem,
            'title': str(data.get('title') or path.stem),
            'short_description': _short_description(data),
        })
    return items


def load_template(name: str) -> dict[str, Any]:
    """Load and return the full parsed template dict for ``name`` (file stem)."""
    path = _template_path(name)
    data = yaml.safe_load(path.read_text()) or {}
    if not isinstance(data, dict):
        raise ValueError(f"template '{name}' is not a valid mapping")
    return data


def build_template_config(
    template: dict[str, Any],
    scope: str,
    values: dict[str, Any],
) -> dict[str, dict]:
    """Substitute ``values`` into a template and return the per-section config dicts.

    Args:
        template: The parsed template dict.
        scope: One of ``project`` / ``config`` / ``form`` — selects which sections
            are included (project ⇒ all three, config ⇒ config+form, form ⇒ form).
        values: User-entered ``{builder_element_key: value}`` map.

    Returns:
        ``{section: config_dict}`` for each included, non-empty section.

    Raises:
        ValueError: if ``scope`` is unknown or a required builder element has no value.
    """
    if scope not in SCOPE_SECTIONS:
        raise ValueError(
            f"scope must be one of {sorted(SCOPE_SECTIONS)}, got '{scope}'"
        )
    resolution = _resolve_values(template, scope, values)
    result: dict[str, dict] = {}
    for section in SCOPE_SECTIONS[scope]:
        sec = template.get(section)
        if not isinstance(sec, dict):
            continue
        config = sec.get('configuration')
        if not isinstance(config, dict):
            continue
        substituted = _substitute(config, resolution)
        if substituted is _DROP:
            continue
        result[section] = substituted
    return result


#
# INTERNAL
#
def _short_description(data: dict[str, Any]) -> str:
    """Return the template's short_description, falling back to a clipped description."""
    sd = data.get('short_description')
    if sd:
        return str(sd).strip()
    desc = str(data.get('description') or '').strip()
    if len(desc) <= SHORT_DESCRIPTION_CHARS:
        return desc
    return desc[:SHORT_DESCRIPTION_CHARS].rstrip() + '…'


def _template_path(name: str) -> Path:
    """Resolve a template file stem to its path (guards against path traversal)."""
    safe = Path(name).name
    for ext in ('.yaml', '.yml'):
        candidate = TEMPLATES_DIR / f'{safe}{ext}'
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"template '{name}' not found in {TEMPLATES_DIR}")


def _resolve_values(
    template: dict[str, Any],
    scope: str,
    values: dict[str, Any],
) -> dict[str, Any]:
    """Build a ``{key: resolved_value}`` map across the scope's builder elements.

    A value falls back to the element's ``default`` when the user left it blank.

    Raises:
        ValueError: if a required element resolves to an empty value.
    """
    resolution: dict[str, Any] = {}
    missing: list[str] = []
    for section in SCOPE_SECTIONS[scope]:
        sec = template.get(section)
        if not isinstance(sec, dict):
            continue
        for key, spec in _flatten_elements(sec.get('builder_elements')).items():
            norm = _normalize_spec(spec)
            val = values.get(key)
            if val is None or val == '':
                val = norm['default']
            if norm['required'] and (val is None or val == ''):
                missing.append(key)
            resolution[key] = val
    if missing:
        raise ValueError(
            'missing required template values: ' + ', '.join(sorted(set(missing)))
        )
    return resolution


def _flatten_elements(elements: Any) -> dict[str, Any]:
    """Flatten a ``builder_elements`` list (recursing groups) into ``{key: spec}``."""
    flat: dict[str, Any] = {}
    if not isinstance(elements, list):
        return flat
    for item in elements:
        if not isinstance(item, dict):
            continue
        group = item.get('group')
        if isinstance(group, dict):
            flat.update(_flatten_elements(group.get('elements')))
            continue
        for key, spec in item.items():
            flat[key] = spec
    return flat


def _normalize_spec(spec: Any) -> dict[str, Any]:
    """Normalize a builder-element spec (shorthand or dict) to required/default/etc."""
    if isinstance(spec, dict):
        return {
            'required': bool(spec.get('required', False)),
            'default': spec.get('default'),
            'label': spec.get('label'),
            'description': spec.get('description'),
        }
    if spec is True:
        return {'required': True, 'default': None, 'label': None, 'description': None}
    if spec is False:
        return {'required': False, 'default': None, 'label': None, 'description': None}
    return {'required': False, 'default': spec, 'label': None, 'description': None}


def _substitute(node: Any, resolution: dict[str, Any]) -> Any:
    """Recursively replace ``__placeholder__`` strings; drop empty/unfilled nodes.

    Returns ``_DROP`` for a node that should be omitted (an unfilled exact-match
    placeholder, or a dict/list left empty after its children were dropped).
    """
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for key, val in node.items():
            sub = _substitute(val, resolution)
            if sub is not _DROP:
                out[key] = sub
        return out if out else _DROP
    if isinstance(node, list):
        out_list = [
            sub for sub in (_substitute(v, resolution) for v in node)
            if sub is not _DROP
        ]
        return out_list if out_list else _DROP
    if isinstance(node, str):
        exact = _PLACEHOLDER_RE.fullmatch(node)
        if exact:
            val = resolution.get(exact.group(1))
            return _DROP if val is None or val == '' else val
        return _PLACEHOLDER_RE.sub(
            lambda m: '' if resolution.get(m.group(1)) is None
            else str(resolution.get(m.group(1))),
            node,
        )
    return node
