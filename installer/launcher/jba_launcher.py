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
import json
import os
import secrets
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
DEFAULT_CONFIG: dict = {"root_dir": "~", "single_instance": True, "shutdown_on_idle_minutes": 30}


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

    def run(self) -> None:
        import pystray
        self._start()
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

    def _menu(self, pystray):
        return pystray.Menu(
            pystray.MenuItem(lambda _: self._status(), None, enabled=False),
            pystray.MenuItem("Open in Browser", self._open, default=True),
            pystray.MenuItem("Change Start Folder…", self._change_folder),
            pystray.Menu.SEPARATOR,
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

    def _open(self, *_args) -> None:
        info = _server_info()
        if _alive(info):
            webbrowser.open(_url(info))
        else:                      # server died (idle/crash) — restart on demand
            self._start()

    def _change_folder(self, *_args) -> None:
        folder = _pick_folder()
        if not folder:
            return
        cfg = _load_config()
        cfg["root_dir"] = folder
        CONFIG.write_text(json.dumps(cfg, indent=2))
        self._cfg = cfg
        self._restart()            # apply the new root immediately

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
    try:
        idle = int(cfg.get("shutdown_on_idle_minutes") or 0)
    except (TypeError, ValueError):
        idle = 0
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
