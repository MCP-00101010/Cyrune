"""Successful lookup choices, scoped to native collection/game/provider IDs."""
import hashlib
import json
from pathlib import Path

from arcade_core.catalogue_identity import read_object, _writer_lock
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json


def validate(options):
    if not isinstance(options, dict) or set(options) != {'provider', 'search_term', 'search_platform'}:
        raise ValueError('Invalid saved search choices.')
    provider, term = options['provider'], options['search_term']
    if not isinstance(provider, str) or not provider or len(provider) > 120 or any(ord(c) < 32 for c in provider):
        raise ValueError('Invalid search provider.')
    if term is not None and (not isinstance(term, str) or not term.strip() or len(term) > 500 or any(ord(c) < 32 for c in term)):
        raise ValueError('Enter a search term of 1 to 500 characters.')
    if options['search_platform'] not in ('current', 'all'):
        raise ValueError('Invalid search platform.')
    return {**options, 'search_term':term.strip() if term is not None else None}


class ScrapePreferences:
    def __init__(self, runtime, collection):
        key = hashlib.sha256(json.dumps([collection['id'], str(Path(collection['root']).resolve())]).encode()).hexdigest()
        self.path = ConfinedRoot(runtime).resolve('scrape-preferences/' + key + '.json')

    def load(self):
        if not self.path.exists():
            return {}
        data = read_object(self.path, 16 * 1024 * 1024)
        if set(data) != {'schemaVersion', 'games'} or type(data['schemaVersion']) is not int or data['schemaVersion'] != 1:
            raise ValueError('Saved scrape searches need review.')
        games = data['games']
        if not isinstance(games, dict) or len(games) > 100000:
            raise ValueError('Saved scrape searches exceed the supported size.')
        for identifier, providers in games.items():
            if not isinstance(identifier, str) or not identifier or len(identifier) > 160 or not isinstance(providers, dict) or len(providers) > 16:
                raise ValueError('Invalid saved scrape search.')
            for provider, choices in providers.items():
                if not isinstance(choices, dict) or set(choices) != {'search_term', 'search_platform'}:
                    raise ValueError('Invalid saved scrape search.')
                validate({'provider':provider, **choices})
        return games

    def record(self, identifiers, options):
        options = validate(options)
        with _writer_lock(self.path):
            games = self.load()
            for identifier in identifiers:
                choices = games.setdefault(identifier, {})
                choices[options['provider']] = {key:options[key] for key in ('search_term', 'search_platform')}
                while len(choices) > 16:
                    del choices[next(iter(choices))]
            data = {'schemaVersion':1, 'games':games}
            if len(games) > 100000 or len(json.dumps(data).encode()) > 16 * 1024 * 1024:
                raise ValueError('Saved scrape searches exceed the supported size.')
            atomic_write_json(self.path, data)


def for_members(saved, members, anchor):
    # Newly indexed versions inherit the existing folder's choices. Exact
    # ScummVM membership and legacy Spectrum bucket separation are native-owned.
    choices = {}
    for member in sorted(members, key=lambda row:row.id):
        choices.update(saved.get(member.id, {}))
    choices.update(saved.get(anchor.id, {}))
    return choices
