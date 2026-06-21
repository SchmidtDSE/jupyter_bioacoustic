@echo off
rem Native folder picker -> %LOCALAPPDATA%\JupyterBioacoustic\config.json.
rem Interim "settings UI" for non-coders (no JSON editing). A polished in-app
rem settings panel is the planned successor — see installer_status.md.
set "APP_SUPPORT=%LOCALAPPDATA%\JupyterBioacoustic"
if not exist "%APP_SUPPORT%" mkdir "%APP_SUPPORT%"
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Choose the folder Jupyter Bioacoustic should open in'; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}"`) do set "DIR=%%d"
if "%DIR%"=="" exit /b 0
> "%APP_SUPPORT%\config.json" powershell -NoProfile -Command "@{root_dir='%DIR%'} ^| ConvertTo-Json"
