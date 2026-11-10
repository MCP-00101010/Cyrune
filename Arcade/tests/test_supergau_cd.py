from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import zipfile

import pytest

from arcade_core.compilation_catalogue import CompilationCatalogue, fingerprint, validate_entry
from arcade_core.compilations import discover, KIND
from arcade_core.atari import validated_rows, read_rows
from arcade_core.persistence import atomic_write_json
from arcade_core.supergau_cd import descriptions, read_source, Evidence
from arcade_core.supergau_media import crc16, decode_msa, archive_image, fat_contents, reconstruct_clipart


def importer():
    spec = importlib.util.spec_from_file_location('supergau_import_fixture', Path(__file__).parents[1] / 'tools/import_supergau_cd.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cd_fixture(tmp_path):
    cd = tmp_path / 'cd'
    cd.mkdir()
    (cd / 'SS_AA_01.TXT').write_bytes(b'GAU_001.LZH Test Game\r\nGAU_002:LZH Other Game\r\nUSER_001.LZH Paint V1.0\r\n   Extra tool\r\nSPEAK_01.LZH Compiler\r\nUTIL_001.LZH Tools\r\nTAKE_001.ZIP Clip Art\r\n')
    (cd / 'take_off').mkdir()
    (cd / 'take_off/T_OFF_01.LST').write_text('    Architecture\n        001 - 01..02\n')
    raw = reconstruct_clipart([('GAME.PRG', b'synthetic program')])
    with zipfile.ZipFile(cd / 'GAU_002.ZIP', 'w') as archive:
        archive.writestr('GAU_002.ST', raw)
    return cd, raw


def test_msa_decodes_tracks_and_rejects_bad_lengths_runs_and_geometry():
    raw_track = bytes(range(256)) * 2
    header = struct.pack('>5H', 0xe0f, 1, 0, 0, 1)
    encoded = header + struct.pack('>H', 512) + raw_track + b'\x00\x04\xe5\x33\x02\x00'
    assert decode_msa(encoded) == raw_track + b'3' * 512
    for bad in [encoded[:-1], encoded + b'x', encoded[:8] + b'\x00\x99' + encoded[10:], header + b'\0\4\xe5\x33\xff\xff']:
        with pytest.raises(ValueError):
            decode_msa(bad)


def test_clipart_disk_round_trip_checks_bytes_geometry_and_nonbootable_sector():
    files = [('001_01.IMG', b'picture' * 70000), ('001_02.IMG', b'other' * 65000)]
    raw = reconstruct_clipart(files)
    assert len(raw) == 901120
    assert fat_contents(raw) == dict(files)
    assert sum(struct.unpack('>256H', raw[:512])) & 0xffff != 0x1234
    assert crc16(b'123456789') == 0xbb3d
    for invalid in [[('../escape.img', b'x')], [('A.IMG', b'x'), ('a.img', b'y')], [('C:/A.IMG', b'x')], [('NEST/A.IMG', b'x')]]:
        with pytest.raises(ValueError):
            reconstruct_clipart(invalid)


def test_archive_image_rejects_multiple_images_and_checks_zip_crc(tmp_path):
    cd, raw = cd_fixture(tmp_path)
    assert archive_image(cd / 'GAU_002.ZIP') == raw
    path = cd / 'multiple.zip'
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('one.st', raw)
        archive.writestr('two.st', raw)
    with pytest.raises(ValueError, match='exactly one'):
        archive_image(path)
    target = cd / 'GAU_002.ZIP'
    data = bytearray(target.read_bytes())
    # Stored ZIP entry: modify its payload without updating CRC.
    data[100] ^= 1
    target.write_bytes(data)
    with pytest.raises(zipfile.BadZipFile):
        archive_image(target)


def test_takeoff_archive_wrapper_is_removed_without_losing_clipart_bytes(tmp_path):
    cd, _ = cd_fixture(tmp_path)
    archive = cd / 'TAKE_001.ZIP'
    with zipfile.ZipFile(archive, 'w') as packed:
        packed.writestr('TAKE_001/001_01.IMG', b'clip-art bytes')
    root, stage = tmp_path / 'media', tmp_path / 'stage'
    root.mkdir()
    stage.mkdir()
    module = importer()
    additions, skipped = module.prepare_media(root, {}, {'TAKE_001':read_source(cd)['TAKE_001']},
                                               {'TAKE_001':archive}, stage, None, True)
    assert not skipped and additions[0]['reconstructed']
    assert fat_contents((stage / 'TAKE_001.st').read_bytes()) == {'001_01.IMG':b'clip-art bytes'}
    assert not list(root.iterdir())  # Preview stages outside the collection.


def test_cd_descriptions_preserve_versions_wrapping_notes_and_takeoff_subjects(tmp_path):
    cd, _ = cd_fixture(tmp_path)
    menus = read_source(cd)
    assert menus['USER_001']['contents'][0]['title'] == 'Paint V1.0'
    assert menus['TAKE_001']['contents'][0]['title'] == 'Architecture'
    assert menus['TAKE_001']['contents'][0]['subtype'] == 'Images 01..02'
    assert descriptions(b'GAU_195:LZH Game\n\tcontinued\n')['GAU_195'] == ['Game', 'continued']
    with pytest.raises(ValueError, match='Duplicate'):
        descriptions(b'USER_001.LZH First\nUSER_001.LZH Second\n')


def test_file_checks_correct_wrong_disk_label_without_guessing_from_titles(tmp_path):
    cd, raw = cd_fixture(tmp_path)
    evidence = Evidence({})
    evidence.headers = {'SPEAK_12':[('MODULA.PRG', 5, crc16(b'right'))],
                        'SPEAK_13':[('ASSEMBLE.PRG', 5, crc16(b'other'))]}
    image = reconstruct_clipart([('MODULA.PRG', b'right'), ('DESKTOP.INF', b'preferences')])
    code, method, note = evidence.compare('SPEAK_13', image)
    assert (code, method) == ('SPEAK_12', 'contents') and 'Filename identifies SPEAK_13' in note
    evidence.headers['SPEAK_14'] = evidence.headers['SPEAK_12']
    assert evidence.compare('SPEAK_13', image)[:2] == ('SPEAK_13', 'label')
    evidence.archives['GAU_002'] = cd / 'GAU_002.ZIP'
    assert evidence.compare('GAU_002', raw)[:2] == ('GAU_002', 'image')


def test_accepted_cd_contents_survive_online_and_file_previews(tmp_path):
    cd, raw = cd_fixture(tmp_path)
    root = tmp_path / 'media'
    root.mkdir()
    (root / 'SuperGAU User Disk 001 (19xx)(SuperGAU).st').write_bytes(raw)
    rows = validated_rows(discover(root)[0])
    identifier, row = next(iter(rows.items()))
    store = CompilationCatalogue(tmp_path / 'runtime', {'id':'test','root':str(root),'kind':KIND})
    menu = read_source(cd)['USER_001']
    entry = {'fingerprint':fingerprint(root,row),'status':'label','menu':menu}
    validate_entry(entry)
    atomic_write_json(store.path, {'schemaVersion':1,'entries':{identifier:entry}})
    preview = store.prepare(rows, lambda:False, local_only=True)
    assert preview['counts'] == {'label':1}
    assert preview['rows'][0]['contents'] == ['Paint V1.0','Extra tool']
    store.apply(rows, preview['token'], include_labels=True, include_files=True)
    assert store.load()['entries'][identifier] == entry
    invalid = deepcopy(entry)
    invalid['menu']['url'] = 'file:///H:/SS_AA_01.TXT'
    with pytest.raises(ValueError, match='provenance'):
        validate_entry(invalid)


def test_import_publication_is_additive_and_retry_recovers_after_index_failure(tmp_path, monkeypatch):
    cd, raw = cd_fixture(tmp_path)
    root = tmp_path / 'media'
    root.mkdir()
    (root / 'SuperGAU Compilation 001 (19xx)(SuperGAU).st').write_bytes(raw)
    document = discover(root)[0]
    atomic_write_json(root / 'collection-metadata.json', document)
    before = deepcopy(document['games'])
    runtime = tmp_path / 'runtime'
    runtime.mkdir()
    config = runtime / 'config.json'
    config.write_text(json.dumps({'collections':[{'id':'atari-st-compilations','root':str(root),'kind':KIND}]}))
    module = importer()
    rebuild = module.refresh_index
    monkeypatch.setattr(module, 'refresh_index', lambda *args: (_ for _ in ()).throw(OSError('simulated interruption')))
    with pytest.raises(OSError, match='interruption'):
        module.run(config, cd, None, apply=True)
    new_path = root / 'SuperGAU/SuperGAU Compilation 002 (19xx)(SuperGAU).st'
    assert new_path.read_bytes() == raw
    assert json.loads((root / 'collection-metadata.json').read_text())['games'] == before
    monkeypatch.setattr(module, 'refresh_index', rebuild)
    result = module.run(config, cd, None, apply=True)
    assert result['applied'] and result['new_images'] == 1
    after = read_rows(root)
    assert len(after) == 2
    assert all(after[row['id']] == row for row in before)
    unchanged = new_path.read_bytes()
    with pytest.raises(ValueError, match='differs'):
        module.publish_new(new_path, b'other content')
    assert new_path.read_bytes() == unchanged
    repeated = module.run(config, cd, None, apply=True)
    assert repeated['new_images'] == 0
