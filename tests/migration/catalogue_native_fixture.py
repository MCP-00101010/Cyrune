"""Real native Host framing with an isolated prepared Arcade runtime.

Normal scenarios use release advertisements; legacy cases remove support.
Emulator process/window callbacks are fixtures;
legacy active-source initialization is suppressed to test source independence.
No live configuration, collection, secure-store data or emulator is used.
"""

import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess
from types import SimpleNamespace


REPO = Path(__file__).resolve().parents[2]


def main():
    root = Path(sys.argv[1]).resolve()
    mode = sys.argv[2]
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"),
                      CYRUNE_ARCADE_DATA=str(root / "Arcade"),
                      CYRUNE_ARCADE_COLLECTION=str(root / "spectrum"),
                      CYRUNE_ARCADE_COLLECTIONS_BASE=str(root),
                      CYRUNE_NEXUS_DATA=str(root / "Nexus"))
    spec = importlib.util.spec_from_file_location("workflow_host", REPO / "Host/morpheus_host.py")
    host = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = host
    spec.loader.exec_module(host)
    arcade = host._load_emugui_module()
    if mode == "prepare":
        arcade.get_catalogue_lifecycle(create=True).prepare_source("spectrum", dry_run=False)
        return

    # Remove support for legacy participants; normal cases use release manifests.
    if mode == "old-host":
        host.HOST_PROTOCOLS.pop("arcade-catalogue", None)
    bindings = host._catalogue_binding_module()
    read_object = bindings.read_object

    def fixture_manifest(path, limit):
        value = read_object(path, limit)
        if Path(path).resolve() == REPO / "Arcade/component.json" and mode == "old-arcade":
            value["protocols"].pop("arcade-catalogue", None)
        return value

    bindings.read_object = fixture_manifest
    arcade.COLLECTION = root / "different-active-source"
    arcade.METADATA_FILE = arcade.COLLECTION / "collection-metadata.json"
    arcade.init_state = lambda: None
    arcade.find_running_emulator_window = lambda _: 0
    arcade.focus_launched_emulator = lambda *_: None
    arcade.should_check_immediate_exit = lambda _: False

    def no_process(args, **kwargs):
        # Exercise real launch resolution/validation, stopping at OS creation.
        assert mode in {"happy", "scummvm"}
        assert kwargs.get("shell") is False
        assert Path(args[0]) == root / "fixture.exe"
        with (root / "launches.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"args": args, "shell": kwargs["shell"],
                                     "activeSource": arcade.COLLECTION.name}) + "\n")
        def wait(timeout):
            raise subprocess.TimeoutExpired("synthetic emulator", timeout)
        return SimpleNamespace(pid=123, wait=wait, poll=lambda: None)

    host.subprocess.Popen = no_process
    host.main()


if __name__ == "__main__":
    main()
