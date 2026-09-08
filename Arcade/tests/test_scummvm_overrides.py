from copy import deepcopy
import json

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.game_versions import entry_family_id
from arcade_core.scummvm_overrides import ScummvmOverrides
from test_feature_parity import load_server, configure_fixture, post
from test_import_scummvm import fixture, write


@pytest.fixture
def setup(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    root, ini, config, exe = fixture(tmp_path)
    value = json.loads(server.CONFIG_FILE.read_text())
    collection = {"id": "scummvm", "name": "ScummVM", "root": str(root), "scummvm_config": str(ini),
                  "adapter": "scummvm-config-v1", "writable": False, "auto_metadata": False,
                  "default_emulator": "scummvm"}
    value["collections"].append(collection)
    value["emulators"]["scummvm"] = {"type": "scummvm", "name": "ScummVM", "path": str(exe), "arguments": []}
    server.CONFIG_FILE.write_text(json.dumps(value))
    server.activate_collection("scummvm")
    server.update_state(lambda state: state.update(active_collection_id="scummvm"))
    return server, collection, ini, config


def selected(server):
    return next(game for game in server.get_library().games if game.platform == "dos")


@pytest.mark.parametrize("artwork", ["https://cdn.thegamesdb.net/images/original/boxart/front/42-1.jpg",
                                    "scraper-artwork/screenscraper/123/42/box-2D/wor"])
def test_apply_persists_exact_edition_metadata_and_artwork_without_changing_registration(setup, artwork):
    server, collection, ini, _ = setup
    game = selected(server)
    before = ini.read_bytes()
    config_before = server.CONFIG_FILE.read_bytes()
    original = deepcopy(game)
    other = next(game for game in server.get_library().games if game.platform == "fm-towns")
    result = post(server, "/api/apply-scrape", {"game_id": game.id, "candidate": {
        "title": "The Secret of Monkey Island: Scraped", "publisher": "Fixture Publisher", "year": "1990-10-01",
        "genre": "Adventure", "description": "Scraped description", "scraper_source": "thegamesdb", "scraper_id": "42",
        "platform": "PC", "system": "128K", "language": "de", "path": "bad", "arguments": ["bad"]},
        "remote_assets": {"loading_screen": artwork}})
    assert result["ok"]
    server.LIBRARY = None  # A fresh library reads the durable override.
    updated = server.get_library().get_game(game.id)
    assert updated.title.endswith(": Scraped")
    assert updated.publisher == "Fixture Publisher" and updated.genre == "Adventure"
    assert updated.description == "Scraped description" and updated.year == "1990-10-01"
    assert updated.loading_screen == artwork
    assert (updated.platform, updated.system, updated.languages, updated.path, updated.file_name) == (
        original.platform, original.system, original.languages, original.path, original.file_name)
    assert server.get_library().get_game(other.id) == other
    assert ini.read_bytes() == before and server.CONFIG_FILE.read_bytes() == config_before
    assert not (server.COLLECTION / "collection-metadata.json").exists()
    assert not post(server, "/api/delete", {"game_id": game.id})["ok"]
    assert not post(server, "/api/rename", {"game_id": game.id, "name": "changed"})["ok"]


def test_catalogue_refresh_preserves_ids_defaults_and_generic_engine_family(setup):
    server, collection, ini, config = setup
    config["monkey-dos"]["engineid"] = "ags"
    config["monkey-dos"]["gameid"] = "ags"
    write(ini, config)
    game = selected(server)
    catalogue = server.get_catalogue_service()
    before = catalogue.search({"includeScummvm": True})
    old = next(entry for entry in catalogue._entries if entry.legacy_id == game.id)
    old_family = entry_family_id(old)
    defaults = server.get_library_catalogue().version_defaults
    defaults.save(old_family, old.base["catalogueId"], "fixture-game-key")
    saved = defaults.path.read_bytes()
    assert post(server, "/api/apply-scrape", {"game_id": game.id, "candidate": {
        "title": "Updated Scraped Title", "publisher": "Updated Publisher", "description": "Updated description"}})["ok"]
    server.activate_collection("desasteron")
    server.update_state(lambda state: state.update(active_collection_id="desasteron"))
    server.LIBRARY = None
    after = catalogue.search({"includeScummvm": True, "query": "Updated Scraped"})
    assert before["catalogueRevision"] != after["catalogueRevision"]
    assert len(after["entries"]) == 1
    entry = after["entries"][0]
    assert entry["catalogueId"] == old.base["catalogueId"]
    assert entry["entryRevision"] != old.base["entryRevision"]
    assert entry["publisher"] == "Updated Publisher"
    current = next(entry for entry in catalogue._entries if entry.legacy_id == game.id)
    assert entry_family_id(current) == old_family
    assert defaults.path.read_bytes() == saved
    assert current.target == old.target and current.detail["description"] == "Updated description"


def test_atomic_failure_and_corrupt_store_do_not_replace_saved_metadata(setup, monkeypatch):
    import arcade_core.persistence as persistence
    server, collection, _, _ = setup
    game = selected(server)
    assert post(server, "/api/apply-scrape", {"game_id": game.id, "candidate": {"publisher": "Saved"}})["ok"]
    store = ScummvmOverrides(server.DATA, collection)
    before = store.path.read_bytes()
    with monkeypatch.context() as patch:
        patch.setattr(persistence.os, "replace", lambda *_: (_ for _ in ()).throw(OSError("disk unavailable")))
        with pytest.raises(OSError):
            server.apply_scrape_metadata(game.id, {"publisher": "Lost"})
    assert store.path.read_bytes() == before
    assert not list(store.path.parent.glob("*.tmp"))
    store.path.write_text('{"schemaVersion":1,"games":[]}')
    with pytest.raises(CatalogueError):
        server.apply_scrape_metadata(game.id, {"publisher": "Overwrite"})
    assert store.path.read_text() == '{"schemaVersion":1,"games":[]}'


@pytest.mark.parametrize("url", ["file:///C:/secret.png", "../../secret.png", "http://cdn.thegamesdb.net/a.jpg",
                                "https://example.com/a.jpg", "https://user:secret@cdn.thegamesdb.net/a.jpg"])
def test_invalid_artwork_cannot_persist_or_change_metadata(setup, url):
    server, collection, _, _ = setup
    game = selected(server)
    with pytest.raises(ValueError):
        server.apply_scrape_metadata(game.id, {"publisher": "Invalid"}, remote_assets={"screenshot": url})
    assert not ScummvmOverrides(server.DATA, collection).path.exists()


def test_retargeted_registrations_and_other_sources_do_not_inherit_overrides(setup):
    server, collection, ini, config = setup
    game = selected(server)
    assert post(server, "/api/apply-scrape", {"game_id": game.id, "candidate": {"publisher": "Override"}})["ok"]
    config["monkey-dos"]["platform"] = "windows"
    write(ini, config)
    server.LIBRARY = None
    assert server.get_library().get_game(game.id).publisher != "Override"
    assert ScummvmOverrides(server.DATA, {**collection, "id": "another"}).load() == {}
