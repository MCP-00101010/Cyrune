"""Reviewed, image-specific compilation contents, separate from launch metadata."""
from collections import Counter, defaultdict
from datetime import date as calendar_date
import hashlib
import json
from pathlib import Path
import re
import threading
import time
import uuid

from arcade_core.catalogue_identity import _writer_lock, read_object
from arcade_core.compilation_source import catalogue_from_export, download, download_floppyshop, fetch, secondary_catalogue, SECONDARY, FLOPPYSHOP
from arcade_core.compilation_files import disk_files, SERIES as FILE_SERIES
from arcade_core.compilations import KIND
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json

SERIES = {
    'Automation Menu': ('', 'AU'), 'D-Bug Menu': ('', 'DB'),
    'Medway Boys Menu': ('The Medway Boys', 'MB'), 'Fuzion CD': ('Fuzion', 'FZ'),
    'Pompey Pirates Menu Disk': ('Pompey Pirates', 'PP'),
    'Pompey Pirates Krappy Kompact Disk': ('Pompey Pirates Krappy Kompact', 'PK'),
    'Flame of Finland Menu': ('Flame Of Finland/Superior', 'FF'),
    'Federation Of Free Traders Menu Disk': ('Federation Of Free Traders', ''),
    'Sewer Doc Disk': ('Sewer Doc Disc', 'SD'), 'Zuul': ('Zuul', ''),
    'SuperGAU Compilation': ('', 'GG'), 'Vectronix Compilation': ('', 'VE'),
    'Floppyshop Utility': ('Floppyshop Utility',),
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def fingerprint(root, row):
    path = ConfinedRoot(root).resolve(row['file'], require_exists=True)
    stat = path.stat()
    return digest([row['file'], row['compilation'], row.get('version', ''), stat.st_size, stat.st_mtime_ns])


def part(value):
    value = re.sub(r'^part\s+', '', value.strip(), flags=re.I)
    match = re.fullmatch(r'Disk (\d+) of \d+', value, re.I)
    return (match[1] if match else value).casefold()


def revision(value):
    return value.strip().lower().removeprefix('v')


def validate_entry(entry):
    if (not isinstance(entry, dict) or entry.get('status') not in {'hash', 'label', 'files', 'content'} or
            not re.fullmatch(r'[0-9a-f]{64}', str(entry.get('fingerprint', '')))):
        raise ValueError('Invalid saved compilation match')
    menu = entry.get('menu')
    if not isinstance(menu, dict) or not re.fullmatch(r'al:\d+|8b:[A-Z]{2}\d{1,4}[A-Z]?|fs:\d{4}|files:[0-9a-f]{128}|sg:(?:GAU|USER|SPEAK|UTIL|DEMO|TAKE)_\d{2,3}', str(menu.get('disk_id', ''))):
        raise ValueError('Invalid saved compilation menu')
    if not isinstance(menu.get('contents'), list) or len(menu['contents']) > 200:
        raise ValueError('Invalid saved compilation contents')
    for item in menu['contents']:
        if not isinstance(item, dict) or not isinstance(item.get('title'), str) or len(item['title']) > 240:
            raise ValueError('Invalid saved compilation title')
        if item.get('url') and not re.fullmatch(r'https://www\.atarilegend\.com/games/\d+', item['url']):
            raise ValueError('Invalid saved compilation title link')
    local = entry['status'] == 'files'
    cd = menu['disk_id'].startswith('sg:')
    if cd:
        if (menu.get('provider') != 'SuperGAU Systems Archive-CD Volume 1' or menu.get('url') or
                menu.get('screenshots') or menu.get('license') or menu.get('source_file') != 'SS_AA_01.TXT' or
                not re.fullmatch(r'[0-9a-f]{64}', str(menu.get('source_sha256', ''))) or
                {'image':'hash', 'contents':'content', 'reconstructed':'content', 'label':'label'}.get(menu.get('verification')) != entry['status']):
            raise ValueError('Invalid SuperGAU CD provenance')
        for field in ('notes', 'original_lines', 'file_index'):
            values = menu.get(field, [])
            if (not isinstance(values, list) or len(values) > 200 or
                    any(not isinstance(v, str) or len(v) > 500 or re.search(r'[\x00-\x1f]', v) for v in values)):
                raise ValueError('Invalid SuperGAU CD description')
    elif entry['status'] == 'content':
        raise ValueError('Content checks require a CD source')
    if local != menu['disk_id'].startswith('files:'):
        raise ValueError('Invalid disk file index provenance')
    if local and (menu.get('url') or menu.get('screenshots') or menu.get('license') or
                  menu.get('provider') != 'Disk directory' or type(menu.get('file_count')) is not int or
                  not len(menu['contents']) <= menu['file_count'] <= 8192 or
                  any(item.get('url') or item.get('kind') not in {'File', 'Folder'} for item in menu['contents'])):
        raise ValueError('Invalid disk file index')
    if not local and not cd and not re.fullmatch(r'https://www\.atarilegend\.com/menusets/\d+\?page=\d+#menudisk-\d+|https://atari\.8bitchip\.info/MenuDG\.html|' + re.escape(FLOPPYSHOP) + r'\?page=(?:[1-9]|[1-4][0-9]|50)', str(menu.get('url', ''))):
        raise ValueError('Invalid saved compilation source link')
    if not isinstance(menu.get('screenshots'), list) or len(menu['screenshots']) > 2 or any(
            not isinstance(url, str) or not re.fullmatch(r'https://www\.atarilegend\.com/storage/images/menu_screenshots/\d+\.(?:png|jpe?g|bmp)', url)
            for url in menu['screenshots']):
        raise ValueError('Invalid saved compilation artwork')


def match_rows(root, rows, catalogue, progress=lambda *args: None, *, warnings=None):
    by_hash, by_label = defaultdict(list), defaultdict(list)
    for disk in catalogue['disks']:
        for sha in disk['hashes']:
            by_hash[sha].append(disk)
        if disk['number'] is not None:
            by_label[(disk['set'].casefold(), disk['number'], part(disk['part']), revision(disk['version']))].append(disk)
    result, skipped_files = {}, 0
    for index, (identifier, row) in enumerate(rows.items()):
        progress('matching', index, len(rows), f'Matching image {index + 1} of {len(rows)}')
        target = fingerprint(root, row)
        path = ConfinedRoot(root).resolve(row['file'], require_exists=True)
        if path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError('Compilation image is too large for catalogue matching')
        with path.open('rb') as stream:
            sha = hashlib.file_digest(stream, 'sha512').hexdigest()
        if fingerprint(root, row) != target:
            raise ValueError('An image changed during catalogue matching; retry')
        candidates = by_hash.get(sha, [])
        method = 'hash'
        if not candidates:
            method = 'label'
            descriptor = row['compilation']
            for name in SERIES.get(descriptor['series'], (descriptor['series'],)):
                if not name:
                    continue
                candidates = by_label.get((name.casefold(), int(descriptor['number']), part(descriptor['part']), revision(row.get('version', ''))), [])
                if candidates:
                    break
        candidates = list({disk['disk_id']: disk for disk in candidates}.values())
        status = method if len(candidates) == 1 else 'ambiguous' if candidates else 'unmatched'
        menu = candidates[0] if len(candidates) == 1 else None
        if not candidates and row['compilation']['series'] in FILE_SERIES:
            try:
                if path.suffix.lower() != '.st':
                    raise ValueError('Only raw ST images support directory indexing')
                with path.open('rb') as stream:
                    raw = stream.read(8 * 1024 * 1024 + 1)
                if hashlib.sha512(raw).hexdigest() != sha:
                    raise ValueError('Disk image changed during directory indexing')
                contents = disk_files(raw)
                if contents:
                    status = 'files'
                    menu = {'disk_id': 'files:' + sha, 'provider': 'Disk directory', 'source_date': calendar_date.today().isoformat(),
                        'set': row['compilation']['series'], 'number': int(row['compilation']['number']),
                        'part': row['compilation']['part'], 'version': row.get('version', ''),
                        'url': '', 'license': '', 'screenshots': [], 'contents': contents[:200], 'file_count': len(contents)}
                else:
                    skipped_files += 1
            except ValueError:
                skipped_files += 1
        result[identifier] = {'fingerprint': target, 'status': status, 'title': row['title'],
                              'file_name': Path(row['file']).name, 'menu': menu}
    if skipped_files and warnings is not None:
        warnings.append(f'{skipped_files} SuperGAU images have no readable supported directory; no file index was proposed for them.')
    return result


class CompilationCatalogue:
    def __init__(self, runtime, collection):
        if collection.get('kind') != KIND:
            raise ValueError('Choose an Atari ST compilation collection')
        self.collection = dict(collection)
        self.root = Path(collection['root']).resolve()
        scope = digest([collection['id'], str(self.root)])
        self.path = ConfinedRoot(runtime).resolve(f'compilation-catalogues/{scope}.json')
        if self.path.is_relative_to(Path(__file__).resolve().parents[2]):
            raise ValueError('Compilation catalogue data must remain outside the checkout')
        self.lock = threading.RLock()
        self.pending = None
        self.running = False

    def load(self):
        if not self.path.exists():
            return {'schemaVersion': 1, 'entries': {}}
        document = read_object(self.path, 24 * 1024 * 1024)
        if document.get('schemaVersion') != 1 or not isinstance(document.get('entries'), dict) or len(document['entries']) > 20000:
            raise ValueError('Invalid compilation catalogue; restore its previous backup')
        for entry in document['entries'].values():
            validate_entry(entry)
        return document

    def prepare(self, rows, allowed, progress=lambda *args: None, *, catalogue=None, local_only=False):
        with self.lock:
            if self.running:
                raise ValueError('A catalogue lookup is already running')
            self.running = True
            self.pending = None
        try:
            warnings = []
            if local_only:
                catalogue = {'date': calendar_date.today().isoformat(), 'disks': []}
            if catalogue is None:
                progress('download', 0, 0, 'Downloading Atari Legend metadata export…')
                compressed, date = download(allowed)
                catalogue = catalogue_from_export(compressed, date)
                try:
                    catalogue['disks'].extend(secondary_catalogue(fetch(SECONDARY, 4 * 1024 * 1024, allowed)))
                except (OSError, ValueError) as error:
                    warnings.append('Secondary catalogue unavailable; existing entries will be retained. ' + str(error)[:160])
                if any(r['compilation']['series'] == 'Floppyshop Utility' for r in rows.values()):
                    try:
                        catalogue['disks'].extend(download_floppyshop(allowed, progress))
                    except (OSError, ValueError) as error:
                        warnings.append('Floppyshop catalogue unavailable; existing entries will be retained. ' + str(error)[:160])
            matched = match_rows(self.root, rows, catalogue, progress, warnings=warnings)
            # The user's accepted original CD descriptions are the primary
            # source, even when an online or local-file update is requested.
            for identifier, entry in self.load()['entries'].items():
                if (entry['menu']['disk_id'].startswith('sg:') and identifier in matched and
                        entry['fingerprint'] == matched[identifier]['fingerprint']):
                    matched[identifier].update(entry)
            with self.lock:
                self.pending = {'token': uuid.uuid4().hex, 'expires': time.monotonic() + 1800,
                    'rows': matched, 'index_revision': digest(rows), 'before': digest(self.load()),
                    'source_date': catalogue['date'], 'warnings': warnings}
            return self.preview()
        finally:
            with self.lock:
                self.running = False

    def preview(self, offset=0):
        with self.lock:
            pending = self.pending
            if not pending or pending['expires'] < time.monotonic():
                raise ValueError('Prepare a fresh catalogue preview')
            values = list(pending['rows'].values())
            if type(offset) is not int or not 0 <= offset <= len(values):
                raise ValueError('Invalid preview offset')
            page = []
            for entry in values[offset:offset + 50]:
                menu = entry['menu'] or {}
                page.append({key: entry[key] for key in ('title', 'file_name', 'status')} | {
                    'provider': menu.get('provider', ''), 'url': menu.get('url', ''),
                    'contents': [c['title'] for c in menu.get('contents', [])],
                    'menu': ' '.join(str(v) for v in (menu.get('set'), menu.get('number'), menu.get('part'), menu.get('version')) if v is not None)})
            return {'ok': True, 'token': pending['token'], 'source_date': pending['source_date'],
                    'counts': dict(Counter(row['status'] for row in values)), 'total': len(values),
                    'offset': offset, 'rows': page, 'warnings': pending['warnings']}

    def apply(self, rows, token, include_labels=False, include_files=False):
        with self.lock, _writer_lock(self.path):
            self.preview()
            pending = self.pending
            if token != pending['token'] or digest(rows) != pending['index_revision'] or digest(self.load()) != pending['before']:
                raise ValueError('The collection or catalogue changed; prepare a fresh preview')
            before = self.load()
            entries = dict(before['entries'])
            applied = 0
            for identifier, entry in pending['rows'].items():
                if entry['status'] not in {'hash', 'content'} and not (include_labels and entry['status'] == 'label') and not (include_files and entry['status'] == 'files'):
                    continue
                if entry['status'] == 'files' and entries.get(identifier, {}).get('status') in {'hash', 'label'}:
                    continue  # A directory scan cannot replace an accepted curated catalogue.
                if fingerprint(self.root, rows[identifier]) != entry['fingerprint']:
                    raise ValueError('An image changed after preview; prepare a fresh preview')
                entries[identifier] = {key: entry[key] for key in ('fingerprint', 'status', 'menu')}
                validate_entry(entries[identifier])
                applied += 1
            document = {'schemaVersion': 1, 'entries': entries, 'source_date': pending['source_date']}
            if len(json.dumps(document).encode()) > 24 * 1024 * 1024:
                raise ValueError('Compilation catalogue exceeds the storage limit')
            if self.path.exists():
                atomic_write_json(self.path.with_suffix('.previous.json'), before)
            atomic_write_json(self.path, document)
            self.pending = None
            return {'ok': True, 'applied': applied}

    def presentations(self, rows):
        entries = self.load()['entries']
        result = {}
        for identifier, row in rows.items():
            entry = entries.get(identifier)
            if entry and entry.get('fingerprint') == fingerprint(self.root, row):
                result[identifier] = entry
        return result
