"""Compatibility entry point for hosts installed before the Arcade rename.

New integrations should load :mod:`arcade_service`.  Attribute access is
forwarded instead of copied so mutable runtime values such as ``COLLECTION``
continue to reflect the canonical module.
"""

from __future__ import annotations

import arcade_service as _arcade_service


def __getattr__(name: str):
    return getattr(_arcade_service, name)


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(dir(_arcade_service)))
