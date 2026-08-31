from arcade_core.collections import CollectionService, file_count_in_tree, looks_like_collection


def test_collection_service_discovers_and_persists_sources(tmp_path):
    default = tmp_path / "Desasteron"
    default.mkdir()
    source = tmp_path / "Atari ST"
    (source / "Games").mkdir(parents=True)
    ignored = tmp_path / "Documents"
    ignored.mkdir()
    state = {"config": {"collections": [], "default_collection": "desasteron"}, "runtime": {}}
    service = CollectionService(
        default_root=default,
        collections_base=tmp_path,
        load_config=lambda: state["config"],
        save_config=lambda config: state.update(config=config),
        load_state=lambda: state["runtime"],
    )

    discovered = service.discover()
    assert [item["name"] for item in discovered] == ["Desasteron", "Atari ST"]
    added = service.add(str(source), "ST Games")
    assert added["ok"] is True
    assert added["collection"]["role"] == "source"
    assert state["config"]["collections"][0]["name"] == "ST Games"


def test_collection_payload_counts_only_writable_incoming_and_trash(tmp_path):
    root = tmp_path / "Spectrum"
    (root / "incoming").mkdir(parents=True)
    (root / "incoming" / "one.tap").write_bytes(b"game")
    (root / "_Deleted").mkdir()
    (root / "_Deleted" / "two.tzx").write_bytes(b"game")
    (root / "collection-metadata.json").write_text("{}", encoding="utf-8")
    config = {"collections": [{
        "id": "spectrum", "name": "Spectrum", "root": str(root), "role": "library",
        "writable": True, "auto_metadata": True,
    }], "default_collection": "spectrum"}
    service = CollectionService(
        default_root=root,
        collections_base=tmp_path,
        load_config=lambda: config,
        save_config=lambda _config: None,
        load_state=lambda: {},
    )

    payload = service.payload()
    assert payload["active"]["id"] == "spectrum"
    assert payload["collections"][0]["incoming_count"] == 1
    assert payload["collections"][0]["trash_count"] == 1
    assert looks_like_collection(root) is True
    assert file_count_in_tree(root, {".tap", ".tzx"}) == 2
