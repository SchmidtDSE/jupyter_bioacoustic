"""
Tests for config_builder/templates.py and ConfigBuilder template methods.

License: BSD 3-Clause
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.config_builder import ConfigBuilder
from jupyter_bioacoustic.config_builder.templates import (
    build_template_config,
    list_templates,
    load_template,
)


#
# list_templates / load_template
#
class TestListAndLoad:
    """Discovery and loading of the shipped templates."""

    def test_lists_shipped_templates(self):
        names = {t['name'] for t in list_templates()}
        assert {'annotate', 'review_detections', 'quick_validate'} <= names

    def test_entries_have_title_and_short_description(self):
        for t in list_templates():
            assert t['title']
            assert 'short_description' in t

    def test_sorted_by_name(self):
        names = [t['name'] for t in list_templates()]
        assert names == sorted(names)

    def test_load_returns_sections(self):
        tpl = load_template('annotate')
        assert tpl['title'] == 'Annotate (Boxes + Species)'
        assert 'project' in tpl and 'config' in tpl and 'form' in tpl

    def test_load_unknown_raises(self):
        with pytest.raises(FileNotFoundError):
            load_template('does_not_exist')

    def test_load_rejects_path_traversal(self):
        with pytest.raises(FileNotFoundError):
            load_template('../core')


#
# build_template_config — substitution
#
class TestBuildTemplateConfig:
    """Placeholder substitution, scope selection, and empty-stripping."""

    def _vals(self, **kw):
        base = {'data_value': 'data/clips.csv', 'data_index_column': 'id'}
        base.update(kw)
        return base

    def test_project_scope_includes_all_sections(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'project', self._vals())
        assert set(out) == {'project', 'config', 'form'}

    def test_data_substituted_into_project(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'project', self._vals())
        assert out['project']['data'] == {
            'source_type': 'path', 'value': 'data/clips.csv', 'index_column': 'id',
        }

    def test_audio_uses_default(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'project', self._vals())
        assert out['project']['audio'] == {'source_type': 'column', 'value': 'audio_url'}

    def test_empty_optional_output_dropped(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'project', self._vals())
        assert 'output' not in out['project']

    def test_output_uri_kept_when_provided(self):
        tpl = load_template('annotate')
        out = build_template_config(
            tpl, 'project', self._vals(output_uri='s3://b/out.csv'),
        )
        assert out['project']['output'] == {'uri': 's3://b/out.csv'}

    def test_form_placeholders_substituted(self):
        tpl = load_template('annotate')
        out = build_template_config(
            tpl, 'project',
            self._vals(species_file='data/sp.csv', species_column='name'),
        )
        items = out['form']['dynamic_forms']['species_form'][0]['select']['items']
        assert items['path'] == 'data/sp.csv'
        assert items['value'] == 'name'

    def test_title_default_applied(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'project', self._vals())
        assert out['form']['title']['value'] == 'Bioacoustic Annotator'

    def test_config_scope_omits_project(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'config', {})
        assert 'project' not in out
        assert set(out) == {'config', 'form'}

    def test_form_scope_only_form(self):
        tpl = load_template('annotate')
        out = build_template_config(tpl, 'form', {})
        assert set(out) == {'form'}

    def test_missing_required_raises(self):
        tpl = load_template('annotate')
        with pytest.raises(ValueError, match='required'):
            build_template_config(tpl, 'project', {})

    def test_unknown_scope_raises(self):
        tpl = load_template('annotate')
        with pytest.raises(ValueError, match='scope'):
            build_template_config(tpl, 'bogus', {})


#
# ConfigBuilder.apply_template
#
class TestApplyTemplate:
    """End-to-end apply into the three dicts + saved file routing."""

    def _apply(self, scope='project', **vals):
        cb = ConfigBuilder()
        base = {'data_value': 'data/clips.csv', 'data_index_column': 'id'}
        base.update(vals)
        state = cb.apply_template('annotate', scope, 'My Project', base)
        return cb, state

    def test_state_shape(self):
        _, state = self._apply()
        for key in ('project', 'config', 'form_config', 'project_yaml',
                    'config_yaml', 'form_yaml', 'section_targets', 'dirty'):
            assert key in state

    def test_project_name_and_dicts(self):
        cb, _ = self._apply()
        assert cb._project['project_name'] == 'My Project'
        assert cb._project['data']['value'] == 'data/clips.csv'
        assert cb._config.get('capture') is True
        assert 'annotation' in cb._form_config

    def test_targets_route_sources_to_project(self):
        cb, _ = self._apply()
        assert cb._section_targets['data'] == 'project'
        assert cb._section_targets['app'] == 'config'

    def test_enabled_flags_project_scope(self):
        cb, _ = self._apply('project')
        assert cb._project['project_enabled'] is True
        assert cb._project['config_enabled'] is True
        assert cb._project['form_enabled'] is True

    def test_config_scope_disables_project(self):
        cb = ConfigBuilder()
        cb.apply_template('annotate', 'config', 'My Project', {})
        assert cb._project['project_enabled'] is False
        assert cb._project['config_enabled'] is True

    def test_saved_files_routing(self, tmp_path):
        cb, _ = self._apply()
        cwd = os.getcwd()
        os.chdir(tmp_path)
        try:
            saved = cb.save_all()
        finally:
            os.chdir(cwd)
        # slug from "My Project", under annotator_config/ (create-new convention)
        assert saved['project'] == 'annotator_config/projects/my_project.yaml'
        assert saved['config'] == 'annotator_config/config/my_project.yaml'
        assert saved['form'] == 'annotator_config/forms/my_project.yaml'
        assert os.path.exists(
            tmp_path / 'annotator_config' / 'projects' / 'my_project.yaml'
        )

    def test_project_file_contains_data_and_config_ref(self, tmp_path):
        import yaml
        cb, _ = self._apply()
        cwd = os.getcwd()
        os.chdir(tmp_path)
        try:
            cb.save_all()
            with open(tmp_path / 'annotator_config' / 'projects' / 'my_project.yaml') as f:
                proj = yaml.safe_load(f)
        finally:
            os.chdir(cwd)
        assert proj['data']['value'] == 'data/clips.csv'
        assert proj['config'] == 'annotator_config/config/my_project.yaml'
        assert 'capture' not in proj  # app settings live in the config file
