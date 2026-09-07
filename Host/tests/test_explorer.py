import ctypes
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


SPEC = importlib.util.spec_from_file_location('explorer_under_test', Path(__file__).parents[1] / 'explorer.py')
EXPLORER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPLORER)


@pytest.mark.parametrize('fault', ['', 'initialize', 'parse', 'select', 'existing-apartment'])
def test_exact_file_selection_and_com_cleanup(tmp_path, monkeypatch, fault):
    target = tmp_path / 'Game, édition.tap'
    target.write_bytes(b'fixture')
    calls = []
    monkeypatch.setattr(EXPLORER, 'ensure_visible', lambda path: calls.append('visible'))
    def parse(path, _context, out, _flags, _attributes):
        assert path == str(target)
        ctypes.cast(out, ctypes.POINTER(ctypes.c_void_p))[0] = 42
        return -1 if fault == 'parse' else 0
    def select(item, count, children, flags):
        calls.append('select')
        assert (item.value, count, children, flags) == (42, 0, None, 0)
        return -1 if fault == 'select' else 0
    shell = SimpleNamespace(SHParseDisplayName=parse, SHOpenFolderAndSelectItems=select)
    ole = SimpleNamespace(CoInitializeEx=lambda *_: -1 if fault == 'initialize' else -2147417850 if fault == 'existing-apartment' else 0,
                          CoUninitialize=lambda: calls.append('uninitialize'), CoTaskMemFree=lambda _: calls.append('free'))
    monkeypatch.setattr(ctypes, 'WinDLL', lambda name, **_: shell if name == 'shell32' else ole, raising=False)
    if fault in {'initialize', 'parse', 'select'}:
        with pytest.raises(OSError): EXPLORER.reveal_game(target)
    else:
        EXPLORER.reveal_game(target)
    assert ('free' in calls) == (fault != 'initialize')
    assert ('uninitialize' in calls) == (fault not in {'initialize', 'existing-apartment'})
    assert ('visible' in calls) == (fault in {'', 'existing-apartment'})


@pytest.mark.parametrize('result', [33, 2])
def test_directory_opening_checks_windows_result(tmp_path, monkeypatch, result):
    calls = []
    def execute(*args):
        calls.append(args)
        return result
    monkeypatch.setattr(ctypes, 'WinDLL', lambda *_args, **_kwargs: SimpleNamespace(ShellExecuteW=execute), raising=False)
    if result <= 32:
        with pytest.raises(OSError): EXPLORER.reveal_game(tmp_path)
    else:
        EXPLORER.reveal_game(tmp_path)
    assert calls == [(None, 'open', str(tmp_path), None, None, 1)]


@pytest.mark.parametrize('result', [0, 1])
def test_visibility_helper_keeps_target_out_of_script_and_reports_failure(tmp_path, monkeypatch, result):
    target = tmp_path / "Game '$(& unsafe).tap"
    calls = []
    monkeypatch.setattr(EXPLORER.subprocess, 'CREATE_NO_WINDOW', 0x08000000, raising=False)
    monkeypatch.setattr(EXPLORER.subprocess, 'run', lambda args, **kwargs: calls.append((args, kwargs)) or SimpleNamespace(returncode=result))
    if result:
        with pytest.raises(OSError, match='bring the selected game into view'): EXPLORER.ensure_visible(target)
    else:
        EXPLORER.ensure_visible(target)
    args, options = calls[0]
    assert str(target) not in ' '.join(args)
    assert options['env']['CYRUNE_EXPLORER_TARGET'] == str(target)
    assert options['creationflags'] == 0x08000000 and options['timeout'] == 8
