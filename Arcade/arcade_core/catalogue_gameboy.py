"""Private cartridge catalogue for Arcade families and source-scoped shortcuts."""

from arcade_core.catalogue_spectrum import SpectrumSource
from arcade_core.gameboy import VARIANTS, metadata, read_rows
from arcade_core.shared_metadata import shared_rows


def effective_rows(collection):
    rows = shared_rows(list(read_rows(collection['root']).values()))
    defaults = collection.get('variant_emulators', {})
    for row in rows:
        row['default_emulator'] = row.get('default_emulator') or defaults.get(row['system']) or collection.get('default_emulator', '')
    return rows


class GameBoySource(SpectrumSource):
    media_formats = frozenset(VARIANTS)
    platform_id = 'game-boy'
    platform_label = 'Game Boy'

    def __init__(self, collection):
        super().__init__(collection['id'], collection['root'], None, browse=True)
        self.collection = collection

    def _rows(self):
        return [(row['id'], row['file'], row) for row in effective_rows(self.collection)]

    def project_metadata(self, item):
        return metadata(item)
