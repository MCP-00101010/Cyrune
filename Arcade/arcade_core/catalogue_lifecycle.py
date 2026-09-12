"""Native-only catalogue preparation, recovery, reattachment and refresh.

All write APIs are explicit maintenance calls. Existing Arcade metadata saves
join the journal only for a previously prepared source.
"""

from __future__ import annotations

from copy import deepcopy
from contextlib import contextmanager, nullcontext
import hashlib
import os
from pathlib import Path
import stat
import threading
import time
import uuid

from arcade_core.catalogue import CatalogueService
from arcade_core.catalogue_identity import (
    CatalogueError, IdentityRegistry, MAX_REGISTRY_BYTES, _validate, _writer_lock,
    encoded, read_object, relative_media, valid_id,
)
from arcade_core.catalogue_spectrum import MAX_METADATA_BYTES, MEDIA_FORMATS, SpectrumSource, media_signature
from arcade_core.paths import ConfinedRoot, PathConfinementError
from arcade_core.persistence import atomic_write_json
from arcade_core.catalogue_snapshot import read_cache, snapshot_cached


MAX_MEDIA_BYTES = 64 * 1024 * 1024
MAX_JOURNAL_BYTES = 160 * 1024 * 1024


def _digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def _content_hash(path: Path) -> str:
    try:
        before = media_signature(path)
        if before[2] > MAX_MEDIA_BYTES:
            raise CatalogueError("review-required")
        digest = hashlib.sha256()
        total = 0
        with path.open("rb") as stream:
            while block := stream.read(1024 * 1024):
                total += len(block)
                if total > MAX_MEDIA_BYTES:
                    raise CatalogueError("review-required")
                digest.update(block)
        if media_signature(path) != before:
            raise CatalogueError("entry-changed")
        return digest.hexdigest()
    except OSError:
        raise CatalogueError("media-missing") from None


def _stamp(path: Path):
    try:
        info = path.stat()
        return (str(path), info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
    except OSError:
        return (str(path), None)


def _media_stamps(root, entries):
    """Sample regular siblings together; resolve reparse points individually.

    Canonicalize every parent, then stat regular children without resolving
    children. This avoids thousands of Windows final-path lookups per page.
    The caller repeats the whole observation after its read lease, and selected
    launch targets still undergo independent native real-path validation.
    """
    confined = ConfinedRoot(root)
    entries = list(entries)
    wanted = {}
    for entry in entries:
        relative = Path(entry["relativePath"])
        wanted.setdefault(str(relative.parent), set()).add(os.path.normcase(relative.name))
    parents = {}
    result = []
    for entry in entries:
        relative = Path(entry["relativePath"])
        parent = str(relative.parent)
        if parent not in parents:
            canonical = confined.resolve(parent)
            result.append(_stamp(canonical))
            try:
                with os.scandir(canonical) as directory:
                    parents[parent] = {os.path.normcase(child.name): child for child in directory
                                       if os.path.normcase(child.name) in wanted[parent]}
            except OSError:
                parents[parent] = {}
        child = parents[parent].get(os.path.normcase(relative.name))
        try:
            # os.stat retains Windows file IDs; DirEntry's cached metadata may
            # report a zero inode and would miss a same-content replacement.
            info = os.stat(child.path, follow_symlinks=False) if child else None
            if info is None or stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
                result.append(_stamp(confined.resolve(relative)))
            else:
                result.append((child.path, info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns))
        except OSError:
            result.append(_stamp(confined.resolve(relative)))
    return result


class CatalogueLifecycle:
    def __init__(self, runtime: Path, config_path: Path):
        self.runtime = Path(runtime).resolve()
        self.config_path = Path(config_path).resolve()
        if self.config_path.parent != self.runtime:
            raise CatalogueError("invalid-request")
        self.registry = IdentityRegistry(self.runtime / "catalogue-identities.json")
        self.proofs_path = self.runtime / "catalogue-proofs.json"
        self.journal_path = self.runtime / "catalogue-transaction.json"
        self._lock = threading.RLock()
        self._service = None
        self._source_keys = None
        self._observed = None
        self._settled_stamp = None
        self._mutation_depth = 0
        self._read_depth = 0
        self._preparation_reviews = {}
        from arcade_core.catalogue_recovery import RecoveryReview
        self.recovery_review = RecoveryReview(self)
        from arcade_core.catalogue_reattachment import ReattachmentReview
        self.reattachment_review = ReattachmentReview(self)

    def ensure_settled(self):
        """Ordinary reads/writes never choose an interrupted transaction's repair."""
        with self._lock:
            if not self._mutation_depth and self.recover(dry_run=True)["status"] == "preview":
                raise CatalogueError("review-required")

    @snapshot_cached
    def _config(self):
        config = read_object(self.config_path, MAX_METADATA_BYTES)
        if not isinstance(config.get("collections"), list):
            raise CatalogueError("review-required")
        from arcade_core.collections import current_config
        try:
            return current_config(config)
        except ValueError:
            raise CatalogueError('review-required') from None

    def _collection(self, config, collection_id):
        if not valid_id(collection_id, legacy=True):
            raise CatalogueError("invalid-request")
        matches = [row for row in config["collections"] if isinstance(row, dict) and row.get("id") == collection_id]
        if len(matches) != 1 or not isinstance(matches[0].get("root"), str):
            raise CatalogueError("source-unavailable")
        return matches[0]

    @snapshot_cached
    def _proofs(self):
        if not self.proofs_path.exists():
            return {"schemaVersion": 1, "sources": {}}
        value = read_object(self.proofs_path, MAX_REGISTRY_BYTES)
        self._validate_proofs(value)
        return value

    @staticmethod
    def _validate_proofs(value):
        if set(value) != {"schemaVersion", "sources"} or type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
            raise CatalogueError("unsupported-protocol")
        if not isinstance(value["sources"], dict) or len(value["sources"]) > 64:
            raise CatalogueError("review-required")
        for source_id, rows in value["sources"].items():
            if not valid_id(source_id, legacy=True) or not isinstance(rows, dict) or len(rows) > 100_000:
                raise CatalogueError("review-required")
            for legacy_id, digest in rows.items():
                if not valid_id(legacy_id, legacy=True) or not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                    raise CatalogueError("review-required")

    def invalidate(self):
        with self._lock:
            self._observed = None
            if self._service:
                self._service.invalidate()

    @contextmanager
    def mutation(self, root):
        """Hold the native writer lease across prepared Arcade file operations."""
        with self._lock:
            if self._read_depth:
                raise CatalogueError("busy")
            if self._mutation_depth:
                yield
                return
            self.ensure_settled()
            if not self.proofs_path.exists():
                yield
                return
            state = self.registry.load()
            prepared = self._proofs()["sources"]
            if not any(key in prepared and value["root"] == str(Path(root).resolve()) for key, value in state["sources"].items()):
                yield
                return
            with _writer_lock(self.registry.path):
                self._mutation_depth += 1
                try:
                    try:
                        yield
                    except Exception:
                        self._finish_staged()
                        raise
                    else:
                        self._finish_staged()
                finally:
                    # BaseException models process termination: leave durable intent.
                    self._mutation_depth -= 1

    def _finish_staged(self):
        if self.journal_path.exists() and read_object(self.journal_path, MAX_JOURNAL_BYTES)["status"] == "staged":
            self._recover_locked(direction="rollback")

    def stage_move(self, root, source, destination):
        """Record a confined move before Arcade changes the filesystem."""
        with self._lock:
            if not self._mutation_depth:
                return  # Unprepared collection: retain its existing workflow.
            root = Path(root).resolve()
            confined = ConfinedRoot(root)
            try:
                old = relative_media(Path(source).resolve().relative_to(root).as_posix())
                new = relative_media(Path(destination).resolve().relative_to(root).as_posix())
            except ValueError:
                raise CatalogueError("review-required") from None
            if confined.resolve(new).exists():
                raise CatalogueError("entry-changed")
            move = {"from": old, "to": new, "sha256": _content_hash(confined.resolve(old))}
            journal = read_object(self.journal_path, MAX_JOURNAL_BYTES) if self.journal_path.exists() else None
            if not journal or journal["status"] != "staged":
                state = self.registry.load()
                keys = [key for key, value in state["sources"].items() if value["root"] == str(root)]
                if len(keys) != 1:
                    raise CatalogueError("review-required")
                metadata = read_object(self._document_path("metadata", root), MAX_METADATA_BYTES)
                proofs = self._proofs()
                journal = {"schemaVersion": 1, "id": uuid.uuid4().hex, "operation": "metadata", "collectionId": keys[0],
                           "root": str(root), "status": "staged", "moves": [],
                           "documents": [{"kind": kind, "before": value, "after": value}
                                         for kind, value in (("metadata", metadata), ("registry", state), ("proofs", proofs))]}
            journal["moves"].append(move)
            self._validate_journal(journal)
            if len(encoded(journal)) > MAX_JOURNAL_BYTES // 2:
                raise CatalogueError("review-required")
            atomic_write_json(self.journal_path, journal)
            self.invalidate()

    def _document_path(self, kind, root):
        if kind == "metadata":
            return ConfinedRoot(Path(root)).resolve("collection-metadata.json", require_exists=True)
        paths = {"registry": self.registry.path, "proofs": self.proofs_path, "config": self.config_path}
        if kind not in paths:
            raise CatalogueError("review-required")
        return paths[kind]

    def _read_optional(self, path):
        return read_object(path, MAX_METADATA_BYTES) if path.exists() else None

    def _validate_journal(self, journal):
        if set(journal) != {"schemaVersion", "id", "operation", "collectionId", "root", "status", "documents", "moves"}:
            raise CatalogueError("review-required")
        if type(journal["schemaVersion"]) is not int or journal["schemaVersion"] != 1:
            raise CatalogueError("unsupported-protocol")
        if (not isinstance(journal["operation"], str) or journal["operation"] not in {"prepare", "metadata", "reattach"}
                or not isinstance(journal["status"], str) or journal["status"] not in {"staged", "pending", "committed", "rolled-back"}
                or not valid_id(journal["id"]) or not valid_id(journal["collectionId"], legacy=True)):
            raise CatalogueError("review-required")
        documents = journal["documents"]
        if not isinstance(documents, list) or not 2 <= len(documents) <= 4:
            raise CatalogueError("review-required")
        kinds = set()
        for document in documents:
            if not isinstance(document, dict) or set(document) != {"kind", "before", "after"}:
                raise CatalogueError("review-required")
            kind = document["kind"]
            if not isinstance(kind, str) or kind not in {"registry", "proofs", "metadata", "config"} or kind in kinds:
                raise CatalogueError("review-required")
            if document["before"] is not None and not isinstance(document["before"], dict) or not isinstance(document["after"], dict):
                raise CatalogueError("review-required")
            kinds.add(kind)
            if kind == "registry":
                _validate(document["after"])
                if document["before"] is not None:
                    _validate(document["before"])
            if kind == "proofs":
                self._validate_proofs(document["after"])
                if document["before"] is not None:
                    self._validate_proofs(document["before"])
            if kind in {"metadata", "config"}:
                field = "games" if kind == "metadata" else "collections"
                if document["before"] is None or any(not isinstance(document[side].get(field), list) for side in ("before", "after")):
                    raise CatalogueError("review-required")
        expected_kinds = {"registry", "proofs", "config" if journal["operation"] == "reattach" else "metadata"}
        if kinds != expected_kinds:
            raise CatalogueError("review-required")
        registry = next(d["after"] for d in documents if d["kind"] == "registry")
        source = registry["sources"].get(journal["collectionId"])
        if not source or source["root"] != journal["root"]:
            raise CatalogueError("review-required")
        config_doc = next((d for d in documents if d["kind"] == "config"), None)
        if journal["status"] in {"pending", "staged"}:
            config = config_doc["after"] if config_doc else self._config()
            if Path(self._collection(config, journal["collectionId"])["root"]).resolve() != Path(journal["root"]):
                raise CatalogueError("source-unavailable")
        if not isinstance(journal["moves"], list) or len(journal["moves"]) > 100_000:
            raise CatalogueError("review-required")
        for move in journal["moves"]:
            if not isinstance(move, dict) or set(move) != {"from", "to", "sha256"}:
                raise CatalogueError("review-required")
            relative_media(move["from"])
            relative_media(move["to"])
            digest = move["sha256"]
            if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                raise CatalogueError("review-required")

    def _recover_locked(self, *, direction="forward", dry_run=False):
        if not self.journal_path.exists():
            return {"status": "idle"}
        if _stamp(self.journal_path) == self._settled_stamp:
            return {"status": "idle"}
        journal = read_object(self.journal_path, MAX_JOURNAL_BYTES)
        self._validate_journal(journal)
        if journal["status"] not in {"pending", "staged"}:
            self._settled_stamp = _stamp(self.journal_path)
            return {"status": journal["status"], "transactionId": journal["id"]}
        if direction not in {"forward", "rollback"}:
            raise CatalogueError("invalid-request")
        from arcade_core.catalogue_recovery import recovery_direction
        chosen = recovery_direction(self, journal)
        if chosen is not None:
            direction = chosen
        if journal["status"] == "staged":
            direction = "rollback"  # No committed metadata intent exists yet.
        selected = "after" if direction == "forward" else "before"
        # Preflight every document and move before writing or moving anything.
        for doc in journal["documents"]:
            current = self._read_optional(self._document_path(doc["kind"], journal["root"]))
            if current != doc["before"] and current != doc["after"]:
                raise CatalogueError("entry-changed")
        moves = []
        confined = ConfinedRoot(Path(journal["root"]))
        for move in journal["moves"]:
            old, new = confined.resolve(move["from"]), confined.resolve(move["to"])
            source, destination = (old, new) if direction == "forward" else (new, old)
            if destination.exists():
                if source.exists() or _content_hash(destination) != move["sha256"]:
                    raise CatalogueError("entry-changed")
            elif source.exists() and _content_hash(source) == move["sha256"]:
                moves.append((source, destination))
            else:
                raise CatalogueError("entry-changed")
        if dry_run:
            return {"status": "preview", "transactionId": journal["id"], "documents": len(journal["documents"]), "moves": len(moves)}
        for source, destination in moves:
            destination.parent.mkdir(parents=True, exist_ok=True)
            source.replace(destination)
        for doc in journal["documents"]:
            target = self._document_path(doc["kind"], journal["root"])
            desired = doc[selected]
            current = self._read_optional(target)
            if current != doc["before"] and current != doc["after"]:
                raise CatalogueError("entry-changed")
            if current == desired:
                continue
            if desired is None:
                # Only fixed, previously absent runtime artifacts can be removed.
                if doc["kind"] not in {"proofs", "registry"}:
                    raise CatalogueError("review-required")
                target.unlink(missing_ok=True)
            else:
                atomic_write_json(target, desired)
        journal["status"] = "committed" if direction == "forward" else "rolled-back"
        atomic_write_json(self.journal_path, journal)
        self._settled_stamp = _stamp(self.journal_path)
        self.invalidate()
        return {"status": journal["status"], "transactionId": journal["id"]}

    def recover(self, *, direction="forward", dry_run=False):
        if direction not in ("forward", "rollback"):
            raise CatalogueError("invalid-request")
        with self._lock:
            if self._mutation_depth:
                return {"status": "active"}
            if not self.journal_path.exists():
                return {"status": "idle"}
            if dry_run:
                return self._recover_locked(direction=direction, dry_run=True)
            with _writer_lock(self.registry.path):
                return self._recover_locked(direction=direction)

    def _commit(self, operation, collection_id, root, documents, moves):
        if self.journal_path.exists():
            staged = read_object(self.journal_path, MAX_JOURNAL_BYTES)
            if staged["status"] == "staged":
                self._validate_journal(staged)
                if staged["collectionId"] != collection_id or staged["root"] != str(root):
                    raise CatalogueError("entry-changed")
                before = {doc["kind"]: doc["before"] for doc in staged["documents"]}
                if any(doc["before"] != before.get(doc["kind"]) for doc in documents):
                    raise CatalogueError("entry-changed")
                combined = {(move["from"], move["to"]): move for move in [*staged["moves"], *moves]}
                moves = list(combined.values())
        journal = {"schemaVersion": 1, "id": uuid.uuid4().hex, "operation": operation,
                   "collectionId": collection_id, "root": str(root), "status": "pending",
                   "documents": documents, "moves": moves}
        self._validate_journal(journal)
        if len(encoded(journal)) > MAX_JOURNAL_BYTES // 2:
            raise CatalogueError("review-required")
        for doc in documents:
            if self._read_optional(self._document_path(doc["kind"], root)) != doc["before"]:
                raise CatalogueError("entry-changed")
        self.invalidate()
        try:
            atomic_write_json(self.journal_path, journal)
            return self._recover_locked()
        except (OSError, CatalogueError):
            # Ordinary errors cooperate with Arcade's existing mutation rollback.
            # Process interruption leaves the pending journal for startup recovery.
            try:
                self._recover_locked(direction="rollback")
            except (OSError, CatalogueError):
                pass  # Retain the pending journal; conflict preflight protects edits.
            raise CatalogueError("persistence-failed") from None

    def _plan(self, collection_id, root, metadata, *, reattach=False, initial=False):
        state = {"schemaVersion": 1, "revision": 0, "sources": {}} if initial else self.registry.load()
        prior_state = deepcopy(state)
        if not self.proofs_path.exists() and self.journal_path.exists():
            if read_object(self.journal_path, MAX_JOURNAL_BYTES)["status"] == "committed":
                raise CatalogueError("review-required")
        proofs = self._proofs()
        prior_proofs = deepcopy(proofs) if self.proofs_path.exists() else None
        prior = state["sources"].get(collection_id)
        if prior and prior["root"] != str(root) and not reattach:
            raise CatalogueError("source-unavailable")
        # Optional relocation preparation must retain IDs already used by Portal's
        # direct library browser. Reading an existing key does not initialize it.
        from arcade_core.catalogue_library import read_library_key, library_id
        key_path = self.runtime / "catalogue-library.json"
        library_key = read_library_key(key_path) if key_path.exists() else None
        source_id = library_id(library_key, ["source", collection_id, str(root)]) if library_key else f"src_{uuid.uuid4().hex}"
        source = deepcopy(prior) if prior else {"sourceId": source_id, "root": str(root), "entries": {}}
        source["root"] = str(root)
        hashes = proofs["sources"].setdefault(collection_id, {})
        rows = metadata.get("games")
        if not isinstance(rows, list) or len(rows) > 100_000:
            raise CatalogueError("review-required")
        candidate_metadata = deepcopy(metadata)
        seen_ids, seen_paths, moves, verified = set(), set(), [], 0
        confined = ConfinedRoot(root)
        for item in candidate_metadata["games"]:
            if not isinstance(item, dict):
                raise CatalogueError("review-required")
            relative = relative_media(item.get("file"))
            legacy = item.get("id")
            if legacy in (None, ""):
                legacy = hashlib.sha1(item["file"].lower().encode("utf-8")).hexdigest()[:16]
            if not valid_id(legacy, legacy=True) or legacy in seen_ids or relative.casefold() in seen_paths:
                raise CatalogueError("review-required")
            seen_ids.add(legacy)
            seen_paths.add(relative.casefold())
            item["id"] = legacy
            old = source["entries"].get(legacy)
            if item.get("status", "Main") != "Main" and not old:
                continue
            if reattach and not old:
                raise CatalogueError("review-required")
            try:
                target = confined.resolve(relative, require_exists=True)
                signature = media_signature(target)
            except FileNotFoundError:
                if old and relative == old["relativePath"] and not reattach:
                    continue
                raise CatalogueError("media-missing") from None
            except (OSError, PathConfinementError):
                raise CatalogueError("review-required") from None
            if target.suffix.lower() not in MEDIA_FORMATS:
                raise CatalogueError("unsupported-target")
            expected_hash = hashes.get(legacy)
            # Reuse the proof only while the native signature is unchanged.
            # A copied/replaced root always requires full content verification.
            digest = expected_hash if old and expected_hash and signature == old["signature"] and not reattach else _content_hash(target)
            if old:
                if reattach and not expected_hash:
                    raise CatalogueError("review-required")
                if expected_hash and digest != expected_hash:
                    raise CatalogueError("review-required")
                if not expected_hash and (signature != old["signature"] or relative != old["relativePath"]):
                    raise CatalogueError("review-required")
                if relative != old["relativePath"] and not reattach:
                    if confined.resolve(old["relativePath"]).exists():
                        raise CatalogueError("review-required")
                    moves.append({"from": old["relativePath"], "to": relative, "sha256": digest})
            hashes[legacy] = digest
            new_id = library_id(library_key, ["entry", collection_id, str(root), legacy]) if library_key else f"entry_{uuid.uuid4().hex}"
            source["entries"][legacy] = {"catalogueId": old["catalogueId"] if old else new_id,
                                         "relativePath": relative, "signature": signature}
            verified += 1
        if reattach and (not prior or not verified or set(prior["entries"]) - seen_ids):
            raise CatalogueError("review-required")
        state["sources"][collection_id] = source
        if state != prior_state:
            state["revision"] += 1
        _validate(state)
        if len(encoded(state)) > MAX_REGISTRY_BYTES // 2 or len(encoded(proofs)) > MAX_REGISTRY_BYTES // 2:
            raise CatalogueError("review-required")
        return state, prior_state, proofs, prior_proofs, candidate_metadata, moves, verified

    def review_preparation(self, collection_id):
        """Issue a bounded, private-memory confirmation for a write-free preview."""
        with self._lock:
            now = time.monotonic()
            self._preparation_reviews = {key: value for key, value in self._preparation_reviews.items()
                                         if value[0] > now}
            if len(self._preparation_reviews) >= 16:
                raise CatalogueError("busy")
            result = self.prepare_source(collection_id, _review=True)
            fingerprint = result.pop("_fingerprint")
            token = uuid.uuid4().hex
            self._preparation_reviews[token] = (time.monotonic() + 300, collection_id, fingerprint)
            return {**result, "reviewToken": token, "expiresInSeconds": 300}

    def confirm_preparation(self, collection_id, token):
        with self._lock:
            if not isinstance(token, str) or len(token) != 32:
                raise CatalogueError("invalid-request")
            review = self._preparation_reviews.pop(token, None)
            if not review or review[0] <= time.monotonic() or review[1] != collection_id:
                raise CatalogueError("review-required")
            return self.prepare_source(collection_id, dry_run=False, _expected_review=review[2])

    def _preparation_stamps(self, root, metadata):
        confined = ConfinedRoot(root)
        paths = [self.config_path, self.registry.path, self.proofs_path, self.journal_path,
                 self.registry.path.with_suffix(".migration.json"),
                 confined.resolve("collection-metadata.json", require_exists=True)]
        paths.extend(confined.resolve(relative_media(item.get("file"))) for item in metadata["games"])
        return [_stamp(path) for path in paths]

    def _preparation_target(self, collection_id):
        config = self._config()
        row = self._collection(config, collection_id)
        if row.get("writable") is not True:
            raise CatalogueError("review-required")
        root = Path(row["root"]).resolve()
        try:
            path = ConfinedRoot(root).resolve("collection-metadata.json", require_exists=True)
        except (OSError, PathConfinementError):
            raise CatalogueError("review-required") from None
        return config, root, path

    def prepare_source(self, collection_id, *, dry_run=True, _review=False, _expected_review=None):
        # Refuse unsupported source kinds before creating even a runtime lock.
        # Repeat under the writer lease; this preliminary check grants no authority.
        with self._lock:
            self._preparation_target(collection_id)
        with self._lock, (nullcontext() if dry_run else _writer_lock(self.registry.path)):
            if self._read_depth:
                raise CatalogueError("busy")
            recovery = self.recover(dry_run=dry_run or _expected_review is not None)
            if recovery["status"] == "preview":
                raise CatalogueError("busy")
            # Preparation never invokes a scanner or synthesizes an empty collection.
            config, root, path = self._preparation_target(collection_id)
            metadata = read_object(path, MAX_METADATA_BYTES)
            initial = not self.registry.path.exists()
            if initial:
                self.registry.initialize(dry_run=True)
            # Validate shape before sampling every confined media reference.
            rows = metadata.get("games")
            if not isinstance(rows, list) or len(rows) > 100_000 or any(not isinstance(item, dict) for item in rows):
                raise CatalogueError("review-required")
            stamps = self._preparation_stamps(root, metadata)
            plan = self._plan(collection_id, root, metadata, initial=initial)
            state, before, proofs, old_proofs, pinned, moves, verified = plan
            if stamps != self._preparation_stamps(root, metadata):
                raise CatalogueError("entry-changed")
            # Fresh UUIDs are deliberately excluded; all reviewed inputs, proofs,
            # retained identities, and planned media signatures remain covered.
            planned_entries = {key: {"relativePath": value["relativePath"], "signature": value["signature"]}
                               for key, value in state["sources"][collection_id]["entries"].items()}
            fingerprint = _digest([config, metadata, before, proofs, old_proofs, planned_entries, moves, verified, stamps])
            if _expected_review is not None and fingerprint != _expected_review:
                raise CatalogueError("entry-changed")
            if dry_run:
                result = {"status": "preview", "entries": verified, "initializationRequired": initial}
                if _review:
                    old_entries = before["sources"].get(collection_id, {}).get("entries", {})
                    result.update({"newEntries": len(set(planned_entries) - set(old_entries)),
                                   "retainedEntries": len(old_entries),
                                   "pinnedIds": sum(item.get("id") in (None, "") for item in rows),
                                   "_fingerprint": fingerprint})
                return result
            if initial:
                self.registry.initialize(dry_run=False)
            documents = [{"kind": "metadata", "before": metadata, "after": pinned},
                         {"kind": "registry", "before": before, "after": state},
                         {"kind": "proofs", "before": old_proofs, "after": proofs}]
            if all(d["before"] == d["after"] for d in documents):
                return {"status": "unchanged", "entries": verified}
            result = self._commit("prepare", collection_id, root, documents, moves)
            return {**result, "entries": verified}

    def save_metadata(self, root, metadata):
        """Return False for unprepared roots; otherwise atomically join native save."""
        with self._lock:
            self.ensure_settled()
            if not self.proofs_path.exists():
                if self.journal_path.exists() and read_object(self.journal_path, MAX_JOURNAL_BYTES)["status"] == "committed":
                    raise CatalogueError("review-required")
                return False
            state = self.registry.load()
            matches = [key for key, source in state["sources"].items() if source["root"] == str(Path(root).resolve())]
            if not matches:
                return False
            if len(matches) != 1:
                raise CatalogueError("review-required")
            collection_id = matches[0]
            if collection_id not in self._proofs()["sources"]:
                return False
            root = Path(root).resolve()
            with _writer_lock(self.registry.path):
                current = read_object(self._document_path("metadata", root), MAX_METADATA_BYTES)
                state, before, proofs, old_proofs, pinned, moves, _ = self._plan(collection_id, root, metadata)
                documents = [{"kind": "metadata", "before": current, "after": pinned},
                             {"kind": "registry", "before": before, "after": state},
                             {"kind": "proofs", "before": old_proofs, "after": proofs}]
                self._commit("metadata", collection_id, root, documents, moves)
                metadata.clear()
                metadata.update(pinned)
                return True

    def reattach_source(self, collection_id, new_root, *, dry_run=True, _review=False, _expected_review=None):
        with self._lock, (nullcontext() if dry_run else _writer_lock(self.registry.path)):
            if self._read_depth or self._mutation_depth:
                raise CatalogueError("busy")
            if self.recover(dry_run=dry_run or _expected_review is not None)["status"] == "preview":
                raise CatalogueError("busy")
            root = Path(new_root).resolve()
            raw_config = read_object(self.config_path, MAX_METADATA_BYTES)
            from arcade_core.collections import current_config
            config = current_config(raw_config)
            row = self._collection(config, collection_id)
            if row.get("writable") is not True:
                raise CatalogueError("review-required")
            checkout = Path(__file__).resolve().parents[2]
            if root.is_relative_to(checkout) or checkout.is_relative_to(root) or root.is_relative_to(self.runtime) or self.runtime.is_relative_to(root):
                raise CatalogueError("invalid-request")
            registry = self.registry.load()
            if any(key != collection_id and Path(source["root"]).resolve() == root for key, source in registry["sources"].items()):
                raise CatalogueError("review-required")
            metadata = read_object(ConfinedRoot(root).resolve("collection-metadata.json", require_exists=True), MAX_METADATA_BYTES)
            rows = metadata.get("games")
            if not isinstance(rows, list) or len(rows) > 100_000 or any(not isinstance(item, dict) for item in rows):
                raise CatalogueError("review-required")
            stamps = self._preparation_stamps(root, metadata)
            plan = self._plan(collection_id, root, metadata, reattach=True)
            state, before, proofs, old_proofs, pinned, _moves, verified = plan
            if pinned != metadata:
                raise CatalogueError("review-required")
            if stamps != self._preparation_stamps(root, metadata):
                raise CatalogueError("entry-changed")
            fingerprint = _digest([config, metadata, plan, stamps])
            if _expected_review is not None and fingerprint != _expected_review:
                raise CatalogueError("entry-changed")
            if dry_run:
                return {"status": "preview", "entries": verified, **({"_fingerprint": fingerprint} if _review else {})}
            changed_config = deepcopy(config)
            self._collection(changed_config, collection_id)["root"] = str(root)
            documents = [{"kind": "config", "before": raw_config, "after": changed_config},
                         {"kind": "registry", "before": before, "after": state},
                         {"kind": "proofs", "before": old_proofs, "after": proofs}]
            if all(doc["before"] == doc["after"] for doc in documents):
                return {"status": "unchanged", "entries": verified}
            return {**self._commit("reattach", collection_id, root, documents, []), "entries": verified}

    def _watch(self):
        config, state = self._config(), self.registry.load()
        proofs = self._proofs()
        stamps = [_stamp(path) for path in (self.config_path, self.registry.path, self.proofs_path)]
        sources = []
        for collection_id in proofs["sources"]:
            source = state["sources"].get(collection_id)
            row = self._collection(config, collection_id)
            if not source or Path(row["root"]).resolve() != Path(source["root"]):
                raise CatalogueError("source-unavailable")
            root = Path(source["root"])
            confined = ConfinedRoot(root)
            stamps.extend((_stamp(root), _stamp(confined.resolve("collection-metadata.json"))))
            stamps.extend(_media_stamps(root, source["entries"].values()))
            adapter = SpectrumSource(collection_id, root, self.registry)
            stamps.extend(adapter.artwork_target(item) for _legacy, _relative, item in adapter._rows())
            sources.append(adapter)
        # Only configured native profile/executable references are sampled; nothing
        # from a page or catalogue query can select an arbitrary path to inspect.
        profiles = config.get("emulator_profiles", [])
        if not isinstance(profiles, list) or len(profiles) > 512:
            raise CatalogueError("review-required")
        for profile in profiles:
            if isinstance(profile, dict):
                for key in ("managed_path", "source_path"):
                    if isinstance(profile.get(key), str) and profile[key]:
                        stamps.append(_stamp(Path(profile[key])))
        emulators = config.get("emulators", {})
        if not isinstance(emulators, dict) or len(emulators) > 512:
            raise CatalogueError("review-required")
        for emulator in emulators.values():
            if isinstance(emulator, dict) and isinstance(emulator.get("path"), str) and emulator["path"]:
                stamps.append(_stamp(Path(emulator["path"])))
        return sources, _digest(stamps)

    @contextmanager
    def read_snapshot(self):
        """Reuse private reads under a writer lease; discard externally changed results."""
        with self._lock, _writer_lock(self.registry.path):
            if self._read_depth:
                raise CatalogueError("busy")
            self._ensure_fresh()
            before = self._observed
            with read_cache():
                self._read_depth += 1
                try:
                    yield
                finally:
                    self._read_depth -= 1
            try:
                _sources, after = self._watch()
                if after != before:
                    raise CatalogueError("catalogue-changed")
            except (CatalogueError, OSError, PathConfinementError):
                self.invalidate()
                raise CatalogueError("catalogue-changed") from None

    def service(self):
        with self._lock:
            self._ensure_fresh()
            return self._service

    def _ensure_fresh(self):
        with self._lock:
            if self._read_depth:
                return
            if self._mutation_depth:
                raise CatalogueError("busy")
            self.ensure_settled()
            try:
                sources, observed = self._watch()
                if not sources:
                    raise CatalogueError("unavailable")
                keys = tuple((source.collection_id, source.root) for source in sources)
                if self._service is None or keys != self._source_keys:
                    if self._service:
                        self._service.invalidate()
                    self._service = CatalogueService(sources, before_read=self._ensure_fresh)
                    self._source_keys = keys
                    self._observed = None
                if observed != self._observed:
                    self._service.refresh(revision_salt=observed)
                    self._observed = observed
            except (CatalogueError, OSError, PathConfinementError):
                self.invalidate()
                raise CatalogueError("unavailable") from None
