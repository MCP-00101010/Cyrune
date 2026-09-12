from copy import deepcopy
from pathlib import Path
import sys
import uuid

import pytest

from test_atari_bindings import atari, selection, property_request  # noqa: F401
from test_catalogue_bindings import setup, read, write  # noqa: F401
from test_scummvm_bindings import RunningProcess


@pytest.fixture
def hatari(request):
    env = request.getfixturevalue('atari')
    folder = env.executable.parent / 'Hatari'
    folder.mkdir()
    exe = folder / 'hatari.exe'
    exe.write_bytes(b'Fake Hatari - never execute')
    profile = '[System]\nnModelType=2\n[ROM]\nszTosImageFileName=TOS.img\n[Floppy]\nbAutoInsertDiskB=TRUE\nszDiskBFileName=old.st\n[Memory]\nbAutoSave=TRUE\n[HardDisk]\nbBootFromHardDisk=TRUE\n'
    (folder / 'hatari.cfg').write_text(profile)
    (folder / 'configs').mkdir()
    (folder / 'configs' / 'STe 8Mhz 2MB 1.62').write_text(profile)
    config = read(env.arcade.CONFIG_FILE)
    config['emulators']['hatari'] = {'name': 'Hatari', 'type': 'hatari', 'path': str(exe), 'arguments': [],
                                    'supported_extensions': ['.st', '.stx', '.msa', '.dim']}
    write(env.arcade.CONFIG_FILE, config)
    env.hatari = exe
    return env


def select_hatari(env, *, named=True, save=False):
    service, request = property_request(env)
    emulator = next(e for e in service.preview('atari', request['gameId'])['emulators'] if e['id'] == 'hatari')
    request['settings'].update(emulatorId='hatari', profileId=emulator['profiles'][0]['id'] if named else '', driveB='empty')
    if save:
        result = service.disk_action({'collectionId': 'atari', 'gameId': request['gameId'], 'action': 'create'})
        request['settings'].update(driveB='save', saveDisk=result['selectedDisk'])
    service.save(request)
    return env.arcade.resolve_atari_game_plan('atari', request['gameId'])


def test_hatari_properties_migrate_existing_portal_key_and_switch_back(hatari):
    env = hatari
    key = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]['game']['gameKey']
    before = env.store.load()
    plan = select_hatari(env, save=True)
    after = env.store.load()
    assert after['schemaVersion'] == 5
    assert after['receipts'] == before['receipts'] and set(after['bindings']) == set(before['bindings'])
    assert env.store.resolve(key) == plan
    disk = Path(plan['settings']['saveDisk'])
    disk.write_bytes(disk.read_bytes()[:-512] + b'x' * 512)
    assert env.store.resolve(key) == plan
    assert env.host.emugui_game_status(key)['emulatorName'] == 'Hatari'
    service, request = property_request(env)
    request['settings'].update(emulatorId='steem', profileId='')
    service.save(request)
    assert env.store.resolve(key)['adapterId'] == 'steem'
    assert env.store.resolve(key)['settings']['driveB'] == plan['settings']['driveB']
    assert env.store.resolve(key)['settings']['saveDisk'] == plan['settings']['saveDisk']
    assert disk.read_bytes()[-512:] == b'x' * 512
    assert env.store.load()['schemaVersion'] == 5, 'Never downgrade a migrated store'


@pytest.mark.parametrize('drive', ['empty', 'game:1', 'game:2'])
def test_drive_b_is_edition_owned_across_emulator_choices(hatari, drive):
    env = hatari
    service, request = property_request(env)
    request['settings']['driveB'] = drive
    service.save(request)
    default = env.arcade.resolve_atari_game_plan('atari', request['gameId'])
    alternative = env.arcade.resolve_atari_game_plan('atari', request['gameId'], 'hatari')
    assert alternative['settings']['driveB'] == default['settings']['driveB']
    assert service.preview('atari', request['gameId'])['settings'] == request['settings']
    for emulator in ('hatari', 'steem'):
        request['revision'] = service.preview('atari', request['gameId'])['revision']
        request['settings']['emulatorId'] = emulator
        result = service.save(request)
        assert result['settings']['driveB'] == drive
        current = env.arcade.resolve_atari_game_plan('atari', request['gameId'])
        assert current['settings']['driveB'] == default['settings']['driveB']


@pytest.mark.parametrize('save', [False, True])
def test_hatari_launch_private_config_disks_backups_and_session_leases(hatari, monkeypatch, save):
    env = hatari
    plan = select_hatari(env, save=save)
    original = Path(plan['settings']['profile']).read_bytes()
    sessions = env.host._atari_save_sessions()
    monkeypatch.setattr(sys.modules[type(sessions).__module__], 'process_identity', lambda pid: str(pid))
    calls = []
    monkeypatch.setattr(env.host.subprocess, 'Popen', lambda command, **kwargs: calls.append((command, kwargs)) or RunningProcess())
    assert env.host._execute_catalogue_plan(plan)
    text = (Path(plan['settings']['sessionDirectory']) / 'launch.cfg').read_text()
    assert 'bAutoInsertDiskB=FALSE' in text and 'szDiskBFileName=\n' in text
    assert 'bAutoSave=FALSE' in text and 'bBootFromHardDisk=FALSE' in text
    assert 'nModelType=2' in text and 'szTosImageFileName=TOS.img' in text
    assert Path(plan['settings']['profile']).read_bytes() == original
    assert calls[0][0] == [str(env.hatari), *plan['arguments']] and calls[0][1]['shell'] is False
    assert ('--disk-b' in plan['arguments']) == save
    if save:
        assert list((env.atari_root / 'Safe Disks' / '.backups').rglob('*.st'))
    with pytest.raises(ValueError, match='already in use'):
        env.host._execute_catalogue_plan(plan)
    assert len(calls) == 1


def test_hatari_one_time_arcade_choice_executes_without_changing_portal_default(hatari, monkeypatch):
    env = hatari
    key = env.store.bind(env.session, selection(env), allow_atari=True)['results'][0]['game']['gameKey']
    before = env.store.resolve(key)
    plan = env.arcade.resolve_atari_game_plan('atari', before['gameId'], 'hatari')
    sessions = env.host._atari_save_sessions()
    monkeypatch.setattr(sys.modules[type(sessions).__module__], 'process_identity', lambda pid: str(pid))
    calls = []
    monkeypatch.setattr(env.host.subprocess, 'Popen', lambda command, **kwargs: calls.append(command) or RunningProcess())
    assert env.host._execute_catalogue_plan(plan, atari_emulator_override='hatari')
    assert calls[0][0] == str(env.hatari)
    assert env.store.resolve(key) == before
    with pytest.raises(Exception):
        env.host._execute_catalogue_plan(plan)


def test_hatari_bind_requires_atari_capability_and_rejects_forged_plans(hatari):
    env = hatari
    plan = select_hatari(env)
    request = selection(env)
    assert env.store.bind(env.session, request)['results'][0]['code'] == 'unsupported-target'
    request['requestId'] = str(uuid.uuid4())
    result = env.store.bind(env.session, request, allow_atari=True)['results'][0]
    assert result['ok'] and env.store.load()['schemaVersion'] == 5
    module = env.host._catalogue_binding_module()
    for field, value in [('arguments', ['--parse', str(env.hatari)]), ('schemaVersion', 4), ('adapterId', 'steem')]:
        changed = deepcopy(plan)
        changed[field] = value
        with pytest.raises(Exception):
            module.validate_plan(changed)
    for field, value in [('profile', str(env.hatari)), ('sessionDirectory', str(env.runtime)),
                         ('driveB', str(env.hatari)), ('saveDisk', str(env.hatari))]:
        changed = deepcopy(plan)
        changed['settings'][field] = value
        with pytest.raises(Exception):
            module.validate_plan(changed)
    Path(plan['settings']['profile']).write_text('[System]\nnModelType=0\n')
    with pytest.raises(Exception):
        env.store.resolve(result['game']['gameKey'])
