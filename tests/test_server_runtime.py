import importlib.util
import sys
from pathlib import Path


SERVER_PATH = Path(__file__).resolve().parents[1] / "server.py"


def load_server():
    module_name = "emugui_server_under_test"
    spec = importlib.util.spec_from_file_location(module_name, SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_import_does_not_index_the_game_library():
    server = load_server()

    assert server.LIBRARY is None


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

    games = server.dispatch_emugui_api("GET", "/api/games", {"view": "all"}, {})
    collections = server.dispatch_emugui_api("GET", "/api/collections", {}, {})

    assert games == {"games": [{"id": "jetpac", "view": "all"}]}
    assert collections["active"]["id"] == "spectrum"


def test_transport_neutral_api_rejects_unknown_operations():
    server = load_server()
    try:
        server.dispatch_emugui_api("POST", "/api/arbitrary-command", {}, {})
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

    result = server.read_emugui_asset("_assets/cover.png", 1024)

    assert result["dataUrl"].startswith("data:image/png;base64,")
    try:
        server.read_emugui_asset("../outside.png", 1024)
    except server.ServiceContractError as error:
        assert "escapes" in str(error)
    else:
        raise AssertionError("Out-of-collection asset was accepted")


def test_file_transport_preserves_launch_choices_and_profile_routes():
    server = load_server()
    calls = []
    server.launch_game = lambda game_id, emulator, launch_action, force_new: calls.append(
        ("launch", game_id, emulator, launch_action, force_new)
    ) or {"ok": False, "needs_choice": True, "supports_new": True}
    server.import_emulator_profile = lambda data: calls.append(("import", data)) or {"ok": True, "profile": {"id": "48k"}}
    server.update_emulator_profile = lambda data: calls.append(("update", data)) or {"ok": True}
    server.delete_emulator_profile = lambda profile_id: calls.append(("delete", profile_id)) or {"ok": True}
    server.update_emulator_profile_from_source = lambda profile_id: calls.append(("source", profile_id)) or {"ok": True}

    launch = server.dispatch_emugui_api("POST", "/api/launch", {}, {
        "game_id": "jetpac", "emulator": "eightyone", "launch_action": "new", "force_new": True,
    })
    imported = server.dispatch_emugui_api("POST", "/api/emulator-profiles/import", {}, {"name": "48K"})
    server.dispatch_emugui_api("POST", "/api/emulator-profiles/update", {}, {"profile_id": "48k"})
    server.dispatch_emugui_api("POST", "/api/emulator-profiles/delete", {}, {"profile_id": "48k"})
    server.dispatch_emugui_api("POST", "/api/emulator-profiles/update-source", {}, {"profile_id": "48k"})

    assert launch["needs_choice"] is True
    assert imported["profile"]["id"] == "48k"
    assert calls == [
        ("launch", "jetpac", "eightyone", "new", True),
        ("import", {"name": "48K"}),
        ("update", {"profile_id": "48k"}),
        ("delete", "48k"),
        ("source", "48k"),
    ]
