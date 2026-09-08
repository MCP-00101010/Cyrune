import ctypes
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


SPEC = importlib.util.spec_from_file_location('explorer_under_test', Path(__file__).parents[1] / 'explorer.py')
EXPLORER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPLORER)


@pytest.mark.parametrize('directory', [False, True])
@pytest.mark.parametrize('fault', ['', 'launch', 'visibility', 'missing'])
def test_direct_explorer_launch_preserves_exact_target_and_propagates_failure(tmp_path, monkeypatch, directory, fault):
    target = tmp_path / "Game, édition '$(&).tap"
    if fault != 'missing':
        target.mkdir() if directory else target.write_bytes(b'fixture')
    calls = []
    def launch(args):
        calls.append(('launch', args))
        if fault == 'launch':
            raise OSError('Explorer launch failed')
    def visible(path, **options):
        calls.append(('visible', path, options))
        if fault == 'visibility':
            raise OSError('Explorer visibility failed')
    monkeypatch.setattr(EXPLORER.subprocess, 'Popen', launch)
    monkeypatch.setattr(EXPLORER, 'ensure_visible', visible)
    if fault:
        with pytest.raises(OSError):
            EXPLORER.reveal_game(target)
    else:
        EXPLORER.reveal_game(target)
    expected = [] if fault == 'missing' else [
        ('launch', ['explorer.exe', str(target)] if directory else ['explorer.exe', '/select,', str(target)])]
    if fault not in {'launch', 'missing'}:
        expected.append(('visible', target, {'directory': directory}))
    assert calls == expected


@pytest.mark.parametrize('result', [0, 1])
@pytest.mark.parametrize('minimized', [False, True])
@pytest.mark.parametrize('directory', [False, True])
def test_visibility_helper_restores_the_exact_window_and_keeps_target_out_of_script(tmp_path, monkeypatch, result, minimized, directory):
    target = tmp_path / "Game '$(& unsafe).tap"
    calls = []
    windows = []
    user = SimpleNamespace(IsIconic=lambda handle: minimized,
                           ShowWindowAsync=lambda *args: windows.append(('show', *args)) or 1,
                           SetForegroundWindow=lambda *args: windows.append(('foreground', *args)) or 0)
    monkeypatch.setattr(ctypes, 'WinDLL', lambda *_args, **_kwargs: user, raising=False)
    monkeypatch.setattr(EXPLORER.subprocess, 'CREATE_NO_WINDOW', 0x08000000, raising=False)
    monkeypatch.setattr(EXPLORER.subprocess, 'run', lambda args, **kwargs: calls.append((args, kwargs)) or SimpleNamespace(returncode=result, stdout='12345\n'))
    if result:
        with pytest.raises(OSError, match='bring the selected game into view'): EXPLORER.ensure_visible(target, directory=directory)
    else:
        EXPLORER.ensure_visible(target, directory=directory)
    args, options = calls[0]
    assert str(target) not in ' '.join(args)
    assert options['env']['CYRUNE_EXPLORER_TARGET'] == str(target)
    assert options['env']['CYRUNE_EXPLORER_DIRECTORY'] == ('1' if directory else '0')
    assert options['creationflags'] == 0x08000000 and options['timeout'] == 8
    assert windows == ([] if result else [('show', 12345, 9 if minimized else 5), ('foreground', 12345)])


@pytest.mark.parametrize('handle', ['', '0', '-1', '18446744073709551616', 'unexpected output'])
def test_visibility_helper_rejects_missing_or_invalid_window_handles(monkeypatch, handle):
    monkeypatch.setattr(EXPLORER.subprocess, 'CREATE_NO_WINDOW', 0x08000000, raising=False)
    monkeypatch.setattr(EXPLORER.subprocess, 'run', lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=handle))
    with pytest.raises(OSError):
        EXPLORER.ensure_visible(Path('game.tap'))
