"""
Validation Tests

Tests for the shared _validation module and session_args filtering.

License: BSD 3-Clause
"""
import pytest

from jupyter_bioacoustic._validation import validate_config
from jupyter_bioacoustic.api import _filter_session_args


#
# _filter_session_args
#
class TestFilterSessionArgs:
    """Tests for session_args filtering logic."""

    def test_no_policy_allows_all(self):
        kwargs = {'reviewer': 'alice', 'site': 'north'}
        filtered, stripped = _filter_session_args(None, kwargs)
        assert filtered == kwargs
        assert stripped == []

    def test_true_allows_all(self):
        kwargs = {'reviewer': 'alice'}
        filtered, stripped = _filter_session_args(True, kwargs)
        assert filtered == kwargs
        assert stripped == []

    def test_star_allows_all(self):
        kwargs = {'reviewer': 'alice'}
        filtered, stripped = _filter_session_args('*', kwargs)
        assert filtered == kwargs
        assert stripped == []

    def test_false_strips_all(self):
        kwargs = {'reviewer': 'alice', 'site': 'north'}
        filtered, stripped = _filter_session_args(False, kwargs)
        assert filtered == {}
        assert stripped == ['reviewer', 'site']

    def test_false_empty_kwargs_ok(self):
        filtered, stripped = _filter_session_args(False, {})
        assert filtered == {}
        assert stripped == []

    def test_list_allows_listed(self):
        kwargs = {'reviewer': 'alice', 'site': 'north'}
        filtered, stripped = _filter_session_args(
            ['reviewer', 'site'], kwargs,
        )
        assert filtered == kwargs
        assert stripped == []

    def test_list_strips_unlisted(self):
        kwargs = {'reviewer': 'alice', 'age': 30, 'site': 'north'}
        filtered, stripped = _filter_session_args(
            ['reviewer', 'site'], kwargs,
        )
        assert filtered == {'reviewer': 'alice', 'site': 'north'}
        assert stripped == ['age']

    def test_list_empty_kwargs_ok(self):
        filtered, stripped = _filter_session_args(['reviewer'], {})
        assert filtered == {}
        assert stripped == []

    def test_invalid_policy_passes_through(self):
        kwargs = {'reviewer': 'alice'}
        filtered, stripped = _filter_session_args(42, kwargs)
        assert filtered == kwargs
        assert stripped == []


#
# config key validation
#
class TestConfigKeys:
    """Tests for unknown config key detection."""

    def test_unknown_config_key(self):
        result = validate_config(config={'bogus_key': 'x'})
        assert not result['valid']
        assert any('bogus_key' in e for e in result['errors'])

    def test_valid_config_key(self):
        result = validate_config(config={'data': 'x'})
        assert result['valid']

    def test_session_args_is_valid_key(self):
        result = validate_config(config={'session_args': True})
        assert result['valid']


#
# annotation tool validation
#
class TestAnnotationTools:
    """Tests for annotation tool validation including fixed_duration."""

    def test_valid_string_tool(self):
        fc = {'annotation': {'tools': ['time_select']}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_unknown_string_tool(self):
        fc = {'annotation': {'tools': ['bogus_tool']}}
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('bogus_tool' in e for e in result['errors'])

    def test_fixed_duration_as_string(self):
        fc = {'annotation': {'tools': ['fixed_duration']}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_fixed_duration_as_dict(self):
        fc = {'annotation': {'tools': [{'fixed_duration': {'window': 3}}]}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_dict_tool_unknown_key(self):
        fc = {'annotation': {'tools': [{'bogus_tool': 3}]}}
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('bogus_tool' in e for e in result['errors'])

    def test_mixed_string_and_dict_tools(self):
        fc = {'annotation': {'tools': ['bounding_box', {'fixed_duration': 3}]}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_fixed_duration_initial_window(self):
        fc = {'annotation': {'tools': [{'fixed_duration': {'initial_window': 3}}]}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_fixed_duration_window_and_initial_window_error(self):
        fc = {'annotation': {'tools': [
            {'fixed_duration': {'window': 3, 'initial_window': 5}},
        ]}}
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('not both' in e for e in result['errors'])

    def test_fixed_duration_step(self):
        fc = {'annotation': {'tools': [
            {'fixed_duration': {'initial_window': 3, 'step': 0.5}},
        ]}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_fixed_duration_min_max(self):
        fc = {'annotation': {'tools': [
            {'fixed_duration': {'initial_window': 3, 'min': 1, 'max': 10}},
        ]}}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_annotation_min_frequency_field(self):
        fc = {'annotation': {
            'tools': ['bounding_box'],
            'min_frequency': {'column': 'min_freq'},
        }}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_annotation_max_frequency_field(self):
        fc = {'annotation': {
            'tools': ['bounding_box'],
            'max_frequency': {'column': 'max_freq'},
        }}
        result = validate_config(form_config=fc)
        assert result['valid']


#
# config key validation — height and layout params
#
class TestConfigKeyHeights:
    """Verify all height/layout config keys are accepted."""

    def test_clip_table_height_valid(self):
        result = validate_config(config={'clip_table_height': 200})
        assert result['valid']

    def test_player_height_valid(self):
        result = validate_config(config={'player_height': 400})
        assert result['valid']

    def test_info_card_height_valid(self):
        result = validate_config(config={'info_card_height': 50})
        assert result['valid']

    def test_form_panel_height_valid(self):
        result = validate_config(config={'form_panel_height': 180})
        assert result['valid']

    def test_capture_height_valid(self):
        result = validate_config(config={'capture_height': 300})
        assert result['valid']

    def test_display_columns_valid(self):
        result = validate_config(config={'display_columns': ['a', 'b']})
        assert result['valid']

    def test_description_keys_valid(self):
        result = validate_config(config={
            'description_title': 'My Title',
            'description_text': 'Some text',
            'description_path': 'desc.md',
            'description_open': True,
            'description_height': 200,
        })
        assert result['valid']
