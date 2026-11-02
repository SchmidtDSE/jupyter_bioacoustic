"""
Tests for config_builder/files.py

YAML dump/read/write helpers (literal blocks, a private Dumper), slugs and cwd-relative paths.

License: BSD 3-Clause
"""
import os
import sys

import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.config_builder.files import (
    LiteralDumper,
    LiteralStr,
    dump_yaml,
    read_yaml,
    slugify,
    to_cwd_relative,
    write_yaml,
)


class TestDumpYaml:

    def test_multiline_strings_are_literal_blocks(self):
        text = dump_yaml({'description': {'text': 'line1\nline2\n'}, 'b': 1})
        assert 'text: |\n' in text
        assert yaml.safe_load(text) == {'description': {'text': 'line1\nline2\n'}, 'b': 1}

    def test_keeps_key_order_and_block_style(self):
        assert dump_yaml({'z': 1, 'a': [1, 2]}) == 'z: 1\na:\n- 1\n- 2\n'

    def test_does_not_touch_the_global_dumper(self):
        assert LiteralStr not in yaml.Dumper.yaml_representers
        assert LiteralStr in LiteralDumper.yaml_representers
        dump_yaml({'a': 'x\ny'})
        assert LiteralStr not in yaml.Dumper.yaml_representers

    def test_writes_to_a_stream(self, tmp_path):
        p = tmp_path / 'o.yaml'
        with open(p, 'w') as f:
            assert dump_yaml({'a': 1}, f) is None
        assert p.read_text() == 'a: 1\n'


class TestReadWriteYaml:

    def test_write_adds_extension_and_dirs(self, tmp_path):
        path = write_yaml(str(tmp_path / 'deep' / 'cfg'), {'a': 'x\ny'})
        assert path == str(tmp_path / 'deep' / 'cfg.yaml')
        assert read_yaml(path) == {'a': 'x\ny'}

    def test_keeps_yml_extension(self, tmp_path):
        assert write_yaml(str(tmp_path / 'c.yml'), {}).endswith('c.yml')

    def test_read_empty_file_is_empty_dict(self, tmp_path):
        p = tmp_path / 'e.yaml'
        p.write_text('')
        assert read_yaml(str(p)) == {}


class TestSlugify:

    def test_slugs(self):
        assert slugify('My Proj!') == 'my_proj'
        assert slugify('  A--b  c ') == 'a_b_c'
        assert slugify(42) == '42'
        assert slugify('!!!') == ''


class TestToCwdRelative:

    def test_relative_to_cwd(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        assert to_cwd_relative(str(tmp_path / 'a' / 'b.yaml')) == os.path.join('a', 'b.yaml')
