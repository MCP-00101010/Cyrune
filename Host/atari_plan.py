"""Host's independent checks for Arcade's fixed STEem SSE disk-set launches."""

import hashlib
import os
from pathlib import Path
import re


def validate(plan, bindings):
    fail = bindings.BindingError
    fields = {'schemaVersion', 'catalogueId', 'sourceId', 'entryRevision', 'collectionId', 'gameId',
              'adapterId', 'emulatorId', 'profileId', 'root', 'media', 'disks', 'system',
              'executable', 'executableSignature', 'cwd', 'arguments', 'public'}
    advanced = isinstance(plan, dict) and plan.get('schemaVersion') in (4, 5)
    if advanced:
        fields.add('settings')
    if (not isinstance(plan, dict) or set(plan) != fields or len(bindings.encoded(plan)) > 64 * 1024
            or type(plan['schemaVersion']) is not int or plan['schemaVersion'] not in (3, 4, 5)
            or plan['adapterId'] not in {'steem', 'hatari'} or (plan['adapterId'] == 'hatari') != (plan['schemaVersion'] == 5)
            or (not isinstance(plan['profileId'], str) or not re.fullmatch(r'(?:[a-f0-9]{24})?', plan['profileId']) or not advanced and plan['profileId'] != '')
            or plan['system'] not in ({'ST', 'STe', 'TT', 'Falcon'} if plan['adapterId'] == 'hatari' else {'ST', 'STe'})):
        raise fail('review-required')
    for name in ('catalogueId', 'sourceId', 'entryRevision', 'collectionId', 'gameId', 'emulatorId'):
        if not isinstance(plan[name], str) or not re.fullmatch('[A-Za-z0-9_-]{1,120}', plan[name]):
            raise fail('review-required')
    root, executable, cwd = (bindings._path(plan[name]) for name in ('root', 'executable', 'cwd'))
    if not root.is_dir() or executable.suffix.lower() != '.exe' or cwd != executable.parent or plan['adapterId'] == 'steem' and not (cwd / 'steem.ini').is_file():
        raise fail('configuration-required')
    signature = plan['executableSignature']
    if not isinstance(signature, list) or len(signature) != 4 or any(type(n) is not int or n < 0 for n in signature):
        raise fail('review-required')
    if bindings._signature(executable) != signature:
        raise fail('entry-changed')
    disks = plan['disks']
    if not isinstance(disks, list) or not 1 <= len(disks) <= 30:
        raise fail('review-required')
    targets, proofs = [], []
    for disk in disks:
        if not isinstance(disk, dict) or set(disk) != {'path', 'signature', 'sha256'}:
            raise fail('review-required')
        target = bindings._path(disk['path'])
        if plan['adapterId'] == 'hatari' and target.suffix.lower() == '.stt':
            raise fail('unsupported-target')
        if (target == root or not target.is_relative_to(root) or target.suffix.lower() not in {'.st', '.stx', '.msa', '.dim', '.stt'}
                or target in targets or targets and target.parent != targets[0].parent):
            raise fail('review-required')
        signature = disk['signature']
        if (not isinstance(signature, list) or len(signature) != 4 or any(type(n) is not int or n < 0 for n in signature)
                or not 0 < signature[2] <= 32 * 1024 * 1024 or not isinstance(disk['sha256'], str)
                or not re.fullmatch('[0-9a-f]{64}', disk['sha256'])):
            raise fail('review-required')
        if bindings._signature(target) != signature:
            raise fail('entry-changed')
        if hashlib.sha256(target.read_bytes()).hexdigest() != disk['sha256'] or bindings._signature(target) != signature:
            raise fail('entry-changed')
        targets.append(target)
        proofs.append([target.relative_to(root).as_posix(), disk['sha256']])
    expected = ['OPENNEW', 'INI=' + str(cwd / 'steem.ini'), *[str(p) for p in targets[:2]]]
    settings_proof = None
    if advanced:
        expected, settings_proof = validate_settings(plan, targets, bindings)
    if plan['media'] != str(targets[0]) or plan['arguments'] != expected:
        raise fail('review-required')
    public = plan['public']
    if (not isinstance(public, dict) or set(public) != {'title', 'systemId', 'systemName'}
            or not bindings._text(public['title'], 160) or public['systemId'] != 'atari-st' or public['systemName'] != 'Atari ST'):
        raise fail('review-required')
    return {'mode': 'entry-policy-v1', 'sourceId': plan['sourceId'], 'catalogueId': plan['catalogueId'],
            'mediaSha256': hashlib.sha256(bindings.encoded([proofs, plan['system']] + ([settings_proof] if advanced else []))).hexdigest(),
            'executable': str(executable), 'executableSignature': plan['executableSignature'],
            'adapterId': plan['adapterId'], 'cwd': str(cwd), 'profileTarget': ''}


def validate_settings(plan, targets, bindings):
    fail = bindings.BindingError
    settings = plan['settings']
    if not isinstance(settings, dict) or set(settings) != {'profile', 'profileSignature', 'profileSha256', 'sessionDirectory', 'driveB', 'saveDisk'}:
        raise fail('review-required')
    profile = bindings._path(settings['profile'])
    cwd = bindings._path(plan['cwd'])
    hatari = plan['adapterId'] == 'hatari'
    if plan['profileId']:
        if (profile.parent != (cwd / ('configs' if hatari else 'config')).resolve() or not profile.is_relative_to(cwd)
                or profile.name.startswith('.') or not hatari and profile.suffix.lower() != '.ini'
                or hashlib.sha256(profile.name.casefold().encode()).hexdigest()[:24] != plan['profileId']):
            raise fail('review-required')
    else:
        default = cwd / ('hatari.cfg' if hatari else 'steem.ini')
        if hatari and not default.is_file():
            default = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Hatari' / 'hatari.cfg'
        if profile != default or default.resolve() != default:
            raise fail('review-required')
    if profile.stat().st_size > 1024 * 1024 or bindings._signature(profile) != settings['profileSignature']:
        raise fail('entry-changed')
    if hashlib.sha256(profile.read_bytes()).hexdigest() != settings['profileSha256'] or bindings._signature(profile) != settings['profileSignature']:
        raise fail('entry-changed')
    safe = targets[0].parent / 'Safe Disks'
    session = bindings._path(settings['sessionDirectory'])
    expected_session = safe / '.sessions' / plan['gameId']
    if session != expected_session or session.resolve() != expected_session or not session.is_relative_to(bindings._path(plan['root'])):
        raise fail('review-required')
    drive_b, save_disk = settings['driveB'], settings['saveDisk']
    if not isinstance(drive_b, str) or not isinstance(save_disk, str):
        raise fail('review-required')
    if save_disk:
        path = bindings._path(save_disk)
        if (drive_b != save_disk or path.parent != safe or path.suffix.lower() != '.st'
                or not path.is_file() or not 512 <= path.stat().st_size <= 2 * 1024 * 1024 or path.stat().st_size % 512):
            raise fail('review-required')
    elif drive_b and drive_b not in [str(p) for p in targets]:
        raise fail('review-required')
    expected = ['OPENNEW', 'INI=' + str(session / 'launch.ini'), str(targets[0]), *([drive_b] if drive_b else [])]
    if hatari:
        expected = ['--configfile', str(session / 'launch.cfg'), '--disk-a', str(targets[0])]
        if drive_b:
            expected += ['--disk-b', drive_b]
    return expected, [str(profile), settings['profileSha256'], drive_b, save_disk]
