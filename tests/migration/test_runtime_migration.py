from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).resolve().parents[2] / "tools" / "runtime_migration.py"
SPEC = importlib.util.spec_from_file_location("cyrune_runtime_migration", MODULE_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MIGRATION)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def fixture_tree(tmp_path: Path) -> dict[str, Path]:
    legacy = tmp_path / "legacy"
    portal = legacy / "Portal"
    arcade = legacy / "Arcade" / "data"
    runtime = tmp_path / "runtime" / "Cyrune"
    recovery = tmp_path / "recovery"
    host_config = tmp_path / "host" / "config.json"

    first_background = portal / "assets" / "backgrounds" / "board" / "nebula.png"
    second_background = portal / "assets" / "backgrounds" / "board" / "moon.jpg"
    first_background.parent.mkdir(parents=True)
    first_background.write_bytes(b"nebula-image")
    second_background.write_bytes(b"moon-image")
    database = portal / "extension" / "native" / "hub.json"
    write_json(database, {
        "schemaVersion": 6,
        "boards": [{
            "id": "board-stable",
            "backgroundImage": "",
            "tabs": [
                {"id": "tab-one", "backgroundImage": "assets/backgrounds/board/nebula.png"},
                {"id": "tab-two", "backgroundImage": "./assets/backgrounds/board/moon.jpg"},
            ],
        }],
        "applications": {"app_opaque": {"label": "Editor"}},
        "games": {"game_opaque": {"label": "Jetpac"}},
    })
    write_json(database.parent / "backups" / "hub.before-write.20260825.json", {"boards": []})

    managed = arcade / "emulator-profiles" / "eightyone" / "48k.ini"
    managed.parent.mkdir(parents=True)
    managed.write_bytes(b"profile")
    write_json(arcade / "config.json", {
        "collections": [{"id": "spectrum"}],
        "default_collection": "spectrum",
        "emulators": {"eightyone": {}},
        "emulator_profiles": [{
            "id": "profile-stable",
            "managed_path": str(managed),
            "managed_hash": "UNCHANGED",
        }],
        "scrapers": {"screenscraper": {"configured": True}},
    })
    write_json(arcade / "state.json", {
        "favourites": ["jetpac"],
        "recent": [{"id": "jetpac"}],
    })
    (arcade / "launcher.log").write_text("safe test log\n", encoding="utf-8")
    write_json(host_config, {
        "databasePath": str(database),
        "emuguiRoot": str(legacy / "Arcade"),
        "approvedDirectories": {"opaque_handle": {"path": str(tmp_path), "purpose": "git"}},
        "approvedApplications": {"app_opaque": {"label": "Editor"}},
        "approvedGames": {"game_opaque": {"label": "Jetpac"}},
    })
    return {
        "portal": portal,
        "database": database,
        "arcade": arcade,
        "runtime": runtime,
        "recovery": recovery,
        "host": host_config,
    }


def prepare(paths: dict[str, Path], **kwargs):
    return MIGRATION.prepare(
        runtime_root=paths["runtime"],
        recovery_root=paths["recovery"],
        host_config=paths["host"],
        portal_database=paths["database"],
        portal_backgrounds=None,
        arcade_data=paths["arcade"],
        **kwargs,
    )


def test_prepare_copies_verifies_transforms_and_sanitizes_receipt(tmp_path):
    paths = fixture_tree(tmp_path)
    source_database_hash = MIGRATION.sha256_file(paths["database"])
    receipt = prepare(paths)

    assert receipt["status"] == "prepared"
    assert receipt["portalBackgroundReferencesRewritten"] == 2
    assert receipt["arcadeProfilePathsRewritten"] == 1
    assert MIGRATION.sha256_file(paths["database"]) == source_database_hash
    assert MIGRATION.sha256_file(paths["recovery"] / "Portal" / "database.json") == source_database_hash

    portal = json.loads((paths["runtime"] / "Portal" / "database.json").read_text(encoding="utf-8"))
    references = [tab["backgroundImage"] for tab in portal["boards"][0]["tabs"]]
    assert all(reference.startswith("file:") for reference in references)
    assert all("/Cyrune/Portal/backgrounds/board/" in reference for reference in references)
    assert portal["applications"] == {"app_opaque": {"label": "Editor"}}
    assert portal["games"] == {"game_opaque": {"label": "Jetpac"}}

    arcade = json.loads((paths["runtime"] / "Arcade" / "config.json").read_text(encoding="utf-8"))
    profile = arcade["emulator_profiles"][0]
    assert profile["id"] == "profile-stable"
    assert profile["managed_hash"] == "UNCHANGED"
    assert Path(profile["managed_path"]) == paths["runtime"] / "Arcade" / "emulator-profiles" / "eightyone" / "48k.ini"
    assert (paths["runtime"] / "Arcade" / "logs" / "launcher.log").is_file()
    assert (paths["runtime"] / "Arcade" / "cache").is_dir()

    persisted_receipt = json.loads(
        (paths["runtime"] / "migration-receipts" / MIGRATION.RECEIPT_NAME).read_text(encoding="utf-8")
    )
    serialized = json.dumps(persisted_receipt)
    assert persisted_receipt["schema"] == MIGRATION.RECEIPT_SCHEMA
    assert "approvedDirectories" not in serialized
    assert "approvedApplications" not in serialized
    assert "scrapers" not in serialized
    assert str(tmp_path) not in serialized


def test_prepare_is_idempotent_when_destinations_are_unchanged(tmp_path):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    second = prepare(paths)
    destination_records = [
        item for item in second["files"]
        if item["component"] in {"Portal", "Portal backgrounds", "Portal backups", "Arcade"}
    ]
    assert destination_records
    assert all(item["status"] == "identical" for item in destination_records)


def test_prepare_refuses_divergent_destination_without_explicit_choice(tmp_path):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    state = paths["runtime"] / "Arcade" / "state.json"
    write_json(state, {"favourites": ["newer-user-state"], "recent": []})
    with pytest.raises(MIGRATION.DivergentDataError, match="explicit replacement"):
        prepare(paths)
    replacement = prepare(paths, replace_divergent=True)
    assert replacement["status"] == "prepared"


def test_prepare_classifies_corrupt_json_as_requiring_explicit_replacement(tmp_path):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    state = paths["runtime"] / "Arcade" / "state.json"
    state.write_text("{broken", encoding="utf-8")
    with pytest.raises(MIGRATION.DivergentDataError, match="corrupt"):
        prepare(paths)
    assert prepare(paths, replace_divergent=True)["status"] == "prepared"


def test_prepare_recovers_interrupted_temporary_copy(tmp_path):
    paths = fixture_tree(tmp_path)
    target_parent = paths["runtime"] / "Arcade"
    target_parent.mkdir(parents=True)
    (target_parent / ".state.json.cyrune-v1-abandoned.tmp").write_bytes(b"partial")
    receipt = prepare(paths)
    state_record = next(
        item for item in receipt["files"]
        if item["component"] == "Arcade" and item["relativePath"] == "state.json"
    )
    assert state_record["status"] == "recovered-interrupted"
    assert not list(target_parent.glob(".state.json.cyrune-v1-*.tmp"))


def test_prepare_rejects_missing_referenced_background(tmp_path):
    paths = fixture_tree(tmp_path)
    (paths["portal"] / "assets" / "backgrounds" / "board" / "moon.jpg").unlink()
    with pytest.raises(MIGRATION.MigrationError, match="no copied file"):
        prepare(paths)


def test_activate_switches_only_after_verification_and_is_retry_safe(tmp_path):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    receipt = MIGRATION.activate(runtime_root=paths["runtime"], host_config=paths["host"])
    host = json.loads(paths["host"].read_text(encoding="utf-8"))
    expected_database = (paths["runtime"] / "Portal" / "database.json").resolve()
    assert receipt["status"] == "activated"
    assert Path(host["databasePath"]).resolve() == expected_database
    assert "approvedDirectories" in host
    assert "approvedApplications" in host
    assert "approvedGames" in host
    assert MIGRATION.migration_is_active(paths["runtime"], paths["host"], receipt)
    assert MIGRATION.activate(runtime_root=paths["runtime"], host_config=paths["host"])["status"] == "activated"


def test_migrate_command_recognizes_an_already_activated_receipt_without_recovery_argument(tmp_path, capsys):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    MIGRATION.activate(runtime_root=paths["runtime"], host_config=paths["host"])
    assert MIGRATION.main([
        "migrate",
        "--runtime-root", str(paths["runtime"]),
        "--host-config", str(paths["host"]),
    ]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "activated"


def test_activate_refuses_a_destination_changed_after_prepare(tmp_path):
    paths = fixture_tree(tmp_path)
    prepare(paths)
    write_json(paths["runtime"] / "Arcade" / "state.json", {"favourites": [], "recent": []})
    with pytest.raises(MIGRATION.MigrationError, match="changed before activation"):
        MIGRATION.activate(runtime_root=paths["runtime"], host_config=paths["host"])


def test_semantic_verifier_rejects_changes_outside_migrated_paths():
    source_portal = {"boards": [{"id": "stable", "backgroundImage": "assets/backgrounds/a.png"}]}
    target_portal = {"boards": [{"id": "changed", "backgroundImage": "file:///external/a.png"}]}
    source_arcade = {"emulator_profiles": [{"id": "profile", "managed_path": "legacy"}]}
    target_arcade = {"emulator_profiles": [{"id": "profile", "managed_path": "external"}]}
    with pytest.raises(MIGRATION.MigrationError, match="Portal data changed"):
        MIGRATION._verify_semantic_preservation(
            source_portal,
            target_portal,
            source_arcade,
            target_arcade,
        )
