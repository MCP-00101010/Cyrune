"""Disposable, bounded native PNG cache keyed only by public artwork references."""

import hashlib
import re
import threading
import time

from arcade_core.paths import ConfinedRoot
from arcade_core.persistence import atomic_write_bytes

PNG = b'\x89PNG\r\n\x1a\n'
CACHE_LOCK = threading.Lock()


class ArtworkCache:
    def __init__(self, runtime, *, max_bytes=128 * 1024 * 1024, max_entries=2048, max_age=30 * 86400):
        self.root = ConfinedRoot(runtime)
        self.max_bytes, self.max_entries, self.max_age = max_bytes, max_entries, max_age

    def path(self, reference):
        key = hashlib.sha256(('png-1000-v1:' + reference).encode()).hexdigest()
        return self.root.resolve('scraper-cache/' + key + '.png')

    def read(self, reference, limit):
        try:
            path = self.path(reference)
            if time.time() - path.stat().st_mtime > self.max_age:
                return None
            with path.open('rb') as stream:
                raw = stream.read(limit + 1)
            return raw if raw.startswith(PNG) and len(raw) <= limit else None
        except (OSError, ValueError):
            return None

    def write(self, reference, raw):
        if not raw.startswith(PNG) or len(raw) > min(self.max_bytes, 4 * 1024 * 1024):
            return
        try:
            with CACHE_LOCK:
                path = self.path(reference)
                atomic_write_bytes(path, raw)
                entries = []
                for child in path.parent.iterdir():
                    if not re.fullmatch(r'[0-9a-f]{64}\.png', child.name) or child.is_symlink():
                        continue
                    checked = self.root.resolve('scraper-cache/' + child.name)
                    stat = checked.stat()
                    entries.append((stat.st_mtime, stat.st_size, checked))
                size = sum(entry[1] for entry in entries)
                count = len(entries)
                for modified, length, child in sorted(entries):
                    if count <= self.max_entries and size <= self.max_bytes and time.time() - modified <= self.max_age:
                        break
                    child.unlink(missing_ok=True)
                    size -= length
                    count -= 1
        except (OSError, ValueError):
            # A cache failure must not turn a successful image download into an error.
            pass
