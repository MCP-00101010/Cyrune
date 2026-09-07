"""Recovery reviews use temporary journals and never launch or touch live data."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_lifecycle import CatalogueLifecycle
import arcade_core.catalogue_lifecycle as lifecycle_module
import arcade_core.catalogue_recovery as recovery_module
from test_catalogue import row
from test_catalogue_lifecycle import setup_source, native_runtime, read, write, interrupt_registry_write, ProcessInterrupted


def pending(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path, [row("", file="Elite.tap")])
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    return manager, root


def files(tmp_path):
    return {str(path.relative_to(tmp_path)): path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}


@pytest.mark.parametrize("direction,expected", [("forward", "committed"), ("rollback", "rolled-back")])
def test_review_is_write_free_and_confirmation_applies_exact_direction(tmp_path, monkeypatch, direction, expected):
    manager, root = pending(tmp_path, monkeypatch)
    original = files(tmp_path)
    status = manager.recovery_review.status()
    assert status["directions"] == ["forward", "rollback"]
    preview = manager.recovery_review.preview(direction)
    assert preview["direction"] == direction and preview["documents"] > 0
    assert str(root) not in json.dumps([status, preview])
    assert files(tmp_path) == original
    assert manager.recovery_review.confirm(preview["reviewToken"]) == {"status": expected}
    assert manager.recovery_review.status() == {"status": "idle"}
    assert manager.recovery_review.status() == {"status": "idle"}
    with pytest.raises(CatalogueError, match="review-required"):
        manager.recovery_review.confirm(preview["reviewToken"])


@pytest.mark.parametrize("change", ["metadata", "config", "journal", "settled"])
def test_stale_recovery_never_overwrites_external_edits(tmp_path, monkeypatch, change):
    manager, root = pending(tmp_path, monkeypatch)
    token = manager.recovery_review.preview("rollback")["reviewToken"]
    if change == "metadata":
        target = root / "collection-metadata.json"
        value = read(target)
        value["games"][0]["title"] = "External change"
        write(target, value)
    elif change == "config":
        value = read(manager.config_path)
        value["collections"][0]["name"] = "New name"
        write(manager.config_path, value)
    elif change == "journal":
        value = read(manager.journal_path)
        value["id"] = "another_transaction"
        write(manager.journal_path, value)
    else:
        manager.recover()
    original = files(tmp_path)
    with pytest.raises(CatalogueError):
        manager.recovery_review.confirm(token)
    assert files(tmp_path) == original


@pytest.mark.parametrize("direction", ["forward", "rollback"])
def test_interrupted_repair_keeps_durable_choice_after_restart(tmp_path, monkeypatch, direction):
    manager, _ = pending(tmp_path, monkeypatch)
    token = manager.recovery_review.preview(direction)["reviewToken"]
    writer = lifecycle_module.atomic_write_json
    def interrupt_after_write(path, value):
        writer(path, value)
        if path != manager.journal_path:
            raise ProcessInterrupted()
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", interrupt_after_write)
    with pytest.raises(ProcessInterrupted):
        manager.recovery_review.confirm(token)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    assert reopened.recovery_review.status()["directions"] == [direction]
    with pytest.raises(CatalogueError, match="review-required"):
        reopened.recovery_review.preview("rollback" if direction == "forward" else "forward")
    with pytest.raises(CatalogueError):
        reopened.recovery_review.confirm(token)
    resumed = reopened.recovery_review.preview(direction)
    assert reopened.recovery_review.confirm(resumed["reviewToken"])["status"] == ("committed" if direction == "forward" else "rolled-back")


def test_failed_intent_write_does_not_start_repair(tmp_path, monkeypatch):
    manager, _ = pending(tmp_path, monkeypatch)
    token = manager.recovery_review.preview("rollback")["reviewToken"]
    original = files(tmp_path)
    def disk_full(*_args):
        raise OSError("synthetic disk full")
    monkeypatch.setattr(recovery_module, "atomic_write_json", disk_full)
    with pytest.raises(OSError):
        manager.recovery_review.confirm(token)
    assert files(tmp_path) == original


@pytest.mark.parametrize("blocker", ["read-only", "corrupt-intent", "active-read"])
def test_recovery_refuses_read_only_or_unverifiable_or_active_state(tmp_path, monkeypatch, blocker):
    manager, _ = pending(tmp_path, monkeypatch)
    if blocker == "read-only":
        config = read(manager.config_path)
        config["collections"][0]["writable"] = False
        write(manager.config_path, config)
    elif blocker == "corrupt-intent":
        write(manager.runtime / "catalogue-recovery.json", {"schemaVersion": 999})
    else:
        manager._read_depth = 1
    original = files(tmp_path)
    with pytest.raises(CatalogueError):
        manager.recovery_review.preview("rollback")
    assert files(tmp_path) == original


def test_expiry_bounds_and_concurrent_confirmation(tmp_path, monkeypatch):
    manager, _ = pending(tmp_path, monkeypatch)
    tokens = [manager.recovery_review.preview("forward")["reviewToken"] for _ in range(16)]
    with pytest.raises(CatalogueError, match="busy"):
        manager.recovery_review.preview("forward")
    later = recovery_module.time.monotonic() + 301
    monkeypatch.setattr(recovery_module.time, "monotonic", lambda: later)
    with pytest.raises(CatalogueError, match="review-required"):
        manager.recovery_review.confirm(tokens[0])
    token = manager.recovery_review.preview("forward")["reviewToken"]
    assert len(manager.recovery_review.reviews) == 1
    def confirm(_):
        try:
            return manager.recovery_review.confirm(token)["status"]
        except CatalogueError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, range(2))) == ["committed", "review-required"]


def test_staged_move_allows_only_restore_and_preserves_media(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    media = root / "elite_48.tap"
    destination = root / "Moved.tap"
    content = media.read_bytes()
    with pytest.raises(ProcessInterrupted):
        with manager.mutation(root):
            manager.stage_move(root, media, destination)
            media.replace(destination)
            raise ProcessInterrupted()
    assert manager.recovery_review.status()["directions"] == ["rollback"]
    with pytest.raises(CatalogueError, match="review-required"):
        manager.recovery_review.preview("forward")
    preview = manager.recovery_review.preview("rollback")
    assert preview["moves"] == 1
    manager.recovery_review.confirm(preview["reviewToken"])
    assert media.read_bytes() == content and not destination.exists()


def test_api_stays_reachable_while_loading_and_secret_migration_are_blocked(tmp_path, monkeypatch):
    manager, root = pending(tmp_path, monkeypatch)
    server = native_runtime(manager, root, monkeypatch)
    original = files(tmp_path)
    migrated = []
    monkeypatch.setattr(server.SCRAPER_SECRET_SERVICE, "migrate", lambda config: migrated.append(config) or False)
    server.configure_native_secret_service(get_secret=lambda _: "", set_secret=lambda *_: None,
                                           delete_secret=lambda _: None, status=lambda: {"available": True})
    assert not migrated
    for action in (server.load_config, server.load_metadata, manager.service):
        with pytest.raises(CatalogueError):
            action()
    assert server.dispatch_arcade_api("GET", "/api/games")["code"] == "review-required"
    status = server.dispatch_arcade_api("POST", "/api/catalogue-recovery/status", data={})
    assert status["status"] == "recovery-required" and not migrated
    assert files(tmp_path) == original
    for data in ({"direction": "forward", "root": str(root)}, {"direction": []}, {"direction": "sideways"}):
        assert not server.dispatch_arcade_api("POST", "/api/catalogue-recovery/preview", data=data)["ok"]
    preview = server.dispatch_arcade_api("POST", "/api/catalogue-recovery/preview", data={"direction": "forward"})
    result = server.dispatch_arcade_api("POST", "/api/catalogue-recovery/confirm", data={"review_token": preview["reviewToken"]})
    assert result == {"ok": True, "status": "committed"}
    assert not migrated
    monkeypatch.setattr(server, "emulator_payload", lambda: [])
    assert server.dispatch_arcade_api("GET", "/api/emulators") == {"emulators": []}
    assert len(migrated) == 1


def test_recovery_dialog_flow():
    result = subprocess.run(["node", str(Path(__file__).with_name("catalogue_recovery_ui.cjs"))], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
