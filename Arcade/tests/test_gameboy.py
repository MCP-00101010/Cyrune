from copy import deepcopy
from types import SimpleNamespace

import pytest

from arcade_service import parse_tosec_name
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.catalogue_library import LibraryCatalogue
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.gameboy import ADAPTER, VARIANTS, discover, read_rows, refresh_index
from arcade_core.persistence import atomic_write_json
from arcade_core.platforms import collection_platform, provider_platform
from test_feature_parity import load_server, post


def fixture(tmp_path):
    root = tmp_path / 'Nintendo'
    for extension, (_, _, directory) in VARIANTS.items():
        folder = root / directory / 'Game'
        folder.mkdir(parents=True)
        name = 'Game (USA, Europe) (En,De)' if extension != '.gba' else 'Game (2001)(Publisher)(US)'
        (folder / (name + extension)).write_bytes(extension.encode())
    metadata = discover(root, parse_tosec_name)
    atomic_write_json(root / 'collection-metadata.json', metadata)
    executable = tmp_path / 'emulator.exe'
    executable.write_bytes(b'fixture, never run')
    collection = {'id': 'game-boy', 'name': 'Game Boy', 'root': str(root), 'adapter': ADAPTER,
                  'writable': False, 'default_emulator': 'sameboy', 'variant_emulators': {'GBA': 'vbam'}}
    runtime = tmp_path / 'runtime'
    config = {'collections': [collection], 'default_collection': 'game-boy', 'emulators': {
        key: {'name': key, 'type': 'generic', 'path': str(executable), 'arguments': ['{file}'], 'supported_extensions': formats}
        for key, formats in [('sameboy', ['.gb', '.gbc']), ('vbam', ['.gb', '.gbc', '.gba'])]}, 'emulator_profiles': []}
    atomic_write_json(runtime / 'config.json', config)
    return root, metadata, collection, runtime, config


def test_combined_index_parses_both_names_and_rebuild_preserves_user_metadata(tmp_path):
    root, document, collection, _, _ = fixture(tmp_path)
    assert collection_platform(collection) == 'game-boy'
    rows = read_rows(root)
    assert {r['system'] for r in rows.values()} == {'GB', 'GBC', 'GBA'}
    assert next(r for r in rows.values() if r['system'] == 'GB')['languages'] == ['EN', 'DE']
    row = document['games'][0]
    row.update(title='Corrected title', description='Keep this', protected_fields=['title'], default_emulator='custom')
    atomic_write_json(root / 'collection-metadata.json', document)
    added = root / 'GameBoy/Games/New/New (World).gb'
    added.parent.mkdir()
    added.write_bytes(b'new')
    assert refresh_index(root, parse_tosec_name) == 1
    assert refresh_index(root, parse_tosec_name) == 0
    saved = read_rows(root)[row['id']]
    assert (saved['title'], saved['description'], saved['default_emulator'], saved['protected_fields']) == (
        'Corrected title', 'Keep this', 'custom', ['title'])


@pytest.mark.parametrize('extension,system,ss,tgdb', [('.gb','GB','9','4'),('.gbc','GBC','10','41'),('.gba','GBA','12','5')])
def test_variant_launch_plan_and_scraper_defaults(tmp_path, extension, system, ss, tgdb):
    root, _, _, runtime, _ = fixture(tmp_path)
    lifecycle = LibraryCatalogue(runtime, runtime / 'config.json')
    catalogue = lifecycle.service()
    entry = next(e for e in catalogue._entries if e.base['hardwareLabel'] == system)
    assert entry.base['platformId'] == 'game-boy'
    assert catalogue.search()['entries'] == [], 'Do not publish a new platform to an unnegotiated picker'
    plan = resolve_plan(lifecycle, entry.base['catalogueId'])
    assert plan['public']['systemId'] == 'game-boy'
    assert plan['arguments'] == [plan['media']]
    assert plan['emulatorId'] == ('vbam' if system == 'GBA' else 'sameboy')
    row = read_rows(root)[entry.legacy_id]
    game = SimpleNamespace(**row)
    assert provider_platform(game, 'screenscraper', {}) == ss
    assert provider_platform(game, 'thegamesdb', {}) == tgdb
    assert entry.detail['suggestedTags'] == [system]


def test_wrong_variant_emulator_and_path_escape_fail_closed(tmp_path):
    root, document, _, runtime, _ = fixture(tmp_path)
    row = next(r for r in document['games'] if r['system'] == 'GBA')
    row['default_emulator'] = 'sameboy'
    atomic_write_json(root / 'collection-metadata.json', document)
    lifecycle = LibraryCatalogue(runtime, runtime / 'config.json')
    entry = next(e for e in lifecycle.service()._entries if e.legacy_id == row['id'])
    with pytest.raises(CatalogueError, match='unsupported-target'):
        resolve_plan(lifecycle, entry.base['catalogueId'])
    row['file'] = '../outside.gba'
    atomic_write_json(root / 'collection-metadata.json', document)
    with pytest.raises(CatalogueError):
        read_rows(root)


def test_setup_is_idempotent_and_preserves_existing_configuration(tmp_path):
    import json
    from tools.configure_gameboy import configure
    root, _, _, runtime, config = fixture(tmp_path)
    config['collections'] = [{'id':'existing', 'root':str(tmp_path/'unrelated')}]
    config['default_collection'] = 'existing'
    config['scrapers'] = {'manual': {'enabled':True}}
    atomic_write_json(runtime/'config.json', config)
    before = (runtime/'config.json').read_bytes()
    metadata = (root/'collection-metadata.json').read_bytes()
    arguments = (runtime/'config.json', root, tmp_path/'emulator.exe', tmp_path/'emulator.exe')
    assert not configure(*arguments)['applied']
    assert (runtime/'config.json').read_bytes() == before
    assert configure(*arguments, apply=True)['games'] == 3
    first = (runtime/'config.json').read_bytes()
    configure(*arguments, apply=True)
    assert (runtime/'config.json').read_bytes() == first
    assert (root/'collection-metadata.json').read_bytes() == metadata
    saved = json.loads(first)
    assert saved['default_collection'] == 'existing' and saved['scrapers'] == config['scrapers']
    assert len(saved['collections']) == 2
    assert any(p.read_bytes() == before for p in runtime.glob('config.before-gameboy-*.json'))


def test_scrape_and_inactive_shortcut_keep_cartridge_identity(tmp_path, monkeypatch):
    root, _, collection, runtime, config = fixture(tmp_path)
    server = load_server()
    for name, value in {'DATA':runtime, 'CONFIG_FILE':runtime/'config.json', 'STATE_FILE':runtime/'state.json',
                        'COLLECTION':root, 'METADATA_FILE':root/'collection-metadata.json'}.items():
        monkeypatch.setattr(server, name, value)
    monkeypatch.setattr(server, 'active_collection', lambda: collection)
    monkeypatch.setattr(server, 'load_config', lambda: config)
    monkeypatch.setattr(server, 'init_state', lambda: None)
    game = next(g for g in server.get_library().games if g.system == 'GBA')
    before = deepcopy(game)
    result = post(server, '/api/apply-scrape', {'game_id':game.id, 'candidate':{
        'title':'Correct game', 'description':'Description', 'platform':'game-boy', 'system':'GB'}})
    assert result['ok'], result
    updated = server.get_library().get_game(game.id)
    assert (updated.title, updated.description) == ('Correct game', 'Description')
    assert (updated.system, updated.platform, updated.path, updated.tags, updated.default_emulator) == (
        before.system, before.platform, before.path, before.tags, before.default_emulator)
    monkeypatch.setattr(server, 'COLLECTION', tmp_path/'inactive')
    entry = server.catalogue_game_entry('game-boy', game.id)
    plan = server.resolve_catalogue_launch_plan(entry.base['catalogueId'])
    assert plan['media'] == before.path
    assert server.COLLECTION == tmp_path/'inactive'
