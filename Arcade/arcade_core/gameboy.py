"""One cartridge library, with GB/GBC/GBA media and metadata kept distinct."""

from copy import deepcopy
import hashlib
from pathlib import Path
import re

from arcade_core.catalogue_identity import CatalogueError, read_object, _writer_lock
from arcade_core.import_spectrum import spectrum_rows, spectrum_metadata
from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_json

ADAPTER = 'gameboy-cartridges-v1'
VARIANTS = {
    '.gb': ('GB', 'game-boy', 'GameBoy/Games'),
    '.gbc': ('GBC', 'game-boy-color', 'GameBoy Color/Games'),
    '.gba': ('GBA', 'game-boy-advance', 'GameBoy Advanced/Games'),
}
REGIONS = {'USA': ['US'], 'Europe': ['EU'], 'World': ['US', 'EU', 'JP'],
           'Germany': ['DE'], 'France': ['FR'], 'Spain': ['ES'], 'Italy': ['IT'],
           'Japan': ['JP'], 'Australia': ['AU'], 'Canada': ['CA'], 'Sweden': ['SE']}


def variant(relative):
    path = Path(relative)
    value = VARIANTS.get(path.suffix.lower())
    if value is None or not path.is_relative_to(Path(value[2])):
        raise CatalogueError('unsupported-target')
    if len(path.relative_to(value[2]).parts) < 2:
        raise CatalogueError('review-required')
    return value


def discover(root, parse_tosec, seeds=None):
    root = Path(root).resolve()
    confined = ConfinedRoot(root)
    seeds = seeds or {}
    games = []
    for extension, (system, platform, folder) in VARIANTS.items():
        directory = confined.resolve(folder, require_exists=True)
        for path in sorted(directory.rglob('*')):
            if not path.is_file() or path.suffix.lower() != extension:
                continue
            relative = path.relative_to(root).as_posix()
            confined.resolve(relative, require_exists=True)
            seed = seeds.get(relative, {})
            tosec = bool(re.search(r'\([12][0-9xX]{3}(?:-[0-9xX]{2}){0,2}\)', path.stem))
            parsed = parse_tosec(path.name) if tosec else {}
            tags = re.findall(r'\(([^)]*)\)', path.stem)
            languages = list(parsed.get('languages', []))
            countries = list(parsed.get('countries', []))
            if not tosec:
                languages = [code.upper() for tag in tags if re.fullmatch(r'[A-Z][a-z](?:,[A-Z][a-z])*', tag)
                             for code in tag.split(',')]
                countries = list(dict.fromkeys(code for tag in tags for region in tag.split(', ')
                                              for code in REGIONS.get(region, [])))
            if not languages and seed.get('language') in {'en', 'de'}:
                languages = [seed['language'].upper()]
            if not languages and any(code in countries for code in ('US', 'AU')):
                languages = ['EN']
            if not languages and len(countries) == 1 and countries[0] in {'DE', 'FR', 'ES', 'IT', 'JP', 'SE'}:
                languages = [{'JP': 'JA', 'SE': 'SV'}.get(countries[0], countries[0])]
            title = seed.get('title') or parsed.get('title') or re.split(r'\s*\(', path.stem)[0].strip()
            game = {key: parsed.get(key, '') for key in ('publisher', 'version', 'copyright_status', 'development_status')}
            game.update(id=hashlib.sha256(('gameboy:' + relative.casefold()).encode()).hexdigest()[:32],
                        file=relative, format=extension, title=title, type='Game Boy', section='Game Boy',
                        system=system, memory=system, platform=platform, tags=[system], status='Main',
                        languages=languages, countries=countries, date=parsed.get('date', parsed.get('year', '')),
                        naming_convention='tosec' if tosec else 'no-intro', poks=[])
            games.append(game)
    if len(games) > 10000:
        raise CatalogueError('review-required')
    from arcade_core.index_schema import index_document
    return index_document({'version': 1, 'adapter': ADAPTER, 'games': games, 'poks': []})


def read_rows(root):
    path = ConfinedRoot(Path(root)).resolve('collection-metadata.json', require_exists=True)
    document = read_object(path, 32 * 1024 * 1024)
    if document.get('adapter') != ADAPTER:
        raise CatalogueError('review-required')
    result = {}
    for legacy, relative, original in spectrum_rows(document):
        system, platform, _ = variant(relative)
        row = deepcopy(original)
        row.update(system=system, memory=system, platform=platform, type='Game Boy', section='Game Boy')
        row['tags'] = list(dict.fromkeys([system, *row.get('tags', [])]))
        result[legacy] = row
    return result


def metadata(row):
    # Reuse bounded text/language projection without Spectrum hardware inference.
    values = spectrum_metadata({**row, 'system': '', 'memory': ''})
    values['hardwareLabel'] = row['system']
    return values


def refresh_index(root, parse_tosec):
    root = Path(root).resolve()
    target = ConfinedRoot(root).resolve('collection-metadata.json')
    with _writer_lock(target):
        from arcade_core.index_schema import index_document, assign_groups
        original = read_object(target, 32 * 1024 * 1024)
        old = index_document(original)
        read_rows(root)
        found = discover(root, parse_tosec)
        # Existing IDs, scraped values, protection and launch pins survive rescans.
        paths = {row['file'].replace('\\', '/').casefold() for row in old['games']}
        additions = [row for row in found['games'] if row['file'].casefold() not in paths]
        for row in additions:
            row.pop('metadata_group_id', None)
        old['games'].extend(additions)
        assign_groups(old['games'])
        if additions or original != old:
            atomic_write_json(target, old)
        return len(additions)
