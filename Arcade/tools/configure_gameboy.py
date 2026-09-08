"""Attach an existing combined Game Boy library without moving ROMs or launching emulators."""

import argparse
from contextlib import nullcontext
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.catalogue_identity import read_object, _writer_lock  # noqa: E402
from arcade_core.emulators import validate_emulator  # noqa: E402
from arcade_core.gameboy import ADAPTER, discover, read_rows  # noqa: E402
from arcade_core.paths import ConfinedRoot  # noqa: E402
from arcade_core.persistence import atomic_write_json  # noqa: E402


def configure(config_path, root, sameboy, vbam, *, bgb=None, receipt=None, apply=False):
    from arcade_service import parse_tosec_name
    config_path, root = Path(config_path).resolve(), Path(root).resolve()
    checkout = Path(__file__).resolve().parents[2]
    if any(path.is_relative_to(checkout) for path in (config_path, root)) or not root.is_dir():
        raise ValueError('Choose an existing library and native configuration outside the checkout')
    seeds = {}
    if receipt:
        migration = read_object(Path(receipt), 32 * 1024 * 1024)
        if migration.get('status') != 'complete':
            raise ValueError('The migration has not completed')
        for row in migration['selected']:
            path = Path(row['destination']).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError('A migrated ROM is missing or outside the library')
            if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
                raise ValueError('A migrated ROM changed; review it before attaching')
            seeds[path.relative_to(root).as_posix()] = row
    metadata = discover(root, parse_tosec_name, seeds)
    if not metadata['games']:
        raise ValueError('No supported cartridges found')
    definitions = {}
    for key, name, executable, formats, args in [
        ('sameboy', 'SameBoy', sameboy, ['.gb', '.gbc'], ['{file}']),
        ('vbam', 'VisualBoyAdvance-M', vbam, ['.gb', '.gbc', '.gba'], ['{file}']),
        ('bgb', 'BGB', bgb, ['.gb', '.gbc'], ['{file}']),
    ]:
        if executable is None:
            continue
        path = Path(executable).resolve()
        if not path.is_file() or path.suffix.lower() != '.exe' or path.is_relative_to(checkout):
            raise ValueError(f'An installed {name} executable is required')
        definitions[key] = validate_emulator(key, dict(name=name, type='generic', path=str(path),
                                                       arguments=args, supported_extensions=formats))
    target = ConfinedRoot(root).resolve('collection-metadata.json')
    with (_writer_lock(config_path) if apply else nullcontext()), (_writer_lock(target) if apply else nullcontext()):
        before = read_object(config_path, 4 * 1024 * 1024)
        config = deepcopy(before)
        existing = next((row for row in config['collections'] if row['id'] == 'game-boy'), None)
        if existing and (existing.get('adapter') != ADAPTER or Path(existing['root']).resolve() != root):
            raise ValueError('The Game Boy collection identity is already in use')
        if any(row['id'] != 'game-boy' and Path(row['root']).resolve() == root for row in config['collections']):
            raise ValueError('This library already has another collection identity')
        if target.exists():
            read_rows(root)
            metadata = read_object(target, 32 * 1024 * 1024)
        for key, definition in definitions.items():
            prior = config['emulators'].get(key)
            if prior and (prior.get('type') != 'generic' or Path(prior.get('path', '')).resolve() != Path(definition['path'])):
                raise ValueError(f'The {key} emulator identity is already in use')
            config['emulators'].setdefault(key, definition)
        collection = {'id': 'game-boy', 'name': 'Game Boy', 'adapter': ADAPTER, 'platform_id': 'game-boy',
                      'root': str(root), 'role': 'source', 'writable': False, 'auto_metadata': False,
                      'default_emulator': 'sameboy', 'variant_emulators': {'GBA': 'vbam'}}
        if not existing:
            config['collections'].append(collection)
        if len(config['collections']) > 64 or len(config['emulators']) > 64:
            raise ValueError('Collection or emulator limit exceeded')
        if apply:
            digest = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()[:16]
            backup = config_path.with_name(f'{config_path.stem}.before-gameboy-{digest}.json')
            if not backup.exists():
                atomic_write_json(backup, before)
            if not target.exists():
                atomic_write_json(target, metadata)
            read_rows(root)
            if read_object(config_path, 4 * 1024 * 1024) != before:
                raise ValueError('Configuration changed during setup')
            atomic_write_json(config_path, config)
        return {'ok': True, 'applied': apply, 'games': len(metadata['games']),
                'variants': {kind: sum(r['system'] == kind for r in metadata['games']) for kind in ['GB', 'GBC', 'GBA']},
                'emulators': list(definitions)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('arcade-config', 'root', 'sameboy', 'vbam'):
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ('bgb', 'receipt'):
        parser.add_argument('--' + name, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(configure(args.arcade_config, args.root, args.sameboy, args.vbam,
                               bgb=args.bgb, receipt=args.receipt, apply=args.apply)))
