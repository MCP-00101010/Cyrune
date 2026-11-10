"""Atari menu-image discovery. Each image is an explicit, single-drive boot choice."""
from collections import Counter
import hashlib
from pathlib import Path
import re

from arcade_core.catalogue_identity import CatalogueError
from arcade_core.index_schema import index_document
from arcade_core.paths import ConfinedRoot
from arcade_core.tosec import parse_tosec_name

KIND = 'atari-compilations-v1'
GROUPS = {'debug': 'D-Bug', 'd-bug': 'D-Bug', 'automation': 'Automation',
          'medway boys': 'Medway Boys', 'supergau user disks': 'SuperGAU',
          'sewer doc disks': 'Sewersoft'}
SHORT_NAMES = ((r'A_(\d+)(?:_([A-Z0-9]+))?', 'Automation', 'Automation Menu'),
               (r'DBUG(\d+)([A-Z]?)', 'D-Bug', 'D-Bug Menu'),
               (r'med_(\d+)([A-Z]?)', 'Medway Boys', 'Medway Boys Menu'))
FIELDS = {'group', 'series', 'number', 'part', 'condition'}
CONDITIONS = {'Unverified', 'Marked bad', 'Corrupt menu'}
SCRAPE_ERROR = 'Compilation menus use their own catalogue metadata; game scraping is disabled.'


def identify(path, root):
    relative = path.relative_to(root)
    parsed = parse_tosec_name(path.name)
    group = relative.parts[0] if len(relative.parts) > 1 else ''
    group = GROUPS.get(group.casefold(), group)
    series, number, part, revision = '', '', '', ''
    for pattern, expected_group, label in SHORT_NAMES:
        match = re.fullmatch(pattern, path.stem, re.I)
        if match and (not group or group == expected_group):
            group, series, number, part = expected_group, label, match[1], match[2] or ''
            break
    if not series:
        match = re.fullmatch(r'(.+?)\s+(\d+)(?:\s+(v[\w.\-]+|bis))?', parsed['tosec_title'], re.I)
        if not match:
            return None
        series, number, revision = match[1], match[2], match[3] or ''
        group = group or parsed['publisher']
        if not group:
            return None
    flags = list(parsed['brackets'])
    parts = [tag for tag in parsed['parentheses'] if re.match(r'(?:Disk\s|Part\s)', tag, re.I)]
    part = ' / '.join(filter(None, [f'Part {part.upper()}' if part else '', *parts]))
    condition = ('Corrupt menu' if any('corrupt menu' in tag.casefold() for tag in flags) else
                 'Marked bad' if any(re.fullmatch(r'b\d*(?:\s.*)?', tag, re.I) for tag in flags) else 'Unverified')
    return parsed, {'group': group, 'series': series, 'number': str(int(number)),
                    'part': part, 'condition': condition}, revision


def validate(row):
    value = row.get('compilation')
    if (not isinstance(value, dict) or set(value) != FIELDS or
            any(not isinstance(v, str) or len(v) > 160 or re.search(r'[\x00-\x1f]', v) for v in value.values()) or
            not value['group'] or not value['series'] or not re.fullmatch(r'\d{1,6}', value['number']) or
            value['condition'] not in CONDITIONS or len(row.get('disks', [])) != 1):
        raise CatalogueError('review-required')
    return value


def preference(row):
    """Prefer an unmarked original and an earlier part; never change a saved default."""
    value = row.get('compilation')
    if not value:
        return ()
    alternate = any(re.match(r'a\d*(?:\s|$)', tag, re.I) for tag in row.get('flags', []))
    part = re.sub(r'\d+', lambda m: m[0].zfill(6), value['part'].casefold())
    return (value['condition'] != 'Unverified', alternate, part, row['file'].casefold())


def discover(root, *, exclude=()):
    root = Path(root).resolve()
    confined = ConfinedRoot(root)
    excluded = {p.casefold() for p in exclude}
    games, rejected = [], []
    paths = sorted(root.rglob('*'), key=lambda p: str(p).casefold())
    if len(paths) > 100000:
        raise CatalogueError('review-required')
    for path in paths:
        relative = path.relative_to(root).as_posix()
        if (path.suffix.lower() not in {'.st', '.msa', '.stx', '.dim', '.stt'} or
                relative.casefold() in excluded or any(part.startswith('.') or part.casefold() == 'safe disks'
                                                       for part in Path(relative).parts)):
            continue
        checked = confined.resolve(relative, require_exists=True)
        if not checked.is_file():
            continue
        found = identify(path, root)
        if found is None:
            rejected.append(relative)
            continue
        parsed, compilation, revision = found
        title = f"{compilation['series']} {compilation['number']}"
        flags = list(parsed['brackets'])
        edition = ' / '.join(filter(None, [compilation['part'], *[f'[{flag}]' for flag in flags]]))
        row = {'id': hashlib.sha256(relative.casefold().encode()).hexdigest()[:24],
               'title': title, 'file': relative, 'disks': [relative], 'system': 'ST',
               'year': parsed['year'] if 'x' not in parsed['year'].lower() else '',
               'publisher': compilation['group'], 'series': compilation['series'],
               'languages': [v.lower() for v in parsed['languages']], 'countries': list(parsed['countries']),
               'version': revision, 'edition': edition[:160], 'media_label': compilation['condition'],
               'flags': flags, 'tosec_tags': list(parsed['parentheses']),
               'tags': ['Compilation', compilation['condition']], 'status': 'Main', 'compilation': compilation}
        validate(row)
        games.append(row)
    games.sort(key=lambda row: (row['title'].casefold(), preference(row)))
    return index_document({'schemaVersion': 1, 'adapter': 'atari-st-disks-v1',
                           'collectionKind': KIND, 'games': games}), rejected


def inventory(document, rejected):
    rows = document['games']
    return {'images': len(rows), 'compilations': len({row['title'].casefold() for row in rows}),
            'groups': dict(Counter(row['compilation']['group'] for row in rows)),
            'conditions': dict(Counter(row['compilation']['condition'] for row in rows)),
            'unrecognized': rejected}
