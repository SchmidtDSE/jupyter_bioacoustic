"""
Test Annotator Config Files

Tests for jupyter_bioacoustic/_config.py: loading local config files and
consolidating data/output sections.

License: BSD 3-Clause
"""
import pandas as pd

from jupyter_bioacoustic import _config


#
# load_config
#
class TestLoadConfig:

    def test_yaml(self, tmp_path):
        p = tmp_path / 'c.yaml'
        p.write_text('a: 1\nb: [x, y]\n')
        assert _config.load_config(str(p)) == {'a': 1, 'b': ['x', 'y']}

    def test_json(self, tmp_path):
        p = tmp_path / 'c.json'
        p.write_text('{"a": 1}')
        assert _config.load_config(str(p)) == {'a': 1}

    def test_empty_file_is_empty_dict(self, tmp_path):
        p = tmp_path / 'c.yaml'
        p.write_text('')
        assert _config.load_config(str(p)) == {}

    def test_remote_is_routed(self, monkeypatch):
        monkeypatch.setattr(_config, 'load_config_from_remote', lambda uri: {'uri': uri})
        assert _config.load_config('s3://b/c.yaml') == {'uri': 's3://b/c.yaml'}


#
# section_with_index
#
class TestSectionWithIndex:

    def test_dict_is_copied_and_gets_index(self):
        src = {'path': 'd.csv'}
        out = _config.section_with_index(src, 'id', is_data=True)
        assert out == {'path': 'd.csv', 'index_column': 'id'}
        assert src == {'path': 'd.csv'}

    def test_data_string_is_typed(self):
        out = _config.section_with_index('SELECT * FROM t', None, is_data=True)
        assert out == {'sql': 'SELECT * FROM t'}

    def test_output_string_is_path(self):
        assert _config.section_with_index('o.csv', 'id', is_data=False) == {
            'path': 'o.csv', 'index_column': 'id',
        }

    def test_none_output_is_empty(self):
        assert _config.section_with_index(None, 'id', is_data=False) == {}

    def test_none_data_keeps_index(self):
        """A flat data_path leaves no data section; the index must survive."""
        assert _config.section_with_index(None, 'id', is_data=True) == {'index_column': 'id'}
        assert _config.section_with_index(None, None, is_data=True) == {}

    def test_dataframe_is_path(self):
        df = pd.DataFrame({'a': [1]})
        assert _config.section_with_index(df, None, is_data=True)['path'] is df
