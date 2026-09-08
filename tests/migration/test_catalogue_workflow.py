"""Joined Portal/content/Relay/native Host/Arcade acceptance with fake media."""

import json
import os
from pathlib import Path
import subprocess
import struct
import sys
import zlib

import pytest


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def prepare_fixture(tmp_path, entries=125, *, prepared=True):
    runtime, source = tmp_path / "Arcade", tmp_path / "spectrum"
    runtime.mkdir()
    source.mkdir()
    executable = tmp_path / "fixture.exe"
    executable.write_bytes(b"Synthetic executable; never run")
    rows = []
    for index in range(entries):
        filename = f"game{index:03}.tap"
        (source / filename).write_bytes(f"Synthetic media {index}".encode())
        rows.append({"id": f"game{index:03}", "title": f"Game {index:03}", "file": filename,
                     "system": "128K" if index % 2 else "48K", "memory": "128K" if index % 2 else "48K",
                     "tags": ["Action"], "description": "Synthetic catalogue game"})
    # Two editions deliberately share a title; selection must preserve both.
    rows[1]["title"] = rows[0]["title"]
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(b"\0\xff\0\0\xff")) + chunk(b"IEND", b""))
    (source / "screenshot.png").write_bytes(png)
    rows[0]["screenshot"] = rows[1]["screenshot"] = "screenshot.png"
    (source / "collection-metadata.json").write_text(json.dumps({"games": rows, "poks": []}), encoding="utf-8")
    (runtime / "config.json").write_text(json.dumps({
        "collections": [{"id": "spectrum", "root": str(source), "writable": True, "default_emulator": "fixture"}],
        "emulators": {"fixture": {"type": "generic", "path": str(executable), "arguments": ["--game", "{file}"]}},
        "emulator_profiles": []}), encoding="utf-8")
    (tmp_path / "host.json").write_text(json.dumps({"arcadeRoot": str(REPO / "Arcade"),
        "databasePath": str(tmp_path / "portal.json"), "approvedGames": {}}), encoding="utf-8")
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    if not prepared:
        return env
    prepared = subprocess.run([sys.executable, "-B", str(HERE / "catalogue_native_fixture.py"), str(tmp_path), "prepare"],
                              capture_output=True, text=True, env=env, timeout=120)
    assert prepared.returncode == 0, prepared.stderr
    return env


def add_scummvm_fixture(root):
    source = root / "ScummVM"
    source.mkdir()
    ini = root / "scummvm.ini"
    registrations = ["[scummvm]\nmusic_volume=120\n"]
    for target, platform, language in (("adventure-en", "pc", "en"), ("adventure-de", "windows", "de")):
        directory = source / target
        directory.mkdir()
        registrations.append(f"[{target}]\nengineid=scumm\ngameid=monkey\ndescription=ScummVM Adventure ({language})\npath={directory}\nplatform={platform}\nlanguage={language}\n")
    ini.write_text("\n".join(registrations), encoding="utf-8")
    completed = subprocess.run([sys.executable, "-B", str(REPO / "Arcade/tools/configure_scummvm.py"),
        "--arcade-config", str(root / "Arcade/config.json"), "--root", str(source),
        "--scummvm-config", str(ini), "--executable", str(root / "fixture.exe")], capture_output=True, text=True, timeout=30)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert json.loads(completed.stdout)["games"] == 2


def test_scummvm_joined_workflow(tmp_path):
    env = prepare_fixture(tmp_path, prepared=False)
    add_scummvm_fixture(tmp_path)
    before = (tmp_path / "scummvm.ini").read_bytes()
    completed = subprocess.run(["node", str(HERE / "catalogue_workflow.cjs"), str(tmp_path), "scummvm", sys.executable],
                               capture_output=True, text=True, env=env, timeout=60)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert (tmp_path / "scummvm.ini").read_bytes() == before


@pytest.mark.parametrize("scenario", ["happy", "stale-entry", "lost-column", "save-conflict", "reconnect",
                                     "old-content", "old-host", "old-arcade", "closed-gate"])
def test_catalogue_workflow(tmp_path, scenario):
    env = prepare_fixture(tmp_path)
    completed = subprocess.run(["node", str(HERE / "catalogue_workflow.cjs"), str(tmp_path), scenario, sys.executable],
                               capture_output=True, text=True, env=env, timeout=60)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert json.loads(completed.stdout)["scenario"] == scenario


def test_unprepared_library_workflow(tmp_path):
    env = prepare_fixture(tmp_path, prepared=False)
    before = (tmp_path / "spectrum/collection-metadata.json").read_bytes()
    completed = subprocess.run(["node", str(HERE / "catalogue_workflow.cjs"), str(tmp_path), "happy", sys.executable],
                               capture_output=True, text=True, env=env, timeout=60)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert (tmp_path / "spectrum/collection-metadata.json").read_bytes() == before
    assert not (tmp_path / "Arcade/catalogue-identities.json").exists()
    assert not (tmp_path / "Arcade/catalogue-proofs.json").exists()


def add_atari_fixture(root):
    source = root / 'Atari'
    source.mkdir()
    for language, system in [('en', ''), ('de', '(STE)')]:
        for disk in (1, 2, 3):
            (source / f'Atari Adventure (1990)(Publisher)({language}){system}(Disk {disk} of 3).st').write_bytes(bytes([disk]) * 1024)
    (root / 'steem.ini').write_text('[Machine]\n', encoding='utf-8')
    completed = subprocess.run([sys.executable, '-B', str(REPO / 'Arcade/tools/configure_atari.py'),
        '--arcade-config', str(root / 'Arcade/config.json'), '--root', str(source),
        '--executable', str(root / 'fixture.exe'), '--apply'], capture_output=True, text=True, timeout=30)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert json.loads(completed.stdout)['editions'] == 2
