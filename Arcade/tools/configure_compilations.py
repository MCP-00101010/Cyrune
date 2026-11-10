"""Preview/register Atari compilations without moving media or starting emulators."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.atari import validated_rows  # noqa: E402
from arcade_core.catalogue_identity import _writer_lock, read_object  # noqa: E402
from arcade_core.collections import current_config  # noqa: E402
from arcade_core.compilations import KIND, discover, inventory  # noqa: E402
from arcade_core.paths import ConfinedRoot  # noqa: E402
from arcade_core.persistence import atomic_write_json  # noqa: E402


def configure(config_path, root, *, apply=False):
    config_path, root = Path(config_path).resolve(), Path(root).resolve()
    checkout = Path(__file__).resolve().parents[2]
    if any(p.is_relative_to(checkout) for p in (config_path, root)) or not root.is_dir():
        raise ValueError('Use an existing media folder and native configuration outside the checkout')
    index, rejected = discover(root)
    validated_rows(index)
    result = {'ok': True, 'applied': False, **inventory(index, rejected)}
    if not apply:
        return result
    if rejected or not index['games']:
        raise ValueError('Review unrecognized images before registering the collection')
    target = ConfinedRoot(root).resolve('collection-metadata.json')
    with _writer_lock(config_path), _writer_lock(target):
        before = read_object(config_path, 4 * 1024 * 1024)
        config = deepcopy(before)
        identifier = 'atari-st-compilations'
        existing = next((c for c in config['collections'] if c['id'] == identifier), None)
        if existing and (Path(existing['root']).resolve() != root or existing.get('kind') != KIND):
            raise ValueError('Compilation collection identity is already in use')
        if any(Path(c['root']).resolve() == root and c['id'] != identifier for c in config['collections']):
            raise ValueError('This root already belongs to another collection')
        if target.exists():
            previous = read_object(target, 32 * 1024 * 1024)
            if previous != index:
                raise ValueError('Existing index differs; use Arcade Rebuild Index to add images')
        choices = config.get('emulators', {})
        default = (existing or {}).get('default_emulator') or next((c.get('default_emulator') for c in config['collections']
                   if c.get('adapter') == 'atari-st-disks-v1' and c.get('default_emulator') in choices), '')
        if not default:
            default = next((key for key, value in choices.items() if value.get('type') in {'steem', 'hatari'}), '')
        emulator = choices.get(default, {})
        if emulator.get('type') not in {'steem', 'hatari'} or not Path(emulator.get('path', '')).is_file():
            raise ValueError('Configure an installed Atari emulator first')
        collection = {'id': identifier, 'name': 'Atari ST Compilations', 'root': str(root),
                      'adapter': 'atari-st-disks-v1', 'kind': KIND, 'role': 'source',
                      'writable': False, 'auto_metadata': False, 'default_emulator': default}
        if not existing:
            if len(config['collections']) >= 64:
                raise ValueError('Collection limit reached')
            config['collections'].append(collection)
        config = current_config(config)
        digest = hashlib.sha256(config_path.read_bytes()).hexdigest()[:16]
        backup = config_path.with_name(f'{config_path.stem}.before-compilations-{digest}.json')
        if not backup.exists():
            atomic_write_json(backup, before)
        # Publish a validated index first. An interrupted registration can be rerun;
        # it accepts the identical index and never replaces unrelated metadata.
        if not target.exists():
            atomic_write_json(target, index)
        validated_rows(read_object(target, 32 * 1024 * 1024))
        if read_object(config_path, 4 * 1024 * 1024) != before:
            raise ValueError('Configuration changed during registration; rerun after review')
        if config != before:
            atomic_write_json(config_path, config)
        return {**result, 'applied': True, 'collection_id': identifier, 'backup': str(backup)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arcade-config', type=Path, required=True)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(configure(args.arcade_config, args.root, apply=args.apply), indent=2))
