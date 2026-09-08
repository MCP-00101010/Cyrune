"""Platform-scoped application shortcuts using configured native executables."""

import hashlib
from pathlib import Path

from arcade_core.platforms import LIBRARIES, collection_platform


GENERIC_FORMATS = {
    'zx-spectrum': {'.tap', '.tzx', '.z80', '.sna', '.szx', '.dsk', '.trd', '.scl'},
    'game-boy': {'.gb', '.gbc', '.gba'},
}


def compatible(collection, emulator):
    platform = collection_platform(collection)
    adapter = emulator.get('type') or 'generic'
    if emulator.get('hidden') or adapter not in LIBRARIES.get(platform, {}).get('emulators', []):
        return False
    if adapter == 'generic':
        formats = {str(value).lower() for value in emulator.get('supported_extensions', [])}
        return bool(formats & GENERIC_FORMATS.get(platform, set()))
    return True


def executable(collection, emulators, identifier, expand_path):
    emulator = emulators.get(identifier) if isinstance(identifier, str) else None
    if not emulator or not compatible(collection, emulator):
        raise ValueError('This emulator is not available for the selected platform.')
    path = expand_path(emulator.get('path'))
    if not path or not path.is_absolute() or not path.is_file():
        raise ValueError('The configured emulator executable is missing.')
    return emulator, path.resolve()


def shortcuts(collection, emulators, expand_path):
    rows = []
    for identifier, emulator in emulators.items():
        if not compatible(collection, emulator):
            continue
        try:
            _, path = executable(collection, emulators, identifier, expand_path)
            stat = path.stat()
        except (ValueError, OSError):
            continue
        revision = hashlib.sha256(str((str(path), stat.st_size, stat.st_mtime_ns)).encode()).hexdigest()
        rows.append({'id': identifier, 'name': str(emulator.get('name') or identifier), 'iconRevision': revision})
    return rows[:64]


def launch(collection, emulators, identifier, expand_path, launch_process):
    emulator, path = executable(collection, emulators, identifier, expand_path)
    directory = expand_path(emulator.get('working_dir')) or path.parent
    if not directory.is_dir():
        raise ValueError('The emulator working directory is missing.')
    arguments = [str(path)]
    if emulator.get('type') == 'scummvm':
        config = Path(collection.get('scummvm_config', ''))
        if not config.is_absolute() or not config.is_file():
            raise ValueError('The configured ScummVM settings file is missing.')
        arguments.extend(['--config', str(config.resolve())])
    process = launch_process(arguments, directory)
    return {'ok': True, 'pid': process.pid}
