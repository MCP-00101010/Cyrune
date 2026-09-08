"""Unadvertised catalogue v1 projection over explicitly refreshed native sources.

No existing API dispatcher imports this module. The caller owns source refresh,
authentication, concurrency and deadlines before exposing a transport capability.
"""

from __future__ import annotations

import base64
from copy import deepcopy
import hashlib
import hmac
import secrets
import struct
import threading
import time
import unicodedata

from arcade_core.catalogue_identity import CatalogueError, encoded, valid_id
from arcade_core.catalogue_spectrum import SpectrumSource, _text
from arcade_core.paths import ConfinedRoot
from arcade_core.import_scummvm import PLATFORMS
from arcade_core.game_versions import entry_family_id, version_label


MAX_PAGE_BYTES = 256 * 1024
PLATFORM_IDS = {"zx-spectrum", *(item[0] for item in PLATFORMS.values())}
_CURSOR = struct.Struct(">8sQI16s16s")


def _normalized(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


class CatalogueService:
    def __init__(self, sources: list[SpectrumSource], *, clock=time.time, before_read=None):
        if not sources or len(sources) > 64 or len({s.collection_id for s in sources}) != len(sources):
            raise CatalogueError("invalid-request")
        self._sources = tuple(sources)
        self._clock = clock
        self._before_read = before_read
        self._key = secrets.token_bytes(32)
        self._generation = secrets.token_bytes(8)
        self._lock = threading.RLock()
        self._entries = ()
        self._by_id = {}
        self._revision = ""
        self.version_defaults = lambda: {}
        self._families = {}
        self._entry_families = {}

    def invalidate(self) -> None:
        with self._lock:
            self._revision = ""

    def refresh(self, *, revision_salt="") -> None:
        """Replace an index atomically. A failed refresh makes old data unavailable."""
        with self._lock:
            self._revision = ""
            self._entries, self._by_id = (), {}
            entries = [entry for source in self._sources for entry in source.snapshot()]
            entries.sort(key=lambda e: (_normalized(e.base["title"]), e.base["platformId"],
                                        e.base["hardwareLabel"], e.base["editionLabel"], e.base["catalogueId"]))
            by_id = {}
            revision = hmac.new(self._key, digestmod=hashlib.sha256)
            for entry in entries:
                identity = entry.base["catalogueId"]
                if identity in by_id:
                    raise CatalogueError("review-required")
                # A keyed digest does not expose guessed native targets or profile IDs.
                semantic = encoded([entry.base, entry.detail, entry.relative_path, entry.signature, entry.policy, entry.metadata_digest, entry.artwork, revision_salt])
                entry.base["entryRevision"] = hmac.new(self._key, semantic, hashlib.sha256).hexdigest()
                if entry.artwork:
                    entry.base["artworkRef"] = hmac.new(self._key, encoded([identity, entry.base["entryRevision"], entry.artwork]), hashlib.sha256).hexdigest()
                revision.update(encoded([identity, entry.base["entryRevision"]]))
                by_id[identity] = entry
            self._entries, self._by_id = tuple(entries), by_id
            self._families, self._entry_families = {}, {}
            for entry in entries:
                group = entry_family_id(entry)
                self._families.setdefault(group, []).append(entry)
                self._entry_families[entry.base["catalogueId"]] = group
            self._revision = revision.hexdigest()

    def family(self, catalogue_id):
        if self._before_read:
            self._before_read()
        with self._lock:
            return self._family(catalogue_id)

    def _family(self, catalogue_id):
        self._ready()
        group = self._entry_families.get(catalogue_id)
        if group is None:
            raise CatalogueError("entry-missing")
        members = self._families[group]
        saved = self.version_defaults().get(group)
        default_id = saved["catalogueId"] if saved else members[0].base["catalogueId"]
        return group, members, default_id, saved

    def versions(self, catalogue_id):
        if self._before_read:
            self._before_read()
        with self._lock:
            group, members, default_id, _saved = self._family(catalogue_id)
            if len(members) > 1000:
                raise CatalogueError("review-required")
            labels = [version_label(entry) for entry in members]
            counts = {label: labels.count(label) for label in set(labels)}
            seen = {}
            rows = []
            for entry, label in zip(members, labels):
                seen[label] = seen.get(label, 0) + 1
                rows.append({"catalogueId": entry.base["catalogueId"], "entryRevision": entry.base["entryRevision"],
                             "label": label + (f" · Copy {seen[label]}" if counts[label] > 1 else ""),
                             "platformLabel": entry.base["platformLabel"], "languages": list(entry.detail["languages"]),
                             "countries": list(entry.detail["countries"]), "isDefault": entry.base["catalogueId"] == default_id})
            result = {"groupId": group, "title": members[0].base["title"], "defaultId": default_id, "versions": rows}
            if len(encoded(result)) > 512 * 1024:
                raise CatalogueError("review-required")
            return result

    def _ready(self):
        if not self._revision:
            raise CatalogueError("unavailable")

    def _cursor(self, offset: int, query_hash: bytes) -> str:
        body = _CURSOR.pack(self._generation, int(self._clock()) + 300, offset,
                            query_hash, bytes.fromhex(self._revision)[:16])
        mac = hmac.new(self._key, body, hashlib.sha256).digest()[:16]
        return base64.urlsafe_b64encode(body + mac).decode("ascii").rstrip("=")

    def _offset(self, cursor: str, query_hash: bytes) -> int:
        if not cursor:
            return 0
        try:
            data = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
            if len(data) != _CURSOR.size + 16:
                raise ValueError
            generation, expires, offset, request, revision = _CURSOR.unpack(data[:-16])
        except (ValueError, struct.error):
            raise CatalogueError("invalid-request") from None
        if generation != self._generation:
            raise CatalogueError("catalogue-changed")
        if not hmac.compare_digest(data[-16:], hmac.new(self._key, data[:-16], hashlib.sha256).digest()[:16]):
            raise CatalogueError("invalid-request")
        if request != query_hash:
            raise CatalogueError("invalid-request")
        if expires <= self._clock() or revision != bytes.fromhex(self._revision)[:16]:
            raise CatalogueError("catalogue-changed")
        return offset

    def search(self, params: object = None) -> dict:
        if params is None:
            params = {}
        if not isinstance(params, dict) or set(params) - {"query", "platformIds", "pageSize", "cursor", "includeScummvm", "includeAtari", "includeGameBoy", "groupVersions"}:
            raise CatalogueError("invalid-request")
        try:
            query = _normalized(_text(params.get("query", ""), 160))
            cursor = _text(params.get("cursor", ""), 256)
        except CatalogueError:
            raise CatalogueError("invalid-request") from None
        if not cursor.isascii():
            raise CatalogueError("invalid-request")
        platforms = params.get("platformIds", [])
        size = params.get("pageSize", 50)
        scummvm = params.get("includeScummvm", False)
        atari = params.get("includeAtari", False)
        gameboy = params.get("includeGameBoy", False)
        grouped = params.get("groupVersions", False)
        if (not isinstance(platforms, list) or len(platforms) > 4
                or type(scummvm) is not bool
                or type(gameboy) is not bool
                or type(atari) is not bool
                or type(grouped) is not bool
                or any(not isinstance(p, str) or p not in ((PLATFORM_IDS if scummvm else ({"zx-spectrum", "atari-st"} if atari else {"zx-spectrum"})) | ({"game-boy"} if gameboy else set())) for p in platforms)
                or len(set(platforms)) != len(platforms)
                or type(size) is not int or not 1 <= size <= 100):
            raise CatalogueError("invalid-request")
        terms = query.split()
        defaults = self.version_defaults() if grouped else {}
        query_hash = hashlib.sha256(encoded([terms, sorted(platforms), size, scummvm, atari, gameboy, grouped, defaults])).digest()[:16]
        if self._before_read:
            self._before_read()
        with self._lock:
            self._ready()
            offset = self._offset(cursor, query_hash)
            response = {"schemaVersion": 1, "catalogueRevision": self._revision, "entries": [], "nextCursor": ""}
            page_bytes = len(encoded(response)) + 256  # reserve the bounded cursor
            count, has_more = 0, False
            seen_groups = set()
            for entry in self._entries:
                # Game Boy is available through Arcade and its exact shortcuts.
                # Picker publication needs its own negotiated adapter capability.
                if entry.base['platformId'] == 'game-boy' and not gameboy:
                    continue
                if entry.base['targetKind'] == 'disk-set' and not atari:
                    continue
                if entry.base["targetKind"] == "scummvm-game" and not scummvm:
                    continue
                if platforms and entry.base["platformId"] not in platforms:
                    continue
                if not all(term in _normalized(entry.base["title"]) for term in terms):
                    continue
                projection = entry.base
                if grouped:
                    group = self._entry_families[entry.base["catalogueId"]]
                    if group in seen_groups:
                        continue
                    seen_groups.add(group)
                    members = self._families[group]
                    default_id = defaults.get(group, {}).get("catalogueId", members[0].base["catalogueId"])
                    default = next((row for row in members if row.base["catalogueId"] == default_id), None)
                    projection = dict((default or members[0]).base)
                    if default is None:
                        projection["availability"] = "review-required"
                    if len(members) > 1:
                        platform_labels = list(dict.fromkeys(row.base["platformLabel"] for row in members))
                        hardware_labels = list(dict.fromkeys(row.base["hardwareLabel"] for row in members if row.base["hardwareLabel"]))
                        projection["hardwareLabel"] = " / ".join((platform_labels if len(platform_labels) > 1 else []) + hardware_labels)[:80]
                        languages = sorted({lang for row in members for lang in row.detail["languages"]})
                        projection["editionLabel"] = f"{len(members)} versions" + (" · " + "/".join(languages) if languages else "")
                        projection["editionLabel"] = projection["editionLabel"][:160]
                if count < offset:
                    count += 1
                    continue
                # Account incrementally instead of repeatedly serializing the page.
                entry_bytes = len(encoded(projection)) + 1
                if len(response["entries"]) >= size or page_bytes + entry_bytes > MAX_PAGE_BYTES:
                    has_more = True
                    break
                response["entries"].append(deepcopy(projection))
                page_bytes += entry_bytes
                count += 1
            if has_more:
                if not response["entries"]:
                    raise CatalogueError("review-required")
                response["nextCursor"] = self._cursor(count, query_hash)
            return response

    def presentation(self, catalogue_id):
        """Native display metadata; does not participate in approval revisions."""
        from arcade_core.game_presentation import language_codes
        if not valid_id(catalogue_id):
            raise CatalogueError('invalid-request')
        if self._before_read:
            self._before_read()
        with self._lock:
            self._ready()
            entry = self._by_id.get(catalogue_id)
            if entry is None:
                raise CatalogueError('entry-missing')
            languages = language_codes(entry.detail.get('languages'))
            systems = [entry.base['platformLabel']]
            if entry.base['platformId'] in {'zx-spectrum', 'game-boy'} or entry.base['targetKind'] == 'disk-set':
                source = next(source for source in self._sources if source.collection_id == entry.collection_id)
                row = source._row_index().get(entry.legacy_id, {})
                languages = language_codes(row.get('languages'), row.get('language', ''))
                systems = [entry.base['hardwareLabel']] if entry.base['hardwareLabel'] else []
            return {'languages': languages[:12], 'systems': systems}

    def detail(self, params: object) -> dict:
        if not isinstance(params, dict) or set(params) != {"catalogueId"} or not valid_id(params["catalogueId"]):
            raise CatalogueError("invalid-request")
        if self._before_read:
            self._before_read()
        with self._lock:
            self._ready()
            entry = self._by_id.get(params["catalogueId"])
            if entry is None:
                raise CatalogueError("entry-missing")
            return {"schemaVersion": 1, "entry": deepcopy({**entry.base, **entry.detail})}

    def resolve_artwork(self, catalogue_id, artwork_ref):
        """Private descriptor; the native authority must confine and bound its read."""
        if not valid_id(catalogue_id) or not isinstance(artwork_ref, str) or not artwork_ref:
            raise CatalogueError("invalid-request")
        if self._before_read:
            self._before_read()
        with self._lock:
            self._ready()
            entry = self._by_id.get(catalogue_id)
            if entry is None:
                raise CatalogueError("entry-missing")
            if not entry.artwork or not hmac.compare_digest(entry.base["artworkRef"], artwork_ref):
                raise CatalogueError("entry-changed")
            source = next(s for s in self._sources if s.collection_id == entry.collection_id)
            item = source._row_index().get(entry.legacy_id)
            if item is None or source.artwork_target(item) != entry.artwork:
                raise CatalogueError("entry-changed")
            relative, signature = entry.artwork
            from arcade_core.entry_artwork import location
            root, path = location(source.root, getattr(source, 'runtime', None), relative)
            if not signature:
                from arcade_core.catalogue_spectrum import media_signature
                try:
                    signature = media_signature(path)
                except OSError:
                    raise CatalogueError('unavailable') from None
            return {"catalogueId": catalogue_id, "artworkRef": artwork_ref, "entryRevision": entry.base["entryRevision"],
                    "root": str(root), "path": str(path), "signature": list(signature)}

    def resolve_native(self, catalogue_id: str, entry_revision: str):
        """Internal resolution only. Host must still authorize and validate policy."""
        if self._before_read:
            self._before_read()
        with self._lock:
            self._ready()
            entry = self._by_id.get(catalogue_id)
            if entry is None:
                raise CatalogueError("entry-missing")
            if entry.base["entryRevision"] != entry_revision:
                raise CatalogueError("entry-changed")
            source = next(s for s in self._sources if s.collection_id == entry.collection_id)
            return source.resolve_native(entry)
