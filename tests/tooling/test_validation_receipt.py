import importlib.util
import json
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
