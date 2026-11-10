from copy import deepcopy
import gzip
import json
import threading
from types import SimpleNamespace

import pytest

from arcade_core.compilation_catalogue import CompilationCatalogue, match_rows
from arcade_core.compilation_source import catalogue_from_export, fetch, secondary_catalogue, sql_values, TABLES
from arcade_core.compilations import discover, KIND
from arcade_core.atari import validated_rows
from arcade_core.library import GameLibrary
from arcade_core.summary_snapshots import SummarySnapshots


def source_disk(**changes):
    return {'disk_id': 'al:1', 'provider': 'Atari Legend', 'source_date': '2026-09-13',
            'license': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
            'set': 'The Medway Boys', 'number': 1, 'part': '', 'version': '',
            'hashes': [], 'screenshots': ['https://www.atarilegend.com/storage/images/menu_screenshots/1.png'],
            'contents': [{'title': 'Test adventure', 'kind': 'Game', 'position': 1, 'url': 'https://www.atarilegend.com/games/1'}],
            'url': 'https://www.atarilegend.com/menusets/1?page=1#menudisk-1', **changes}


def setup(tmp_path, names=('med_001.st', 'med_002.st')):
    root = tmp_path / 'media'
    root.mkdir()
    for name in names:
        (root / name).write_bytes(('Synthetic image ' + name).encode())
    rows = validated_rows(discover(root)[0])
    collection = {'id': 'compilation', 'root': str(root), 'kind': KIND, 'adapter': 'atari-st-disks-v1'}
    return CompilationCatalogue(tmp_path / 'runtime', collection), rows


def test_export_lexer_rejects_expressions_and_preserves_escaped_literals():
    assert list(sql_values(r"(1,'Bob\'s; game','line\nnext',NULL), (2,'it''s','\\',-1);")) == [
        [1, "Bob's; game", 'line\nnext', None], [2, "it's", '\\', -1]]
    for sql in ["(1,load_file('/secret'));", "(1,'unfinished);", "(1,NULL); DELETE FROM games;", "(1,2)"]:
        with pytest.raises(ValueError):
            list(sql_values(sql))


def test_export_joins_games_software_and_exact_menu_artwork_without_sql_execution():
    tables = {
        'menu_sets': (['id','name','sort_direction'], "(1,'The Medway Boys','asc')"),
        'menus': (['id','menu_set_id','number','issue','version','date'], "(2,1,1,NULL,'2.0',NULL)"),
        'menu_disks': (['id','menu_id','part'], "(3,2,'B')"),
        'games': (['id','name'], "(4,'Adventure')"),
        'game_releases': (['id','game_id'], "(5,4)"),
        'menu_software': (['id','name','menu_software_content_type_id'], "(6,'Disk tool',7)"),
        'menu_software_content_types': (['id','name'], "(7,'Utility')"),
        'menu_disk_contents': (['id','menu_disk_id','position','game_id','game_release_id','menu_software_id','subtype','version','requirements'],
                              "(8,3,2,NULL,NULL,6,'doc','1.0','1MB'),(9,3,1,NULL,5,NULL,NULL,NULL,NULL)"),
        'menu_disk_screenshots': (['id','menu_disk_id','imgext'], "(10,3,'png')"),
        'menu_disk_dumps': (['id','menu_disk_id','sha512'], "(11,3,'" + 'a' * 128 + "')"),
    }
    assert set(tables) == TABLES
    sql = '\n'.join('CREATE TABLE `' + table + '` (\n' + '\n'.join('  `' + c + '` TEXT,' for c in columns) +
                    '\n) ENGINE=InnoDB;\nINSERT INTO `' + table + '` VALUES\n' + values + ';\n'
                    for table, (columns, values) in tables.items())
    result = catalogue_from_export(gzip.compress(sql.encode()), '2026-09-13')['disks'][0]
    assert (result['part'], result['version'], result['number']) == ('B', '2.0', 1)
    assert [c['title'] for c in result['contents']] == ['Adventure', 'Disk tool']
    assert result['contents'][1]['kind'] == 'Utility' and result['contents'][1]['subtype'] == 'doc'
    assert result['hashes'] == ['a' * 128]
    assert result['url'].endswith('/1?page=1#menudisk-3')
    assert result['screenshots'][0].endswith('/10.png')
    with pytest.raises(ValueError, match='schema has changed'):
        catalogue_from_export(gzip.compress(sql.replace('CREATE TABLE `menus`', 'CREATE TABLE `changed`').encode()), '2026-09-13')


def test_secondary_continuations_keep_documentation_and_game_parts_separate():
    raw = b'''<table><tr><th>Name</th><th>Req</th><th>Seq</th><th>Disk</th><th>Type</th></tr>
    <tr><td>Adventure &amp; Quest</td><td>1MB</td><td>A</td><td>AU001A</td><td>Adventure</td></tr>
    <tr><td></td><td></td><td>B</td><td>AU001B</td><td></td></tr>
    <tr><td></td><td></td><td></td><td>SD001</td><td>DOC Solution</td></tr></table>'''
    rows = secondary_catalogue(raw)
    assert [row['part'] for row in rows] == ['A', 'B', '']
    assert {row['contents'][0]['title'] for row in rows} == {'Adventure & Quest'}
    assert rows[-1]['contents'][0]['kind'] == 'Documentation'
    assert rows[1]['contents'][0]['sequence'] == 'B'
    with pytest.raises(ValueError):
        secondary_catalogue(b'<html>Source unavailable</html>')


def test_matching_does_not_guess_parts_revisions_or_ambiguous_discs(tmp_path):
    store, rows = setup(tmp_path, ('med_001.st', 'med_001b.st', 'med_002.st'))
    catalogue = {'disks': [source_disk(), source_disk(disk_id='al:2', number=2), source_disk(disk_id='al:3', number=2)]}
    result = match_rows(store.root, rows, catalogue)
    assert {row['file_name']: row['status'] for row in result.values()} == {
        'med_001.st': 'label', 'med_001b.st': 'unmatched', 'med_002.st': 'ambiguous'}
    import hashlib
    sha = hashlib.sha512((store.root / 'med_001b.st').read_bytes()).hexdigest()
    catalogue['disks'].append(source_disk(disk_id='al:4', number=999, hashes=[sha]))
    assert next(row for row in match_rows(store.root, rows, catalogue).values() if row['file_name'] == 'med_001b.st')['status'] == 'hash'


def test_preview_apply_backup_stale_selection_and_image_replacement(tmp_path):
    store, rows = setup(tmp_path)
    cat = {'date': '2026-09-13', 'disks': [source_disk()]}
    preview = store.prepare(rows, lambda: False, catalogue=cat)
    assert preview['counts'] == {'label': 1, 'unmatched': 1} and not store.path.exists()
    with pytest.raises(ValueError, match='changed'):
        store.apply(rows, 'wrong-token', True)
    assert store.apply(rows, preview['token'], True)['applied'] == 1
    before = store.path.read_bytes()
    assert len(store.presentations(rows)) == 1
    preview = store.prepare(rows, lambda: False, catalogue=cat)
    changed = deepcopy(rows)
    next(iter(changed.values()))['title'] = 'Changed'
    with pytest.raises(ValueError, match='changed'):
        store.apply(changed, preview['token'], True)
    assert store.path.read_bytes() == before
    assert store.apply(rows, preview['token'], False)['applied'] == 0
    assert json.loads(store.path.with_suffix('.previous.json').read_text()) == json.loads(before)
    preview = store.prepare(rows, lambda: False, catalogue=cat)
    (store.root / 'med_001.st').write_bytes(b'replacement')
    with pytest.raises(ValueError, match='image changed'):
        store.apply(rows, preview['token'], True)
    assert store.presentations(rows) == {}


def test_network_policy_and_saved_artwork_validation(tmp_path, monkeypatch):
    import arcade_core.compilation_source as source
    monkeypatch.setattr(source, 'build_opener', lambda *args: pytest.fail('Network must not be reached'))
    with pytest.raises(ValueError, match='disabled'):
        fetch(source.EXPORTS, 1000, lambda: False)
    with pytest.raises(ValueError, match='Unsupported'):
        fetch('https://attacker.invalid/catalogue', 1000, lambda: True)
    store, rows = setup(tmp_path)
    cat = {'date': '2026-09-13', 'disks': [source_disk(screenshots=['https://attacker.invalid/tracker.png'])]}
    preview = store.prepare(rows, lambda: False, catalogue=cat)
    with pytest.raises(ValueError, match='artwork'):
        store.apply(rows, preview['token'], True)
    assert not store.path.exists()


def test_failed_publication_keeps_previous_catalogue_and_allows_retry(tmp_path, monkeypatch):
    import arcade_core.compilation_catalogue as module
    store, rows = setup(tmp_path)
    catalogue = {'date':'2026-09-13', 'disks':[source_disk()]}
    preview = store.prepare(rows, lambda: False, catalogue=catalogue)
    store.apply(rows, preview['token'], True)
    original = store.path.read_bytes()
    catalogue['disks'][0]['contents'][0]['title'] = 'Corrected title'
    preview = store.prepare(rows, lambda: False, catalogue=catalogue)
    write = module.atomic_write_json
    def fail(path, value):
        if path == store.path:
            raise OSError('simulated publication failure')
        write(path, value)
    monkeypatch.setattr(module, 'atomic_write_json', fail)
    with pytest.raises(OSError, match='simulated'):
        store.apply(rows, preview['token'], True)
    assert store.path.read_bytes() == original
    monkeypatch.setattr(module, 'atomic_write_json', write)
    store.apply(rows, preview['token'], True)
    assert next(iter(store.load()['entries'].values()))['menu']['contents'][0]['title'] == 'Corrected title'


def test_native_catalogue_contents_survive_summary_compression_and_keep_launch_metadata(tmp_path, monkeypatch):
    import arcade_service as server
    store, rows = setup(tmp_path)
    (store.root / 'collection-metadata.json').write_text(json.dumps(discover(store.root)[0]))
    preview = store.prepare(rows, lambda: False, catalogue={'date':'2026-09-13', 'disks':[source_disk()]})
    store.apply(rows, preview['token'], True)
    monkeypatch.setattr(server, 'active_collection', lambda: store.collection)
    monkeypatch.setattr(server, 'DESASTERON_COLLECTION', store.root)
    monkeypatch.setattr(server, 'DATA', tmp_path / 'runtime')
    monkeypatch.setattr(server, 'compilation_catalogue_store', lambda: store)
    games = server.load_games({}, set())
    summaries = GameLibrary.list_game_summaries(SimpleNamespace(_lock=threading.Lock(), games=games), 'all')
    response = SummarySnapshots().response('test', summaries)
    decoded = [{**response['defaults'], **row} for row in response['games']]
    matched = next(row for row in decoded if row['compilation_titles'])
    assert matched['compilation_titles'] == ('Test adventure',)
    assert matched['compilation_catalogue_status'] == 'Menu label match'
    assert 'compilation_catalogue' not in matched
    game = next(game for game in games if game.id == matched['id'])
    assert game.title == 'Medway Boys Menu 1' and game.compilation_group == 'Medway Boys'
    assert game.screenshot.endswith('/1.png') and game.compilation_catalogue['provider'] == 'Atari Legend'
    assert (store.root / 'med_001.st').read_bytes() == b'Synthetic image med_001.st'


def test_catalogue_api_requires_current_collection_and_network_permission(tmp_path, monkeypatch):
    import arcade_service as server
    store, rows = setup(tmp_path)
    monkeypatch.setattr(server, 'active_collection', lambda: store.collection)
    monkeypatch.setattr(server, 'compilation_catalogue_store', lambda: store)
    monkeypatch.setattr(server, 'OPTIONAL_NETWORK_ALLOWED', lambda: False)
    result = server.dispatch_arcade_api('POST', '/api/compilation-catalogue', {}, {'collection_id':'other','action':'prepare'})
    assert result['code'] == 'collection-changed'
    result = server.dispatch_arcade_api('POST', '/api/compilation-catalogue', {}, {'collection_id':'compilation','action':'prepare'})
    assert result['ok'] is False and 'disabled' in result['error']
    monkeypatch.setattr('arcade_core.atari.read_rows', lambda root: rows)
    def start(title, work):
        assert work(lambda *args: None)['ok']
        return 'local-scan-job'
    monkeypatch.setattr(server, 'JOB_SERVICE', SimpleNamespace(start=start))
    result = server.dispatch_arcade_api('POST', '/api/compilation-catalogue', {}, {'collection_id':'compilation','action':'prepare','local_only':True})
    assert result == {'ok':True, 'job_id':'local-scan-job'}
