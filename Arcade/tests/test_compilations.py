from copy import deepcopy
import json
from pathlib import Path
import subprocess

import pytest

from arcade_core.atari import read_rows, refresh_index, validated_rows
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_library import LibraryCatalogue
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.compilations import KIND, discover
from arcade_core.persistence import atomic_write_json
from arcade_core.tosec import parse_tosec_name
from tools.configure_compilations import configure


def images(root, *names):
    for name in names:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'fixture image; never launch' * 40)


def fixture(tmp_path):
    root = tmp_path / 'Compilation images'
    images(root, 'Automation/A_069_1.ST', 'Automation/A_069_2.ST',
           'Fuzion/Fuzion CD 120 (1992)(Fuzion)[corrupt menu].st',
           'Fuzion/Fuzion CD 120 (1992)(Fuzion).st')
    exe = tmp_path / 'steem.exe'
    exe.write_bytes(b'never execute')
    (tmp_path / 'steem.ini').write_text('[Machine]\n')
    runtime = tmp_path / 'runtime'
    config_path = runtime / 'config.json'
    config = {'schemaVersion': 1, 'collections': [], 'default_collection': 'existing',
              'emulators': {'steem': {'type': 'steem', 'path': str(exe), 'arguments': []}},
              'keep': {'user': 'preferences'}}
    atomic_write_json(config_path, config)
    return root, runtime, config_path, config


def test_discovery_retains_every_boot_image_series_revision_and_condition(tmp_path):
    images(tmp_path, 'Automation/A_148_A.ST', 'Automation/A_148_B.ST', 'Debug/DBUG010A.MSA',
           'Medway Boys/med_041b.st', 'Pompey Pirates/Pompey Pirates Menu Disk 001 v2.0 (19xx)(Pompey Pirates)[a].st',
           'SuperGAU User Disks/SuperGAU Speak Disk 01 (19xx)(SuperGAU).st',
           'SuperGAU User Disks/SuperGAU User Disk 001 (19xx)(SuperGAU)[b].st',
           'Fuzion/Fuzion CD 120 (1992)(Fuzion)[corrupt menu].st',
           'Enigma/Enigma Menu Disk 206 (19xx)(Enigma)(Disk 1 of 2).st')
    document, rejected = discover(tmp_path)
    assert rejected == []
    rows = validated_rows(document)
    assert len(rows) == 9
    assert all(row['disks'] == [row['file']] for row in rows.values())
    assert len({row['title'] for row in rows.values()}) == 8
    assert {row['compilation']['condition'] for row in rows.values()} == {'Unverified', 'Marked bad', 'Corrupt menu'}
    assert next(row for row in rows.values() if row['publisher'] == 'D-Bug')['title'] == 'D-Bug Menu 10'
    assert next(row for row in rows.values() if row['publisher'] == 'Pompey Pirates')['version'] == 'v2.0'
    assert {row['series'] for row in rows.values() if row['publisher'] == 'SuperGAU'} == {'SuperGAU Speak Disk', 'SuperGAU User Disk'}
    assert all(row['languages'] == [] for row in rows.values())


def test_unknown_images_need_review_and_metadata_rejects_escaping_or_multiple_boot_targets(tmp_path):
    images(tmp_path, 'Automation/A_001.ST', 'Mystery.st', 'Automation/Safe Disks/save.st')
    document, rejected = discover(tmp_path)
    assert rejected == ['Mystery.st']
    assert len(document['games']) == 1
    changed = deepcopy(document)
    changed['games'][0]['file'] = changed['games'][0]['disks'][0] = '../escape.st'
    with pytest.raises(CatalogueError):
        validated_rows(changed)
    changed = deepcopy(document)
    changed['games'][0]['disks'].append('Automation/A_002.ST')
    with pytest.raises(CatalogueError):
        validated_rows(changed)
    changed = deepcopy(document)
    changed['games'][0]['compilation']['condition'] = 'Guaranteed working'
    with pytest.raises(CatalogueError):
        validated_rows(changed)


def test_registration_is_previewable_recoverable_and_preserves_settings(tmp_path, monkeypatch):
    root, runtime, config_path, config = fixture(tmp_path)
    assert configure(config_path, root)['applied'] is False
    assert not (root / 'collection-metadata.json').exists()
    import tools.configure_compilations as setup
    real_write = setup.atomic_write_json
    def interrupted(path, value):
        if path == config_path:
            raise OSError('interrupted configuration write')
        real_write(path, value)
    monkeypatch.setattr(setup, 'atomic_write_json', interrupted)
    with pytest.raises(OSError, match='interrupted'):
        configure(config_path, root, apply=True)
    assert json.loads(config_path.read_text()) == config
    assert read_rows(root)
    monkeypatch.setattr(setup, 'atomic_write_json', real_write)
    result = configure(config_path, root, apply=True)
    after = json.loads(config_path.read_text())
    assert after['keep'] == config['keep'] and after['emulators'] == config['emulators']
    assert after['default_collection'] == 'existing'
    assert after['collections'][0]['kind'] == KIND
    assert json.loads(Path(result['backup']).read_text()) == config
    assert configure(config_path, root, apply=True)['applied']
    assert len(json.loads(config_path.read_text())['collections']) == 1


def test_rebuild_preserves_pins_and_exact_images_and_adds_new_menu_parts(tmp_path):
    root, runtime, config_path, _ = fixture(tmp_path)
    configure(config_path, root, apply=True)
    before = read_rows(root)
    images(root, 'Automation/A_069_3.ST', 'Debug/DBUG157D.MSA')
    result = refresh_index(root, parse_tosec_name)
    assert result['added'] == 2 and result['rejected'] == []
    after = read_rows(root)
    assert all(after[key] == row for key, row in before.items())
    assert refresh_index(root, parse_tosec_name)['added'] == 0
    assert list(root.glob('collection-metadata.before-rebuild-*.json'))


def test_catalogue_groups_parts_prefers_unmarked_image_and_launches_only_selected_image(tmp_path):
    root, runtime, config_path, _ = fixture(tmp_path)
    configure(config_path, root, apply=True)
    catalogue = LibraryCatalogue(runtime, config_path)
    service = catalogue.service()
    page = service.search({'includeAtari': True, 'groupVersions': True})
    assert len(page['entries']) == 2
    for entry in page['entries']:
        versions = service.versions(entry['catalogueId'])['versions']
        assert len(versions) == 2
        assert 'Corrupt menu' not in next(v['label'] for v in versions if v['isDefault'])
        for version in versions:
            plan = resolve_plan(catalogue, version['catalogueId'])
            assert len(plan['disks']) == 1
            assert plan['arguments'] == ['OPENNEW', 'INI=' + str(tmp_path / 'steem.ini'), plan['media']]
            assert plan['media'] == plan['disks'][0]['path']
        group, members, _, _ = service.family(entry['catalogueId'])
        saved_id = members[-1].base['catalogueId']
        service.version_defaults = lambda: {group: {'catalogueId': saved_id, 'gameKey': 'game_existing'}}
        assert service.family(entry['catalogueId'])[2] == saved_id


def test_native_game_scraping_is_disabled_for_compilations(tmp_path, monkeypatch):
    import arcade_service as server
    # This module can be cached from collection-time imports, before the
    # per-test environment is installed. Never retain its native runtime root.
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setattr(server, 'CONFIG_FILE', tmp_path / 'config.json')
    monkeypatch.setattr(server, 'active_collection', lambda: {'id': 'compilations', 'kind': KIND})
    monkeypatch.setattr(server, 'get_library', lambda: pytest.fail('Scrape accessed game library'))
    for result in (server.scrape_preview('game'), server.start_scrape_preview({'game_id': 'game'}),
                   server.scrape_targets(['game']), server.apply_scrape_metadata('game', {'title': 'Wrong game'}),
                   server.metadata_care_request({'game_id': 'game', 'changes': {'title': 'Wrong game'}})):
        assert result['ok'] is False and 'compilation' in result['error'].lower()


def test_native_library_exposes_compilation_facets_and_each_exact_image(tmp_path, monkeypatch):
    import arcade_service as server
    root, runtime, config_path, _ = fixture(tmp_path)
    configure(config_path, root, apply=True)
    collection = json.loads(config_path.read_text())['collections'][0]
    monkeypatch.setattr(server, 'active_collection', lambda: collection)
    monkeypatch.setattr(server, 'DESASTERON_COLLECTION', root)
    monkeypatch.setattr(server, 'DATA', runtime)
    games = server.load_games({}, set())
    assert len(games) == 4
    assert {game.compilation_group for game in games} == {'Automation', 'Fuzion'}
    assert all(game.type == 'Atari ST' and game.series and not game.language for game in games)
    assert {game.compilation_condition for game in games} == {'Unverified', 'Corrupt menu'}
    assert len({game.metadata_group_id for game in games}) == 2


def test_compilation_browser_filters():
    result = subprocess.run(['node', '--test', str(Path(__file__).with_name('compilations_ui.cjs'))],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
