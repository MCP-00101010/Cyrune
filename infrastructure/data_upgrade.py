"""Recoverable native JSON upgrades. Journals and originals stay beside the data.

Callers supply their own authority lock and validate every converted document.
A prepared journal is a redo transaction: interruption never loses originals.
"""
import hashlib
import json
import os
from pathlib import Path
import tempfile


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def replace_bytes(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.upgrade-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode('utf-8')


def upgrade(journal, changes, *, apply=False):
    """changes: [(absolute path, observed bytes or None, validated new object)]."""
    journal = Path(journal).resolve()
    if journal.exists():
        record = json.loads(journal.read_text(encoding='utf-8'))
        if record['status'] == 'prepared':
            if not apply:
                raise ValueError('An interrupted data upgrade needs recovery first')
            recover(journal)
        # Each format cutover gets a distinct journal; never overwrite originals.
        if changes:
            for path, _before, value in changes:
                if Path(path).read_bytes() != encode(value):
                    raise ValueError('A completed upgrade cannot be reapplied to different data')
        return {'status': 'completed', 'files': len(record['files'])}
    entries = []
    for index, (path, before, value) in enumerate(changes):
        path = Path(path).resolve()
        after = encode(value)
        if before == after:
            continue
        current = path.read_bytes() if path.exists() else None
        if current != before:
            raise ValueError('Data changed while preparing its upgrade')
        entries.append((path, before, after, index))
    if not apply:
        return {'status': 'dry-run', 'files': len(entries)}
    archive = journal.with_suffix('.data')
    archive.mkdir(parents=True, exist_ok=True)
    records = []
    for path, before, after, index in entries:
        original, staged = archive / f'{index}.original', archive / f'{index}.current'
        if before is not None:
            replace_bytes(original, before)
            if original.read_bytes() != before:
                raise ValueError('Upgrade backup verification failed')
        replace_bytes(staged, after)
        records.append({'path': str(path), 'before': digest(before) if before is not None else None,
                        'after': digest(after), 'original': str(original), 'staged': str(staged)})
    record = {'schemaVersion': 1, 'status': 'prepared', 'files': records}
    replace_bytes(journal, encode(record))
    recover(journal)
    return {'status': 'completed', 'files': len(records)}


def recover(journal):
    journal = Path(journal)
    record = json.loads(journal.read_text(encoding='utf-8'))
    if record['status'] == 'completed':
        return
    # Check the entire transaction before promoting any further document.
    for item in record['files']:
        path = Path(item['path'])
        observed = digest(path.read_bytes()) if path.exists() else None
        if observed not in (item['before'], item['after']):
            raise ValueError('Upgrade recovery found concurrent changes; originals retained')
        if digest(Path(item['staged']).read_bytes()) != item['after']:
            raise ValueError('Upgrade staged file failed verification')
        if item['before'] is not None and digest(Path(item['original']).read_bytes()) != item['before']:
            raise ValueError('Upgrade original failed verification')
    for item in record['files']:
        replace_bytes(item['path'], Path(item['staged']).read_bytes())
    record['status'] = 'completed'
    replace_bytes(journal, encode(record))
