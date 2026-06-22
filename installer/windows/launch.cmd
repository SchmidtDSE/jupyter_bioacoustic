@echo off
setlocal enableextensions
rem JupyterBioacoustic launcher (Windows). Mirrors shared/bootstrap.sh: stage the
rem bundled payload, ensure the env, optional update-check, then hand off to the
rem cross-platform tray app (jba_launcher.py).
rem
rem Works for BOTH distribution shapes:
rem   * .exe installer  - files already live in %LOCALAPPDATA%\JupyterBioacoustic
rem                       (so the staging copies below are guarded no-ops), env install
rem                       is done by the installer's [Run] step; this is the retry path.
rem   * .zip (unzip+run) - launch.cmd sits next to the bundled payload in the extracted
rem                       folder (%~dp0). On first run it stages EVERYTHING it needs into
rem                       %LOCALAPPDATA% and drops a Start-menu shortcut, so the unzip
rem                       folder is then DISPOSABLE and the app relaunches from Start
rem                       (the Windows analog of dragging the .app into /Applications).
rem NOTE: not yet validated on Windows - macOS is the proven path.

set "APP_SUPPORT=%LOCALAPPDATA%\JupyterBioacoustic"
set "ENV_DIR=%APP_SUPPORT%\env"
set "PIXI=%APP_SUPPORT%\pixi.exe"
set "LOG=%APP_SUPPORT%\launch.log"
set "SRC=%~dp0"

if not exist "%APP_SUPPORT%" mkdir "%APP_SUPPORT%"
if not exist "%ENV_DIR%" mkdir "%ENV_DIR%"

rem --- stage the app's own files into %LOCALAPPDATA% so the unzip folder is disposable ---
rem      (skip when already running from %LOCALAPPDATA% to avoid copy-onto-itself).
if /i not "%SRC%"=="%APP_SUPPORT%\" (
  if exist "%SRC%pixi.exe"        copy /y "%SRC%pixi.exe"        "%PIXI%"                     >nul
  if exist "%SRC%jba_launcher.py" copy /y "%SRC%jba_launcher.py" "%APP_SUPPORT%\jba_launcher.py" >nul
  if exist "%SRC%tray.png"        copy /y "%SRC%tray.png"        "%APP_SUPPORT%\tray.png"     >nul
  if exist "%SRC%AppIcon.ico"     copy /y "%SRC%AppIcon.ico"     "%APP_SUPPORT%\AppIcon.ico"  >nul
  if exist "%SRC%launch.cmd"      copy /y "%SRC%launch.cmd"      "%APP_SUPPORT%\launch.cmd"   >nul
)

rem --- stage the manifest+lock (zip: flat next to launch.cmd; installer: env\) ---
if not exist "%ENV_DIR%\pixi.toml" (
  if exist "%SRC%pixi.toml" (
    copy /y "%SRC%pixi.toml" "%ENV_DIR%\pixi.toml" >nul
  ) else if exist "%SRC%env\pixi.toml" (
    copy /y "%SRC%env\pixi.toml" "%ENV_DIR%\pixi.toml" >nul
  )
)
if not exist "%ENV_DIR%\pixi.lock" if exist "%SRC%pixi.lock" copy /y "%SRC%pixi.lock" "%ENV_DIR%\pixi.lock" >nul

if not exist "%PIXI%" (
  echo Could not find pixi.exe ^(expected next to this file or already installed^). >&2
  echo See "%LOG%".
  pause
  exit /b 1
)

rem --- drop a Start-menu shortcut once, so the user can relaunch after deleting the unzip folder ---
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Jupyter Bioacoustic.lnk"
if not exist "%SHORTCUT%" (
  powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:SHORTCUT); $s.TargetPath=$env:APP_SUPPORT+'\launch.cmd'; $s.WorkingDirectory=$env:APP_SUPPORT; if(Test-Path ($env:APP_SUPPORT+'\AppIcon.ico')){$s.IconLocation=$env:APP_SUPPORT+'\AppIcon.ico'}; $s.Save()" 2>>"%LOG%"
)

rem --- first-run env install (installer normally did this already; safety-net/retry) ---
if not exist "%ENV_DIR%\.pixi" (
  echo Setting up JupyterBioacoustic, this can take a few minutes...
  "%PIXI%" install --manifest-path "%ENV_DIR%\pixi.toml" >>"%LOG%" 2>&1
  if errorlevel 1 (
    echo Setup failed. See "%LOG%".
    pause
    exit /b 1
  )
)

rem --- throttled check-and-prompt update (once/day) via a stamp file ---
set "STAMP=%APP_SUPPORT%\.last-update-check"
for /f %%t in ('powershell -NoProfile -Command "[int][double]::Parse((Get-Date -UFormat %%s))"') do set NOW=%%t
set LAST=0
if exist "%STAMP%" set /p LAST=<"%STAMP%"
set /a AGE=%NOW%-%LAST%
if %AGE% GEQ 86400 (
  >"%STAMP%" echo %NOW%
  "%PIXI%" update jupyter-bioacoustic --manifest-path "%ENV_DIR%\pixi.toml" --dry-run 2>nul | findstr /i "jupyter-bioacoustic" >nul
  if not errorlevel 1 (
    powershell -NoProfile -Command "if((New-Object -ComObject Wscript.Shell).Popup('An update is available. Update now?',0,'Jupyter Bioacoustic',4) -eq 6){exit 0}else{exit 1}"
    if not errorlevel 1 "%PIXI%" update jupyter-bioacoustic --manifest-path "%ENV_DIR%\pixi.toml" >>"%LOG%" 2>&1
  )
)

rem --- hand off to the cross-platform tray launcher, run from %LOCALAPPDATA% (NOT the
rem      unzip folder) so the folder can be deleted. pythonw.exe = no console window;
rem      `start` detaches so this cmd window closes and only the system-tray icon remains. ---
set "ENVROOT=%ENV_DIR%\.pixi\envs\default"
set "JBA_APP_SUPPORT=%APP_SUPPORT%"
set "JBA_ENV_BIN=%ENVROOT%"
set "JBA_ICON=%APP_SUPPORT%\tray.png"
start "" "%ENVROOT%\pythonw.exe" "%APP_SUPPORT%\jba_launcher.py"
