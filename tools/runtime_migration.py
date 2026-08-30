#!/usr/bin/env python3
"""Copy, verify, and activate Cyrune's external runtime-data layout.

The coordinator deliberately separates preparation from activation.  It never
deletes a source and refuses to replace divergent destination data unless the
operator supplies the explicit ``--replace-divergent`` option.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable


MIGRATION_VERSION = 1
RECEIPT_SCHEMA = "cyrune.runtime-migration"
RECEIPT_NAME = f"runtime-v{MIGRATION_VERSION}.json"


class MigrationError(RuntimeError):
    """Raised when a migration safety or integrity condition is not met."""


class DivergentDataError(MigrationError):
    """Raised when a destination exists with different content."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def read_json(path: Path, *, require_object: bool = True) -> Any:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise MigrationError(f"Required JSON file is missing: {path}") from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise MigrationError(f"JSON file is unreadable or corrupt: {path}") from error
    if require_object and not isinstance(value, dict):
        raise MigrationError(f"JSON root must be an object: {path}")
    return value


def _validate_json_file(path: Path, *, force: bool = False) -> None:
    if force or path.suffix.lower() == ".json":
        read_json(path, require_object=False)


def _write_bytes_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.cyrune-v{MIGRATION_VERSION}-",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        if path.suffix.lower() == ".json":
            _validate_json_file(temporary, force=True)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _replace_file(
    source: Path,
    destination: Path,
    *,
    replace_divergent: bool,
) -> tuple[str, str, int]:
    if not source.is_file():
        raise MigrationError(f"Required source file is missing: {source}")
    _validate_json_file(source)
    source_hash = sha256_file(source)
    if destination.exists():
        if not destination.is_file():
            raise DivergentDataError(f"Destination is not a file: {destination}")
        try:
            _validate_json_file(destination)
        except MigrationError as error:
            if not replace_divergent:
                raise DivergentDataError(
                    f"Destination is corrupt; explicit replacement is required: {destination}"
                ) from error
        else:
            destination_hash = sha256_file(destination)
            if destination_hash == source_hash:
                return "identical", destination_hash, destination.stat().st_size
            if not replace_divergent:
                raise DivergentDataError(
                    f"Destination differs; explicit replacement is required: {destination}"
                )

    destination.parent.mkdir(parents=True, exist_ok=True)
    interrupted = list(destination.parent.glob(f".{destination.name}.cyrune-v{MIGRATION_VERSION}-*.tmp"))
    for temporary in interrupted:
        temporary.unlink(missing_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.cyrune-v{MIGRATION_VERSION}-",
        suffix=".tmp",
        dir=destination.parent,
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(source, temporary)
        if source.suffix.lower() == ".json":
            _validate_json_file(temporary, force=True)
        if sha256_file(temporary) != source_hash:
            raise MigrationError(f"Copied file failed hash verification: {destination}")
        os.replace(temporary, destination)
        destination_hash = sha256_file(destination)
        if destination_hash != source_hash:
            raise MigrationError(f"Destination failed post-replace verification: {destination}")
        return ("recovered-interrupted" if interrupted else "copied"), destination_hash, destination.stat().st_size
    finally:
        temporary.unlink(missing_ok=True)


def _write_expected_json(
    value: Any,
    destination: Path,
    *,
    replace_divergent: bool,
) -> tuple[str, str, int]:
    content = _json_bytes(value)
    expected_hash = hashlib.sha256(content).hexdigest().upper()
    if destination.exists():
        try:
            _validate_json_file(destination)
        except MigrationError as error:
            if not replace_divergent:
                raise DivergentDataError(
                    f"Destination is corrupt; explicit replacement is required: {destination}"
                ) from error
        else:
            destination_hash = sha256_file(destination)
            if destination_hash == expected_hash:
                return "identical", destination_hash, destination.stat().st_size
            if not replace_divergent:
                raise DivergentDataError(
                    f"Destination differs; explicit replacement is required: {destination}"
                )
    _write_bytes_atomic(destination, content)
    _validate_json_file(destination)
    actual_hash = sha256_file(destination)
    if actual_hash != expected_hash:
        raise MigrationError(f"Written JSON failed hash verification: {destination}")
    return "written", actual_hash, destination.stat().st_size


def _iter_files(root: Path) -> Iterable[tuple[Path, Path]]:
    if not root.exists():
        return
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix().casefold()):
        if path.is_file():
            yield path.relative_to(root), path


def _record(component: str, relative: Path, status: str, path: Path, source_hash: str = "") -> dict[str, Any]:
    return {
        "component": component,
        "relativePath": relative.as_posix(),
        "status": status,
        "bytes": path.stat().st_size,
        "sourceHash": source_hash or sha256_file(path),
        "destinationHash": sha256_file(path),
    }


def _copy_tree(
    source_root: Path,
    destination_root: Path,
    component: str,
    *,
    replace_divergent: bool,
) -> list[dict[str, Any]]:
    records = []
    for relative, source in _iter_files(source_root):
        destination = destination_root / relative
        source_hash = sha256_file(source)
        status, _, _ = _replace_file(
            source,
            destination,
            replace_divergent=replace_divergent,
        )
        records.append(_record(component, relative, status, destination, source_hash))
    return records


def default_runtime_root() -> Path:
    override = str(os.environ.get("CYRUNE_RUNTIME_ROOT", "") or "").strip()
    if override:
        return Path(os.path.expandvars(override)).expanduser().resolve()
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base).expanduser() / "Cyrune"


def default_host_config() -> Path:
    override = str(os.environ.get("CYRUNE_HOST_CONFIG", "") or "").strip()
    if override:
        return Path(os.path.expandvars(override)).expanduser().resolve()
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base).expanduser() / "Cyrune" / "Host" / "config.json"


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


def _rewrite_portal_backgrounds(value: Any, destination_root: Path) -> tuple[Any, int]:
    rewritten = 0

    def visit(item: Any) -> Any:
        nonlocal rewritten
        if isinstance(item, list):
            return [visit(child) for child in item]
        if not isinstance(item, dict):
            return item
        output = {}
        for key, child in item.items():
            if key == "backgroundImage" and isinstance(child, str):
                normalized = child.replace("\\", "/").lstrip("./")
                prefix = "assets/backgrounds/"
                if normalized.startswith(prefix):
                    relative = Path(*normalized[len(prefix):].split("/"))
                    target = destination_root / relative
                    if not target.is_file():
                        raise MigrationError(
                            f"A managed Portal background reference has no copied file: {relative.as_posix()}"
                        )
                    child = target.resolve().as_uri()
                    rewritten += 1
            output[key] = visit(child)
        return output

    return visit(value), rewritten


def discover_portal_backgrounds(database_source: Path) -> Path:
    for ancestor in database_source.resolve().parents:
        candidate = ancestor / "assets" / "backgrounds"
        if candidate.is_dir():
            return candidate
    raise MigrationError(
        "The managed Portal background source could not be discovered; use --portal-backgrounds"
    )


def _rewrite_arcade_config(value: dict[str, Any], source_data: Path, destination_data: Path) -> tuple[dict[str, Any], int]:
    output = copy.deepcopy(value)
    rewritten = 0
    profiles = output.get("emulator_profiles", [])
    if not isinstance(profiles, list):
        raise MigrationError("Arcade config emulator_profiles must be a list")
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        managed = str(profile.get("managed_path", "") or "").strip()
        if not managed:
            continue
        managed_path = Path(os.path.expandvars(managed)).expanduser()
        if not _is_relative_to(managed_path, source_data):
            continue
        relative = managed_path.resolve().relative_to(source_data.resolve())
        destination = destination_data / relative
        if not destination.is_file():
            raise MigrationError(f"A managed Arcade profile has no copied file: {relative.as_posix()}")
        profile["managed_path"] = str(destination.resolve())
        rewritten += 1
    return output, rewritten


def _without_field(value: Any, field: str) -> Any:
    if isinstance(value, list):
        return [_without_field(item, field) for item in value]
    if isinstance(value, dict):
        return {
            key: ("<migration-path>" if key == field else _without_field(item, field))
            for key, item in value.items()
        }
    return value


def _verify_semantic_preservation(
    source_portal: dict[str, Any],
    destination_portal: dict[str, Any],
    source_arcade: dict[str, Any],
    destination_arcade: dict[str, Any],
) -> None:
    if _without_field(source_portal, "backgroundImage") != _without_field(destination_portal, "backgroundImage"):
        raise MigrationError("Portal data changed outside managed background references")
    if _without_field(source_arcade, "managed_path") != _without_field(destination_arcade, "managed_path"):
        raise MigrationError("Arcade config changed outside managed profile paths")


def _receipt_path(runtime_root: Path) -> Path:
    return runtime_root / "migration-receipts" / RECEIPT_NAME


def _read_receipt(runtime_root: Path) -> dict[str, Any] | None:
    path = _receipt_path(runtime_root)
    if not path.exists():
        return None
    receipt = read_json(path)
    if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("version") != MIGRATION_VERSION:
        raise MigrationError(f"Unsupported migration receipt: {path}")
    return receipt


def _write_receipt(runtime_root: Path, receipt: dict[str, Any]) -> None:
    allowed = {
        "schema": RECEIPT_SCHEMA,
        "version": MIGRATION_VERSION,
        "status": receipt["status"],
        "preparedAt": receipt["preparedAt"],
        "activatedAt": receipt.get("activatedAt", ""),
        "portalBackgroundReferencesRewritten": int(receipt.get("portalBackgroundReferencesRewritten", 0)),
        "arcadeProfilePathsRewritten": int(receipt.get("arcadeProfilePathsRewritten", 0)),
        "files": receipt.get("files", []),
    }
    _write_bytes_atomic(_receipt_path(runtime_root), _json_bytes(allowed))


def _snapshot_sources(
    *,
    recovery_root: Path,
    host_config: Path,
    portal_database: Path,
    portal_backups: Path,
    portal_backgrounds: Path,
    arcade_data: Path,
    replace_divergent: bool,
) -> list[dict[str, Any]]:
    records = []
    singles = (
        (host_config, recovery_root / "Host" / "config.json", "Host recovery", Path("config.json")),
        (portal_database, recovery_root / "Portal" / "database.json", "Portal recovery", Path("database.json")),
    )
    for source, destination, component, relative in singles:
        source_hash = sha256_file(source)
        status, _, _ = _replace_file(source, destination, replace_divergent=replace_divergent)
        records.append(_record(component, relative, status, destination, source_hash))
    records.extend(_copy_tree(
        portal_backups,
        recovery_root / "Portal" / "backups",
        "Portal recovery backups",
        replace_divergent=replace_divergent,
    ))
    records.extend(_copy_tree(
        portal_backgrounds,
        recovery_root / "Portal" / "backgrounds",
        "Portal recovery backgrounds",
        replace_divergent=replace_divergent,
    ))
    records.extend(_copy_tree(
        arcade_data,
        recovery_root / "Arcade",
        "Arcade recovery",
        replace_divergent=replace_divergent,
    ))
    return records


def prepare(
    *,
    runtime_root: Path,
    recovery_root: Path,
    host_config: Path,
    portal_database: Path | None = None,
    portal_backgrounds: Path | None = None,
    arcade_data: Path,
    replace_divergent: bool = False,
) -> dict[str, Any]:
    host = read_json(host_config)
    configured_database = Path(str(host.get("databasePath", "") or "")).expanduser()
    database_source = (portal_database or configured_database).resolve()
    if not database_source.is_file():
        raise MigrationError("The authoritative Portal database is not configured or is missing")
    backgrounds_source = (portal_backgrounds or discover_portal_backgrounds(database_source)).resolve()
    if not backgrounds_source.is_dir():
        raise MigrationError(f"The managed Portal background source is missing: {backgrounds_source}")
    arcade_source = arcade_data.resolve()
    if not arcade_source.is_dir():
        raise MigrationError(f"The Arcade runtime source is missing: {arcade_source}")

    portal_root = runtime_root / "Portal"
    arcade_root = runtime_root / "Arcade"
    database_target = portal_root / "database.json"
    records = _snapshot_sources(
        recovery_root=recovery_root,
        host_config=host_config,
        portal_database=database_source,
        portal_backups=database_source.parent / "backups",
        portal_backgrounds=backgrounds_source,
        arcade_data=arcade_source,
        replace_divergent=replace_divergent,
    )
    records.extend(_copy_tree(
        backgrounds_source,
        portal_root / "backgrounds",
        "Portal backgrounds",
        replace_divergent=replace_divergent,
    ))
    records.extend(_copy_tree(
        database_source.parent / "backups",
        portal_root / "backups",
        "Portal backups",
        replace_divergent=replace_divergent,
    ))

    source_database_hash = sha256_file(database_source)
    source_database_value = read_json(database_source)
    database_value, background_count = _rewrite_portal_backgrounds(
        source_database_value, portal_root / "backgrounds"
    )
    status, _, _ = _write_expected_json(
        database_value,
        database_target,
        replace_divergent=replace_divergent,
    )
    records.append(_record("Portal", Path("database.json"), status, database_target, source_database_hash))

    arcade_root.mkdir(parents=True, exist_ok=True)
    (arcade_root / "logs").mkdir(exist_ok=True)
    (arcade_root / "cache").mkdir(exist_ok=True)
    for relative, source in _iter_files(arcade_source):
        if relative.as_posix() == "config.json":
            continue
        destination_relative = Path("logs/launcher.log") if relative.as_posix() == "launcher.log" else relative
        destination = arcade_root / destination_relative
        source_hash = sha256_file(source)
        status, _, _ = _replace_file(source, destination, replace_divergent=replace_divergent)
        records.append(_record("Arcade", destination_relative, status, destination, source_hash))
    arcade_config_source = arcade_source / "config.json"
    arcade_config_source_value = read_json(arcade_config_source)
    arcade_config, profile_count = _rewrite_arcade_config(
        arcade_config_source_value, arcade_source, arcade_root
    )
    status, _, _ = _write_expected_json(
        arcade_config,
        arcade_root / "config.json",
        replace_divergent=replace_divergent,
    )
    records.append(_record(
        "Arcade",
        Path("config.json"),
        status,
        arcade_root / "config.json",
        sha256_file(arcade_config_source),
    ))
    _verify_semantic_preservation(
        source_database_value,
        read_json(database_target),
        arcade_config_source_value,
        read_json(arcade_root / "config.json"),
    )

    receipt = {
        "status": "prepared",
        "preparedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "portalBackgroundReferencesRewritten": background_count,
        "arcadeProfilePathsRewritten": profile_count,
        "files": records,
    }
    _write_receipt(runtime_root, receipt)
    return receipt


def _verify_prepared(runtime_root: Path, receipt: dict[str, Any]) -> None:
    database = runtime_root / "Portal" / "database.json"
    arcade_config = runtime_root / "Arcade" / "config.json"
    arcade_state = runtime_root / "Arcade" / "state.json"
    for path in (database, arcade_config, arcade_state):
        read_json(path)
    config = read_json(arcade_config)
    for profile in config.get("emulator_profiles", []):
        if not isinstance(profile, dict):
            continue
        managed = str(profile.get("managed_path", "") or "").strip()
        if managed and not Path(managed).is_file():
            raise MigrationError("An external Arcade managed profile is missing")
    expected = {
        (item.get("component"), item.get("relativePath")): item.get("destinationHash")
        for item in receipt.get("files", [])
        if item.get("component") in {"Portal backgrounds", "Portal backups", "Portal", "Arcade"}
    }
    roots = {
        "Portal backgrounds": runtime_root / "Portal" / "backgrounds",
        "Portal backups": runtime_root / "Portal" / "backups",
        "Portal": runtime_root / "Portal",
        "Arcade": runtime_root / "Arcade",
    }
    for (component, relative), expected_hash in expected.items():
        path = roots[component] / Path(relative)
        if not path.is_file() or sha256_file(path) != expected_hash:
            raise MigrationError(f"Prepared destination changed before activation: {component}/{relative}")


def _verify_active(runtime_root: Path) -> None:
    read_json(runtime_root / "Portal" / "database.json")
    arcade_config = read_json(runtime_root / "Arcade" / "config.json")
    read_json(runtime_root / "Arcade" / "state.json")
    for profile in arcade_config.get("emulator_profiles", []):
        if not isinstance(profile, dict):
            continue
        managed = str(profile.get("managed_path", "") or "").strip()
        if managed and not Path(managed).is_file():
            raise MigrationError("An active external Arcade managed profile is missing")


def migration_is_active(runtime_root: Path, host_config: Path, receipt: dict[str, Any] | None = None) -> bool:
    receipt = receipt or _read_receipt(runtime_root)
    if not receipt or receipt.get("status") != "activated":
        return False
    host = read_json(host_config)
    configured = Path(str(host.get("databasePath", "") or "")).expanduser()
    return configured.resolve() == (runtime_root / "Portal" / "database.json").resolve()


def activate(*, runtime_root: Path, host_config: Path) -> dict[str, Any]:
    receipt = _read_receipt(runtime_root)
    if not receipt or receipt.get("status") not in {"prepared", "activated"}:
        raise MigrationError("A verified prepared receipt is required before activation")
    database_target = (runtime_root / "Portal" / "database.json").resolve()
    host = read_json(host_config)
    configured = Path(str(host.get("databasePath", "") or "")).expanduser()
    if receipt.get("status") == "activated" and configured.resolve() == database_target:
        _verify_active(runtime_root)
        return receipt
    _verify_prepared(runtime_root, receipt)
    host["databasePath"] = str(database_target)
    _write_bytes_atomic(host_config, _json_bytes(host))
    reread = read_json(host_config)
    if Path(str(reread.get("databasePath", "") or "")).resolve() != database_target:
        raise MigrationError("Host configuration did not retain the external Portal database pointer")
    receipt["status"] = "activated"
    receipt["activatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    _write_receipt(runtime_root, receipt)
    return receipt


def _summary(receipt: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": receipt.get("status", "unknown"),
        "files": len(receipt.get("files", [])),
        "portalBackgroundReferencesRewritten": receipt.get("portalBackgroundReferencesRewritten", 0),
        "arcadeProfilePathsRewritten": receipt.get("arcadeProfilePathsRewritten", 0),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "activate", "migrate", "status"))
    parser.add_argument("--runtime-root", type=Path, default=default_runtime_root())
    parser.add_argument("--host-config", type=Path, default=default_host_config())
    parser.add_argument("--recovery-root", type=Path)
    parser.add_argument("--portal-database", type=Path)
    parser.add_argument("--portal-backgrounds", type=Path)
    parser.add_argument("--arcade-data", type=Path, default=Path(__file__).resolve().parents[1] / "Arcade" / "data")
    parser.add_argument(
        "--replace-divergent",
        action="store_true",
        help="Explicitly allow replacement of divergent prepared/recovery files.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.command == "status":
            receipt = _read_receipt(args.runtime_root)
            print(json.dumps(_summary(receipt or {"status": "not-started", "files": []}), indent=2))
            return 0
        existing_receipt = _read_receipt(args.runtime_root.resolve())
        if args.command in {"prepare", "migrate"} and migration_is_active(
            args.runtime_root.resolve(), args.host_config.resolve(), existing_receipt
        ):
            _verify_active(args.runtime_root.resolve())
            print(json.dumps(_summary(existing_receipt), indent=2))
            return 0
        if args.command in {"prepare", "migrate"}:
            if args.recovery_root is None:
                raise MigrationError("--recovery-root is required when preparing runtime data")
            receipt = prepare(
                runtime_root=args.runtime_root.resolve(),
                recovery_root=args.recovery_root.resolve(),
                host_config=args.host_config.resolve(),
                portal_database=args.portal_database.resolve() if args.portal_database else None,
                portal_backgrounds=args.portal_backgrounds.resolve() if args.portal_backgrounds else None,
                arcade_data=args.arcade_data.resolve(),
                replace_divergent=args.replace_divergent,
            )
            if args.command == "migrate":
                receipt = activate(runtime_root=args.runtime_root.resolve(), host_config=args.host_config.resolve())
        else:
            receipt = activate(runtime_root=args.runtime_root.resolve(), host_config=args.host_config.resolve())
        print(json.dumps(_summary(receipt), indent=2))
        return 0
    except (MigrationError, OSError) as error:
        print(f"Migration stopped safely: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
