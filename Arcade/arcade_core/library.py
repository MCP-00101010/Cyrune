"""Transport-independent in-memory game library model."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import threading
from typing import Callable


GAME_SUMMARY_FIELDS = (
    "id", "title", "title_key", "sort_title", "memory", "system", "section", "category", "type",
    "language", "extension", "file_name", "letter", "view", "year", "publisher", "languages", "countries",
    "tosec_tags", "flags", "tags", "hardware", "default_emulator", "emulator_profile", "has_poks", "pok_count",
    "favourite", "is_ulaplus", "import_status", "import_match_count", "import_system_match_count", "import_matches",
)


@dataclass
class Game:
    id: str
    title: str
    title_key: str
    sort_title: str
    tosec_title: str
    memory: str
    system: str
    section: str
    category: str
    type: str
    language: str
    extension: str
    path: str
    file_name: str
    letter: str
    view: str = "collection"
    year: str = ""
    publisher: str = ""
    version: str = ""
    demo: str = ""
    video: str = ""
    copyright_status: str = ""
    development_status: str = ""
    media_type: str = ""
    media_label: str = ""
    genre: str = ""
    developer: str = ""
    platform: str = ""
    region: str = ""
    players: str = ""
    coop: str = ""
    rating: str = ""
    youtube_id: str = ""
    description: str = ""
    screenshot: str = ""
    loading_screen: str = ""
    scraper_source: str = ""
    scraper_id: str = ""
    languages: tuple[str, ...] = ()
    countries: tuple[str, ...] = ()
    tosec_tags: tuple[str, ...] = ()
    flags: tuple[str, ...] = ()
    dump_flags: tuple[str, ...] = ()
    more_info: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    hardware: tuple[str, ...] = ()
    default_emulator: str = ""
    emulator_profile: str = ""
    has_poks: bool = False
    pok_count: int = 0
    favourite: bool = False
    is_ulaplus: bool = False
    import_status: str = ""
    import_match_count: int = 0
    import_system_match_count: int = 0
    import_matches: tuple[dict[str, object], ...] = ()


class GameLibrary:
    """Own the indexed game/POK state independently of any transport."""

    def __init__(
        self,
        *,
        init_state: Callable[[], None],
        load_favourites: Callable[[], set[str]],
        load_poks: Callable[[], dict[tuple[str, str], list[dict[str, str]]]],
        load_games: Callable[..., list[Game]],
        normalize_relative_path: Callable[[object], str],
        mark_import_matches: Callable[[list[Game]], None],
        load_metadata: Callable[[], dict[str, object]],
    ) -> None:
        self._lock = threading.Lock()
        self._init_state = init_state
        self._load_favourites = load_favourites
        self._load_poks = load_poks
        self._load_games = load_games
        self._normalize_relative_path = normalize_relative_path
        self._mark_import_matches = mark_import_matches
        self._load_metadata = load_metadata
        self.games: list[Game] = []
        self.game_by_id: dict[str, Game] = {}
        self.poks_by_title_memory: dict[tuple[str, str], list[dict[str, str]]] = {}
        self.poks_by_file: dict[str, dict[str, str]] = {}
        self.poks_by_game_id: dict[str, list[dict[str, str]]] = {}
        self.pok_by_id: dict[str, dict[str, str]] = {}
        self.rebuild()

    def rebuild(self, progress=None) -> None:
        with self._lock:
            self._init_state()
            favourites = self._load_favourites()
            poks = self._load_poks()
            games = self._load_games(poks, favourites, progress)
            self.games = games
            self.game_by_id = {game.id: game for game in games}
            self.poks_by_title_memory = poks
            self.poks_by_file = {
                self._normalize_relative_path(pok.get("output_path", "")): pok
                for rows in poks.values()
                for pok in rows
            }
            self.poks_by_game_id = self.build_game_pok_links(games)
            self.pok_by_id = {pok["id"]: pok for rows in poks.values() for pok in rows}

    def list_games(self, view: str = "collection") -> list[dict[str, object]]:
        with self._lock:
            if view == "all":
                return [asdict(game) for game in self.games]
            return [asdict(game) for game in self.games if game.view == view]

    def list_game_summaries(self, view: str = "collection") -> list[dict[str, object]]:
        with self._lock:
            selected = self.games if view == "all" else (game for game in self.games if game.view == view)
            return [{key: getattr(game, key) for key in GAME_SUMMARY_FIELDS} for game in selected]

    def get_game(self, game_id: str) -> Game | None:
        with self._lock:
            return self.game_by_id.get(game_id)

    def get_poks(self, game: Game) -> list[dict[str, str]]:
        with self._lock:
            linked = self.poks_by_game_id.get(game.id, [])
            if linked:
                return list(linked)
            return list(self.poks_by_title_memory.get((game.title_key, game.memory), []))

    def get_pok(self, pok_id: str) -> dict[str, str] | None:
        with self._lock:
            return self.pok_by_id.get(pok_id)

    def set_favourite(self, game_id: str, favourite: bool) -> Game | None:
        with self._lock:
            game = self.game_by_id.get(game_id)
            if game:
                game.favourite = favourite
            return game

    def set_favourites(self, game_ids: list[str], favourite: bool) -> list[str]:
        with self._lock:
            updated = []
            for game_id in game_ids:
                game = self.game_by_id.get(game_id)
                if game:
                    game.favourite = favourite
                    updated.append(game_id)
            return updated

    def remove_game(self, game_id: str) -> None:
        with self._lock:
            self.games = [game for game in self.games if game.id != game_id]
            self.game_by_id.pop(game_id, None)
            self.poks_by_game_id.pop(game_id, None)

    def replace_game(self, game_id: str, replacement: Game | None = None) -> None:
        with self._lock:
            self.games = [game for game in self.games if game.id != game_id]
            if replacement:
                self.games.append(replacement)
            self._mark_import_matches(self.games)
            self.game_by_id = {game.id: game for game in self.games}
            self.poks_by_game_id = self.build_game_pok_links(self.games)

    def build_game_pok_links(self, games: list[Game]) -> dict[str, list[dict[str, str]]]:
        links: dict[str, list[dict[str, str]]] = {}
        metadata = self._load_metadata()
        linked_paths_by_game_id = {
            str(item.get("id", "")): [self._normalize_relative_path(path) for path in item.get("poks", []) if path]
            for item in metadata.get("games", [])
        }
        for game in games:
            poks = []
            seen: set[str] = set()
            for rel_path in linked_paths_by_game_id.get(game.id, []):
                pok = self.poks_by_file.get(rel_path)
                if pok and pok["id"] not in seen:
                    poks.append(pok)
                    seen.add(pok["id"])
            if poks:
                links[game.id] = poks
        return links
