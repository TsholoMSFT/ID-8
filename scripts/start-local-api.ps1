param(
  [int]$Port = 7071,
  [int]$StartupTimeoutSeconds = 180,
  [switch]$SkipBuild,
  [switch]$SkipAzurite
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'api'

function Resolve-Executable {
  param([string]$EnvironmentName, [string[]]$Candidates, [string]$CommandName)

  $configured = [Environment]::GetEnvironmentVariable($EnvironmentName)
  if (-not $configured -and $EnvironmentName.StartsWith('ID8_')) {
    $configured = [Environment]::GetEnvironmentVariable($EnvironmentName.Replace('ID8_', 'KARABO_'))
  }
  if ($configured -and (Test-Path $configured)) { return $configured }

  foreach ($candidate in $Candidates) {
    $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
    if (Test-Path $expanded) { return $expanded }
    $legacyCandidate = $expanded -replace '\\id8-', '\karabo-'
    if ($legacyCandidate -ne $expanded -and (Test-Path $legacyCandidate)) { return $legacyCandidate }
  }

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "Unable to resolve $CommandName. Set $EnvironmentName to its full executable path."
}

$nodeExe = Resolve-Executable 'ID8_NODE_EXE' @(
  '%LOCALAPPDATA%\id8-node-x64\node.exe',
  '%LOCALAPPDATA%\id8-x64-runtime\node-v22.23.1-win-x64\node.exe',
  '%LOCALAPPDATA%\node22\node-v22.23.1-win-arm64\node.exe',
  '%ProgramFiles%\nodejs\node.exe'
) 'node'
$funcExe = Resolve-Executable 'ID8_FUNC_EXE' @(
  '%LOCALAPPDATA%\id8-func-x64\bin\in-proc8\func.exe',
  '%LOCALAPPDATA%\id8-func-x64\node_modules\azure-functions-core-tools\bin\func.exe',
  '%LOCALAPPDATA%\id8-x64-runtime\functions-core-tools\node_modules\azure-functions-core-tools\bin\func.exe',
  '%APPDATA%\npm\node_modules\azure-functions-core-tools\bin\func.exe',
  '%ProgramFiles%\Microsoft\Azure Functions Core Tools\func.exe'
) 'func'

$nodeVersion = & $nodeExe --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(20|22)\.') {
  throw "ID-8 Functions requires Node 20 or 22. Resolved: $nodeExe ($nodeVersion)"
}

$env:PATH = "$(Split-Path -Parent $nodeExe);$env:PATH"
$env:FUNCTIONS_WORKER_RUNTIME = 'node'
$env:languageWorkers__node__defaultExecutablePath = $nodeExe

if (-not $SkipBuild) {
  Push-Location $apiRoot
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'API TypeScript build failed.' }
  } finally {
    Pop-Location
  }
}

if (-not $SkipAzurite) {
  $storageListening = Get-NetTCPConnection -LocalPort 10000 -State Listen -ErrorAction SilentlyContinue
  if (-not $storageListening) {
    $azurite = Get-Command azurite -ErrorAction SilentlyContinue
    if ($azurite) {
      $azuriteLocation = Join-Path $env:TEMP 'id8-azurite'
      New-Item -ItemType Directory -Force -Path $azuriteLocation | Out-Null
      if ($azurite.CommandType -eq 'ExternalScript') {
        $azuriteCmd = [System.IO.Path]::ChangeExtension($azurite.Source, '.cmd')
        if (Test-Path $azuriteCmd) {
          $arguments = "/d /c `"`"$azuriteCmd`" --silent --location `"$azuriteLocation`"`""
          Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -NoNewWindow | Out-Null
        } else {
          Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', "`"$($azurite.Source)`"",
            '--silent',
            '--location', "`"$azuriteLocation`""
          ) -NoNewWindow | Out-Null
        }
      } else {
        Start-Process -FilePath $azurite.Source -ArgumentList @('--silent', '--location', $azuriteLocation) -NoNewWindow | Out-Null
      }
    } else {
      Write-Warning 'Azurite was not found. Start it separately if AzureWebJobsStorage uses development storage.'
    }
  }
}

Write-Host "Starting Functions with Node $nodeVersion"
Write-Host "Node: $nodeExe"
Write-Host "Core Tools: $funcExe"

$hostProcess = Start-Process -FilePath $funcExe -ArgumentList @('start', '--port', $Port, '--verbose') -WorkingDirectory $apiRoot -NoNewWindow -PassThru
$healthUrl = "http://127.0.0.1:$Port/api/health"
$ready = $false
$startupTimer = [System.Diagnostics.Stopwatch]::StartNew()

while ($startupTimer.Elapsed.TotalSeconds -lt $StartupTimeoutSeconds) {
  if ($hostProcess.HasExited) { break }
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($response.ok) {
      $ready = $true
      break
    }
  } catch {
    Wait-Process -Id $hostProcess.Id -Timeout 1 -ErrorAction SilentlyContinue
  }
}

if (-not $ready) {
  if (-not $hostProcess.HasExited) { Stop-Process -Id $hostProcess.Id -Force }
  throw "Functions failed to become healthy at $healthUrl within $StartupTimeoutSeconds seconds. Review the first Core Tools startup error above."
}

Write-Host "ID-8 API ready: $healthUrl"
Wait-Process -Id $hostProcess.Id
exit $hostProcess.ExitCode