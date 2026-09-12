"""Explicit collection ownership for the interactive API's current routes."""

READ_ROUTES = frozenset('/api/' + name for name in (
    'games', 'game', 'game-versions', 'poks', 'recent',
))
WRITE_ROUTES = frozenset('/api/' + name for name in (
    'scrape-targets', 'scrape-preview', 'apply-scrape', 'metadata-care', 'update-metadata',
    'favourite', 'favourites-bulk', 'game-version-default', 'launch', 'open-pok', 'open-explorer',
    'rename', 'metadata-preview', 'metadata-undo', 'delete', 'delete-bulk', 'import-incoming',
    'import-incoming-bulk', 'restore-trash', 'purge-trash', 'move-language', 'rebuild',
))


def scoped(method, route):
    return route in (READ_ROUTES if method == 'GET' else WRITE_ROUTES)


def validate(identifier, active):
    if not isinstance(identifier, str) or not identifier or len(identifier) > 120 or identifier != active['id']:
        raise ValueError('The collection changed. Reload the current library before continuing.')
