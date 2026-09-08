from copy import deepcopy

import pytest

from test_catalogue_bindings import setup as catalogue_setup, read, write

setup = catalogue_setup


def cartridge_plan(env):
    from arcade_core.gameboy import discover
    root = env.source.parent / 'Nintendo'
    for folder in ['GameBoy/Games', 'GameBoy Color/Games', 'GameBoy Advanced/Games']:
        (root / folder).mkdir(parents=True)
    game = root / 'GameBoy Advanced/Games/Advance/Advance (USA).gba'
    game.parent.mkdir()
    game.write_bytes(b'fixture cartridge; never executed')
    write(root / 'collection-metadata.json', discover(root, env.arcade.parse_tosec_name))
    config = read(env.runtime / 'config.json')
    config['collections'].append({'id':'game-boy', 'root':str(root), 'adapter':'gameboy-cartridges-v1',
                                  'default_emulator':'test'})
    config['emulators']['test']['supported_extensions'] = ['.gba']
    write(env.runtime / 'config.json', config)
    service = env.arcade.get_catalogue_service()
    entry = next(e for e in service._entries if e.base['platformId'] == 'game-boy')
    return env.arcade.resolve_catalogue_launch_plan(entry.base['catalogueId'])


def test_private_cartridge_plan_and_saved_version_keep_exact_variant(setup):
    env = setup
    plan = cartridge_plan(env)
    env.module.validate_plan(plan)
    key = env.store.approve_version(plan)
    restored = env.store.resolve(key)
    assert restored['media'] == plan['media']
    assert restored['game']['system'] == 'GBA'
    assert restored['public']['systemId'] == 'game-boy'
    assert env.arcade.COLLECTION != env.source.parent / 'Nintendo'


@pytest.mark.parametrize('field,value', [('system','GB'),('adapter','eightyone'),('label','ZX Spectrum')])
def test_host_rejects_cross_platform_cartridge_plans(setup, field, value):
    env = setup
    plan = deepcopy(cartridge_plan(env))
    if field == 'system':
        plan['game']['system'] = value
    elif field == 'adapter':
        plan['adapterId'] = value
    else:
        plan['public']['systemName'] = value
    with pytest.raises(env.module.BindingError):
        env.module.validate_plan(plan)


def test_gameboy_picker_requires_negotiation_and_binds_exact_cartridge(setup):
    import uuid
    from test_catalogue_bindings import transport_session, native_request
    env = setup
    plan = cartridge_plan(env)
    transport, session_id = transport_session(env)
    transport._supported_gameboy = lambda: True
    assert native_request(transport, session_id, payload={'platformIds':['game-boy']})['ok'] is False
    assert native_request(transport, session_id, 'ENABLE_GAMEBOY')['ok']
    result = native_request(transport, session_id, payload={'platformIds':['game-boy']})
    assert result['ok'] and len(result['entries']) == 1
    entry = result['entries'][0]
    assert entry['catalogueId'] == plan['catalogueId'] and entry['hardwareLabel'] == 'GBA'
    response = native_request(transport, session_id, 'BIND_ENTRIES', {'requestId':str(uuid.uuid4()),
        'entries':[{key:entry[key] for key in ('catalogueId','entryRevision')}]})
    assert response['ok'] and response['results'][0]['ok'], response
    assert str(env.source) not in str(response)
