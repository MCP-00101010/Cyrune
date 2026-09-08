"""Source-scoped managed Spectrum projection, with no collection activation.

Native callers supply prepared identities or a direct-library identity mapping.
No scraping, launch, metadata writes or implicit root reattachment occurs here.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

from arcade_core.catalogue_identity import CatalogueError, IdentityRegistry, encoded, read_object, relative_media, valid_id
from arcade_core.paths import ConfinedRoot, PathConfinementError
from arcade_core.catalogue_snapshot import snapshot_cached
from arcade_core.import_manifest import MEDIA_FORMATS, BASE_TEXT, DETAIL_TEXT, DETAIL_LISTS, plain_text as _text
from arcade_core.import_spectrum import spectrum_rows, spectrum_metadata


MAX_METADATA_BYTES = 32 * 1024 * 1024


def media_signature(path: Path) -> list[int]:
    stat = path.stat()
    if not path.is_file():
        raise OSError("not a file")
    return [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns]


def _metadata_digest(item: dict) -> str:
    try:
        raw = json.dumps(item, sort_keys=True, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
        return hashlib.sha256(raw.encode("ascii")).hexdigest()
    except (ValueError, TypeError, RecursionError):
        raise CatalogueError("review-required") from None


@dataclass(frozen=True)
class SpectrumEntry:
    """Private indexed record. Only base/detail may be returned to a client."""

    base: dict
    detail: dict
    legacy_id: str
    collection_id: str
    relative_path: str
    signature: tuple[int, ...]
    policy: tuple[str, str]
    metadata_digest: str = ""
    artwork: tuple | None = None


@dataclass(frozen=True)
class ScrapedSpectrumEntry(SpectrumEntry):
    """Retain pre-scrape family identity without changing other adapter records."""

    family_title: str = ''


class SpectrumSource:
    media_formats = MEDIA_FORMATS
    platform_id = 'zx-spectrum'
    platform_label = 'ZX Spectrum'

    def project_metadata(self, item):
        return spectrum_metadata(item, strict_hardware=not self.browse)

    def __init__(self, collection_id: str, root: Path, registry: IdentityRegistry, *, browse=False):
        if not valid_id(collection_id, legacy=True):
            raise CatalogueError("invalid-request")
        self.collection_id = collection_id
        self.root = Path(root).resolve()
        self.registry = registry
        self.browse = browse

    @snapshot_cached
    def _rows(self) -> list[tuple[str, str, dict]]:
        if not self.root.is_dir():
            raise CatalogueError("source-unavailable")
        try:
            metadata = ConfinedRoot(self.root).resolve("collection-metadata.json", require_exists=True)
            value = read_object(metadata, MAX_METADATA_BYTES)
        except (OSError, PathConfinementError):
            raise CatalogueError("source-unavailable") from None
        from arcade_core.shared_metadata import shared_rows
        rows = spectrum_rows(value)
        shared = shared_rows([item for _, _, item in rows])
        return [(legacy, relative, item) for (legacy, relative, _), item in zip(rows, shared)]

    @snapshot_cached
    def _row_index(self):
        return {legacy: item for legacy, _relative, item in self._rows()}

    def artwork_target(self, item):
        from arcade_core.entry_artwork import target
        return target(self.root, getattr(self, 'runtime', None), item)

    def prepare(self, *, expected_revision: int, dry_run: bool = True, allow_managed_moves: bool = False) -> dict:
        """Explicitly pin metadata aliases; dry runs do not write any file."""
        confined = ConfinedRoot(self.root)
        records = []
        for legacy, relative, _item in self._rows():
            try:
                target = confined.resolve(relative, require_exists=True)
                signature = media_signature(target)
            except (OSError, PathConfinementError):
                raise CatalogueError("review-required") from None
            if target.suffix.lower() not in self.media_formats:
                raise CatalogueError("unsupported-target")
            records.append({"legacyId": legacy, "relativePath": relative, "signature": signature})
        return self.registry.prepare(self.collection_id, self.root, records,
                                     expected_revision=expected_revision, dry_run=dry_run,
                                     allow_managed_moves=allow_managed_moves)

    def snapshot(self) -> list[SpectrumEntry]:
        """Build an allowlisted index; browse mode defers media checks to Add."""
        state = self.registry.load()
        source = state["sources"].get(self.collection_id)
        if not source:
            raise CatalogueError("review-required")
        if source["root"] != str(self.root):
            raise CatalogueError("source-unavailable")
        confined = ConfinedRoot(self.root)
        entries = []
        for legacy, relative, item in self._rows():
            identity = source["entries"].get(legacy)
            if identity is None:
                raise CatalogueError("review-required")
            availability, signature = "configuration-required", ()
            try:
                if self.browse:
                    # Browsing projects metadata; only Add/launch opens game media.
                    availability = "available" if Path(relative).suffix.lower() in self.media_formats else "unsupported"
                else:
                    target = confined.resolve(relative, require_exists=True)
                    signature = tuple(media_signature(target))
                    if target.suffix.lower() not in self.media_formats:
                        availability = "unsupported"
                    elif relative != identity["relativePath"] or list(signature) != identity["signature"]:
                        availability = "review-required"
            except FileNotFoundError:
                availability = "media-missing"
            except (OSError, PathConfinementError):
                availability = "review-required"
            base = {
                "catalogueId": identity["catalogueId"], "sourceId": source["sourceId"],
                "entryRevision": "", "title": "Unavailable entry", "platformId": self.platform_id,
                "platformLabel": self.platform_label, "hardwareLabel": "", "editionLabel": "",
                "targetKind": "media-file", "year": "", "publisher": "",
                "availability": availability, "artworkRef": "",
            }
            detail = {"description": "", "languages": [], "countries": [], "suggestedTags": []}
            policy = ("", "")
            family_title = ''
            try:
                metadata = self.project_metadata(item)
                family_title = _text(item.get('scrape_family_title', metadata['title']), 160)
                base.update({key: metadata[key] for key in BASE_TEXT})
                detail.update({key: metadata[key] for key in (*DETAIL_TEXT, *DETAIL_LISTS)})
                policy = (_text(item.get("default_emulator", ""), 120), _text(item.get("emulator_profile", ""), 120))
                # Until Host validates a configured native policy, do not claim readiness.
                if len(encoded(base)) + 64 > 2048 or len(encoded({**base, **detail})) + 64 > 15 * 1024:
                    raise CatalogueError("review-required")
            except CatalogueError:
                base.update(title="Unavailable entry", hardwareLabel="", editionLabel="", year="", publisher="",
                            availability="review-required")
                detail = {"description": "", "languages": [], "countries": [], "suggestedTags": []}
                policy = ("", "")
            digest = _metadata_digest(item)
            entries.append(ScrapedSpectrumEntry(base, detail, legacy, self.collection_id, relative, signature, policy, digest,
                                         self.artwork_target(item), family_title))
        return entries

    def resolve_native(self, entry: SpectrumEntry) -> Path:
        """Private exact-source target check for the future Host adapter, no launch."""
        if entry.collection_id != self.collection_id:
            raise CatalogueError("entry-missing")
        if entry.base["availability"] not in {"ready", "available", "configuration-required"}:
            code = "unsupported-target" if entry.base["availability"] == "unsupported" else entry.base["availability"]
            raise CatalogueError(code)
        current_row = self._row_index().get(entry.legacy_id)
        if current_row is None:
            raise CatalogueError("entry-missing")
        if _metadata_digest(current_row) != entry.metadata_digest:
            raise CatalogueError("entry-changed")
        current = self.registry.load()["sources"].get(self.collection_id)
        identity = current["entries"].get(entry.legacy_id) if current else None
        if not current or current["root"] != str(self.root):
            raise CatalogueError("source-unavailable")
        if not identity or identity["catalogueId"] != entry.base["catalogueId"] or identity["relativePath"] != entry.relative_path:
            raise CatalogueError("entry-changed")
        try:
            target = ConfinedRoot(self.root).resolve(entry.relative_path, require_exists=True)
            signature = media_signature(target)
            if ((identity["signature"] and signature != identity["signature"])
                    or (not self.browse and tuple(signature) != entry.signature)):
                raise CatalogueError("entry-changed")
            if target.suffix.lower() not in self.media_formats:
                raise CatalogueError("unsupported-target")
            return target
        except FileNotFoundError:
            raise CatalogueError("media-missing") from None
        except (OSError, PathConfinementError):
            raise CatalogueError("review-required") from None
