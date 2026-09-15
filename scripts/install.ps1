# Why: this is the Windows half of the product's one-command installer, served at
# agentstart.ai/install.ps1. install.sh refuses Windows by design, and requiring Node before the
# product can be installed at all is worse than repeating the download-and-verify sequence here.
param(
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

$repository = 'xinyao27/agentstart'
$chromeWebStoreUrl = 'https://chromewebstore.google.com/detail/agentstart/ljgpbhfigjepmdeaggfdagchkgaogglp'
$extensionConnectDeadlineSeconds = 120

$releaseVersion = if ($env:AGENTSTART_VERSION) { $env:AGENTSTART_VERSION } else { 'latest' }
$extensionChannel = if ($env:AGENTSTART_EXTENSION_CHANNEL) { $env:AGENTSTART_EXTENSION_CHANNEL } else { 'web-store' }
$skipServiceInstall = if ($env:AGENTSTART_SKIP_SERVICE_INSTALL) { $env:AGENTSTART_SKIP_SERVICE_INSTALL } else { '0' }
$noMobile = if ($env:AGENTSTART_NO_MOBILE) { $env:AGENTSTART_NO_MOBILE } else { '0' }

function Write-Usage {
  @'
Install AgentStart, its Chrome extension, and the AgentStart Mobile link.

Usage: install.ps1 [-Help]

Environment:
  AGENTSTART_INSTALL_DIR           where agentstart.exe is installed
  AGENTSTART_VERSION               release tag to install, or "latest"
  AGENTSTART_EXTENSION_CHANNEL     web-store (default), unpacked, or skip
  AGENTSTART_SKIP_SERVICE_INSTALL  1 to leave the logon task alone
  AGENTSTART_NO_MOBILE             1 to omit the iOS TestFlight link and code
'@ | Write-Host
}

# Why: PowerShell binds -Help, --help, and -h to the switch above, so anything left in $args is an
# argument this installer does not implement and must not silently ignore.
if ($Help) {
  Write-Usage
  return
}
if ($args.Count -gt 0) {
  throw "Unsupported argument: $($args[0]). Run with -Help."
}

if ($extensionChannel -notin @('web-store', 'unpacked', 'skip')) {
  throw 'AGENTSTART_EXTENSION_CHANNEL must be web-store, unpacked, or skip.'
}
if ($skipServiceInstall -notin @('0', '1')) {
  throw 'AGENTSTART_SKIP_SERVICE_INSTALL must be 0 or 1.'
}
if ($noMobile -notin @('0', '1')) {
  throw 'AGENTSTART_NO_MOBILE must be 0 or 1.'
}

if ([System.Environment]::OSVersion.Platform -ne 'Win32NT') {
  throw "AgentStart's PowerShell installer supports Windows only. Use the shell installer elsewhere."
}
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
  throw "AgentStart does not publish a Windows build for $env:PROCESSOR_ARCHITECTURE."
}
# Why: PowerShell 5.1 still negotiates TLS 1.0 with GitHub, which the release host refuses.
if ($PSVersionTable.PSVersion.Major -lt 6) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

$asset = 'agentstart-rust-windows-x64.exe'
$installDirectory = if ($env:AGENTSTART_INSTALL_DIR) {
  $env:AGENTSTART_INSTALL_DIR
} else {
  Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $HOME }) 'AgentStart\bin'
}
$installDirectory = [System.IO.Path]::GetFullPath($installDirectory)
$executable = Join-Path $installDirectory 'agentstart.exe'

if ($releaseVersion -eq 'latest') {
  $releaseBase = "https://github.com/$repository/releases/latest/download"
} else {
  $tag = if ($releaseVersion.StartsWith('v')) { $releaseVersion } else { "v$releaseVersion" }
  $releaseBase = "https://github.com/$repository/releases/download/$tag"
}

function Save-RemoteFile {
  param([string]$Uri, [string]$Destination)
  $client = [System.Net.WebClient]::new()
  try {
    $client.DownloadFile($Uri, $Destination)
  } finally {
    $client.Dispose()
  }
}

# Why: Windows refuses to replace an executable its logon task is still running, and that lock
# clears shortly after the service is asked to stop rather than instantly.
function Move-WithRetry {
  param([string]$Source, [string]$Destination)
  $delay = 200
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 5) {
        throw
      }
      Start-Sleep -Milliseconds $delay
      $delay *= 2
    }
  }
}

# Why: the checklist is the only thing tying the downloaded bytes to the release, so an entry that
# is absent or not a canonical digest has to fail rather than fall through to an unverified install.
function Get-ReleaseChecksum {
  param([string]$ChecksumFile, [string]$Name)
  foreach ($line in Get-Content -LiteralPath $ChecksumFile) {
    $fields = $line.Trim() -split '\s+'
    if ($fields.Count -eq 2 -and $fields[1] -eq $Name -and $fields[0] -match '^[0-9a-fA-F]{64}$') {
      return $fields[0].ToLowerInvariant()
    }
  }
  throw "The release checksum list must contain one canonical SHA-256 for $Name."
}

function Wait-ForExtension {
  param([string]$ExecutablePath, [int]$DeadlineSeconds)
  $elapsed = 0
  while ($elapsed -lt $DeadlineSeconds) {
    $status = & $ExecutablePath status --json 2>$null
    if ($LASTEXITCODE -eq 0 -and $status -match '"extensionConnected":true') {
      return $true
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
  }
  return $false
}

$workDirectory = Join-Path ([System.IO.Path]::GetTempPath()) `
  "agentstart-install-$([System.Guid]::NewGuid().ToString('n'))"
New-Item -ItemType Directory -Path $workDirectory | Out-Null
$previousExecutable = Join-Path $workDirectory 'previous-agentstart.exe'
$replacedExecutable = $false

try {
  $downloaded = Join-Path $workDirectory $asset
  $checksums = Join-Path $workDirectory 'agentstart-checksums.txt'
  Write-Host "Downloading AgentStart $releaseVersion..."
  Save-RemoteFile -Uri "$releaseBase/$asset" -Destination $downloaded
  Save-RemoteFile -Uri "$releaseBase/agentstart-checksums.txt" -Destination $checksums

  $expected = Get-ReleaseChecksum -ChecksumFile $checksums -Name $asset
  $actual = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum verification failed for $asset."
  }

  New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $executable) {
    # Why: the logon task keeps the previous build running, and Windows will not let it be replaced
    # while it is.
    & $executable service stop 2>$null | Out-Null
    Move-WithRetry -Source $executable -Destination $previousExecutable
    $replacedExecutable = $true
  }
  Move-WithRetry -Source $downloaded -Destination $executable

  $setupArguments = @('install', '--extension', $extensionChannel)
  if ($skipServiceInstall -eq '1') {
    $setupArguments += '--no-service'
  }
  if ($noMobile -eq '1') {
    $setupArguments += '--no-mobile'
  }
  & $executable @setupArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'AgentStart setup failed.'
  }
} catch {
  if ($replacedExecutable) {
    Copy-Item -LiteralPath $previousExecutable -Destination $executable -Force
  } elseif (Test-Path -LiteralPath $executable) {
    Remove-Item -LiteralPath $executable -Force
  }
  Write-Host 'Restored the previous AgentStart installation.' -ForegroundColor Yellow
  throw
} finally {
  Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Installed AgentStart to $executable"

# Why: the user PATH is the only place a per-user install can be found by a new terminal, and
# rewriting it without reading the stored value first would drop whatever else is already there.
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $installDirectory) {
  $updatedPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
    $installDirectory
  } else {
    "$($userPath.TrimEnd(';'));$installDirectory"
  }
  [System.Environment]::SetEnvironmentVariable('Path', $updatedPath, 'User')
  Write-Host "Added $installDirectory to PATH. Open a new terminal to use it."
}

if ($extensionChannel -eq 'web-store') {
  Write-Host 'Waiting for the Chrome extension to connect...'
  if (Wait-ForExtension -ExecutablePath $executable -DeadlineSeconds $extensionConnectDeadlineSeconds) {
    Write-Host 'The Chrome extension is connected.'
  } else {
    Write-Warning "The Chrome extension has not connected yet. Finish it at $chromeWebStoreUrl, then open the AgentStart side panel."
  }
}
