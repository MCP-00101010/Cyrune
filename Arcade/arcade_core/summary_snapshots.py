"""Compact, revision-aware list responses without weakening exact launch revisions."""
from collections import OrderedDict
import hashlib
import json


class SummarySnapshots:
    def __init__(self):
        self.snapshots = OrderedDict()

    def response(self, scope, games, since=''):
        defaults = {}
        for row in games:
            for key, value in row.items():
                if key not in {'id', 'entry_revision'} and (value is None or value == '' or value == [] or value == () or value is False or type(value) is int and value == 0):
                    defaults.setdefault(key, value)
        current = {row['id']:dict(row) for row in games}
        revision = hashlib.sha256(json.dumps(current, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        previous = self.snapshots.get(scope)
        delta = bool(since and previous and previous[0] == since)
        old = previous[1] if delta else {}
        changed, revisions = [], {}
        for identifier, row in current.items():
            old_row = old.get(identifier, {})
            comparable = {key:value for key,value in row.items() if key != 'entry_revision'}
            old_comparable = {key:value for key,value in old_row.items() if key != 'entry_revision'}
            if not delta or comparable != old_comparable:
                changed.append({key:value for key,value in row.items() if key not in defaults or value != defaults[key]})
            elif row.get('entry_revision') != old_row.get('entry_revision'):
                revisions[identifier] = row.get('entry_revision', '')
        self.snapshots[scope] = (revision, current)
        self.snapshots.move_to_end(scope)
        while len(self.snapshots) > 2 or sum(len(row[1]) for row in self.snapshots.values()) > 60000:
            self.snapshots.popitem(last=False)
        return {'games':changed, 'defaults':defaults, 'delta':delta,
                'removed':list(old.keys() - current.keys()), 'entry_revisions':revisions,
                'revision':revision, 'unchanged':delta and since == revision}
