"""
Audio (Package)

Unified IO for reading and writing audio across local,
S3, GCS, and HTTPS backends.

License: BSD 3-Clause
"""
#
# Imports
#
from .io import clear_cache, list_files, read, read_segment, write


#
# CONSTANTS
#
__all__ = ['clear_cache', 'list_files', 'read', 'read_segment', 'write']
