#!/usr/bin/env python3
"""Map changed Cyrune paths to the smallest safe validation suite set."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


SUITES = ("Portal", "Widgets", "Arcade", "Relay", "Host", "Nexus", "Migration", "Packaging", "Tooling")


def affected_suites(paths: list[str]) -> list[str]:
    selected: set[str] = set()
    for raw in paths:
        path = str(raw or "").replace("\\", "/").lstrip("./")
        if not path:
            continue
        if (path.startswith("infrastructure/") or path == "AGENTS.md"
                or path.startswith("docs/architecture/") or path.endswith("/component.json")):
            return list(SUITES)
        component = path.split("/", 1)[0]
        if component in SUITES[:6]:
            selected.add(component)
            if component == "Widgets":
                selected.add("Portal")
            if component == "Arcade":
                selected.update({"Relay", "Host"})
            if component == "Relay":
                selected.update({"Host", "Packaging"})
            if component == "Host":
                selected.add("Relay")
            if component == "Nexus":
                selected.update({"Relay", "Host"})
        elif path.startswith("tests/migration/"):
            selected.add("Migration")
        elif path.startswith("tests/packaging/"):
            selected.add("Packaging")
        elif path.startswith("tests/tooling/") or path.startswith("tools/"):
            selected.add("Tooling")
    return [suite for suite in SUITES if suite in selected]


def git_changed_paths(repo: Path) -> list[str]:
    commands = (["git", "diff", "--name-only", "HEAD"], ["git", "ls-files", "--others", "--exclude-standard"])
    paths = []
    for command in commands:
        result = subprocess.run(command, cwd=repo, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10)
        if result.returncode != 0:
            raise RuntimeError("Changed paths could not be read")
        paths.extend(line for line in result.stdout.splitlines() if line)
    return sorted(set(paths))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--git", action="store_true")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        paths = git_changed_paths(args.repo.resolve()) if args.git else args.paths
        print(json.dumps(affected_suites(paths)))
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Affected-suite selection failed: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
