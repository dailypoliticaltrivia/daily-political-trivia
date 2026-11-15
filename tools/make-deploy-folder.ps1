# Builds a clean copy of exactly what the website publishes, for you to look through:  ..\deploy-site\
# (drafts, backups, guides, scripts and developer tools are left out). Safe to run any time; it only
# writes the deploy-site folder and never changes the site folder.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\make-deploy-folder.ps1
$ErrorActionPreference = 'Stop'
$site = Split-Path -Parent $PSScriptRoot
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host 'Node.js is not installed. It is needed for this step.' -ForegroundColor Red; exit 1 }
$out = Join-Path (Split-Path -Parent $site) 'deploy-site'
& node (Join-Path $PSScriptRoot 'make-deploy-folder.js') $out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ''
Write-Host "Open this folder to look at what will be published: $out"
