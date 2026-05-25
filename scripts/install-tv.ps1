param(
  [Parameter(Mandatory=$true)][string]$WgtPath,
  [Parameter(Mandatory=$true)][string]$Target,
  [string]$TvIp,
  [string]$TizenBin = "c:\tizen-studio\tools\ide\bin\tizen.bat",
  [string]$SdbBin = "c:\tizen-studio\tools\sdb.exe"
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path logs)) { New-Item -ItemType Directory -Path logs | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = "logs/install-$stamp.txt"

function Run-Cmd([string]$cmd) {
  "`n>>> $cmd" | Tee-Object -FilePath $logFile -Append
  cmd /c $cmd 2>&1 | Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $cmd" }
}

try {
  if ($TvIp) { Run-Cmd "\"$SdbBin\" connect $TvIp" }
  Run-Cmd "\"$SdbBin\" devices"
  Run-Cmd "\"$TizenBin\" install-permit -t $Target"
  Run-Cmd "\"$TizenBin\" install -n $WgtPath -t $Target"
  Write-Host "Install complete. Log: $logFile"
}
catch {
  Write-Host "Install failed. Log: $logFile"
  Write-Host "Next steps:"
  Write-Host "  \"$SdbBin\" dlog | findstr /i Tidalizen"
  Write-Host "  \"$TizenBin\" uninstall -p Tidalizen01 -t $Target"
  Write-Host "  \"$TizenBin\" install -n $WgtPath -t $Target"
  exit 1
}
