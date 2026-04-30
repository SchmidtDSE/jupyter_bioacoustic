import os
import shutil
import logging

_log = logging.getLogger('jupyter_bioacoustic.audio')


def read(src, dest=None, start_byte=None, end_byte=None, **kwargs):
    with open(src, 'rb') as f:
        if start_byte is not None:
            f.seek(start_byte)
        if start_byte is not None and end_byte is not None:
            data = f.read(end_byte - start_byte + 1)
        elif end_byte is not None:
            data = f.read(end_byte + 1)
        else:
            data = f.read()

    if dest is None:
        return data

    from . import _shared
    _shared.ensure_parent_dirs(dest)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def read_segment(path, start_sec, dur_sec, **kwargs):
    import soundfile as sf
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        f.seek(int(start_sec * sr))
        raw = f.read(int(dur_sec * sr), dtype='float32', always_2d=True)
    return raw, sr


def write(src, dest, recursive=False, overwrite=True, **kwargs):
    from . import _shared
    if os.path.isdir(src):
        if not recursive:
            raise ValueError(f"src is a directory but recursive=False: {src}")
        if os.path.exists(dest) and not overwrite:
            raise FileExistsError(f"Destination exists and overwrite=False: {dest}")
        shutil.copytree(src, dest, dirs_exist_ok=overwrite)
        return dest
    else:
        if os.path.exists(dest) and not overwrite:
            raise FileExistsError(f"Destination exists and overwrite=False: {dest}")
        _shared.ensure_parent_dirs(dest)
        shutil.copy2(src, dest)
        return dest


def list_files(path, recursive=False, **kwargs):
    from pathlib import Path
    p = Path(path)
    if not p.is_dir():
        raise ValueError(f"Not a directory: {path}")
    if recursive:
        return sorted(str(f) for f in p.rglob('*') if f.is_file())
    return sorted(str(f) for f in p.iterdir() if f.is_file())
