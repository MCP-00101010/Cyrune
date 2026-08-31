"""Filesystem confinement helpers for collection-owned paths."""

from __future__ import annotations

from pathlib import Path


class PathConfinementError(ValueError):
    """Raised when a configured relative path leaves its approved root."""


class ConfinedRoot:
    """Resolve many paths against one canonical root without re-resolving it."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def resolve(self, value: object, *, require_exists: bool = False) -> Path:
        text = str(value or "").strip()
        if not text or "\x00" in text:
            raise PathConfinementError("Path is empty or invalid")
        relative = Path(text)
        if relative.is_absolute():
            raise PathConfinementError("Absolute paths are not allowed")
        target = (self.root / relative).resolve()
        try:
            target.relative_to(self.root)
        except ValueError as exc:
            raise PathConfinementError("Path escapes the approved root") from exc
        if require_exists and not target.exists():
            raise FileNotFoundError(target)
        return target


def resolve_within(root: Path, value: object, *, require_exists: bool = False) -> Path:
    """Resolve a relative path and reject traversal, absolute paths, and symlink escapes."""
    return ConfinedRoot(root).resolve(value, require_exists=require_exists)


def relative_to_root(root: Path, path: Path) -> Path:
    """Return a resolved relative path or reject an out-of-root target."""

    approved_root = root.resolve()
    target = path.resolve()
    try:
        return target.relative_to(approved_root)
    except ValueError as exc:
        raise PathConfinementError("Path escapes the approved root") from exc
