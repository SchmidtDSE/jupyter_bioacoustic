"""
CLI

Command-line interface for jupyter-bioacoustic. Provides
convenience commands for launching JupyterLab, listing
configuration files, describing configurations, and
validating configurations.

Usage:
    jba lab
    jba list
    jba describe [name]
    jba validate [name]

License: BSD 3-Clause
"""  # noqa: D415
#
# Imports
#
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
import click

from .config_builder.core import ConfigBuilder
from .config_builder.summary import build_summary_from_builder, format_text


#
# CONSTANTS
#
DEFAULT_CONFIG_DIR = 'annotator_config'
DEFAULT_RATE_LIMIT = '1e10'
DEBUG_FLAG_VALUE = '__FLAG__'
YAML_EXTENSIONS = ('.yaml', '.yml')
CONFIG_SUBDIRS = ('projects', 'config', 'forms')
FLAG_SCOPE_MAP = {'search_project': 'project', 'search_config': 'config', 'search_form': 'form'}
SCOPE_SUBDIR = {'project': 'projects', 'config': 'config', 'form': 'forms'}
SCOPE_LABEL = {'project': 'Project', 'config': 'Config', 'form': 'Form'}
PIXI_CLEAN_CMD = ['pixi', 'clean', 'cache', '--pypi', '-y']
PIXI_INSTALL_CMD = ['pixi', 'install']

# Reusable Click parameter decorators (shared by ``list``, ``describe`` and ``validate``).
NAME_ARGUMENT = click.argument('name', required=False, default=None)
DIR_OPTION = click.option(
    '-d', '--dir', 'directory',
    default=DEFAULT_CONFIG_DIR,
    show_default=True,
    help='Root configuration directory.',
)
SEARCH_PROJECT_OPTION = click.option(
    '-p', '--project', 'search_project',
    is_flag=False, flag_value=True, default=None,
    help='Search projects only. Optionally pass a file path.',
)
SEARCH_CONFIG_OPTION = click.option(
    '-c', '--config', 'search_config',
    is_flag=False, flag_value=True, default=None,
    help='Search configs only. Optionally pass a file path.',
)
SEARCH_FORM_OPTION = click.option(
    '-f', '--form', 'search_form',
    is_flag=False, flag_value=True, default=None,
    help='Search forms only. Optionally pass a file path.',
)


#
# PUBLIC
#
@click.group()
def main() -> None:
    """jupyter-bioacoustic CLI."""


@main.command()
@click.option(
    '-r', '--rate-limit',
    default=DEFAULT_RATE_LIMIT,
    show_default=True,
    help='IOPub data rate limit for ServerApp.',
)
@click.option(
    '-d', '--debug',
    is_flag=False,
    flag_value=DEBUG_FLAG_VALUE,
    default=None,
    help='Enable debug logging. Optionally pass a log file path.',
)
@click.option(
    '-c', '--clean',
    is_flag=True,
    default=False,
    help='Clear pixi PyPI cache and reinstall before launching.',
)
def lab(rate_limit: str, debug: str | None, clean: bool) -> None:
    """Launch JupyterLab with the required IOPub rate limit.

    \f
    Args:
        rate_limit: Value for ``--ServerApp.iopub_data_rate_limit``.
        debug: ``None`` (debug off), the flag sentinel (debug on, default log
            path) or a log file path.
        clean: Clear the pixi PyPI cache and reinstall before launching.
    """  # noqa: D301
    if clean:
        _clean_pixi_cache()
    env = os.environ.copy()
    if debug is not None:
        env['JBA_DEBUG_MODE'] = '1'
        if debug != DEBUG_FLAG_VALUE:
            log_path = Path(debug)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            env['JBA_LOG_DIR'] = str(log_path.parent)
            env['JBA_LOG_FILE'] = log_path.name
    cmd = [
        sys.executable, '-m', 'jupyter', 'lab',
        f'--ServerApp.iopub_data_rate_limit={rate_limit}',
    ]
    subprocess.run(cmd, env=env)


@main.command('list')
@DIR_OPTION
@click.option('-p', '--project', 'show_projects', is_flag=True, help='Show only projects.')
@click.option('-c', '--config', 'show_configs', is_flag=True, help='Show only configs.')
@click.option('-f', '--form', 'show_forms', is_flag=True, help='Show only forms.')
def config_list(
    directory: str,
    show_projects: bool,
    show_configs: bool,
    show_forms: bool,
) -> None:
    """List configuration files.

    \f
    Args:
        directory: Root configuration directory.
        show_projects: Show only ``projects/``.
        show_configs: Show only ``config/``.
        show_forms: Show only ``forms/``.
    """  # noqa: D301
    root = Path(directory)
    if not root.is_dir():
        click.echo(f'Directory not found: {directory}', err=True)
        sys.exit(1)

    show_all = not (show_projects or show_configs or show_forms)
    filters = {
        'projects': show_all or show_projects,
        'config': show_all or show_configs,
        'forms': show_all or show_forms,
    }

    first = True
    for subdir in CONFIG_SUBDIRS:
        if not filters[subdir]:
            continue
        if not first:
            click.echo('---')
        first = False
        click.echo(f'{subdir}:')
        _print_yaml_names(root / subdir)


@main.command()
@NAME_ARGUMENT
@DIR_OPTION
@SEARCH_PROJECT_OPTION
@SEARCH_CONFIG_OPTION
@SEARCH_FORM_OPTION
def describe(
    name: str | None,
    directory: str,
    search_project: str | bool | None,
    search_config: str | bool | None,
    search_form: str | bool | None,
) -> None:
    """Describe a configuration by name or path.

    \f
    Args:
        name: Configuration name (file stem) to search for.
        directory: Root configuration directory.
        search_project: ``-p`` value: ``True`` (flag only) or a path.
        search_config: ``-c`` value: ``True`` (flag only) or a path.
        search_form: ``-f`` value: ``True`` (flag only) or a path.
    """  # noqa: D301
    cb, _path, scope, label = _load_target(
        name, directory, search_project, search_config, search_form,
    )
    click.echo(f'{label} Configuration Summary')
    click.echo('=' * 40)
    sections = build_summary_from_builder(cb, scope=scope)
    click.echo(format_text(sections))


@main.command()
@NAME_ARGUMENT
@DIR_OPTION
@SEARCH_PROJECT_OPTION
@SEARCH_CONFIG_OPTION
@SEARCH_FORM_OPTION
def validate(
    name: str | None,
    directory: str,
    search_project: str | bool | None,
    search_config: str | bool | None,
    search_form: str | bool | None,
) -> None:
    """Validate a configuration by name or path.

    \f
    Args:
        name: Configuration name (file stem) to search for.
        directory: Root configuration directory.
        search_project: ``-p`` value: ``True`` (flag only) or a path.
        search_config: ``-c`` value: ``True`` (flag only) or a path.
        search_form: ``-f`` value: ``True`` (flag only) or a path.
    """  # noqa: D301
    cb, path, _scope, label = _load_target(
        name, directory, search_project, search_config, search_form,
    )
    result = cb.validate()
    click.echo(f'{label}: {path}')
    if result['errors']:
        click.echo(f"\nErrors ({len(result['errors'])}):")
        for e in result['errors']:
            click.echo(f'  ✗ {e}')
    if result['warnings']:
        click.echo(f"\nWarnings ({len(result['warnings'])}):")
        for w in result['warnings']:
            click.echo(f'  ⚠ {w}')
    if result['valid'] and not result['warnings']:
        click.echo('✓ Valid')
    elif result['valid']:
        click.echo('\n✓ Valid (with warnings)')
    else:
        click.echo('\n✗ Invalid')
        sys.exit(1)


#
# INTERNAL
#
def _clean_pixi_cache() -> None:
    """Clear the pixi PyPI cache and reinstall to pick up local changes.

    Raises:
        subprocess.CalledProcessError: If a pixi command fails.
    """
    if shutil.which('pixi') is None:
        click.echo('Warning: pixi not found, skipping cache clean.', err=True)
        return
    click.echo('Clearing pixi PyPI cache...')
    subprocess.run(PIXI_CLEAN_CMD, check=True)
    click.echo('Reinstalling...')
    subprocess.run(PIXI_INSTALL_CMD, check=True)


def _load_target(
    name: str | None,
    directory: str,
    search_project: str | bool | None,
    search_config: str | bool | None,
    search_form: str | bool | None,
) -> tuple[ConfigBuilder, Path, str, str]:
    """Resolve a CLI config target and load it into a ConfigBuilder.

    Exits the process with status 1 (after an error message has been printed by
    :func:`_resolve_config_target`) when the target cannot be found.

    Args:
        name: Configuration name (file stem) to search for.
        directory: Root configuration directory.
        search_project: ``-p`` value: ``None``, ``True`` (flag only) or a path.
        search_config: ``-c`` value: ``None``, ``True`` (flag only) or a path.
        search_form: ``-f`` value: ``None``, ``True`` (flag only) or a path.

    Returns:
        ``(builder, path, scope, label)`` for the loaded configuration.
    """
    resolved = _resolve_config_target(
        name, directory,
        search_project=search_project,
        search_config=search_config,
        search_form=search_form,
    )
    if resolved is None:
        sys.exit(1)
    path, scope, label = resolved
    cb = ConfigBuilder()
    cb.load_config(str(path), file_type=scope)
    return cb, path, scope, label


def _resolve_config_target(
    name: str | None,
    directory: str,
    *,
    search_project: str | bool | None = None,
    search_config: str | bool | None = None,
    search_form: str | bool | None = None,
) -> tuple[Path, str, str] | None:
    """Resolve a config file target from CLI arguments.

    Resolution rules:
    * ``-p/c/f <path>`` with *name*: treat path as directory, search for *name* in it.
    * ``-p/c/f <path>`` without *name*: treat path as a direct file path.
    * ``-p/c/f`` (flag only) with *name*: search the default subdirectory.
    * *name* alone (no flags): search all subdirectories.
    * Neither *name* nor a path flag: error.

    Args:
        name: Configuration name (file stem) to search for.
        directory: Root configuration directory.
        search_project: ``-p`` value: ``None``, ``True`` (flag only) or a path.
        search_config: ``-c`` value: ``None``, ``True`` (flag only) or a path.
        search_form: ``-f`` value: ``None``, ``True`` (flag only) or a path.

    Returns:
        ``(path, scope, label)`` on success, or ``None`` after printing an
        error message on failure.
    """
    flags = {
        'search_project': search_project,
        'search_config': search_config,
        'search_form': search_form,
    }
    active = {k: v for k, v in flags.items() if v is not None}
    path_flag = None
    scope = None
    for key, val in active.items():
        scope = FLAG_SCOPE_MAP[key]
        if isinstance(val, str) and val != 'True':
            path_flag = val
        break

    if path_flag and name:
        p = _find_yaml(Path(path_flag), name)
        if p is None:
            click.echo(f'No {scope} configuration found: {name} in {path_flag}', err=True)
            return None
        return p, scope, SCOPE_LABEL[scope]

    if path_flag and not name:
        p = Path(path_flag)
        if not p.exists():
            for ext in YAML_EXTENSIONS:
                candidate = Path(path_flag + ext)
                if candidate.exists():
                    p = candidate
                    break
        if not p.is_file():
            click.echo(f'File not found: {path_flag}', err=True)
            return None
        return p, scope, SCOPE_LABEL[scope]

    if name is None:
        click.echo('Name or -p/-c/-f path required.', err=True)
        return None

    root = Path(directory)
    if not root.is_dir():
        click.echo(f'Directory not found: {directory}', err=True)
        return None

    if scope is not None:
        subdir = SCOPE_SUBDIR[scope]
        p = _find_yaml(root / subdir, name)
        if p is not None:
            return p, scope, SCOPE_LABEL[scope]
        click.echo(f'No {scope} configuration found: {name}', err=True)
        return None

    for s in ('project', 'config', 'form'):
        p = _find_yaml(root / SCOPE_SUBDIR[s], name)
        if p is not None:
            return p, s, SCOPE_LABEL[s]
    click.echo(f'No configuration found: {name}', err=True)
    return None


def _print_yaml_names(directory: Path, indent: int = 0) -> None:
    """Recursively print YAML filenames (without extension) under *directory*.

    Args:
        directory: Directory to walk.
        indent: Current nesting depth (two spaces per level).
    """
    if not directory.is_dir():
        return
    prefix = '  ' * indent
    for entry in sorted(directory.iterdir()):
        if entry.name.startswith('.'):
            continue
        if entry.is_dir():
            click.echo(f'{prefix}{entry.name}/')
            _print_yaml_names(entry, indent + 1)
        elif entry.suffix in YAML_EXTENSIONS:
            click.echo(f'{prefix}{entry.stem}')


def _find_yaml(directory: Path, name: str) -> Path | None:
    """Find a YAML file matching *name* (recursive, stem match).

    Args:
        directory: Directory to search recursively.
        name: File stem to match.

    Returns:
        The first matching path (sorted order), or ``None``.
    """
    if not directory.is_dir():
        return None
    for path in sorted(directory.rglob('*')):
        if path.suffix in YAML_EXTENSIONS and path.stem == name:
            return path
    return None
