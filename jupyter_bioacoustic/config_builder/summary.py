"""
Configuration Summary

Generates a structured summary of a BioacousticAnnotator
configuration. Used by both the CLI (plain text) and the
config builder widget (HTML rendering via TypeScript).

The main entry point is ``build_summary()``, which accepts
the same section-based data that ``ConfigBuilder`` manages
and returns a list of ``SummarySection`` dicts.

License: BSD 3-Clause
"""
from __future__ import annotations

from typing import Any


#
# CONSTANTS
#
USER_INPUT_TYPES = frozenset({'select', 'textbox', 'checkbox', 'number'})


#
# PUBLIC
#
def build_summary(
    project: dict[str, Any],
    config: dict[str, Any],
    form_config: dict[str, Any],
    merged: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build a structured configuration summary.

    Args:
        project: Project-level configuration dict (``ConfigBuilder._project``).
        config: Config-level configuration dict (``ConfigBuilder._config``).
        form_config: Form configuration dict (``ConfigBuilder._form_config``).
        merged: Merged configuration (``ConfigBuilder.get_merged_config()``).

    Returns:
        A list of section dicts, each containing:
            ``title`` (str) — section heading,
            ``rows``  (list) — list of row dicts with keys:
                ``key`` (str), ``value`` (str),
                ``muted`` (bool, optional),
                ``tag`` (str, optional — element type badge),
                ``indent`` (int, optional — nesting depth),
                ``children`` (list, optional — nested rows).
    """
    sections: list[dict[str, Any]] = []
    sections.append(_project_section(project))
    sections.append(_data_section(merged))
    sections.append(_audio_section(merged))
    sections.append(_output_section(merged))
    sections.append(_app_section(merged))
    sections.append(_form_section(form_config))
    return sections


def build_summary_from_builder(builder: Any) -> list[dict[str, Any]]:
    """Build a summary directly from a ``ConfigBuilder`` instance.

    Convenience wrapper for CLI and kernel bridge usage.
    """
    return build_summary(
        project=builder._project,
        config=builder._config,
        form_config=builder._form_config or {},
        merged=builder.get_merged_config(),
    )


def format_text(sections: list[dict[str, Any]]) -> str:
    """Render a structured summary as plain text for CLI output.

    Args:
        sections: Output from ``build_summary()``.

    Returns:
        Multi-line string suitable for terminal display.
    """
    lines: list[str] = []
    for section in sections:
        lines.append('')
        title = section['title'].upper()
        lines.append(f'  {title}')
        lines.append(f'  {"-" * len(title)}')
        for row in section.get('rows', []):
            _format_row(lines, row, depth=0)
    return '\n'.join(lines)


#
# INTERNAL
#
def _format_row(lines: list[str], row: dict[str, Any], depth: int) -> None:
    """Recursively format a single row and its children as text lines."""
    base_indent = '    ' + ('  ' * depth)
    key = row.get('key', '')
    value = row.get('value', '')
    tag = row.get('tag', '')
    muted = row.get('muted', False)

    display_val = f'({value})' if muted else value
    if tag:
        lines.append(f'{base_indent}[{tag}] {display_val}')
    elif key:
        lines.append(f'{base_indent}{key:<16} {display_val}')
    elif display_val:
        lines.append(f'{base_indent}{display_val}')

    for child in row.get('children', []):
        _format_row(lines, child, depth + 1)


def _row(
    key: str = '',
    value: str = '',
    muted: bool = False,
    tag: str = '',
    children: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Create a summary row dict."""
    r: dict[str, Any] = {'key': key, 'value': value}
    if muted:
        r['muted'] = True
    if tag:
        r['tag'] = tag
    if children:
        r['children'] = children
    return r


def _secrets_summary(secrets: Any) -> str:
    """Summarize a secrets configuration value."""
    if secrets is False:
        return 'opted out'
    if isinstance(secrets, list):
        return ', '.join(s.get('key', '?') for s in secrets if isinstance(s, dict))
    if isinstance(secrets, dict) and 'key' in secrets:
        return str(secrets['key'])
    return ''


def _project_section(d: dict[str, Any]) -> dict[str, Any]:
    """Build the Project section."""
    rows: list[dict[str, Any]] = []
    name = d.get('project_name', '')
    rows.append(_row('name', name or '(unnamed)', muted=not name))

    files: list[tuple[str, str]] = []
    if d.get('project_enabled') and d.get('project_path'):
        files.append(('project', d['project_path']))
    if d.get('config_enabled') and d.get('config_path'):
        files.append(('config', d['config_path']))
    if d.get('form_enabled') and d.get('form_path'):
        files.append(('form', d['form_path']))

    if files:
        for label, path in files:
            rows.append(_row(label, path))
    else:
        rows.append(_row('files', 'none configured', muted=True))

    output = d.get('output', {})
    if isinstance(output, dict) and output.get('path'):
        rows.append(_row('output', output['path']))

    return {'title': 'Project', 'rows': rows}


def _data_section(d: dict[str, Any]) -> dict[str, Any]:
    """Build the Data section."""
    rows: list[dict[str, Any]] = []
    data = d.get('data', {})
    if isinstance(data, dict):
        source_key = next((k for k in ('path', 'url', 'sql', 'api') if data.get(k)), '')
        if source_key:
            rows.append(_row(source_key, str(data[source_key])))
        else:
            rows.append(_row('source', 'not set', muted=True))
        cols = data.get('columns', [])
        if cols:
            rows.append(_row('columns', ', '.join(str(c) for c in cols)))
        for field in ('start_time', 'end_time'):
            val = data.get(field)
            if val is not None and str(val) != field:
                rows.append(_row(field, str(val)))
        if data.get('duration') is not None:
            rows.append(_row('duration', str(data['duration'])))
        if data.get('secrets') is not None:
            rows.append(_row('secrets', _secrets_summary(data['secrets'])))
    else:
        rows.append(_row('source', str(data)))

    top_cols = d.get('data_columns')
    if top_cols and not (isinstance(data, dict) and data.get('columns')):
        rows.append(_row('columns', ', '.join(str(c) for c in top_cols)))

    return {'title': 'Data', 'rows': rows}


def _audio_section(d: dict[str, Any]) -> dict[str, Any]:
    """Build the Audio section."""
    rows: list[dict[str, Any]] = []
    audio = d.get('audio', {})
    if isinstance(audio, dict):
        source_key = next(
            (k for k in ('path', 'url', 'uri', 'column') if audio.get(k)), '',
        )
        if source_key:
            rows.append(_row(source_key, str(audio[source_key])))
        else:
            rows.append(_row('source', 'not set', muted=True))
        for field in ('prefix', 'suffix', 'fallback'):
            if audio.get(field):
                rows.append(_row(field, str(audio[field])))
        if audio.get('secrets') is not None:
            rows.append(_row('secrets', _secrets_summary(audio['secrets'])))
    elif audio:
        rows.append(_row('column', str(audio)))

    return {'title': 'Audio', 'rows': rows}


def _output_section(d: dict[str, Any]) -> dict[str, Any]:
    """Build the Output section."""
    rows: list[dict[str, Any]] = []
    output = d.get('output', {})
    if isinstance(output, dict):
        if output.get('path'):
            rows.append(_row('path', output['path']))
        else:
            rows.append(_row('path', 'not set', muted=True))
        if output.get('uri'):
            rows.append(_row('sync uri', output['uri']))
        if output.get('sync_button'):
            label = output['sync_button'] if isinstance(output['sync_button'], str) else 'yes'
            rows.append(_row('sync button', label))
        if output.get('recursive'):
            rows.append(_row('recursive', 'yes'))
        if output.get('secrets') is not None:
            rows.append(_row('secrets', _secrets_summary(output['secrets'])))
    elif output:
        rows.append(_row('path', str(output)))
    else:
        rows.append(_row('path', 'not set', muted=True))

    return {'title': 'Output', 'rows': rows}


def _app_section(d: dict[str, Any]) -> dict[str, Any]:
    """Build the Application section."""
    rows: list[dict[str, Any]] = []
    if d.get('ident_column'):
        rows.append(_row('ident', d['ident_column']))
    display_cols = d.get('display_columns', [])
    if display_cols:
        rows.append(_row('display', ', '.join(str(c) for c in display_cols)))
    if d.get('duplicate_entries'):
        rows.append(_row('duplicates', 'allowed'))
    buf = d.get('default_buffer')
    if buf is not None and buf != 3:
        rows.append(_row('buffer', str(buf)))
    capture = d.get('capture')
    rows.append(_row('capture', 'off' if capture is False else 'on'))
    if d.get('capture_dir'):
        rows.append(_row('capture_dir', d['capture_dir']))
    desc = d.get('description')
    if isinstance(desc, dict):
        if desc.get('title'):
            rows.append(_row('desc title', desc['title']))
        if desc.get('text'):
            text_lines = desc['text'].strip().splitlines()
            preview = text_lines[0][:60]
            if len(text_lines[0]) > 60 or len(text_lines) > 1:
                preview += '...'
            rows.append(_row('desc text', preview))

    return {'title': 'Application', 'rows': rows}


def _form_section(fc: dict[str, Any]) -> dict[str, Any]:
    """Build the Form Config section."""
    rows: list[dict[str, Any]] = []
    if not fc:
        rows.append(_row(value='no form configured', muted=True))
        return {'title': 'Form Config', 'rows': rows}

    dyn_forms = _parse_dynamic_forms(fc)

    if fc.get('title'):
        cfg = fc['title']
        title_val = cfg if isinstance(cfg, str) else (
            cfg.get('value', '') if isinstance(cfg, dict) else ''
        )
        tracker = ' + tracker' if isinstance(cfg, dict) and cfg.get('progress_tracker') else ''
        rows.append(_row('title', title_val + tracker))

    if fc.get('pass_value'):
        pv = fc['pass_value']
        items = pv if isinstance(pv, list) else [pv]
        for item in items:
            if isinstance(item, dict):
                rows.append(_row(
                    'pass_value',
                    f"{item.get('source_column', '?')} -> {item.get('column', '?')}",
                ))

    if fc.get('fixed_value'):
        fv = fc['fixed_value']
        items = fv if isinstance(fv, list) else [fv]
        for item in items:
            if isinstance(item, dict):
                rows.append(_row(
                    'fixed_value',
                    f"{item.get('column', '?')} = {item.get('value', '?')}",
                ))

    if fc.get('annotation'):
        annot = fc['annotation']
        tools = annot.get('tools', [])
        tools_str = ', '.join(str(t) for t in tools) if isinstance(tools, list) else 'configured'
        annot_children = _annotation_field_rows(annot)
        annot_children.extend(_referenced_dyn_form_rows(
            'annotation', annot, dyn_forms,
        ))
        rows.append(_row('annotation', tools_str, children=annot_children or None))

    for top_key in ('select', 'textbox', 'checkbox', 'number'):
        if top_key in fc and isinstance(fc[top_key], dict):
            line = _summarize_form_element(top_key, fc[top_key])
            children = _referenced_dyn_form_rows(top_key, fc[top_key], dyn_forms)
            rows.append(_row(key=top_key, value=line, children=children or None))

    form_list = fc.get('form', [])
    if isinstance(form_list, list) and form_list:
        form_children: list[dict[str, Any]] = []
        for el in form_list:
            if not isinstance(el, dict):
                continue
            for etype, ecfg in el.items():
                if etype in ('break', 'line'):
                    continue
                line = _summarize_form_element(etype, ecfg)
                dyn_children = _referenced_dyn_form_rows(etype, ecfg, dyn_forms)
                form_children.append(_row(
                    value=line, tag=etype, children=dyn_children or None,
                ))
        rows.append(_row(key='FORM', children=form_children))

    if fc.get('submission_buttons'):
        sb = fc['submission_buttons']
        parts: list[str] = []
        if sb.get('previous'):
            parts.append('previous')
        if sb.get('next'):
            label = sb['next'].get('label', 'next') if isinstance(sb['next'], dict) else 'next'
            parts.append(label)
        if sb.get('submit'):
            label = (
                sb['submit'].get('label', 'submit')
                if isinstance(sb['submit'], dict) else 'submit'
            )
            parts.append(label)
        rows.append(_row('buttons', ', '.join(parts) or 'default'))

    remaining = [(k, v) for k, v in dyn_forms.items() if v is not None]
    for name, elems in remaining:
        children: list[dict[str, Any]] = []
        for el in elems:
            if not isinstance(el, dict):
                continue
            for etype, ecfg in el.items():
                children.append(_row(
                    value=_summarize_form_element(etype, ecfg), tag=etype,
                ))
        rows.append(_row(value=f'dynamic form: {name}', tag='dynamic', children=children))

    return {'title': 'Form Config', 'rows': rows}


def _parse_dynamic_forms(fc: dict[str, Any]) -> dict[str, list[Any] | None]:
    """Parse dynamic_forms from form config into a mutable mapping."""
    result: dict[str, list[Any] | None] = {}
    dyn = fc.get('dynamic_forms')
    if isinstance(dyn, list):
        for item in dyn:
            if isinstance(item, dict):
                for name, elems in item.items():
                    result[name] = elems if isinstance(elems, list) else [elems]
    elif isinstance(dyn, dict):
        for name, elems in dyn.items():
            result[name] = elems if isinstance(elems, list) else [elems]
    return result


def _referenced_dyn_form_rows(
    etype: str,
    cfg: dict[str, Any],
    dyn_forms: dict[str, list[Any] | None],
) -> list[dict[str, Any]]:
    """Build rows for dynamic forms referenced by a form element."""
    rows: list[dict[str, Any]] = []
    for form_name in _get_referenced_forms(etype, cfg):
        elems = dyn_forms.get(form_name)
        if elems is None:
            continue
        children: list[dict[str, Any]] = []
        for el in elems:
            if not isinstance(el, dict):
                continue
            for et, ec in el.items():
                children.append(_row(
                    value=_summarize_form_element(et, ec), tag=et,
                ))
        rows.append(_row(
            value=f'dynamic form: {form_name}', tag='dynamic', children=children,
        ))
        dyn_forms[form_name] = None
    return rows


def _annotation_field_rows(annot: dict[str, Any]) -> list[dict[str, Any]]:
    """Build rows for annotation field mappings."""
    rows: list[dict[str, Any]] = []
    for field in ('start_time', 'end_time', 'min_frequency', 'max_frequency'):
        cfg = annot.get(field)
        if isinstance(cfg, dict):
            col = cfg.get('column', '')
            src = cfg.get('source_value', '')
            detail = col
            if src:
                detail += f' (source: {src})'
            rows.append(_row(field, detail))
    return rows


def _get_referenced_forms(etype: str, cfg: dict[str, Any]) -> list[str]:
    """Get dynamic form names referenced by a form element."""
    forms: list[str] = []
    if etype == 'select' and isinstance(cfg.get('items'), list):
        for item in cfg['items']:
            if isinstance(item, dict) and item.get('form'):
                forms.append(item['form'])
    if etype == 'checkbox':
        for key in ('checked_form', 'unchecked_form'):
            if cfg.get(key):
                forms.append(cfg[key])
    if etype == 'annotation' and cfg.get('form'):
        forms.append(cfg['form'])
    return forms


def _summarize_form_element(etype: str, cfg: Any) -> str:
    """Produce a one-line summary of a form element."""
    if not isinstance(cfg, dict):
        return str(cfg) if cfg is not True else ''

    if etype == 'select':
        label = cfg.get('label') or cfg.get('column', '')
        items = cfg.get('items')
        if isinstance(items, list):
            count: str | int = len(items)
        elif isinstance(items, dict) and items.get('path'):
            count = 'file'
        else:
            count = '?'
        req = ' *' if cfg.get('required') else ''
        refs = _get_referenced_forms('select', cfg)
        form_ref = f" -> {', '.join(refs)}" if refs else ''
        return f'{label} ({count} items{req}){form_ref}'

    if etype == 'textbox':
        label = cfg.get('label') or cfg.get('column', '')
        ml = ' (multiline)' if cfg.get('multiline') else ''
        return f'{label}{ml}'

    if etype == 'checkbox':
        parts = [cfg.get('label') or cfg.get('column', '')]
        if cfg.get('checked_form'):
            parts.append(f"checked->{cfg['checked_form']}")
        if cfg.get('unchecked_form'):
            parts.append(f"unchecked->{cfg['unchecked_form']}")
        return ' '.join(parts)

    if etype == 'number':
        label = cfg.get('label') or cfg.get('column', '')
        has_range = cfg.get('min') is not None or cfg.get('max') is not None
        rng = f" [{cfg.get('min', '')}..{cfg.get('max', '')}]" if has_range else ''
        return f'{label}{rng}'

    if etype == 'text':
        return cfg.get('value', '')

    if etype in ('break', 'line'):
        return ''

    return cfg.get('label') or cfg.get('column') or cfg.get('value') or ''
