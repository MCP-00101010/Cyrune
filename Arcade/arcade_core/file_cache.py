"""Bounded parse caching; targets remain real-path checked on every use."""
from collections import OrderedDict
from copy import deepcopy
from threading import RLock


class FileCache:
    def __init__(self, limit=8192):
        self.entries = OrderedDict()
        self.limit = limit
        self.lock = RLock()

    def read(self, path, parse):
        path = path.resolve(strict=True)
        before = path.stat()
        signature = (str(path), before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
        with self.lock:
            cached = self.entries.pop(str(path), None)
            if cached and cached[0] == signature:
                self.entries[str(path)] = cached
                return deepcopy(cached[1])
        result = parse(path)
        after = path.stat()
        if signature != (str(path), after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
            raise ValueError('The file changed while it was being read. Retry the operation.')
        with self.lock:
            self.entries[str(path)] = (signature, deepcopy(result))
            while len(self.entries) > self.limit:
                self.entries.popitem(last=False)
        return result
