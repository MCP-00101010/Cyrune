param(
    [switch]$SkipLint,
    [string]$ArtifactsRoot = ''
)

$ErrorActionPreference = 'Stop'
$relayRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $relayRoot
$packageTool = Join-Path $repoRoot 'tools\relay_package.py'

if (-not $ArtifactsRoot) {
    $ArtifactsRoot = Join-Path $repoRoot 'artifacts'
}

if (-not $SkipLint) {
    & npx --yes web-ext lint --source-dir $relayRoot
    if ($LASTEXITCODE -ne 0) {
        throw "web-ext lint failed with exit code $LASTEXITCODE"
    }
}

& python $packageTool build --source $relayRoot --artifacts $ArtifactsRoot
if ($LASTEXITCODE -ne 0) {
    throw "Relay packaging failed with exit code $LASTEXITCODE"
}
