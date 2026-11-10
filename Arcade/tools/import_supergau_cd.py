"""Preview/import missing SuperGAU CD disks and their original software catalogue."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from arcade_core.atari import read_rows, refresh_index
from arcade_core.catalogue_identity import _writer_lock
from arcade_core.compilation_catalogue import CompilationCatalogue, digest, fingerprint, validate_entry
from arcade_core.compilations import identify
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json
from arcade_core.supergau_cd import Evidence, PREFIXES, SERIES, archives, code_for, read_source
from arcade_core.supergau_media import archive_files, archive_image, reconstruct_clipart


def publish_new(path, raw):
    """Publish a complete image without replacing any existing path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != raw:
            raise ValueError('Existing image differs: ' + path.name)
        return
    descriptor, stage = tempfile.mkstemp(prefix='.supergau-', suffix='.stage', dir=path.parent)
    stage = Path(stage)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(stage, path)  # Atomic create; an existing target is never replaced.
    finally:
        stage.unlink(missing_ok=True)


def prepare_media(root, rows, menus, source_archives, stage, seven_zip, all_series):
    wanted = set(SERIES) if all_series else {'GAU', 'USER', 'SPEAK', 'UTIL'}
    existing = {(PREFIXES.get(r.get('series')), int(r['compilation']['number']))
                for r in rows.values() if r.get('compilation', {}).get('group') == 'SuperGAU'}
    additions, skipped = [], []
    for code, menu in menus.items():
        prefix = code.split('_')[0]
        if prefix not in wanted or (prefix, menu['number']) in existing:
            continue
        try:
            archive = source_archives.get(code)
            if archive is None:
                raise ValueError('No separate archive on this CD repack')
            reconstruction = prefix == 'TAKE'
            if reconstruction:
                files = archive_files(archive, seven_zip)
                # The six original LZH archives wrap their root files in a
                # directory named after the archive, unlike the ZIP repack.
                if files and all(name.startswith(code + '/') for name, _ in files):
                    files = [(name[len(code) + 1:], content) for name, content in files]
                raw = reconstruct_clipart(files)
            else:
                raw = archive_image(archive, seven_zip)
            suffix = '[CD reconstruction]' if reconstruction else ''
            relative = f"SuperGAU/{menu['set']} {menu['number']:03d} (19xx)(SuperGAU){suffix}.st"
            target = ConfinedRoot(root).resolve(relative)
            if target.exists() and target.read_bytes() != raw:
                raise ValueError('Existing destination differs')
            if identify(target, root) is None:
                raise ValueError('Unsupported compilation filename')
            staged = stage / (code + '.st')
            publish_new(staged, raw)
            additions.append({'code':code, 'file':relative, 'sha512':hashlib.sha512(raw).hexdigest(),
                              'reconstructed':reconstruction, 'archive':archive.name})
        except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as error:
            skipped.append({'code':code, 'reason':str(error)[:240]})
    return additions, skipped


def catalogue_entries(root, rows, menus, evidence, previous, imported, progress=print):
    result, corrections = {}, []
    for identifier, row in rows.items():
        prefix = PREFIXES.get(row.get('series'))
        if prefix is None or row.get('compilation', {}).get('group') != 'SuperGAU':
            continue
        code = code_for(prefix, int(row['compilation']['number']))
        if code not in menus:
            continue
        before = fingerprint(root, row)
        path = ConfinedRoot(root).resolve(row['file'], require_exists=True)
        with path.open('rb') as stream:
            raw = stream.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError('Image exceeds its size limit')
        if row['file'] in imported and imported[row['file']]['reconstructed']:
            matched, verification, note = code, 'reconstructed', 'Disk reconstructed from the CD clip-art files; all copied file bytes were verified.'
        elif prefix == 'TAKE' and previous.get(identifier, {}).get('menu', {}).get('verification') == 'reconstructed' and previous[identifier]['fingerprint'] == before:
            matched, verification, note = code, 'reconstructed', 'Disk reconstructed from the CD clip-art files; all copied file bytes were verified.'
        else:
            matched, verification, note = evidence.compare(code, raw)
        if matched not in menus:
            raise ValueError('Matched archive has no description')
        menu = deepcopy(menus[matched])
        menu['verification'] = verification
        if note:
            menu['notes'].append(note)
        if matched != code:
            corrections.append({'file':path.name, 'label':code, 'contents':matched})
        old = previous.get(identifier, {}).get('menu', {})
        if previous.get(identifier, {}).get('status') == 'files':
            menu['file_index'] = [item['title'] for item in old.get('contents', [])]
        elif old.get('file_index'):
            menu['file_index'] = old['file_index']
        status = 'hash' if verification == 'image' else 'content' if verification in {'contents', 'reconstructed'} else 'label'
        entry = {'fingerprint':before, 'status':status, 'menu':menu}
        validate_entry(entry)
        if fingerprint(root, row) != before:
            raise ValueError('Image changed while reading the CD catalogue')
        result[identifier] = entry
        if len(result) % 200 == 0:
            progress(f'Compared {len(result)} SuperGAU images', flush=True)
    return result, corrections


def run(config_path, cd_root, seven_zip, *, apply=False, all_series=False):
    config_path, cd_root = config_path.resolve(), cd_root.resolve()
    config = json.loads(config_path.read_text(encoding='utf-8'))
    collection = next(c for c in config['collections'] if c['id'] == 'atari-st-compilations')
    store = CompilationCatalogue(config_path.parent, collection)
    rows, previous = read_rows(store.root), store.load()
    menus, source_archives = read_source(cd_root), archives(cd_root)
    session = config_path.parent / 'supergau-imports' / uuid.uuid4().hex
    session.mkdir(parents=True)
    stage = session / 'staged'
    stage.mkdir()
    additions, skipped = prepare_media(store.root, rows, menus, source_archives, stage, seven_zip, all_series)
    manifest = {'schemaVersion':1, 'created':datetime.now(timezone.utc).isoformat(), 'state':'preview',
                'source_sha256':next(iter(menus.values()))['source_sha256'], 'additions':additions, 'skipped':skipped}
    atomic_write_json(session / 'manifest.json', manifest)
    # Retain the actual description sources outside the checkout for provenance.
    publish_new(session / 'SS_AA_01.TXT', (cd_root / 'SS_AA_01.TXT').read_bytes())
    publish_new(session / 'T_OFF_01.LST', (cd_root / 'take_off/T_OFF_01.LST').read_bytes())
    evidence = Evidence(source_archives, seven_zip)
    entries, corrections = catalogue_entries(store.root, rows, menus, evidence, previous['entries'], {})
    summary = {'new_images':len(additions), 'catalogued_existing_images':len(entries), 'skipped':skipped,
               'corrections':corrections, 'session':str(session), 'applied':False}
    print(json.dumps(summary, indent=2), flush=True)
    if not apply:
        return summary
    with _writer_lock(store.path):
        if digest(store.load()) != digest(previous) or digest(read_rows(store.root)) != digest(rows):
            raise ValueError('Collection or catalogue changed; prepare again')
        atomic_write_json(session / 'catalogue.before.json', previous)
        manifest['state'] = 'publishing-images'
        atomic_write_json(session / 'manifest.json', manifest)
        for addition in additions:
            raw = (stage / (addition['code'] + '.st')).read_bytes()
            if hashlib.sha512(raw).hexdigest() != addition['sha512']:
                raise ValueError('Staged image changed')
            publish_new(ConfinedRoot(store.root).resolve(addition['file']), raw)
        refresh_index(store.root, None)
        manifest['state'] = 'publishing-catalogue'
        atomic_write_json(session / 'manifest.json', manifest)
        current = read_rows(store.root)
        # Compare only the newly indexed rows; existing entries were already read.
        added_rows = {key: row for key, row in current.items() if key not in rows}
        new_entries, extra_corrections = catalogue_entries(store.root, added_rows, menus, evidence, previous['entries'], {x['file']:x for x in additions})
        entries.update(new_entries)
        for identifier, entry in entries.items():
            if fingerprint(store.root, current[identifier]) != entry['fingerprint']:
                raise ValueError('Image changed before catalogue publication; rerun the importer')
        document = {'schemaVersion':1, 'entries':{**previous['entries'], **entries}, 'source_date':'1997-04-20'}
        if len(json.dumps(document).encode()) > 24 * 1024 * 1024:
            raise ValueError('Catalogue exceeds its storage limit')
        atomic_write_json(store.path.with_suffix('.previous.json'), previous)
        atomic_write_json(store.path, document)
        manifest['state'] = 'complete'
        atomic_write_json(session / 'manifest.json', manifest)
        summary.update(applied=True, catalogued_images=len(entries), corrections=corrections + extra_corrections)
        atomic_write_json(session / 'result.json', summary)
        return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arcade-config', type=Path, required=True)
    parser.add_argument('--cd-root', type=Path, required=True)
    parser.add_argument('--seven-zip', type=Path)
    parser.add_argument('--all-series', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.arcade_config, args.cd_root, args.seven_zip,
                         apply=args.apply, all_series=args.all_series), indent=2))
