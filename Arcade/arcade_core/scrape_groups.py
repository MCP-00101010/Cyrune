"""Native scrape scope: one game folder, or one exact ScummVM registration."""

from pathlib import Path

from arcade_core.paths import relative_to_root
from arcade_core.platforms import LIBRARIES, game_platform

MAX_SCRAPE_TARGETS = 1000


def folder_members(library, root, game):
    if game.view != 'collection':
        raise ValueError('Only collection games can be scraped.')
    platform = game_platform(game)
    if not platform:
        raise ValueError('This platform does not support metadata searches yet.')
    if LIBRARIES[platform]['metadataScope'] == 'version':
        return [game]
    anchor = Path(game.path)
    folder = relative_to_root(Path(root), anchor).parent
    # Library paths were resolved by the native loader. Compare their parents
    # first, then revalidate only this folder instead of resolving the whole
    # collection for every provider request.
    members = [row for row in library.games if row.view == 'collection' and game_platform(row) == platform
               and Path(row.path).parent == anchor.parent]
    key = game.metadata_group_id
    members = [row for row in members if row.id == game.id or key and row.metadata_group_id == key]
    if any(relative_to_root(Path(root), Path(row.path)).parent != folder for row in members):
        raise ValueError('The game folder changed. Re-index before scraping.')
    if not members or len(members) > MAX_SCRAPE_TARGETS:
        raise ValueError('This game folder exceeds the supported scrape size.')
    return members
