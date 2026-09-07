"""Request-local memoization, used only inside a checked read-only native lease."""

from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps

_CACHE = ContextVar("catalogue_read_cache", default=None)


def snapshot_cached(method):
    @wraps(method)
    def read(self):
        cache = _CACHE.get()
        if cache is None:
            return method(self)
        key = (method, self)
        if key not in cache:
            cache[key] = method(self)
        return cache[key]
    return read


@contextmanager
def read_cache():
    token = _CACHE.set({})
    try:
        yield
    finally:
        _CACHE.reset(token)
