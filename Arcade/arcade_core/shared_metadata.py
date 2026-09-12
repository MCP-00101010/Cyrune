"""Resolve presentation once per game folder without rewriting source records."""

from arcade_core.scummvm_overrides import TEXT_FIELDS, ART_FIELDS

FIELDS = tuple(TEXT_FIELDS) + tuple(sorted(ART_FIELDS))


def group_keys(rows):
    """Presentation ownership is persisted independently of scraped titles."""
    return {row['id']: row.get('metadata_group_id', row['id']) for row in rows}


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
