"""Presentation-only Atari metadata; ordered disk sets retain launch authority."""

import hashlib
from pathlib import Path

from arcade_core.catalogue_identity import encoded
from arcade_core.paths import ConfinedRoot
from arcade_core.scummvm_overrides import PresentationOverrides


def edition_target(row):
    return {key: row[key] for key in ('disks', 'system', 'languages', 'countries')}


class AtariOverrides(PresentationOverrides):
    @classmethod
    def shared_values(cls, rows, overrides):
        from arcade_core.shared_metadata import FIELDS, shared_rows
        own = {key: cls.values(overrides, key, edition_target(row)) for key, row in rows.items()}
        merged = [{**row, **own[key], 'scrape_family_title': row['title'],
                   'protected_fields': overrides[key].get('protected_fields', []) if own[key] else []}
                  for key, row in rows.items()]
        shared = shared_rows(merged, [key for key, values in own.items() if values])
        return {row['id']: {**own[row['id']], **{key: row[key] for key in FIELDS
                    if key in row and (key in own[row['id']] or row[key] != rows[row['id']].get(key, ''))}} for row in shared}

    def __init__(self, runtime, collection):
        scope = [collection['id'], str(Path(collection['root']).resolve()), 'atari-st-disks-v1']
        name = hashlib.sha256(encoded(scope)).hexdigest()
        self.path = ConfinedRoot(Path(runtime)).resolve(f'atari-overrides/{name}.json')
