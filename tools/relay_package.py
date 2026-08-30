#!/usr/bin/env python3
"""Build and verify bounded Cyrune Relay packages using only the standard library."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


PACKAGE_FILES = (
    "background.js",
    "content.js",
    "icons/icon-48.svg",
    "icons/icon-96.svg",
    "manifest.json",
    "popup/popup.css",
    "popup/popup.html",
    "popup/popup.js",
)
PACKAGE_FILE_SET = frozenset(PACKAGE_FILES)
FIXED_ZIP_TIME = (2000, 1, 1, 0, 0, 0)
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_ENTRY_BYTES = 8 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 64
MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
GECKO_ID = "morpheus-webhub@local"


class PackageError(RuntimeError):
    """Raised when a Relay archive violates the bounded package contract."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _read_manifest(source: Path) -> dict[str, Any]:
    try:
        manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise PackageError("Relay manifest is missing or invalid") from error
    if not isinstance(manifest, dict):
        raise PackageError("Relay manifest root must be an object")
    version = str(manifest.get("version", "") or "")
    if not VERSION_PATTERN.fullmatch(version):
        raise PackageError("Relay manifest version must use three numeric components")
    gecko_id = str(
        manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id", "") or ""
    )
    if gecko_id != GECKO_ID:
        raise PackageError("Relay compatibility extension ID changed")
    return manifest


def _validate_source(source: Path) -> dict[str, Any]:
    manifest = _read_manifest(source)
    for relative in PACKAGE_FILES:
        path = source / PurePosixPath(relative)
        if not path.is_file():
            raise PackageError(f"Required Relay package file is missing: {relative}")
        if path.stat().st_size > MAX_ENTRY_BYTES:
            raise PackageError(f"Relay package file is unexpectedly large: {relative}")
    return manifest


def source_fingerprint(source: Path) -> str:
    _validate_source(source)
    digest = hashlib.sha256()
    for relative in PACKAGE_FILES:
        data = (source / PurePosixPath(relative)).read_bytes()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(data).digest())
    return digest.hexdigest().upper()


def _safe_entry_name(name: str) -> str:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized.startswith("/")
        or path.is_absolute()
        or ".." in path.parts
        or any(not part for part in path.parts)
        or any(":" in part or "\0" in part for part in path.parts)
    ):
        raise PackageError(f"Unsafe archive entry: {name}")
    return normalized


def _write_deterministic_zip(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(
            temporary,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
            strict_timestamps=True,
        ) as archive:
            for relative in PACKAGE_FILES:
                info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, (source / PurePosixPath(relative)).read_bytes(), compresslevel=9)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _manifest_from_archive(archive: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    except (KeyError, UnicodeError, json.JSONDecodeError) as error:
        raise PackageError("Archive manifest is missing or invalid") from error
    if not isinstance(manifest, dict):
        raise PackageError("Archive manifest root must be an object")
    version = str(manifest.get("version", "") or "")
    if not VERSION_PATTERN.fullmatch(version):
        raise PackageError("Archive manifest version is invalid")
    gecko_id = str(
        manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id", "") or ""
    )
    if gecko_id != GECKO_ID:
        raise PackageError("Archive compatibility extension ID changed")
    return manifest


def verify_archive(
    archive_path: Path,
    *,
    kind: str,
    source: Path | None = None,
    expected_version: str = "",
) -> dict[str, Any]:
    if not archive_path.is_file():
        raise PackageError(f"Relay archive is missing: {archive_path}")
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise PackageError("Relay archive exceeds the bounded size limit")
    if kind not in {"unsigned", "signed"}:
        raise PackageError("Package kind must be unsigned or signed")
    seen: set[str] = set()
    seen_casefolded: set[str] = set()
    signature_entries: list[str] = []
    total_uncompressed = 0
    with zipfile.ZipFile(archive_path, "r") as archive:
        if len(archive.infolist()) > MAX_ARCHIVE_ENTRIES:
            raise PackageError("Relay archive contains too many entries")
        for entry in archive.infolist():
            name = _safe_entry_name(entry.filename)
            if name in seen or name.casefold() in seen_casefolded:
                raise PackageError(f"Duplicate archive entry: {name}")
            seen.add(name)
            seen_casefolded.add(name.casefold())
            total_uncompressed += entry.file_size
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise PackageError("Relay archive exceeds the uncompressed size limit")
            if entry.is_dir():
                if kind != "signed" or not name.startswith("META-INF/"):
                    raise PackageError(f"Unexpected archive directory: {name}")
                continue
            if entry.file_size > MAX_ENTRY_BYTES:
                raise PackageError(f"Archive entry exceeds the bounded size limit: {name}")
            if name not in PACKAGE_FILE_SET:
                if kind == "signed" and name.startswith("META-INF/"):
                    signature_entries.append(name)
                else:
                    raise PackageError(f"Unexpected Relay archive entry: {name}")
        missing = PACKAGE_FILE_SET - seen
        if missing:
            raise PackageError(f"Relay archive is missing: {', '.join(sorted(missing))}")
        if kind == "signed" and not any(name.lower().endswith(".rsa") for name in signature_entries):
            raise PackageError("Mozilla-signed Relay package has no RSA signature entry")
        if kind == "unsigned" and signature_entries:
            raise PackageError("Unsigned AMO upload unexpectedly contains signature metadata")
        manifest = _manifest_from_archive(archive)
        if expected_version and manifest["version"] != expected_version:
            raise PackageError("Relay archive version does not match the expected version")
        if source is not None:
            _validate_source(source)
            for relative in PACKAGE_FILES:
                if archive.read(relative) != (source / PurePosixPath(relative)).read_bytes():
                    raise PackageError(f"Relay archive differs from source: {relative}")
    return {
        "kind": kind,
        "version": manifest["version"],
        "bytes": archive_path.stat().st_size,
        "sha256": sha256_file(archive_path),
        "fileCount": len(PACKAGE_FILES),
        "signatureEntryCount": len(signature_entries),
        "entries": list(PACKAGE_FILES),
    }


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def build_unsigned(source: Path, artifacts_root: Path) -> dict[str, Any]:
    manifest = _validate_source(source)
    version = manifest["version"]
    output_dir = artifacts_root / "Relay" / version / "unsigned"
    archive_path = output_dir / f"cyrune-relay-{version}-amo-upload.zip"
    _write_deterministic_zip(source, archive_path)
    report = verify_archive(
        archive_path,
        kind="unsigned",
        source=source,
        expected_version=version,
    )
    report["sourceFingerprint"] = source_fingerprint(source)
    report["archive"] = archive_path.name
    _write_text_atomic(output_dir / f"{archive_path.name}.sha256", f"{report['sha256']}  {archive_path.name}\n")
    _write_text_atomic(output_dir / "package-report.json", json.dumps(report, indent=2) + "\n")
    return {**report, "path": str(archive_path.resolve())}


def import_signed(archive_path: Path, artifacts_root: Path, source: Path) -> dict[str, Any]:
    verified = verify_archive(archive_path, kind="signed", source=source)
    version = verified["version"]
    output_dir = artifacts_root / "Relay" / version / "signed"
    destination = output_dir / f"cyrune-relay-{version}-mozilla-signed.xpi"
    output_dir.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".tmp", dir=output_dir)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(archive_path, temporary)
        if sha256_file(temporary) != verified["sha256"]:
            raise PackageError("Signed Relay package copy failed hash verification")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    copied = verify_archive(destination, kind="signed", expected_version=version)
    copied["archive"] = destination.name
    _write_text_atomic(output_dir / f"{destination.name}.sha256", f"{copied['sha256']}  {destination.name}\n")
    _write_text_atomic(output_dir / "package-report.json", json.dumps(copied, indent=2) + "\n")
    return {**copied, "path": str(destination.resolve())}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="Build a deterministic unsigned AMO upload archive")
    build.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "Relay")
    build.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parents[1] / "artifacts")
    verify = commands.add_parser("verify", help="Verify a bounded unsigned or Mozilla-signed archive")
    verify.add_argument("archive", type=Path)
    verify.add_argument("--kind", choices=("unsigned", "signed"), required=True)
    verify.add_argument("--source", type=Path)
    verify.add_argument("--expected-version", default="")
    signed = commands.add_parser("import-signed", help="Validate and store an XPI returned by Mozilla")
    signed.add_argument("archive", type=Path)
    signed.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parents[1] / "artifacts")
    signed.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "Relay")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.command == "build":
            result = build_unsigned(args.source.resolve(), args.artifacts.resolve())
        elif args.command == "verify":
            result = verify_archive(
                args.archive.resolve(),
                kind=args.kind,
                source=args.source.resolve() if args.source else None,
                expected_version=args.expected_version,
            )
        else:
            result = import_signed(args.archive.resolve(), args.artifacts.resolve(), args.source.resolve())
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, PackageError, zipfile.BadZipFile) as error:
        print(f"Relay packaging stopped safely: {error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
