"""Browse configured managed libraries without preparing or modifying a collection.

Only a private random identity key is created in Arcade's native runtime. Existing
prepared identities take precedence. Media and launch policy are checked on Add
and launch, never while filtering titles. The index lives in the Host process.
"""

from copy import deepcopy
from contextlib import contextmanager
import hashlib
import hmac
from pathlib import Path
import secrets
from types import SimpleNamespace

from arcade_core.catalogue import CatalogueService
from arcade_core.catalogue_identity import CatalogueError, encoded, read_object, valid_id, _writer_lock
from arcade_core.catalogue_lifecycle import CatalogueLifecycle, _digest, _stamp
from arcade_core.catalogue_spectrum import SpectrumSource, media_signature
from arcade_core.paths import ConfinedRoot, PathConfinementError
from arcade_core.persistence import atomic_write_json
from arcade_core.game_versions import VersionDefaults
from arcade_core.scummvm_overrides import ScummvmOverrides


def read_library_key(path):
    value = read_object(path, 1024)
    if (set(value) != {"schemaVersion", "key"} or type(value["schemaVersion"]) is not int
            or value["schemaVersion"] != 1 or not isinstance(value["key"], str)
            or len(value["key"]) != 64 or any(c not in "0123456789abcdef" for c in value["key"])):
        raise CatalogueError("review-required")
    return bytes.fromhex(value["key"])


def library_id(key, parts):
    return hmac.new(key, encoded(parts), hashlib.sha256).hexdigest()


class LibraryCatalogue(CatalogueLifecycle):
    def __init__(self, runtime, config_path):
        super().__init__(runtime, config_path)
        self.key_path = self.runtime / "catalogue-library.json"
        self._validated_targets = None
        self.version_defaults = VersionDefaults(self.runtime)

    def observe_plan(self, plan):
        if self._validated_targets is not None:
            if plan.get("adapterId") == "scummvm":
                self._validated_targets.extend([
                    (str(Path(plan["config"]).parent), plan["config"], plan["configSignature"]),
                    (str(Path(plan["executable"]).parent), plan["executable"], plan["executableSignature"])])
                directory = Path(plan["media"])
                stat = directory.stat()
                self._validated_targets.append((plan["root"], str(directory), [stat.st_dev, stat.st_ino]))
                if plan["target"]["filename"]:
                    filename = ConfinedRoot(directory).resolve(plan["target"]["filename"], require_exists=True)
                    self._validated_targets.append((str(directory), str(filename), media_signature(filename)))
                return
            targets = [(plan["root"], plan["media"], plan["mediaSignature"]),
                       (str(Path(plan["executable"]).parent), plan["executable"], plan["executableSignature"])]
            if plan["profileCopy"]:
                profile = plan["profileCopy"]
                targets.append((profile["root"], profile["source"], profile["signature"]))
            self._validated_targets.extend(targets)

    @contextmanager
    def read_snapshot(self):
        with self._lock:
            try:
                with super().read_snapshot():
                    self._validated_targets = []
                    yield
                    # Recheck only selected targets before any Host approval write.
                    for root, target, signature in self._validated_targets:
                        try:
                            path = ConfinedRoot(Path(root)).resolve(Path(target).relative_to(root), require_exists=True)
                            stat = path.stat()
                            current = [stat.st_dev, stat.st_ino] if len(signature) == 2 and path.is_dir() else media_signature(path)
                            if str(path) != target or current != signature:
                                raise CatalogueError("catalogue-changed")
                        except (OSError, ValueError, PathConfinementError):
                            raise CatalogueError("catalogue-changed") from None
            finally:
                self._validated_targets = None

    def _identity_key(self):
        with _writer_lock(self.key_path):
            if not self.key_path.exists():
                atomic_write_json(self.key_path, {"schemaVersion": 1, "key": secrets.token_hex(32)})
            return read_library_key(self.key_path)

    def _watch(self):
        # A handful of metadata/configuration stamps, independent of game count.
        config = self._config()
        collections = config["collections"]
        if len(collections) > 64:
            raise CatalogueError("review-required")
        stamps = [_stamp(path) for path in (self.config_path, self.registry.path,
                  self.proofs_path, self.journal_path, self.key_path)]
        seen = set()
        for row in collections:
            if not isinstance(row, dict) or not valid_id(row.get("id"), legacy=True) or row["id"] in seen:
                raise CatalogueError("review-required")
            seen.add(row["id"])
            root = row.get("root")
            if not isinstance(root, str) or not Path(root).is_absolute():
                raise CatalogueError("review-required")
            try:
                confined = ConfinedRoot(Path(root))
                if row.get("adapter") == "scummvm-config-v1":
                    config_file = row.get("scummvm_config")
                    if not isinstance(config_file, str) or not Path(config_file).is_absolute():
                        raise CatalogueError("configuration-required")
                    stamps.extend((_stamp(Path(root)), _stamp(Path(config_file)), _stamp(Path(config_file).resolve())))
                    stamps.append(_stamp(ScummvmOverrides(self.runtime, row).path))
                else:
                    stamps.extend((_stamp(Path(root)), _stamp(confined.resolve("collection-metadata.json"))))
            except (OSError, PathConfinementError, CatalogueError):
                stamps.append(None)
        return None, _digest(stamps)

    def _sources_for_library(self):
        key = self._identity_key()
        def identity(parts):
            return library_id(key, parts)
        prepared = self.registry.load()["sources"] if self.registry.path.exists() else {}
        sources = []
        count = 0
        for row in self._config()["collections"]:
            collection_id, root = row["id"], Path(row["root"]).resolve()
            if not root.is_dir():
                continue
            if row.get("adapter") == "scummvm-config-v1":
                from arcade_core.catalogue_scummvm import ScummvmSource
                try:
                    adapter = ScummvmSource(row, identity, self.runtime)
                except (CatalogueError, OSError, PathConfinementError):
                    continue  # An unavailable ScummVM source must not disable Spectrum.
                count += len(adapter.rows)
                if count > 100_000:
                    raise CatalogueError("review-required")
                sources.append(adapter)
                continue
            try:
                metadata = ConfinedRoot(root).resolve("collection-metadata.json")
                if not metadata.is_file():
                    continue
                adapter = SpectrumSource(collection_id, root, None, browse=True)
                rows = adapter._rows()
            except (OSError, PathConfinementError):
                continue
            previous = prepared.get(collection_id)
            if previous and previous["root"] != str(root):
                # Existing prepared bindings require their explicit relocation proof.
                continue
            native = deepcopy(previous) if previous else {
                "sourceId": identity(["source", collection_id, str(root)]), "root": str(root), "entries": {}}
            for legacy, relative, _item in rows:
                native["entries"].setdefault(legacy, {
                    "catalogueId": identity(["entry", collection_id, str(root), legacy]),
                    "relativePath": relative, "signature": []})
            count += len(rows)
            if count > 100_000:
                raise CatalogueError("review-required")
            adapter.registry = SimpleNamespace(load=lambda native=native, cid=collection_id: {"sources": {cid: native}})
            # The surrounding metadata stamp lease keeps these indexed rows current.
            adapter._rows = lambda rows=rows: rows
            index = {legacy: item for legacy, _relative, item in rows}
            adapter._row_index = lambda index=index: index
            sources.append(adapter)
        return sources

    def _ensure_fresh(self):
        with self._lock:
            if self._read_depth:
                return
            self.ensure_settled()
            try:
                self._identity_key()
                _, observed = self._watch()
                if self._service is None or observed != self._observed:
                    sources = self._sources_for_library()
                    if not sources:
                        raise CatalogueError("unavailable")
                    service = self._service or CatalogueService(sources, before_read=self._ensure_fresh)
                    service.version_defaults = self.version_defaults.load
                    # Readers may retain the service between calls. Refresh its
                    # index in place so the first search after an edit succeeds.
                    with service._lock:
                        service._sources = tuple(sources)
                        service.refresh(revision_salt=observed)
                    _, after = self._watch()
                    if after != observed:
                        raise CatalogueError("catalogue-changed")
                    self._service = service
                    self._observed = after
            except (CatalogueError, OSError, PathConfinementError):
                self.invalidate()
                raise
