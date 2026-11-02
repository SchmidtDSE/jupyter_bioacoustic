"""
Test Installer Launcher.

Unit tests for the desktop installer: the pure helpers in the tray launcher
(installer/launcher/jba_launcher.py) — idle-timeout parsing/formatting, root-dir
expansion, server URL / command building, config + server.json handling, quoting, the
per-platform dialog dispatch, uninstall command building — plus `bash -n` checks and
behavioural tests of the installer shell scripts.

The launcher lives outside the package (in installer/), so it is loaded by path through
the module-scoped ``jl`` fixture. It imports only the stdlib at module scope
(pystray/PIL are imported lazily), so importing it is safe and also serves as a syntax
smoke test. JBA_APP_SUPPORT is pointed at a pytest-managed temp dir while it is imported
(its paths are computed at import time) so nothing touches real app data, and the
variable is restored right after. The native dialogs themselves can't run in CI: the
tests stub the subprocess layer and check the exact commands and how answers are read.

License: BSD 3-Clause
"""
#
# Imports
#
import importlib.util
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List, Optional, Tuple

import pytest


#
# CONSTANTS
#
_REPO: Path = Path(__file__).resolve().parents[1]
_INSTALLER: Path = _REPO / "installer"
_LAUNCHER: Path = _INSTALLER / "launcher" / "jba_launcher.py"
_SHELL_SCRIPTS: List[Path] = [
    _INSTALLER / "shared" / "bootstrap.sh",
    _INSTALLER / "macos" / "make-dist.sh",
    _INSTALLER / "macos" / "assemble-app.sh",
    _INSTALLER / "macos" / "build-pkg.sh",
    _INSTALLER / "macos" / "make-local-app.sh",
    _INSTALLER / "macos" / "set-start-folder.command",
    _INSTALLER / "macos" / "scripts" / "postinstall",
    _INSTALLER / "macos" / "app" / "JupyterBioacoustic.app" / "Contents" / "MacOS" / "launch",
    _INSTALLER / "windows" / "make-dist-win.sh",
    _INSTALLER / "icon" / "make-icons.sh",
]
# Text that broke the native dialogs before quoting was added (H16): apostrophes in
# "You're up to date", user paths like O'Brien, curly quotes, newlines, and characters
# PowerShell/AppleScript would otherwise interpret.
_DIALOG_TEXTS: List[str] = [
    "You're up to date",
    "C:\\Users\\O'Brien\\AppData",
    'say "hi" \\ back',
    "curly \u2018quotes\u2019 and \u2019",
    "line1\nline2",
    "$env:HOME `n ${x}",
]
_FAKE_PIXI: str = """#!/bin/sh
# fake pixi: record the call; `install` creates the env dir
echo "$*" >> "$(dirname "$0")/calls.log"
case "$1" in install) mkdir -p "$(dirname "$3")/.pixi" ;; esac
"""
_PLATFORMS: Dict[str, str] = {"mac": "darwin", "windows": "win32", "linux": "linux"}


#
# PUBLIC
#
@pytest.fixture(scope="module")
def jl(tmp_path_factory: pytest.TempPathFactory) -> ModuleType:
    """Import the launcher with JBA_APP_SUPPORT pointed at a throwaway dir.

    Args:
        tmp_path_factory: Pytest's session temp-dir factory (pytest cleans it up).

    Returns:
        The imported launcher module (its APP_SUPPORT is the temp dir).
    """
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("JBA_APP_SUPPORT", str(tmp_path_factory.mktemp("jba-app-support")))
        return _load_launcher()


@pytest.fixture
def run_calls(jl: ModuleType, monkeypatch: pytest.MonkeyPatch) -> "_Calls":
    """Stub the launcher's ``_run`` (every dialog goes through it) and record its argv.

    The stub answers with ``run_calls.reply`` = (returncode, stdout), default (0, "").

    Args:
        jl: The launcher module.
        monkeypatch: Pytest's monkeypatch fixture.

    Returns:
        The list each call's argv is appended to (with a settable ``reply``).
    """
    calls = _Calls()

    def fake_run(args: List[str]) -> subprocess.CompletedProcess:
        calls.append(list(args))
        returncode, stdout = calls.reply
        return subprocess.CompletedProcess(args, returncode, stdout, "")

    monkeypatch.setattr(jl, "_run", fake_run)
    return calls


def test_module_imports(jl: ModuleType) -> None:
    """Importing the launcher (stdlib-only at module scope) succeeds — syntax smoke test."""
    assert hasattr(jl, "main")
    assert hasattr(jl, "Launcher")


def test_app_support_env_is_not_leaked(jl: ModuleType) -> None:
    """The temp JBA_APP_SUPPORT is only set while importing, not for the rest of the run."""
    assert os.environ.get("JBA_APP_SUPPORT") != str(jl.APP_SUPPORT)
    assert jl.APP_SUPPORT.is_dir() and jl.CONFIG.parent == jl.APP_SUPPORT


@pytest.mark.parametrize("value, expected", [
    (False, 0), (None, 0), ("", 0), (0, 0),          # falsy → never
    (30, 30), ("30", 30), (4320, 4320),              # ints / numeric strings
    ("bogus", 0), ([], 0),                           # invalid → 0
])
def test_idle_minutes_normalizes(jl: ModuleType, value: Any, expected: int) -> None:
    """Config values normalize to whole minutes, 0 meaning never."""
    assert jl._idle_minutes(value) == expected


@pytest.mark.parametrize("minutes, expected", [
    (4320, "3d"), (1440, "1d"), (10080, "7d"),       # whole days
    (480, "8h"), (60, "1h"),                         # whole hours
    (90, "90m"), (1, "1m"),                          # minutes
])
def test_fmt_idle(jl: ModuleType, minutes: int, expected: str) -> None:
    """Minutes render in the largest whole unit."""
    assert jl._fmt_idle(minutes) == expected


@pytest.mark.parametrize("text, expected", [
    ("3d", 4320), ("8h", 480), ("90m", 90), ("90", 90),   # units + bare minutes
    ("1.5h", 90), ("1.5d", 2160),                          # fractional
    ("  3D  ", 4320),                                      # strip + case-insensitive
    ("", None), ("abc", None), ("0m", None), ("-5h", None),  # invalid / non-positive
])
def test_parse_idle(jl: ModuleType, text: str, expected: Optional[int]) -> None:
    """User input parses to positive minutes, else None."""
    assert jl._parse_idle(text) == expected


@pytest.mark.parametrize("minutes", [60, 90, 480, 1440, 4320, 10080])
def test_idle_fmt_parse_round_trip(jl: ModuleType, minutes: int) -> None:
    """A formatted value parses back to the same minutes."""
    assert jl._parse_idle(jl._fmt_idle(minutes)) == minutes


def test_expand_root_dir(jl: ModuleType) -> None:
    """A leading ~ expands to home; other paths pass through."""
    home = str(Path.home())
    assert jl._expand("") == home
    assert jl._expand("~") == home
    assert jl._expand("~/sub") == str(Path.home() / "sub")
    assert jl._expand("/abs/path") == "/abs/path"
    assert jl._expand("relative/path") == "relative/path"


def test_url(jl: ModuleType) -> None:
    """The lab URL carries the port and token."""
    assert jl._url({"port": 8888, "token": "abc"}) == "http://localhost:8888/lab?token=abc"


def test_idle_options_presets(jl: ModuleType) -> None:
    """Presets start with Never and have unique positive minute values."""
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
def test_launcher_custom_idle_state(jl: ModuleType, value: Any, is_custom: bool,
                                    label: str) -> None:
    """Only off-preset timeouts count as custom, and the label shows them."""
    launcher = jl.Launcher({"shutdown_on_idle_minutes": value})
    assert launcher._idle_is_custom() is is_custom
    assert launcher._custom_label() == label


def test_launcher_custom_idle_default_config(jl: ModuleType) -> None:
    """A config with no idle key behaves as "never" (not custom)."""
    launcher = jl.Launcher({})
    assert launcher._idle_is_custom() is False
    assert launcher._custom_label() == "Custom…"


def test_pixi_bin_lookup(jl: ModuleType) -> None:
    """The bundled pixi is found only when present in APP_SUPPORT."""
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
def test_shell_scripts_parse(script: Path) -> None:
    """`bash -n` parse check for the installer shell scripts."""
    if not script.exists():
        pytest.skip(f"{script.name} not present")
    result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("text", _DIALOG_TEXTS)
def test_ps_str_doubles_every_quote(jl: ModuleType, text: str) -> None:
    """Every (curly) single quote is doubled, and undoubling gives back the text."""
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
def test_ps_str_round_trips_through_powershell(jl: ModuleType, text: str) -> None:
    """PowerShell reads the literal back as the original text."""
    shell = shutil.which("pwsh") or shutil.which("powershell")
    out = subprocess.run([shell, "-NoProfile", "-Command",
                          f"[Console]::Out.Write({jl._ps_str(text)})"],
                         capture_output=True, text=True)
    assert out.stdout == text, out.stderr


@pytest.mark.skipif(shutil.which("osascript") is None, reason="AppleScript (macOS) only")
@pytest.mark.parametrize("text", _DIALOG_TEXTS)
def test_as_str_round_trips_through_applescript(jl: ModuleType, text: str) -> None:
    """AppleScript reads the literal back as the original text."""
    out = subprocess.run(["osascript", "-e", f"return {jl._as_str(text)}"],
                         capture_output=True, text=True)
    assert out.stdout.rstrip("\n") == text, out.stderr


@pytest.mark.skipif(shutil.which("bash") is None or shutil.which("shasum") is None,
                    reason="bash + shasum needed")
def test_bootstrap_refreshes_changed_installer_payload(tmp_path: Path) -> None:
    """H17: a newer installer's manifest / pixi reach existing installs.

    The in-band lock (rewritten by Check for Updates) survives when the manifest is unchanged.
    """
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
def test_assembled_app_has_everything_launch_needs(tmp_path: Path) -> None:
    """H15: the signed .pkg used to stage the .app without the tray launcher / splash."""
    fake_pixi = tmp_path / "pixi"
    fake_pixi.write_text("#!/bin/sh\n")
    fake_pixi.chmod(0o755)
    app = tmp_path / "out" / "JupyterBioacoustic.app"
    subprocess.run(["bash", str(_INSTALLER / "macos" / "assemble-app.sh"), str(app)],
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


def test_apply_update_logs_pixi_output(jl: ModuleType, tmp_path: Path) -> None:
    """The 'Update failed' dialog points at launch.log: it must contain pixi's output."""
    fake_pixi = _fake_script(tmp_path / "pixi",
                             "echo 'resolving...'\necho 'ERROR: no match' >&2\nexit 1")
    jl.LAUNCH_LOG.unlink(missing_ok=True)
    assert jl._apply_update(fake_pixi, tmp_path / "pixi.toml") is False
    log = jl.LAUNCH_LOG.read_text()
    assert "exited 1" in log and "resolving..." in log and "ERROR: no match" in log


@pytest.mark.parametrize("body, expected", [
    ("echo '  jupyter-bioacoustic 0.9.3 -> 0.9.4'", True),   # package named → update
    ("echo 'nothing to update'", False),                     # not named → up to date
    ("echo 'network error' >&2; exit 1", None),              # probe failed → unknown
])
def test_update_available(jl: ModuleType, tmp_path: Path, body: str,
                          expected: Optional[bool]) -> None:
    """The dry-run probe reads 'is the package named?'; a failing probe is None."""
    fake_pixi = _fake_script(tmp_path / "pixi", body)
    assert jl._update_available(fake_pixi, tmp_path / "pixi.toml") is expected


def test_force_update_flag_simulates_one_update(jl: ModuleType, tmp_path: Path,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    """The test hook reports an update, and applying it consumes the flag."""
    monkeypatch.setattr(jl.time, "sleep", lambda _s: None)
    flag = tmp_path / ".jba-force-update"
    monkeypatch.setattr(jl, "FORCE_UPDATE_FLAG", flag)
    flag.touch()
    missing = tmp_path / "no-such-pixi"
    assert jl._update_available(missing, missing) is True
    assert jl._apply_update(missing, missing) is True
    assert not flag.exists()


def test_pixi_update_args(jl: ModuleType) -> None:
    """The update command targets the package in the env's manifest."""
    pixi, manifest = Path("/x/pixi"), Path("/x/env/pixi.toml")
    args = ["/x/pixi", "update", "jupyter-bioacoustic", "--manifest-path", "/x/env/pixi.toml"]
    assert jl._pixi_update_args(pixi, manifest) == args
    assert jl._pixi_update_args(pixi, manifest, dry_run=True) == args + ["--dry-run"]


def test_server_output_goes_to_jupyter_log(jl: ModuleType,
                                           monkeypatch: pytest.MonkeyPatch) -> None:
    """JupyterLab's stdout/stderr used to go nowhere (Finder / pythonw have no console)."""
    captured: Dict[str, Any] = {}

    class FakePopen:
        """Records how the server would be started."""

        pid = 4242

        def __init__(self, args: List[str], env: Optional[Dict[str, str]] = None,
                     stdout: Any = None, stderr: Any = None) -> None:
            captured.update(stdout=stdout.name, stderr=stderr)

    monkeypatch.setattr(jl.subprocess, "Popen", FakePopen)
    proc, info = jl._start_server({"root_dir": str(jl.APP_SUPPORT / "root")})
    assert captured == {"stdout": str(jl.JUPYTER_LOG), "stderr": subprocess.STDOUT}
    assert info["pid"] == 4242 and jl._server_info() == info
    jl.SERVERFILE.unlink()


def test_rotate_keeps_one_old_copy(jl: ModuleType, tmp_path: Path,
                                   monkeypatch: pytest.MonkeyPatch) -> None:
    """A log over the size limit moves to <name>.1."""
    monkeypatch.setattr(jl, "MAX_LOG_BYTES", 10)
    log = tmp_path / "jupyter.log"
    log.write_text("x" * 20)
    jl._rotate(log)
    assert not log.exists() and (tmp_path / "jupyter.log.1").read_text() == "x" * 20


def test_log_never_raises(jl: ModuleType, tmp_path: Path,
                          monkeypatch: pytest.MonkeyPatch) -> None:
    """An unwritable launch.log (here: a directory) is ignored rather than raised."""
    monkeypatch.setattr(jl, "LAUNCH_LOG", tmp_path)
    jl._log("this goes nowhere")


@pytest.mark.parametrize("idle, timeout_arg", [
    (0, None),
    (90, "--ServerApp.shutdown_no_activity_timeout=5400"),
])
def test_jupyter_args(jl: ModuleType, idle: int, timeout_arg: Optional[str]) -> None:
    """The lab command pins root/port and adds the idle timeout (in seconds) only if set."""
    args = jl._jupyter_args("/data", 8890, idle)
    assert args[:5] == [sys.executable, "-m", "jupyter", "lab", "--no-browser"]
    assert "--ServerApp.root_dir=/data" in args
    assert "--ServerApp.port=8890" in args and "--ServerApp.port_retries=0" in args
    assert "--ServerApp.iopub_data_rate_limit=1e10" in args
    assert (args[-1] == timeout_arg) if timeout_arg else not any("shutdown" in a for a in args)


def test_jupyter_env(jl: ModuleType) -> None:
    """The child gets the token, isolated Jupyter dirs, and the env's bin first on PATH."""
    env = jl._jupyter_env("tok")
    assert env["JUPYTER_TOKEN"] == "tok"
    assert env["JUPYTER_CONFIG_DIR"] == str(jl.JDIR / "config")
    assert env["JUPYTER_DATA_DIR"] == str(jl.JDIR / "data")
    assert env["JUPYTER_RUNTIME_DIR"] == str(jl.JDIR / "runtime")
    assert env["JUPYTER_PREFER_ENV_PATH"] == "1"
    assert env["PATH"].startswith(f"{jl.ENV_BIN}{os.pathsep}")


def test_load_config_creates_defaults(jl: ModuleType, tmp_path: Path,
                                      monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing config.json is created with the defaults."""
    _use_config_dir(jl, tmp_path / "support", monkeypatch)
    assert jl._load_config() == jl.DEFAULT_CONFIG
    assert jl.CONFIG.is_file()


def test_load_config_unreadable_is_logged(jl: ModuleType, tmp_path: Path,
                                          monkeypatch: pytest.MonkeyPatch) -> None:
    """Invalid JSON falls back to the defaults and says so in launch.log."""
    _use_config_dir(jl, tmp_path, monkeypatch)
    jl.CONFIG.write_text("{not json")
    assert jl._load_config() == jl.DEFAULT_CONFIG
    assert "unreadable" in jl.LAUNCH_LOG.read_text()


def test_save_setting_merges_into_config(jl: ModuleType, tmp_path: Path,
                                         monkeypatch: pytest.MonkeyPatch) -> None:
    """Saving one key keeps the others (re-read from disk) and returns the result."""
    _use_config_dir(jl, tmp_path, monkeypatch)
    jl.CONFIG.write_text('{"root_dir": "/data", "single_instance": false}')
    cfg = jl._save_setting("shutdown_on_idle_minutes", 90)
    assert cfg == {"root_dir": "/data", "single_instance": False,
                   "shutdown_on_idle_minutes": 90}
    assert jl._load_config() == cfg


def test_toggle_single_instance(jl: ModuleType, tmp_path: Path,
                                monkeypatch: pytest.MonkeyPatch) -> None:
    """The Reuse Running App toggle flips and persists the setting."""
    _use_config_dir(jl, tmp_path, monkeypatch)
    launcher = jl.Launcher(jl._load_config())
    launcher._toggle_single_instance()
    assert launcher._cfg["single_instance"] is False
    assert jl._load_config()["single_instance"] is False
    launcher._toggle_single_instance()
    assert jl._load_config()["single_instance"] is True


def test_server_info(jl: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """No server.json is quietly empty; a corrupt one is empty and logged."""
    serverfile = tmp_path / "server.json"
    monkeypatch.setattr(jl, "SERVERFILE", serverfile)
    monkeypatch.setattr(jl, "LAUNCH_LOG", tmp_path / "launch.log")
    assert jl._server_info() == {}
    assert not jl.LAUNCH_LOG.exists()
    serverfile.write_text("garbage")
    assert jl._server_info() == {}
    assert "unreadable" in jl.LAUNCH_LOG.read_text()
    serverfile.write_text('{"port": 1, "token": "t", "pid": 2}')
    assert jl._server_info() == {"port": 1, "token": "t", "pid": 2}


def test_port_checks(jl: ModuleType) -> None:
    """A listening port is in use, the server counts as alive, and the scan skips it."""
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]
        assert jl._port_in_use(port) is True
        assert jl._wait_ready(port, timeout=1) is True
        assert jl._alive({"pid": os.getpid(), "port": port}) is True
        assert jl._free_port(port, port + 1) == port      # all busy → falls back to start
    assert jl._alive({}) is False
    assert jl._alive({"pid": os.getpid()}) is False


def test_stop_proc(jl: ModuleType) -> None:
    """None and already-exited processes are no-ops; a running one is terminated."""
    jl._stop_proc(None)
    done = subprocess.Popen([sys.executable, "-c", "pass"])
    done.wait()
    jl._stop_proc(done)
    running = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    jl._stop_proc(running)
    assert running.poll() is not None


@pytest.mark.parametrize("platform, expected", [
    ("darwin", "mac"), ("win32", "windows"), ("linux", "linux"), ("freebsd14", "linux"),
])
def test_platform(jl: ModuleType, monkeypatch: pytest.MonkeyPatch, platform: str,
                  expected: str) -> None:
    """sys.platform maps to the dialog toolkit to use."""
    monkeypatch.setattr(jl.sys, "platform", platform)
    assert jl._platform() == expected


@pytest.mark.parametrize("platform, argv", [
    ("mac", ["osascript", "-e", "MAC"]),
    ("windows", ["powershell", "-NoProfile", "-Command", "WIN"]),
    ("linux", ["zenity", "--info"]),
])
def test_run_native_picks_the_platform_runner(jl: ModuleType, run_calls: "_Calls",
                                              monkeypatch: pytest.MonkeyPatch, platform: str,
                                              argv: List[str]) -> None:
    """Each platform runs its own script through the matching interpreter."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    assert jl._run_native(mac="MAC", windows="WIN", linux=["zenity", "--info"]) is not None
    assert run_calls == [argv]


def test_run_native_skips_a_platform_without_a_dialog(jl: ModuleType,
                                                      run_calls: "_Calls",
                                                      monkeypatch: pytest.MonkeyPatch) -> None:
    """A None entry (e.g. _notify on Windows) runs nothing."""
    monkeypatch.setattr(jl.sys, "platform", "win32")
    jl._notify("hi")
    assert jl._run_native(mac="MAC", windows=None, linux=None) is None
    assert run_calls == []


def test_run_logs_a_command_that_cannot_start(jl: ModuleType, tmp_path: Path,
                                              monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing dialog tool returns None and is logged instead of raising."""
    monkeypatch.setattr(jl, "LAUNCH_LOG", tmp_path / "launch.log")
    assert jl._run([str(tmp_path / "no-such-zenity")]) is None
    assert "could not run" in jl.LAUNCH_LOG.read_text()


@pytest.mark.parametrize("platform, returncode, stdout, expected", [
    ("mac", 0, "button returned:Delete Anyway\n", True),
    ("mac", 0, "button returned:Later\n", False),
    ("mac", 1, "", False),                            # Cancel button → osascript error
    ("windows", 0, "Yes\r\n", True),
    ("windows", 0, "No\r\n", False),
    ("linux", 0, "", True),
    ("linux", 1, "", False),
])
def test_answered_yes(jl: ModuleType, monkeypatch: pytest.MonkeyPatch, platform: str,
                      returncode: int, stdout: str, expected: bool) -> None:
    """Yes/No answers are read the way each platform reports them."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    result = subprocess.CompletedProcess([], returncode, stdout, "")
    assert jl._answered_yes(result, mac_button="Delete Anyway") is expected
    assert jl._answered_yes(None, mac_button="Delete Anyway") is False


@pytest.mark.parametrize("platform, reply, expected", [
    ("mac", (0, "button returned:Update\n"), True),
    ("mac", (0, "button returned:Later\n"), False),
    ("windows", (0, "Yes\r\n"), True),
    ("linux", (1, ""), False),
])
def test_confirm_update(jl: ModuleType, run_calls: "_Calls", monkeypatch: pytest.MonkeyPatch,
                        platform: str, reply: Tuple[int, str], expected: bool) -> None:
    """The update prompt shows the same text everywhere and reads the answer."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    run_calls.reply = reply
    assert jl._confirm_update() is expected
    msg = "An update is available. Update now? The app will reopen."
    assert len(run_calls) == 1 and any(msg in part for part in run_calls[0])


def test_confirm_uninstall_defaults_to_cancel_on_mac(jl: ModuleType, run_calls: "_Calls",
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    """The scary macOS uninstall dialog defaults to Cancel and needs 'Delete Anyway'."""
    monkeypatch.setattr(jl.sys, "platform", "darwin")
    run_calls.reply = (0, "button returned:Delete Anyway\n")
    assert jl._confirm_uninstall() is True
    script = run_calls[0][2]
    assert 'default button "Cancel"' in script and "with icon caution" in script
    assert "ARE YOU REALLY SURE YOU WANT TO DO THIS?\\n\\n" in script   # newlines escaped


@pytest.mark.parametrize("platform, reply, expected", [
    ("mac", (0, "8h\n"), 480),
    ("mac", (1, ""), None),                           # cancelled
    ("windows", (0, "90m\r\n"), 90),                  # InputBox exits 0 even on cancel...
    ("windows", (0, "\r\n"), None),                   # ...printing nothing
    ("linux", (0, "3d\n"), 4320),
    ("linux", (1, "3d\n"), None),
])
def test_pick_idle(jl: ModuleType, run_calls: "_Calls", monkeypatch: pytest.MonkeyPatch,
                   platform: str, reply: Tuple[int, str], expected: Optional[int]) -> None:
    """The custom idle prompt returns parsed minutes, or None on cancel."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    run_calls.reply = reply
    assert jl._pick_idle() == expected


@pytest.mark.parametrize("platform, reply, expected", [
    ("mac", (0, "/Users/me/data/\n"), "/Users/me/data"),   # trailing slash dropped
    ("mac", (1, ""), ""),
    ("windows", (0, "C:\\data\r\n"), "C:\\data"),
    ("linux", (0, "/home/me/data\n"), "/home/me/data"),
    ("linux", (1, ""), ""),
])
def test_pick_folder(jl: ModuleType, run_calls: "_Calls", monkeypatch: pytest.MonkeyPatch,
                     platform: str, reply: Tuple[int, str], expected: str) -> None:
    """The folder picker returns the chosen path, or "" on cancel."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    run_calls.reply = reply
    assert jl._pick_folder() == expected


def test_pick_folder_survives_a_missing_tool(jl: ModuleType, monkeypatch: pytest.MonkeyPatch,
                                             tmp_path: Path) -> None:
    """If the picker can't run at all, it counts as a cancel (logged) instead of raising."""
    monkeypatch.setattr(jl.sys, "platform", "linux")
    monkeypatch.setattr(jl, "LAUNCH_LOG", tmp_path / "launch.log")
    monkeypatch.setenv("PATH", str(tmp_path))         # no zenity anywhere
    assert jl._pick_folder() == ""
    assert "could not run zenity" in jl.LAUNCH_LOG.read_text()


@pytest.mark.parametrize("platform, quoted", [
    ("mac", '"You\'re \\"up\\" to date"'),
    ("windows", "'You''re \"up\" to date'"),
])
def test_alert_quotes_the_message(jl: ModuleType, run_calls: "_Calls",
                                  monkeypatch: pytest.MonkeyPatch, platform: str,
                                  quoted: str) -> None:
    """The alert text is quoted for the platform's script language."""
    monkeypatch.setattr(jl.sys, "platform", _PLATFORMS[platform])
    jl._alert('You\'re "up" to date')
    assert len(run_calls) == 1 and quoted in run_calls[0][-1]


@pytest.mark.parametrize("returncode, expected", [
    (0, [["zenity", "--info", "--title", "Jupyter Bioacoustic", "--text", "hi"]]),
    (1, [["zenity", "--info", "--title", "Jupyter Bioacoustic", "--text", "hi"],
         ["notify-send", "Jupyter Bioacoustic", "hi"]]),
])
def test_alert_linux_falls_back_to_notify_send(jl: ModuleType, run_calls: "_Calls",
                                               monkeypatch: pytest.MonkeyPatch,
                                               returncode: int,
                                               expected: List[List[str]]) -> None:
    """On Linux a failing zenity alert falls back to a notify-send banner."""
    monkeypatch.setattr(jl.sys, "platform", "linux")
    run_calls.reply = (returncode, "")
    jl._alert("hi")
    assert run_calls == expected


def test_cleanup_targets(jl: ModuleType, monkeypatch: pytest.MonkeyPatch) -> None:
    """Uninstall removes APP_SUPPORT (+ the Start-menu shortcut on Windows), nothing else."""
    monkeypatch.setattr(jl, "_app_bundle", lambda: None)
    monkeypatch.setattr(jl.sys, "platform", "linux")
    assert jl._cleanup_targets() == [jl.APP_SUPPORT]
    monkeypatch.setattr(jl.sys, "platform", "win32")
    monkeypatch.setenv("APPDATA", "/appdata")
    targets = jl._cleanup_targets()
    assert targets[0] == jl.APP_SUPPORT and targets[1].name == "Jupyter Bioacoustic.lnk"


def test_cleanup_command_windows_quotes_paths(jl: ModuleType) -> None:
    """The PowerShell cleanup waits for the pid and quotes every path."""
    target = Path("C:/Users/O'Brien/app")
    args = jl._cleanup_command(123, [target, target], windows=True)
    assert args[:3] == ["powershell", "-NoProfile", "-Command"]
    assert args[3].startswith("Wait-Process -Id 123 ")
    quoted = str(target).replace("'", "''")
    assert f"foreach($p in @('{quoted}','{quoted}'))" in args[3]
    assert "Remove-Item -LiteralPath $p -Recurse -Force" in args[3]


@pytest.mark.skipif(sys.platform.startswith("win"), reason="POSIX sh cleanup")
def test_cleanup_command_posix_deletes_after_exit(jl: ModuleType, tmp_path: Path) -> None:
    """The sh cleanup waits for the pid to exit, then deletes awkwardly named paths."""
    victim = tmp_path / "it's \"my\" app"
    (victim / "env").mkdir(parents=True)
    keep = tmp_path / "user data"
    keep.mkdir()
    gone = subprocess.Popen([sys.executable, "-c", "pass"])
    gone.wait()
    args = jl._cleanup_command(gone.pid, [victim], windows=False)
    assert args[:2] == ["/bin/sh", "-c"]
    subprocess.run(args, check=True, timeout=10)
    assert not victim.exists() and keep.exists()


#
# INTERNAL
#
class _Calls(list):
    """A list of recorded argv's plus the (returncode, stdout) the stub should reply with.

    Attributes:
        reply: What the stubbed ``_run`` returns for every call.
    """

    reply: Tuple[int, str] = (0, "")


def _load_launcher() -> ModuleType:
    """Import installer/launcher/jba_launcher.py by path.

    Returns:
        The freshly executed module.
    """
    spec = importlib.util.spec_from_file_location("jba_launcher", _LAUNCHER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _use_config_dir(jl: ModuleType, path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point the launcher's config.json / launch.log at ``path`` for one test.

    Args:
        jl: The launcher module.
        path: The stand-in app-support dir (created on demand by the launcher).
        monkeypatch: Pytest's monkeypatch fixture.
    """
    monkeypatch.setattr(jl, "APP_SUPPORT", path)
    monkeypatch.setattr(jl, "CONFIG", path / "config.json")
    monkeypatch.setattr(jl, "LAUNCH_LOG", path / "launch.log")


def _fake_script(path: Path, body: str) -> Path:
    """Write an executable ``sh`` script.

    Args:
        path: Where to write it.
        body: The script body (after the shebang).

    Returns:
        ``path``.
    """
    path.write_text(f"#!/bin/sh\n{body}\n")
    path.chmod(0o755)
    return path


def _make_payload(dir_: Path, manifest: str, lock: str, pixi_tag: str = "v1") -> Path:
    """Build a fake installer payload (manifest, lock, fake pixi + its checksum).

    Args:
        dir_: The payload dir to create.
        manifest: pixi.toml contents.
        lock: pixi.lock contents.
        pixi_tag: Marker appended to the fake pixi so versions differ byte-wise.

    Returns:
        ``dir_``.
    """
    dir_.mkdir(parents=True, exist_ok=True)
    (dir_ / "pixi.toml").write_text(manifest)
    (dir_ / "pixi.lock").write_text(lock)
    (dir_ / "pixi").write_text(_FAKE_PIXI + f"# {pixi_tag}\n")
    (dir_ / "pixi").chmod(0o755)
    subprocess.run(["sh", "-c", "shasum -a 256 pixi > pixi.sha256"], cwd=dir_, check=True)
    return dir_


def _bootstrap(app_support: Path, payload: Path) -> List[str]:
    """Run bootstrap.sh's ensure_pixi + ensure_env and collect the fake pixi's calls.

    Args:
        app_support: The APP_SUPPORT dir to bootstrap into.
        payload: The installer payload dir.

    Returns:
        One line per pixi invocation (its arguments); the call log is reset afterwards.
    """
    script = (f'source "{_INSTALLER / "shared" / "bootstrap.sh"}"; '
              "ensure_pixi; ensure_env")
    env = {**os.environ, "APP_SUPPORT": str(app_support), "PAYLOAD": str(payload)}
    subprocess.run(["bash", "-c", script], env=env, check=True)
    calls = app_support / "calls.log"
    lines = calls.read_text().splitlines() if calls.exists() else []
    calls.unlink(missing_ok=True)
    return lines
