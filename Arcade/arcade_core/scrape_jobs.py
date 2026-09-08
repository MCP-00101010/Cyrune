"""Bounded read-only provider jobs and sanitized result reuse."""
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import secrets
import threading
import time


class ScrapeJobs:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='Arcade-scraper')
        self.jobs = OrderedDict()
        self.cache = OrderedDict()

    def start(self, collection, work, *, cache_key=None, refresh=False):
        with self.lock:
            now = self.clock()
            for key, row in list(self.jobs.items()):
                if row['future'].done() and now - row['created'] > 180:
                    self.jobs.pop(key, None)
            if len(self.jobs) >= 16 or sum(not row['future'].done() for row in self.jobs.values()) >= 4:
                return {'ok':False, 'error':'Scraping is busy. Retry shortly.', 'retry_after':2}
            cached = self.cache.get(cache_key) if cache_key and not refresh else None
            def run():
                if cached and self.clock() < cached[0]:
                    return deepcopy(cached[1])
                try:
                    result = work()
                    if len(json.dumps(result).encode()) > 6 * 1024 * 1024:
                        return {'ok':False, 'error':'The provider result exceeds the supported size.'}
                    if cache_key and result.get('ok') is not False and result.get('matches'):
                        with self.lock:
                            self.cache[cache_key] = (self.clock() + 1800, deepcopy(result))
                            self.cache.move_to_end(cache_key)
                            while len(self.cache) > 64 or sum(len(json.dumps(row[1])) for row in self.cache.values()) > 8 * 1024 * 1024:
                                self.cache.popitem(last=False)
                    return result
                except Exception:
                    return {'ok':False, 'error':'The provider request failed. Retry shortly.'}
            identifier = secrets.token_urlsafe(18)
            self.jobs[identifier] = {'collection':collection, 'created':now, 'future':self.executor.submit(run)}
            return {'ok':True, 'job_id':identifier, 'collection_id':collection}

    def get(self, identifier, collection):
        with self.lock:
            row = self.jobs.get(identifier)
            if not row or row['collection'] != collection:
                return {'ok':False, 'error':'This scrape request expired. Search again.'}
            if not row['future'].done():
                return {'ok':True, 'status':'running'}
            result = row['future'].result()
            self.jobs.pop(identifier, None)
            return {'ok':True, 'status':'done', 'result':result}
