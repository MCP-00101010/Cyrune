from copy import deepcopy
import json

import pytest

from arcade_core.atari_overrides import AtariOverrides, edition_target
from arcade_core.scrape_groups import folder_members
from test_feature_parity import load_server, configure_fixture, post
import test_atari_overrides
import test_scummvm_overrides

atari_setup = test_atari_overrides.setup
scummvm_setup = test_scummvm_overrides.setup


def test_spectrum_folder_scrape_is_shared_and_retains_exact_launch_fields(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    metadata = server.load_metadata()
    original = metadata['games'][0]
    # Conflicting legacy matches can share a dedicated game folder, but an
    # alphabet bucket must never be treated as one game.
    original['file'] = 'Games/Jetpac/Jetpac (1983)(Ultimate)(48K).tap'
    sibling = {**original, 'id': 'jetpac128', 'system': '128K', 'memory': '128K',
               'file': 'Games/Jetpac/Jetpac128.tap', 'languages': ['fr'], 'title': 'Wrong old match',
               'emulator_profile': 'separate-profile', 'default_emulator': 'spectaculator'}
    separate = {**original, 'id': 'other', 'file': 'Games/Other/Jetpac.tap'}
    for item in (original, sibling, separate):
        file = server.COLLECTION / item['file']
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b'fixture')
    metadata['games'].extend([sibling, separate])
    server.save_metadata(metadata)
    server.LIBRARY = None
    before = {row.id: deepcopy(row) for row in server.get_library().games}
    plan = post(server, '/api/scrape-targets', {'game_ids': ['jetpac', 'jetpac128', 'other']})
    assert len(plan['games']) == 2
    group = plan['games'][0]
    assert set(group['target_ids']) == {'jetpac', 'jetpac128'}
    assert str(server.COLLECTION) not in json.dumps(plan)
    result = post(server, '/api/apply-scrape', {'game_id': 'jetpac', 'target_ids': group['target_ids'],
        'candidate': {'title': 'Jetpac!', 'publisher': 'Ultimate', 'description': 'Shared description',
                      'system': 'STe', 'languages': ['de'], 'emulator_profile': 'forged'},
        'remote_assets': {'screenshot': 'scraper-artwork/screenscraper/76/42/ss/wor'}})
    assert result['ok'] and result['updated_count'] == 2
    server.LIBRARY = None
    for key in group['target_ids']:
        updated = server.get_library().get_game(key)
        assert updated.title == 'Jetpac!' and updated.description == 'Shared description'
        assert updated.screenshot == 'scraper-artwork/screenscraper/76/42/ss/wor'
        assert (updated.path, updated.system, updated.languages, updated.emulator_profile, updated.default_emulator) == (
            before[key].path, before[key].system, before[key].languages, before[key].emulator_profile, before[key].default_emulator)
    assert server.get_library().get_game('other') == before['other']


def test_atari_plan_deduplicates_folder_and_atomic_failure_preserves_all_versions(atari_setup, monkeypatch):
    server, collection, _, rows = atari_setup
    games = server.get_library().games
    plan = post(server, '/api/scrape-targets', {'game_ids': [game.id for game in games]})
    assert len(plan['games']) == 1 and plan['games'][0]['scrape_count'] == 2
    store = AtariOverrides(server.DATA, collection)
    source = {row['id']: row for row in rows['games']}
    for game in games:
        store.save(game.id, edition_target(source[game.id]), {'title': game.id})
    before = store.path.read_bytes()
    import arcade_core.metadata_care as overrides
    monkeypatch.setattr(overrides, 'atomic_write_json', lambda *_: (_ for _ in ()).throw(OSError('write failed')))
    with pytest.raises(OSError):
        server.apply_scrape_metadata(games[0].id, {'title': 'Shared'})
    assert store.path.read_bytes() == before
    assert server.get_library().games == games


def test_changed_folder_membership_rejects_apply_before_writing(atari_setup):
    server, collection, _, _ = atari_setup
    game = server.get_library().games[0]
    result = post(server, '/api/apply-scrape', {'game_id': game.id, 'target_ids': [game.id], 'candidate': {'title': 'Bad'}})
    assert not result['ok'] and 'versions changed' in result['error']
    assert not AtariOverrides(server.DATA, collection).path.exists()


def test_atari_existing_folder_artwork_stays_shared_when_provider_omits_it(atari_setup):
    server, _, root, metadata = atari_setup
    anchor, sibling = metadata['games']
    sibling['screenshot'] = 'scraper-artwork/screenscraper/42/42/ss/wor'
    (root / 'collection-metadata.json').write_text(json.dumps(metadata))
    server.LIBRARY = None
    result = post(server, '/api/apply-scrape', {'game_id': anchor['id'], 'candidate': {'title': 'Shared'}})
    assert result['ok']
    server.LIBRARY = None
    assert {game.screenshot for game in server.get_library().games} == {sibling['screenshot']}


def test_scummvm_plan_expands_all_related_registrations_with_separate_platforms(scummvm_setup):
    server, _, ini, _ = scummvm_setup
    before = ini.read_bytes()
    games = server.get_library().games
    plan = post(server, '/api/scrape-targets', {'game_ids': [games[0].id]})
    assert {row['id'] for row in plan['games']} == {game.id for game in games}
    assert {row['platform'] for row in plan['games']} == {'dos', 'fm-towns'}
    assert all(row['target_ids'] == [row['id']] for row in plan['games'])
    assert len({row['search_key'] for row in plan['games']}) == 2
    assert ini.read_bytes() == before
    assert str(server.COLLECTION) not in json.dumps(plan)


def test_scope_validation_and_collection_switch(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    for invalid in (None, [], ['missing'], [None], ['jetpac'] * 101):
        assert not post(server, '/api/scrape-targets', {'game_ids': invalid})['ok']
    assert not post(server, '/api/scrape-targets', {'game_ids': ['jetpac'], 'collection_id': 'other'})['ok']
    game = server.get_library().get_game('jetpac')
    game.path = str(server.COLLECTION.parent / 'outside.tap')
    with pytest.raises(ValueError, match='escapes'):
        folder_members(server.get_library(), server.COLLECTION, game)


def test_spectrum_missing_sibling_prevents_partial_folder_metadata_write(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    metadata = server.load_metadata()
    sibling = {**metadata['games'][0], 'id': 'sibling', 'file': 'Games/J/other.tap'}
    file = server.COLLECTION / sibling['file']
    file.write_bytes(b'fixture')
    metadata['games'].append(sibling)
    server.save_metadata(metadata)
    server.LIBRARY = None
    server.get_library()
    before = server.METADATA_FILE.read_bytes()
    file.unlink()
    result = post(server, '/api/apply-scrape', {'game_id': 'jetpac', 'candidate': {'title': 'Must not persist'}})
    assert not result['ok']
    assert server.METADATA_FILE.read_bytes() == before
    assert server.get_library().get_game('jetpac').title == 'Jetpac'


def test_spectrum_scrape_keeps_existing_family_and_shared_default(tmp_path):
    from arcade_core.game_versions import entry_family_id
    server = load_server()
    configure_fixture(server, tmp_path)
    catalogue = server.get_catalogue_service()
    catalogue.search({})
    old = next(entry for entry in catalogue._entries if entry.legacy_id == 'jetpac')
    family = entry_family_id(old)
    defaults = server.get_library_catalogue().version_defaults
    defaults.save(family, old.base['catalogueId'], 'existing-approval')
    before = defaults.path.read_bytes()
    assert post(server, '/api/apply-scrape', {'game_id': 'jetpac', 'candidate': {'title': 'Jetpac!'}})['ok']
    server.LIBRARY = None
    catalogue.search({})
    updated = next(entry for entry in catalogue._entries if entry.legacy_id == 'jetpac')
    assert updated.base['title'] == 'Jetpac!'
    assert updated.base['catalogueId'] == old.base['catalogueId']
    assert entry_family_id(updated) == family
    assert defaults.path.read_bytes() == before
