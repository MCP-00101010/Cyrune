"""Edition-owned Atari properties and save disks. Native service only."""
from contextlib import nullcontext
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import struct
import time

from arcade_core.atari import read_rows
from arcade_core.catalogue_identity import _writer_lock, read_object
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json, atomic_write_bytes

MAX_DISK = 2 * 1024 * 1024


def properties_path(runtime, collection):
    key = hashlib.sha256((collection['id'] + '\0' + str(Path(collection['root']).resolve())).encode()).hexdigest()
    return ConfinedRoot(Path(runtime)).resolve('game-properties/' + key + '.json')


def read_properties(runtime, collection):
    path = properties_path(runtime, collection)
    if not path.exists():
        return {'schemaVersion': 1, 'games': {}}
    data = read_object(path, 8 * 1024 * 1024)
    if set(data) != {'schemaVersion', 'games'} or type(data['schemaVersion']) is not int or data['schemaVersion'] != 1 or not isinstance(data['games'], dict) or len(data['games']) > 100000:
        raise ValueError('Game properties need review')
    for key, row in data['games'].items():
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', key):
            raise ValueError('Invalid properties identity')
        validate_settings(row)
    return data


def validate_settings(row):
    if not isinstance(row, dict) or set(row) != {'emulatorId', 'profileId', 'driveB', 'saveDisk'}:
        raise ValueError('Invalid game properties')
    if any(not isinstance(row[k], str) or len(row[k]) > 160 for k in row):
        raise ValueError('Invalid game properties')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', row['emulatorId']) or not re.fullmatch(r'(?:[a-f0-9]{24})?', row['profileId']):
        raise ValueError('Invalid emulator or profile')
    if not re.fullmatch(r'empty|save|game:[0-9]{1,2}', row['driveB']):
        raise ValueError('Invalid drive B selection')
    if row['saveDisk']:
        disk_name(row['saveDisk'])
    if row['driveB'] == 'save' and not row['saveDisk']:
        raise ValueError('Select a save disk for drive B')


def disk_name(value):
    if (not isinstance(value, str) or not value or len(value) > 150 or value != value.strip()
            or value.endswith('.') or re.search(r'[<>:"/\\|?*\x00-\x1f]', value)
            or Path(value).suffix.lower() != '.st' or value.startswith('.')
            or re.fullmatch(r'CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]', value.split('.')[0], re.I)):
        raise ValueError('Use a valid .st save disk filename')
    return value


def check_disk(path):
    size = path.stat().st_size
    if not path.is_file() or not 512 <= size <= MAX_DISK or size % 512:
        raise ValueError('Use a raw .st disk image up to 2 MiB')
    return size


def read_disk(path):
    check_disk(path)
    with path.open('rb') as stream:
        content = stream.read(MAX_DISK + 1)
    if not 512 <= len(content) <= MAX_DISK or len(content) % 512:
        raise ValueError('Save disk changed while reading')
    return content


def safe_directory(collection, row):
    root = ConfinedRoot(Path(collection['root']))
    return root.resolve((Path(row['file']).parent / 'Safe Disks').as_posix())


def suggested_disk_name(row, rows, game_id):
    name = row['system'] + ' Save Disk'
    same = [r for r in rows.values() if Path(r['file']).parent == Path(row['file']).parent and r['system'] == row['system']]
    if len(same) > 1:
        name += ' ' + (' '.join(filter(None, ['-'.join(row['languages']), row.get('version')])) or game_id[:6])
        if sum(r['languages'] == row['languages'] and r.get('version') == row.get('version') for r in same) > 1:
            name += ' ' + game_id[:8]
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', name)[:130] + '.st'


def disk_owners(folder):
    path = ConfinedRoot(folder).resolve('.editions.json')
    data = read_object(path, 1024 * 1024) if path.exists() else {'schemaVersion': 1, 'disks': {}}
    if set(data) != {'schemaVersion', 'disks'} or type(data['schemaVersion']) is not int or data['schemaVersion'] != 1 or not isinstance(data['disks'], dict) or len(data['disks']) > 2048:
        raise ValueError('Save disk edition information needs review')
    for name, owner in data['disks'].items():
        disk_name(name)
        if not isinstance(owner, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', owner):
            raise ValueError('Invalid save disk edition')
    return data


def compatible_disk(name, game_id, row, rows, properties, owners):
    # Preserve explicit legacy sharing. Otherwise keep edition-owned images
    # separate; unassigned, manually supplied raw ST images remain selectable.
    current = properties['games'].get(game_id, {}).get('saveDisk', '')
    if name.casefold() == current.casefold():
        return True
    owner = owners['disks'].get(name.casefold())
    if owner:
        return owner == game_id
    for other_id, other in rows.items():
        if other_id == game_id or Path(other['file']).parent != Path(row['file']).parent:
            continue
        assigned = properties['games'].get(other_id, {}).get('saveDisk', '')
        if name.casefold() == assigned.casefold() or name.casefold() == suggested_disk_name(other, rows, other_id).casefold():
            return False
    return True


def default_profile(executable, adapter='steem'):
    if adapter == 'hatari':
        local = ConfinedRoot(executable.parent).resolve('hatari.cfg')
        if local.is_file():
            return local
        folder = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Hatari'
        return ConfinedRoot(folder).resolve('hatari.cfg', require_exists=True)
    return ConfinedRoot(executable.parent).resolve('steem.ini', require_exists=True)


def compatible_emulator(emulator, row):
    adapter = emulator.get('type')
    return (adapter in {'steem', 'hatari'}
            and (adapter == 'hatari' or row['system'] in {'ST', 'STe'})
            and (adapter != 'hatari' or all(Path(p).suffix.lower() in {'.st', '.stx', '.msa', '.dim'} for p in row['disks'])))


def profile_options(executable, adapter='steem'):
    folder = ConfinedRoot(executable.parent).resolve('configs' if adapter == 'hatari' else 'config')
    result = []
    if folder.is_dir():
        for path in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
            if path.name.startswith('.') or adapter != 'hatari' and path.suffix.lower() != '.ini':
                continue
            path = ConfinedRoot(folder).resolve(path.name, require_exists=True)
            if path.is_file() and path.stat().st_size <= 1024 * 1024:
                name = path.name if adapter == 'hatari' and path.suffix.lower() != '.cfg' else path.stem
                result.append({'id': hashlib.sha256(path.name.casefold().encode()).hexdigest()[:24], 'name': name, 'path': path})
    if len(result) > 128:
        raise ValueError('Too many emulator profiles')
    return result


def selected_profile(executable, profile_id, adapter='steem'):
    if not profile_id:
        return default_profile(executable, adapter)
    profile = next((p for p in profile_options(executable, adapter) if p['id'] == profile_id), None)
    if profile is None:
        raise ValueError('The selected emulator profile is missing')
    return profile['path']


def blank_disk():
    """720 KiB, 80 tracks, two sides, FAT12; no boot program or licensed data."""
    data = bytearray(80 * 2 * 9 * 512)
    data[0:2] = b'\x60\x1c'
    data[2:8] = b'Cyrune'
    data[8:11] = secrets.token_bytes(3)
    struct.pack_into('<HBHBHHBHHHH', data, 11, 512, 2, 1, 2, 112, 1440, 0xf9, 3, 9, 2, 0)
    for sector in (1, 4):
        data[sector * 512:sector * 512 + 3] = b'\xf9\xff\xff'
    if sum(struct.unpack('>256H', data[:512])) & 0xffff == 0x1234:
        data[511] = 1  # Keep an empty disk non-bootable on TOS.
    return bytes(data)


def backup_directory(folder, name):
    key = hashlib.sha256(name.casefold().encode()).hexdigest()[:24]
    return ConfinedRoot(folder).resolve('.backups/' + key)


def backup_disk(path):
    target = backup_directory(path.parent, path.name)
    content = read_disk(path)
    digest = hashlib.sha256(content).hexdigest()
    existing = list(target.glob('*-' + digest[:16] + '.st')) if target.exists() else []
    if any(hashlib.sha256(read_disk(ConfinedRoot(target).resolve(p.name, require_exists=True))).hexdigest() == digest for p in existing):
        return
    target.mkdir(parents=True, exist_ok=True)
    destination = ConfinedRoot(target).resolve(str(time.time_ns()) + '-' + digest[:16] + '.st')
    atomic_write_bytes(destination, content)
    if hashlib.sha256(read_disk(path)).hexdigest() != digest:
        raise ValueError('Save disk changed during backup')
    for old in sorted(target.glob('*.st'), key=lambda p: p.name, reverse=True)[10:]:
        ConfinedRoot(target).resolve(old.name, require_exists=True).unlink()


class GameProperties:
    def __init__(self, runtime, config, picker, access=None, approved=None):
        self.runtime, self.config, self.picker = Path(runtime), config, picker
        self.access = access or (lambda *_: nullcontext())
        self.approved = approved or (lambda *_: None)
        self.imports = {}

    def context(self, collection_id, game_id):
        if any(not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', value) for value in (collection_id, game_id)):
            raise ValueError('Invalid collection or game edition')
        config = self.config()
        collection = next((c for c in config['collections'] if c['id'] == collection_id), None)
        if collection is None or collection.get('adapter') != 'atari-st-disks-v1':
            raise ValueError('These disk properties require an Atari ST collection')
        rows = read_rows(collection['root'])
        if game_id not in rows:
            raise ValueError('The selected edition is no longer available')
        return config, collection, rows[game_id], rows

    def preview(self, collection_id, game_id):
        config, collection, row, rows = self.context(collection_id, game_id)
        data = read_properties(self.runtime, collection)
        settings = deepcopy(data['games'].get(game_id, {'emulatorId': collection['default_emulator'], 'profileId': '',
            'driveB': 'game:1' if len(row['disks']) > 1 else 'empty', 'saveDisk': ''}))
        emulators = []
        for key, emulator in config['emulators'].items():
            if compatible_emulator(emulator, row):
                executable = Path(emulator.get('path', '')).resolve()
                profiles = profile_options(executable, emulator['type']) if executable.is_file() else []
                emulators.append({'id': key, 'name': emulator.get('name', key), 'profiles': [{k: p[k] for k in ('id','name')} for p in profiles]})
        folder = safe_directory(collection, row)
        owners = disk_owners(folder)
        disks = []
        if folder.exists():
            for file in sorted(folder.glob('*.st'), key=lambda p: p.name.casefold()):
                if not compatible_disk(file.name, game_id, row, rows, data, owners):
                    continue
                try:
                    disk_name(file.name)
                    file = ConfinedRoot(folder).resolve(file.name, require_exists=True)
                    check_disk(file)
                except (ValueError, OSError):
                    continue
                backups = backup_directory(folder, file.name)
                history = [{'id': p.name, 'label': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(p.stat().st_mtime))}
                           for p in sorted(backups.glob('*.st'), reverse=True)] if backups.exists() else []
                disks.append({'name': file.name, 'backups': history[:10]})
                if len(disks) > 512:
                    raise ValueError('Too many save disks in this game folder')
        name = suggested_disk_name(row, rows, game_id)
        return {'ok': True, 'collectionId': collection_id, 'gameId': game_id, 'title': row['title'], 'system': row['system'],
                'revision': hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(), 'settings': settings,
                'emulators': emulators, 'gameDisks': [{'id': f'game:{i}', 'name': f'Game Disk {i+1}', 'filename': Path(p).name} for i, p in enumerate(row['disks'])],
                'saveDisks': disks, 'suggestedName': name, 'recoveryRequired': properties_path(self.runtime, collection).with_suffix('.pending.json').exists()}

    def pick(self, collection_id, game_id):
        self.context(collection_id, game_id)
        selected = self.picker('save-disk', 'Select an existing .st save disk')
        if not selected.get('ok'):
            return {'ok': True, 'cancelled': True}
        path = Path(selected['path']).resolve()
        if path.suffix.lower() != '.st':
            raise ValueError('Select a raw .st save disk image')
        check_disk(path)
        now = time.monotonic()
        self.imports = {k: v for k,v in self.imports.items() if v[0] > now}
        if len(self.imports) >= 32:
            raise ValueError('Close unused properties windows and try again')
        token = secrets.token_urlsafe(24)
        self.imports[token] = (now + 1800, collection_id, game_id, path, hashlib.sha256(read_disk(path)).hexdigest())
        return {'ok': True, 'token': token, 'name': path.name}

    def disk_action(self, request):
        """An explicit disk operation, independent of unsaved launch settings."""
        if not isinstance(request, dict) or not {'collectionId', 'gameId', 'action'} <= set(request):
            raise ValueError('Invalid save disk request')
        action = request['action']
        extras = {'create': set(), 'import': {'token'}, 'restore': {'name', 'backup'}}
        if not isinstance(action, str) or action not in extras or set(request) != {'collectionId', 'gameId', 'action'} | extras[action]:
            raise ValueError('Invalid save disk action')
        cid, gid = request['collectionId'], request['gameId']
        _, collection, row, rows = self.context(cid, gid)
        folder = safe_directory(collection, row)
        settings_path = properties_path(self.runtime, collection)
        owners_path = ConfinedRoot(folder).resolve('.editions.json')
        # All editions sharing a folder serialize name allocation. Publish the
        # ownership record first; an interrupted create can only leave an unused
        # name reservation, never an image attributed to a different edition.
        with _writer_lock(owners_path):
            owners = disk_owners(folder)
            properties = read_properties(self.runtime, collection)
            if settings_path.with_suffix('.pending.json').exists():
                raise ValueError('Recover the interrupted properties save first')
            if action == 'restore':
                name = disk_name(request['name'])
                if not compatible_disk(name, gid, row, rows, properties, owners):
                    raise ValueError('That save disk belongs to another edition')
                target = ConfinedRoot(folder).resolve(name, require_exists=True)
                with self.access(folder, gid, target):
                    identifier = request['backup']
                    if not isinstance(identifier, str) or not re.fullmatch(r'[0-9]+-[a-f0-9]{16}\.st', identifier):
                        raise ValueError('Select an available backup')
                    source = ConfinedRoot(backup_directory(folder, name)).resolve(identifier, require_exists=True)
                    content = read_disk(source)
                    if hashlib.sha256(content).hexdigest()[:16] != identifier.split('-')[1][:-3]:
                        raise ValueError('The selected backup is damaged; choose another backup')
                    backup_disk(target)
                    atomic_write_bytes(target, content)
            else:
                content = blank_disk()
                if action == 'import':
                    token = request['token']
                    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}', token):
                        raise ValueError('Choose the import file again')
                    selected = self.imports.get(token)
                    if not selected or selected[0] < time.monotonic() or selected[1:3] != (cid, gid):
                        raise ValueError('Choose the import file again')
                    content = read_disk(selected[3])
                    if hashlib.sha256(content).hexdigest() != selected[4]:
                        raise ValueError('The import file changed. Choose it again')
                stem = Path(suggested_disk_name(row, rows, gid)).stem
                name = None
                for index in range(1, 1001):
                    candidate = stem + (f' ({index})' if index > 1 else '') + '.st'
                    if candidate.casefold() not in owners['disks'] and not ConfinedRoot(folder).resolve(candidate).exists():
                        name = candidate
                        break
                if name is None or len(owners['disks']) >= 2048:
                    raise ValueError('Too many save disks in this game folder')
                target = ConfinedRoot(folder).resolve(name)
                with self.access(folder, gid, target):
                    after = deepcopy(owners)
                    after['disks'][name.casefold()] = gid
                    atomic_write_json(owners_path, after)
                    temporary = ConfinedRoot(folder).resolve('.create-' + secrets.token_hex(12))
                    try:
                        atomic_write_bytes(temporary, content)
                        # Windows rename also supports FAT volumes and refuses
                        # overwrite. Unix needs link's exclusive publication.
                        if os.name == 'nt':
                            os.rename(temporary, target)
                        else:
                            os.link(temporary, target)
                    except Exception:
                        atomic_write_json(owners_path, owners)
                        raise
                    finally:
                        temporary.unlink(missing_ok=True)
        response = self.preview(cid, gid)
        response['selectedDisk'] = name
        return response

    def save(self, request):
        fields = {'collectionId', 'gameId', 'revision', 'settings', 'diskAction', 'makeDefault'}
        if set(request) != fields or type(request['makeDefault']) is not bool:
            raise ValueError('Invalid properties request')
        cid, gid = request['collectionId'], request['gameId']
        config, collection, row, _ = self.context(cid, gid)
        settings = deepcopy(request['settings'])
        validate_settings(settings)
        emulator = config['emulators'].get(settings['emulatorId'], {})
        if not compatible_emulator(emulator, row):
            raise ValueError('Select a compatible Atari emulator')
        executable = Path(emulator['path']).resolve()
        if not executable.is_file() or not selected_profile(executable, settings['profileId'], emulator['type']).is_file():
            raise ValueError('The selected emulator or profile is unavailable')
        if settings['driveB'].startswith('game:') and int(settings['driveB'][5:]) >= len(row['disks']):
            raise ValueError('The selected game disk is missing')
        folder = safe_directory(collection, row)
        path = properties_path(self.runtime, collection)
        action = request['diskAction']
        if not isinstance(action, dict) or set(action) - {'kind', 'name', 'token', 'backup'} or action.get('kind') not in {'none','create','import','restore'}:
            raise ValueError('Invalid save disk action')
        name = disk_name(action.get('name')) if action['kind'] != 'none' else settings['saveDisk']
        destination = ConfinedRoot(folder).resolve(name) if name else None
        with self.access(folder, gid, destination), _writer_lock(path):
            before = read_properties(self.runtime, collection)
            revision = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
            if revision != request['revision']:
                raise ValueError('Properties changed in another window. Reopen Properties and try again')
            content, old_content = None, None
            if action['kind'] == 'create':
                content = blank_disk()
            elif action['kind'] == 'import':
                selected = self.imports.get(action.get('token'))
                if not selected or selected[0] < time.monotonic() or selected[1:3] != (cid, gid):
                    raise ValueError('Choose the import file again')
                content = read_disk(selected[3])
                if hashlib.sha256(content).hexdigest() != selected[4]:
                    raise ValueError('The import file changed. Choose it again')
            elif action['kind'] == 'restore':
                check_disk(destination)
                identifier = action.get('backup')
                if not isinstance(identifier, str) or not re.fullmatch(r'[0-9]+-[a-f0-9]{16}\.st', identifier):
                    raise ValueError('Select an available backup')
                source = ConfinedRoot(backup_directory(folder, name)).resolve(identifier, require_exists=True)
                content, old_content = read_disk(source), read_disk(destination)
                if hashlib.sha256(content).hexdigest()[:16] != identifier.split('-')[1][:-3]:
                    raise ValueError('The selected backup is damaged; choose another backup')
                backup_disk(destination)
            if content is not None and old_content is None and destination.exists():
                raise ValueError('That save disk already exists. Choose another name')
            if settings['saveDisk'] and (destination is None or settings['saveDisk'] != name or content is None):
                check_disk(ConfinedRoot(folder).resolve(settings['saveDisk'], require_exists=True))
            after = deepcopy(before)
            after['games'][gid] = settings
            # Journal precedes file creation. An interrupted operation stays visible
            # for recovery instead of allowing the orphan to be overwritten.
            journal = path.with_suffix('.pending.json')
            if journal.exists():
                raise ValueError('An interrupted properties save needs recovery')
            path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_json(journal, {'before': before, 'after': after, 'makeDefault': request['makeDefault'], 'gameId': gid, 'saveDisk': str(destination) if destination else '',
                'created': content is not None and old_content is None})
            wrote = False
            try:
                if content is not None:
                    folder.mkdir(parents=True, exist_ok=True)
                    if ConfinedRoot(Path(collection['root'])).resolve(Path(row['file']).parent / 'Safe Disks') != folder:
                        raise ValueError('Save folder changed')
                    if old_content is None:
                        with destination.open('xb') as stream:
                            wrote = True
                            stream.write(content)
                            stream.flush()
                            os.fsync(stream.fileno())
                    else:
                        atomic_write_bytes(destination, content)
                        wrote = True
                atomic_write_json(path, after)
                self.approved(cid, gid, request['makeDefault'])
            except Exception:
                atomic_write_json(path, before)
                if wrote:
                    if old_content is None:
                        destination.unlink()
                    else:
                        atomic_write_bytes(destination, old_content)
                journal.unlink(missing_ok=True)
                raise
            journal.unlink()
        return self.preview(cid, gid)


    def recover(self, collection_id, game_id):
        _config, collection, row, _rows = self.context(collection_id, game_id)
        path = properties_path(self.runtime, collection)
        journal = path.with_suffix('.pending.json')
        if not journal.exists():
            return self.preview(collection_id, game_id)
        pending = read_object(journal, 16 * 1024 * 1024)
        if set(pending) != {'before','after','makeDefault','gameId','saveDisk','created'} or pending['gameId'] != game_id or type(pending['makeDefault']) is not bool:
            raise ValueError('Open Properties for the edition with the interrupted save')
        folder = safe_directory(collection, row)
        target = Path(pending['saveDisk']) if pending['saveDisk'] else None
        if target and (target.resolve() != target or target.parent != folder):
            raise ValueError('Recovery file requires manual review')
        with self.access(folder, game_id, target), _writer_lock(path):
            current = read_properties(self.runtime, collection)
            if current not in (pending['before'], pending['after']):
                raise ValueError('Properties changed since the interrupted save; manual review is required')
            if current == pending['after']:
                if target:
                    check_disk(target)
                self.approved(collection_id, game_id, pending['makeDefault'])
                result = 'completed'
            else:
                # Creation can precede the atomic settings commit. Keep any
                # orphan image for manual selection; never delete save data.
                result = 'rolled-back'
            archive = path.with_suffix('.recovered-' + str(time.time_ns()) + '.json')
            journal.rename(archive)
        response = self.preview(collection_id, game_id)
        response['recovery'] = result
        return response
