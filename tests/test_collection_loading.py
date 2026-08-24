from pathlib import Path

from emugui_core.collection_loading import CollectionLoader, mark_import_view_matches
from emugui_core.library import Game


def game(game_id, title_key, system, view="collection"):
    return Game(
        id=game_id, title=title_key.title(), title_key=title_key, sort_title=title_key, tosec_title=title_key,
        memory=system, system=system, section="Games", category="", type="Game", language="English",
        extension=".tzx", path=f"{game_id}.tzx", file_name=f"{game_id}.tzx", letter=title_key[0].upper(), view=view,
    )


def test_metadata_collection_loading_merges_transient_views_and_marks_matches(tmp_path):
    metadata = tmp_path / "collection-metadata.json"
    metadata.write_text("{}", encoding="utf-8")
    existing = game("one", "jetpac", "48K")
    incoming = game("two", "jetpac", "48K", "incoming")
    trash = game("three", "manic miner", "48K", "trash")
    loader = CollectionLoader(
        metadata_path=lambda: metadata,
        load_metadata_games=lambda *_args: [existing],
        load_incoming_games=lambda *_args: [incoming],
        load_trash_games=lambda *_args: [trash],
        load_official_games=lambda *_args: [],
        load_homebrew_games=lambda *_args: [],
        load_scanned_games=lambda *_args: [],
        load_language_review_games=lambda *_args: [],
        auto_metadata_enabled=lambda: False,
        save_metadata_from_games=lambda *_args: None,
    )

    games = loader.load({}, set())

    assert [item.id for item in games] == ["two", "one", "three"]
    assert incoming.import_status == "system-match"
    assert incoming.import_system_match_count == 1
    assert trash.import_status == "new"


def test_scanned_collection_loading_can_seed_metadata(tmp_path):
    saved = []
    official = game("one", "jetpac", "48K")
    loader = CollectionLoader(
        metadata_path=lambda: tmp_path / "missing.json",
        load_metadata_games=lambda *_args: [],
        load_incoming_games=lambda *_args: [],
        load_trash_games=lambda *_args: [],
        load_official_games=lambda *_args: [official],
        load_homebrew_games=lambda *_args: [],
        load_scanned_games=lambda *_args: [],
        load_language_review_games=lambda *_args: [],
        auto_metadata_enabled=lambda: True,
        save_metadata_from_games=lambda games, poks: saved.append((games, poks)),
    )

    assert loader.load({}, set()) == [official]
    assert saved == [([official], {})]


def test_import_matching_limits_portable_summaries():
    games = [game(str(index), "jetpac", "48K") for index in range(10)]
    incoming = game("incoming", "jetpac", "48K", "incoming")
    games.append(incoming)

    mark_import_view_matches(games)

    assert incoming.import_match_count == 10
    assert incoming.import_system_match_count == 10
    assert len(incoming.import_matches) == 8
