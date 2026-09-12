from copy import deepcopy
import json

import pytest

from arcade_core.atari_overrides import AtariOverrides
from arcade_core.game_versions import entry_family_id
from arcade_core.catalogue_identity import CatalogueError
from test_atari import library
from test_feature_parity import load_server, configure_fixture, post


@pytest.fixture
def setup(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    root, metadata, lifecycle = library(tmp_path)
    config = json.loads(server.CONFIG_FILE.read_text())
    atari_config = lifecycle._config()
    collection = atari_config['collections'][0]
    config['collections'].append(collection)
    config['emulators'].update(atari_config['emulators'])
    server.CONFIG_FILE.write_text(json.dumps(config))
    server.activate_collection('atari')
    server.update_state(lambda state: state.update(active_collection_id='atari'))
    return server, collection, root, metadata


@pytest.mark.parametrize("artwork", ["https://cdn.thegamesdb.net/images/original/boxart/front/42.jpg",
                                    "scraper-artwork/screenscraper/42/42/box-2D/wor"])
def test_scrape_saves_presentation_only_and_survives_reload(setup, artwork):
    server, collection, root, metadata = setup
    game = server.get_library().games[0]
    original = deepcopy(game)
    files = {p: p.read_bytes() for p in root.rglob('*') if p.is_file()}
    other = next(row for row in server.get_library().games if row.id != game.id)
    result = post(server, '/api/apply-scrape', {'collection_id': server.active_collection()['id'], 'game_id':game.id, 'candidate':{
        'title':'Updated Adventure', 'publisher':'New Publisher', 'year':'1991', 'genre':'Adventure',
        'description':'New description', 'scraper_source':'thegamesdb', 'scraper_id':'42',
        'system':'Falcon', 'file':'outside.st', 'languages':['fr'], 'emulator_profile':'forged'},
        'remote_assets':{'loading_screen':artwork}})
    assert result['ok'], result
    server.LIBRARY = None
    updated = server.get_library().get_game(game.id)
    assert updated.title == 'Updated Adventure' and updated.publisher == 'New Publisher'
    assert updated.description == 'New description' and updated.genre == 'Adventure'
    assert updated.loading_screen == artwork
    assert (updated.system,updated.languages,updated.path,updated.emulator_profile) == (original.system,original.languages,original.path,original.emulator_profile)
    sibling = server.get_library().get_game(other.id)
    assert (sibling.title, sibling.publisher, sibling.loading_screen) == (updated.title, updated.publisher, artwork)
    assert (sibling.id, sibling.system, sibling.languages, sibling.path, sibling.emulator_profile) == (other.id, other.system, other.languages, other.path, other.emulator_profile)
    assert result['updated_count'] == 2
    assert {p:p.read_bytes() for p in files} == files
    assert AtariOverrides(server.DATA, collection).path.exists()
    assert not post(server,'/api/rename',{'collection_id': server.active_collection()['id'], 'game_id':game.id,'name':'changed'})['ok']
    assert not post(server,'/api/delete',{'collection_id': server.active_collection()['id'], 'game_id':game.id})['ok']


def test_scrape_refreshes_the_folder_without_rebuilding(setup, monkeypatch):
    server, _, _, _ = setup
    library = server.get_library()
    game, other = library.games[:2]
    monkeypatch.setattr(library, 'rebuild', lambda *a, **k: pytest.fail('Unrelated media must not be reindexed'))
    assert post(server, '/api/apply-scrape', {'collection_id': server.active_collection()['id'], 'game_id':game.id, 'candidate':{'publisher':'Updated'}})['ok']
    assert server.get_library() is library
    assert library.get_game(game.id).publisher == 'Updated'
    assert library.get_game(other.id).publisher == 'Updated'
    assert library.get_game(other.id).system == other.system


def test_config_reads_do_not_discover_collections_unless_configuration_needs_it(setup, monkeypatch):
    server, _, _, _ = setup
    monkeypatch.setattr(server, 'discover_collections', lambda: pytest.fail('Ordinary config reads must not scan collections'))
    assert server.load_config()['collections']


def test_catalogue_keeps_family_default_and_target_after_scraped_title(setup):
    server, _, _, _ = setup
    game = server.get_library().games[0]
    catalogue = server.get_catalogue_service()
    catalogue.search({'includeAtari':True})
    old = next(entry for entry in catalogue._entries if entry.legacy_id == game.id)
    family = entry_family_id(old)
    defaults = server.get_library_catalogue().version_defaults
    defaults.save(family, old.base['catalogueId'], 'fixture-game-key')
    saved = defaults.path.read_bytes()
    assert post(server,'/api/apply-scrape',{'collection_id': server.active_collection()['id'], 'game_id':game.id,'candidate':{'title':'Scraped title','publisher':'New publisher'}})['ok']
    server.activate_collection('desasteron')
    server.update_state(lambda state: state.update(active_collection_id='desasteron'))
    page = catalogue.search({'includeAtari':True,'query':'Scraped title'})
    assert len(page['entries']) == 2
    current = next(entry for entry in catalogue._entries if entry.legacy_id == game.id)
    assert current.base['catalogueId'] == old.base['catalogueId']
    assert current.base['entryRevision'] != old.base['entryRevision']
    assert entry_family_id(current) == family
    assert defaults.path.read_bytes() == saved
    assert current.relative_path == old.relative_path


@pytest.mark.parametrize('url',['file:///C:/private.png','https://example.com/image.jpg'])
def test_atari_rejects_unapproved_artwork(setup,url):
    server, collection, _, _ = setup
    with pytest.raises(ValueError):
        server.apply_scrape_metadata(server.get_library().games[0].id, {'publisher':'Bad'},remote_assets={'screenshot':url})
    assert not AtariOverrides(server.DATA,collection).path.exists()


def test_target_changes_and_other_collections_do_not_adopt_overrides(setup):
    server, collection, root, metadata = setup
    game = server.get_library().games[0]
    assert post(server,'/api/apply-scrape',{'collection_id': server.active_collection()['id'], 'game_id':game.id,'candidate':{'publisher':'Override'}})['ok']
    assert AtariOverrides(server.DATA,{**collection,'id':'other'}).load() == {}
    row = next(row for row in metadata['games'] if row['id'] == game.id)
    row['languages'] = ['fr']
    (root/'collection-metadata.json').write_text(json.dumps(metadata))
    server.LIBRARY = None
    assert server.get_library().get_game(game.id).publisher == 'Override', 'A valid sibling still supplies folder metadata'
    for row in metadata['games']:
        row['languages'] = ['it']
    (root/'collection-metadata.json').write_text(json.dumps(metadata))
    server.LIBRARY = None
    assert server.get_library().get_game(game.id).publisher != 'Override', 'Stale overrides cannot donate metadata'


def test_atomic_failure_and_corrupt_metadata_preserve_existing_override(setup,monkeypatch):
    server, collection, _, _ = setup
    game = server.get_library().games[0]
    assert post(server,'/api/apply-scrape',{'collection_id': server.active_collection()['id'], 'game_id':game.id,'candidate':{'publisher':'Saved'}})['ok']
    store = AtariOverrides(server.DATA,collection)
    before = store.path.read_bytes()
    import arcade_core.persistence as persistence
    with monkeypatch.context() as patch:
        patch.setattr(persistence.os,'replace',lambda *_: (_ for _ in ()).throw(OSError('disk unavailable')))
        with pytest.raises(OSError):
            server.apply_scrape_metadata(game.id, {'publisher':'Lost'})
    assert store.path.read_bytes() == before
    store.path.write_text('{"schemaVersion":1,"games":[]}')
    with pytest.raises(CatalogueError):
        server.apply_scrape_metadata(game.id, {'publisher':'Lost'})


def test_rebuild_discovers_added_disks_and_arcade_only_versions_include_filenames(setup):
    from test_feature_parity import wait_for_job
    from pathlib import Path
    server, _, root, _ = setup
    server.get_library()
    filename = 'Powermonger (1990)(Bullfrog)[cr Empire].st'
    (root / filename).write_bytes(b'x' * 1024)
    job = post(server, '/api/rebuild', {})
    wait_for_job(server, job['job_id'])
    game = next(g for g in server.get_library().games if g.title == 'Powermonger')
    versions = server.dispatch_arcade_api('GET', '/api/game-versions', {'collection_id': server.active_collection()['id'], 'game_id': game.id}, {})
    assert versions['versions'][0]['imageFiles'] == [filename]
    assert versions['versions'][0]['gameId'] == game.id
    assert versions['versions'][0]['collectionId'] == 'atari'
    entry = server.catalogue_game_entry('atari', game.id)
    assert 'imageFiles' not in server.get_catalogue_service().versions(entry.base['catalogueId'])['versions'][0]
    assert 'gameId' not in server.get_catalogue_service().versions(entry.base['catalogueId'])['versions'][0]
    assert str(root) not in str(versions)
    from arcade_core.game_properties import GameProperties
    manager = GameProperties(server.DATA, server.load_config, lambda *_: {'ok': False})
    assert manager.preview('atari', game.id)['gameDisks'][0]['filename'] == Path(filename).name
