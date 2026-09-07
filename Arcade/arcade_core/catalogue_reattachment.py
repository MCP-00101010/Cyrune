"""Native folder selection and reviewed reconnection of prepared sources."""

from pathlib import Path
import time
import uuid

from arcade_core.catalogue_identity import CatalogueError


def label(value, fallback):
    return "".join(char for char in value if char.isprintable())[:160] if isinstance(value, str) and value.strip() else fallback


class ReattachmentReview:
    def __init__(self, lifecycle):
        self.lifecycle = lifecycle
        self.handles = {}
        self.selecting = False

    def _prune(self):
        self.handles = {key: value for key, value in self.handles.items() if value[0] > time.monotonic()}
        if len(self.handles) >= 16:
            raise CatalogueError("busy")

    def _source(self, collection_id):
        lifecycle = self.lifecycle
        if lifecycle._read_depth or lifecycle._mutation_depth:
            raise CatalogueError("busy")
        lifecycle.ensure_settled()
        config = lifecycle._config()
        row = lifecycle._collection(config, collection_id)
        if (row.get("writable") is not True or collection_id not in lifecycle._proofs()["sources"]
                or collection_id not in lifecycle.registry.load()["sources"]):
            raise CatalogueError("review-required")
        return config, row

    def sources(self):
        lifecycle = self.lifecycle
        with lifecycle._lock:
            lifecycle.ensure_settled()
            if not lifecycle.registry.path.exists():
                return {"sources": []}
            config, registry, proofs = lifecycle._config(), lifecycle.registry.load(), lifecycle._proofs()
            sources = []
            for key in registry["sources"]:
                if key not in proofs["sources"]:
                    continue
                row = lifecycle._collection(config, key)
                sources.append({"collectionId": key, "name": label(row.get("name"), "Configured collection"),
                                "available": Path(row["root"]).is_dir(), "writable": row.get("writable") is True})
            return {"sources": sources}

    def select(self, collection_id, pick_folder):
        from arcade_core.catalogue_lifecycle import _digest
        lifecycle = self.lifecycle
        with lifecycle._lock:
            self._prune()
            config, _ = self._source(collection_id)
            fingerprint = _digest(config)
            if self.selecting:
                raise CatalogueError("busy")
            self.selecting = True
        try:
            # Do not hold the lifecycle/native writer lock while a user browses.
            selected = pick_folder()
            if selected is None:
                return {"cancelled": True}
            root = Path(selected)
            if not root.is_absolute() or not root.is_dir():
                raise CatalogueError("invalid-request")
            root = root.resolve()
            with lifecycle._lock:
                self._prune()
                config, _ = self._source(collection_id)
                if _digest(config) != fingerprint:
                    raise CatalogueError("entry-changed")
                info = root.stat()
                fingerprint = _digest([config, str(root), info.st_dev, info.st_ino])
                token = uuid.uuid4().hex
                self.handles[token] = (time.monotonic() + 300, "selection", collection_id, root, fingerprint)
                return {"selectionToken": token, "folderName": label(root.name, "Selected folder"), "expiresInSeconds": 300}
        finally:
            with lifecycle._lock:
                self.selecting = False

    def _consume(self, token, kind):
        if not isinstance(token, str) or len(token) != 32:
            raise CatalogueError("invalid-request")
        handle = self.handles.pop(token, None)
        if not handle or handle[0] <= time.monotonic() or handle[1] != kind:
            raise CatalogueError("review-required")
        return handle

    def preview(self, token):
        from arcade_core.catalogue_lifecycle import _digest
        with self.lifecycle._lock:
            _, _, collection_id, root, fingerprint = self._consume(token, "selection")
            config, _ = self._source(collection_id)
            info = root.stat()
            if root.resolve() != root or _digest([config, str(root), info.st_dev, info.st_ino]) != fingerprint:
                raise CatalogueError("entry-changed")
            result = self.lifecycle.reattach_source(collection_id, root, _review=True)
            token = uuid.uuid4().hex
            self.handles[token] = (time.monotonic() + 300, "review", collection_id, root, result.pop("_fingerprint"))
            return {**result, "reviewToken": token, "expiresInSeconds": 300}

    def confirm(self, token):
        with self.lifecycle._lock:
            _, _, collection_id, root, fingerprint = self._consume(token, "review")
            _, row = self._source(collection_id)
            old_root = Path(row["root"]).resolve()
            result = self.lifecycle.reattach_source(collection_id, root, dry_run=False, _expected_review=fingerprint)
            return {"status": result["status"], "entries": result["entries"], "_oldRoot": old_root, "_root": root}
