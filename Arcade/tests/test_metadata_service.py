from types import SimpleNamespace

from emugui_core.metadata import MetadataService


class FakeLibrary:
    def __init__(self, game):
        self.game = game
        self.rebuilds = 0

    def get_game(self, game_id):
        return self.game if game_id == self.game.id else None

    def rebuild(self):
        self.rebuilds += 1


def make_service(tmp_path):
    path = tmp_path / "Jetpac (1983).tzx"
    path.write_bytes(b"game")
    game = SimpleNamespace(
        id="jetpac", title="Jetpac", title_key="jetpac", system="48K", memory="48K",
        path=str(path), file_name=path.name,
    )
    library = FakeLibrary(game)
    metadata = {"games": []}
    saves = []

    def make_item(selected, _poks):
        return {"id": selected.id, "title": selected.title, "title_key": selected.title_key, "system": selected.system, "memory": selected.memory, "file": selected.file_name}

    def apply_changes(_game, item, changes, _rename):
        item.update(changes)
        return {"ok": True, "warnings": []}

    service = MetadataService(
        library_provider=lambda: library,
        ensure_metadata_file=lambda: None,
        load_metadata=lambda: metadata,
        save_metadata=lambda value: saves.append(value),
        game_to_metadata_item=make_item,
        apply_metadata_changes=apply_changes,
        apply_metadata_values=lambda _game, item, changes: item.update(changes),
        build_target_path=lambda source, _item, _old_title: source,
        metadata_warnings=lambda *_args: [],
        metadata_change_labels=lambda changes: list(changes),
        collection_relative=lambda value: str(value),
        unique_path=lambda value: value,
        clean_file_name=lambda value: value.strip(),
        update_metadata_game=lambda *_args, **_kwargs: None,
        clean_metadata_text=lambda value, **_kwargs: str(value).strip(),
        clean_asset_path=lambda value: str(value or ""),
        dedupe=lambda values: list(dict.fromkeys(values)),
    )
    return service, library, metadata, saves


def test_metadata_service_updates_and_previews_without_transport_state(tmp_path):
    service, library, metadata, saves = make_service(tmp_path)

    updated = service.update(["jetpac"], {"publisher": "Ultimate"})
    preview = service.preview(["jetpac"], {"title": "Jet Pac"}, False)

    assert updated["ok"] is True
    assert updated["updated_count"] == 1
    assert metadata["games"][0]["publisher"] == "Ultimate"
    assert saves == [metadata]
    assert library.rebuilds == 1
    assert preview["previews"][0]["title"] == "Jet Pac"


def test_metadata_service_validates_selection_and_scrape_candidates(tmp_path):
    service, _library, _metadata, _saves = make_service(tmp_path)

    assert service.update([], {})["error"] == "No games selected"
    assert service.preview(["jetpac"], None)["error"] == "Missing metadata changes"
    assert service.apply_scrape("jetpac", None)["error"] == "Missing scrape candidate"
    changes = service.scrape_candidate_changes(
        {"title": "Jetpac", "year": "1983", "description": "Classic"},
        {"screenshot": "_assets/jetpac.png"},
    )
    assert changes == {
        "title": "Jetpac", "date": "1983", "description": "Classic", "screenshot": "_assets/jetpac.png",
    }
