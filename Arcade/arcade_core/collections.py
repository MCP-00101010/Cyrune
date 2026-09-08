"""Transport-independent emulator collection configuration."""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
from typing import Callable
from arcade_core.platforms import collection_platform


COLLECTION_EXTENSIONS = {".tap", ".tzx", ".z80", ".sna", ".szx", ".pok"}
COLLECTION_DIRECTORY_HINTS = {"games", "tap", "tzx", "48k", "128k", "poks", "cheats"}


def looks_like_collection(path: Path) -> bool:
    if (path / "collection-metadata.json").exists():
        return True
    try:
        for child in path.iterdir():
            if child.is_file() and child.suffix.lower() in COLLECTION_EXTENSIONS:
                return True
            if child.is_dir() and child.name.lower() in COLLECTION_DIRECTORY_HINTS:
                return True
    except OSError:
        return False
    return False


def stable_collection_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]


def unique_collection_id(name: str, used: set[str]) -> str:
    base = stable_collection_id(name)
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def file_count_in_tree(root: Path, extensions: set[str] | None = None) -> int:
    if not root.exists() or not root.is_dir():
        return 0
    try:
        return sum(1 for path in root.rglob("*") if path.is_file() and (extensions is None or path.suffix.lower() in extensions))
    except OSError:
        return 0


class CollectionService:
    """Discover, validate, persist, and select collection records."""

    def __init__(
        self,
        *,
        default_root: Path,
        collections_base: Path,
        load_config: Callable[[], dict[str, object]],
        save_config: Callable[[dict[str, object]], None],
        load_state: Callable[[], dict[str, object]],
    ) -> None:
        self.default_root = default_root
        self.collections_base = collections_base
        self._load_config = load_config
        self._save_config = save_config
        self._load_state = load_state

    def discover(self) -> list[dict[str, object]]:
        collections: list[dict[str, object]] = [{
            "id": "desasteron",
            "name": self.default_root.name,
            "root": str(self.default_root),
            "role": "library",
            "writable": True,
            "auto_metadata": True,
        }]
        if not self.collections_base.exists():
            return collections
        for path in sorted(self.collections_base.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_dir() or path.resolve() == self.default_root.resolve() or not looks_like_collection(path):
                continue
            collection_id = unique_collection_id(path.name, {str(item["id"]) for item in collections})
            collections.append({
                "id": collection_id,
                "name": path.name,
                "root": str(path),
                "role": "source",
                "writable": False,
                "auto_metadata": False,
            })
        return collections

    def active_id(self) -> str:
        state = self._load_state()
        active_id = state.get("active_collection_id")
        if active_id:
            return str(active_id)
        return str(self._load_config().get("default_collection", "desasteron"))

    def active(self) -> dict[str, object]:
        config = self._load_config()
        active_id = self.active_id()
        collections = list(config.get("collections", []))
        for item in collections:
            if item.get("id") == active_id:
                return item
        return collections[0] if collections else self.discover()[0]

    def resolve(self, collection_id: str) -> dict[str, object]:
        config = self._load_config()
        collections = list(config.get("collections", []))
        return next((item for item in collections if item.get("id") == collection_id), None) or (
            collections[0] if collections else self.discover()[0]
        )

    def payload(self) -> dict[str, object]:
        active = self.active()
        collections = []
        for item in self._load_config().get("collections", []):
            root = Path(str(item.get("root", "")))
            writable = bool(item.get("writable", False))
            collections.append({
                "id": item.get("id", ""),
                "name": item.get("name", root.name),
                "root": str(root),
                "role": item.get("role", "source"),
                "writable": writable,
                "auto_metadata": bool(item.get("auto_metadata", False)),
                "default_emulator": str(item.get("default_emulator", "") or ""),
                "platform_id": collection_platform(item),
                "incoming_count": file_count_in_tree(root / "incoming", {".tap", ".tzx"}) if writable else 0,
                "trash_count": file_count_in_tree(root / "_Deleted", {".tap", ".tzx"}) if writable else 0,
                "active": item.get("id") == active.get("id"),
                "available": root.exists(),
            })
        return {"collections": collections, "active": active}

    def add(self, root: str, name: str = "", writable: bool = False, auto_metadata: bool = False) -> dict[str, object]:
        path = Path(root).expanduser().resolve()
        if not path.exists() or not path.is_dir():
            return {"ok": False, "error": f"Folder does not exist: {path}"}
        config = self._load_config()
        collections = config.setdefault("collections", [])
        for item in collections:
            if Path(str(item.get("root", ""))).resolve() == path:
                if name.strip():
                    item["name"] = name.strip()
                item["writable"] = writable
                item["auto_metadata"] = auto_metadata
                item["role"] = "library" if writable else "source"
                self._save_config(config)
                return {"ok": True, "collection": item, "existing": True}
        collection_id = unique_collection_id(name or path.name, {str(item.get("id", "")) for item in collections})
        item = {
            "id": collection_id,
            "name": name.strip() or path.name,
            "root": str(path),
            "role": "library" if writable else "source",
            "writable": writable,
            "auto_metadata": auto_metadata,
            "default_emulator": "",
        }
        collections.append(item)
        self._save_config(config)
        return {"ok": True, "collection": item, "existing": False}
