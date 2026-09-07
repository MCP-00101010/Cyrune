"""Reviewed folder reconnection with synthetic collections and mocked pickers."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import shutil
import subprocess

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_lifecycle import CatalogueLifecycle
import arcade_core.catalogue_reattachment as reattachment_module
import arcade_core.catalogue_lifecycle as lifecycle_module
from test_catalogue_lifecycle import setup_source, native_runtime, read, write, ProcessInterrupted


def prepared_copy(tmp_path):
    manager, root = setup_source(tmp_path)
    manager.prepare_source("spectrum", dry_run=False)
    relocated = tmp_path / "relocated"
    shutil.copytree(root, relocated)
    return manager, root, relocated


def snapshot(tmp_path):
    return {str(path.relative_to(tmp_path)): path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}


def preview(manager, root):
    selected = manager.reattachment_review.select("spectrum", lambda: root)
    return manager.reattachment_review.preview(selected["selectionToken"])


def test_selection_and_review_are_write_free_and_retain_exact_ids(tmp_path):
    manager, root, relocated = prepared_copy(tmp_path)
    identity = manager.registry.load()["sources"]["spectrum"]
    # Move only this known temporary fixture; unavailable originals stay selectable.
    root.rename(tmp_path / "original-offline")
    original = snapshot(tmp_path)
    sources = manager.reattachment_review.sources()
    assert sources["sources"][0]["available"] is False
    selected = manager.reattachment_review.select("spectrum", lambda: relocated)
    reviewed = manager.reattachment_review.preview(selected["selectionToken"])
    assert reviewed["entries"] == 1 and str(tmp_path) not in json.dumps([sources, selected, reviewed])
    assert snapshot(tmp_path) == original
    result = manager.reattachment_review.confirm(reviewed["reviewToken"])
    assert result["status"] == "committed"
    updated = manager.registry.load()["sources"]["spectrum"]
    assert updated["sourceId"] == identity["sourceId"]
    assert updated["entries"]["elite_48"]["catalogueId"] == identity["entries"]["elite_48"]["catalogueId"]
    assert read(manager.config_path)["collections"][0]["root"] == str(relocated)
    assert read(relocated / "collection-metadata.json") == read(tmp_path / "original-offline" / "collection-metadata.json")
    repeated = preview(manager, relocated)
    original = snapshot(tmp_path)
    assert manager.reattachment_review.confirm(repeated["reviewToken"])["status"] == "unchanged"
    assert snapshot(tmp_path) == original


@pytest.mark.parametrize("change", ["content", "id", "missing", "added", "read-only"])
def test_selected_folder_must_prove_the_prepared_source(tmp_path, change):
    manager, _, relocated = prepared_copy(tmp_path)
    if change == "content":
        (relocated / "elite_48.tap").write_bytes(b"different release")
    elif change == "missing":
        (relocated / "elite_48.tap").rename(relocated / "missing.tap")
    elif change in ("id", "added"):
        metadata = read(relocated / "collection-metadata.json")
        if change == "id":
            metadata["games"][0]["id"] = "substitute"
        else:
            metadata["games"].append({**metadata["games"][0], "id": "new", "file": "new.tap"})
            (relocated / "new.tap").write_bytes(b"new")
        write(relocated / "collection-metadata.json", metadata)
    else:
        config = read(manager.config_path)
        config["collections"][0]["writable"] = False
        write(manager.config_path, config)
    original = snapshot(tmp_path)
    with pytest.raises(CatalogueError):
        preview(manager, relocated)
    assert snapshot(tmp_path) == original


@pytest.mark.parametrize("change", ["metadata", "media", "configuration", "another-writer"])
def test_stale_confirmation_never_updates_source_location(tmp_path, change):
    manager, _, relocated = prepared_copy(tmp_path)
    reviewed = preview(manager, relocated)
    if change == "metadata":
        metadata = read(relocated / "collection-metadata.json")
        metadata["games"][0]["title"] = "External edit"
        write(relocated / "collection-metadata.json", metadata)
    elif change == "media":
        (relocated / "elite_48.tap").write_bytes(b"replacement")
    elif change == "configuration":
        config = read(manager.config_path)
        config["collections"][0]["name"] = "Updated name"
        write(manager.config_path, config)
    else:
        CatalogueLifecycle(manager.runtime, manager.config_path).reattach_source("spectrum", relocated, dry_run=False)
    original = snapshot(tmp_path)
    with pytest.raises(CatalogueError):
        manager.reattachment_review.confirm(reviewed["reviewToken"])
    assert snapshot(tmp_path) == original


def test_selection_cancel_bounds_expiry_and_restart(tmp_path, monkeypatch):
    manager, _, relocated = prepared_copy(tmp_path)
    review = manager.reattachment_review
    assert review.select("spectrum", lambda: None) == {"cancelled": True}
    assert not review.handles and not review.selecting
    tokens = [review.select("spectrum", lambda: relocated)["selectionToken"] for _ in range(16)]
    with pytest.raises(CatalogueError, match="busy"):
        review.select("spectrum", lambda: relocated)
    later = reattachment_module.time.monotonic() + 301
    monkeypatch.setattr(reattachment_module.time, "monotonic", lambda: later)
    with pytest.raises(CatalogueError, match="review-required"):
        review.preview(tokens[0])
    token = review.select("spectrum", lambda: relocated)["selectionToken"]
    assert len(review.handles) == 1
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    with pytest.raises(CatalogueError, match="review-required"):
        reopened.reattachment_review.preview(token)
    with pytest.raises(CatalogueError, match="review-required"):
        review.confirm(token)


def test_changed_config_while_picker_open_rejects_result(tmp_path):
    manager, _, relocated = prepared_copy(tmp_path)
    def choose():
        config = read(manager.config_path)
        config["collections"][0]["writable"] = False
        write(manager.config_path, config)
        return relocated
    with pytest.raises(CatalogueError):
        manager.reattachment_review.select("spectrum", choose)
    assert not manager.reattachment_review.selecting and not manager.reattachment_review.handles


def test_selected_directory_replacement_requires_a_new_selection(tmp_path):
    manager, _, relocated = prepared_copy(tmp_path)
    selected = manager.reattachment_review.select("spectrum", lambda: relocated)
    assert relocated.resolve().parent == tmp_path.resolve()
    replaced = tmp_path / "previous-folder"
    relocated.rename(replaced)
    shutil.copytree(replaced, relocated)
    with pytest.raises(CatalogueError, match="entry-changed"):
        manager.reattachment_review.preview(selected["selectionToken"])


def test_root_owned_by_another_prepared_source_is_rejected(tmp_path):
    manager, _, relocated = prepared_copy(tmp_path)
    config = read(manager.config_path)
    config["collections"].append({"id": "other", "root": str(relocated), "writable": True})
    write(manager.config_path, config)
    manager.prepare_source("other", dry_run=False)
    original = snapshot(tmp_path)
    with pytest.raises(CatalogueError, match="review-required"):
        preview(manager, relocated)
    assert snapshot(tmp_path) == original


def test_confirmation_is_consumed_once_under_competing_calls(tmp_path):
    manager, _, relocated = prepared_copy(tmp_path)
    token = preview(manager, relocated)["reviewToken"]
    def confirm(_):
        try:
            return manager.reattachment_review.confirm(token)["status"]
        except CatalogueError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, range(2))) == ["committed", "review-required"]


@pytest.mark.parametrize("direction", ["forward", "rollback"])
def test_interrupted_reconnection_uses_reviewed_recovery(tmp_path, monkeypatch, direction):
    manager, root, relocated = prepared_copy(tmp_path)
    token = preview(manager, relocated)["reviewToken"]
    original_source = manager.registry.load()["sources"]["spectrum"]
    writer = lifecycle_module.atomic_write_json
    def interrupted(path, value):
        writer(path, value)
        if path == manager.config_path:
            raise ProcessInterrupted()
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", interrupted)
    with pytest.raises(ProcessInterrupted):
        manager.reattachment_review.confirm(token)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    reopened = CatalogueLifecycle(manager.runtime, manager.config_path)
    assert reopened.recovery_review.status()["operation"] == "reattach"
    with pytest.raises(CatalogueError):
        reopened.reattachment_review.sources()
    recovery = reopened.recovery_review.preview(direction)
    reopened.recovery_review.confirm(recovery["reviewToken"])
    source = reopened.registry.load()["sources"]["spectrum"]
    assert source["sourceId"] == original_source["sourceId"]
    assert source["root"] == str(relocated if direction == "forward" else root)


@pytest.mark.parametrize("active", [True, False])
def test_api_uses_fixed_picker_and_handles_without_native_targets(tmp_path, monkeypatch, active):
    manager, root, relocated = prepared_copy(tmp_path)
    server = native_runtime(manager, root, monkeypatch)
    if not active:
        monkeypatch.setattr(server, "COLLECTION", tmp_path / "unrelated-active-source")
    picked = []
    monkeypatch.setattr(server, "pick_path", lambda *args: picked.append(args) or {"ok": True, "path": str(relocated)})
    request = {"kind": "catalogue-reattachment", "collection_id": "spectrum"}
    assert not server.dispatch_arcade_api("POST", "/api/pick-path", data={**request, "root": str(relocated)})["ok"]
    assert not picked
    selected = server.dispatch_arcade_api("POST", "/api/pick-path", data=request)
    assert picked == [("folder", "Select the relocated collection folder")]
    assert "path" not in selected and str(tmp_path) not in json.dumps(selected)
    reviewed = server.dispatch_arcade_api("POST", "/api/catalogue-reattachment/preview", data={"selection_token": selected["selectionToken"]})
    server.LIBRARY = object()
    result = server.dispatch_arcade_api("POST", "/api/catalogue-reattachment/confirm", data={"review_token": reviewed["reviewToken"]})
    assert result == {"ok": True, "status": "committed", "entries": 1}
    assert server.LIBRARY is None
    assert server.COLLECTION == (relocated if active else tmp_path / "unrelated-active-source")
    if active:
        assert server.METADATA_FILE == relocated / "collection-metadata.json"


def test_reattachment_dialog_flow():
    result = subprocess.run(["node", str(Path(__file__).with_name("catalogue_reattachment_ui.cjs"))], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
