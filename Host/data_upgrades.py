"""Supported native upgrade boundary: Host config and binding stores 1–4."""
from copy import deepcopy
import importlib.util
from pathlib import Path


def transaction_module():
    path = Path(__file__).resolve().parents[1] / 'infrastructure' / 'data_upgrade.py'
    spec = importlib.util.spec_from_file_location('_cyrune_data_upgrade', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def config_document(value):
    if type(value.get('schemaVersion', 0)) is not int or value.get('schemaVersion', 0) not in (0, 1):
        raise ValueError('Unsupported Host configuration baseline')
    result = deepcopy(value)
    if 'arcadeRoot' not in result:
        result['arcadeRoot'] = result.get('emuguiRoot', '')
    result.pop('emuguiRoot', None)
    result['schemaVersion'] = 1
    return result


def bindings(host, store, *, apply=False):
    """Resolve exact old pins before promotion; never substitute a target."""
    io = transaction_module()
    config_path = Path(host.CONFIG_PATH).resolve()
    journal = config_path.with_name('bindings-v5-upgrade.json')
    if journal.exists() and apply:
        io.recover(journal)
    config_raw = config_path.read_bytes() if config_path.exists() else None
    config = host._catalogue_binding_module().read_object(config_path, 32 * 1024 * 1024) if config_raw else {}
    store_raw = store.path.read_bytes() if store.path.exists() else None
    current = host._catalogue_binding_module().read_object(store.path, 4 * 1024 * 1024) if store_raw else {
        'schemaVersion': 5, 'revision': 0, 'bindings': {}, 'receipts': {}}
    if store_raw is None and journal.exists():
        raise ValueError('Previously migrated binding store is missing')
    if current.get('schemaVersion') == 5 and 'approvedGames' not in config and 'emuguiRoot' not in config:
        store._validate(current)
        return {'status': 'current', 'bindings': len(current['bindings'])}
    if type(current.get('schemaVersion')) is not int or current['schemaVersion'] not in range(1, 6):
        raise ValueError('Unsupported binding migration baseline')
    converted = deepcopy(current)
    converted['schemaVersion'] = 5
    store._validate(converted)
    older = config.get('approvedGames', {})
    if not isinstance(older, dict) or len(older) + len(converted['bindings']) > 512:
        raise ValueError('Invalid game approval inventory')
    unresolved = 0
    module = host._load_emugui_module() if older else None
    from contextlib import nullcontext
    with module.catalogue_read_snapshot() if module else nullcontext():
        for key, entry in older.items():
            if key in converted['bindings']:
                raise ValueError('Game approval identity collision')
            try:
                selection = {name: entry.get(name, '') for name in ('emulatorId', 'profileId')}
                host._catalogue_binding_module().validate_selection(selection)
                indexed = module.catalogue_game_entry(entry['libraryId'], entry['gameId'])
                plan = module.resolve_catalogue_launch_plan(indexed.base['catalogueId'], selection=selection)
                if plan['collectionId'] != entry['libraryId'] or plan['gameId'] != entry['gameId']:
                    raise ValueError('Changed game identity')
                approval = host._catalogue_binding_module().selected_approval(plan, selection)
            except Exception as error:
                approval = {'mode': 'unresolved', 'previous': deepcopy(entry),
                            'code': host._catalogue_binding_module().error_code(error)}
                unresolved += 1
            converted['bindings'][key] = approval
    converted['revision'] += 1
    store._validate(converted)
    upgraded_config = config_document(config)
    upgraded_config.pop('approvedGames', None)
    result = io.upgrade(journal, [(store.path, store_raw, converted),
                                  (config_path, config_raw, upgraded_config)], apply=apply)
    return {**result, 'bindings': len(converted['bindings']), 'migrated': len(older), 'unresolved': unresolved}
