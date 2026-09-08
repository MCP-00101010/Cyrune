"""Protected presentation fields and recoverable, collection-scoped scrape Undo."""
from copy import deepcopy
import hashlib
import json
import re
from pathlib import Path

from arcade_core.catalogue_identity import _writer_lock
from arcade_core.persistence import atomic_write_json
from arcade_core.paths import ConfinedRoot
from arcade_core.platforms import LIBRARIES, collection_platform
from arcade_core.scummvm_overrides import TEXT_FIELDS, ART_FIELDS, MAX_BYTES, target_digest, validate_values

FIELDS = tuple(key for key in TEXT_FIELDS if key not in {'scraper_id', 'scraper_source'}) + tuple(sorted(ART_FIELDS))
class MetadataCareError(ValueError):
    pass


MAX_JOURNAL = 32 * 1024 * 1024


def field_names(value):
    if not isinstance(value, list) or len(value) > len(FIELDS) or any(key not in FIELDS for key in value):
        raise MetadataCareError('Choose supported metadata fields to protect.')
    return sorted(set(value))


def row_map(document):
    games = document.get('games', [])
    return games if isinstance(games, dict) else {row['id']: row for row in games}


def patched(document, changes):
    result = deepcopy(document)
    rows = deepcopy(row_map(result))
    for key, value in changes.items():
        if value is None:
            rows.pop(key, None)
        else:
            rows[key] = deepcopy(value)
    result['games'] = rows if isinstance(document.get('games'), dict) else list(rows.values())
    return result


class ScrapeJournal:
    """Journal only affected rows. Never undo a later edit or another collection."""
    def __init__(self, runtime, scope, read, write):
        name = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
        self.path = ConfinedRoot(Path(runtime)).resolve(f'metadata-care/{name}.json')
        self.read, self.write = read, write

    def load(self):
        if not self.path.exists():
            return {'schemaVersion': 1, 'reviews': {}, 'undo': None, 'pending': None}
        if self.path.stat().st_size > MAX_JOURNAL:
            raise MetadataCareError('Metadata history exceeds its supported size.')
        state = json.loads(self.path.read_text(encoding='utf-8'))
        if (not isinstance(state, dict) or set(state) != {'schemaVersion', 'reviews', 'undo', 'pending'} or
                type(state.get('schemaVersion')) is not int or state['schemaVersion'] != 1 or
                not isinstance(state.get('reviews'), dict) or len(state['reviews']) > 10000 or
                any(not isinstance(key, str) or len(key) > 160 or value is not True for key, value in state['reviews'].items())):
            raise MetadataCareError('Metadata history needs review.')
        def validate_record(record, pending=False):
            if record is None:
                return
            expected = {'before', 'after', 'undo'} if pending else {'before', 'after', 'group'}
            if (not isinstance(record, dict) or set(record) != expected or
                    not isinstance(record.get('before'), dict) or not isinstance(record.get('after'), dict) or
                    not 1 <= len(record['before']) <= 1000 or record['before'].keys() != record['after'].keys()):
                raise MetadataCareError('Metadata history needs review.')
            for entries in (record['before'], record['after']):
                if any(not isinstance(key, str) or not 1 <= len(key) <= 160 or
                       (value is not None and not isinstance(value, dict)) for key, value in entries.items()):
                    raise MetadataCareError('Metadata history needs review.')
            if pending:
                validate_record(record['undo'])
            elif not isinstance(record['group'], str) or len(record['group']) > 80:
                raise MetadataCareError('Metadata history needs review.')
        validate_record(state['undo'])
        validate_record(state['pending'], True)
        return state

    def save(self, state):
        if len(json.dumps(state, indent=2, ensure_ascii=False).encode('utf-8')) > MAX_JOURNAL:
            raise MetadataCareError('This scrape exceeds the supported Undo size. Select fewer games.')
        atomic_write_json(self.path, state)

    def settle(self):
        state = self.load()
        pending = state.get('pending')
        if pending:
            current = self.read()
            rows = row_map(current)
            for key, after in pending['after'].items():
                if rows.get(key) not in (pending['before'][key], after):
                    raise MetadataCareError('Metadata changed during an interrupted save. Review it before continuing.')
            if any(rows.get(key) != value for key, value in pending['after'].items()):
                self.write(patched(current, pending['after']))
            state['undo'] = pending['undo']
            state['pending'] = None
            self.save(state)
        return state

    def commit(self, before, after, group='', *, undo=False, keep_undo=False):
        with _writer_lock(self.path):
            state = self.settle()
            old, new = row_map(before), row_map(after)
            keys = [key for key in old.keys() | new.keys() if old.get(key) != new.get(key)]
            if not keys:
                return
            if len(keys) > 1000:
                raise MetadataCareError('Select fewer games for this metadata operation.')
            current_rows = row_map(self.read())
            if any(current_rows.get(key) != old.get(key) for key in keys):
                raise MetadataCareError('Metadata changed. Reload before saving.')
            record = {'before': {key: old.get(key) for key in keys}, 'after': {key: new.get(key) for key in keys}, 'group': group}
            previous = state.get('undo')
            if not undo and group and previous and previous['group'] == group:
                if all(old.get(key) == value for key, value in previous['after'].items()):
                    record = {'before': {**record['before'], **previous['before']},
                              'after': {**previous['after'], **record['after']}, 'group': group}
            if len(record['before']) > 1000:
                raise MetadataCareError('Select fewer games for this scrape batch.')
            state['pending'] = {'before': {key: old.get(key) for key in keys},
                                'after': {key: new.get(key) for key in keys},
                                'undo': previous if keep_undo else None if undo else record}
            self.save(state)
            self.settle()

    def undo(self):
        with _writer_lock(self.path):
            state = self.settle()
            record = state.get('undo')
            if not record:
                raise MetadataCareError('No scrape is available to undo in this collection.')
            current = self.read()
            if any(row_map(current).get(key) != value for key, value in record['after'].items()):
                raise MetadataCareError('These games were edited after scraping. Undo would overwrite those edits.')
            self.commit(current, patched(current, record['before']), undo=True)
            return len(record['before'])

    def review(self, ids, needed):
        with _writer_lock(self.path):
            state = self.settle()
            for key in ids:
                if needed:
                    state['reviews'][key] = True
                else:
                    state['reviews'].pop(key, None)
            if len(state['reviews']) > 10000:
                raise MetadataCareError('Too many pending scrape reviews.')
            self.save(state)


class MetadataCare:
    def __init__(self, service):
        self.s = service
        self.collection = service.active_collection()
        self.platform = collection_platform(self.collection)
        if not self.platform:
            raise MetadataCareError('This platform does not support metadata editing yet.')
        self.overrides = LIBRARIES[self.platform]['presentationOverrides']
        self.targets = {}
        if self.overrides:
            if self.platform == 'atari-st':
                from arcade_core.atari_overrides import AtariOverrides
                self.store = AtariOverrides(service.DATA, self.collection)
            else:
                from arcade_core.scummvm_overrides import ScummvmOverrides
                self.store = ScummvmOverrides(service.DATA, self.collection)
            self.path = self.store.path
        else:
            self.path = service.METADATA_FILE
        scope = [self.collection['id'], str(Path(service.COLLECTION).resolve()), str(self.path.resolve())]
        self.journal = ScrapeJournal(service.DATA, scope, self.read, self.write)

    def read(self):
        return {'schemaVersion': 1, 'games': self.store.load()} if self.overrides else self.s.load_metadata()

    def validate(self, document):
        if self.overrides:
            if len(document['games']) > 10000 or len(json.dumps(document, indent=2, ensure_ascii=False).encode('utf-8')) > MAX_BYTES:
                raise MetadataCareError('Metadata overrides exceed their supported size.')
            for row in document['games'].values():
                validate_values(row['values'])
                field_names(row.get('protected_fields', []))

    def write(self, document):
        self.validate(document)
        if self.overrides:
            atomic_write_json(self.path, document)
            self.s.invalidate_catalogue()
        else:
            self.s.save_metadata(document)

    def protected(self, document, game):
        row = row_map(document).get(game.id, {})
        if self.overrides and row.get('targetDigest') != target_digest(self.targets.get(game.id)):
            return []
        return field_names(row.get('protected_fields', []))

    def set_row(self, document, game, values, protected):
        if self.overrides:
            target = self.targets.get(game.id)
            if target is None:
                raise MetadataCareError('The game version changed. Re-index before editing.')
            original = row_map(document).get(game.id, {})
            previous = original.get('values', {}) if original.get('targetDigest') == target_digest(target) else {}
            combined = {**previous, **values}
            if not combined:
                combined = {'title': game.title}
            row = {'targetDigest': target_digest(target), 'values': validate_values(combined), 'protected_fields': protected}
        else:
            if not Path(game.path).exists():
                raise MetadataCareError('A game file is missing. Re-index before editing.')
            row = deepcopy(row_map(document).get(game.id) or self.s.game_to_metadata_item(game, []))
            row.setdefault('scrape_family_title', row.get('title') or game.title)
            self.s.apply_metadata_values(game, row, values)
            row['protected_fields'] = protected
        return patched(document, {game.id: row})

    def members(self, game_id):
        from arcade_core.scrape_groups import folder_members
        if self.overrides and not self.targets:
            if self.platform == 'atari-st':
                from arcade_core.atari import read_rows
                from arcade_core.atari_overrides import edition_target
                self.targets = {key: edition_target(row) for key, row in read_rows(self.s.COLLECTION).items()}
            else:
                from arcade_core.import_scummvm import scummvm_manifest
                manifest = scummvm_manifest(self.collection['id'], self.s.COLLECTION, Path(self.collection['scummvm_config']))
                self.targets = {row['id']: row['target'] for row in manifest['entries']}
        game = self.s.get_library().get_game(game_id)
        if not game:
            raise MetadataCareError('Unknown game')
        return game, folder_members(self.s.get_library(), self.s.COLLECTION, game)

    def refresh(self, document, ids):
        library = self.s.get_library()
        if self.overrides:
            from dataclasses import replace
            for key in ids:
                game = library.get_game(key)
                values = row_map(document)[key]['values']
                title = values.get('title', game.title)
                library.update_game_record(replace(game, **values, title_key=self.s.normalize_title(title),
                    sort_title=self.s.article_sort_title(title), tosec_title=self.s.tosec_title_from_display(title),
                    letter=self.s.folder_letter(title)))
        else:
            library.refresh_metadata(document, ids)
            # The older edit Undo snapshots the entire Spectrum document. It
            # cannot be replayed over a newer protected edit or reviewed scrape.
            if self.s.METADATA_SERVICE is not None:
                self.s.METADATA_SERVICE.clear_history()

    def apply(self, game_id, candidate, remote_assets, target_ids, mode='replace', group=''):
        if not isinstance(mode, str) or mode not in {'replace', 'missing'} or not isinstance(group, str) or len(group) > 80 or (group and not re.fullmatch(r'[a-zA-Z0-9_-]+', group)):
            raise MetadataCareError('Invalid scrape options.')
        if not isinstance(candidate, dict):
            raise MetadataCareError('Missing scrape candidate')
        if any(key in candidate and not isinstance(candidate[key], str) for key in (*TEXT_FIELDS, *ART_FIELDS)):
            raise MetadataCareError('Scraped metadata fields must be text')
        game, members = self.members(game_id)
        ids = [member.id for member in members]
        if target_ids is not None and (not isinstance(target_ids, list) or any(not isinstance(key, str) for key in target_ids) or sorted(target_ids) != sorted(ids)):
            raise MetadataCareError('The game versions changed. Search again before applying metadata.')
        with _writer_lock(self.journal.path), _writer_lock(self.path):
            self.journal.settle()
            if not self.overrides:
                self.s.ensure_metadata_file()
            before = self.read()
            ordered = [game, *(member for member in members if member.id != game.id)]
            locks = {member.id: self.protected(before, member) for member in members}
            protected = sorted(set().union(*map(set, locks.values())))
            images = remote_assets if isinstance(remote_assets, dict) else {}
            incoming = {key: self.s.clean_metadata_text(candidate[key], max_len=limit)
                        for key, limit in TEXT_FIELDS.items() if candidate.get(key)}
            for key in ART_FIELDS:
                value = images.get(key) or candidate.get(key)
                if value:
                    incoming[key] = value if self.overrides else self.s.clean_asset_path(value)
            if not incoming:
                raise MetadataCareError('Scrape candidate has no usable metadata')
            values = {}
            for key in (*TEXT_FIELDS, *ART_FIELDS):
                owners = [member for member in ordered if key in locks[member.id]]
                current = getattr(owners[0], key, '') if owners else next((getattr(member, key, '') for member in ordered if getattr(member, key, '')), '')
                values[key] = current if owners or (mode == 'missing' and str(current).strip()) else incoming.get(key, current)
            if self.overrides:
                values = {key: value for key, value in values.items() if value or key in protected or key in ART_FIELDS or key == 'description'}
            after = before
            for member in members:
                after = self.set_row(after, member, values, protected)
            self.validate(after)
            self.journal.commit(before, after, group)
            self.journal.review(ids, False)
            try:
                notes = self.s.metadata_notes()
                notes.observe(row.id for row in self.s.get_library().games if row.view == 'collection')
                notes.record(ids, candidate)
            except (OSError, ValueError):
                pass  # Informational notes must not turn a committed save into an uncertain write.
            self.refresh(self.read(), ids)
            return {'ok': True, 'changes': values, 'updated_count': len(ids), 'undo_available': bool(self.journal.load().get('undo'))}

    def protection(self, game_id, fields=None, changes=None):
        game, members = self.members(game_id)
        with _writer_lock(self.journal.path), _writer_lock(self.path):
            self.journal.settle()
            if not self.overrides and (fields is not None or changes is not None):
                self.s.ensure_metadata_file()
            before = self.read()
            protected = sorted(set().union(*(set(self.protected(before, member)) for member in members)))
            if fields is None and changes is None:
                return {'ok': True, 'fields': list(FIELDS), 'protected_fields': protected,
                        'values': {key: getattr(game, key, '') for key in FIELDS}, 'target_count': len(members),
                        'provenance': self.s.metadata_notes().load()['provenance'].get(game_id, {})}
            selected = field_names(fields if fields is not None else protected)
            if changes is not None and (not isinstance(changes, dict) or set(changes) - set(FIELDS)):
                raise MetadataCareError('Only presentation metadata can be edited here.')
            values = {} if changes is None else changes
            for key, value in values.items():
                if not isinstance(value, str):
                    raise MetadataCareError('Metadata fields must be text.')
                if value != getattr(game, key, ''):
                    selected = sorted(set(selected) | {key})
            after = before
            for member in members:
                after = self.set_row(after, member, values, selected)
            self.validate(after)
            # Manual edits are journaled for crash recovery, but are not scrape Undo.
            self.journal.commit(before, after, keep_undo=True)
            self.refresh(self.read(), [member.id for member in members])
            return {'ok': True, 'updated_count': len(members), 'protected_fields': selected}


def needs_review(result):
    from arcade_core.scrape_text import review
    return review(result)[0]
