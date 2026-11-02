"""
Tests for config_builder/core.py

Unit tests for path utilities, YAML prep, config
get/merge, and validation.

License: BSD 3-Clause
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.config_builder.core import (
    ConfigBuilder,
    SKIP_KEYS,
)
from jupyter_bioacoustic.config_builder.files import (
    LiteralStr,
    ensure_ext,
    prep_for_yaml,
    resolve_path,
)


#
# ensure_ext
#
class TestEnsureExt:

    def test_adds_yaml(self):
        assert ensure_ext('config') == 'config.yaml'

    def test_keeps_yaml(self):
        assert ensure_ext('config.yaml') == 'config.yaml'

    def test_keeps_yml(self):
        assert ensure_ext('config.yml') == 'config.yml'

    def test_non_matching_ext_gets_appended(self):
        assert ensure_ext('config.json') == 'config.json.yaml'

    def test_empty_string(self):
        assert ensure_ext('') == '.yaml'


#
# prep_for_yaml
#
class TestPrepForYaml:

    def test_plain_string_unchanged(self):
        result = prep_for_yaml('hello')
        assert result == 'hello'
        assert not isinstance(result, LiteralStr)

    def test_multiline_becomes_literal(self):
        result = prep_for_yaml('line1\nline2')
        assert isinstance(result, LiteralStr)
        assert result == 'line1\nline2'

    def test_nested_dict(self):
        result = prep_for_yaml({'a': 'plain', 'b': 'has\nnewline'})
        assert not isinstance(result['a'], LiteralStr)
        assert isinstance(result['b'], LiteralStr)

    def test_list(self):
        result = prep_for_yaml(['plain', 'has\nnewline'])
        assert not isinstance(result[0], LiteralStr)
        assert isinstance(result[1], LiteralStr)

    def test_non_string_passthrough(self):
        assert prep_for_yaml(42) == 42
        assert prep_for_yaml(True) is True
        assert prep_for_yaml(None) is None


#
# ConfigBuilder.get_config / get_merged_config
#
class TestConfigBuilderGetConfig:

    def test_get_project(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'Test'}
        result = cb.get_config('project')
        assert result['project_name'] == 'Test'

    def test_get_config(self):
        cb = ConfigBuilder()
        cb._config = {'info_card_title': '[[species]]'}
        result = cb.get_config('config')
        assert result['info_card_title'] == '[[species]]'

    def test_get_form_config(self):
        cb = ConfigBuilder()
        cb._form_config = {'select': {'label': 'x'}}
        result = cb.get_config('form_config')
        assert 'select' in result

    def test_get_unknown_returns_empty(self):
        cb = ConfigBuilder()
        assert cb.get_config('nonexistent') == {}

    def test_merged_config(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'Test'}
        cb._config = {'info_card_title': '[[species]]'}
        cb._form_config = {'select': {'label': 'x'}}
        merged = cb.get_merged_config()
        assert merged['project_name'] == 'Test'
        assert merged['info_card_title'] == '[[species]]'
        assert 'select' in merged['form_config']

    def test_project_includes_form_config(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P'}
        cb._form_config = {'title': 'T'}
        result = cb.get_config('project')
        assert result['form_config'] == {'title': 'T'}


#
# ConfigBuilder.validate
#
class TestConfigBuilderValidate:

    def test_empty_is_valid(self):
        cb = ConfigBuilder()
        result = cb.validate()
        assert result['valid'] is True

    def test_valid_form_keys(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'title': 'Test',
            'select': {'label': 'x', 'column': 'x', 'items': ['a']},
            'submission_buttons': {'submit': True},
        }
        result = cb.validate()
        assert result['valid'] is True
        assert len(result['errors']) == 0

    def test_invalid_form_key(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'bogus_element': {'label': 'x'},
        }
        result = cb.validate()
        assert len(result['errors']) > 0 or len(result['warnings']) > 0

    def test_invalid_config_key(self):
        cb = ConfigBuilder()
        cb._config = {'totally_fake_key': 'x'}
        result = cb.validate()
        assert any('Unknown config key' in e for e in result['errors'])

    def test_invalid_project_key(self):
        cb = ConfigBuilder()
        cb._project = {'nonexistent_param': 42}
        result = cb.validate()
        assert any('Unknown project key' in e for e in result['errors'])

    def test_skip_keys_not_flagged(self):
        cb = ConfigBuilder()
        cb._project = {k: 'val' for k in list(SKIP_KEYS)[:3]}
        cb._config = {'data_index_column': 'id'}
        result = cb.validate()
        assert result['valid'] is True

    def test_dynamic_form_missing_reference(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'select': {
                'label': 'Species',
                'column': 'species',
                'items': [{'value': 'a', 'form': 'detail_form'}],
            },
        }
        result = cb.validate()
        assert any('detail_form' in e for e in result['errors'])

    def test_dynamic_form_unreferenced_warning(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'dynamic_forms': {'orphan_form': []},
        }
        result = cb.validate()
        assert any('orphan_form' in w for w in result['warnings'])

    def test_valid_annotation_tools(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {
                'start_time': 'start_time',
                'end_time': 'end_time',
                'min_frequency': 'min_freq',
                'max_frequency': 'max_freq',
                'tools': ['time_select', 'start_end_time_select', 'multibox'],
            },
        }
        result = cb.validate()
        assert result['valid'] is True

    def test_invalid_annotation_tool_top_level(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {
                'tools': ['time_marker', 'start_end_time'],
            },
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('time_marker' in e for e in result['errors'])
        assert any('start_end_time' in e for e in result['errors'])

    def test_invalid_annotation_tool_in_form_list(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'form': [
                {'annotation': {'tools': ['bounding_box', 'bad_tool']}},
            ],
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('bad_tool' in e for e in result['errors'])

    def test_annotation_tool_string_validated(self):
        cb = ConfigBuilder()
        cb._form_config = {
            'annotation': {'tools': 'wrong_tool'},
        }
        result = cb.validate()
        assert result['valid'] is False
        assert any('wrong_tool' in e for e in result['errors'])


#
# resolve_path
#
class TestResolvePath:

    def test_absolute_exists(self, tmp_path):
        p = tmp_path / 'config.yaml'
        p.write_text('test')
        result = resolve_path(str(p), '/other/dir')
        assert result == str(p)

    def test_absolute_missing(self):
        result = resolve_path('/nonexistent/config.yaml', '/base')
        assert result is None

    def test_relative_in_base_dir(self, tmp_path):
        p = tmp_path / 'config.yaml'
        p.write_text('test')
        result = resolve_path('config.yaml', str(tmp_path))
        assert result == str(p)

    def test_relative_not_found(self, tmp_path):
        result = resolve_path('missing.yaml', str(tmp_path))
        assert result is None


#
# ConfigBuilder.update_section
#
class TestUpdateSection:

    def test_update_project_section(self):
        cb = ConfigBuilder()
        cb.update_section('project', {'project_name': 'Test', 'project_path': 'p.yaml'})
        assert cb._project['project_name'] == 'Test'
        assert cb._project['project_path'] == 'p.yaml'

    def test_update_data_split(self):
        cb = ConfigBuilder()
        cb._section_targets['data'] = 'split'
        cb.update_section('data', {'path': 'data.csv', 'start_time': 'begin'})
        assert cb._project['data'] == {'path': 'data.csv'}
        assert cb._config['data'] == {'start_time': 'begin'}

    def test_update_data_split_source_type_value(self):
        cb = ConfigBuilder()
        cb._section_targets['data'] = 'split'
        cb.update_section('data', {
            'source_type': 'path', 'value': 'data.csv',
            'index_column': 'id',
        })
        assert cb._project['data'] == {
            'source_type': 'path', 'value': 'data.csv',
        }
        assert cb._config['data'] == {'index_column': 'id'}

    def test_update_app_display_columns(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {'display_columns': ['a', 'b']})
        assert cb._config.get('display_columns') == ['a', 'b']

    def test_update_form(self):
        cb = ConfigBuilder()
        form = {'title': 'Test', 'select': {'label': 'x'}}
        cb.update_section('form', form)
        assert cb._form_config == form

    def test_update_app_to_config(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {'info_card_title': '[[species]]', 'width': 800})
        assert cb._config['info_card_title'] == '[[species]]'
        assert cb._config['width'] == 800

    def test_sets_dirty_flag(self):
        cb = ConfigBuilder()
        assert cb._dirty is False
        cb.update_section('form', {'title': 'T'})
        assert cb._dirty is True

    def test_empty_values_removed(self):
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'project'
        cb.update_section('app', {'info_card_title': '[[species]]', 'width': ''})
        assert 'width' not in cb._project

    def test_update_data_split_index_column(self):
        """index_column should route to config in split mode."""
        cb = ConfigBuilder()
        cb._section_targets['data'] = 'split'
        cb.update_section('data', {
            'path': 'data.csv', 'index_column': 'id',
        })
        assert cb._project['data'] == {'path': 'data.csv'}
        assert cb._config['data'] == {'index_column': 'id'}

    def test_update_output_split(self):
        """Output section split routes index_column to config."""
        cb = ConfigBuilder()
        cb._section_targets['output'] = 'split'
        cb.update_section('output', {
            'uri': 's3://bucket/out.csv', 'index_column': 'id',
        })
        assert cb._project['output'] == {'uri': 's3://bucket/out.csv'}
        assert cb._config['output'] == {'index_column': 'id'}

    def test_update_output_to_config(self):
        cb = ConfigBuilder()
        cb._section_targets['output'] = 'config'
        cb.update_section('output', {'index_column': 'id'})
        assert cb._config['output'] == {'index_column': 'id'}

    def test_update_output_to_project(self):
        cb = ConfigBuilder()
        cb._section_targets['output'] = 'project'
        cb.update_section('output', {
            'uri': 's3://bucket/out.csv', 'index_column': 'id',
        })
        assert cb._project['output'] == {
            'uri': 's3://bucket/out.csv', 'index_column': 'id',
        }

    def test_app_project_name_routes_to_project(self):
        """project_name sent via app section always goes to _project."""
        cb = ConfigBuilder()
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {
            'project_name': 'Test App Name',
            'info_card_title': '[[species]]',
        })
        assert cb._project['project_name'] == 'Test App Name'
        assert cb._config['info_card_title'] == '[[species]]'

    def test_app_empty_project_name_pops(self):
        """Empty project_name via app section removes it from _project."""
        cb = ConfigBuilder()
        cb._project['project_name'] = 'Old'
        cb._section_targets['app'] = 'config'
        cb.update_section('app', {'project_name': ''})
        assert 'project_name' not in cb._project

    def test_description_does_not_clear_project_name(self):
        """Description update via project handler must not clear project_name."""
        cb = ConfigBuilder()
        cb._project['project_name'] = 'Keep Me'
        cb.update_section('project', {
            'description': {'title': 'Instructions', 'text': 'Do stuff'},
        })
        assert cb._project['project_name'] == 'Keep Me'
        assert cb._project['description'] == {'title': 'Instructions', 'text': 'Do stuff'}

    def test_output_path_via_project_handler(self):
        """output_path sent via project handler sets output.path."""
        cb = ConfigBuilder()
        cb.update_section('project', {'output_path': 'outputs/reviews.csv'})
        assert cb._project['output']['path'] == 'outputs/reviews.csv'


#
# File locking
#
class TestFileLocking:
    """Locked files are skipped on save; routing keys are exposed."""

    def test_save_all_skips_locked_file(self, tmp_path):
        cb = ConfigBuilder()
        cb.update_section('project', {
            'project_name': 'Lk', 'config_locked': True,
        })
        cb.update_section('data', {'value': 'd.csv', 'source_type': 'path'})
        cwd = os.getcwd()
        os.chdir(tmp_path)
        try:
            saved = cb.save_all()
        finally:
            os.chdir(cwd)
        assert 'config' not in saved          # locked → not written
        assert 'project' in saved and 'form' in saved

    def test_locked_flags_not_written_to_yaml(self, tmp_path):
        import yaml
        cb = ConfigBuilder()
        cb.update_section('project', {'project_name': 'Lk', 'project_locked': True})
        cwd = os.getcwd()
        os.chdir(tmp_path)
        try:
            cb.update_section('project', {'project_locked': False})  # so it writes
            cb.save_all()
            with open(tmp_path / 'projects' / 'lk.yaml') as f:
                proj = yaml.safe_load(f)
        finally:
            os.chdir(cwd)
        assert 'project_locked' not in proj

    def test_get_routing_keys_shape(self):
        rk = ConfigBuilder().get_routing_keys()
        assert set(rk) == {'data', 'audio', 'output'}
        assert 'source_type' in rk['data']['project']
        assert 'index_column' in rk['data']['config']


#
# Source column loading
#
class TestReadColumnsFromSource:
    """Loading columns from a (path) source for the Data Load button."""

    def test_path_source_returns_columns(self, tmp_path):
        import pandas as pd
        p = tmp_path / 'd.csv'
        pd.DataFrame({'a': [1], 'b': [2], 'c': [3]}).to_csv(p, index=False)
        cols = ConfigBuilder().read_columns_from_source('path', str(p))
        assert cols == ['a', 'b', 'c']

    def test_missing_path_raises(self, tmp_path):
        with pytest.raises(Exception):
            ConfigBuilder().read_columns_from_source('path', str(tmp_path / 'nope.csv'))


#
# ConfigBuilder._build_file_contents
#
class TestBuildFileContents:

    def test_default_paths(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'My Test'}
        fc = cb._build_file_contents()
        assert 'my_test' in fc['p_path']
        assert 'my_test' in fc['c_path']
        assert 'my_test' in fc['f_path']

    def test_custom_paths(self):
        cb = ConfigBuilder()
        cb._project = {
            'project_name': 'P',
            'project_path': 'custom/proj.yaml',
            'config_path': 'custom/conf.yaml',
            'form_path': 'custom/form.yaml',
        }
        fc = cb._build_file_contents()
        assert fc['p_path'] == 'custom/proj.yaml'
        assert fc['c_path'] == 'custom/conf.yaml'
        assert fc['f_path'] == 'custom/form.yaml'

    def test_config_disabled(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P', 'config_enabled': False}
        cb._config = {'info_card_title': '[[species]]'}
        fc = cb._build_file_contents()
        assert fc['config_enabled'] is False
        assert 'info_card_title' in fc['project_cfg']

    def test_form_in_separate_file(self):
        cb = ConfigBuilder()
        cb._project = {'project_name': 'P', 'form_enabled': True, 'config_enabled': True}
        cb._form_config = {'title': 'T'}
        fc = cb._build_file_contents()
        assert fc['form_enabled'] is True
        assert fc['form_cfg'] == {'title': 'T'}


#
# ConfigBuilder.update_config_from_yaml
#
class TestUpdateConfigFromYaml:

    def test_update_project_yaml(self):
        cb = ConfigBuilder()
        yaml_str = "project_name: Updated\ninfo_card_title: '[[species]]'\n"
        result = cb.update_config_from_yaml(yaml_str, 'project')
        assert result is True
        assert cb._project['project_name'] == 'Updated'
        assert cb._project['info_card_title'] == '[[species]]'

    def test_update_form_yaml(self):
        cb = ConfigBuilder()
        yaml_str = "title: My Form\nselect:\n  label: Species\n"
        result = cb.update_config_from_yaml(yaml_str, 'form_config')
        assert result is True
        assert cb._form_config['title'] == 'My Form'

    def test_invalid_yaml_returns_false(self):
        cb = ConfigBuilder()
        result = cb.update_config_from_yaml('{{invalid: yaml: [', 'project')
        assert result is False

    def test_config_ref_extracted(self):
        cb = ConfigBuilder()
        yaml_str = "project_name: P\nconfig: path/to/config.yaml\n"
        cb.update_config_from_yaml(yaml_str, 'project')
        assert cb._project['config_path'] == 'path/to/config.yaml'


#
# ConfigBuilder.list_files
#
class TestListFiles:

    def test_lists_files(self, tmp_path):
        (tmp_path / 'a.yaml').write_text('test')
        (tmp_path / 'b.json').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        names = [r['name'] for r in result]
        assert 'a.yaml' in names
        assert 'b.json' in names

    def test_extension_filter(self, tmp_path):
        (tmp_path / 'a.yaml').write_text('test')
        (tmp_path / 'b.json').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path), extensions=['.yaml'])
        names = [r['name'] for r in result]
        assert 'a.yaml' in names
        assert 'b.json' not in names

    def test_hides_dotfiles(self, tmp_path):
        (tmp_path / '.hidden').write_text('test')
        (tmp_path / 'visible.yaml').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        names = [r['name'] for r in result]
        assert '.hidden' not in names
        assert 'visible.yaml' in names

    def test_missing_dir_returns_empty(self):
        cb = ConfigBuilder()
        result = cb.list_files('/nonexistent/path/12345')
        assert result == []

    def test_marks_directories(self, tmp_path):
        (tmp_path / 'subdir').mkdir()
        (tmp_path / 'file.txt').write_text('test')
        cb = ConfigBuilder()
        result = cb.list_files(str(tmp_path))
        by_name = {r['name']: r for r in result}
        assert by_name['subdir']['is_dir'] is True
        assert by_name['file.txt']['is_dir'] is False


#
# description: its own section + target (H6)
#
class TestDescriptionSection:

    DESC = {'description': {'title': 'About', 'text': 'Read me'}}

    def test_project_section_updates_keep_description(self):
        """Toggling a file checkbox / lock / path must not wipe the description."""
        cb = ConfigBuilder()
        cb.update_section('description', self.DESC)
        cb.update_section('project', {'project_enabled': True, 'project_locked': True,
                                      'project_path': 'p.yaml'})
        assert cb._project['description'] == {'title': 'About', 'text': 'Read me'}

    def test_empty_description_payload_clears_it(self):
        cb = ConfigBuilder()
        cb.update_section('description', self.DESC)
        cb.update_section('description', {})
        assert 'description' not in cb._project
        assert 'description' not in cb._build_file_contents()['project_cfg']

    def test_legacy_project_payload_with_description_still_works(self):
        cb = ConfigBuilder()
        cb.update_section('project', {'description_title': 'Legacy'})
        assert cb._project['description'] == {'title': 'Legacy'}

    def test_target_routes_description_to_chosen_file(self):
        cb = ConfigBuilder()
        cb.update_section('description', self.DESC, target='config')
        files = cb._build_file_contents()
        assert 'description' in files['config_cfg']
        assert 'description' not in files['project_cfg']
        cb.set_section_target('description', 'project')
        files = cb._build_file_contents()
        assert 'description' in files['project_cfg']
        assert 'description' not in files['config_cfg']

    def test_description_independent_of_app_target(self):
        cb = ConfigBuilder()
        cb.update_section('description', self.DESC)               # default target: project
        cb.set_section_target('app', 'config')
        assert 'description' in cb._build_file_contents()['project_cfg']


#
# load_config replaces state (H7)
#
class TestLoadConfigReplacesState:

    def _write(self, tmp_path, name, text):
        p = tmp_path / name
        p.write_text(text)
        return str(p)

    def test_second_load_drops_first_files_keys(self, tmp_path):
        a = self._write(tmp_path, 'a.yaml',
                        'data: {path: a.csv}\naudio: {column: f}\nsort: x\n'
                        'description: {title: A}\n')
        b = self._write(tmp_path, 'b.yaml', 'capture: true\n')
        cb = ConfigBuilder()
        cb.load_config(a, 'config')
        cb.load_config(b, 'config')
        merged = cb.get_merged_config()
        assert merged.get('capture') is True
        for stale in ('data', 'audio', 'sort', 'description'):
            assert stale not in merged

    def test_load_infers_description_target(self, tmp_path):
        self._write(tmp_path, 'c.yaml', 'description: {title: In config}\n')
        proj = self._write(tmp_path, 'p.yaml', 'project_name: P\nconfig: c.yaml\n')
        cb = ConfigBuilder()
        state = cb.load_config(proj)
        assert state['section_targets']['description'] == 'config'
        assert cb._build_file_contents()['config_cfg']['description'] == {'title': 'In config'}


#
# set_section_target output split routing
#
class TestOutputSplitTarget:

    def test_split_sends_project_keys_to_project(self):
        cb = ConfigBuilder()
        cb.update_section('output', {'path': 'out.csv', 'index_column': 'id'}, target='config')
        cb.set_section_target('output', 'split')
        assert cb._project['output'] == {'path': 'out.csv'}
        assert cb._config['output'] == {'index_column': 'id'}


#
# saved paths and the references to them agree
#
class TestConfigRefExtension:

    def test_project_references_saved_file_names(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        cb = ConfigBuilder()
        cb.update_section('project', {'project_name': 'P', 'project_path': 'proj/p',
                                      'config_path': 'cfgs/foo', 'form_path': 'forms/f'})
        cb.update_section('form', {'form': [{'textbox': {'label': 'n'}}]})
        files = cb._build_file_contents()
        assert files['project_cfg']['config'] == 'cfgs/foo.yaml'
        assert files['config_cfg']['form_config'] == 'forms/f.yaml'
        cb.save_all()
        assert (tmp_path / 'cfgs/foo.yaml').exists() and (tmp_path / 'forms/f.yaml').exists()


#
# read_columns: every supported data format
#
class TestReadColumns:

    @pytest.mark.parametrize('name,write', [
        ('d.csv', lambda df, p: df.to_csv(p, index=False)),
        ('d.tsv', lambda df, p: df.to_csv(p, sep='\t', index=False)),
        ('d.json', lambda df, p: df.to_json(p, orient='records')),
        ('lines.json', lambda df, p: df.to_json(p, orient='records', lines=True)),
        ('d.jsonl', lambda df, p: df.to_json(p, orient='records', lines=True)),
        ('d.ndjson', lambda df, p: df.to_json(p, orient='records', lines=True)),
    ])
    def test_formats(self, tmp_path, name, write):
        import pandas as pd
        df = pd.DataFrame({'id': [1, 2], 'species': ['a', 'b']})
        write(df, tmp_path / name)
        assert ConfigBuilder().read_columns(str(tmp_path / name)) == ['id', 'species']

    def test_parquet(self, tmp_path):
        pytest.importorskip('pyarrow')
        import pandas as pd
        p = tmp_path / 'd.parquet'
        pd.DataFrame({'id': [1], 'species': ['a']}).to_parquet(p)
        assert ConfigBuilder().read_columns(str(p)) == ['id', 'species']


#
# load_config: type detection, followed references, inferred targets
#
class TestLoadConfigBranches:

    FORM = 'form:\n  - textbox: {label: n, column: n}\n'

    def _files(self, tmp_path, monkeypatch, files):
        monkeypatch.chdir(tmp_path)
        for rel, text in files.items():
            p = tmp_path / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)

    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            ConfigBuilder().load_config(str(tmp_path / 'nope.yaml'))

    def test_form_file(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {'f.yaml': self.FORM})
        cb = ConfigBuilder()
        state = cb.load_config('f.yaml')
        assert state['detected_type'] == 'form'
        assert state['loaded_paths'] == {'loaded': 'f.yaml', 'form': 'f.yaml'}
        assert cb._project == {'form_path': 'f.yaml', 'form_enabled': True,
                               'project_enabled': False, 'config_enabled': False}
        assert cb._form_config['form'][0]['textbox']['label'] == 'n'

    def test_project_follows_config_and_form_refs(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {
            'p.yaml': 'project_name: P\nconfig: cfg/c.yaml\ndata: {path: d.csv}\n',
            'cfg/c.yaml': 'data: {start_time: s}\naudio: {column: f}\nsort: a\n'
                          'form_config: ../forms/f.yaml\n',
            'forms/f.yaml': self.FORM,
        })
        cb = ConfigBuilder()
        state = cb.load_config('p.yaml')
        assert state['detected_type'] == 'project'
        assert state['loaded_paths'] == {'loaded': 'p.yaml', 'project': 'p.yaml',
                                         'config': os.path.join('cfg', 'c.yaml'),
                                         'form': 'forms/f.yaml'}
        targets = state['section_targets']
        assert (targets['data'], targets['audio'], targets['output'], targets['app']) == (
            'split', 'config', 'project', 'config')
        assert cb._project['form_enabled'] is True and cb._project['config_enabled'] is True
        assert 'form_config' not in cb._config
        assert cb._config['sort'] == 'a'

    def test_project_with_missing_config_ref(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {'p.yaml': 'config: sub/none.yaml\ndata: {path: d}\n'})
        cb = ConfigBuilder()
        state = cb.load_config('p.yaml')
        assert cb._project['config_path'] == os.path.join('sub', 'none.yaml')
        assert cb._project['config_enabled'] is True
        assert cb._project['form_enabled'] is False
        assert all(state['section_targets'][s] == 'project'
                   for s in ('data', 'audio', 'output', 'app'))
        assert 'config' not in state['loaded_paths']

    def test_project_without_config_ref(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {
            'inline.yaml': 'data: {path: d}\naudio: {column: c}\nform_config: {title: t}\n',
            'noform.yaml': 'project_name: P\n',
        })
        cb = ConfigBuilder()
        assert cb.load_config('inline.yaml')['detected_type'] == 'project'
        assert cb._form_config == {'title': 't'}
        assert cb._project['form_enabled'] is False
        assert cb._project['config_enabled'] is False
        cb.load_config('noform.yaml', 'project')
        assert 'form_enabled' not in cb._project      # no form reference: left unset

    def test_config_file_with_missing_form(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {'c.yaml': 'sort: a\nform_config: gone.yaml\n'})
        cb = ConfigBuilder()
        state = cb.load_config('c.yaml')
        assert state['detected_type'] == 'config'
        assert cb._project == {'config_path': 'c.yaml', 'config_enabled': True,
                               'project_enabled': False, 'form_enabled': False}
        assert cb._config == {'sort': 'a'}
        assert all(state['section_targets'][s] == 'config'
                   for s in ('data', 'audio', 'output', 'app'))

    def test_file_type_overrides_detection(self, tmp_path, monkeypatch):
        self._files(tmp_path, monkeypatch, {'f.yaml': self.FORM})
        assert ConfigBuilder().load_config('f.yaml', 'config')['detected_type'] == 'config'


#
# set_section_target moves existing values
#
class TestSetSectionTarget:

    def test_split_to_project_merges_with_project_winning(self):
        cb = ConfigBuilder()
        cb._project['data'] = {'path': 'p.csv', 'index_column': 'p'}
        cb._config['data'] = {'index_column': 'c', 'start_time': 's'}
        cb.set_section_target('data', 'project')
        assert cb._project['data'] == {'index_column': 'p', 'start_time': 's', 'path': 'p.csv'}
        assert 'data' not in cb._config

    def test_project_to_config_moves_section(self):
        cb = ConfigBuilder()
        cb.update_section('audio', {'column': 'f', 'uri': 'u'}, target='project')
        cb.set_section_target('audio', 'config')
        assert cb._config['audio'] == {'column': 'f', 'uri': 'u'}
        assert 'audio' not in cb._project

    def test_app_keys_move(self):
        cb = ConfigBuilder()
        cb.update_section('app', {'sort': 'a', 'width': 3})       # default target: config
        cb.set_section_target('app', 'project')
        assert cb._project['sort'] == 'a' and cb._project['width'] == 3
        assert 'sort' not in cb._config

    def test_invalid_section_or_target_is_ignored(self):
        cb = ConfigBuilder()
        before = dict(cb._section_targets)
        cb.set_section_target('nope', 'config')
        cb.set_section_target('data', 'nowhere')
        assert cb._section_targets == before


#
# save_single / save_all
#
class TestSave:

    def test_save_single_respects_lock_and_type(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        cb = ConfigBuilder()
        cb.update_section('app', {'sort': 'a'})        # (an app payload without a name clears it)
        cb.update_section('project', {'project_name': 'P', 'config_locked': True})
        assert cb.save_single('config') == ''
        assert cb.save_single('bogus') == ''
        assert cb.save_single('project') == 'projects/p.yaml'
        assert 'config: config/p.yaml' in (tmp_path / 'projects/p.yaml').read_text()

    def test_save_all_writes_multiline_as_block(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        cb = ConfigBuilder()
        cb.update_section('description', {'description': {'text': 'a\nb'}})
        saved = cb.save_all()
        assert saved == {'project': 'projects/config.yaml', 'config': 'config/config.yaml',
                         'form': 'forms/config.yaml'}
        assert 'text: |-\n' in (tmp_path / 'projects/config.yaml').read_text()
        assert cb._saved_path == 'projects/config.yaml' and cb._dirty is False


#
# check_audio_url: FLAC header path
#
class TestCheckAudioUrl:

    def test_flac_header(self, monkeypatch):
        import struct
        from jupyter_bioacoustic import api
        streaminfo = bytearray(34)
        streaminfo[10:13] = struct.pack('>I', (16000 << 4) & 0xFFFFF0)[1:]
        streaminfo[13:18] = struct.pack('>Q', 32000)[3:]
        header = b'fLaC' + bytes([0x80]) + (34).to_bytes(3, 'big') + bytes(streaminfo)
        monkeypatch.setattr(api, '_cloud_get_bytes', lambda value, byte_range: header)
        assert ConfigBuilder().check_audio_url('s3://b/k.flac?x=1') == {
            'ok': True, 'sample_rate': 16000, 'duration': 2.0}
