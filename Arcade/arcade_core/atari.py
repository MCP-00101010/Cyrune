"""Native Atari disk-set discovery and metadata; no process or file mutations."""

import hashlib
from pathlib import Path
import re
from collections import defaultdict

from arcade_core.catalogue_identity import CatalogueError, encoded, read_object, valid_id
from arcade_core.import_manifest import plain_text, text_list, _relative
from arcade_core.paths import ConfinedRoot

ADAPTER = 'atari-st-disks-v1'
FORMATS = frozenset({'.st', '.stx', '.msa', '.dim', '.stt'})
SYSTEMS = {'ST', 'STe', 'TT', 'Falcon'}
ROLES = {'boot', 'boot disk', 'game', 'game disk', 'data', 'data disk', 'datas', 'intro', 'intro and play',
         'play', 'utility disk', 'level', 'mission', 'fate1', 'fate2', 'graphics', 'scenery',
         'supplementary data', 'book', 'one', 'two', 'three', 'four', 'tool', 'program', 'map',
         'master', 'bike', 'master and bike', 'king1', 'king2'}


def discover(root, parse_name, *, exclude=()):
    """Group complete TOSEC sets; retain language, hardware and release identity."""
    root = Path(root).resolve()
    confined = ConfinedRoot(root)
    groups = defaultdict(list)
    rejected = []
    excluded = {p.casefold() for p in exclude}
    paths = sorted((p for p in root.rglob('*') if p.suffix.lower() in FORMATS), key=lambda p: str(p).casefold())
    if len(paths) > 100_000:
        raise CatalogueError('review-required')
    for path in paths:
        relative = path.relative_to(root).as_posix()
        if relative.casefold() in excluded:
            continue
        if any(part.startswith('.') or part.casefold() in {'incoming', '_deleted', 'safe disks'} for part in Path(relative).parts):
            continue
        confined.resolve(relative, require_exists=True)
        parsed = parse_name(path.name)
        tags, flags = list(parsed['parentheses']), list(parsed['brackets'])
        year_at = next((i for i, tag in enumerate(tags) if re.fullmatch(r'[12][0-9xX]{3}(?:-\d\d(?:-\d\d)?)?', tag)), None)
        if year_at is None or year_at + 1 >= len(tags):
            rejected.append(relative)
            continue
        extras = tags[:year_at] + tags[year_at + 2:]
        match = next((re.fullmatch(r'Disk (\d+) of (\d+)', t, re.I) for t in extras if re.fullmatch(r'Disk (\d+) of (\d+)', t, re.I)), None)
        disk, total = (int(match[1]), int(match[2])) if match else (1, 1)
        if (not 1 <= disk <= total <= 30 or any(re.match(r'b(?:\d+)?(?:\s|$)', f, re.I) for f in flags)
                or any(re.search(r'not complete|\bmissing\b|^99%$', f, re.I) for f in flags)
                or not match and any(re.match(r'Disk\s', t, re.I) for t in extras)):
            rejected.append(relative)
            continue
        edition = [t for t in extras if not re.match(r'Disk\s', t, re.I) and not (match and t.casefold() in ROLES)]
        significant = [f for f in flags if re.match(r'(?:cr\d*|m\d*|h|f|tr)(?:\s|$)|a\d*$|monochrome|censored|different version|partial french|falcon |tt megamix|hd install|budget|hit squad version|sv$|demo\b|low res|512\s*k|1\s*m(?:b|eg)?$', f, re.I)]
        significant = ['HD install' if f.casefold().startswith('hd install') else f for f in significant]
        system = 'STe' if 'STE' in (t.upper() for t in extras) else 'ST'
        if any(re.fullmatch(r'falcon (?:only|version)|f falcon', f, re.I) for f in flags):
            system = 'Falcon'
        elif any(re.search(r'\bTT\b', f) for f in flags):
            system = 'TT'
        key = [str(path.parent.relative_to(root)).casefold(), parsed['title'].casefold(),
               tags[year_at].casefold(), tags[year_at + 1].casefold(), path.suffix.lower(), total,
               sorted(t.casefold() for t in edition), sorted(f.casefold() for f in significant)]
        groups[encoded(key)].append((disk, total, relative, parsed, system, edition, flags, tags[year_at], tags[year_at + 1]))
    games = []
    for rows in groups.values():
        rows.sort(key=lambda row: row[0])
        if [r[0] for r in rows] != list(range(1, rows[0][1] + 1)):
            rejected.extend(r[2] for r in rows)
            continue
        _, total, first, parsed, system, edition, flags, year, publisher = rows[0]
        title = re.sub(r'\s+v\d[\w.\-]*(?:\s+(?:rev|r)\s*\d+)?$', '', parsed['title'], flags=re.I)
        # A trailing article can precede the version suffix in TOSEC names.
        article = re.fullmatch(r'(.+), (The|A|An)', title)
        if article:
            title = article[2] + ' ' + article[1]
        version = parsed['title'][len(re.sub(r'\s+v\d.*$', '', parsed['title'], flags=re.I)):].strip()
        games.append({'id': hashlib.sha256(first.casefold().encode()).hexdigest()[:24], 'title': title,
                      'file': first, 'disks': [r[2] for r in rows], 'system': system, 'year': year,
                      'publisher': publisher, 'languages': [v.lower() for v in parsed['languages']],
                      'countries': list(parsed['countries']), 'version': version,
                      'edition': ' / '.join(dict.fromkeys([*edition, *[f for f in flags if re.match(r'tr\s|monochrome|censored|falcon |tt ', f, re.I)]]))[:160],
                      'media_label': f'{total} disk' + ('s' if total != 1 else ''), 'status': 'Main'})
    from arcade_core.index_schema import index_document
    return index_document({'schemaVersion': 1, 'adapter': ADAPTER, 'games': games}), rejected


def read_rows(root):
    path = ConfinedRoot(Path(root)).resolve('collection-metadata.json', require_exists=True)
    value = read_object(path, 32 * 1024 * 1024)
    return validated_rows(value)


def validated_rows(value):
    from arcade_core.index_schema import index_document
    value = index_document(value)
    if value.get('schemaVersion') != 1 or value.get('adapter') != ADAPTER or not isinstance(value.get('games'), list) or len(value['games']) > 100_000:
        raise CatalogueError('review-required')
    result, seen, media = {}, set(), set()
    for row in value['games']:
        if not isinstance(row, dict) or not valid_id(row.get('id'), legacy=True) or row['id'] in seen:
            raise CatalogueError('review-required')
        seen.add(row['id'])
        disks = row.get('disks')
        if not isinstance(disks, list) or not 1 <= len(disks) <= 30:
            raise CatalogueError('review-required')
        disks = [_relative(d) for d in disks]
        if (row.get('file') != disks[0] or len(set(d.casefold() for d in disks)) != len(disks)
                or any(Path(d).suffix.lower() not in FORMATS for d in disks)
                or len({str(Path(d).parent).casefold() for d in disks}) != 1
                or any(d.casefold() in media for d in disks) or row.get('system') not in SYSTEMS):
            raise CatalogueError('review-required')
        media.update(d.casefold() for d in disks)
        metadata(row)
        result[row['id']] = {**row, 'disks': disks}
    return result


def refresh_index(root, parse_name):
    """Add newly discovered complete sets, retaining every existing record and ID."""
    from arcade_core.catalogue_identity import _writer_lock
    from arcade_core.persistence import atomic_write_json
    root = Path(root).resolve()
    path = ConfinedRoot(root).resolve('collection-metadata.json', require_exists=True)
    with _writer_lock(path):
        before = read_object(path, 32 * 1024 * 1024)
        rows = validated_rows(before)
        found, rejected = discover(root, parse_name, exclude=[d for r in rows.values() for d in r['disks']])
        from arcade_core.index_schema import index_document, assign_groups
        after = {**before, 'games': [*before['games'], *found['games']]}
        assign_groups(after['games'])
        after = index_document(after)
        validated_rows(after)
        if len(encoded(after)) > 32 * 1024 * 1024:
            raise CatalogueError('review-required')
        if found['games']:
            backup = path.with_name('collection-metadata.before-rebuild-' + hashlib.sha256(encoded(before)).hexdigest()[:16] + '.json')
            if not backup.exists():
                atomic_write_json(backup, before)
            if read_object(path, 32 * 1024 * 1024) != before:
                raise CatalogueError('entry-changed')
            atomic_write_json(path, after)
    return {'added': len(found['games']), 'rejected': rejected, 'editions': len(after['games'])}


def metadata(row):
    title = plain_text(row.get('title', ''), 160)
    if not title:
        raise CatalogueError('review-required')
    languages = text_list(row.get('languages', []), 16)
    countries = text_list(row.get('countries', []), 16)
    if any(not re.fullmatch('[a-z]{2,3}', x) for x in languages) or any(not re.fullmatch('[A-Z]{2}', x) for x in countries):
        raise CatalogueError('review-required')
    return {'title': title, 'hardwareLabel': row['system'],
            'editionLabel': plain_text(' / '.join(v for v in (row.get('version', ''), row.get('edition', ''), row.get('media_label', '')) if v)[:160], 160),
            'year': plain_text(row.get('year', ''), 16), 'publisher': plain_text(row.get('publisher', ''), 160),
            'description': plain_text(row.get('description', ''), 2000), 'languages': languages, 'countries': countries,
            'suggestedTags': text_list(row.get('tags', []), 80)}
