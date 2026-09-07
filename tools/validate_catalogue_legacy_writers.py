"""Check the pre-catalogue writers against disposable prepared data.

Uses the exact repository baseline (Arcade 0.2.2 / Host 0.2.0), never live data.
Run: python -B tools/validate_catalogue_legacy_writers.py
"""

import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
import zipfile


REPO = Path(__file__).resolve().parents[1]
BASELINE = "860c7ec"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def legacy(root, operation):
    sys.path.insert(0, str(root / "legacy/Arcade"))
    host = load("legacy_host", root / "legacy/Host/morpheus_host.py")
    host.save_config(host.load_config())
    arcade = load("legacy_arcade", root / "legacy/Arcade/arcade_service.py")
    arcade.init_state = lambda: None
    if operation == "edit":
        assert arcade.update_game_metadata(["game000"], {"title": "Legacy edited title"})["ok"]
    else:
        assert arcade.rename_game("game000", "Legacy renamed.tap")["ok"]


def main():
    if len(sys.argv) > 1:
        legacy(Path(sys.argv[1]), sys.argv[2])
        return
    with tempfile.TemporaryDirectory(prefix="Cyrune-legacy-writer-") as temporary:
        root = Path(temporary)
        fixture = load("catalogue_fixture", REPO / "tests/migration/test_catalogue_workflow.py")
        fixture.prepare_fixture(root)
        os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"), CYRUNE_ARCADE_DATA=str(root / "Arcade"),
                          CYRUNE_ARCADE_COLLECTION=str(root / "spectrum"), CYRUNE_ARCADE_COLLECTIONS_BASE=str(root),
                          CYRUNE_NEXUS_DATA=str(root / "Nexus"), PYTHONDONTWRITEBYTECODE="1")
        archive = subprocess.run(["git", "archive", "--format=zip", BASELINE, "Arcade", "Host"], cwd=REPO,
                                 check=True, capture_output=True).stdout
        with zipfile.ZipFile(io.BytesIO(archive)) as files:
            for member in files.infolist():
                target = (root / "legacy" / member.filename).resolve()
                assert target.is_relative_to(root / "legacy")
                if not member.is_dir():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(files.read(member))
        host = load("current_host", REPO / "Host/morpheus_host.py")
        arcade = host._load_emugui_module()
        transport = host.get_catalogue_transport()
        opened = transport.handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1, "role": "portal",
            "tabId": 7, "pageUrl": (REPO / "Portal/index.html").as_uri()})
        def request(kind, payload):
            response = transport.handle({"type": kind, "protocol": 1, "sessionId": opened["sessionId"], "payload": payload})
            assert response["ok"], response
            return response
        page = request("ARCADE_CATALOGUE_SEARCH", {"query": "Game 000"})
        bound = request("ARCADE_CATALOGUE_BIND_ENTRIES", {"requestId": str(uuid.uuid4()), "entries": [
            {"catalogueId": row["catalogueId"], "entryRevision": row["entryRevision"]} for row in page["entries"]]})
        assert all(row["ok"] for row in bound["results"])
        private_files = [root / "catalogue-bindings.json", root / "Arcade/catalogue-identities.json",
                         root / "Arcade/catalogue-proofs.json"]
        # Locate Host's sibling binding store through its native configuration convention.
        private_files[0] = host.get_catalogue_transport()._store.path
        before = {path: path.read_bytes() for path in private_files}
        for operation in ("edit", "rename"):
            result = subprocess.run([sys.executable, "-B", str(Path(__file__)), str(root), operation],
                                    capture_output=True, text=True, timeout=30)
            assert result.returncode == 0, result.stdout + result.stderr
            assert all(path.read_bytes() == data for path, data in before.items())
            metadata = json.loads((root / "spectrum/collection-metadata.json").read_text(encoding="utf-8"))
            assert metadata["games"][0]["id"] == "game000"
            page = request("ARCADE_CATALOGUE_SEARCH", {"query": "Legacy edited title"})
            assert len(page["entries"]) == 1
            if operation == "edit":
                assert page["entries"][0]["availability"] == "ready"
            else:
                assert page["entries"][0]["availability"] == "review-required"
        print(json.dumps({"ok": True, "baseline": BASELINE,
            "checks": ["old Host config save preserves new approvals", "old Arcade edit preserves pinned IDs and registry",
                       "old Arcade rename requires review instead of silently rebinding"]}))


if __name__ == "__main__":
    main()
