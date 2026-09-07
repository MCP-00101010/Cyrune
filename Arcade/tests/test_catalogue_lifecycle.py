"""Native lifecycle acceptance using temporary Spectrum collections only."""

from copy import deepcopy
import hashlib
import json
import os
import shutil

import pytest

import arcade_core.catalogue_lifecycle as lifecycle_module
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_lifecycle import CatalogueLifecycle
from test_catalogue import row, write_metadata
from test_service_runtime import load_server


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value), encoding="utf-8")


def setup_source(tmp_path, rows=None):
    runtime, root = tmp_path / "runtime", tmp_path / "spectrum"
    runtime.mkdir()
    root.mkdir()
    rows = rows if rows is not None else [row()]
    for item in rows:
        media = root / item["file"].replace("\\", "/")
        media.parent.mkdir(parents=True, exist_ok=True)
        media.write_bytes(b"synthetic Spectrum media: " + item["file"].encode())
    write_metadata(root, rows)
    write(runtime / "config.json", {"collections": [{"id": "spectrum", "root": str(root), "writable": True}],
                                   "emulators": {}, "emulator_profiles": []})
    return CatalogueLifecycle(runtime, runtime / "config.json"), root


def test_media_observation_detects_same_size_time_replacement_and_missing_file(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    media = root / "elite_48.tap"
    original = media.stat()
    entries = [{"relativePath": media.name}]
    before = lifecycle_module._media_stamps(root, entries)
    replacement = root / "replacement.tap"
    replacement.write_bytes(media.read_bytes())
    os.utime(replacement, ns=(original.st_atime_ns, original.st_mtime_ns))
    replacement.replace(media)
    after = lifecycle_module._media_stamps(root, entries)
    assert before[-1][2] != after[-1][2]
    media.unlink()
    assert lifecycle_module._media_stamps(root, entries)[-1][1] is None


def test_media_observation_rechecks_reparse_targets_and_parent_confinement(tmp_path, monkeypatch):
    from arcade_core.paths import PathConfinementError
    manager, root = setup_source(tmp_path)
    entries = [{"relativePath": "elite_48.tap"}]
    calls = []
    resolve = lifecycle_module.ConfinedRoot.resolve
    def observed(self, path, *args, **kwargs):
        calls.append(str(path))
        return resolve(self, path, *args, **kwargs)
    monkeypatch.setattr(lifecycle_module.ConfinedRoot, "resolve", observed)
    # Exercise the Windows reparse branch portably without requiring symlink privileges.
    monkeypatch.setattr(lifecycle_module.stat, "FILE_ATTRIBUTE_REPARSE_POINT", 32)
    real_stat = lifecycle_module.os.stat
    def reparse(path, *args, **kwargs):
        info = real_stat(path, *args, **kwargs)
        if kwargs.get("follow_symlinks") is False:
            from types import SimpleNamespace
            return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=32)
        return info
    monkeypatch.setattr(lifecycle_module.os, "stat", reparse)
    lifecycle_module._media_stamps(root, entries)
    assert "elite_48.tap" in calls
    with pytest.raises(PathConfinementError):
        lifecycle_module._media_stamps(root, [{"relativePath": "../outside.tap"}])


def test_read_lease_rejects_media_replacement_before_return(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        with manager.read_snapshot():
            manager.service().search()
            media = root / "elite_48.tap"
            replacement = root / "replacement.tap"
            replacement.write_bytes(media.read_bytes())
            original = media.stat()
            os.utime(replacement, ns=(original.st_atime_ns, original.st_mtime_ns))
            replacement.replace(media)


@pytest.mark.parametrize("source_kind", ["read-only", "scanned", "report-only"])
def test_unsupported_source_preparation_never_publishes_or_writes(tmp_path, source_kind):
    manager, root = setup_source(tmp_path)
    if source_kind == "read-only":
        config = read(manager.config_path)
        config["collections"][0]["writable"] = False
        write(manager.config_path, config)
    else:
        (root / "collection-metadata.json").unlink()
        if source_kind == "report-only":
            write(root / "report.json", {"games": [row()]})
    before = {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()}
    for dry_run in (True, False):
        with pytest.raises(CatalogueError):
            manager.prepare_source("spectrum", dry_run=dry_run)
    assert {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()} == before


def test_read_snapshot_reuses_rows_only_within_lease_and_recovers_after_failure(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    with pytest.raises(RuntimeError, match="cancelled"):
        with manager.read_snapshot():
            service = manager.service()
            source = service._sources[0]
            first = source._rows()
            assert source._rows() is first
            with pytest.raises(CatalogueError, match="busy"):
                with manager.mutation(root):
                    pytest.fail("Read lease admitted a mutation")
            raise RuntimeError("cancelled")
    assert manager._read_depth == 0
    assert source._rows() is not first
    metadata = read(root / "collection-metadata.json")
    metadata["games"][0]["title"] = "Renamed outside the read lease"
    write(root / "collection-metadata.json", metadata)
    with manager.read_snapshot():
        assert manager.service().search()["entries"][0]["title"] == "Renamed outside the read lease"


def native_runtime(manager, root, monkeypatch):
    server = load_server()
    monkeypatch.setattr(server, "DATA", manager.runtime)
    monkeypatch.setattr(server, "CONFIG_FILE", manager.config_path)
    monkeypatch.setattr(server, "STATE_FILE", manager.runtime / "state.json")
    monkeypatch.setattr(server, "COLLECTION", root)
    monkeypatch.setattr(server, "METADATA_FILE", root / "collection-metadata.json")
    monkeypatch.setattr(server, "init_state", lambda: None)
    monkeypatch.setattr(server, "discover_collections", lambda: [])
    return server


def test_prepare_preview_pins_exact_legacy_id_without_touching_state_or_poks(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path, [row("", file="games\\No ID.tap", poks=["cheats.pok"])])
    metadata_path = root / "collection-metadata.json"
    original = read(metadata_path)
    legacy = hashlib.sha1(b"games\\no id.tap").hexdigest()[:16]
    state_path = manager.runtime / "state.json"
    write(state_path, {"favourites": [legacy], "recent": [{"id": legacy}]})
    state_bytes = state_path.read_bytes()
    files = set(manager.runtime.iterdir())
    assert manager.prepare_source("spectrum")["entries"] == 1
    assert set(manager.runtime.iterdir()) == files
    assert read(metadata_path) == original
    assert manager.prepare_source("spectrum", dry_run=False)["status"] == "committed"
    assert read(metadata_path)["games"][0] == {**original["games"][0], "id": legacy}
    assert state_path.read_bytes() == state_bytes
    registry = manager.registry.path.read_bytes()
    assert manager.prepare_source("spectrum", dry_run=False)["status"] == "unchanged"
    assert manager.registry.path.read_bytes() == registry
    server = native_runtime(manager, root, monkeypatch)
    server.load_poks = lambda: {("unrelated-title", "48K"): [{"id": "cheat", "output_path": "cheats.pok"}]}
    assert server.get_library().get_game(legacy).favourite
    assert server.get_library().poks_by_game_id[legacy][0]["id"] == "cheat"
    entry = manager.service().search()["entries"][0]
    assert server.rename_game(legacy, "Renamed.tap")["ok"]
    assert server.get_library().get_game(legacy).file_name == "Renamed.tap"
    assert server.get_library().get_game(legacy).favourite
    assert server.get_library().poks_by_game_id[legacy][0]["id"] == "cheat"
    assert state_path.read_bytes() == state_bytes
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    assert reopened.service().search()["entries"][0]["catalogueId"] == entry["catalogueId"]


@pytest.mark.parametrize("fault", ["missing-media", "invalid-id", "wrong-extension", "escape"])
def test_first_prepare_dry_run_validates_without_creating_runtime_artifacts(tmp_path, fault):
    manager, root = setup_source(tmp_path)
    path = root / "collection-metadata.json"
    metadata = read(path)
    if fault == "missing-media":
        (root / "elite_48.tap").unlink()
    elif fault == "invalid-id":
        metadata["games"][0]["id"] = False
    elif fault == "wrong-extension":
        (root / "elite_48.tap").rename(root / "elite.exe")
        metadata["games"][0]["file"] = "elite.exe"
    else:
        metadata["games"][0]["file"] = "../outside.tap"
    write(path, metadata)
    before = path.read_bytes()
    with pytest.raises(CatalogueError):
        manager.prepare_source("spectrum")
    assert path.read_bytes() == before
    assert list(manager.runtime.iterdir()) == [manager.config_path]


class ProcessInterrupted(BaseException):
    pass


def interrupt_registry_write(manager, monkeypatch):
    writer = lifecycle_module.atomic_write_json
    def interrupt(path, value):
        if path == manager.registry.path:
            raise ProcessInterrupted()
        writer(path, value)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", interrupt)
    return writer


@pytest.mark.parametrize("direction", ["forward", "rollback"])
def test_interrupted_preparation_recovers_without_reminting_ids(tmp_path, monkeypatch, direction):
    manager, root = setup_source(tmp_path, [row("", file="legacy.tap")])
    before = read(root / "collection-metadata.json")
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    journal = read(manager.journal_path)
    assert journal["status"] == "pending"
    planned = next(d["after"] for d in journal["documents"] if d["kind"] == "registry")
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    assert reopened.recover(direction=direction, dry_run=True)["status"] == "preview"
    assert read(manager.journal_path)["status"] == "pending"
    assert reopened.recover(direction=direction)["status"] == ("committed" if direction == "forward" else "rolled-back")
    if direction == "forward":
        assert reopened.registry.load() == planned
        assert len(reopened.service().search()["entries"]) == 1
    else:
        assert read(root / "collection-metadata.json") == before
        assert reopened.registry.load()["sources"] == {}
        assert not reopened.proofs_path.exists()
    assert reopened.recover()["status"] == "idle"


def test_recovery_preserves_conflicting_external_metadata(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path, [row("", file="legacy.tap")])
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    path = root / "collection-metadata.json"
    changed = read(path)
    changed["games"][0]["title"] = "External edit"
    write(path, changed)
    before = path.read_bytes()
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    for direction in ("forward", "rollback"):
        with pytest.raises(CatalogueError, match="entry-changed"):
            CatalogueLifecycle(manager.runtime, manager.config_path).recover(direction=direction)
    assert path.read_bytes() == before
    assert read(manager.journal_path)["status"] == "pending"


@pytest.mark.parametrize("direction", ["forward", "rollback"])
def test_interrupted_native_rename_recovers_media_metadata_and_identity(tmp_path, monkeypatch, direction):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    server = native_runtime(manager, root, monkeypatch)
    entry = server.get_catalogue_service().search()["entries"][0]
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        server.rename_game("elite_48", "New name.tap")
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    reopened.recover(direction=direction)
    expected = "New name.tap" if direction == "forward" else "elite_48.tap"
    assert (root / expected).is_file()
    assert read(root / "collection-metadata.json")["games"][0]["file"] == expected
    assert reopened.service().search()["entries"][0]["catalogueId"] == entry["catalogueId"]
    assert len(list(root.glob("*.tap"))) == 1


@pytest.mark.parametrize("point", ["staged", "pending", "metadata", "registry", "committed"])
def test_ordinary_native_rename_write_failure_rolls_back(tmp_path, monkeypatch, point):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    server = native_runtime(manager, root, monkeypatch)
    old_entry = server.get_catalogue_service().search()["entries"][0]
    writer = lifecycle_module.atomic_write_json
    failed = False
    def fail_once(path, value):
        nonlocal failed
        current = {manager.registry.path: "registry", root / "collection-metadata.json": "metadata"}.get(path)
        if path == manager.journal_path:
            current = value["status"]
        if current == point and not failed:
            failed = True
            raise OSError("test disk failure")
        writer(path, value)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", fail_once)
    with pytest.raises((CatalogueError, OSError)):
        server.rename_game("elite_48", "New.tap")
    assert failed
    assert (root / "elite_48.tap").is_file()
    assert not (root / "New.tap").exists()
    assert server.get_library().get_game("elite_48").file_name == "elite_48.tap"
    assert server.get_catalogue_service().search()["entries"][0]["catalogueId"] == old_entry["catalogueId"]


def test_native_delete_restore_import_and_metadata_undo_refresh(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    server = native_runtime(manager, root, monkeypatch)
    service = server.get_catalogue_service()
    entry = service.search()["entries"][0]
    assert server.update_game_metadata(["elite_48"], {"title": "Updated"})["ok"]
    assert service.search()["entries"][0]["title"] == "Updated"
    assert service.detail({"catalogueId": entry["catalogueId"]})["entry"]["languages"] == ["en"]
    assert server.undo_game_metadata()["ok"]
    assert service.search()["entries"][0]["title"] == "Elite"
    assert server.delete_games(["elite_48"])["ok"]
    assert service.search()["entries"] == []
    trash = server.get_library().list_games("trash")
    assert len(trash) == 1
    assert server.restore_trash_games([trash[0]["id"]])["ok"]
    restored = service.search()["entries"][0]
    assert restored["catalogueId"] == entry["catalogueId"]
    assert server.get_library().get_game("elite_48") is not None
    incoming = root / "incoming" / "New Game (1984)(Publisher)(48K).tap"
    incoming.parent.mkdir()
    incoming.write_bytes(b"new incoming media")
    server.get_library().rebuild()
    games = server.get_library().list_games("incoming")
    assert len(games) == 1
    assert server.import_incoming_games([games[0]["id"]])["ok"]
    assert len(service.search()["entries"]) == 2


@pytest.mark.parametrize("change", ["metadata", "config", "profile", "media", "root"])
def test_external_changes_refresh_before_reads_and_reject_stale_selections(tmp_path, change):
    manager, root = setup_source(tmp_path, [row(), row("second", title="Second")])
    profile = manager.runtime / "profile.ini"
    profile.write_text("before", encoding="utf-8")
    config = read(manager.config_path)
    config["emulator_profiles"] = [{"id": "one", "managed_path": str(profile)}]
    write(manager.config_path, config)
    manager.prepare_source("spectrum", dry_run=False)
    service = manager.service()
    page = service.search({"pageSize": 1})
    old = page["entries"][0]
    if change == "metadata":
        path = root / "collection-metadata.json"
        metadata = read(path)
        metadata["games"][0]["publisher"] = "Updated Publisher"
        write(path, metadata)
    elif change == "config":
        config["emulator_profiles"][0]["priority"] = 99
        write(manager.config_path, config)
    elif change == "profile":
        profile.write_text("updated profile", encoding="utf-8")
    elif change == "media":
        (root / "elite_48.tap").unlink()
    else:
        root.rename(root.with_name("offline"))
        with pytest.raises(CatalogueError, match="unavailable"):
            service.search()
        return
    fresh = service.search()
    assert fresh["catalogueRevision"] != page["catalogueRevision"]
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        service.search({"pageSize": 1, "cursor": page["nextCursor"]})
    with pytest.raises(CatalogueError, match="entry-changed"):
        service.resolve_native(old["catalogueId"], old["entryRevision"])
    if change == "media":
        assert fresh["entries"][0]["availability"] == "media-missing"


def test_explicit_reattachment_uses_content_proofs_and_keeps_opaque_ids(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    old = manager.service().search()["entries"][0]
    copied = tmp_path / "copied"
    shutil.copytree(root, copied)
    root.rename(tmp_path / "offline")
    config_bytes, registry_bytes = manager.config_path.read_bytes(), manager.registry.path.read_bytes()
    assert manager.reattach_source("spectrum", copied)["status"] == "preview"
    assert manager.config_path.read_bytes() == config_bytes
    assert manager.registry.path.read_bytes() == registry_bytes
    assert manager.reattach_source("spectrum", copied, dry_run=False)["status"] == "committed"
    assert read(manager.config_path)["collections"][0]["root"] == str(copied)
    fresh = CatalogueLifecycle(manager.runtime, manager.config_path).service().search()["entries"][0]
    assert fresh["catalogueId"] == old["catalogueId"]
    assert fresh["sourceId"] == old["sourceId"]
    assert fresh["availability"] == "configuration-required"
    assert str(copied) not in json.dumps(fresh)


@pytest.mark.parametrize("fault", ["changed-bytes", "missing-media", "missing-id", "wrong-id"])
def test_reattachment_rejects_unverified_media_without_changing_config(tmp_path, fault):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    copied = tmp_path / "copied"
    shutil.copytree(root, copied)
    if fault == "changed-bytes":
        (copied / "elite_48.tap").write_bytes(b"different game")
    elif fault == "missing-media":
        (copied / "elite_48.tap").unlink()
    else:
        metadata = read(copied / "collection-metadata.json")
        metadata["games"][0]["id"] = "" if fault == "missing-id" else "different"
        write(copied / "collection-metadata.json", metadata)
    before = manager.config_path.read_bytes(), manager.registry.path.read_bytes()
    with pytest.raises(CatalogueError):
        manager.reattach_source("spectrum", copied, dry_run=False)
    assert before == (manager.config_path.read_bytes(), manager.registry.path.read_bytes())


def test_missing_proofs_and_invalid_recovery_data_fail_closed(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    manager.proofs_path.unlink()
    with pytest.raises(CatalogueError, match="review-required"):
        manager.save_metadata(root, deepcopy(read(root / "collection-metadata.json")))
    with pytest.raises(CatalogueError, match="unavailable"):
        manager.service()


@pytest.mark.parametrize("operation", ["rename", "delete", "import", "restore"])
def test_interruption_before_metadata_save_rolls_back_staged_file_moves(tmp_path, monkeypatch, operation):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    server = native_runtime(manager, root, monkeypatch)
    if operation == "restore":
        assert server.delete_games(["elite_48"])["ok"]
        game_id = server.get_library().list_games("trash")[0]["id"]
    elif operation == "import":
        incoming = root / "incoming" / "New (1984)(Publisher)(48K).tap"
        incoming.parent.mkdir()
        incoming.write_bytes(b"new media")
        server.get_library().rebuild()
        game_id = server.get_library().list_games("incoming")[0]["id"]
    else:
        game_id = "elite_48"
    media_before = {p.relative_to(root): p.read_bytes() for p in root.rglob("*.tap")}
    metadata_before = read(root / "collection-metadata.json")
    registry_before = manager.registry.load()
    def interrupt(_metadata):
        raise ProcessInterrupted()
    monkeypatch.setattr(server, "save_metadata", interrupt)
    with pytest.raises(ProcessInterrupted):
        if operation == "rename":
            server.rename_game(game_id, "New.tap")
        else:
            {"delete": server.delete_games, "import": server.import_incoming_games,
             "restore": server.restore_trash_games}[operation]([game_id])
    assert read(manager.journal_path)["status"] == "staged"
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    assert reopened.recover()["status"] == "rolled-back"
    assert {p.relative_to(root): p.read_bytes() for p in root.rglob("*.tap")} == media_before
    assert read(root / "collection-metadata.json") == metadata_before
    assert reopened.registry.load() == registry_before


@pytest.mark.parametrize("direction", ["forward", "rollback"])
def test_interrupted_reattachment_recovers_config_and_identity_together(tmp_path, monkeypatch, direction):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    old = manager.service().search()["entries"][0]
    copied = tmp_path / "copied"
    shutil.copytree(root, copied)
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.reattach_source("spectrum", copied, dry_run=False)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    reopened.recover(direction=direction)
    expected = str(copied if direction == "forward" else root)
    assert read(manager.config_path)["collections"][0]["root"] == expected
    assert reopened.registry.load()["sources"]["spectrum"]["root"] == expected
    assert reopened.service().search()["entries"][0]["catalogueId"] == old["catalogueId"]


def test_native_recovery_preview_does_not_apply_and_explicit_rollback_is_respected(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path, [row("", file="legacy.tap")])
    before = read(root / "collection-metadata.json")
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    server = native_runtime(manager, root, monkeypatch)
    assert server.recover_catalogue_transaction(direction="rollback")["status"] == "preview"
    assert read(manager.journal_path)["status"] == "pending"
    assert server.recover_catalogue_transaction(direction="rollback", dry_run=False)["status"] == "rolled-back"
    assert read(root / "collection-metadata.json") == before


@pytest.mark.parametrize("fault", ["intent", "metadata", "registry", "proofs", "completion"])
def test_interruption_after_each_preparation_write_finishes_the_same_transaction(tmp_path, monkeypatch, fault):
    manager, root = setup_source(tmp_path, [row("", file="legacy.tap")])
    writer = lifecycle_module.atomic_write_json
    def interrupt_after(path, value):
        writer(path, value)
        point = {manager.registry.path: "registry", manager.proofs_path: "proofs",
                 root / "collection-metadata.json": "metadata"}.get(path)
        if path == manager.journal_path:
            point = "completion" if value["status"] == "committed" else "intent"
        if point == fault:
            raise ProcessInterrupted()
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", interrupt_after)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    planned = next(d["after"] for d in read(manager.journal_path)["documents"] if d["kind"] == "registry")
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    reopened.recover()
    assert reopened.registry.load() == planned
    assert len(reopened.service().search()["entries"]) == 1
