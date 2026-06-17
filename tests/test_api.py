"""
Tests for api.py

Pure-logic unit tests for data type detection, secret
resolution, file reading, config merging, and the
BioacousticAnnotator.config property.

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
    DEFAULT_CLIP_TABLE_HEIGHT,
    DEFAULT_FORM_PANEL_HEIGHT,
    DEFAULT_INFO_CARD_HEIGHT,
    DEFAULT_PLAYER_HEIGHT,
    _detect_data_type,
    _detect_audio_type,
    _resolve_data_config,
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
    """Normalization of the data parameter, incl. the auto-detected 'src'."""

    def test_explicit_path_key(self):
        source, dtype, _ = _resolve_data_config({'path': 'data.csv'}, None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_explicit_url_key(self):
        source, dtype, _ = _resolve_data_config(
            {'url': 'https://x.com/data.csv'}, None,
        )
        assert dtype == 'url'

    def test_src_auto_detects_path(self):
        source, dtype, _ = _resolve_data_config({'src': 'data.csv'}, None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_src_auto_detects_url(self):
        _, dtype, _ = _resolve_data_config(
            {'src': 's3://bucket/data.csv'}, None,
        )
        assert dtype == 'url'

    def test_src_auto_detects_sql(self):
        _, dtype, _ = _resolve_data_config({'src': 'SELECT * FROM t'}, None)
        assert dtype == 'sql'

    def test_src_auto_detects_api(self):
        _, dtype, _ = _resolve_data_config(
            {'src': 'api::https://x.com/data'}, None,
        )
        assert dtype == 'api'

    def test_string_auto_detects(self):
        source, dtype, _ = _resolve_data_config('data.csv', None)
        assert source == 'data.csv'
        assert dtype == 'path'

    def test_multiple_source_keys_error(self):
        with pytest.raises(ValueError, match='exactly one'):
            _resolve_data_config({'src': 'data.csv', 'path': 'b.csv'}, None)


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
        base = {'audio': {'src': 'old_col', 'prefix': '/audio/'}}
        proj = {'audio': {'path': '/new/path'}}
        _merge_project_over_config(base, proj)
        assert base['audio']['path'] == '/new/path'
        assert 'src' not in base['audio']
        assert base['audio']['prefix'] == '/audio/'

    def test_data_merge_replaces_src_source_key(self):
        base = {'data': {'src': 'old.csv', 'index_column': 'id'}}
        proj = {'data': {'path': 'new.csv'}}
        _merge_project_over_config(base, proj)
        assert base['data']['path'] == 'new.csv'
        assert 'src' not in base['data']
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
# BioacousticAnnotator — data_src / data.src auto-detection
#
class TestAnnotatorDataSrc:
    """data_src and data={'src': ...} load the same as a bare data string."""

    def test_data_src_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data_src=str(p), audio='audio_path',
            data_index_column='id',
        )
        assert len(ba.source) == 2

    def test_data_dict_src_loads_local_csv(self, tmp_path):
        p = tmp_path / "data.csv"
        _make_df().to_csv(p, index=False)
        ba = BioacousticAnnotator(
            data={'src': str(p)}, audio='audio_path',
            data_index_column='id',
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
