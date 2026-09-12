"""Recoverable multi-document promotion, without accessing configured live data."""
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('suite_data_upgrade_test', Path(__file__).resolve().parents[2] / 'infrastructure/data_upgrade.py')
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


def test_dry_run_conflict_and_verified_originals(tmp_path):
    target, journal = tmp_path / 'database.json', tmp_path / 'upgrade.json'
    original = b'{"schemaVersion":1,"gameKey":"opaque-key"}'
    target.write_bytes(original)
    current = {'schemaVersion': 2, 'gameKey': 'opaque-key'}
    changes = [(target, original, current)]
    assert upgrade.upgrade(journal, changes)['status'] == 'dry-run'
    assert not journal.exists() and target.read_bytes() == original
    target.write_bytes(b'concurrent change')
    with pytest.raises(ValueError, match='changed'):
        upgrade.upgrade(journal, changes, apply=True)
    assert not journal.exists()
    target.write_bytes(original)
    upgrade.upgrade(journal, changes, apply=True)
    receipt = json.loads(journal.read_bytes())
    assert Path(receipt['files'][0]['original']).read_bytes() == original
    assert json.loads(target.read_bytes()) == current
    assert upgrade.upgrade(journal, [], apply=True)['status'] == 'completed'


@pytest.mark.parametrize('conflict', [False, True])
def test_interrupted_promotion_recovers_or_retains_concurrent_edits(tmp_path, monkeypatch, conflict):
    first, second, journal = [tmp_path / name for name in ('first.json', 'second.json', 'upgrade.json')]
    for path in (first, second):
        path.write_bytes(b'{}')
    replace = upgrade.replace_bytes
    def interrupt(path, raw):
        if Path(path) == second:
            raise OSError('simulated interruption')
        replace(path, raw)
    monkeypatch.setattr(upgrade, 'replace_bytes', interrupt)
    with pytest.raises(OSError):
        upgrade.upgrade(journal, [(first, b'{}', {'schemaVersion':2}), (second, b'{}', {'schemaVersion':2})], apply=True)
    assert json.loads(journal.read_bytes())['status'] == 'prepared'
    monkeypatch.setattr(upgrade, 'replace_bytes', replace)
    if conflict:
        second.write_bytes(b'{"newerUserEdit":true}')
        with pytest.raises(ValueError, match='concurrent changes'):
            upgrade.recover(journal)
        assert json.loads(second.read_bytes()) == {'newerUserEdit':True}
    else:
        upgrade.recover(journal)
        assert json.loads(first.read_bytes()) == json.loads(second.read_bytes()) == {'schemaVersion':2}
        assert json.loads(journal.read_bytes())['status'] == 'completed'
    for entry in json.loads(journal.read_bytes())['files']:
        assert Path(entry['original']).read_bytes() == b'{}'
