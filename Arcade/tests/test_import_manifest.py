"""Native import contracts and the running Spectrum adapter's compatibility."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.import_manifest import read_manifest, review_manifest, validate_manifest
from arcade_core.import_spectrum import spectrum_manifest
from test_catalogue import prepared, row, write_metadata


def fixture(tmp_path):
    rows = [row(poks=["POKs/Elite.pok"], loading_screen="art/elite.png", version="v1", hardware=["AY"],
                scraper_source="ScreenScraper", scraper_id="42"),
            row("elite_128", system="128K", memory="128K"),
            row("combined", system="48K-128K", memory="48K-128K"),
            row("translation", languages=["de"], countries=["DE"])]
    root, registry, source, service = prepared(tmp_path, rows)
    (root / "POKs").mkdir()
    (root / "POKs/Elite.pok").write_text("existing POK", encoding="utf-8")
    (root / "art").mkdir()
    (root / "art/elite.png").write_bytes(b"Reference only, not decoded")
    return root, registry, source, service


def test_spectrum_manifest_matches_running_catalogue_and_preserves_native_state(tmp_path):
    root, registry, source, service = fixture(tmp_path)
    files = [p for p in tmp_path.rglob("*") if p.is_file()]
    before = {p: p.read_bytes() for p in files}
    identities = service.search()["entries"]
    manifest = spectrum_manifest("spectrum", root)
    assert len(manifest["entries"]) == 4
    assert [e["metadata"]["hardwareLabel"] for e in manifest["entries"]] == ["48K", "128K", "48K-128K", "48K"]
    assert manifest["entries"][0]["supportFiles"] == [{"role": "pok", "kind": "local-file", "path": "POKs/Elite.pok"}]
    assert manifest["entries"][0]["provenance"][-1] == {"provider": "ScreenScraper", "recordId": "42"}
    for imported, indexed in zip(manifest["entries"], source.snapshot(), strict=True):
        assert imported["id"] == indexed.legacy_id
        assert imported["target"]["path"] == indexed.relative_path
        assert imported["metadata"] == {key: {**indexed.base, **indexed.detail}[key] for key in imported["metadata"]}
    assert service.search()["entries"] == identities
    assert all(p.read_bytes() == contents for p, contents in before.items())
    assert set(p for p in tmp_path.rglob("*") if p.is_file()) == set(files)
    serialized = json.dumps(manifest)
    assert str(root) not in serialized
    assert "native_emulator_secret" not in serialized and "private_profile_id" not in serialized
    assert "catalogueId" not in serialized and "gameKey" not in serialized
    assert validate_manifest(json.loads(serialized)) == manifest


def test_legacy_alias_keeps_original_separators_and_main_filter(tmp_path):
    original = "games\\No ID.tap"
    rows = [row("", file=original), row("trash", status="Trash"), row("incoming", status="Incoming")]
    root, *_ = prepared(tmp_path, rows)
    entry, = spectrum_manifest("spectrum", root)["entries"]
    assert entry["id"] == hashlib.sha1(original.lower().encode()).hexdigest()[:16]
    assert entry["target"]["path"] == "games/No ID.tap"
    rows[0].update(id="retained-id", file="renamed.tap", system="16K", memory="48K")
    write_metadata(root, rows)
    entry, = spectrum_manifest("spectrum", root)["entries"]
    assert entry["id"] == "retained-id" and entry["metadata"]["hardwareLabel"] == "16K"


def test_full_size_discovery_preserves_all_entries_without_media_access(tmp_path, monkeypatch):
    rows = [row(f"game_{i}", system="128K" if i % 2 else "48K", memory="") for i in range(12_933)]
    metadata = write_metadata(tmp_path, rows)
    original_open = Path.open
    def metadata_only(path, *args, **kwargs):
        assert path == metadata, "Discovery accessed something other than managed metadata"
        return original_open(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", metadata_only)
    manifest = spectrum_manifest("spectrum", tmp_path)
    assert [entry["id"] for entry in manifest["entries"]] == [r["id"] for r in rows]
    assert len({entry["target"]["path"] for entry in manifest["entries"]}) == 12_933


def test_review_checks_exact_references_without_opening_media_or_issuing_approval(tmp_path, monkeypatch):
    root, *_ = fixture(tmp_path)
    manifest = spectrum_manifest("spectrum", root)
    original_open = Path.open
    def refuse_media(path, *args, **kwargs):
        assert path.suffix not in {".tap", ".png", ".pok"}, "Review opened media contents"
        return original_open(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", refuse_media)
    report = review_manifest(manifest, root)
    assert report["entryCount"] == 4 and all(not e["issues"] for e in report["entries"])
    assert "approval" not in report and "gameKey" not in report
    (root / "elite_48.tap").unlink()
    (root / "POKs/Elite.pok").unlink()
    (root / "art/elite.png").unlink()
    later = review_manifest(manifest, root)
    assert later["manifestDigest"] == report["manifestDigest"]  # Digest is not a filesystem lease.
    assert later["entries"][0]["issues"] == [
        {"field": field, "code": "file-missing"} for field in ("target", "artwork", "supportFiles")]
    assert all(not e["issues"] for e in later["entries"][1:])


@pytest.mark.parametrize("target", ["../escape.tap", "C:/secret.tap", "C:secret.tap", "//server/share/file.tap",
    "game.tap:stream", "folder/NUL.tap", "folder/file.tap.", "folder/file?.tap", "folder/\u0000file.tap"])
def test_native_import_rejects_path_authority_and_windows_aliases(tmp_path, target):
    root, *_ = fixture(tmp_path)
    manifest = spectrum_manifest("spectrum", root)
    for location in ("target", "artwork", "supportFiles"):
        invalid = deepcopy(manifest)
        ref = invalid["entries"][0][location]
        (ref if location == "target" else ref[0])["path"] = target
        with pytest.raises(CatalogueError):
            validate_manifest(invalid)


@pytest.mark.parametrize("mutation,code", [
    (lambda m: m.update(schemaVersion=2), "unsupported-protocol"),
    (lambda m: m.update(schemaVersion=True), "unsupported-protocol"),
    (lambda m: m["source"].update(adapter="scummvm-config-v1"), "unsupported-target"),
    (lambda m: m["source"].update(platformId="atari-st"), "unsupported-target"),
    (lambda m: m["source"].update(root="C:/games"), "review-required"),
    (lambda m: m["entries"][0].update(gameKey="approved"), "review-required"),
    (lambda m: m["entries"][0]["target"].update(arguments=["{file}"]), "review-required"),
    (lambda m: m["entries"][0]["target"].update(kind="scummvm-game"), "unsupported-target"),
    (lambda m: m["entries"][0]["target"].update(path="game.exe"), "unsupported-target"),
    (lambda m: m["entries"][0]["metadata"].update(executable="run.exe"), "review-required"),
    (lambda m: m["entries"].append(deepcopy(m["entries"][0])), "review-required"),
    (lambda m: m["entries"][1]["target"].update(path="ELITE_48.TAP"), "review-required"),
])
def test_invalid_or_future_drafts_cannot_gain_authority(tmp_path, mutation, code):
    root, *_ = fixture(tmp_path)
    manifest = spectrum_manifest("spectrum", root)
    mutation(manifest)
    with pytest.raises(CatalogueError, match=code):
        validate_manifest(manifest)


def test_file_reader_rejects_duplicate_keys_and_oversized_input(tmp_path, monkeypatch):
    import arcade_core.import_manifest as model
    path = tmp_path / "draft.json"
    path.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding="utf-8")
    with pytest.raises(CatalogueError, match="review-required"):
        read_manifest(path)
    monkeypatch.setattr(model, "MAX_MANIFEST_BYTES", 16)
    path.write_text('{"schemaVersion":1}', encoding="utf-8")
    with pytest.raises(CatalogueError, match="review-required"):
        read_manifest(path)


def test_remote_artwork_is_preserved_as_unfetched_provenance(tmp_path, monkeypatch):
    import socket
    root, *_ = fixture(tmp_path)
    metadata = json.loads((root / "collection-metadata.json").read_text(encoding="utf-8"))
    metadata["games"][0]["loading_screen"] = "https://example.com/elite.png"
    write_metadata(root, metadata["games"])
    monkeypatch.setattr(socket, "socket", lambda *a, **kw: pytest.fail("Import attempted network access"))
    manifest = spectrum_manifest("spectrum", root)
    assert manifest["entries"][0]["artwork"] == [
        {"role": "loading-screen", "kind": "remote-image", "url": "https://example.com/elite.png"}]
    assert review_manifest(manifest, root)["entries"][0]["issues"] == [
        {"field": "artwork", "code": "remote-artwork-unchecked"}]


@pytest.mark.parametrize("url", ["http://example.com/image.png", "https://user:secret@example.com/image.png",
    "https://example.com/image.png?secret=token", "https://example.com/image.png#secret", "https://example.com:bad/a",
    "https://example.com\\@localhost/a"])
def test_remote_artwork_does_not_admit_credentials_or_ambiguous_urls(tmp_path, url):
    root, *_ = fixture(tmp_path)
    manifest = spectrum_manifest("spectrum", root)
    manifest["entries"][0]["artwork"] = [{"role": "screenshot", "kind": "remote-image", "url": url}]
    with pytest.raises(CatalogueError, match="review-required"):
        validate_manifest(manifest)


def test_review_rejects_symlink_escape_for_every_reference_kind(tmp_path):
    root, *_ = fixture(tmp_path)
    manifest = spectrum_manifest("spectrum", root)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "game.tap").write_bytes(b"external")
    try:
        (root / "linked").symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Directory symlinks unavailable")
    for field in ("target", "artwork", "supportFiles"):
        draft = deepcopy(manifest)
        ref = draft["entries"][0][field]
        (ref if field == "target" else ref[0])["path"] = "linked/game.tap"
        assert {"field": field, "code": "review-required"} in review_manifest(draft, root)["entries"][0]["issues"]


def test_cli_discovery_and_review_round_trip_never_create_collection_files(tmp_path):
    root, *_ = fixture(tmp_path)
    tool = Path(__file__).resolve().parents[1] / "tools/inspect_import.py"
    before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    command = [sys.executable, "-B", str(tool), "--spectrum-source", "spectrum", "--root", str(root)]
    emitted = subprocess.run([*command, "--emit-manifest"], capture_output=True, text=True, check=True)
    path = tmp_path / "draft.json"
    path.write_text(emitted.stdout, encoding="utf-8")
    reviewed = subprocess.run([sys.executable, "-B", str(tool), "--manifest", str(path), "--root", str(root)],
                              capture_output=True, text=True, check=True)
    assert json.loads(reviewed.stdout)["entryCount"] == 4
    assert {p: p.read_bytes() for p in root.rglob("*") if p.is_file()} == before
    (root / "elite_48.tap").unlink()
    missing = subprocess.run(command, capture_output=True, text=True)
    assert missing.returncode == 2 and json.loads(missing.stdout)["entries"][0]["issues"]
