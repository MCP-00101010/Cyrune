"""Checked, bounded Game Boy cartridge fingerprints for provider identification."""
import hashlib
import zlib
from pathlib import Path
from arcade_core.file_cache import FileCache
from arcade_core.paths import ConfinedRoot

_cache = FileCache(limit=4096)


def fingerprints(root, filename):
    root = Path(root)
    relative = Path(filename).relative_to(root)
    path = ConfinedRoot(root).resolve(relative, require_exists=True)
    if path.suffix.lower() not in {'.gb', '.gbc', '.gba'}:
        raise ValueError('Only cartridge files support hash lookup')

    def read(path):
        size = path.stat().st_size
        if not 0 < size <= 32 * 1024 * 1024:
            raise ValueError('Unsupported cartridge size')
        sha1, md5, crc, total = hashlib.sha1(), hashlib.md5(), 0, 0
        with path.open('rb') as stream:
            while chunk := stream.read(1024 * 1024):
                total += len(chunk)
                if total > size:
                    raise ValueError('Cartridge changed during hashing')
                sha1.update(chunk); md5.update(chunk); crc = zlib.crc32(chunk, crc)
        if total != size:
            raise ValueError('Cartridge changed during hashing')
        return {'sha1':sha1.hexdigest(), 'md5':md5.hexdigest(), 'crc':f'{crc:08X}', 'romtaille':size,
                'romnom':path.name, 'romtype':'rom'}
    return _cache.read(path, read)
