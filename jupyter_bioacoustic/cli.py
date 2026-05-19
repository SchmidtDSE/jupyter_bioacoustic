"""
CLI

Command-line interface for jupyter-bioacoustic. Provides
convenience commands for launching JupyterLab, listing
configuration files, and describing configurations.

Usage:
    jba lab
    jba config list
    jba describe <name>

License: BSD 3-Clause
"""
from __future__ import annotations

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
YAML_EXTENSIONS = ('.yaml', '.yml')
CONFIG_SUBDIRS = ('projects', 'config', 'forms')


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
def lab(rate_limit: str) -> None:
    """Launch JupyterLab with the required IOPub rate limit."""
    cmd = [
        sys.executable, '-m', 'jupyter', 'lab',
        f'--ServerApp.iopub_data_rate_limit={rate_limit}',
    ]
    subprocess.run(cmd)


@main.group('config')
def config_group() -> None:
    """Configuration file commands."""


@config_group.command('list')
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
@click.argument('name')
@click.option(
    '-d', '--dir', 'directory',
    default=DEFAULT_CONFIG_DIR,
    show_default=True,
    help='Root configuration directory.',
)
@click.option('-p', '--project', 'search_project', is_flag=True, help='Search projects only.')
@click.option('-c', '--config', 'search_config', is_flag=True, help='Search configs only.')
@click.option('-f', '--form', 'search_form', is_flag=True, help='Search forms only.')
def describe(
    name: str,
    directory: str,
    search_project: bool,
    search_config: bool,
    search_form: bool,
) -> None:
    """Describe a configuration by name."""
    root = Path(directory)
    if not root.is_dir():
        click.echo(f'Directory not found: {directory}', err=True)
        sys.exit(1)

    search_all = not (search_project or search_config or search_form)
    search_order: list[tuple[str, str]] = []
    if search_all or search_project:
        search_order.append(('projects', 'Project'))
    if search_all or search_config:
        search_order.append(('config', 'Config'))
    if search_all or search_form:
        search_order.append(('forms', 'Form'))

    scope_map = {'projects': 'project', 'config': 'config', 'forms': 'form'}
    for subdir, label in search_order:
        path = _find_yaml(root / subdir, name)
        if path is not None:
            cb = ConfigBuilder()
            cb.load_config(str(path), file_type=scope_map[subdir])
            click.echo(f'{label} Configuration Summary')
            click.echo('=' * 40)
            sections = build_summary_from_builder(cb, scope=scope_map[subdir])
            click.echo(format_text(sections))
            return

    if search_all:
        click.echo(f'No configuration found: {name}', err=True)
    else:
        kind = search_order[0][1].lower()
        click.echo(f'No {kind} configuration found: {name}', err=True)
    sys.exit(1)


#
# INTERNAL
#
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
