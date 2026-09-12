"""Configure an existing sorted Atari collection and STEem SSE, without launching."""

import argparse
from copy import deepcopy
from contextlib import nullcontext
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.atari import ADAPTER, discover, read_rows  # noqa: E402
from arcade_core.catalogue_identity import _writer_lock, read_object  # noqa: E402
from arcade_core.emulators import validate_emulator  # noqa: E402
from arcade_core.persistence import atomic_write_json  # noqa: E402
from arcade_core.collections import current_config  # noqa: E402
from arcade_core.paths import ConfinedRoot  # noqa: E402


def configure(config_path, root, executable, *, apply=False):
    from arcade_service import parse_tosec_name
    config_path, root, executable = (Path(p).resolve() for p in (config_path, root, executable))
    checkout = Path(__file__).resolve().parents[2]
    if any(p.is_relative_to(checkout) for p in (config_path, root, executable)):
        raise ValueError('Runtime data and emulator installation must be outside the checkout')
    if not root.is_dir():
        raise ValueError('An existing Atari collection directory is required')
    if not executable.is_file() or executable.suffix.lower() != '.exe' or not (executable.parent / 'steem.ini').is_file():
        raise ValueError('STEem SSE executable and existing steem.ini are required')
    metadata, rejected = discover(root, parse_tosec_name)
    if not metadata['games'] or rejected:
        raise ValueError(f'Atari scan requires review: {len(rejected)} ungrouped or incomplete images')
    target = ConfinedRoot(root).resolve('collection-metadata.json')
    with (_writer_lock(config_path) if apply else nullcontext()), (_writer_lock(target) if apply else nullcontext()):
        before = read_object(config_path, 4 * 1024 * 1024)
        old_metadata = read_object(target, 32 * 1024 * 1024) if target.exists() else None
        if old_metadata is not None:
            if old_metadata.get('adapter') != ADAPTER:
                raise ValueError('Existing metadata belongs to another adapter')
            # Discovery does not silently replace user metadata or saved identities.
            if old_metadata != metadata:
                raise ValueError('Existing Atari metadata differs; review changes before refreshing')
        config = deepcopy(before)
        collections, emulators = config['collections'], config['emulators']
        previous = next((c for c in collections if c.get('id') == 'atari-st'), None)
        if previous and (previous.get('adapter') != ADAPTER or Path(previous.get('root', '')).resolve() != root):
            raise ValueError('Atari collection ID is already in use')
        if any(Path(c['root']).resolve() == root and c['id'] != 'atari-st' for c in collections):
            raise ValueError('Atari root is already configured under another identity')
        if 'steem-sse' in emulators and (emulators['steem-sse'].get('type') != 'steem' or Path(emulators['steem-sse'].get('path', '')).resolve() != executable):
            raise ValueError('STEem emulator ID is already in use')
        emulators['steem-sse'] = validate_emulator('steem-sse', {'name': 'STEem SSE', 'type': 'steem', 'path': str(executable),
            'arguments': [], 'supported_extensions': ['.st', '.stx', '.msa', '.dim', '.stt']})
        collection = {'id': 'atari-st', 'name': 'Atari ST', 'adapter': ADAPTER, 'root': str(root),
                      'role': 'source', 'writable': False, 'auto_metadata': False, 'default_emulator': 'steem-sse'}
        if previous:
            collections[collections.index(previous)] = {**previous, **collection}
        else:
            collections.append(collection)
        if len(collections) > 64 or len(emulators) > 64:
            raise ValueError('Collection/emulator limit reached')
        if apply:
            digest = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()[:16]
            backup = config_path.with_name(f'{config_path.stem}.before-atari-{digest}.json')
            if not backup.exists():
                atomic_write_json(backup, before)
            if old_metadata is None:
                atomic_write_json(target, metadata)
            read_rows(root)
            if read_object(config_path, 4 * 1024 * 1024) != before:
                raise ValueError('Configuration changed during setup')
            atomic_write_json(config_path, current_config(config))
        return {'ok': True, 'applied': apply, 'editions': len(metadata['games']),
                'games': len({r['title'].casefold() for r in metadata['games']}),
                'disks': sum(len(r['disks']) for r in metadata['games']),
                'unsupportedHardwareEditions': sum(r['system'] in {'TT', 'Falcon'} for r in metadata['games'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('arcade-config', 'root', 'executable'):
        parser.add_argument('--' + flag, type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(configure(args.arcade_config, args.root, args.executable, apply=args.apply)))
