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
        result = validate_config(config={'data': 'x', 'data_index_column': 'id'})
        assert result['valid']

    def test_session_args_is_valid_key(self):
        result = validate_config(config={'session_args': True, 'data_index_column': 'id'})
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
            'start_time': {'column': 'start'},
            'end_time': {'column': 'end'},
            'min_frequency': {'column': 'min_freq'},
            'max_frequency': {'column': 'max_freq'},
        }}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_annotation_max_frequency_field(self):
        fc = {'annotation': {
            'tools': ['bounding_box'],
            'start_time': {'column': 'start'},
            'end_time': {'column': 'end'},
            'min_frequency': {'column': 'min_freq'},
            'max_frequency': {'column': 'max_freq'},
        }}
        result = validate_config(form_config=fc)
        assert result['valid']

    def test_annotation_requires_tools(self):
        """Test that annotation config must have at least one tool."""
        fc = {'annotation': {}}
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('at least one tool' in e for e in result['errors'])

    def test_annotation_empty_tools_list(self):
        """Test that empty tools list is invalid."""
        fc = {'annotation': {'tools': []}}
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('at least one tool' in e for e in result['errors'])

    def test_annotation_field_validation_missing_required(self):
        """Test validation errors for missing required fields."""
        # bounding_box missing min/max frequency
        fc = {
            'annotation': {
                'tools': ['bounding_box'],
                'start_time': {'column': 'start'},
                'end_time': {'column': 'end'}
            }
        }
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('min_frequency' in e for e in result['errors'])
        assert any('max_frequency' in e for e in result['errors'])

    def test_annotation_field_validation_extra_fields(self):
        """Test validation warnings for unnecessary fields."""
        # time_select with extra end_time field
        fc = {
            'annotation': {
                'tools': ['time_select'],
                'start_time': {'column': 'start'},
                'end_time': {'column': 'end'}
            }
        }
        result = validate_config(form_config=fc)
        assert result['valid']  # Should be valid but with warnings
        assert any('not required' in w for w in result['warnings'])

    def test_annotation_field_validation_complete_config(self):
        """Test that properly configured annotation tools validate successfully."""
        fc = {
            'annotation': {
                'tools': ['multibox'],
                'start_time': {'column': 'start'},
                'end_time': {'column': 'end'},
                'min_frequency': {'column': 'min_freq'},
                'max_frequency': {'column': 'max_freq'}
            }
        }
        result = validate_config(form_config=fc)
        assert result['valid']
        assert len(result['errors']) == 0

    def test_annotation_field_validation_time_select_minimal(self):
        """Test that time_select with only start_time is valid."""
        fc = {
            'annotation': {
                'tools': ['time_select'],
                'start_time': {'column': 'start'}
            }
        }
        result = validate_config(form_config=fc)
        assert result['valid']
        assert len(result['errors']) == 0
        assert len(result['warnings']) == 0

    def test_annotation_field_validation_fixed_duration_missing_end(self):
        """Test that fixed_duration missing end_time generates error."""
        fc = {
            'annotation': {
                'tools': ['fixed_duration'],
                'start_time': {'column': 'start'}
            }
        }
        result = validate_config(form_config=fc)
        assert not result['valid']
        assert any('end_time' in e for e in result['errors'])

    def test_annotation_field_validation_mixed_tools(self):
        """Test field validation with multiple tools requiring different fields."""
        fc = {
            'annotation': {
                'tools': ['time_select', 'bounding_box'],
                'start_time': {'column': 'start'},
                'end_time': {'column': 'end'},
                'min_frequency': {'column': 'min_freq'},
                'max_frequency': {'column': 'max_freq'}
            }
        }
        result = validate_config(form_config=fc)
        assert result['valid']
        assert len(result['errors']) == 0


#
# config key validation — height and layout params
#
class TestConfigKeyHeights:
    """Verify all height/layout config keys are accepted."""

    def test_clip_table_height_valid(self):
        result = validate_config(config={'clip_table_height': 200, 'data_index_column': 'id'})
        assert result['valid']

    def test_player_height_valid(self):
        result = validate_config(config={'player_height': 400, 'data_index_column': 'id'})
        assert result['valid']

    def test_info_card_height_valid(self):
        result = validate_config(config={'info_card_height': 50, 'data_index_column': 'id'})
        assert result['valid']

    def test_form_panel_height_valid(self):
        result = validate_config(config={'form_panel_height': 180, 'data_index_column': 'id'})
        assert result['valid']

    def test_capture_height_valid(self):
        result = validate_config(config={'capture_height': 300, 'data_index_column': 'id'})
        assert result['valid']

    def test_display_columns_valid(self):
        result = validate_config(config={'display_columns': ['a', 'b'], 'data_index_column': 'id'})
        assert result['valid']

    def test_description_keys_valid(self):
        result = validate_config(config={
            'description_title': 'My Title',
            'description_text': 'Some text',
            'description_path': 'desc.md',
            'description_open': True,
            'description_height': 200,
            'data_index_column': 'id',
        })
        assert result['valid']

    def test_data_index_column_valid(self):
        result = validate_config(config={'data_index_column': 'id'})
        assert result['valid']

    def test_output_index_column_valid(self):
        result = validate_config(config={
            'output_index_column': 'review_id',
            'data_index_column': 'id',
        })
        assert result['valid']


#
# required field validation
#
class TestRequiredFields:
    """Tests for required field validation."""

    def test_missing_data_index_column_no_form_ok(self):
        """Player-only (no form): data_index_column is not required."""
        result = validate_config(config={'data': 'x'})
        assert result['valid']
        assert not any('data_index_column' in e for e in result['errors'])

    def test_missing_data_index_column_with_form_config_error(self):
        """A form_config makes data_index_column required."""
        result = validate_config(
            config={'data': 'x'},
            form_config={'form': [{'select': {'label': 'a', 'column': 'a'}}]},
        )
        assert not result['valid']
        assert any('data_index_column' in e for e in result['errors'])

    def test_missing_data_index_column_with_config_form_key_error(self):
        """A top-level 'form' key in config makes the index required."""
        result = validate_config(
            config={'data': 'x', 'form': [{'select': {'label': 'a'}}]},
        )
        assert not result['valid']
        assert any('data_index_column' in e for e in result['errors'])

    def test_missing_data_index_column_with_config_form_config_key_error(self):
        """A 'form_config' reference in config makes the index required."""
        result = validate_config(
            config={'data': 'x', 'form_config': 'forms/x.yaml'},
        )
        assert not result['valid']
        assert any('data_index_column' in e for e in result['errors'])

    def test_missing_data_index_column_with_project_form_error(self):
        """A form in the project makes the index required."""
        result = validate_config(
            project={'data': 'x', 'form_config': 'forms/x.yaml'},
        )
        assert not result['valid']
        assert any('data_index_column' in e for e in result['errors'])

    def test_data_index_column_top_level(self):
        result = validate_config(config={'data_index_column': 'id'})
        assert result['valid']

    def test_data_index_column_in_data_dict(self):
        result = validate_config(
            config={'data': {'path': 'x', 'index_column': 'id'}},
        )
        assert result['valid']

    def test_data_index_column_in_project(self):
        result = validate_config(
            project={'data_index_column': 'id'},
        )
        assert result['valid']

    def test_data_index_column_in_project_data_dict(self):
        result = validate_config(
            project={'data': {'path': 'x', 'index_column': 'id'}},
        )
        assert result['valid']

    def test_form_only_skips_required_check(self):
        """Form-only validation should not require data_index_column."""
        result = validate_config(form_config={'title': 'Test'})
        assert result['valid']

    def test_output_index_column_warning_when_missing(self):
        result = validate_config(config={'data_index_column': 'id'})
        assert result['valid']
        assert any('output_index_column' in w for w in result['warnings'])
        assert any('"id"' in w for w in result['warnings'])

    def test_output_index_column_no_warning_when_set(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output_index_column': 'review_id',
        })
        assert result['valid']
        assert not any('output_index_column' in w for w in result['warnings'])

    def test_output_index_column_no_warning_in_output_dict(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output': {'index_column': 'review_id'},
        })
        assert result['valid']
        assert not any('output_index_column' in w for w in result['warnings'])

    def test_output_index_column_no_warning_in_project(self):
        result = validate_config(
            project={'data_index_column': 'id', 'output_index_column': 'rid'},
        )
        assert result['valid']
        assert not any('output_index_column' in w for w in result['warnings'])


#
# sync button validation
#
class TestSyncButton:
    """Tests for sync_button-requires-uri validation."""

    def test_sync_button_without_uri_error_nested(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output': {'sync_button': 'Sync'},
        })
        assert not result['valid']
        assert any('sync' in e.lower() for e in result['errors'])

    def test_sync_button_without_uri_error_flat(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output_sync_button': True,
        })
        assert not result['valid']
        assert any('sync' in e.lower() for e in result['errors'])

    def test_sync_button_with_uri_ok_nested(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output': {'sync_button': 'Sync', 'uri': 's3://bucket/out.csv'},
        })
        assert result['valid']

    def test_sync_button_with_url_ok_nested(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output': {'sync_button': True, 'url': 's3://bucket/out.csv'},
        })
        assert result['valid']

    def test_sync_button_with_uri_ok_flat(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output_sync_button': True,
            'output_uri': 's3://bucket/out.csv',
        })
        assert result['valid']

    def test_sync_button_uri_split_across_config_and_project(self):
        """sync_button in config, uri in project — still valid."""
        result = validate_config(
            config={'data_index_column': 'id', 'output_sync_button': True},
            project={'output_uri': 's3://bucket/out.csv'},
        )
        assert result['valid']

    def test_no_sync_button_no_error(self):
        result = validate_config(config={
            'data_index_column': 'id',
            'output': {'path': 'out.csv'},
        })
        assert result['valid']
