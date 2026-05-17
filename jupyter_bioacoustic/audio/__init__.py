"""
Audio (Package)

Unified IO for reading and writing audio across local,
S3, GCS, and HTTPS backends.

License: BSD 3-Clause
"""

from .io import read, read_segment, write, list_files
