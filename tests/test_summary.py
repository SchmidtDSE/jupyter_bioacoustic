"""
Test Summary

Tests for config_builder.summary module covering
structured summary generation and text formatting.

License: BSD 3-Clause
"""
import pytest

from jupyter_bioacoustic.config_builder.summary import (
    build_summary,
    build_summary_from_builder,
    format_text,
    _summarize_form_element,
    _secrets_summary,
    _get_referenced_forms,
    _parse_dynamic_forms,
)
from jupyter_bioacoustic.config_builder.core import ConfigBuilder


#
# CONSTANTS
#
EMPTY_SECTIONS = {
    'project': {},
    'config': {},
    'form_config': {},
    'merged': {},
}

FULL_PROJECT = {
    'project_name': 'Test Project',
    'project_enabled': True,
    'project_path': 'projects/test.yaml',
    'config_enabled': True,
    'config_path': 'config/test.yaml',
    'form_enabled': True,
    'form_path': 'forms/test.yaml',
    'output': {'path': 'outputs/test.csv'},
}

FULL_MERGED = {
    'data': {
        'path': 'data/input.csv',
        'start_time': 'begin',
        'duration': 12.0,
        'secrets': [{'key': 'DB_PASS'}],
    },
    'audio': {
        'uri': 's3://bucket/audio.flac',
        'prefix': 'audio/',
        'suffix': '.flac',
        'fallback': 'local/',
        'secrets': False,
    },
    'output': {
        'path': 'outputs/test.csv',
        'uri': 's3://bucket/output/',
        'sync_button': 'Sync Now',
        'recursive': True,
        'secrets': {'key': 'S3_KEY'},
    },
    'info_card_ident_column': 'species',
    'info_card_display_columns': ['confidence', 'county'],
    'duplicate_entries': True,
    'default_buffer': 5,
    'capture': False,
    'capture_dir': 'spectrograms',
    'description': {
        'title': 'My Workflow',
        'text': 'This is a detailed description\nwith multiple lines',
    },
}

FULL_FORM = {
    'title': {'value': 'REVIEW', 'progress_tracker': True},
    'pass_value': [
        {'source_column': 'id', 'column': 'detection_id'},
        {'source_column': 'start_time', 'column': 'start_time'},
    ],
    'fixed_value': {'column': 'version', 'value': '1.0'},
    'annotation': {
        'tools': ['time_select', 'bounding_box'],
        'start_time': {'column': 'start', 'source_value': 'start_time'},
        'end_time': {'column': 'end'},
    },
    'select': {
        'label': 'Is Valid',
        'column': 'is_valid',
        'required': True,
        'items': [
            {'label': 'yes', 'value': 'yes'},
            {'label': 'no', 'value': 'no', 'form': 'correction_form'},
        ],
    },
    'form': [
        {'textbox': {'label': 'notes', 'column': 'notes', 'multiline': True}},
        {'number': {'label': 'count', 'column': 'count', 'min': 0, 'max': 100}},
        {'checkbox': {
            'label': 'confirmed',
            'column': 'confirmed',
            'checked_form': 'confirm_form',
        }},
    ],
    'submission_buttons': {
        'line': True,
        'previous': True,
        'next': {'label': 'Skip'},
        'submit': {'label': 'Verify'},
    },
    'dynamic_forms': {
        'correction_form': [
            {'select': {
                'label': 'corrected species',
                'column': 'verified_name',
                'items': {'path': 'data/categories.csv', 'value': 'name'},
            }},
        ],
        'confirm_form': [
            {'textbox': {'label': 'reason', 'column': 'reason'}},
        ],
    },
}


#
# build_summary
#
class TestBuildSummary:

    def test_returns_six_sections(self):
        sections = build_summary(**EMPTY_SECTIONS)
        assert len(sections) == 6

    def test_section_titles(self):
        sections = build_summary(**EMPTY_SECTIONS)
        titles = [s['title'] for s in sections]
        assert titles == [
            'Project', 'Data', 'Audio', 'Output', 'Application', 'Form Config',
        ]

    def test_empty_project_shows_unnamed(self):
        sections = build_summary(**EMPTY_SECTIONS)
        proj_rows = sections[0]['rows']
        assert any(r['value'] == '(unnamed)' and r.get('muted') for r in proj_rows)

    def test_full_project_section(self):
        sections = build_summary(
            project=FULL_PROJECT, config={}, form_config={}, merged={},
        )
        proj_rows = sections[0]['rows']
        assert any(r['value'] == 'Test Project' for r in proj_rows)
        assert any(r['key'] == 'project' and r['value'] == 'projects/test.yaml' for r in proj_rows)
        assert any(r['key'] == 'config' for r in proj_rows)
        assert any(r['key'] == 'form' for r in proj_rows)
        assert any(r['key'] == 'output' for r in proj_rows)

    def test_no_files_shows_muted(self):
        sections = build_summary(project={'project_name': 'x'}, config={}, form_config={}, merged={})
        proj_rows = sections[0]['rows']
        assert any(r['key'] == 'files' and r.get('muted') for r in proj_rows)

    def test_data_section_with_source(self):
        sections = build_summary(project={}, config={}, form_config={}, merged=FULL_MERGED)
        data_rows = sections[1]['rows']
        assert any(r['key'] == 'path' and 'input.csv' in r['value'] for r in data_rows)
        assert any(r['key'] == 'start_time' and r['value'] == 'begin' for r in data_rows)
        assert any(r['key'] == 'duration' and r['value'] == '12.0' for r in data_rows)
        assert any(r['key'] == 'secrets' for r in data_rows)

    def test_data_section_empty(self):
        sections = build_summary(**EMPTY_SECTIONS)
        data_rows = sections[1]['rows']
        assert any(r['key'] == 'source' and r.get('muted') for r in data_rows)

    def test_audio_section(self):
        sections = build_summary(project={}, config={}, form_config={}, merged=FULL_MERGED)
        audio_rows = sections[2]['rows']
        assert any(r['key'] == 'uri' for r in audio_rows)
        assert any(r['key'] == 'prefix' for r in audio_rows)
        assert any(r['key'] == 'suffix' for r in audio_rows)
        assert any(r['key'] == 'fallback' for r in audio_rows)
        assert any(r['key'] == 'secrets' and r['value'] == 'opted out' for r in audio_rows)

    def test_audio_string_value(self):
        sections = build_summary(
            project={}, config={}, form_config={},
            merged={'audio': 'audio_path'},
        )
        audio_rows = sections[2]['rows']
        assert any(r['key'] == 'column' and r['value'] == 'audio_path' for r in audio_rows)

    def test_output_section(self):
        sections = build_summary(project={}, config={}, form_config={}, merged=FULL_MERGED)
        output_rows = sections[3]['rows']
        assert any(r['key'] == 'path' for r in output_rows)
        assert any(r['key'] == 'sync uri' for r in output_rows)
        assert any(r['key'] == 'sync button' and r['value'] == 'Sync Now' for r in output_rows)
        assert any(r['key'] == 'recursive' for r in output_rows)
        assert any(r['key'] == 'secrets' and r['value'] == 'S3_KEY' for r in output_rows)

    def test_output_section_empty(self):
        sections = build_summary(**EMPTY_SECTIONS)
        output_rows = sections[3]['rows']
        assert any(r['key'] == 'path' and r.get('muted') for r in output_rows)

    def test_app_section(self):
        sections = build_summary(project={}, config={}, form_config={}, merged=FULL_MERGED)
        app_rows = sections[4]['rows']
        assert any(r['key'] == 'ident' and r['value'] == 'species' for r in app_rows)
        assert any(r['key'] == 'display' for r in app_rows)
        assert any(r['key'] == 'duplicates' and r['value'] == 'allowed' for r in app_rows)
        assert any(r['key'] == 'buffer' and r['value'] == '5' for r in app_rows)
        assert any(r['key'] == 'capture' and r['value'] == 'off' for r in app_rows)
        assert any(r['key'] == 'capture_dir' for r in app_rows)
        assert any(r['key'] == 'desc title' for r in app_rows)
        assert any(r['key'] == 'desc text' for r in app_rows)

    def test_form_section_empty(self):
        sections = build_summary(**EMPTY_SECTIONS)
        form_rows = sections[5]['rows']
        assert any(r.get('muted') and 'no form' in r['value'] for r in form_rows)

    def test_form_section_full(self):
        sections = build_summary(project={}, config={}, form_config=FULL_FORM, merged={})
        form_rows = sections[5]['rows']
        assert any(r['key'] == 'title' and 'REVIEW' in r['value'] for r in form_rows)
        assert any(r['key'] == 'title' and 'tracker' in r['value'] for r in form_rows)
        assert any(r['key'] == 'pass_value' for r in form_rows)
        assert any(r['key'] == 'fixed_value' for r in form_rows)
        assert any(r['key'] == 'annotation' for r in form_rows)
        assert any(r['key'] == 'select' for r in form_rows)
        assert any(r['key'] == 'FORM' for r in form_rows)
        assert any(r['key'] == 'buttons' for r in form_rows)

    def test_form_buttons_labels(self):
        sections = build_summary(project={}, config={}, form_config=FULL_FORM, merged={})
        form_rows = sections[5]['rows']
        btn_row = next(r for r in form_rows if r['key'] == 'buttons')
        assert 'previous' in btn_row['value']
        assert 'Skip' in btn_row['value']
        assert 'Verify' in btn_row['value']

    def test_form_dynamic_forms_referenced(self):
        sections = build_summary(project={}, config={}, form_config=FULL_FORM, merged={})
        form_rows = sections[5]['rows']
        select_row = next(r for r in form_rows if r['key'] == 'select')
        assert select_row.get('children') is not None
        dyn_children = [c for c in (select_row['children'] or []) if c.get('tag') == 'dynamic']
        assert len(dyn_children) >= 1
        assert 'correction_form' in dyn_children[0]['value']

    def test_form_list_elements(self):
        sections = build_summary(project={}, config={}, form_config=FULL_FORM, merged={})
        form_rows = sections[5]['rows']
        form_row = next(r for r in form_rows if r['key'] == 'FORM')
        children = form_row.get('children', [])
        tags = [c['tag'] for c in children]
        assert 'textbox' in tags
        assert 'number' in tags
        assert 'checkbox' in tags

    def test_scope_form_returns_one_section(self):
        sections = build_summary(
            project=FULL_PROJECT, config={}, form_config=FULL_FORM,
            merged=FULL_MERGED, scope='form',
        )
        assert len(sections) == 1
        assert sections[0]['title'] == 'Form Config'

    def test_scope_config_omits_project(self):
        sections = build_summary(
            project=FULL_PROJECT, config={}, form_config=FULL_FORM,
            merged=FULL_MERGED, scope='config',
        )
        titles = [s['title'] for s in sections]
        assert 'Project' not in titles
        assert 'Data' in titles
        assert 'Form Config' in titles
        assert len(sections) == 5

    def test_scope_project_includes_all(self):
        sections = build_summary(
            project=FULL_PROJECT, config={}, form_config=FULL_FORM,
            merged=FULL_MERGED, scope='project',
        )
        assert len(sections) == 6
        assert sections[0]['title'] == 'Project'


#
# build_summary_from_builder
#
class TestBuildSummaryFromBuilder:

    def test_empty_builder(self):
        cb = ConfigBuilder()
        sections = build_summary_from_builder(cb)
        assert len(sections) == 6

    def test_scope_passed_through(self):
        cb = ConfigBuilder()
        sections = build_summary_from_builder(cb, scope='form')
        assert len(sections) == 1
        assert sections[0]['title'] == 'Form Config'


#
# format_text
#
class TestFormatText:

    def test_empty_sections(self):
        sections = build_summary(**EMPTY_SECTIONS)
        text = format_text(sections)
        assert 'PROJECT' in text
        assert 'DATA' in text
        assert 'FORM CONFIG' in text

    def test_full_config_text(self):
        sections = build_summary(
            project=FULL_PROJECT, config={},
            form_config=FULL_FORM, merged=FULL_MERGED,
        )
        text = format_text(sections)
        assert 'Test Project' in text
        assert 'REVIEW' in text
        assert 'time_select' in text
        assert 'Verify' in text

    def test_muted_values_wrapped(self):
        sections = build_summary(**EMPTY_SECTIONS)
        text = format_text(sections)
        assert '(unnamed)' in text
        assert '(not set)' in text

    def test_tagged_elements(self):
        sections = build_summary(project={}, config={}, form_config=FULL_FORM, merged={})
        text = format_text(sections)
        assert '[textbox]' in text
        assert '[number]' in text

    def test_single_section_skips_header(self):
        sections = build_summary(
            project={}, config={}, form_config=FULL_FORM, merged={}, scope='form',
        )
        text = format_text(sections)
        assert 'FORM CONFIG' not in text
        assert '---' not in text
        assert 'REVIEW' in text

    def test_multi_section_shows_headers(self):
        sections = build_summary(
            project={}, config={}, form_config=FULL_FORM, merged=FULL_MERGED, scope='config',
        )
        text = format_text(sections)
        assert 'DATA' in text
        assert 'FORM CONFIG' in text


#
# _summarize_form_element
#
class TestSummarizeFormElement:

    def test_select_with_items_list(self):
        cfg = {'label': 'Species', 'items': [{'value': 'a'}, {'value': 'b'}], 'required': True}
        result = _summarize_form_element('select', cfg)
        assert 'Species' in result
        assert '2 items' in result
        assert '*' in result

    def test_select_with_file_items(self):
        cfg = {'label': 'Species', 'items': {'path': 'cats.csv', 'value': 'name'}}
        result = _summarize_form_element('select', cfg)
        assert 'file' in result

    def test_select_with_form_ref(self):
        cfg = {'label': 'Valid', 'items': [{'value': 'no', 'form': 'correction'}]}
        result = _summarize_form_element('select', cfg)
        assert 'correction' in result

    def test_textbox_multiline(self):
        result = _summarize_form_element('textbox', {'label': 'notes', 'multiline': True})
        assert 'multiline' in result

    def test_textbox_plain(self):
        result = _summarize_form_element('textbox', {'label': 'notes'})
        assert 'notes' in result
        assert 'multiline' not in result

    def test_checkbox_with_forms(self):
        cfg = {'label': 'ok', 'checked_form': 'yes_form', 'unchecked_form': 'no_form'}
        result = _summarize_form_element('checkbox', cfg)
        assert 'yes_form' in result
        assert 'no_form' in result

    def test_number_with_range(self):
        result = _summarize_form_element('number', {'label': 'count', 'min': 0, 'max': 10})
        assert '[0..10]' in result

    def test_number_no_range(self):
        result = _summarize_form_element('number', {'label': 'count'})
        assert '[' not in result

    def test_text_element(self):
        result = _summarize_form_element('text', {'value': 'Hello world'})
        assert result == 'Hello world'

    def test_break_returns_empty(self):
        assert _summarize_form_element('break', {}) == ''
        assert _summarize_form_element('line', {}) == ''

    def test_non_dict_config(self):
        assert _summarize_form_element('select', True) == ''
        assert _summarize_form_element('select', 'something') == 'something'

    def test_unknown_type_fallback(self):
        result = _summarize_form_element('custom', {'label': 'custom thing'})
        assert result == 'custom thing'


#
# _secrets_summary
#
class TestSecretsSummary:

    def test_false_secrets(self):
        assert _secrets_summary(False) == 'opted out'

    def test_list_secrets(self):
        result = _secrets_summary([{'key': 'A'}, {'key': 'B'}])
        assert 'A' in result
        assert 'B' in result

    def test_dict_secret(self):
        assert _secrets_summary({'key': 'TOKEN'}) == 'TOKEN'

    def test_none_secrets(self):
        assert _secrets_summary(None) == ''


#
# _get_referenced_forms
#
class TestGetReferencedForms:

    def test_select_items_with_form(self):
        cfg = {'items': [{'value': 'a'}, {'value': 'b', 'form': 'my_form'}]}
        assert _get_referenced_forms('select', cfg) == ['my_form']

    def test_checkbox_forms(self):
        cfg = {'checked_form': 'cf', 'unchecked_form': 'uf'}
        result = _get_referenced_forms('checkbox', cfg)
        assert 'cf' in result
        assert 'uf' in result

    def test_annotation_form(self):
        cfg = {'form': 'annot_form'}
        assert _get_referenced_forms('annotation', cfg) == ['annot_form']

    def test_no_references(self):
        assert _get_referenced_forms('textbox', {'label': 'x'}) == []


#
# _parse_dynamic_forms
#
class TestParseDynamicForms:

    def test_dict_format(self):
        fc = {'dynamic_forms': {'form_a': [{'select': {}}]}}
        result = _parse_dynamic_forms(fc)
        assert 'form_a' in result
        assert len(result['form_a']) == 1

    def test_list_format(self):
        fc = {'dynamic_forms': [{'form_b': [{'textbox': {}}]}]}
        result = _parse_dynamic_forms(fc)
        assert 'form_b' in result

    def test_empty(self):
        assert _parse_dynamic_forms({}) == {}

    def test_non_list_elements(self):
        fc = {'dynamic_forms': {'form_c': {'textbox': {'label': 'x'}}}}
        result = _parse_dynamic_forms(fc)
        assert isinstance(result['form_c'], list)


#
# build_summary — sync_uri coverage
#
class TestSyncUriSummary:

    def test_sync_uri_shown(self):
        merged = {'output': {'path': 'out.csv', 'uri': 's3://bucket/out.csv'}}
        sections = build_summary(project={}, config={}, form_config={}, merged=merged)
        output_rows = sections[3]['rows']
        assert any(r['key'] == 'sync uri' and 's3://' in r['value'] for r in output_rows)

    def test_sync_uri_absent_when_missing(self):
        merged = {'output': {'path': 'out.csv'}}
        sections = build_summary(project={}, config={}, form_config={}, merged=merged)
        output_rows = sections[3]['rows']
        assert not any(r['key'] == 'sync uri' for r in output_rows)


#
# build_summary — display_columns from top-level
#
class TestDisplayColumnsSummary:

    def test_top_level_display_columns(self):
        merged = {'display_columns': ['species', 'site']}
        sections = build_summary(project={}, config={}, form_config={}, merged=merged)
        data_rows = sections[1]['rows']
        assert any(r['key'] == 'columns' and 'species' in r['value'] for r in data_rows)

    def test_display_columns_absent_when_empty(self):
        merged = {'data': {'path': 'x.csv'}}
        sections = build_summary(project={}, config={}, form_config={}, merged=merged)
        data_rows = sections[1]['rows']
        assert not any(r['key'] == 'columns' for r in data_rows)


#
# _summarize_form_element — select with filter_box, custom_value, not_available
#
class TestSelectOptionsSummary:

    def test_select_with_filter_box(self):
        cfg = {
            'label': 'Species', 'column': 'sp',
            'items': [{'value': 'a'}], 'filter_box': True,
        }
        result = _summarize_form_element('select', cfg)
        assert 'Species' in result

    def test_select_with_custom_value(self):
        cfg = {
            'label': 'Species', 'column': 'sp',
            'items': [{'value': 'a'}], 'custom_value': True,
        }
        result = _summarize_form_element('select', cfg)
        assert 'Species' in result

    def test_select_with_not_available(self):
        cfg = {
            'label': 'Species', 'column': 'sp',
            'items': [{'value': 'a'}], 'not_available': True,
        }
        result = _summarize_form_element('select', cfg)
        assert 'Species' in result


#
# build_summary — annotation min_frequency / max_frequency fields
#
class TestAnnotationFrequencyFields:

    def test_min_frequency_in_annotation_summary(self):
        fc = {
            'annotation': {
                'tools': ['bounding_box'],
                'min_frequency': {'column': 'min_freq'},
                'max_frequency': {'column': 'max_freq'},
            },
        }
        sections = build_summary(project={}, config={}, form_config=fc, merged={})
        form_rows = sections[5]['rows']
        annot = next(r for r in form_rows if r['key'] == 'annotation')
        children = annot.get('children', [])
        assert any(
            r['key'] == 'min_frequency' and 'min_freq' in r['value']
            for r in children
        )
        assert any(
            r['key'] == 'max_frequency' and 'max_freq' in r['value']
            for r in children
        )


#
# _summarize_form_element — number with step
#
class TestNumberStepSummary:

    def test_number_with_min_max_step(self):
        result = _summarize_form_element(
            'number', {'label': 'count', 'min': 0, 'max': 100, 'step': 5},
        )
        assert 'count' in result
        assert '[0..100]' in result
