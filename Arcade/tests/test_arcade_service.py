from dataclasses import dataclass
import unittest

from arcade_core.service import MAX_PAGE_SIZE, ReadOnlyArcadeService, ServiceContractError


@dataclass
class GameRecord:
    id: str
    title: str
    publisher: str
    year: str
    system: str
    tags: tuple[str, ...]


class FakeLibrary:
    def __init__(self):
        self.games = [
            GameRecord("jetpac", "Jetpac", "Ultimate", "1983", "48K", ("Arcade",)),
            GameRecord("dizzy", "Fantasy World Dizzy", "Codemasters", "1989", "128K", ("Adventure",)),
            GameRecord("atic-atac", "Atic Atac", "Ultimate", "1983", "48K", ("Arcade",)),
        ]

    def list_games(self, view):
        return list(self.games) if view in {"all", "collection"} else []

    def get_game(self, game_id):
        return next((game for game in self.games if game.id == game_id), None)


def service():
    library = FakeLibrary()
    return ReadOnlyArcadeService(
        lambda: library,
        lambda: {"active": {"id": "spectrum"}, "collections": [{"id": "spectrum"}]},
        lambda: [{"id": "eightyone", "available": True}],
        lambda: [{"id": "eightyone-48k", "emulator_id": "eightyone"}],
    )


class ArcadeServiceTests(unittest.TestCase):
    def test_status_uses_public_runtime_providers(self):
        result = service().dispatch("STATUS")
        self.assertEqual(result["serviceVersion"], 1)
        self.assertEqual(result["active"]["id"], "spectrum")
        self.assertEqual(result["emulators"][0]["id"], "eightyone")

    def test_search_is_tokenized_paginated_and_case_insensitive(self):
        result = service().dispatch("SEARCH_GAMES", {"query": "ultimate 48k", "offset": 1, "limit": 1})
        self.assertEqual([game["id"] for game in result["games"]], ["atic-atac"])
        self.assertEqual(result["page"], {"offset": 1, "limit": 1, "returned": 1, "total": 2, "hasMore": False})

    def test_get_game_accepts_dataclass_records(self):
        result = service().dispatch("GET_GAME", {"gameId": "jetpac"})
        self.assertEqual(result["game"]["title"], "Jetpac")

    def test_contract_rejects_unbounded_or_unknown_requests(self):
        with self.assertRaisesRegex(ServiceContractError, "outside the supported range"):
            service().dispatch("SEARCH_GAMES", {"limit": MAX_PAGE_SIZE + 1})
        with self.assertRaisesRegex(ServiceContractError, "Game ID is invalid"):
            service().dispatch("GET_GAME", {"gameId": "../outside"})
        with self.assertRaisesRegex(ServiceContractError, "Unsupported"):
            service().dispatch("DELETE_GAME", {})


if __name__ == "__main__":
    unittest.main()
