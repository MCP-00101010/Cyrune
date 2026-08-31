"""Bounded service contracts shared by Cyrune Arcade transports."""

from __future__ import annotations

import re
from dataclasses import asdict, is_dataclass
from typing import Callable


MAX_QUERY_LENGTH = 160
MAX_PAGE_SIZE = 250
MAX_OFFSET = 1_000_000
GAME_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,120}$")
VIEW_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")


class ServiceContractError(ValueError):
    """Raised when an RPC request falls outside the public service contract."""


def _record(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return dict(value)
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    raise ServiceContractError("Game data is unavailable")


def _bounded_integer(value: object, default: int, minimum: int, maximum: int, label: str) -> int:
    if value in (None, ""):
        return default
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ServiceContractError(f"{label} must be an integer") from exc
    if number < minimum or number > maximum:
        raise ServiceContractError(f"{label} is outside the supported range")
    return number


def _search_text(game: dict[str, object]) -> str:
    values: list[str] = []
    for key in ("title", "title_key", "publisher", "year", "system", "memory", "file_name"):
        values.append(str(game.get(key, "") or ""))
    for key in ("tags", "hardware", "languages", "countries"):
        value = game.get(key, ())
        if isinstance(value, (list, tuple, set)):
            values.extend(str(item) for item in value)
    return " ".join(values).casefold()


class ReadOnlyArcadeService:
    """Transport-neutral, bounded reads over the current Cyrune Arcade runtime."""

    def __init__(
        self,
        library_provider: Callable[[], object],
        collections_provider: Callable[[], dict[str, object]],
        emulators_provider: Callable[[], list[dict[str, object]]],
        profiles_provider: Callable[[], list[dict[str, object]]],
    ) -> None:
        self._library_provider = library_provider
        self._collections_provider = collections_provider
        self._emulators_provider = emulators_provider
        self._profiles_provider = profiles_provider

    def status(self) -> dict[str, object]:
        collections = self._collections_provider()
        return {
            "serviceVersion": 1,
            "active": collections.get("active"),
            "collections": collections.get("collections", []),
            "emulators": self._emulators_provider(),
            "profiles": self._profiles_provider(),
        }

    def search_games(self, params: object = None) -> dict[str, object]:
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise ServiceContractError("Search parameters must be an object")
        view = str(params.get("view", "all") or "all").strip()
        if not VIEW_PATTERN.fullmatch(view):
            raise ServiceContractError("View is invalid")
        query = str(params.get("query", "") or "").strip()
        if len(query) > MAX_QUERY_LENGTH:
            raise ServiceContractError("Search query is too long")
        offset = _bounded_integer(params.get("offset"), 0, 0, MAX_OFFSET, "Offset")
        limit = _bounded_integer(params.get("limit"), 100, 1, MAX_PAGE_SIZE, "Limit")

        games = [_record(game) for game in self._library_provider().list_games(view)]
        terms = [term for term in query.casefold().split() if term]
        if terms:
            games = [game for game in games if all(term in _search_text(game) for term in terms)]
        total = len(games)
        page = games[offset:offset + limit]
        return {
            "games": page,
            "page": {
                "offset": offset,
                "limit": limit,
                "returned": len(page),
                "total": total,
                "hasMore": offset + len(page) < total,
            },
        }

    def get_game(self, params: object = None) -> dict[str, object]:
        if not isinstance(params, dict):
            raise ServiceContractError("Game parameters must be an object")
        game_id = str(params.get("gameId", "") or "").strip()
        if not GAME_ID_PATTERN.fullmatch(game_id):
            raise ServiceContractError("Game ID is invalid")
        game = self._library_provider().get_game(game_id)
        if game is None:
            raise ServiceContractError("Unknown game")
        return {"game": _record(game)}

    def dispatch(self, method: object, params: object = None) -> dict[str, object]:
        name = str(method or "").strip().upper()
        if name == "STATUS":
            return self.status()
        if name == "SEARCH_GAMES":
            return self.search_games(params)
        if name == "GET_GAME":
            return self.get_game(params)
        raise ServiceContractError("Unsupported Cyrune Arcade read operation")
