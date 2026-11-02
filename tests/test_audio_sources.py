"""
Test Audio Sources

Tests for jupyter_bioacoustic/_audio_sources.py: resolving the audio path
through an SQL query or an API response.

License: BSD 3-Clause
"""
import types

import pandas as pd
import pytest

from jupyter_bioacoustic import _audio_sources as aus


#
# resolve_audio_from_source
#
class TestResolveAudioFromSource:

    def test_property_required(self):
        with pytest.raises(ValueError, match="'property' is required"):
            aus.resolve_audio_from_source('sql', 'SELECT 1', None, None, None)

    def test_sql_adds_limit_and_picks_row(self, monkeypatch):
        seen = {}

        def fake_sql(query, secrets=None):
            seen['query'] = query
            return pd.DataFrame({'p': ['a.wav', 'b.wav']})
        monkeypatch.setattr(aus, 'read_data_from_sql', fake_sql)
        assert aus.resolve_audio_from_source('sql', 'SELECT p FROM t;', 'p', 2, None) == 'b.wav'
        assert seen['query'] == 'SELECT p FROM t LIMIT 2'

    def test_api_unwraps_records(self, monkeypatch):
        import requests
        resp = types.SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {'results': [{'p': 'x.flac'}, {'p': 'y.flac'}]},
        )
        monkeypatch.setattr(requests, 'get', lambda *a, **k: resp)
        assert aus.resolve_audio_from_source('api', 'https://x', 'p', 2, None) == 'y.flac'

    def test_api_too_few_items(self, monkeypatch):
        import requests
        resp = types.SimpleNamespace(raise_for_status=lambda: None, json=lambda: [{'p': 1}])
        monkeypatch.setattr(requests, 'get', lambda *a, **k: resp)
        with pytest.raises(ValueError, match='API returned 1 items'):
            aus.resolve_audio_from_source('api', 'https://x', 'p', 3, None)

    def test_unknown_source_type(self):
        with pytest.raises(ValueError, match='Unknown audio source type'):
            aus.resolve_audio_from_source('ftp', 'x', 'p', None, None)


#
# resolve_audio_config dict lookups
#
def test_resolve_audio_config_sql_lookup(monkeypatch):
    monkeypatch.setattr(
        aus, 'read_data_from_sql',
        lambda query, secrets=None: pd.DataFrame({'p': ['s3://b/k.flac']}),
    )
    cfg = aus.resolve_audio_config(
        {'sql': 'SELECT p FROM t', 'property': 'p', 'prefix': 'pre'}, '', '', '',
    )
    assert cfg['type'] == 'url'
    assert cfg['value'] == 's3://b/k.flac'
    assert cfg['prefix'] == 'pre'
