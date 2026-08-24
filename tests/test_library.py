from emugui_core.library import Game, GameLibrary


def make_game(game_id="jetpac", view="collection"):
    return Game(
        id=game_id,
        title="Jetpac",
        title_key="jetpac",
        sort_title="Jetpac",
        tosec_title="Jetpac",
        memory="48K",
        system="48K",
        section="J",
        category="Games",
        type="Game",
        language="English",
        extension=".tzx",
        path="Jetpac.tzx",
        file_name="Jetpac.tzx",
        letter="J",
        view=view,
    )


def test_game_library_rebuilds_and_indexes_games_and_poks():
    game = make_game()
    pok = {"id": "pok-1", "output_path": "POKs/Jetpac.pok"}
    calls = []
    library = GameLibrary(
        init_state=lambda: calls.append("state"),
        load_favourites=lambda: {"jetpac"},
        load_poks=lambda: {("jetpac", "48K"): [pok]},
        load_games=lambda poks, favourites, progress: calls.append((poks, favourites, progress)) or [game],
        normalize_relative_path=lambda value: str(value).lower(),
        mark_import_matches=lambda games: calls.append(("matches", len(games))),
        load_metadata=lambda: {"games": [{"id": "jetpac", "poks": ["POKs/Jetpac.pok"]}]},
    )

    assert library.get_game("jetpac") is game
    assert library.get_pok("pok-1") == pok
    assert library.get_poks(game) == [pok]
    assert library.list_games()[0]["title"] == "Jetpac"
    assert calls[0] == "state"


def test_game_library_mutations_rebuild_indexes_without_transport_state():
    first = make_game()
    second = make_game("manic-miner", "incoming")
    matched = []
    library = GameLibrary(
        init_state=lambda: None,
        load_favourites=set,
        load_poks=dict,
        load_games=lambda *_args: [first],
        normalize_relative_path=str,
        mark_import_matches=lambda games: matched.append([game.id for game in games]),
        load_metadata=lambda: {"games": []},
    )

    library.replace_game("jetpac", second)
    assert library.get_game("jetpac") is None
    assert library.get_game("manic-miner") is second
    assert library.list_games("incoming")[0]["id"] == "manic-miner"
    assert matched == [["manic-miner"]]
    library.remove_game("manic-miner")
    assert library.list_games("all") == []
