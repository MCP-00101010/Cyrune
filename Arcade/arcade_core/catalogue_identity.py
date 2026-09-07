"""Private, explicitly prepared catalogue identities; never a page-facing API.

Schema 1 stores source roots and legacy aliases only in the native runtime.
Preparing a source writes one atomic registry file; legacy metadata is untouched.
Reads never mint IDs, repair corrupt data, or fall back to an empty registry.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import threading
import uuid

from arcade_core.persistence import atomic_write_json
from arcade_core.catalogue_snapshot import snapshot_cached


MAX_REGISTRY_BYTES = 32 * 1024 * 1024
MAX_SOURCES = 64
MAX_ENTRIES = 100_000
PUBLIC_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
LEGACY_ID = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
_LOCK = threading.RLock()
_HELD_WRITER_PATHS = set()  # Accessed only while the reentrant process lock is held.


class CatalogueError(ValueError):
    """Only a fixed, content-free code may cross the catalogue boundary."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def encoded(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def valid_id(value: object, *, legacy: bool = False) -> bool:
    return isinstance(value, str) and bool((LEGACY_ID if legacy else PUBLIC_ID).fullmatch(value))


def relative_media(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 1024:
        raise CatalogueError("review-required")
    value = value.replace("\\", "/")
    parts = PurePosixPath(value).parts
    if value.startswith("/") or ":" in value or any(p in {".", ".."} for p in parts) or any(ord(c) < 32 for c in value):
        raise CatalogueError("review-required")
    return str(PurePosixPath(value))


def read_object(path: Path, limit: int) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise CatalogueError("review-required")
        def unique_pairs(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise CatalogueError("review-required")
                result[key] = value
            return result
        def reject_constant(_value):
            raise CatalogueError("review-required")
        result = json.loads(raw, object_pairs_hook=unique_pairs, parse_constant=reject_constant)
        if not isinstance(result, dict):
            raise CatalogueError("review-required")
        return result
    except (OSError, UnicodeError, ValueError, RecursionError):
        raise CatalogueError("review-required") from None


def _validate(state: dict) -> None:
    if type(state.get("schemaVersion")) is not int or state["schemaVersion"] != 1:
        raise CatalogueError("unsupported-protocol")
    if set(state) != {"schemaVersion", "revision", "sources"} or type(state["revision"]) is not int or state["revision"] < 0:
        raise CatalogueError("review-required")
    sources = state["sources"]
    if not isinstance(sources, dict) or len(sources) > MAX_SOURCES:
        raise CatalogueError("review-required")
    ids = set()
    count = 0
    for legacy_source, source in sources.items():
        if not valid_id(legacy_source, legacy=True) or not isinstance(source, dict):
            raise CatalogueError("review-required")
        if set(source) != {"sourceId", "root", "entries"} or not valid_id(source["sourceId"]):
            raise CatalogueError("review-required")
        if source["sourceId"] in ids or not isinstance(source["root"], str) or not Path(source["root"]).is_absolute():
            raise CatalogueError("review-required")
        ids.add(source["sourceId"])
        entries = source["entries"]
        if not isinstance(entries, dict):
            raise CatalogueError("review-required")
        count += len(entries)
        if count > MAX_ENTRIES:
            raise CatalogueError("review-required")
        seen_paths = set()
        for legacy_entry, entry in entries.items():
            if not valid_id(legacy_entry, legacy=True) or not isinstance(entry, dict):
                raise CatalogueError("review-required")
            if set(entry) != {"catalogueId", "relativePath", "signature"} or not valid_id(entry["catalogueId"]):
                raise CatalogueError("review-required")
            if entry["catalogueId"] in ids or relative_media(entry["relativePath"]) != entry["relativePath"]:
                raise CatalogueError("review-required")
            if entry["relativePath"].casefold() in seen_paths:
                raise CatalogueError("review-required")
            seen_paths.add(entry["relativePath"].casefold())
            signature = entry["signature"]
            if not isinstance(signature, list) or len(signature) != 4 or any(type(n) is not int or n < 0 for n in signature):
                raise CatalogueError("review-required")
            ids.add(entry["catalogueId"])


@contextmanager
def _writer_lock(path: Path):
    """Serialize threads and native processes, failing boundedly on contention."""
    with _LOCK:
        if path in _HELD_WRITER_PATHS:
            yield
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.with_suffix(".lock").open("a+b") as stream:
            if stream.seek(0, os.SEEK_END) == 0:
                stream.write(b"\0")
                stream.flush()
            stream.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise CatalogueError("busy") from None
            try:
                _HELD_WRITER_PATHS.add(path)
                yield
            finally:
                _HELD_WRITER_PATHS.remove(path)
                stream.seek(0)
                if os.name == "nt":
                    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def _migration_runner():
    # Fixed repository module, independent of the caller's working directory.
    name = "_cyrune_catalogue_migration"
    if name not in sys.modules:
        path = Path(__file__).resolve().parents[2] / "infrastructure" / "migration.py"
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


class IdentityRegistry:
    def __init__(self, path: Path):
        self.path = Path(path).resolve()
        checkout = Path(__file__).resolve().parents[2]
        if self.path.is_relative_to(checkout):
            raise CatalogueError("invalid-request")

    @snapshot_cached
    def load(self) -> dict:
        state = read_object(self.path, MAX_REGISTRY_BYTES)
        _validate(state)
        return state

    def initialize(self, *, dry_run: bool = True) -> dict:
        """Ordered 0->1 migration; no legacy files or existing registry replaced."""
        with _LOCK:
            runner = _migration_runner()
            receipt = self.path.with_suffix(".migration.json")
            def create():
                if self.path.exists():
                    self.load()
                else:
                    atomic_write_json(self.path, {"schemaVersion": 1, "revision": 0, "sources": {}})
            steps = [runner.MigrationStep("01-create-registry", create)]
            if dry_run:
                if self.path.exists():
                    self.load()
                elif receipt.exists() and read_object(receipt, 65536).get("status") == "completed":
                    raise CatalogueError("review-required")
                return runner.run_migration("arcade-catalogue-identity", 0, 1, steps, receipt, dry_run=True)
            with _writer_lock(self.path):
                if self.path.exists():
                    self.load()
                elif receipt.exists() and read_object(receipt, 65536).get("status") == "completed":
                    # Do not reconstruct lost identities using an old success receipt.
                    raise CatalogueError("review-required")
                result = runner.run_migration("arcade-catalogue-identity", 0, 1, steps, receipt)
                self.load()
                return result

    def prepare(self, collection_id: str, root: Path, records: list[dict], *, expected_revision: int,
                dry_run: bool = True, allow_managed_moves: bool = False) -> dict:
        """Pin reviewed aliases in one CAS write. Target changes require later review.

        Records are private {legacyId, relativePath, signature} values from the
        managed-source reader. Removed entries remain reserved, preventing reuse.
        """
        if not valid_id(collection_id, legacy=True) or type(expected_revision) is not int:
            raise CatalogueError("invalid-request")
        root = Path(root).resolve()
        if not root.is_dir() or len(records) > MAX_ENTRIES:
            raise CatalogueError("source-unavailable")
        def candidate():
            state = self.load()
            if state["revision"] != expected_revision:
                raise CatalogueError("entry-changed")
            prior = state["sources"].get(collection_id)
            if prior and prior["root"] != str(root):
                raise CatalogueError("review-required")
            source = deepcopy(prior) if prior else {"sourceId": f"src_{uuid.uuid4().hex}", "root": str(root), "entries": {}}
            seen_ids, seen_paths = set(), set()
            for row in records:
                if not isinstance(row, dict) or set(row) != {"legacyId", "relativePath", "signature"}:
                    raise CatalogueError("review-required")
                legacy = row["legacyId"]
                relative = relative_media(row["relativePath"])
                if not valid_id(legacy, legacy=True) or legacy in seen_ids or relative.casefold() in seen_paths:
                    raise CatalogueError("review-required")
                seen_ids.add(legacy)
                seen_paths.add(relative.casefold())
                old = source["entries"].get(legacy)
                if old and (old["signature"] != row["signature"]
                            or old["relativePath"] != relative and not allow_managed_moves):
                    raise CatalogueError("review-required")
                source["entries"][legacy] = {
                    "catalogueId": old["catalogueId"] if old else f"entry_{uuid.uuid4().hex}",
                    "relativePath": relative, "signature": row["signature"],
                }
            changed = source != prior
            state["sources"][collection_id] = source
            if changed:
                state["revision"] += 1
            _validate(state)
            if len(encoded(state)) > MAX_REGISTRY_BYTES // 2:
                raise CatalogueError("review-required")
            return state, changed
        if dry_run:
            state, changed = candidate()
        else:
            with _writer_lock(self.path):
                state, changed = candidate()
                if changed:
                    try:
                        atomic_write_json(self.path, state)
                    except OSError:
                        raise CatalogueError("persistence-failed") from None
        return {"schemaVersion": 1, "revision": state["revision"], "entries": len(records),
                "changed": changed, "dryRun": dry_run}
