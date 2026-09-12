import pytest

from arcade_core.scrape_preferences import ScrapePreferences, validate
from test_feature_parity import configure_fixture, load_server, post
from test_atari_overrides import setup as atari_setup
from test_scummvm_overrides import setup as scummvm_setup


CHOICES = {'provider':'manual', 'search_term':'A better title', 'search_platform':'all'}


def test_preferences_survive_recreation_and_isolate_collections_and_providers(tmp_path):
    collection = {'id':'one', 'root':str(tmp_path / 'one')}
    store = ScrapePreferences(tmp_path, collection)
    store.record(['game'], CHOICES)
    store.record(['game'], {**CHOICES, 'provider':'other', 'search_term':'Other term'})
    saved = ScrapePreferences(tmp_path, collection).load()['game']
    assert saved['manual']['search_term'] == 'A better title'
    assert saved['other']['search_term'] == 'Other term'
    assert ScrapePreferences(tmp_path, {**collection, 'id':'two'}).load() == {}
    assert ScrapePreferences(tmp_path, {**collection, 'root':str(tmp_path / 'two')}).load() == {}


@pytest.mark.parametrize('options', [[], {}, {**CHOICES, 'search_term':''}, {**CHOICES, 'search_term':'a\nb'},
    {**CHOICES, 'search_term':'x'*501}, {**CHOICES, 'search_platform':'amiga'}, {**CHOICES, 'url':'https://example.com'}])
def test_invalid_search_choices_are_rejected(options):
    with pytest.raises(ValueError): validate(options)


def test_only_successful_apply_remembers_searches_and_legacy_apply_preserves_them(tmp_path):
    server = load_server(); configure_fixture(server, tmp_path)
    body = {'game_id':'jetpac', 'search_options':CHOICES, 'candidate':{}}
    assert not post(server, '/api/apply-scrape', body)['ok']
    assert server.scrape_targets(['jetpac'])['games'][0]['scrape_searches'] == {}
    body['candidate'] = {'description':'Test description'}
    assert post(server, '/api/apply-scrape', body)['ok']
    server.LIBRARY = None
    assert server.scrape_targets(['jetpac'])['games'][0]['scrape_searches']['manual']['search_term'] == 'A better title'
    assert post(server, '/api/apply-scrape', {'game_id':'jetpac', 'candidate':{'description':'Another'}})['ok']
    assert server.scrape_targets(['jetpac'])['games'][0]['scrape_searches']['manual']['search_platform'] == 'all'
    body['search_options'] = {**CHOICES, 'search_term':None, 'search_platform':'current'}
    assert post(server, '/api/apply-scrape', body)['ok']
    assert server.scrape_targets(['jetpac'])['games'][0]['scrape_searches']['manual']['search_term'] is None


def test_atari_shared_versions_remember_the_same_search(atari_setup):
    server, *_ = atari_setup
    games = server.get_library().games
    assert post(server, '/api/apply-scrape', {'game_id':games[0].id, 'candidate':{'description':'Test'}, 'search_options':CHOICES})['ok']
    for game in games:
        assert server.scrape_targets([game.id])['games'][0]['scrape_searches']['manual']['search_term'] == CHOICES['search_term']


def test_legacy_spectrum_buckets_share_only_versions_and_new_editions_inherit(tmp_path):
    server = load_server(); configure_fixture(server, tmp_path)
    assert post(server, '/api/apply-scrape', {'game_id':'jetpac', 'candidate':{'description':'Test'}, 'search_options':CHOICES})['ok']
    metadata = server.load_metadata()
    original = metadata['games'][0]
    sibling = {**original, 'id':'new-edition', 'file':'Games/J/Jetpac128.tap', 'system':'128K'}
    unrelated = {**original, 'id':'other', 'file':'Games/J/Other.tap', 'title':'Other',
        'title_key':'other', 'tosec_title':'Other', 'scrape_family_title':'Other'}
    unrelated.pop('metadata_group_id', None)
    for row in (sibling, unrelated):
        (server.COLLECTION / row['file']).write_bytes(b'fixture')
        metadata['games'].append(row)
    server.save_metadata(metadata); server.LIBRARY = None
    assert server.scrape_targets(['new-edition'])['games'][0]['scrape_searches']['manual']['search_term'] == CHOICES['search_term']
    assert server.scrape_targets(['other'])['games'][0]['scrape_searches'] == {}


def test_scummvm_versions_remember_independent_searches(scummvm_setup):
    server, *_ = scummvm_setup
    games = server.get_library().games
    assert post(server, '/api/apply-scrape', {'game_id':games[0].id, 'candidate':{'description':'Test'}, 'search_options':CHOICES})['ok']
    saved = ScrapePreferences(server.DATA, server.active_collection()).load()
    assert games[0].id in saved
    assert all(game.id not in saved for game in games[1:])


def test_preference_write_failure_does_not_report_committed_metadata_as_failed(tmp_path, monkeypatch):
    server = load_server(); configure_fixture(server, tmp_path)
    def fail(*args): raise OSError('fixture')
    monkeypatch.setattr(ScrapePreferences, 'record', fail)
    result = post(server, '/api/apply-scrape', {'game_id':'jetpac', 'candidate':{'description':'Saved'}, 'search_options':CHOICES})
    assert result['ok'] and result['warnings']
    assert server.get_library().get_game('jetpac').description == 'Saved'
