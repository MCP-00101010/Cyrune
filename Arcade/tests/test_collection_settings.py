import json
from pathlib import Path

from test_feature_parity import configure_fixture, load_server


def settings(server, collection_id='desasteron'):
    return server.dispatch_arcade_api('GET', '/api/collection-settings', {'collection_id':collection_id})['settings']


def save(server, current, **changes):
    return server.dispatch_arcade_api('POST', '/api/collection-settings', data={
        'collection_id':current['id'], 'revision':current['revision'], 'name':current['name'], 'root':current['root'], **changes})


def test_settings_are_scoped_revision_checked_and_leave_media_and_defaults_intact(tmp_path):
    server = load_server()
    root = configure_fixture(server, tmp_path)
    before = (root/'collection-metadata.json').read_bytes()
    original = settings(server)
    config = server.load_config()
    record = next(row for row in config['collections'] if row['id'] == original['id'])
    result = save(server, original, name='Renamed display')
    assert result['ok'], result
    updated = next(row for row in server.load_config()['collections'] if row['id'] == original['id'])
    assert updated == {**record, 'name':'Renamed display'}
    assert (root/'collection-metadata.json').read_bytes() == before
    assert server.active_collection()['id'] == original['id']
    assert not save(server, original, name='Stale settings')['ok']
    assert settings(server)['name'] == 'Renamed display'


def test_invalid_or_duplicate_library_locations_do_not_save(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    other_root = tmp_path/'other-library'
    other_root.mkdir()
    server.add_collection(str(other_root), 'Other')
    original = settings(server)
    before = server.CONFIG_FILE.read_bytes()
    other = next(row for row in server.load_config()['collections'] if row['id'] != original['id'])
    for changes in ({'root':str(tmp_path/'missing')}, {'root':other['root']}, {'name':''},
                    {'scummvm_config':'unrelated.ini'}, {'adapter':'scummvm-config-v1'}):
        assert not save(server, original, **changes)['ok']
        assert server.CONFIG_FILE.read_bytes() == before


def test_library_location_changes_validate_adapter_and_reset_only_active_index(tmp_path):
    server = load_server()
    root = configure_fixture(server, tmp_path)
    original = settings(server)
    new_root = tmp_path/'alternate'
    new_root.mkdir()
    (new_root/'collection-metadata.json').write_text(json.dumps({'adapter':'atari-st-disks-v1','games':[]}),encoding='utf-8')
    assert not save(server, original, root=str(new_root))['ok']
    (new_root/'collection-metadata.json').write_text(json.dumps({'games':[]}),encoding='utf-8')
    result = save(server, original, root=str(new_root))
    assert result['ok'], result
    assert server.COLLECTION == new_root.resolve()
    assert server.LIBRARY is None
    assert root.is_dir()
    assert Path(settings(server)['root']) == new_root


def test_save_failure_keeps_configuration_and_library(tmp_path, monkeypatch):
    server = load_server()
    configure_fixture(server, tmp_path)
    original = settings(server)
    library = server.get_library()
    before = server.CONFIG_FILE.read_bytes()
    monkeypatch.setattr(server, 'save_config', lambda _: (_ for _ in ()).throw(OSError('Save unavailable')))
    assert not save(server, original, name='Unsaved')['ok']
    assert server.CONFIG_FILE.read_bytes() == before
    assert server.LIBRARY is library


def test_other_platform_settings_do_not_switch_library_or_change_pins(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    config = server.load_config()
    root = tmp_path/'scummvm'
    root.mkdir()
    ini = tmp_path/'scummvm.ini'
    ini.write_text('[scummvm]\n', encoding='utf-8')
    collection = {'id':'scummvm', 'name':'ScummVM', 'adapter':'scummvm-config-v1',
        'root':str(root), 'scummvm_config':str(ini), 'default_emulator':'scummvm', 'writable':False}
    config['collections'].append(collection)
    server.save_config(config)
    library = server.get_library()
    original = settings(server, 'scummvm')
    result = save(server, original, name='Adventure library', scummvm_config=str(ini))
    assert result['ok'], result
    assert server.active_collection()['id'] == 'desasteron'
    assert server.LIBRARY is library
    assert next(row for row in server.load_config()['collections'] if row['id']=='scummvm') == {**collection,'name':'Adventure library','index_schema':2}


def test_prepared_roots_require_reattachment_instead_of_retargeting(tmp_path):
    from arcade_core.collection_settings import settings_record, validate_settings
    import pytest
    root, target, runtime = (tmp_path/name for name in ('root','target','runtime'))
    for path in (root,target,runtime):
        path.mkdir()
    (runtime/'catalogue-proofs.json').write_text(json.dumps({'sources':{'prepared':{}}}),encoding='utf-8')
    collection = {'id':'prepared','name':'Prepared','root':str(root)}
    current = settings_record(collection)
    with pytest.raises(ValueError, match='Reconnect Collection'):
        validate_settings({'collections':[collection]}, {'collection_id':'prepared','revision':current['revision'],
            'name':'Prepared','root':str(target)}, runtime, tmp_path/'checkout')
