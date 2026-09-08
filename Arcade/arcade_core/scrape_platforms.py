"""Explicit metadata search scope; never changes a game's native platform."""

from arcade_core.platforms import SEARCH as PLATFORMS


def platform_options(provider_type):
    return [{"id": "all", "label": "All platforms"}] if provider_type in {"screenscraper", "thegamesdb"} else []


def platform_override(provider, provider_type):
    value = provider.get("_search_platform", "current")
    if value == "current":
        return None
    if not isinstance(value, str) or value not in PLATFORMS or provider_type not in PLATFORMS[value]:
        raise ValueError("Choose a supported search platform for this provider.")
    return PLATFORMS[value][provider_type]
