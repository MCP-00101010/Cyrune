from pathlib import Path

import pytest

from emugui_core.emulators import EmulatorConfigError, EmulatorConfigService, validate_emulator


def make_service(tmp_path):
    executable = tmp_path / "emu.exe"
    executable.write_text("emulator", encoding="utf-8")
    state = {
        "config": {
            "collections": [{"id": "library", "name": "Library", "root": str(tmp_path)}],
            "emulators": {},
        }
    }
    defaults = {
        "built-in": {
            "name": "Built In",
            "type": "generic",
            "path": str(executable),
            "working_dir": str(tmp_path),
            "arguments": ["{file}"],
        }
    }
    service = EmulatorConfigService(
        defaults=defaults,
        load_config=lambda: state["config"],
        save_config=lambda config: state.update(config=config),
        expand_path=lambda value: Path(str(value)) if value else None,
    )
    return service, state, executable


def test_custom_emulator_and_collection_default_are_validated_and_persisted(tmp_path):
    service, state, executable = make_service(tmp_path)

    service.save_many([{
        "id": "snes9x",
        "name": "Snes9x",
        "type": "generic",
        "path": str(executable),
        "working_dir": str(tmp_path),
        "supported_extensions": ".smc, sfc",
        "arguments": ["--fullscreen", "{file}"],
    }])
    service.set_collection_default("library", "snes9x")

    assert service.configured(False)["snes9x"]["supported_extensions"] == [".smc", ".sfc"]
    assert state["config"]["collections"][0]["default_emulator"] == "snes9x"

    service.delete("snes9x")
    assert "snes9x" not in service.configured(False)
    assert "default_emulator" not in state["config"]["collections"][0]


def test_emulator_templates_and_paths_reject_unsafe_or_missing_configuration(tmp_path):
    service, _state, _executable = make_service(tmp_path)

    with pytest.raises(EmulatorConfigError, match="unknown placeholder"):
        validate_emulator("bad", {"name": "Bad", "type": "generic", "arguments": ["{shell}"]})
    with pytest.raises(EmulatorConfigError, match=r"include \{file\}"):
        validate_emulator("bad", {"name": "Bad", "type": "generic", "arguments": ["--fullscreen"]})
    with pytest.raises(EmulatorConfigError, match="does not exist"):
        service.save_many([{
            "id": "missing", "name": "Missing", "type": "generic",
            "path": str(tmp_path / "missing.exe"), "arguments": ["{file}"],
        }])
    with pytest.raises(EmulatorConfigError, match="Built-in"):
        service.delete("built-in")


def test_custom_emulator_with_managed_profiles_cannot_be_deleted(tmp_path):
    service, state, executable = make_service(tmp_path)
    service.save_many([{
        "id": "custom", "name": "Custom", "type": "generic", "path": str(executable),
        "working_dir": str(tmp_path), "arguments": ["{file}"],
    }])
    state["config"]["emulator_profiles"] = [{"id": "custom-profile", "emulator_id": "custom"}]

    with pytest.raises(EmulatorConfigError, match="profiles first"):
        service.delete("custom")
