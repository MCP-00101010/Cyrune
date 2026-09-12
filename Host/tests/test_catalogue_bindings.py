"""Synthetic integration of Host approvals with Arcade's exact-source policy."""

from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import shutil
import sys
from types import SimpleNamespace
import uuid

import pytest


ROOT = Path(__file__).resolve().parents[2]


def write(path, value):
    Path(path).write_text(json.dumps(value), encoding="utf-8")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


@pytest.fixture
def setup(tmp_path, monkeypatch):
    name = "host_catalogue_under_test"
    spec = importlib.util.spec_from_file_location(name, ROOT / "Host" / "morpheus_host.py")
    host = importlib.util.module_from_spec(spec)
    sys.modules[name] = host
    spec.loader.exec_module(host)
    config = tmp_path / "Host" / "config.json"
    config.parent.mkdir()
    monkeypatch.setattr(host, "CONFIG_PATH", str(config))
    write(config, {"schemaVersion": 1, "arcadeRoot": str(ROOT / "Arcade")})
    runtime, source, emulators = (tmp_path / name for name in ("Arcade", "spectrum", "emulators"))
    for directory in (runtime, source, emulators):
        directory.mkdir()
    monkeypatch.setenv("CYRUNE_ARCADE_DATA", str(runtime))
    monkeypatch.setenv("CYRUNE_ARCADE_COLLECTION", str(source))
    monkeypatch.setenv("CYRUNE_ARCADE_COLLECTIONS_BASE", str(tmp_path))
    arcade = host._load_emugui_module()
    executable = emulators / "test.exe"
    executable.write_bytes(b"synthetic emulator; never executed")
    metadata = {"games": [{"id": "elite", "title": "Elite", "file": "elite.tap", "system": "48K",
                            "memory": "48K", "default_emulator": "test", "languages": ["EN"]}], "poks": []}
    (source / "elite.tap").write_bytes(b"synthetic Spectrum media")
    write(source / "collection-metadata.json", metadata)
    write(runtime / "config.json", {"collections": [{"id": "spectrum", "root": str(source), "writable": True}],
                                   "emulators": {"test": {"type": "generic", "path": str(executable),
                                                          "arguments": ["--game", "{file}"]}}, "emulator_profiles": []})
    monkeypatch.setattr(arcade, "DATA", runtime)
    monkeypatch.setattr(arcade, "CONFIG_FILE", runtime / "config.json")
    monkeypatch.setattr(arcade, "STATE_FILE", runtime / "state.json")
    monkeypatch.setattr(arcade, "COLLECTION", tmp_path / "different-active-source")
    monkeypatch.setattr(arcade, "METADATA_FILE", arcade.COLLECTION / "collection-metadata.json")
    monkeypatch.setattr(arcade, "init_state", lambda: None)
    monkeypatch.setattr(arcade, "find_running_emulator_window", lambda _: 0)
    monkeypatch.setattr(arcade, "focus_launched_emulator", lambda *_: None)
    monkeypatch.setattr(arcade, "should_check_immediate_exit", lambda _: False)
    monkeypatch.setattr(host, "_load_emugui_module", lambda: arcade)
    lifecycle = arcade.get_catalogue_lifecycle(create=True)
    lifecycle.prepare_source("spectrum", dry_run=False)
    store = host.get_catalogue_bindings()
    module = host._catalogue_binding_module()
    return SimpleNamespace(host=host, arcade=arcade, lifecycle=lifecycle, store=store, module=module,
                           source=source, executable=executable, runtime=runtime, session=store.register_session("portal"))


def request(env):
    entries = env.arcade.get_catalogue_service().search()["entries"]
    return {"requestId": str(uuid.uuid4()), "entries": [{key: entry[key] for key in ("catalogueId", "entryRevision")} for entry in entries]}


def bind(env):
    response = env.store.bind(env.session, request(env))
    assert response["results"][0]["ok"], response
    return response["results"][0]["game"]["gameKey"]


def test_binding_observes_one_read_lease_but_writes_only_after_validation(setup, monkeypatch):
    env = setup
    payload = request(env)
    resolver, writer = env.store._resolve, env.store._write
    resolutions, writes = [], []
    def resolve(*args):
        resolutions.append(env.arcade.get_library_catalogue()._read_depth)
        return resolver(*args)
    def write_checked(*args):
        writes.append(env.arcade.get_library_catalogue()._read_depth)
        return writer(*args)
    monkeypatch.setattr(env.store, "_resolve", resolve)
    monkeypatch.setattr(env.store, "_write", write_checked)
    assert env.store.bind(env.session, payload)["results"][0]["ok"]
    assert resolutions == [1, 1]  # Initial and final individual target validation.
    assert writes and all(depth == 0 for depth in writes)


def test_change_after_final_binding_resolution_prevents_any_approval_write(setup, monkeypatch):
    env = setup
    payload = request(env)
    @contextmanager
    def changed_scope():
        with env.arcade.catalogue_read_snapshot():
            yield
            (env.source / "elite.tap").write_bytes(b"external replacement after final resolution")
    monkeypatch.setattr(env.store, "_resolve_scope", changed_scope)
    with pytest.raises(Exception) as caught:
        env.store.bind(env.session, payload)
    assert caught.value.code == "catalogue-changed"
    assert not env.store.path.exists()
    assert not env.store.path.with_suffix(".migration.json").exists()


def test_explicit_binding_persists_only_after_confirmation_and_reuses_key(setup):
    env = setup
    payload = request(env)
    assert not env.store.path.exists()
    assert env.store.initialize()["status"] == "preview"
    assert not env.store.path.exists()
    first = env.store.bind(env.session, payload)
    before = env.store.path.read_bytes()
    assert env.store.bind(env.session, payload) == first
    assert env.store.path.read_bytes() == before
    assert bind(env) == first["results"][0]["game"]["gameKey"]
    assert env.arcade.COLLECTION.name == "different-active-source"
    assert env.arcade.LIBRARY is None
    assert "approvedGames" not in read(env.host.CONFIG_PATH)
    raw = json.dumps(first)
    for private in (str(env.source), str(env.executable), "elite.tap", "arguments", "test.exe", "entry-policy"):
        assert private not in raw
    receipts = json.dumps(env.store.load()["receipts"])
    assert "Elite" not in receipts and str(env.source) not in receipts


@pytest.mark.parametrize("fault", ["duplicate", "unknown-field", "wrong-type", "invalid-uuid", "too-many", "profile-authority"])
def test_invalid_envelopes_never_initialize_or_approve(setup, fault):
    env = setup
    payload = request(env)
    if fault == "duplicate":
        payload["entries"] *= 2
    elif fault == "unknown-field":
        payload["destination"] = "board"
    elif fault == "wrong-type":
        payload["entries"][0]["entryRevision"] = True
    elif fault == "invalid-uuid":
        payload["requestId"] = "bad"
    elif fault == "too-many":
        payload["entries"] *= 101
    else:
        payload["entries"][0]["emulatorId"] = "test"
    with pytest.raises(env.module.BindingError, match="invalid-request"):
        env.store.bind(env.session, payload)
    assert not env.store.path.exists()


def test_wrong_roles_forged_sessions_disconnect_expiry_and_restart(setup):
    env = setup
    payload = request(env)
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        env.store.register_session("arcade")
    with pytest.raises(env.module.BindingError, match="unsupported-protocol"):
        env.store.register_session("portal", protocol=2)
    forged = env.module.Session(env.session.id, "portal", env.session.expires, env.session.retain_until)
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        env.store.bind(forged, payload)
    first = env.store.bind(env.session, payload)
    env.store.disconnect(env.session)
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        env.store.bind(env.session, payload)
    new_session = env.store.register_session("portal")
    env.store._clock = lambda: new_session.expires
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        env.store.bind(new_session, payload)
    env.host.CATALOGUE_BINDINGS = None
    reopened = env.host.get_catalogue_bindings()
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        reopened.bind(new_session, payload)
    response = reopened.bind(reopened.register_session("portal"), request(env))
    assert response["results"][0]["game"]["gameKey"] == first["results"][0]["game"]["gameKey"]


def test_changed_payload_conflicts_and_concurrent_identical_retries_share_approval(setup):
    env = setup
    payload = request(env)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(env.store.bind, env.session, payload) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert results[0] == results[1]
    assert len(env.store.load()["bindings"]) == 1
    changed = deepcopy(payload)
    changed["entries"][0]["entryRevision"] = "different"
    with pytest.raises(env.module.BindingError, match="request-conflict"):
        env.store.bind(env.session, changed)


def test_partial_results_are_ordered_and_forget_prevents_retry_resurrection(setup):
    env = setup
    payload = request(env)
    payload["entries"].insert(0, {"catalogueId": "missing", "entryRevision": "stale"})
    result = env.store.bind(env.session, payload)
    assert result["results"][0] == {"catalogueId": "missing", "ok": False, "code": "entry-missing"}
    key = result["results"][1]["game"]["gameKey"]
    assert env.host.forget_emugui_game(key)
    retry = env.store.bind(env.session, payload)
    assert retry["results"][1]["code"] == "binding-forgotten"
    assert env.store.load()["bindings"] == {}


def test_failed_atomic_commit_adds_no_approval_and_retry_recovers(setup, monkeypatch):
    env = setup
    payload = request(env)
    writer = env.store._write
    def fail(path, value):
        if value["bindings"]:
            raise OSError("private native failure")
        writer(path, value)
    monkeypatch.setattr(env.store, "_write", fail)
    with pytest.raises(env.module.BindingError, match="^persistence-failed$"):
        env.store.bind(env.session, payload)
    assert env.store.load()["bindings"] == {}
    assert env.store.load()["receipts"] == {}
    monkeypatch.setattr(env.store, "_write", writer)
    assert env.store.bind(env.session, payload)["results"][0]["ok"]


def test_missing_or_corrupt_persistence_never_remints_bindings(setup):
    env = setup
    bind(env)
    env.store.path.unlink()
    with pytest.raises(env.module.BindingError, match="review-required"):
        env.store.bind(env.session, request(env))
    write(env.store.path, {"schemaVersion": 99})
    before = env.store.path.read_bytes()
    with pytest.raises(env.module.BindingError, match="unsupported-protocol"):
        env.store.load()
    assert env.store.path.read_bytes() == before


def test_total_binding_limit_includes_unresolved_and_reuse_at_capacity(setup):
    env = setup
    key = bind(env)
    state = env.store.load()
    state['bindings'].update({f'game_unresolved_{index:012d}': {'mode':'unresolved', 'previous':{}, 'code':'source-unavailable'} for index in range(511)})
    write(env.store.path, state)
    assert bind(env) == key
    metadata = read(env.source / "collection-metadata.json")
    metadata["games"].append({**metadata["games"][0], "id": "other", "file": "other.tap"})
    (env.source / "other.tap").write_bytes(b"other media")
    env.lifecycle.save_metadata(env.source, metadata)
    result = env.store.bind(env.session, request(env))
    assert sorted(item.get("code", "") for item in result["results"]) == ["", "binding-limit"]
    assert len(env.store.load()["bindings"]) == 512


def test_receipt_limit_keeps_prior_retries_valid(setup):
    env = setup
    first = request(env)
    initial = env.store.bind(env.session, first)
    for _ in range(63):
        env.store.bind(env.session, request(env))
    before = env.store.path.read_bytes()
    with pytest.raises(env.module.BindingError, match="busy"):
        env.store.bind(env.session, request(env))
    assert env.store.path.read_bytes() == before
    assert env.store.bind(env.session, first) == initial


@pytest.mark.parametrize("fault", ["missing-emulator", "missing-profile", "wrong-adapter", "command-string"])
def test_missing_or_unsupported_explicit_policy_never_falls_back(setup, fault):
    env = setup
    metadata = read(env.source / "collection-metadata.json")
    config = read(env.runtime / "config.json")
    if fault == "missing-emulator":
        metadata["games"][0]["default_emulator"] = "unknown"
    elif fault == "missing-profile":
        metadata["games"][0]["emulator_profile"] = "missing"
    elif fault == "wrong-adapter":
        config["emulators"]["test"]["type"] = "shell"
    else:
        config["emulators"]["test"]["arguments"] = "--game {file}"
    write(env.source / "collection-metadata.json", metadata)
    write(env.runtime / "config.json", config)
    result = env.store.bind(env.session, request(env))["results"][0]
    assert not result["ok"]
    assert result["code"] in {"configuration-required", "unsupported-target"}
    assert env.store.load()["bindings"] == {}


def test_launch_uses_exact_source_and_host_argument_array_then_policy_changes(setup, monkeypatch):
    env = setup
    key = bind(env)
    launches = []
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda args, **kwargs: (launches.append((args, kwargs)) or SimpleNamespace(pid=123)))
    assert env.host.launch_emugui_game(key)
    assert launches[0][0] == [str(env.executable), "--game", str(env.source / "elite.tap")]
    assert launches[0][1]["shell"] is False
    assert env.arcade.LIBRARY is None
    config = read(env.runtime / "config.json")
    config["emulators"]["test"]["arguments"] = ["--changed-policy", "{file}"]
    write(env.runtime / "config.json", config)
    assert env.host.launch_emugui_game(key)
    assert launches[-1][0][1] == "--changed-policy"
    changed = env.executable.with_name("different.exe")
    changed.write_bytes(b"new native authority")
    config["emulators"]["test"]["path"] = str(changed)
    write(env.runtime / "config.json", config)
    with pytest.raises(env.module.BindingError, match="review-required"):
        env.host.launch_emugui_game(key)
    assert len(launches) == 2


def test_missing_media_stale_selection_and_replacement_do_not_launch(setup, monkeypatch):
    env = setup
    selection = request(env)
    key = bind(env)
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda *_a, **_k: pytest.fail("must not launch"))
    (env.source / "elite.tap").write_bytes(b"unreviewed replacement")
    result = env.store.bind(env.session, selection)["results"][0]
    assert result["code"] == "entry-changed"
    with pytest.raises(env.module.BindingError, match="entry-changed"):
        env.host.launch_emugui_game(key)
    (env.source / "elite.tap").unlink()
    assert env.host.emugui_game_status(key)["error"] == "media-missing"


def test_verified_reattachment_preserves_binding_and_does_not_activate_source(setup, tmp_path):
    env = setup
    key = bind(env)
    copied = tmp_path / "relocated"
    shutil.copytree(env.source, copied)
    env.source.rename(tmp_path / "offline")
    env.lifecycle.reattach_source("spectrum", copied, dry_run=False)
    assert env.store.resolve(key)["media"] == str(copied / "elite.tap")
    assert env.host.emugui_game_status(key)["state"] == "ready"
    assert env.arcade.COLLECTION.name == "different-active-source"
    from urllib.parse import urlsplit, parse_qs
    link = env.host.emugui_game_link(key)
    assert parse_qs(urlsplit(link).query) == {"game": ["elite"], "collection": ["spectrum"]}
    assert env.arcade.COLLECTION.name == "different-active-source"
    assert "hubRebind=" in env.host.emugui_game_link(key, rebind=True)


def test_running_emulator_requires_existing_explicit_choice(setup, monkeypatch):
    env = setup
    key = bind(env)
    monkeypatch.setattr(env.arcade, "find_running_emulator_window", lambda _: 77)
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda *_a, **_k: pytest.fail("must not launch"))
    with pytest.raises(env.module.BindingError, match="configuration-required"):
        env.host.launch_emugui_game(key)


def test_host_rejects_native_plan_escape_and_raw_failures_are_sanitized(setup, monkeypatch, tmp_path):
    env = setup
    payload = request(env)
    plan = env.arcade.resolve_catalogue_launch_plan(**dict(zip(("catalogue_id", "entry_revision"), payload["entries"][0].values())))
    outside = tmp_path / "outside.tap"
    outside.write_bytes((env.source / "elite.tap").read_bytes())
    plan["media"] = str(outside)
    monkeypatch.setattr(env.store, "_resolve", lambda *_: plan)
    result = env.store.bind(env.session, payload)["results"][0]
    assert result["code"] == "source-unavailable"
    def fail(*_):
        raise RuntimeError("private file and credential sentinel")
    monkeypatch.setattr(env.store, "_resolve", fail)
    result = env.store.bind(env.session, request(env))["results"][0]
    assert result["code"] == "unavailable"
    assert "private" not in json.dumps(result)


def test_profile_policy_changes_copy_only_verified_managed_profile_through_host(setup, monkeypatch):
    env = setup
    profiles = env.arcade.EMULATOR_PROFILE_DIR
    profiles.mkdir()
    source = profiles / "48k.ini"
    source.write_text("[machine]\nmemory=48", encoding="utf-8")
    target = env.executable.parent / "live.ini"
    config = read(env.runtime / "config.json")
    config["emulators"]["test"].update(type="eightyone", eightyone_config_target=str(target))
    config["emulator_profiles"] = [{"id": "p48", "emulator_id": "test", "managed_path": str(source), "rule": {}}]
    write(env.runtime / "config.json", config)
    key = bind(env)
    launches = []
    monkeypatch.setattr(env.host.subprocess, "Popen", lambda args, **kwargs: launches.append(args) or SimpleNamespace(pid=123))
    assert env.host.launch_emugui_game(key)
    assert target.read_bytes() == source.read_bytes()
    source.write_text("[machine]\nmemory=128", encoding="utf-8")
    assert env.host.launch_emugui_game(key)
    assert "128" in target.read_text()
    assert len(env.store.load()["bindings"]) == 1
    config["emulators"]["test"]["eightyone_config_target"] = str(target.with_name("different.ini"))
    write(env.runtime / "config.json", config)
    with pytest.raises(env.module.BindingError, match="review-required"):
        env.host.launch_emugui_game(key)
    assert len(launches) == 2
    assert not target.with_name("different.ini").exists()


def test_second_native_connection_cannot_evict_live_retry_receipts(setup):
    env = setup
    payload = request(env)
    first = env.store.bind(env.session, payload)
    env.host.CATALOGUE_BINDINGS = None
    second = env.host.get_catalogue_bindings()
    second.bind(second.register_session("portal"), request(env))
    assert env.session.id in second.load()["receipts"]
    assert env.store.bind(env.session, payload) == first


def test_revalidation_failure_is_per_entry_and_does_not_discard_other_approvals(setup, monkeypatch):
    env = setup
    metadata = read(env.source / "collection-metadata.json")
    metadata["games"].append({**metadata["games"][0], "id": "other", "file": "other.tap", "title": "Other"})
    (env.source / "other.tap").write_bytes(b"other media")
    env.lifecycle.save_metadata(env.source, metadata)
    payload = request(env)
    changed_id = payload["entries"][0]["catalogueId"]
    resolver = env.store._resolve
    calls = {}
    def change_on_revalidation(catalogue_id, revision):
        calls[catalogue_id] = calls.get(catalogue_id, 0) + 1
        if catalogue_id == changed_id and calls[catalogue_id] > 1:
            raise env.module.BindingError("entry-changed")
        return resolver(catalogue_id, revision)
    monkeypatch.setattr(env.store, "_resolve", change_on_revalidation)
    response = env.store.bind(env.session, payload)
    assert response["results"][0]["code"] == "entry-changed"
    assert response["results"][1]["ok"]
    assert len(env.store.load()["bindings"]) == 1


@pytest.mark.parametrize("fault", ["arguments", "template", "profile-target", "signature"])
def test_host_independently_rejects_invalid_native_plan_fields(setup, monkeypatch, fault):
    env = setup
    payload = request(env)
    selection = payload["entries"][0]
    plan = env.arcade.resolve_catalogue_launch_plan(selection["catalogueId"], selection["entryRevision"])
    if fault == "arguments":
        plan["arguments"] = ["--different-file", "unapproved.tap"]
    elif fault == "template":
        plan["template"] = ["{unknown}"]
    elif fault == "profile-target":
        plan["profileCopy"] = {"source": "private", "target": "private"}
    else:
        plan["mediaSignature"] = [True] * 4
    monkeypatch.setattr(env.store, "_resolve", lambda *_: plan)
    response = env.store.bind(env.session, payload)
    assert response["results"][0]["code"] == "review-required"
    assert env.store.load()["bindings"] == {}


def test_binding_upgrade_preserves_exact_keys_and_pins_and_retains_unresolved_records(setup):
    env = setup
    existing = bind(env)
    key, missing = 'game_migrated_123456789012', 'game_missing_123456789012'
    config = read(env.host.CONFIG_PATH)
    pin = {'libraryId': 'spectrum', 'gameId': 'elite', 'emulatorId': 'test', 'profileId': ''}
    config['approvedGames'] = {key: pin, missing: {**pin, 'profileId': 'missing-profile'}}
    write(env.host.CONFIG_PATH, config)
    original = Path(env.host.CONFIG_PATH).read_bytes()
    dry = env.host._data_upgrades().bindings(env.host, env.store)
    assert dry['migrated'] == 2 and dry['unresolved'] == 1
    assert Path(env.host.CONFIG_PATH).read_bytes() == original
    result = env.host._data_upgrades().bindings(env.host, env.store, apply=True)
    assert result['unresolved'] == 1
    assert 'approvedGames' not in read(env.host.CONFIG_PATH)
    assert set(env.store.load()['bindings']) == {existing, key, missing}
    assert env.store.load()['schemaVersion'] == 5
    plan = env.store.resolve(key)
    assert (plan['collectionId'], plan['gameId'], plan['emulatorId']) == ('spectrum', 'elite', 'test')
    assert env.host.emugui_game_status(key)['state'] == 'ready'
    with pytest.raises(env.module.BindingError): env.store.resolve(missing)
    assert env.store.load()['bindings'][missing]['previous'] == config['approvedGames'][missing]
    journal = read(Path(env.host.CONFIG_PATH).with_name('bindings-v5-upgrade.json'))
    assert Path(journal['files'][1]['original']).read_bytes() == original
    assert env.host._data_upgrades().bindings(env.host, env.store, apply=True)['status'] == 'current'


def test_pinned_binding_uses_its_source_without_activating_it_and_can_rebind(setup):
    env = setup
    plan = env.arcade.resolve_catalogue_launch_plan(request(env)['entries'][0]['catalogueId'],
                                                  selection={'emulatorId': 'test', 'profileId': ''})
    key = env.store.approve_version(plan, selection={'emulatorId': 'test', 'profileId': ''})
    active = env.arcade.COLLECTION
    assert env.store.resolve(key) == plan
    assert env.store.approve_version(plan, game_key=key, selection={'emulatorId': 'test', 'profileId': ''}) == key
    assert env.host.emugui_game_status(key)['state'] == 'ready'
    assert env.arcade.COLLECTION == active
    (env.source / 'elite.tap').unlink()
    with pytest.raises(env.module.BindingError): env.store.launch(key)


def test_spectrum_display_fills_language_and_system_without_changing_approval(setup):
    env = setup
    path = env.source / 'collection-metadata.json'
    metadata = read(path)
    metadata['games'][0].update(languages=[], language='English', system='16K-48K', memory='16K-48K')
    write(path, metadata)
    key = bind(env)
    plan = env.store.resolve(key)
    status = env.host.emugui_game_status(key)
    assert status['defaultVersion'] == {'languages': ['en'], 'platforms': ['ZX Spectrum'], 'systems': ['16K-48K']}
    assert env.store.resolve(key) == plan
    assert read(path) == metadata


class ProcessInterrupted(BaseException):
    pass


@pytest.mark.parametrize("after_write", [False, True])
def test_interrupted_binding_commit_recovers_receipts_and_approvals_together(setup, monkeypatch, after_write):
    env = setup
    payload = request(env)
    writer = env.store._write
    def interrupt(path, value):
        if not value["bindings"]:
            writer(path, value)
            return
        if after_write:
            writer(path, value)
        raise ProcessInterrupted()
    monkeypatch.setattr(env.store, "_write", interrupt)
    with pytest.raises(ProcessInterrupted):
        env.store.bind(env.session, payload)
    state = env.store.load()
    assert bool(state["bindings"]) == after_write
    assert bool(state["receipts"]) == after_write
    monkeypatch.setattr(env.store, "_write", writer)
    response = env.store.bind(env.session, payload)
    assert response["results"][0]["ok"]
    if after_write:
        assert response["results"][0]["game"]["gameKey"] in state["bindings"]


def test_disconnect_or_deadline_before_commit_adds_no_approval(setup, monkeypatch):
    env = setup
    payload = request(env)
    resolver = env.store._resolve
    def disconnect(catalogue_id, revision):
        result = resolver(catalogue_id, revision)
        env.store.disconnect(env.session)
        return result
    monkeypatch.setattr(env.store, "_resolve", disconnect)
    with pytest.raises(env.module.BindingError, match="unauthorized"):
        env.store.bind(env.session, payload)
    assert not env.store.path.exists()
    env.session = env.store.register_session("portal")
    tick = [0.0]
    env.store._clock = lambda: tick[0]
    def delay(catalogue_id, revision):
        result = resolver(catalogue_id, revision)
        tick[0] = 31
        return result
    monkeypatch.setattr(env.store, "_resolve", delay)
    with pytest.raises(env.module.BindingError, match="timeout"):
        env.store.bind(env.session, payload)
    assert not env.store.path.exists()


def test_catalogue_authority_requires_dedicated_native_registration(setup, monkeypatch):
    env = setup
    replies = []
    monkeypatch.setattr(env.host, "reply_err", lambda *args, **kwargs: replies.append((args, kwargs)))
    for operation in ("ARCADE_CATALOGUE_BIND_ENTRIES", "ARCADE_CATALOGUE_SEARCH", "ARCADE_CATALOGUE_GET_ENTRY"):
        env.host.handle({"type": operation, "role": "portal", **request(env)})
    assert len(replies) == 3
    assert not env.store.path.exists()
    assert env.host.HOST_PROTOCOLS["arcade-catalogue"] == 1
    with pytest.raises(Exception, match="Unsupported"):
        env.arcade.dispatch_arcade_api("POST", "/api/catalogue/bind", {}, request(env))


def transport_session(env):
    transport = env.host.get_catalogue_transport()
    transport._supported = lambda: True
    opened = transport.handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1, "role": "portal",
                               "tabId": 7, "pageUrl": (ROOT / "Portal" / "index.html").as_uri()})
    assert opened["ok"], opened
    return transport, opened["sessionId"]


def native_request(transport, session_id, operation="SEARCH", payload=None):
    return transport.handle({"type": "ARCADE_CATALOGUE_" + operation, "protocol": 1,
                             "sessionId": session_id, "payload": {} if payload is None else payload})


def test_native_catalogue_rollout_gate_does_not_load_arcade_or_create_state(setup, monkeypatch):
    env = setup
    monkeypatch.delitem(env.host.HOST_PROTOCOLS, "arcade-catalogue")
    monkeypatch.setattr(env.host, "_load_emugui_module", lambda: pytest.fail("Gate loaded Arcade"))
    response = env.host.get_catalogue_transport().handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1,
        "role": "portal", "tabId": 1, "pageUrl": (ROOT / "Portal" / "index.html").as_uri()})
    assert response == {"ok": False, "code": "unsupported-protocol"}
    assert not env.store.path.exists()


@pytest.mark.parametrize("change", [{"role": "arcade"}, {"role": "nexus"}, {"tabId": True},
    {"pageUrl": (ROOT / "Arcade" / "web" / "index.html").as_uri()},
    {"pageUrl": "file:///other/Portal/index.html"}, {"pageUrl": "http://localhost/Portal/index.html"},
    {"pageUrl": (ROOT / "Portal" / "index.html").as_uri() + "?spoof=1"}, {"sessionId": "forged"}])
def test_native_registration_rejects_wrong_role_page_and_context(setup, change):
    transport = setup.host.get_catalogue_transport()
    transport._supported = lambda: True
    response = transport.handle({"type": "ARCADE_CATALOGUE_OPEN_SESSION", "protocol": 1, "role": "portal",
        "tabId": 7, "pageUrl": (ROOT / "Portal" / "index.html").as_uri(), **change})
    assert not response["ok"]
    assert not setup.store.path.exists()


def test_native_readiness_detail_bind_retry_and_private_data_exclusion(setup):
    env = setup
    transport, session_id = transport_session(env)
    page = native_request(transport, session_id)
    assert page["ok"], page
    entry = page["entries"][0]
    assert entry["availability"] == "available"
    detail = native_request(transport, session_id, "GET_ENTRY", {"catalogueId": entry["catalogueId"]})
    assert detail["ok"] and detail["entry"]["availability"] == "available"
    assert not env.store.path.exists()
    payload = {"requestId": str(uuid.uuid4()), "entries": [{key: entry[key] for key in ("catalogueId", "entryRevision")}]}
    first = native_request(transport, session_id, "BIND_ENTRIES", payload)
    assert first["ok"] and first["results"][0]["ok"], first
    assert native_request(transport, session_id, "BIND_ENTRIES", payload) == first
    reordered = {"entries": [{"entryRevision": selected["entryRevision"], "catalogueId": selected["catalogueId"]}
                              for selected in payload["entries"]], "requestId": payload["requestId"]}
    assert native_request(transport, session_id, "BIND_ENTRIES", reordered) == first
    raw = json.dumps([page, detail, first])
    assert str(env.source) not in raw and "test.exe" not in raw and "arguments" not in raw
    assert env.arcade.COLLECTION.name == "different-active-source"


@pytest.mark.parametrize("payload", [{"pageSize": True}, {"pageSize": 101}, {"platformIds": ["zx-spectrum"] * 2},
    {"query": "x" * 161}, {"cursor": "é"}, {"query": "\n"}, {"path": "private"}, {"platformIds": [{}]}])
def test_native_reads_validate_before_arcade_dispatch(setup, payload):
    transport, session_id = transport_session(setup)
    transport._service = lambda: pytest.fail("Invalid payload reached Arcade")
    assert native_request(transport, session_id, payload=payload) == {"ok": False, "code": "invalid-request"}


def test_native_sessions_revoke_and_cannot_cross_connections(setup):
    transport, session_id = transport_session(setup)
    assert native_request(transport, "forged") == {"ok": False, "code": "unauthorized"}
    setup.host.CATALOGUE_TRANSPORT = None
    other, _ = transport_session(setup)
    assert native_request(other, session_id) == {"ok": False, "code": "unauthorized"}
    transport.disconnect()
    assert native_request(transport, session_id) == {"ok": False, "code": "unauthorized"}


def test_native_disconnect_while_binding_prevents_atomic_commit(setup, monkeypatch):
    env = setup
    transport, session_id = transport_session(env)
    resolve = env.store._resolve
    def revoke(identifier, revision):
        result = resolve(identifier, revision)
        transport.disconnect()
        return result
    monkeypatch.setattr(env.store, "_resolve", revoke)
    assert native_request(transport, session_id, "BIND_ENTRIES", request(env)) == {"ok": False, "code": "unauthorized"}
    assert not env.store.path.exists()


def test_native_browse_defers_configuration_checks_to_add_and_keeps_read_deadline(setup):
    env = setup
    transport, session_id = transport_session(env)
    env.executable.unlink()
    page = native_request(transport, session_id)
    assert page["ok"] and page["entries"][0]["availability"] == "available", page
    response = native_request(transport, session_id, "BIND_ENTRIES", request(env))
    assert response["results"][0]["code"] == "configuration-required"
    tick = [0]
    transport._clock = lambda: tick[0]
    search = env.arcade.get_catalogue_service().search
    def slow_search(*args):
        tick[0] = 16
        return search(*args)
    env.arcade.get_catalogue_service().search = slow_search
    assert native_request(transport, session_id) == {"ok": False, "code": "timeout"}


@pytest.mark.parametrize("fault", ["path", "oversized", "wrong-identity", "raw-error"])
def test_native_rejects_untrusted_arcade_projection(setup, fault):
    env = setup
    transport, session_id = transport_session(env)
    entry = env.arcade.get_catalogue_service().search()["entries"][0]
    detail = env.arcade.get_catalogue_service().detail({"catalogueId": entry["catalogueId"]})
    if fault == "path":
        detail["entry"]["path"] = str(env.source)
    elif fault == "oversized":
        detail["entry"]["description"] = "x" * 2001
    elif fault == "wrong-identity":
        detail["entry"]["catalogueId"] = "different"
    def response(*args):
        if fault == "raw-error":
            raise RuntimeError("private native path " + str(env.source))
        return detail
    transport._service = lambda: SimpleNamespace(detail=response)
    result = native_request(transport, session_id, "GET_ENTRY", {"catalogueId": entry["catalogueId"]})
    assert result["ok"] is False and set(result) == {"ok", "code"}
    assert str(env.source) not in json.dumps(result)


def test_catalogue_connection_reader_revokes_during_native_work(setup, monkeypatch):
    import threading
    env = setup
    transport, session_id = transport_session(env)
    entered, finished = threading.Event(), threading.Event()
    resolve = env.store._resolve
    def slow_resolve(identifier, revision):
        entered.set()
        assert finished.wait(5)
        return resolve(identifier, revision)
    monkeypatch.setattr(env.store, "_resolve", slow_resolve)
    def eof(**kwargs):
        assert entered.wait(5)
        return None
    monkeypatch.setattr(env.host, "read_message", eof)
    disconnect = transport.disconnect
    def revoke():
        disconnect()
        finished.set()
    monkeypatch.setattr(transport, "disconnect", revoke)
    replies = []
    monkeypatch.setattr(env.host, "send_message", replies.append)
    env.host.serve_catalogue_connection({"type": "ARCADE_CATALOGUE_BIND_ENTRIES", "protocol": 1,
        "sessionId": session_id, "payload": request(env)})
    assert replies == [{"ok": False, "code": "unauthorized"}]
    assert not env.store.path.exists()


def test_catalogue_page_uses_two_source_checks_and_discards_external_edits(setup, monkeypatch):
    env = setup
    transport, session_id = transport_session(env)
    library = env.arcade.get_library_catalogue()
    library.service()  # Build once; measure the two inexpensive warm metadata checks.
    watch = library._watch
    passes = []
    def observed():
        passes.append(1)
        return watch()
    monkeypatch.setattr(library, "_watch", observed)
    assert native_request(transport, session_id)["ok"]
    assert len(passes) == 2
    search = library.service().search
    def external_edit(payload):
        page = search(payload)
        config = read(env.runtime / "config.json")
        config["external_edit"] = True
        write(env.runtime / "config.json", config)
        return page
    monkeypatch.setattr(library.service(), "search", external_edit)
    assert native_request(transport, session_id) == {"ok": False, "code": "catalogue-changed"}
    assert library._read_depth == 0
    assert not env.store.path.exists()


def test_catalogue_exact_local_artwork_ownership_revision_and_redaction(setup):
    import base64
    from test_catalogue_png import fixture, decoded
    env = setup
    image = env.source / "loading.png"
    image.write_bytes(fixture())
    metadata = read(env.source / "collection-metadata.json")
    metadata["games"][0]["loading_screen"] = "loading.png"
    env.lifecycle.save_metadata(env.source, metadata)
    transport, session_id = transport_session(env)
    entry = native_request(transport, session_id)["entries"][0]
    assert entry["artworkRef"] and entry["availability"] == "available"
    request = {key: entry[key] for key in ("catalogueId", "artworkRef")}
    response = native_request(transport, session_id, "GET_ARTWORK", request)
    assert response["ok"] and response["contentType"] == "image/png", response
    assert (response["width"], response["height"]) == (2, 1)
    assert len(decoded(base64.b64decode(response["data"]))) == 9
    assert str(env.source) not in json.dumps(response) and "loading.png" not in json.dumps(response)
    assert not env.store.path.exists()
    assert native_request(transport, session_id, "GET_ARTWORK", {**request, "catalogueId": "another"})["code"] == "entry-missing"
    image.write_bytes(fixture(scanlines=b"\0\x01\x02\x03\x04\x05\x06"))
    assert native_request(transport, session_id, "GET_ARTWORK", request)["code"] == "entry-changed"
    entry = native_request(transport, session_id)["entries"][0]
    image.write_bytes(b"corrupt")
    entry = native_request(transport, session_id)["entries"][0]
    assert entry["availability"] == "available"
    # Browse does not stat every artwork file; the old handle must be rejected.
    assert native_request(transport, session_id, "GET_ARTWORK", {key: entry[key] for key in request})["code"] == "entry-changed"
    metadata["games"][0]["description"] = "Refresh this metadata projection"
    env.lifecycle.save_metadata(env.source, metadata)
    entry = native_request(transport, session_id)["entries"][0]
    assert native_request(transport, session_id, "GET_ARTWORK", {key: entry[key] for key in request})["code"] == "unavailable"
    image.unlink()
    assert native_request(transport, session_id)["entries"][0]["artworkRef"] == ""


@pytest.mark.parametrize("source", ["https://example.com/private.png", "../outside.png", "C:/private.png", "missing.png"])
def test_catalogue_artwork_never_fetches_or_escapes_source(setup, source):
    env = setup
    metadata = read(env.source / "collection-metadata.json")
    metadata["games"][0]["loading_screen"] = source
    env.lifecycle.save_metadata(env.source, metadata)
    transport, session_id = transport_session(env)
    entry = native_request(transport, session_id)["entries"][0]
    assert entry["artworkRef"] == "" and entry["availability"] == "available"


def test_host_rejects_an_artwork_descriptor_outside_its_source(setup, monkeypatch, tmp_path):
    from test_catalogue_png import fixture
    env = setup
    image = tmp_path / "outside.png"
    image.write_bytes(fixture())
    transport, session_id = transport_session(env)
    service = env.arcade.get_catalogue_service()
    descriptor = {"catalogueId": "entry", "artworkRef": "art", "entryRevision": "revision", "root": str(env.source),
                  "path": str(image), "signature": env.module._signature(image)}
    monkeypatch.setattr(service, "resolve_artwork", lambda *_: descriptor)
    assert native_request(transport, session_id, "GET_ARTWORK", {"catalogueId": "entry", "artworkRef": "art"}) == {
        "ok": False, "code": "review-required"}


def test_artwork_opened_file_must_match_the_validated_identity(setup, monkeypatch, tmp_path):
    from test_catalogue_png import fixture
    env = setup
    original, foreign = env.source / "loading.png", tmp_path / "foreign.png"
    original.write_bytes(fixture())
    foreign.write_bytes(fixture(scanlines=b"\0\x01\x02\x03\x04\x05\x06"))
    metadata = read(env.source / "collection-metadata.json")
    metadata["games"][0]["loading_screen"] = "loading.png"
    env.lifecycle.save_metadata(env.source, metadata)
    transport, session_id = transport_session(env)
    entry = native_request(transport, session_id)["entries"][0]
    opened = Path.open
    def swapped(path, *args, **kwargs):
        return opened(foreign if path == original else path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", swapped)
    assert native_request(transport, session_id, "GET_ARTWORK", {key: entry[key] for key in ("catalogueId", "artworkRef")}) == {
        "ok": False, "code": "entry-changed"}


def test_catalogue_reads_exact_cached_provider_artwork_without_network(setup, monkeypatch):
    from arcade_core.artwork_cache import ArtworkCache
    from test_catalogue_png import fixture
    env=setup
    reference='scraper-artwork/screenscraper/76/123/box-2D/wor'
    ArtworkCache(env.runtime).write(reference, fixture())
    metadata=read(env.source/'collection-metadata.json')
    metadata['games'][0]['loading_screen']=reference
    env.lifecycle.save_metadata(env.source,metadata)
    monkeypatch.setattr(env.arcade,'screenscraper_open',lambda *a,**k:pytest.fail('Picker must never fetch artwork'))
    transport,session_id=transport_session(env)
    entry=native_request(transport,session_id)['entries'][0]
    assert entry['artworkRef']
    response=native_request(transport,session_id,'GET_ARTWORK',{key:entry[key] for key in ('catalogueId','artworkRef')})
    assert response['ok'] and response['width']==2 and response['height']==1
    assert 'scraper-cache' not in json.dumps(response) and reference not in json.dumps(response)
    assert env.host._catalogue_thumbnail(env.arcade,entry['catalogueId']).startswith('data:image/png;base64,')
