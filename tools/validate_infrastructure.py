#!/usr/bin/env python3
"""Validate Cyrune manifests, protocol declarations and compatibility metadata."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

try:
    from build_component_registry import load_manifests, render_registry
except ModuleNotFoundError:
    _registry_spec = importlib.util.spec_from_file_location(
        "cyrune_build_component_registry", Path(__file__).with_name("build_component_registry.py")
    )
    _registry_module = importlib.util.module_from_spec(_registry_spec)
    _registry_spec.loader.exec_module(_registry_module)
    load_manifests = _registry_module.load_manifests
    render_registry = _registry_module.render_registry


def _object(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain an object")
    return value


def validate(repo: Path) -> dict:
    manifests = load_manifests(repo)
    ids = {manifest["id"] for manifest in manifests}
    catalogue = _object(repo / "infrastructure" / "protocols.json")
    if set(catalogue) != {"schemaVersion", "protocols"} or catalogue["schemaVersion"] != 1:
        raise ValueError("Protocol catalogue schema is invalid")
    protocols = catalogue["protocols"]
    if not isinstance(protocols, dict) or list(protocols) != sorted(protocols):
        raise ValueError("Protocol catalogue keys must be sorted")
    for name, contract in protocols.items():
        if set(contract) != {"version", "participants", "maxMessageBytes", "summary"}:
            raise ValueError(f"Protocol {name} fields are invalid")
        participants = contract["participants"]
        if participants != sorted(set(participants)) or not set(participants).issubset(ids):
            raise ValueError(f"Protocol {name} participants are invalid")
        if not isinstance(contract["version"], int) or contract["version"] < 1:
            raise ValueError(f"Protocol {name} version is invalid")
        if not isinstance(contract["maxMessageBytes"], int) or not 1024 <= contract["maxMessageBytes"] <= 16 * 1024 * 1024:
            raise ValueError(f"Protocol {name} size limit is invalid")
    for manifest in manifests:
        for name, version in manifest["protocols"].items():
            contract = protocols.get(name)
            if not contract or manifest["id"] not in contract["participants"] or version > contract["version"]:
                raise ValueError(f"{manifest['id']} declares unsupported protocol {name} v{version}")
    relay_source = (repo / "Relay" / "background.js").read_text(encoding="utf-8")
    relay_match = re.search(r"const RELAY_PROTOCOLS = Object\.freeze\(\{([\s\S]*?)\}\);", relay_source)
    relay_runtime = {name: int(version) for name, version in re.findall(r"'([a-z-]+)'\s*:\s*([0-9]+)", relay_match.group(1) if relay_match else "")}
    relay_manifest = next(manifest for manifest in manifests if manifest["id"] == "relay")
    if relay_runtime != relay_manifest["protocols"]:
        raise ValueError("Relay runtime protocol advertisement does not match its component manifest")
    content_source = (repo / "Relay" / "content.js").read_text(encoding="utf-8")
    manifest_by_id = {manifest["id"]: manifest for manifest in manifests}
    for component_id, constant in (("portal", "PORTAL_CLIENT_PROTOCOLS"), ("arcade", "ARCADE_CLIENT_PROTOCOLS"), ("nexus", "NEXUS_CLIENT_PROTOCOLS")):
        match = re.search(rf"const {constant} = Object\.freeze\(\{{([^}}]+)\}}\);", content_source)
        advertised = {name: int(version) for name, version in re.findall(r"'([a-z-]+)'\s*:\s*([0-9]+)", match.group(1) if match else "")}
        if advertised != manifest_by_id[component_id]["protocols"]:
            raise ValueError(f"{component_id} page protocol advertisement does not match its component manifest")
    host_source = (repo / "Host" / "morpheus_host.py").read_text(encoding="utf-8")
    if "HOST_PROTOCOLS = dict(HOST_COMPONENT_MANIFEST.get('protocols') or {})" not in host_source:
        raise ValueError("Host runtime does not source protocols from its component manifest")
    registry = repo / "Nexus" / "source" / "component-registry.js"
    if registry.read_text(encoding="utf-8") != render_registry(manifests):
        raise ValueError("Generated Nexus component registry is out of date")

    compatibility = _object(repo / "docs" / "architecture" / "compatibility-register.json")
    if set(compatibility) != {"schemaVersion", "entries"} or compatibility["schemaVersion"] != 1:
        raise ValueError("Compatibility register schema is invalid")
    entry_ids = []
    for entry in compatibility["entries"]:
        if set(entry) != {"id", "canonical", "legacy", "owners", "status", "removalCondition"}:
            raise ValueError("Compatibility register entry fields are invalid")
        if not entry["legacy"] or entry["owners"] != sorted(set(entry["owners"])) or not set(entry["owners"]).issubset(ids):
            raise ValueError(f"Compatibility entry {entry.get('id')} is invalid")
        entry_ids.append(entry["id"])
    if len(entry_ids) != len(set(entry_ids)):
        raise ValueError("Compatibility entry IDs must be unique")
    return {"components": len(manifests), "protocols": len(protocols), "compatibilityEntries": len(entry_ids)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.repo.resolve()), indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Infrastructure validation failed: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
