#!/usr/bin/env python3
"""Write a bounded, content-free Nexus receipt after coordinated validation."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ALLOWED_TESTS = {
    "Portal", "Widgets", "Arcade", "Relay", "Host", "Nexus",
    "Migration", "Packaging", "Tooling",
}
ALLOWED_CHECKS = {"syntax", "manifest", "versions", "packaging", "lint", "infrastructure"}
ALLOWED_CHECK_STATES = {"passed", "failed", "skipped", "unavailable"}
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def default_receipt_path() -> Path:
    override = str(os.environ.get("CYRUNE_NEXUS_DATA", "") or "").strip()
    if override:
        root = Path(override).expanduser()
    elif sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        root = Path(base) / "Cyrune" / "Nexus"
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
        root = Path(base) / "Cyrune" / "Nexus"
    return root.resolve() / "validation.json"


def parse_pairs(values: list[str], allowed: set[str], kind: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for item in values:
        name, separator, value = str(item).partition("=")
        if not separator or name not in allowed or name in parsed:
            raise ValueError(f"Unsupported or duplicate {kind} entry")
        parsed[name] = value
    return parsed


def component_versions(repo: Path) -> dict[str, str]:
    versions = {}
    for component in ("Portal", "Widgets", "Arcade", "Relay", "Host", "Nexus"):
        manifest = json.loads((repo / component / "component.json").read_text(encoding="utf-8"))
        versions[component] = str(manifest.get("version", "") or "")
    if any(not SEMVER.fullmatch(value) for value in versions.values()):
        raise ValueError("A component version is missing or invalid")
    return versions


def current_commit(repo: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=8,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    commit = (result.stdout or "").strip()
    if result.returncode != 0 or not re.fullmatch(r"[0-9a-fA-F]{40,64}", commit):
        raise RuntimeError("The repository commit could not be identified")
    return commit


def build_receipt(repo: Path, test_values: list[str], check_values: list[str], timestamp: int | None = None) -> dict:
    tests = parse_pairs(test_values, ALLOWED_TESTS, "test")
    checks = parse_pairs(check_values, ALLOWED_CHECKS, "check")
    if set(tests) != ALLOWED_TESTS or set(checks) != ALLOWED_CHECKS:
        raise ValueError("The validation receipt is incomplete")
    normalized_tests = {}
    for name, value in tests.items():
        if not re.fullmatch(r"[0-9]{1,7}", value):
            raise ValueError("A validation test count is invalid")
        count = int(value)
        if count > 1_000_000:
            raise ValueError("A validation test count is too large")
        normalized_tests[name] = {"passed": count, "failed": 0, "skipped": 0}
    if any(value not in ALLOWED_CHECK_STATES for value in checks.values()):
        raise ValueError("A validation check state is invalid")
    sampled = int(time.time() * 1000) if timestamp is None else timestamp
    if not isinstance(sampled, int) or isinstance(sampled, bool) or sampled < 0:
        raise ValueError("The validation timestamp is invalid")
    return {
        "schemaVersion": 1,
        "timestamp": sampled,
        "commit": current_commit(repo),
        "versions": component_versions(repo),
        "tests": normalized_tests,
        "checks": checks,
    }


def atomic_write_receipt(path: Path, receipt: dict, repo: Path) -> None:
    destination = path.resolve()
    repository = repo.resolve()
    try:
        destination.relative_to(repository)
    except ValueError:
        pass
    else:
        raise ValueError("Nexus validation receipts must remain outside the repository")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as target:
            json.dump(receipt, target, ensure_ascii=False, indent=2)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary_name, destination)
    finally:
        if os.path.exists(temporary_name):
            os.remove(temporary_name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--test", action="append", default=[])
    parser.add_argument("--check", action="append", default=[])
    args = parser.parse_args()
    try:
        repo = args.repo.resolve()
        receipt = build_receipt(repo, args.test, args.check)
        atomic_write_receipt(default_receipt_path(), receipt, repo)
        print("Sanitized Nexus validation receipt written.")
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Validation receipt failed: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
