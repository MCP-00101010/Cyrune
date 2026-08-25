param(
    [switch]$SkipWebExtLint
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [scriptblock]$Command
    )

    Write-Host "== $Label ==" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    Invoke-Checked 'Portal tests' { node --test 'Portal/tests/*.cjs' }
    $widgetTests = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Widgets') -Filter 'test_*.cjs' -File -Recurse)
    if ($widgetTests.Count -gt 0) {
        Invoke-Checked 'Widget tests' { node --test $widgetTests.FullName }
    }
    Invoke-Checked 'Relay tests' { node --test 'Relay/tests/*.cjs' }
    Invoke-Checked 'Host tests' { python -m pytest -q Host/tests }
    Invoke-Checked 'Migration tests' { python -m pytest -q tests/migration }
    Invoke-Checked 'Packaging tests' { python -m pytest -q tests/packaging }

    Push-Location (Join-Path $repoRoot 'Arcade')
    try {
        Invoke-Checked 'Arcade tests' { python -m pytest -q }
    } finally {
        Pop-Location
    }

    $javascript = @(
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Portal/source') -Filter '*.js' -File
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Widgets') -Filter '*.js' -File -Recurse
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Relay') -Filter '*.js' -File -Recurse
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Arcade/web') -Filter '*.js' -File
    )
    foreach ($file in $javascript) {
        Invoke-Checked "JavaScript syntax: $($file.FullName.Substring($repoRoot.Length + 1))" { node --check $file.FullName }
    }

    Get-Content -LiteralPath (Join-Path $repoRoot 'Relay/manifest.json') -Raw | ConvertFrom-Json | Out-Null
    Write-Host '== Relay manifest JSON: valid ==' -ForegroundColor Green
    Invoke-Checked 'Independent component versions' { python tools/validate_versions.py --repo $repoRoot }

    if (-not $SkipWebExtLint) {
        Invoke-Checked 'Relay web-ext lint' { npx --yes web-ext lint --source-dir (Join-Path $repoRoot 'Relay') }
    }

    Write-Host 'Cyrune validation completed successfully.' -ForegroundColor Green
} finally {
    Pop-Location
}
