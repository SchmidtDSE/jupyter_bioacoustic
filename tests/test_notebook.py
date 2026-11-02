"""
Tests for config_builder/notebook.py

copy_starter_notebook: copies the bundled notebook without overwriting.

License: BSD 3-Clause
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic.config_builder import copy_starter_notebook


class TestCopyStarterNotebook:

    def test_copies_without_overwriting(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        first = copy_starter_notebook('nbs')
        second = copy_starter_notebook('nbs')
        assert first == {'path': str(tmp_path / 'nbs' / 'starter-notebook.ipynb'),
                         'relative': os.path.join('nbs', 'starter-notebook.ipynb')}
        assert second['path'].endswith('starter-notebook-1.ipynb')
        assert (tmp_path / 'nbs' / 'starter-notebook-1.ipynb').stat().st_size > 0
