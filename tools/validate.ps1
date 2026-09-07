param(
    [switch]$SkipWebExtLint,
    [switch]$ChangedOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$validationTestCounts = [ordered]@{}
$selectedSuites = $null

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

function Invoke-TestChecked {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [string]$ReceiptName,
        [Parameter(Mandatory)] [scriptblock]$Command
    )

    Write-Host "== $Label ==" -ForegroundColor Cyan
    $captured = @(& $Command 2>&1)
    $exitCode = $LASTEXITCODE
    foreach ($line in $captured) { Write-Host $line }
    if ($exitCode -ne 0) {
        throw "$Label failed with exit code $exitCode"
    }
    $text = ($captured | ForEach-Object { $_.ToString() }) -join "`n"
    $nodeMatches = [regex]::Matches($text, '(?m)^.*\btests\s+(\d+)\s*$')
    $pytestMatches = [regex]::Matches($text, '(?m)(\d+) passed(?:,[^\r\n]*)? in [0-9.]+s(?: \([0-9]+:[0-9]{2}:[0-9]{2}\))?\s*$')
    if ($nodeMatches.Count -gt 0) {
        $validationTestCounts[$ReceiptName] = [int]$nodeMatches[$nodeMatches.Count - 1].Groups[1].Value
    } elseif ($pytestMatches.Count -gt 0) {
        $validationTestCounts[$ReceiptName] = [int]$pytestMatches[$pytestMatches.Count - 1].Groups[1].Value
    } else {
        throw "$Label completed without a recognizable bounded test count"
    }
}

Push-Location $repoRoot
try {
    if ($ChangedOnly) {
        $selectedSuites = @(python tools/affected_suites.py --repo $repoRoot --git | ConvertFrom-Json)
        if ($LASTEXITCODE -ne 0) { throw 'Affected-suite selection failed' }
        Write-Host "Changed-only suites: $($selectedSuites -join ', ')" -ForegroundColor Yellow
    }
    function Test-SuiteSelected([string]$Name) { return (-not $ChangedOnly) -or ($selectedSuites -contains $Name) }

    if (Test-SuiteSelected 'Portal') { Invoke-TestChecked 'Portal tests' 'Portal' { node --test 'Portal/tests/*.cjs' } }
    if (Test-SuiteSelected 'Nexus') { Invoke-TestChecked 'Nexus tests' 'Nexus' { node --test 'Nexus/tests/*.cjs' } }
    $widgetTests = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Widgets') -Filter 'test_*.cjs' -File -Recurse)
    if ((Test-SuiteSelected 'Widgets') -and $widgetTests.Count -gt 0) {
        Invoke-TestChecked 'Widget tests' 'Widgets' { node --test $widgetTests.FullName }
    }
    if (Test-SuiteSelected 'Relay') { Invoke-TestChecked 'Relay tests' 'Relay' { node --test 'Relay/tests/*.cjs' } }
    if (Test-SuiteSelected 'Host') { Invoke-TestChecked 'Host tests' 'Host' { python -m pytest -q Host/tests } }
    if (Test-SuiteSelected 'Migration') { Invoke-TestChecked 'Migration tests' 'Migration' { python -m pytest -q tests/migration } }
    if (Test-SuiteSelected 'Packaging') { Invoke-TestChecked 'Packaging tests' 'Packaging' { python -m pytest -q tests/packaging } }
    if (Test-SuiteSelected 'Tooling') { Invoke-TestChecked 'Tooling tests' 'Tooling' { python -m pytest -q tests/tooling } }

    if (Test-SuiteSelected 'Arcade') {
        Push-Location (Join-Path $repoRoot 'Arcade')
        try {
            Invoke-TestChecked 'Arcade tests' 'Arcade' { python -m pytest -q }
        } finally {
            Pop-Location
        }
    }

    $javascript = @(
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Portal/source') -Filter '*.js' -File
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Widgets') -Filter '*.js' -File -Recurse
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Relay') -Filter '*.js' -File -Recurse
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Arcade/web') -Filter '*.js' -File
        Get-ChildItem -LiteralPath (Join-Path $repoRoot 'Nexus') -Filter '*.js' -File -Recurse
    )
    foreach ($file in $javascript) {
        Invoke-Checked "JavaScript syntax: $($file.FullName.Substring($repoRoot.Length + 1))" { node --check $file.FullName }
    }

    Get-Content -LiteralPath (Join-Path $repoRoot 'Relay/manifest.json') -Raw | ConvertFrom-Json | Out-Null
    Write-Host '== Relay manifest JSON: valid ==' -ForegroundColor Green
    Invoke-Checked 'Infrastructure contracts and registry' { python tools/validate_infrastructure.py --repo $repoRoot }
    Invoke-Checked 'Independent component versions' { python tools/validate_versions.py --repo $repoRoot }

    if (-not $SkipWebExtLint -and (Test-SuiteSelected 'Relay')) {
        Invoke-Checked 'Relay web-ext lint' { npx --yes web-ext lint --source-dir (Join-Path $repoRoot 'Relay') }
    }

    if (-not $ChangedOnly) {
        $receiptArguments = @('tools/write_validation_receipt.py', '--repo', $repoRoot)
        foreach ($name in @('Portal', 'Widgets', 'Arcade', 'Relay', 'Host', 'Nexus', 'Migration', 'Packaging', 'Tooling')) {
            $receiptArguments += @('--test', "$name=$($validationTestCounts[$name])")
        }
        foreach ($name in @('syntax', 'manifest', 'versions', 'packaging', 'infrastructure')) {
            $receiptArguments += @('--check', "$name=passed")
        }
        $lintState = 'passed'
        if ($SkipWebExtLint) { $lintState = 'skipped' }
        $receiptArguments += @('--check', "lint=$lintState")
        Invoke-Checked 'Nexus validation receipt' { python @receiptArguments }
    }

    Write-Host 'Cyrune validation completed successfully.' -ForegroundColor Green
} finally {
    Pop-Location
}
