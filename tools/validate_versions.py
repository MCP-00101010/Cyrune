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
    relay_changelog = (repo / "Relay" / "Relay-CHANGELOG.md").read_text(encoding="utf-8")
    if f"## [{relay_version}]" not in relay_changelog:
        raise ValueError("Relay changelog has no entry for the manifest version")

    nexus_manifest = json.loads((repo / "Nexus" / "component.json").read_text(encoding="utf-8"))
    nexus_version = str(nexus_manifest.get("version", "") or "")
    if not SEMVER.fullmatch(nexus_version):
        raise ValueError("Nexus component version is missing or invalid")
    nexus_source = (repo / "Nexus" / "source" / "model.js").read_text(encoding="utf-8")
    if f"NEXUS_VERSION = '{nexus_version}'" not in nexus_source:
        raise ValueError("Nexus model version does not align with component metadata")
    if f"id: 'portal', name: 'Portal', version: '{portal_version}'" not in nexus_source:
        raise ValueError("Nexus Portal source metadata does not align with Portal APP_VERSION")
    if f"id: 'relay', name: 'Relay', version: '{relay_version}'" not in nexus_source:
        raise ValueError("Nexus Relay source metadata does not align with the Relay manifest")
    nexus_changelog = (repo / "Nexus" / "Nexus-CHANGELOG.md").read_text(encoding="utf-8")
    if f"## [{nexus_version}]" not in nexus_changelog:
        raise ValueError("Nexus changelog has no entry for the component version")
    return {"Portal": portal_version, "Relay": relay_version, "Nexus": nexus_version}


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
