from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from arcade_core.metadata_care import ScrapeJournal, row_map, patched
from arcade_core.persistence import atomic_write_json
from arcade_core.platforms import collection_platform, game_platform, provider_platform
from test_feature_parity import load_server, configure_fixture, post
import test_atari_overrides
import test_scummvm_overrides

atari_setup = test_atari_overrides.setup
scummvm_setup = test_scummvm_overrides.setup


@pytest.fixture
def spectrum_setup(tmp_path):
    server = load_server()
    configure_fixture(server, tmp_path)
    return (server,)


@pytest.mark.parametrize('fixture_name', ['spectrum_setup', 'atari_setup', 'scummvm_setup'])
def test_fill_missing_protected_fields_and_scrape_undo_survive_reload(request, fixture_name):
    server = request.getfixturevalue(fixture_name)[0]
    game = next(game for game in server.get_library().games if game.view == 'collection')
    source = (game.path, game.system, game.platform, game.default_emulator, game.emulator_profile)
    assert post(server, '/api/metadata-care', {'game_id': game.id,
        'changes': {'publisher': 'My correction', 'description': ''}, 'protected_fields': ['description']})['ok']
    server.LIBRARY = None
    info = post(server, '/api/metadata-care', {'game_id': game.id})
    assert set(info['protected_fields']) == {'publisher', 'description'}
    before = deepcopy(server.metadata_care().read())
    original_title = server.get_library().get_game(game.id).title
    result = post(server, '/api/apply-scrape', {'game_id': game.id, 'mode': 'missing',
        'candidate': {'title': 'Different title', 'publisher': 'Provider', 'description': 'Unwanted', 'developer': 'New developer'},
        'remote_assets': {'loading_screen': 'scraper-artwork/screenscraper/42/42/box-2D/wor'}})
    assert result['ok'], result
    server.LIBRARY = None
    updated = server.get_library().get_game(game.id)
    assert updated.title == original_title and updated.publisher == 'My correction' and updated.description == ''
    assert updated.loading_screen == 'scraper-artwork/screenscraper/42/42/box-2D/wor'
    assert (updated.path, updated.system, updated.platform, updated.default_emulator, updated.emulator_profile) == source
    result = post(server, '/api/metadata-care', {'action': 'undo'})
    assert result['ok'], result
    assert row_map(server.metadata_care().read()) == row_map(before)
    assert not post(server, '/api/metadata-care', {'action': 'undo'})['ok']


def test_existing_spectrum_editor_protects_only_changed_fields_and_scrape_keeps_them(spectrum_setup):
    server = spectrum_setup[0]
    game = server.get_library().get_game('jetpac')
    assert post(server, '/api/update-metadata', {'game_ids': [game.id],
        'changes': {'title': game.title, 'publisher': 'Curated'}, 'rename_files': False})['ok']
    assert post(server, '/api/metadata-care', {'game_id': game.id})['protected_fields'] == ['publisher']
    assert post(server, '/api/apply-scrape', {'game_id': game.id, 'candidate': {'title': 'Jetpac!', 'publisher': 'Other'}})['ok']
    assert server.get_library().get_game(game.id).title == 'Jetpac!'
    assert server.get_library().get_game(game.id).publisher == 'Curated'
    assert post(server, '/api/metadata-care', {'game_id': game.id, 'protected_fields': []})['ok']
    assert post(server, '/api/apply-scrape', {'game_id': game.id, 'candidate': {'publisher': 'Replacement'}})['ok']
    assert server.get_library().get_game(game.id).publisher == 'Replacement'


def test_batch_undo_restores_all_scummvm_versions_and_preserves_unrelated_entries(scummvm_setup):
    server = scummvm_setup[0]
    original = deepcopy(server.metadata_care().read())
    games = server.get_library().games
    for index, game in enumerate(games):
        assert post(server, '/api/apply-scrape', {'game_id': game.id, 'undo_group': 'batch-one',
            'candidate': {'publisher': f'Publisher {index}'}})['ok']
    server.LIBRARY = None
    assert post(server, '/api/metadata-care', {'action': 'undo'})['restored_count'] == len(games)
    assert server.metadata_care().read() == original


def test_undo_rejects_later_edits_and_wrong_collection(spectrum_setup):
    server = spectrum_setup[0]
    assert post(server, '/api/apply-scrape', {'game_id': 'jetpac', 'candidate': {'title': 'Scraped'}})['ok']
    assert not post(server, '/api/metadata-care', {'collection_id': 'other', 'action': 'undo'})['ok']
    assert post(server, '/api/update-metadata', {'game_ids': ['jetpac'], 'changes': {'title': 'Later edit'}})['ok']
    result = post(server, '/api/metadata-care', {'action': 'undo'})
    assert not result['ok'] and 'edited after' in result['error']
    assert server.get_library().get_game('jetpac').title == 'Later edit'


def test_cleanup_flags_follow_failed_search_apply_undo_and_reload(spectrum_setup, monkeypatch):
    server = spectrum_setup[0]
    monkeypatch.setattr(server, 'get_scraper_service', lambda: SimpleNamespace(preview=lambda *_: {'ok': True, 'matches': []}))
    server.scrape_preview('jetpac', 'screenscraper')
    rows = server.dispatch_arcade_api('GET', '/api/games', {'collection_id': server.active_collection()['id'], 'shape': 'summary'})['games']
    assert next(row for row in rows if row['id'] == 'jetpac')['cleanup']['review']
    assert post(server, '/api/apply-scrape', {'game_id': 'jetpac', 'candidate': {'description': 'Complete'},
        'remote_assets': {'loading_screen': 'scraper-artwork/screenscraper/76/42/box-2D/wor'}})['ok']
    server.LIBRARY = None
    rows = server.dispatch_arcade_api('GET', '/api/games', {'collection_id': server.active_collection()['id'], 'shape': 'summary'})['games']
    row = next(row for row in rows if row['id'] == 'jetpac')
    assert row['cleanup'] == {'artwork': False, 'description': False, 'review': False}
    assert 'description' not in row, 'Keep the summary payload compact'


@pytest.mark.parametrize('stage', ['before-target', 'after-target'])
def test_pending_scrape_recovers_after_interruption_and_remains_undoable(tmp_path, stage):
    document = {'games': [{'id': 'a', 'title': 'Before'}, {'id': 'b', 'title': 'Other'}]}
    target = tmp_path / 'metadata.json'
    atomic_write_json(target, document)
    def read():
        return json.loads(target.read_text())
    def interrupted_write(value):
        if stage == 'after-target':
            atomic_write_json(target, value)
        raise OSError('interrupted')
    journal = ScrapeJournal(tmp_path, ['collection'], read, interrupted_write)
    with pytest.raises(OSError):
        journal.commit(document, patched(document, {'a': {'id': 'a', 'title': 'After'}}), 'batch')
    resumed = ScrapeJournal(tmp_path, ['collection'], read, lambda value: atomic_write_json(target, value))
    resumed.settle()
    assert row_map(read())['a']['title'] == 'After'
    external = read()
    external['games'][1]['title'] = 'Unrelated edit'
    atomic_write_json(target, external)
    assert resumed.undo() == 1
    assert row_map(read()) == {'a': {'id': 'a', 'title': 'Before'}, 'b': {'id': 'b', 'title': 'Unrelated edit'}}


def test_unknown_platforms_do_not_inherit_spectrum_and_generated_definitions_match():
    assert collection_platform({}) == '', 'Current collections require an explicit adapter'
    from arcade_core.collections import current_config
    assert current_config({'collections': [{'id':'old'}]})['collections'][0]['adapter'] == 'spectrum-metadata-v1'
    assert collection_platform({'adapter': 'future-adapter'}) == ''
    assert game_platform(SimpleNamespace(type='Future console')) == ''
    with pytest.raises(ValueError):
        provider_platform(SimpleNamespace(type='Future console'), 'screenscraper', {})
    tool = Path(__file__).parents[1] / 'tools/build_platforms.py'
    spec = importlib.util.spec_from_file_location('platform_builder', tool)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (tool.parents[1] / 'web/platforms.js').read_text(encoding='utf-8') == module.render()


def test_oversized_override_is_rejected_before_journaling(scummvm_setup, monkeypatch):
    import arcade_core.metadata_care as care_module
    server = scummvm_setup[0]
    care = server.metadata_care()
    original = deepcopy(care.read())
    monkeypatch.setattr(care_module, 'MAX_BYTES', 32)
    result = post(server, '/api/apply-scrape', {'game_id': server.get_library().games[0].id,
        'candidate': {'description': 'Longer than the deliberately small test limit'}})
    assert not result['ok'] and 'supported size' in result['error']
    assert care.read() == original
    assert care.journal.load()['pending'] is None


def test_journal_limit_measures_the_actual_written_format(tmp_path, monkeypatch):
    import arcade_core.metadata_care as care_module
    journal = ScrapeJournal(tmp_path, ['collection'], lambda: {}, lambda _: None)
    state = journal.load()
    compact_size = len(json.dumps(state, ensure_ascii=False).encode('utf-8'))
    monkeypatch.setattr(care_module, 'MAX_JOURNAL', compact_size + 1)
    with pytest.raises(ValueError, match='Undo size'):
        journal.save(state)
    assert not journal.path.exists()
