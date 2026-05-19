"""
Test CLI

Tests for the jba command-line interface covering
lab, config list, and describe commands.

License: BSD 3-Clause
"""
import os

import pytest
from click.testing import CliRunner

from jupyter_bioacoustic.cli import main, _find_yaml, _print_yaml_names


#
# CONSTANTS
#
DEMO_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'jupyter_bioacoustic_demo')
DEMO_CONFIG_DIR = os.path.join(DEMO_DIR, 'annotator_config')


#
# Fixtures
#
@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def config_dir(tmp_path):
    """Create a minimal config directory structure."""
    projects = tmp_path / 'projects'
    projects.mkdir()
    (projects / 'my_project.yaml').write_text(
        'project_name: My Project\nconfig: config/my_project.yaml\n'
        'data:\n  path: data/input.csv\n'
    )
    config = tmp_path / 'config'
    config.mkdir()
    (config / 'my_project.yaml').write_text(
        'audio: audio_path\nident_column: species\n'
        'display_columns: [confidence]\n'
        'form_config:\n  title:\n    value: REVIEW\n'
        '  submission_buttons:\n    submit:\n      label: Submit\n'
    )
    forms = tmp_path / 'forms'
    forms.mkdir()
    (forms / 'simple.yaml').write_text(
        'title:\n  value: ANNOTATE\nselect:\n  label: Species\n'
        '  column: species\n  items:\n    - value: owl\n    - value: hawk\n'
        'submission_buttons:\n  submit:\n    label: Save\n'
    )
    return tmp_path


#
# main group
#
class TestMainGroup:

    def test_help(self, runner):
        result = runner.invoke(main, ['--help'])
        assert result.exit_code == 0
        assert 'jupyter-bioacoustic' in result.output


#
# jba lab
#
class TestLab:

    def test_help(self, runner):
        result = runner.invoke(main, ['lab', '--help'])
        assert result.exit_code == 0
        assert 'rate-limit' in result.output


#
# jba config list
#
class TestConfigList:

    def test_lists_all_subdirs(self, runner, config_dir):
        result = runner.invoke(main, ['config', 'list', '-d', str(config_dir)])
        assert result.exit_code == 0
        assert 'projects:' in result.output
        assert 'config:' in result.output
        assert 'forms:' in result.output
        assert 'my_project' in result.output
        assert 'simple' in result.output

    def test_filter_projects_only(self, runner, config_dir):
        result = runner.invoke(main, ['config', 'list', '-d', str(config_dir), '-p'])
        assert result.exit_code == 0
        assert 'projects:' in result.output
        assert 'config:' not in result.output
        assert 'forms:' not in result.output

    def test_filter_configs_only(self, runner, config_dir):
        result = runner.invoke(main, ['config', 'list', '-d', str(config_dir), '-c'])
        assert result.exit_code == 0
        assert 'config:' in result.output
        assert 'projects:' not in result.output

    def test_filter_forms_only(self, runner, config_dir):
        result = runner.invoke(main, ['config', 'list', '-d', str(config_dir), '-f'])
        assert result.exit_code == 0
        assert 'forms:' in result.output
        assert 'projects:' not in result.output

    def test_missing_directory(self, runner):
        result = runner.invoke(main, ['config', 'list', '-d', '/nonexistent/path'])
        assert result.exit_code == 1

    def test_no_extension_in_output(self, runner, config_dir):
        result = runner.invoke(main, ['config', 'list', '-d', str(config_dir)])
        assert '.yaml' not in result.output

    def test_nested_directories(self, runner, tmp_path):
        projects = tmp_path / 'projects'
        sub = projects / 'nested'
        sub.mkdir(parents=True)
        (sub / 'deep.yaml').write_text('project_name: Deep\n')
        result = runner.invoke(main, ['config', 'list', '-d', str(tmp_path), '-p'])
        assert 'nested/' in result.output
        assert 'deep' in result.output


#
# jba describe
#
class TestDescribe:

    def test_describe_config(self, runner, config_dir):
        result = runner.invoke(main, ['describe', 'my_project', '-d', str(config_dir), '-c'])
        assert result.exit_code == 0
        assert 'Config Configuration Summary' in result.output
        assert 'species' in result.output
        assert 'PROJECT' not in result.output

    def test_describe_form(self, runner, config_dir):
        result = runner.invoke(main, ['describe', 'simple', '-d', str(config_dir), '-f'])
        assert result.exit_code == 0
        assert 'Form Configuration Summary' in result.output
        assert 'ANNOTATE' in result.output
        assert 'PROJECT' not in result.output
        assert 'DATA' not in result.output

    def test_describe_project_priority(self, runner, config_dir):
        result = runner.invoke(main, ['describe', 'my_project', '-d', str(config_dir)])
        assert result.exit_code == 0
        assert 'Project Configuration Summary' in result.output
        assert 'PROJECT' in result.output

    def test_describe_not_found(self, runner, config_dir):
        result = runner.invoke(main, ['describe', 'nonexistent', '-d', str(config_dir)])
        assert result.exit_code == 1
        assert 'No configuration found' in result.output

    def test_describe_scoped_not_found(self, runner, config_dir):
        result = runner.invoke(main, ['describe', 'simple', '-d', str(config_dir), '-c'])
        assert result.exit_code == 1
        assert 'No config configuration found' in result.output

    def test_describe_missing_directory(self, runner):
        result = runner.invoke(main, ['describe', 'x', '-d', '/nonexistent'])
        assert result.exit_code == 1


#
# _find_yaml
#
class TestFindYaml:

    def test_finds_existing(self, config_dir):
        from pathlib import Path
        result = _find_yaml(config_dir / 'projects', 'my_project')
        assert result is not None
        assert result.stem == 'my_project'

    def test_returns_none_for_missing(self, config_dir):
        from pathlib import Path
        assert _find_yaml(config_dir / 'projects', 'nope') is None

    def test_returns_none_for_nonexistent_dir(self, tmp_path):
        from pathlib import Path
        assert _find_yaml(tmp_path / 'nope', 'anything') is None

    def test_finds_yml_extension(self, tmp_path):
        from pathlib import Path
        d = tmp_path / 'projects'
        d.mkdir()
        (d / 'alt.yml').write_text('project_name: Alt\n')
        result = _find_yaml(d, 'alt')
        assert result is not None


#
# Integration with demo configs (if available)
#
@pytest.mark.skipif(
    not os.path.isdir(DEMO_CONFIG_DIR),
    reason='Demo config directory not found',
)
class TestDemoIntegration:

    def test_list_demo_configs(self, runner):
        result = runner.invoke(main, ['config', 'list', '-d', DEMO_CONFIG_DIR])
        assert result.exit_code == 0
        assert 'projects:' in result.output

    def test_describe_simple_annotator(self, runner):
        result = runner.invoke(main, [
            'describe', 'simple_annotator', '-d', DEMO_CONFIG_DIR,
        ])
        assert result.exit_code == 0
        assert 'Configuration Summary' in result.output
