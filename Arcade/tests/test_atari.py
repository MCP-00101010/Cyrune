from copy import deepcopy

import pytest

from arcade_service import parse_tosec_name
from arcade_core.atari import discover, read_rows
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_library import LibraryCatalogue
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.persistence import atomic_write_json


def library(tmp_path):
    root = tmp_path / 'games'
    root.mkdir()
    for suffix in ('(en)', '(de)(STE)'):
        for disk in (1, 2, 3):
            (root / f'Game (1990)(Publisher){suffix}(Disk {disk} of 3)[cr Team].st').write_bytes(bytes([disk]) * 1024)
    value, rejected = discover(root, parse_tosec_name)
    assert rejected == []
    atomic_write_json(root / 'collection-metadata.json', value)
    executable = tmp_path / 'steem.exe'
    executable.write_bytes(b'synthetic emulator, never execute')
    (tmp_path / 'steem.ini').write_text('[Machine]\n')
    config = {'collections': [{'id': 'atari', 'root': str(root), 'adapter': 'atari-st-disks-v1',
               'default_emulator': 'steem', 'writable': False}],
              'emulators': {'steem': {'type': 'steem', 'path': str(executable), 'arguments': []}}}
    config_path = tmp_path / 'runtime' / 'config.json'
    atomic_write_json(config_path, config)
    return root, value, LibraryCatalogue(tmp_path / 'runtime', config_path)


def test_discovery_retains_languages_and_ste_without_treating_disks_as_versions(tmp_path):
    root, value, lifecycle = library(tmp_path)
    assert len(value['games']) == 2
    assert {r['system'] for r in value['games']} == {'ST', 'STe'}
    assert {tuple(r['languages']) for r in value['games']} == {('en',), ('de',)}
    assert all(len(r['disks']) == 3 for r in read_rows(root).values())
    service = lifecycle.service()
    assert service.search()['entries'] == []
    assert service.search({'includeScummvm': True})['entries'] == []
    page = service.search({'includeAtari': True, 'groupVersions': True})
    assert len(page['entries']) == 1
    entry = page['entries'][0]
    assert entry['targetKind'] == 'disk-set'
    assert len(service.versions(entry['catalogueId'])['versions']) == 2
    assert str(root) not in str(page)


def test_launch_plan_checks_every_disk_and_uses_only_two_drives(tmp_path):
    root, value, lifecycle = library(tmp_path)
    entry = lifecycle.service().search({'includeAtari': True})['entries'][0]
    plan = resolve_plan(lifecycle, entry['catalogueId'])
    assert len(plan['disks']) == 3
    assert plan['arguments'] == ['OPENNEW', 'INI=' + str(tmp_path / 'steem.ini'),
                                  plan['disks'][0]['path'], plan['disks'][1]['path']]
    assert plan['public']['systemId'] == 'atari-st'
    from pathlib import Path
    Path(plan['disks'][2]['path']).unlink()
    with pytest.raises((OSError, CatalogueError)):
        resolve_plan(lifecycle, entry['catalogueId'])


def test_discovery_omits_incomplete_and_bad_sets(tmp_path):
    (tmp_path / 'Missing (1990)(Pub)(Disk 1 of 2).st').write_bytes(b'1')
    (tmp_path / 'Bad (1990)(Pub)[b].st').write_bytes(b'bad')
    (tmp_path / 'Complete (1990)(Pub).stx').write_bytes(b'good')
    value, rejected = discover(tmp_path, parse_tosec_name)
    assert [r['title'] for r in value['games']] == ['Complete']
    assert len(rejected) == 2


def test_metadata_rejects_traversal_and_falcon_launch_is_not_guessed(tmp_path):
    root, value, lifecycle = library(tmp_path)
    changed = deepcopy(value)
    changed['games'][0]['disks'][1] = '../outside.st'
    atomic_write_json(root / 'collection-metadata.json', changed)
    with pytest.raises(CatalogueError):
        read_rows(root)
    value['games'][0]['system'] = 'Falcon'
    atomic_write_json(root / 'collection-metadata.json', value)
    entry = next(e for e in lifecycle.service().search({'includeAtari': True})['entries'] if e['hardwareLabel'] == 'Falcon')
    with pytest.raises(CatalogueError, match='unsupported-target'):
        resolve_plan(lifecycle, entry['catalogueId'])
