"""First import adapter: preserve managed Spectrum identities and TOSEC editions.

The catalogue uses the same row/metadata normalization as manifest discovery.
Legacy metadata, emulator/profile pins and POK files stay in their existing
stores. No title matching, identity allocation, scanning or apply happens here.
"""

import hashlib
from pathlib import Path
import re

from arcade_core.catalogue_identity import CatalogueError, read_object, relative_media, valid_id
from arcade_core.import_manifest import MAX_MANIFEST_BYTES, MAX_ENTRIES, plain_text, text_list, validate_manifest
from arcade_core.paths import ConfinedRoot


_HARDWARE = re.compile(r"^(?:16K|48K|128K|\+2A?|\+3)(?:[-/](?:16K|48K|128K|\+2A?|\+3))*$")


def spectrum_rows(value):
    from arcade_core.index_schema import index_document
    games = index_document(value).get("games")
    if not isinstance(games, list) or len(games) > MAX_ENTRIES:
        raise CatalogueError("review-required")
    seen_ids, seen_paths, result = set(), set(), []
    for item in games:
        if not isinstance(item, dict):
            raise CatalogueError("review-required")
        relative = relative_media(item.get("file"))
        legacy = item.get("id")
        if legacy in (None, ""):
            # Preserve the legacy loader's exact input, including separators.
            legacy = hashlib.sha1(item["file"].lower().encode("utf-8")).hexdigest()[:16]
        if not valid_id(legacy, legacy=True) or legacy in seen_ids or relative.casefold() in seen_paths:
            raise CatalogueError("review-required")
        seen_ids.add(legacy)
        seen_paths.add(relative.casefold())
        if item.get("status", "Main") == "Main":
            result.append((legacy, relative, item))
    return result


def spectrum_metadata(item, *, strict_hardware=False):
    title = plain_text(item.get("title", ""), 160)
    if not title:
        raise CatalogueError("review-required")
    system = plain_text(item.get("system", ""), 80).upper().replace(" ", "").removeprefix("ZXSPECTRUM")
    memory = plain_text(item.get("memory", ""), 80).upper().replace(" ", "")
    if system and not _HARDWARE.fullmatch(system) or memory and not _HARDWARE.fullmatch(memory):
        raise CatalogueError("review-required")
    if strict_hardware and system and memory and system != memory:
        raise CatalogueError("review-required")
    languages = [lang.lower() for lang in text_list(item.get("languages", []), 16)]
    countries = text_list(item.get("countries", []), 16)
    if any(not re.fullmatch(r"[a-z]{2,3}", lang) for lang in languages):
        raise CatalogueError("review-required")
    if any(not re.fullmatch(r"[A-Z]{2}", country) for country in countries):
        raise CatalogueError("review-required")
    hardware = text_list(item.get("hardware", []), 80)
    edition = [plain_text(item.get(key, ""), 80) for key in ("version", "demo", "development_status")]
    edition.extend(hardware)
    edition.extend(languages)
    edition.extend(countries)
    return {
        "title": title, "hardwareLabel": system or memory,
        "editionLabel": plain_text(" / ".join(dict.fromkeys(v for v in edition if v)), 160),
        "year": plain_text(item.get("year", item.get("date", "")), 16),
        "publisher": plain_text(item.get("publisher", ""), 160),
        "description": plain_text(item.get("description", ""), 2000),
        "languages": languages, "countries": countries,
        "suggestedTags": text_list(item.get("tags", []), 80),
    }


def spectrum_manifest(source_id, root):
    """Produce a native review draft from Main rows; never rewrite source data.

    Explicit POK references are preserved. Legacy title/memory fallback matching
    remains in GameLibrary; a manifest is not a replacement metadata database.
    Unsupported rows or references fail the draft rather than disappear from it.
    """
    metadata = ConfinedRoot(Path(root)).resolve("collection-metadata.json", require_exists=True)
    rows = spectrum_rows(read_object(metadata, MAX_MANIFEST_BYTES))
    entries = []
    for legacy, relative, item in rows:
        poks = item.get("poks", [])
        if not isinstance(poks, list) or len(poks) > 128:
            raise CatalogueError("review-required")
        artwork = []
        for key, role in (("loading_screen", "loading-screen"), ("screenshot", "screenshot")):
            value = item.get(key)
            if value:
                if not isinstance(value, str):
                    raise CatalogueError("review-required")
                artwork.append({"role": role, "kind": "remote-image", "url": value} if "://" in value else
                               {"role": role, "kind": "local-file", "path": value})
        provenance = [{"provider": "collection-metadata", "recordId": legacy}]
        if item.get("scraper_source") and item.get("scraper_id"):
            provenance.append({"provider": item["scraper_source"], "recordId": item["scraper_id"]})
        entries.append({"id": legacy, "metadata": spectrum_metadata(item),
                        "target": {"kind": "media-file", "path": relative}, "artwork": artwork,
                        "supportFiles": [{"role": "pok", "kind": "local-file", "path": path} for path in poks],
                        "provenance": provenance})
    return validate_manifest({"schemaVersion": 1,
        "source": {"id": source_id, "adapter": "spectrum-managed-v1", "platformId": "zx-spectrum"},
        "entries": entries})
