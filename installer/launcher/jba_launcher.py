"""
Jupyter Bioacoustic desktop launcher

A cross-platform menu-bar / system-tray app (pystray) that owns the JupyterLab
server lifecycle for the desktop installer:

  * starts JupyterLab as a subprocess (isolated Jupyter dirs, pinned root_dir,
    token, IOPub limit, optional idle-shutdown),
  * shows a tray icon (macOS menu bar / Windows + Linux system tray) with
    Open in Browser / Change Start Folder… / Quit,
  * Quit (or server death) shuts the server down — no orphaned process,
  * single-instance: a second launch opens a new browser tab to the running
    server instead of spawning another.

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
import time
import webbrowser
from pathlib import Path
from typing import Optional

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
DEFAULT_CONFIG: dict = {"root_dir": "~", "single_instance": True, "shutdown_on_idle_minutes": False}
# Tray "Shut Down When Idle" presets — label → config value in minutes (False = never).
# A "Custom…" entry (handled separately) prompts for any value, e.g. 90m / 8h / 3d.
IDLE_OPTIONS: list = [
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
class Launcher:
    """Owns the Jupyter subprocess and the tray icon."""

    def __init__(self, cfg: dict) -> None:
        self._cfg = cfg
        self._proc: Optional[subprocess.Popen] = None
        self._icon = None
        self._updating = False

    def run(self) -> None:
        import pystray
        self._start()
        atexit.register(self._stop)   # backstop: kill jupyter even on an unclean exit
        self._icon = pystray.Icon(
            "jupyter-bioacoustic", _make_icon(), "Jupyter Bioacoustic", menu=self._menu(pystray)
        )
        self._icon.run(setup=self._on_ready)   # blocks on the menu-bar / tray loop (main thread)
        self._stop()                           # cleanup if the loop ever returns

    def _on_ready(self, icon) -> None:
        icon.visible = True
        # macOS: mark the status-bar image as a template so the OS renders it
        # black/white to match its own menu-bar icons (battery, wifi, …).
        if sys.platform == "darwin":
            try:
                if icon._icon_image is not None:
                    icon._icon_image.setTemplate_(True)
                    icon._status_item.button().setImage_(icon._icon_image)
            except Exception:
                pass
            self._hook_terminate()

    def _hook_terminate(self) -> None:
        # The app shows in the Dock; Dock → Quit / Cmd-Q terminate via Cocoa, which
        # bypasses our menu Quit, so hook NSApplicationWillTerminate to stop jupyter.
        try:
            from Foundation import NSObject, NSNotificationCenter
            import AppKit
            launcher = self

            class _Terminator(NSObject):
                def onTerminate_(self, _note):
                    launcher._stop()

            self._terminator = _Terminator.alloc().init()
            NSNotificationCenter.defaultCenter().addObserver_selector_name_object_(
                self._terminator, b"onTerminate:",
                AppKit.NSApplicationWillTerminateNotification, None)
        except Exception:
            pass

    def _menu(self, pystray):
        return pystray.Menu(
            pystray.MenuItem(lambda _: self._status(), None, enabled=False),
            pystray.MenuItem("Open in Browser", self._open, default=True),
            pystray.MenuItem("Check for Updates…", self._check_updates),
            pystray.MenuItem("Change Start Folder…", self._change_folder),
            pystray.MenuItem("Shut Down When Idle", self._idle_menu(pystray)),
            pystray.MenuItem(
                "Reuse Running App",
                self._toggle_single_instance,
                checked=lambda _item: bool(self._cfg.get("single_instance", True)),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Uninstall…", self._uninstall),
            pystray.MenuItem("Quit", self._quit),
        )

    def _status(self) -> str:
        info = _server_info()
        return f"Running — localhost:{info['port']}" if _alive(info) else "Stopped"

    def _start(self) -> None:
        self._proc, _ = _start_server(self._cfg)
        port = _server_info().get("port")
        # open the browser once the server is accepting connections
        import threading
        threading.Thread(target=self._open_when_ready, args=(port,), daemon=True).start()

    def _open_when_ready(self, port) -> None:
        if port and _wait_ready(int(port)):
            webbrowser.open(_url(_server_info()))
        _dismiss_setup_splash()   # first-run splash stays up until the app actually opens

    def _open(self, *_args) -> None:
        info = _server_info()
        if _alive(info):
            webbrowser.open(_url(info))
        else:                      # server died (idle/crash) — restart on demand
            self._start()

    def _check_updates(self, *_args) -> None:
        import threading
        if self._updating:
            _alert("An update is already in progress.")
            return
        threading.Thread(target=self._do_update_check, daemon=True).start()

    def _do_update_check(self) -> None:
        # Off the UI thread: probe with --dry-run, prompt, then stop → update → start so
        # the new version is loaded (and no files are in use while updating). Outcomes use
        # _alert (a modal dialog) so the user always sees the result.
        self._updating = True
        try:
            pixi, manifest = _pixi_bin(), APP_SUPPORT / "env" / "pixi.toml"
            if not (pixi and manifest.exists()):
                _alert("Update check isn't available on this install.")
                return
            _notify("Checking for updates…")
            available = _update_available(pixi, manifest)
            if available is None:
                _alert("Could not check for updates — please check your internet connection.")
            elif not available:
                _alert("You're up to date — you have the latest version of Jupyter Bioacoustic.")
            elif _confirm_update():
                _notify("Updating — the app will reopen when it's done…")
                self._stop()
                ok = _apply_update(pixi, manifest)
                self._start()
                _alert("Updated to the latest version." if ok
                       else "Update failed — see the log for details.")
        finally:
            self._updating = False

    def _change_folder(self, *_args) -> None:
        folder = _pick_folder()
        if not folder:
            return
        cfg = _load_config()
        cfg["root_dir"] = folder
        CONFIG.write_text(json.dumps(cfg, indent=2))
        self._cfg = cfg
        self._restart()            # apply the new root immediately

    def _idle_menu(self, pystray):
        """The 'Shut Down When Idle' submenu: presets + a Custom… prompt, all radio items."""
        items = [self._idle_item(pystray, label, value) for label, value in IDLE_OPTIONS]
        items.append(pystray.MenuItem(
            lambda _item: self._custom_label(),
            self._set_idle_custom,
            checked=lambda _item: self._idle_is_custom(),
            radio=True,
        ))
        return pystray.Menu(*items)

    def _idle_item(self, pystray, label: str, value):
        """A radio item under 'Shut Down When Idle'; checked when it's the current setting."""
        return pystray.MenuItem(
            label,
            lambda *_: self._set_idle(value),
            checked=lambda _item: (_idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
                                   == _idle_minutes(value)),
            radio=True,
        )

    def _idle_is_custom(self) -> bool:
        """True when the current idle value is set but matches none of the presets."""
        cur = _idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
        presets = {_idle_minutes(v) for _, v in IDLE_OPTIONS}
        return cur > 0 and cur not in presets

    def _custom_label(self) -> str:
        cur = _idle_minutes(self._cfg.get("shutdown_on_idle_minutes"))
        return f"Custom ({_fmt_idle(cur)})…" if self._idle_is_custom() else "Custom…"

    def _set_idle_custom(self, *_args) -> None:
        minutes = _pick_idle()
        if minutes:
            self._set_idle(minutes)

    def _set_idle(self, value) -> None:
        cfg = _load_config()
        cfg["shutdown_on_idle_minutes"] = value
        CONFIG.write_text(json.dumps(cfg, indent=2))
        self._cfg = cfg
        self._restart()            # the timeout is a server launch arg, so restart to apply

    def _toggle_single_instance(self, *_args) -> None:
        # Read only at launch in main(), so no restart — applies on the next launch.
        cfg = _load_config()
        cfg["single_instance"] = not cfg.get("single_instance", True)
        CONFIG.write_text(json.dumps(cfg, indent=2))
        self._cfg = cfg

    def _uninstall(self, *_args) -> None:
        # Confirm (default = Cancel), stop the server, then hand cleanup to a detached
        # process that waits for us to exit before deleting (our interpreter lives inside
        # the env we're removing). User data outside the app is never touched.
        if not _confirm_uninstall():
            return
        self._stop()
        _spawn_cleanup()
        if self._icon is not None:
            self._icon.stop()

    def _restart(self) -> None:
        _stop_proc(self._proc)
        self._start()

    def _quit(self, *_args) -> None:
        self._stop()
        if self._icon is not None:
            self._icon.stop()

    def _stop(self) -> None:
        _stop_proc(self._proc)
        SERVERFILE.unlink(missing_ok=True)


def _load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if not CONFIG.exists():
        APP_SUPPORT.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
    try:
        cfg.update(json.loads(CONFIG.read_text()))
    except Exception:
        pass
    return cfg


def _dismiss_setup_splash() -> None:
    """Kill the first-run install splash (PID handed off by the bootstrap), if any."""
    pid = os.environ.get("JBA_SETUP_PID")
    if not pid:
        return
    try:
        os.kill(int(pid), signal.SIGTERM)
    except (OSError, ValueError):
        pass


def _idle_minutes(value) -> int:
    """Normalize a shutdown_on_idle_minutes config value to whole minutes (0 = never)."""
    try:
        return int(value) if value else 0
    except (TypeError, ValueError):
        return 0


def _fmt_idle(minutes: int) -> str:
    """Render minutes compactly for a menu label: 4320 -> '3d', 480 -> '8h', 90 -> '90m'."""
    if minutes and minutes % 1440 == 0:
        return f"{minutes // 1440}d"
    if minutes and minutes % 60 == 0:
        return f"{minutes // 60}h"
    return f"{minutes}m"


def _parse_idle(text: str) -> Optional[int]:
    """Parse '3d' / '8h' / '90m' / '90' (bare = minutes) into minutes (>0), else None."""
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


def _pick_idle() -> Optional[int]:
    """Native text prompt for a custom idle timeout → minutes (or None on cancel/invalid)."""
    prompt = ("Shut down JupyterLab after how long with no activity? Enter a number with a "
              "unit - m (minutes), h (hours), or d (days). Examples: 90m, 8h, 3d.")
    title = "Shut Down When Idle"
    try:
        if sys.platform == "darwin":
            asmsg = prompt.replace('"', '\\"')
            script = (f'text returned of (display dialog "{asmsg}" with title "{title}" '
                      'default answer "3d")')
            out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
            return _parse_idle(out.stdout) if out.returncode == 0 else None
        if sys.platform.startswith("win"):
            ps = ("Add-Type -AssemblyName Microsoft.VisualBasic;"
                  f"[Microsoft.VisualBasic.Interaction]::InputBox('{prompt}','{title}','3d')")
            out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                                 capture_output=True, text=True)
            return _parse_idle(out.stdout)
        out = subprocess.run(["zenity", "--entry", "--title", title, "--text", prompt,
                              "--entry-text", "3d"], capture_output=True, text=True)
        return _parse_idle(out.stdout) if out.returncode == 0 else None
    except Exception:
        return None


def _expand(root: str) -> str:
    if not root or root == "~":
        return str(Path.home())
    if root[:2] in ("~/", "~\\"):
        return str(Path.home() / root[2:])
    return root


def _free_port(start: int = 8888, end: int = 9000) -> int:
    for p in range(start, end):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return start


def _server_info() -> dict:
    try:
        return json.loads(SERVERFILE.read_text())
    except Exception:
        return {}


def _alive(info: dict) -> bool:
    pid, port = info.get("pid"), info.get("port")
    if not pid or not port:
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", int(port))) == 0


def _url(info: dict) -> str:
    return f"http://localhost:{info['port']}/lab?token={info['token']}"


def _wait_ready(port: int, timeout: float = 90.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.3)
    return False


def _start_server(cfg: dict) -> tuple:
    """Launch JupyterLab (isolated dirs, pinned root, token) and record server.json."""
    root = _expand(cfg.get("root_dir", "~"))
    Path(root).mkdir(parents=True, exist_ok=True)
    for sub in ("config", "data", "runtime"):
        (JDIR / sub).mkdir(parents=True, exist_ok=True)
    port = _free_port()
    token = secrets.token_hex(16)
    env = os.environ.copy()
    env.update({
        "PATH": f"{ENV_BIN}{os.pathsep}{env.get('PATH', '')}",
        "JUPYTER_TOKEN": token,
        "JUPYTER_CONFIG_DIR": str(JDIR / "config"),
        "JUPYTER_DATA_DIR": str(JDIR / "data"),
        "JUPYTER_RUNTIME_DIR": str(JDIR / "runtime"),
        "JUPYTER_PREFER_ENV_PATH": "1",   # app's own labextension wins over user-global dirs
    })
    args = [
        sys.executable, "-m", "jupyter", "lab", "--no-browser",   # the env python running us
        f"--ServerApp.root_dir={root}",
        "--ServerApp.iopub_data_rate_limit=1e10",   # base64 spectrograms
        f"--ServerApp.port={port}", "--ServerApp.port_retries=0",
    ]
    idle = _idle_minutes(cfg.get("shutdown_on_idle_minutes"))
    if idle > 0:
        args.append(f"--ServerApp.shutdown_no_activity_timeout={idle * 60}")
    proc = subprocess.Popen(args, env=env)
    info = {"port": port, "token": token, "pid": proc.pid}
    SERVERFILE.write_text(json.dumps(info))
    return proc, info


def _stop_proc(proc: Optional[subprocess.Popen]) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(10)
    except Exception:
        proc.kill()


def _pick_folder() -> str:
    """Native folder picker per platform → POSIX path (or '' on cancel)."""
    if sys.platform == "darwin":
        script = ('POSIX path of (choose folder with prompt '
                  '"Choose the folder Jupyter Bioacoustic should open in:")')
        out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
        return out.stdout.strip().rstrip("/") if out.returncode == 0 else ""
    if sys.platform.startswith("win"):
        ps = ("Add-Type -AssemblyName System.Windows.Forms;"
              "$f=New-Object System.Windows.Forms.FolderBrowserDialog;"
              "if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}")
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                             capture_output=True, text=True)
        return out.stdout.strip()
    out = subprocess.run(["zenity", "--file-selection", "--directory"],
                         capture_output=True, text=True)
    return out.stdout.strip()


def _pixi_bin() -> Optional[Path]:
    """The bundled pixi binary in the app-support dir, if present."""
    p = APP_SUPPORT / ("pixi.exe" if sys.platform.startswith("win") else "pixi")
    return p if p.exists() else None


def _update_available(pixi: Path, manifest: Path) -> Optional[bool]:
    """True/False if an update is pending within the version constraint; None on error.

    Mirrors the bootstrap probe: `pixi update --dry-run` names the package iff it would
    change it.
    """
    try:
        out = subprocess.run([str(pixi), "update", "jupyter-bioacoustic",
                              "--manifest-path", str(manifest), "--dry-run"],
                             capture_output=True, text=True, timeout=180)
    except Exception:
        return None
    if out.returncode != 0:
        return None
    return "jupyter-bioacoustic" in (out.stdout + out.stderr).lower()


def _apply_update(pixi: Path, manifest: Path) -> bool:
    """Run `pixi update jupyter-bioacoustic` within its constraint; True on success."""
    try:
        out = subprocess.run([str(pixi), "update", "jupyter-bioacoustic",
                              "--manifest-path", str(manifest)],
                             capture_output=True, text=True, timeout=1800)
        return out.returncode == 0
    except Exception:
        return False


def _notify(msg: str) -> None:
    """Soft, non-blocking progress hint (a banner; may be suppressed by Focus/DND)."""
    title = "Jupyter Bioacoustic"
    try:
        if sys.platform == "darwin":
            subprocess.run(["osascript", "-e",
                            f'display notification "{msg}" with title "{title}"'],
                           capture_output=True)
        elif sys.platform.startswith("win"):
            # No silent toast without extra deps; just fall through to the alert path.
            pass
        else:
            subprocess.run(["notify-send", title, msg], capture_output=True)
    except Exception:
        pass


def _alert(msg: str) -> None:
    """Blocking, always-visible message with an OK button — used for outcomes the user
    must see (notifications can be silently suppressed)."""
    title = "Jupyter Bioacoustic"
    try:
        if sys.platform == "darwin":
            asmsg = msg.replace('"', '\\"')
            subprocess.run(["osascript", "-e",
                            f'display dialog "{asmsg}" with title "{title}" '
                            'buttons {"OK"} default button "OK"'], capture_output=True)
        elif sys.platform.startswith("win"):
            ps = ("Add-Type -AssemblyName System.Windows.Forms;"
                  f"[System.Windows.Forms.MessageBox]::Show('{msg}','{title}')")
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True)
        else:
            if subprocess.run(["zenity", "--info", "--title", title, "--text", msg],
                              capture_output=True).returncode != 0:
                subprocess.run(["notify-send", title, msg], capture_output=True)
    except Exception:
        pass


def _confirm_update() -> bool:
    """Yes/No update prompt; True only on an explicit confirm."""
    title = "Jupyter Bioacoustic"
    msg = "An update is available. Update now? The app will reopen."
    try:
        if sys.platform == "darwin":
            script = (f'button returned of (display dialog "{msg}" with title "{title}" '
                      'buttons {"Later", "Update"} default button "Update")')
            out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
            return out.returncode == 0 and "Update" in out.stdout
        if sys.platform.startswith("win"):
            ps = ("Add-Type -AssemblyName System.Windows.Forms;"
                  f"[System.Windows.Forms.MessageBox]::Show('{msg}','{title}','YesNo','Question')")
            out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                                 capture_output=True, text=True)
            return out.stdout.strip() == "Yes"
        out = subprocess.run(["zenity", "--question", "--title", title, "--text", msg],
                             capture_output=True)
        return out.returncode == 0
    except Exception:
        return False


def _confirm_uninstall() -> bool:
    """Native, scary, default-to-Cancel confirmation. True only on an explicit confirm."""
    title = "Uninstall Jupyter Bioacoustic"
    msg = (
        "ARE YOU REALLY SURE YOU WANT TO DO THIS?\n\n"
        "This permanently removes the Jupyter Bioacoustic application and the "
        "environment it downloaded.\n\n"
        "Your notebooks, data, annotations, and any files in your own folders are NOT "
        "affected - only the app itself is removed. This cannot be undone."
    )
    try:
        if sys.platform == "darwin":
            asmsg = msg.replace('"', '\\"').replace("\n", "\\n")
            script = (f'display dialog "{asmsg}" with title "{title}" '
                      'buttons {"Cancel", "Delete Anyway"} default button "Cancel" '
                      'with icon caution')
            out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
            return out.returncode == 0 and "Delete Anyway" in out.stdout
        if sys.platform.startswith("win"):
            winmsg = msg.replace("\n", "`n")
            ps = ("Add-Type -AssemblyName System.Windows.Forms;"
                  f'[System.Windows.Forms.MessageBox]::Show("{winmsg}","{title}",'
                  "'YesNo','Warning')")
            out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                                 capture_output=True, text=True)
            return out.stdout.strip() == "Yes"
        out = subprocess.run(["zenity", "--question", "--title", title, "--text", msg],
                             capture_output=True)
        return out.returncode == 0
    except Exception:
        return False


def _app_bundle() -> Optional[Path]:
    """The enclosing macOS .app bundle this launcher runs from, if any."""
    if sys.platform != "darwin":
        return None
    for parent in Path(__file__).resolve().parents:
        if parent.suffix == ".app":
            return parent
    return None


def _spawn_cleanup() -> None:
    """Detached: wait for THIS process to exit, then delete the app + env (never user data)."""
    pid = os.getpid()
    targets = [APP_SUPPORT]                       # env, bundled pixi, config, logs, jupyter state
    bundle = _app_bundle()
    if bundle is not None:
        targets.append(bundle)                    # macOS .app
        targets.append(bundle.parent / "Set JupyterBioacoustic Folder.command")  # dev folder-picker
    if sys.platform.startswith("win"):
        shortcut = (Path(os.environ.get("APPDATA", "")) /
                    "Microsoft/Windows/Start Menu/Programs/Jupyter Bioacoustic.lnk")
        targets.append(shortcut)
        items = ",".join(f"'{t}'" for t in targets)
        ps = (f"Wait-Process -Id {pid} -ErrorAction SilentlyContinue;"
              "Start-Sleep -Milliseconds 500;"
              f"foreach($p in @({items})){{Remove-Item -LiteralPath $p -Recurse -Force "
              "-ErrorAction SilentlyContinue}")
        flags = (getattr(subprocess, "DETACHED_PROCESS", 0)
                 | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        subprocess.Popen(["powershell", "-NoProfile", "-Command", ps],
                         creationflags=flags, close_fds=True)
    else:
        rm = " ".join(shlex.quote(str(t)) for t in targets)
        script = (f"while kill -0 {pid} 2>/dev/null; do sleep 0.3; done; rm -rf {rm}")
        subprocess.Popen(["/bin/sh", "-c", script], start_new_session=True, close_fds=True)


def _is_dark_menubar() -> bool:
    """Best-effort: is the menu bar / taskbar dark (→ render the icon white)?"""
    try:
        if sys.platform == "darwin":
            out = subprocess.run(["defaults", "read", "-g", "AppleInterfaceStyle"],
                                 capture_output=True, text=True)
            return "Dark" in out.stdout
        if sys.platform.startswith("win"):
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
            return winreg.QueryValueEx(key, "SystemUsesLightTheme")[0] == 0
    except Exception:
        pass
    return False


def _make_icon():
    """Tray image: the bundled black PNG (JBA_ICON) or a drawn fallback, inverted to
    white on a dark menu bar / taskbar so the black mark stays visible."""
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
