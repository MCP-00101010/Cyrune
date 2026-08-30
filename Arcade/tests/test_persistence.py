import json

import pytest

from emugui_core import persistence


def test_json_object_reader_rejects_malformed_and_non_object_payloads(tmp_path):
    path = tmp_path / "state.json"
    fallback = {"items": []}

    path.write_text("[1, 2, 3]", encoding="utf-8")
    first = persistence.read_json_object(path, fallback)
    first["items"].append("changed")
    path.write_text("{broken", encoding="utf-8")

    assert persistence.read_json_object(path, fallback) == {"items": []}
    assert fallback == {"items": []}


def test_atomic_json_write_preserves_existing_file_when_replace_fails(tmp_path, monkeypatch):
    path = tmp_path / "config.json"
    path.write_text('{"old": true}', encoding="utf-8")
    monkeypatch.setattr(persistence.os, "replace", lambda *_args: (_ for _ in ()).throw(OSError("busy")))

    with pytest.raises(OSError, match="busy"):
        persistence.atomic_write_json(path, {"new": True})

    assert json.loads(path.read_text(encoding="utf-8")) == {"old": True}
    assert list(tmp_path.glob(".config.json.*.tmp")) == []


def test_atomic_copy_preserves_existing_profile_when_replace_fails(tmp_path, monkeypatch):
    source = tmp_path / "source.ini"
    target = tmp_path / "live.ini"
    source.write_text("new profile", encoding="utf-8")
    target.write_text("working profile", encoding="utf-8")
    monkeypatch.setattr(persistence.os, "replace", lambda *_args: (_ for _ in ()).throw(OSError("busy")))

    with pytest.raises(OSError, match="busy"):
        persistence.atomic_copy_file(source, target)

    assert target.read_text(encoding="utf-8") == "working profile"
    assert list(tmp_path.glob(".live.ini.*.tmp")) == []
