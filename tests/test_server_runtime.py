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
    server.managed_profiles = lambda: [
        {"id": "automatic", "emulator_id": "eightyone", "priority": 1, "rule": {}},
        {"id": "hub-choice", "emulator_id": "eightyone", "priority": 99, "rule": {}},
    ]
    game = type("GameStub", (), {"emulator_profile": "", "system": "ZX Spectrum 48K", "tags": ()})()

    assert server.select_managed_profile("eightyone", game, "hub-choice")["id"] == "hub-choice"
    assert server.select_managed_profile("eightyone", game, "missing") is None
