from pathlib import Path

import pytest

from test_atari import library
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.game_properties import GameProperties, profile_options, selected_profile
from arcade_core.persistence import atomic_write_json
from arcade_core.emulators import validate_emulator, EmulatorConfigError


def hatari_library(tmp_path):
    root, metadata, lifecycle = library(tmp_path)
    executable = tmp_path / 'hatari.exe'
    executable.write_bytes(b'synthetic executable, never run')
    (tmp_path / 'hatari.cfg').write_text('[System]\nnModelType=0\n[Floppy]\n')
    folder = tmp_path / 'configs'
    folder.mkdir()
    (folder / 'STe 8Mhz 2MB 1.62').write_text('[System]\nnModelType=2\n')
    (folder / 'ST.cfg').write_text('[System]\nnModelType=0\n')
    config = lifecycle._config()
    config['emulators']['hatari'] = validate_emulator('hatari', {
        'name': 'Hatari', 'type': 'hatari', 'path': str(executable), 'arguments': []})
    atomic_write_json(lifecycle.config_path, config)
    return root, metadata, lifecycle, executable


def test_hatari_one_time_launch_preserves_default_and_properties(tmp_path):
    _, metadata, lifecycle, executable = hatari_library(tmp_path)
    manager = GameProperties(lifecycle.runtime, lifecycle._config, lambda *_: {'ok': False})
    gid = metadata['games'][0]['id']
    before = manager.preview('atari', gid)
    entry = next(e for e in lifecycle.service()._by_id.values() if e.legacy_id == gid)
    plan = resolve_plan(lifecycle, entry.base['catalogueId'], atari_emulator_override='hatari')
    assert plan['schemaVersion'] == 5
    assert plan['arguments'] == ['--configfile', str(Path(plan['settings']['sessionDirectory']) / 'launch.cfg'),
                                 '--disk-a', plan['disks'][0]['path'], '--disk-b', plan['disks'][1]['path']]
    assert manager.preview('atari', gid) == before
    assert resolve_plan(lifecycle, entry.base['catalogueId'])['adapterId'] == 'steem'
    assert [p['name'] for p in profile_options(executable, 'hatari')] == ['ST', 'STe 8Mhz 2MB 1.62']


@pytest.mark.parametrize('system', ['ST', 'STe', 'TT', 'Falcon'])
def test_hatari_properties_support_hardware_and_named_configs(tmp_path, system):
    root, metadata, lifecycle, _ = hatari_library(tmp_path)
    metadata['games'][0]['system'] = system
    atomic_write_json(root / 'collection-metadata.json', metadata)
    manager = GameProperties(lifecycle.runtime, lifecycle._config, lambda *_: {'ok': False})
    gid = metadata['games'][0]['id']
    preview = manager.preview('atari', gid)
    assert {e['id'] for e in preview['emulators']} == ({'hatari'} if system in {'TT', 'Falcon'} else {'hatari', 'steem'})
    emulator = next(e for e in preview['emulators'] if e['id'] == 'hatari')
    request = {k: preview[k] for k in ('collectionId', 'gameId', 'revision', 'settings')}
    request['settings'].update(emulatorId='hatari', profileId=emulator['profiles'][1]['id'], driveB='empty')
    manager.save({**request, 'diskAction': {'kind': 'none'}, 'makeDefault': False})
    entry = next(e for e in lifecycle.service()._by_id.values() if e.legacy_id == gid)
    plan = resolve_plan(lifecycle, entry.base['catalogueId'])
    assert plan['adapterId'] == 'hatari' and plan['system'] == system
    assert plan['settings']['profile'].endswith('STe 8Mhz 2MB 1.62')
    assert '--disk-b' not in plan['arguments']


def test_hatari_default_profile_location_and_configuration_registration(tmp_path, monkeypatch):
    _, _, lifecycle, executable = hatari_library(tmp_path)
    from tools.configure_hatari import configure
    before = lifecycle._config()
    configure(lifecycle.config_path, executable, apply=True)
    assert lifecycle._config()['collections'] == before['collections']
    assert list(lifecycle.config_path.parent.glob('config.before-hatari-*.json'))
    (tmp_path / 'hatari.cfg').unlink()
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'local'))
    default = tmp_path / 'local' / 'Hatari' / 'hatari.cfg'
    default.parent.mkdir(parents=True)
    default.write_text('[System]\n')
    assert selected_profile(executable, '', 'hatari') == default
    with pytest.raises(EmulatorConfigError):
        validate_emulator('hatari', {'type': 'hatari', 'arguments': ['--parse', '{file}']})


def test_hatari_rejects_unsupported_stt_and_missing_named_profile(tmp_path):
    root, metadata, lifecycle, executable = hatari_library(tmp_path)
    row = metadata['games'][0]
    first = Path(row['disks'][0])
    (root / first).rename((root / first).with_suffix('.stt'))
    row['disks'][0] = row['file'] = first.with_suffix('.stt').as_posix()
    atomic_write_json(root / 'collection-metadata.json', metadata)
    entry = next(e for e in lifecycle.service()._by_id.values() if e.legacy_id == row['id'])
    with pytest.raises(CatalogueError, match='unsupported-target'):
        resolve_plan(lifecycle, entry.base['catalogueId'], atari_emulator_override='hatari')
    with pytest.raises(ValueError, match='missing'):
        selected_profile(executable, 'f' * 24, 'hatari')
