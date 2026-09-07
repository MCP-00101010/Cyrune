"""Write-free recovery reviews and durable, exact-transaction recovery intent."""

import time
import uuid
from pathlib import Path

from arcade_core.catalogue_identity import CatalogueError, read_object, valid_id, _writer_lock
from arcade_core.persistence import atomic_write_json
from arcade_core.paths import ConfinedRoot


def recovery_direction(lifecycle, journal):
    path = lifecycle.runtime / "catalogue-recovery.json"
    if not path.exists():
        return None
    intent = read_object(path, 4096)
    if (set(intent) != {"schemaVersion", "transactionId", "journalDigest", "direction"}
            or type(intent["schemaVersion"]) is not int or intent["schemaVersion"] != 1
            or not valid_id(intent["transactionId"])
            or intent["direction"] not in ("forward", "rollback")
            or not isinstance(intent["journalDigest"], str) or len(intent["journalDigest"]) != 64
            or any(char not in "0123456789abcdef" for char in intent["journalDigest"])):
        raise CatalogueError("review-required")
    if intent["transactionId"] != journal["id"]:
        return None  # A settled transaction's intent cannot select another one.
    from arcade_core.catalogue_lifecycle import _digest
    if intent["journalDigest"] != _digest(journal):
        raise CatalogueError("entry-changed")
    return intent["direction"]


class RecoveryReview:
    def __init__(self, lifecycle):
        self.lifecycle = lifecycle
        self.reviews = {}

    def _journal(self):
        from arcade_core.catalogue_lifecycle import MAX_JOURNAL_BYTES
        lifecycle = self.lifecycle
        if lifecycle._mutation_depth or lifecycle._read_depth:
            raise CatalogueError("busy")
        if not lifecycle.journal_path.exists():
            return None
        journal = read_object(lifecycle.journal_path, MAX_JOURNAL_BYTES)
        lifecycle._validate_journal(journal)
        return journal if journal["status"] in ("pending", "staged") else None

    def _directions(self, journal):
        selected = recovery_direction(self.lifecycle, journal)
        if selected:
            return [selected]
        return ["rollback"] if journal["status"] == "staged" else ["forward", "rollback"]

    def _collection_name(self, journal):
        row = self.lifecycle._collection(self.lifecycle._config(), journal["collectionId"])
        value = row.get("name")
        if not isinstance(value, str) or not value.strip():
            return "Configured collection"
        return "".join(char for char in value if char.isprintable())[:160]

    def status(self):
        with self.lifecycle._lock:
            journal = self._journal()
            if journal is None:
                return {"status": "idle"}
            return {"status": "recovery-required", "operation": journal["operation"],
                    "collectionId": journal["collectionId"], "collectionName": self._collection_name(journal),
                    "directions": self._directions(journal)}

    def _snapshot(self, direction):
        from arcade_core.catalogue_lifecycle import _digest, _stamp
        lifecycle = self.lifecycle
        journal = self._journal()
        if journal is None or direction not in self._directions(journal):
            raise CatalogueError("review-required")
        if lifecycle._collection(lifecycle._config(), journal["collectionId"]).get("writable") is not True:
            raise CatalogueError("review-required")
        root = Path(journal["root"])
        confined = ConfinedRoot(root)
        paths = [lifecycle.journal_path, lifecycle.config_path, lifecycle.runtime / "catalogue-recovery.json"]
        paths.extend(lifecycle._document_path(doc["kind"], root) for doc in journal["documents"])
        paths.extend(confined.resolve(move[side]) for move in journal["moves"] for side in ("from", "to"))
        stamps = [_stamp(path) for path in paths]
        # Existing recovery preflight verifies all document images and move hashes.
        preview = lifecycle._recover_locked(direction=direction, dry_run=True)
        documents = [lifecycle._read_optional(lifecycle._document_path(doc["kind"], root)) for doc in journal["documents"]]
        if preview["status"] != "preview" or stamps != [_stamp(path) for path in paths]:
            raise CatalogueError("entry-changed")
        fingerprint = _digest([journal, direction, documents, lifecycle._config(), stamps])
        selected = "after" if direction == "forward" else "before"
        changed = sum(current != doc[selected] for current, doc in zip(documents, journal["documents"]))
        return journal, fingerprint, {"status": "preview", "operation": journal["operation"],
                                     "collectionId": journal["collectionId"], "direction": direction,
                                     "documents": changed, "moves": preview["moves"]}

    def preview(self, direction):
        if direction not in ("forward", "rollback"):
            raise CatalogueError("invalid-request")
        with self.lifecycle._lock:
            now = time.monotonic()
            self.reviews = {key: value for key, value in self.reviews.items() if value[0] > now}
            if len(self.reviews) >= 16:
                raise CatalogueError("busy")
            _, fingerprint, result = self._snapshot(direction)
            token = uuid.uuid4().hex
            self.reviews[token] = (time.monotonic() + 300, direction, fingerprint)
            return {**result, "reviewToken": token, "expiresInSeconds": 300}

    def confirm(self, token):
        if not isinstance(token, str) or len(token) != 32:
            raise CatalogueError("invalid-request")
        lifecycle = self.lifecycle
        with lifecycle._lock:
            review = self.reviews.pop(token, None)
            if not review or review[0] <= time.monotonic():
                raise CatalogueError("review-required")
            with _writer_lock(lifecycle.registry.path):
                journal, fingerprint, _ = self._snapshot(review[1])
                if fingerprint != review[2]:
                    raise CatalogueError("entry-changed")
                from arcade_core.catalogue_lifecycle import _digest
                # Write the choice before any repair. Interrupted retries/restarts
                # must keep that choice, including a partially completed rollback.
                atomic_write_json(lifecycle.runtime / "catalogue-recovery.json", {
                    "schemaVersion": 1, "transactionId": journal["id"],
                    "journalDigest": _digest(journal), "direction": review[1],
                })
                result = lifecycle._recover_locked(direction=review[1])
                return {"status": result["status"]}
