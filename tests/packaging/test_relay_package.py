from __future__ import annotations

import importlib.util
import json
import zipfile
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]


def load_tool(name: str, relative: str):
    spec = importlib.util.spec_from_file_location(name, REPO / relative)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


PACKAGE = load_tool("cyrune_relay_package", "tools/relay_package.py")
VERSIONS = load_tool("cyrune_validate_versions", "tools/validate_versions.py")


def make_source(root: Path, version: str = "1.2.3") -> Path:
    source = root / "Relay"
    values = {
        "manifest.json": json.dumps({
            "manifest_version": 2,
            "name": "Cyrune Relay",
            "version": version,
            "browser_specific_settings": {"gecko": {"id": PACKAGE.GECKO_ID}},
        }, indent=2) + "\n",
        "background.js": "const background = true;\n",
        "content.js": "const content = true;\n",
        "icons/icon-48.svg": "<svg><!-- 48 --></svg>\n",
        "icons/icon-96.svg": "<svg><!-- 96 --></svg>\n",
        "popup/popup.css": "body { color: white; }\n",
        "popup/popup.html": "<!doctype html><title>Relay</title>\n",
        "popup/popup.js": "const popup = true;\n",
    }
    for relative, content in values.items():
        path = source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return source


def add_entry(archive_path: Path, name: str, content: bytes = b"extra") -> None:
    with zipfile.ZipFile(archive_path, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name, content)


def signed_fixture(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in PACKAGE.PACKAGE_FILES:
            archive.writestr(relative, (source / relative).read_bytes())
        archive.writestr("META-INF/manifest.mf", b"Manifest-Version: 1.0\n")
        archive.writestr("META-INF/mozilla.sf", b"signature metadata")
        archive.writestr("META-INF/mozilla.rsa", b"signature block")
    return destination


def test_current_relay_matches_the_historic_eight_file_package_boundary():
    assert PACKAGE.PACKAGE_FILES == (
        "background.js",
        "content.js",
        "icons/icon-48.svg",
        "icons/icon-96.svg",
        "manifest.json",
        "popup/popup.css",
        "popup/popup.html",
        "popup/popup.js",
    )
    assert PACKAGE._validate_source(REPO / "Relay")["version"] == "1.1.1"


def test_unsigned_build_is_deterministic_across_paths_with_spaces_and_unicode(tmp_path):
    first = make_source(tmp_path / "first checkout")
    second = make_source(tmp_path / "Clean Cyrune Ω checkout")
    first_result = PACKAGE.build_unsigned(first, tmp_path / "first artifacts")
    second_result = PACKAGE.build_unsigned(second, tmp_path / "second artifacts")
    assert first_result["sha256"] == second_result["sha256"]
    assert first_result["sourceFingerprint"] == second_result["sourceFingerprint"]
    assert first_result["entries"] == list(PACKAGE.PACKAGE_FILES)


def test_generated_reports_are_content_free_and_hash_sidecar_matches(tmp_path):
    source = make_source(tmp_path / "source")
    result = PACKAGE.build_unsigned(source, tmp_path / "artifacts")
    archive = Path(result["path"])
    report = json.loads((archive.parent / "package-report.json").read_text(encoding="utf-8"))
    sidecar = (archive.parent / f"{archive.name}.sha256").read_text(encoding="utf-8")
    serialized = json.dumps(report)
    assert report["sha256"] == PACKAGE.sha256_file(archive)
    assert sidecar == f"{report['sha256']}  {archive.name}\n"
    assert "password" not in serialized.lower()
    assert str(tmp_path) not in serialized


def test_unrelated_host_tests_and_runtime_files_cannot_enter_unsigned_archive(tmp_path):
    source = make_source(tmp_path / "source")
    (source / "tests").mkdir()
    (source / "tests" / "secret-test.js").write_text("not packaged", encoding="utf-8")
    (source / "config.json").write_text("not packaged", encoding="utf-8")
    (source.parent / "Host").mkdir()
    (source.parent / "Host" / "morpheus_host.py").write_text("not packaged", encoding="utf-8")
    result = PACKAGE.build_unsigned(source, tmp_path / "artifacts")
    with zipfile.ZipFile(result["path"], "r") as archive:
        assert set(archive.namelist()) == set(PACKAGE.PACKAGE_FILES)


@pytest.mark.parametrize("unexpected", ["config.json", "tests/test.js", "../escape.txt", "C:/escape.txt", "Host/installer.ps1"])
def test_verifier_rejects_unexpected_or_unsafe_entries(tmp_path, unexpected):
    source = make_source(tmp_path / "source")
    result = PACKAGE.build_unsigned(source, tmp_path / "artifacts")
    archive = Path(result["path"])
    add_entry(archive, unexpected)
    with pytest.raises(PACKAGE.PackageError):
        PACKAGE.verify_archive(archive, kind="unsigned")


def test_signed_workflow_rejects_an_unsigned_archive(tmp_path):
    source = make_source(tmp_path / "source")
    result = PACKAGE.build_unsigned(source, tmp_path / "artifacts")
    with pytest.raises(PACKAGE.PackageError, match="no RSA signature"):
        PACKAGE.verify_archive(Path(result["path"]), kind="signed")


def test_signed_import_keeps_mozilla_package_separate_and_hash_verified(tmp_path):
    source = make_source(tmp_path / "source")
    signed = signed_fixture(source, tmp_path / "downloads" / "returned.xpi")
    result = PACKAGE.import_signed(signed, tmp_path / "artifacts", source)
    imported = Path(result["path"])
    assert imported.parent.name == "signed"
    assert imported.name == "cyrune-relay-1.2.3-mozilla-signed.xpi"
    assert result["signatureEntryCount"] == 3
    assert PACKAGE.sha256_file(imported) == PACKAGE.sha256_file(signed)


def test_independent_component_versions_are_validated_without_forcing_equality(tmp_path):
    repo = tmp_path / "repo"
    versions = {"Portal": "2.3.4", "Widgets": "3.4.5", "Arcade": "4.5.6", "Relay": "7.8.9", "Host": "5.6.7", "Nexus": "1.4.2"}
    manifests = []
    for component, version in versions.items():
        directory = repo / component
        directory.mkdir(parents=True)
        manifest = json.loads((REPO / component / "component.json").read_text(encoding="utf-8"))
        manifest["version"] = version
        (directory / manifest["documents"]["todo"]).write_text("# TODO\n", encoding="utf-8")
        (directory / manifest["documents"]["changelog"]).write_text(f"## [{version}] — today\n", encoding="utf-8")
        for relative in [manifest["icon"], manifest["entrypoint"]]:
            if relative:
                target = directory / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("fixture", encoding="utf-8")
        (directory / "component.json").write_text(json.dumps(manifest), encoding="utf-8")
        manifests.append(manifest)
    (repo / "Portal" / "source").mkdir(exist_ok=True)
    (repo / "Portal" / "source" / "app.js").write_text("const APP_VERSION = '2.3.4';\n", encoding="utf-8")
    (repo / "Portal" / "index.html").write_text("<b>v2.3.4</b><i>Version 2.3.4</i>", encoding="utf-8")
    (repo / "Relay" / "manifest.json").write_text(json.dumps({"version": "7.8.9"}), encoding="utf-8")
    (repo / "Nexus" / "source").mkdir(exist_ok=True)
    (repo / "Nexus" / "source" / "model.js").write_text("const NEXUS_VERSION = '1.4.2';\n", encoding="utf-8")
    (repo / "Nexus" / "source" / "component-registry.js").write_text(VERSIONS.render_registry(manifests), encoding="utf-8")
    assert VERSIONS.validate(repo) == versions


def test_current_component_versions_and_changelogs_align():
    assert VERSIONS.validate(REPO) == {"Portal": "0.12.2", "Widgets": "0.2.16", "Arcade": "0.2.0", "Relay": "1.1.1", "Host": "0.2.0", "Nexus": "0.3.0"}


def test_current_relay_source_builds_and_round_trips_exactly(tmp_path):
    result = PACKAGE.build_unsigned(REPO / "Relay", tmp_path / "artifacts")
    verified = PACKAGE.verify_archive(
        Path(result["path"]),
        kind="unsigned",
        source=REPO / "Relay",
        expected_version="1.1.1",
    )
    assert verified["sha256"] == result["sha256"]
