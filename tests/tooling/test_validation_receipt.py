import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest


REPO = Path(__file__).parents[2]
SCRIPT = REPO / "tools" / "write_validation_receipt.py"
SPEC = importlib.util.spec_from_file_location("write_validation_receipt", SCRIPT)
RECEIPT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECEIPT)


def complete_tests():
    return [f"{name}=1" for name in sorted(RECEIPT.ALLOWED_TESTS)]


def complete_checks():
    return [f"{name}=passed" for name in sorted(RECEIPT.ALLOWED_CHECKS)]


def test_receipt_contains_only_bounded_counts_versions_and_outcomes():
    receipt = RECEIPT.build_receipt(REPO, complete_tests(), complete_checks(), timestamp=1700000000000)
    assert receipt["schemaVersion"] == 1
    assert receipt["timestamp"] == 1700000000000
    assert set(receipt["versions"]) == {"Portal", "Widgets", "Arcade", "Relay", "Host", "Nexus"}
    assert set(receipt["tests"]) == RECEIPT.ALLOWED_TESTS
    assert set(receipt["checks"]) == RECEIPT.ALLOWED_CHECKS
    assert all(value == {"passed": 1, "failed": 0, "skipped": 0} for value in receipt["tests"].values())


def test_receipt_rejects_unknown_or_incomplete_fields():
    with pytest.raises(ValueError, match="Unsupported or duplicate test entry"):
        RECEIPT.build_receipt(REPO, complete_tests() + ["PrivatePath=1"], complete_checks())
    with pytest.raises(ValueError, match="incomplete"):
        RECEIPT.build_receipt(REPO, complete_tests()[:-1], complete_checks())
    with pytest.raises(ValueError, match="check state"):
        invalid = complete_checks()[:-1] + [f"{sorted(RECEIPT.ALLOWED_CHECKS)[-1]}=command output"]
        RECEIPT.build_receipt(REPO, complete_tests(), invalid)


def test_receipt_write_is_atomic_and_cannot_target_the_repository():
    receipt = RECEIPT.build_receipt(REPO, complete_tests(), complete_checks(), timestamp=1700000000000)
    with TemporaryDirectory() as directory:
        output = Path(directory) / "Nexus" / "validation.json"
        RECEIPT.atomic_write_receipt(output, receipt, REPO)
        assert json.loads(output.read_text(encoding="utf-8")) == receipt
    with pytest.raises(ValueError, match="outside the repository"):
        RECEIPT.atomic_write_receipt(REPO / "validation.json", receipt, REPO)


def test_coordinated_validator_counts_short_and_long_suites_and_rejects_failure(tmp_path):
    powershell = shutil.which("pwsh")
    if not powershell:
        pytest.skip("PowerShell is required for the coordinated validator")
    source = (REPO / "tools" / "validate.ps1").read_text(encoding="utf-8")
    function = source[source.index("function Invoke-TestChecked"):source.index("Push-Location $repoRoot")]
    script = tmp_path / "test-counts.ps1"
    script.write_text("$ErrorActionPreference = 'Stop'\n$validationTestCounts = @{}\n" + function + r'''
foreach ($summary in @('160 passed in 12.34s', '160 passed, 11 subtests passed in 64.62s (0:01:04)', '160 passed in 3664.62s (1:01:04)')) {
    Invoke-TestChecked 'Fixture' 'Host' { $global:LASTEXITCODE = 0; $summary }
    if ($validationTestCounts['Host'] -ne 160) { throw 'Incorrect test count' }
}
try {
    Invoke-TestChecked 'Fixture' 'Host' { $global:LASTEXITCODE = 1; '160 passed in 12.34s' }
    throw 'Accepted failed command'
} catch {
    if (-not $_.Exception.Message.Contains('failed with exit code 1')) { throw }
}
try {
    Invoke-TestChecked 'Fixture' 'Host' { $global:LASTEXITCODE = 0; 'No summary' }
    throw 'Accepted missing summary'
} catch {
    if (-not $_.Exception.Message.Contains('without a recognizable bounded test count')) { throw }
}
exit 0
''', encoding="utf-8")
    completed = subprocess.run([powershell, "-NoLogo", "-NoProfile", "-File", str(script)], capture_output=True, text=True, timeout=30)
    assert completed.returncode == 0, completed.stdout + completed.stderr
