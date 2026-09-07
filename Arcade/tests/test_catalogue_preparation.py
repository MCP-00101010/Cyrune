"""Reviewed preparation exercises only synthetic temporary collections."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_lifecycle import CatalogueLifecycle
import arcade_core.catalogue_lifecycle as lifecycle_module
from test_catalogue import row
from test_catalogue_lifecycle import setup_source, native_runtime, read, write, interrupt_registry_write, ProcessInterrupted


def test_preview_is_write_free_and_response_has_only_review_fields(tmp_path):
    manager, root = setup_source(tmp_path, [row("", file="Elite.tap")])
    before = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    preview = manager.review_preparation("spectrum")
    assert {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()} == before
    assert set(preview) == {"status", "entries", "initializationRequired", "newEntries", "retainedEntries",
                            "pinnedIds", "reviewToken", "expiresInSeconds"}
    assert preview["entries"] == preview["newEntries"] == preview["pinnedIds"] == 1
    assert preview["retainedEntries"] == 0
    assert str(root) not in json.dumps(preview)
    result = manager.confirm_preparation("spectrum", preview["reviewToken"])
    assert result["status"] == "committed"
    original_id = manager.registry.load()["sources"]["spectrum"]["entries"]
    preview = manager.review_preparation("spectrum")
    assert preview["newEntries"] == preview["pinnedIds"] == 0
    assert preview["retainedEntries"] == 1
    assert manager.confirm_preparation("spectrum", preview["reviewToken"])["status"] == "unchanged"
    assert manager.registry.load()["sources"]["spectrum"]["entries"] == original_id


@pytest.mark.parametrize("change", ["metadata", "media", "config", "new-writer"])
def test_changed_review_cannot_write_or_replace_identities(tmp_path, change):
    manager, root = setup_source(tmp_path)
    token = manager.review_preparation("spectrum")["reviewToken"]
    if change == "metadata":
        metadata = read(root / "collection-metadata.json")
        metadata["games"][0]["title"] = "Changed title"
        write(root / "collection-metadata.json", metadata)
    elif change == "media":
        (root / read(root / "collection-metadata.json")["games"][0]["file"]).write_bytes(b"replacement")
    elif change == "config":
        config = read(manager.config_path)
        config["collections"][0]["default_emulator"] = "changed"
        write(manager.config_path, config)
    else:
        CatalogueLifecycle(manager.runtime, manager.config_path).prepare_source("spectrum", dry_run=False)
    before = {path: path.read_bytes() for path in tmp_path.rglob("*.json")}
    with pytest.raises(CatalogueError, match="entry-changed"):
        manager.confirm_preparation("spectrum", token)
    assert {path: path.read_bytes() for path in tmp_path.rglob("*.json")} == before


@pytest.mark.parametrize("failure", ["expired", "wrong-source", "restart", "reused"])
def test_confirmation_tokens_are_expiring_source_bound_and_one_use(tmp_path, monkeypatch, failure):
    manager, _ = setup_source(tmp_path)
    token = manager.review_preparation("spectrum")["reviewToken"]
    source = "spectrum"
    if failure == "expired":
        monkeypatch.setattr(lifecycle_module.time, "monotonic", lambda: float("inf"))
    elif failure == "wrong-source":
        source = "other"
    elif failure == "restart":
        manager = CatalogueLifecycle(manager.runtime, manager.config_path)
    else:
        manager.confirm_preparation(source, token)
    with pytest.raises(CatalogueError, match="review-required"):
        manager.confirm_preparation(source, token)


def test_concurrent_confirmation_commits_once(tmp_path):
    manager, _ = setup_source(tmp_path)
    token = manager.review_preparation("spectrum")["reviewToken"]
    def confirm(_):
        try:
            return manager.confirm_preparation("spectrum", token)["status"]
        except CatalogueError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, range(2))) == ["committed", "review-required"]


def test_review_cache_is_bounded_and_expired_reviews_are_pruned(tmp_path, monkeypatch):
    manager, _ = setup_source(tmp_path)
    for _ in range(16):
        manager.review_preparation("spectrum")
    with pytest.raises(CatalogueError, match="busy"):
        manager.review_preparation("spectrum")
    later = lifecycle_module.time.monotonic() + 301
    monkeypatch.setattr(lifecycle_module.time, "monotonic", lambda: later)
    manager.review_preparation("spectrum")
    assert len(manager._preparation_reviews) == 1


def test_external_change_during_plan_never_becomes_a_review(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path)
    original = manager._plan
    def interrupted_plan(*args, **kwargs):
        result = original(*args, **kwargs)
        metadata = read(root / "collection-metadata.json")
        metadata["games"][0]["title"] = "Concurrent edit"
        write(root / "collection-metadata.json", metadata)
        return result
    monkeypatch.setattr(manager, "_plan", interrupted_plan)
    with pytest.raises(CatalogueError, match="entry-changed"):
        manager.review_preparation("spectrum")
    assert not manager.registry.path.exists()
    assert not manager._preparation_reviews


def test_pending_transaction_blocks_review_and_confirmation_without_recovery(tmp_path, monkeypatch):
    manager, _ = setup_source(tmp_path)
    token = manager.review_preparation("spectrum")["reviewToken"]
    writer = interrupt_registry_write(manager, monkeypatch)
    with pytest.raises(ProcessInterrupted):
        manager.prepare_source("spectrum", dry_run=False)
    monkeypatch.setattr(lifecycle_module, "atomic_write_json", writer)
    before = {path: path.read_bytes() for path in tmp_path.rglob("*.json")}
    with pytest.raises(CatalogueError, match="busy"):
        manager.review_preparation("spectrum")
    with pytest.raises(CatalogueError, match="busy"):
        manager.confirm_preparation("spectrum", token)
    assert {path: path.read_bytes() for path in tmp_path.rglob("*.json")} == before


def test_fixed_api_confirms_exact_source_and_rejects_page_authority(tmp_path, monkeypatch):
    manager, root = setup_source(tmp_path)
    server = native_runtime(manager, root, monkeypatch)
    monkeypatch.setattr(server, "COLLECTION", tmp_path / "different-active-source")
    preview_route = "/api/catalogue-preparation/preview"
    confirm_route = "/api/catalogue-preparation/confirm"
    for data in ({"collection_id": "spectrum", "root": str(root)}, {"collection_id": []},
                 {"collection_id": "spectrum", "role": "arcade"}):
        assert server.dispatch_arcade_api("POST", preview_route, data=data)["code"] == "invalid-request"
    preview = server.dispatch_arcade_api("POST", preview_route, data={"collection_id": "spectrum"})
    assert preview["ok"]
    result = server.dispatch_arcade_api("POST", confirm_route, data={"collection_id": "spectrum", "review_token": preview["reviewToken"]})
    assert result == {"ok": True, "status": "committed", "entries": 1}
    assert server.COLLECTION == tmp_path / "different-active-source"
    assert manager.registry.path.exists()
    missing = server.dispatch_arcade_api("POST", preview_route, data={"collection_id": "missing"})
    assert not missing["ok"] and str(tmp_path) not in json.dumps(missing)


def test_preparation_dialog_confirmation_and_failure_flow():
    script = Path(__file__).with_name("catalogue_preparation_ui.cjs")
    result = subprocess.run(["node", str(script)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
