"""Exact ScummVM target, mixed catalogue and native launch integration."""

from copy import deepcopy
from pathlib import Path
import os
import subprocess
import uuid

import pytest

from test_catalogue_bindings import setup, read, write, bind  # noqa: F401


class RunningProcess:
    pid = 123
    returncode = None

    def wait(self, timeout):
        assert 0 < timeout <= 1
        raise subprocess.TimeoutExpired("synthetic emulator", timeout)

    def poll(self):
        return self.returncode


@pytest.fixture
def scummvm(request):
    env = request.getfixturevalue("setup")
    root = env.runtime.parent / "ScummVM"
    root.mkdir()
    for name in ("English", "German", "Story"):
        (root / name).mkdir()
    (root / "Story" / "story.z5").write_bytes(b"synthetic story")
    config = env.runtime.parent / "scummvm.ini"
    config.write_text(f"""[scummvm]
music_volume=120
[monkey-en]
engineid=scumm
gameid=monkey
description=Monkey Island (DOS/English)
path={root / 'English'}
platform=pc
language=en
[monkey-de]
engineid=scumm
gameid=monkey
description=Monkey Island (Windows/German)
path={root / 'German'}
platform=windows
language=de
[story]
engineid=glk
gameid=zcode
description=Story
path={root / 'Story'}
filename=story.z5
""", encoding="utf-8")
    value = read(env.arcade.CONFIG_FILE)
    value["collections"].append({"id": "scummvm", "name": "ScummVM", "root": str(root),
        "adapter": "scummvm-config-v1", "scummvm_config": str(config),
        "default_emulator": "scummvm", "writable": False, "auto_metadata": False})
    value["emulators"]["scummvm"] = {"name": "ScummVM", "type": "scummvm", "path": str(env.executable), "arguments": []}
    write(env.arcade.CONFIG_FILE, value)
    env.scummvm_root, env.scummvm_config = root, config
    return env


def selections(env):
    return env.arcade.get_catalogue_service().search({"includeScummvm": True})["entries"]


def test_grouped_search_pages_by_title_and_keeps_exact_legacy_projection(scummvm):
    env = scummvm
    service = env.arcade.get_catalogue_service()
    request = {"includeScummvm": True, "groupVersions": True, "pageSize": 1}
    rows = []
    while True:
        page = service.search(request)
        rows.extend(page["entries"])
        if not page["nextCursor"]:
            break
        request["cursor"] = page["nextCursor"]
    assert len(rows) == 3
    assert len(selections(env)) == 4
    monkey = next(row for row in rows if row["title"] == "Monkey Island")
    assert monkey["hardwareLabel"] == "DOS / Windows"
    assert monkey["editionLabel"] == "2 versions · de/en"
    versions = service.versions(monkey["catalogueId"])
    assert len(versions["versions"]) == 2
    assert sum(row["isDefault"] for row in versions["versions"]) == 1
    assert all(forbidden not in str(versions) for forbidden in (str(env.scummvm_root), "monkey-en", "monkey-de", "targetId", "arguments"))


def test_explicit_version_default_is_shared_and_persisted_without_editing_scummvm(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    anchor = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "dos")
    before = env.scummvm_config.read_bytes()
    versions = env.host.game_versions_request(anchor)
    german = next(row for row in versions["versions"] if row["languages"] == ["de"])
    assert env.host.game_versions_request(anchor, "default", german["catalogueId"], german["entryRevision"])["ok"]
    saved = env.arcade.get_library_catalogue().version_defaults.load()[versions["groupId"]]
    assert env.store.resolve(saved["gameKey"])["target"]["targetId"] == "monkey-de"
    launched = []
    monkeypatch.setattr(env.store, "_execute", lambda plan: launched.append(plan) or True)
    assert env.host.launch_emugui_game(anchor)
    assert launched[-1]["target"]["targetId"] == "monkey-de"
    status = env.host.emugui_game_status(anchor)
    assert status["versionCount"] == 2 and status["systemId"] == "windows"
    assert set(status["languages"]) == {"en", "de"}
    assert status['defaultVersion'] == {'languages': ['de'], 'platforms': ['Windows'], 'systems': ['Windows']}
    env.arcade.LIBRARY_CATALOGUE = None
    current = env.host.game_versions_request(anchor)
    assert next(row for row in current["versions"] if row["isDefault"])["catalogueId"] == german["catalogueId"]
    assert env.scummvm_config.read_bytes() == before


def test_launching_an_alternative_does_not_change_the_default(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    anchor = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "dos")
    versions = env.host.game_versions_request(anchor)
    alternate = next(row for row in versions["versions"] if not row["isDefault"])
    launched = []
    monkeypatch.setattr(env.store, "_execute", lambda plan: launched.append(plan) or True)
    env.host.game_versions_request(anchor, "launch", alternate["catalogueId"], alternate["entryRevision"])
    assert launched[-1]["catalogueId"] == alternate["catalogueId"]
    assert env.arcade.get_library_catalogue().version_defaults.load() == {}
    env.host.launch_emugui_game(anchor)
    assert launched[-1]["target"]["targetId"] == "monkey-en"


@pytest.mark.parametrize("action", ["launch", "default"])
def test_version_selection_rejects_foreign_and_stale_entries_before_approval(scummvm, action):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    anchor = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "dos")
    foreign = next(row for row in selections(env) if row["title"] == "Story")
    before = env.store.load()
    with pytest.raises(ValueError):
        env.host.game_versions_request(anchor, action, foreign["catalogueId"], foreign["entryRevision"])
    alternate = env.host.game_versions_request(anchor)["versions"][-1]
    with pytest.raises(ValueError):
        env.host.game_versions_request(anchor, action, alternate["catalogueId"], "stale")
    assert env.store.load() == before
    assert env.arcade.get_library_catalogue().version_defaults.load() == {}


def test_missing_default_approval_never_launches_another_version(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    anchor = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "dos")
    versions = env.host.game_versions_request(anchor)
    alternate = next(row for row in versions["versions"] if not row["isDefault"])
    env.host.game_versions_request(anchor, "default", alternate["catalogueId"], alternate["entryRevision"])
    saved = env.arcade.get_library_catalogue().version_defaults.load()[versions["groupId"]]
    env.store.forget(saved["gameKey"])
    launched = []
    monkeypatch.setattr(env.store, "_execute", lambda plan: launched.append(plan))
    with pytest.raises(env.module.BindingError):
        env.host.launch_emugui_game(anchor)
    assert not launched


def test_arcade_summary_and_default_use_the_same_family(scummvm):
    env = scummvm
    env.arcade.update_state(lambda state: state.update(active_collection_id="scummvm"))
    env.arcade.activate_collection("scummvm")
    rows = env.arcade.dispatch_arcade_api("GET", "/api/games", {"collection_id":env.arcade.active_collection()["id"], "view": "all", "shape": "summary", "groupVersions": "true"}, {})["games"]
    monkeys = [row for row in rows if row["title"] == "Monkey Island"]
    assert len(monkeys) == 2 and len({row["version_group"] for row in monkeys}) == 1
    assert {row["version_count"] for row in monkeys} == {2}
    anchor = monkeys[0]
    result = env.arcade.dispatch_arcade_api("GET", "/api/game-versions", {"collection_id":env.arcade.active_collection()["id"], "game_id": anchor["id"]}, {})
    alternative = next(row for row in result["versions"] if not row["isDefault"])
    result = env.arcade.dispatch_arcade_api("POST", "/api/game-version-default", {}, {"collection_id":env.arcade.active_collection()["id"], "game_id": anchor["id"],
        "catalogueId": alternative["catalogueId"], "entryRevision": alternative["entryRevision"]})
    assert result["ok"]
    updated = env.arcade.dispatch_arcade_api("GET", "/api/games", {"collection_id":env.arcade.active_collection()["id"], "view": "all", "shape": "summary", "groupVersions": "true"}, {})["games"]
    selected = next(row for row in updated if row.get("catalogue_id") == alternative["catalogueId"])
    assert selected["default_version"] == selected["id"]


def scummvm_request(env):
    return {"requestId": str(uuid.uuid4()), "entries": [
        {key: row[key] for key in ("catalogueId", "entryRevision")}
        for row in selections(env) if row["targetKind"] == "scummvm-game"]}


def test_scraped_metadata_keeps_existing_portal_approval_launchable(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    key = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "dos")
    before_plan = env.store.resolve(key)
    before_bindings = deepcopy(env.store.load())
    before_ini = env.scummvm_config.read_bytes()
    env.arcade.activate_collection("scummvm")
    env.arcade.update_state(lambda state: state.update(active_collection_id="scummvm"))
    env.arcade.LIBRARY = None
    result = env.arcade.dispatch_arcade_api("POST", "/api/apply-scrape", {}, {"collection_id":env.arcade.active_collection()["id"],
        "game_id": before_plan["gameId"], "candidate": {"title": "Scraped Monkey Island", "publisher": "LucasArts",
            "description": "Saved metadata", "platform": "PC", "scraper_source": "thegamesdb", "scraper_id": "42"}})
    assert result["ok"]
    env.arcade.activate_collection("fixture")
    env.arcade.update_state(lambda state: state.update(active_collection_id="fixture"))
    env.arcade.LIBRARY = None
    after_plan = env.store.resolve(key)
    for field in ("target", "targetDigest", "media", "config", "executable", "arguments", "sourceId", "catalogueId"):
        assert after_plan[field] == before_plan[field]
    assert after_plan["public"]["title"] == "Scraped Monkey Island"
    launched = []
    monkeypatch.setattr(env.store, "_execute", lambda plan: launched.append(plan) or True)
    assert env.store.launch(key)
    assert launched[0]["target"]["targetId"] == "monkey-en"
    assert env.store.load() == before_bindings
    assert env.scummvm_config.read_bytes() == before_ini


def test_mixed_library_browses_without_preparation_and_legacy_search_stays_spectrum(scummvm):
    env = scummvm
    before = env.scummvm_config.read_bytes()
    entries = selections(env)
    assert len(entries) == 4
    assert {row["platformId"] for row in entries} == {"zx-spectrum", "dos", "windows", "unknown"}
    assert len({row["catalogueId"] for row in entries}) == 4
    assert len(env.arcade.get_catalogue_service().search()["entries"]) == 1
    assert len(env.arcade.get_catalogue_service().search({"includeScummvm": True, "platformIds": ["windows"]})["entries"]) == 1
    assert env.scummvm_config.read_bytes() == before
    assert not (env.scummvm_root / "collection-metadata.json").exists()
    assert str(env.scummvm_root) not in str(entries) and "targetId" not in str(entries)


def test_scummvm_binding_requires_negotiation_and_preserves_spectrum_during_upgrade(scummvm):
    env = scummvm
    spectrum = bind(env)
    original = deepcopy(env.store.load()["bindings"][spectrum])
    assert env.store.load()["schemaVersion"] == 5
    rejected = env.store.bind(env.session, scummvm_request(env))
    assert all(row["code"] == "unsupported-target" for row in rejected["results"])
    assert env.store.load()["schemaVersion"] == 5
    payload = scummvm_request(env)
    response = env.store.bind(env.session, payload, allow_scummvm=True)
    assert all(row["ok"] for row in response["results"]), response
    assert env.store.load()["schemaVersion"] == 5
    assert env.store.load()["bindings"][spectrum] == original
    assert env.store.resolve(spectrum)["adapterId"] == "generic"
    assert env.store.bind(env.session, payload, allow_scummvm=True) == response
    for row in response["results"]:
        assert env.store.resolve(row["game"]["gameKey"])["adapterId"] == "scummvm"
    assert str(env.scummvm_root) not in str(response)


def test_host_launches_exact_registered_variant_and_rejects_changed_target(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    key = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "windows")
    launched = []
    process = RunningProcess()
    events = []
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda args, **kwargs: launched.append((args, kwargs)) or process)
    monkeypatch.setattr(env.arcade, "focus_launched_emulator", lambda adapter, child: events.append((adapter, child)))
    monkeypatch.setattr(env.arcade, "mark_recent", lambda game_id: events.append("recent"))
    assert env.store.launch(key)
    assert launched[0][0] == [str(env.executable), "--no-console", "--config=" + str(env.scummvm_config),
                              "--path=" + str(env.scummvm_root / "German"), "monkey-de"]
    assert launched[0][1]["shell"] is False
    assert events == [("scummvm", process), "recent"]
    options = launched[0][1]
    assert all(options[stream] == subprocess.DEVNULL for stream in ("stdin", "stdout", "stderr"))
    assert options["close_fds"] is True
    if os.name == "nt":
        assert options["startupinfo"].dwFlags & subprocess.STARTF_USESHOWWINDOW
        assert options["startupinfo"].wShowWindow == 1
    env.scummvm_config.write_text(env.scummvm_config.read_text().replace("language=de", "language=en"))
    with pytest.raises(env.module.BindingError):
        env.store.launch(key)
    assert len(launched) == 1


@pytest.mark.parametrize("exit_code", [0, 1, -1])
def test_failed_scummvm_start_is_reported_and_does_not_mark_recent(scummvm, monkeypatch, exit_code):
    env = scummvm
    env.arcade.update_state(lambda state: state.update(active_collection_id="scummvm"))
    env.arcade.activate_collection("scummvm")
    game = next(g for g in env.arcade.load_games({}, set()) if g.file_name == "monkey-de")
    process = RunningProcess()
    process.wait = lambda timeout: exit_code
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda *_a, **_k: process)
    monkeypatch.setattr(env.arcade, "mark_recent", lambda _: pytest.fail("failed launch must not mark recent"))
    monkeypatch.setattr(env.arcade, "focus_launched_emulator", lambda *_: pytest.fail("exited process must not receive focus"))
    result = env.arcade.launch_game(game.id, "scummvm")
    assert result["ok"] is False
    assert "ScummVM could not start" in result["error"]
    assert str(env.executable) not in str(result)


def test_scummvm_exit_while_waiting_for_window_is_not_success(scummvm, monkeypatch):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    key = response["results"][0]["game"]["gameKey"]
    process = RunningProcess()
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda *_a, **_k: process)
    monkeypatch.setattr(env.arcade, "focus_launched_emulator", lambda *_: setattr(process, "returncode", 1))
    monkeypatch.setattr(env.arcade, "mark_recent", lambda _: pytest.fail("failed launch must not mark recent"))
    with pytest.raises(env.module.BindingError, match="unavailable"):
        env.store.launch(key)


def test_scummvm_creation_error_is_sanitized(scummvm, monkeypatch):
    env = scummvm
    env.arcade.update_state(lambda state: state.update(active_collection_id="scummvm"))
    env.arcade.activate_collection("scummvm")
    game = env.arcade.load_games({}, set())[0]
    def fail(*_args, **_kwargs):
        raise OSError(f"private native path: {env.executable}")
    monkeypatch.setattr(env.host.subprocess, "Popen", fail)
    result = env.arcade.launch_game(game.id, "scummvm")
    assert result["ok"] is False
    assert "ScummVM could not start" in result["error"]
    assert str(env.executable) not in str(result)


def test_host_independently_rejects_forged_arguments_target_and_directory(scummvm):
    env = scummvm
    row = next(row for row in selections(env) if row["platformId"] == "dos")
    plan = env.arcade.resolve_catalogue_launch_plan(row["catalogueId"], row["entryRevision"])
    assert env.module.validate_plan(plan)["mode"] == "scummvm-entry-v1"
    for mutate in (lambda p: p["arguments"].append("--auto-detect"),
                   lambda p: p["target"].update(targetId="monkey-de"),
                   lambda p: p.update(media=str(env.scummvm_root.parent)),
                   lambda p: p["public"].update(systemId="windows")):
        forged = deepcopy(plan)
        mutate(forged)
        with pytest.raises(env.module.BindingError):
            env.module.validate_plan(forged)


def test_arcade_collection_launch_send_and_rebind_use_same_exact_policy(scummvm, monkeypatch):
    env = scummvm
    env.arcade.update_state(lambda state: state.update(active_collection_id="scummvm"))
    env.arcade.activate_collection("scummvm")
    games = env.arcade.load_games({}, set())
    assert len(games) == 3
    assert {g.default_emulator for g in games} == {"scummvm"}
    assert env.arcade.load_metadata() == {"version": 1, "games": [], "poks": []}
    game = next(g for g in games if g.file_name == "monkey-de")
    plan = env.arcade.resolve_scummvm_game_plan("scummvm", game.id)
    launched = []
    monkeypatch.setattr(env.arcade, "SCUMMVM_LAUNCH", lambda plan: launched.append(plan) or True)
    assert env.arcade.launch_game(game.id, "scummvm")["ok"]
    assert launched[0] == plan
    depths = []
    original = env.store._write
    monkeypatch.setattr(env.store, "_write", lambda *args: depths.append(env.arcade.get_library_catalogue()._read_depth) or original(*args))
    key = env.store.approve_arcade_scummvm(plan)
    assert env.store.approve_arcade_scummvm(plan) == key
    assert depths and set(depths) == {0}
    assert env.host.create_emugui_game_binding(game.id)["gameKey"] == key
    assert env.host.rebind_emugui_game(key, game.id)["gameKey"] == key


def test_native_optional_capability_gates_search_and_binding(scummvm):
    env = scummvm
    transport = env.host.get_catalogue_transport()
    opened = transport.handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1, "role": "portal",
                              "tabId": 1, "pageUrl": (Path(env.host.CYRUNE_REPO_ROOT) / "Portal" / "index.html").as_uri()})
    assert opened["ok"], opened
    def call(operation, payload):
        return transport.handle({"type": operation, "protocol": 1, "sessionId": opened["sessionId"], "payload": payload})
    assert len(call("ARCADE_CATALOGUE_SEARCH", {})["entries"]) == 1
    assert call("ARCADE_CATALOGUE_ENABLE_SCUMMVM", {}) == {"ok": True, "schemaVersion": 1}
    response = call("ARCADE_CATALOGUE_SEARCH", {})
    assert response["ok"] and len(response["entries"]) == 4, response
    assert all(row["ok"] for row in call("ARCADE_CATALOGUE_BIND_ENTRIES", scummvm_request(env))["results"])


def test_missing_story_selector_and_unavailable_source_do_not_fall_back(scummvm):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    key = next(row["game"]["gameKey"] for row in response["results"] if row["game"]["systemId"] == "unknown")
    (env.scummvm_root / "Story" / "story.z5").unlink()
    with pytest.raises(env.module.BindingError):
        env.store.resolve(key)
    env.scummvm_config.unlink()
    assert len(selections(env)) == 1


def test_existing_scummvm_binding_status_exposes_languages_and_launcher_without_native_data(scummvm):
    env = scummvm
    response = env.store.bind(env.session, scummvm_request(env), allow_scummvm=True)
    for row in response['results']:
        key = row['game']['gameKey']
        status = env.host.emugui_game_status(key)
        assert status['state'] == 'ready'
        assert status['languages'] == {'dos': ['en', 'de'], 'windows': ['en', 'de'], 'unknown': []}[status['systemId']]
        assert status['defaultVersion']['languages'] == {'dos': ['en'], 'windows': ['de'], 'unknown': []}[status['systemId']]
        choices = env.host.game_versions_request(key)
        actual = env.store.resolve(key)['catalogueId']
        assert choices['defaultId'] == actual
        assert next(choice for choice in choices['versions'] if choice['isDefault'])['catalogueId'] == actual
        assert status['emulatorName'] == 'ScummVM'
        assert status['profileName'] == 'ScummVM settings'
        assert str(env.scummvm_root) not in str(status)
        assert not {'target', 'targetId', 'arguments', 'config', 'media'} & set(status)


@pytest.mark.parametrize('value, expected', [
    (['EN', 'en', 'de', 'fr-CA', '../en', 'English', None, {'path': 'private'}], ['en', 'de', 'fr-ca']),
    ('de', []), (['en'] * 12 + ['de'], ['en']), (None, [])])
def test_game_status_language_values_are_bounded_codes(scummvm, value, expected):
    assert scummvm.host._game_status_languages(value) == expected
