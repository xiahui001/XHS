param(
  [string]$ContinueFlag = ".auth/eventwang.continue"
)

$ErrorActionPreference = "Stop"

$dir = Split-Path -Parent $ContinueFlag
if ($dir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Set-Content -Path $ContinueFlag -Value "continue" -Encoding UTF8
Write-Output "Continue flag written: $ContinueFlag"
