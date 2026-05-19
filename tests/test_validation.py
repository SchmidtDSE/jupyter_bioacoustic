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
