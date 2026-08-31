from pathlib import Path
from types import SimpleNamespace

import arcade_core.launching as launching
from arcade_core.launching import (
    GameLaunchService,
    emulator_adapter,
    launch_visible,
    prepare_eightyone_profile,
    render_arguments,
    should_check_immediate_exit,
)


def test_argument_templates_render_game_and_collection_values(tmp_path):
    game_path = tmp_path / "Games" / "Jetpac.tzx"
    game = type("Game", (), {"title": "Jetpac", "system": "48K"})()

    arguments = render_arguments(
        ["--machine", "{system}", "--title={title}", "{file}"],
        game=game,
        file_path=game_path,
        collection_root=tmp_path,
    )

    assert arguments == ["--machine", "48K", "--title=Jetpac", str(game_path)]


class FakeProcess:
    def __init__(self, pid=42, returncode=None):
        self.pid = pid
        self.returncode = returncode

    def poll(self):
        return self.returncode


def make_service(tmp_path, *, running_hwnd=0, process=None, include_stub=True, profile_error=None):
    tmp_path.mkdir(parents=True, exist_ok=True)
    game_path = tmp_path / "Jetpac.tzx"
    game_path.write_bytes(b"game")
    emulator_path = tmp_path / "EightyOne.exe"
    emulator_path.write_bytes(b"emulator")
    stub_path = tmp_path / "SpecStub.exe"
    if include_stub:
        stub_path.write_bytes(b"stub")
    working_dir = tmp_path / "working"
    working_dir.mkdir()
    game = SimpleNamespace(path=str(game_path), emulator_profile="", system="ZX Spectrum 48K", tags=())
    emulators = {
        "eightyone": {
            "name": "EightyOne",
            "type": "eightyone",
            "path": str(emulator_path),
            "working_dir": str(working_dir),
        },
        "spectaculator": {
            "name": "Spectaculator",
            "type": "spectaculator",
            "path": str(emulator_path),
            "working_dir": str(working_dir),
        },
        "spectaculator_stub": {
            "name": "SpecStub",
            "type": "spectaculator_stub",
            "path": str(stub_path),
        },
        "default": {"name": "Windows Default App", "type": "default", "path": ""},
    }
    calls = []
    launched_process = process or FakeProcess()

    def prepare_profile(emulator, selected_game, profile_id):
        if profile_error:
            raise profile_error
        calls.append(("profile", emulator["type"], selected_game.path, profile_id))

    service = GameLaunchService(
        get_game=lambda game_id: game if game_id == "jetpac" else None,
        get_pok=lambda _pok_id: None,
        emulator_provider=lambda: emulators,
        expand_path=lambda value: Path(str(value)) if value else None,
        prepare_profile=prepare_profile,
        mark_recent=lambda game_id: calls.append(("recent", game_id)),
        launch_process=lambda command, cwd: calls.append(("launch", command, cwd)) or launched_process,
        open_default=lambda path: calls.append(("default", path)),
        find_running_window=lambda emulator_id: calls.append(("running", emulator_id)) or running_hwnd,
        focus_emulator=lambda emulator_id, child: calls.append(("focus", emulator_id, child.pid if child else None)),
        bring_to_front=lambda hwnd: calls.append(("front", hwnd)),
        sleep=lambda delay: calls.append(("sleep", delay)),
    )
    return service, calls, game_path, emulator_path, stub_path, working_dir


def test_eightyone_launch_prepares_profile_and_uses_argument_array(tmp_path):
    service, calls, game_path, emulator_path, _stub_path, working_dir = make_service(tmp_path)

    result = service.launch_game("jetpac", "eightyone", profile_id="spectrum-48k")

    assert result == {"ok": True, "pid": 42}
    assert ("profile", "eightyone", str(game_path), "spectrum-48k") in calls
    assert ("launch", [str(emulator_path), str(game_path)], working_dir) in calls
    assert ("recent", "jetpac") in calls
    assert ("sleep", 0.4) in calls
    assert ("focus", "eightyone", 42) in calls


def test_default_adapter_uses_the_windows_file_association(tmp_path):
    service, calls, game_path, *_ = make_service(tmp_path)

    result = service.launch_game("jetpac", "default")

    assert result == {"ok": True}
    assert ("default", str(game_path)) in calls
    assert ("recent", "jetpac") in calls
    assert not any(call[0] == "launch" for call in calls)


def test_running_eightyone_requests_a_new_instance_choice(tmp_path):
    service, calls, *_ = make_service(tmp_path, running_hwnd=99)

    result = service.launch_game("jetpac", "eightyone")

    assert result["needs_choice"] is True
    assert result["supports_current"] is False
    assert result["supports_new"] is True
    assert not any(call[0] == "launch" for call in calls)


def test_running_spectaculator_reuses_specstub(tmp_path):
    service, calls, game_path, _emulator_path, stub_path, _working_dir = make_service(tmp_path, running_hwnd=77)

    result = service.launch_game("jetpac", "spectaculator", launch_action="current")

    assert result == {"ok": True, "pid": 42, "reused": True}
    assert ("launch", [str(stub_path), str(game_path)], stub_path.parent) in calls
    assert ("recent", "jetpac") in calls
    assert ("focus", "spectaculator_stub", 42) in calls


def test_missing_specstub_requests_confirmation_and_restores_running_window(tmp_path):
    service, calls, *_ = make_service(tmp_path, running_hwnd=77, include_stub=False)

    result = service.launch_game("jetpac", "spectaculator", launch_action="current")

    assert result["needs_confirmation"] is True
    assert "SpecStub.exe is missing" in result["error"]
    assert ("front", 77) in calls


def test_immediate_emulator_exit_is_reported(tmp_path):
    service, calls, *_ = make_service(tmp_path, process=FakeProcess(returncode=3))

    result = service.launch_game("jetpac", "eightyone")

    assert result == {"ok": False, "error": "Emulator exited immediately with code 3"}
    assert not any(call[0] == "focus" for call in calls)


def test_force_new_bypasses_the_running_instance_prompt(tmp_path):
    service, calls, *_ = make_service(tmp_path, running_hwnd=99)

    result = service.launch_game("jetpac", "eightyone", force_new=True)

    assert result == {"ok": True, "pid": 42}
    assert any(call[0] == "launch" for call in calls)


def test_missing_emulator_and_profile_errors_are_actionable(tmp_path):
    missing_emulator_service, _calls, _game_path, emulator_path, *_ = make_service(tmp_path / "emulator")
    emulator_path.unlink()
    missing_emulator = missing_emulator_service.launch_game("jetpac", "eightyone")

    profile_service, _calls, *_ = make_service(
        tmp_path / "profile",
        profile_error=FileNotFoundError("Missing managed EightyOne profile: Spectrum 48K"),
    )
    missing_profile = profile_service.launch_game("jetpac", "eightyone", profile_id="spectrum-48k")

    assert "Missing emulator:" in missing_emulator["error"]
    assert missing_profile == {"ok": False, "error": "Missing managed EightyOne profile: Spectrum 48K"}


def test_adapter_capabilities_match_current_zx_behaviour():
    eightyone = emulator_adapter("eightyone")
    spectaculator = emulator_adapter("spectaculator")
    stub = emulator_adapter("spectaculator_stub")

    assert eightyone.supports_new is True
    assert eightyone.supports_current is False
    assert spectaculator.supports_new is True
    assert spectaculator.supports_current is True
    assert stub.supports_new is False
    assert stub.supports_current is True
    assert should_check_immediate_exit(Path("EightyOne.exe")) is True
    assert should_check_immediate_exit(Path("SpecStub.exe")) is False


def test_managed_eightyone_profile_is_copied_to_live_target(tmp_path):
    source = tmp_path / "managed" / "48k.ini"
    source.parent.mkdir()
    source.write_bytes(b"managed profile")
    target = tmp_path / "appdata" / "EightyOne.ini"
    emulator = {"type": "eightyone", "eightyone_config_target": str(target)}
    game = SimpleNamespace(emulator_profile="", system="ZX Spectrum 48K", tags=())

    prepare_eightyone_profile(
        emulator,
        game,
        "spectrum-48k",
        expand_path=lambda value: Path(str(value)) if value else None,
        select_profile=lambda emulator_id, selected_game, profile_id: {
            "id": profile_id,
            "name": "Spectrum 48K",
            "managed_path": str(source),
        },
    )

    assert target.read_bytes() == b"managed profile"


def test_visible_process_launch_uses_an_argument_array_without_a_shell(monkeypatch, tmp_path):
    calls = []
    expected = FakeProcess()
    monkeypatch.setattr(
        launching.subprocess,
        "Popen",
        lambda command, **options: calls.append((command, options)) or expected,
    )

    result = launch_visible(["EightyOne.exe", "Jetpac.tzx"], tmp_path)

    assert result is expected
    assert calls[0][0] == ["EightyOne.exe", "Jetpac.tzx"]
    assert calls[0][1]["cwd"] == str(tmp_path)
    assert calls[0][1]["close_fds"] is True
    assert calls[0][1]["shell"] is False
