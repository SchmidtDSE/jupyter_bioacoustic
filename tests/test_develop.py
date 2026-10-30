"""
Test Develop

develop.py mirrors the built labextension into Jupyter data dirs as per-file symlinks, so
removing what's in a target (pip uninstalling the extension's shared-data files during an
editable reinstall) can never delete the tracked bundle.

License: BSD 3-Clause
"""
#
# Imports
#
import importlib.util
import os
from pathlib import Path

#
# CONSTANTS
#
_DEVELOP: Path = Path(__file__).resolve().parents[1] / 'develop.py'


#
# PUBLIC
#
def test_uninstalling_from_a_target_keeps_the_sources(tmp_path):
    develop = _load_develop()
    src = _make_bundle(tmp_path / 'labextension')
    target = tmp_path / 'env' / 'labextensions' / 'jupyter-bioacoustic'
    target.parent.mkdir(parents=True)
    target.symlink_to(src)                      # the old layout: one whole-directory link

    develop.mirror(src, target)
    assert not target.is_symlink() and (target / 'static' / 'app.js').is_symlink()
    assert (target / 'static' / 'app.js').read_text() == 'js'

    for path in [p for p in target.rglob('*') if p.is_symlink()]:
        os.remove(path)                         # what pip uninstall does to shared-data files
    assert sorted(p.name for p in src.rglob('*') if p.is_file()) == ['app.js', 'package.json']


def test_mirror_refreshes_after_a_rebuild(tmp_path):
    develop = _load_develop()
    src = _make_bundle(tmp_path / 'labextension')
    target = tmp_path / 'target'
    develop.mirror(src, target)
    (src / 'static' / 'app.js').unlink()
    (src / 'static' / 'app.v2.js').write_text('js2')       # new hashed bundle name
    develop.mirror(src, target)
    assert sorted(p.name for p in (target / 'static').iterdir()) == ['app.v2.js']


#
# INTERNAL
#
def _load_develop():
    spec = importlib.util.spec_from_file_location('develop', _DEVELOP)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_bundle(path: Path) -> Path:
    (path / 'static').mkdir(parents=True)
    (path / 'package.json').write_text('{}')
    (path / 'static' / 'app.js').write_text('js')
    return path
