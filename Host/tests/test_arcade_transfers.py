import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('review_arcade_transfers', Path(__file__).parents[1] / 'arcade_transfers.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_full_transfer_store_rejects_fifth_without_evicting_unfinished_reads():
    records = {}; store = module.TransferStore(records, chunk_bytes=10)
    started = [store.start({'value':'x'*30}) for _ in range(4)]
    with pytest.raises(ValueError, match='busy'): store.start({'value':'fifth'})
    assert len(records) == 4
    assert store.read(started[0]['transferId'], started[0]['nextOffset'])['nextOffset'] == 20
    first = started[0]
    while not first['done']: first = store.read(first['transferId'], first['nextOffset'])
    assert len(records) == 3 and store.start({'value':'replacement'})


def test_transfer_size_offset_and_expiry_bounds():
    records = {}; store = module.TransferStore(records, max_bytes=100, chunk_bytes=10, ttl=1)
    with pytest.raises(ValueError, match='large'): store.start({'value':'x'*100})
    first = store.start({'value':'x'*30})
    with pytest.raises(ValueError, match='offset'): store.read(first['transferId'], True)
    store.cleanup(records[first['transferId']]['createdAt'] + 2)
    with pytest.raises(ValueError, match='expired'): store.read(first['transferId'], 10)
