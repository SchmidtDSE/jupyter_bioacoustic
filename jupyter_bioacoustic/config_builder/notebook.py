"""
Starter Notebook

Copy the bundled starter notebook (``config_builder/nb/starter-notebook.ipynb``) into a
project directory.

License: BSD 3-Clause
"""
#
# Imports
#
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path


#
# CONSTANTS
#
_LOG = logging.getLogger('jupyter_bioacoustic.config_builder')
_NB_DIR = Path(__file__).parent / 'nb'
_STARTER_NOTEBOOK = 'starter-notebook.ipynb'
_STARTER_PATH = _NB_DIR / _STARTER_NOTEBOOK
_DEFAULT_DEST_DIR = '.'
_INITIAL_COUNTER = 1


#
# PUBLIC
#
def copy_starter_notebook(dest_dir: str = _DEFAULT_DEST_DIR) -> dict[str, str]:
    """Copy the starter notebook template to a destination directory.

    An existing notebook is never overwritten: the copy is named ``starter-notebook-<n>.ipynb``
    with the first free ``n``.

    Args:
        dest_dir: Directory to copy the notebook to (created if needed). Defaults to the
            current directory.

    Returns:
        ``{'path': absolute path, 'relative': path relative to the cwd}`` of the copy.
    """
    dest = Path(dest_dir).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / _STARTER_NOTEBOOK
    n = _INITIAL_COUNTER
    while target.exists():
        target = dest / f'starter-notebook-{n}.ipynb'
        n += 1
    shutil.copy2(str(_STARTER_PATH), str(target))
    _LOG.info('copied starter notebook to %s', target)
    return {'path': str(target), 'relative': os.path.relpath(str(target))}
