"""Notebook management utilities.

Functions for copying and managing Jupyter notebook templates.

License: BSD 3-Clause
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path

#
# Constants
#
_LOG = logging.getLogger('jupyter_bioacoustic.config_builder')
_NB_DIR = Path(__file__).parent / 'nb'
_STARTER_NOTEBOOK = 'starter-notebook.ipynb'
_STARTER_PATH = _NB_DIR / _STARTER_NOTEBOOK
_DEFAULT_DEST_DIR = '.'
_INITIAL_COUNTER = 1

#
# Public API
#
def copy_starter_notebook(dest_dir: str = _DEFAULT_DEST_DIR) -> dict[str, str]:
    """Copy the starter notebook template to a destination directory.

    Args:
        dest_dir: Directory to copy the notebook to. Defaults to current directory.

    Returns:
        Dict containing the absolute and relative paths of the copied notebook.
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
