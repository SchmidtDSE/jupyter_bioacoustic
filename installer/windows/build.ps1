# Build → sign the Windows installer (.exe).
# Prereqs: Inno Setup (iscc on PATH), signtool, a code-signing cert (OV/EV or
# Azure Trusted Signing), the pinned pixi.exe in windows\payload\, and the icon
# built (icon\build\AppIcon.ico via make-icons.sh).
#
#   pwsh build.ps1 -Version 0.1.0 -CertThumbprint <THUMB> -TimestampUrl http://timestamp.digicert.com
param(
  [string]$Version = "0.1.0",
  [string]$CertThumbprint,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Optional: Authenticode-sign the bundled pixi.exe and launcher before packaging.
function Sign($path) {
  if ($CertThumbprint) {
    signtool sign /sha1 $CertThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $path
  } else {
    Write-Warning "no -CertThumbprint — skipping signing of $path (unsigned build)"
  }
}

Sign ".\payload\pixi.exe"

Write-Host "› building installer with Inno Setup"
iscc "/DMyVersion=$Version" installer.iss

$exe = "..\dist\JupyterBioacoustic-$Version-win64.exe"
Sign $exe
Write-Host "✓ $exe"
