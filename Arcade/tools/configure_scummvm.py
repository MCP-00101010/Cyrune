"""Add an existing ScummVM registration file to Arcade's native configuration.

Run once with explicit native paths. Browsing afterwards requires no preparation.
This tool never edits the ScummVM INI, moves media or launches a game.
"""

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.catalogue_identity import CatalogueError, _writer_lock, read_object  # noqa: E402
from arcade_core.emulators import validate_emulator  # noqa: E402
from arcade_core.import_scummvm import scummvm_manifest, launch_preflight  # noqa: E402
from arcade_core.persistence import atomic_write_json  # noqa: E402
from arcade_core.collections import current_config  # noqa: E402


def configure(config_path, root, ini, executable):
    config_path, root, ini, executable = (Path(value).resolve() for value in (config_path, root, ini, executable))
    checkout = Path(__file__).resolve().parents[2]
    if config_path.is_relative_to(checkout) or config_path in {ini, executable}:
        raise ValueError("Arcade runtime configuration must be outside the checkout and separate from ScummVM files")
    manifest = scummvm_manifest("scummvm", root, ini)
    if not manifest["entries"]:
        raise ValueError("No registered ScummVM targets belong to this library")
    for row in manifest["entries"]:
        launch_preflight(root, ini, executable, row["target"])
    with _writer_lock(config_path):
        before = read_object(config_path, 4 * 1024 * 1024)
        if not isinstance(before.get("collections"), list) or not isinstance(before.get("emulators"), dict):
            raise ValueError("Existing Arcade configuration is required")
        config = deepcopy(before)
        collections, emulators = config["collections"], config["emulators"]
        identifier = "scummvm"
        previous = next((row for row in collections if row.get("id") == identifier), None)
        if previous and (previous.get("adapter") != "scummvm-config-v1"
                         or Path(previous.get("root", "")).resolve() != root
                         or Path(previous.get("scummvm_config", "")).resolve() != ini):
            raise ValueError("The scummvm collection ID already refers to another source")
        if any(Path(row.get("root", "")).resolve() == root and row.get("id") != identifier for row in collections):
            raise ValueError("This library is already configured under another collection ID")
        if identifier in emulators and (emulators[identifier].get("type") != "scummvm"
                or Path(emulators[identifier].get("path", "")).resolve() != executable):
            raise ValueError("The scummvm emulator ID already refers to another executable")
        emulators[identifier] = validate_emulator(identifier, {"name": "ScummVM", "type": "scummvm", "path": str(executable), "arguments": []})
        collection = {**(previous or {}), "id": identifier, "name": "ScummVM", "root": str(root),
            "role": "source", "adapter": "scummvm-config-v1", "scummvm_config": str(ini),
            "default_emulator": identifier, "writable": False, "auto_metadata": False}
        if previous:
            collections[collections.index(previous)] = collection
        else:
            if len(collections) >= 64 or len(emulators) > 64:
                raise ValueError("Arcade configuration limit reached")
            collections.append(collection)
        config = current_config(config)
        if config == before:
            return {"ok": True, "changed": False, "games": len(manifest["entries"])}
        digest = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()[:16]
        backup = config_path.with_name(f"{config_path.stem}.before-scummvm-{digest}.json")
        if not backup.exists():
            atomic_write_json(backup, before)
        if read_object(config_path, 4 * 1024 * 1024) != before:
            raise ValueError("Arcade configuration changed; retry after settings are saved")
        atomic_write_json(config_path, config)
    return {"ok": True, "changed": True, "games": len(manifest["entries"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("arcade-config", "root", "scummvm-config", "executable"):
        parser.add_argument("--" + flag, type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(configure(args.arcade_config, args.root, args.scummvm_config, args.executable)))
        return 0
    except (CatalogueError, ValueError, OSError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
