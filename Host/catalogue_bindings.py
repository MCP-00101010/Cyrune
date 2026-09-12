"""Native Host catalogue approvals and retry receipts; no direct page routes."""

from copy import deepcopy
from contextlib import nullcontext
from dataclasses import dataclass
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import uuid


MAX_BINDINGS = 512
MAX_RECEIPTS_BYTES = 1024 * 1024
MAX_STORE_BYTES = 4 * 1024 * 1024
ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
KEY = re.compile(r"^game_[A-Za-z0-9_-]{12,75}$")
HEX = re.compile(r"^[0-9a-f]{64}$")
CODES = frozenset({"invalid-request", "unsupported-protocol", "unauthorized", "unavailable", "busy", "timeout",
                   "catalogue-changed", "entry-changed", "entry-missing", "source-unavailable", "media-missing",
                   "configuration-required", "unsupported-target", "review-required", "binding-limit",
                   "binding-forgotten", "request-conflict", "persistence-failed"})


class BindingError(ValueError):
    def __init__(self, code):
        self.code = code if code in CODES else "unavailable"
        super().__init__(self.code)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def error_code(error):
    code = getattr(error, "code", None)
    return code if isinstance(code, str) and code in CODES else "unavailable"


def read_object(path, limit):
    try:
        with Path(path).open("rb") as stream:
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise BindingError("review-required")
        def pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise BindingError("review-required")
                result[key] = value
            return result
        def constant(_):
            raise BindingError("review-required")
        value = json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
        if not isinstance(value, dict):
            raise BindingError("review-required")
        return value
    except (OSError, ValueError, RecursionError):
        raise BindingError("review-required") from None


def _text(value, limit):
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        raise BindingError("review-required")
    return value


def _path(value):
    value = _text(value, 4096)
    path = Path(value)
    if not value or not path.is_absolute() or path.resolve() != path:
        raise BindingError("review-required")
    return path


def _signature(path):
    try:
        stat = path.stat()
        if not path.is_file():
            raise BindingError("review-required")
        return [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns]
    except OSError:
        raise BindingError("media-missing") from None


def _hash_media(path):
    before = _signature(path)
    if before[2] > 64 * 1024 * 1024:
        raise BindingError("unsupported-target")
    digest, count = hashlib.sha256(), 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            count += len(block)
            if count > 64 * 1024 * 1024:
                raise BindingError("unsupported-target")
            digest.update(block)
    if _signature(path) != before:
        raise BindingError("entry-changed")
    return digest.hexdigest()


def validate_plan(plan):
    if isinstance(plan, dict) and plan.get('adapterId') in {'steem', 'hatari'}:
        name = '_cyrune_host_atari_plan'
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('atari_plan.py'))
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        return sys.modules[name].validate(plan, sys.modules[__name__])
    """Independently bound and verify Arcade's private native decision."""
    if isinstance(plan, dict) and plan.get("adapterId") == "scummvm":
        return scummvm_module().validate(plan, sys.modules[__name__])
    fields = {"schemaVersion", "catalogueId", "sourceId", "entryRevision", "collectionId", "gameId", "root", "media",
              "mediaSignature", "mediaSha256", "emulatorId", "profileId", "adapterId", "executable", "executableSignature",
              "cwd", "template", "arguments", "profileCopy", "public", "game"}
    if not isinstance(plan, dict) or set(plan) != fields or len(encoded(plan)) > 64 * 1024:
        raise BindingError("review-required")
    if type(plan["schemaVersion"]) is not int or plan["schemaVersion"] != 1:
        raise BindingError("unsupported-protocol")
    for field in ("catalogueId", "sourceId", "entryRevision", "collectionId", "gameId", "emulatorId"):
        if not isinstance(plan[field], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", plan[field]):
            raise BindingError("review-required")
    if not isinstance(plan["profileId"], str) or plan["profileId"] and not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", plan["profileId"]):
        raise BindingError("review-required")
    if plan["adapterId"] not in ("generic", "eightyone", "spectaculator", "spectaculator_stub"):
        raise BindingError("unsupported-target")
    root, media, executable, cwd = (_path(plan[field]) for field in ("root", "media", "executable", "cwd"))
    if not root.is_dir() or not media.is_relative_to(root) or media == root:
        raise BindingError("source-unavailable")
    cartridge = isinstance(plan.get('public'), dict) and plan['public'].get('systemId') == 'game-boy'
    formats = {'.gb', '.gbc', '.gba'} if cartridge else {'.tap', '.tzx', '.z80', '.sna', '.szx'}
    if media.suffix.lower() not in formats or cartridge and plan['adapterId'] != 'generic':
        raise BindingError("unsupported-target")
    if not cwd.is_dir() or executable.suffix.lower() in {".bat", ".cmd", ".ps1", ".sh"}:
        raise BindingError("configuration-required")
    for field in ("mediaSignature", "executableSignature"):
        signature = plan[field]
        if not isinstance(signature, list) or len(signature) != 4 or any(type(n) is not int or n < 0 for n in signature):
            raise BindingError("review-required")
    if _signature(media) != plan["mediaSignature"] or _signature(executable) != plan["executableSignature"]:
        raise BindingError("entry-changed")
    if not isinstance(plan["mediaSha256"], str) or not HEX.fullmatch(plan["mediaSha256"]) or _hash_media(media) != plan["mediaSha256"]:
        raise BindingError("review-required")
    for field in ("template", "arguments"):
        values = plan[field]
        if not isinstance(values, list) or not 1 <= len(values) <= 32:
            raise BindingError("review-required")
        for value in values:
            if not _text(value, 4096):
                raise BindingError("review-required")
    if len(encoded(plan["arguments"])) > 32 * 1024:
        raise BindingError("review-required")
    public = plan["public"]
    if not isinstance(public, dict) or set(public) != {"title", "systemId", "systemName"}:
        raise BindingError("review-required")
    expected_system = ('game-boy', 'Game Boy') if cartridge else ('zx-spectrum', 'ZX Spectrum')
    if not _text(public["title"], 160) or (public['systemId'], public['systemName']) != expected_system:
        raise BindingError("review-required")
    if not isinstance(plan["game"], dict) or set(plan["game"]) != {"title", "system"}:
        raise BindingError("review-required")
    _text(plan["game"]["title"], 160)
    _text(plan["game"]["system"], 80)
    if cartridge and plan['game']['system'] != {'.gb': 'GB', '.gbc': 'GBC', '.gba': 'GBA'}[media.suffix.lower()]:
        raise BindingError('unsupported-target')
    values = {"file": str(media), "file_dir": str(media.parent), "file_name": media.name,
              "collection_root": str(root), "pok_file": "", "title": plan["game"]["title"], "system": plan["game"]["system"]}
    rendered = []
    if not any("{file}" in item for item in plan["template"]):
        raise BindingError("review-required")
    for template in plan["template"]:
        names = re.findall(r"\{([^{}]*)\}", template)
        remainder = re.sub(r"\{[^{}]*\}", "", template)
        if len(template) > 500 or set(names) - set(values) or "{" in remainder or "}" in remainder:
            raise BindingError("review-required")
        rendered.append(re.sub(r"\{([^{}]*)\}", lambda match: values[match[1]], template))
    if rendered != plan["arguments"] or plan["game"]["title"] != public["title"]:
        raise BindingError("review-required")
    profile = plan["profileCopy"]
    if profile is not None:
        if not isinstance(profile, dict) or set(profile) != {"root", "source", "target", "signature"} or plan["adapterId"] != "eightyone":
            raise BindingError("review-required")
        profile_root, source, target = (_path(profile[field]) for field in ("root", "source", "target"))
        if (not source.is_relative_to(profile_root) or source == target or target.is_relative_to(root)
                or target.is_relative_to(Path(__file__).resolve().parents[1])):
            raise BindingError("review-required")
        if target.suffix.lower() not in {".ini", ".cfg"} or _signature(source)[2] > 1024 * 1024:
            raise BindingError("review-required")
        if _signature(source) != profile["signature"]:
            raise BindingError("entry-changed")
    return {
        "mode": "entry-policy-v1", "sourceId": plan["sourceId"], "catalogueId": plan["catalogueId"],
        "mediaSha256": plan["mediaSha256"], "executable": str(executable),
        "executableSignature": plan["executableSignature"], "adapterId": plan["adapterId"], "cwd": str(cwd),
        "profileTarget": profile["target"] if profile else "",
    }


def validate_selection(selection):
    if not isinstance(selection, dict) or set(selection) != {'emulatorId', 'profileId'}:
        raise BindingError('review-required')
    for field, value in selection.items():
        if not isinstance(value, str) or (field == 'emulatorId' or value) and not re.fullmatch(r'[A-Za-z0-9_-]{1,120}', value):
            raise BindingError('review-required')


def selected_approval(plan, selection=None):
    approval = validate_plan(plan)
    if selection is not None:
        validate_selection(selection)
        if plan['emulatorId'] != selection['emulatorId'] or selection['profileId'] and plan['profileId'] != selection['profileId']:
            raise BindingError('configuration-required')
        approval['selection'] = deepcopy(selection)
    return approval


def scummvm_module():
    name = "_cyrune_host_scummvm_plan"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("scummvm_plan.py"))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


@dataclass(eq=False, frozen=True)
class Session:
    id: str
    role: str
    expires: float
    retain_until: int


class CatalogueBindings:
    def __init__(self, path, *, lock, write, resolve, present, execute, clock=time.monotonic, wall_clock=time.time, resolve_scope=nullcontext):
        self.path = Path(path).resolve()
        if self.path.is_relative_to(Path(__file__).resolve().parents[1]):
            raise BindingError("invalid-request")
        self._lock, self._write = lock, write
        self._resolve, self._present, self._execute, self._clock = resolve, present, execute, clock
        self._wall_clock = wall_clock
        self._resolve_scope = resolve_scope
        self._sessions = {}
        self._session_lock = threading.RLock()

    def register_session(self, role, *, protocol=1):
        """Native registration hook only; its object cannot be supplied by a page."""
        if role != "portal":
            raise BindingError("unauthorized")
        if type(protocol) is not int or protocol != 1:
            raise BindingError("unsupported-protocol")
        with self._session_lock:
            self._sessions = {key: value for key, value in self._sessions.items() if value.expires > self._clock()}
            if len(self._sessions) >= 64:
                raise BindingError("busy")
            session = Session(uuid.uuid4().hex, role, self._clock() + 1800, int((self._wall_clock() + 1800) * 1000))
            self._sessions[session.id] = session
            return session

    def disconnect(self, session):
        with self._session_lock:
            if isinstance(session, Session) and self._sessions.get(session.id) is session:
                self._sessions.pop(session.id)

    def _session(self, session):
        with self._session_lock:
            if (not isinstance(session, Session) or self._sessions.get(session.id) is not session
                    or session.expires <= self._clock() or session.retain_until <= self._wall_clock() * 1000 or session.role != "portal"):
                raise BindingError("unauthorized")

    def load(self):
        if not self.path.exists():
            if self.path.with_name("bindings-v5-upgrade.json").exists():
                raise BindingError("review-required")
            receipt = self.path.with_suffix(".migration.json")
            if receipt.exists() and read_object(receipt, 65536).get("status") == "completed":
                raise BindingError("review-required")
            return {"schemaVersion": 5, "revision": 0, "bindings": {}, "receipts": {}}
        value = read_object(self.path, MAX_STORE_BYTES)
        self._validate(value)
        return value

    def _validate(self, value):
        if type(value.get("schemaVersion")) is not int or value["schemaVersion"] != 5:
            raise BindingError("unsupported-protocol")
        if set(value) != {"schemaVersion", "revision", "bindings", "receipts"} or type(value["revision"]) is not int or value["revision"] < 0:
            raise BindingError("review-required")
        bindings, receipts = value["bindings"], value["receipts"]
        if not isinstance(bindings, dict) or len(bindings) > MAX_BINDINGS or not isinstance(receipts, dict) or len(receipts) > 64:
            raise BindingError("review-required")
        for key, entry in bindings.items():
            if not isinstance(key, str) or not KEY.fullmatch(key) or not isinstance(entry, dict):
                raise BindingError("review-required")
            if entry.get('mode') == 'unresolved':
                if set(entry) != {'mode', 'previous', 'code'} or entry['code'] not in CODES or not isinstance(entry['previous'], dict) or len(encoded(entry)) > 65536:
                    raise BindingError('review-required')
                continue
            if 'selection' in entry:
                validate_selection(entry['selection'])
                entry = {field: value for field, value in entry.items() if field != 'selection'}
            if isinstance(entry, dict) and entry.get("mode") == "scummvm-entry-v1":
                fields = {"mode", "sourceId", "catalogueId", "targetDigest", "config", "directory", "directoryIdentity",
                          "executable", "executableSignature", "cwd"}
                if not KEY.fullmatch(key) or set(entry) != fields:
                    raise BindingError("review-required")
                for field in ("sourceId", "catalogueId"):
                    if not isinstance(entry[field], str) or not ID.fullmatch(entry[field]):
                        raise BindingError("review-required")
                if not isinstance(entry["targetDigest"], str) or not HEX.fullmatch(entry["targetDigest"]):
                    raise BindingError("review-required")
                for field in ("config", "directory", "executable", "cwd"):
                    if not isinstance(entry[field], str) or len(entry[field]) > 4096 or not Path(entry[field]).is_absolute():
                        raise BindingError("review-required")
                for field, count in (("executableSignature", 4), ("directoryIdentity", 2)):
                    if not isinstance(entry[field], list) or len(entry[field]) != count or any(type(n) is not int or n < 0 for n in entry[field]):
                        raise BindingError("review-required")
                continue
            fields = {"mode", "sourceId", "catalogueId", "mediaSha256", "executable", "executableSignature", "adapterId", "cwd", "profileTarget"}
            if not KEY.fullmatch(key) or not isinstance(entry, dict) or set(entry) != fields or entry["mode"] != "entry-policy-v1":
                raise BindingError("review-required")
            for field in ("sourceId", "catalogueId"):
                if not isinstance(entry[field], str) or not ID.fullmatch(entry[field]):
                    raise BindingError("review-required")
            if not isinstance(entry["mediaSha256"], str) or not HEX.fullmatch(entry["mediaSha256"]):
                raise BindingError("review-required")
            for field in ("executable", "cwd", "profileTarget"):
                if not isinstance(entry[field], str) or len(entry[field]) > 4096 or (field != "profileTarget" or entry[field]) and not Path(entry[field]).is_absolute():
                    raise BindingError("review-required")
            signature = entry["executableSignature"]
            if not isinstance(signature, list) or len(signature) != 4 or any(type(n) is not int or n < 0 for n in signature):
                raise BindingError("review-required")
            if entry["adapterId"] not in ("generic", "eightyone", "spectaculator", "spectaculator_stub", "steem", "hatari"):
                raise BindingError("review-required")
        if len(encoded(receipts)) > MAX_RECEIPTS_BYTES:
            raise BindingError("busy")
        for session_id, group in receipts.items():
            if (not ID.fullmatch(session_id) or not isinstance(group, dict) or set(group) != {"expiresAt", "requests"}
                    or type(group["expiresAt"]) is not int or not 0 < group["expiresAt"] < 2**53):
                raise BindingError("review-required")
            requests = group["requests"]
            if not isinstance(requests, dict) or len(requests) > 64:
                raise BindingError("review-required")
            for request_id, receipt in requests.items():
                _uuid(request_id)
                if not isinstance(receipt, dict) or set(receipt) != {"digest", "results"} or not isinstance(receipt["digest"], str) or not HEX.fullmatch(receipt["digest"]):
                    raise BindingError("review-required")
                if not isinstance(receipt["results"], list) or not 1 <= len(receipt["results"]) <= 100:
                    raise BindingError("review-required")
                for result in receipt["results"]:
                    if not isinstance(result, dict) or set(result) != {"catalogueId", "key", "code"}:
                        raise BindingError("review-required")
                    if not isinstance(result["catalogueId"], str) or not ID.fullmatch(result["catalogueId"]):
                        raise BindingError("review-required")
                    if not isinstance(result["key"], str) or result["key"] and not KEY.fullmatch(result["key"]):
                        raise BindingError("review-required")
                    if result["code"] not in ("", *CODES) or bool(result["key"]) == bool(result["code"]):
                        raise BindingError("review-required")

    def initialize(self, *, dry_run=True):
        if dry_run:
            return self._initialize(dry_run=True)
        with self._lock():
            return self._initialize(dry_run=False)

    def _initialize(self, *, dry_run):
        name = "_cyrune_host_catalogue_migration"
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / "infrastructure" / "migration.py")
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        runner = sys.modules[name]
        def create():
            state = self.load()
            if not self.path.exists():
                self._write(self.path, state)
        self.load()
        steps = [runner.MigrationStep("01-create-binding-store", create)]
        return runner.run_migration("host-catalogue-bindings", 0, 1, steps, self.path.with_suffix(".migration.json"), dry_run=dry_run)

    def bind(self, session, request, *, deadline=None, allow_scummvm=False, allow_atari=False, allow_gameboy=False):
        self._session(session)
        request = _request(request)
        digest = hashlib.sha256(encoded(request)).hexdigest()
        deadline = min(deadline, self._clock() + 30) if deadline is not None else self._clock() + 30
        with self._lock():
            self._session(session)
            before = self.load()
            state = deepcopy(before)
            existing = state["receipts"].get(session.id, {}).get("requests", {}).get(request["requestId"])
            if existing:
                if existing["digest"] != digest:
                    raise BindingError("request-conflict")
                with self._resolve_scope():
                    return self._response(request["requestId"], existing["results"], state)
            # Other live native connections may own receipts in this file. Their
            # leases check the same wall-clock ceiling before any retry is allowed.
            state["receipts"] = {key: value for key, value in state["receipts"].items()
                                 if value["expiresAt"] > self._wall_clock() * 1000}
            if session.id not in state["receipts"] and len(state["receipts"]) >= 64:
                raise BindingError("busy")
            group = state["receipts"].setdefault(session.id, {"expiresAt": session.retain_until, "requests": {}})
            receipts = group["requests"]
            if len(receipts) >= 64:
                raise BindingError("busy")
            results, plans = [], []
            # Batch only read-only planning. The scope validates all source
            # observations on exit, before initialization, receipts or approvals.
            with self._resolve_scope():
                for selection in request["entries"]:
                    if self._clock() >= deadline:
                        raise BindingError("timeout")
                    catalogue_id = selection["catalogueId"]
                    try:
                        plan = self._resolve(catalogue_id, selection["entryRevision"])
                        if plan.get("adapterId") == "scummvm" and not allow_scummvm:
                            raise BindingError("unsupported-target")
                        if plan.get('public', {}).get('systemId') == 'game-boy' and not allow_gameboy:
                            raise BindingError('unsupported-protocol')
                        if plan.get('adapterId') in {'steem', 'hatari'} and not allow_atari:
                            raise BindingError('unsupported-target')
                        approval = validate_plan(plan)
                        if plan["catalogueId"] != catalogue_id or plan["entryRevision"] != selection["entryRevision"]:
                            raise BindingError("entry-changed")
                        key = next((key for key, entry in state["bindings"].items() if entry == approval), None)
                        if key is None:
                            if len(state["bindings"]) >= MAX_BINDINGS:
                                raise BindingError("binding-limit")
                            key = "game_" + secrets.token_urlsafe(18)
                            while key in state["bindings"]:
                                key = "game_" + secrets.token_urlsafe(18)
                            state["bindings"][key] = approval
                        results.append({"catalogueId": catalogue_id, "key": key, "code": ""})
                        plans.append((len(results) - 1, plan, approval))
                    except Exception as error:
                        results.append({"catalogueId": catalogue_id, "key": "", "code": error_code(error)})
                # Revalidate every successful selection immediately before the write.
                for index, plan, approval in plans:
                    try:
                        if self._clock() >= deadline:
                            raise BindingError("timeout")
                        current = self._resolve(plan["catalogueId"], plan["entryRevision"])
                        if current != plan or validate_plan(current) != approval:
                            raise BindingError("entry-changed")
                    except Exception as error:
                        results[index].update(key="", code=error_code(error))
            retained = set(before["bindings"]) | {result["key"] for result in results if result["key"]}
            state["bindings"] = {key: value for key, value in state["bindings"].items() if key in retained}
            receipts[request["requestId"]] = {"digest": digest, "results": results}
            state["revision"] += 1
            self._validate(state)
            if len(encoded(state)) > MAX_STORE_BYTES:
                raise BindingError("binding-limit")
            presentation = {plan["catalogueId"]: {"title": plan["public"]["title"], "platformId": plan["public"]["systemId"]}
                            for _index, plan, _approval in plans}
            response = self._response(request["requestId"], results, state, presentation)
            try:
                with self._session_lock:
                    self._session(session)
                    if self._clock() >= deadline:
                        raise BindingError("timeout")
                    self.initialize(dry_run=False)
                    # Cooperating native writers share the same lease; guard old writers too.
                    if self.load() != before:
                        raise BindingError("entry-changed")
                    if self._clock() >= deadline:
                        raise BindingError("timeout")
                    self._write(self.path, state)
            except OSError:
                raise BindingError("persistence-failed") from None
            return response

    def _response(self, request_id, results, state, presentation=None):
        output = []
        for result in results:
            item = {"catalogueId": result["catalogueId"], "ok": False}
            if result["code"]:
                item["code"] = result["code"]
            elif result["key"] not in state["bindings"]:
                item["code"] = "binding-forgotten"
            else:
                try:
                    public = presentation[result["catalogueId"]] if presentation is not None else self._present(result["catalogueId"])
                    title = _text(public["title"], 160)
                    platform = public.get("platformId")
                    platforms = {**scummvm_module().PLATFORMS, 'game-boy':'Game Boy'}
                    if not title or not isinstance(platform, str) or platform not in platforms:
                        raise BindingError("review-required")
                    item.update(ok=True, game={"gameKey": result["key"], "state": "ready", "title": title,
                                              "systemId": platform, "systemName": platforms[platform], "tags": []})
                except Exception as error:
                    item["code"] = error_code(error)
            output.append(item)
        response = {"schemaVersion": 1, "requestId": request_id, "results": output}
        if len(encoded(response)) > 256 * 1024:
            raise BindingError("review-required")
        return response

    def _selected_plan(self, catalogue_id, revision, selection):
        if selection is None:
            return self._resolve(catalogue_id, revision)
        validate_selection(selection)
        return self._resolve(catalogue_id, revision, selection=selection)

    def resolve(self, key):
        if not isinstance(key, str) or not KEY.fullmatch(key):
            raise BindingError("invalid-request")
        state = self.load()
        approval = state["bindings"].get(key)
        if approval is None:
            raise BindingError("binding-forgotten")
        try:
            if approval['mode'] == 'unresolved':
                raise BindingError(approval['code'])
            selection = approval.get('selection')
            plan = self._selected_plan(approval["catalogueId"], None, selection)
            if selected_approval(plan, selection) != approval:
                raise BindingError("review-required")
            return plan
        except Exception as error:
            raise BindingError(error_code(error)) from None

    def approve_arcade_scummvm(self, plan, *, game_key=""):
        if plan.get("adapterId") != "scummvm":
            raise BindingError("unsupported-target")
        return self.approve_version(plan, game_key=game_key)

    def approve_version(self, plan, *, game_key="", selection=None):
        """Existing authenticated Arcade single-game Send/rebind route only.

        Reuse the independent plan checks, quota and atomic store. This does
        not expose catalogue publication or permit Arcade to pick destinations.
        """
        with self._lock():
            with self._resolve_scope():
                approval = selected_approval(plan, selection)
                state = self.load()
                before = deepcopy(state)
                if game_key:
                    if game_key not in state["bindings"]:
                        raise BindingError("binding-forgotten")
                    key = game_key
                else:
                    key = next((key for key, row in state["bindings"].items() if row == approval), None)
                    if key is None:
                        if len(state["bindings"]) >= MAX_BINDINGS:
                            raise BindingError("binding-limit")
                        key = "game_" + secrets.token_urlsafe(18)
                        while key in state["bindings"]:
                            key = "game_" + secrets.token_urlsafe(18)
                current = self._selected_plan(plan["catalogueId"], plan["entryRevision"], selection)
                if current != plan or selected_approval(current, selection) != approval:
                    raise BindingError("entry-changed")
            if state["bindings"].get(key) == approval:
                return key
            if game_key:
                for group in state["receipts"].values():
                    for receipt in group["requests"].values():
                        for result in receipt["results"]:
                            if result["key"] == key:
                                result.update(key="", code="binding-forgotten")
            state["bindings"][key] = approval
            state["revision"] += 1
            self._validate(state)
            if len(encoded(state)) > MAX_STORE_BYTES:
                raise BindingError("binding-limit")
            self.initialize(dry_run=False)
            if self.load() != before:
                raise BindingError("entry-changed")
            self._write(self.path, state)
            return key

    def refresh_atari_policy(self, plan):
        """Explicit Arcade Properties Save may update existing exact-entry approvals."""
        if plan.get('adapterId') not in {'steem', 'hatari'}:
            raise BindingError('unsupported-target')
        with self._lock():
            approval = validate_plan(plan)
            before = self.load()
            after = deepcopy(before)
            for key, row in after['bindings'].items():
                if row.get('adapterId') in {'steem', 'hatari'} and row['sourceId'] == plan['sourceId'] and row['catalogueId'] == plan['catalogueId']:
                    after['bindings'][key] = approval
            if after != before:
                with self._resolve_scope():
                    if self._resolve(plan['catalogueId'], plan['entryRevision']) != plan:
                        raise BindingError('entry-changed')
                after['revision'] += 1
                self._validate(after)
                self._write(self.path, after)
            return before, after

    def launch(self, key):
        with self._lock():
            plan = self.resolve(key)
            try:
                selection = self.load()['bindings'][key].get('selection')
                return self._execute(plan, selection=selection) if selection is not None else self._execute(plan)
            except Exception as error:
                raise BindingError(error_code(error)) from None

    def forget(self, key):
        if not isinstance(key, str) or not KEY.fullmatch(key):
            raise BindingError("invalid-request")
        with self._lock():
            state = self.load()
            if state["bindings"].pop(key, None) is None:
                return False
            for group in state["receipts"].values():
                for receipt in group["requests"].values():
                    for result in receipt["results"]:
                        if result["key"] == key:
                            result.update(key="", code="binding-forgotten")
            state["revision"] += 1
            self._validate(state)
            try:
                self._write(self.path, state)
            except OSError:
                raise BindingError("persistence-failed") from None
            return True


def _uuid(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, AttributeError):
        raise BindingError("invalid-request") from None


def _request(request):
    if not isinstance(request, dict) or set(request) != {"requestId", "entries"}:
        raise BindingError("invalid-request")
    _uuid(request["requestId"])
    entries = request["entries"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
        raise BindingError("invalid-request")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"catalogueId", "entryRevision"}:
            raise BindingError("invalid-request")
        for value in entry.values():
            if not isinstance(value, str) or not ID.fullmatch(value):
                raise BindingError("invalid-request")
        if entry["catalogueId"] in seen:
            raise BindingError("invalid-request")
        seen.add(entry["catalogueId"])
    if len(encoded(request)) > 32 * 1024:
        raise BindingError("invalid-request")
    return {"requestId": request["requestId"], "entries": [
        {"catalogueId": entry["catalogueId"], "entryRevision": entry["entryRevision"]} for entry in entries]}
