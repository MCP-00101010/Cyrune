"""Local ScummVM publisher/series presentation, keyed by exact engine/game ID."""

from functools import lru_cache
from pathlib import Path
import xml.etree.ElementTree as ET


METADATA_ROOT = Path(__file__).resolve().parents[1] / "data" / "scummvm-metadata"


@lru_cache(maxsize=1)
def metadata_index():
    def read(name):
        with (METADATA_ROOT / name).open('rb') as stream:
            data = stream.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or b'<!DOCTYPE' in data or b'<!ENTITY' in data:
            raise ValueError('Invalid ScummVM metadata')
        return ET.fromstring(data)

    try:
        companies = {row.get('id'): row.get('name', '')[:160] for row in read('companies.xml')}
        series = {row.get('id'): row.get('name', '')[:160] for row in read('series.xml')}
        return {(row.get('engine_id'), row.get('id')): (
            companies.get(row.get('company_id'), ''), series.get(row.get('series_id'), ''))
            for row in read('games.xml')}
    except (OSError, ValueError, ET.ParseError):
        return {}  # Optional presentation never prevents library access or launch.


def game_metadata(engine_id, game_id):
    publisher, series = metadata_index().get((engine_id, game_id), ('', ''))
    return {'publisher': publisher, 'series': series}
