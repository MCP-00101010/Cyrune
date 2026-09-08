"""Account-advertised concurrency; unknown accounts always start with one slot."""
from contextlib import contextmanager
from collections import OrderedDict
import hashlib
import json
import threading


class AccountThreads:
    def __init__(self):
        self.condition = threading.Condition()
        self.accounts = OrderedDict()

    def _key(self, provider):
        return hashlib.sha256(json.dumps([provider.get(key, '') for key in (
            'base_url', 'username', 'password', 'developer_id', 'developer_password')]).encode()).hexdigest()

    def update(self, provider, user):
        if not isinstance(user, dict):
            return
        try:
            allowed = max(1, min(2, int(user.get('maxthreads', 1))))
        except (TypeError, ValueError):
            return
        with self.condition:
            self.accounts.setdefault(self._key(provider), [1, 0])[0] = allowed
            self.condition.notify_all()

    @contextmanager
    def request(self, provider):
        with self.condition:
            key = self._key(provider)
            self.accounts.setdefault(key, [1, 0])
            self.accounts.move_to_end(key)
            while len(self.accounts) > 16:
                idle = next((identity for identity, row in self.accounts.items() if not row[1] and identity != key), None)
                if idle is None:
                    raise ValueError('Provider accounts are busy. Retry shortly.')
                self.accounts.pop(idle)
            row = self.accounts[key]
            self.condition.wait_for(lambda:row[1] < row[0])
            row[1] += 1
        try:
            yield
        finally:
            with self.condition:
                row[1] -= 1
                self.condition.notify_all()
