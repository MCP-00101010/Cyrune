"""Transport-independent emulator-profile management."""

from __future__ import annotations

import datetime as dt
import hashlib
from pathlib import Path
from typing import Callable

from arcade_core.persistence import atomic_copy_file


class EmulatorProfileService:
    """Manage copied emulator profiles without depending on an HTTP transport."""

    def __init__(
        self,
        *,
        load_config: Callable[[], dict],
        save_config: Callable[[dict], None],
        emulator_provider: Callable[[], dict[str, dict[str, object]]],
        expand_path: Callable[[object], Path | None],
        profile_dir: Path,
        clean_text: Callable[[object], str],
        clean_id: Callable[[str], str],
    ) -> None:
        self._load_config = load_config
        self._save_config = save_config
        self._emulator_provider = emulator_provider
        self._expand_path = expand_path
        self._profile_dir = profile_dir
        self._clean_text = clean_text
        self._clean_id = clean_id

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        return list(dict.fromkeys(items))

    def normalize_rule(self, rule: object) -> dict[str, object]:
        if not isinstance(rule, dict):
            rule = {}
        systems = [str(item).strip().upper() for item in rule.get("systems", []) if str(item).strip()]
        tags = [str(item).strip() for item in rule.get("tags", []) if str(item).strip()]
        return {"systems": self._dedupe(systems), "tags": self._dedupe(tags)}

    def profiles(self) -> list[dict[str, object]]:
        profiles = self._load_config().get("emulator_profiles", [])
        return [profile for profile in profiles if isinstance(profile, dict)]

    def payload(self) -> list[dict[str, object]]:
        payload = []
        for profile in self.profiles():
            item = dict(profile)
            source = self._expand_path(item.get("source_path"))
            managed = self._expand_path(item.get("managed_path"))
            item["source_exists"] = bool(source and source.exists())
            item["managed_exists"] = bool(managed and managed.exists())
            item["source_newer"] = False
            item["source_hash_changed"] = False
            if source and source.exists():
                source_mtime = source.stat().st_mtime
                item["current_source_mtime"] = source_mtime
                item["source_newer"] = source_mtime > float(item.get("source_mtime") or 0) + 0.5
                try:
                    item["source_hash_changed"] = self._file_sha256(source) != item.get("source_hash")
                except OSError:
                    item["source_hash_changed"] = False
            payload.append(item)
        return payload

    def _unique_id(self, emulator_id: str, name: str) -> str:
        base = self._clean_id(f"{emulator_id}-{name}") or f"{emulator_id}-profile"
        used = {str(profile.get("id", "")) for profile in self.profiles()}
        if base not in used:
            return base
        suffix = 2
        while f"{base}-{suffix}" in used:
            suffix += 1
        return f"{base}-{suffix}"

    def import_profile(self, data: dict) -> dict:
        emulator_id = self._clean_id(str(data.get("emulator_id", "")))
        if emulator_id not in self._emulator_provider():
            return {"ok": False, "error": "Unknown emulator"}
        source = self._expand_path(data.get("source_path"))
        if not source or not source.exists() or not source.is_file():
            return {"ok": False, "error": f"Missing profile file: {source}"}
        name = self._clean_text(data.get("name", "")) or source.stem
        profile_id = self._unique_id(emulator_id, name)
        destination_dir = self._profile_dir / emulator_id
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / f"{profile_id}{source.suffix.lower() or '.profile'}"
        atomic_copy_file(source, destination)
        stat = source.stat()
        profile = {
            "id": profile_id,
            "emulator_id": emulator_id,
            "name": name,
            "kind": "file",
            "source_path": str(source),
            "managed_path": str(destination),
            "source_mtime": stat.st_mtime,
            "source_hash": self._file_sha256(source),
            "imported_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
            "priority": int(data.get("priority") or 100),
            "rule": self.normalize_rule(data.get("rule", {})),
        }
        config = self._load_config()
        profiles = [item for item in config.get("emulator_profiles", []) if item.get("id") != profile_id]
        profiles.append(profile)
        config["emulator_profiles"] = profiles
        self._save_config(config)
        return {"ok": True, "profile": profile, "profiles": self.payload()}

    def update_profile(self, data: dict) -> dict:
        profile_id = str(data.get("profile_id", "")).strip()
        if not profile_id:
            return {"ok": False, "error": "Missing profile id"}
        config = self._load_config()
        profiles = config.get("emulator_profiles", [])
        for profile in profiles:
            if profile.get("id") != profile_id:
                continue
            name = self._clean_text(data.get("name", "")) or str(profile.get("name") or profile_id)
            try:
                priority = int(data.get("priority") or profile.get("priority") or 100)
            except (TypeError, ValueError):
                priority = 100
            profile["name"] = name
            profile["priority"] = max(0, min(9999, priority))
            profile["rule"] = self.normalize_rule(data.get("rule", profile.get("rule", {})))
            self._save_config(config)
            return {"ok": True, "profile": profile, "profiles": self.payload()}
        return {"ok": False, "error": "Unknown profile"}

    def delete_profile(self, profile_id: str) -> dict:
        config = self._load_config()
        profiles = []
        removed = None
        for profile in config.get("emulator_profiles", []):
            if profile.get("id") == profile_id:
                removed = profile
                continue
            profiles.append(profile)
        if not removed:
            return {"ok": False, "error": "Unknown profile"}
        config["emulator_profiles"] = profiles
        self._save_config(config)
        managed = self._expand_path(removed.get("managed_path"))
        if managed and managed.exists() and managed.is_relative_to(self._profile_dir):
            try:
                managed.unlink()
            except OSError:
                pass
        return {"ok": True, "profiles": self.payload()}

    def update_from_source(self, profile_id: str) -> dict:
        config = self._load_config()
        profiles = config.get("emulator_profiles", [])
        for profile in profiles:
            if profile.get("id") != profile_id:
                continue
            source = self._expand_path(profile.get("source_path"))
            managed = self._expand_path(profile.get("managed_path"))
            if not source or not source.exists() or not managed:
                return {"ok": False, "error": "Profile source is missing"}
            managed.parent.mkdir(parents=True, exist_ok=True)
            atomic_copy_file(source, managed)
            stat = source.stat()
            profile["source_mtime"] = stat.st_mtime
            profile["source_hash"] = self._file_sha256(source)
            profile["imported_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
            self._save_config(config)
            return {"ok": True, "profile": profile, "profiles": self.payload()}
        return {"ok": False, "error": "Unknown profile"}

    def select(self, emulator_id: str, game: object, profile_id: str = "") -> dict[str, object] | None:
        candidates = [profile for profile in self.profiles() if profile.get("emulator_id") == emulator_id]
        if profile_id:
            return next((profile for profile in candidates if profile.get("id") == profile_id), None)
        pinned_profile = str(getattr(game, "emulator_profile", "") or "")
        if pinned_profile:
            selected = next((profile for profile in candidates if profile.get("id") == pinned_profile), None)
            if selected:
                return selected
        candidates.sort(key=lambda item: int(item.get("priority") or 100))
        fallback = None
        game_system = str(getattr(game, "system", "") or "")
        game_tags = set(getattr(game, "tags", ()) or ())
        for profile in candidates:
            rule = profile.get("rule") if isinstance(profile.get("rule"), dict) else {}
            systems = set(rule.get("systems") or [])
            tags = set(rule.get("tags") or [])
            if not systems and not tags:
                fallback = fallback or profile
                continue
            if systems and game_system in systems:
                return profile
            if tags and tags.intersection(game_tags):
                return profile
        return fallback
