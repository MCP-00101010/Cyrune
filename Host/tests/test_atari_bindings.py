from copy import deepcopy
from pathlib import Path
import uuid

import pytest

from test_catalogue_bindings import setup, read, write  # noqa: F401
from test_scummvm_bindings import RunningProcess


@pytest.fixture
def atari(request):
    env = request.getfixturevalue('setup')
    from arcade_core.atari import discover
    root = env.runtime.parent / 'Atari'
    root.mkdir()
    for language in ('en', 'de'):
        for disk in (1, 2, 3):
            (root / f'Atari Game (1990)(Pub)({language})(Disk {disk} of 3).st').write_bytes(bytes([disk]) * 1024)
    metadata, rejected = discover(root, env.arcade.parse_tosec_name)
    assert rejected == []
    write(root / 'collection-metadata.json', metadata)
    (env.executable.parent / 'steem.ini').write_text('[Machine]\n')
    config = read(env.arcade.CONFIG_FILE)
    config['collections'].append({'id': 'atari', 'root': str(root), 'adapter': 'atari-st-disks-v1',
        'default_emulator': 'steem', 'writable': False, 'auto_metadata': False})
    config['emulators']['steem'] = {'name': 'STEem SSE', 'type': 'steem', 'path': str(env.executable), 'arguments': []}
    write(env.arcade.CONFIG_FILE, config)
    env.atari_root = root
    return env


def selection(env):
    entry = env.arcade.get_catalogue_service().search({'includeAtari': True, 'platformIds': ['atari-st']})['entries'][0]
    return {'requestId': str(uuid.uuid4()), 'entries': [{k: entry[k] for k in ('catalogueId', 'entryRevision')}]}


def test_arcade_send_and_properties_avoid_unrelated_status_and_library_rebuilds(atari, monkeypatch):
    env = atari
    env.arcade.activate_collection('atari')
    env.arcade.update_state(lambda state: state.update(active_collection_id='atari'))
    library = env.arcade.get_library()
    game = library.games[0]
    record = env.host._emugui_record
    def read(operation, *args):
        assert operation != 'STATUS', 'Sending must not enumerate unrelated queues/profiles'
        return record(operation, *args)
    monkeypatch.setattr(env.host, '_emugui_record', read)
    binding = env.host.create_emugui_game_binding(game.id)
    monkeypatch.setattr(library, 'rebuild', lambda *a, **k: pytest.fail('Saving properties must not reindex the collection'))
    preview = env.arcade.dispatch_arcade_api('GET', '/api/game-properties', {'collectionId':'atari', 'gameId':game.id})
    request = {key:preview[key] for key in ('collectionId','gameId','revision','settings')}
    request.update(diskAction={'kind':'none'}, makeDefault=True)
    request['settings']['driveB'] = 'empty'
    result = env.arcade.dispatch_arcade_api('POST', '/api/game-properties', {}, request)
    assert result['ok'], result
    assert env.arcade.get_library() is library
    assert library.get_game(game.id).default_emulator == 'steem'
    assert env.store.resolve(binding['gameKey'])['settings']['driveB'] == ''


def test_atari_binding_requires_capability_and_launches_exact_set_while_inactive(atari, monkeypatch):
    env = atari
    request = selection(env)
    denied = env.store.bind(env.session, request)
    assert denied['results'][0]['code'] == 'unsupported-target'
    request['requestId'] = str(uuid.uuid4())
    response = env.store.bind(env.session, request, allow_atari=True)
    item = response['results'][0]
    assert item['ok'], item
    game_key = item['game']['gameKey']
    assert env.store.load()['schemaVersion'] == 3
    plan = env.store.resolve(game_key)
    calls = []
    monkeypatch.setattr(env.host.subprocess, 'Popen', lambda command, **kwargs: calls.append((command, kwargs)) or RunningProcess())
    monkeypatch.setattr(env.arcade, 'focus_launched_emulator', lambda *args: None)
    assert env.host._execute_catalogue_plan(plan)
    assert calls[0][0] == [str(env.executable), *plan['arguments']]
    assert len(plan['disks']) == 3
    assert calls[0][1]['shell'] is False
    assert env.arcade.active_collection()['id'] != 'atari'
    status = env.host.emugui_game_status(game_key)
    assert status['defaultVersion']['systems'] == ['ST']
    assert status['systemId'] == 'atari-st'
    assert str(env.atari_root) not in str(status)
    Path(plan['disks'][2]['path']).write_bytes(b'changed third disk')
    with pytest.raises(Exception):
        env.store.resolve(game_key)


def test_atari_independent_host_validation_rejects_argument_and_target_substitution(atari):
    env = atari
    req = selection(env)['entries'][0]
    plan = env.arcade.resolve_catalogue_launch_plan(req['catalogueId'], req['entryRevision'])
    module = env.host._catalogue_binding_module()
    assert module.validate_plan(plan)['adapterId'] == 'steem'
    for key, value in [('arguments', ['OPENNEW', 'INI=C:/other.ini']), ('system', 'Falcon'), ('media', 'C:/other.st')]:
        changed = deepcopy(plan)
        changed[key] = value
        with pytest.raises(module.BindingError):
            module.validate_plan(changed)


def test_atari_versions_share_a_default_and_arcade_link_selects_the_source(atari):
    env = atari
    item = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]
    key = item['game']['gameKey']
    versions = env.host.game_versions_request(key)
    german = next(v for v in versions['versions'] if v['languages'] == ['de'])
    assert env.host.game_versions_request(key, 'default', german['catalogueId'], german['entryRevision'])['ok']
    assert env.host.emugui_game_status(key)['defaultVersion']['languages'] == ['de']
    assert 'collection=atari' in env.host.emugui_game_link(key)


def test_atari_transport_requires_its_own_negotiation(atari):
    from test_catalogue_bindings import transport_session, native_request
    transport, session = transport_session(atari)
    transport._supported_atari = lambda: True
    before = native_request(transport, session)
    assert before['ok']
    assert all(e['targetKind'] == 'media-file' for e in before['entries'])
    assert native_request(transport, session, 'ENABLE_ATARI')['ok']
    page = native_request(transport, session, payload={'platformIds': ['atari-st']})
    assert page['ok'], page
    assert len(page['entries']) == 2
    assert all(e['targetKind'] == 'disk-set' for e in page['entries'])
    request = {'requestId': str(uuid.uuid4()), 'entries': [
        {k: page['entries'][0][k] for k in ('catalogueId', 'entryRevision')}]}
    bound = native_request(transport, session, 'BIND_ENTRIES', request)
    assert bound['results'][0]['ok'], bound


def test_atari_schema_upgrade_preserves_existing_spectrum_approval(atari):
    from test_catalogue_bindings import bind
    key = bind(atari)
    before = atari.store.load()
    assert before['schemaVersion'] == 1
    result = atari.store.bind(atari.session, selection(atari), allow_atari=True)
    assert result['results'][0]['ok']
    after = atari.store.load()
    assert after['schemaVersion'] == 3
    assert after['bindings'][key] == before['bindings'][key]
    for session, group in before['receipts'].items():
        assert after['receipts'][session]['expiresAt'] == group['expiresAt']
        assert all(after['receipts'][session]['requests'][key] == value for key, value in group['requests'].items())
    assert atari.store.resolve(key)['adapterId'] == 'generic'
    write(atari.store.path, {**after, 'schemaVersion': 2})
    with pytest.raises(atari.module.BindingError):
        atari.store.load()


def property_request(env):
    service = env.arcade.game_properties_service()
    entry = selection(env)['entries'][0]
    indexed = env.arcade.get_catalogue_service()._by_id[entry['catalogueId']]
    preview = service.preview('atari', indexed.legacy_id)
    request = {k: preview[k] for k in ('collectionId','gameId','revision','settings')}
    request.update(makeDefault=False, diskAction={'kind':'none'})
    return service, request


def test_properties_save_keeps_portal_key_valid_after_save_disk_writes(atari):
    env = atari
    item = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]
    key = item['game']['gameKey']
    service, request = property_request(env)
    request['settings'].update(driveB='save',saveDisk='ST Save Disk.st')
    request['diskAction']={'kind':'create','name':'ST Save Disk.st'}
    service.save(request)
    plan = env.store.resolve(key)
    assert plan['schemaVersion'] == 4
    assert plan['settings']['saveDisk'].endswith('Safe Disks\\ST Save Disk.st')
    target = Path(plan['settings']['saveDisk'])
    target.write_bytes(target.read_bytes()[:-512] + b'x'*512)
    assert env.store.resolve(key) == plan, 'Ordinary save contents do not invalidate approval'
    assert env.arcade.active_collection()['id'] != 'atari'


def test_named_profile_and_empty_b_are_isolated_from_original_preferences(atari, monkeypatch):
    env=atari
    folder=env.executable.parent/'config'
    folder.mkdir()
    profile=folder/'STe 1MB.ini'
    profile.write_text('[Machine]\nROM_File=TOS.img\n[Disks]\nAutoInsert2=1\nDisk_B_Path=old.st\n[Options]\nAutoLoadSnapShot=1\n')
    service, request=property_request(env)
    preview=service.preview('atari',request['gameId'])
    request['settings'].update(profileId=preview['emulators'][0]['profiles'][0]['id'],driveB='empty')
    original=profile.read_bytes()
    service.save(request)
    plan=env.arcade.resolve_atari_game_plan('atari',request['gameId'])
    module=env.host._catalogue_binding_module()
    assert module.validate_plan(plan)
    sessions=env.host._atari_save_sessions()
    sessions_module=__import__('sys').modules[sessions.__class__.__module__]
    monkeypatch.setattr(sessions_module,'process_identity',lambda pid: str(pid))
    calls=[]
    monkeypatch.setattr(env.host.subprocess,'Popen',lambda command,**kwargs: calls.append(command) or RunningProcess())
    assert env.host._execute_catalogue_plan(plan)
    ini=Path(plan['settings']['sessionDirectory'])/'launch.ini'
    text=ini.read_text(encoding='utf-8')
    assert 'AutoInsert2=0' in text and 'Disk_B_Path=\n' in text and 'AutoLoadSnapShot=0' in text
    assert 'ROM_File=TOS.img' in text
    assert len(plan['arguments']) == 3
    assert profile.read_bytes() == original
    with pytest.raises(ValueError,match='already in use'):
        env.host._execute_catalogue_plan(plan)
    assert len(calls)==1
    with pytest.raises(ValueError,match='already in use'):
        service.save({**request,'revision':service.preview('atari',request['gameId'])['revision']})


def test_advanced_atari_plan_rejects_forged_save_profile_and_session_paths(atari):
    service, request=property_request(atari)
    service.save(request)
    plan=atari.arcade.resolve_atari_game_plan('atari',request['gameId'])
    module=atari.host._catalogue_binding_module()
    for key, value in [('profile',str(atari.executable)),('sessionDirectory',str(atari.runtime)),('driveB','C:/outside.st'),('saveDisk','C:/outside.st')]:
        changed=deepcopy(plan)
        changed['settings'][key]=value
        with pytest.raises((module.BindingError, OSError, ValueError)):
            module.validate_plan(changed)


def test_properties_can_select_default_for_existing_portal_group(atari):
    env = atari
    item = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]
    key = item['game']['gameKey']
    service = env.arcade.game_properties_service()
    versions = env.host.game_versions_request(key)['versions']
    desired = next(v for v in versions if v['languages'] == ['de'])
    indexed = env.arcade.get_catalogue_service()._by_id[desired['catalogueId']]
    preview = service.preview('atari', indexed.legacy_id)
    request = {k: preview[k] for k in ('collectionId','gameId','revision','settings')}
    request.update(makeDefault=True,diskAction={'kind':'none'})
    service.save(request)
    assert env.host.emugui_game_status(key)['defaultVersion']['languages'] == ['de']


def test_private_profile_preserves_ansi_paths_and_releases_stale_session(atari, monkeypatch):
    env = atari
    profile = env.executable.parent/'steem.ini'
    original = '[Machine]\nROM_File=C:\\Emulation\\Français\\TOS.img\n'.encode('cp1252')
    profile.write_bytes(original)
    service, request = property_request(env)
    request['settings']['driveB'] = 'empty'
    service.save(request)
    plan = env.arcade.resolve_atari_game_plan('atari', request['gameId'])
    sessions = env.host._atari_save_sessions()
    module = __import__('sys').modules[sessions.__class__.__module__]
    identities = {123: 'first'}
    monkeypatch.setattr(module, 'process_identity', lambda pid: identities.get(pid, str(pid)))
    monkeypatch.setattr(env.host.subprocess, 'Popen', lambda *args, **kwargs: RunningProcess())
    assert env.host._execute_catalogue_plan(plan)

    private = Path(plan['settings']['sessionDirectory'])/'launch.ini'
    assert original.splitlines()[1] in private.read_bytes()
    assert profile.read_bytes() == original
    identities[123] = 'reused-pid'
    assert env.host._execute_catalogue_plan(plan)


def test_scraped_metadata_keeps_existing_portal_binding_and_properties(atari):
    env = atari
    item = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]
    key = item['game']['gameKey']
    service, request = property_request(env)
    request['settings'].update(driveB='save',saveDisk='ST Save Disk.st')
    request['diskAction'] = {'kind':'create','name':'ST Save Disk.st'}
    service.save(request)
    before = env.store.resolve(key)
    policies = env.store.load()
    env.arcade.activate_collection('atari')
    env.arcade.update_state(lambda state: state.update(active_collection_id='atari'))
    result = env.arcade.apply_scrape_metadata(request['gameId'], {'title':'Scraped Atari title','publisher':'New publisher'})
    assert result['ok']
    after = env.store.resolve(key)
    assert after['public']['title'] == 'Scraped Atari title'
    assert after['arguments'] == before['arguments'] and after['settings'] == before['settings']
    assert env.store.load() == policies
