from arcade_core.scummvm_metadata import game_metadata, metadata_index


def test_scummvm_metadata_uses_exact_engine_and_game_ids():
    assert game_metadata('scumm', 'monkey') == {'publisher': 'LucasArts', 'series': 'The Secret of Monkey Island'}
    assert game_metadata('scumm', 'monkey2')['series'] == game_metadata('scumm', 'monkey')['series']
    assert game_metadata('ags', 'monkey') == {'publisher': '', 'series': ''}
    assert game_metadata('missing', 'missing') == {'publisher': '', 'series': ''}


def test_missing_optional_metadata_does_not_block_library(monkeypatch, tmp_path):
    import arcade_core.scummvm_metadata as module
    metadata_index.cache_clear()
    monkeypatch.setattr(module, 'METADATA_ROOT', tmp_path)
    try:
        assert game_metadata('scumm', 'monkey') == {'publisher': '', 'series': ''}
    finally:
        metadata_index.cache_clear()
