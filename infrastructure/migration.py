"""Small, content-free migration runner shared by Cyrune maintenance tools."""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable


@dataclass(frozen=True)
class MigrationStep:
    id: str
    apply: Callable[[], None]


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as target:
            json.dump(value, target, indent=2, ensure_ascii=False)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)


def run_migration(
    plan: str,
    from_version: int,
    to_version: int,
    steps: Iterable[MigrationStep],
    receipt_path: Path,
    *,
    dry_run: bool = False,
) -> dict:
    """Apply ordered idempotent steps and persist only step IDs and outcomes."""
    ordered = tuple(steps)
    if not plan or from_version < 0 or to_version <= from_version:
        raise ValueError("Migration plan or version range is invalid")
    ids = [step.id for step in ordered]
    if not ids or ids != sorted(ids) or len(ids) != len(set(ids)):
        raise ValueError("Migration steps must have unique, stable, sorted IDs")
    previous = None
    if receipt_path.is_file():
        previous = json.loads(receipt_path.read_text(encoding="utf-8"))
        if previous.get("plan") == plan and previous.get("toVersion") == to_version and previous.get("status") == "completed":
            return previous
    receipt = {
        "schemaVersion": 1,
        "plan": plan,
        "fromVersion": from_version,
        "toVersion": to_version,
        "status": "preview" if dry_run else "running",
        "completedAt": 0,
        "steps": [{"id": step.id, "status": "pending"} for step in ordered],
    }
    if dry_run:
        return receipt
    try:
        for index, step in enumerate(ordered):
            step.apply()
            receipt["steps"][index]["status"] = "completed"
        receipt["status"] = "completed"
        receipt["completedAt"] = int(time.time() * 1000)
        _atomic_json(receipt_path, receipt)
        return receipt
    except Exception:
        receipt["status"] = "failed"
        receipt["completedAt"] = int(time.time() * 1000)
        _atomic_json(receipt_path, receipt)
        raise
