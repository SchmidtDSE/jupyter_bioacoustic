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
    'annotation',
    'select', 'textbox', 'checkbox', 'number',
    'break', 'line', 'text',
})

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
    'info_card_height', 'form_panel_height',
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

SKIP_KEYS = frozenset({
    'project_name', 'project_path', 'config_path',
    'form_path', 'project_enabled', 'config_enabled', 'form_enabled',
    'project_locked', 'config_locked', 'form_locked',
    'output_path',
})


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

    if project:
        _validate_config_keys(project, 'project', errors)
    if config:
        _validate_config_keys(config, 'config', errors)

    if config or project:
        _validate_required_fields(
            config or {}, project or {}, errors, warns,
            _has_form_configured(fc, config or {}, project or {}),
        )
        _validate_sync(config or {}, project or {}, errors)
    _validate_forms_and_annotations(fc, errors, warns)

    if errors:
        _log.warning('validation failed: %s', errors)
    if warns:
        _log.info('validation warnings: %s', warns)
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warns,
    }


#
# INTERNAL
#
def _validate_form_keys(fc: dict, errors: list[str]) -> None:
    """Check for unknown top-level form config keys.

    List-valued keys are allowed (they are form-element lists).

    Args:
        fc: The form configuration dict.
        errors: List that error messages are appended to.
    """
    for key in fc:
        if key not in VALID_FORM_KEYS and not isinstance(fc[key], list):
            errors.append(f'Unknown form config key "{key}"')


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
    project/config carries a top-level "form" or "form_config" key. Without
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
        if isinstance(cfg, dict) and (cfg.get('form') or cfg.get('form_config')):
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
        k in fc for k in ('select', 'textbox', 'checkbox', 'number')
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

    References come from select ``items[].form``, checkbox
    ``checked_form``/``unchecked_form`` (in the ``form`` list, the legacy
    top-level ``select``/``checkbox`` keys and inside dynamic forms), and
    annotation ``form`` keys.

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

    for top_key in ('select', 'checkbox'):
        if top_key in fc and isinstance(fc[top_key], dict):
            cfg = fc[top_key]
            if top_key == 'select' and 'items' in cfg:
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
    """Add the ``form`` of each select item to *referenced_forms*.

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
    for el in elements:
        if not isinstance(el, dict):
            continue
        for etype, ecfg in el.items():
            if not isinstance(ecfg, dict):
                continue
            if etype == 'select' and 'items' in ecfg:
                _scan_items(ecfg['items'], referenced_forms)
            if etype == 'checkbox':
                for fkey in ('checked_form', 'unchecked_form'):
                    if ecfg.get(fkey):
                        referenced_forms.add(ecfg[fkey])


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
