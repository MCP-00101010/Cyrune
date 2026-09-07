"""Synthetic-only coverage for the unadvertised Spectrum catalogue core."""

import hashlib
import json
import threading
import time
import tracemalloc

import pytest

import arcade_core.catalogue as catalogue
from arcade_core.catalogue import CatalogueService
from arcade_core.catalogue_identity import CatalogueError, IdentityRegistry, encoded
from arcade_core.catalogue_spectrum import SpectrumEntry, SpectrumSource
from arcade_core.service import ReadOnlyArcadeService, ServiceContractError


def write_metadata(root, rows):
    path = root / "collection-metadata.json"
    path.write_text(json.dumps({"games": rows, "poks": []}), encoding="utf-8")
    return path


def row(game_id="elite_48", **changes):
    return {"id": game_id, "title": "Elite", "file": f"{game_id}.tap", "system": "48K", "memory": "48K",
            "languages": ["en"], "countries": ["GB"], "default_emulator": "native_emulator_secret",
            "emulator_profile": "private_profile_id", **changes}


def prepared(tmp_path, rows=None, collection_id="spectrum", registry=None):
    root = tmp_path / collection_id
    root.mkdir()
    rows = rows if rows is not None else [row()]
    for item in rows:
        media = root / item["file"].replace("\\", "/")
        media.parent.mkdir(parents=True, exist_ok=True)
        media.write_bytes(b"synthetic-media")
    write_metadata(root, rows)
    registry = registry or IdentityRegistry(tmp_path / "runtime" / "catalogue-identities.json")
    registry.initialize(dry_run=False)
    source = SpectrumSource(collection_id, root, registry)
    source.prepare(expected_revision=registry.load()["revision"], dry_run=False)
    service = CatalogueService([source])
    service.refresh()
    return root, registry, source, service


def test_initialization_preview_recovery_and_corruption_never_remint_ids(tmp_path, monkeypatch):
    import arcade_core.catalogue_identity as identities
    path = tmp_path / "runtime" / "registry.json"
    registry = IdentityRegistry(path)
    assert registry.initialize()["status"] == "preview"
    assert not path.parent.exists()
    writer = identities.atomic_write_json
    monkeypatch.setattr(identities, "atomic_write_json", lambda *_: (_ for _ in ()).throw(OSError("disk failure")))
    with pytest.raises(OSError):
        registry.initialize(dry_run=False)
    monkeypatch.setattr(identities, "atomic_write_json", writer)
    assert registry.initialize(dry_run=False)["status"] == "completed"
    path.write_text('{"schemaVersion":99,"revision":0,"sources":{}}', encoding="utf-8")
    original = path.read_bytes()
    with pytest.raises(CatalogueError, match="unsupported-protocol"):
        registry.initialize(dry_run=False)
    assert path.read_bytes() == original
    path.unlink()
    with pytest.raises(CatalogueError, match="review-required"):
        registry.initialize(dry_run=False)
    assert not path.exists()


def test_registry_pins_legacy_ids_and_reruns_without_changing_legacy_data(tmp_path):
    rows = [row(), row("elite_128", system="128K", memory="128K"), row("combined", system="48K-128K", memory="48K-128K")]
    root, registry, source, service = prepared(tmp_path, rows)
    metadata = (root / "collection-metadata.json").read_bytes()
    original = registry.path.read_bytes()
    state = registry.load()
    assert set(state["sources"]["spectrum"]["entries"]) == {r["id"] for r in rows}
    assert not source.prepare(expected_revision=1)["changed"]
    assert not source.prepare(expected_revision=1, dry_run=False)["changed"]
    assert registry.path.read_bytes() == original
    assert (root / "collection-metadata.json").read_bytes() == metadata
    entries = service.search()["entries"]
    assert len({entry["catalogueId"] for entry in entries}) == 3
    assert {entry["hardwareLabel"] for entry in entries} == {"48K", "128K", "48K-128K"}
    reopened = CatalogueService([SpectrumSource("spectrum", root, IdentityRegistry(registry.path))])
    reopened.refresh()
    assert {e["catalogueId"] for e in reopened.search()["entries"]} == {e["catalogueId"] for e in entries}


def test_missing_metadata_id_keeps_exact_legacy_hash_and_is_pinned(tmp_path):
    original_path = "games\\No ID.tap"
    root, registry, source, service = prepared(tmp_path, [row("", file=original_path)])
    expected = hashlib.sha1(original_path.lower().encode()).hexdigest()[:16]
    assert expected in registry.load()["sources"]["spectrum"]["entries"]
    assert source.snapshot()[0].legacy_id == expected
    assert len(service.search()["entries"]) == 1


@pytest.mark.parametrize("rows", [
    [row(), row(file="different.tap")],
    [row(), row("other", file="ELITE_48.tap")],
    [row(id=42)],
])
def test_identity_collisions_or_invalid_ids_do_not_write(tmp_path, rows):
    root, registry, source, _ = prepared(tmp_path)
    before = registry.path.read_bytes()
    write_metadata(root, rows)
    with pytest.raises(CatalogueError, match="review-required"):
        source.prepare(expected_revision=1, dry_run=False)
    assert registry.path.read_bytes() == before


def test_atomic_prepare_failure_and_stale_writers_preserve_all_identities(tmp_path, monkeypatch):
    import arcade_core.catalogue_identity as identities
    root, registry, source, _ = prepared(tmp_path)
    original = registry.path.read_bytes()
    (root / "new.tap").write_bytes(b"new")
    write_metadata(root, [row(), row("new")])
    monkeypatch.setattr(identities, "atomic_write_json", lambda *_: (_ for _ in ()).throw(OSError("private path")))
    with pytest.raises(CatalogueError, match="^persistence-failed$"):
        source.prepare(expected_revision=1, dry_run=False)
    assert registry.path.read_bytes() == original
    with pytest.raises(CatalogueError, match="entry-changed"):
        source.prepare(expected_revision=0, dry_run=False)


def test_two_preparation_writers_cannot_overwrite_a_newer_revision(tmp_path):
    root, registry, source, _ = prepared(tmp_path)
    (root / "new.tap").write_bytes(b"new")
    write_metadata(root, [row(), row("new")])
    outcomes = []
    def apply():
        try:
            outcomes.append(source.prepare(expected_revision=1, dry_run=False)["revision"])
        except CatalogueError as error:
            outcomes.append(error.code)
    threads = [threading.Thread(target=apply) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(map(str, outcomes)) == ["2", "entry-changed"]
    assert len(registry.load()["sources"]["spectrum"]["entries"]) == 2


def test_managed_move_preserves_identity_but_replacement_requires_review(tmp_path):
    root, registry, source, service = prepared(tmp_path)
    before = service.search()["entries"][0]
    (root / "elite_48.tap").rename(root / "renamed.tap")
    write_metadata(root, [row(file="renamed.tap")])
    with pytest.raises(CatalogueError, match="review-required"):
        source.prepare(expected_revision=1, dry_run=False)
    source.prepare(expected_revision=1, dry_run=False, allow_managed_moves=True)
    service.refresh()
    after = service.search()["entries"][0]
    assert after["catalogueId"] == before["catalogueId"]
    assert after["entryRevision"] != before["entryRevision"]
    assert service.resolve_native(after["catalogueId"], after["entryRevision"]).name == "renamed.tap"
    (root / "renamed.tap").write_bytes(b"unapproved replacement")
    with pytest.raises(CatalogueError, match="entry-changed"):
        service.resolve_native(after["catalogueId"], after["entryRevision"])
    with pytest.raises(CatalogueError, match="review-required"):
        source.prepare(expected_revision=2, dry_run=False, allow_managed_moves=True)
    service.refresh()
    assert service.search()["entries"][0]["availability"] == "review-required"


def test_source_scoping_has_no_active_collection_dependency_or_fallback(tmp_path):
    root_a, registry, source_a, _ = prepared(tmp_path, collection_id="a")
    root_b, _, source_b, _ = prepared(tmp_path, collection_id="b", registry=registry)
    service = CatalogueService([source_a, source_b])
    service.refresh()
    entries = service.search()["entries"]
    assert len({e["catalogueId"] for e in entries}) == len({e["sourceId"] for e in entries}) == 2
    assert {service.resolve_native(e["catalogueId"], e["entryRevision"]).parent for e in entries} == {root_a, root_b}
    unknown = SpectrumSource("missing", root_b, registry)
    with pytest.raises(CatalogueError, match="review-required"):
        unknown.snapshot()
    with pytest.raises(CatalogueError, match="source-unavailable"):
        SpectrumSource("a", root_b, registry).snapshot()


def test_projection_drops_internal_fields_and_preserves_editions(tmp_path):
    rows = [row("translated", languages=["es"], countries=["ES"], hardware=["ULAPlus"], version="v2",
                screenshot="/private/artwork.png", scraper_id="private_credential_sentinel", poks=["private.pok"],
                description="Reviewed description", tags=["Adventure"]), row("hidden", status="Hidden")]
    root, registry, source, service = prepared(tmp_path, rows)
    results = service.search()["entries"]
    assert len(results) == 1
    detail = service.detail({"catalogueId": results[0]["catalogueId"]})["entry"]
    assert detail["languages"] == ["es"] and detail["countries"] == ["ES"]
    assert "ULAPlus" in detail["editionLabel"] and "v2" in detail["editionLabel"]
    assert detail["availability"] == "configuration-required"
    public = encoded(detail).decode()
    for secret in (str(root), ".tap", "private", "native_emulator_secret", "screenshot", "poks"):
        assert secret not in public
    assert "description" not in results[0]
    assert service.search({"query": "native_emulator_secret"})["entries"] == []
    detail["title"] = "changed by caller"
    assert service.detail({"catalogueId": results[0]["catalogueId"]})["entry"]["title"] == "Elite"


@pytest.mark.parametrize("changes", [{"system": "128K"}, {"languages": ["English"]}, {"publisher": ["wrong"]},
                                      {"title": "x" * 161}, {"title": "bad\u0000title"}])
def test_unreviewed_or_invalid_presentation_is_a_bounded_placeholder(tmp_path, changes):
    _, _, _, service = prepared(tmp_path, [row(**changes)])
    entry = service.search()["entries"][0]
    assert entry["availability"] == "review-required"
    assert len(encoded(entry)) <= 2048


def test_missing_media_and_failed_refresh_do_not_expose_stale_ready_records(tmp_path):
    root, _, source, service = prepared(tmp_path)
    (root / "elite_48.tap").unlink()
    service.refresh()
    assert service.search()["entries"][0]["availability"] == "media-missing"
    (root / "collection-metadata.json").write_text("{broken", encoding="utf-8")
    with pytest.raises(CatalogueError, match="review-required"):
        service.refresh()
    with pytest.raises(CatalogueError, match="unavailable"):
        service.search()


def test_native_resolution_rechecks_metadata_and_rejects_review_placeholders(tmp_path):
    root, _, _, service = prepared(tmp_path)
    original = service.search()["entries"][0]
    write_metadata(root, [row(default_emulator="changed_policy")])
    with pytest.raises(CatalogueError, match="entry-changed"):
        service.resolve_native(original["catalogueId"], original["entryRevision"])
    write_metadata(root, [row(system="128K")])
    service.refresh()
    reviewed = service.search()["entries"][0]
    with pytest.raises(CatalogueError, match="review-required"):
        service.resolve_native(reviewed["catalogueId"], reviewed["entryRevision"])


def test_registry_rejects_duplicate_json_keys_and_runtime_inside_checkout(tmp_path):
    from pathlib import Path
    path = tmp_path / "registry.json"
    path.write_text('{"schemaVersion":1,"revision":0,"sources":{},"sources":{}}', encoding="utf-8")
    with pytest.raises(CatalogueError, match="review-required"):
        IdentityRegistry(path).load()
    with pytest.raises(CatalogueError, match="invalid-request"):
        IdentityRegistry(Path(__file__).resolve().parents[1] / "registry.json")


def test_paths_and_symlink_escapes_fail_closed(tmp_path):
    root, registry, source, _ = prepared(tmp_path)
    write_metadata(root, [row(file="../escape.tap")])
    with pytest.raises(CatalogueError, match="review-required"):
        source.prepare(expected_revision=1)
    outside = tmp_path / "outside.tap"
    outside.write_bytes(b"outside")
    link = root / "linked.tap"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("Symlink creation is unavailable for this Windows account")
    write_metadata(root, [row(file="linked.tap")])
    with pytest.raises(CatalogueError, match="review-required"):
        source.prepare(expected_revision=1)


@pytest.mark.parametrize("params", [[], {"pageSize": True}, {"pageSize": 0}, {"pageSize": 101},
                                    {"pageSize": "2"}, {"view": "all"}, {"query": "x" * 161},
                                    {"query": None}, {"platformIds": ["zx-spectrum"] * 2},
                                    {"platformIds": ["dosbox"]}, {"platformIds": [{}]}, {"cursor": "é"}])
def test_request_validation_rejects_coercion_and_unknown_fields(tmp_path, params):
    _, _, _, service = prepared(tmp_path)
    with pytest.raises(CatalogueError, match="invalid-request"):
        service.search(params)


def test_cursor_query_integrity_expiry_rebuild_and_restart(tmp_path):
    root, _, source, _ = prepared(tmp_path, [row("a"), row("b"), row("c")])
    clock = [1000]
    service = CatalogueService([source], clock=lambda: clock[0])
    service.refresh()
    first = service.search({"query": "ELITE", "pageSize": 1})
    cursor = first["nextCursor"]
    second = service.search({"query": "elite", "pageSize": 1, "cursor": cursor})
    assert second["entries"][0]["catalogueId"] != first["entries"][0]["catalogueId"]
    with pytest.raises(CatalogueError, match="invalid-request"):
        service.search({"query": "other", "pageSize": 1, "cursor": cursor})
    tampered = cursor[:60] + ("A" if cursor[60] != "A" else "B") + cursor[61:]
    with pytest.raises(CatalogueError, match="invalid-request"):
        service.search({"query": "elite", "pageSize": 1, "cursor": tampered})
    service.refresh()  # identical snapshot does not invalidate a live cursor
    assert service.search({"query": "elite", "pageSize": 1, "cursor": cursor})["entries"]
    clock[0] = 1300
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        service.search({"query": "elite", "pageSize": 1, "cursor": cursor})
    clock[0] = 1001
    write_metadata(root, [row("a", title="Changed"), row("b"), row("c")])
    service.refresh()
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        service.search({"query": "elite", "pageSize": 1, "cursor": cursor})
    restarted = CatalogueService([source], clock=lambda: 1001)
    restarted.refresh()
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        restarted.search({"query": "elite", "pageSize": 1, "cursor": cursor})


def test_byte_limited_pages_cover_every_entry_exactly_once(tmp_path, monkeypatch):
    _, _, _, service = prepared(tmp_path, [row(f"entry{i}") for i in range(8)])
    monkeypatch.setattr(catalogue, "MAX_PAGE_BYTES", 1600)
    cursor, seen = "", []
    while True:
        response = service.search({"pageSize": 100, "cursor": cursor})
        assert len(encoded(response)) <= 1600
        seen.extend(e["catalogueId"] for e in response["entries"])
        cursor = response["nextCursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == 8


def test_large_index_pages_do_not_serialize_full_library(tmp_path, monkeypatch):
    _, _, source, _ = prepared(tmp_path)
    sample = source.snapshot()[0]
    class SyntheticSource:
        collection_id = "synthetic"
        def snapshot(self):
            for number in range(12_933):
                base = {**sample.base, "catalogueId": f"entry_{number:06d}", "title": f"Game {number:06d}"}
                yield SpectrumEntry(base, sample.detail, str(number), self.collection_id, "private.tap", (), ("", ""))
    service = CatalogueService([SyntheticSource()])
    service.refresh()
    normal_encode = catalogue.encoded
    def bounded_encode(value):
        if isinstance(value, (list, tuple)):
            assert len(value) <= 100, "Whole index serialized on read"
        return normal_encode(value)
    monkeypatch.setattr(catalogue, "encoded", bounded_encode)
    tracemalloc.start()
    start = time.perf_counter()
    first = service.search({"pageSize": 100})
    first_ms = (time.perf_counter() - start) * 1000
    start = time.perf_counter()
    second = service.search({"pageSize": 100, "cursor": first["nextCursor"]})
    second_ms = (time.perf_counter() - start) * 1000
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert len(first["entries"]) == len(second["entries"]) == 100
    assert len(encoded(first)) <= 256 * 1024
    assert peak < 4 * 1024 * 1024
    print(f"Synthetic 12,933 entries: first={first_ms:.1f} ms next={second_ms:.1f} ms "
          f"page={len(encoded(first))} bytes read-peak={peak} bytes")


def test_new_capability_is_not_exposed_by_legacy_dispatcher():
    service = ReadOnlyArcadeService(lambda: None, lambda: {}, lambda: [], lambda: [])
    with pytest.raises(ServiceContractError, match="Unsupported"):
        service.dispatch("CATALOGUE_SEARCH", {})
