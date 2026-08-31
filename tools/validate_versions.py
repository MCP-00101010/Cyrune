#!/usr/bin/env python3
"""Validate independent Cyrune component version declarations."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

try:
    from build_component_registry import COMPONENTS, load_manifests, render_registry
except ModuleNotFoundError:
    _registry_spec = importlib.util.spec_from_file_location(
        "cyrune_build_component_registry", Path(__file__).with_name("build_component_registry.py")
    )
    _registry_module = importlib.util.module_from_spec(_registry_spec)
    _registry_spec.loader.exec_module(_registry_module)
    COMPONENTS = _registry_module.COMPONENTS
    load_manifests = _registry_module.load_manifests
    render_registry = _registry_module.render_registry


SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def validate(repo: Path) -> dict[str, str]:
    manifests = load_manifests(repo)
    versions = {directory: manifest["version"] for directory, manifest in zip(COMPONENTS, manifests)}
    portal_source = (repo / "Portal" / "source" / "app.js").read_text(encoding="utf-8")
    portal_html = (repo / "Portal" / "index.html").read_text(encoding="utf-8")
    portal_match = re.search(r"APP_VERSION\s*=\s*'([^']+)'", portal_source)
    if not portal_match or not SEMVER.fullmatch(portal_match.group(1)):
        raise ValueError("Portal APP_VERSION is missing or invalid")
    portal_version = portal_match.group(1)
    if portal_version != versions["Portal"]:
        raise ValueError("Portal APP_VERSION does not align with its component manifest")
    if portal_html.count(f"v{portal_version}") != 1 or portal_html.count(f"Version {portal_version}") != 1:
        raise ValueError("Portal displayed version fallbacks do not align with APP_VERSION")

    relay = json.loads((repo / "Relay" / "manifest.json").read_text(encoding="utf-8"))
    relay_version = str(relay.get("version", "") or "")
    if not SEMVER.fullmatch(relay_version):
        raise ValueError("Relay manifest version is missing or invalid")
    if relay_version != versions["Relay"]:
        raise ValueError("Relay extension and component manifest versions do not align")

    nexus_version = versions["Nexus"]
    if not SEMVER.fullmatch(nexus_version):
        raise ValueError("Nexus component version is missing or invalid")
    nexus_source = (repo / "Nexus" / "source" / "model.js").read_text(encoding="utf-8")
    if f"NEXUS_VERSION = '{nexus_version}'" not in nexus_source:
        raise ValueError("Nexus model version does not align with component metadata")
    registry = repo / "Nexus" / "source" / "component-registry.js"
    if registry.read_text(encoding="utf-8") != render_registry(manifests):
        raise ValueError("Generated Nexus component registry is out of date")
    for directory, version in versions.items():
        changelog = (repo / directory / f"{directory}-CHANGELOG.md").read_text(encoding="utf-8")
        if f"## [{version}]" not in changelog:
            raise ValueError(f"{directory} changelog has no entry for {version}")
    return versions


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
