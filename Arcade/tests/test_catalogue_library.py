"""Direct library browsing is metadata-only; Add retains exact native validation."""

import json
from pathlib import Path

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.catalogue_library import LibraryCatalogue
from test_catalogue import row
from test_catalogue_lifecycle import setup_source, read, write


def fixture(tmp_path):
    lifecycle, root = setup_source(tmp_path, [row(default_emulator="", emulator_profile=""),
        row("elite_128", system="128K", memory="128K", default_emulator="", emulator_profile="")])
    config = read(lifecycle.config_path)
    executable = tmp_path / "fixture.exe"
    executable.write_bytes(b"Never execute this synthetic file")
    config["collections"][0].update(writable=False, default_emulator="fixture")
    config["emulators"] = {"fixture": {"type": "generic", "path": str(executable), "arguments": ["{file}"]}}
    write(lifecycle.config_path, config)
    return LibraryCatalogue(lifecycle.runtime, lifecycle.config_path), lifecycle, root


def test_catalogue_rejects_explicit_emulator_that_cannot_open_the_media_format(tmp_path):
    library, _, _ = fixture(tmp_path)
    config = read(library.config_path)
    config["emulators"]["fixture"]["supported_extensions"] = [".z80"]
    write(library.config_path, config)
    entry = library.service().search()["entries"][0]
    with pytest.raises(CatalogueError, match="unsupported-target"):
        resolve_plan(library, entry["catalogueId"])


def test_versions_refresh_does_not_hold_the_index_lock(tmp_path):
    import threading
    library, _, _ = fixture(tmp_path)
    service = library.service()
    entry = service.search()["entries"][0]
    def before_read():
        acquired = []
        def other_reader():
            locked = service._lock.acquire(timeout=0.1)
            acquired.append(locked)
            if locked:
                service._lock.release()
        worker = threading.Thread(target=other_reader)
        worker.start()
        worker.join(timeout=1)
        assert acquired == [True], 'Refreshing under the index lock can deadlock against the lifecycle lock'
    service._before_read = before_read
    assert service.versions(entry["catalogueId"])["versions"]


def test_unprepared_read_only_library_browses_and_resolves_both_editions_without_metadata_writes(tmp_path):
    library, lifecycle, root = fixture(tmp_path)
    before = (root / "collection-metadata.json").read_bytes()
    with library.read_snapshot():
        entries = library.service().search({"query": "Elite"})["entries"]
        assert len(entries) == 2
        assert {e["availability"] for e in entries} == {"available"}
        assert len({e["catalogueId"] for e in entries}) == 2
        for entry in entries:
            plan = resolve_plan(library, entry["catalogueId"], entry["entryRevision"])
            assert Path(plan["media"]).is_file() and len(plan["mediaSha256"]) == 64
    assert (root / "collection-metadata.json").read_bytes() == before
    assert not lifecycle.registry.path.exists() and not lifecycle.proofs_path.exists()
    assert not lifecycle.journal_path.exists()
    restarted = LibraryCatalogue(library.runtime, library.config_path)
    assert {e["catalogueId"] for e in restarted.service().search()["entries"]} == {e["catalogueId"] for e in entries}
    public = json.dumps(entries)
    assert str(root) not in public and ".tap" not in public and "fixture.exe" not in public


def test_search_never_opens_media_and_warm_search_reuses_metadata_index(tmp_path, monkeypatch):
    library, _, root = fixture(tmp_path)
    opened = []
    original = Path.open
    def watch(path, *args, **kwargs):
        opened.append(path)
        assert path.suffix != ".tap", "Search opened a media file"
        return original(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", watch)
    with library.read_snapshot():
        service = library.service()
        service.search()
    opened.clear()
    for query in ("el", "elite", "ELITE"):
        with library.read_snapshot():
            assert library.service() is service
            assert len(service.search({"query": query})["entries"]) == 2
            assert len(service.search({"query": query, "groupVersions": True})["entries"]) == 1
    assert root / "collection-metadata.json" not in opened


def test_metadata_changes_refresh_search_and_reject_old_selection(tmp_path):
    library, _, root = fixture(tmp_path)
    service = library.service()
    entry = service.search()["entries"][0]
    metadata = read(root / "collection-metadata.json")
    metadata["games"][0]["title"] = "Renamed game"
    write(root / "collection-metadata.json", metadata)
    assert service.search({"query": "Renamed"})["entries"][0]["title"] == "Renamed game"
    with library.read_snapshot():
        assert len(library.service().search({"query": "Renamed"})["entries"]) == 1
        with pytest.raises(CatalogueError, match="entry-changed"):
            resolve_plan(library, entry["catalogueId"], entry["entryRevision"])


def test_metadata_change_during_add_lease_is_rejected(tmp_path):
    library, _, root = fixture(tmp_path)
    with pytest.raises(CatalogueError, match="catalogue-changed"):
        with library.read_snapshot():
            entry = library.service().search()["entries"][0]
            resolve_plan(library, entry["catalogueId"], entry["entryRevision"])
            value = read(root / "collection-metadata.json")
            value["games"][0]["title"] = "Changed during Add"
            write(root / "collection-metadata.json", value)


def test_missing_media_and_missing_emulator_are_checked_only_when_adding(tmp_path):
    library, _, root = fixture(tmp_path)
    (root / "elite_48.tap").unlink()
    with library.read_snapshot():
        entries = library.service().search()["entries"]
        assert len(entries) == 2 and all(e["availability"] == "available" for e in entries)
        missing = next(e for e in entries if e["hardwareLabel"] == "48K")
        with pytest.raises(CatalogueError, match="media-missing"):
            resolve_plan(library, missing["catalogueId"], missing["entryRevision"])
    config = read(library.config_path)
    config["collections"][0]["default_emulator"] = "missing"
    write(library.config_path, config)
    with library.read_snapshot():
        entry = next(e for e in library.service().search()["entries"] if e["hardwareLabel"] == "128K")
        with pytest.raises(CatalogueError, match="configuration-required"):
            resolve_plan(library, entry["catalogueId"], entry["entryRevision"])


def test_prepared_ids_and_proofs_are_preserved(tmp_path):
    library, lifecycle, root = fixture(tmp_path)
    config = read(library.config_path)
    config["collections"][0]["writable"] = True
    write(library.config_path, config)
    lifecycle.prepare_source("spectrum", dry_run=False)
    original = lifecycle.service().search()["entries"]
    before = {p: p.read_bytes() for p in (lifecycle.registry.path, lifecycle.proofs_path)}
    with library.read_snapshot():
        entries = library.service().search()["entries"]
        assert {e["catalogueId"] for e in entries} == {e["catalogueId"] for e in original}
        for entry in entries:
            resolve_plan(library, entry["catalogueId"], entry["entryRevision"])
    assert all(p.read_bytes() == contents for p, contents in before.items())


def test_source_root_change_never_silently_retargets_an_identity(tmp_path):
    library, _, _ = fixture(tmp_path)
    entry = library.service().search()["entries"][0]
    config = read(library.config_path)
    config["collections"][0]["root"] = str(tmp_path / "missing")
    write(library.config_path, config)
    with pytest.raises(CatalogueError):
        resolve_plan(library, entry["catalogueId"])


def test_optional_later_preparation_retains_direct_browse_identities(tmp_path):
    library, lifecycle, _ = fixture(tmp_path)
    before = library.service().search()["entries"]
    config = read(library.config_path)
    config["collections"][0]["writable"] = True
    write(library.config_path, config)
    lifecycle.prepare_source("spectrum", dry_run=False)
    after = library.service().search()["entries"]
    assert {(e["sourceId"], e["catalogueId"]) for e in before} == {(e["sourceId"], e["catalogueId"]) for e in after}


def test_arcade_launcher_default_and_authoritative_system_are_used(tmp_path):
    library, _, root = fixture(tmp_path)
    config = read(library.config_path)
    config["collections"][0].pop("default_emulator")
    write(library.config_path, config)
    metadata = read(root / "collection-metadata.json")
    metadata["games"][0].update(system="16K", memory="48K")
    write(root / "collection-metadata.json", metadata)
    with library.read_snapshot():
        entries = library.service().search()["entries"]
        assert all(e["availability"] == "available" for e in entries)
        for entry in entries:
            plan = resolve_plan(library, entry["catalogueId"], entry["entryRevision"])
            assert plan["emulatorId"] == "fixture"
        assert {e["hardwareLabel"] for e in entries} == {"16K", "128K"}


def test_missing_prepared_proof_is_not_replaced_by_an_automatic_hash(tmp_path):
    library, lifecycle, _ = fixture(tmp_path)
    config = read(library.config_path)
    config["collections"][0]["writable"] = True
    write(library.config_path, config)
    lifecycle.prepare_source("spectrum", dry_run=False)
    lifecycle.proofs_path.unlink()
    with library.read_snapshot():
        entry = library.service().search()["entries"][0]
        with pytest.raises(CatalogueError, match="review-required"):
            resolve_plan(library, entry["catalogueId"], entry["entryRevision"])


def test_corrupt_library_key_is_not_silently_replaced(tmp_path):
    library, _, _ = fixture(tmp_path)
    library.service()
    library.key_path.write_text('{"schemaVersion":1,"key":"broken"}', encoding="utf-8")
    before = library.key_path.read_bytes()
    with pytest.raises(CatalogueError, match="review-required"):
        library.service()
    assert library.key_path.read_bytes() == before


def test_unchanged_source_projection_survives_other_collection_metadata_edit(tmp_path):
    library,_,root=fixture(tmp_path)
    other=tmp_path/'other';other.mkdir()
    write(other/'collection-metadata.json', read(root/'collection-metadata.json'))
    config=read(library.config_path)
    config['collections'].append({**config['collections'][0],'id':'other','root':str(other)})
    write(library.config_path,config)
    library.service().search()
    before={source.collection_id:source for source in library.service()._sources}
    metadata=read(root/'collection-metadata.json');metadata['games'][0]['title']='Updated title'
    write(root/'collection-metadata.json',metadata)
    library.service().search()
    after={source.collection_id:source for source in library.service()._sources}
    assert after['other'] is before['other']
    assert after[config['collections'][0]['id']] is not before[config['collections'][0]['id']]


def test_unknown_collection_adapter_never_falls_through_to_spectrum(tmp_path):
    library,_,root=fixture(tmp_path)
    config=read(library.config_path);config['collections'][0]['adapter']='future-console-v1'
    write(library.config_path,config)
    with pytest.raises(CatalogueError, match='review-required'):
        library._sources_for_library()
