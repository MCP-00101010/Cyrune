from __future__ import annotations

import base64
import csv
import datetime as dt
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import tkinter as tk
import webbrowser
from copy import deepcopy
from dataclasses import asdict
from functools import wraps
from pathlib import Path
from tkinter import filedialog
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import Request, build_opener, urlopen

from arcade_core.collection_loading import (
    CollectionLoader,
)
from arcade_core.collection_loading import (
    import_match_summary as core_import_match_summary,
)
from arcade_core.collection_loading import (
    mark_import_view_matches as core_mark_import_view_matches,
)
from arcade_core.collections import CollectionService
from arcade_core.collections import file_count_in_tree as core_file_count_in_tree
from arcade_core.emulators import (
    EmulatorConfigError,
    EmulatorConfigService,
    load_emulator_defaults,
)
from arcade_core.jobs import BackgroundJobService
from arcade_core.launching import (
    GameLaunchService,
    bring_window_to_front,
    find_running_emulator_window,
    focus_launched_emulator,
    launch_visible,
    prepare_eightyone_profile,
    should_check_immediate_exit,
)
from arcade_core.library import Game, GameLibrary
from arcade_core.metadata import MetadataService
from arcade_core.paths import ConfinedRoot, PathConfinementError, relative_to_root, resolve_within
from arcade_core.persistence import atomic_write_json, read_json_object
from arcade_core.profiles import EmulatorProfileService
from arcade_core.scraping import ScraperAdapter, ScraperService
from arcade_core.scrape_platforms import platform_options, platform_override
from arcade_core.screenscraper import (
    ART_PREFIX as SCREENSCRAPER_ART_PREFIX,
    ScreenScraperRedirectHandler,
    RequestQuota,
    artwork_parts as screenscraper_artwork_parts,
    media_reference as screenscraper_media_reference,
    system_id as screenscraper_system_id,
)
from arcade_core.secrets import SCRAPER_SECRET_FIELDS, ScraperSecretService
from arcade_core.service import ReadOnlyArcadeService, ServiceContractError

from arcade_core.tosec import (
    ARTICLE_PREFIXES,
    ARTICLE_SUFFIX_TO_PREFIX,
    COUNTRY_NAMES,
    COUNTRY_TO_DEFAULT_LANGUAGE,
    LANGUAGE_ALIASES,
    LANGUAGE_NAMES,
    article_sort_title,
    build_tosec_file_name,
    build_tosec_flags,
    build_tosec_tags,
    clean_file_name,
    clean_metadata_text,
    dedupe,
    display_title_from_tosec,
    folder_letter,
    format_languages,
    is_country_token,
    is_language_token,
    is_metadata_tag,
    is_placeholder_metadata_value,
    normalize_code_values,
    normalize_text_list,
    normalize_title,
    parse_country_tag,
    parse_language_tag,
    parse_report_language,
    parse_system_tag,
    parse_tosec_name,
    tosec_title_from_display
)

from arcade_core.provider_metadata import (
    choose_genre,
    choose_localized_text,
    extract_year,
    gameYear_py,
    nested_text,
    screenscraper_assets,
    screenscraper_candidate,
    screenscraper_confidence,
    simplified_scrape_title
)

LAUNCHER = Path(__file__).resolve().parent


def default_runtime_data_root() -> Path:
    override = str(os.environ.get("CYRUNE_ARCADE_DATA", "") or "").strip()
    if override:
        return Path(os.path.expandvars(override)).expanduser().resolve()
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base).expanduser() / "Cyrune" / "Arcade"


DEFAULT_COLLECTION_ROOT = Path(
    os.environ.get("CYRUNE_ARCADE_COLLECTION")
    or os.environ.get("MORPHEUS_EMUGUI_COLLECTION")
    or r"E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection"
).expanduser()
DESASTERON_COLLECTION = DEFAULT_COLLECTION_ROOT
COLLECTIONS_BASE = Path(
    os.environ.get("CYRUNE_ARCADE_COLLECTIONS_BASE")
    or os.environ.get("MORPHEUS_EMUGUI_COLLECTIONS_BASE")
    or str(DESASTERON_COLLECTION.parent)
).expanduser()
COLLECTION = DESASTERON_COLLECTION
REPORTS = COLLECTION / "_reports"
WEB = LAUNCHER / "web"
DATA = default_runtime_data_root()
EMULATOR_PROFILE_DIR = DATA / "emulator-profiles"
STATE_FILE = DATA / "state.json"
LOG_FILE = DATA / "logs" / "launcher.log"
CONFIG_FILE = DATA / "config.json"
METADATA_FILE = COLLECTION / "collection-metadata.json"
DEFAULT_EMULATORS = load_emulator_defaults(LAUNCHER / "defaults" / "emulators.json")

from arcade_core.collection_cache import CollectionCache
from arcade_core.file_cache import FileCache
from arcade_core.summary_snapshots import SummarySnapshots
SUMMARY_SNAPSHOTS = SummarySnapshots()
COLLECTION_CACHE = CollectionCache()
POK_CACHE = FileCache()
from arcade_core.scrape_jobs import ScrapeJobs
SCRAPE_JOBS = ScrapeJobs()
JOB_SERVICE = BackgroundJobService()
METADATA_SERVICE: MetadataService | None = None
COLLECTION_JOB_LOCK = threading.RLock()
TGDB_LOOKUP_CACHE: dict[tuple[str, str], dict[str, str]] = {}
SCREENSCRAPER_LOCK = threading.Lock()
SCREENSCRAPER_QUOTA = RequestQuota()
from arcade_core.provider_threads import AccountThreads
SCREENSCRAPER_THREADS = AccountThreads()
screenscraper_open = build_opener(ScreenScraperRedirectHandler()).open
STATE_LOCK = threading.RLock()
DEFAULT_SCRAPERS = {
    "manual": {
        "id": "manual",
        "name": "Manual Metadata",
        "type": "manual",
        "enabled": True,
        "configured": True,
        "supports_assets": False,
    },
    "screenscraper": {
        "id": "screenscraper",
        "name": "ScreenScraper",
        "type": "screenscraper",
        "enabled": False,
        "configured": False,
        "supports_assets": True,
        "base_url": "https://api.screenscraper.fr/api2",
        "username": "",
        "developer_id": "",
        "system_id": "76",
        "softname": "DesasteronSpectrumLauncher",
        "preferred_language": "en",
        "preferred_region": "wor",
    },
    "thegamesdb": {
        "id": "thegamesdb",
        "name": "TheGamesDB",
        "type": "thegamesdb",
        "enabled": False,
        "configured": False,
        "supports_assets": True,
        "base_url": "https://api.thegamesdb.net/v1",
        "platform_id": "4913",
    },
}
SCRAPER_SECRET_SERVICE = ScraperSecretService()
EMULATOR_CONFIG_SERVICE: EmulatorConfigService | None = None
OPTIONAL_NETWORK_ALLOWED = lambda: True

CATALOGUE_LIFECYCLE = None
CATALOGUE_RUNTIME_KEY = None
LIBRARY_CATALOGUE = None
LIBRARY_CATALOGUE_KEY = None


def get_library_catalogue():
    """Native metadata index shared by Portal browsing and entry-policy launch."""
    global LIBRARY_CATALOGUE, LIBRARY_CATALOGUE_KEY
    key = (DATA.resolve(), CONFIG_FILE.resolve())
    if LIBRARY_CATALOGUE is None or LIBRARY_CATALOGUE_KEY != key:
        from arcade_core.catalogue_library import LibraryCatalogue
        LIBRARY_CATALOGUE = LibraryCatalogue(*key)
        LIBRARY_CATALOGUE_KEY = key
    return LIBRARY_CATALOGUE


def get_catalogue_lifecycle(*, create=False):
    """Load native lifecycle support only for explicitly prepared runtime data."""
    global CATALOGUE_LIFECYCLE, CATALOGUE_RUNTIME_KEY
    key = (DATA.resolve(), CONFIG_FILE.resolve())
    if not create and not any((DATA / name).exists() for name in ("catalogue-proofs.json", "catalogue-transaction.json")):
        return None
    if CATALOGUE_LIFECYCLE is None or CATALOGUE_RUNTIME_KEY != key:
        from arcade_core.catalogue_lifecycle import CatalogueLifecycle
        CATALOGUE_LIFECYCLE = CatalogueLifecycle(*key)
        CATALOGUE_RUNTIME_KEY = key
    return CATALOGUE_LIFECYCLE


def invalidate_catalogue():
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None:
        lifecycle.invalidate()


def _catalogue_serialized(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        with COLLECTION_JOB_LOCK:
            lifecycle = get_catalogue_lifecycle()
            if lifecycle is not None:
                with lifecycle.mutation(COLLECTION):
                    return function(*args, **kwargs)
            return function(*args, **kwargs)
    return invoke


def before_catalogue_move(source, destination):
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None:
        lifecycle.stage_move(COLLECTION, source, destination)


def _maintenance_serialized(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        with COLLECTION_JOB_LOCK:
            return function(*args, **kwargs)
    return invoke


@_maintenance_serialized
def prepare_catalogue_source(collection_id, *, dry_run=True):
    """Native maintenance only; deliberately absent from all API dispatchers."""
    result = get_catalogue_lifecycle(create=True).prepare_source(collection_id, dry_run=dry_run)
    if not dry_run and LIBRARY is not None:
        LIBRARY.rebuild()
    return result


@_maintenance_serialized
def catalogue_preparation_request(data, *, confirm=False):
    """Fixed Arcade-only review/apply surface; never accepts a root or policy."""
    from arcade_core.catalogue_identity import CatalogueError, valid_id

    expected = {"collection_id", "review_token"} if confirm else {"collection_id"}
    if set(data) != expected or not valid_id(data.get("collection_id"), legacy=True):
        return {"ok": False, "code": "invalid-request", "error": "Invalid catalogue preparation request."}
    try:
        lifecycle = get_catalogue_lifecycle(create=True)
        if confirm:
            result = lifecycle.confirm_preparation(data["collection_id"], data["review_token"])
            if LIBRARY is not None:
                LIBRARY.rebuild()
            return {"ok": True, "status": result["status"], "entries": result["entries"]}
        return {"ok": True, **lifecycle.review_preparation(data["collection_id"])}
    except (CatalogueError, OSError, ValueError) as error:
        code = error.code if isinstance(error, CatalogueError) else "source-unavailable"
        messages = {
            "busy": "Preparation is busy or a transaction needs recovery. Try again after it is resolved.",
            "entry-changed": "The collection changed. Review preparation again before confirming.",
            "review-required": "A fresh review is required. Check writable access, metadata and retained media if review fails.",
            "media-missing": "A game file is missing. Restore the file before preparing this collection.",
            "unsupported-target": "This preparation supports managed Spectrum tape and snapshot files only.",
            "persistence-failed": "Preparation could not finish. Review the collection again to check its state.",
        }
        return {"ok": False, "code": code, "error": messages.get(code, "The collection cannot be prepared. Check its availability and metadata.")}


@_maintenance_serialized
def reattach_catalogue_source(collection_id, root, *, dry_run=True):
    result = get_catalogue_lifecycle(create=True).reattach_source(collection_id, root, dry_run=dry_run)
    if not dry_run and LIBRARY is not None:
        LIBRARY.rebuild()
    return result


@_maintenance_serialized
def recover_catalogue_transaction(*, direction="forward", dry_run=True):
    result = get_catalogue_lifecycle(create=True).recover(direction=direction, dry_run=dry_run)
    if not dry_run and LIBRARY is not None:
        LIBRARY.rebuild()
    return result


@_maintenance_serialized
def catalogue_recovery_request(action, data):
    from arcade_core.catalogue_identity import CatalogueError

    expected = {"status": set(), "preview": {"direction"}, "confirm": {"review_token"}}[action]
    if set(data) != expected:
        return {"ok": False, "code": "invalid-request", "error": "Invalid catalogue recovery request."}
    try:
        review = get_catalogue_lifecycle(create=True).recovery_review
        if action == "status":
            result = review.status()
        elif action == "preview":
            result = review.preview(data["direction"])
        else:
            result = review.confirm(data["review_token"])
            # The page explicitly reloads the library after repair; a library or
            # credential failure must not disguise a successfully persisted repair.
            invalidate_catalogue()
            reset_catalogue_library()
        return {"ok": True, **result}
    except (CatalogueError, OSError, ValueError) as error:
        code = error.code if isinstance(error, CatalogueError) else "persistence-failed"
        message = {
            "entry-changed": "Recovery inputs changed or conflict with the saved transaction. Preserve your files and review again after resolving the conflict.",
            "review-required": "Review recovery again. If review fails, check writable access and inspect the saved transaction and recovery record.",
            "busy": "Collection maintenance is busy. Try recovery again when it finishes.",
            "persistence-failed": "Recovery could not finish. Review again to resume the same recovery choice.",
            "source-unavailable": "The collection is unavailable. Restore access to its configured location before reviewing recovery.",
        }.get(code, "Recovery is unavailable. Check the collection and saved transaction before trying again.")
        return {"ok": False, "code": code, "error": message}


def reset_catalogue_library(old_root=None, new_root=None):
    global LIBRARY, METADATA_SERVICE, COLLECTION, REPORTS, METADATA_FILE
    LIBRARY = None
    METADATA_SERVICE = None
    if old_root is not None and COLLECTION.resolve() == old_root:
        COLLECTION = new_root
        REPORTS = COLLECTION / "_reports"
        METADATA_FILE = COLLECTION / "collection-metadata.json"


def catalogue_reattachment_request(action, data):
    from arcade_core.catalogue_identity import CatalogueError, valid_id
    expected = {"sources": set(), "select": {"kind", "collection_id"},
                "preview": {"selection_token"}, "confirm": {"review_token"}}[action]
    if set(data) != expected or (action == "select" and not valid_id(data.get("collection_id"), legacy=True)):
        return {"ok": False, "code": "invalid-request", "error": "Invalid collection reconnect request."}
    try:
        review = get_catalogue_lifecycle(create=True).reattachment_review
        if action == "select":
            def choose_folder():
                selected = pick_path("folder", "Select the relocated collection folder")
                if selected.get("cancelled"):
                    return None
                if selected.get("ok") is not True:
                    raise CatalogueError("unavailable")
                if not isinstance(selected.get("path"), str) or not selected["path"]:
                    raise CatalogueError("unavailable")
                return selected["path"]
            # Uses the existing long-lived native picker route. No page path,
            # title or initial directory is accepted by this fixed purpose.
            result = review.select(data["collection_id"], choose_folder)
        else:
            with COLLECTION_JOB_LOCK:
                if action == "sources":
                    result = review.sources()
                elif action == "preview":
                    result = review.preview(data["selection_token"])
                else:
                    result = review.confirm(data["review_token"])
                    reset_catalogue_library(result.pop("_oldRoot"), result.pop("_root"))
                    invalidate_catalogue()
        return {"ok": True, **result}
    except (CatalogueError, OSError, ValueError) as error:
        code = error.code if isinstance(error, CatalogueError) else "source-unavailable"
        message = {
            "entry-changed": "The source or selected folder changed. Choose the folder again and review it.",
            "review-required": "Choose and review the folder again. It must retain the prepared game IDs and original file contents, with writable access enabled.",
            "media-missing": "The selected folder is missing a retained game file. Restore it before reconnecting.",
            "busy": "Collection maintenance or another folder selection is in progress. Try again when it finishes.",
            "persistence-failed": "Reconnection could not finish. Open Catalogue Recovery to check interrupted work before trying again.",
        }.get(code, "The selected collection cannot be reconnected. Check its folder and managed metadata.")
        return {"ok": False, "code": code, "error": message}


def catalogue_read_snapshot():
    """Private Host read/plan lease; exit and validate before approval or launch writes."""
    from contextlib import contextmanager

    @contextmanager
    def scope():
        with COLLECTION_JOB_LOCK:
            lifecycle = get_library_catalogue()
            with lifecycle.read_snapshot():
                yield
    return scope()


def get_catalogue_service():
    return get_library_catalogue().service()


ARCADE_SCUMMVM_VERSION = 1
ARCADE_ATARI_VERSION = 1
ARCADE_GAMEBOY_VERSION = 1
DISK_SET_LAUNCH = None
GAME_PROPERTIES_SERVICE = None
GAME_PROPERTIES_ACCESS = None
GAME_PROPERTIES_APPROVE = None
SCUMMVM_LAUNCH = None  # Host injects native process authority when loading this service.
VERSION_APPROVE = None  # Explicit default selection only; Host owns approvals.


def catalogue_game_entry(collection_id, game_id):
    service = get_catalogue_service()
    service.search({"includeScummvm": True, "pageSize": 1})
    entry = next((entry for entry in service._entries
                  if entry.collection_id == collection_id and entry.legacy_id == game_id), None)
    if entry is None:
        from arcade_core.catalogue_identity import CatalogueError
        raise CatalogueError("entry-missing")
    return entry


def set_game_version_default(anchor_id, catalogue_id, entry_revision):
    from arcade_core.catalogue_identity import CatalogueError, valid_id
    if not all(valid_id(value) for value in (anchor_id, catalogue_id, entry_revision)):
        raise CatalogueError("invalid-request")
    with COLLECTION_JOB_LOCK:
        with catalogue_read_snapshot():
            group, members, _default, _saved = get_catalogue_service().family(anchor_id)
            if catalogue_id not in {entry.base["catalogueId"] for entry in members}:
                raise CatalogueError("invalid-request")
            plan = resolve_catalogue_launch_plan(catalogue_id, entry_revision)
        if not callable(VERSION_APPROVE):
            raise CatalogueError("unavailable")
        key = VERSION_APPROVE(plan)
        # Recheck membership and the immutable plan after native approval.
        with catalogue_read_snapshot():
            current_group, _members, _default, _saved = get_catalogue_service().family(catalogue_id)
            if current_group != group or resolve_catalogue_launch_plan(catalogue_id, entry_revision) != plan:
                raise CatalogueError("entry-changed")
        get_library_catalogue().version_defaults.save(group, catalogue_id, key)
        return {"ok": True}


def game_version_summaries(games):
    service = get_catalogue_service()
    service.search({"includeScummvm": True, "pageSize": 1})
    collection_id = active_collection()["id"]
    indexed = {entry.legacy_id: entry for entry in service._entries if entry.collection_id == collection_id}
    defaults = service.version_defaults()
    for game in games:
        entry = indexed.get(game["id"])
        if not entry or game.get("view") in {"incoming", "trash"}:
            continue
        group = service._entry_families[entry.base["catalogueId"]]
        members = service._families[group]
        default_id = defaults.get(group, {}).get("catalogueId", members[0].base["catalogueId"])
        default = next((row for row in members if row.base["catalogueId"] == default_id), None)
        game.update(version_group=group, version_count=len(members),
                    default_version=default.legacy_id if default else "",
                    catalogue_id=entry.base["catalogueId"], entry_revision=entry.base["entryRevision"])
    return games


def resolve_scummvm_game_plan(collection_id, game_id, emulator_id="", profile_id=""):
    from arcade_core.catalogue_identity import CatalogueError
    with catalogue_read_snapshot():
        service = get_catalogue_service()
        service.search({"includeScummvm": True, "pageSize": 1})
        entry = next((entry for entry in service._entries
                      if entry.collection_id == collection_id and entry.legacy_id == game_id
                      and entry.base["targetKind"] == "scummvm-game"), None)
        if entry is None:
            raise CatalogueError("entry-missing")
        plan = resolve_catalogue_launch_plan(entry.base["catalogueId"])
        if profile_id or emulator_id and emulator_id != plan["emulatorId"]:
            raise CatalogueError("configuration-required")
        return plan


def resolve_atari_game_plan(collection_id, game_id, emulator_id="", profile_id=""):
    from arcade_core.catalogue_identity import CatalogueError
    entry = catalogue_game_entry(collection_id, game_id)
    if entry.base['targetKind'] != 'disk-set':
        raise CatalogueError('unsupported-target')
    plan = resolve_catalogue_launch_plan(entry.base['catalogueId'], atari_emulator_override=emulator_id)
    if profile_id and profile_id != plan['profileId'] or emulator_id and emulator_id != plan['emulatorId']:
        raise CatalogueError('configuration-required')
    return plan


def resolve_catalogue_launch_plan(catalogue_id, entry_revision=None, *, atari_emulator_override=''):
    """Private Host adapter, never exposed through Arcade API dispatchers."""
    from arcade_core.catalogue_identity import CatalogueError
    from arcade_core.catalogue_launch import resolve_plan
    lifecycle = get_library_catalogue()
    try:
        return resolve_plan(lifecycle, catalogue_id, entry_revision, atari_emulator_override=atari_emulator_override)
    except CatalogueError:
        raise
    except Exception:
        raise CatalogueError("configuration-required") from None


def launch_catalogue_plan(plan, *, launch_process, copy_profile, atari_emulator_override=''):
    from arcade_core.catalogue_launch import launch_plan
    return launch_plan(sys.modules[__name__], plan, launch_process=launch_process, copy_profile=copy_profile,
                       atari_emulator_override=atari_emulator_override)


class Library(GameLibrary):
    def __init__(self) -> None:
        super().__init__(
            init_state=init_state,
            load_favourites=load_favourites,
            load_poks=load_poks,
            load_games=load_games,
            normalize_relative_path=normalize_rel_path,
            mark_import_matches=mark_import_view_matches,
            load_metadata=load_metadata,
        )

    def rebuild(self, progress=None):
        with COLLECTION_JOB_LOCK:
            COLLECTION_CACHE.invalidate(collection_cache_key())
            invalidate_catalogue()
            result = super().rebuild(progress)
            remember_library(self)
            return result

    def refresh_metadata(self, metadata, game_ids):
        """Reparse edited collection rows without walking unrelated media/POKs."""
        with COLLECTION_JOB_LOCK:
            ids = set(game_ids)
            if any(not self.get_game(gid) or self.get_game(gid).view != 'collection' for gid in ids):
                return self.rebuild()
            from arcade_core.shared_metadata import shared_rows, group_keys
            rows = metadata.get('games', [])
            if active_collection().get('adapter') == 'gameboy-cartridges-v1':
                from arcade_core.catalogue_gameboy import effective_rows
                rows = effective_rows(active_collection())
            keys = group_keys(rows)
            groups = {keys[gid] for gid in ids if gid in keys}
            shared = [row for row in shared_rows(rows) if row['id'] in ids or keys.get(row['id']) in groups]
            ids.update(row['id'] for row in shared)
            games = load_metadata_games(self.poks_by_title_memory, load_favourites(), items=shared)
            if {game.id for game in games} != ids:
                return self.rebuild()
            invalidate_catalogue()
            COLLECTION_CACHE.invalidate(collection_cache_key())
            with self._lock:
                replacements = {game.id: game for game in games}
                self.games = [replacements.get(game.id, game) for game in self.games]
                self.game_by_id.update(replacements)
                self._mark_import_matches(self.games)
                self.poks_by_game_id = self.build_game_pok_links(self.games)


def init_state() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        save_state({"favourites": [], "recent": []})
    init_config()
    activate_collection(load_active_collection_id())


def load_state() -> dict:
    with STATE_LOCK:
        init_state_file_only()
        state = read_json_object(STATE_FILE, {"favourites": [], "recent": []})
        if not isinstance(state.get("favourites"), list):
            state["favourites"] = []
        else:
            state["favourites"] = [item for item in state["favourites"] if isinstance(item, str) and item]
        if not isinstance(state.get("recent"), list):
            state["recent"] = []
        else:
            state["recent"] = [item for item in state["recent"] if isinstance(item, dict)]
        return state


def save_state(state: dict) -> None:
    with STATE_LOCK:
        atomic_write_json(STATE_FILE, state)


def init_state_file_only() -> None:
    with STATE_LOCK:
        if not STATE_FILE.exists():
            atomic_write_json(STATE_FILE, {"favourites": [], "recent": []})


def update_state(mutator) -> dict:
    """Apply one state mutation without losing a concurrent update."""

    with STATE_LOCK:
        state = load_state()
        mutator(state)
        save_state(state)
        return state


def init_config() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        save_config({
            "collections": discover_collections(),
            "default_collection": "desasteron",
            "emulators": DEFAULT_EMULATORS,
            "emulator_profiles": [],
            "scrapers": DEFAULT_SCRAPERS,
        })
        return
    config = load_config()
    known = {item.get("id") for item in config.get("collections", [])}
    changed = False
    if "emulators" not in config:
        config["emulators"] = DEFAULT_EMULATORS
        changed = True
    else:
        for emulator_id, defaults in DEFAULT_EMULATORS.items():
            if emulator_id not in config["emulators"]:
                config["emulators"][emulator_id] = defaults
                changed = True
            else:
                for key, value in defaults.items():
                    if key not in config["emulators"][emulator_id]:
                        config["emulators"][emulator_id][key] = value
                        changed = True
    if "emulator_profiles" not in config:
        config["emulator_profiles"] = []
        changed = True
    if "scrapers" not in config:
        config["scrapers"] = DEFAULT_SCRAPERS
        changed = True
    else:
        for scraper_id, defaults in DEFAULT_SCRAPERS.items():
            if scraper_id not in config["scrapers"]:
                config["scrapers"][scraper_id] = defaults
                changed = True
            elif isinstance(config["scrapers"].get(scraper_id), dict):
                for key, value in defaults.items():
                    if key not in config["scrapers"][scraper_id]:
                        config["scrapers"][scraper_id][key] = value
                        changed = True
    for item in discover_collections():
        if item["id"] not in known:
            config.setdefault("collections", []).append(item)
            known.add(item["id"])
            changed = True
    if changed:
        save_config(config)


def load_config() -> dict:
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None:
        lifecycle.ensure_settled()
    config = read_json_object(CONFIG_FILE, {})
    fallback = {
        "collections": config['collections'] if isinstance(config.get('collections'), list) else discover_collections(),
        "default_collection": "desasteron",
        "emulators": deepcopy(DEFAULT_EMULATORS),
        "emulator_profiles": [],
        "scrapers": deepcopy(DEFAULT_SCRAPERS),
    }
    expected_types = {
        "collections": list,
        "default_collection": str,
        "emulators": dict,
        "emulator_profiles": list,
        "scrapers": dict,
    }
    for key, expected_type in expected_types.items():
        if not isinstance(config.get(key), expected_type):
            config[key] = fallback[key]
    config["collections"] = [item for item in config["collections"] if isinstance(item, dict)]
    config["emulator_profiles"] = [item for item in config["emulator_profiles"] if isinstance(item, dict)]
    config["emulators"] = {
        key: value for key, value in config["emulators"].items()
        if isinstance(key, str) and isinstance(value, dict)
    }
    config["scrapers"] = {
        key: value for key, value in config["scrapers"].items()
        if isinstance(key, str) and isinstance(value, dict)
    }
    return config


def save_config(config: dict) -> None:
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None:
        lifecycle.ensure_settled()
    atomic_write_json(CONFIG_FILE, config)
    invalidate_catalogue()


def expand_config_path(value: object) -> Path | None:
    text = str(value or "").strip().strip('"').strip("'").strip()
    if not text:
        return None
    return Path(os.path.expandvars(text)).expanduser()


def get_emulator_config_service() -> EmulatorConfigService:
    global EMULATOR_CONFIG_SERVICE
    if EMULATOR_CONFIG_SERVICE is None:
        EMULATOR_CONFIG_SERVICE = EmulatorConfigService(
            defaults=DEFAULT_EMULATORS,
            load_config=load_config,
            save_config=save_config,
            expand_path=expand_config_path,
        )
    return EMULATOR_CONFIG_SERVICE


def configured_emulators(include_hidden: bool = True) -> dict[str, dict[str, object]]:
    return get_emulator_config_service().configured(include_hidden=include_hidden)


def save_emulator_config(emulators: dict[str, dict[str, object]]) -> None:
    get_emulator_config_service().save_many([{"id": key, **value} for key, value in emulators.items()])


def configure_native_secret_service(*, get_secret, set_secret, delete_secret, status) -> None:
    """Attach Cyrune Host's secret service and migrate verified legacy JSON values."""

    SCRAPER_SECRET_SERVICE.configure(
        get_secret=get_secret,
        set_secret=set_secret,
        delete_secret=delete_secret,
        status=status,
    )
    global SCRAPER_SECRET_MIGRATION_PENDING
    SCRAPER_SECRET_MIGRATION_PENDING = True
    from arcade_core.catalogue_identity import CatalogueError
    try:
        migrate_native_scraper_secrets()
    except CatalogueError:
        # Recovery routes must stay reachable while a pending/corrupt transaction
        # blocks configuration reads. Retry migration before ordinary API work.
        pass


SCRAPER_SECRET_MIGRATION_PENDING = False


def migrate_native_scraper_secrets():
    global SCRAPER_SECRET_MIGRATION_PENDING
    if not SCRAPER_SECRET_MIGRATION_PENDING:
        return
    config = load_config()
    if SCRAPER_SECRET_SERVICE.migrate(config):
        save_config(config)
    SCRAPER_SECRET_MIGRATION_PENDING = False


def configure_optional_network_policy(check) -> None:
    """Attach Host's authoritative Arcade network-permission check."""

    global OPTIONAL_NETWORK_ALLOWED
    if not callable(check):
        raise TypeError("Arcade network policy must be callable")
    OPTIONAL_NETWORK_ALLOWED = check


def configured_scrapers() -> dict[str, dict[str, object]]:
    config = load_config()
    scrapers = config.get("scrapers") or {}
    merged: dict[str, dict[str, object]] = {}
    for scraper_id, defaults in DEFAULT_SCRAPERS.items():
        current = scrapers.get(scraper_id) if isinstance(scrapers, dict) else {}
        merged[scraper_id] = {**defaults, **(current or {})}
    if isinstance(scrapers, dict):
        for scraper_id, scraper in scrapers.items():
            if scraper_id not in merged and isinstance(scraper, dict):
                merged[scraper_id] = scraper
    for scraper_id, scraper in merged.items():
        scraper["id"] = scraper_id
    SCRAPER_SECRET_SERVICE.hydrate(merged)
    for scraper_id, scraper in merged.items():
        scraper["configured"] = scraper_configured(scraper)
    return merged


def scraper_configured(scraper: dict[str, object]) -> bool:
    if scraper.get("type") == "manual":
        return True
    if scraper.get("type") == "screenscraper":
        return all(str(scraper.get(key, "")).strip() for key in ("username", "password", "developer_id", "developer_password"))
    if scraper.get("type") == "thegamesdb":
        return bool(str(scraper.get("api_key", "")).strip())
    return bool(scraper.get("configured", False))


def scrapers_payload() -> dict[str, object]:
    providers = []
    for scraper in configured_scrapers().values():
        public = {key: value for key, value in scraper.items() if key not in {"password", "developer_password", "api_key"}}
        public["has_password"] = bool(str(scraper.get("password", "")).strip())
        public["has_developer_password"] = bool(str(scraper.get("developer_password", "")).strip())
        public["has_api_key"] = bool(str(scraper.get("api_key", "")).strip())
        public["platform_options"] = platform_options(scraper.get("type"))
        providers.append(public)
    return {
        "providers": providers,
        "asset_root": collection_relative(collection_asset_root()),
        "secret_storage": SCRAPER_SECRET_SERVICE.status(),
    }


def collection_asset_root() -> Path:
    return COLLECTION / "_assets" / "scraped"


def normalize_scraper_base_url(value: object, fallback: str) -> str:
    """Accept credential-bearing scraper requests only over a clean HTTPS origin."""

    text = clean_metadata_text(value or fallback, max_len=500).rstrip("/")
    if "\\" in text or any(character.isspace() for character in text):
        raise ValueError("Scraper base URL cannot contain whitespace or backslashes")
    try:
        parsed = urlsplit(text)
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"Invalid scraper base URL: {exc}") from exc
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise ValueError("Scraper base URL must use HTTPS")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Scraper base URL cannot contain credentials, a query, or a fragment")
    try:
        host = parsed.hostname.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("Scraper base URL contains an invalid host name") from exc
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    authority = host if port is None else f"{host}:{port}"
    path = parsed.path.rstrip("/")
    return f"https://{authority}{path}"


def update_scraper_config(scrapers: object) -> dict:
    if not isinstance(scrapers, dict):
        return {"ok": False, "error": "Expected scraper settings"}
    try:
        validated_base_urls = {
            scraper_id: normalize_scraper_base_url(
                updates["base_url"], str(DEFAULT_SCRAPERS[scraper_id]["base_url"])
            )
            for scraper_id, updates in scrapers.items()
            if (
                scraper_id in DEFAULT_SCRAPERS
                and "base_url" in DEFAULT_SCRAPERS[scraper_id]
                and isinstance(updates, dict)
                and "base_url" in updates
            )
        }
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    config = load_config()
    current = configured_scrapers()
    for scraper_id, updates in scrapers.items():
        if scraper_id not in current or not isinstance(updates, dict):
            continue
        merged = {**current[scraper_id]}
        if scraper_id == "screenscraper":
            for key in (
                "enabled",
                "username",
                "password",
                "developer_id",
                "developer_password",
                "system_id",
                "softname",
                "preferred_language",
                "preferred_region",
                "base_url",
            ):
                if key in updates:
                    value = updates[key]
                    cleaned = validated_base_urls[scraper_id] if key == "base_url" else (
                        bool(value) if key == "enabled" else clean_metadata_text(value, max_len=180)
                    )
                    if key in SCRAPER_SECRET_FIELDS.get(scraper_id, ()):
                        SCRAPER_SECRET_SERVICE.set_verified(scraper_id, key, str(cleaned))
                    else:
                        merged[key] = cleaned
        elif scraper_id == "thegamesdb":
            for key in ("enabled", "api_key", "platform_id", "base_url"):
                if key in updates:
                    value = updates[key]
                    cleaned = validated_base_urls[scraper_id] if key == "base_url" else (
                        bool(value) if key == "enabled" else clean_metadata_text(value, max_len=180)
                    )
                    if key in SCRAPER_SECRET_FIELDS.get(scraper_id, ()):
                        SCRAPER_SECRET_SERVICE.set_verified(scraper_id, key, str(cleaned))
                    else:
                        merged[key] = cleaned
        current[scraper_id] = merged
    config["scrapers"] = (
        SCRAPER_SECRET_SERVICE.scrub(current)
        if SCRAPER_SECRET_SERVICE.status().get("available")
        else current
    )
    save_config(config)
    TGDB_LOOKUP_CACHE.clear()
    return {"ok": True, "providers": scrapers_payload()["providers"]}


PROFILE_SERVICE: EmulatorProfileService | None = None


def get_profile_service() -> EmulatorProfileService:
    global PROFILE_SERVICE
    if PROFILE_SERVICE is None:
        PROFILE_SERVICE = EmulatorProfileService(
            load_config=load_config,
            save_config=save_config,
            emulator_provider=lambda: configured_emulators(include_hidden=True),
            expand_path=expand_config_path,
            profile_dir=EMULATOR_PROFILE_DIR,
            clean_text=clean_metadata_text,
            clean_id=clean_id,
        )
    return PROFILE_SERVICE


def managed_profiles() -> list[dict[str, object]]:
    return get_profile_service().profiles()


def emulator_profiles_payload() -> list[dict[str, object]]:
    return get_profile_service().payload()


def import_emulator_profile(data: dict) -> dict:
    return get_profile_service().import_profile(data)


def update_emulator_profile(data: dict) -> dict:
    return get_profile_service().update_profile(data)


def delete_emulator_profile(profile_id: str) -> dict:
    return get_profile_service().delete_profile(profile_id)


def update_emulator_profile_from_source(profile_id: str) -> dict:
    return get_profile_service().update_from_source(profile_id)


def pick_path(kind: str, title: str = "", initial: str = "") -> dict:
    result: dict[str, object] = {"ok": False, "path": ""}
    event = threading.Event()

    def run_dialog() -> None:
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            initial_path = expand_config_path(initial)
            initial_dir = str(initial_path if initial_path and initial_path.is_dir() else (initial_path.parent if initial_path else COLLECTIONS_BASE))
            if kind == "folder":
                selected = filedialog.askdirectory(title=title or "Select folder", initialdir=initial_dir, parent=root)
            else:
                filetypes = [("ST save disk images", "*.st")] if kind == "save-disk" else [
                    ("Emulator/profile files", "*.exe *.ini *.cfg *.conf *.json *.reg"),
                    ("Executables", "*.exe"),
                    ("INI files", "*.ini"),
                    ("All files", "*.*"),
                ]
                selected = filedialog.askopenfilename(title=title or "Select file", initialdir=initial_dir, filetypes=filetypes, parent=root)
            root.destroy()
            if selected:
                result.update({"ok": True, "path": selected})
            else:
                result.update({"ok": False, "cancelled": True, "error": "Selection cancelled"})
        except Exception as exc:
            result.update({"ok": False, "error": str(exc)})
        finally:
            event.set()

    thread = threading.Thread(target=run_dialog, daemon=True)
    thread.start()
    event.wait()
    return result


def clean_id(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def select_managed_profile(emulator_id: str, game: Game, profile_id: str = "") -> dict[str, object] | None:
    return get_profile_service().select(emulator_id, game, profile_id)


def discover_collections() -> list[dict[str, object]]:
    return get_collection_service().discover()


def looks_like_collection(path: Path) -> bool:
    from arcade_core.collections import (
        looks_like_collection as core_looks_like_collection,
    )
    return core_looks_like_collection(path)


def unique_collection_id(name: str, used: set[str]) -> str:
    from arcade_core.collections import (
        unique_collection_id as core_unique_collection_id,
    )
    return core_unique_collection_id(name, used)


def get_collection_service() -> CollectionService:
    return CollectionService(
        default_root=DESASTERON_COLLECTION,
        collections_base=COLLECTIONS_BASE,
        load_config=load_config,
        save_config=save_config,
        load_state=load_state,
    )


def collections_payload() -> dict:
    init_config()
    return get_collection_service().payload()


def incoming_file_count(root: Path) -> int:
    incoming = root / "incoming"
    return file_count_in_tree(incoming, {".tap", ".tzx"})


def trash_file_count(root: Path) -> int:
    trash = root / "_Deleted"
    return file_count_in_tree(trash, {".tap", ".tzx"})


def file_count_in_tree(root: Path, extensions: set[str] | None = None) -> int:
    return core_file_count_in_tree(root, extensions)

def add_collection(root: str, name: str = "", writable: bool = False, auto_metadata: bool = False) -> dict:
    return get_collection_service().add(root, name, writable, auto_metadata)


def collection_settings(method, data):
    global LIBRARY
    from arcade_core.collection_settings import settings_record, validate_settings
    from arcade_core.catalogue_identity import _writer_lock
    with COLLECTION_JOB_LOCK, _writer_lock(CONFIG_FILE):
        config = load_config()
        collection = next((row for row in config['collections'] if row['id'] == data.get('collection_id')), None)
        if collection is None:
            raise ValueError('Unknown collection')
        if method == 'GET':
            return {'ok': True, 'settings': settings_record(collection)}
        updated = validate_settings(config, data, DATA, Path(__file__).resolve().parents[1])
        if updated != collection:
            config['collections'][config['collections'].index(collection)] = updated
            save_config(config)
            if active_collection()['id'] == updated['id']:
                activate_collection(updated['id'])
                LIBRARY = None
        return {'ok': True, 'settings': settings_record(updated)}


def active_collection() -> dict:
    return get_collection_service().active()


def load_active_collection_id() -> str:
    return get_collection_service().active_id()


def activate_collection(collection_id: str) -> dict:
    global COLLECTION, REPORTS, METADATA_FILE, METADATA_SERVICE
    selected = get_collection_service().resolve(collection_id)
    root = Path(str(selected.get("root", DESASTERON_COLLECTION))).resolve()
    COLLECTION = root
    REPORTS = COLLECTION / "_reports"
    METADATA_FILE = COLLECTION / "collection-metadata.json"
    METADATA_SERVICE = None
    return selected


def current_collection_writable() -> bool:
    active = active_collection()
    from arcade_core.platforms import LIBRARIES, collection_platform
    platform = LIBRARIES.get(collection_platform(active))
    return bool(platform and not platform['presentationOverrides'] and active.get('writable', False))


def current_collection_auto_metadata() -> bool:
    active = active_collection()
    from arcade_core.platforms import LIBRARIES, collection_platform
    platform = LIBRARIES.get(collection_platform(active))
    return bool(platform and not platform['presentationOverrides'] and (active.get('writable', False) or active.get('auto_metadata', False)))


def start_index_job(title: str, work) -> str:
    return JOB_SERVICE.start(title, work)


def update_job(job_id: str, **updates: object) -> None:
    JOB_SERVICE.update(job_id, **updates)


def get_job(job_id: str) -> dict[str, object]:
    return JOB_SERVICE.get(job_id)


def collection_cache_key():
    return (str(DATA.resolve()), str(COLLECTION.resolve()), active_collection()['id'])


def remember_library(library):
    from arcade_core.game_properties import properties_path
    collection = active_collection()
    paths = [CONFIG_FILE, METADATA_FILE, COLLECTION, DATA / 'catalogue-transaction.json',
             DATA / 'catalogue-proofs.json', properties_path(DATA, collection)]
    if collection.get('adapter') == 'scummvm-config-v1':
        from arcade_core.scummvm_overrides import ScummvmOverrides
        paths.extend([collection['scummvm_config'], ScummvmOverrides(DATA, collection).path])
    elif collection.get('adapter') == 'atari-st-disks-v1':
        from arcade_core.atari_overrides import AtariOverrides
        paths.append(AtariOverrides(DATA, collection).path)
    paths.extend(Path(game.path).parent for game in library.games)
    paths.extend(Path(pok.get('output_path', '')).parent for pok in library.pok_by_id.values())
    paths.extend(COLLECTION / name for name in ('incoming', '_Deleted', 'Games', 'POKs'))
    COLLECTION_CACHE.put(collection_cache_key(), library, paths)


def start_select_collection_job(collection_id: str) -> str:
    from arcade_core.catalogue_identity import CatalogueError
    config = load_config()
    target = next((item for item in config.get("collections", []) if item.get("id") == collection_id), None)
    title = f"Switching to {target.get('name')}" if target else "Switching Collection"
    def work(progress) -> None:
        global LIBRARY
        with COLLECTION_JOB_LOCK:
            if target is None:
                raise ValueError(f"Unknown collection: {collection_id}")
            previous_id = load_active_collection_id()
            previous_library = LIBRARY
            selected = activate_collection(collection_id)
            update_state(lambda state: state.update({"active_collection_id": selected.get("id", "desasteron")}))
            try:
                cached = COLLECTION_CACHE.get(collection_cache_key())
                if cached is not None:
                    LIBRARY = cached
                    favourites = load_favourites()
                    for game in cached.games:
                        game.favourite = game.id in favourites
                    progress('cached', 0, 0, 'Loading saved library view...')
                else:
                    LIBRARY = None
                    get_library()
                progress('versions', 0, 0, 'Loading game versions...')
                try:
                    game_version_summaries([])
                except CatalogueError as error:
                    if error.code != 'unavailable':
                        raise
            except Exception:
                activate_collection(previous_id)
                LIBRARY = previous_library
                update_state(lambda state: state.update({"active_collection_id": previous_id}))
                try:
                    get_library().rebuild()
                except Exception as rollback_error:
                    log(f"Collection rollback rebuild failed: {rollback_error}")
                raise

    return start_index_job(title, work)


def start_rebuild_job() -> str:
    active = active_collection()

    def work(progress) -> None:
        with COLLECTION_JOB_LOCK:
            if active_collection()['id'] != active['id']:
                raise ValueError('The selected collection changed. Rebuild it again.')
            if active.get('adapter') == 'atari-st-disks-v1':
                from arcade_core.atari import refresh_index
                progress('discovering', 0, 0, 'Checking for added disk images…')
                refresh_index(active['root'], parse_tosec_name)
            if active.get('adapter') == 'gameboy-cartridges-v1':
                from arcade_core.gameboy import refresh_index
                progress('discovering', 0, 0, 'Checking for added cartridges…')
                refresh_index(active['root'], parse_tosec_name)
            get_library().rebuild(progress)

    return start_index_job(f"Rebuilding {active.get('name', 'Collection')}", work)


def load_favourites() -> set[str]:
    return set(load_state().get("favourites", []))


def load_poks() -> dict[tuple[str, str], list[dict[str, str]]]:
    if active_collection().get("adapter") in {"scummvm-config-v1", "atari-st-disks-v1", "gameboy-cartridges-v1"}:
        return {}
    if METADATA_FILE.exists():
        return load_metadata_poks()

    report = REPORTS / "poks-selected.csv"
    poks: dict[tuple[str, str], list[dict[str, str]]] = {}
    if not report.exists():
        return poks
    with report.open("r", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = (row.get("title_key", ""), row.get("memory", ""))
            if not key[0] or not key[1] or row.get("match_status") == "unmatched":
                continue
            output_path = row.get("output_path", "")
            try:
                absolute = resolve_within(COLLECTION.parent, output_path, require_exists=True)
                relative_to_root(COLLECTION, absolute)
            except (FileNotFoundError, PathConfinementError):
                continue
            row = dict(row)
            row["id"] = stable_id(output_path)
            row["path"] = str(absolute)
            row["file_name"] = absolute.name
            row["cheats"] = parse_pok_file(absolute)
            row["cheat_summary"] = ", ".join(cheat["name"] for cheat in row["cheats"][:4])
            poks.setdefault(key, []).append(row)
    return poks


def load_metadata() -> dict:
    if active_collection().get("adapter") == "scummvm-config-v1":
        return {"version": 1, "games": [], "poks": []}
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None:
        lifecycle.ensure_settled()
    metadata = read_json_object(METADATA_FILE, {"version": 1, "games": [], "poks": []})
    if not isinstance(metadata.get("games"), list):
        metadata["games"] = []
    if not isinstance(metadata.get("poks"), list):
        metadata["poks"] = []
    return metadata


def save_metadata(metadata: dict) -> None:
    metadata["updated_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    lifecycle = get_catalogue_lifecycle()
    if lifecycle is not None and lifecycle.save_metadata(COLLECTION, metadata):
        return
    atomic_write_json(METADATA_FILE, metadata)
    invalidate_catalogue()


def collection_relative(path: Path) -> str:
    return str(relative_to_root(COLLECTION, path)).replace("\\", "/")


def normalize_rel_path(path: object) -> str:
    return str(path or "").replace("\\", "/").strip().lower()


def load_metadata_poks() -> dict[tuple[str, str], list[dict[str, str]]]:
    poks: dict[tuple[str, str], list[dict[str, str]]] = {}
    metadata = load_metadata()
    collection_paths = ConfinedRoot(COLLECTION)
    link_counts: dict[str, int] = {}
    for game in metadata.get("games", []):
        for rel_path in game.get("poks", []):
            key = normalize_rel_path(rel_path)
            if key:
                link_counts[key] = link_counts.get(key, 0) + 1
    for item in metadata.get("poks", []):
        rel_path = item.get("file", "")
        if not rel_path:
            continue
        try:
            absolute = collection_paths.resolve(rel_path, require_exists=True)
        except (FileNotFoundError, PathConfinementError):
            continue
        title_key = item.get("title_key", "")
        memory = item.get("memory") or item.get("system", "")
        if not title_key or not memory:
            continue
        row = {
            "id": item.get("id") or stable_id(rel_path),
            "title": item.get("title", absolute.stem),
            "title_key": title_key,
            "memory": memory,
            "system": item.get("system", memory),
            "match_status": item.get("match_status", "matched"),
            "output_path": rel_path,
            "path": str(absolute),
            "file_name": absolute.name,
            "linked_game_count": link_counts.get(normalize_rel_path(rel_path), 0),
            "cheats": parse_pok_file(absolute),
        }
        row["cheat_summary"] = ", ".join(cheat["name"] for cheat in row["cheats"][:4])
        poks.setdefault((title_key, memory), []).append(row)
    return poks


def parse_pok_file(path: Path) -> list[dict[str, object]]:
    return POK_CACHE.read(path, _parse_pok_file)


def _parse_pok_file(path: Path) -> list[dict[str, object]]:
    try:
        raw = path.read_bytes()
    except OSError:
        return []

    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return []

    cheats: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        marker = line[:1].upper()
        if marker == "N":
            if current:
                cheats.append(current)
            name = line[1:].strip() or "Unnamed cheat"
            current = {"name": name, "patches": 0}
        elif marker in {"M", "Z"} and current:
            current["patches"] = int(current.get("patches", 0)) + 1
        elif marker == "Y":
            break
    if current:
        cheats.append(current)
    return cheats


def load_games(poks: dict[tuple[str, str], list[dict[str, str]]], favourites: set[str], progress=None) -> list[Game]:
    collection = active_collection()
    from arcade_core.platforms import collection_platform
    if not collection_platform(collection) or collection.get('adapter', '') not in {'', 'spectrum-metadata-v1', 'scummvm-config-v1', 'atari-st-disks-v1', 'gameboy-cartridges-v1'}:
        raise ValueError('This collection adapter is not supported. Check its platform settings.')
    if collection.get('adapter') == 'gameboy-cartridges-v1':
        from arcade_core.catalogue_gameboy import effective_rows
        return load_metadata_games({}, favourites, items=effective_rows(collection))
    if collection.get('adapter') == 'atari-st-disks-v1':
        from arcade_core.atari import read_rows
        from arcade_core.atari_overrides import AtariOverrides
        rows = read_rows(COLLECTION)
        overrides = AtariOverrides(DATA, collection).load()
        shared = AtariOverrides.shared_values(rows, overrides)
        from arcade_core.game_properties import read_properties
        properties = read_properties(DATA, collection)['games']
        games = load_metadata_games({}, favourites, items=[
            {**row, **shared[game_id]}
            for game_id, row in rows.items()])
        for game in games:
            row = rows[game.id]
            game.type = 'Atari ST'
            game.section = 'Atari ST'
            game.platform = 'atari-st'
            game.platform_options = (row['system'],)
            game.language = format_languages(game.languages)
            game.default_emulator = properties.get(game.id, {}).get('emulatorId', collection.get('default_emulator', ''))
            game.emulator_profile = properties.get(game.id, {}).get('profileId', '')
            game.version = ' / '.join(v for v in (row.get('version', ''), row.get('edition', ''), row.get('media_label', '')) if v)
        return games
    if collection.get("adapter") == "scummvm-config-v1":
        from arcade_core.import_scummvm import scummvm_manifest, platform_presentation, PLATFORMS
        from arcade_core.scummvm_metadata import game_metadata
        from arcade_core.scummvm_overrides import ScummvmOverrides
        manifest = scummvm_manifest(collection["id"], COLLECTION, Path(collection["scummvm_config"]))
        overrides = ScummvmOverrides(DATA, collection).load()
        games = []
        for row in manifest["entries"]:
            metadata, target = row["metadata"], row["target"]
            values = ScummvmOverrides.values(overrides, row["id"], target)
            title = values.get("title", metadata["title"])
            platform, label = PLATFORMS[target["platform"]]
            platform_options = platform_presentation(target)
            games.append(Game(id=row["id"], title=title, title_key=normalize_title(title),
                sort_title=article_sort_title(title), tosec_title=title, memory=label, system=platform_options[0],
                section="ScummVM", category="", type="ScummVM", language=format_languages(metadata["languages"]),
                extension="", path=str(COLLECTION / target["directory"]), file_name=target["targetId"],
                letter=folder_letter(title), platform=platform, platform_options=platform_options, version=metadata["editionLabel"],
                languages=tuple(metadata["languages"]),
                **{**game_metadata(target['engineId'], target['gameId']),
                   **{key: value for key, value in values.items() if key != "title"}},
                default_emulator=collection.get("default_emulator", ""), favourite=row["id"] in favourites))
        return games
    loader = CollectionLoader(
        metadata_path=lambda: METADATA_FILE,
        load_metadata_games=load_metadata_games,
        load_incoming_games=load_incoming_games,
        load_trash_games=load_trash_games,
        load_official_games=load_official_games,
        load_homebrew_games=load_homebrew_games,
        load_scanned_games=load_scanned_collection_games,
        load_language_review_games=load_language_review_games,
        auto_metadata_enabled=current_collection_auto_metadata,
        save_metadata_from_games=save_metadata_from_games,
    )
    return loader.load(poks, favourites, progress)


def mark_import_view_matches(games: list[Game]) -> None:
    core_mark_import_view_matches(games)


def import_match_summary(game: Game) -> dict[str, object]:
    return core_import_match_summary(game)


def load_metadata_games(poks: dict[tuple[str, str], list[dict[str, str]]], favourites: set[str], *, root=None, items=None) -> list[Game]:
    from arcade_core.index_paths import IndexPaths
    with IndexPaths(COLLECTION if root is None else root) as paths:
        return _load_metadata_games(poks, favourites, root=root, items=items, _paths=paths)


def _load_metadata_games(poks: dict[tuple[str, str], list[dict[str, str]]], favourites: set[str], *, root=None, items=None, _paths=None) -> list[Game]:
    from arcade_core.game_presentation import language_codes
    from arcade_core.shared_metadata import shared_rows
    games: list[Game] = []
    collection_paths = _paths
    for item in (shared_rows(load_metadata().get("games", [])) if items is None else items):
        status = item.get("status", "Main")
        if status in {"Deleted", "Hidden"}:
            continue
        rel_path = item.get("file", "")
        if not rel_path:
            continue
        try:
            absolute = collection_paths.resolve(rel_path, require_exists=True)
        except (FileNotFoundError, PathConfinementError):
            continue
        title = item.get("title") or parse_tosec_name(absolute.name)["title"]
        title_key = item.get("title_key") or normalize_title(title)
        sort_title = item.get("sort_title") or article_sort_title(title)
        tosec_title = item.get("tosec_title") or tosec_title_from_display(title)
        system = item.get("system") or item.get("memory", "")
        memory = item.get("memory") or system
        collection_type = item.get("type", "Official")
        section = item.get("section") or ("Official" if collection_type == "Official" else "Homebrew & Scene")
        category = "" if collection_type == "Official" else collection_type
        languages = tuple(code.upper() for code in language_codes(item.get('languages'), item.get('language', '')))
        countries = tuple(item.get("countries", ()))
        linked_poks = [path for path in item.get("poks", []) if path]
        related_poks = linked_poks or poks.get((title_key, memory), [])
        game_id = item.get("id") or stable_id(rel_path)
        games.append(
            Game(
                id=game_id,
                title=title,
                title_key=title_key,
                sort_title=sort_title,
                tosec_title=tosec_title,
                memory=memory,
                system=system,
                section=section,
                category=category,
                type=collection_type,
                language=format_languages(languages)
                or item.get("language", "")
                or ("" if collection_type == 'Game Boy' else "English"),
                extension=item.get("format") or absolute.suffix.lower(),
                path=str(absolute),
                file_name=absolute.name,
                letter=item.get("letter") or folder_letter(title),
                view="collection",
                year=item.get("year") or item.get("date", ""),
                publisher=item.get("publisher", ""),
                series=item.get("series", ""),
                version=item.get("version", ""),
                demo=item.get("demo", ""),
                video=item.get("video", ""),
                copyright_status=item.get("copyright_status", ""),
                development_status=item.get("development_status", ""),
                media_type=item.get("media_type", ""),
                media_label=item.get("media_label", ""),
                genre=item.get("genre", ""),
                developer=item.get("developer", ""),
                platform=item.get("platform", ""),
                region=item.get("region", ""),
                players=item.get("players", ""),
                coop=item.get("coop", ""),
                rating=item.get("rating", ""),
                youtube_id=item.get("youtube_id", ""),
                description=item.get("description", ""),
                screenshot=item.get("screenshot", ""),
                loading_screen=item.get("loading_screen", ""),
                scraper_source=item.get("scraper_source", ""),
                scraper_id=item.get("scraper_id", ""),
                languages=languages,
                countries=countries,
                tosec_tags=tuple(item.get("tosec_tags", ())),
                flags=tuple(item.get("flags", ())),
                dump_flags=tuple(item.get("dump_flags", ())),
                more_info=tuple(item.get("more_info", ())),
                tags=tuple(item.get("tags", ())),
                hardware=tuple(item.get("hardware", ())),
                default_emulator=item.get("default_emulator", ""),
                emulator_profile=item.get("emulator_profile", ""),
                has_poks=bool(related_poks),
                pok_count=len(related_poks),
                favourite=game_id in favourites,
                is_ulaplus="ULAPlus" in item.get("hardware", []) or "(ulaplus)" in absolute.stem.lower(),
            )
        )
    games.sort(key=lambda game: (game.title_key, game.system, game.section, game.file_name.lower()))
    return games


def save_metadata_from_games(games: list[Game], poks: dict[tuple[str, str], list[dict[str, str]]]) -> None:
    if METADATA_FILE.exists():
        return
    pok_files_by_key = {
        key: [collection_relative(Path(row["path"])) for row in rows if row.get("path")]
        for key, rows in poks.items()
    }
    metadata = {
        "version": 1,
        "created_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "updated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "games": [],
        "poks": [],
    }
    for game in games:
        metadata["games"].append(game_to_metadata_item(game, pok_files_by_key.get((game.title_key, game.memory), [])))
    seen_poks: set[str] = set()
    for rows in poks.values():
        for row in rows:
            rel_path = collection_relative(Path(row["path"]))
            if rel_path in seen_poks:
                continue
            seen_poks.add(rel_path)
            metadata["poks"].append(pok_to_metadata_item(row, rel_path))
    save_metadata(metadata)


def game_to_metadata_item(game: Game, pok_files: list[str] | None = None) -> dict:
    collection_type = game.type or game.category or game.section or "Official"
    if collection_type == "Homebrew & Scene":
        collection_type = "Homebrew"
    hardware = list(game.hardware) or (["ULAPlus"] if game.is_ulaplus else [])
    return {
        "id": game.id,
        "title": game.title,
        "title_key": game.title_key,
        "sort_title": article_sort_title(game.title),
        "tosec_title": tosec_title_from_display(game.title),
        "file": collection_relative(Path(game.path)),
        "system": game.system,
        "memory": game.memory,
        "format": game.extension,
        "version": game.version,
        "demo": game.demo,
        "year": game.year,
        "date": game.year,
        "publisher": game.publisher,
        "video": game.video,
        "languages": list(game.languages),
        "language": game.language,
        "countries": list(game.countries),
        "copyright_status": game.copyright_status,
        "development_status": game.development_status,
        "media_type": game.media_type,
        "media_label": game.media_label,
        "genre": game.genre,
        "developer": game.developer,
        "platform": game.platform,
        "region": game.region,
        "players": game.players,
        "coop": game.coop,
        "rating": game.rating,
        "youtube_id": game.youtube_id,
        "description": game.description,
        "screenshot": game.screenshot,
        "loading_screen": game.loading_screen,
        "scraper_source": game.scraper_source,
        "scraper_id": game.scraper_id,
        "type": collection_type,
        "section": game.section,
        "tags": list(game.tags),
        "hardware": hardware,
        "status": "Main",
        "tosec_tags": list(game.tosec_tags),
        "flags": list(game.flags),
        "dump_flags": list(game.dump_flags),
        "more_info": list(game.more_info),
        "default_emulator": game.default_emulator,
        "emulator_profile": game.emulator_profile,
        "poks": pok_files or [],
    }


def pok_to_metadata_item(row: dict[str, object], rel_path: str) -> dict:
    return {
        "id": row.get("id") or stable_id(rel_path),
        "title": row.get("title", ""),
        "title_key": row.get("title_key", ""),
        "file": rel_path,
        "system": row.get("system") or row.get("memory", ""),
        "memory": row.get("memory", ""),
        "match_status": row.get("match_status", "matched"),
        "linked_game_count": 0,
    }


def load_official_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
    reported_paths: set[str],
) -> list[Game]:
    report = REPORTS / "selected-games.csv"
    games: list[Game] = []
    if not report.exists():
        return games
    with report.open("r", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            game = make_game(
                row=row,
                section="Official",
                category="",
                output_path=row.get("output_path", ""),
                poks=poks,
                favourites=favourites,
                view="collection",
            )
            if game:
                games.append(game)
                reported_paths.add(str(Path(game.path).resolve()).lower())
    return games


def load_homebrew_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
    reported_paths: set[str],
) -> list[Game]:
    report = REPORTS / "homebrew-scene-selected.csv"
    games: list[Game] = []
    if not report.exists():
        return games
    with report.open("r", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            title = row.get("title", "")
            row = dict(row)
            row["title_key"] = normalize_title(title)
            row["language_bucket"] = "English"
            game = make_game(
                row=row,
                section="Homebrew & Scene",
                category=row.get("category", ""),
                output_path=row.get("output_path", ""),
                poks=poks,
                favourites=favourites,
                view="collection",
            )
            if game:
                games.append(game)
                reported_paths.add(str(Path(game.path).resolve()).lower())
    return games


def load_scanned_collection_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
    reported_paths: set[str],
    progress=None,
) -> list[Game]:
    games: list[Game] = []
    roots = [root for root in (COLLECTION / "Games", COLLECTION / "48K", COLLECTION / "128K", COLLECTION / "Homebrew & Scene") if root.exists()]
    if not roots:
        roots = [COLLECTION]
    paths: list[Path] = []
    discovered = 0
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in {".tap", ".tzx"}:
                continue
            if should_skip_scan_path(path):
                continue
            if str(path.resolve()).lower() in reported_paths:
                continue
            paths.append(path)
            discovered += 1
            if progress and discovered % 250 == 0:
                progress("counting", discovered, 0, f"Discovered {discovered:,} files")
    if progress:
        progress("indexing", 0, len(paths), f"Indexed 0 of {len(paths):,} files")
    for index, path in enumerate(paths, start=1):
        game = make_scanned_game(path, COLLECTION, "collection", poks, favourites)
        if game:
            games.append(game)
        if progress and (index == len(paths) or index % 100 == 0):
            progress("indexing", index, len(paths), f"Indexed {index:,} of {len(paths):,} files")
    return games


def should_skip_scan_path(path: Path) -> bool:
    try:
        rel = path.resolve().relative_to(COLLECTION.resolve())
    except ValueError:
        return False
    skip_roots = {"_launcher", "_tools", "_reports", "_deleted", "incoming", "poks", "cheats & poks"}
    return bool(rel.parts and rel.parts[0].lower() in skip_roots)


def load_language_review_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
) -> list[Game]:
    games: list[Game] = []
    root = COLLECTION / "_Non EN-DE Review"
    if not root.exists():
        return games
    for path in root.rglob("*"):
        if path.suffix.lower() not in {".tap", ".tzx"}:
            continue
        game = make_scanned_game(path, root, "languages", poks, favourites)
        if game:
            games.append(game)
    return games


def load_incoming_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
) -> list[Game]:
    if not current_collection_writable():
        return []
    root = COLLECTION / "incoming"
    if not root.exists() or not root.is_dir():
        return []
    games: list[Game] = []
    for path in root.rglob("*"):
        if path.suffix.lower() not in {".tap", ".tzx"}:
            continue
        game = make_scanned_game(path, root, "incoming", poks, favourites)
        if game:
            games.append(game)
    return games


def load_trash_games(
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
) -> list[Game]:
    if not current_collection_writable():
        return []
    root = COLLECTION / "_Deleted"
    if not root.exists() or not root.is_dir():
        return []
    games: list[Game] = []
    for path in root.rglob("*"):
        if path.suffix.lower() not in {".tap", ".tzx"}:
            continue
        game = make_scanned_game(path, root, "trash", poks, favourites)
        if game:
            games.append(game)
    return games


def make_game(
    row: dict[str, str],
    section: str,
    category: str,
    output_path: str,
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
    view: str,
) -> Game | None:
    if not output_path:
        return None
    try:
        absolute = resolve_within(COLLECTION.parent, output_path, require_exists=True)
        relative_to_root(COLLECTION, absolute)
    except (FileNotFoundError, PathConfinementError):
        return None
    parsed = parse_tosec_name(absolute.name)
    title_key = row.get("title_key", "")
    memory = row.get("memory", "")
    system = parsed["system"] or memory
    related_poks = poks.get((title_key, memory), [])
    languages = tuple(parsed["languages"] or parse_report_language(row.get("language_bucket", "")))
    countries = tuple(parsed["countries"])
    game_id = stable_id(output_path)
    return Game(
        id=game_id,
        title=row.get("title", ""),
        title_key=title_key,
        sort_title=article_sort_title(row.get("title", "")),
        tosec_title=tosec_title_from_display(row.get("title", "")),
        memory=memory,
        system=system,
        section=section,
        category=category,
        type=category or section,
        language=format_languages(languages) or row.get("language_bucket", "English"),
        extension=row.get("extension", absolute.suffix.lower()),
        path=str(absolute),
        file_name=absolute.name,
        letter=row.get("letter", ""),
        view=view,
        year=parsed["year"],
        publisher=parsed["publisher"],
        languages=languages,
        countries=countries,
        tosec_tags=tuple(parsed["parentheses"]),
        flags=tuple(parsed["brackets"]),
        has_poks=bool(related_poks),
        pok_count=len(related_poks),
        favourite=game_id in favourites,
        is_ulaplus="(ulaplus)" in absolute.stem.lower(),
    )


def make_scanned_game(
    path: Path,
    base: Path,
    view: str,
    poks: dict[tuple[str, str], list[dict[str, str]]],
    favourites: set[str],
) -> Game | None:
    try:
        relative = path.resolve().relative_to(base.resolve())
    except ValueError:
        return None
    parts = relative.parts
    memory = "128K" if "128K" in parts else "48K"
    if view == "incoming":
        section = "Incoming"
        category = "Incoming"
    elif view == "trash":
        section = "Bin"
        category = "Bin"
    elif not current_collection_writable() and view == "collection":
        section = "Source"
        category = "Source"
    else:
        section = "Homebrew & Scene" if parts and parts[0] == "Homebrew & Scene" else "Official"
        category = "Manual" if view == "collection" else "Other Languages"
    collection_type = section if section == "Official" else category
    parsed = parse_tosec_name(path.name)
    title = parsed["title"]
    title_key = normalize_title(title)
    system = parsed["system"] or memory
    related_poks = poks.get((title_key, memory), [])
    game_id = stable_id(str(path.resolve()))
    languages = tuple(parsed["languages"])
    countries = tuple(parsed["countries"])
    return Game(
        id=game_id,
        title=title,
        title_key=title_key,
        sort_title=article_sort_title(title),
        tosec_title=tosec_title_from_display(title),
        memory=memory,
        system=system,
        section=section,
        category=category,
        type=collection_type,
        language=format_languages(languages) or "Unknown",
        extension=path.suffix.lower(),
        path=str(path.resolve()),
        file_name=path.name,
        letter=folder_letter(title),
        view=view,
        year=parsed["year"],
        publisher=parsed["publisher"],
        languages=languages,
        countries=countries,
        tosec_tags=tuple(parsed["parentheses"]),
        flags=tuple(parsed["brackets"]),
        has_poks=bool(related_poks),
        pok_count=len(related_poks),
        favourite=game_id in favourites,
        is_ulaplus="(ulaplus)" in path.stem.lower(),
    )


def stable_id(text: str) -> str:
    import hashlib

    return hashlib.sha1(text.lower().encode("utf-8")).hexdigest()[:16]


LIBRARY: Library | None = None
LIBRARY_LOCK = threading.Lock()


def get_library() -> Library:
    """Build the collection index only when a runtime transport needs it."""
    global LIBRARY
    if LIBRARY is None:
        # Match mutation/rebuild lock order, including first-use construction.
        with COLLECTION_JOB_LOCK, LIBRARY_LOCK:
            if LIBRARY is None:
                LIBRARY = Library()
    return LIBRARY


ARCADE_READ_SERVICE = ReadOnlyArcadeService(
    get_library,
    collections_payload,
    lambda: emulator_payload(),
    emulator_profiles_payload,
)


def dispatch_arcade_read(method: object, params: object = None) -> dict[str, object]:
    """Expose bounded reads independently of HTTP for the extension bridge."""
    return ARCADE_READ_SERVICE.dispatch(method, params)


def _api_query_value(query: dict[str, object], key: str, fallback: str = "") -> str:
    value = query.get(key, fallback)
    if isinstance(value, (list, tuple)):
        value = value[0] if value else fallback
    return str(value or fallback)


def _read_only_error() -> dict[str, object]:
    return {"ok": False, "error": "Selected collection is read-only"}


def game_properties_service():
    global GAME_PROPERTIES_SERVICE
    if GAME_PROPERTIES_SERVICE is None:
        from arcade_core.game_properties import GameProperties
        if not callable(GAME_PROPERTIES_ACCESS) or not callable(GAME_PROPERTIES_APPROVE):
            raise ValueError('Update and reload Cyrune Relay/Host to use game properties')
        GAME_PROPERTIES_SERVICE = GameProperties(DATA, load_config, pick_path,
            GAME_PROPERTIES_ACCESS, GAME_PROPERTIES_APPROVE)
    return GAME_PROPERTIES_SERVICE


def dispatch_arcade_api(method: object, path: object, query: object = None, data: object = None) -> dict[str, object]:
    """Route the existing UI API without coupling it to HTTP transport."""
    verb = str(method or "").strip().upper()
    route = str(path or "").strip()
    query = query if isinstance(query, dict) else {}
    data = data if isinstance(data, dict) else {}

    if verb == 'GET' and route == '/api/scrape-job':
        return scrape_job_result(query)

    if route in {'/api/emulator-shortcuts', '/api/emulator-icon', '/api/launch-emulator'}:
        return emulator_shortcut_request(verb, route, query if verb == 'GET' else data)

    from arcade_core.collection_context import scoped, validate
    parameters = query if verb == 'GET' else data
    if scoped(verb, route) and 'collection_id' in parameters:
        with COLLECTION_JOB_LOCK:
            try:
                validate(parameters['collection_id'], active_collection())
            except ValueError as error:
                return {'ok': False, 'code':'collection-changed', 'error':str(error)}
            clean = {key:value for key,value in parameters.items() if key != 'collection_id'}
            return dispatch_arcade_api(verb, route, clean if verb == 'GET' else query, clean if verb != 'GET' else data)

    recovery_routes = {f"/api/catalogue-recovery/{action}": action for action in ("status", "preview", "confirm")}
    if verb == "POST" and route in recovery_routes:
        return catalogue_recovery_request(recovery_routes[route], data)
    reattachment_routes = {f"/api/catalogue-reattachment/{action}": action for action in ("sources", "preview", "confirm")}
    if verb == "POST" and route in reattachment_routes:
        return catalogue_reattachment_request(reattachment_routes[route], data)
    if verb == "POST" and route == "/api/pick-path" and data.get("kind") == "catalogue-reattachment":
        return catalogue_reattachment_request("select", data)
    from arcade_core.catalogue_identity import CatalogueError
    try:
        lifecycle = get_catalogue_lifecycle()
        if route == '/api/collection-settings' and verb in {'GET', 'POST'}:
            try:
                return collection_settings(verb, query if verb == 'GET' else data)
            except (ValueError, OSError) as error:
                return {'ok': False, 'error': str(error)}
        if lifecycle is not None:
            lifecycle.ensure_settled()
        migrate_native_scraper_secrets()
    except CatalogueError:
        return {"ok": False, "code": "review-required", "error": "Catalogue recovery needs review. Open Catalogue Recovery before loading or changing the library."}

    if route in {'/api/game-properties', '/api/game-properties/pick-save', '/api/game-properties/recover', '/api/game-properties/save-disk'}:
        try:
            with COLLECTION_JOB_LOCK:
                service = game_properties_service()
                if verb == 'GET' and route == '/api/game-properties':
                    return service.preview(_api_query_value(query, 'collectionId'), _api_query_value(query, 'gameId'))
                if verb == 'POST' and route == '/api/game-properties/save-disk':
                    return service.disk_action(data)
                if verb == 'POST' and route == '/api/game-properties/recover':
                    if set(data) != {'collectionId', 'gameId'}:
                        raise ValueError('Invalid recovery request')
                    return service.recover(data['collectionId'], data['gameId'])
                if verb == 'POST' and route == '/api/game-properties/pick-save':
                    if set(data) != {'collectionId', 'gameId'}:
                        raise ValueError('Invalid save disk selection')
                    return service.pick(data['collectionId'], data['gameId'])
                if verb == 'POST' and route == '/api/game-properties':
                    result = service.save(data)
                    # Launch settings do not change files, metadata or POK links.
                    # Update the loaded row; catalogue policy stamps still refresh
                    # independently before binding/default selection and launch.
                    if LIBRARY is not None and active_collection()['id'] == data['collectionId']:
                        game = LIBRARY.get_game(data['gameId'])
                        if game:
                            from dataclasses import replace
                            LIBRARY.update_game_record(replace(game, default_emulator=result['settings']['emulatorId'],
                                emulator_profile=result['settings']['profileId']))
                    return result
                raise ValueError('Invalid properties operation')
        except (ValueError, OSError, CatalogueError) as error:
            return {'ok': False, 'error': str(error)}
    if verb == "GET":
        if route == "/api/games":
            from arcade_core.catalogue_identity import _writer_lock
            with COLLECTION_JOB_LOCK:
                care = metadata_care()
                care_state = care.journal.load()
                if care_state.get('pending'):
                    with _writer_lock(care.journal.path):
                        care_state = care.journal.settle()
                        get_library().rebuild()
                        if METADATA_SERVICE is not None:
                            METADATA_SERVICE.clear_history()
                view = _api_query_value(query, "view", "collection")
                games = (
                    get_library().list_game_summaries(view)
                    if _api_query_value(query, "shape") == "summary"
                    else get_library().list_games(view)
                )
                if _api_query_value(query, "groupVersions") == "true":
                    try:
                        game_version_summaries(games)
                    except CatalogueError as error:
                        if error.code != "unavailable":
                            return {"ok": False, "error": "Game versions could not be loaded.", "code": error.code}
                newly_indexed = metadata_notes().observe(row.id for row in get_library().games if row.view == 'collection')
                reviews = care_state.get('reviews', {})
                for row in games:
                    game = get_library().get_game(row['id'])
                    row['newly_indexed'] = row['id'] in newly_indexed
                    row['cleanup'] = {'artwork': not bool(game.screenshot or game.loading_screen),
                                      'description': not bool(game.description.strip()),
                                      'review': bool(reviews.get(game.id))}
                if _api_query_value(query, 'compact') == 'true':
                    scope = (str(DATA.resolve()), str(COLLECTION.resolve()), active_collection()['id'], view, _api_query_value(query, 'groupVersions'))
                    return {**SUMMARY_SNAPSHOTS.response(scope, games, _api_query_value(query, 'since')), 'collection_id':active_collection()['id']}
                return {"games": games, "collection_id": active_collection()["id"]}
        if route == "/api/game-versions":
            entry = catalogue_game_entry(active_collection()["id"], _api_query_value(query, "game_id"))
            service = get_catalogue_service()
            result = service.versions(entry.base["catalogueId"])
            # File labels belong to the Arcade-only view, never the portable catalogue.
            for version in result['versions']:
                indexed = service._by_id[version['catalogueId']]
                version['gameId'] = indexed.legacy_id
                version['collectionId'] = indexed.collection_id
                if indexed.base['targetKind'] == 'disk-set':
                    source = next(s for s in service._sources if s.collection_id == indexed.collection_id)
                    version['imageFiles'] = [Path(p).name for p in source.rows[indexed.legacy_id]['disks']]
                elif indexed.base['targetKind'] == 'media-file':
                    version['imageFiles'] = [Path(indexed.relative_path).name]
            return result
        if route == "/api/game":
            game = get_library().get_game(_api_query_value(query, "game_id"))
            result = asdict(game) if game else None
            if result is not None:
                result['scrape_provenance'] = metadata_notes().load()['provenance'].get(game.id, {})
            return {"game": result}
        if route == "/api/collections":
            return collections_payload()
        if route == "/api/job":
            return {"job": get_job(_api_query_value(query, "id"))}
        if route == "/api/emulators":
            return {"emulators": emulator_payload()}
        if route == "/api/emulator-profiles":
            return {"profiles": emulator_profiles_payload()}
        if route == "/api/scrapers":
            return scrapers_payload()
        if route == "/api/poks":
            game = get_library().get_game(_api_query_value(query, "game_id"))
            return {"poks": get_library().get_poks(game) if game else []}
        if route == "/api/recent":
            return {"recent": load_recent()}

    if verb == "POST":
        if route == "/api/game-version-default":
            entry = catalogue_game_entry(active_collection()["id"], data.get("game_id", ""))
            return set_game_version_default(entry.base["catalogueId"], data.get("catalogueId"), data.get("entryRevision"))
        if route == "/api/catalogue-preparation/preview":
            return catalogue_preparation_request(data)
        if route == "/api/catalogue-preparation/confirm":
            return catalogue_preparation_request(data, confirm=True)
        if route == "/api/favourite":
            game_id = str(data.get("game_id", ""))
            favourite = bool(data.get("favourite", False))
            game = get_library().set_favourite(game_id, favourite)
            if not game:
                return {"ok": False, "error": "Unknown game"}
            set_favourite(game_id, favourite)
            return {"ok": True, "game": asdict(game)}
        if route == "/api/favourites-bulk":
            return set_favourites_bulk(data.get("game_ids", []), bool(data.get("favourite", False)))
        if route == "/api/select-collection":
            return {"ok": True, "job_id": start_select_collection_job(str(data.get("collection_id", "")))}
        if route == "/api/add-collection":
            return add_collection(str(data.get("root", "")), str(data.get("name", "")),
                                  bool(data.get("writable", False)), bool(data.get("auto_metadata", False)))
        if route == "/api/emulators":
            return update_emulators(
                data.get("emulators", []), data.get("collection_id", ""), data.get("default_emulator", "")
            )
        if route == "/api/emulators/delete":
            return delete_emulator(data.get("emulator_id", ""))
        if route == "/api/scrapers":
            return update_scraper_config(data.get("scrapers", {}))
        if route == "/api/emulator-profiles/import":
            return import_emulator_profile(data)
        if route == "/api/emulator-profiles/update":
            return update_emulator_profile(data)
        if route == "/api/emulator-profiles/delete":
            return delete_emulator_profile(str(data.get("profile_id", "")))
        if route == "/api/emulator-profiles/update-source":
            return update_emulator_profile_from_source(str(data.get("profile_id", "")))
        if route == "/api/pick-path":
            return pick_path(str(data.get("kind", "file")), str(data.get("title", "")), str(data.get("initial", "")))
        if route == "/api/launch":
            return launch_game(str(data.get("game_id", "")), str(data.get("emulator", "default")),
                               str(data.get("launch_action", "")), bool(data.get("force_new", False)),
                               str(data.get("profile_id", "")))
        if route == "/api/open-pok":
            return open_pok(str(data.get("pok_id", "")))
        if route == "/api/open-explorer":
            return open_in_explorer(str(data.get("game_id", "")))
        if route == "/api/scrape-preview":
            if data.get('background') is True:
                return start_scrape_preview(data)
            return scrape_preview(str(data.get("game_id", "")), str(data.get("provider", "manual")),
                                  data.get("search_term"), data.get("search_platform", "current"))
        if route == '/api/scrape-targets':
            return scrape_targets(data.get('game_ids'))
        if route == "/api/rebuild":
            return {"ok": True, "job_id": start_rebuild_job()}

        writable_routes = {
            "/api/rename", "/api/update-metadata", "/api/metadata-preview", "/api/metadata-undo", "/api/apply-scrape", "/api/metadata-care",
            "/api/delete-bulk",
            "/api/delete", "/api/import-incoming", "/api/import-incoming-bulk", "/api/restore-trash",
            "/api/purge-trash", "/api/move-language",
        }
        from arcade_core.platforms import LIBRARIES, collection_platform
        capabilities = LIBRARIES.get(collection_platform(active_collection()), {})
        adapter_scrape = route in {"/api/apply-scrape", "/api/metadata-care"} and (capabilities.get("presentationOverrides", False) or capabilities.get('metadataWritable', False))
        if route in writable_routes and not current_collection_writable() and not adapter_scrape:
            return _read_only_error()
        if route == "/api/rename":
            return rename_game(str(data.get("game_id", "")), str(data.get("name", "")))
        if route == "/api/update-metadata":
            return update_game_metadata(data.get("game_ids", []), data.get("changes", {}), bool(data.get("rename_files", False)))
        if route == "/api/metadata-preview":
            return preview_game_metadata(data.get("game_ids", []), data.get("changes", {}), bool(data.get("rename_files", False)))
        if route == "/api/metadata-undo":
            return undo_game_metadata()
        if route == "/api/metadata-care":
            return metadata_care_request(data)
        if route == "/api/apply-scrape":
            return apply_scrape_metadata(str(data.get("game_id", "")), data.get("candidate", {}),
                                         data.get("assets", {}), data.get("remote_assets", {}), data.get('target_ids'), data.get('mode', 'replace'), data.get('undo_group', ''), data.get('search_options'))
        if route == "/api/delete":
            return delete_game(str(data.get("game_id", "")))
        if route == "/api/delete-bulk":
            return delete_games(data.get("game_ids", []))
        if route == "/api/import-incoming":
            return import_incoming_game(str(data.get("game_id", "")))
        if route == "/api/import-incoming-bulk":
            return import_incoming_games(data.get("game_ids", []))
        if route == "/api/restore-trash":
            return restore_trash_games(data.get("game_ids", data.get("game_id", [])))
        if route == "/api/purge-trash":
            return purge_trash_games(data.get("game_ids", data.get("game_id", [])))
        if route == "/api/move-language":
            return move_between_collection_and_languages(str(data.get("game_id", "")))

    raise ServiceContractError("Unsupported Cyrune Arcade API operation")


def read_arcade_asset(relative_path: object, max_bytes: object = 4 * 1024 * 1024, collection_id=None) -> dict[str, object]:
    if collection_id is not None:
        with COLLECTION_JOB_LOCK:
            from arcade_core.collection_context import validate
            validate(collection_id, active_collection())
            return read_arcade_asset(relative_path, max_bytes)

    if str(relative_path or "").startswith(SCREENSCRAPER_ART_PREFIX):
        return read_screenscraper_artwork(relative_path, max_bytes)
    relative = unquote(str(relative_path or "")).replace("\\", "/").lstrip("/")
    if not relative or "\x00" in relative:
        raise ServiceContractError("Asset path is invalid")
    root = COLLECTION.resolve()
    try:
        target = resolve_within(root, relative, require_exists=True)
    except (FileNotFoundError, PathConfinementError) as exc:
        raise ServiceContractError("Asset path escapes the active collection") from exc
    limit = max(1, min(4 * 1024 * 1024, int(max_bytes or 0)))
    if not target.is_file() or target.stat().st_size > limit:
        raise ServiceContractError("Asset is missing or too large")
    content_type = mimetypes.guess_type(target.name)[0] or ""
    if content_type not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}:
        raise ServiceContractError("Asset type is not supported")
    encoded = base64.b64encode(target.read_bytes()).decode("ascii")
    return {"dataUrl": f"data:{content_type};base64,{encoded}", "contentType": content_type}


# Compatibility exports retained for installed Host versions predating the Arcade rename.
dispatch_emugui_read = dispatch_arcade_read
dispatch_emugui_api = dispatch_arcade_api
read_emugui_asset = read_arcade_asset


def emulator_payload() -> list[dict]:
    payload = []
    for key, emulator in configured_emulators(include_hidden=True).items():
        if emulator.get("hidden"):
            continue
        path = expand_config_path(emulator.get("path"))
        payload.append(
            {
                "id": key,
                "name": str(emulator.get("name") or key),
                "type": str(emulator.get("type") or ""),
                "path": str(path) if path else "",
                "working_dir": str(expand_config_path(emulator.get("working_dir")) or ""),
                "supported_extensions": emulator.get("supported_extensions") or [],
                "arguments": emulator.get("arguments") or ["{file}"],
                "current_arguments": emulator.get("current_arguments") or [],
                "pok_arguments": emulator.get("pok_arguments") or [],
                "pok_helper_path": str(expand_config_path(emulator.get("pok_helper_path")) or ""),
                "eightyone_config_target": str(expand_config_path(emulator.get("eightyone_config_target")) or ""),
                "built_in": key in DEFAULT_EMULATORS,
                "available": True if not path else path.exists(),
            }
        )
    return payload


EMULATOR_ICON_READER = None  # Host provides installed-application icon extraction.
EMULATOR_ICON_CACHE = {}


def emulator_shortcut_request(verb, route, params):
    from arcade_core import emulator_shortcuts
    try:
        with COLLECTION_JOB_LOCK:
            collection = active_collection()
            if params.get('collection_id') != collection['id']:
                raise ValueError('The platform changed. Select an emulator from the current platform.')
            allowed = {'collection_id'} if route == '/api/emulator-shortcuts' else {'collection_id', 'emulator_id'}
            if set(params) - allowed:
                raise ValueError('Invalid emulator shortcut request.')
            emulators = configured_emulators(include_hidden=True)
            if verb == 'GET' and route == '/api/emulator-shortcuts':
                return {'shortcuts': emulator_shortcuts.shortcuts(collection, emulators, expand_config_path)}
            identifier = params.get('emulator_id')
            if verb == 'POST' and route == '/api/launch-emulator':
                return emulator_shortcuts.launch(collection, emulators, identifier, expand_config_path, launch_visible)
            if verb != 'GET' or route != '/api/emulator-icon':
                raise ValueError('Invalid emulator shortcut operation.')
            _, path = emulator_shortcuts.executable(collection, emulators, identifier, expand_config_path)
            stat = path.stat()
            key = (str(path), stat.st_size, stat.st_mtime_ns)
        # Icon extraction must not hold the collection-change lock.
        if key not in EMULATOR_ICON_CACHE:
            icon = EMULATOR_ICON_READER(str(path)) if callable(EMULATOR_ICON_READER) else ''
            if not isinstance(icon, str) or len(icon) > 700000 or not icon.startswith('data:image/png;base64,'):
                icon = ''
            if len(EMULATOR_ICON_CACHE) >= 64:
                EMULATOR_ICON_CACHE.pop(next(iter(EMULATOR_ICON_CACHE)))
            EMULATOR_ICON_CACHE[key] = icon
        return {'icon': EMULATOR_ICON_CACHE[key]}
    except (ValueError, OSError) as error:
        return {'ok': False, 'error': str(error)}


def set_favourite(game_id: str, favourite: bool) -> None:
    if not game_id:
        return

    def mutate(state: dict) -> None:
        favourites = set(state.get("favourites", []))
        if favourite:
            favourites.add(game_id)
        else:
            favourites.discard(game_id)
        state["favourites"] = sorted(favourites)

    update_state(mutate)


def set_favourites_bulk(game_ids: object, favourite: bool) -> dict[str, object]:
    ids = list(dict.fromkeys(selected_game_ids(game_ids)))
    if not ids:
        return {"ok": False, "error": "No games selected"}
    library = get_library()
    previous = {
        game_id: bool(game.favourite)
        for game_id in ids
        if (game := library.get_game(game_id)) is not None
    }
    if not previous:
        return {"ok": False, "error": "No known games selected"}
    updated = library.set_favourites(list(previous), favourite)
    try:
        def mutate(state: dict) -> None:
            favourites = set(state.get("favourites", []))
            if favourite:
                favourites.update(updated)
            else:
                favourites.difference_update(updated)
            state["favourites"] = sorted(favourites)

        update_state(mutate)
    except Exception:
        for game_id, old_value in previous.items():
            library.set_favourite(game_id, old_value)
        raise
    return {"ok": True, "updated": updated, "count": len(updated)}


def load_recent() -> list[dict[str, str]]:
    recent = [item for item in load_state().get("recent", []) if isinstance(item, dict)]
    recent.sort(key=lambda item: item.get("played_at", ""), reverse=True)
    return recent[:30]


def mark_recent(game_id: str) -> None:
    def mutate(state: dict) -> None:
        recent = [
            item for item in state.get("recent", [])
            if isinstance(item, dict) and item.get("game_id") != game_id
        ]
        recent.insert(0, {"game_id": game_id, "played_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds")})
        state["recent"] = recent[:30]

    update_state(mutate)


def update_emulators(payload: object, collection_id: object = "", default_emulator: object = "") -> dict:
    try:
        service = get_emulator_config_service()
        service.save_many(payload)
        if collection_id:
            service.set_collection_default(collection_id, default_emulator)
        return {"ok": True, "emulators": emulator_payload(), "collections": collections_payload()}
    except EmulatorConfigError as exc:
        return {"ok": False, "error": str(exc)}


def delete_emulator(emulator_id: object) -> dict:
    try:
        get_emulator_config_service().delete(emulator_id)
        return {"ok": True, "emulators": emulator_payload(), "collections": collections_payload()}
    except EmulatorConfigError as exc:
        return {"ok": False, "error": str(exc)}


def split_extensions(value: object) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        raw = re.split(r"[,\s;]+", str(value or ""))
    extensions = []
    for item in raw:
        ext = str(item).strip().lower()
        if not ext:
            continue
        if not ext.startswith("."):
            ext = f".{ext}"
        if ext not in extensions:
            extensions.append(ext)
    return extensions


def prepare_emulator_profile(emulator: dict[str, object], game: Game, profile_id: str = "") -> None:
    prepare_eightyone_profile(
        emulator,
        game,
        profile_id,
        expand_path=expand_config_path,
        select_profile=select_managed_profile,
    )


def get_launch_service(*, bound_game=None, bound_root=None) -> GameLaunchService:
    """Build a launch service around the current configuration and library."""

    return GameLaunchService(
        get_game=lambda game_id: (bound_game if game_id == bound_game.id else None) if bound_game is not None else get_library().get_game(game_id),
        get_pok=lambda pok_id: get_library().get_pok(pok_id),
        emulator_provider=lambda: configured_emulators(include_hidden=True),
        expand_path=expand_config_path,
        prepare_profile=prepare_emulator_profile,
        mark_recent=mark_recent,
        launch_process=launch_visible,
        open_default=lambda path: os.startfile(path),  # type: ignore[attr-defined]
        find_running_window=find_running_emulator_window,
        focus_emulator=focus_launched_emulator,
        bring_to_front=bring_window_to_front,
        collection_root=lambda: COLLECTION if bound_root is None else bound_root,
        check_immediate_exit=should_check_immediate_exit,
    )


def _bound_spectrum_game(collection_id, game_id):
    """Resolve a legacy native binding without changing Arcade's active library."""
    service = get_catalogue_service()
    entry = catalogue_game_entry(collection_id, game_id)
    if entry.base['platformId'] not in {'zx-spectrum', 'game-boy'}:
        raise ValueError('The saved game is not a supported cartridge or Spectrum target')
    source = next(source for source in service._sources if source.collection_id == collection_id)
    item = source._row_index().get(game_id)
    games = load_metadata_games({}, set(), root=source.root, items=[item] if item else [])
    if not games:
        raise FileNotFoundError('The bound game file is missing from its collection')
    return games[0], source.root


def bound_game_source(collection_id, game_id):
    with COLLECTION_JOB_LOCK:
        game, root = _bound_spectrum_game(collection_id, game_id)
        return {'game': {**asdict(game), '_collectionRoot': str(root)},
                'active': {'id': collection_id, 'root': str(root)},
                'emulators': emulator_payload(), 'profiles': emulator_profiles_payload()}


def launch_bound_game(collection_id, game_id, emulator_id, profile_id=''):
    with COLLECTION_JOB_LOCK:
        game, root = _bound_spectrum_game(collection_id, game_id)
        return get_launch_service(bound_game=game, bound_root=root).launch_game(game_id, emulator_id, profile_id=profile_id)


def launch_game(game_id: str, emulator_id: str, launch_action: str = "", force_new: bool = False, profile_id: str = "") -> dict:
    collection = active_collection()
    if collection.get('adapter') == 'atari-st-disks-v1':
        if not callable(DISK_SET_LAUNCH):
            return {'ok': False, 'error': 'Atari launch requires Cyrune Host'}
        from arcade_core.catalogue_identity import CatalogueError
        try:
            plan = resolve_atari_game_plan(collection['id'], game_id, emulator_id, profile_id)
            return {'ok': bool(DISK_SET_LAUNCH(plan, atari_emulator_override=emulator_id)), 'title': plan['public']['title']}
        except CatalogueError as error:
            return {'ok': False, 'error': 'The selected emulator does not support this Atari edition or disk format.' if error.code == 'unsupported-target' else 'The Atari disk set, emulator or selected configuration is unavailable.'}
    if collection.get("adapter") == "scummvm-config-v1":
        if not callable(SCUMMVM_LAUNCH):
            return {"ok": False, "error": "ScummVM launch requires Cyrune Host"}
        if launch_action:
            return {"ok": False, "error": "ScummVM launches its registered target directly"}
        plan = resolve_scummvm_game_plan(collection["id"], game_id, emulator_id, profile_id)
        from arcade_core.catalogue_identity import CatalogueError
        try:
            launched = bool(SCUMMVM_LAUNCH(plan))
        except (OSError, CatalogueError) as exc:
            if isinstance(exc, CatalogueError) and exc.code != "unavailable":
                raise
            launched = False
        if not launched:
            return {"ok": False, "error": "ScummVM could not start the game. Open it in ScummVM to check its startup message."}
        return {"ok": True, "title": plan["public"]["title"]}
    return get_launch_service().launch_game(game_id, emulator_id, launch_action, force_new, profile_id)


def running_emulator_choice_payload(emulator_id: str) -> dict:
    return get_launch_service().running_choice(emulator_id)


def send_to_running_spectaculator(path: Path, game_id: str, running_hwnd: int) -> dict:
    return get_launch_service().send_to_running_spectaculator(path, game_id, running_hwnd)


def open_pok(pok_id: str) -> dict:
    return get_launch_service().open_pok(pok_id)


def open_in_explorer(game_id: str) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        return {"ok": False, "error": "Unknown game"}
    path = Path(game.path)
    if not path.exists():
        return {"ok": False, "error": f"Missing game file: {path}"}
    native_reveal = globals().get('NATIVE_REVEAL_GAME')
    if callable(native_reveal):
        native_reveal(path)
        return {"ok": True}
    if os.name == "nt":
        # Keep the switch separate: subprocess quotes arguments containing spaces,
        # and Explorer does not parse a quoted "/select,<path>" as a selection.
        subprocess.Popen(["explorer.exe", str(path)] if path.is_dir()
                         else ["explorer.exe", "/select,", str(path)])
    else:
        webbrowser.open(str(path if path.is_dir() else path.parent))
    return {"ok": True}


@_catalogue_serialized
def rename_game(game_id: str, name: str) -> dict:
    return get_metadata_service().rename_game(game_id, name)


def get_metadata_service() -> MetadataService:
    global METADATA_SERVICE
    if METADATA_SERVICE is not None:
        return METADATA_SERVICE
    METADATA_SERVICE = MetadataService(
        library_provider=get_library,
        ensure_metadata_file=ensure_metadata_file,
        load_metadata=load_metadata,
        save_metadata=save_metadata,
        game_to_metadata_item=game_to_metadata_item,
        apply_metadata_changes=apply_metadata_changes,
        apply_metadata_values=apply_metadata_values,
        build_target_path=build_metadata_target_path,
        metadata_warnings=metadata_edit_warnings,
        metadata_change_labels=metadata_change_labels,
        collection_relative=collection_relative,
        unique_path=unique_path,
        clean_file_name=clean_file_name,
        update_metadata_game=update_metadata_game,
        clean_metadata_text=clean_metadata_text,
        clean_asset_path=clean_asset_path,
        dedupe=dedupe,
        before_move=before_catalogue_move,
    )
    return METADATA_SERVICE


def metadata_notes():
    from arcade_core.metadata_notes import MetadataNotes
    return MetadataNotes(DATA, active_collection())


def metadata_care():
    from arcade_core.metadata_care import MetadataCare
    return MetadataCare(sys.modules[__name__])


@_catalogue_serialized
def apply_scrape_metadata(game_id: str, candidate: object, assets: object | None = None, remote_assets: object | None = None,
                          target_ids: object = None, mode='replace', undo_group='', search_options=None) -> dict:
    from arcade_core.metadata_care import MetadataCareError
    from arcade_core.scrape_preferences import ScrapePreferences, validate
    try:
        care = metadata_care()
        if search_options is not None:
            search_options = validate(search_options)
            if search_options['provider'] not in configured_scrapers():
                raise ValueError('Unknown search provider.')
            preferences = ScrapePreferences(DATA, active_collection())
            preferences.load()  # Validate existing storage before metadata changes.
            _, members = care.members(game_id)
        result = care.apply(game_id, candidate, remote_assets, target_ids, mode, undo_group)
        if search_options is not None and result.get('ok'):
            try:
                preferences.record([row.id for row in members], search_options)
            except (OSError, ValueError):
                result.setdefault('warnings', []).append('Metadata saved, but the search choices could not be remembered.')
        result['game'] = asdict(get_library().get_game(game_id))
        return result
    except MetadataCareError as error:
        return {'ok': False, 'error': str(error)}


@_catalogue_serialized
def metadata_care_request(data):
    try:
        care = metadata_care()
        if data.get('action') == 'undo':
            reverted = list((care.journal.load().get('undo') or {}).get('after', {}))
            count = care.journal.undo()
            metadata_notes().clear(reverted)
            get_library().rebuild()
            if METADATA_SERVICE is not None:
                METADATA_SERVICE.clear_history()
            return {'ok': True, 'restored_count': count}
        return care.protection(str(data.get('game_id', '')), data.get('protected_fields'), data.get('changes'))
    except (ValueError, OSError) as error:
        return {'ok': False, 'error': str(error)}


def scrape_candidate_changes(candidate: dict, assets: dict, remote_assets: dict) -> dict:
    return get_metadata_service().scrape_candidate_changes(candidate, remote_assets)


@_catalogue_serialized
def update_game_metadata(game_ids: object, changes: object, rename_files: bool = False) -> dict:
    return get_metadata_service().update(game_ids, changes, rename_files)


def preview_game_metadata(game_ids: object, changes: object, rename_files: bool = False) -> dict:
    return get_metadata_service().preview(game_ids, changes, rename_files)


@_catalogue_serialized
def undo_game_metadata() -> dict:
    return get_metadata_service().undo_last()


def start_scrape_preview(data):
    from arcade_core.scrape_groups import folder_members
    from arcade_core.scrape_text import review
    import hashlib
    game = get_library().get_game(str(data.get('game_id', '')))
    if not game:
        return {'ok':False, 'error':'Unknown game'}
    game = deepcopy(game)
    collection_id = active_collection()['id']
    members = [row.id for row in folder_members(get_library(), COLLECTION, game)]
    providers = deepcopy(configured_scrapers())
    provider_id = str(data.get('provider', 'manual'))
    provider = providers.get(provider_id, {})
    # Hash configuration only in memory; no credential-bearing cache keys or raw responses persist.
    from arcade_core.collection_cache import stamp
    media_revision = stamp(game.path) if game.type == 'Game Boy' else None
    cache_key = hashlib.sha256(json.dumps([media_revision, provider, collection_id, str(COLLECTION.resolve()), sorted(members), game.id, game.title, game.year, game.publisher, game.platform,
        data.get('search_term'), data.get('search_platform', 'current')], sort_keys=True).encode()).hexdigest()
    provider['_collection_root'] = str(COLLECTION.resolve())
    adapters = get_scraper_service()._adapters
    def work():
        service = ScraperService(get_game=lambda _:game, provider_config=lambda:providers, adapters=adapters,
                                optional_network_allowed=lambda:bool(OPTIONAL_NETWORK_ALLOWED()))
        result = service.preview(game.id, provider_id, data.get('search_term'), data.get('search_platform', 'current'))
        result['target_ids'] = members
        result['needs_review'], result['review_reason'] = review(result)
        if game.type == 'ScummVM' and game.platform == 'unknown' and data.get('search_platform', 'current') == 'current':
            result['needs_review'] = True
        result['collection_id'] = collection_id
        result['game_id'] = game.id
        return result
    return SCRAPE_JOBS.start(collection_id, work, cache_key=cache_key, refresh=data.get('refresh') is True)


def cached_artwork_path(reference):
    from arcade_core.entry_artwork import target, location
    found = target(COLLECTION, DATA, {'loading_screen':reference})
    if not found:
        return None
    try:
        path = location(COLLECTION, DATA, found[0])[1]
        return path if 0 < path.stat().st_size <= 4 * 1024 * 1024 else None
    except OSError:
        return None


def start_artwork_job(reference, collection_id=None):
    collection_id = collection_id or active_collection()['id']
    from arcade_core.collection_context import validate
    validate(collection_id, active_collection())
    if not screenscraper_artwork_parts(reference):
        return read_arcade_asset(reference, collection_id=collection_id)
    return SCRAPE_JOBS.start(collection_id, lambda:read_screenscraper_artwork(reference, 4 * 1024 * 1024))


def scrape_job_result(query):
    collection_id = str(query.get('collection_id', ''))
    payload = SCRAPE_JOBS.get(str(query.get('id', '')), collection_id)
    result = payload.get('result', {})
    if payload.get('status') == 'done' and 'needs_review' in result:
        with COLLECTION_JOB_LOCK:
            if active_collection()['id'] == collection_id:
                metadata_care().journal.review(result.get('target_ids', []), result['needs_review'])
    return payload


def scrape_preview(game_id: str, provider_id: str = "manual", search_term: object = None,
                   search_platform: object = "current") -> dict:
    from arcade_core.scrape_groups import folder_members
    game = get_library().get_game(game_id)
    if not game:
        return {'ok': False, 'error': 'Unknown game'}
    members = folder_members(get_library(), COLLECTION, game)
    result = get_scraper_service().preview(game_id, provider_id, search_term, search_platform)
    result['target_ids'] = [row.id for row in members]
    if len(members) > 1:
        result['warnings'] = [f'Metadata and artwork will update all {len(members)} versions in this game folder.',
                              *result.get('warnings', [])]
    if game.type == 'ScummVM' and game.platform == 'unknown' and search_platform == 'current':
        result['warnings'] = ['This registration has no platform specified. Review the platform of each result from All platforms.',
                              *result.get('warnings', [])]
    if provider_id != 'manual':
        from arcade_core.metadata_care import needs_review
        result['needs_review'] = bool(result.get('ok') is False or needs_review(result) or
                 (game.type == 'ScummVM' and game.platform == 'unknown' and search_platform == 'current'))
        metadata_care().journal.review([member.id for member in members], result['needs_review'])
    return result


@_catalogue_serialized
def scrape_targets(game_ids):
    """Plan bounded review rows without exposing folder or registration authority."""
    from arcade_core.scrape_groups import folder_members, MAX_SCRAPE_TARGETS
    if (not isinstance(game_ids, list) or not 1 <= len(game_ids) <= 100 or
            any(not isinstance(key, str) for key in game_ids)):
        return {'ok': False, 'error': 'Select between 1 and 100 games.'}
    library = get_library()
    selected = [library.get_game(key) for key in dict.fromkeys(game_ids)]
    if any(not game or game.view != 'collection' for game in selected):
        return {'ok': False, 'error': 'Only collection games can be scraped.'}
    families = {}
    if active_collection().get('adapter') == 'scummvm-config-v1':
        summaries = game_version_summaries(library.list_game_summaries('collection'))
        families = {row['id']: row.get('version_group', row['id']) for row in summaries}
        wanted = {families[game.id] for game in selected}
        selected = [game for game in library.games if families.get(game.id) in wanted]
    from arcade_core.scrape_preferences import ScrapePreferences, for_members
    searches = ScrapePreferences(DATA, active_collection()).load()
    seen, targets = set(), []
    for game in selected:
        if game.id in seen:
            continue
        members = folder_members(library, COLLECTION, game)
        seen.update(row.id for row in members)
        targets.append({**{key: getattr(game, key) for key in ('id', 'title', 'type', 'system', 'platform', 'language', 'version', 'year', 'publisher')},
                        'target_ids': [row.id for row in members], 'scrape_count': len(members),
                        'scrape_searches': for_members(searches, members, game),
                        'search_key': stable_id(str([families.get(game.id, game.id), game.platform, game.title, game.year, game.publisher]))})
        if len(targets) > MAX_SCRAPE_TARGETS or len(seen) > MAX_SCRAPE_TARGETS:
            return {'ok': False, 'error': 'Too many versions. Select fewer games for this batch.'}
    return {'ok': True, 'games': targets}


def get_scraper_service() -> ScraperService:
    return ScraperService(
        get_game=lambda game_id: get_library().get_game(game_id),
        provider_config=configured_scrapers,
        adapters={
            "manual": ScraperAdapter("manual", manual_scrape_preview),
            "screenscraper": ScraperAdapter("screenscraper", screenscraper_scrape_preview),
            "thegamesdb": ScraperAdapter("thegamesdb", thegamesdb_scrape_preview),
        },
        optional_network_allowed=lambda: bool(OPTIONAL_NETWORK_ALLOWED()),
    )


def screenscraper_scrape_preview(game: Game, provider: dict[str, object]) -> dict:
    title = str(provider.get("_search_term", game.title))
    identified = None
    if provider.get('_collection_root') and game.type == 'Game Boy' and '_search_term' not in provider and provider.get('_search_platform', 'current') == 'current':
        from arcade_core.cartridge_hashes import fingerprints
        try:
            hashes = fingerprints(provider['_collection_root'], game.path)
            raw, _ = screenscraper_api_request(provider, 'jeuInfos.php', {**hashes, 'systemeid':screenscraper_system_id(game, provider)}, 4 * 1024 * 1024)
            response = json.loads(raw).get('response', {})
            SCREENSCRAPER_THREADS.update(provider, response.get('ssuser'))
            with SCREENSCRAPER_LOCK:
                SCREENSCRAPER_QUOTA.update(response.get('ssuser'))
            possible = response.get('jeu')
            if isinstance(possible, dict) and isinstance(possible.get('rom'), dict) and str(possible['rom'].get('romsha1', '')).lower() == hashes['sha1']:
                identified = possible
        except (OSError, ValueError) as error:
            if hasattr(error, 'retry_after'):
                raise
    data = {} if identified else screenscraper_request(game, provider, title)
    rows = [identified] if identified else data.get('response', {}).get('jeux') or []
    if not rows and "_search_term" not in provider:
        fallback = simplified_scrape_title(title)
        if fallback and fallback != title:
            title = fallback
            data = screenscraper_request(game, provider, title)
            rows = data.get("response", {}).get("jeux") or []
    if not isinstance(rows, list):
        raise ValueError("ScreenScraper returned an invalid game list")
    matches = []
    system_id = screenscraper_system_id(game, provider)
    for game_data in rows[:30]:
        if not isinstance(game_data, dict):
            continue
        system = game_data.get("systeme") or {}
        if not isinstance(system, dict) or (system_id and str(system.get("id") or "") != system_id):
            continue
        candidate = screenscraper_candidate(game_data, provider)
        if not candidate["title"]:
            continue
        candidate["scraper_source"] = "screenscraper"
        candidate["scraper_id"] = str(game_data.get("id") or game_data.get("gameid") or "")
        matches.append({
            "match_id": candidate["scraper_id"] or "screenscraper",
            "confidence": 100 if identified else screenscraper_confidence(game, candidate, provider.get('_search_term')),
            "identity": "rom-sha1" if identified else "title",
            "reason": "Exact cartridge identification (SHA-1)." if identified else ("ScreenScraper title search for the chosen platform." if system_id else "ScreenScraper title search across platforms."),
            "candidate": candidate,
            "assets": scrape_asset_targets(game),
            "remote_assets": screenscraper_assets(game_data, provider),
        })
    matches.sort(key=lambda match: match["confidence"], reverse=True)
    return {
        "ok": True,
        "provider": scraper_public_identity(provider),
        "game": import_match_summary(game),
        "query": {**scrape_identity(game), "lookup_title": title, "system_id": system_id},
        "matches": matches,
        "warnings": (["Showing up to 30 provider results. Refine the title or platform if needed."] if len(rows) >= 30 else [])
                    if matches else ["ScreenScraper returned no game match for this title and platform. Try All platforms or edit the search term."],
    }


def thegamesdb_scrape_preview(game: Game, provider: dict[str, object]) -> dict:
    platform_id = thegamesdb_platform_id(game, provider)
    query_title = provider.get("_search_term", game.title)
    data = thegamesdb_request(game, provider, query_title)
    games = (((data.get("data") or {}).get("games")) if isinstance(data.get("data"), dict) else []) or []
    if not games and "_search_term" not in provider:
        fallback_title = simplified_scrape_title(game.title)
        if fallback_title and fallback_title != game.title:
            data = thegamesdb_request(game, provider, fallback_title)
            games = (((data.get("data") or {}).get("games")) if isinstance(data.get("data"), dict) else []) or []
            query_title = fallback_title
    if isinstance(games, dict):
        games = list(games.values())
    includes = (data.get("include") or {}) if isinstance(data.get("include"), dict) else {}
    image_base = thegamesdb_image_base(includes)
    image_lookup: dict = {}
    image_warning = ""
    game_ids = [str(row.get("id") or "") for row in games[:30] if isinstance(row, dict) and row.get("id")]
    if game_ids:
        try:
            image_lookup = thegamesdb_images_request(provider, game_ids)
        except ValueError as exc:
            image_warning = str(exc)
    matches = []
    for row in games[:30]:
        if not isinstance(row, dict):
            continue
        candidate = thegamesdb_candidate(row, includes, provider)
        candidate["scraper_source"] = "thegamesdb"
        candidate["scraper_id"] = str(row.get("id") or "")
        remote_assets = thegamesdb_assets(row, includes, image_base)
        image_assets = thegamesdb_image_assets(candidate["scraper_id"], image_lookup)
        remote_assets = {**remote_assets, **{key: value for key, value in image_assets.items() if value}}
        matches.append(
            {
                "match_id": candidate["scraper_id"] or stable_id(candidate.get("title", "")),
                "confidence": screenscraper_confidence(game, candidate, provider.get('_search_term')),
                "reason": (f"TheGamesDB title lookup filtered by platform {platform_id}." if platform_id
                           else "TheGamesDB title lookup across platforms."),
                "candidate": candidate,
                "assets": scrape_asset_targets(game),
                "remote_assets": remote_assets,
            }
        )
    matches.sort(key=lambda item: item.get("confidence", 0), reverse=True)
    return {
        "ok": True,
        "provider": scraper_public_identity(provider),
        "game": import_match_summary(game),
        "query": {**scrape_identity(game), "lookup_title": query_title},
        "matches": matches,
        "warnings": (([image_warning] if image_warning else []) +
                     (["Showing up to 30 provider results. Refine the title or platform if needed."] if len(games) >= 30 else []))
                    if matches else ["TheGamesDB returned no game match. Try All platforms or edit the search term."],
    }


def thegamesdb_platform_id(game: Game, provider: dict[str, object]) -> str:
    override = platform_override(provider, "thegamesdb")
    if override is not None:
        return override
    from arcade_core.platforms import provider_platform
    return provider_platform(game, 'thegamesdb', provider)


def thegamesdb_request(game: Game, provider: dict[str, object], title: str) -> dict:
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://api.thegamesdb.net/v1")
    params = {
        "apikey": str(provider.get("api_key", "")),
        "name": title,
        "fields": "players,publishers,genres,overview,rating,platform,release_date,developers,coop,youtube",
        "include": "boxart,genres,publishers,platform",
    }
    platform_id = thegamesdb_platform_id(game, provider)
    if platform_id:
        params["filter[platform]"] = platform_id
    url = f"{base_url}/Games/ByGameName?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "DesasteronSpectrumLauncher/0.1"})
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1024 * 1024 * 4).decode("utf-8", errors="replace")
    except HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", errors="replace")
        raise ValueError(f"TheGamesDB HTTP {exc.code}: {detail[:240]}")
    except URLError as exc:
        raise ValueError(f"TheGamesDB request failed: {exc.reason}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"TheGamesDB returned invalid JSON: {exc}")


def thegamesdb_images_request(provider: dict[str, object], game_ids: list[str]) -> dict:
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://api.thegamesdb.net/v1")
    params = {
        "apikey": str(provider.get("api_key", "")),
        "games_id": ",".join(game_ids),
    }
    url = f"{base_url}/Games/Images?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "DesasteronSpectrumLauncher/0.1"})
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1024 * 1024 * 4).decode("utf-8", errors="replace")
    except HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", errors="replace")
        raise ValueError(f"TheGamesDB image lookup HTTP {exc.code}: {detail[:240]}")
    except URLError as exc:
        raise ValueError(f"TheGamesDB image lookup failed: {exc.reason}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"TheGamesDB image lookup returned invalid JSON: {exc}")


def thegamesdb_candidate(row: dict, includes: dict, provider: dict[str, object]) -> dict[str, str]:
    publisher_names = lookup_tgdb_names(row.get("publishers"), includes.get("publishers"), provider, "publishers")
    developer_names = lookup_tgdb_names(row.get("developers"), includes.get("developers"), provider, "developers")
    genre_names = lookup_tgdb_names(row.get("genres"), includes.get("genres"), provider, "genres")
    platform_names = lookup_tgdb_names(row.get("platform"), includes.get("platform"))
    release_date = nested_text(row.get("release_date") or row.get("release_date_eu") or row.get("release_date_us") or "", max_len=24)
    return {
        "title": nested_text(row.get("game_title") or row.get("title") or row.get("name") or ""),
        "year": release_date or extract_year(row.get("release_date") or row.get("release_date_eu") or row.get("release_date_us") or ""),
        "publisher": publisher_names[0] if publisher_names else "",
        "genre": ", ".join(genre_names),
        "developer": ", ".join(developer_names),
        "platform": platform_names[0] if platform_names else "",
        "region": nested_text(row.get("region") or row.get("release_region") or ""),
        "players": nested_text(row.get("players") or "", max_len=24),
        "coop": nested_text(row.get("coop") or "", max_len=24),
        "rating": nested_text(row.get("rating") or "", max_len=80),
        "youtube_id": clean_youtube_id(row.get("youtube") or row.get("youtube_id") or ""),
        "description": nested_text(row.get("overview") or "", max_len=2000),
        "screenshot": "",
        "loading_screen": "",
    }


def lookup_tgdb_names(ids: object, include_rows: object, provider: dict[str, object] | None = None, lookup_kind: str = "") -> list[str]:
    include_map: dict[str, dict] = {}
    rows = include_rows
    if isinstance(rows, dict) and isinstance(rows.get("data"), dict):
        rows = rows.get("data")
    if isinstance(rows, dict):
        include_map = {str(key): value for key, value in rows.items() if isinstance(value, dict)}
    if provider and lookup_kind and not include_map:
        include_map = {key: {"name": value} for key, value in thegamesdb_lookup_table(provider, lookup_kind).items()}
    values = ids if isinstance(ids, list) else ([ids] if ids else [])
    names = []
    for value in values:
        row = include_map.get(str(value))
        if row:
            name = clean_metadata_text(row.get("name") or row.get("genre") or row.get("publisher") or "")
            if name:
                names.append(name)
    return dedupe(names)


def thegamesdb_lookup_table(provider: dict[str, object], kind: str) -> dict[str, str]:
    kind = kind.lower()
    endpoint_map = {"publishers": "Publishers", "developers": "Developers", "genres": "Genres"}
    endpoint = endpoint_map.get(kind)
    if not endpoint:
        return {}
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://api.thegamesdb.net/v1")
    cache_key = (base_url, kind)
    if cache_key in TGDB_LOOKUP_CACHE:
        return TGDB_LOOKUP_CACHE[cache_key]
    url = f"{base_url}/{endpoint}?{urlencode({'apikey': str(provider.get('api_key', ''))})}"
    request = Request(url, headers={"User-Agent": "DesasteronSpectrumLauncher/0.1"})
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1024 * 1024 * 8).decode("utf-8", errors="replace")
        payload = json.loads(raw)
    except (HTTPError, URLError, json.JSONDecodeError):
        return {}
    rows = (((payload.get("data") or {}).get(kind)) if isinstance(payload.get("data"), dict) else {}) or {}
    lookup = {
        str(key): clean_metadata_text(value.get("name") or value.get("genre") or value.get("publisher") or "")
        for key, value in rows.items()
        if isinstance(value, dict)
    }
    TGDB_LOOKUP_CACHE[cache_key] = {key: value for key, value in lookup.items() if value}
    return TGDB_LOOKUP_CACHE[cache_key]


def thegamesdb_image_base(includes: dict) -> str:
    boxart = includes.get("boxart") if isinstance(includes, dict) else {}
    if isinstance(boxart, dict):
        base = boxart.get("base_url") or boxart.get("base_url_original") or boxart.get("base_url_thumb")
        if isinstance(base, str):
            return base.rstrip("/")
        if isinstance(base, dict):
            for key in ("original", "large", "medium", "small", "thumb", "cropped_center_thumb"):
                value = base.get(key)
                if isinstance(value, str) and value:
                    return value.rstrip("/")
    return ""


def thegamesdb_assets(row: dict, includes: dict, image_base: str) -> dict[str, str]:
    game_id = str(row.get("id") or "")
    boxart = includes.get("boxart") if isinstance(includes, dict) else {}
    data = boxart.get("data") if isinstance(boxart, dict) else {}
    rows = []
    if isinstance(data, dict):
        rows = data.get(game_id) or []
    if isinstance(rows, dict):
        rows = [rows]
    screenshot = ""
    loading = ""
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        path = clean_metadata_text(item.get("filename") or item.get("image") or item.get("url"), max_len=500)
        if not path:
            continue
        url = path if path.startswith(("http://", "https://")) else f"{image_base}/{path.lstrip('/')}" if image_base else path
        side = str(item.get("side", "")).lower()
        image_type = str(item.get("type", "")).lower()
        if not screenshot and any(token in image_type for token in ("screenshot", "screen", "fanart")):
            screenshot = url
        if not loading and ("front" in side or "boxart" in image_type or "banner" in image_type):
            loading = url
    return {"screenshot": screenshot, "loading_screen": loading}


def thegamesdb_image_assets(game_id: str, image_data: dict) -> dict[str, str]:
    data = image_data.get("data") if isinstance(image_data, dict) else {}
    if not isinstance(data, dict):
        return {"screenshot": "", "loading_screen": ""}
    base_url = thegamesdb_direct_image_base(data)
    images = data.get("images") if isinstance(data.get("images"), dict) else {}
    rows = images.get(str(game_id), []) if isinstance(images, dict) else []
    if isinstance(rows, dict):
        rows = [rows]
    screenshot = ""
    loading = ""
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        path = clean_metadata_text(item.get("filename") or item.get("image") or item.get("url"), max_len=500)
        if not path:
            continue
        url = path if path.startswith(("http://", "https://")) else f"{base_url}/{path.lstrip('/')}" if base_url else path
        side = str(item.get("side", "")).lower()
        image_type = str(item.get("type", "")).lower()
        if not screenshot and any(token in image_type for token in ("screenshot", "screen")):
            screenshot = url
        if not loading and ("front" in side or "boxart" in image_type or "banner" in image_type):
            loading = url
    return {"screenshot": screenshot, "loading_screen": loading}


def thegamesdb_direct_image_base(data: dict) -> str:
    base = data.get("base_url") if isinstance(data, dict) else {}
    if isinstance(base, str):
        return base.rstrip("/")
    if isinstance(base, dict):
        for key in ("original", "large", "medium", "small", "thumb", "cropped_center_thumb"):
            value = base.get(key)
            if isinstance(value, str) and value:
                return value.rstrip("/")
    return ""


def screenscraper_api_request(provider: dict[str, object], endpoint: str, query: dict, max_bytes: int):
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://api.screenscraper.fr/api2")
    params = {
        "softname": str(provider.get("softname") or "DesasteronSpectrumLauncher"),
        "ssid": str(provider.get("username", "")),
        "sspassword": str(provider.get("password", "")),
        "output": "json",
        **query,
    }
    developer_id = str(provider.get("developer_id", "")).strip()
    developer_password = str(provider.get("developer_password", "")).strip()
    if developer_id:
        params["devid"] = developer_id
    if developer_password:
        params["devpassword"] = developer_password
    url = f"{base_url}/{endpoint}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "CyruneArcade"})
    try:
        with SCREENSCRAPER_THREADS.request(provider):
            with SCREENSCRAPER_LOCK:
                SCREENSCRAPER_QUOTA.before_request()
            timeout = 60 if endpoint == "jeuRecherche.php" and "systemeid" not in query else 20
            with screenscraper_open(request, timeout=timeout) as response:
                raw = response.read(max_bytes + 1)
                content_type = str(getattr(response, "headers", {}).get("Content-Type", "")).split(";", 1)[0].strip().lower()
    except HTTPError as exc:
        # Never echo provider bodies or request URLs: both can contain secrets.
        if exc.code == 404 and endpoint in {"jeuRecherche.php", "jeuInfos.php"}:
            return b'{"response":{"jeux":[]}}', "application/json"
        with SCREENSCRAPER_LOCK:
            SCREENSCRAPER_QUOTA.failed(exc.code)
        explanation = {401: "The service is restricted to active members; check your account or try later.",
                       403: "Check the approved developer credentials.",
                       423: "The API is temporarily closed; try again later.",
                       426: "The scraper application was blocked; check its approval and version.",
                       429: "Request/thread limit reached; wait one minute before retrying.",
                       430: "Daily request quota reached; try again later.",
                       431: "Daily unmatched-game quota reached; try again tomorrow.",
                       503: "The service is busy; try again later."}.get(exc.code, "The request failed; try again later.")
        if exc.code in (429, 430, 431):
            from arcade_core.screenscraper import QuotaPause
            raise QuotaPause(f"ScreenScraper HTTP {exc.code}: {explanation}", 60 if exc.code == 429 else 3600) from None
        raise ValueError(f"ScreenScraper HTTP {exc.code}: {explanation}") from None
    except (URLError, OSError):
        raise ValueError("ScreenScraper connection failed or timed out; try again later.") from None
    if not raw or len(raw) > max_bytes:
        raise ValueError("ScreenScraper response is empty or exceeds the size limit")
    return raw, content_type


def screenscraper_request(game: Game, provider: dict[str, object], title: str | None = None) -> dict:
    system_id = screenscraper_system_id(game, provider)
    raw, _ = screenscraper_api_request(provider, "jeuRecherche.php", {
        **({"systemeid": system_id} if system_id else {}),
        "recherche": title if title is not None else provider.get("_search_term", game.title),
    }, 4 * 1024 * 1024)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeError):
        raise ValueError("ScreenScraper returned a non-JSON response; check API credentials, approval and quota.") from None
    if not isinstance(data, dict) or not isinstance(data.get("response"), dict):
        raise ValueError("ScreenScraper returned an invalid response; check API credentials, approval and quota.")
    SCREENSCRAPER_THREADS.update(provider, data["response"].get("ssuser"))
    with SCREENSCRAPER_LOCK:
        SCREENSCRAPER_QUOTA.update(data["response"].get("ssuser"))
    return data


def read_screenscraper_artwork(reference: object, max_bytes: object) -> dict[str, object]:
    parts = screenscraper_artwork_parts(reference)
    if not parts:
        raise ServiceContractError("ScreenScraper artwork reference is invalid")
    from arcade_core.artwork_cache import ArtworkCache
    limit = max(1, min(4 * 1024 * 1024, int(max_bytes or 0)))
    cached = ArtworkCache(DATA).read(reference, limit)
    if cached is not None:
        return {'dataUrl':'data:image/png;base64,' + base64.b64encode(cached).decode('ascii'), 'contentType':'image/png'}
    if not OPTIONAL_NETWORK_ALLOWED():
        raise ServiceContractError("Optional network access is disabled in Cyrune Nexus")
    provider = configured_scrapers().get("screenscraper", {})
    if not provider.get("enabled") or not provider.get("configured"):
        raise ServiceContractError("ScreenScraper is disabled or not configured")
    system_id, game_id, media_type, region = parts
    limit = max(1, min(4 * 1024 * 1024, int(max_bytes or 0)))
    from arcade_core.artwork_cache import ArtworkCache
    cache = ArtworkCache(DATA)
    raw = cache.read(reference, limit)
    if raw is None:
        raw, content_type = screenscraper_api_request(provider, "mediaJeu.php", {
            "systemeid": system_id, "jeuid": game_id,
            "media": media_type + (f"({region})" if region != "none" else ""),
            "outputformat": "png", "maxwidth": "1000", "maxheight": "1000",
        }, limit)
        if content_type != "image/png" or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ServiceContractError("ScreenScraper did not return a supported image")
        cache.write(reference, raw)
    encoded = base64.b64encode(raw).decode("ascii")
    return {"dataUrl": f"data:image/png;base64,{encoded}", "contentType": "image/png"}


def scraper_public_identity(provider: dict[str, object]) -> dict[str, object]:
    return {
        "id": provider.get("id", ""),
        "name": provider.get("name", ""),
        "type": provider.get("type", ""),
    }


def manual_scrape_preview(game: Game, provider: dict[str, object]) -> dict:
    candidate = {
        "title": game.title,
        "year": game.year,
        "publisher": game.publisher,
        "genre": game.genre,
        "description": game.description,
        "screenshot": game.screenshot,
        "loading_screen": game.loading_screen,
        "scraper_source": provider.get("id", "manual"),
        "scraper_id": "",
    }
    return {
        "ok": True,
        "provider": {
            "id": provider.get("id", "manual"),
            "name": provider.get("name", "Manual Metadata"),
            "type": provider.get("type", "manual"),
        },
        "game": import_match_summary(game),
        "query": scrape_identity(game),
        "matches": [
            {
                "match_id": "manual",
                "confidence": 0,
                "reason": "Local metadata scaffold; no online lookup performed yet.",
                "candidate": candidate,
                "assets": scrape_asset_targets(game),
            }
        ],
    }


def scrape_identity(game: Game) -> dict[str, object]:
    return {
        "title": game.title,
        "normalized_title": game.title_key,
        "system": game.system,
        "year": game.year,
        "publisher": game.publisher,
        "languages": list(game.languages),
        "countries": list(game.countries),
        "file_name": game.file_name,
    }


def scrape_asset_targets(game: Game) -> dict[str, str]:
    base = clean_asset_path(f"{folder_letter(game.title)}/{stable_id(game.id)}")
    return {
        "screenshot": f"_assets/scraped/screenshots/{base}.png",
        "loading_screen": f"_assets/scraped/loading-screens/{base}.png",
    }


def metadata_change_labels(changes: dict) -> list[str]:
    labels = []
    for key, value in changes.items():
        if isinstance(value, list):
            text = ", ".join(str(item) for item in value) or "None"
        else:
            text = str(value) if str(value) else "None"
        labels.append(f"{key}: {text}")
    return labels


def ensure_metadata_file() -> None:
    if METADATA_FILE.exists():
        return
    save_metadata_from_games(get_library().games, get_library().poks_by_title_memory)


def apply_metadata_values(game: Game, item: dict, changes: dict) -> None:
    old_title = str(item.get("title") or game.title)
    title = clean_metadata_text(changes.get("title", old_title), allow_empty=False)
    year = clean_metadata_text(changes.get("date", changes.get("year", item.get("year", game.year))), max_len=16)
    publisher = clean_metadata_text(changes.get("publisher", item.get("publisher", game.publisher)))
    system = game.system if game.type == 'Game Boy' else clean_system_value(changes.get("system", item.get("system") or game.system))
    collection_type = item.get("type", game.type or "Official") or "Official"
    version = clean_metadata_text(changes.get("version", item.get("version", "")), max_len=40)
    demo = clean_metadata_text(changes.get("demo", item.get("demo", "")), max_len=40)
    video = clean_metadata_text(changes.get("video", item.get("video", "")), max_len=24).upper()
    copyright_status = clean_metadata_text(changes.get("copyright_status", item.get("copyright_status", "")), max_len=40)
    development_status = clean_metadata_text(changes.get("development_status", item.get("development_status", "")), max_len=40)
    media_type = clean_metadata_text(changes.get("media_type", item.get("media_type", "")), max_len=40)
    media_label = clean_metadata_text(changes.get("media_label", item.get("media_label", "")), max_len=40)
    genre = clean_metadata_text(changes.get("genre", item.get("genre", getattr(game, "genre", ""))), max_len=80)
    developer = clean_metadata_text(changes.get("developer", item.get("developer", getattr(game, "developer", ""))), max_len=160)
    platform = clean_metadata_text(changes.get("platform", item.get("platform", getattr(game, "platform", ""))), max_len=80)
    if game.type == 'Game Boy':
        platform = game.platform
    region = clean_metadata_text(changes.get("region", item.get("region", getattr(game, "region", ""))), max_len=80)
    players = clean_metadata_text(changes.get("players", item.get("players", getattr(game, "players", ""))), max_len=24)
    coop = clean_metadata_text(changes.get("coop", item.get("coop", getattr(game, "coop", ""))), max_len=24)
    rating = clean_metadata_text(changes.get("rating", item.get("rating", getattr(game, "rating", ""))), max_len=80)
    youtube_id = clean_youtube_id(changes.get("youtube_id", item.get("youtube_id", getattr(game, "youtube_id", ""))))
    description = clean_metadata_text(changes.get("description", item.get("description", getattr(game, "description", ""))), max_len=2000)
    screenshot = clean_asset_path(changes.get("screenshot", item.get("screenshot", getattr(game, "screenshot", ""))))
    loading_screen = clean_asset_path(changes.get("loading_screen", item.get("loading_screen", getattr(game, "loading_screen", ""))))
    scraper_source = clean_metadata_text(changes.get("scraper_source", item.get("scraper_source", getattr(game, "scraper_source", ""))), max_len=80)
    scraper_id = clean_metadata_text(changes.get("scraper_id", item.get("scraper_id", getattr(game, "scraper_id", ""))), max_len=120)

    languages = normalize_code_values(changes.get("languages", item.get("languages", list(game.languages))), LANGUAGE_NAMES)
    countries = normalize_code_values(changes.get("countries", item.get("countries", list(game.countries))), COUNTRY_NAMES)
    tags = normalize_text_list(changes.get("tags", item.get("tags", [])))
    if game.type == 'Game Boy':
        tags = list(dict.fromkeys([game.system, *tags]))
    hardware = normalize_text_list(item.get("hardware", []))
    dump_flags = normalize_text_list(changes.get("dump_flags", item.get("dump_flags", [])))
    more_info = normalize_text_list(changes.get("more_info", item.get("more_info", [])))
    default_emulator = clean_metadata_text(changes.get("default_emulator", item.get("default_emulator", "")))
    emulator_profile = clean_id(str(changes.get("emulator_profile", item.get("emulator_profile", "")))) if changes.get("emulator_profile", item.get("emulator_profile", "")) else ""

    item.update(
        {
            "title": title,
            "title_key": normalize_title(title),
            "sort_title": article_sort_title(title),
            "tosec_title": tosec_title_from_display(title),
            "system": system,
            "memory": system,
            "version": version,
            "demo": demo,
            "year": year,
            "date": year,
            "publisher": publisher,
            "video": video,
            "languages": languages,
            "language": format_languages(languages),
            "countries": countries,
            "copyright_status": copyright_status,
            "development_status": development_status,
            "media_type": media_type,
            "media_label": media_label,
            "genre": genre,
            "developer": developer,
            "platform": platform,
            "region": region,
            "players": players,
            "coop": coop,
            "rating": rating,
            "youtube_id": youtube_id,
            "description": description,
            "screenshot": screenshot,
            "loading_screen": loading_screen,
            "scraper_source": scraper_source,
            "scraper_id": scraper_id,
            "dump_flags": dump_flags,
            "more_info": more_info,
            "type": collection_type,
            "section": "Official" if collection_type == "Official" else "Homebrew & Scene",
            "tags": tags,
            "hardware": hardware,
            "status": "Main",
            "letter": folder_letter(title),
        }
    )
    if default_emulator:
        item["default_emulator"] = default_emulator
    elif "default_emulator" in changes:
        item.pop("default_emulator", None)
    if emulator_profile:
        item["emulator_profile"] = emulator_profile
    elif "emulator_profile" in changes:
        item.pop("emulator_profile", None)


def apply_metadata_changes(game: Game, item: dict, changes: dict, rename_files: bool) -> dict:
    source = Path(game.path)
    if not source.exists():
        return {"ok": False, "error": f"Missing game file: {source}"}

    old_title = str(item.get("title") or game.title)
    old_title_key = item.get("title_key") or game.title_key
    old_system = item.get("system") or game.system
    old_memory = item.get("memory") or game.memory
    from arcade_core.metadata_care import FIELDS
    protected = set(item.get('protected_fields', []))
    protected.update('year' if key == 'date' else key for key, value in changes.items()
                     if ('year' if key == 'date' else key) in FIELDS
                     and str(value) != str(getattr(game, 'year' if key == 'date' else key, '')))
    item['protected_fields'] = sorted(protected)
    apply_metadata_values(game, item, changes)

    if rename_files:
        target = build_metadata_target_path(source, item, old_title)
        if target.resolve() != source.resolve():
            target.parent.mkdir(parents=True, exist_ok=True)
            target = unique_path(target)
            before_catalogue_move(source, target)
            source.replace(target)
            item["file"] = collection_relative(target)
            item["format"] = target.suffix.lower()
        else:
            item["file"] = collection_relative(source)
            item["format"] = source.suffix.lower()
    else:
        item["file"] = collection_relative(source)
        item["format"] = source.suffix.lower()

    warnings = metadata_edit_warnings(old_title_key, old_system, old_memory, item)
    item["pok_link_status"] = "explicit" if item.get("poks") else "dynamic"

    file_name = Path(str(item.get("file", source.name))).name
    parsed = parse_tosec_name(file_name)
    item["tosec_tags"] = list(parsed["parentheses"])
    item["flags"] = list(parsed["brackets"])
    final_path = Path(str(item.get("file", source)))
    if not final_path.is_absolute():
        final_path = COLLECTION / final_path
    return {
        "ok": True, "warnings": warnings,
        "source_path": str(source), "target_path": str(final_path),
    }


def metadata_edit_warnings(
    old_title_key: object,
    old_system: object,
    old_memory: object,
    item: dict,
) -> list[str]:
    warnings = []
    title_changed = item.get("title_key") != old_title_key
    system_changed = item.get("system") != old_system or item.get("memory") != old_memory
    if title_changed:
        warnings.append("sort key changes")
    if system_changed:
        warnings.append("system changes")
    return warnings


def build_metadata_target_path(source: Path, item: dict, old_title: str) -> Path:
    rel = relative_collection_path(source)
    if rel.parts and rel.parts[0].lower() == "games":
        directory = COLLECTION / "Games" / folder_letter(str(item.get("title", old_title)))
    else:
        directory = source.parent
    return directory / build_tosec_file_name(source, item, old_title)


def build_collection_import_target_path(source: Path, item: dict, old_title: str, metadata: dict | None = None) -> Path:
    directory = collection_import_directory(item, old_title, metadata)
    return directory / build_tosec_file_name(source, item, old_title)


def collection_import_directory(item: dict, old_title: str, metadata: dict | None = None) -> Path:
    title = str(item.get("title") or old_title)
    letter = folder_letter(title)
    games_root = COLLECTION / "Games"
    if has_letter_folder_structure(games_root):
        return games_root / letter
    if has_letter_folder_structure(COLLECTION):
        return COLLECTION / letter
    observed = observed_import_directory(letter, metadata)
    if observed:
        return observed
    if games_root.exists():
        return games_root / letter
    return COLLECTION


def has_letter_folder_structure(root: Path) -> bool:
    if not root.exists() or not root.is_dir():
        return False
    expected = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") | {"0-9"}
    found = {path.name.upper() for path in root.iterdir() if path.is_dir()}
    return len(found.intersection(expected)) >= 8


def observed_import_directory(letter: str, metadata: dict | None = None) -> Path | None:
    counts: dict[Path, int] = {}
    metadata = metadata or (load_metadata() if METADATA_FILE.exists() else {})
    for item in metadata.get("games", []):
        rel_file = str(item.get("file", ""))
        if not rel_file:
            continue
        rel_parent = Path(rel_file).parent
        if rel_parent == Path("."):
            rel_parent = Path("")
        parent_name = rel_parent.name.upper() if rel_parent.name else ""
        if parent_name in (set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") | {"0-9"}):
            candidate = (rel_parent.parent / letter) if str(rel_parent.parent) != "." else Path(letter)
        else:
            candidate = rel_parent
        counts[candidate] = counts.get(candidate, 0) + 1
    if not counts:
        return None
    rel = max(counts.items(), key=lambda item: item[1])[0]
    try:
        return resolve_within(COLLECTION, rel)
    except PathConfinementError:
        return None


def clean_youtube_id(value: object) -> str:
    text = clean_metadata_text(value, max_len=240)
    if not text:
        return ""
    match = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]{6,})", text)
    if match:
        return match.group(1)[:64]
    return re.sub(r"[^A-Za-z0-9_-]", "", text)[:64]


def clean_asset_path(value: object) -> str:
    text = str(value or "").replace("\\", "/").strip()
    if not text:
        return ""
    if re.match(r"^https?://", text, flags=re.IGNORECASE):
        return text[:500]
    parts = [part for part in text.split("/") if part and part not in {".", ".."}]
    return "/".join(parts)[:240]


def clean_system_value(value: object) -> str:
    text = str(value or "").strip().upper().replace(" ", "")
    if parse_system_tag(text):
        return parse_system_tag(text)
    return text[:32] or "48K"


def delete_game(game_id: str) -> dict:
    result = delete_games([game_id])
    if not result.get("ok"):
        return result
    deleted = result.get("deleted", [])
    return {"ok": True, "path": deleted[0]["path"] if deleted else ""}


@_catalogue_serialized
def delete_games(game_ids: object) -> dict[str, object]:
    ids = list(dict.fromkeys(selected_game_ids(game_ids)))
    if not ids:
        return {"ok": False, "error": "No games selected"}
    library = get_library()
    trash_root = COLLECTION / "_Deleted"
    reserved: set[Path] = set()
    plan: list[tuple[Game, Path, Path]] = []
    errors: list[dict[str, str]] = []
    for game_id in ids:
        game = library.get_game(game_id)
        if not game:
            errors.append({"game_id": game_id, "error": "Unknown game"})
            continue
        source = Path(game.path)
        try:
            relative = relative_collection_path(source)
        except PathConfinementError as exc:
            errors.append({"game_id": game_id, "error": str(exc)})
            continue
        if not source.exists():
            errors.append({"game_id": game_id, "error": f"Missing game file: {source}"})
            continue
        if game.view == "trash":
            errors.append({"game_id": game_id, "error": "Bin files must be restored or permanently removed"})
            continue
        target = planned_unique_path(trash_root / relative, reserved)
        reserved.add(target.resolve())
        plan.append((game, source, target))
    if errors:
        return {"ok": False, "error": "No files were moved because the selection is invalid", "errors": errors}

    metadata_exists = METADATA_FILE.exists()
    metadata = load_metadata() if metadata_exists else {"games": []}
    original_metadata = deepcopy(metadata)
    by_id = {str(item.get("id", "")): item for item in metadata.get("games", [])}
    moved: list[tuple[Path, Path]] = []
    metadata_saved = False
    try:
        for game, source, target in plan:
            target.parent.mkdir(parents=True, exist_ok=True)
            before_catalogue_move(source, target)
            source.replace(target)
            moved.append((source, target))
            if game.view != "incoming" and game.id in by_id:
                by_id[game.id].update({"file": collection_relative(target), "status": "Deleted"})
        if metadata_exists:
            save_metadata(metadata)
            metadata_saved = True
        library.rebuild()
    except Exception:
        for source, target in reversed(moved):
            if target.exists() and not source.exists():
                source.parent.mkdir(parents=True, exist_ok=True)
                target.replace(source)
        if metadata_saved:
            save_metadata(original_metadata)
        try:
            library.rebuild()
        except Exception as rollback_error:
            log(f"Delete rollback rebuild failed: {rollback_error}")
        raise

    for game, source, _target in plan:
        if game.view == "incoming":
            cleanup_empty_parents(source.parent, (COLLECTION / "incoming").resolve())
    deleted = [{"id": game.id, "name": target.name, "path": str(target)} for game, _source, target in plan]
    return {"ok": True, "deleted": deleted, "count": len(deleted)}


def import_incoming_game(game_id: str) -> dict:
    result = import_incoming_games([game_id])
    if not result.get("ok"):
        return result
    imported = result.get("imported", [])
    if imported:
        first = imported[0]
        return {"ok": True, "name": first.get("name", ""), "path": first.get("path", ""), "imported": imported}
    return {"ok": True, "name": "", "path": "", "imported": []}


@_catalogue_serialized
def import_incoming_games(game_ids: object) -> dict:
    ids = list(dict.fromkeys(selected_game_ids(game_ids)))
    if not ids:
        return {"ok": False, "error": "No incoming games selected"}
    ensure_metadata_file()
    metadata = load_metadata()
    result = transfer_games_transaction(ids, metadata, import_incoming_game_item, "import")
    if not result.get("ok"):
        return {**result, "imported": []}
    imported = result.pop("transfers", [])
    return {**result, "imported": imported, "count": len(imported)}


def selected_game_ids(game_ids: object) -> list[str]:
    if isinstance(game_ids, str):
        return [game_ids] if game_ids else []
    if isinstance(game_ids, list | tuple):
        return [str(item) for item in game_ids if str(item)]
    return []


def import_incoming_game_item(game_id: str, metadata: dict) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        raise ValueError("Unknown game")
    if game.view != "incoming":
        raise ValueError("Only incoming files can be imported")
    source = Path(game.path)
    incoming = (COLLECTION / "incoming").resolve()
    try:
        source.resolve().relative_to(incoming)
    except ValueError:
        raise ValueError("Incoming file is outside the collection incoming folder")
    if not source.exists():
        raise FileNotFoundError(f"Missing incoming file: {source}")
    item = game_to_metadata_item(game, [])
    item["type"] = "Official"
    item["section"] = "Official"
    item["status"] = "Main"
    item["memory"] = item.get("system", game.system)
    target = build_collection_import_target_path(source, item, game.title, metadata)
    if target.exists():
        raise FileExistsError(f"Import target already exists: {target.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    before_catalogue_move(source, target)
    shutil.move(str(source), str(target))
    item["file"] = collection_relative(target)
    item["format"] = target.suffix.lower()
    item["id"] = stable_id(item["file"])
    metadata.setdefault("games", []).append(item)
    get_library().remove_game(game_id)
    return {
        "id": item["id"], "name": target.name, "path": str(target),
        "folder": collection_relative(target.parent), "_source": str(source), "_target": str(target),
        "_cleanup_stop": str(incoming),
    }


@_catalogue_serialized
def restore_trash_games(game_ids: object) -> dict:
    ids = list(dict.fromkeys(selected_game_ids(game_ids)))
    if not ids:
        return {"ok": False, "error": "No bin games selected"}
    ensure_metadata_file()
    metadata = load_metadata()
    result = transfer_games_transaction(ids, metadata, restore_trash_game_item, "restore")
    if not result.get("ok"):
        return {**result, "restored": []}
    restored = result.pop("transfers", [])
    return {**result, "restored": restored, "count": len(restored)}


def restore_trash_game_item(game_id: str, metadata: dict) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        raise ValueError("Unknown game")
    if game.view != "trash":
        raise ValueError("Only bin files can be restored")
    source = Path(game.path)
    trash = (COLLECTION / "_Deleted").resolve()
    try:
        source.resolve().relative_to(trash)
    except ValueError:
        raise ValueError("Bin file is outside the collection bin folder")
    if not source.exists():
        raise FileNotFoundError(f"Missing bin file: {source}")
    rel_source = collection_relative(source)
    item = next((entry for entry in metadata.setdefault("games", []) if normalize_rel_path(entry.get("file", "")) == normalize_rel_path(rel_source)), None)
    if item is None:
        item = game_to_metadata_item(game, [])
        metadata.setdefault("games", []).append(item)
    item["status"] = "Main"
    item["type"] = "Official" if item.get("type") == "Bin" else item.get("type", "Official")
    item["section"] = "Official" if item.get("section") == "Bin" else item.get("section", "Official")
    target = build_collection_import_target_path(source, item, game.title, metadata)
    if target.exists():
        raise FileExistsError(f"Restore target already exists: {target.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    before_catalogue_move(source, target)
    shutil.move(str(source), str(target))
    item["file"] = collection_relative(target)
    item["format"] = target.suffix.lower()
    # Prepared metadata identities survive a restore to a different managed path.
    item["id"] = item.get("id") or stable_id(item["file"])
    get_library().remove_game(game_id)
    return {
        "id": item["id"], "name": target.name, "path": str(target),
        "folder": collection_relative(target.parent), "_source": str(source), "_target": str(target),
        "_cleanup_stop": str(trash),
    }


def transfer_games_transaction(game_ids: list[str], metadata: dict, transfer_item, operation: str) -> dict[str, object]:
    """Apply an import/restore batch atomically across files, metadata, and the index."""
    original_metadata = deepcopy(metadata)
    transfers: list[dict[str, object]] = []
    current_game_id = ""
    try:
        for current_game_id in game_ids:
            transfers.append(transfer_item(current_game_id, metadata))
        save_metadata(metadata)
        get_library().rebuild()
    except Exception as exc:
        rollback_errors: list[str] = []
        for transfer in reversed(transfers):
            source = Path(str(transfer.get("_source", "")))
            target = Path(str(transfer.get("_target", "")))
            try:
                if target.exists() and not source.exists():
                    source.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(target), str(source))
            except Exception as rollback_error:
                rollback_errors.append(f"file restore: {rollback_error}")
        try:
            save_metadata(original_metadata)
        except Exception as rollback_error:
            rollback_errors.append(f"metadata restore: {rollback_error}")
        try:
            get_library().rebuild()
        except Exception as rollback_error:
            rollback_errors.append(f"library rebuild: {rollback_error}")
        message = f"{operation.title()} failed; no files were kept from the batch"
        if rollback_errors:
            message = f"{message}. Recovery was incomplete: {'; '.join(rollback_errors)}"
        return {
            "ok": False,
            "error": message,
            "errors": [{"game_id": current_game_id, "error": str(exc)}],
            "rolled_back": not rollback_errors,
        }

    for transfer in transfers:
        source = Path(str(transfer.pop("_source", "")))
        transfer.pop("_target", None)
        cleanup_stop = Path(str(transfer.pop("_cleanup_stop", "")))
        if source.parent and cleanup_stop:
            cleanup_empty_parents(source.parent, cleanup_stop)
    return {"ok": True, "transfers": transfers, "transactional": True}


@_catalogue_serialized
def purge_trash_games(game_ids: object) -> dict:
    ids = selected_game_ids(game_ids)
    if not ids:
        return {"ok": False, "error": "No bin games selected"}
    metadata = load_metadata()
    purged = []
    errors = []
    for game_id in ids:
        try:
            purged.append(purge_trash_game_item(game_id, metadata))
        except Exception as exc:
            errors.append({"game_id": game_id, "error": str(exc)})
    if purged:
        save_metadata(metadata)
        get_library().rebuild()
    if errors:
        return {"ok": False, "error": f"Removed {len(purged)}, failed {len(errors)}", "purged": purged, "errors": errors}
    return {"ok": True, "purged": purged, "count": len(purged)}


def purge_trash_game_item(game_id: str, metadata: dict) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        raise ValueError("Unknown game")
    if game.view != "trash":
        raise ValueError("Only bin files can be permanently removed")
    source = Path(game.path)
    trash = (COLLECTION / "_Deleted").resolve()
    try:
        source.resolve().relative_to(trash)
    except ValueError:
        raise ValueError("Bin file is outside the collection bin folder")
    if source.exists():
        source.unlink()
    rel_source = normalize_rel_path(collection_relative(source))
    metadata["games"] = [entry for entry in metadata.get("games", []) if normalize_rel_path(entry.get("file", "")) != rel_source]
    cleanup_empty_parents(source.parent, trash)
    get_library().remove_game(game_id)
    return {"id": game_id, "name": game.file_name}


def cleanup_empty_parents(start: Path, stop: Path) -> None:
    current = start
    stop = stop.resolve()
    while True:
        try:
            resolved = current.resolve()
            if resolved == stop or not resolved.is_relative_to(stop):
                return
            current.rmdir()
        except OSError:
            return
        current = current.parent


def move_between_collection_and_languages(game_id: str) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        return {"ok": False, "error": "Unknown game"}
    source = Path(game.path)
    if not source.exists():
        return {"ok": False, "error": f"Missing game file: {source}"}
    review_root = COLLECTION / "_Non EN-DE Review"
    if game.view == "languages":
        if METADATA_FILE.exists():
            update_metadata_game(game_id, status="Main")
            get_library().rebuild()
            return {"ok": True, "path": str(source), "message": "Moved to collection"}
        target = unique_path(COLLECTION / source.resolve().relative_to(review_root.resolve()))
        message = "Moved to collection"
    else:
        if METADATA_FILE.exists():
            update_metadata_game(game_id, status="Language Review")
            get_library().rebuild()
            return {"ok": True, "path": str(source), "message": "Moved to Other Languages"}
        target = unique_path(review_root / relative_collection_path(source))
        message = "Moved to Other Languages"
    target.parent.mkdir(parents=True, exist_ok=True)
    source.replace(target)
    get_library().rebuild()
    return {"ok": True, "path": str(target), "message": message}


def update_metadata_game(game_id: str, **updates: object) -> None:
    if not METADATA_FILE.exists():
        return
    metadata = load_metadata()
    changed = False
    for item in metadata.get("games", []):
        if item.get("id") == game_id:
            item.update(updates)
            changed = True
            break
    if changed:
        save_metadata(metadata)


def relative_collection_path(path: Path) -> Path:
    return relative_to_root(COLLECTION, path)


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    for i in range(2, 1000):
        candidate = path.with_name(f"{stem} ({i}){suffix}")
        if not candidate.exists():
            return candidate
    raise FileExistsError(f"Could not create unique target for {path}")


def planned_unique_path(path: Path, reserved: set[Path]) -> Path:
    candidate = path
    if not candidate.exists() and candidate.resolve() not in reserved:
        return candidate
    for index in range(2, 1000):
        candidate = path.with_name(f"{path.stem} ({index}){path.suffix}")
        if not candidate.exists() and candidate.resolve() not in reserved:
            return candidate
    raise FileExistsError(f"Could not create unique target for {path}")


def log(message: str) -> None:
    timestamp = dt.datetime.now().isoformat(timespec="seconds")
    line = f"[{timestamp}] {message}\n"
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass
    stream = getattr(sys, "stdout", None)
    if stream is not None:
        try:
            stream.write(line)
            stream.flush()
        except Exception:
            pass
