"""Validated native-only emulator configuration."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Callable


EMULATOR_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]*)\}")
ALLOWED_PLACEHOLDERS = frozenset({
    "file", "file_dir", "file_name", "collection_root", "pok_file", "system", "title",
})
ALLOWED_ADAPTERS = frozenset({"generic", "eightyone", "spectaculator", "spectaculator_stub", "default", "scummvm"})


class EmulatorConfigError(ValueError):
    """Raised when native emulator configuration is unsafe or malformed."""


def load_emulator_defaults(path: Path) -> dict[str, dict[str, object]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EmulatorConfigError(f"Could not load emulator defaults: {exc}") from exc
    if not isinstance(payload, dict):
        raise EmulatorConfigError("Emulator defaults must be an object")
    return {str(key): dict(value) for key, value in payload.items() if isinstance(value, dict)}


def normalize_extensions(value: object) -> list[str]:
    raw = value if isinstance(value, list) else re.split(r"[,\s;]+", str(value or ""))
    extensions: list[str] = []
    for item in raw[:64]:
        extension = str(item).strip().lower()
        if not extension:
            continue
        if not extension.startswith("."):
            extension = f".{extension}"
        if not re.fullmatch(r"\.[a-z0-9+_-]{1,15}", extension):
            raise EmulatorConfigError(f"Invalid supported extension: {extension}")
        if extension not in extensions:
            extensions.append(extension)
    return extensions


def normalize_template(value: object, field: str, *, required_file: bool = False) -> list[str]:
    if value in (None, ""):
        result: list[str] = []
    elif not isinstance(value, list):
        raise EmulatorConfigError(f"{field} must be an argument array")
    else:
        result = []
        for raw in value[:32]:
            argument = str(raw)
            if not argument or len(argument) > 500 or any(character in argument for character in "\r\n\0"):
                raise EmulatorConfigError(f"{field} contains an invalid argument")
            placeholders = PLACEHOLDER_PATTERN.findall(argument)
            unknown = set(placeholders) - ALLOWED_PLACEHOLDERS
            if unknown:
                raise EmulatorConfigError(f"{field} uses unknown placeholder: {{{sorted(unknown)[0]}}}")
            without_placeholders = PLACEHOLDER_PATTERN.sub("", argument)
            if "{" in without_placeholders or "}" in without_placeholders:
                raise EmulatorConfigError(f"{field} contains an invalid placeholder")
            result.append(argument)
    if required_file and not any("{file}" in argument for argument in result):
        raise EmulatorConfigError("Launch arguments must include {file}")
    return result


def validate_emulator(
    emulator_id: object,
    value: object,
    *,
    built_in: dict[str, object] | None = None,
    expand_path: Callable[[object], Path | None] | None = None,
    validate_paths: bool = False,
) -> dict[str, object]:
    identifier = str(emulator_id or "").strip().lower()
    if not EMULATOR_ID_PATTERN.fullmatch(identifier):
        raise EmulatorConfigError("Emulator ID must start with a letter and use only letters, numbers, _ or -")
    if not isinstance(value, dict):
        raise EmulatorConfigError("Emulator settings must be an object")
    name = str(value.get("name") or identifier).strip()
    if not name or len(name) > 120 or any(character in name for character in "\r\n\0"):
        raise EmulatorConfigError("Emulator name is invalid")
    adapter = str(value.get("type") or "generic").strip().lower()
    if built_in:
        adapter = str(built_in.get("type") or adapter)
    if adapter not in ALLOWED_ADAPTERS:
        raise EmulatorConfigError(f"Unsupported emulator adapter: {adapter}")
    result: dict[str, object] = {
        "name": name,
        "type": adapter,
        "path": str(value.get("path") or "").strip(),
        "working_dir": str(value.get("working_dir") or "").strip(),
        "supported_extensions": normalize_extensions(value.get("supported_extensions", [])),
        "arguments": normalize_template(value.get("arguments", [] if adapter == "scummvm" else ["{file}"]), "arguments", required_file=adapter not in {"default", "scummvm"}),
    }
    for field in ("current_arguments", "pok_arguments"):
        template = normalize_template(value.get(field), field)
        if template:
            required_placeholder = "{pok_file}" if field == "pok_arguments" else "{file}"
            if not any(required_placeholder in argument for argument in template):
                raise EmulatorConfigError(f"{field} must include {required_placeholder}")
            result[field] = template
    for field in ("pok_helper_path", "eightyone_config_target"):
        path_value = str(value.get(field) or "").strip()
        if path_value:
            result[field] = path_value
    if adapter == "scummvm" and any(result.get(field) for field in (
            "arguments", "current_arguments", "pok_arguments", "pok_helper_path", "eightyone_config_target", "working_dir")):
        raise EmulatorConfigError("ScummVM uses its registered target and executable directory; custom launch arguments are not supported")
    if built_in:
        result["hidden"] = bool(built_in.get("hidden", False))
    elif value.get("hidden"):
        result["hidden"] = True
    if validate_paths and expand_path and adapter != "default":
        executable = expand_path(result["path"])
        if not executable or not executable.exists() or not executable.is_file():
            raise EmulatorConfigError(f"Emulator executable does not exist: {executable or result['path']}")
        working_dir = expand_path(result["working_dir"])
        if working_dir and (not working_dir.exists() or not working_dir.is_dir()):
            raise EmulatorConfigError(f"Working directory does not exist: {working_dir}")
        helper = expand_path(result.get("pok_helper_path"))
        if helper and (not helper.exists() or not helper.is_file()):
            raise EmulatorConfigError(f"Helper executable does not exist: {helper}")
    return result


class EmulatorConfigService:
    """Merge built-ins with user config and apply validated updates."""

    def __init__(self, *, defaults: dict[str, dict[str, object]], load_config: Callable[[], dict[str, object]],
                 save_config: Callable[[dict[str, object]], None], expand_path: Callable[[object], Path | None]) -> None:
        self.defaults = defaults
        self._load_config = load_config
        self._save_config = save_config
        self._expand_path = expand_path

    def configured(self, include_hidden: bool = True) -> dict[str, dict[str, object]]:
        raw = self._load_config().get("emulators") or {}
        configured = raw if isinstance(raw, dict) else {}
        merged: dict[str, dict[str, object]] = {}
        for emulator_id, defaults in self.defaults.items():
            current = configured.get(emulator_id) if isinstance(configured.get(emulator_id), dict) else {}
            merged[emulator_id] = validate_emulator(emulator_id, {**defaults, **current}, built_in=defaults)
        for emulator_id, emulator in configured.items():
            if emulator_id not in merged and isinstance(emulator, dict):
                merged[emulator_id] = validate_emulator(emulator_id, emulator)
        if include_hidden:
            return merged
        return {key: value for key, value in merged.items() if not value.get("hidden")}

    def save_many(self, payload: object) -> dict[str, dict[str, object]]:
        if not isinstance(payload, list) or len(payload) > 64:
            raise EmulatorConfigError("Expected an emulator list")
        current = self.configured(include_hidden=True)
        for item in payload:
            if not isinstance(item, dict):
                raise EmulatorConfigError("Each emulator must be an object")
            emulator_id = str(item.get("id") or "").strip().lower()
            built_in = self.defaults.get(emulator_id)
            current[emulator_id] = validate_emulator(
                emulator_id, {**current.get(emulator_id, {}), **item}, built_in=built_in,
                expand_path=self._expand_path, validate_paths=True,
            )
            if emulator_id == "spectaculator":
                helper = str(current[emulator_id].get("pok_helper_path") or "")
                stub = {**current.get("spectaculator_stub", self.defaults.get("spectaculator_stub", {})), "path": helper,
                        "working_dir": current[emulator_id].get("working_dir", "")}
                current["spectaculator_stub"] = validate_emulator(
                    "spectaculator_stub", stub, built_in=self.defaults.get("spectaculator_stub")
                )
        config = self._load_config()
        config["emulators"] = current
        self._save_config(config)
        return current

    def delete(self, emulator_id: object) -> None:
        identifier = str(emulator_id or "").strip().lower()
        if identifier in self.defaults:
            raise EmulatorConfigError("Built-in emulators cannot be deleted")
        config = self._load_config()
        emulators = config.get("emulators")
        if not isinstance(emulators, dict) or identifier not in emulators:
            raise EmulatorConfigError("Unknown emulator")
        if any(isinstance(profile, dict) and profile.get("emulator_id") == identifier
               for profile in config.get("emulator_profiles", [])):
            raise EmulatorConfigError("Delete this emulator's managed profiles first")
        emulators.pop(identifier)
        for collection in config.get("collections", []):
            if isinstance(collection, dict) and collection.get("default_emulator") == identifier:
                collection.pop("default_emulator", None)
        self._save_config(config)

    def set_collection_default(self, collection_id: object, emulator_id: object) -> None:
        collection_key = str(collection_id or "").strip()
        emulator_key = str(emulator_id or "").strip().lower()
        if emulator_key and emulator_key not in self.configured(include_hidden=False):
            raise EmulatorConfigError("Unknown collection default emulator")
        config = self._load_config()
        collection = next((item for item in config.get("collections", [])
                           if isinstance(item, dict) and item.get("id") == collection_key), None)
        if not collection:
            raise EmulatorConfigError("Unknown collection")
        if emulator_key:
            collection["default_emulator"] = emulator_key
        else:
            collection.pop("default_emulator", None)
        self._save_config(config)
