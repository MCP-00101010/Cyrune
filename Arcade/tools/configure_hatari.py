"""Register an installed Hatari as an alternative; preserve collection defaults."""
import argparse
from contextlib import nullcontext
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.catalogue_identity import _writer_lock, read_object  # noqa: E402
from arcade_core.emulators import validate_emulator  # noqa: E402
from arcade_core.game_properties import default_profile, profile_options  # noqa: E402
from arcade_core.persistence import atomic_write_json  # noqa: E402


def configure(config_path, executable, *, apply=False):
    config_path, executable = Path(config_path).resolve(), Path(executable).resolve()
    checkout = Path(__file__).resolve().parents[2]
    if any(p.is_relative_to(checkout) for p in (config_path, executable)):
        raise ValueError('Runtime configuration and emulator must be outside the checkout')
    if not executable.is_file() or executable.suffix.lower() != '.exe':
        raise ValueError('An installed Hatari executable is required')
    profile = default_profile(executable, 'hatari')
    if not profile.is_file() or profile.stat().st_size > 1024 * 1024:
        raise ValueError('Save Hatari settings once before registering the emulator')
    profiles = profile_options(executable, 'hatari')
    with _writer_lock(config_path) if apply else nullcontext():
        before = read_object(config_path, 4 * 1024 * 1024)
        config = deepcopy(before)
        emulators = config['emulators']
        previous = emulators.get('hatari')
        if previous and (previous.get('type') != 'hatari' or Path(previous.get('path', '')).resolve() != executable):
            raise ValueError('The Hatari emulator ID is already in use')
        emulators['hatari'] = validate_emulator('hatari', {
            'name': 'Hatari', 'type': 'hatari', 'path': str(executable), 'arguments': [],
            'supported_extensions': ['.st', '.stx', '.msa', '.dim']})
        if len(emulators) > 64:
            raise ValueError('Emulator limit reached')
        if apply and config != before:
            digest = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()[:16]
            backup = config_path.with_name(f'{config_path.stem}.before-hatari-{digest}.json')
            if not backup.exists():
                atomic_write_json(backup, before)
            if read_object(config_path, 4 * 1024 * 1024) != before:
                raise ValueError('Configuration changed during setup')
            atomic_write_json(config_path, config)
    return {'ok': True, 'applied': apply, 'emulatorId': 'hatari', 'profiles': [p['name'] for p in profiles]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arcade-config', type=Path, required=True)
    parser.add_argument('--executable', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(configure(args.arcade_config, args.executable, apply=args.apply)))
