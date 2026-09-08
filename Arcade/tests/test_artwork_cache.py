import os
import time

from arcade_core.artwork_cache import ArtworkCache, PNG


def test_cache_survives_new_instances_and_enforces_size_age_and_format(tmp_path):
    cache = ArtworkCache(tmp_path)
    cache.write('public-reference', PNG + b'fixture')
    assert ArtworkCache(tmp_path).read('public-reference', 100) == PNG + b'fixture'
    assert cache.read('public-reference', 4) is None
    os.utime(cache.path('public-reference'), (0, 0))
    assert cache.read('public-reference', 100) is None
    cache.path('public-reference').write_bytes(b'not an image')
    assert cache.read('public-reference', 100) is None
    cache.write('bad', b'not an image')
    assert not cache.path('bad').exists()


def test_cache_eviction_bounds_disk_use_and_leaves_unrelated_files(tmp_path):
    cache = ArtworkCache(tmp_path, max_bytes=32, max_entries=2)
    cache.write('first', PNG + b'1234')
    os.utime(cache.path('first'), (time.time()-10, time.time()-10))
    other = cache.path('first').parent / 'unrelated.txt'
    other.write_text('keep')
    cache.write('second', PNG + b'1234')
    cache.write('third', PNG + b'1234')
    assert cache.read('first', 100) is None
    assert cache.read('third', 100)
    assert other.read_text() == 'keep'
    assert sum(p.stat().st_size for p in other.parent.glob('*.png')) <= 32


def test_cache_write_failure_does_not_fail_image_delivery(tmp_path, monkeypatch):
    import arcade_core.artwork_cache as module
    monkeypatch.setattr(module, 'atomic_write_bytes', lambda *_: (_ for _ in ()).throw(OSError('disk full')))
    cache = ArtworkCache(tmp_path)
    cache.write('reference', PNG)
    assert cache.read('reference', 100) is None
