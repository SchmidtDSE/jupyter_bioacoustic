"""
Test Data Sources

Tests for the helpers in jupyter_bioacoustic/_data_sources.py that are not
covered through the api.py re-exports in test_api.py.

License: BSD 3-Clause
"""
import pandas as pd
import pytest

from jupyter_bioacoustic import _data_sources as ds


#
# check_source_keys
#
class TestCheckSourceKeys:

    def test_value_only(self):
        assert ds.check_source_keys({'value': 'x.csv'}, {'path', 'url'}, 'data') == (True, [])

    def test_one_explicit_key(self):
        assert ds.check_source_keys({'path': 'x.csv'}, {'path', 'url'}, 'data') == (False, ['path'])

    def test_value_and_explicit_key_raises(self):
        with pytest.raises(ValueError, match="data dict: use either 'value'"):
            ds.check_source_keys({'value': 'a', 'path': 'b'}, {'path'}, 'data')

    def test_no_source_raises(self):
        with pytest.raises(ValueError, match="audio dict must have exactly one of 'value'"):
            ds.check_source_keys({'prefix': 'p'}, {'path'}, 'audio')

    def test_two_explicit_keys_raise(self):
        with pytest.raises(ValueError, match='exactly one'):
            ds.check_source_keys({'path': 'a', 'url': 'b'}, {'path', 'url'}, 'data')


#
# unwrap_records
#
class TestUnwrapRecords:

    def test_first_list_key_wins(self):
        assert ds.unwrap_records({'meta': 1, 'results': [1], 'rows': [2]}) == [1]

    def test_non_list_value_is_skipped(self):
        obj = {'data': 'nope', 'items': [3]}
        assert ds.unwrap_records(obj) == [3]

    def test_no_records_returns_object(self):
        obj = {'a': 1}
        assert ds.unwrap_records(obj) is obj


#
# _read_bytes_as_df
#
class TestReadBytesAsDf:

    def test_extension_from_url_and_query_string(self):
        df = ds._read_bytes_as_df(b'{"a": 1}\n{"a": 2}\n', 'https://x/y.jsonl?sig=1')
        assert df['a'].tolist() == [1, 2]

    def test_defaults_to_csv(self):
        df = ds._read_bytes_as_df(b'a,b\n1,2\n', 'https://x/download')
        assert isinstance(df, pd.DataFrame)
        assert list(df.columns) == ['a', 'b']


#
# read_data_from_api
#
def test_read_data_from_api_strips_prefix(monkeypatch):
    seen = {}

    def fake(url, cookies=None):
        seen['url'] = url
        seen['cookies'] = cookies
        return 'DF'
    monkeypatch.setattr(ds, 'read_data_from_url', fake)
    assert ds.read_data_from_api('API::https://x/y', cookies={'t': '1'}) == 'DF'
    assert seen == {'url': 'https://x/y', 'cookies': {'t': '1'}}
