import importlib.util
import json
import sys
import time
from pathlib import Path


SERVICE_PATH = Path(__file__).resolve().parents[1] / "emugui_service.py"
APP_PATH = Path(__file__).resolve().parents[1] / "web" / "app.js"


def load_server():
    module_name = "emugui_feature_parity_service"
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def configure_fixture(server, tmp_path):
    collection = tmp_path / "Spectrum"
    data = tmp_path / "data"
    main = collection / "Games" / "J" / "Jetpac (1983)(Ultimate)(48K).tap"
    incoming = collection / "incoming" / "New Game (1985)(Maker)(48K).tap"
    trash = collection / "_Deleted" / "Old Game (1984)(Maker)(48K).tap"
    pok = collection / "POKs" / "J" / "Jetpac.pok"
    artwork = collection / "_assets" / "jetpac.png"
    for path, content in (
        (main, b"main"),
        (incoming, b"incoming"),
        (trash, b"trash"),
        (pok, b"NInfinite lives\nM 32768 0 0\n"),
        (artwork, b"\x89PNG\r\n\x1a\nsmall"),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    metadata = {
        "version": 1,
        "games": [{
            "id": "jetpac",
            "title": "Jetpac",
            "title_key": "jetpac",
            "sort_title": "Jetpac",
            "tosec_title": "Jetpac",
            "file": "Games/J/Jetpac (1983)(Ultimate)(48K).tap",
            "system": "48K",
            "memory": "48K",
            "format": ".tap",
            "type": "Official",
            "section": "Official",
            "status": "Main",
            "year": "1983",
            "publisher": "Ultimate",
            "screenshot": "_assets/jetpac.png",
            "poks": ["POKs/J/Jetpac.pok"],
        }],
        "poks": [{
            "id": "jetpac-pok",
            "title": "Jetpac",
            "title_key": "jetpac",
            "file": "POKs/J/Jetpac.pok",
            "system": "48K",
            "memory": "48K",
            "match_status": "matched",
        }],
    }
    (collection / "collection-metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    data.mkdir()
    config = {
        "collections": [{
            "id": "desasteron",
            "name": "Fixture Spectrum",
            "root": str(collection),
            "role": "library",
            "writable": True,
            "auto_metadata": True,
        }],
        "default_collection": "desasteron",
        "emulators": server.DEFAULT_EMULATORS,
        "emulator_profiles": [],
        "scrapers": server.DEFAULT_SCRAPERS,
    }
    (data / "config.json").write_text(json.dumps(config), encoding="utf-8")
    (data / "state.json").write_text(json.dumps({
        "active_collection_id": "desasteron", "favourites": [], "recent": [],
    }), encoding="utf-8")

    server.DATA = data
    server.STATE_FILE = data / "state.json"
    server.CONFIG_FILE = data / "config.json"
    server.LOG_FILE = data / "launcher.log"
    server.EMULATOR_PROFILE_DIR = data / "emulator-profiles"
    server.DEFAULT_COLLECTION_ROOT = collection
    server.DESASTERON_COLLECTION = collection
    server.COLLECTIONS_BASE = tmp_path
    server.COLLECTION = collection
    server.REPORTS = collection / "_reports"
    server.METADATA_FILE = collection / "collection-metadata.json"
    server.LIBRARY = None
    server.PROFILE_SERVICE = None
    server.EMULATOR_CONFIG_SERVICE = None
    server.JOB_SERVICE = server.BackgroundJobService()
    return collection


def post(server, route, data):
    return server.dispatch_emugui_api("POST", route, {}, data)


def games(server, view="all"):
    return server.dispatch_emugui_api("GET", "/api/games", {"view": view}, {})["games"]


def wait_for_job(server, job_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        job = server.dispatch_emugui_api("GET", "/api/job", {"id": job_id}, {})["job"]
        if job["status"] in {"done", "error"}:
            return job
        time.sleep(0.01)
    raise AssertionError("Background job did not finish")


def test_external_page_api_surface_is_implemented_by_native_dispatcher():
    app = APP_PATH.read_text(encoding="utf-8")
    server = SERVICE_PATH.read_text(encoding="utf-8")
    routes = {
        "/api/collections", "/api/games", "/api/emulators", "/api/emulator-profiles",
        "/api/recent", "/api/job", "/api/poks", "/api/scrapers", "/api/asset",
        "/api/select-collection", "/api/rebuild", "/api/emulators/delete",
        "/api/emulator-profiles/import", "/api/emulator-profiles/delete",
        "/api/emulator-profiles/update-source", "/api/emulator-profiles/update",
        "/api/pick-path", "/api/delete", "/api/favourite", "/api/import-incoming-bulk",
        "/api/restore-trash", "/api/purge-trash", "/api/launch", "/api/add-collection",
        "/api/open-explorer", "/api/import-incoming", "/api/scrape-preview",
        "/api/apply-scrape", "/api/update-metadata", "/api/metadata-preview",
        "/api/rename", "/api/open-pok", "/api/emulators", "/api/scrapers",
    }
    assert all(route == "/api/asset" or route in app for route in routes)
    assert all(route == "/api/asset" or route in server for route in routes)


def test_native_dispatcher_preserves_library_management_workflow(tmp_path):
    server = load_server()
    collection = configure_fixture(server, tmp_path)

    payload = server.dispatch_emugui_api("GET", "/api/collections", {}, {})
    assert payload["active"]["id"] == "desasteron"
    assert payload["active"]["writable"] is True
    assert payload["collections"][0]["incoming_count"] == 1
    assert payload["collections"][0]["trash_count"] == 1
    assert {game["view"] for game in games(server)} == {"collection", "incoming", "trash"}

    favourite = post(server, "/api/favourite", {"game_id": "jetpac", "favourite": True})
    assert favourite["ok"] is True
    assert favourite["game"]["favourite"] is True
    assert "jetpac" in json.loads(server.STATE_FILE.read_text(encoding="utf-8"))["favourites"]

    poks = server.dispatch_emugui_api("GET", "/api/poks", {"game_id": "jetpac"}, {})["poks"]
    assert poks[0]["id"] == "jetpac-pok"
    assert poks[0]["cheats"][0]["name"] == "Infinite lives"
    asset = server.read_emugui_asset("_assets/jetpac.png", 1024)
    assert asset["dataUrl"].startswith("data:image/png;base64,")

    preview = post(server, "/api/metadata-preview", {
        "game_ids": ["jetpac"], "changes": {"publisher": "Rare"}, "rename_files": False,
    })
    assert preview["ok"] is True
    assert preview["previews"][0]["current_filename"] == "Jetpac (1983)(Ultimate)(48K).tap"
    assert preview["previews"][0]["filename_changed"] is False
    updated = post(server, "/api/update-metadata", {
        "game_ids": ["jetpac"], "changes": {"publisher": "Rare"}, "rename_files": False,
    })
    assert updated["ok"] is True
    assert server.get_library().get_game("jetpac").publisher == "Rare"

    manual = post(server, "/api/scrape-preview", {"game_id": "jetpac", "provider": "manual"})
    assert manual["ok"] is True
    applied = post(server, "/api/apply-scrape", {
        "game_id": "jetpac",
        "candidate": {"title": "Jetpac", "description": "A fixture description"},
        "assets": {},
        "remote_assets": {},
    })
    assert applied["ok"] is True
    assert server.get_library().get_game("jetpac").description == "A fixture description"

    renamed = post(server, "/api/rename", {"game_id": "jetpac", "name": "Jetpac Deluxe.tap"})
    assert renamed["ok"] is True
    assert (collection / renamed["path"]).is_file()
    assert server.get_library().get_game("jetpac").file_name == "Jetpac Deluxe.tap"

    deleted = post(server, "/api/delete", {"game_id": "jetpac"})
    assert deleted["ok"] is True
    assert Path(deleted["path"]).is_file()
    deleted_game = next(game for game in games(server, "trash") if game["title"] == "Jetpac Deluxe")
    restored = post(server, "/api/restore-trash", {"game_ids": [deleted_game["id"]]})
    assert restored["ok"] is True
    assert Path(restored["restored"][0]["path"]).is_file()

    old_game = next(game for game in games(server, "trash") if game["title"] == "Old Game")
    old_path = Path(old_game["path"])
    purged = post(server, "/api/purge-trash", {"game_ids": [old_game["id"]]})
    assert purged["ok"] is True
    assert not old_path.exists()

    incoming_game = next(game for game in games(server, "incoming") if game["title"] == "New Game")
    incoming_path = Path(incoming_game["path"])
    imported = post(server, "/api/import-incoming", {"game_id": incoming_game["id"]})
    assert imported["ok"] is True
    assert not incoming_path.exists()
    assert Path(imported["path"]).is_file()

    rebuild = post(server, "/api/rebuild", {})
    assert wait_for_job(server, rebuild["job_id"])["status"] == "done"
    selected = post(server, "/api/select-collection", {"collection_id": "desasteron"})
    assert wait_for_job(server, selected["job_id"])["status"] == "done"


def test_native_dispatcher_preserves_emulator_and_profile_configuration(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    executable = tmp_path / "Fixture Emulator.exe"
    executable.write_bytes(b"fixture")
    source = tmp_path / "Spectrum 48K.ini"
    source.write_text("first", encoding="utf-8")

    saved = post(server, "/api/emulators", {
        "emulators": [{
            "id": "fixture-emu",
            "name": "Fixture Emulator",
            "type": "generic",
            "path": str(executable),
            "working_dir": str(tmp_path),
            "supported_extensions": [".tap", ".tzx"],
            "arguments": ["{file}"],
        }],
        "collection_id": "desasteron",
        "default_emulator": "fixture-emu",
    })
    assert saved["ok"] is True
    assert any(item["id"] == "fixture-emu" for item in saved["emulators"])
    assert saved["collections"]["active"]["default_emulator"] == "fixture-emu"

    imported = post(server, "/api/emulator-profiles/import", {
        "emulator_id": "fixture-emu",
        "source_path": str(source),
        "name": "Spectrum 48K",
        "priority": 50,
        "rule": {"systems": ["48K"], "tags": []},
    })
    assert imported["ok"] is True
    profile_id = imported["profile"]["id"]
    managed = Path(imported["profile"]["managed_path"])
    assert managed.read_text(encoding="utf-8") == "first"

    edited = post(server, "/api/emulator-profiles/update", {
        "profile_id": profile_id, "name": "Spectrum 48K default", "priority": 75,
        "rule": {"systems": ["48K"], "tags": ["48K"]},
    })
    assert edited["ok"] is True
    assert edited["profile"]["name"] == "Spectrum 48K default"
    source.write_text("second", encoding="utf-8")
    refreshed = post(server, "/api/emulator-profiles/update-source", {"profile_id": profile_id})
    assert refreshed["ok"] is True
    assert managed.read_text(encoding="utf-8") == "second"

    guarded = post(server, "/api/emulators/delete", {"emulator_id": "fixture-emu"})
    assert guarded["ok"] is False
    assert "profiles first" in guarded["error"]
    deleted_profile = post(server, "/api/emulator-profiles/delete", {"profile_id": profile_id})
    assert deleted_profile["ok"] is True
    deleted_emulator = post(server, "/api/emulators/delete", {"emulator_id": "fixture-emu"})
    assert deleted_emulator["ok"] is True
    assert not managed.exists()


def test_native_dispatcher_keeps_scraper_secrets_out_of_json(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    secrets = {}
    server.configure_native_secret_service(
        get_secret=lambda key: secrets.get(key, ""),
        set_secret=lambda key, value: secrets.__setitem__(key, value),
        delete_secret=lambda key: secrets.pop(key, None),
        status=lambda: {"available": True, "provider": "fixture"},
    )

    result = post(server, "/api/scrapers", {"scrapers": {
        "screenscraper": {
            "enabled": True,
            "username": "fixture-user",
            "password": "fixture-password",
            "system_id": "135",
        },
        "thegamesdb": {
            "enabled": True,
            "api_key": "fixture-api-key",
            "platform_id": "4913",
        },
    }})

    assert result["ok"] is True
    providers = {provider["id"]: provider for provider in result["providers"]}
    assert providers["screenscraper"]["configured"] is True
    assert providers["screenscraper"]["has_password"] is True
    assert providers["thegamesdb"]["configured"] is True
    assert providers["thegamesdb"]["has_api_key"] is True
    saved = server.CONFIG_FILE.read_text(encoding="utf-8")
    assert "fixture-password" not in saved
    assert "fixture-api-key" not in saved
    assert secrets["emugui.scraper.screenscraper.password"] == "fixture-password"
    assert secrets["emugui.scraper.thegamesdb.api_key"] == "fixture-api-key"


def test_native_dispatcher_keeps_writes_out_of_read_only_collections(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    config = json.loads(server.CONFIG_FILE.read_text(encoding="utf-8"))
    config["collections"][0]["writable"] = False
    server.CONFIG_FILE.write_text(json.dumps(config), encoding="utf-8")

    for route, data in (
        ("/api/rename", {"game_id": "jetpac", "name": "Nope.tap"}),
        ("/api/update-metadata", {"game_ids": ["jetpac"], "changes": {"publisher": "Nope"}}),
        ("/api/delete", {"game_id": "jetpac"}),
    ):
        result = post(server, route, data)
        assert result == {"ok": False, "error": "Selected collection is read-only"}
