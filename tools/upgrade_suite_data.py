"""Coordinated native data cutover. Dry-run by default; never launches or scrapes.

Uses configured stores, preserves verified originals, and prints aggregate counts
only. Browser-local upgrades run inside their owning components on next reload.
"""
import argparse
from collections import Counter
from contextlib import ExitStack
from copy import deepcopy
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


def identities(value):
    """Count keys throughout the database, including nested and retained items."""
    result = Counter()
    def visit(item):
        if isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, dict):
            for key in ('id', 'gameKey', 'appKey'):
                if isinstance(item.get(key), str):
                    result[key, item[key]] += 1
            for child in item.values():
                visit(child)
    visit(value)
    return result


def run(*, apply=False):
    host = module('_cyrune_upgrade_host', ROOT / 'Host/morpheus_host.py')
    io = module('_cyrune_upgrade_io', ROOT / 'infrastructure/data_upgrade.py')
    binding_module = host._catalogue_binding_module()
    config_path = Path(host.CONFIG_PATH).resolve()
    raw_config = binding_module.read_object(config_path, 32 * 1024 * 1024)
    config = host._data_upgrades().config_document(raw_config)
    if Path(config['arcadeRoot']).resolve() != (ROOT / 'Arcade').resolve():
        raise ValueError('The configured Arcade installation differs from this checkout')
    # Planning must not invoke startup writers or credential migrations.
    host.load_config = lambda: deepcopy(config)
    sys.path.insert(0, str(ROOT / 'Arcade'))
    arcade = module('_cyrune_upgrade_arcade', ROOT / 'Arcade/arcade_service.py')
    host._load_emugui_module = lambda: arcade
    store = binding_module.CatalogueBindings(
        config_path.with_name('catalogue-bindings.json'), lock=host.game_binding_write_lock,
        write=lambda path, value: io.replace_bytes(path, io.encode(value)),
        resolve=arcade.resolve_catalogue_launch_plan,
        present=lambda identifier: arcade.get_catalogue_service().detail({'catalogueId':identifier})['entry'],
        execute=lambda _: (_ for _ in ()).throw(ValueError('Migration cannot launch games')),
        resolve_scope=arcade.catalogue_read_snapshot)
    host.CATALOGUE_BINDINGS, host.CATALOGUE_BINDINGS_PATH = store, store.path
    from arcade_core.collections import current_config
    from arcade_core.index_schema import index_document
    from arcade_core.catalogue_identity import _writer_lock
    from arcade_core.paths import ConfinedRoot

    changes, report = [], {'mode':'apply' if apply else 'dry-run', 'indexes':[], 'unavailableCollections':0}
    with ExitStack() as locks:
        locks.enter_context(host.game_binding_write_lock())
        locks.enter_context(_writer_lock(arcade.CONFIG_FILE))
        arcade_raw = arcade.CONFIG_FILE.read_bytes()
        arcade_config = current_config(json.loads(arcade_raw))
        for collection in arcade_config['collections']:
            root = Path(collection['root'])
            if not root.is_dir():
                report['unavailableCollections'] += 1
                continue
            if collection['adapter'] == 'scummvm-config-v1':
                continue  # Existing exact INI registrations and override schema remain current.
            path = ConfinedRoot(root).resolve('collection-metadata.json', require_exists=True)
            locks.enter_context(_writer_lock(path))
            before = path.read_bytes()
            source = json.loads(before)
            current = index_document(source)
            before_ids, after_ids = identities(source), identities(current)
            if any(after_ids[key] < count for key, count in before_ids.items()):
                raise ValueError('Collection upgrade changed exact identities')
            for old, new in zip(source['games'], current['games']):
                if any(new.get(key) != value for key, value in old.items()):
                    raise ValueError('Collection upgrade changed existing metadata or launch choices')
            report['indexes'].append({'adapter':collection['adapter'], 'records':len(current['games']),
                                      'groups':len({row['metadata_group_id'] for row in current['games']})})
            if source != current:
                changes.append((path, before, current))
        if json.loads(arcade_raw) != arcade_config:
            changes.append((arcade.CONFIG_FILE, arcade_raw, arcade_config))

        portal_path = Path(config['databasePath']).resolve()
        locks.enter_context(host.database_write_lock(str(portal_path)))
        portal_raw = portal_path.read_bytes()
        original = json.loads(portal_raw)
        converted = subprocess.run(['node', str(ROOT / 'tools/upgrade_portal_state.cjs')],
                                   input=portal_raw, capture_output=True, check=True).stdout
        portal = json.loads(converted)
        old_ids, new_ids = identities(original), identities(portal)
        if any(new_ids[key] < count for key, count in old_ids.items()):
            raise ValueError('Portal migration removed an existing identity')
        for key in ('gameKey', 'appKey'):
            if {item:count for item,count in old_ids.items() if item[0] == key} != {
                    item:count for item,count in new_ids.items() if item[0] == key}:
                raise ValueError('Portal migration changed shortcut bindings')
        report['portal'] = {'schema':portal['schemaVersion'], 'boards':len(portal['boards']),
                            'gameKeys':sum(key[0] == 'gameKey' for key in new_ids)}
        if original != portal:
            changes.append((portal_path, portal_raw, portal))
        binding_keys = set(raw_config.get('approvedGames', {}))
        if store.path.exists():
            binding_keys.update(json.loads(store.path.read_bytes())['bindings'])
        report['portal']['resolvedGameKeys'] = sum(kind == 'gameKey' and key in binding_keys for kind, key in new_ids)
        nexus_path = Path(host.NEXUS_SETTINGS_PATH)
        locks.enter_context(host.database_write_lock(str(nexus_path)))
        nexus_raw = nexus_path.read_bytes()
        nexus = host.load_nexus_settings()
        report['nexus'] = {'schema': nexus['schemaVersion']}
        if json.loads(nexus_raw) != nexus:
            changes.append((nexus_path, nexus_raw, nexus))
        report['bindings'] = host._data_upgrades().bindings(host, store, apply=False)
        # A later reconnected collection gets its own retained upgrade archive.
        batch = hashlib.sha256('\n'.join(sorted(str(path) for path, _, _ in changes)).encode()).hexdigest()[:16]
        journal = arcade.DATA / f'suite-data-v2-{batch}.json'
        prepared = [path for path in arcade.DATA.glob('suite-data-v2-*.json')
                    if json.loads(path.read_bytes()).get('status') == 'prepared']
        if len(prepared) > 1:
            raise ValueError('Multiple interrupted upgrades require recovery')
        if prepared:
            journal = prepared[0]
        report['nativeDocuments'] = io.upgrade(journal, changes, apply=apply) if changes or prepared else {'status':'current','files':0}
        if apply:
            arcade.invalidate_catalogue()
            report['bindings'] = host._data_upgrades().bindings(host, store, apply=True)
        if store.path.exists() and json.loads(store.path.read_bytes()).get('schemaVersion') == 5:
            verified, unavailable = 0, Counter()
            with arcade.catalogue_read_snapshot():
                for key in store.load()['bindings']:
                    try:
                        store.resolve(key)
                        verified += 1
                    except Exception as error:
                        unavailable[binding_module.error_code(error)] += 1
            report['verifiedLaunchBindings'] = verified
            report['unavailableLaunchBindings'] = dict(unavailable)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    arguments = parser.parse_args()
    try:
        print(json.dumps(run(apply=arguments.apply), indent=2))
    except Exception as error:
        # Do not print native exception messages, paths, subprocess output or records.
        print(json.dumps({'ok':False, 'errorType':type(error).__name__,
                          'error':'Upgrade stopped; originals retained. Inspect the failing stage locally.'}))
        raise SystemExit(1) from None
