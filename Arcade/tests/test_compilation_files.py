from copy import deepcopy
import struct

import pytest

from arcade_core.compilation_files import disk_files
from arcade_core.compilation_catalogue import CompilationCatalogue, match_rows, validate_entry
from arcade_core.compilation_source import floppyshop_catalogue, download_floppyshop, FLOPPYSHOP
from arcade_core.compilations import discover, KIND
from arcade_core.atari import validated_rows


def image():
    raw = bytearray(737280)
    struct.pack_into('<HBHBHHBH', raw, 11, 512, 2, 1, 2, 112, 1440, 0xf9, 3)
    # Root at sector 7; data at sector 14. One folder at cluster 2.
    raw[512:515] = b'\xf9\xff\xff'
    raw[515:517] = b'\xff\x0f'
    entry(raw, 7 * 512, b'TOOLS      ', 16, 2)
    entry(raw, 7 * 512 + 32, b'README  TXT', 32)
    entry(raw, 14 * 512, b'.          ', 16, 2)
    entry(raw, 14 * 512 + 32, b'..         ', 16)
    entry(raw, 14 * 512 + 64, b'DISKTOOLPRG', 32)
    return raw


def entry(raw, offset, name, attributes, cluster=0):
    raw[offset:offset + 11] = name
    raw[offset + 11] = attributes
    struct.pack_into('<H', raw, offset + 26, cluster)


def test_directory_index_retains_paths_and_ignores_deleted_and_volume_entries():
    raw = image()
    entry(raw, 7 * 512 + 64, b'\xe5ELETED PRG', 32)
    entry(raw, 7 * 512 + 96, b'USER001    ', 8)
    assert disk_files(raw) == [
        {'title': 'TOOLS/DISKTOOL.PRG', 'kind': 'File', 'url': ''},
        {'title': 'README.TXT', 'kind': 'File', 'url': ''},
        {'title': 'TOOLS', 'kind': 'Folder', 'url': ''}]


@pytest.mark.parametrize('failure', ['truncated', 'geometry', 'cycle', 'free', 'reserved', 'escape', 'crosslink'])
def test_directory_index_rejects_malformed_images(failure):
    raw = image()
    if failure == 'truncated':
        raw = raw[:1024]
    elif failure == 'geometry':
        raw[13] = 0
    elif failure == 'cycle':
        raw[515:517] = b'\x02\x00'
    elif failure == 'free':
        raw[515:517] = b'\x00\x00'
    elif failure == 'reserved':
        struct.pack_into('<H', raw, 7 * 512 + 26, 0xfff)
    elif failure == 'escape':
        raw[7 * 512] = ord('/')
    elif failure == 'crosslink':
        entry(raw, 7 * 512 + 64, b'OTHER      ', 16, 2)
    with pytest.raises(ValueError):
        disk_files(raw)


def test_local_preview_requires_file_opt_in_and_preserves_catalogue_and_media(tmp_path, monkeypatch):
    import arcade_core.compilation_catalogue as module
    root = tmp_path / 'media'
    root.mkdir()
    filename = 'SuperGAU User Disk 001 (19xx)(SuperGAU).st'
    media = root / filename
    media.write_bytes(image())
    rows = validated_rows(discover(root)[0])
    store = CompilationCatalogue(tmp_path / 'runtime', {'id':'test', 'root':str(root), 'kind':KIND})
    monkeypatch.setattr(module, 'download', lambda *args: pytest.fail('Local scan must not use network'))
    preview = store.prepare(rows, lambda: False, local_only=True)
    assert preview['counts'] == {'files':1}
    assert store.apply(rows, preview['token'], include_labels=True)['applied'] == 0
    preview = store.prepare(rows, lambda: False, local_only=True)
    assert store.apply(rows, preview['token'], include_files=True)['applied'] == 1
    saved = next(iter(store.load()['entries'].values()))
    assert saved['menu']['provider'] == 'Disk directory' and saved['menu']['url'] == ''
    assert saved['menu']['file_count'] == 3
    bad = deepcopy(saved)
    bad['status'] = 'hash'
    with pytest.raises(ValueError, match='provenance'):
        validate_entry(bad)
    bad = deepcopy(saved)
    bad['menu']['url'] = 'file:///sensitive'
    with pytest.raises(ValueError):
        validate_entry(bad)
    # A later local-only scan cannot downgrade a curated match.
    from test_compilation_catalogue import source_disk
    curated = source_disk(set='SuperGAU User Disk')
    preview = store.prepare(rows, lambda:False, catalogue={'date':'2026-09-13','disks':[curated]})
    store.apply(rows, preview['token'], include_labels=True)
    preview = store.prepare(rows, lambda:False, local_only=True)
    assert store.apply(rows, preview['token'], include_files=True)['applied'] == 0
    assert next(iter(store.load()['entries'].values()))['status'] == 'label'
    assert media.read_bytes() == image()
    # SuperGAU Games numbers must never enrich User series.
    result = match_rows(root, rows, {'disks':[source_disk(set='GG')]})
    assert next(iter(result.values()))['status'] == 'files'


def test_floppyshop_parser_separates_titles_descriptions_and_series():
    raw = f'''<h1>Disk series: Floppyshop Utility</h1><a href="{FLOPPYSHOP}?page=10">10</a>
      <div>Floppyshop Utility 4372</div><ul class="list-disc pl-5">
      <li><a href="/en/1563/selectric">Selectric 1.10</a><br>Fileselector description.</li>
      <li>TWO-IN-ONE v1.51e</li><li>Tools &amp; More</li></ul>
      <div>Floppyshop Utility 4373</div><ul class="list-disc"><li>Other program</li></ul>
      <nav><ul><li>Do not import navigation</li></ul></nav>'''.encode()
    rows, pages = floppyshop_catalogue(raw, 6)
    assert pages == 10 and [d['number'] for d in rows] == [4372, 4373]
    assert [c['title'] for c in rows[0]['contents']] == ['Selectric 1.10', 'TWO-IN-ONE v1.51e', 'Tools & More']
    assert rows[0]['url'] == FLOPPYSHOP + '?page=6'
    assert rows[0]['disk_id'] == 'fs:4372'
    for invalid in [b'<html>Error</html>', raw.replace(b'Utility 4372', b'Compilation 4372').replace(b'Utility 4373', b'Compilation 4373'), raw.replace(b'page=10',b'page=99')]:
        with pytest.raises(ValueError):
            floppyshop_catalogue(invalid)


def test_floppyshop_download_is_bounded_and_matches_only_exact_utility_series(tmp_path, monkeypatch):
    import arcade_core.compilation_source as source
    calls = []
    def fetch(url, limit, allowed):
        assert allowed() and limit == 2 * 1024 * 1024
        calls.append(url)
        page = int(url.rsplit('=',1)[1])
        return f'<a href="{FLOPPYSHOP}?page=2">2</a><div>Floppyshop Utility {4371+page}</div><ul class="list-disc"><li>Tool {page}</li></ul>'.encode()
    monkeypatch.setattr(source, 'fetch', fetch)
    disks = download_floppyshop(lambda:True)
    assert calls == [FLOPPYSHOP+'?page=1', FLOPPYSHOP+'?page=2']
    from test_compilation_catalogue import setup
    store, rows = setup(tmp_path, ('Floppyshop Utility 4372 (19xx)(Floppyshop).st',))
    preview = store.prepare(rows, lambda:False, catalogue={'date':'2026-09-13','disks':disks})
    assert preview['counts'] == {'label':1}
    store.apply(rows, preview['token'], include_labels=True)
    assert next(iter(store.load()['entries'].values()))['menu']['provider'] == 'AtariUpToDate'
    disks[0]['part'] = 'B'
    assert next(iter(match_rows(store.root, rows, {'disks':disks}).values()))['status'] == 'unmatched'
