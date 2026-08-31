import importlib.util
import json
import sys
from pathlib import Path


REPO = Path(__file__).parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


AFFECTED = load("affected_suites", REPO / "tools" / "affected_suites.py")
MIGRATION = load("migration", REPO / "infrastructure" / "migration.py")


def test_component_contract_changes_select_every_suite():
    assert AFFECTED.affected_suites(["Relay/component.json"]) == list(AFFECTED.SUITES)
    assert AFFECTED.affected_suites(["infrastructure/protocols.json"]) == list(AFFECTED.SUITES)


def test_component_ownership_expands_only_across_known_boundaries():
    assert AFFECTED.affected_suites(["Widgets/weather/source.js"]) == ["Portal", "Widgets"]
    assert AFFECTED.affected_suites(["Arcade/web/app.js"]) == ["Arcade", "Relay", "Host"]
    assert AFFECTED.affected_suites(["Relay/background.js"]) == ["Relay", "Host", "Packaging"]


def test_migration_runner_previews_applies_and_reuses_receipt(tmp_path):
    applied = []
    steps = [
        MIGRATION.MigrationStep("01-prepare", lambda: applied.append("prepare")),
        MIGRATION.MigrationStep("02-promote", lambda: applied.append("promote")),
    ]
    receipt_path = tmp_path / "receipt.json"
    preview = MIGRATION.run_migration("catalogue-v1", 0, 1, steps, receipt_path, dry_run=True)
    assert preview["status"] == "preview"
    assert not receipt_path.exists()
    completed = MIGRATION.run_migration("catalogue-v1", 0, 1, steps, receipt_path)
    assert completed["status"] == "completed"
    assert applied == ["prepare", "promote"]
    assert MIGRATION.run_migration("catalogue-v1", 0, 1, steps, receipt_path) == completed
    assert applied == ["prepare", "promote"]
    assert set(json.loads(receipt_path.read_text(encoding="utf-8"))) == {
        "schemaVersion", "plan", "fromVersion", "toVersion", "status", "completedAt", "steps"
    }


def test_migration_runner_records_failure_without_payloads(tmp_path):
    def fail():
        raise RuntimeError("private payload")

    try:
        MIGRATION.run_migration("failure-v1", 0, 1, [MIGRATION.MigrationStep("01-fail", fail)], tmp_path / "receipt.json")
    except RuntimeError:
        pass
    receipt = (tmp_path / "receipt.json").read_text(encoding="utf-8")
    assert '"status": "failed"' in receipt
    assert "private payload" not in receipt
