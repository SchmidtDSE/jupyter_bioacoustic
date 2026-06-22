; Inno Setup script for the JupyterBioacoustic Windows installer.
; Build: iscc /DMyVersion=0.1.0 installer.iss   (then sign the produced .exe, see build.ps1)
; Per-user install (no admin), Start Menu shortcut → launch.cmd with the brand icon.

#ifndef MyVersion
  #define MyVersion "0.1.0"
#endif

[Setup]
AppId={{8E9C9A8A-1B2C-4D5E-9F01-JBA0000ACOUS}
AppName=Jupyter Bioacoustic
AppVersion={#MyVersion}
AppPublisher=Schmidt DSE
DefaultDirName={localappdata}\JupyterBioacoustic
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=JupyterBioacoustic-{#MyVersion}-win64
SetupIconFile=..\icon\build\AppIcon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
; Bundled payload: pinned pixi + manifest/lock + launcher + icon.
Source: "payload\pixi.exe";        DestDir: "{app}";       Flags: ignoreversion
Source: "..\manifest\pixi.toml";   DestDir: "{app}\env";   Flags: ignoreversion
Source: "..\manifest\pixi.lock";   DestDir: "{app}\env";   Flags: ignoreversion skipifsourcedoesntexist
Source: "launch.cmd";              DestDir: "{app}";       Flags: ignoreversion
Source: "..\launcher\jba_launcher.py"; DestDir: "{app}";   Flags: ignoreversion
Source: "..\icon\build\AppIcon.ico"; DestDir: "{app}";     Flags: ignoreversion
Source: "..\icon\build\ico_64.png";  DestDir: "{app}"; DestName: "tray.png"; Flags: ignoreversion skipifsourcedoesntexist
Source: "set-start-folder.cmd";    DestDir: "{app}";       Flags: ignoreversion

[Icons]
; Start Menu shortcut (fallback if conda menuinst doesn't create one).
Name: "{autoprograms}\Jupyter Bioacoustic"; Filename: "{app}\launch.cmd"; \
  IconFilename: "{app}\AppIcon.ico"; WorkingDir: "{app}"
; Interim "settings UI": pick the folder the app opens in.
Name: "{autoprograms}\Jupyter Bioacoustic — Set Start Folder"; Filename: "{app}\set-start-folder.cmd"; \
  IconFilename: "{app}\AppIcon.ico"; WorkingDir: "{app}"

[Run]
; Heavy first install during the wizard's "finishing" step (shows progress).
Filename: "{app}\pixi.exe"; \
  Parameters: "install --manifest-path ""{app}\env\pixi.toml"""; \
  StatusMsg: "Setting up the environment (one-time, may take a few minutes)…"; \
  Flags: runhidden
