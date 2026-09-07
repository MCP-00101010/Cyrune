"""ScummVM registrations stay exact, native, and independent of Spectrum."""

from copy import deepcopy
import configparser
import json
from pathlib import Path
import subprocess
import sys

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.import_manifest import review_manifest, validate_manifest
from arcade_core.import_scummvm import configured_target, launch_preflight, scummvm_manifest


def fixture(tmp_path):
    root = tmp_path / "library"
    dos = root / "LucasArts/Monkey Island/Floppy DOS"
    towns = root / "LucasArts/Monkey Island/FM Towns"
    dos.mkdir(parents=True)
    towns.mkdir(parents=True)
    (dos / "monkey.000").write_bytes(b"Synthetic; never run")
    (towns / "monkey.000").write_bytes(b"Other release; never run")
    config = configparser.ConfigParser(interpolation=None)
    config["scummvm"] = {"music_volume": "137", "savepath": str(tmp_path / "private saves"), "cloud_token": "private-value"}
    config["monkey-dos"] = {"path": str(dos), "description": "The Secret of Monkey Island (VGA/DOS/English)",
        "engineid": "scumm", "gameid": "monkey", "language": "en", "platform": "pc", "extra": "VGA", "subtitles": "true"}
    config["monkey-towns"] = {"path": str(towns), "description": "The Secret of Monkey Island (FM-TOWNS/German)",
        "engineid": "scumm", "gameid": "monkey", "language": "de", "platform": "fmtowns"}
    config["other-library"] = {"path": str(tmp_path / "unrelated"), "description": "Other library", "gameid": "other"}
    path = tmp_path / "scummvm.ini"
    write(path, config)
    exe = tmp_path / "scummvm.exe"
    exe.write_bytes(b"Synthetic launcher, never execute")
    return root, path, config, exe


def write(path, config):
    with path.open("w", encoding="utf-8") as stream:
        config.write(stream)


def test_discovery_preserves_variants_without_copying_settings_or_native_authority(tmp_path, monkeypatch):
    root, path, _, _ = fixture(tmp_path)
    before = path.read_bytes()
    original_open = Path.open
    def metadata_only(file, *args, **kwargs):
        assert file == path, "Discovery read media contents"
        return original_open(file, *args, **kwargs)
    monkeypatch.setattr(Path, "open", metadata_only)
    manifest = scummvm_manifest("scummvm", root, path)
    first, second = manifest["entries"]
    assert first["id"] != second["id"]
    assert first["metadata"]["title"] == second["metadata"]["title"] == "The Secret of Monkey Island"
    assert first["target"]["platform"] == "pc" and second["target"]["platform"] == "fmtowns"
    assert first["metadata"]["languages"] == ["en"] and second["metadata"]["languages"] == ["de"]
    assert first["metadata"]["editionLabel"] == "VGA/DOS/English"
    assert manifest["source"] == {"id": "scummvm", "adapter": "scummvm-config-v1", "platformId": "mixed"}
    serialized = json.dumps(manifest)
    assert all(private not in serialized for private in ("private-value", "savepath", "subtitles", str(tmp_path), ".exe"))
    assert validate_manifest(json.loads(serialized)) == manifest
    assert path.read_bytes() == before


def test_native_plan_names_exact_configured_target_and_preserves_its_settings(tmp_path):
    root, path, _, exe = fixture(tmp_path)
    before = path.read_bytes()
    targets = [e["target"] for e in scummvm_manifest("scummvm", root, path)["entries"]]
    plans = [launch_preflight(root, path, exe, target) for target in targets]
    assert {p["platformId"] for p in plans} == {"dos", "fm-towns"}
    for plan, target in zip(plans, targets, strict=True):
        assert plan["arguments"] == ["--no-console", "--config=" + str(path),
            "--path=" + str(root / target["directory"]), target["targetId"]]
        assert "--auto-detect" not in plan["arguments"] and "--add" not in plan["arguments"]
    assert path.read_bytes() == before


def test_target_identity_survives_title_and_settings_edits_but_not_retargeting_approval(tmp_path):
    root, path, config, exe = fixture(tmp_path)
    before = scummvm_manifest("scummvm", root, path)
    target = before["entries"][0]["target"]
    plan = launch_preflight(root, path, exe, target)
    config["monkey-dos"].update(description="Renamed presentation", subtitles="false")
    write(path, config)
    after = scummvm_manifest("scummvm", root, path)
    assert after["entries"][0]["id"] == before["entries"][0]["id"]
    assert launch_preflight(root, path, exe, target)["targetDigest"] == plan["targetDigest"]
    config["monkey-dos"]["path"] = config["monkey-towns"]["path"]
    write(path, config)
    with pytest.raises(CatalogueError, match="entry-changed"):
        launch_preflight(root, path, exe, target)
    rebound = scummvm_manifest("scummvm", root, path)["entries"][0]["target"]
    assert launch_preflight(root, path, exe, rebound)["targetDigest"] != plan["targetDigest"]


def test_missing_target_does_not_fall_back_to_same_engine_game_or_title(tmp_path):
    root, path, config, exe = fixture(tmp_path)
    target = scummvm_manifest("scummvm", root, path)["entries"][0]["target"]
    config.remove_section("monkey-dos")
    write(path, config)
    with pytest.raises(CatalogueError, match="entry-missing"):
        launch_preflight(root, path, exe, target)


def test_text_adventure_filename_selector_is_confined_and_required(tmp_path):
    root, path, config, exe = fixture(tmp_path)
    config["monkey-dos"].update(engineid="glk", gameid="zork", filename="story.z5")
    write(path, config)
    manifest = scummvm_manifest("scummvm", root, path)
    target = manifest["entries"][0]["target"]
    assert review_manifest(manifest, root)["entries"][0]["issues"] == [{"field": "target", "code": "file-missing"}]
    with pytest.raises(CatalogueError, match="media-missing"):
        launch_preflight(root, path, exe, target)
    (root / target["directory"] / "story.z5").write_bytes(b"Synthetic story")
    assert launch_preflight(root, path, exe, target)
    config["monkey-dos"]["filename"] = "../escape.z5"
    write(path, config)
    with pytest.raises(CatalogueError, match="review-required"):
        scummvm_manifest("scummvm", root, path)


def test_unspecified_platform_stays_unspecified_and_regional_english_is_normalized(tmp_path):
    root, path, config, exe = fixture(tmp_path)
    config["monkey-dos"].pop("platform")
    config["monkey-dos"]["language"] = "gb"
    write(path, config)
    entry = scummvm_manifest("scummvm", root, path)["entries"][0]
    assert entry["metadata"]["languages"] == ["en"]
    assert entry["target"]["language"] == "gb" and entry["target"]["platform"] == ""
    assert launch_preflight(root, path, exe, entry["target"])["platformId"] == "unknown"


@pytest.mark.parametrize("field,value", [("engineid", "--auto-detect"), ("gameid", "x/y"),
    ("platform", "new-platform"), ("language", "unsupported"), ("path", "relative/path"), ("filename", "C:/outside.z5")])
def test_invalid_registrations_are_not_silently_dropped_or_guessed(tmp_path, field, value):
    root, path, config, _ = fixture(tmp_path)
    config["monkey-dos"][field] = value
    write(path, config)
    with pytest.raises(CatalogueError):
        scummvm_manifest("scummvm", root, path)


@pytest.mark.parametrize("suffix", ["\n[monkey-dos]\npath=other\n", "\n[DEFAULT]\npath=other\n",
    "\n[extra]\npath=one\npath=two\n", "\n[MONKEY-DOS]\npath=other\n", "\x00"])
def test_ambiguous_ini_and_inherited_authority_are_rejected(tmp_path, suffix):
    root, path, _, _ = fixture(tmp_path)
    path.write_text(path.read_text(encoding="utf-8") + suffix, encoding="utf-8")
    with pytest.raises(CatalogueError, match="review-required"):
        scummvm_manifest("scummvm", root, path)


def test_in_source_symlink_escape_is_rejected_and_different_library_is_ignored(tmp_path):
    root, path, config, _ = fixture(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    try:
        (root / "link").symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Directory symlinks unavailable")
    assert len(scummvm_manifest("scummvm", root, path)["entries"]) == 2
    config["monkey-dos"]["path"] = str(root / "link")
    write(path, config)
    with pytest.raises(CatalogueError, match="review-required"):
        scummvm_manifest("scummvm", root, path)


def test_common_model_rejects_duplicate_target_and_extra_launch_authority(tmp_path):
    root, path, _, _ = fixture(tmp_path)
    manifest = scummvm_manifest("scummvm", root, path)
    manifest["entries"][1]["target"] = deepcopy(manifest["entries"][0]["target"])
    with pytest.raises(CatalogueError, match="review-required"):
        validate_manifest(manifest)
    manifest["entries"].pop()
    manifest["entries"][0]["target"]["arguments"] = ["--auto-detect"]
    with pytest.raises(CatalogueError, match="review-required"):
        validate_manifest(manifest)


def test_missing_directory_is_reviewable_but_cannot_produce_launch_plan(tmp_path):
    root, path, config, exe = fixture(tmp_path)
    config["monkey-dos"]["path"] = str(root / "missing")
    write(path, config)
    manifest = scummvm_manifest("scummvm", root, path)
    assert len(manifest["entries"]) == 2
    assert review_manifest(manifest, root)["entries"][0]["issues"]
    with pytest.raises(CatalogueError, match="media-missing"):
        configured_target(root, path, manifest["entries"][0]["target"])


def test_cli_reads_real_format_and_checks_launcher_without_executing_it(tmp_path):
    root, path, _, exe = fixture(tmp_path)
    tool = Path(__file__).resolve().parents[1] / "tools/inspect_import.py"
    result = subprocess.run([sys.executable, "-B", str(tool), "--scummvm-source", "scummvm", "--root", str(root),
        "--scummvm-config", str(path), "--check-launcher", str(exe)], capture_output=True, text=True, check=True)
    report = json.loads(result.stdout)
    assert report["entryCount"] == 2 and all(not e["issues"] for e in report["entries"])
    assert str(root) not in result.stdout and str(exe) not in result.stdout


def test_configuration_and_target_counts_are_bounded(tmp_path, monkeypatch):
    import arcade_core.import_scummvm as adapter
    root, path, _, _ = fixture(tmp_path)
    monkeypatch.setattr(adapter, "MAX_TARGETS", 1)
    with pytest.raises(CatalogueError, match="review-required"):
        scummvm_manifest("scummvm", root, path)
    monkeypatch.setattr(adapter, "MAX_TARGETS", 10_000)
    monkeypatch.setattr(adapter, "MAX_CONFIG_BYTES", 16)
    with pytest.raises(CatalogueError, match="review-required"):
        scummvm_manifest("scummvm", root, path)


def test_launch_preflight_rejects_missing_executable_and_scripts(tmp_path):
    root, path, _, _ = fixture(tmp_path)
    target = scummvm_manifest("scummvm", root, path)["entries"][0]["target"]
    script = tmp_path / "launch.cmd"
    script.write_text("Never execute", encoding="utf-8")
    for exe in (tmp_path / "missing.exe", script, tmp_path):
        with pytest.raises(CatalogueError, match="configuration-required"):
            launch_preflight(root, path, exe, target)


@pytest.mark.parametrize('platform,extra,expected', [
    ('', 'Steam', ('Steam',)), ('windows', 'Steam', ('Windows', 'Steam')),
    ('', 'steam release', ('Steam',)), ('', 'Steam/Demo', ('Steam',)),
    ('', '', ('Unspecified platform',)), ('', 'Steampunk', ('Unspecified platform',)),
    ('', 'Not Steam', ('Unspecified platform',)), ('pc', 'CD', ('DOS',)),
])
def test_steam_is_explicit_edition_presentation_and_never_changes_native_platform(platform, extra, expected):
    from arcade_core.import_scummvm import platform_presentation
    target = {'platform': platform, 'extra': extra}
    assert platform_presentation(target) == expected
    assert target == {'platform': platform, 'extra': extra}
