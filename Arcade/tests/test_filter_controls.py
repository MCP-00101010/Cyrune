from dataclasses import asdict
from pathlib import Path
import subprocess

import pytest

from test_feature_parity import configure_fixture, load_server, post


def test_filter_controls_in_node():
    result = subprocess.run(['node', '--test', str(Path(__file__).with_name('filter_controls_ui.cjs')),
                            str(Path(__file__).with_name('metadata_scraping_ui.cjs'))],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_scraping_rejects_a_stale_collection_before_lookup_or_write(tmp_path, monkeypatch):
    server = load_server()
    configure_fixture(server, tmp_path)
    monkeypatch.setattr(server, 'scrape_preview', lambda *args: pytest.fail('Stale selection must not query a provider'))
    monkeypatch.setattr(server, 'apply_scrape_metadata', lambda *args: pytest.fail('Stale selection must not save metadata'))
    for route in ('/api/scrape-preview','/api/apply-scrape'):
        result=post(server,route,{'collection_id':'other-library','game_id':'jetpac','provider':'manual','candidate':{'title':'Wrong'}})
        assert not result['ok'] and 'collection changed' in result['error']


def test_scoped_scrape_keeps_the_existing_preview_apply_workflow(tmp_path):
    server=load_server()
    configure_fixture(server,tmp_path)
    result=post(server,'/api/apply-scrape',{'collection_id':'desasteron','game_id':'jetpac','candidate':{'title':'Updated title'}})
    assert result['ok'], result
    assert server.get_library().get_game('jetpac').title == 'Updated title'


@pytest.mark.parametrize('rename', [False, True])
def test_spectrum_metadata_refresh_matches_full_rebuild_without_reading_unrelated_media(tmp_path, monkeypatch, rename):
    server = load_server()
    configure_fixture(server, tmp_path)
    library = server.get_library()
    original_rebuild = library.rebuild
    other = next(game for game in library.games if game.id != 'jetpac')
    monkeypatch.setattr(library, 'rebuild', lambda *a, **k: pytest.fail('An ordinary metadata edit must not reindex the collection'))
    result = post(server, '/api/update-metadata', {'game_ids':['jetpac'],
        'changes':{'title':'Edited Game', 'publisher':'Updated Publisher'}, 'rename_files':rename})
    assert result['ok'], result
    assert library.get_game(other.id) is other
    updated = library.get_game('jetpac')
    assert updated.title == 'Edited Game' and updated.publisher == 'Updated Publisher'
    assert library.get_poks(updated)
    assert Path(updated.path).exists()
    snapshot = {game.id:asdict(game) for game in library.games}
    original_rebuild()
    assert {game.id:asdict(game) for game in library.games} == snapshot
