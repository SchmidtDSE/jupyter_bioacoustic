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
    _REPO / "installer" / "macos" / "assemble-app.sh",
    _REPO / "installer" / "macos" / "build-pkg.sh",
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


# Text that broke the native dialogs before quoting was added (H16): apostrophes in
# "You're up to date", user paths like O'Brien, curly quotes, newlines, and characters
# PowerShell/AppleScript would otherwise interpret.
_DIALOG_TEXTS = [
    "You're up to date",
    "C:\\Users\\O'Brien\\AppData",
    'say "hi" \\ back',
    "curly \u2018quotes\u2019 and \u2019",
    "line1\nline2",
    "$env:HOME `n ${x}",
]


@pytest.mark.parametrize("text", _DIALOG_TEXTS)
def test_ps_str_doubles_every_quote(text):
    literal = jl._ps_str(text)
    assert literal[0] == literal[-1] == "'"
    inner = literal[1:-1]
    for quote in ("'", "\u2018", "\u2019", "\u201a", "\u201b"):
        assert quote not in inner.replace(quote * 2, "")
        inner = inner.replace(quote * 2, quote)
    assert inner == text


@pytest.mark.skipif(shutil.which("pwsh") is None and shutil.which("powershell") is None,
                    reason="PowerShell not available")
@pytest.mark.parametrize("text", _DIALOG_TEXTS)
def test_ps_str_round_trips_through_powershell(text):
    shell = shutil.which("pwsh") or shutil.which("powershell")
    out = subprocess.run([shell, "-NoProfile", "-Command",
                          f"[Console]::Out.Write({jl._ps_str(text)})"],
                         capture_output=True, text=True)
    assert out.stdout == text, out.stderr


@pytest.mark.skipif(shutil.which("osascript") is None, reason="AppleScript (macOS) only")
@pytest.mark.parametrize("text", _DIALOG_TEXTS)
def test_as_str_round_trips_through_applescript(text):
    out = subprocess.run(["osascript", "-e", f"return {jl._as_str(text)}"],
                         capture_output=True, text=True)
    assert out.stdout.rstrip("\n") == text, out.stderr


_FAKE_PIXI = """#!/bin/sh
# fake pixi: record the call; `install` creates the env dir
echo "$*" >> "$(dirname "$0")/calls.log"
case "$1" in install) mkdir -p "$(dirname "$3")/.pixi" ;; esac
"""


def _make_payload(dir_: Path, manifest: str, lock: str, pixi_tag: str = "v1") -> Path:
    dir_.mkdir(parents=True, exist_ok=True)
    (dir_ / "pixi.toml").write_text(manifest)
    (dir_ / "pixi.lock").write_text(lock)
    (dir_ / "pixi").write_text(_FAKE_PIXI + f"# {pixi_tag}\n")
    (dir_ / "pixi").chmod(0o755)
    subprocess.run(["sh", "-c", "shasum -a 256 pixi > pixi.sha256"], cwd=dir_, check=True)
    return dir_


def _bootstrap(app_support: Path, payload: Path) -> list:
    """Run bootstrap.sh's ensure_pixi + ensure_env; return the fake pixi's calls."""
    script = (f'source "{_REPO / "installer" / "shared" / "bootstrap.sh"}"; '
              "ensure_pixi; ensure_env")
    env = {**os.environ, "APP_SUPPORT": str(app_support), "PAYLOAD": str(payload)}
    subprocess.run(["bash", "-c", script], env=env, check=True)
    calls = app_support / "calls.log"
    lines = calls.read_text().splitlines() if calls.exists() else []
    calls.unlink(missing_ok=True)
    return lines


@pytest.mark.skipif(shutil.which("bash") is None or shutil.which("shasum") is None,
                    reason="bash + shasum needed")
def test_bootstrap_refreshes_changed_installer_payload(tmp_path):
    """H17: a newer installer's manifest / pixi reach existing installs; the in-band lock
    (rewritten by Check for Updates) survives when the manifest is unchanged."""
    app = tmp_path / "support"
    env_dir = app / "env"

    v1 = _make_payload(tmp_path / "v1", "band = '>=0.9,<1.0'\n", "lock v1\n")
    calls = _bootstrap(app, v1)                               # first run
    assert [c.split()[0] for c in calls] == ["install"]
    assert (env_dir / "pixi.lock").read_text() == "lock v1\n"

    (env_dir / "pixi.lock").write_text("lock updated in-band\n")
    assert _bootstrap(app, v1) == []                          # relaunch: nothing to do
    assert (env_dir / "pixi.lock").read_text() == "lock updated in-band\n"

    v2 = _make_payload(tmp_path / "v2", "band = '>=1.0,<2.0'\n", "lock v2\n")
    calls = _bootstrap(app, v2)                               # new installer, new band
    assert [c.split()[0] for c in calls] == ["install"]
    assert (env_dir / "pixi.toml").read_text() == "band = '>=1.0,<2.0'\n"
    assert (env_dir / "pixi.lock").read_text() == "lock v2\n"

    v3 = _make_payload(tmp_path / "v3", "band = '>=1.0,<2.0'\n", "lock v2\n", pixi_tag="v3")
    assert _bootstrap(app, v3) == []                          # same manifest, new pixi
    assert (app / "pixi").read_text().endswith("# v3\n")


@pytest.mark.skipif(shutil.which("bash") is None or shutil.which("shasum") is None,
                    reason="bash + shasum needed")
def test_assembled_app_has_everything_launch_needs(tmp_path):
    """H15: the signed .pkg used to stage the .app without the tray launcher / splash."""
    fake_pixi = tmp_path / "pixi"
    fake_pixi.write_text("#!/bin/sh\n")
    fake_pixi.chmod(0o755)
    app = tmp_path / "out" / "JupyterBioacoustic.app"
    subprocess.run(["bash", str(_REPO / "installer" / "macos" / "assemble-app.sh"), str(app)],
                   env={**os.environ, "PIXI_BIN": str(fake_pixi)}, check=True,
                   capture_output=True)
    res = app / "Contents" / "Resources"
    launch = (app / "Contents" / "MacOS" / "launch").read_text()
    for name in ("bootstrap.sh", "jba_launcher.py", "splash.js"):
        assert f'$RES/{name}' in launch                     # the launch script uses it...
        assert (res / name).is_file()                       # ...and it's in the bundle
    for name in ("pixi", "pixi.sha256", "pixi.toml"):
        assert (res / "payload" / name).is_file()
    assert os.access(app / "Contents" / "MacOS" / "launch", os.X_OK)


def test_apply_update_logs_pixi_output(tmp_path):
    """The 'Update failed' dialog points at launch.log: it must contain pixi's output."""
    fake_pixi = tmp_path / "pixi"
    fake_pixi.write_text("#!/bin/sh\necho 'resolving...'\necho 'ERROR: no match' >&2\nexit 1\n")
    fake_pixi.chmod(0o755)
    jl.LAUNCH_LOG.unlink(missing_ok=True)
    assert jl._apply_update(fake_pixi, tmp_path / "pixi.toml") is False
    log = jl.LAUNCH_LOG.read_text()
    assert "exited 1" in log and "resolving..." in log and "ERROR: no match" in log


def test_server_output_goes_to_jupyter_log(monkeypatch):
    """JupyterLab's stdout/stderr used to go nowhere (Finder / pythonw have no console)."""
    captured = {}

    class FakePopen:
        pid = 4242

        def __init__(self, args, env=None, stdout=None, stderr=None):
            captured.update(stdout=stdout.name, stderr=stderr)

    monkeypatch.setattr(jl.subprocess, "Popen", FakePopen)
    jl._start_server({"root_dir": str(_APP_SUPPORT / "root")})
    assert captured == {"stdout": str(jl.JUPYTER_LOG), "stderr": subprocess.STDOUT}


def test_rotate_keeps_one_old_copy(tmp_path, monkeypatch):
    monkeypatch.setattr(jl, "MAX_LOG_BYTES", 10)
    log = tmp_path / "jupyter.log"
    log.write_text("x" * 20)
    jl._rotate(log)
    assert not log.exists() and (tmp_path / "jupyter.log.1").read_text() == "x" * 20
