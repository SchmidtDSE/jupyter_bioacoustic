"""
Jupyter Bioacoustic desktop launcher.

A cross-platform menu-bar / system-tray app (pystray) that owns the JupyterLab
server lifecycle for the desktop installer:

  * starts JupyterLab as a subprocess (isolated Jupyter dirs, pinned root_dir,
    token, IOPub limit, optional idle-shutdown) and logs its output to jupyter.log,
  * shows a tray icon (macOS menu bar / Windows + Linux system tray) with
    Open in Browser, a browser-crash Help note, Check for Updates…, Change Start
    Folder…, Shut Down When Idle, Reuse Running App, Uninstall… and Quit,
  * Quit (or Dock → Quit on macOS) shuts the server down — no orphaned process;
    "Open in Browser" restarts a server that has stopped (idle shutdown / crash),
  * single-instance: a second launch opens a new browser tab to the running
    server instead of spawning another,
  * updates in place with the bundled pixi (within the manifest's version band),
  * uninstalls itself (app + env, never user data) via a detached cleanup process.

Native dialogs are run per platform: AppleScript (osascript) on macOS, PowerShell
on Windows, and zenity / notify-send on Linux. Launcher events and errors are
appended to launch.log in the app-support dir.

Run by the shell/cmd bootstrap once the pixi env exists:
    JBA_APP_SUPPORT=<dir> JBA_ENV_BIN=<env/bin> [JBA_ICON=<png>] python jba_launcher.py

License: BSD 3-Clause
"""
#
# Imports
#
import atexit
import json
import os
import secrets
import shlex
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List, Literal, Optional, Tuple, TYPE_CHECKING, Union

# pystray and Pillow are imported lazily (inside the functions that need them) so this
# module imports with the stdlib alone — the tests load it without a GUI stack.
if TYPE_CHECKING:
    import pystray
    from PIL import Image


#
# CONSTANTS
#
APP_SUPPORT: Path = Path(
    os.environ.get("JBA_APP_SUPPORT")
    or Path.home() / "Library/Application Support/JupyterBioacoustic"
)
ENV_BIN: Path = Path(os.environ.get("JBA_ENV_BIN") or Path(sys.executable).parent)
ICON_PNG: str = os.environ.get("JBA_ICON", "")
CONFIG: Path = APP_SUPPORT / "config.json"
SERVERFILE: Path = APP_SUPPORT / "server.json"
JDIR: Path = APP_SUPPORT / "jupyter"
LAUNCH_LOG: Path = APP_SUPPORT / "launch.log"     # also written by bootstrap.sh
JUPYTER_LOG: Path = APP_SUPPORT / "jupyter.log"   # JupyterLab's own output
MAX_LOG_BYTES: int = 5 * 1024 * 1024              # rotate jupyter.log -> jupyter.log.1 past this
PIXI_MANIFEST: Path = APP_SUPPORT / "env" / "pixi.toml"
# Test hook: `touch "$JBA_APP_SUPPORT/.jba-force-update"` to walk the whole update workflow
# once with no real release (see _update_available / _apply_update).
FORCE_UPDATE_FLAG: Path = APP_SUPPORT / ".jba-force-update"
PACKAGE: str = "jupyter-bioacoustic"              # the conda/PyPI package pixi updates
APP_TITLE: str = "Jupyter Bioacoustic"            # title of the native dialogs
WINFORMS: str = "Add-Type -AssemblyName System.Windows.Forms;"   # PowerShell dialog prelude
LOCALHOST: str = "127.0.0.1"

# config.json holds JSON values: root_dir (str), single_instance (bool) and
# shutdown_on_idle_minutes (False = never, or whole minutes).
Config = Dict[str, Any]
IdleValue = Union[bool, int]
Platform = Literal["mac", "windows", "linux"]

DEFAULT_CONFIG: Config = {
    "root_dir": "~", "single_instance": True, "shutdown_on_idle_minutes": False,
}
# Tray "Shut Down When Idle" presets — label → config value in minutes (False = never).
# A "Custom…" entry (handled separately) prompts for any value, e.g. 90m / 8h / 3d.
IDLE_OPTIONS: List[Tuple[str, IdleValue]] = [
    ("Never", False),
    ("1 hour", 60),
    ("8 hours", 480),
    ("1 day", 1440),
    ("3 days", 4320),
    ("1 week", 10080),
]


#
# PUBLIC
#
class Launcher:
    """Owns the Jupyter subprocess and the tray icon.

    Attributes:
        _cfg: The current config (refreshed from config.json whenever a setting changes).
        _proc: The running JupyterLab process, or None before the first start.
        _icon: The pystray icon, or None until ``run`` creates it.
        _updating: True while an update check / update is in progress.
    """

    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._proc: Optional[subprocess.Popen] = None
        self._icon: Optional["pystray.Icon"] = None
        self._updating = False

    def run(self) -> None:
        """Start the server, then run the tray icon until Quit (blocks the main thread)."""
        import pystray
        self._start()
        atexit.register(self._stop)   # backstop: kill jupyter even on an unclean exit
        self._icon = pystray.Icon("jupyter-bioacoustic", _make_icon(), APP_TITLE,
                                  menu=self._menu(pystray))
        self._icon.run(setup=self._on_ready)   # blocks on the menu-bar / tray loop (main thread)
        self._stop()                           # cleanup if the loop ever returns

    def _on_ready(self, icon: "pystray.Icon") -> None:
        """Show the icon once the tray loop is up (pystray's ``setup`` callback).

        Args:
            icon: The pystray icon being run.
        """
        icon.visible = True
        if sys.platform != "darwin":
            return
        # macOS: mark the status-bar image as a template so the OS renders it
        # black/white to match its own menu-bar icons (battery, wifi, …).
        try:
            if icon._icon_image is not None:
                icon._icon_image.setTemplate_(True)
                icon._status_item.button().setImage_(icon._icon_image)
        except Exception as e:
            _log(f"could not make the menu-bar icon a template image: {e!r}")
        self._hook_terminate()

    def _hook_terminate(self) -> None:
        """Stop jupyter when macOS terminates the app (Dock → Quit / Cmd-Q).

        The app shows in the Dock, and those quit paths terminate via Cocoa — bypassing our
        menu Quit — so observe NSApplicationWillTerminate. PyObjC is only present on macOS,
        hence the lazy import.
        """
        try:
            import AppKit
            from Foundation import NSNotificationCenter, NSObject
            launcher = self

            class _Terminator(NSObject):
                """Cocoa observer that forwards app termination to the launcher."""

                def onTerminate_(self, _note: Any) -> None:  # ObjC selector name
                    """Stop the server.

                    Args:
                        _note: The NSNotification (unused).
                    """
                    launcher._stop()

            self._terminator = _Terminator.alloc().init()
            NSNotificationCenter.defaultCenter().addObserver_selector_name_object_(
                self._terminator, b"onTerminate:",
                AppKit.NSApplicationWillTerminateNotification, None)
        except Exception as e:
            _log(f"could not hook app termination (Dock quit may orphan jupyter): {e!r}")

    def _menu(self, tray: ModuleType) -> "pystray.Menu":
        """Build the tray menu.

        Args:
            tray: The imported ``pystray`` module.

        Returns:
            The top-level menu.
        """
        return tray.Menu(
            tray.MenuItem(lambda _: self._status(), None, enabled=False),
            tray.MenuItem("Open in Browser", self._open, default=True),
            tray.MenuItem("Page blank or crashed? — Help", self._browser_help),
            tray.MenuItem("Check for Updates…", self._check_updates),
            tray.MenuItem("Change Start Folder…", self._change_folder),
            tray.MenuItem("Shut Down When Idle", self._idle_menu(tray)),
            tray.MenuItem(
                "Reuse Running App",
                self._toggle_single_instance,
                checked=lambda _item: bool(self._cfg.get("single_instance", True)),
            ),
            tray.Menu.SEPARATOR,
            tray.MenuItem("Uninstall…", self._uninstall),
            tray.MenuItem("Quit", self._quit),
        )

    def _status(self) -> str:
        """Return the disabled status line at the top of the menu.

        Returns:
            ``"Running — localhost:<port>"`` or ``"Stopped"``.
        """
        info = _server_info()
        return f"Running — localhost:{info['port']}" if _alive(info) else "Stopped"

    def _start(self) -> None:
        """Start JupyterLab and open the browser (in the background) once it is ready."""
        self._proc, info = _start_server(self._cfg)
        threading.Thread(target=self._open_when_ready, args=(info["port"],), daemon=True).start()

    def _open_when_ready(self, port: int) -> None:
        """Wait for the server to accept connections, open the browser, close the splash.

        Args:
            port: The port the server was started on.
        """
        if port and _wait_ready(int(port)):
            webbrowser.open(_url(_server_info()))
        _dismiss_setup_splash()   # first-run splash stays up until the app actually opens

    def _open(self, *_args: Any) -> None:
        """Open a browser tab on the server, restarting it first if it has stopped.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        info = _server_info()
        if _alive(info):
            webbrowser.open(_url(info))
        else:                      # server died (idle/crash) — restart on demand
            self._start()

    def _browser_help(self, *_args: Any) -> None:
        """Explain that a blank/crashed tab is a browser problem.

        The tray (and server) survive a browser-tab crash, so this is always reachable.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        _alert("The app is still running — a blank or crashed (grey) browser tab is a "
               "browser problem, not Jupyter Bioacoustic. Fully QUIT your browser and "
               "reopen it, then choose \"Open in Browser\" here. This often happens right "
               "after the browser auto-updates; if it keeps happening, try another browser.")

    def _check_updates(self, *_args: Any) -> None:
        """Run the update check on a worker thread (one at a time).

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        if self._updating:
            _alert("An update is already in progress.")
            return
        threading.Thread(target=self._do_update_check, daemon=True).start()

    def _do_update_check(self) -> None:
        """Probe for an update, ask, then stop → update → start so the new version loads.

        Runs off the UI thread. Stopping first means no files are in use while updating.
        Outcomes use ``_alert`` (a modal dialog) so the user always sees the result.
        """
        self._updating = True
        try:
            pixi = _pixi_bin()
            if not (pixi and PIXI_MANIFEST.exists()):
                _alert("Update check isn't available on this install.")
                return
            _notify("Checking for updates…")
            available = _update_available(pixi, PIXI_MANIFEST)
            if available is None:
                _alert("Could not check for updates — please check your internet connection.")
            elif not available:
                _alert("You're up to date — you have the latest version of Jupyter Bioacoustic.")
            elif _confirm_update():
                _notify("Updating — the app will reopen when it's done…")
                self._stop()
                ok = _apply_update(pixi, PIXI_MANIFEST)
                self._start()
                _alert("Updated to the latest version." if ok
                       else f"Update failed — details are in {LAUNCH_LOG}")
        finally:
            self._updating = False

    def _change_folder(self, *_args: Any) -> None:
        """Ask for a new start folder, save it and restart the server there.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        folder = _pick_folder()
        if not folder:
            return
        self._cfg = _save_setting("root_dir", folder)
        self._restart()            # apply the new root immediately

    def _idle_menu(self, tray: ModuleType) -> "pystray.Menu":
        """Build the 'Shut Down When Idle' submenu: presets + a Custom… prompt (radio items).

        Args:
            tray: The imported ``pystray`` module.

        Returns:
            The submenu.
        """
        items = [self._idle_item(tray, label, value) for label, value in IDLE_OPTIONS]
        items.append(tray.MenuItem(
            lambda _item: self._custom_label(),
            self._set_idle_custom,
            checked=lambda _item: self._idle_is_custom(),
            radio=True,
        ))
        return tray.Menu(*items)

    def _idle_item(self, tray: ModuleType, label: str, value: IdleValue) -> "pystray.MenuItem":
        """Build one preset radio item; it is checked when it matches the current setting.

        Args:
            tray: The imported ``pystray`` module.
            label: The menu text, e.g. ``"8 hours"``.
            value: The config value it sets (minutes, or False for never).

        Returns:
            The menu item.
        """
        return tray.MenuItem(
            label,
            lambda *_: self._set_idle(value),
            checked=lambda _item: (_idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
                                   == _idle_minutes(value)),
            radio=True,
        )

    def _idle_is_custom(self) -> bool:
        """Return whether the idle timeout is set but matches none of the presets.

        Returns:
            True for an off-preset (custom) timeout.
        """
        cur = _idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
        presets = {_idle_minutes(v) for _, v in IDLE_OPTIONS}
        return cur > 0 and cur not in presets

    def _custom_label(self) -> str:
        """Return the Custom… item's label, showing the custom value when one is set.

        Returns:
            ``"Custom (90m)…"`` for a custom timeout, else ``"Custom…"``.
        """
        cur = _idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
        return f"Custom ({_fmt_idle(cur)})…" if self._idle_is_custom() else "Custom…"

    def _set_idle_custom(self, *_args: Any) -> None:
        """Prompt for a custom idle timeout and apply it (nothing on cancel/invalid).

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        minutes = _pick_idle()
        if minutes:
            self._set_idle(minutes)

    def _set_idle(self, value: IdleValue) -> None:
        """Save the idle timeout and restart (it is a server launch argument).

        Args:
            value: Minutes, or False for never.
        """
        self._cfg = _save_setting("shutdown_on_idle_minutes", value)
        self._restart()

    def _toggle_single_instance(self, *_args: Any) -> None:
        """Flip "Reuse Running App"; it is read only at launch, so no restart is needed.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        current = _load_config().get("single_instance", True)
        self._cfg = _save_setting("single_instance", not current)

    def _uninstall(self, *_args: Any) -> None:
        """Confirm, stop the server, then hand deletion to a detached cleanup process.

        The cleanup waits for us to exit before deleting, because our interpreter lives
        inside the env being removed. User data outside the app is never touched.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        if not _confirm_uninstall():
            return
        self._stop()
        _spawn_cleanup()
        self._stop_icon()

    def _restart(self) -> None:
        """Stop the server process and start a fresh one (re-reads ``self._cfg``)."""
        _stop_proc(self._proc)
        self._start()

    def _quit(self, *_args: Any) -> None:
        """Stop the server and end the tray loop.

        Args:
            *_args: Ignored (pystray passes the icon and menu item).
        """
        self._stop()
        self._stop_icon()

    def _stop_icon(self) -> None:
        """End the tray loop (``run`` then returns), if the icon exists."""
        if self._icon is not None:
            self._icon.stop()

    def _stop(self) -> None:
        """Stop the server process and remove server.json."""
        _stop_proc(self._proc)
        SERVERFILE.unlink(missing_ok=True)


def main() -> None:
    """Reuse a running server, or start one and run the tray icon."""
    cfg = _load_config()
    info = _server_info()
    if cfg.get("single_instance", True) and _alive(info):
        webbrowser.open(_url(info))   # reuse → new tab, no second server/tray
        return
    Launcher(cfg).run()


#
# INTERNAL
#
def _ps_str(text: str) -> str:
    """Return ``text`` as a PowerShell single-quoted string literal.

    Single-quoted strings expand nothing; a quote inside is written twice. PowerShell also
    treats the curly quotes U+2018-U+201B as single quotes, so those are doubled too.
    Unescaped, a message like "You're up to date" broke the command and the dialog
    silently never appeared.

    Args:
        text: Any text (newlines are fine).

    Returns:
        The quoted literal, e.g. ``'You''re up to date'``.
    """
    for quote in ("'", "\u2018", "\u2019", "\u201a", "\u201b"):
        text = text.replace(quote, quote * 2)
    return f"'{text}'"


def _as_str(text: str) -> str:
    """Return ``text`` as an AppleScript double-quoted string literal.

    Args:
        text: Any text.

    Returns:
        The quoted literal with backslashes, double quotes and newlines escaped.
    """
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def _log(msg: str) -> None:
    """Append a timestamped line to launch.log (best effort: logging must never crash the app).

    Args:
        msg: The message (may span lines).
    """
    try:
        LAUNCH_LOG.parent.mkdir(parents=True, exist_ok=True)
        # errors="replace": odd characters in pixi output must not raise on write
        with open(LAUNCH_LOG, "a", errors="replace") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} [launcher] {msg}\n")
    except Exception:  # the one deliberate silent catch: there is nowhere left to report it
        pass


def _rotate(path: Path) -> None:
    """Move ``path`` to ``<path>.1`` once it exceeds MAX_LOG_BYTES (keeps one old copy).

    Args:
        path: The log file.
    """
    try:
        if path.exists() and path.stat().st_size > MAX_LOG_BYTES:
            os.replace(path, path.with_name(path.name + ".1"))
    except OSError as e:
        _log(f"could not rotate {path}: {e!r}")


def _load_config() -> Config:
    """Read config.json over the defaults, creating the file with defaults if missing.

    Returns:
        The merged config (the defaults alone if the file is unreadable).
    """
    cfg = dict(DEFAULT_CONFIG)
    if not CONFIG.exists():
        APP_SUPPORT.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
    try:
        cfg.update(json.loads(CONFIG.read_text()))
    except Exception as e:
        _log(f"{CONFIG} is unreadable, using the defaults: {e!r}")
    return cfg


def _save_setting(key: str, value: Any) -> Config:
    """Set one key in config.json (re-reading the file first) and return the new config.

    Args:
        key: The config key, e.g. ``"root_dir"``.
        value: Its new (JSON-serializable) value.

    Returns:
        The full config as written.
    """
    cfg = _load_config()
    cfg[key] = value
    CONFIG.write_text(json.dumps(cfg, indent=2))
    return cfg


def _dismiss_setup_splash() -> None:
    """Kill the first-run install splash (PID handed off by the bootstrap), if any."""
    pid = os.environ.get("JBA_SETUP_PID")
    if not pid:
        return
    try:
        os.kill(int(pid), signal.SIGTERM)
    except (OSError, ValueError) as e:
        _log(f"could not close the setup splash (pid {pid!r}): {e!r}")


def _idle_minutes(value: Any) -> int:
    """Normalize a shutdown_on_idle_minutes config value to whole minutes.

    Args:
        value: The raw config value (False/None/"" = never, an int, or a numeric string).

    Returns:
        Whole minutes; 0 means never (also for invalid values).
    """
    try:
        return int(value) if value else 0
    except (TypeError, ValueError):
        return 0


def _fmt_idle(minutes: int) -> str:
    """Render minutes compactly for a menu label: 4320 -> '3d', 480 -> '8h', 90 -> '90m'.

    Args:
        minutes: Whole minutes.

    Returns:
        The largest whole unit (days, hours, else minutes) with its suffix.
    """
    if minutes and minutes % 1440 == 0:
        return f"{minutes // 1440}d"
    if minutes and minutes % 60 == 0:
        return f"{minutes // 60}h"
    return f"{minutes}m"


def _parse_idle(text: str) -> Optional[int]:
    """Parse '3d' / '8h' / '90m' / '90' (bare = minutes) into minutes.

    Args:
        text: User input (surrounding whitespace and case are ignored).

    Returns:
        The positive number of minutes, or None if the input is empty, invalid or <= 0.
    """
    text = (text or "").strip().lower()
    if not text:
        return None
    mult = {"d": 1440, "h": 60, "m": 1}.get(text[-1])
    num = text[:-1] if mult else text
    try:
        minutes = int(round(float(num) * (mult or 1)))
    except ValueError:
        return None
    return minutes if minutes > 0 else None


def _expand(root: str) -> str:
    """Expand a leading ``~`` in the configured root dir (either slash style).

    Args:
        root: The configured root_dir.

    Returns:
        The home dir for ""/"~", home-relative paths resolved, anything else unchanged.
    """
    if not root or root == "~":
        return str(Path.home())
    if root[:2] in ("~/", "~\\"):
        return str(Path.home() / root[2:])
    return root


def _port_in_use(port: int) -> bool:
    """Return whether something on localhost accepts connections on ``port``.

    Args:
        port: The TCP port.

    Returns:
        True if a connection succeeds.
    """
    with socket.socket() as s:
        return s.connect_ex((LOCALHOST, port)) == 0


def _free_port(start: int = 8888, end: int = 9000) -> int:
    """Return the first port in ``[start, end)`` with nothing listening on it.

    Args:
        start: The first port to try.
        end: One past the last port to try.

    Returns:
        A free port, or ``start`` if every port in the range is taken.
    """
    for port in range(start, end):
        if not _port_in_use(port):
            return port
    return start


def _server_info() -> Dict[str, Any]:
    """Read server.json (port, token, pid of the running server).

    Returns:
        The recorded info, or an empty dict when there is none (or it is unreadable).
    """
    try:
        return json.loads(SERVERFILE.read_text())
    except FileNotFoundError:      # normal: no server running
        return {}
    except Exception as e:
        _log(f"{SERVERFILE} is unreadable: {e!r}")
        return {}


def _alive(info: Dict[str, Any]) -> bool:
    """Return whether the recorded server process exists and its port answers.

    Args:
        info: Server info as returned by ``_server_info``.

    Returns:
        True only if both the pid and the port check out.
    """
    pid, port = info.get("pid"), info.get("port")
    if not pid or not port:
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return _port_in_use(int(port))


def _url(info: Dict[str, Any]) -> str:
    """Build the JupyterLab URL (with token) for a recorded server.

    Args:
        info: Server info with ``port`` and ``token``.

    Returns:
        ``http://localhost:<port>/lab?token=<token>``.

    Raises:
        KeyError: If ``port`` or ``token`` is missing.
    """
    return f"http://localhost:{info['port']}/lab?token={info['token']}"


def _wait_ready(port: int, timeout: float = 90.0) -> bool:
    """Poll until ``port`` accepts connections.

    Args:
        port: The server port.
        timeout: Seconds to wait before giving up.

    Returns:
        True once the port answers, False on timeout.
    """
    end = time.time() + timeout
    while time.time() < end:
        if _port_in_use(port):
            return True
        time.sleep(0.3)
    return False


def _jupyter_env(token: str) -> Dict[str, str]:
    """Return the environment for the JupyterLab child: isolated Jupyter dirs + token.

    Args:
        token: The server token.

    Returns:
        A copy of ``os.environ`` with the env's bin first on PATH and the JUPYTER_* vars set.
    """
    env = os.environ.copy()
    env.update({
        "PATH": f"{ENV_BIN}{os.pathsep}{env.get('PATH', '')}",
        "JUPYTER_TOKEN": token,
        "JUPYTER_CONFIG_DIR": str(JDIR / "config"),
        "JUPYTER_DATA_DIR": str(JDIR / "data"),
        "JUPYTER_RUNTIME_DIR": str(JDIR / "runtime"),
        "JUPYTER_PREFER_ENV_PATH": "1",   # app's own labextension wins over user-global dirs
    })
    return env


def _jupyter_args(root: str, port: int, idle_minutes: int) -> List[str]:
    """Return the ``jupyter lab`` command line.

    Args:
        root: The server root dir (already expanded).
        port: The port to serve on (no retries: it was just checked free).
        idle_minutes: Shut down after this many idle minutes; 0 = never.

    Returns:
        The argv, run with the env python that is running this launcher.
    """
    args = [
        sys.executable, "-m", "jupyter", "lab", "--no-browser",
        f"--ServerApp.root_dir={root}",
        "--ServerApp.iopub_data_rate_limit=1e10",   # base64 spectrograms
        f"--ServerApp.port={port}", "--ServerApp.port_retries=0",
    ]
    if idle_minutes > 0:
        args.append(f"--ServerApp.shutdown_no_activity_timeout={idle_minutes * 60}")
    return args


def _start_server(cfg: Config) -> Tuple[subprocess.Popen, Dict[str, Any]]:
    """Launch JupyterLab (isolated dirs, pinned root, token) and record server.json.

    Args:
        cfg: The launcher config (root_dir, shutdown_on_idle_minutes).

    Returns:
        The server process and its info (``port``, ``token``, ``pid``).
    """
    root = _expand(cfg.get("root_dir", "~"))
    Path(root).mkdir(parents=True, exist_ok=True)
    for sub in ("config", "data", "runtime"):
        (JDIR / sub).mkdir(parents=True, exist_ok=True)
    port = _free_port()
    token = secrets.token_hex(16)
    args = _jupyter_args(root, port, _idle_minutes(cfg.get("shutdown_on_idle_minutes")))
    _rotate(JUPYTER_LOG)
    _log(f"starting jupyter lab on port {port} (output: {JUPYTER_LOG})")
    with open(JUPYTER_LOG, "ab") as out:      # the child keeps its own copy of the handle
        proc = subprocess.Popen(args, env=_jupyter_env(token), stdout=out,
                                stderr=subprocess.STDOUT)
    info = {"port": port, "token": token, "pid": proc.pid}
    SERVERFILE.write_text(json.dumps(info))
    return proc, info


def _stop_proc(proc: Optional[subprocess.Popen]) -> None:
    """Terminate a process, killing it if it hasn't exited after 10 seconds.

    Args:
        proc: The process (None, or one that already exited, is a no-op).
    """
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(10)
    except Exception as e:
        _log(f"jupyter (pid {proc.pid}) did not stop in 10s, killing it: {e!r}")
        proc.kill()


def _pixi_bin() -> Optional[Path]:
    """Return the bundled pixi binary in the app-support dir.

    Returns:
        Its path, or None if it is not there (e.g. a dev install).
    """
    p = APP_SUPPORT / ("pixi.exe" if sys.platform.startswith("win") else "pixi")
    return p if p.exists() else None


def _pixi_update_args(pixi: Path, manifest: Path, dry_run: bool = False) -> List[str]:
    """Return the ``pixi update jupyter-bioacoustic`` command line.

    Args:
        pixi: The pixi binary.
        manifest: The env's pixi.toml.
        dry_run: Only report what would change.

    Returns:
        The argv.
    """
    args = [str(pixi), "update", PACKAGE, "--manifest-path", str(manifest)]
    return args + ["--dry-run"] if dry_run else args


def _update_available(pixi: Path, manifest: Path) -> Optional[bool]:
    """Return whether an update is pending within the manifest's version constraint.

    Mirrors the bootstrap probe: ``pixi update --dry-run`` names the package iff it would
    change it.

    Args:
        pixi: The pixi binary.
        manifest: The env's pixi.toml.

    Returns:
        True/False, or None if the probe could not run or failed (e.g. offline).
    """
    if FORCE_UPDATE_FLAG.exists():     # test hook (see FORCE_UPDATE_FLAG)
        return True
    try:
        out = subprocess.run(_pixi_update_args(pixi, manifest, dry_run=True),
                             capture_output=True, text=True, timeout=180)
    except Exception as e:
        _log(f"pixi update --dry-run failed to run: {e!r}")
        return None
    if out.returncode != 0:
        _log(f"pixi update --dry-run exited {out.returncode}\n{out.stdout}{out.stderr}".rstrip())
        return None
    return PACKAGE in (out.stdout + out.stderr).lower()


def _apply_update(pixi: Path, manifest: Path) -> bool:
    """Run ``pixi update jupyter-bioacoustic`` within its constraint, logging pixi's output.

    Args:
        pixi: The pixi binary.
        manifest: The env's pixi.toml.

    Returns:
        True on success.
    """
    # Test hook (see FORCE_UPDATE_FLAG): simulate a successful update and consume the flag,
    # so the confirm → "updating" → restart → "Updated" flow runs without a real release.
    if FORCE_UPDATE_FLAG.exists():
        FORCE_UPDATE_FLAG.unlink(missing_ok=True)
        time.sleep(2)
        return True
    try:
        out = subprocess.run(_pixi_update_args(pixi, manifest),
                             capture_output=True, text=True, timeout=1800)
    except Exception as e:
        _log(f"pixi update failed to run: {e!r}")
        return False
    _log(f"pixi update exited {out.returncode}\n{out.stdout}{out.stderr}".rstrip())
    return out.returncode == 0


def _platform() -> Platform:
    """Return which native-dialog toolkit applies to this OS.

    Returns:
        ``"mac"`` (AppleScript), ``"windows"`` (PowerShell) or ``"linux"`` (zenity etc.).
    """
    if sys.platform == "darwin":
        return "mac"
    if sys.platform.startswith("win"):
        return "windows"
    return "linux"


def _run(args: List[str]) -> Optional["subprocess.CompletedProcess[str]"]:
    """Run a command to completion, capturing its text output.

    Args:
        args: The argv.

    Returns:
        The finished process, or None (logged) if it could not be run at all.
    """
    try:
        return subprocess.run(args, capture_output=True, text=True)
    except Exception as e:
        _log(f"could not run {args[0]}: {e!r}")
        return None


def _run_native(
    mac: Optional[str], windows: Optional[str], linux: Optional[List[str]]
) -> Optional["subprocess.CompletedProcess[str]"]:
    """Run the native dialog for this platform.

    Each script must already have its user text quoted (``_as_str`` / ``_ps_str``).

    Args:
        mac: An AppleScript, run with ``osascript -e``.
        windows: A PowerShell script, run with ``powershell -NoProfile -Command``.
        linux: A full command line (zenity / notify-send).

    Returns:
        The finished process, or None if this platform has no dialog here or it could
        not be run.
    """
    platform = _platform()
    if platform == "mac" and mac is not None:
        return _run(["osascript", "-e", mac])
    if platform == "windows" and windows is not None:
        return _run(["powershell", "-NoProfile", "-Command", windows])
    if platform == "linux" and linux is not None:
        return _run(linux)
    return None


def _answered_yes(result: Optional["subprocess.CompletedProcess[str]"], mac_button: str) -> bool:
    """Interpret a Yes/No dialog run by ``_run_native``.

    Args:
        result: The dialog process (None = it never ran).
        mac_button: The macOS button that means yes (osascript prints the one clicked).

    Returns:
        True only on an explicit confirm: on macOS exit 0 with ``mac_button`` in stdout,
        on Windows the MessageBox printing "Yes", on Linux zenity exiting 0.
    """
    if result is None:
        return False
    platform = _platform()
    if platform == "mac":
        return result.returncode == 0 and mac_button in result.stdout
    if platform == "windows":
        return result.stdout.strip() == "Yes"
    return result.returncode == 0


def _notify(msg: str) -> None:
    """Show a soft, non-blocking progress hint (a banner; may be suppressed by Focus/DND).

    Windows has no silent toast without extra dependencies, so nothing is shown there;
    outcomes the user must see use ``_alert``.

    Args:
        msg: The message.
    """
    _run_native(
        mac=f"display notification {_as_str(msg)} with title {_as_str(APP_TITLE)}",
        windows=None,
        linux=["notify-send", APP_TITLE, msg],
    )


def _alert(msg: str) -> None:
    """Show a blocking, always-visible message with an OK button.

    Used for outcomes the user must see (notifications can be silently suppressed). On
    Linux, falls back to notify-send if zenity fails.

    Args:
        msg: The message.
    """
    result = _run_native(
        mac=(f"display dialog {_as_str(msg)} with title {_as_str(APP_TITLE)} "
             'buttons {"OK"} default button "OK"'),
        windows=(f"{WINFORMS}"
                 f"[System.Windows.Forms.MessageBox]::Show({_ps_str(msg)},{_ps_str(APP_TITLE)})"),
        linux=["zenity", "--info", "--title", APP_TITLE, "--text", msg],
    )
    if _platform() == "linux" and result is not None and result.returncode != 0:
        _run(["notify-send", APP_TITLE, msg])


def _confirm_update() -> bool:
    """Ask Yes/No before updating.

    Returns:
        True only on an explicit confirm.
    """
    msg = "An update is available. Update now? The app will reopen."
    result = _run_native(
        mac=(f"button returned of (display dialog {_as_str(msg)} "
             f"with title {_as_str(APP_TITLE)} "
             'buttons {"Later", "Update"} default button "Update")'),
        windows=(f"{WINFORMS}"
                 f"[System.Windows.Forms.MessageBox]::Show({_ps_str(msg)},{_ps_str(APP_TITLE)},"
                 "'YesNo','Question')"),
        linux=["zenity", "--question", "--title", APP_TITLE, "--text", msg],
    )
    return _answered_yes(result, mac_button="Update")


def _confirm_uninstall() -> bool:
    """Ask for a native, scary, default-to-Cancel confirmation before uninstalling.

    Returns:
        True only on an explicit confirm.
    """
    title = "Uninstall Jupyter Bioacoustic"
    msg = (
        "ARE YOU REALLY SURE YOU WANT TO DO THIS?\n\n"
        "This permanently removes the Jupyter Bioacoustic application and the "
        "environment it downloaded.\n\n"
        "Your notebooks, data, annotations, and any files in your own folders are NOT "
        "affected - only the app itself is removed. This cannot be undone."
    )
    result = _run_native(
        mac=(f"display dialog {_as_str(msg)} with title {_as_str(title)} "
             'buttons {"Cancel", "Delete Anyway"} default button "Cancel" '
             "with icon caution"),
        windows=(f"{WINFORMS}"
                 f"[System.Windows.Forms.MessageBox]::Show({_ps_str(msg)},{_ps_str(title)},"
                 "'YesNo','Warning')"),
        linux=["zenity", "--question", "--title", title, "--text", msg],
    )
    return _answered_yes(result, mac_button="Delete Anyway")


def _pick_idle() -> Optional[int]:
    """Ask for a custom idle timeout in a native text prompt.

    Returns:
        Minutes, or None on cancel / invalid input.
    """
    prompt = ("Shut down JupyterLab after how long with no activity? Enter a number with a "
              "unit - m (minutes), h (hours), or d (days). Examples: 90m, 8h, 3d.")
    title = "Shut Down When Idle"
    result = _run_native(
        mac=(f"text returned of (display dialog {_as_str(prompt)} "
             f'with title {_as_str(title)} default answer "3d")'),
        windows=("Add-Type -AssemblyName Microsoft.VisualBasic;"
                 f"[Microsoft.VisualBasic.Interaction]::InputBox({_ps_str(prompt)},"
                 f"{_ps_str(title)},'3d')"),
        linux=["zenity", "--entry", "--title", title, "--text", prompt, "--entry-text", "3d"],
    )
    if result is None:
        return None
    # The Windows InputBox exits 0 even on Cancel (and prints nothing); the others exit != 0.
    if _platform() != "windows" and result.returncode != 0:
        return None
    return _parse_idle(result.stdout)


def _pick_folder() -> str:
    """Show the native folder picker.

    Returns:
        The chosen folder (macOS: POSIX path without a trailing slash), or "" on cancel.
    """
    result = _run_native(
        mac=("POSIX path of (choose folder with prompt "
             '"Choose the folder Jupyter Bioacoustic should open in:")'),
        windows=(f"{WINFORMS}"
                 "$f=New-Object System.Windows.Forms.FolderBrowserDialog;"
                 "if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}"),
        linux=["zenity", "--file-selection", "--directory"],
    )
    if result is None:
        return ""
    if _platform() == "mac":
        return result.stdout.strip().rstrip("/") if result.returncode == 0 else ""
    return result.stdout.strip()


def _app_bundle() -> Optional[Path]:
    """Return the enclosing macOS .app bundle this launcher runs from.

    Returns:
        The ``.app`` path, or None when not on macOS / not inside a bundle.
    """
    if sys.platform != "darwin":
        return None
    for parent in Path(__file__).resolve().parents:
        if parent.suffix == ".app":
            return parent
    return None


def _cleanup_targets() -> List[Path]:
    """Return everything the uninstaller deletes (the app + env, never user data).

    Returns:
        APP_SUPPORT (env, bundled pixi, config, logs, jupyter state), plus the macOS
        .app and its dev folder-picker, or the Windows Start-menu shortcut.
    """
    targets = [APP_SUPPORT]
    bundle = _app_bundle()
    if bundle is not None:
        targets.append(bundle)
        targets.append(bundle.parent / "Set JupyterBioacoustic Folder.command")
    if sys.platform.startswith("win"):
        targets.append(Path(os.environ.get("APPDATA", ""))
                       / "Microsoft/Windows/Start Menu/Programs/Jupyter Bioacoustic.lnk")
    return targets


def _cleanup_command(pid: int, targets: List[Path], windows: bool) -> List[str]:
    """Return a shell command that waits for ``pid`` to exit, then deletes ``targets``.

    Args:
        pid: The process to wait for (this launcher).
        targets: The paths to delete recursively.
        windows: Build a PowerShell command instead of a POSIX ``sh`` one.

    Returns:
        The argv.
    """
    if windows:
        items = ",".join(_ps_str(str(t)) for t in targets)
        ps = (f"Wait-Process -Id {pid} -ErrorAction SilentlyContinue;"
              "Start-Sleep -Milliseconds 500;"
              f"foreach($p in @({items})){{Remove-Item -LiteralPath $p -Recurse -Force "
              "-ErrorAction SilentlyContinue}")
        return ["powershell", "-NoProfile", "-Command", ps]
    rm = " ".join(shlex.quote(str(t)) for t in targets)
    return ["/bin/sh", "-c", f"while kill -0 {pid} 2>/dev/null; do sleep 0.3; done; rm -rf {rm}"]


def _spawn_cleanup() -> None:
    """Start a detached process that waits for THIS process to exit, then uninstalls."""
    windows = sys.platform.startswith("win")
    args = _cleanup_command(os.getpid(), _cleanup_targets(), windows)
    _log(f"uninstalling: {args[-1]}")
    if windows:
        flags = (getattr(subprocess, "DETACHED_PROCESS", 0)
                 | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        subprocess.Popen(args, creationflags=flags, close_fds=True)
    else:
        subprocess.Popen(args, start_new_session=True, close_fds=True)


def _is_dark_menubar() -> bool:
    """Best-effort check whether the menu bar / taskbar is dark (→ render the icon white).

    Returns:
        True for a dark theme; False if light or unknown.
    """
    if sys.platform == "darwin":
        result = _run(["defaults", "read", "-g", "AppleInterfaceStyle"])
        return result is not None and "Dark" in result.stdout
    if sys.platform.startswith("win"):
        try:
            import winreg   # Windows-only stdlib module
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
            return winreg.QueryValueEx(key, "SystemUsesLightTheme")[0] == 0
        except Exception as e:
            _log(f"could not read the Windows theme: {e!r}")
    return False


def _make_icon() -> "Image.Image":
    """Build the tray image.

    Uses the bundled black PNG (JBA_ICON) or a drawn fallback, inverted to white on a
    dark menu bar / taskbar so the black mark stays visible.

    Returns:
        An RGBA image.
    """
    from PIL import Image, ImageDraw
    if ICON_PNG and os.path.exists(ICON_PNG):
        img = Image.open(ICON_PNG).convert("RGBA")
    else:
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((3, 3, 60, 60), outline=(0, 0, 0, 255), width=3)
        d.line([(10, 32), (20, 14), (28, 50), (38, 10), (46, 52), (54, 32)],
               fill=(0, 0, 0, 255), width=4)
    # macOS uses a template image (set in Launcher._on_ready) so the OS picks
    # black/white itself; elsewhere there's no template, so invert on a dark bar.
    if sys.platform != "darwin" and _is_dark_menubar():
        alpha = img.split()[3]
        white = Image.new("L", img.size, 255)
        img = Image.merge("RGBA", (white, white, white, alpha))
    return img


if __name__ == "__main__":
    main()
