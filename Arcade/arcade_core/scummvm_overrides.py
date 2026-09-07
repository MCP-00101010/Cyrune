"""Arcade-owned presentation overrides; registrations remain launch authority."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

from arcade_core.catalogue_identity import CatalogueError, encoded, read_object, valid_id, _writer_lock
from arcade_core.import_manifest import plain_text
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json


TEXT_FIELDS = {
    "title": 160, "year": 16, "publisher": 160, "genre": 160, "developer": 160,
    "region": 160, "players": 24, "coop": 24, "rating": 80, "youtube_id": 64,
    "description": 2000, "scraper_source": 160, "scraper_id": 160,
}
ART_FIELDS = {"screenshot", "loading_screen"}
ART_HOSTS = {"cdn.thegamesdb.net", "images.thegamesdb.net", "media.screenscraper.fr",
             "screenscraper.fr", "www.screenscraper.fr"}
MAX_BYTES = 32 * 1024 * 1024


def target_digest(target):
    return hashlib.sha256(json.dumps(target, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def validate_values(values):
    if not isinstance(values, dict) or not values or set(values) - (TEXT_FIELDS.keys() | ART_FIELDS):
        raise CatalogueError("review-required")
    result = {}
    for key, value in values.items():
        value = plain_text(value, TEXT_FIELDS.get(key, 500))
        if not value:
            raise CatalogueError("review-required")
        if key in ART_FIELDS:
            try:
                url = urlsplit(value)
                valid = (url.scheme == "https" and url.hostname in ART_HOSTS and url.port in (None, 443)
                         and not url.username and not url.password and not url.fragment and "\\" not in value)
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("ScummVM artwork must use an approved HTTPS scraper image URL")
        result[key] = value
    return result


class ScummvmOverrides:
    def __init__(self, runtime, collection):
        scope = [collection["id"], str(Path(collection["root"]).resolve()),
                 str(Path(collection["scummvm_config"]).resolve())]
        name = hashlib.sha256(encoded(scope)).hexdigest()
        self.path = ConfinedRoot(Path(runtime)).resolve(f"scummvm-overrides/{name}.json")

    def load(self):
        if not self.path.exists():
            return {}
        data = read_object(self.path, MAX_BYTES)
        if (set(data) != {"schemaVersion", "games"} or type(data["schemaVersion"]) is not int
                or data["schemaVersion"] != 1 or not isinstance(data["games"], dict) or len(data["games"]) > 10000):
            raise CatalogueError("review-required")
        for game_id, row in data["games"].items():
            if (not valid_id(game_id, legacy=True) or not isinstance(row, dict)
                    or set(row) != {"targetDigest", "values"} or not isinstance(row["targetDigest"], str)
                    or len(row["targetDigest"]) != 64 or any(c not in "0123456789abcdef" for c in row["targetDigest"])):
                raise CatalogueError("review-required")
            try:
                validate_values(row["values"])
            except ValueError:
                raise CatalogueError("review-required") from None
        return data["games"]

    @staticmethod
    def values(rows, game_id, target):
        row = rows.get(game_id, {})
        return dict(row.get("values", {})) if row.get("targetDigest") == target_digest(target) else {}

    def save(self, game_id, target, values):
        if not valid_id(game_id, legacy=True):
            raise CatalogueError("invalid-request")
        values = validate_values(values)
        with _writer_lock(self.path):
            rows = self.load()
            merged = {**self.values(rows, game_id, target), **values}
            rows[game_id] = {"targetDigest": target_digest(target), "values": merged}
            data = {"schemaVersion": 1, "games": rows}
            if len(rows) > 10000 or len(json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
                raise CatalogueError("review-required")
            atomic_write_json(self.path, data)
        return merged
