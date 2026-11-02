"""Config Builder

Kernel side of the config builder UI: the ConfigBuilder state/endpoints and the starter
notebook helper.

License: BSD 3-Clause
"""
from .core import ConfigBuilder
from .notebook import copy_starter_notebook

__all__ = ['ConfigBuilder', 'copy_starter_notebook']
