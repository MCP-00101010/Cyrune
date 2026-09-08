"""Source-scoped Atari disk sets and fixed STEem SSE launch plans."""

from pathlib import Path
from dataclasses import dataclass
import hashlib

from arcade_core.atari import read_rows, metadata
from arcade_core.catalogue_identity import CatalogueError, encoded
from arcade_core.catalogue_spectrum import SpectrumEntry, _metadata_digest, media_signature
from arcade_core.import_manifest import BASE_TEXT, DETAIL_TEXT, DETAIL_LISTS
from arcade_core.paths import ConfinedRoot
from arcade_core.atari_overrides import AtariOverrides


@dataclass(frozen=True)
class AtariEntry(SpectrumEntry):
    family_title: str = ''


class AtariSource:
    browse = True

    def __init__(self, collection, identity, runtime=None):
        self.runtime = runtime
        self.collection_id = collection['id']
        self.root = Path(collection['root']).resolve()
        self.collection = dict(collection)
        self.rows = read_rows(self.root)
        self.overrides = AtariOverrides(runtime, collection).load() if runtime is not None else {}
        self.presentation = AtariOverrides.shared_values(self.rows, self.overrides)
        self.identity = identity
        self.source_id = identity(['atari-source', self.collection_id, str(self.root)])

    def _row_index(self):
        return self.rows

    def artwork_target(self, row):
        from arcade_core.entry_artwork import target
        return target(self.root, self.runtime, {**row, **self.presentation.get(row['id'], {})})

    def snapshot(self):
        result = []
        for legacy, row in self.rows.items():
            values = self.presentation[legacy]
            info = metadata({**row, **values})
            base = {'catalogueId': self.identity(['atari-entry', self.source_id, legacy]),
                    'sourceId': self.source_id, 'entryRevision': '', 'platformId': 'atari-st',
                    'platformLabel': 'Atari ST', 'targetKind': 'disk-set', 'availability': 'available', 'artworkRef': '',
                    **{key: info[key] for key in BASE_TEXT}}
            result.append(AtariEntry(base, {k: info[k] for k in (*DETAIL_TEXT, *DETAIL_LISTS)}, legacy,
                self.collection_id, row['file'], (), (self.collection.get('default_emulator', ''), ''),
                _metadata_digest({'edition': row, 'overrides': values} if values else row), artwork=self.artwork_target(row), family_title=row['title']))
        return result

    def resolve_native(self, entry):
        row = self.rows.get(entry.legacy_id)
        values = self.presentation.get(entry.legacy_id, {}) if row else {}
        digest = _metadata_digest({'edition': row, 'overrides': values} if values else row)
        if entry.collection_id != self.collection_id or row is None or digest != entry.metadata_digest:
            raise CatalogueError('entry-changed')
        confined = ConfinedRoot(self.root)
        for relative in row['disks']:
            path = confined.resolve(relative, require_exists=True)
            if not path.is_file():
                raise CatalogueError('media-missing')
        return confined.resolve(row['file'], require_exists=True)


def resolve_atari_plan(lifecycle, source, indexed, public, emulator_override=''):
    from arcade_core.catalogue_launch import _native_path
    config = lifecycle._config()
    collection = lifecycle._collection(config, source.collection_id)
    from arcade_core.game_properties import read_properties, selected_profile, safe_directory, check_disk, compatible_emulator
    settings = read_properties(lifecycle.runtime, collection)['games'].get(indexed.legacy_id)
    emulator_id = settings['emulatorId'] if settings else collection.get('default_emulator')
    if emulator_override and emulator_override != emulator_id:
        emulator_id = emulator_override
        if settings:
            settings = {**settings, 'emulatorId': emulator_id, 'profileId': ''}
    emulator = config.get('emulators', {}).get(emulator_id, {})
    adapter = emulator.get('type')
    if adapter not in {'steem', 'hatari'}:
        raise CatalogueError('configuration-required')
    row = source.rows[indexed.legacy_id]
    if not compatible_emulator(emulator, row):
        raise CatalogueError('unsupported-target')
    executable = _native_path(emulator.get('path'))
    ini = executable.parent / 'steem.ini'
    if not executable.is_file() or adapter == 'steem' and not ini.is_file():
        raise CatalogueError('configuration-required')
    if adapter == 'hatari' and not settings:
        settings = {'emulatorId': emulator_id, 'profileId': '',
                    'driveB': 'game:1' if len(row['disks']) > 1 else 'empty', 'saveDisk': ''}
    disks = []
    for relative in row['disks']:
        path = ConfinedRoot(source.root).resolve(relative, require_exists=True)
        signature = media_signature(path)
        if not 0 < signature[2] <= 32 * 1024 * 1024:
            raise CatalogueError('review-required')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if media_signature(path) != signature:
            raise CatalogueError('entry-changed')
        disks.append({'path': str(path), 'signature': signature, 'sha256': digest})
    result = {'schemaVersion': 3, 'catalogueId': public['catalogueId'], 'sourceId': public['sourceId'],
              'entryRevision': public['entryRevision'], 'collectionId': source.collection_id, 'gameId': indexed.legacy_id,
              'adapterId': adapter, 'emulatorId': emulator_id, 'profileId': '', 'root': str(source.root),
              'media': disks[0]['path'], 'disks': disks, 'system': row['system'],
              'executable': str(executable), 'executableSignature': media_signature(executable), 'cwd': str(executable.parent),
              'arguments': ['OPENNEW', 'INI=' + str(ini), *[d['path'] for d in disks[:2]]],
              'public': {'title': public['title'], 'systemId': 'atari-st', 'systemName': 'Atari ST'}}
    if settings:
        profile = selected_profile(executable, settings['profileId'], adapter).resolve()
        if not profile.is_file() or profile.stat().st_size > 1024 * 1024:
            raise CatalogueError('configuration-required')
        signature = media_signature(profile)
        digest = hashlib.sha256(profile.read_bytes()).hexdigest()
        if media_signature(profile) != signature:
            raise CatalogueError('entry-changed')
        folder = safe_directory(collection, row)
        session = ConfinedRoot(folder).resolve('.sessions/' + indexed.legacy_id)
        drive_b = ''
        save_disk = ''
        if settings['driveB'].startswith('game:'):
            index = int(settings['driveB'][5:])
            if index >= len(disks):
                raise CatalogueError('media-missing')
            drive_b = disks[index]['path']
        elif settings['driveB'] == 'save':
            target = ConfinedRoot(folder).resolve(settings['saveDisk'], require_exists=True)
            check_disk(target)
            drive_b = save_disk = str(target)
        result.update(schemaVersion=4, profileId=settings['profileId'], settings={
            'profile': str(profile), 'profileSignature': signature, 'profileSha256': digest,
            'sessionDirectory': str(session), 'driveB': drive_b, 'saveDisk': save_disk})
        result['arguments'] = ['OPENNEW', 'INI=' + str(session / 'launch.ini'), disks[0]['path'], *([drive_b] if drive_b else [])]
        if adapter == 'hatari':
            result['schemaVersion'] = 5
            result['arguments'] = ['--configfile', str(session / 'launch.cfg'), '--disk-a', disks[0]['path']]
            if drive_b:
                result['arguments'] += ['--disk-b', drive_b]
    if len(encoded(result)) > 64 * 1024:
        raise CatalogueError('review-required')
    lifecycle.observe_plan(result)
    return result
