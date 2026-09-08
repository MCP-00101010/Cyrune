import json
import threading
from types import SimpleNamespace

import pytest

from arcade_core.collection_cache import CollectionCache
from arcade_core.file_cache import FileCache
from arcade_core.metadata_notes import MetadataNotes
from arcade_core.scrape_jobs import ScrapeJobs
from arcade_core.scrape_text import review
from arcade_core.summary_snapshots import SummarySnapshots
from test_feature_parity import configure_fixture, load_server


def test_descriptions_keep_schema_length_decode_entities_once():
    server = load_server()
    description = 'A &quot;complete&quot; description &amp; ' + 'text ' * 300
    candidate = server.screenscraper_candidate({'noms':[{'text':'Game'}],
        'synopsis':[{'langue':'en','text':description}]}, {})
    assert candidate['description'] == 'A "complete" description & ' + ('text ' * 300).strip()
    assert len(server.screenscraper_candidate({'synopsis':[{'text':'x' * 3000}]}, {})['description']) == 2000
    assert server.nested_text('&amp;quot;') == '&quot;'


def test_review_is_authoritative_for_articles_ties_and_unrelated_titles():
    result = {'query':{'search_term':'The Hobbit'}, 'matches':[{'confidence':85,'candidate':{'title':'Hobbit, The'}}]}
    assert review(result)[0] is False
    result['matches'].append(dict(result['matches'][0]))
    assert review(result)[0] is True
    assert review({'query':{'search_term':'Pirates!'},'matches':[{'confidence':99,
        'candidate':{'title':'Space Quest III: Pirates of Pestulon'}}]})[0] is True


def test_warm_collections_are_bounded_and_reject_changed_files(tmp_path):
    metadata = tmp_path / 'metadata.json'; metadata.write_text('first')
    cache = CollectionCache(max_entries=2, max_games=3)
    one = SimpleNamespace(games=[1,2]); two = SimpleNamespace(games=[3,4])
    cache.put('one', one, [metadata]); assert cache.get('one') is one
    metadata.write_text('changed')
    assert cache.get('one') is None
    cache.put('one', one, [metadata]); cache.put('two', two, [metadata])
    assert cache.get('one') is None and cache.get('two') is two


def test_file_parse_cache_reuses_only_same_revision_and_returns_independent_values(tmp_path):
    path = tmp_path / 'game.pok'; path.write_text('one')
    cache = FileCache(); calls = []
    def parse(path): calls.append(path); return {'text':path.read_text()}
    first = cache.read(path, parse); first['text'] = 'modified'
    assert cache.read(path, parse)['text'] == 'one' and len(calls) == 1
    path.write_text('second')
    assert cache.read(path, parse)['text'] == 'second' and len(calls) == 2


def test_compact_summaries_round_trip_and_delta_one_edit():
    snapshots = SummarySnapshots()
    rows = [{'id':str(i), 'title':'Game '+str(i), 'description':'', 'favourite':False, 'entry_revision':'first'} for i in range(200)]
    first = snapshots.response('one', rows, '')
    assert not first['delta']
    assert [{**first['defaults'], **row} for row in first['games']] == rows
    same = snapshots.response('one', rows, first['revision'])
    assert same['unchanged'] and same['games'] == []
    changed = [dict(row, entry_revision='second') for row in rows]
    changed[50]['favourite'] = True
    delta = snapshots.response('one', changed, same['revision'])
    assert delta['delta'] and len(delta['games']) == 1 and len(delta['entry_revisions']) == 199
    assert len(json.dumps(delta)) < len(json.dumps(rows))
    assert not snapshots.response('two', rows, delta['revision'])['delta']


def test_scraper_jobs_do_not_block_reads_cache_successes_or_cross_collections():
    jobs = ScrapeJobs(); release = threading.Event(); entered = threading.Event(); calls=[]
    def work():
        calls.append(1); entered.set(); assert release.wait(2)
        return {'ok':True, 'matches':[{'candidate':{'title':'Game'}}]}
    try:
        started = jobs.start('one', work, cache_key='safe-key')
        assert entered.wait(2)
        assert jobs.get(started['job_id'], 'two')['ok'] is False
        assert jobs.get(started['job_id'], 'one')['status'] == 'running'
        release.set(); jobs.jobs[started['job_id']]['future'].result(timeout=2)
        assert jobs.get(started['job_id'], 'one')['result']['ok']
        again = jobs.start('one', work, cache_key='safe-key')
        jobs.jobs[again['job_id']]['future'].result(timeout=2)
        assert len(calls) == 1
        refreshed = jobs.start('one', work, cache_key='safe-key', refresh=True)
        jobs.jobs[refreshed['job_id']]['future'].result(timeout=2)
        assert len(calls) == 2
    finally:
        release.set(); jobs.executor.shutdown()


def test_new_games_baseline_and_provenance_are_collection_scoped(tmp_path):
    notes = MetadataNotes(tmp_path, {'id':'one','root':str(tmp_path / 'library')})
    assert notes.observe(['existing']) == set()
    assert notes.observe(['existing','new']) == {'new'}
    notes.record(['new'], {'scraper_source':'screenscraper','platform':'Amiga'})
    assert notes.load()['provenance']['new']['platform'] == 'Amiga'
    assert MetadataNotes(tmp_path, {'id':'two','root':str(tmp_path / 'library')}).load()['provenance'] == {}
    notes.clear(['new']); assert not notes.load()['provenance']


def test_scrape_cache_changes_when_group_membership_changes_without_mutating_provider(tmp_path, monkeypatch):
    from arcade_core import scrape_groups
    server = load_server(); configure_fixture(server, tmp_path)
    provider = {'type':'manual'}
    members = [SimpleNamespace(id='jetpac')]
    keys = []
    monkeypatch.setattr(server, 'configured_scrapers', lambda:{'manual':provider})
    monkeypatch.setattr(scrape_groups, 'folder_members', lambda *args:members)
    monkeypatch.setattr(server, 'SCRAPE_JOBS', SimpleNamespace(start=lambda *args, **kwargs:keys.append(kwargs['cache_key'])))
    server.start_scrape_preview({'game_id':'jetpac'})
    server.start_scrape_preview({'game_id':'jetpac'})
    assert keys[0] == keys[1]
    members.append(SimpleNamespace(id='new-edition'))
    server.start_scrape_preview({'game_id':'jetpac'})
    assert keys[2] != keys[0]
    assert provider == {'type':'manual'}


def test_scoped_routes_reject_other_collection_before_access(tmp_path):
    server = load_server(); configure_fixture(server, tmp_path)
    for method, route, parameters in [('GET','/api/game',{'game_id':'jetpac'}),
        ('POST','/api/favourite',{'game_id':'jetpac'}),('POST','/api/launch',{'game_id':'jetpac'})]:
        body = {**parameters, 'collection_id':'other'}
        result = server.dispatch_arcade_api(method, route, body if method == 'GET' else {}, body if method == 'POST' else {})
        assert result['code'] == 'collection-changed'


def test_cartridge_hashes_recheck_changes_and_confine_to_collection(tmp_path):
    from arcade_core.cartridge_hashes import fingerprints
    rom = tmp_path / 'test.gb'; rom.write_bytes(b'cartridge')
    first = fingerprints(tmp_path, rom)
    assert first['romtaille'] == 9 and len(first['sha1']) == 40
    rom.write_bytes(b'changed cartridge')
    assert fingerprints(tmp_path, rom)['sha1'] != first['sha1']
    with pytest.raises(ValueError): fingerprints(tmp_path / 'elsewhere', rom)


def test_provider_accounts_start_serial_then_use_advertised_allowance():
    from arcade_core.provider_threads import AccountThreads
    gate = AccountThreads(); provider={'username':'fixture'}
    with gate.request(provider): assert gate.accounts[gate._key(provider)] == [1,1]
    gate.update(provider, {'maxthreads':10})
    with gate.request(provider):
        with gate.request(provider): assert gate.accounts[gate._key(provider)] == [2,2]
    with gate.request({'username':'different'}): assert gate.accounts[gate._key({'username':'different'})] == [1,1]


def test_index_path_lease_reuses_parents_but_rejects_changes_and_escape(tmp_path):
    import os
    from arcade_core.index_paths import IndexPaths
    directory=tmp_path/'games';directory.mkdir()
    (directory/'one.tap').write_bytes(b'one');(directory/'two.tap').write_bytes(b'two')
    with IndexPaths(tmp_path) as lease:
        assert lease.resolve('games/one.tap', require_exists=True) == directory/'one.tap'
        assert lease.resolve('games/two.tap', require_exists=True) == directory/'two.tap'
        assert len(lease.parents) == 1
        with pytest.raises(ValueError):lease.resolve('../outside.tap')
    with pytest.raises(ValueError, match='changed during indexing'):
        with IndexPaths(tmp_path) as lease:
            lease.resolve('games/one.tap', require_exists=True)
            before=directory.stat();os.utime(directory,ns=(before.st_atime_ns,before.st_mtime_ns+1000000000))
