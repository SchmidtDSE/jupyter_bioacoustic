@echo off
setlocal enableextensions
rem JupyterBioacoustic launcher (Windows). Mirrors shared/bootstrap.sh: ensure env,
rem optional update-check, launch. Heavy first install is done by the installer's
rem [Run] step; this retries if needed.

set "APP_SUPPORT=%LOCALAPPDATA%\JupyterBioacoustic"
set "ENV_DIR=%APP_SUPPORT%\env"
set "PIXI=%APP_SUPPORT%\pixi.exe"
set "LOG=%APP_SUPPORT%\launch.log"

if not exist "%APP_SUPPORT%" mkdir "%APP_SUPPORT%"

rem First-run safety net (installer normally did this already).
if not exist "%ENV_DIR%\.pixi" (
  echo Setting up JupyterBioacoustic, this can take a minute...
  "%PIXI%" install --manifest-path "%ENV_DIR%\pixi.toml" >>"%LOG%" 2>&1
  if errorlevel 1 (
    echo Setup failed. See "%LOG%".
    pause
    exit /b 1
  )
)

rem Throttled check-and-prompt update (once/day) via a stamp file.
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

rem --- hand off to the cross-platform tray launcher (config/root/server/tray/quit
rem      all live in jba_launcher.py). pythonw.exe = no console window; `start`
rem      detaches so this cmd window closes and only the system-tray icon remains.
rem      NOTE: not yet tested on Windows — macOS is the validated path.
set "ENVROOT=%ENV_DIR%\.pixi\envs\default"
set "JBA_APP_SUPPORT=%APP_SUPPORT%"
set "JBA_ENV_BIN=%ENVROOT%"
set "JBA_ICON=%~dp0tray.png"
start "" "%ENVROOT%\pythonw.exe" "%~dp0jba_launcher.py"
