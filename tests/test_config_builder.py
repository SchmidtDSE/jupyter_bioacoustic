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
    _LiteralStr,
    ConfigBuilder,
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
        cb._config = {'ident_column': 'species'}
        result = cb.get_config('config')
        assert result['ident_column'] == 'species'

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
        cb._config = {'ident_column': 'species'}
        cb._form_config = {'select': {'label': 'x'}}
        merged = cb.get_merged_config()
        assert merged['project_name'] == 'Test'
        assert merged['ident_column'] == 'species'
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
