"""
Test Installer Launcher

Unit tests for the pure helpers in the desktop tray launcher
(installer/launcher/jba_launcher.py): idle-timeout parsing/formatting, root-dir
expansion, server URL building, the custom-idle menu state, and pixi-binary lookup.

The launcher lives outside the package (in installer/), so it is loaded by path. It
imports only stdlib at module scope (pystray/PIL are imported lazily inside methods),
so importing it here is safe and also serves as a syntax smoke test. JBA_APP_SUPPORT is
pointed at a throwaway dir before import so nothing touches real app data. The native
dialog / pystray / pixi-subprocess paths are intentionally not covered (manual/integration).

License: BSD 3-Clause
"""
#
# Imports
#
import importlib.util
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

#
# CONSTANTS
#
# Point APP_SUPPORT at a throwaway dir BEFORE importing (the constant is computed at
# import time) so _pixi_bin/_load_config can never touch real app data.
_APP_SUPPORT: Path = Path(tempfile.mkdtemp(prefix="jba-test-"))
os.environ["JBA_APP_SUPPORT"] = str(_APP_SUPPORT)

_REPO: Path = Path(__file__).resolve().parents[1]
_LAUNCHER: Path = _REPO / "installer" / "launcher" / "jba_launcher.py"
_SHELL_SCRIPTS = [
    _REPO / "installer" / "shared" / "bootstrap.sh",
    _REPO / "installer" / "macos" / "make-dist.sh",
    _REPO / "installer" / "macos" / "make-local-app.sh",
    _REPO / "installer" / "windows" / "make-dist-win.sh",
    _REPO / "installer" / "icon" / "make-icons.sh",
]


def _load_launcher():
    spec = importlib.util.spec_from_file_location("jba_launcher", _LAUNCHER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


jl = _load_launcher()


#
# PUBLIC
#
def test_module_imports():
    """Importing the launcher (stdlib-only at module scope) succeeds — syntax smoke test."""
    assert hasattr(jl, "main")
    assert hasattr(jl, "Launcher")


@pytest.mark.parametrize("value, expected", [
    (False, 0), (None, 0), ("", 0), (0, 0),          # falsy → never
    (30, 30), ("30", 30), (4320, 4320),              # ints / numeric strings
    ("bogus", 0), ([], 0),                           # invalid → 0
])
def test_idle_minutes_normalizes(value, expected):
    assert jl._idle_minutes(value) == expected


@pytest.mark.parametrize("minutes, expected", [
    (4320, "3d"), (1440, "1d"), (10080, "7d"),       # whole days
    (480, "8h"), (60, "1h"),                         # whole hours
    (90, "90m"), (1, "1m"),                          # minutes
])
def test_fmt_idle(minutes, expected):
    assert jl._fmt_idle(minutes) == expected


@pytest.mark.parametrize("text, expected", [
    ("3d", 4320), ("8h", 480), ("90m", 90), ("90", 90),   # units + bare minutes
    ("1.5h", 90), ("1.5d", 2160),                          # fractional
    ("  3D  ", 4320),                                      # strip + case-insensitive
    ("", None), ("abc", None), ("0m", None), ("-5h", None),  # invalid / non-positive
])
def test_parse_idle(text, expected):
    assert jl._parse_idle(text) == expected


@pytest.mark.parametrize("minutes", [60, 90, 480, 1440, 4320, 10080])
def test_idle_fmt_parse_round_trip(minutes):
    assert jl._parse_idle(jl._fmt_idle(minutes)) == minutes


def test_expand_root_dir():
    home = str(Path.home())
    assert jl._expand("") == home
    assert jl._expand("~") == home
    assert jl._expand("~/sub") == str(Path.home() / "sub")
    assert jl._expand("/abs/path") == "/abs/path"
    assert jl._expand("relative/path") == "relative/path"


def test_url():
    assert jl._url({"port": 8888, "token": "abc"}) == "http://localhost:8888/lab?token=abc"


def test_idle_options_presets():
    labels = dict(jl.IDLE_OPTIONS)
    assert labels["Never"] is False
    minutes = [v for _, v in jl.IDLE_OPTIONS if v is not False]
    assert all(isinstance(m, int) and m > 0 for m in minutes)
    assert len(minutes) == len(set(minutes))         # no duplicate presets


@pytest.mark.parametrize("value, is_custom, label", [
    (False, False, "Custom…"),                       # never → not custom
    (60, False, "Custom…"),                          # a preset → not custom
    (4320, False, "Custom…"),                        # the 3-day preset → not custom
    (90, True, "Custom (90m)…"),                     # off-preset minutes → custom
    (2880, True, "Custom (2d)…"),                    # off-preset 2 days → custom
])
def test_launcher_custom_idle_state(value, is_custom, label):
    launcher = jl.Launcher({"shutdown_on_idle_minutes": value})
    assert launcher._idle_is_custom() is is_custom
    assert launcher._custom_label() == label


def test_launcher_custom_idle_default_config():
    # A config with no idle key behaves as "never" (not custom).
    launcher = jl.Launcher({})
    assert launcher._idle_is_custom() is False
    assert launcher._custom_label() == "Custom…"


def test_pixi_bin_lookup():
    name = "pixi.exe" if os.name == "nt" else "pixi"
    target = jl.APP_SUPPORT / name
    target.unlink(missing_ok=True)
    assert jl._pixi_bin() is None                    # absent → None
    target.write_text("")                            # present → its path
    try:
        assert jl._pixi_bin() == target
    finally:
        target.unlink(missing_ok=True)


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash not available")
@pytest.mark.parametrize("script", _SHELL_SCRIPTS, ids=lambda p: p.name)
def test_shell_scripts_parse(script):
    """`bash -n` parse check for the installer shell scripts."""
    if not script.exists():
        pytest.skip(f"{script.name} not present")
    result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
