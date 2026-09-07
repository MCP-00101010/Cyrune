"""Independent Host validation of Arcade's configured ScummVM launch decisions."""

import configparser
import hashlib
from pathlib import Path, PurePosixPath
import re


PLATFORMS = {"unknown": "Unspecified platform", "dos": "DOS", "windows": "Windows", "fm-towns": "FM Towns",
             "amiga": "Amiga", "atari-st": "Atari ST", "macintosh": "Macintosh", "zx-spectrum": "ZX Spectrum"}
ALIASES = {"": "unknown", "pc": "dos", "dos": "dos", "win": "windows", "windows": "windows",
           "towns": "fm-towns", "fmtowns": "fm-towns", "amiga": "amiga", "ami": "amiga",
           "atari": "atari-st", "atari-st": "atari-st", "mac": "macintosh", "macintosh": "macintosh"}


def validate(plan, bindings):
    fail = bindings.BindingError
    fields = {"schemaVersion", "catalogueId", "sourceId", "entryRevision", "collectionId", "gameId", "adapterId",
              "emulatorId", "profileId", "root", "media", "config", "configSignature", "target", "targetDigest",
              "executable", "executableSignature", "cwd", "arguments", "public"}
    if (not isinstance(plan, dict) or set(plan) != fields or len(bindings.encoded(plan)) > 64 * 1024
            or type(plan["schemaVersion"]) is not int or plan["schemaVersion"] != 2
            or plan["adapterId"] != "scummvm" or plan["profileId"] != ""):
        raise fail("review-required")
    for key in ("catalogueId", "sourceId", "entryRevision", "collectionId", "gameId", "emulatorId"):
        if not isinstance(plan[key], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", plan[key]):
            raise fail("review-required")
    root, directory, config_path, executable, cwd = (bindings._path(plan[key]) for key in ("root", "media", "config", "executable", "cwd"))
    if not root.is_dir() or directory == root or not directory.is_relative_to(root) or not directory.is_dir():
        raise fail("source-unavailable")
    if executable.suffix.lower() != ".exe" or cwd != executable.parent:
        raise fail("configuration-required")
    for key, path in (("configSignature", config_path), ("executableSignature", executable)):
        value = plan[key]
        if not isinstance(value, list) or len(value) != 4 or any(type(n) is not int or n < 0 for n in value):
            raise fail("review-required")
        if bindings._signature(path) != value:
            raise fail("entry-changed")
    target = plan["target"]
    if not isinstance(target, dict) or set(target) != {"kind", "targetId", "engineId", "gameId", "directory", "platform", "language", "extra", "filename"}:
        raise fail("review-required")
    if target["kind"] != "scummvm-game":
        raise fail("unsupported-target")
    for key in ("targetId", "engineId", "gameId"):
        if not isinstance(target[key], str) or not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_-]{0,119}", target[key]):
            raise fail("review-required")
    def relative(value):
        if (not isinstance(value, str) or not 0 < len(value) <= 1024 or value.startswith(("/", "\\"))
                or ":" in value or "\\" in value or any(ord(c) < 32 for c in value)
                or any(p in {".", ".."} for p in value.split("/"))):
            raise fail("review-required")
        return Path(*PurePosixPath(value).parts)
    if (root / relative(target["directory"])).resolve() != directory:
        raise fail("review-required")
    if target["filename"]:
        selector = (directory / relative(target["filename"])).resolve()
        if not selector.is_relative_to(directory) or not selector.is_file():
            raise fail("media-missing")
    for key, limit in (("platform", 32), ("language", 16), ("extra", 160), ("filename", 1024)):
        bindings._text(target[key], limit)
    try:
        with config_path.open("rb") as stream:
            raw = stream.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024 or b"\x00" in raw:
            raise fail("review-required")
        configuration = configparser.ConfigParser(interpolation=None, strict=True, delimiters=("=",), empty_lines_in_values=False)
        configuration.read_string(raw.decode("utf-8-sig"))
        sections = configuration.sections()
        if configuration.defaults() or len(sections) > 10_016 or len(set(s.casefold() for s in sections)) != len(sections):
            raise fail("review-required")
        if target["targetId"].casefold() == "scummvm" or not configuration.has_section(target["targetId"]):
            raise fail("entry-missing")
        native = configuration[target["targetId"]]
        native_path = Path(native.get("path", ""))
        if not native_path.is_absolute() or native_path.resolve() != directory:
            raise fail("entry-changed")
        for key, field in (("engineId", "engineid"), ("gameId", "gameid"), ("platform", "platform"),
                           ("language", "language"), ("extra", "extra"), ("filename", "filename")):
            expected = native.get(field, "")
            if key == "filename":
                expected = expected.replace("\\", "/")
            if target[key] != expected:
                raise fail("entry-changed")
    except (OSError, UnicodeError, configparser.Error):
        raise fail("review-required") from None
    if bindings._signature(config_path) != plan["configSignature"]:
        raise fail("entry-changed")
    arguments = ["--no-console", "--config=" + str(config_path), "--path=" + str(directory), target["targetId"]]
    if plan["arguments"] != arguments:
        raise fail("review-required")
    public = plan["public"]
    platform = ALIASES.get(target["platform"])
    if (not isinstance(public, dict) or set(public) != {"title", "systemId", "systemName"}
            or not platform or public["systemId"] != platform or public["systemName"] != PLATFORMS[platform]
            or not bindings._text(public["title"], 160)):
        raise fail("review-required")
    digest = hashlib.sha256(bindings.encoded({"config": str(config_path), "root": str(root), "target": target})).hexdigest()
    if plan["targetDigest"] != digest:
        raise fail("review-required")
    directory_stat = directory.stat()
    return {"mode": "scummvm-entry-v1", "sourceId": plan["sourceId"], "catalogueId": plan["catalogueId"],
            "targetDigest": digest, "config": str(config_path), "directory": str(directory),
            "directoryIdentity": [directory_stat.st_dev, directory_stat.st_ino],
            "executable": str(executable), "executableSignature": plan["executableSignature"], "cwd": str(cwd)}
