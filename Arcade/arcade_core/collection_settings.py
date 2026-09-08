"""Scoped library-location preferences; never move media or rewrite identities."""

import hashlib
import json
from pathlib import Path

from arcade_core.catalogue_identity import read_object
from arcade_core.paths import ConfinedRoot


def settings_record(collection):
    fields = {key: str(collection.get(key, '')) for key in ('id', 'name', 'root', 'adapter', 'scummvm_config')}
    revision = hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()
    return {**fields, 'revision': revision}


def validate_settings(config, data, runtime, checkout):
    allowed = {'collection_id', 'revision', 'name', 'root', 'scummvm_config'}
    if set(data) - allowed or not all(isinstance(data.get(key), str) for key in ('collection_id', 'revision', 'name', 'root')):
        raise ValueError('Invalid library settings')
    collection = next((row for row in config['collections'] if row['id'] == data['collection_id']), None)
    if collection is None:
        raise ValueError('The collection is no longer configured')
    if settings_record(collection)['revision'] != data['revision']:
        raise ValueError('Library settings changed in another window. Reopen Settings and try again.')
    name = data['name'].strip()
    root_text = data['root'].strip()
    if not name or len(name) > 160 or not root_text or len(root_text) > 2048 or any(ord(c) < 32 for c in name + root_text):
        raise ValueError('Enter a collection name and an existing library folder')
    root = Path(root_text).expanduser().resolve()
    if not root.is_dir() or root.is_relative_to(checkout.resolve()):
        raise ValueError('Choose an existing library folder outside the Cyrune checkout')
    if any(row['id'] != collection['id'] and Path(row['root']).resolve() == root for row in config['collections']):
        raise ValueError('This folder is already assigned to another collection')
    changed_root = root != Path(collection['root']).resolve()
    proof_path = runtime / 'catalogue-proofs.json'
    if changed_root and proof_path.exists() and collection['id'] in read_object(proof_path, 32 * 1024 * 1024).get('sources', {}):
        raise ValueError('Use Reconnect Collection to move a prepared library and retain its identities')
    updated = {**collection, 'name': name, 'root': str(root)}
    adapter = collection.get('adapter', '')
    if adapter == 'scummvm-config-v1':
        ini_text = data.get('scummvm_config', collection.get('scummvm_config', ''))
        if not isinstance(ini_text, str) or not ini_text.strip() or len(ini_text) > 2048 or any(ord(c) < 32 for c in ini_text):
            raise ValueError('Choose an existing ScummVM configuration file')
        ini = Path(ini_text).expanduser().resolve()
        if not ini.is_file() or ini.is_relative_to(checkout.resolve()):
            raise ValueError('Choose an existing ScummVM configuration file outside the checkout')
        if changed_root or ini != Path(collection['scummvm_config']).resolve():
            from arcade_core.import_scummvm import scummvm_manifest
            scummvm_manifest(collection['id'], root, ini)
        updated['scummvm_config'] = str(ini)
    elif 'scummvm_config' in data:
        raise ValueError('ScummVM configuration only applies to ScummVM libraries')
    if changed_root:
        metadata = ConfinedRoot(root).resolve('collection-metadata.json')
        if adapter == 'atari-st-disks-v1':
            from arcade_core.atari import read_rows
            read_rows(root)
        elif adapter == 'gameboy-cartridges-v1':
            from arcade_core.gameboy import read_rows
            read_rows(root)
        elif metadata.exists():
            document = read_object(metadata, 32 * 1024 * 1024)
            if document.get('adapter') not in (None, '', adapter):
                raise ValueError('This library belongs to a different platform')
    return updated
