"""Game families are presentation only; their members retain exact launch identities."""

import hashlib
import unicodedata

from arcade_core.catalogue_identity import CatalogueError, encoded, read_object, valid_id, _writer_lock
from arcade_core.persistence import atomic_write_json


def family_id(source_id, title, kind=""):
    # Source IDs are private-key-derived opaque identities. Do not strip words
    # such as Deluxe, remake or sequel numbers from a real game title.
    title = " ".join(unicodedata.normalize("NFC", title).casefold().split())
    return hashlib.sha256(encoded(["game-family-v1", source_id, kind, title])).hexdigest()


def entry_family_id(entry):
    target = getattr(entry, "target", None)
    # These adapters have specific game IDs across platform/language editions.
    # Use that identity even when a registration has a typo in its display title.
    # Do not apply this to generic AGS/GLK IDs shared by unrelated games.
    if target and target.get("engineId") in {"scumm", "kyra"}:
        return family_id(entry.base["sourceId"], target["gameId"], entry.base["targetKind"] + ":" + target["engineId"])
    return family_id(entry.base["sourceId"], getattr(entry, "family_title", "") or entry.base["title"], entry.base["targetKind"])


class VersionDefaults:
    def __init__(self, runtime):
        self.path = runtime / "game-version-defaults.json"

    def load(self):
        if not self.path.exists():
            return {}
        data = read_object(self.path, 4 * 1024 * 1024)
        if (set(data) != {"schemaVersion", "defaults"} or type(data["schemaVersion"]) is not int
                or data["schemaVersion"] != 1 or not isinstance(data["defaults"], dict)
                or len(data["defaults"]) > 10000):
            raise CatalogueError("review-required")
        for key, row in data["defaults"].items():
            if (not valid_id(key) or not isinstance(row, dict) or set(row) != {"catalogueId", "gameKey"}
                    or not valid_id(row["catalogueId"]) or not valid_id(row["gameKey"])):
                raise CatalogueError("review-required")
        return data["defaults"]

    def save(self, group_id, catalogue_id, game_key):
        if not all(valid_id(value) for value in (group_id, catalogue_id, game_key)):
            raise CatalogueError("invalid-request")
        with _writer_lock(self.path):
            data = self.load()
            data[group_id] = {"catalogueId": catalogue_id, "gameKey": game_key}
            if len(data) > 10000:
                raise CatalogueError("review-required")
            atomic_write_json(self.path, {"schemaVersion": 1, "defaults": data})


def version_label(entry):
    fields = [entry.base["platformLabel"], entry.base["hardwareLabel"], entry.base["editionLabel"],
              "/".join(entry.detail["languages"]), "/".join(entry.detail["countries"])]
    return " · ".join(dict.fromkeys(value for value in fields if value))[:480]
