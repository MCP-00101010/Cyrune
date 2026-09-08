"""Bounded warm library snapshots, validated before changing the active view."""
from collections import OrderedDict
from pathlib import Path


def stamp(path):
    try:
        resolved = Path(path).resolve()
        value = resolved.stat()
        return (str(resolved), value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
    except (OSError, ValueError):
        return None


class CollectionCache:
    def __init__(self, max_entries=4, max_games=60000):
        self.entries = OrderedDict()
        self.max_entries, self.max_games = max_entries, max_games

    def put(self, key, library, paths):
        paths = tuple(dict.fromkeys(str(path) for path in paths))
        if len(paths) > 20000 or len(library.games) > self.max_games:
            return
        self.entries.pop(key, None)
        self.entries[key] = (library, paths, tuple(stamp(path) for path in paths))
        while len(self.entries) > self.max_entries or sum(len(row[0].games) for row in self.entries.values()) > self.max_games:
            self.entries.popitem(last=False)

    def get(self, key):
        value = self.entries.pop(key, None)
        if value is None:
            return None
        library, paths, observed = value
        if tuple(stamp(path) for path in paths) != observed:
            return None
        self.entries[key] = value
        return library

    def invalidate(self, key):
        self.entries.pop(key, None)
