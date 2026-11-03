"""
Tests for api.py

Pure-logic unit tests for data type detection, secret
resolution, file reading, config merging, and the
BioacousticAnnotator.config property.

License: BSD 3-Clause
"""
import os
import json

import pandas as pd
import pytest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.api import (
    BioacousticAnnotator,
    DEFAULT_CLIP_TABLE_HEIGHT,
    DEFAULT_FORM_PANEL_HEIGHT,
    DEFAULT_INFO_CARD_HEIGHT,
    DEFAULT_PLAYER_HEIGHT,
    _detect_data_type,
    _detect_audio_type,
    _resolve_data_config,
    _resolve_audio_config,
    _resolve_secrets,
    _read_data,
    _merge_project_over_config,
    _resolve_templates,
    _resolve_templates_in_structure,
)


#
# _resolve_templates
#
class TestResolveTemplates:

    def test_no_placeholders(self):
        assert _resolve_templates('outputs/data.csv') == 'outputs/data.csv'

    def test_year_placeholder(self):
        from datetime import datetime
        result = _resolve_templates('outputs/data-[[%Y]].csv')
        assert result == f'outputs/data-{datetime.now().year}.csv'

    def test_full_datetime(self):
        from datetime import datetime
        result = _resolve_templates('out-[[%Y%m%d-%H%M]].csv')
        expected = f'out-{datetime.now().strftime("%Y%m%d-%H%M")}.csv'
        assert result == expected

    def test_multiple_placeholders(self):
        from datetime import datetime
        result = _resolve_templates('[[%Y]]/data-[[%m%d]].csv')
        now = datetime.now()
        assert result == f'{now.year}/data-{now.strftime("%m%d")}.csv'

    def test_non_strftime_brackets_untouched(self):
        assert _resolve_templates('[[column_name]].csv') == '[[column_name]].csv'

    def test_empty_string(self):
        assert _resolve_templates('') == ''

    def test_kwargs_resolved(self):
        result = _resolve_templates(
            'review.[[reviewer_name]].csv',
            kwargs={'reviewer_name': 'alice'},
        )
        assert result == 'review.alice.csv'

    def test_kwargs_and_dates(self):
        from datetime import datetime
        result = _resolve_templates(
            '[[reviewer_name]]-[[%Y%m%d]].csv',
            kwargs={'reviewer_name': 'bob'},
        )
        expected = f'bob-{datetime.now().strftime("%Y%m%d")}.csv'
        assert result == expected

    def test_kwargs_missing_left_untouched(self):
        result = _resolve_templates(
            'out.[[missing_key]].csv',
            kwargs={'other_key': 'val'},
        )
        assert result == 'out.[[missing_key]].csv'

    def test_kwargs_none_no_error(self):
        result = _resolve_templates('out.[[key]].csv', kwargs=None)
        assert result == 'out.[[key]].csv'

    def test_kwargs_numeric_value(self):
        result = _resolve_templates(
            'review_[[review_date]].csv',
            kwargs={'review_date': 20260413},
        )
        assert result == 'review_20260413.csv'

    def test_column_names_untouched_with_kwargs(self):
        result = _resolve_templates(
            '[[common_name]] by [[reviewer_name]]',
            kwargs={'reviewer_name': 'alice'},
        )
        assert result == '[[common_name]] by alice'

    def test_default_resolves_when_no_match(self):
        result = _resolve_templates(
            '[[missing || fallback value]]',
            kwargs={'other': 'x'},
        )
        assert result == 'fallback value'

    def test_default_ignored_when_kwarg_matches(self):
        result = _resolve_templates(
            '[[name || default]]',
            kwargs={'name': 'alice'},
        )
        assert result == 'alice'

    def test_default_preserved_when_column_matches(self):
        result = _resolve_templates(
            '[[species || Unknown]]',
            columns={'species', 'confidence'},
        )
        assert result == '[[species || Unknown]]'

    def test_default_resolves_when_not_kwarg_and_not_column(self):
        result = _resolve_templates(
            '[[missing || N/A]]',
            kwargs={'name': 'alice'},
            columns={'species'},
        )
        assert result == 'N/A'

    def test_default_whitespace_trimmed(self):
        result = _resolve_templates('[[ key ||  the default  ]]')
        assert result == 'the default'

    def test_default_with_no_columns_and_no_kwargs(self):
        result = _resolve_templates('[[x || none]]')
        assert result == 'none'

    def test_no_default_left_unresolved(self):
        result = _resolve_templates('[[x]]')
        assert result == '[[x]]'

    def test_mixed_defaults_and_plain(self):
        result = _resolve_templates(
            '[[name]]: [[role || viewer]]',
            kwargs={'name': 'bob'},
        )
        assert result == 'bob: viewer'


class TestResolveTemplatesInStructure:

    def test_nested_dict(self):
        obj = {'label': 'reviewed by [[name]]', 'count': 5}
        result = _resolve_templates_in_structure(obj, kwargs={'name': 'bob'})
        assert result == {'label': 'reviewed by bob', 'count': 5}

    def test_nested_list(self):
        obj = ['[[name]] report', 42, True]
        result = _resolve_templates_in_structure(obj, kwargs={'name': 'alice'})
        assert result == ['alice report', 42, True]

    def test_deep_nesting(self):
        obj = {'form': [{'select': {'label': '[[reviewer]]'}}]}
        result = _resolve_templates_in_structure(
            obj, kwargs={'reviewer': 'carol'},
        )
        assert result == {'form': [{'select': {'label': 'carol'}}]}

    def test_no_kwargs(self):
        obj = {'text': '[[col]]'}
        result = _resolve_templates_in_structure(obj)
        assert result == {'text': '[[col]]'}

    def test_dates_in_structure(self):
        from datetime import datetime
        obj = {'title': 'Report [[%Y]]'}
        result = _resolve_templates_in_structure(obj)
        assert result == {'title': f'Report {datetime.now().year}'}


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
# _resolve_data_config
#
class TestResolveDataConfig:
    """Normalization of the data parameter, incl. 'value'/'source_type'."""

    def test_explicit_path_key(self):
        source, dtype, _ = _resolve_data_config({'path': 'data.csv'}, None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_explicit_url_key(self):
        source, dtype, _ = _resolve_data_config(
            {'url': 'https://x.com/data.csv'}, None,
        )
        assert dtype == 'url'

    def test_value_auto_detects_path(self):
        source, dtype, _ = _resolve_data_config({'value': 'data.csv'}, None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_value_auto_detects_url(self):
        _, dtype, _ = _resolve_data_config(
            {'value': 's3://bucket/data.csv'}, None,
        )
        assert dtype == 'url'

    def test_value_auto_detects_sql(self):
        _, dtype, _ = _resolve_data_config({'value': 'SELECT * FROM t'}, None)
        assert dtype == 'sql'

    def test_value_auto_detects_api(self):
        _, dtype, _ = _resolve_data_config(
            {'value': 'api::https://x.com/data'}, None,
        )
        assert dtype == 'api'

    def test_source_type_forces_url(self):
        # A SQL-looking string is forced to 'url' by an explicit source_type.
        _, dtype, _ = _resolve_data_config(
            {'value': 'SELECT.csv', 'source_type': 'url'}, None,
        )
        assert dtype == 'url'

    def test_source_type_uri_maps_to_url(self):
        _, dtype, _ = _resolve_data_config(
            {'value': 's3://b/x.csv', 'source_type': 'uri'}, None,
        )
        assert dtype == 'url'

    def test_falsey_source_type_auto_detects(self):
        _, dtype, _ = _resolve_data_config(
            {'value': 'data.csv', 'source_type': ''}, None,
        )
        assert dtype == 'path'

    def test_string_auto_detects(self):
        source, dtype, _ = _resolve_data_config('data.csv', None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_value_and_explicit_key_error(self):
        with pytest.raises(ValueError, match='not both'):
            _resolve_data_config({'value': 'data.csv', 'path': 'b.csv'}, None)

    def test_multiple_explicit_keys_error(self):
        with pytest.raises(ValueError, match='exactly one'):
            _resolve_data_config({'url': 'a', 'path': 'b.csv'}, None)


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
# _read_data_from_url cloud routing
#
class TestUrlLoaderCloudRouting:
    """s3://, gs:// route to the cloud reader, not requests."""

    def test_s3_routes_to_cloud(self, monkeypatch):
        import jupyter_bioacoustic._data_sources as ds
        seen = {}

        def fake(url):
            seen['url'] = url
            return 'DF'
        monkeypatch.setattr(ds, 'read_data_from_cloud', fake)
        assert ds.read_data_from_url('s3://bucket/k.csv') == 'DF'
        assert seen['url'] == 's3://bucket/k.csv'

    def test_gs_routes_to_cloud(self, monkeypatch):
        import jupyter_bioacoustic._data_sources as ds
        monkeypatch.setattr(ds, 'read_data_from_cloud', lambda url: 'DF')
        assert ds.read_data_from_url('gs://bucket/k.parquet') == 'DF'


#
# _resolve_audio_config
#
class TestResolveAudioConfig:
    """Audio normalization, incl. 'value'/'source_type' and explicit keys."""

    def test_string_auto_detects_path(self):
        cfg = _resolve_audio_config('rec/a.flac', '', '', '')
        assert cfg['type'] == 'path'
        assert cfg['value'] == 'rec/a.flac'

    def test_explicit_column_key(self):
        cfg = _resolve_audio_config({'column': 'audio_path'}, '', '', '')
        assert cfg['type'] == 'column'
        assert cfg['value'] == 'audio_path'

    def test_explicit_uri_maps_to_url(self):
        cfg = _resolve_audio_config({'uri': 's3://b/a.flac'}, '', '', '')
        assert cfg['type'] == 'url'

    def test_value_auto_detects_column(self):
        cfg = _resolve_audio_config({'value': 'filename'}, '', '', '')
        assert cfg['type'] == 'column'

    def test_value_auto_detects_url(self):
        cfg = _resolve_audio_config({'value': 's3://b/a.flac'}, '', '', '')
        assert cfg['type'] == 'url'

    def test_source_type_forces_column(self):
        # 'a.flac' would auto-detect as 'path'; source_type forces 'column'.
        cfg = _resolve_audio_config(
            {'value': 'a.flac', 'source_type': 'column'}, '', '', '',
        )
        assert cfg['type'] == 'column'

    def test_source_type_uri_maps_to_url(self):
        cfg = _resolve_audio_config(
            {'value': 'rec/a.flac', 'source_type': 'uri'}, '', '', '',
        )
        assert cfg['type'] == 'url'

    def test_falsey_source_type_auto_detects(self):
        cfg = _resolve_audio_config(
            {'value': 'audio_col', 'source_type': ''}, '', '', '',
        )
        assert cfg['type'] == 'column'

    def test_value_and_explicit_key_error(self):
        with pytest.raises(ValueError, match='not both'):
            _resolve_audio_config(
                {'value': 'a.flac', 'path': 'b.flac'}, '', '', '',
            )


#
# _merge_project_over_config
#
class TestMergeProjectOverConfig:

    def test_simple_override(self):
        base = {'info_card_title': '[[species]]', 'width': 800}
        proj = {'width': 1200}
        _merge_project_over_config(base, proj)
        assert base['width'] == 1200
        assert base['info_card_title'] == '[[species]]'

    def test_dict_merge_data(self):
        base = {'data': {'path': 'old.csv', 'secrets': {'k': 'v'}}}
        proj = {'data': {'path': 'new.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'new.csv'
        assert base['data']['secrets'] == {'k': 'v'}

    def test_dict_merge_replaces_source_keys(self):
        base = {'data': {'url': 'https://old.com/data.csv', 'secrets': {'k': 'v'}}}
        proj = {'data': {'path': 'local.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'local.csv'
        assert 'url' not in base['data']

    def test_audio_merge_replaces_source_keys(self):
        base = {'audio': {'value': 'old_col', 'prefix': '/audio/'}}
        proj = {'audio': {'path': '/new/path'}}
        _merge_project_over_config(base, proj)
        assert base['audio']['path'] == '/new/path'
        assert 'value' not in base['audio']
        assert base['audio']['prefix'] == '/audio/'

    def test_data_merge_replaces_value_source_key(self):
        base = {'data': {'value': 'old.csv', 'source_type': 'path',
                         'index_column': 'id'}}
        proj = {'data': {'path': 'new.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'new.csv'
        assert 'value' not in base['data']
        assert 'source_type' not in base['data']
        assert base['data']['index_column'] == 'id'

    def test_non_merge_key_replaced(self):
        base = {'capture': True}
        proj = {'capture': False}
        _merge_project_over_config(base, proj)
        assert base['capture'] is False

    def test_new_key_added(self):
        base = {'info_card_title': '[[species]]'}
        proj = {'default_buffer': 5}
        _merge_project_over_config(base, proj)
        assert base['default_buffer'] == 5


#
# BioacousticAnnotator.config
#
def _make_df():
    """Create a minimal DataFrame for annotator tests."""
    return pd.DataFrame({
        'id': [1, 2],
        'start_time': [0.0, 1.0],
        'end_time': [1.0, 2.0],
        'audio_path': ['a.wav', 'b.wav'],
    })


class TestAnnotatorConfig:

    def test_config_none_without_file(self):
        """config/project/form are None when nothing was defined."""
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba.config is None
        assert ba.project is None
        assert ba.form is None

    def test_configuration_returns_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert isinstance(ba.configuration, dict)

    def test_configuration_is_copy(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        cfg = ba.configuration
        cfg['injected'] = True
        assert 'injected' not in ba.configuration

    def test_configuration_includes_inline_args(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            info_card_title='[[audio_path]]',
            data_index_column='id',
        )
        cfg = ba.configuration
        assert cfg['info_card_title'] == '[[audio_path]]'
        # index column lives inside the data dict, not at top level
        assert cfg['data']['index_column'] == 'id'
        assert 'data_index_column' not in cfg

    def test_config_from_config_file(self, tmp_path):
        import yaml
        cfg_data = {
            'audio': {'column': 'audio_path'},
            'info_card_title': '[[audio_path]]',
            'default_buffer': 5,
            'data_index_column': 'id',
        }
        cfg_file = tmp_path / 'config.yaml'
        cfg_file.write_text(yaml.dump(cfg_data))

        data_file = tmp_path / 'data.csv'
        _make_df().to_csv(data_file, index=False)

        ba = BioacousticAnnotator(
            data=str(data_file), audio='audio_path',
            config=str(cfg_file),
        )
        # .config is the config file contents
        assert ba.config['info_card_title'] == '[[audio_path]]'
        assert ba.config['default_buffer'] == 5
        assert ba.config['audio'] == {'column': 'audio_path'}
        assert ba.project is None
        # .configuration reflects the same values (no project to override)
        assert ba.configuration['default_buffer'] == 5

    def test_config_and_project_from_project_with_nested(self, tmp_path):
        import yaml
        nested_cfg = {
            'audio': {'column': 'audio_path'},
            'info_card_title': '[[audio_path]]',
            'default_buffer': 5,
            'data_index_column': 'id',
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
        # .project and .config return their respective file contents
        assert ba.project['default_buffer'] == 10
        assert ba.config['default_buffer'] == 5
        assert ba.config['audio'] == {'column': 'audio_path'}
        # .configuration is the merge (project overrides config)
        cfg = ba.configuration
        assert cfg['audio'] == {'column': 'audio_path'}
        assert cfg['info_card_title'] == '[[audio_path]]'
        assert cfg['default_buffer'] == 10
        assert cfg['data']['path'] == str(data_file)

    def test_validate_data_override_preserves_nested_index(self, tmp_path):
        """Regression: a notebook data= arg overriding a config whose
        nested data dict carries index_column must still validate when a
        form is present (the index lives in the config, not the arg)."""
        import yaml
        cfg_data = {
            'audio': {'column': 'audio_path'},
            'data': {'index_column': 'id'},
            'output': {'index_column': 'detection_id'},
            'form_config': {
                'form': [{'textbox': {'label': 'notes', 'column': 'notes'}}],
            },
        }
        cfg_file = tmp_path / 'config.yaml'
        cfg_file.write_text(yaml.dump(cfg_data))

        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            config=str(cfg_file),
        )
        assert ba._data_index_column == 'id'
        # resolved index columns stay inside their data/output dict and are
        # NOT also hoisted to top-level keys (no duplication)
        cfg = ba.configuration
        assert cfg['data']['index_column'] == 'id'
        assert cfg['output']['index_column'] == 'detection_id'
        assert 'data_index_column' not in cfg
        assert 'output_index_column' not in cfg
        result = ba.validate()
        assert result['valid'], result['errors']
        assert not any(
            'data_index_column' in e for e in result['errors']
        )


#
# _detect_data_type / _detect_audio_type — source_type coverage
#
class TestDetectDataTypeSourceType:

    def test_returns_path_for_local_file(self):
        assert _detect_data_type('data.csv') == 'path'

    def test_returns_url_for_https(self):
        assert _detect_data_type('https://example.com/data.csv') == 'url'

    def test_returns_sql_for_query(self):
        assert _detect_data_type('SELECT * FROM t') == 'sql'

    def test_returns_api_for_prefix(self):
        assert _detect_data_type('api::https://example.com') == 'api'


class TestDetectAudioTypeSourceType:

    def test_returns_path_for_local(self):
        assert _detect_audio_type('recordings/audio.flac') == 'path'

    def test_returns_url_for_https(self):
        assert _detect_audio_type('https://example.com/audio.flac') == 'url'

    def test_returns_column_for_bare_name(self):
        assert _detect_audio_type('audio_path') == 'column'


#
# BioacousticAnnotator — start_time_col / end_time_col remapping
#
class TestAnnotatorTimeColumns:

    def test_custom_start_time_col(self):
        df = pd.DataFrame({
            'id': [1, 2],
            'begin': [0.0, 1.0],
            'end_time': [1.0, 2.0],
            'audio_path': ['a.wav', 'b.wav'],
        })
        ba = BioacousticAnnotator(
            data=df, audio='audio_path', data_start_time='begin',
            data_index_column='id',
        )
        assert 'start_time' in ba.source.columns

    def test_custom_end_time_col(self):
        df = pd.DataFrame({
            'id': [1, 2],
            'start_time': [0.0, 1.0],
            'stop': [1.0, 2.0],
            'audio_path': ['a.wav', 'b.wav'],
        })
        ba = BioacousticAnnotator(
            data=df, audio='audio_path', data_end_time='stop',
            data_index_column='id',
        )
        assert 'end_time' in ba.source.columns

    def test_both_time_cols_remapped(self):
        df = pd.DataFrame({
            'id': [1, 2],
            'begin': [0.0, 1.0],
            'stop': [1.0, 2.0],
            'audio_path': ['a.wav', 'b.wav'],
        })
        ba = BioacousticAnnotator(
            data=df, audio='audio_path',
            data_start_time='begin', data_end_time='stop',
            data_index_column='id',
        )
        assert 'start_time' in ba.source.columns
        assert 'end_time' in ba.source.columns
        assert 'begin' not in ba.source.columns
        assert 'stop' not in ba.source.columns


#
# BioacousticAnnotator — display_columns filtering
#
class TestAnnotatorDataColumns:

    def test_display_columns_stored(self):
        df = pd.DataFrame({
            'id': [1], 'start_time': [0.0], 'end_time': [1.0],
            'species': ['owl'], 'confidence': [0.9],
            'audio_path': ['a.wav'],
        })
        ba = BioacousticAnnotator(
            data=df, audio='audio_path',
            display_columns=['species', 'confidence'],
            data_index_column='id',
        )
        assert ba._data_columns == ['species', 'confidence']

    def test_display_columns_default_empty(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._data_columns == []


#
# BioacousticAnnotator — data_value / data.value (+ source_type)
#
class TestAnnotatorDataValue:
    """data_value and data={'value': ...} load like a bare data string."""

    def test_data_value_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data_value=str(p), audio='audio_path',
            data_index_column='id',
        )
        assert len(ba.source) == 2

    def test_data_value_with_source_type_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data_value=str(p), data_source_type='path',
            audio='audio_path', data_index_column='id',
        )
        assert len(ba.source) == 2

    def test_data_dict_value_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data={'value': str(p)}, audio='audio_path',
            data_index_column='id',
        )
        assert len(ba.source) == 2

    def test_data_dict_value_with_source_type_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data={'value': str(p), 'source_type': 'path'},
            audio='audio_path', data_index_column='id',
        )
        assert len(ba.source) == 2


#
# BioacousticAnnotator — height params
#
class TestAnnotatorHeightParams:

    def test_clip_table_height_default(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._clip_table_height == DEFAULT_CLIP_TABLE_HEIGHT

    def test_clip_table_height_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            clip_table_height=200, data_index_column='id',
        )
        assert ba._clip_table_height == 200

    def test_player_height_default(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._player_height == DEFAULT_PLAYER_HEIGHT

    def test_player_height_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            player_height=400, data_index_column='id',
        )
        assert ba._player_height == 400

    def test_info_card_height_default(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._info_card_height == DEFAULT_INFO_CARD_HEIGHT

    def test_info_card_height_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            info_card_height=50, data_index_column='id',
        )
        assert ba._info_card_height == 50

    def test_form_panel_height_default(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._form_panel_height == DEFAULT_FORM_PANEL_HEIGHT

    def test_form_panel_height_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            form_panel_height=200, data_index_column='id',
        )
        assert ba._form_panel_height == 200

    def test_capture_height_default_none(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._capture_height is None

    def test_capture_height_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            capture_height=300, data_index_column='id',
        )
        assert ba._capture_height == 300


#
# BioacousticAnnotator — sync params
#
class TestAnnotatorSyncParams:

    def test_sync_uri_from_output_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output={'path': 'out.csv', 'uri': 's3://bucket/out.csv'},
            data_index_column='id',
        )
        assert ba.sync_uri == 's3://bucket/out.csv'

    def test_sync_uri_from_top_level(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output_uri='s3://bucket/out.csv',
            data_index_column='id',
        )
        assert ba.sync_uri == 's3://bucket/out.csv'

    def test_sync_button_custom_string(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output={'path': 'out.csv', 'sync_button': 'Upload'},
            data_index_column='id',
        )
        assert ba._sync_button == 'Upload'

    def test_sync_button_auto_when_uri_present(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output={'path': 'out.csv', 'uri': 's3://bucket/out.csv'},
            data_index_column='id',
        )
        assert ba._sync_button == 'Sync'

    def test_sync_recursive_from_output_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output={'path': 'out.csv', 'recursive': True},
            data_index_column='id',
        )
        assert ba._sync_recursive is True

    def test_sync_recursive_default_false(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            output='out.csv', data_index_column='id',
        )
        assert ba._sync_recursive is False


#
# BioacousticAnnotator — app secrets
#
class TestAnnotatorSecrets:

    def test_global_secrets_cascade_to_data(self, monkeypatch):
        monkeypatch.setenv('JBA_TEST_TOKEN', 'tok123')
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            secrets={'key': 'Authorization', 'value': 'env:JBA_TEST_TOKEN'},
            data_index_column='id',
        )
        assert ba._audio_config['secrets'] == {'Authorization': 'tok123'}


#
# BioacousticAnnotator — data_index_column / output_index_column
#
class TestAnnotatorIndexColumns:

    def test_data_index_column_required_with_form(self):
        """Missing data_index_column raises ValueError when a form is set."""
        with pytest.raises(ValueError, match='data_index_column.*required'):
            BioacousticAnnotator(
                data=_make_df(), audio='audio_path',
                form_config={'form': [{'textbox': {'label': 'notes'}}]},
            )

    def test_data_index_column_optional_without_form(self):
        """Player-only (no form): missing data_index_column is allowed."""
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
        )
        assert ba._data_index_column is None
        assert ba._output_index_column is None

    def test_data_index_column_not_in_data(self):
        """data_index_column pointing to missing column raises ValueError."""
        with pytest.raises(ValueError, match='not found'):
            BioacousticAnnotator(
                data=_make_df(), audio='audio_path',
                data_index_column='nonexistent',
            )

    def test_data_index_column_stored(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._data_index_column == 'id'

    def test_data_index_column_uppercase(self):
        """Uppercase ID column should work when specified."""
        df = pd.DataFrame({
            'ID': [1, 2],
            'start_time': [0.0, 1.0],
            'end_time': [1.0, 2.0],
            'audio_path': ['a.wav', 'b.wav'],
        })
        ba = BioacousticAnnotator(
            data=df, audio='audio_path',
            data_index_column='ID',
        )
        assert ba._data_index_column == 'ID'

    def test_output_index_column_defaults_to_data(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        assert ba._output_index_column == 'id'

    def test_output_index_column_custom(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
            output_index_column='review_id',
        )
        assert ba._output_index_column == 'review_id'

    def test_data_index_column_from_data_dict(self):
        """data.index_column in dict form should be resolved."""
        df = _make_df()
        ba = BioacousticAnnotator(
            data={'path': df, 'index_column': 'id'},
            audio='audio_path',
        )
        assert ba._data_index_column == 'id'

    def test_output_index_column_from_output_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
            output={'path': 'out.csv', 'index_column': 'out_id'},
        )
        assert ba._output_index_column == 'out_id'

    def test_data_index_column_from_config_file(self, tmp_path):
        import yaml
        cfg = {
            'audio': {'column': 'audio_path'},
            'data_index_column': 'id',
        }
        cfg_file = tmp_path / 'config.yaml'
        cfg_file.write_text(yaml.dump(cfg))

        data_file = tmp_path / 'data.csv'
        _make_df().to_csv(data_file, index=False)

        ba = BioacousticAnnotator(
            data=str(data_file), config=str(cfg_file),
        )
        assert ba._data_index_column == 'id'


#
# BioacousticAnnotator — validate()
#
class TestAnnotatorValidate:

    def test_validate_returns_result_dict(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        result = ba.validate()
        assert set(result) >= {'valid', 'errors', 'warnings'}
        assert result['valid']
        assert result['errors'] == []

    def test_configuration_keeps_index_in_data_dict(self):
        """Resolved index column lives in the data dict (not top level), and
        no output section is fabricated when none is configured."""
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
        )
        cfg = ba.configuration
        assert cfg['data']['index_column'] == 'id'
        assert 'data_index_column' not in cfg
        assert 'output' not in cfg
        assert ba.validate()['valid']

    def test_validate_catches_form_error(self):
        """A form with an annotation lacking tools is invalid."""
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path',
            data_index_column='id',
            form_config={
                'annotation': {
                    'start_time': {'column': 'start_time'},
                    'tools': [],
                },
            },
        )
        result = ba.validate()
        assert not result['valid']
        assert any('tool' in e.lower() for e in result['errors'])


#
# BioacousticAnnotator — sort / sort_order
#
class TestAnnotatorSort:

    def test_sort_defaults_to_none(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path', data_index_column='id',
        )
        assert ba._sort is None
        assert ba._sort_order == 'asc'

    def test_sort_params_stored(self):
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path', data_index_column='id',
            sort='common_name', sort_order='desc',
        )
        assert ba._sort == 'common_name'
        assert ba._sort_order == 'desc'

    def test_sort_from_config(self, tmp_path):
        import yaml
        cfg = {
            'audio': {'column': 'audio_path'},
            'data': {'index_column': 'id'},
            'sort': 'confidence',
            'sort_order': 'desc',
        }
        cfg_file = tmp_path / 'config.yaml'
        cfg_file.write_text(yaml.dump(cfg))
        ba = BioacousticAnnotator(
            data=_make_df(), config=str(cfg_file),
        )
        assert ba._sort == 'confidence'
        assert ba._sort_order == 'desc'
        # valid keys — no unknown-key errors
        assert ba.validate()['valid']


#
# BioacousticAnnotator — extra kwargs never leak between sessions (H2)
#
class TestAnnotatorFixedKwargs:

    def _form(self):
        return {'form': [{'textbox': {'label': 'notes'}}]}

    def test_caller_form_dict_not_mutated(self, tmp_path):
        form = self._form()
        BioacousticAnnotator(
            data=_make_df(), audio='audio_path', data_index_column='id',
            output=str(tmp_path / 'out.csv'), form_config=form, reviewer='alice',
        )
        assert form == self._form()

    def test_reused_form_dict_gets_each_sessions_kwargs(self, tmp_path):
        form = self._form()
        common = dict(data=_make_df(), audio='audio_path', data_index_column='id',
                      output=str(tmp_path / 'out.csv'), form_config=form)
        alice = BioacousticAnnotator(**common, reviewer='alice')
        bob = BioacousticAnnotator(**common, reviewer='bob')
        def values(ba):
            return [e['fixed_value']['value'] for e in ba._form_config['_fixed_kwargs']]

        assert values(alice) == ['alice']
        assert values(bob) == ['bob']


#
# BioacousticAnnotator — visualization metadata index (H3)
#
class TestAnnotatorVisualizationIndex:

    def _viz(self, visualizations):
        return BioacousticAnnotator(
            data=_make_df(), audio='audio_path', visualizations=visualizations,
        )

    def test_index_is_position_in_visualizations(self):
        def custom(raw, sr):
            return raw
        with pytest.warns(UserWarning, match='Ignoring visualization'):
            ba = self._viz(['mel', {'label': 'no fn'}, custom, 'linear'])
        assert [m['label'] for m in ba._viz_meta] == ['Mel', 'custom', 'Linear']
        for meta in ba._viz_meta:
            assert ba._visualizations[meta['index']]['label'] == meta['label']

    def test_meta_has_no_function(self):
        def custom(raw, sr):
            return raw
        ba = self._viz([custom])
        assert ba._viz_meta == [{'type': 'custom', 'label': 'custom', 'index': 0}]
        json.dumps(ba._viz_meta)                       # sent to the frontend as JSON


#
# BioacousticAnnotator — description given as a string (A5)
#
class TestAnnotatorDescriptionString:

    def _desc(self, description):
        return BioacousticAnnotator(data=_make_df(), audio='audio_path',
                                    description=description)._description_config

    def test_markdown_text(self):
        assert self._desc('# About\nListen for owls') == {
            'title': '', 'text': '# About\nListen for owls', 'open': True}

    def test_markdown_file_path(self, tmp_path):
        md = tmp_path / 'about.md'
        md.write_text('From a file')
        assert self._desc(str(md))['text'] == 'From a file'

    def test_false_means_no_panel(self):
        assert self._desc(False) is None

    def test_true_warns_and_shows_nothing(self):
        with pytest.warns(UserWarning, match='no text to show'):
            assert self._desc(True) is None


#
# .json output written as JSON Lines reads back (A8)
#
class TestReadJsonOutput:

    @pytest.mark.parametrize('n_rows', [1, 3])
    def test_json_lines_file(self, tmp_path, n_rows):
        from jupyter_bioacoustic._kernel_helpers import write_output_rows
        p = str(tmp_path / 'out.json')
        rows = [{'id': i, 'label': f'x{i}'} for i in range(n_rows)]
        write_output_rows(p, rows, ['id', 'label'], 'json')
        assert _read_data(p).to_dict('records') == rows

    def test_json_document_file(self, tmp_path):
        p = tmp_path / 'data.json'
        p.write_text(json.dumps([{'id': 1}, {'id': 2}]))
        assert _read_data(str(p)).to_dict('records') == [{'id': 1}, {'id': 2}]


#
# SQL secrets: quoted SET values, environment only during the query
#
class TestSqlSecrets:

    def test_temporary_environ_restores(self, monkeypatch):
        from jupyter_bioacoustic.api import _temporary_environ
        monkeypatch.setenv('JBA_KEEP', 'old')
        monkeypatch.delenv('JBA_TEMP', raising=False)
        with _temporary_environ({'JBA_KEEP': 'new', 'JBA_TEMP': 'tmp'}):
            assert os.environ['JBA_KEEP'] == 'new' and os.environ['JBA_TEMP'] == 'tmp'
        assert os.environ['JBA_KEEP'] == 'old'
        assert 'JBA_TEMP' not in os.environ

    def test_query_with_quoted_secret_and_no_env_leak(self, monkeypatch):
        pytest.importorskip('duckdb')
        from jupyter_bioacoustic.api import _read_data_from_sql
        monkeypatch.delenv('JBA_SQL_SECRET', raising=False)
        df = _read_data_from_sql(
            "SELECT 1 AS a",
            secrets={'s3_region': "us-east-1' ; DROP", 'JBA_SQL_SECRET': 'shh'},
        )
        assert df['a'].tolist() == [1]
        assert 'JBA_SQL_SECRET' not in os.environ


#
# source overrides don't mutate the caller's / config file's dicts (A6)
#
class TestAnnotatorNoDictMutation:

    def test_callers_data_and_audio_dicts_unchanged(self, tmp_path):
        a, b = tmp_path / 'a.csv', tmp_path / 'b.csv'
        _make_df().to_csv(a, index=False)
        _make_df().to_csv(b, index=False)
        data = {'path': str(a), 'start_time': 'start_time'}
        audio = {'path': 'x.flac', 'prefix': 'p/'}
        BioacousticAnnotator(data=data, data_path=str(b), audio=audio, audio_column='audio_path')
        assert data == {'path': str(a), 'start_time': 'start_time'}
        assert audio == {'path': 'x.flac', 'prefix': 'p/'}

    def test_config_property_shows_the_file(self, tmp_path):
        a, b = tmp_path / 'a.csv', tmp_path / 'b.csv'
        _make_df().to_csv(a, index=False)
        _make_df().to_csv(b, index=False)
        cfg = tmp_path / 'c.yaml'
        cfg.write_text(f'data: {{path: {a}}}\naudio: {{column: audio_path}}\n')
        ba = BioacousticAnnotator(config=str(cfg), data_path=str(b))
        assert ba.config['data'] == {'path': str(a)}


#
# api.py re-exports the helpers that moved to _templates/_data_sources/_audio_sources/_config
#
class TestApiReExports:

    def test_old_names_still_importable(self):
        import jupyter_bioacoustic.api as api
        from jupyter_bioacoustic import _audio_sources, _config, _data_sources, _templates
        assert api._resolve_templates is _templates.resolve_templates
        assert api._resolve_templates_in_structure is _templates.resolve_templates_in_structure
        assert api._load_data is _data_sources.load_data
        assert api._read_data is _data_sources.read_data
        assert api._resolve_secrets is _data_sources.resolve_secrets
        assert api._cloud_get_bytes is _data_sources.cloud_get_bytes
        assert api._read_data_from_url is _data_sources.read_data_from_url
        assert api._read_data_from_sql is _data_sources.read_data_from_sql
        assert api._temporary_environ is _data_sources.temporary_environ
        assert api._resolve_audio_config is _audio_sources.resolve_audio_config
        assert api._detect_audio_type is _audio_sources.detect_audio_type
        assert api._load_config is _config.load_config
        assert api._merge_project_over_config is _config.merge_project_over_config
        assert api._filter_session_args is _config.filter_session_args
        assert api._CONFIG_PARAMS is _config.CONFIG_PARAMS

    def test_config_params_match_constructor(self):
        import inspect
        from jupyter_bioacoustic.api import _CONFIG_PARAMS
        params = set(inspect.signature(BioacousticAnnotator.__init__).parameters)
        assert params - {'self', 'project', 'kwargs'} == _CONFIG_PARAMS


#
# small module helpers used by BioacousticAnnotator.__init__
#
class TestAnnotatorHelpers:

    def test_cascade_secrets(self):
        from jupyter_bioacoustic.api import _cascade_secrets
        g = {'key': 'K'}
        assert _cascade_secrets(None, g) is g
        assert _cascade_secrets(False, g) is None
        s = [{'key': 'S'}]
        assert _cascade_secrets(s, g) is s

    def test_single_flat_source(self):
        from jupyter_bioacoustic.api import _single_flat_source
        assert _single_flat_source({'path': None, 'url': None}, 'x') is None
        assert _single_flat_source({'path': 'p', 'url': None}, 'x') == ('path', 'p')
        with pytest.raises(ValueError, match='Only one of a, b may be set'):
            _single_flat_source({'a': 1, 'b': 2}, 'a, b')

    def test_sync_button_label(self):
        from jupyter_bioacoustic.api import _sync_button_label
        assert _sync_button_label('Push') == 'Push'
        assert _sync_button_label(True) == 'Sync'
        assert _sync_button_label(False) == ''

    def test_dict_index_column(self):
        from jupyter_bioacoustic.api import _dict_index_column
        assert _dict_index_column({'index_column': 'a'}, {'index_column': 'b'}) == 'a'
        assert _dict_index_column({}, {'index_column': 'b'}) is None
        assert _dict_index_column('x.csv', {'index_column': 'b'}) == 'b'
        assert _dict_index_column('x.csv', None) is None

    def test_default_project_name(self):
        from jupyter_bioacoustic.api import DEFAULT_PROJECT_NAME, _default_project_name
        assert _default_project_name('projects/my_survey-2024.yaml') == 'My Survey 2024'
        assert _default_project_name({'data': 'x'}) == DEFAULT_PROJECT_NAME
        assert _default_project_name(None) == DEFAULT_PROJECT_NAME

    def test_drop_keys(self):
        from jupyter_bioacoustic.api import _drop_keys
        d = {'path': 1, 'value': 2, 'prefix': 3}
        _drop_keys(d, frozenset({'path', 'value', 'url'}))
        assert d == {'prefix': 3}

    def test_resolve_precedence(self, tmp_path):
        cfg = tmp_path / 'c.yaml'
        cfg.write_text('audio: audio_path\nwidth: 700\nsort: null\n')
        ba = BioacousticAnnotator(config=str(cfg), data=_make_df(), player_height=99)
        assert ba._resolve('player_height', 1) == 99      # argument wins
        assert ba._resolve('width', 1) == 700             # then the config file
        assert ba._resolve('sort', 'x') is None           # a config null counts as set
        assert ba._resolve('capture_dir', 'dflt') == 'dflt'


#
# setup() writes every _BA_* variable the frontend reads (src/python.ts readKernelVars)
#
class TestSetupContract:

    FRONTEND_VARS = {
        '_BA_APP_TITLE', '_BA_AUDIO', '_BA_CAPTURE', '_BA_CAPTURE_DIR', '_BA_CAPTURE_HEIGHT',
        '_BA_CLIP_TABLE_HEIGHT', '_BA_CONFIG_PATH', '_BA_DATA', '_BA_DATA_COLS',
        '_BA_DATA_INDEX_COL', '_BA_DEFAULT_BUFFER', '_BA_DESCRIPTION', '_BA_DESCRIPTION_HEIGHT',
        '_BA_DUPLICATE_ENTRIES', '_BA_FORM_CONFIG', '_BA_FORM_PANEL_HEIGHT', '_BA_FORM_PATH',
        '_BA_INFO_CARD_HEIGHT', '_BA_INFO_CARD_TEXT', '_BA_INFO_CARD_TITLE', '_BA_INSTANCE',
        '_BA_MERGED_CONFIG', '_BA_OUTPUT', '_BA_OUTPUT_INDEX_COL', '_BA_PLAYER_HEIGHT',
        '_BA_PROJECT_PATH', '_BA_SORT', '_BA_SORT_ORDER', '_BA_SPEC_RESOLUTIONS',
        '_BA_SYNC_CONFIG', '_BA_VIZ_META',
    }

    def test_setup_writes_frontend_vars(self, monkeypatch):
        import types
        import jupyter_bioacoustic.api as api
        ns = {}
        monkeypatch.setattr(api, 'get_ipython', lambda: types.SimpleNamespace(user_ns=ns))
        ba = BioacousticAnnotator(
            data=_make_df(), audio='audio_path', data_index_column='id',
            form_config={'title': {'value': 'T'}}, capture=False,
        )
        ba.setup()
        assert self.FRONTEND_VARS <= set(ns)
        assert ns['_BA_INSTANCE'] is ba
        assert ns['_BA_CAPTURE'] == ''
        assert ns['_BA_DATA_INDEX_COL'] == 'id'
        assert json.loads(ns['_BA_AUDIO'])['type'] == 'column'

    def test_setup_outside_kernel_raises(self, monkeypatch):
        import jupyter_bioacoustic.api as api
        monkeypatch.setattr(api, 'get_ipython', lambda: None)
        ba = BioacousticAnnotator(data=_make_df(), audio='audio_path')
        with pytest.raises(RuntimeError):
            ba.setup()


#
# extra kwargs that look like misspelled parameters
#
class TestTypoWarning:

    def test_close_misspelling_warns(self):
        with pytest.warns(UserWarning, match="Did you mean 'sort_order'"):
            BioacousticAnnotator(data=_make_df(), audio='audio_path', sort_ordr='desc')

    def test_real_custom_columns_are_silent(self, recwarn):
        BioacousticAnnotator(data=_make_df(), audio='audio_path',
                             annotator_name='a', reviewer_name='b', review_date=20260101)
        assert not [w for w in recwarn if 'Did you mean' in str(w.message)]
