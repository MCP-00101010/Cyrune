import struct
import hashlib
from copy import deepcopy

import pytest

from test_atari import library
from arcade_core.atari import discover
from arcade_core.game_properties import GameProperties, blank_disk, backup_disk
from arcade_core.game_properties import properties_path, read_properties
from arcade_core.persistence import atomic_write_json
from arcade_core.game_properties import disk_owners
from arcade_service import parse_tosec_name


def setup_properties(tmp_path, **kwargs):
    root, metadata, lifecycle = library(tmp_path)
    manager = GameProperties(lifecycle.runtime, lifecycle._config, lambda *_: {'ok':False}, **kwargs)
    game = metadata['games'][0]['id']
    preview = manager.preview('atari', game)
    request = {k: preview[k] for k in ('collectionId','gameId','revision','settings')}
    request.update(makeDefault=False, diskAction={'kind':'none'})
    return root, lifecycle, manager, request


def test_blank_disk_is_formatted_fat12_and_nonbootable():
    disk = blank_disk()
    assert len(disk) == 737280
    bps = struct.unpack_from('<H',disk,11)[0]
    reserved = struct.unpack_from('<H',disk,14)[0]
    fats = disk[16]
    root_entries = struct.unpack_from('<H',disk,17)[0]
    sectors = struct.unpack_from('<H',disk,19)[0]
    fat_sectors = struct.unpack_from('<H',disk,22)[0]
    assert bps * sectors == len(disk)
    assert fats == 2 and disk[13] == 2
    first = disk[reserved*bps:(reserved+fat_sectors)*bps]
    second = disk[(reserved+fat_sectors)*bps:(reserved+2*fat_sectors)*bps]
    assert first == second and first[:3] == bytes([disk[21],255,255])
    assert not any(first[3:])
    data_start = (reserved + fats*fat_sectors)*bps + root_entries*32
    assert not any(disk[data_start:])
    assert sum(struct.unpack('>256H',disk[:512])) & 0xffff != 0x1234


def test_preview_is_read_only_and_save_creates_edition_disk_excluded_from_scan(tmp_path):
    root, lifecycle, manager, request = setup_properties(tmp_path)
    before = set(tmp_path.rglob('*'))
    preview = manager.preview('atari',request['gameId'])
    assert set(tmp_path.rglob('*')) == before
    request['settings'].update(driveB='save',saveDisk=preview['suggestedName'])
    request['diskAction'] = {'kind':'create','name':preview['suggestedName']}
    result = manager.save(request)
    target = root/'Safe Disks'/preview['suggestedName']
    assert target.stat().st_size == 737280
    assert result['settings']['driveB'] == 'save'
    discovered, rejected = discover(root, parse_tosec_name)
    assert len(discovered['games']) == 2 and rejected == []
    assert len(lifecycle.service().search({'includeAtari':True})['entries']) == 2
    with pytest.raises(ValueError, match='changed'):
        manager.save(request)


def test_import_is_copied_only_on_save_and_never_overwrites(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    original = tmp_path/'existing.st'
    original.write_bytes(blank_disk())
    manager.picker = lambda *_: {'ok':True,'path':str(original)}
    selected = manager.pick('atari',request['gameId'])
    assert not (root/'Safe Disks').exists()
    request['settings'].update(driveB='save',saveDisk='ST Save Disk.st')
    request['diskAction']={'kind':'import','name':'ST Save Disk.st','token':selected['token']}
    result = manager.save(request)
    target = root/'Safe Disks/ST Save Disk.st'
    assert original.read_bytes() == target.read_bytes()
    request['revision'] = result['revision']
    with pytest.raises(ValueError,match='already exists'):
        manager.save(request)
    assert original.read_bytes() == target.read_bytes()


def test_failed_approval_rolls_back_properties_and_new_disk(tmp_path):
    def refuse(*_):
        raise ValueError('Approval failed')
    root, _, manager, request = setup_properties(tmp_path, approved=refuse)
    request['settings'].update(driveB='save',saveDisk='ST Save Disk.st')
    request['diskAction']={'kind':'create','name':'ST Save Disk.st'}
    with pytest.raises(ValueError,match='Approval failed'):
        manager.save(request)
    assert not (root/'Safe Disks/ST Save Disk.st').exists()
    assert manager.preview('atari',request['gameId'])['settings']['driveB'] == 'game:1'


def test_restore_preserves_current_disk_as_backup(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    request['settings'].update(driveB='save',saveDisk='ST Save Disk.st')
    request['diskAction']={'kind':'create','name':'ST Save Disk.st'}
    manager.save(request)
    target = root/'Safe Disks/ST Save Disk.st'
    original = target.read_bytes()
    backup_disk(target)
    target.write_bytes(original[:-512]+b'x'*512)
    preview=manager.preview('atari',request['gameId'])
    request['revision']=preview['revision']
    request['diskAction']={'kind':'restore','name':target.name,'backup':preview['saveDisks'][0]['backups'][0]['id']}
    result=manager.save(request)
    assert target.read_bytes() == original
    assert len(result['saveDisks'][0]['backups']) == 2


def test_damaged_backup_cannot_replace_save_data(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    target = root/'Safe Disks/ST Save Disk.st'
    target.parent.mkdir()
    original = blank_disk()
    target.write_bytes(original)
    backup_disk(target)
    backup = next(target.parent.rglob('.backups/**/*.st'))
    backup.write_bytes(original[:-512] + b'x'*512)
    request['settings'].update(driveB='save',saveDisk=target.name)
    request['diskAction'] = {'kind':'restore','name':target.name,'backup':backup.name}
    with pytest.raises(ValueError,match='damaged'):
        manager.save(request)
    assert target.read_bytes() == original
    backup_disk(target)
    assert any(hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256(original).digest() for p in target.parent.rglob('.backups/**/*.st'))


@pytest.mark.parametrize('committed', [False, True])
def test_interrupted_properties_recovery_preserves_save_image(tmp_path, committed):
    approvals = []
    root, lifecycle, manager, request = setup_properties(tmp_path, approved=lambda *args: approvals.append(args))
    collection = lifecycle._config()['collections'][0]
    path = properties_path(lifecycle.runtime, collection)
    before = read_properties(lifecycle.runtime, collection)
    target = root/'Safe Disks/ST Save Disk.st'
    target.parent.mkdir()
    target.write_bytes(blank_disk())
    original = target.read_bytes()
    request['settings'].update(driveB='save',saveDisk=target.name)
    after = deepcopy(before)
    after['games'][request['gameId']] = request['settings']
    atomic_write_json(path, after if committed else before)
    atomic_write_json(path.with_suffix('.pending.json'), {'before':before,'after':after,'makeDefault':True,
        'gameId':request['gameId'],'saveDisk':str(target.resolve()),'created':True})
    assert manager.preview('atari', request['gameId'])['recoveryRequired']
    response = manager.recover('atari', request['gameId'])
    assert response['recovery'] == ('completed' if committed else 'rolled-back')
    assert not response['recoveryRequired']
    assert bool(approvals) == committed
    assert target.read_bytes() == original


@pytest.mark.parametrize('name',['../escape.st','C:\\outside.st','CON.st','name.st:stream','name.st/extra'])
def test_save_disk_names_cannot_escape_the_game(tmp_path,name):
    root, _, manager, request=setup_properties(tmp_path)
    request['settings'].update(driveB='save',saveDisk=name)
    request['diskAction']={'kind':'create','name':name}
    with pytest.raises(ValueError):
        manager.save(request)
    assert not (root/'Safe Disks').exists()


def test_immediate_creation_keeps_settings_draft_and_filters_other_editions(tmp_path):
    root, lifecycle, manager, request = setup_properties(tmp_path)
    before = manager.preview('atari', request['gameId'])
    action = {'collectionId':'atari','gameId':request['gameId'],'action':'create'}
    first = manager.disk_action(action)
    original = (root/'Safe Disks'/first['selectedDisk']).read_bytes()
    second = manager.disk_action(action)
    assert second['selectedDisk'] != first['selectedDisk']
    assert '(2)' in second['selectedDisk']
    assert len(original) == 737280
    assert (root/'Safe Disks'/first['selectedDisk']).read_bytes() == original
    assert second['settings'] == before['settings'] and second['revision'] == before['revision']
    other = next(key for key in manager.context('atari',request['gameId'])[3] if key != request['gameId'])
    assert manager.preview('atari',other)['saveDisks'] == []
    theirs = manager.disk_action({**action,'gameId':other})
    assert len(theirs['saveDisks']) == 1
    (root/'Safe Disks/broken.st').write_bytes(b'not a disk')
    (root/'Safe Disks/manual.st').write_bytes(blank_disk())
    assert len(manager.preview('atari',request['gameId'])['saveDisks']) == 3
    assert len(discover(root, parse_tosec_name)[0]['games']) == 2
    request['settings'].update(driveB='save',saveDisk=first['selectedDisk'])
    assert manager.save(request)['settings']['saveDisk'] == first['selectedDisk']
    assert len(lifecycle.service().search({'includeAtari':True})['entries']) == 2


def test_immediate_import_copies_native_selection_without_applying_properties(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    original = tmp_path/'existing.st'
    content = blank_disk()[:-512]+b'x'*512
    original.write_bytes(content)
    manager.picker = lambda *_: {'ok':True,'path':str(original)}
    token = manager.pick('atari',request['gameId'])['token']
    result = manager.disk_action({'collectionId':'atari','gameId':request['gameId'],'action':'import','token':token})
    assert (root/'Safe Disks'/result['selectedDisk']).read_bytes() == content
    assert original.read_bytes() == content
    assert result['settings'] == request['settings'] and result['revision'] == request['revision']


def test_failed_immediate_creation_releases_edition_reservation(tmp_path, monkeypatch):
    root, _, manager, request = setup_properties(tmp_path)
    from arcade_core import game_properties
    action = {'collectionId':'atari','gameId':request['gameId'],'action':'create'}
    expected = manager.preview('atari',request['gameId'])['suggestedName']
    def fail(*args):
        raise OSError('disk unavailable')
    with monkeypatch.context() as patch:
        patch.setattr(game_properties.os, 'rename' if game_properties.os.name == 'nt' else 'link', fail)
        with pytest.raises(OSError, match='disk unavailable'):
            manager.disk_action(action)
    assert list((root/'Safe Disks').glob('*.st')) == []
    assert disk_owners(root/'Safe Disks')['disks'] == {}
    assert manager.disk_action(action)['selectedDisk'] == expected


def test_immediate_restore_backs_up_current_disk_without_saving_settings(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    result = manager.disk_action({'collectionId':'atari','gameId':request['gameId'],'action':'create'})
    target = root/'Safe Disks'/result['selectedDisk']
    original = target.read_bytes()
    backup_disk(target)
    target.write_bytes(original[:-512]+b'x'*512)
    preview = manager.preview('atari',request['gameId'])
    result = manager.disk_action({'collectionId':'atari','gameId':request['gameId'],'action':'restore',
        'name':target.name,'backup':preview['saveDisks'][0]['backups'][0]['id']})
    assert target.read_bytes() == original
    assert len(result['saveDisks'][0]['backups']) == 2
    assert result['revision'] == request['revision'] and result['settings'] == request['settings']


def test_disk_actions_cannot_commit_browser_supplied_launch_settings(tmp_path):
    root, _, manager, request = setup_properties(tmp_path)
    with pytest.raises(ValueError,match='Invalid save disk action'):
        manager.disk_action({'collectionId':'atari','gameId':request['gameId'],'action':'create','settings':request['settings']})
    assert not (root/'Safe Disks').exists()
