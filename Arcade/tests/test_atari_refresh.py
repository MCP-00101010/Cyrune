from copy import deepcopy

import pytest

from test_atari import library
from arcade_core.atari import refresh_index, read_rows
from arcade_core.catalogue_launch import resolve_plan
from arcade_core.persistence import atomic_write_json
from arcade_service import parse_tosec_name


def test_refresh_adds_releases_preserving_existing_metadata_and_catalogue_ids(tmp_path):
    root, metadata, lifecycle = library(tmp_path)
    metadata['games'][0]['publisher'] = 'Custom publisher'
    atomic_write_json(root / 'collection-metadata.json', metadata)
    before = deepcopy(read_rows(root))
    entry = lifecycle.service().search({'includeAtari': True})['entries'][0]
    plan = resolve_plan(lifecycle, entry['catalogueId'])
    for release in ('007', 'Empire', 'Replicants'):
        (root / f'Powermonger (1990)(Bullfrog)[cr {release}].st').write_bytes(b'x' * 1024)
    result = refresh_index(root, parse_tosec_name)
    assert result['added'] == 3 and result['rejected'] == []
    after = read_rows(root)
    assert {key: after[key] for key in before} == before
    current = resolve_plan(lifecycle, entry['catalogueId'])
    assert {k: v for k, v in current.items() if k != 'entryRevision'} == {k: v for k, v in plan.items() if k != 'entryRevision'}
    assert len(lifecycle.service().search({'includeAtari': True})['entries']) == 5
    assert len(list(root.glob('collection-metadata.before-rebuild-*.json'))) == 1
    raw = (root / 'collection-metadata.json').read_bytes()
    assert refresh_index(root, parse_tosec_name)['added'] == 0
    assert (root / 'collection-metadata.json').read_bytes() == raw


def test_refresh_skips_incomplete_and_safe_disks_then_accepts_completed_set(tmp_path):
    root, _, _ = library(tmp_path)
    (root / 'Safe Disks').mkdir()
    (root / 'Safe Disks' / 'Save (1990)(Pub).st').write_bytes(b'x')
    first = root / 'New Game (1990)(Pub)(Disk 1 of 2).st'
    first.write_bytes(b'x' * 1024)
    parser = parse_tosec_name
    result = refresh_index(root, parser)
    assert result['added'] == 0 and result['rejected'] == [first.name]
    (root / 'New Game (1990)(Pub)(Disk 2 of 2).st').write_bytes(b'y' * 1024)
    assert refresh_index(root, parser)['added'] == 1
    assert len(next(r for r in read_rows(root).values() if r['title'] == 'New Game')['disks']) == 2


def test_refresh_preserves_alternate_dumps_and_does_not_drop_missing_known_disks(tmp_path):
    root, _, _ = library(tmp_path)
    before = read_rows(root)
    for flags in ('', '[a]'):
        (root / f'Alternate (1990)(Pub){flags}.st').write_bytes(b'x' * 1024)
    known = next(iter(before.values()))
    (root / known['file']).unlink()
    assert refresh_index(root, parse_tosec_name)['added'] == 2
    assert read_rows(root)[known['id']] == known


def test_refresh_atomic_write_failure_retains_original_index(tmp_path, monkeypatch):
    root, _, _ = library(tmp_path)
    path = root / 'collection-metadata.json'
    before = path.read_bytes()
    (root / 'New (1990)(Pub).st').write_bytes(b'x' * 1024)
    import arcade_core.persistence as persistence
    original = persistence.atomic_write_json
    def write(target, value):
        if target == path:
            raise OSError('Write failed')
        return original(target, value)
    monkeypatch.setattr(persistence, 'atomic_write_json', write)
    with pytest.raises(OSError, match='Write failed'):
        refresh_index(root, parse_tosec_name)
    assert path.read_bytes() == before
