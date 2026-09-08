from pathlib import Path
from types import SimpleNamespace
import subprocess

import pytest

from arcade_core import emulator_shortcuts as shortcuts
from test_feature_parity import configure_fixture, load_server


def test_shortcut_browser_actions():
    result = subprocess.run(['node', '--test', str(Path(__file__).with_name('emulator_shortcuts_ui.cjs'))],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_application_launch_uses_only_configured_executable_and_working_directory(tmp_path):
    exe = tmp_path / 'Emulator with spaces.exe'
    exe.write_bytes(b'fixture')
    config = {'vbam': {'type':'generic', 'name':'VBA-M', 'path':str(exe),
                      'supported_extensions':['.gb', '.gba'], 'arguments':['--game', '{file}']},
              'spectrum': {'type':'generic', 'path':str(exe), 'supported_extensions':['.tap']}}
    collection = {'adapter':'gameboy-cartridges-v1'}
    expand = lambda value: Path(value) if value else None
    rows = shortcuts.shortcuts(collection, config, expand)
    assert [row['id'] for row in rows] == ['vbam']
    assert str(tmp_path) not in str(rows)
    calls = []
    result = shortcuts.launch(collection, config, 'vbam', expand,
                              lambda args, cwd: calls.append((args, cwd)) or SimpleNamespace(pid=42))
    assert result == {'ok':True, 'pid':42}
    assert calls == [([str(exe)], tmp_path)]
    with pytest.raises(ValueError):
        shortcuts.launch(collection, config, 'spectrum', expand, lambda *_: pytest.fail('Wrong platform'))
    exe.unlink()
    assert shortcuts.shortcuts(collection, config, expand) == []


def test_scummvm_application_opens_its_configured_library_without_a_target(tmp_path):
    exe, ini = tmp_path/'scummvm.exe', tmp_path/'scummvm.ini'
    exe.write_bytes(b'fixture'); ini.write_text('[scummvm]\n')
    calls = []
    shortcuts.launch({'adapter':'scummvm-config-v1','scummvm_config':str(ini)},
        {'scummvm':{'type':'scummvm','path':str(exe)}}, 'scummvm', lambda value:Path(value) if value else None,
        lambda args,cwd: calls.append((args,cwd)) or SimpleNamespace(pid=42))
    assert calls == [([str(exe),'--config',str(ini)],tmp_path)]


def test_api_rejects_stale_collection_and_injected_authority_and_caches_icons(tmp_path, monkeypatch):
    server = load_server(); configure_fixture(server, tmp_path)
    exe = tmp_path/'EightyOne.exe'; exe.write_bytes(b'fixture')
    monkeypatch.setattr(server, 'configured_emulators', lambda **_: {'eightyone':{'type':'eightyone','path':str(exe)}})
    icons, launches = [], []
    monkeypatch.setattr(server,'EMULATOR_ICON_READER',lambda path:icons.append(path) or 'data:image/png;base64,aWNvbg==')
    monkeypatch.setattr(server,'launch_visible',lambda args,cwd:launches.append((args,cwd)) or SimpleNamespace(pid=42))
    params={'collection_id':'desasteron','emulator_id':'eightyone'}
    for _ in range(2):
        assert server.dispatch_arcade_api('GET','/api/emulator-icon',params)['icon'].startswith('data:image/png')
    assert icons == [str(exe)]
    assert not server.dispatch_arcade_api('POST','/api/launch-emulator',data={**params,'collection_id':'other'})['ok']
    for extra in ('path','arguments','working_dir'):
        assert not server.dispatch_arcade_api('POST','/api/launch-emulator',data={**params,extra:'forged'})['ok']
    assert launches == []
    assert server.dispatch_arcade_api('POST','/api/launch-emulator',data=params)['pid'] == 42
    assert launches == [([str(exe)],tmp_path)]
