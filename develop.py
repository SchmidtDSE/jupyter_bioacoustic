"""
Develop

Link the built JupyterLab extension (jupyter_bioacoustic/labextension) into every Jupyter
data dir this repo uses: the user's, and each pixi environment's. Replaces
``jupyter labextension develop``, whose pip step is broken for this layout.

Each target is a real directory of per-file symlinks, NOT one symlink to the whole
directory. A pip editable reinstall (pixi does one whenever pyproject.toml changes)
uninstalls the extension's shared-data files from each environment; through a directory
symlink that deleted the tracked bundle itself. Per-file links are removed instead.

    python develop.py          (also: pixi run relink; runs on every pixi activation)

License: BSD 3-Clause
"""
#
# Imports
#
import argparse
import json
import shutil
import sys
from pathlib import Path


#
# CONSTANTS
#
ROOT: Path = Path(__file__).resolve().parent
PACKAGE_DIR: Path = ROOT / 'jupyter_bioacoustic'


#
# PUBLIC
#
def main() -> None:
    """Mirror the built labextension into every Jupyter data dir.

    Raises:
        SystemExit: With status 1 if the labextension hasn't been built.
    """
    argparse.ArgumentParser(description=__doc__.split('\n\n')[1]).parse_args()
    pkg = json.loads((PACKAGE_DIR / 'package.json').read_text())
    out_dir = (PACKAGE_DIR / pkg['jupyterlab']['outputDir']).resolve()
    if not out_dir.exists():
        print(f'ERROR: labextension not found at {out_dir} (run `pixi run build`)', file=sys.stderr)
        sys.exit(1)

    print(f"Linking {pkg['name']} from {out_dir}")
    for target in extension_targets(pkg['name']):
        mirror(out_dir, target)
        print(f'  → {target}')
    print('Done')


def extension_targets(name: str) -> list[Path]:
    """Where JupyterLab looks for the extension: the user data dir + each pixi env with Jupyter.

    Args:
        name: The extension's npm package name.

    Returns:
        Target directories (they may not exist yet).
    """
    import jupyter_core.paths as jcp
    targets = [Path(jcp.jupyter_data_dir()) / 'labextensions' / name]
    envs_dir = ROOT / '.pixi' / 'envs'
    if envs_dir.exists():
        for env in sorted(envs_dir.iterdir()):
            if (env / 'share' / 'jupyter').exists():
                targets.append(env / 'share' / 'jupyter' / 'labextensions' / name)
    return targets


def mirror(src: Path, target: Path) -> None:
    """Make ``target`` a real directory whose files are symlinks to ``src``'s files.

    Removing anything under ``target`` (e.g. pip uninstalling shared-data files) then
    removes links, never the files in ``src``.

    Args:
        src: The built labextension directory.
        target: Where JupyterLab should find it.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        target.unlink()                # an old whole-directory link: drop only the link
    elif target.exists():
        shutil.rmtree(target)          # links (or pip's copies), never the sources
    for path in sorted(src.rglob('*')):
        if path.is_file():
            link = target / path.relative_to(src)
            link.parent.mkdir(parents=True, exist_ok=True)
            link.symlink_to(path)


if __name__ == '__main__':
    main()
