"""Read existing ScummVM registrations as exact native import candidates.

Only the configured library subtree is admitted. The original INI remains the
settings owner; manifests never copy global settings or grant process authority.
"""

import configparser
import hashlib
from pathlib import Path
import re

from arcade_core.catalogue_identity import CatalogueError, encoded, valid_id
from arcade_core.import_manifest import _relative, _shape, plain_text, validate_manifest
from arcade_core.paths import ConfinedRoot, PathConfinementError


MAX_CONFIG_BYTES = 4 * 1024 * 1024
MAX_TARGETS = 10_000
PLATFORMS = {
    "": ("unknown", "Unspecified platform"),
    "pc": ("dos", "DOS"), "dos": ("dos", "DOS"),
    "windows": ("windows", "Windows"), "win": ("windows", "Windows"),
    "fmtowns": ("fm-towns", "FM Towns"), "towns": ("fm-towns", "FM Towns"),
    "amiga": ("amiga", "Amiga"), "ami": ("amiga", "Amiga"),
    "atari": ("atari-st", "Atari ST"), "atari-st": ("atari-st", "Atari ST"),
    "macintosh": ("macintosh", "Macintosh"), "mac": ("macintosh", "Macintosh"),
}
LANGUAGES = {code: code for code in (
    "ar be bg br ca cs da de el en es et eu fa fi fr he hr hu it ja ko lt lv nb nl pl pt ru sk sr sv tr uk zh".split())}
LANGUAGES.update({"gb": "en", "us": "en", "fr-ca": "fr", "cn": "zh", "tw": "zh", "": ""})
TARGET_FIELDS = {"kind", "targetId", "engineId", "gameId", "directory", "platform", "language", "extra", "filename"}


def platform_presentation(target):
    """Arcade display only: Steam is an explicit edition, not an inferred OS."""
    platform, label = PLATFORMS[target["platform"]]
    markers = re.split(r"[/,;()]", target["extra"])
    steam = any(re.fullmatch(r"steam(?:\s+(?:release|version|edition|demo))?", marker.strip(), re.IGNORECASE)
                for marker in markers)
    if steam:
        return ("Steam",) if platform == "unknown" else (label, "Steam")
    return (label,)


def validate_target(value):
    _shape(value, TARGET_FIELDS)
    if value["kind"] != "scummvm-game":
        raise CatalogueError("unsupported-target")
    for key in ("targetId", "engineId", "gameId"):
        if not valid_id(value[key], legacy=True) or value[key].startswith("-"):
            raise CatalogueError("review-required")
    for key, allowed in (("platform", PLATFORMS), ("language", LANGUAGES)):
        if not isinstance(value[key], str) or value[key] not in allowed:
            raise CatalogueError("unsupported-target")
    result = {**value, "directory": _relative(value["directory"]), "extra": plain_text(value["extra"], 160)}
    if not isinstance(value["filename"], str):
        raise CatalogueError("review-required")
    result["filename"] = _relative(value["filename"]) if value["filename"] else ""
    return result


def read_configuration(path):
    """Strict, bounded native INI parsing with no default-section inheritance."""
    try:
        with Path(path).open("rb") as stream:
            raw = stream.read(MAX_CONFIG_BYTES + 1)
        if len(raw) > MAX_CONFIG_BYTES or b"\x00" in raw:
            raise CatalogueError("review-required")
        config = configparser.ConfigParser(interpolation=None, strict=True, delimiters=("=",),
                                           empty_lines_in_values=False)
        config.read_string(raw.decode("utf-8-sig"))
        sections = config.sections()
        if (config.defaults() or len(sections) > MAX_TARGETS + 16
                or len({section.casefold() for section in sections}) != len(sections)):
            raise CatalogueError("review-required")
        return config
    except (UnicodeError, configparser.Error, RecursionError):
        raise CatalogueError("review-required") from None
    except OSError:
        raise CatalogueError("source-unavailable") from None


def _registration(root, target_id, values):
    original = values.get("path", "")
    if not isinstance(original, str) or not original or any(ord(c) < 32 for c in original):
        raise CatalogueError("review-required")
    path = Path(original)
    if not path.is_absolute():
        # ScummVM relative paths depend on its process directory, which is not
        # evidence that the files belong to this configured source.
        raise CatalogueError("review-required")
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        return None  # Another configured library is not part of this source.
    try:
        confined = ConfinedRoot(root)
        confined.resolve(relative)  # Reject symlink escapes even during discovery.
    except (OSError, PathConfinementError):
        raise CatalogueError("review-required") from None
    target = validate_target({"kind": "scummvm-game", "targetId": target_id,
        "engineId": values.get("engineid", ""), "gameId": values.get("gameid", ""),
        "directory": relative, "platform": values.get("platform", ""),
        "language": values.get("language", ""), "extra": values.get("extra", ""),
        "filename": values.get("filename", "")})
    if target["filename"]:
        try:
            ConfinedRoot(confined.resolve(relative)).resolve(target["filename"])
        except (OSError, PathConfinementError):
            raise CatalogueError("review-required") from None
    return target


def scummvm_manifest(source_id, root, config_path):
    root = Path(root).resolve()
    if not root.is_dir():
        raise CatalogueError("source-unavailable")
    config = read_configuration(config_path)
    entries = []
    for section in config.sections():
        values = dict(config[section])
        if section.casefold() == "scummvm" or "path" not in values:
            continue
        target = _registration(root, section, values)
        if target is None:
            continue
        description = plain_text(values.get("description", ""), 160)
        if not description:
            raise CatalogueError("review-required")
        # ScummVM edition descriptions can contain nested qualifiers.
        match = re.fullmatch(r"(.+?) \(((?:[^()]|\([^()]*\))*)\)", description)
        title, edition = match.groups() if match else (description, target["extra"])
        language = LANGUAGES[target["language"]]
        # Configured target identity survives edits to title, directory or settings.
        # Retargeting still requires a different native approval at the later gate.
        entry_id = "scummvm_" + hashlib.sha256(section.encode("utf-8")).hexdigest()[:32]
        entries.append({"id": entry_id, "metadata": {
            "title": title, "hardwareLabel": "", "editionLabel": edition, "year": "", "publisher": "",
            "description": "", "languages": [language] if language else [], "countries": [], "suggestedTags": []},
            "target": target, "artwork": [], "supportFiles": [],
            "provenance": [{"provider": "scummvm-configuration", "recordId": section}]})
        if len(entries) > MAX_TARGETS:
            raise CatalogueError("review-required")
    return validate_manifest({"schemaVersion": 1,
        "source": {"id": source_id, "adapter": "scummvm-config-v1", "platformId": "mixed"}, "entries": entries})


def configured_target(root, config_path, expected):
    """Recheck one exact registration for native launch preflight; no fallback."""
    expected = validate_target(expected)
    config = read_configuration(config_path)
    if not config.has_section(expected["targetId"]):
        raise CatalogueError("entry-missing")
    current = _registration(Path(root).resolve(), expected["targetId"], dict(config[expected["targetId"]]))
    if current != expected:
        raise CatalogueError("entry-changed")
    try:
        directory = ConfinedRoot(Path(root)).resolve(expected["directory"], require_exists=True)
        if not directory.is_dir():
            raise PathConfinementError("Not a directory")
        if expected["filename"]:
            file = ConfinedRoot(directory).resolve(expected["filename"], require_exists=True)
            if not file.is_file():
                raise PathConfinementError("Not a file")
        return directory
    except FileNotFoundError:
        raise CatalogueError("media-missing") from None
    except (OSError, PathConfinementError):
        raise CatalogueError("review-required") from None


def launch_preflight(root, config_path, executable, target):
    """Private exact argument plan for the later Host adapter, never execution.

    Preserve native ScummVM settings/save semantics by naming its configured
    target. Do not use auto-detection or a bare engine game ID as a substitute.
    """
    directory = configured_target(root, config_path, target)
    executable, config_path = Path(executable).resolve(), Path(config_path).resolve()
    if not executable.is_file() or executable.suffix.lower() != ".exe":
        raise CatalogueError("configuration-required")
    platform, label = PLATFORMS[target["platform"]]
    return {"adapterId": "scummvm", "executable": str(executable), "cwd": str(executable.parent),
            "arguments": ["--no-console", "--config=" + str(config_path), "--path=" + str(directory), target["targetId"]],
            "platformId": platform, "platformLabel": label,
            "targetDigest": hashlib.sha256(encoded({"config": str(config_path), "root": str(Path(root).resolve()),
                                                    "target": validate_target(target)})).hexdigest()}
