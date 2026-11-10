import sys
import os
import tempfile
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _temporary_target(path):
    if isinstance(path, int):
        return True
    if os.path.normcase(os.path.abspath(os.fsdecode(path))) == os.path.normcase(os.path.abspath(os.devnull)):
        return True
    return Path(os.fsdecode(path)).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())


def pytest_configure(config):
    # A test accidentally following a production default must fail before it
    # touches a user's library. Environment isolation alone is not sufficient.
    config._arcade_write_guard = True
    def guard(event, args):
        if not config._arcade_write_guard:
            return
        targets = ()
        if event == 'open':
            path, mode, flags = args
            if any(char in str(mode) for char in 'wax+') or flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT):
                targets = (path,)
        elif event in {'os.rename', 'os.link', 'os.symlink'}:
            targets = args[:2]
        elif event in {'os.remove', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.utime'}:
            targets = args[:1]
            if event == 'os.mkdir' and Path(args[0]).is_dir():
                return
        if any(not _temporary_target(target) for target in targets):
            raise PermissionError('Arcade tests cannot write outside temporary storage')
    sys.addaudithook(guard)


def pytest_unconfigure(config):
    config._arcade_write_guard = False


@pytest.fixture(autouse=True)
def isolated_native_defaults(tmp_path, monkeypatch):
    for key, folder in {
        'CYRUNE_ARCADE_DATA': 'runtime', 'CYRUNE_ARCADE_COLLECTION': 'collection',
        'CYRUNE_ARCADE_COLLECTIONS_BASE': 'collections',
    }.items():
        monkeypatch.setenv(key, str(tmp_path / folder))
