"""Collection index upgrade/import boundary; current readers use stored groups."""
from copy import deepcopy
from arcade_core.catalogue_identity import CatalogueError
import hashlib
import json
from pathlib import PurePosixPath
import re
import unicodedata

INDEX_SCHEMA_VERSION = 2


def _title(value):
    return ' '.join(unicodedata.normalize('NFC', str(value)).casefold().split())


def infer_groups(rows):
    """Recognize game folders; legacy containers share only matching titles.

    A folder is dedicated when its name matches a member's original title or
    ROM title. Alphabet buckets and flat roots are always containers. Unknown
    layouts conservatively retain separate titles rather than borrowing data.
    """
    folders = {}
    for row in rows:
        if row.get('status', 'Main') in {'Deleted', 'Hidden', 'Incoming'} or not row.get('file'):
            continue
        path = PurePosixPath(str(row['file']).replace('\\', '/'))
        folders.setdefault(str(path.parent).casefold(), []).append((row, path))
    result = {}
    for folder, members in folders.items():
        name = _title(PurePosixPath(folder).name)
        container = folder == '.' or bool(re.fullmatch(r'[a-z0-9#]|[a-z0-9]-[a-z0-9]', name))
        dedicated = not container and any(name in {
            _title(row.get('scrape_family_title') or row.get('title', '')),
            _title(re.split(r'\s*[\(\[]', path.stem)[0])
        } for row, path in members)
        for row, _path in members:
            title = _title(row.get('scrape_family_title') or row.get('title', ''))
            result[row['id']] = (folder, '' if dedicated else title or row['id'])
    return result



def index_document(value):
    """Preserve exact record IDs and all fields; materialize group ownership once."""
    version = value.get('indexSchemaVersion', 1)
    if type(version) is not int or version not in (1, INDEX_SCHEMA_VERSION):
        raise CatalogueError('review-required')
    result = deepcopy(value) if version == 1 else value
    rows = result.get('games', [])
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise CatalogueError('review-required')
    if version == 1:
        for row in rows:
            if not row.get('id'):
                row['id'] = hashlib.sha1(row['file'].lower().encode('utf-8')).hexdigest()[:16]
        if any(not isinstance(row['id'], str) or not row['id'] for row in rows):
            raise CatalogueError('review-required')
        assign_groups(rows)
        result['indexSchemaVersion'] = INDEX_SCHEMA_VERSION
    ids = set()
    for row in rows:
        key = row.get('id')
        group = row.get('metadata_group_id')
        if not isinstance(key, str) or not key or key in ids or not isinstance(group, str) or not re.fullmatch(r'mg_[0-9a-f]{32}', group):
            raise CatalogueError('review-required')
        ids.add(key)
    return result


def assign_groups(rows):
    """Called by index writers for newly discovered rows, never by UI/scraping."""
    if all(row.get('metadata_group_id') for row in rows):
        return
    inferred = infer_groups(rows)
    existing = {inferred[row['id']]: row['metadata_group_id'] for row in rows
                if row.get('metadata_group_id') and row['id'] in inferred}
    for row in rows:
        if row.get('metadata_group_id'):
            continue
        key = inferred.get(row['id'], ('exact', row['id']))
        row['metadata_group_id'] = existing.get(key) or 'mg_' + hashlib.sha256(
            json.dumps(key, ensure_ascii=False).encode('utf-8')).hexdigest()[:32]
