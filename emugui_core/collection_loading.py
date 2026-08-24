"""Transport-independent collection loading orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from .library import Game


def import_match_summary(game: Game) -> dict[str, object]:
    return {
        "title": game.title,
        "system": game.system,
        "publisher": game.publisher,
        "countries": list(game.countries),
        "languages": list(game.languages),
    }


def mark_import_view_matches(games: list[Game]) -> None:
    collection_games = [game for game in games if game.view not in {"incoming", "trash"}]
    title_counts: dict[str, int] = {}
    title_system_counts: dict[tuple[str, str], int] = {}
    title_matches: dict[str, list[Game]] = {}
    for game in collection_games:
        title_counts[game.title_key] = title_counts.get(game.title_key, 0) + 1
        title_system_counts[(game.title_key, game.system)] = title_system_counts.get((game.title_key, game.system), 0) + 1
        title_matches.setdefault(game.title_key, []).append(game)
    for game in games:
        if game.view not in {"incoming", "trash"}:
            continue
        title_count = title_counts.get(game.title_key, 0)
        system_count = title_system_counts.get((game.title_key, game.system), 0)
        game.import_match_count = title_count
        game.import_system_match_count = system_count
        game.import_matches = tuple(import_match_summary(match) for match in title_matches.get(game.title_key, [])[:8])
        game.import_status = "system-match" if system_count else ("title-match" if title_count else "new")


class CollectionLoader:
    """Combine metadata and scanner adapters into one indexed collection."""

    def __init__(
        self,
        *,
        metadata_path: Callable[[], Path],
        load_metadata_games: Callable[..., list[Game]],
        load_incoming_games: Callable[..., list[Game]],
        load_trash_games: Callable[..., list[Game]],
        load_official_games: Callable[..., list[Game]],
        load_homebrew_games: Callable[..., list[Game]],
        load_scanned_games: Callable[..., list[Game]],
        load_language_review_games: Callable[..., list[Game]],
        auto_metadata_enabled: Callable[[], bool],
        save_metadata_from_games: Callable[..., None],
    ) -> None:
        self._metadata_path = metadata_path
        self._load_metadata_games = load_metadata_games
        self._load_incoming_games = load_incoming_games
        self._load_trash_games = load_trash_games
        self._load_official_games = load_official_games
        self._load_homebrew_games = load_homebrew_games
        self._load_scanned_games = load_scanned_games
        self._load_language_review_games = load_language_review_games
        self._auto_metadata_enabled = auto_metadata_enabled
        self._save_metadata_from_games = save_metadata_from_games

    def load(self, poks: dict[tuple[str, str], list[dict[str, str]]], favourites: set[str], progress=None) -> list[Game]:
        if self._metadata_path().exists():
            if progress:
                progress("indexing", 0, 0, "Loading metadata")
            games = self._load_metadata_games(poks, favourites)
            games.extend(self._load_incoming_games(poks, favourites))
            games.extend(self._load_trash_games(poks, favourites))
            mark_import_view_matches(games)
            games.sort(key=lambda item: (item.view != "incoming", item.title_key, item.system, item.section, item.file_name.lower()))
            return games

        games: list[Game] = []
        reported_paths: set[str] = set()
        games.extend(self._load_official_games(poks, favourites, reported_paths))
        games.extend(self._load_homebrew_games(poks, favourites, reported_paths))
        games.extend(self._load_scanned_games(poks, favourites, reported_paths, progress))
        games.extend(self._load_language_review_games(poks, favourites))
        games.sort(key=lambda item: (item.title_key, item.system, item.section, item.file_name.lower()))
        if self._auto_metadata_enabled():
            self._save_metadata_from_games(games, poks)
        games.extend(self._load_incoming_games(poks, favourites))
        games.extend(self._load_trash_games(poks, favourites))
        mark_import_view_matches(games)
        return games
