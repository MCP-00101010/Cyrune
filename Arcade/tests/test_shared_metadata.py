from copy import deepcopy
import json
import pytest
import threading

from arcade_core.atari_overrides import AtariOverrides, edition_target
from arcade_core.shared_metadata import shared_rows
from test_feature_parity import load_server, configure_fixture, post, wait_for_job
import test_atari_overrides

atari_setup = test_atari_overrides.setup


def test_switch_job_tracks_version_loading_until_it_finishes(tmp_path, monkeypatch):
    server = load_server()
    configure_fixture(server, tmp_path)
    started, release = threading.Event(), threading.Event()
    def prepare(_games):
        started.set()
        assert release.wait(5)
    monkeypatch.setattr(server, 'game_version_summaries', prepare)
    job = server.start_select_collection_job('desasteron')
    try:
        assert started.wait(5)
        pending = server.get_job(job)
        assert pending['status'] == 'running'
        assert pending['phase'] == 'versions'
        assert pending['message'] == 'Loading game versions...'
    finally:
        release.set()
    wait_for_job(server, job)
    assert server.get_job(job)['status'] == 'done'


@pytest.mark.parametrize('folder', ['Games/A', 'Games/0-9', 'Games/Action', ''])
def test_legacy_containers_keep_unrelated_games_separate_during_load_scrape_edit_and_undo(tmp_path, folder):
    server = load_server()
    configure_fixture(server, tmp_path)
    metadata = server.load_metadata()
    base = metadata['games'][0]
    rows = []
    for key, title, system in [('airwolf', 'Airwolf', '48K'), ('airwolf128', 'Airwolf', '128K'),
                               ('afterburner', 'After Burner', '48K')]:
        row = {**base, 'id': key, 'title': title, 'title_key': title.lower(), 'sort_title': title,
               'file': '/'.join(filter(None, [folder, f'{title} (1985)(Publisher)({system}).tap'])),
               'system': system, 'memory': system, 'description': key, 'poks': []}
        if key == 'airwolf':
            row['scraper_id'] = '42'
        target = server.COLLECTION / row['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b'fixture')
        rows.append(row)
    metadata['games'] = rows
    server.save_metadata(metadata)
    original = server.METADATA_FILE.read_bytes()
    server.LIBRARY = None
    library = server.get_library()
    assert library.get_game('afterburner').title == 'After Burner'
    assert library.get_game('afterburner').description == 'afterburner'
    assert library.get_game('airwolf128').description == 'airwolf'
    assert server.METADATA_FILE.read_bytes() == original
    plan = post(server, '/api/scrape-targets', {'game_ids': ['airwolf', 'airwolf128', 'afterburner']})
    assert {frozenset(row['target_ids']) for row in plan['games']} == {
        frozenset(['airwolf', 'airwolf128']), frozenset(['afterburner'])}
    assert post(server, '/api/apply-scrape', {'game_id':'airwolf', 'candidate':{
        'title':'Airwolf corrected', 'description':'Correct scrape'}})['ok']
    assert library.get_game('afterburner').description == 'afterburner'
    assert library.get_game('airwolf128').description == 'Correct scrape'
    assert post(server, '/api/metadata-care', {'action':'undo'})['ok']
    assert post(server, '/api/update-metadata', {'game_ids':['airwolf'], 'changes':{'description':'Manual'}})['ok']
    assert library.get_game('airwolf128').description == 'Manual'
    assert library.get_game('afterburner').description == 'afterburner'
    saved = server.load_metadata()
    assert next(row for row in saved['games'] if row['id'] == 'afterburner') == rows[2]
    server.LIBRARY = None
    summaries = server.dispatch_arcade_api('GET', '/api/games', {'shape':'summary', 'groupVersions':'true'})['games']
    assert next(row for row in summaries if row['id']=='afterburner')['title'] == 'After Burner'


def test_old_atari_scrape_and_newly_indexed_version_share_metadata_without_rescraping(atari_setup):
    server, collection, root, metadata = atari_setup
    first = metadata['games'][0]
    store = AtariOverrides(server.DATA, collection)
    store.save(first['id'], edition_target(first), {'title': 'Correct game', 'description': 'Shared description',
        'loading_screen': 'scraper-artwork/screenscraper/42/42/box-2D/wor'})
    original_override = store.path.read_bytes()
    original_index = (root / 'collection-metadata.json').read_bytes()
    def check():
        server.LIBRARY = None
        games = server.get_library().games
        assert {g.title for g in games} == {'Correct game'}
        assert {g.description for g in games} == {'Shared description'}
        assert {g.loading_screen for g in games} == {'scraper-artwork/screenscraper/42/42/box-2D/wor'}
        summary = server.dispatch_arcade_api('GET', '/api/games', {'shape': 'summary'})['games']
        assert all(not row['cleanup']['artwork'] and not row['cleanup']['description'] for row in summary)
        catalogue = server.get_catalogue_service()
        catalogue.search({'includeAtari': True})
        entries = [entry for entry in catalogue._entries if entry.collection_id == 'atari']
        assert {entry.base['title'] for entry in entries} == {'Correct game'}
        assert {entry.detail['description'] for entry in entries} == {'Shared description'}
        assert store.path.read_bytes() == original_override
        return games
    games = check()
    assert {g.system for g in games} == {'ST', 'STe'}
    assert (root / 'collection-metadata.json').read_bytes() == original_index
    (root / 'Game (1990)(Publisher)(fr).st').write_bytes(b'x' * 1024)
    result = post(server, '/api/rebuild', {})
    wait_for_job(server, result['job_id'])
    assert len(check()) == 3


def test_spectrum_old_metadata_and_manual_corrections_are_shared_on_load_and_refresh(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    metadata = server.load_metadata()
    first = metadata['games'][0]
    first.update(description='Existing description', scraper_id='42')
    sibling = {**first, 'id':'jetpac128', 'file':'Games/J/Jetpac128.tap', 'system':'128K', 'memory':'128K',
        'description':'', 'screenshot':'', 'scraper_id':'', 'emulator_profile':'separate-profile'}
    (server.COLLECTION / sibling['file']).write_bytes(b'fixture')
    metadata['games'].append(sibling)
    server.save_metadata(metadata)
    before = server.METADATA_FILE.read_bytes()
    server.LIBRARY = None
    assert server.get_library().get_game('jetpac128').description == 'Existing description'
    assert server.get_library().get_game('jetpac128').screenshot == first['screenshot']
    assert server.METADATA_FILE.read_bytes() == before
    assert post(server, '/api/update-metadata', {'game_ids':['jetpac128'], 'changes':{'description':'Manual correction'}})['ok']
    for reload in (False, True):
        if reload:
            server.LIBRARY = None
        for key in ('jetpac', 'jetpac128'):
            assert server.get_library().get_game(key).description == 'Manual correction'
    assert server.get_library().get_game('jetpac128').emulator_profile == 'separate-profile'
    assert post(server, '/api/update-metadata', {'game_ids':['jetpac'], 'changes':{'description':'Second correction'}})['ok']
    assert {server.get_library().get_game(key).description for key in ('jetpac', 'jetpac128')} == {'Second correction'}
    catalogue = server.get_catalogue_service()
    catalogue.search({})
    assert {entry.detail['description'] for entry in catalogue._entries
            if entry.legacy_id in ('jetpac', 'jetpac128')} == {'Second correction'}


def test_shared_metadata_preserves_protected_blanks_and_never_mixes_folders_or_mutates_sources():
    rows = [{'id':'scraped', 'file':'PowerMonger/ST.st', 'title':'PowerMonger', 'description':'Provider',
             'scraper_id':'42', 'publisher':'Bullfrog'},
            {'id':'manual', 'file':'PowerMonger/STE.st', 'title':'PowerMonger', 'description':'',
             'protected_fields':['description']},
            {'id':'other', 'file':'Carrier Command/ST.st', 'title':'Carrier Command', 'description':'Other'}]
    before = deepcopy(rows)
    result = shared_rows(rows)
    assert [row['description'] for row in result] == ['', '', 'Other']
    assert result[1]['publisher'] == 'Bullfrog'
    assert rows == before
    assert json.dumps(result)
