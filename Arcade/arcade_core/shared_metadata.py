"""Resolve presentation once per game folder without rewriting source records."""

from pathlib import PurePosixPath
import re
import unicodedata

from arcade_core.scummvm_overrides import TEXT_FIELDS, ART_FIELDS

FIELDS = tuple(TEXT_FIELDS) + tuple(sorted(ART_FIELDS))


def _title(value):
    return ' '.join(unicodedata.normalize('NFC', str(value)).casefold().split())


def group_keys(rows):
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


def shared_rows(rows, preferred=()):
    """Keep identity/media exact; prefer protected and scraped presentation.

    Source records, including conflicting legacy values, remain recoverable.
    Native loaders validate paths before records can grant any authority.
    """
    result = [dict(row) for row in rows]
    preferred = set(preferred)
    keys = group_keys(result)
    groups = {}
    for row in result:
        if row.get('id') not in keys:
            continue
        groups.setdefault(keys[row['id']], []).append(row)
    for members in groups.values():
        if len(members) < 2:
            continue
        ordered = sorted(members, key=lambda row: (
            -int(row.get('id') in preferred),
            -int(bool(row.get('scraper_id') or row.get('scraper_source'))),
            -sum(bool(row.get(key)) for key in FIELDS), str(row.get('id', ''))))
        values = {}
        for key in FIELDS:
            donor = next((row for row in ordered if key in row.get('protected_fields', [])), None)
            if donor is None:
                donor = next((row for row in ordered if row.get(key)), None)
            if donor is not None:
                values[key] = donor.get(key, '')
        for row in members:
            if values.get('title') and values['title'] != row.get('title'):
                row.setdefault('scrape_family_title', row.get('title', ''))
                for key in ('title_key', 'sort_title', 'tosec_title'):
                    row.pop(key, None)
            row.update(values)
    return result
