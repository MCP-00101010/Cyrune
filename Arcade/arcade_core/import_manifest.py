"""Native, non-authorizing interchange for source discovery and import review.

The root is supplied separately by the local caller. These records must never
be returned to Portal: even relative media/artwork references are private.
Validation and review do not install collections, approve bindings or launch.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

from arcade_core.catalogue_identity import CatalogueError, encoded, read_object, relative_media, valid_id
from arcade_core.paths import ConfinedRoot, PathConfinementError


SCHEMA_VERSION = 1
MAX_MANIFEST_BYTES = 32 * 1024 * 1024
MAX_ENTRIES = 100_000
MEDIA_FORMATS = frozenset({".tap", ".tzx", ".z80", ".sna", ".szx"})
# Target kinds are a discriminated union. Each future adapter must explicitly
# register its own shape and review rules; unknown kinds never become files.
ADAPTERS = {"spectrum-managed-v1": ("zx-spectrum", "media-file"),
            "scummvm-config-v1": ("mixed", "scummvm-game")}
BASE_TEXT = {"title": 160, "hardwareLabel": 80, "editionLabel": 160, "year": 16, "publisher": 160}
DETAIL_TEXT = {"description": 2000}
DETAIL_LISTS = {"languages": 16, "countries": 16, "suggestedTags": 80}


def plain_text(value: object, limit: int) -> str:
    if not isinstance(value, str) or len(value) > limit or any(unicodedata.category(c).startswith("C") for c in value):
        raise CatalogueError("review-required")
    return value.strip()


def text_list(value: object, limit: int) -> list[str]:
    if not isinstance(value, (list, tuple)) or len(value) > 12:
        raise CatalogueError("review-required")
    return [plain_text(item, limit) for item in value]


def _shape(value, fields):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise CatalogueError("review-required")


def validate_metadata(value):
    _shape(value, {*BASE_TEXT, *DETAIL_TEXT, *DETAIL_LISTS})
    result = {key: plain_text(value[key], limit) for key, limit in {**BASE_TEXT, **DETAIL_TEXT}.items()}
    result.update({key: text_list(value[key], limit) for key, limit in DETAIL_LISTS.items()})
    if not result["title"]:
        raise CatalogueError("review-required")
    if any(not re.fullmatch(r"[a-z]{2,3}", lang) for lang in result["languages"]):
        raise CatalogueError("review-required")
    if any(not re.fullmatch(r"[A-Z]{2}", country) for country in result["countries"]):
        raise CatalogueError("review-required")
    return result


def _relative(value):
    value = relative_media(value)
    # Keep imported paths unambiguous on Windows, including ADS/device aliases.
    for part in value.split("/"):
        if (part in {"", ".", ".."} or part.endswith((" ", "."))
                or any(c in '<>"|?*' for c in part)
                or re.fullmatch(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", part, re.I)):
            raise CatalogueError("review-required")
    return value


def remote_artwork(value):
    """Untrusted provenance only, never permission to request a URL."""
    value = plain_text(value, 2048)
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.port not in (None, 443)
                or any(c.isspace() or c == "\\" for c in value)):
            raise ValueError
    except ValueError:
        raise CatalogueError("review-required") from None
    return value


def validate_manifest(value):
    """Return a detached normalized value; reject unknown fields and authority."""
    if not isinstance(value, dict):
        raise CatalogueError("review-required")
    if type(value.get("schemaVersion")) is not int or value["schemaVersion"] != SCHEMA_VERSION:
        raise CatalogueError("unsupported-protocol")
    _shape(value, {"schemaVersion", "source", "entries"})
    source = value["source"]
    _shape(source, {"id", "adapter", "platformId"})
    if not valid_id(source["id"], legacy=True):
        raise CatalogueError("review-required")
    adapter = source["adapter"]
    if not isinstance(adapter, str) or adapter not in ADAPTERS:
        raise CatalogueError("unsupported-target")
    platform, kind = ADAPTERS[adapter]
    if source["platformId"] != platform:
        raise CatalogueError("unsupported-target")
    if not isinstance(value["entries"], list) or len(value["entries"]) > MAX_ENTRIES:
        raise CatalogueError("review-required")
    entries, seen_ids, seen_targets = [], set(), set()
    for item in value["entries"]:
        _shape(item, {"id", "metadata", "target", "artwork", "supportFiles", "provenance"})
        if not valid_id(item["id"], legacy=True) or item["id"] in seen_ids:
            raise CatalogueError("review-required")
        seen_ids.add(item["id"])
        target = item["target"]
        if not isinstance(target, dict) or target.get("kind") != kind:
            raise CatalogueError("unsupported-target")
        if kind == "scummvm-game":
            from arcade_core.import_scummvm import validate_target
            target = validate_target(target)
            target_key = target["targetId"].casefold()
        else:
            _shape(target, {"kind", "path"})
            relative = _relative(target["path"])
            if Path(relative).suffix.lower() not in MEDIA_FORMATS:
                raise CatalogueError("unsupported-target")
            target = {"kind": kind, "path": relative}
            target_key = relative.casefold()
        if target_key in seen_targets:
            raise CatalogueError("review-required")
        seen_targets.add(target_key)
        if kind == "scummvm-game" and item["supportFiles"]:
            raise CatalogueError("unsupported-target")
        references = {}
        for key, roles, maximum in (("artwork", {"loading-screen", "screenshot"}, 2),
                                     ("supportFiles", {"pok"}, 128)):
            if not isinstance(item[key], list) or len(item[key]) > maximum:
                raise CatalogueError("review-required")
            references[key] = []
            for ref in item[key]:
                if not isinstance(ref, dict):
                    raise CatalogueError("review-required")
                remote = key == "artwork" and ref.get("kind") == "remote-image"
                _shape(ref, {"role", "kind", "url"} if remote else {"role", "kind", "path"})
                if not isinstance(ref["role"], str) or ref["role"] not in roles:
                    raise CatalogueError("review-required")
                if remote:
                    references[key].append({"role": ref["role"], "kind": "remote-image", "url": remote_artwork(ref["url"])})
                elif ref["kind"] == "local-file":
                    references[key].append({"role": ref["role"], "kind": "local-file", "path": _relative(ref["path"])})
                else:
                    raise CatalogueError("unsupported-target")
        provenance = item["provenance"]
        if not isinstance(provenance, list) or not 1 <= len(provenance) <= 4:
            raise CatalogueError("review-required")
        origins = []
        for origin in provenance:
            _shape(origin, {"provider", "recordId"})
            provider = plain_text(origin["provider"], 80)
            record = plain_text(origin["recordId"], 160)
            if not provider or not record:
                raise CatalogueError("review-required")
            origins.append({"provider": provider, "recordId": record})
        entries.append({"id": item["id"], "metadata": validate_metadata(item["metadata"]),
                        "target": target, **references, "provenance": origins})
    result = {"schemaVersion": SCHEMA_VERSION, "source": dict(source), "entries": entries}
    if len(encoded(result)) > MAX_MANIFEST_BYTES:
        raise CatalogueError("review-required")
    return result


def read_manifest(path):
    return validate_manifest(read_object(Path(path), MAX_MANIFEST_BYTES))


def review_manifest(value, root):
    """Inspect exact local references without opening media or modifying files.

    This is a point-in-time discovery report, never a reusable approval. Apply
    and launch must independently re-resolve paths and check current revisions.
    """
    manifest = validate_manifest(value)
    confined = ConfinedRoot(Path(root))
    if not confined.root.is_dir():
        raise CatalogueError("source-unavailable")
    results = []
    for entry in manifest["entries"]:
        issues = []
        refs = [("target", entry["target"]), *(("artwork", ref) for ref in entry["artwork"]),
                *(("supportFiles", ref) for ref in entry["supportFiles"])]
        for category, ref in refs:
            if ref["kind"] == "remote-image":
                issues.append({"field": category, "code": "remote-artwork-unchecked"})
                continue
            try:
                directory_target = ref["kind"] == "scummvm-game"
                path = confined.resolve(ref["directory"] if directory_target else ref["path"], require_exists=True)
                if directory_target:
                    if not path.is_dir():
                        raise PathConfinementError("Not a directory")
                    if ref["filename"] and not ConfinedRoot(path).resolve(ref["filename"], require_exists=True).is_file():
                        raise PathConfinementError("Not a file")
                elif not path.is_file():
                    raise PathConfinementError("Not a file")
            except FileNotFoundError:
                issues.append({"field": category, "code": "file-missing"})
            except (OSError, PathConfinementError):
                issues.append({"field": category, "code": "review-required"})
        results.append({"id": entry["id"], "issues": issues})
    return {"schemaVersion": SCHEMA_VERSION, "sourceId": manifest["source"]["id"],
            "entryCount": len(results), "entries": results,
            "manifestDigest": hashlib.sha256(encoded(manifest)).hexdigest()}
