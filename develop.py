"""
Creates the JupyterLab labextension symlink manually.
Equivalent to 'jupyter labextension develop' but without the broken pip-install step.

Handles all pixi environments (default, dev, demo, etc.) so that
`pixi run build` + refresh always picks up changes.
"""
import json, sys, shutil, os
from pathlib import Path
import jupyter_core.paths as jcp

root = Path(__file__).parent
pkg  = json.loads((root / 'jupyter_bioacoustic' / 'package.json').read_text())

name    = pkg['name']
out_dir = (root / 'jupyter_bioacoustic' / pkg['jupyterlab']['outputDir']).resolve()

if not out_dir.exists():
    print(f'ERROR: labextension not found at {out_dir}', file=sys.stderr)
    sys.exit(1)


def link_to(target_dir: Path):
    """Replace target_dir with a symlink to out_dir."""
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    if target_dir.is_symlink():
        target_dir.unlink()
    elif target_dir.exists():
        shutil.rmtree(str(target_dir))
    target_dir.symlink_to(out_dir)
    print(f'  → {target_dir}')


print(f'Linking {name} from {out_dir}')

# 1. System/env Jupyter data dir (what jupyter_core reports)
system_ext = Path(jcp.jupyter_data_dir()) / 'labextensions' / name
link_to(system_ext)

# 2. All pixi environments
pixi_dir = root / '.pixi' / 'envs'
if pixi_dir.exists():
    for env in sorted(pixi_dir.iterdir()):
        ext_path = env / 'share' / 'jupyter' / 'labextensions' / name
        # Only fix envs that have jupyter installed (share/jupyter exists)
        if (env / 'share' / 'jupyter').exists():
            link_to(ext_path)

print('Done')
