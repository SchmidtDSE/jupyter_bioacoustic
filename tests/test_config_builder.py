"""
Tests for config_builder/core.py

Unit tests for path utilities, YAML prep, config
get/merge, and validation.

License: BSD 3-Clause
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.config_builder.core import (
    _ensure_ext,
    _prep_for_yaml,
    _resolve_path,
    _LiteralStr,
    ConfigBuilder,
    SKIP_KEYS,
)


#
# _ensure_ext
#
class TestEnsureExt:

    def test_adds_yaml(self):
        assert _ensure_ext('config') == 'config.yaml'

    def test_keeps_yaml(self):
        assert _ensure_ext('config.yaml') == 'config.yaml'

    def test_keeps_yml(self):
        assert _ensure_ext('config.yml') == 'config.yml'

    def test_non_matching_ext_gets_appended(self):
        assert _ensure_ext('config.json') == 'config.json.yaml'

    def test_empty_string(self):
        assert _ensure_ext('') == '.yaml'


#
# _prep_for_yaml
#
class TestPrepForYaml:

    def test_plain_string_unchanged(self):
        result = _prep_for_yaml('hello')
        assert result == 'hello'
        assert not isinstance(result, _LiteralStr)

    def test_multiline_becomes_literal(self):
        result = _prep_for_yaml('line1\nline2')
        assert isinstance(result, _LiteralStr)
        assert result == 'line1\nline2'

    def test_nested_dict(self):
        result = _prep_for_yaml({'a': 'plain', 'b': 'has\nnewline'})
        assert not isinstance(result['a'], _LiteralStr)
        assert isinstance(result['b'], _LiteralStr)

    def test_list(self):
        result = _prep_for_yaml(['plain', 'has\nnewline'])
        assert not isinstance(result[0], _LiteralStr)
        assert isinstance(result[1], _LiteralStr)

    def test_non_string_passthrough(self):
        assert _prep_for_yaml(42) == 42
        assert _prep_for_yaml(True) is True
        assert _prep_for_yaml(None) is None


#
# ConfigBuilder.get_config / get_merged_config
#
class TestConfigBuilderGetConfig:

    def test_get_project(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'Test'}
        result = cb.get_config('project')
        assert result['project_name'] == 'Test'

    def test_get_config(self):
        cb = ConfigBuilder()
        cb._config = {'info_card_title': '[[species]]'}
        result = cb.get_config('config')
        assert result['info_card_title'] == '[[species]]'

    def test_get_form_config(self):
        cb = ConfigBuilder()
        cb._form_config = {'select': {'label': 'x'}}
        result = cb.get_config('form_config')
        assert 'select' in result

    def test_get_unknown_returns_empty(self):
        cb = ConfigBuilder()
        assert cb.get_config('nonexistent') == {}

    def test_merged_config(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'Test'}
        cb._config = {'info_card_title': '[[species]]'}
        cb._form_config = {'select': {'label': 'x'}}
        merged = cb.get_merged_config()
        assert merged['project_name'] == 'Test'
        assert merged['info_card_title'] == '[[species]]'
        assert 'select' in merged['form_config']

    def test_project_includes_form_config(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P'}
        cb._form_config = {'title': 'T'}
        result = cb.get_config('project')
        assert result['form_config'] == {'title': 'T'}


#
# ConfigBuilder.validate
#
class TestConfigBuilderValidate:

    def test_empty_is_valid(self):
        cb = ConfigBuilder()
        result = cb.validate()
        assert result['valid'] is True

    def test_valid_form_keys(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'title': 'Test',
            'select': {'label': 'x', 'column': 'x', 'items': ['a']},
            'submission_buttons': {'submit': True},
        }
        result = cb.validate()
        assert result['valid'] is True
        assert len(result['errors']) == 0

    def test_invalid_form_key(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'bogus_element': {'label': 'x'},
        }
        result = cb.validate()
        assert len(result['errors']) > 0 or len(result['warnings']) > 0

    def test_invalid_config_key(self):
        cb = ConfigBuilder()
        cb._config = {'totally_fake_key': 'x'}
        result = cb.validate()
        assert any('Unknown config key' in e for e in result['errors'])

    def test_invalid_project_key(self):
        cb = ConfigBuilder()
        cb._project = {'nonexistent_param': 42}
        result = cb.validate()
        assert any('Unknown project key' in e for e in result['errors'])

    def test_skip_keys_not_flagged(self):
        cb = ConfigBuilder()
        cb._project = {k: 'val' for k in list(SKIP_KEYS)[:3]}
        result = cb.validate()
        assert result['valid'] is True

    def test_dynamic_form_missing_reference(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'select': {
                'label': 'Species',
                'column': 'species',
                'items': [{'value': 'a', 'form': 'detail_form'}],
            },
        }
        result = cb.validate()
        assert any('detail_form' in e for e in result['errors'])

    def test_dynamic_form_unreferenced_warning(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'dynamic_forms': {'orphan_form': []},
        }
        result = cb.validate()
        assert any('orphan_form' in w for w in result['warnings'])

    def test_valid_annotation_tools(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {
                'start_time': 'start_time',
                'end_time': 'end_time',
                'min_frequency': 'min_freq',
                'max_frequency': 'max_freq',
                'tools': ['time_select', 'start_end_time_select', 'multibox'],
            },
        }
        result = cb.validate()
        assert result['valid'] is True

    def test_invalid_annotation_tool_top_level(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {
                'tools': ['time_marker', 'start_end_time'],
            },
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('time_marker' in e for e in result['errors'])
        assert any('start_end_time' in e for e in result['errors'])

    def test_invalid_annotation_tool_in_form_list(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'form': [
                {'annotation': {'tools': ['bounding_box', 'bad_tool']}},
            ],
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('bad_tool' in e for e in result['errors'])

    def test_annotation_tool_string_validated(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {'tools': 'wrong_tool'},
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('wrong_tool' in e for e in result['errors'])


#
# _resolve_path
#
class TestResolvePath:

    def test_absolute_exists(self, tmp_path):
        p = tmp_path / 'config.yaml'
        p.write_text('test')
        result = _resolve_path(str(p), '/other/dir')
        assert result == str(p)

    def test_absolute_missing(self):
        result = _resolve_path('/nonexistent/config.yaml', '/base')
        assert result is None

    def test_relative_in_base_dir(self, tmp_path):
        p = tmp_path / 'config.yaml'
        p.write_text('test')
        result = _resolve_path('config.yaml', str(tmp_path))
        assert result == str(p)

    def test_relative_not_found(self, tmp_path):
        result = _resolve_path('missing.yaml', str(tmp_path))
        assert result is None


#
# ConfigBuilder.update_section
#
class TestUpdateSection:

    def test_update_project_section(self):
        cb = ConfigBuilder()
        cb.update_section('project', {'project_name': 'Test', 'project_path': 'p.yaml'})
        assert cb._project['project_name'] == 'Test'
        assert cb._project['project_path'] == 'p.yaml'

    def test_update_data_split(self):
        cb = ConfigBuilder()
        cb._section_targets['data'] = 'split'
        cb.update_section('data', {'path': 'data.csv', 'start_time': 'begin'})
        assert cb._project['data'] == {'path': 'data.csv'}
        assert cb._config['data'] == {'start_time': 'begin'}

    def test_update_app_display_columns(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {'display_columns': ['a', 'b']})
        assert cb._config.get('display_columns') == ['a', 'b']

    def test_update_form(self):
        cb = ConfigBuilder()
        form = {'title': 'Test', 'select': {'label': 'x'}}
        cb.update_section('form', form)
        assert cb._form_config == form

    def test_update_app_to_config(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {'info_card_title': '[[species]]', 'width': 800})
        assert cb._config['info_card_title'] == '[[species]]'
        assert cb._config['width'] == 800

    def test_sets_dirty_flag(self):
        cb = ConfigBuilder()
        assert cb._dirty is False
        cb.update_section('form', {'title': 'T'})
        assert cb._dirty is True

    def test_empty_values_removed(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'project'
        cb.update_section('app', {'info_card_title': '[[species]]', 'width': ''})
        assert 'width' not in cb._project


#
# ConfigBuilder._build_file_contents
#
class TestBuildFileContents:

    def test_default_paths(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'My Test'}
        fc = cb._build_file_contents()
        assert 'my_test' in fc['p_path']
        assert 'my_test' in fc['c_path']
        assert 'my_test' in fc['f_path']

    def test_custom_paths(self):
        cb = ConfigBuilder()
        cb._project = {
            'project_name': 'P',
            'project_path': 'custom/proj.yaml',
            'config_path': 'custom/conf.yaml',
            'form_path': 'custom/form.yaml',
        }
        fc = cb._build_file_contents()
        assert fc['p_path'] == 'custom/proj.yaml'
        assert fc['c_path'] == 'custom/conf.yaml'
        assert fc['f_path'] == 'custom/form.yaml'

    def test_config_disabled(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P', 'config_enabled': False}
        cb._config = {'info_card_title': '[[species]]'}
        fc = cb._build_file_contents()
        assert fc['config_enabled'] is False
        assert 'info_card_title' in fc['project_cfg']

    def test_form_in_separate_file(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P', 'form_enabled': True, 'config_enabled': True}
        cb._form_config = {'title': 'T'}
        fc = cb._build_file_contents()
        assert fc['form_enabled'] is True
        assert fc['form_cfg'] == {'title': 'T'}


#
# ConfigBuilder.update_config_from_yaml
#
class TestUpdateConfigFromYaml:

    def test_update_project_yaml(self):
        cb = ConfigBuilder()
        yaml_str = "project_name: Updated\ninfo_card_title: '[[species]]'\n"
        result = cb.update_config_from_yaml(yaml_str, 'project')
        assert result is True
        assert cb._project['project_name'] == 'Updated'
        assert cb._project['info_card_title'] == '[[species]]'

    def test_update_form_yaml(self):
        cb = ConfigBuilder()
        yaml_str = "title: My Form\nselect:\n  label: Species\n"
        result = cb.update_config_from_yaml(yaml_str, 'form_config')
        assert result is True
        assert cb._form_config['title'] == 'My Form'

    def test_invalid_yaml_returns_false(self):
        cb = ConfigBuilder()
        result = cb.update_config_from_yaml('{{invalid: yaml: [', 'project')
        assert result is False

    def test_config_ref_extracted(self):
        cb = ConfigBuilder()
        yaml_str = "project_name: P\nconfig: path/to/config.yaml\n"
        cb.update_config_from_yaml(yaml_str, 'project')
        assert cb._project['config_path'] == 'path/to/config.yaml'


#
# ConfigBuilder.list_files
#
class TestListFiles:

    def test_lists_files(self, tmp_path):
        (tmp_path / 'a.yaml').write_text('test')
        (tmp_path / 'b.json').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        names = [r['name'] for r in result]
        assert 'a.yaml' in names
        assert 'b.json' in names

    def test_extension_filter(self, tmp_path):
        (tmp_path / 'a.yaml').write_text('test')
        (tmp_path / 'b.json').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path), extensions=['.yaml'])
        names = [r['name'] for r in result]
        assert 'a.yaml' in names
        assert 'b.json' not in names

    def test_hides_dotfiles(self, tmp_path):
        (tmp_path / '.hidden').write_text('test')
        (tmp_path / 'visible.yaml').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        names = [r['name'] for r in result]
        assert '.hidden' not in names
        assert 'visible.yaml' in names

    def test_missing_dir_returns_empty(self):
        cb = ConfigBuilder()
        result = cb.list_files('/nonexistent/path/12345')
        assert result == []

    def test_marks_directories(self, tmp_path):
        (tmp_path / 'subdir').mkdir()
        (tmp_path / 'file.txt').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        by_name = {r['name']: r for r in result}
        assert by_name['subdir']['is_dir'] is True
        assert by_name['file.txt']['is_dir'] is False
