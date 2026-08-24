from pathlib import Path

from emugui_core.profiles import EmulatorProfileService


def profile_service(tmp_path: Path):
    state = {
        "config": {"emulator_profiles": []},
        "saved": 0,
    }

    def load_config():
        return state["config"]

    def save_config(config):
        state["config"] = config
        state["saved"] += 1

    service = EmulatorProfileService(
        load_config=load_config,
        save_config=save_config,
        emulator_provider=lambda: {"eightyone": {"type": "eightyone"}},
        expand_path=lambda value: Path(str(value)) if value else None,
        profile_dir=tmp_path / "managed",
        clean_text=lambda value: str(value or "").strip()[:120],
        clean_id=lambda value: "-".join(part for part in "".join(
            character.lower() if character.isalnum() else " " for character in value
        ).split()),
    )
    return service, state


def test_profile_lifecycle_is_transport_independent_and_confined(tmp_path):
    service, state = profile_service(tmp_path)
    source = tmp_path / "Spectrum 48K.ini"
    source.write_text("first", encoding="utf-8")

    imported = service.import_profile({
        "emulator_id": "eightyone",
        "source_path": str(source),
        "name": "Spectrum 48K",
        "priority": 25,
        "rule": {"systems": ["zx spectrum 48k", "ZX SPECTRUM 48K"], "tags": ["48K", "48K"]},
    })

    assert imported["ok"] is True
    profile = imported["profile"]
    managed = Path(profile["managed_path"])
    assert managed.read_text(encoding="utf-8") == "first"
    assert profile["rule"] == {"systems": ["ZX SPECTRUM 48K"], "tags": ["48K"]}
    assert imported["profiles"][0]["source_exists"] is True
    assert imported["profiles"][0]["managed_exists"] is True

    updated = service.update_profile({
        "profile_id": profile["id"],
        "name": "48K default",
        "priority": 20000,
        "rule": {"systems": [], "tags": []},
    })
    assert updated["profile"]["priority"] == 9999
    assert updated["profile"]["name"] == "48K default"

    source.write_text("second", encoding="utf-8")
    refreshed = service.update_from_source(profile["id"])
    assert refreshed["ok"] is True
    assert managed.read_text(encoding="utf-8") == "second"

    deleted = service.delete_profile(profile["id"])
    assert deleted == {"ok": True, "profiles": []}
    assert managed.exists() is False
    assert state["saved"] == 4


def test_profile_selection_preserves_explicit_pinned_rule_and_fallback_order(tmp_path):
    service, state = profile_service(tmp_path)
    state["config"]["emulator_profiles"] = [
        {"id": "fallback", "emulator_id": "eightyone", "priority": 1, "rule": {}},
        {"id": "tagged", "emulator_id": "eightyone", "priority": 5, "rule": {"tags": ["128K"]}},
        {"id": "system", "emulator_id": "eightyone", "priority": 10, "rule": {"systems": ["ZX SPECTRUM 48K"]}},
    ]
    game = type("Game", (), {
        "emulator_profile": "",
        "system": "ZX SPECTRUM 48K",
        "tags": ("Arcade",),
    })()

    assert service.select("eightyone", game, "tagged")["id"] == "tagged"
    assert service.select("eightyone", game)["id"] == "system"
    game.system = "ZX SPECTRUM 128K"
    game.tags = ("128K",)
    assert service.select("eightyone", game)["id"] == "tagged"
    game.tags = ()
    assert service.select("eightyone", game)["id"] == "fallback"
    game.emulator_profile = "system"
    assert service.select("eightyone", game)["id"] == "system"
    assert service.select("eightyone", game, "missing") is None
