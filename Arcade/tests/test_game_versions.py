import pytest
import subprocess
from pathlib import Path
from types import SimpleNamespace

from arcade_core.game_versions import family_id, entry_family_id, VersionDefaults
from arcade_core.catalogue_identity import CatalogueError


def test_grouped_rows_and_flag_rendering():
    result = subprocess.run(['node', '--test', str(Path(__file__).with_name('game_versions_ui.cjs'))],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_family_identity_normalizes_title_but_preserves_remakes_and_sources():
    assert family_id('source', ' Monkey  Island ', 'scummvm-game') == family_id('source', 'monkey island', 'scummvm-game')
    original = family_id('source', 'Maniac Mansion', 'scummvm-game')
    assert original != family_id('source', 'Maniac Mansion Deluxe', 'scummvm-game')
    assert original != family_id('other-source', 'Maniac Mansion', 'scummvm-game')
    assert original != family_id('source', 'Maniac Mansion', 'media-file')


def test_default_store_survives_restart_and_rejects_corruption(tmp_path):
    store = VersionDefaults(tmp_path)
    assert store.load() == {} and not store.path.exists()
    store.save('family', 'entry', 'game_approved')
    assert VersionDefaults(tmp_path).load() == {'family': {'catalogueId': 'entry', 'gameKey': 'game_approved'}}
    with pytest.raises(CatalogueError, match='invalid-request'):
        store.save('../escape', 'entry', 'game_approved')
    store.path.write_text('{"schemaVersion":1,"defaults":{"family":{"path":"native"}}}', encoding='utf-8')
    with pytest.raises(CatalogueError, match='review-required'):
        store.load()


def test_specific_scummvm_game_ids_tolerate_title_typos_but_generic_engines_do_not_merge():
    def entry(title, engine, game):
        return SimpleNamespace(base={'sourceId': 'source', 'title': title, 'targetKind': 'scummvm-game'},
                               target={'engineId': engine, 'gameId': game})
    assert entry_family_id(entry('Maniac Mansion 1', 'scumm', 'maniac')) == entry_family_id(entry('Maniac Mansion 1:', 'scumm', 'maniac'))
    assert entry_family_id(entry('Original', 'ags', 'ags')) != entry_family_id(entry('Remake', 'ags', 'ags'))
    assert entry_family_id(entry('Story A', 'glk', 'zcode')) != entry_family_id(entry('Story B', 'glk', 'zcode'))
