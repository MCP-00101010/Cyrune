"""Bounded native Arcade responses; an active transfer is never evicted."""
import base64
import json
import re
import secrets
import time


class TransferStore:
    def __init__(self, records, *, max_transfers=4, max_bytes=32 * 1024 * 1024, chunk_bytes=384 * 1024, ttl=120):
        self.records = records
        self.max_transfers, self.max_bytes, self.chunk_bytes, self.ttl = max_transfers, max_bytes, chunk_bytes, ttl

    def cleanup(self, now=None):
        now = time.monotonic() if now is None else now
        for key, value in list(self.records.items()):
            if now - value['createdAt'] > self.ttl:
                self.records.pop(key, None)

    def available(self):
        self.cleanup()
        if len(self.records) >= self.max_transfers:
            raise ValueError('Arcade transfers are busy. Wait for current requests to finish and retry.')

    def read(self, identifier, offset=0):
        if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,80}', identifier):
            raise ValueError('The Cyrune Arcade transfer ID is invalid')
        self.cleanup()
        record = self.records.get(identifier)
        if not record:
            raise ValueError('The Cyrune Arcade transfer expired or is unknown')
        if type(offset) is not int or not 0 <= offset <= len(record['data']):
            raise ValueError('The Cyrune Arcade transfer offset is invalid')
        data = record['data']
        end = min(len(data), offset + self.chunk_bytes)
        result = {'transferId':identifier, 'chunk':base64.b64encode(data[offset:end]).decode('ascii'),
                  'nextOffset':end, 'totalSize':len(data), 'done':end >= len(data)}
        if result['done']:
            self.records.pop(identifier, None)
        return result

    def start(self, payload):
        self.available()
        data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        if len(data) > self.max_bytes:
            raise ValueError('The Cyrune Arcade response is too large')
        identifier = secrets.token_urlsafe(18)
        self.records[identifier] = {'data':data, 'createdAt':time.monotonic()}
        return self.read(identifier)
