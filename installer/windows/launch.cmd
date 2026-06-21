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

rem --- root_dir from config.json (default %USERPROFILE%); JupyterLab restores last folder within it ---
set "CONFIG=%APP_SUPPORT%\config.json"
if not exist "%CONFIG%" (
  >"%CONFIG%" echo {
  >>"%CONFIG%" echo   "root_dir": "~"
  >>"%CONFIG%" echo }
)
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "$c=Get-Content -Raw '%CONFIG%' ^| ConvertFrom-Json; $r=$c.root_dir; if(-not $r -or $r -eq '~'){$env:USERPROFILE}elseif($r -match '^~[/\\]'){Join-Path $env:USERPROFILE $r.Substring(2)}else{$r}"`) do set "ROOT=%%r"
if not exist "%ROOT%" mkdir "%ROOT%" 2>nul

rem Pin root_dir + replicate jba lab's IOPub limit (base64 spectrograms).
"%PIXI%" run --manifest-path "%ENV_DIR%\pixi.toml" python -m jupyter lab --ServerApp.root_dir="%ROOT%" --ServerApp.iopub_data_rate_limit=1e10
