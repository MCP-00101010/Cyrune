"""Fixed catalogue native protocol, requiring all participant advertisements.

One connection owns one Portal registration. No session handles or private launch
plans are returned to the page. The stdin reader revokes authority on EOF.
"""

from copy import deepcopy
from contextlib import nullcontext
import re
import threading
import time
import unicodedata
import importlib.util
from pathlib import Path
import sys


READS = {"ARCADE_CATALOGUE_SEARCH", "ARCADE_CATALOGUE_GET_ENTRY", "ARCADE_CATALOGUE_GET_ARTWORK"}
OPERATIONS = READS | {"ARCADE_CATALOGUE_BIND_ENTRIES"}
BASE_TEXT = {"title": 160, "platformLabel": 80, "hardwareLabel": 80,
             "editionLabel": 160, "year": 16, "publisher": 160, "artworkRef": 128}
BASE_FIELDS = set(BASE_TEXT) | {"catalogueId", "sourceId", "entryRevision", "platformId", "targetKind", "availability"}
DETAIL_LISTS = {"languages": 16, "countries": 16, "suggestedTags": 80}
AVAILABILITY = {"ready", "available", "source-unavailable", "media-missing", "configuration-required", "unsupported", "review-required"}


class CatalogueTransport:
    def __init__(self, *, bindings, service, resolve, supported, authorize_page, module, clock=time.monotonic, read_scope=nullcontext,
                 supported_scummvm=lambda: False):
        self._bindings, self._service, self._resolve = bindings, service, resolve
        self._supported, self._authorize_page, self._module, self._clock = supported, authorize_page, module, clock
        self._lock = threading.RLock()
        self._session = self._store = None
        self._closed = False
        self._read_scope = read_scope
        self._supported_scummvm = supported_scummvm
        self._scummvm = False

    def _fail(self, code):
        raise self._module.BindingError(code)

    def disconnect(self):
        # Also called by the stdin reader while a bind is resolving its plans.
        with self._lock:
            self._closed = True
            if self._session:
                self._store.disconnect(self._session)

    def _check(self, deadline):
        with self._lock:
            if self._closed or self._session is None:
                self._fail("unauthorized")
            self._store._session(self._session)
        if self._clock() >= deadline:
            self._fail("timeout")

    def _text(self, value, limit):
        if (not isinstance(value, str) or len(value) > limit
                or any(unicodedata.category(c).startswith("C") for c in value)):
            self._fail("review-required")

    def _entry(self, entry, *, detail=False):
        fields = BASE_FIELDS | ({"description", *DETAIL_LISTS} if detail else set())
        if not isinstance(entry, dict) or set(entry) != fields:
            self._fail("review-required")
        for field in ("catalogueId", "sourceId", "entryRevision"):
            if not isinstance(entry[field], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", entry[field]):
                self._fail("review-required")
        for field, limit in BASE_TEXT.items():
            self._text(entry[field], limit)
        spectrum = entry["platformId"] == "zx-spectrum" and entry["platformLabel"] == "ZX Spectrum" and entry["targetKind"] == "media-file"
        scummvm = (self._scummvm and entry["targetKind"] == "scummvm-game"
                   and isinstance(entry["platformId"], str) and entry["platformId"] != "zx-spectrum"
                   and self._module.scummvm_module().PLATFORMS.get(entry["platformId"]) == entry["platformLabel"])
        if (not (spectrum or scummvm) or entry["availability"] not in AVAILABILITY
                or entry["artworkRef"] and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", entry["artworkRef"])):
            self._fail("review-required")
        if detail:
            self._text(entry["description"], 2000)
            for field, limit in DETAIL_LISTS.items():
                if not isinstance(entry[field], list) or len(entry[field]) > 12:
                    self._fail("review-required")
                for value in entry[field]:
                    self._text(value, limit)
        if len(self._module.encoded({key: entry[key] for key in BASE_FIELDS})) > 2048:
            self._fail("review-required")

    def _read(self, operation, payload, deadline):
        if operation == "ARCADE_CATALOGUE_SEARCH":
            if set(payload) - {"query", "platformIds", "pageSize", "cursor", "groupVersions"}:
                self._fail("invalid-request")
            query, cursor = payload.get("query", ""), payload.get("cursor", "")
            platforms, size = payload.get("platformIds", []), payload.get("pageSize", 50)
            if (type(payload.get("groupVersions", False)) is not bool
                    or not isinstance(query, str) or len(query) > 160 or any(unicodedata.category(c).startswith("C") for c in query)
                    or not isinstance(cursor, str) or not cursor.isascii() or len(cursor) > 256
                    or not isinstance(platforms, list) or len(platforms) > 4
                    or any(not isinstance(p, str) or p not in (self._module.scummvm_module().PLATFORMS if self._scummvm else {"zx-spectrum"}) for p in platforms)
                    or len(set(platforms)) != len(platforms)
                    or type(size) is not int or not 1 <= size <= 100):
                self._fail("invalid-request")
        elif operation == "ARCADE_CATALOGUE_GET_ENTRY":
            if (set(payload) != {"catalogueId"} or not isinstance(payload["catalogueId"], str)
                    or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", payload["catalogueId"])):
                self._fail("invalid-request")
        if operation == "ARCADE_CATALOGUE_GET_ARTWORK":
            if (set(payload) != {"catalogueId", "artworkRef"}
                    or any(not isinstance(payload[key], str) for key in payload)
                    or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", payload["catalogueId"])
                    or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", payload["artworkRef"])):
                self._fail("invalid-request")
            name = "_cyrune_host_catalogue_artwork"
            if name not in sys.modules:
                spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("catalogue_artwork.py"))
                module = importlib.util.module_from_spec(spec)
                sys.modules[name] = module
                spec.loader.exec_module(module)
            result = sys.modules[name].read_artwork(self._service(), payload["catalogueId"], payload["artworkRef"],
                bindings=self._module, check=lambda: self._check(deadline))
            if len(self._module.encoded({"ok": True, **result})) > 192 * 1024:
                self._fail("review-required")
            return result
        service = self._service()
        detail = operation == "ARCADE_CATALOGUE_GET_ENTRY"
        response = deepcopy(service.detail(payload) if detail else service.search({**payload, **({"includeScummvm": True} if self._scummvm else {})}))
        fields = {"schemaVersion", "entry"} if detail else {"schemaVersion", "catalogueRevision", "entries", "nextCursor"}
        if not isinstance(response, dict) or set(response) != fields or type(response["schemaVersion"]) is not int or response["schemaVersion"] != 1:
            self._fail("review-required")
        if not detail:
            if (not isinstance(response["catalogueRevision"], str)
                    or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", response["catalogueRevision"])
                    or not isinstance(response["nextCursor"], str) or not response["nextCursor"].isascii()
                    or len(response["nextCursor"]) > 256):
                self._fail("review-required")
        entries = [response["entry"]] if detail else response["entries"]
        if not isinstance(entries, list) or len(entries) > 100:
            self._fail("review-required")
        seen = set()
        for entry in entries:
            self._check(deadline)
            self._entry(entry, detail=detail)
            if detail and entry["catalogueId"] != payload["catalogueId"]:
                self._fail("review-required")
            if entry["catalogueId"] in seen:
                self._fail("review-required")
            seen.add(entry["catalogueId"])
            if entry["availability"] in {"ready", "configuration-required"}:
                try:
                    plan = self._resolve(entry["catalogueId"], entry["entryRevision"])
                    self._module.validate_plan(plan)
                    if plan["catalogueId"] != entry["catalogueId"] or plan["entryRevision"] != entry["entryRevision"]:
                        self._fail("entry-changed")
                    entry["availability"] = "ready"
                except Exception as error:
                    code = self._module.error_code(error)
                    if code in {"entry-changed", "catalogue-changed", "entry-missing", "timeout", "busy"}:
                        self._fail(code)
                    entry["availability"] = {"unsupported-target": "unsupported"}.get(code, code if code in AVAILABILITY else "review-required")
        self._check(deadline)
        # Detect a source or policy change during readiness validation.
        for entry in entries:
            current = self._service().detail({"catalogueId": entry["catalogueId"]})
            if current["entry"]["entryRevision"] != entry["entryRevision"]:
                self._fail("catalogue-changed")
            self._check(deadline)
        if len(self._module.encoded({"ok": True, **response})) > (16 * 1024 if detail else 256 * 1024):
            self._fail("review-required")
        return response

    def handle(self, message):
        try:
            if not isinstance(message, dict) or len(self._module.encoded(message)) > 40 * 1024:
                self._fail("invalid-request")
            operation = message.get("type")
            if not isinstance(operation, str):
                self._fail("invalid-request")
            if type(message.get("protocol")) is not int or message["protocol"] != 1 or not self._supported():
                self._fail("unsupported-protocol")
            if operation == "ARCADE_CATALOGUE_OPEN_SESSION":
                if set(message) != {"type", "protocol", "role", "pageUrl", "tabId"}:
                    self._fail("invalid-request")
                if (message["role"] != "portal" or type(message["tabId"]) is not int or not 0 <= message["tabId"] < 2**31
                        or not isinstance(message["pageUrl"], str) or len(message["pageUrl"]) > 4096
                        or not self._authorize_page(message["pageUrl"])):
                    self._fail("unauthorized")
                with self._lock:
                    if self._closed or self._session:
                        self._fail("unauthorized")
                    self._store = self._bindings()
                    self._session = self._store.register_session("portal", protocol=1)
                    return {"ok": True, "schemaVersion": 1, "sessionId": self._session.id}
            if operation not in OPERATIONS | {"ARCADE_CATALOGUE_ENABLE_SCUMMVM"} or set(message) != {"type", "protocol", "sessionId", "payload"}:
                self._fail("invalid-request")
            if not isinstance(message["payload"], dict) or len(self._module.encoded(message["payload"])) > 32 * 1024:
                self._fail("invalid-request")
            deadline = self._clock() + (30 if operation == "ARCADE_CATALOGUE_BIND_ENTRIES" else 15)
            self._check(deadline)
            if message["sessionId"] != self._session.id:
                self._fail("unauthorized")
            if operation == "ARCADE_CATALOGUE_ENABLE_SCUMMVM":
                if message["payload"] or not self._supported_scummvm():
                    self._fail("unsupported-protocol")
                self._scummvm = True
                return {"ok": True, "schemaVersion": 1}
            if operation == "ARCADE_CATALOGUE_BIND_ENTRIES":
                result = self._store.bind(self._session, message["payload"], deadline=deadline,
                                          **({"allow_scummvm": True} if self._scummvm else {}))
            else:
                with self._read_scope():
                    self._check(deadline)
                    result = self._read(operation, message["payload"], deadline)
            self._check(deadline)
            if len(self._module.encoded({"ok": True, **result})) > 256 * 1024:
                self._fail("review-required")
            return {"ok": True, **result}
        except Exception as error:
            return {"ok": False, "code": self._module.error_code(error)}
