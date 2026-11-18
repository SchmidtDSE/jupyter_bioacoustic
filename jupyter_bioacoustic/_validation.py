"""
Config Validation

Shared validation logic for BioacousticAnnotator and ConfigBuilder.
Validates config keys, form keys, annotation tools, and dynamic forms.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
from typing import Any, Optional


#
# CONSTANTS
#
_log = logging.getLogger('jupyter_bioacoustic.validation')

VALID_FORM_KEYS = frozenset({
    'title', 'progress_tracker', 'pass_value', 'fixed_value',
    'submission_buttons', '_fixed_kwargs', 'dynamic_forms', 'form',
    'side_form', 'side_form_split',
    'annotation',
    'select', 'multiselect', 'textbox', 'checkbox', 'number',
    'break', 'line', 'text',
})

# How a multiselect is written: one column holding a list of the tags or a one-hot vector,
# or a column per item.
MULTISELECT_FORMATS = ('list', 'vector', 'columns')
# Formats with one entry per item: they need a closed item list.
_ONE_HOT_FORMATS = ('vector', 'columns')

VALID_CONFIG_KEYS = frozenset({
    'data', 'data_source_type', 'data_value',
    'data_path', 'data_url', 'data_sql', 'data_api',
    'data_start_time', 'data_end_time', 'data_duration', 'data_secrets',
    'data_index_column',
    'display_columns',
    'audio', 'audio_source_type', 'audio_value',
    'audio_path', 'audio_url', 'audio_uri',
    'audio_column', 'audio_prefix', 'audio_suffix', 'audio_fallback',
    'audio_secrets', 'audio_sql', 'audio_api', 'audio_property',
    'audio_response_index',
    'secrets',
    'output', 'output_path', 'output_url', 'output_uri',
    'output_sync_button', 'output_recursive', 'output_secrets',
    'output_index_column',
    'info_card_title', 'info_card_text',
    'sort', 'sort_order',
    'form_config', 'duplicate_entries', 'default_buffer',
    'capture', 'capture_dir', 'spectrogram_resolution',
    'visualizations', 'partial_download',
    'width', 'clip_table_height', 'player_height',
    'capture_height',
    'info_card_height', 'hide_info_card', 'form_panel_height',
    'freq_min', 'freq_max',
    'playlist_title', 'playlist_open', 'spectrogram_title', 'spectrogram_open',
    'form_open',
    'description', 'description_title', 'description_text',
    'description_path', 'description_open', 'description_height',
    'project_name',
    'config', 'session_args',
})

VALID_ANNOTATION_TOOLS = frozenset({
    'time_select', 'start_end_time_select', 'bounding_box', 'multibox',
    'fixed_duration',
})

# Required fields for each annotation tool (only validated when fields are present)
ANNOTATION_TOOL_REQUIRED_FIELDS = {
    'time_select': frozenset({'start_time'}),
    'start_end_time_select': frozenset({'start_time', 'end_time'}),
    'fixed_duration': frozenset({'start_time', 'end_time'}),
    'bounding_box': frozenset({'start_time', 'end_time', 'min_frequency', 'max_frequency'}),
    'multibox': frozenset({'start_time', 'end_time', 'min_frequency', 'max_frequency'}),
}

# All possible annotation tool fields
ALL_ANNOTATION_FIELDS = frozenset({
    'start_time', 'end_time', 'min_frequency', 'max_frequency'
})

# Marks a select item as the default (``selected::owl``)
SELECTED_PREFIX = 'selected::'

# Layout containers (form elements that hold other elements)
LAYOUT_TYPES = frozenset({'row', 'column', 'grid'})
_LAYOUT_ALIGNS = ('start', 'center', 'end')

# Built-in button icons (``icon: jba:check``); keep in sync with src/sections/form/buttons.ts
BUILTIN_ICON_PREFIX = 'jba:'
BUILTIN_ICONS = frozenset({
    'check', 'x', 'unsure', 'na', 'flag', 'star', 'checked', 'unchecked', 'plus', 'minus',
})

# Config-builder bookkeeping kept in its project dict (file paths and flags), not settings
BUILDER_STATE_KEYS = frozenset({
    'project_name', 'project_path', 'config_path',
    'form_path', 'project_enabled', 'config_enabled', 'form_enabled',
    'project_locked', 'config_locked', 'form_locked',
})

SKIP_KEYS = BUILDER_STATE_KEYS | {'output_path'}


#
# PUBLIC
#
def validate_config(
    config: Optional[dict] = None,
    form_config: Optional[dict] = None,
    project: Optional[dict] = None,
) -> dict[str, Any]:
    """Validate configuration dicts and return errors/warnings.

    Args:
        config: The merged config dict (data, audio, output, app keys).
        form_config: The form configuration dict.
        project: The project-level dict (before merge), if available.

    Returns:
        Dict with 'valid' (bool), 'errors' (list), 'warnings' (list).
    """
    errors: list[str] = []
    warns: list[str] = []
    fc = form_config or {}

    _validate_form_keys(fc, errors)
    _validate_side_form(fc, errors)

    if project:
        _validate_config_keys(project, 'project', errors)
    if config:
        _validate_config_keys(config, 'config', errors)

    # a form file on its own (e.g. `jba validate -f form.yaml`) has no data settings to check
    has_settings = bool(config) or any(k not in BUILDER_STATE_KEYS for k in (project or {}))
    if has_settings:
        _validate_required_fields(
            config or {}, project or {}, errors, warns,
            _has_form_configured(fc, config or {}, project or {}),
        )
        _validate_sync(config or {}, project or {}, errors)
    _validate_forms_and_annotations(fc, errors, warns)

    if errors:
        _log.info('validation failed: %s', errors)
    if warns:
        _log.info('validation warnings: %s', warns)
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warns,
    }


def flatten_layout(elements: list[Any]) -> list[Any]:
    """Return ``elements`` with every row / column / grid replaced by its items, recursively.

    Args:
        elements: A list of ``{type: config}`` form elements.

    Returns:
        The elements without layout containers, in order.
    """
    out: list[Any] = []
    for el in elements:
        if isinstance(el, dict) and len(el) == 1:
            (etype, ecfg), = el.items()
            items = _layout_items(ecfg) if etype in LAYOUT_TYPES else None
            if isinstance(items, list):
                out.extend(flatten_layout(items))
                continue
        out.append(el)
    return out


#
# INTERNAL
#
def _validate_form_keys(fc: dict, errors: list[str]) -> None:
    """Check for unknown top-level form config keys.

    A list-valued unknown key looks like a named form written at the top
    level, so its error points to ``dynamic_forms``.

    Args:
        fc: The form configuration dict.
        errors: List that error messages are appended to.
    """
    for key in fc:
        if key in VALID_FORM_KEYS:
            continue
        if isinstance(fc[key], list):
            errors.append(
                f'Unknown form config key "{key}" — define named forms under "dynamic_forms"',
            )
        else:
            errors.append(f'Unknown form config key "{key}"')


def _validate_side_form(fc: dict, errors: list[str]) -> None:
    """Check ``side_form`` (a bool) and ``side_form_split`` (a fraction of the width).

    Args:
        fc: The form configuration dict.
        errors: List that error messages are appended to.
    """
    if 'side_form' in fc and not isinstance(fc['side_form'], bool):
        errors.append('"side_form" must be true or false')
    if 'side_form_split' in fc:
        split = fc['side_form_split']
        if isinstance(split, bool) or not isinstance(split, (int, float)) or not 0 < split < 1:
            errors.append(
                '"side_form_split" must be a fraction between 0 and 1 '
                '(the spectrogram\'s share of the width, e.g. 0.66)',
            )


def _validate_config_keys(
    cfg: dict, label: str, errors: list[str],
) -> None:
    """Check for unknown config/project keys.

    An inline ``form_config`` dict is also checked for unknown form keys.

    Args:
        cfg: The config or project dict.
        label: ``'config'`` or ``'project'`` (used in messages).
        errors: List that error messages are appended to.
    """
    for key in cfg:
        if key in SKIP_KEYS:
            continue
        if key not in VALID_CONFIG_KEYS:
            errors.append(f'Unknown {label} key "{key}"')
        elif key == 'form_config' and isinstance(cfg[key], dict):
            _validate_form_keys(cfg[key], errors)


def _has_form_configured(fc: dict, config: dict, project: dict) -> bool:
    """Return True if a form is configured.

    A form is considered set when a form_config is provided, or when the
    project/config carries a "form_config" key. Without
    a form the widget is a player-only view that needs no index column.

    Args:
        fc: The form configuration dict (may be empty).
        config: The merged config dict.
        project: The project dict.

    Returns:
        Whether any form is configured.
    """
    if fc:
        return True
    for cfg in (config, project):
        if isinstance(cfg, dict) and cfg.get('form_config'):
            return True
    return False


def _validate_required_fields(
    config: dict, project: dict,
    errors: list[str], warns: list[str],
    has_form: bool,
) -> None:
    """Check that required fields are present across config/project.

    data_index_column is required only when a form is configured; a
    player-only view (no form) needs no index column.

    Args:
        config: The merged config dict.
        project: The project dict.
        errors: List that error messages are appended to.
        warns: List that warning messages are appended to.
        has_form: Whether a form is configured.
    """
    cfg_data = config.get('data')
    proj_data = project.get('data')
    idx_val = (
        config.get('data_index_column')
        or project.get('data_index_column')
        or (isinstance(cfg_data, dict) and cfg_data.get('index_column'))
        or (isinstance(proj_data, dict) and proj_data.get('index_column'))
    )
    if not idx_val:
        if has_form:
            errors.append(
                '"data_index_column" is required when a form is '
                'configured — set it to the column that uniquely '
                'identifies each row in the input data'
            )
        return

    cfg_out = config.get('output')
    proj_out = project.get('output')
    has_out_idx = (
        'output_index_column' in config
        or 'output_index_column' in project
        or (isinstance(cfg_out, dict) and cfg_out.get('index_column'))
        or (isinstance(proj_out, dict) and proj_out.get('index_column'))
    )
    if not has_out_idx:
        warns.append(
            f'"output_index_column" not set — '
            f'will default to "{idx_val}"'
        )


def _validate_sync(config: dict, project: dict, errors: list[str]) -> None:
    """Check that an enabled sync button has a destination URI to sync to.

    The sync button pushes the output file to a remote location, so enabling it
    without an "output_uri" (nested "output.uri"/"output.url") leaves it with
    nowhere to sync. Reads both the flat (output_*) and nested (output: {...})
    config shapes.

    Args:
        config: The merged config dict.
        project: The project dict.
        errors: List that error messages are appended to.
    """
    sync_enabled = False
    has_uri = False
    for cfg in (config, project):
        if not isinstance(cfg, dict):
            continue
        out = cfg.get('output')
        if isinstance(out, dict):
            if out.get('sync_button'):
                sync_enabled = True
            if out.get('uri') or out.get('url'):
                has_uri = True
        if cfg.get('output_sync_button'):
            sync_enabled = True
        if cfg.get('output_uri') or cfg.get('output_url'):
            has_uri = True
    if sync_enabled and not has_uri:
        errors.append(
            '"output_sync_button" is enabled but no sync destination is set — '
            'provide an "output_uri" (e.g. s3://bucket/reviews.csv) to sync to'
        )


def _validate_forms_and_annotations(
    fc: dict, errors: list[str], warns: list[str],
) -> None:
    """Validate dynamic forms, annotation tools, and form element presence.

    Args:
        fc: The form configuration dict.
        errors: List that error messages are appended to.
        warns: List that warning messages are appended to.
    """
    defined_forms = _collect_defined_forms(fc)
    annot_configs = _collect_annotation_configs(fc)
    referenced_forms = _collect_referenced_forms(fc, annot_configs)
    missing_forms = referenced_forms - defined_forms
    unreferenced_forms = defined_forms - referenced_forms

    for annot in annot_configs:
        if isinstance(annot, dict):
            _validate_annotation(annot, errors, warns)

    for ms in _collect_elements(fc, 'multiselect'):
        _validate_multiselect(ms, errors, warns)
    for btn in _collect_buttons(fc):
        _validate_button(btn, errors)
    for etype, cfg in _collect_layouts(fc):
        _validate_layout(etype, cfg, errors)
    _validate_hot_keys(fc, errors)

    for f in sorted(missing_forms):
        errors.append(
            f'Referenced dynamic form "{f}" is not defined',
        )
    for f in sorted(unreferenced_forms):
        warns.append(
            f'Dynamic form "{f}" is defined but never referenced',
        )

    has_form = bool(fc.get('form'))
    has_legacy = any(
        k in fc for k in ('select', 'multiselect', 'textbox', 'checkbox', 'number')
    )
    has_annotation = 'annotation' in fc
    if not has_form and not has_legacy and not has_annotation:
        warns.append('No form input elements configured')


def _collect_defined_forms(fc: dict) -> set[str]:
    """Return the names of the dynamic forms defined in ``dynamic_forms``.

    Args:
        fc: The form configuration dict.

    Returns:
        The set of defined dynamic-form names.
    """
    defined_forms: set[str] = set()
    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, list):
        for item in dyn:
            if isinstance(item, dict):
                defined_forms.update(item.keys())
    elif isinstance(dyn, dict):
        defined_forms.update(dyn.keys())
    return defined_forms


def _collect_annotation_configs(fc: dict) -> list[Any]:
    """Return every annotation config (top-level and inside the ``form`` list).

    Args:
        fc: The form configuration dict.

    Returns:
        The annotation configs, in order (entries may be non-dicts).
    """
    annot_configs: list[Any] = []
    if 'annotation' in fc and isinstance(fc['annotation'], dict):
        annot_configs.append(fc['annotation'])
    form_list = fc.get('form')
    if isinstance(form_list, list):
        for el in form_list:
            if isinstance(el, dict) and 'annotation' in el:
                annot_configs.append(el['annotation'])
    return annot_configs


def _collect_referenced_forms(fc: dict, annot_configs: list[Any]) -> set[str]:
    """Return the names of every dynamic form referenced anywhere in the form.

    References come from select / multiselect ``items[].form``, checkbox
    ``checked_form``/``unchecked_form`` (in the ``form`` list, the legacy
    top-level ``select``/``multiselect``/``checkbox`` keys and inside dynamic
    forms), and annotation ``form`` keys.

    Args:
        fc: The form configuration dict.
        annot_configs: The annotation configs from
            :func:`_collect_annotation_configs`.

    Returns:
        The set of referenced dynamic-form names.
    """
    referenced_forms: set[str] = set()
    form_list = fc.get('form')
    if isinstance(form_list, list):
        _scan_elements(form_list, referenced_forms)

    for top_key in ('select', 'multiselect', 'checkbox'):
        if top_key in fc and isinstance(fc[top_key], dict):
            cfg = fc[top_key]
            if top_key in ('select', 'multiselect') and 'items' in cfg:
                _scan_items(cfg['items'], referenced_forms)
            for fkey in ('checked_form', 'unchecked_form'):
                if cfg.get(fkey):
                    referenced_forms.add(cfg[fkey])

    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, list):
        for item in dyn:
            if isinstance(item, dict):
                for elems in item.values():
                    _scan_elements(
                        elems if isinstance(elems, list) else [],
                        referenced_forms,
                    )
    elif isinstance(dyn, dict):
        for elems in dyn.values():
            _scan_elements(
                elems if isinstance(elems, list) else [],
                referenced_forms,
            )

    for annot in annot_configs:
        if not isinstance(annot, dict):
            continue
        annot_form = annot.get('form')
        if annot_form:
            referenced_forms.add(annot_form)
    return referenced_forms


def _scan_items(items: Any, referenced_forms: set[str]) -> None:
    """Add the ``form`` of each select / multiselect item to *referenced_forms*.

    Args:
        items: A select ``items`` value (ignored unless it is a list).
        referenced_forms: Set that referenced form names are added to.
    """
    if isinstance(items, list):
        for it in items:
            if isinstance(it, dict) and 'form' in it:
                referenced_forms.add(it['form'])


def _scan_elements(elements: Any, referenced_forms: set[str]) -> None:
    """Add the form names referenced by a list of form elements.

    Args:
        elements: A list of ``{element_type: element_config}`` dicts
            (ignored unless it is a list).
        referenced_forms: Set that referenced form names are added to.
    """
    if not isinstance(elements, list):
        return
    for el in flatten_layout(elements):
        if not isinstance(el, dict):
            continue
        for etype, ecfg in el.items():
            if not isinstance(ecfg, dict):
                continue
            if etype in ('select', 'multiselect') and 'items' in ecfg:
                _scan_items(ecfg['items'], referenced_forms)
            if etype == 'checkbox':
                for fkey in ('checked_form', 'unchecked_form'):
                    if ecfg.get(fkey):
                        referenced_forms.add(ecfg[fkey])


def _form_sections(fc: dict) -> list[Any]:
    """Return the form's element lists: ``form`` and each dynamic form.

    Args:
        fc: The form configuration dict.

    Returns:
        The raw sections (lists, or ``{type: config}`` mappings), in order.
    """
    sections: list[Any] = [fc.get('form')]
    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, dict):
        sections.extend(dyn.values())
    elif isinstance(dyn, list):              # legacy: a list of {name: elements}
        for item in dyn:
            if isinstance(item, dict):
                sections.extend(item.values())
    return sections


def _collect_layouts(fc: dict) -> list[tuple[str, Any]]:
    """Return every ``(type, config)`` row / column / grid in the form, nested ones too.

    Args:
        fc: The form configuration dict.

    Returns:
        The containers, outermost first.
    """
    found: list[tuple[str, Any]] = []

    def walk(elements: Any) -> None:
        """Add the containers among ``elements`` and inside them.

        Args:
            elements: A list of ``{type: config}`` dicts (ignored otherwise).
        """
        if not isinstance(elements, list):
            return
        for el in elements:
            if not isinstance(el, dict):
                continue
            for etype, ecfg in el.items():
                if etype in LAYOUT_TYPES:
                    found.append((etype, ecfg))
                    walk(_layout_items(ecfg))

    for section in _form_sections(fc):
        walk(section)
    return found


def _validate_layout(etype: str, cfg: Any, errors: list[str]) -> None:
    """Validate one row / column / grid container.

    Args:
        etype: ``'row'``, ``'column'`` or ``'grid'``.
        cfg: Its config: a list of elements, or ``{items, gap, align, columns}``.
        errors: List that error messages are appended to.
    """
    if not isinstance(cfg, (list, dict)) or not isinstance(_layout_items(cfg), list):
        errors.append(f'"{etype}" needs a list of elements (or "items: [...]")')
        return
    if not isinstance(cfg, dict):
        if etype == 'grid':
            errors.append('"grid" needs "columns" and "items" (e.g. {columns: 3, items: [...]})')
        return
    if etype == 'grid':
        cols = cfg.get('columns')
        if isinstance(cols, bool) or not isinstance(cols, int) or cols < 1:
            errors.append('"grid": "columns" must be a whole number of at least 1')
    elif 'columns' in cfg:
        errors.append(f'"{etype}": "columns" is only for "grid"')
    if 'align' in cfg and cfg['align'] not in _LAYOUT_ALIGNS:
        errors.append(f'"{etype}": "align" must be one of {", ".join(_LAYOUT_ALIGNS)}')
    gap = cfg.get('gap')
    if gap is not None and (isinstance(gap, bool) or not isinstance(gap, (int, float, str))):
        errors.append(f'"{etype}": "gap" must be a number (px) or a CSS size')
    if 'unique' in cfg and not isinstance(cfg['unique'], bool):
        errors.append(f'"{etype}": "unique" must be true or false')
    for key in ('column', 'delimiter'):
        if key in cfg and not isinstance(cfg[key], str):
            errors.append(f'"{etype}": "{key}" must be a string')


def _collect_buttons(fc: dict) -> list[dict]:
    """Return every button config, with the ``column`` of its row / column / grid filled in.

    A button without its own ``column`` takes the nearest enclosing container's.

    Args:
        fc: The form configuration dict.

    Returns:
        The button configs (copies when a column was filled in), in order.
    """
    found: list[dict] = []

    def walk(elements: Any, column: Any) -> None:
        """Add the buttons among ``elements`` (and inside containers).

        Args:
            elements: A list of ``{type: config}`` dicts, or a ``{type: config}`` mapping.
            column: The enclosing container's ``column`` (None outside one).
        """
        if isinstance(elements, dict):
            elements = [{k: v} for k, v in elements.items()]
        if not isinstance(elements, list):
            return
        for el in elements:
            if not isinstance(el, dict):
                continue
            for etype, ecfg in el.items():
                if etype in LAYOUT_TYPES:
                    inner = ecfg.get('column', column) if isinstance(ecfg, dict) else column
                    walk(_layout_items(ecfg), inner)
                elif etype == 'button' and isinstance(ecfg, dict):
                    has_own = ecfg.get('column') not in (None, '')
                    found.append(ecfg if has_own or column is None else {**ecfg, 'column': column})

    if isinstance(fc.get('button'), dict):
        found.append(fc['button'])
    for section in _form_sections(fc):
        walk(section, None)
    return found


def _layout_items(cfg: Any) -> Any:
    """Return a container's elements: the list itself, or its ``items``.

    Args:
        cfg: A row / column / grid config.

    Returns:
        The elements (a list when well-formed; a mapping is converted to one).
    """
    items = cfg.get('items') if isinstance(cfg, dict) else cfg
    if isinstance(items, dict):
        items = [{k: v} for k, v in items.items()]
    return items


def _collect_elements(fc: dict, etype: str) -> list[dict]:
    """Return every ``etype`` element config: top-level, in ``form`` and in dynamic forms.

    Args:
        fc: The form configuration dict.
        etype: The element type (``'multiselect'``, ``'button'``, ...).

    Returns:
        The element config dicts, in order.
    """
    found: list[dict] = []

    def scan(elements: Any) -> None:
        """Add the ``etype`` elements among a form section's elements.

        Args:
            elements: A list of ``{type: config}`` dicts, or a ``{type: config}`` mapping.
        """
        if isinstance(elements, dict):
            elements = [{k: v} for k, v in elements.items()]
        if not isinstance(elements, list):
            return
        for el in flatten_layout(elements):
            if isinstance(el, dict) and isinstance(el.get(etype), dict):
                found.append(el[etype])

    if isinstance(fc.get(etype), dict):
        found.append(fc[etype])
    scan(fc.get('form'))
    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, dict):
        for section in dyn.values():
            scan(section)
    elif isinstance(dyn, list):              # legacy: a list of {name: elements}
        for item in dyn:
            if isinstance(item, dict):
                for section in item.values():
                    scan(section)
    return found


def _validate_hot_keys(fc: dict, errors: list[str]) -> None:
    """Validate hot keys: button ``hot_key`` and (multi)select ``hot_keys`` / ``pin_hot_keys``.

    Keys must be one character (not a space). A select's hot key must name one of its listed
    items (by value or label; file-backed items aren't checked). A key may be used once per
    top-level form item (an element, or a whole row / column / grid), since that is where
    hot keys apply.

    Args:
        fc: The form configuration dict.
        errors: List that error messages are appended to.
    """
    for section in _form_sections(fc):
        if isinstance(section, dict):
            section = [{k: v} for k, v in section.items()]
        if not isinstance(section, list):
            continue
        for top in section:
            if not isinstance(top, dict):
                continue
            seen: dict[str, str] = {}
            for etype, cfg in _walk_elements([top]):
                for key, where in _element_hot_keys(etype, cfg, errors):
                    if key in seen:
                        errors.append(
                            f'Hot key "{key}" is used by both {seen[key]} and {where} in the '
                            f'same form item (row / column / grid)'
                        )
                    else:
                        seen[key] = where


def _walk_elements(elements: list[Any]) -> list[tuple[str, Any]]:
    """Return every ``(type, config)`` among ``elements``, inside containers too.

    Args:
        elements: A list of ``{type: config}`` form elements.

    Returns:
        The elements (containers themselves excluded), in order.
    """
    out: list[tuple[str, Any]] = []
    for el in flatten_layout(elements):
        if isinstance(el, dict):
            out.extend(el.items())
    return out


def _element_hot_keys(etype: str, cfg: Any, errors: list[str]) -> list[tuple[str, str]]:
    """Return an element's valid hot keys as ``(key, description)``; report bad ones.

    Args:
        etype: The element type.
        cfg: Its config.
        errors: List that error messages are appended to.

    Returns:
        The element's hot keys.
    """
    if not isinstance(cfg, dict):
        return []
    name = cfg.get('label') or cfg.get('column') or cfg.get('icon') or etype
    where = f'{etype} "{name}"'
    out: list[tuple[str, str]] = []
    if etype == 'button':
        if 'show_hot_key' in cfg and not isinstance(cfg['show_hot_key'], bool):
            errors.append(f'{where}: "show_hot_key" must be true or false')
        if 'hot_key' in cfg:
            key = _hot_key(cfg['hot_key'])
            if key is None:
                errors.append(f'{where}: "hot_key" must be a single character (not a space)')
            else:
                out.append((key, where))
    elif etype in ('select', 'multiselect') and ('hot_keys' in cfg or 'pin_hot_keys' in cfg):
        if 'pin_hot_keys' in cfg and not isinstance(cfg['pin_hot_keys'], bool):
            errors.append(f'{where}: "pin_hot_keys" must be true or false')
        hot = cfg.get('hot_keys')
        if not isinstance(hot, dict):
            if hot is not None:
                errors.append(
                    f'{where}: "hot_keys" must map keys to item values (e.g. {{1: owl}})',
                )
            return out
        known = _listed_item_names(cfg.get('items'))
        for raw_key, value in hot.items():
            key = _hot_key(raw_key)
            if key is None:
                errors.append(
                    f'{where}: hot key {raw_key!r} must be a single character (not a space)',
                )
                continue
            if known is not None and str(value) not in known:
                errors.append(
                    f'{where}: hot key "{key}" names "{value}", which is not one of its items',
                )
            out.append((key, where))
    return out


def _hot_key(raw: Any) -> Optional[str]:
    """Return a hot key as a one-character string, or None when it isn't one.

    Args:
        raw: The configured key (YAML may give an int for ``1``).

    Returns:
        The key, or None.
    """
    if raw is None or isinstance(raw, bool):
        return None
    key = str(raw)
    return key if len(key) == 1 and key != ' ' else None


def _listed_item_names(items: Any) -> Optional[set[str]]:
    """Return the values and labels of a select's literal ``items`` list.

    Args:
        items: The ``items`` config.

    Returns:
        The names, or None when the items come from elsewhere (a file, a range...).
    """
    listed = items.get('items') if isinstance(items, dict) and 'path' not in items else items
    if not isinstance(listed, list):
        return None
    names: set[str] = set()
    for it in listed:
        if isinstance(it, dict):
            names.update(str(it[k]) for k in ('value', 'label') if it.get(k) is not None)
        elif it is not None:
            names.add(str(it).removeprefix(SELECTED_PREFIX))
    return names


def _validate_multiselect(ms: dict, errors: list[str], warns: list[str]) -> None:
    """Validate one multiselect: its output format, label bounds and items.

    Args:
        ms: The multiselect config dict.
        errors: List that error messages are appended to.
        warns: List that warning messages are appended to.
    """
    name = ms.get('column') or ms.get('label') or 'multiselect'
    output = ms.get('output') or {}
    fmt = output.get('format', 'list') if isinstance(output, dict) else None
    if fmt not in MULTISELECT_FORMATS:
        errors.append(
            f'Multiselect "{name}": unknown output format "{fmt}" '
            f'(use {" or ".join(MULTISELECT_FORMATS)})'
        )
    items = ms.get('items')
    if fmt in _ONE_HOT_FORMATS and isinstance(items, dict) and items.get('custom_value'):
        errors.append(
            f'Multiselect "{name}": format "{fmt}" has one entry per item, so it can\'t '
            f'allow custom_value tags (use format "list")'
        )
    if fmt == 'columns' and isinstance(output, dict) and output.get('delimiter'):
        warns.append(f'Multiselect "{name}": "delimiter" is ignored with format "columns"')

    low, high = ms.get('min'), ms.get('max')
    if high is not None and (not isinstance(high, int) or high < 1):
        errors.append(f'Multiselect "{name}": "max" must be a whole number of at least 1')
    elif isinstance(low, int) and isinstance(high, int) and low > high:
        errors.append(f'Multiselect "{name}": "min" ({low}) is larger than "max" ({high})')

    if isinstance(items, dict) and items.get('id') and not items.get('path'):
        errors.append(
            f'Multiselect "{name}": items "id" names a column of an items file, '
            f'so it needs items "path"'
        )


def _validate_button(btn: dict, errors: list[str]) -> None:
    """Validate one ``button``: it shows something and does something.

    A plain button needs an ``icon`` / ``image`` and ``column`` + ``value`` and/or
    ``submit: true``. A ``toggle`` button needs a ``column`` and 2+ states, each with a
    ``value`` and an ``icon`` / ``image``. ``jba:`` icons must be built-ins.

    Args:
        btn: The button config dict.
        errors: List that error messages are appended to.
    """
    name = btn.get('label') or btn.get('column') or btn.get('icon') or 'button'
    prefix = f'Button "{name}"'
    has_column = btn.get('column') not in (None, '')
    for key in ('icon', 'pressed_icon'):
        _check_builtin_icon(btn.get(key), f'{prefix} {key}', errors)
    for key in ('size', 'width', 'height'):
        val = btn.get(key)
        if val is not None and (isinstance(val, bool) or not isinstance(val, (int, float, str))):
            errors.append(f'{prefix}: "{key}" must be a number (px) or a CSS size')
    for key in ('color', 'background', 'pressed_color', 'pressed_background'):
        if key in btn and not isinstance(btn[key], str):
            errors.append(f'{prefix}: "{key}" must be a CSS color string')
    if 'highlight' in btn and not isinstance(btn['highlight'], bool):
        errors.append(f'{prefix}: "highlight" must be true or false')

    if 'toggle' in btn:
        _validate_toggle(btn, prefix, has_column, errors)
        return
    if not btn.get('icon') and not btn.get('image'):
        errors.append(f'{prefix}: set "icon" (text, a symbol or a jba: icon) or "image" (a path)')
    if has_column and 'value' not in btn:
        errors.append(f'{prefix}: "column" needs a "value" to write')
    elif 'value' in btn and not has_column:
        errors.append(f'{prefix}: "value" needs a "column" to write it to')
    if not has_column and btn.get('submit') is not True:
        errors.append(f'{prefix}: set "column" + "value", "submit: true", or both')


def _validate_toggle(btn: dict, prefix: str, has_column: bool, errors: list[str]) -> None:
    """Validate a ``toggle`` button's states.

    Args:
        btn: The button config dict (has ``toggle``).
        prefix: ``'Button "<name>"'`` for messages.
        has_column: Whether the button sets a ``column``.
        errors: List that error messages are appended to.
    """
    states = btn['toggle']
    if not has_column:
        errors.append(f'{prefix}: a toggle needs a "column" to write its value to')
    if btn.get('submit'):
        errors.append(f'{prefix}: a toggle can\'t "submit" (add a separate submit button)')
    if 'value' in btn:
        errors.append(f'{prefix}: a toggle\'s values go in its states, not "value"')
    if not isinstance(states, list) or len(states) < 2:
        errors.append(f'{prefix}: "toggle" must be a list of 2 or more states')
        return
    for i, st in enumerate(states, 1):
        where = f'{prefix} toggle state {i}'
        if not isinstance(st, dict):
            errors.append(f'{where}: must be a mapping with "value" and "icon" / "image"')
            continue
        if 'value' not in st:
            errors.append(f'{where}: needs a "value"')
        if not st.get('icon') and not st.get('image'):
            errors.append(f'{where}: set "icon" or "image"')
        _check_builtin_icon(st.get('icon'), where, errors)


def _check_builtin_icon(icon: Any, where: str, errors: list[str]) -> None:
    """Report an unknown ``jba:`` icon.

    Args:
        icon: The icon value (only strings starting with ``jba:`` are checked).
        where: Message prefix naming the button / state.
        errors: List that error messages are appended to.
    """
    if not isinstance(icon, str) or not icon.startswith(BUILTIN_ICON_PREFIX):
        return
    if icon[len(BUILTIN_ICON_PREFIX):] not in BUILTIN_ICONS:
        errors.append(
            f'{where}: unknown built-in icon "{icon}" '
            f'(use {", ".join(BUILTIN_ICON_PREFIX + n for n in sorted(BUILTIN_ICONS))})'
        )


def _validate_annotation(
    annot: dict, errors: list[str], warns: list[str],
) -> None:
    """Validate one annotation config: its tools and annotation-level fields.

    Args:
        annot: The annotation config dict.
        errors: List that error messages are appended to.
        warns: List that warning messages are appended to.
    """
    tools = annot.get('tools', [])
    if isinstance(tools, str):
        tools = [tools]

    # Check that annotation has at least one tool
    if not tools:
        errors.append('Annotation config must specify at least one tool in "tools" field')
        return

    active_tools = _collect_active_tools(tools, errors)

    # Check annotation-level fields based on active tools.
    # Only validate if annotation-level fields are actually provided.
    provided_fields = {field for field in ALL_ANNOTATION_FIELDS if field in annot}
    if not (active_tools and provided_fields):
        return

    # For each tool, check that its required fields are present
    for tool in active_tools:
        missing = ANNOTATION_TOOL_REQUIRED_FIELDS[tool] - provided_fields
        for field in missing:
            errors.append(
                f'Annotation tool "{tool}" requires field "{field}" '
                f'in annotation config'
            )

    # Warn about unnecessary fields: a field that no active tool requires
    for field in provided_fields:
        needed_by_any = any(
            field in ANNOTATION_TOOL_REQUIRED_FIELDS[tool]
            for tool in active_tools
        )
        if not needed_by_any:
            warns.append(
                f'Annotation field "{field}" is not required by active tools: '
                f'{", ".join(sorted(active_tools))}'
            )


def _collect_active_tools(tools: Any, errors: list[str]) -> set[str]:
    """Return the valid tool names in *tools*, reporting unknown ones.

    Also reports a ``fixed_duration`` tool that sets both ``window`` and
    ``initial_window``.

    Args:
        tools: The annotation ``tools`` value: a list of tool names and/or
            ``{tool_name: options}`` dicts.
        errors: List that error messages are appended to.

    Returns:
        The set of valid (known) tool names in use.
    """
    valid_list = ', '.join(sorted(VALID_ANNOTATION_TOOLS))
    active_tools: set[str] = set()
    if not isinstance(tools, list):
        return active_tools
    for t in tools:
        if isinstance(t, dict):
            unknown = set(t.keys()) - VALID_ANNOTATION_TOOLS
            for u in sorted(unknown):
                errors.append(f'Unknown annotation tool "{u}". Valid tools: {valid_list}')
            active_tools.update(t.keys() & VALID_ANNOTATION_TOOLS)

            fd = t.get('fixed_duration')
            if isinstance(fd, dict):
                has_window = 'window' in fd
                has_initial = 'initial_window' in fd
                if has_window and has_initial:
                    errors.append(
                        'fixed_duration: specify "window" or '
                        '"initial_window", not both',
                    )
        elif t not in VALID_ANNOTATION_TOOLS:
            errors.append(f'Unknown annotation tool "{t}". Valid tools: {valid_list}')
        else:
            active_tools.add(t)
    return active_tools
