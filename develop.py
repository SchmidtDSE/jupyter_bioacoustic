"""
Creates the JupyterLab labextension symlink manually.
Equivalent to 'jupyter labextension develop' but without the broken pip-install step.
"""
import json, sys, shutil
from pathlib import Path
import jupyter_core.paths as jcp

root = Path(__file__).parent
pkg  = json.loads((root / 'jupyter_bioacoustic' / 'package.json').read_text())

name    = pkg['name']
out_dir = (root / 'jupyter_bioacoustic' / pkg['jupyterlab']['outputDir']).resolve()

if not out_dir.exists():
    print(f'ERROR: labextension not found at {out_dir}', file=sys.stderr)
    sys.exit(1)

ext_dir = Path(jcp.jupyter_data_dir()) / 'labextensions' / name
ext_dir.parent.mkdir(parents=True, exist_ok=True)

if ext_dir.is_symlink():
    ext_dir.unlink()
elif ext_dir.exists():
    shutil.rmtree(str(ext_dir))

ext_dir.symlink_to(out_dir)
print(f'Linked {name}')
print(f'  {out_dir}')
print(f'  → {ext_dir}')
