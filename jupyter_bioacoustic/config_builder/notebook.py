import json
import logging
import os
import shutil
from pathlib import Path

_log = logging.getLogger('jupyter_bioacoustic.config_builder')


_NB_DIR = Path(__file__).parent / 'nb'
_STARTER = _NB_DIR / 'starter-notebook.ipynb'


def copy_starter_notebook(dest_dir: str = '.') -> dict:
    dest = Path(dest_dir).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / 'starter-notebook.ipynb'
    n = 1
    while target.exists():
        target = dest / f'starter-notebook-{n}.ipynb'
        n += 1
    shutil.copy2(str(_STARTER), str(target))
    _log.info('copied starter notebook to %s', target)
    return {'path': str(target), 'relative': os.path.relpath(str(target))}
