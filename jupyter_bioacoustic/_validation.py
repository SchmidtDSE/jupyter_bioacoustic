"""
Config Validation

Shared validation logic for BioacousticAnnotator and ConfigBuilder.
Validates config keys, form keys, annotation tools, and dynamic forms.

License: BSD 3-Clause
"""
from __future__ import annotations

import logging
from typing import Optional


#
# Constants
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
    'data', 'data_path', 'data_url', 'data_sql', 'data_api',
    'data_start_time', 'data_end_time', 'data_duration', 'data_secrets',
    'display_columns',
    'audio', 'audio_src', 'audio_path', 'audio_url', 'audio_uri',
    'audio_column', 'audio_prefix', 'audio_suffix', 'audio_fallback',
    'audio_secrets', 'audio_sql', 'audio_api', 'audio_property',
    'audio_response_index',
    'secrets',
    'output', 'output_path', 'output_url', 'output_uri',
    'output_sync_button', 'output_recursive', 'output_secrets',
    'info_card_title', 'info_card_text',
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

# Required fields for each annotation tool
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
    'output_path',
})


#
# Public
#
def validate_config(
    config: Optional[dict] = None,
    form_config: Optional[dict] = None,
    project: Optional[dict] = None,
) -> dict:
    """Validate configuration dicts and return errors/warnings.

    Args:
        config: The merged config dict (data, audio, output, app keys).
        form_config: The form configuration dict.
        project: The project-level dict (before merge), if available.

    Returns:
        Dict with 'valid' (bool), 'errors' (list), 'warnings' (list).
    """
    errors: list[str] = []
    warnings: list[str] = []
    fc = form_config or {}

    _validate_form_keys(fc, errors)

    if project:
        _validate_config_keys(project, 'project', errors)
    if config:
        _validate_config_keys(config, 'config', errors)

    _validate_forms_and_annotations(fc, errors, warnings)

    if errors:
        _log.warning('validation failed: %s', errors)
    if warnings:
        _log.info('validation warnings: %s', warnings)
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
    }


#
# Internal
#
def _validate_form_keys(fc: dict, errors: list) -> None:
    """Check for unknown top-level form config keys."""
    for key in fc:
        if key not in VALID_FORM_KEYS and not isinstance(fc[key], list):
            errors.append(f'Unknown form config key "{key}"')


def _validate_config_keys(
    cfg: dict, label: str, errors: list,
) -> None:
    """Check for unknown config/project keys."""
    for key in cfg:
        if key in SKIP_KEYS:
            continue
        if key not in VALID_CONFIG_KEYS:
            errors.append(f'Unknown {label} key "{key}"')
        elif key == 'form_config' and isinstance(cfg[key], dict):
            _validate_form_keys(cfg[key], errors)


def _validate_forms_and_annotations(
    fc: dict, errors: list, warnings: list,
) -> None:
    """Validate dynamic forms, annotation tools, and form element presence."""
    defined_forms: set[str] = set()
    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, list):
        for item in dyn:
            if isinstance(item, dict):
                defined_forms.update(item.keys())
    elif isinstance(dyn, dict):
        defined_forms.update(dyn.keys())

    referenced_forms: set[str] = set()

    def _scan_items(items: list) -> None:
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict) and 'form' in it:
                    referenced_forms.add(it['form'])

    def _scan_elements(elements: list) -> None:
        if not isinstance(elements, list):
            return
        for el in elements:
            if not isinstance(el, dict):
                continue
            for etype, ecfg in el.items():
                if not isinstance(ecfg, dict):
                    continue
                if etype == 'select' and 'items' in ecfg:
                    _scan_items(ecfg['items'])
                if etype == 'checkbox':
                    for fkey in ('checked_form', 'unchecked_form'):
                        if ecfg.get(fkey):
                            referenced_forms.add(ecfg[fkey])

    form_list = fc.get('form')
    if isinstance(form_list, list):
        _scan_elements(form_list)

    for top_key in ('select', 'checkbox'):
        if top_key in fc and isinstance(fc[top_key], dict):
            cfg = fc[top_key]
            if top_key == 'select' and 'items' in cfg:
                _scan_items(cfg['items'])
            for fkey in ('checked_form', 'unchecked_form'):
                if cfg.get(fkey):
                    referenced_forms.add(cfg[fkey])

    if isinstance(dyn, list):
        for item in dyn:
            if isinstance(item, dict):
                for _, elems in item.items():
                    _scan_elements(
                        elems if isinstance(elems, list) else [],
                    )
    elif isinstance(dyn, dict):
        for _, elems in dyn.items():
            _scan_elements(
                elems if isinstance(elems, list) else [],
            )

    # Scan annotation forms before calculating missing/unreferenced
    annot_configs = []
    if 'annotation' in fc and isinstance(fc['annotation'], dict):
        annot_configs.append(fc['annotation'])
    if isinstance(form_list, list):
        for el in form_list:
            if isinstance(el, dict) and 'annotation' in el:
                annot_configs.append(el['annotation'])

    for annot in annot_configs:
        if not isinstance(annot, dict):
            continue
        annot_form = annot.get('form')
        if annot_form:
            referenced_forms.add(annot_form)

    missing_forms = referenced_forms - defined_forms
    unreferenced_forms = defined_forms - referenced_forms

    for annot in annot_configs:
        if not isinstance(annot, dict):
            continue
        tools = annot.get('tools', [])
        if isinstance(tools, str):
            tools = [tools]

        # Determine which tools are being used
        active_tools = set()
        if isinstance(tools, list):
            for t in tools:
                if isinstance(t, dict):
                    unknown = set(t.keys()) - VALID_ANNOTATION_TOOLS
                    for u in sorted(unknown):
                        errors.append(
                            f'Unknown annotation tool "{u}". '
                            f'Valid tools: '
                            f'{", ".join(sorted(VALID_ANNOTATION_TOOLS))}'
                        )
                    # Add dict-based tools to active set
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
                    errors.append(
                        f'Unknown annotation tool "{t}". '
                        f'Valid tools: '
                        f'{", ".join(sorted(VALID_ANNOTATION_TOOLS))}'
                    )
                else:
                    # Add string-based tools to active set
                    active_tools.add(t)

        # Check annotation-level fields based on active tools
        if active_tools:
            # Get union of all required fields for all active tools
            all_required = set()
            all_tools_required = set()
            for tool in active_tools:
                tool_required = ANNOTATION_TOOL_REQUIRED_FIELDS.get(tool, set())
                all_required.update(tool_required)
                if tool_required:
                    all_tools_required.add(tool)

            # Check which fields are provided at annotation level
            provided_fields = set()
            for field in ALL_ANNOTATION_FIELDS:
                if field in annot:
                    provided_fields.add(field)

            # For each tool, check if its required fields are present
            for tool in all_tools_required:
                tool_required = ANNOTATION_TOOL_REQUIRED_FIELDS.get(tool, set())
                missing = tool_required - provided_fields
                for field in missing:
                    errors.append(
                        f'Annotation tool "{tool}" requires field "{field}" in annotation config'
                    )

            # Warn about unnecessary fields
            # A field is unnecessary if no active tool requires it
            for field in provided_fields:
                needed_by_any = False
                for tool in active_tools:
                    if field in ANNOTATION_TOOL_REQUIRED_FIELDS.get(tool, set()):
                        needed_by_any = True
                        break
                if not needed_by_any:
                    warnings.append(
                        f'Annotation field "{field}" is not required by active tools: {", ".join(sorted(active_tools))}'
                    )

    for f in sorted(missing_forms):
        errors.append(
            f'Referenced dynamic form "{f}" is not defined',
        )
    for f in sorted(unreferenced_forms):
        warnings.append(
            f'Dynamic form "{f}" is defined but never referenced',
        )

    has_form = bool(fc.get('form'))
    has_legacy = any(
        k in fc for k in ('select', 'textbox', 'checkbox', 'number')
    )
    has_annotation = 'annotation' in fc
    if not has_form and not has_legacy and not has_annotation:
        warnings.append('No form input elements configured')
