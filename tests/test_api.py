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
    _detect_data_type,
    _resolve_secrets,
    _read_data,
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
