"""
Tests for api.py

Pure-logic unit tests for data type detection, secret
resolution, and file reading.

License: BSD 3-Clause
"""
import os
import json
import struct
import tempfile

import numpy as np
import pandas as pd
import pytest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.api import (
    BioacousticAnnotator,
    _detect_data_type,
    _detect_audio_type,
    _resolve_secrets,
    _read_data,
    _merge_project_over_config,
)


#
# _detect_data_type
#
class TestDetectDataType:

    def test_sql_select(self):
        assert _detect_data_type("SELECT * FROM t") == 'sql'

    def test_sql_case_insensitive(self):
        assert _detect_data_type("select col from t") == 'sql'

    def test_sql_with_prefix(self):
        assert _detect_data_type("  SELECT id FROM t WHERE x > 1") == 'sql'

    def test_api_prefix(self):
        assert _detect_data_type("api::https://example.com/data") == 'api'

    def test_api_case_insensitive(self):
        assert _detect_data_type("API::https://example.com") == 'api'

    def test_url_https(self):
        assert _detect_data_type("https://example.com/data.csv") == 'url'

    def test_url_http(self):
        assert _detect_data_type("http://example.com/data.csv") == 'url'

    def test_url_s3(self):
        assert _detect_data_type("s3://bucket/key.csv") == 'url'

    def test_url_gs(self):
        assert _detect_data_type("gs://bucket/key.csv") == 'url'

    def test_path_simple(self):
        assert _detect_data_type("detections.csv") == 'path'

    def test_path_relative(self):
        assert _detect_data_type("./data/detections.parquet") == 'path'

    def test_path_absolute(self):
        assert _detect_data_type("/home/user/data.csv") == 'path'


#
# _resolve_secrets
#
class TestResolveSecrets:

    def test_none_returns_empty(self):
        assert _resolve_secrets(None) == {}

    def test_literal_value(self):
        result = _resolve_secrets({'key': 'Authorization', 'value': 'Bearer tok'})
        assert result == {'Authorization': 'Bearer tok'}

    def test_list_of_dicts(self):
        result = _resolve_secrets([
            {'key': 'k1', 'value': 'v1'},
            {'key': 'k2', 'value': 'v2'},
        ])
        assert result == {'k1': 'v1', 'k2': 'v2'}

    def test_env_resolution(self, monkeypatch):
        monkeypatch.setenv('JBA_TEST_SECRET', 'secret_val')
        result = _resolve_secrets({'key': 'tok', 'value': 'env:JBA_TEST_SECRET'})
        assert result == {'tok': 'secret_val'}

    def test_env_missing_raises(self, monkeypatch):
        monkeypatch.delenv('JBA_NONEXISTENT_VAR_12345', raising=False)
        with pytest.raises(ValueError, match='not set'):
            _resolve_secrets({'key': 'k', 'value': 'env:JBA_NONEXISTENT_VAR_12345'})


#
# _read_data
#
class TestReadData:

    def test_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        pd.DataFrame({'a': [1, 2], 'b': [3, 4]}).to_csv(p, index=False)
        df = _read_data(str(p))
        assert list(df.columns) == ['a', 'b']
        assert len(df) == 2

    def test_json(self, tmp_path):
        p = tmp_path / "data.json"
        pd.DataFrame({'x': [10]}).to_json(p)
        df = _read_data(str(p))
        assert 'x' in df.columns

    def test_jsonl(self, tmp_path):
        p = tmp_path / "data.jsonl"
        pd.DataFrame({'x': [1, 2]}).to_json(p, orient='records', lines=True)
        df = _read_data(str(p))
        assert len(df) == 2

    def test_unsupported_extension(self, tmp_path):
        p = tmp_path / "data.xyz"
        p.write_text("hello")
        with pytest.raises(ValueError, match='Unsupported'):
            _read_data(str(p))


#
# _detect_audio_type
#
class TestDetectAudioType:

    def test_https_url(self):
        assert _detect_audio_type('https://example.com/audio.flac') == 'url'

    def test_s3_url(self):
        assert _detect_audio_type('s3://bucket/audio.flac') == 'url'

    def test_gs_url(self):
        assert _detect_audio_type('gs://bucket/audio.flac') == 'url'

    def test_column_name(self):
        assert _detect_audio_type('audio_path') == 'column'

    def test_path_with_slash(self):
        assert _detect_audio_type('data/audio.flac') == 'path'

    def test_path_with_dot(self):
        assert _detect_audio_type('audio.flac') == 'path'


#
# _merge_project_over_config
#
class TestMergeProjectOverConfig:

    def test_simple_override(self):
        base = {'ident_column': 'species', 'width': 800}
        proj = {'width': 1200}
        _merge_project_over_config(base, proj)
        assert base['width'] == 1200
        assert base['ident_column'] == 'species'

    def test_dict_merge_data(self):
        base = {'data': {'path': 'old.csv', 'columns': ['a']}}
        proj = {'data': {'path': 'new.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'new.csv'
        assert base['data']['columns'] == ['a']

    def test_dict_merge_replaces_source_keys(self):
        base = {'data': {'url': 'https://old.com/data.csv', 'columns': ['a']}}
        proj = {'data': {'path': 'local.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'local.csv'
        assert 'url' not in base['data']

    def test_audio_merge_replaces_source_keys(self):
        base = {'audio': {'src': 'old_col', 'prefix': '/audio/'}}
        proj = {'audio': {'path': '/new/path'}}
        _merge_project_over_config(base, proj)
        assert base['audio']['path'] == '/new/path'
        assert 'src' not in base['audio']
        assert base['audio']['prefix'] == '/audio/'

    def test_non_merge_key_replaced(self):
        base = {'capture': True}
        proj = {'capture': False}
        _merge_project_over_config(base, proj)
        assert base['capture'] is False

    def test_new_key_added(self):
        base = {'ident_column': 'species'}
        proj = {'default_buffer': 5}
        _merge_project_over_config(base, proj)
        assert base['default_buffer'] == 5


#
# BioacousticAnnotator.config
#
def _make_df():
    """Create a minimal DataFrame for annotator tests."""
    return pd.DataFrame({
        'start_time': [0.0, 1.0],
        'end_time': [1.0, 2.0],
        'audio_path': ['a.wav', 'b.wav'],
    })


class TestAnnotatorConfig:

    def test_config_returns_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
        )
        assert isinstance(ba.config, dict)

    def test_config_is_copy(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
        )
        cfg = ba.config
        cfg['injected'] = True
        assert 'injected' not in ba.config

    def test_config_from_inline_args(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            ident_column='audio_path',
        )
        assert ba.config == {}

    def test_config_from_config_file(self, tmp_path):
        import yaml
        cfg_data = {
            'audio': {'column': 'audio_path'},
            'ident_column': 'audio_path',
            'default_buffer': 5,
        }
        cfg_file = tmp_path / 'config.yaml'
        cfg_file.write_text(yaml.dump(cfg_data))

        data_file = tmp_path / 'data.csv'
        _make_df().to_csv(data_file, index=False)

        ba = BioacousticAnnotator(
            data=str(data_file), audio='audio_path',
            config=str(cfg_file),
        )
        assert ba.config['ident_column'] == 'audio_path'
        assert ba.config['default_buffer'] == 5
        assert ba.config['audio'] == {'column': 'audio_path'}

    def test_config_from_project_with_nested(self, tmp_path):
        import yaml
        nested_cfg = {
            'audio': {'column': 'audio_path'},
            'ident_column': 'audio_path',
            'default_buffer': 5,
        }
        nested_file = tmp_path / 'base.yaml'
        nested_file.write_text(yaml.dump(nested_cfg))

        data_file = tmp_path / 'data.csv'
        _make_df().to_csv(data_file, index=False)

        proj_cfg = {
            'config': str(nested_file),
            'data': {'path': str(data_file)},
            'output': {'path': 'out.csv'},
            'default_buffer': 10,
        }
        proj_file = tmp_path / 'project.yaml'
        proj_file.write_text(yaml.dump(proj_cfg))

        ba = BioacousticAnnotator(project=str(proj_file))
        cfg = ba.config
        assert cfg['audio'] == {'column': 'audio_path'}
        assert cfg['ident_column'] == 'audio_path'
        assert cfg['default_buffer'] == 10
        assert cfg['data']['path'] == str(data_file)
