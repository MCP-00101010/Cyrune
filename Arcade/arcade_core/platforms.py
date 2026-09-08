"""Declarative platform presentation and capabilities; unknown adapters fail closed."""
import json
from pathlib import Path

DEFINITIONS = json.loads((Path(__file__).parents[1] / 'data/platforms.json').read_text(encoding='utf-8'))
LIBRARIES = DEFINITIONS['libraries']
SEARCH = DEFINITIONS['search']


def collection_platform(collection):
    explicit = collection.get('platform_id')
    if explicit:
        return explicit if explicit in LIBRARIES else ''
    adapter = collection.get('adapter', '')
    return next((key for key, value in LIBRARIES.items() if adapter in value['adapters']), '')


def game_platform(game):
    kind = getattr(game, 'type', '')
    known = next((key for key, value in LIBRARIES.items() if kind in value['types']), '')
    if known:
        return known
    if getattr(game, 'system', '') in {'16K', '48K', '128K', '48K-128K', '+2', '+2A', '+3'}:
        return 'zx-spectrum'
    return ''


def provider_platform(game, provider_type, provider):
    key = game_platform(game)
    if not key:
        raise ValueError('This platform does not support metadata searches yet.')
    if LIBRARIES[key]['metadataScope'] == 'version':
        return SEARCH.get(getattr(game, 'platform', ''), {}).get(provider_type, '')
    if key == 'game-boy':
        variant = getattr(game, 'platform', '')
        if variant not in {'game-boy', 'game-boy-color', 'game-boy-advance'}:
            raise ValueError('Unknown Game Boy cartridge variant.')
        return SEARCH[variant].get(provider_type, '')
    default = SEARCH[key].get(provider_type, '')
    if key == 'zx-spectrum':
        configured = str(provider.get('system_id' if provider_type == 'screenscraper' else 'platform_id') or default).strip()
        return default if provider_type == 'screenscraper' and configured == '135' else configured
    return default
