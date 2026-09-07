"""Native entry-owned artwork read, normalization and public response validation."""

import base64
import importlib.util
import os
from pathlib import Path
import sys


def read_artwork(service, catalogue_id, artwork_ref, *, bindings, check):
    descriptor = service.resolve_artwork(catalogue_id, artwork_ref)
    if (not isinstance(descriptor, dict) or set(descriptor) != {"catalogueId", "artworkRef", "entryRevision", "root", "path", "signature"}
            or descriptor["catalogueId"] != catalogue_id or descriptor["artworkRef"] != artwork_ref
            or not isinstance(descriptor["entryRevision"], str) or not bindings.ID.fullmatch(descriptor["entryRevision"])):
        raise bindings.BindingError("review-required")
    root, path = (bindings._path(descriptor[key]) for key in ("root", "path"))
    if not path.is_relative_to(root) or path == root or path.suffix.lower() != ".png":
        raise bindings.BindingError("review-required")
    before = bindings._signature(path)
    if before != descriptor["signature"] or not 0 < before[2] <= 4 * 1024 * 1024:
        raise bindings.BindingError("entry-changed")
    check()
    with path.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        if [opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns] != before:
            raise bindings.BindingError("entry-changed")
        raw = stream.read(4 * 1024 * 1024 + 1)
        opened = os.fstat(stream.fileno())
        if [opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns] != before:
            raise bindings.BindingError("entry-changed")
    if bindings._signature(path) != before or len(raw) > 4 * 1024 * 1024:
        raise bindings.BindingError("entry-changed")
    name = "_cyrune_catalogue_png"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("catalogue_png.py"))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    try:
        png, width, height = sys.modules[name].thumbnail(raw, check=check)
    except (ValueError, OverflowError):
        raise bindings.BindingError("unavailable") from None
    check()
    if bindings._signature(path) != before or service.resolve_artwork(catalogue_id, artwork_ref) != descriptor:
        raise bindings.BindingError("entry-changed")
    return {"schemaVersion": 1, "catalogueId": catalogue_id, "artworkRef": artwork_ref,
            "contentType": "image/png", "width": width, "height": height,
            "data": base64.b64encode(png).decode("ascii")}
