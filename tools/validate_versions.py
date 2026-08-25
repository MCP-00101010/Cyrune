#!/usr/bin/env python3
"""Validate independent Cyrune component version declarations."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def validate(repo: Path) -> dict[str, str]:
    portal_source = (repo / "Portal" / "source" / "app.js").read_text(encoding="utf-8")
    portal_html = (repo / "Portal" / "index.html").read_text(encoding="utf-8")
    portal_match = re.search(r"APP_VERSION\s*=\s*'([^']+)'", portal_source)
    if not portal_match or not SEMVER.fullmatch(portal_match.group(1)):
        raise ValueError("Portal APP_VERSION is missing or invalid")
    portal_version = portal_match.group(1)
    if portal_html.count(f"v{portal_version}") != 1 or portal_html.count(f"Version {portal_version}") != 1:
        raise ValueError("Portal displayed version fallbacks do not align with APP_VERSION")

    relay = json.loads((repo / "Relay" / "manifest.json").read_text(encoding="utf-8"))
    relay_version = str(relay.get("version", "") or "")
    if not SEMVER.fullmatch(relay_version):
        raise ValueError("Relay manifest version is missing or invalid")
    relay_changelog = (repo / "Relay" / "CHANGELOG.md").read_text(encoding="utf-8")
    if f"## [{relay_version}]" not in relay_changelog:
        raise ValueError("Relay changelog has no entry for the manifest version")
    return {"Portal": portal_version, "Relay": relay_version}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.repo.resolve()), indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Version validation failed: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
