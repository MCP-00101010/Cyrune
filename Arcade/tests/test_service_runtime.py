import importlib.util
import json
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

SERVICE_PATH = Path(__file__).resolve().parents[1] / "arcade_service.py"


def load_server():
    module_name = "arcade_service_under_test"
    spec = importlib.util.spec_from_file_location(module_name, SERVICE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_import_does_not_index_the_game_library():
    server = load_server()

    assert server.LIBRARY is None


def test_explorer_uses_host_reveal_callback_and_propagates_failure(tmp_path):
    server = load_server()
    target = tmp_path / 'Adventure.tap'
    target.write_bytes(b'fixture')
    server.get_library = lambda: SimpleNamespace(get_game=lambda _: SimpleNamespace(path=str(target)))
    opened = []
    server.NATIVE_REVEAL_GAME = opened.append
    assert server.open_in_explorer('game') == {'ok': True}
    assert opened == [target]
    def fail(_):
        raise OSError('Windows could not select the game in Explorer')
    server.NATIVE_REVEAL_GAME = fail
    with pytest.raises(OSError, match='could not select'):
        server.open_in_explorer('game')


@pytest.mark.parametrize('directory', [False, True])
def test_open_in_explorer_handles_game_files_and_scummvm_folders(tmp_path, monkeypatch, directory):
    server = load_server()
    target = tmp_path / 'Software Library' / 'Adventure, édition'
    target.parent.mkdir()
    if directory:
        target.mkdir()
    else:
        target = target.with_suffix('.tap')
        target.write_bytes(b'fixture')
    server.get_library = lambda: SimpleNamespace(get_game=lambda game_id: SimpleNamespace(path=str(target)))
    opened = []
    monkeypatch.setattr(server, 'os', SimpleNamespace(name='nt'))
    monkeypatch.setattr(server.subprocess, 'Popen', lambda args: opened.append(args))
    assert server.open_in_explorer('game') == {'ok': True}
    assert opened == [['explorer.exe', str(target)] if directory else ['explorer.exe', '/select,', str(target)]]
    target.rmdir() if directory else target.unlink()
    assert server.open_in_explorer('game')['ok'] is False
    assert len(opened) == 1, 'A missing target must not open Explorer at its default location'


def test_native_service_has_no_http_server_lifecycle():
    source = SERVICE_PATH.read_text(encoding="utf-8")
    for retired in ("BaseHTTPRequestHandler", "ThreadingHTTPServer", "serve_forever", "--no-browser", "PORT = 8765"):
        assert retired not in source

    service = load_server()
    assert not hasattr(service, "Handler")
    assert not hasattr(service, "main")


def test_library_is_constructed_once_on_first_use():
    server = load_server()
    created = []

    class FakeLibrary:
        def __init__(self):
            created.append(self)

    server.Library = FakeLibrary

    first = server.get_library()
    second = server.get_library()

    assert first is second
    assert created == [first]


def test_explicit_profile_binding_overrides_automatic_profile_selection():
    server = load_server()
    server.get_profile_service().profiles = lambda: [
        {"id": "automatic", "emulator_id": "eightyone", "priority": 1, "rule": {}},
        {"id": "hub-choice", "emulator_id": "eightyone", "priority": 99, "rule": {}},
    ]
    game = type("GameStub", (), {"emulator_profile": "", "system": "ZX Spectrum 48K", "tags": ()})()

    assert server.select_managed_profile("eightyone", game, "hub-choice")["id"] == "hub-choice"
    assert server.select_managed_profile("eightyone", game, "missing") is None


def test_transport_neutral_api_routes_existing_read_operations():
    server = load_server()

    class FakeLibrary:
        def list_games(self, view):
            return [{"id": "jetpac", "view": view}]

    server.get_library = lambda: FakeLibrary()
    server.collections_payload = lambda: {"active": {"id": "spectrum"}, "collections": []}

    games = server.dispatch_arcade_api("GET", "/api/games", {"view": "all"}, {})
    collections = server.dispatch_arcade_api("GET", "/api/collections", {}, {})

    assert games == {"games": [{"id": "jetpac", "view": "all"}]}
    assert collections["active"]["id"] == "spectrum"


def test_transport_neutral_api_rejects_unknown_operations():
    server = load_server()
    try:
        server.dispatch_arcade_api("POST", "/api/arbitrary-command", {}, {})
    except server.ServiceContractError as error:
        assert "Unsupported" in str(error)
    else:
        raise AssertionError("Unknown API operation was accepted")


def test_native_asset_reader_is_bounded_to_supported_collection_images(tmp_path):
    server = load_server()
    server.COLLECTION = tmp_path
    image = tmp_path / "_assets" / "cover.png"
    image.parent.mkdir()
    image.write_bytes(b"\x89PNG\r\n\x1a\nsmall")
    outside = tmp_path.parent / "outside.png"
    outside.write_bytes(b"\x89PNG\r\n\x1a\nprivate")

    result = server.read_arcade_asset("_assets/cover.png", 1024)

    assert result["dataUrl"].startswith("data:image/png;base64,")
    try:
        server.read_arcade_asset("../outside.png", 1024)
    except server.ServiceContractError as error:
        assert "escapes" in str(error)
    else:
        raise AssertionError("Out-of-collection asset was accepted")


def test_collection_metadata_paths_cannot_escape_the_collection(tmp_path):
    server = load_server()
    collection = tmp_path / "collection"
    collection.mkdir()
    outside_game = tmp_path / "outside.tap"
    outside_pok = tmp_path / "outside.pok"
    outside_game.write_bytes(b"game")
    outside_pok.write_bytes(b"NInfinite lives\n")
    server.COLLECTION = collection
    server.METADATA_FILE = collection / "collection-metadata.json"
    server.load_metadata = lambda: {
        "games": [{"id": "outside", "file": "../outside.tap", "title": "Outside"}],
        "poks": [{"id": "outside-pok", "file": "../outside.pok", "title_key": "outside", "memory": "48K"}],
    }

    assert server.load_metadata_games({}, set()) == []
    assert server.load_metadata_poks() == {}
    assert server.observed_import_directory("O", server.load_metadata()) is None


def test_file_transport_preserves_launch_choices_and_profile_routes():
    server = load_server()
    calls = []
    server.launch_game = lambda game_id, emulator, launch_action, force_new, profile_id: calls.append(
        ("launch", game_id, emulator, launch_action, force_new, profile_id)
    ) or {"ok": False, "needs_choice": True, "supports_new": True}
    server.import_emulator_profile = lambda data: calls.append(("import", data)) or {"ok": True, "profile": {"id": "48k"}}
    server.update_emulator_profile = lambda data: calls.append(("update", data)) or {"ok": True}
    server.delete_emulator_profile = lambda profile_id: calls.append(("delete", profile_id)) or {"ok": True}
    server.update_emulator_profile_from_source = lambda profile_id: calls.append(("source", profile_id)) or {"ok": True}

    launch = server.dispatch_arcade_api("POST", "/api/launch", {}, {
        "game_id": "jetpac", "emulator": "eightyone", "launch_action": "new", "force_new": True,
        "profile_id": "spectrum-48k",
    })
    imported = server.dispatch_arcade_api("POST", "/api/emulator-profiles/import", {}, {"name": "48K"})
    server.dispatch_arcade_api("POST", "/api/emulator-profiles/update", {}, {"profile_id": "48k"})
    server.dispatch_arcade_api("POST", "/api/emulator-profiles/delete", {}, {"profile_id": "48k"})
    server.dispatch_arcade_api("POST", "/api/emulator-profiles/update-source", {}, {"profile_id": "48k"})

    assert launch["needs_choice"] is True
    assert imported["profile"]["id"] == "48k"
    assert calls == [
        ("launch", "jetpac", "eightyone", "new", True, "spectrum-48k"),
        ("import", {"name": "48K"}),
        ("update", {"profile_id": "48k"}),
        ("delete", "48k"),
        ("source", "48k"),
    ]


def test_service_launch_function_remains_a_compatibility_facade():
    server = load_server()
    server.active_collection = lambda: {"id": "spectrum", "adapter": "spectrum-managed-v1"}
    calls = []

    class FakeLaunchService:
        def launch_game(self, game_id, emulator_id, launch_action, force_new, profile_id):
            calls.append((game_id, emulator_id, launch_action, force_new, profile_id))
            return {"ok": True, "pid": 42}

    server.get_launch_service = lambda: FakeLaunchService()

    result = server.launch_game("jetpac", "eightyone", "new", True, "spectrum-48k")

    assert result == {"ok": True, "pid": 42}
    assert calls == [("jetpac", "eightyone", "new", True, "spectrum-48k")]


def test_state_updates_do_not_lose_concurrent_favourites(tmp_path):
    server = load_server()
    server.DATA = tmp_path
    server.STATE_FILE = tmp_path / "state.json"

    threads = [threading.Thread(target=server.set_favourite, args=(f"game-{index}", True)) for index in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert set(server.load_state()["favourites"]) == {f"game-{index}" for index in range(20)}


def test_persisted_root_and_collection_shapes_are_validated(tmp_path):
    server = load_server()
    server.DATA = tmp_path
    server.STATE_FILE = tmp_path / "state.json"
    server.CONFIG_FILE = tmp_path / "config.json"
    server.METADATA_FILE = tmp_path / "collection-metadata.json"
    server.discover_collections = lambda: []
    server.STATE_FILE.write_text("[]", encoding="utf-8")
    server.CONFIG_FILE.write_text(json.dumps({
        "collections": ["wrong"],
        "emulators": {"broken": []},
        "emulator_profiles": ["wrong"],
        "scrapers": {"broken": []},
    }), encoding="utf-8")
    server.METADATA_FILE.write_text(json.dumps({"games": {}, "poks": "wrong"}), encoding="utf-8")

    assert server.load_state() == {"favourites": [], "recent": []}
    assert server.load_config()["collections"] == []
    assert server.load_config()["emulators"] == {}
    assert server.load_config()["emulator_profiles"] == []
    assert server.load_config()["scrapers"] == {}
    assert server.load_metadata()["games"] == []
    assert server.load_metadata()["poks"] == []


def test_scraper_base_urls_require_clean_https_endpoints():
    server = load_server()

    assert server.normalize_scraper_base_url("https://API.Example.test/v1/", "https://fallback.test") == (
        "https://api.example.test/v1"
    )
    for unsafe in (
        "http://api.example.test/v1",
        "file:///private/data",
        "https://user:secret@example.test/v1",
        "https://api.example.test/v1?token=secret",
        "https://api.example.test/v1#fragment",
        "https://api.example.test/bad path",
        "https://api.example.test\\@evil.test/v1",
    ):
        try:
            server.normalize_scraper_base_url(unsafe, "https://fallback.test")
        except ValueError:
            pass
        else:
            raise AssertionError(f"Unsafe scraper endpoint was accepted: {unsafe}")

    server.load_config = lambda: (_ for _ in ()).throw(AssertionError("validation happened too late"))
    rejected = server.update_scraper_config({
        "screenscraper": {"base_url": "http://api.example.test", "password": "secret"},
    })
    assert rejected == {"ok": False, "error": "Scraper base URL must use HTTPS"}


def test_failed_collection_switch_restores_previous_collection():
    server = load_server()
    state = {"active_collection_id": "old"}
    activations = []

    server.load_config = lambda: {
        "collections": [
            {"id": "old", "name": "Old"},
            {"id": "new", "name": "New"},
        ]
    }
    server.load_active_collection_id = lambda: state["active_collection_id"]
    server.activate_collection = lambda collection_id: activations.append(collection_id) or {
        "id": collection_id,
        "name": collection_id.title(),
    }

    def update_state(mutator):
        mutator(state)
        return state

    class Library:
        attempts = 0

        def rebuild(self, _progress=None):
            self.attempts += 1
            if self.attempts == 1:
                raise OSError("unreadable collection")

    library = Library()
    server.update_state = update_state
    server.get_library = lambda: library
    captured = {}

    def run_now(_title, work):
        try:
            work(lambda *_args: None)
        except Exception as exc:
            captured["error"] = str(exc)
        return "job"

    server.start_index_job = run_now

    assert server.start_select_collection_job("new") == "job"
    assert captured["error"] == "unreadable collection"
    assert activations == ["new", "old"]
    assert state["active_collection_id"] == "old"
    assert library.attempts == 2


def test_collection_jobs_are_serialized():
    server = load_server()
    server.JOB_SERVICE = server.BackgroundJobService()
    active = 0
    maximum = 0
    guard = threading.Lock()

    class Library:
        def rebuild(self, _progress=None):
            nonlocal active, maximum
            with guard:
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.03)
            with guard:
                active -= 1

    server.get_library = lambda: Library()
    first = server.start_rebuild_job()
    second = server.start_rebuild_job()
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        states = {server.get_job(first)["status"], server.get_job(second)["status"]}
        if states == {"done"}:
            break
        time.sleep(0.01)

    assert server.get_job(first)["status"] == "done"
    assert server.get_job(second)["status"] == "done"
    assert maximum == 1
