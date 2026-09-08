"""Native-only scrape provenance and newly indexed IDs; no launch authority."""
import datetime as dt
import hashlib
import json
from pathlib import Path

from arcade_core.catalogue_identity import read_object, _writer_lock
from arcade_core.persistence import atomic_write_json
from arcade_core.paths import ConfinedRoot


class MetadataNotes:
    def __init__(self, runtime, collection):
        key = hashlib.sha256(json.dumps([collection['id'], str(Path(collection['root']).resolve())]).encode()).hexdigest()
        self.path = ConfinedRoot(runtime).resolve('metadata-notes/' + key + '.json')

    def load(self):
        if not self.path.exists():
            return {'schemaVersion':1, 'known':[], 'added':{}, 'provenance':{}}
        data = read_object(self.path, 32 * 1024 * 1024)
        if set(data) != {'schemaVersion','known','added','provenance'} or type(data['schemaVersion']) is not int or data['schemaVersion'] != 1:
            raise ValueError('Metadata notes need review.')
        if not isinstance(data['known'], list) or len(data['known']) > 100000 or any(not isinstance(key, str) or len(key) > 160 for key in data['known']):
            raise ValueError('Metadata notes need review.')
        for name in ('added', 'provenance'):
            if not isinstance(data[name], dict) or len(data[name]) > 100000:
                raise ValueError('Metadata notes need review.')
        for key, value in data['added'].items():
            if not isinstance(key, str) or not key or len(key) > 160 or not isinstance(value, str) or len(value) > 40:
                raise ValueError('Metadata notes need review.')
        for key, value in data['provenance'].items():
            if not isinstance(key, str) or not key or len(key) > 160:
                raise ValueError('Metadata notes need review.')
            if not isinstance(value, dict) or set(value) != {'provider','platform','scraped_at'} or any(not isinstance(v, str) or len(v) > 160 for v in value.values()):
                raise ValueError('Metadata notes need review.')
        return data

    def save(self, data):
        if len(json.dumps(data).encode()) > 32 * 1024 * 1024:
            raise ValueError('Metadata notes exceed the supported size.')
        atomic_write_json(self.path, data)

    def observe(self, identifiers):
        identifiers = set(identifiers)
        if len(identifiers) > 100000:
            return set()
        with _writer_lock(self.path):
            initialized = self.path.exists()
            data = self.load()
            now = dt.datetime.now(dt.UTC)
            known = set(data['known'])
            if known != identifiers or not initialized:
                if initialized:
                    for key in identifiers - known:
                        data['added'][key] = now.isoformat(timespec='seconds')
                data['known'] = sorted(identifiers)
                data['added'] = {key:value for key,value in data['added'].items() if key in identifiers}
                data['provenance'] = {key:value for key,value in data['provenance'].items() if key in identifiers}
                self.save(data)
            threshold = (now - dt.timedelta(days=14)).isoformat(timespec='seconds')
            return {key for key, added in data['added'].items() if added >= threshold}

    def record(self, identifiers, candidate):
        with _writer_lock(self.path):
            data = self.load()
            values = {'provider':str(candidate.get('scraper_source', ''))[:160],
                      'platform':str(candidate.get('platform', ''))[:160],
                      'scraped_at':dt.datetime.now(dt.UTC).isoformat(timespec='seconds')}
            for identifier in identifiers:
                data['provenance'][identifier] = values
            self.save(data)

    def clear(self, identifiers):
        with _writer_lock(self.path):
            data = self.load()
            for identifier in identifiers:
                data['provenance'].pop(identifier, None)
            self.save(data)
