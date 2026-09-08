"""Resolve only an exact record's existing artwork; never acquire remote media."""
from pathlib import Path
from arcade_core.artwork_cache import ArtworkCache
from arcade_core.paths import ConfinedRoot
from arcade_core.screenscraper import artwork_parts


def location(root, runtime, reference):
    if artwork_parts(reference):
        if runtime is None:
            raise ValueError('Artwork is not cached')
        cache = ArtworkCache(Path(runtime))
        path = cache.path(reference)
        return Path(runtime).resolve(), path
    return Path(root).resolve(), ConfinedRoot(root).resolve(reference, require_exists=True)


def target(root, runtime, item):
    for reference in (item.get('loading_screen'), item.get('screenshot')):
        if not isinstance(reference, str) or not reference:
            continue
        if runtime is not None and artwork_parts(reference):
            # The public provider identity is stable even while its disposable
            # cache file is absent/replaced. Resolve the file revision at read time.
            return reference, ()
        try:
            _, path = location(root, runtime, reference)
            stat = path.stat()
            if path.suffix.lower() != '.png' or not 0 < stat.st_size <= 4 * 1024 * 1024:
                continue
            return reference, (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)
        except (OSError, ValueError):
            continue
    return None
