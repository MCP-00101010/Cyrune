param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [string]$ArtifactsRoot = ''
)

$ErrorActionPreference = 'Stop'
$relayRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $relayRoot
$packageTool = Join-Path $repoRoot 'tools\relay_package.py'

if (-not $ArtifactsRoot) {
    $ArtifactsRoot = Join-Path $repoRoot 'artifacts'
}

& python $packageTool import-signed $SourcePath --artifacts $ArtifactsRoot
if ($LASTEXITCODE -ne 0) {
    throw "Signed Relay package import failed with exit code $LASTEXITCODE"
}
