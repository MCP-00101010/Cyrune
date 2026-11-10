"""Synthetic interface tests for collection ownership and recoverable transitions."""
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import threading

import pytest

from arcade_core.collection_lifecycle import CollectionLifecycle
from arcade_core.collection_settings import settings_record


def fixture(tmp_path):
    roots = [tmp_path / name for name in ('old', 'new')]
    for root in roots:
        root.mkdir()
    config = {'collections': [dict(id=root.name, name=root.name, root=str(root),
               adapter='spectrum-metadata-v1') for root in roots]}
    state = {'active_collection_id': 'old'}
    events = []
    fail = {}
    lifecycle = None
    def build():
        collection_id = lifecycle.current().collection['id']
        events.append(('load', collection_id))
        if fail.get('load') == collection_id:
            raise OSError('load failed')
        return SimpleNamespace(games=[], pok_by_id={}, rebuild=lambda progress=None: events.append(('rebuild', collection_id)))
    def update(change):
        if fail.get('state'):
            raise OSError('state failed')
        change(state)
    def save(value):
        if fail.get('config'):
            raise OSError('config failed')
        config.clear()
        config.update(deepcopy(value))
    lifecycle = CollectionLifecycle(default_root=roots[0], runtime=tmp_path / 'runtime',
        config_path=tmp_path / 'config.json', checkout=tmp_path / 'checkout', lock=threading.RLock(),
        collections=lambda: SimpleNamespace(active=lambda: deepcopy(config['collections'][0])),
        load_config=lambda: deepcopy(config), save_config=save, update_state=update,
        load_favourites=lambda: set(), build_library=build,
        prepare_versions=lambda: events.append(('versions', lifecycle.current().collection['id'])),
        invalidate_catalogue=lambda: events.append(('invalidate',)), parse_tosec_name=lambda _: {})
    lifecycle.activate('old')
    return lifecycle, config, state, events, fail


@pytest.mark.parametrize('failure', ['load', 'state'])
def test_failed_select_restores_complete_previous_view_and_durable_selection(tmp_path, failure):
    lifecycle, config, state, events, fail = fixture(tmp_path)
    old = lifecycle.library()
    metadata = lifecycle.metadata(object)
    fail[failure] = 'new' if failure == 'load' else True
    with pytest.raises(OSError):
        lifecycle.select('new')
    current = lifecycle.current()
    assert current.collection['id'] == state['active_collection_id'] == 'old'
    assert current.root == Path(config['collections'][0]['root'])
    assert current.library is old and current.metadata is metadata
    assert events.count(('load', 'old')) == 1


def test_selection_owns_cache_and_versions_before_publishing_selection(tmp_path):
    lifecycle, config, state, events, fail = fixture(tmp_path)
    old = lifecycle.library()
    lifecycle.remember(old)
    lifecycle.select('new')
    lifecycle.select('old')
    assert lifecycle.library() is old
    assert events.count(('load', 'old')) == 1
    assert ('versions', 'new') in events
    assert state['active_collection_id'] == 'old'
    record = lifecycle.current().collection
    record['root'] = 'mutated caller snapshot'
    assert lifecycle.current().root == Path(config['collections'][0]['root'])
    assert lifecycle.current().collection['root'] != record['root']


def test_settings_invalidate_only_the_active_view_after_successful_persistence(tmp_path):
    lifecycle, config, state, events, fail = fixture(tmp_path)
    library = lifecycle.library()
    metadata = lifecycle.metadata(object)
    other = settings_record(config['collections'][1])
    lifecycle.update_settings(dict(collection_id='new', revision=other['revision'], name='Other', root=other['root']))
    assert lifecycle.current().library is library
    assert lifecycle.current().metadata is metadata
    active = settings_record(config['collections'][0])
    fail['config'] = True
    request = dict(collection_id='old', revision=active['revision'], name='Renamed', root=active['root'])
    with pytest.raises(OSError):
        lifecycle.update_settings(request)
    assert lifecycle.current().library is library
    fail.clear()
    lifecycle.update_settings(request)
    assert lifecycle.current().library is lifecycle.current().metadata is None
    assert lifecycle.current().collection['name'] == 'Renamed'
    assert state['active_collection_id'] == 'old'


def test_rebuild_rejects_stale_collection_and_invalidates_failed_view(tmp_path):
    lifecycle, config, state, events, fail = fixture(tmp_path)
    library = lifecycle.library()
    with pytest.raises(ValueError, match='selected collection changed'):
        lifecycle.rebuild('new')
    assert lifecycle.current().library is library
    def broken(progress=None):
        raise OSError('rebuild failed')
    library.rebuild = broken
    with pytest.raises(OSError, match='rebuild failed'):
        lifecycle.rebuild('old')
    assert lifecycle.current().library is None
    assert lifecycle.current().collection['id'] == state['active_collection_id'] == 'old'


def test_queued_rebuild_refreshes_externally_changed_collection_root(tmp_path):
    lifecycle, config, state, events, fail = fixture(tmp_path)
    previous = lifecycle.library()
    def stale_rebuild(progress=None):
        pytest.fail('Queued rebuild used the library from the previous root')
    previous.rebuild = stale_rebuild
    relocated = tmp_path / 'relocated'
    relocated.mkdir()
    config['collections'][0]['root'] = str(relocated)
    lifecycle.rebuild('old')
    assert lifecycle.current().root == relocated
    assert lifecycle.current().library is not previous
    assert events.count(('load', 'old')) == 2
    assert state['active_collection_id'] == 'old'
