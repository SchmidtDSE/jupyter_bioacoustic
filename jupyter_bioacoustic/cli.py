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
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

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
def lab(rate_limit: str, debug: str | None) -> None:
    """Launch JupyterLab with the required IOPub rate limit."""
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
@click.option(
    '-d', '--dir', 'directory',
    default=DEFAULT_CONFIG_DIR,
    show_default=True,
    help='Root configuration directory.',
)
@click.option('-p', '--project', 'show_projects', is_flag=True, help='Show only projects.')
@click.option('-c', '--config', 'show_configs', is_flag=True, help='Show only configs.')
@click.option('-f', '--form', 'show_forms', is_flag=True, help='Show only forms.')
def config_list(
    directory: str,
    show_projects: bool,
    show_configs: bool,
    show_forms: bool,
) -> None:
    """List configuration files."""
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
@click.argument('name', required=False, default=None)
@click.option(
    '-d', '--dir', 'directory',
    default=DEFAULT_CONFIG_DIR,
    show_default=True,
    help='Root configuration directory.',
)
@click.option(
    '-p', '--project', 'search_project',
    is_flag=False, flag_value=True, default=None,
    help='Search projects only. Optionally pass a file path.',
)
@click.option(
    '-c', '--config', 'search_config',
    is_flag=False, flag_value=True, default=None,
    help='Search configs only. Optionally pass a file path.',
)
@click.option(
    '-f', '--form', 'search_form',
    is_flag=False, flag_value=True, default=None,
    help='Search forms only. Optionally pass a file path.',
)
def describe(
    name: str | None,
    directory: str,
    search_project: str | bool | None,
    search_config: str | bool | None,
    search_form: str | bool | None,
) -> None:
    """Describe a configuration by name or path."""
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
    click.echo(f'{label} Configuration Summary')
    click.echo('=' * 40)
    sections = build_summary_from_builder(cb, scope=scope)
    click.echo(format_text(sections))


@main.command()
@click.argument('name', required=False, default=None)
@click.option(
    '-d', '--dir', 'directory',
    default=DEFAULT_CONFIG_DIR,
    show_default=True,
    help='Root configuration directory.',
)
@click.option(
    '-p', '--project', 'search_project',
    is_flag=False, flag_value=True, default=None,
    help='Search projects only. Optionally pass a file path.',
)
@click.option(
    '-c', '--config', 'search_config',
    is_flag=False, flag_value=True, default=None,
    help='Search configs only. Optionally pass a file path.',
)
@click.option(
    '-f', '--form', 'search_form',
    is_flag=False, flag_value=True, default=None,
    help='Search forms only. Optionally pass a file path.',
)
def validate(
    name: str | None,
    directory: str,
    search_project: str | bool | None,
    search_config: str | bool | None,
    search_form: str | bool | None,
) -> None:
    """Validate a configuration by name or path."""
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
        click.echo(f'\n✓ Valid (with warnings)')
    else:
        click.echo(f'\n✗ Invalid')
        sys.exit(1)


#
# INTERNAL
#
def _resolve_config_target(
    name: str | None,
    directory: str,
    *,
    search_project: str | bool | None = None,
    search_config: str | bool | None = None,
    search_form: str | bool | None = None,
) -> tuple[Path, str, str] | None:
    """Resolve a config file target from CLI arguments.

    Returns ``(path, scope, label)`` on success, or ``None`` after printing
    an error message on failure.

    Resolution rules:
    * ``-p/c/f <path>`` with *name*: treat path as directory, search for *name* in it.
    * ``-p/c/f <path>`` without *name*: treat path as a direct file path.
    * ``-p/c/f`` (flag only) with *name*: search the default subdirectory.
    * *name* alone (no flags): search all subdirectories.
    * Neither *name* nor a path flag: error.
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
    """Recursively print YAML filenames (without extension) under *directory*."""
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


def _find_yaml(directory: Path, name: str) -> Optional[Path]:
    """Find a YAML file matching *name* (recursive, stem match)."""
    if not directory.is_dir():
        return None
    for path in sorted(directory.rglob('*')):
        if path.suffix in YAML_EXTENSIONS and path.stem == name:
            return path
    return None
