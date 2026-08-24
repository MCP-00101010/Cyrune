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
from pathlib import Path
from tkinter import filedialog
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import Request, urlopen

from emugui_core.collection_loading import (
    CollectionLoader,
)
from emugui_core.collection_loading import (
    import_match_summary as core_import_match_summary,
)
from emugui_core.collection_loading import (
    mark_import_view_matches as core_mark_import_view_matches,
)
from emugui_core.collections import CollectionService
from emugui_core.collections import file_count_in_tree as core_file_count_in_tree
from emugui_core.emulators import (
    EmulatorConfigError,
    EmulatorConfigService,
    load_emulator_defaults,
)
from emugui_core.jobs import BackgroundJobService
from emugui_core.launching import (
    GameLaunchService,
    bring_window_to_front,
    find_running_emulator_window,
    focus_launched_emulator,
    launch_visible,
    prepare_eightyone_profile,
    should_check_immediate_exit,
)
from emugui_core.library import Game, GameLibrary
from emugui_core.metadata import MetadataService
from emugui_core.persistence import atomic_write_json, read_json_object
from emugui_core.profiles import EmulatorProfileService
from emugui_core.scraping import ScraperAdapter, ScraperService
from emugui_core.secrets import SCRAPER_SECRET_FIELDS, ScraperSecretService
from emugui_core.service import ReadOnlyEmuGuiService, ServiceContractError

LAUNCHER = Path(__file__).resolve().parent
DEFAULT_COLLECTION_ROOT = Path(
    os.environ.get(
        "MORPHEUS_EMUGUI_COLLECTION",
        r"E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection",
    )
).expanduser()
DESASTERON_COLLECTION = DEFAULT_COLLECTION_ROOT
COLLECTIONS_BASE = Path(
    os.environ.get("MORPHEUS_EMUGUI_COLLECTIONS_BASE", str(DESASTERON_COLLECTION.parent))
).expanduser()
COLLECTION = DESASTERON_COLLECTION
REPORTS = COLLECTION / "_reports"
WEB = LAUNCHER / "web"
DATA = LAUNCHER / "data"
EMULATOR_PROFILE_DIR = DATA / "emulator-profiles"
STATE_FILE = DATA / "state.json"
LOG_FILE = DATA / "launcher.log"
CONFIG_FILE = DATA / "config.json"
METADATA_FILE = COLLECTION / "collection-metadata.json"
DEFAULT_EMULATORS = load_emulator_defaults(LAUNCHER / "defaults" / "emulators.json")

JOB_SERVICE = BackgroundJobService()
TGDB_LOOKUP_CACHE: dict[tuple[str, str], dict[str, str]] = {}
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
        "system_id": "135",
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
    fallback = {
        "collections": discover_collections(),
        "default_collection": "desasteron",
        "emulators": deepcopy(DEFAULT_EMULATORS),
        "emulator_profiles": [],
        "scrapers": deepcopy(DEFAULT_SCRAPERS),
    }
    config = read_json_object(CONFIG_FILE, fallback)
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
    atomic_write_json(CONFIG_FILE, config)


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
    """Attach WebHub's native secret service and migrate verified legacy JSON values."""

    SCRAPER_SECRET_SERVICE.configure(
        get_secret=get_secret,
        set_secret=set_secret,
        delete_secret=delete_secret,
        status=status,
    )
    config = load_config()
    if SCRAPER_SECRET_SERVICE.migrate(config):
        save_config(config)


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
        return all(str(scraper.get(key, "")).strip() for key in ("username", "password", "system_id"))
    if scraper.get("type") == "thegamesdb":
        return all(str(scraper.get(key, "")).strip() for key in ("api_key", "platform_id"))
    return bool(scraper.get("configured", False))


def scrapers_payload() -> dict[str, object]:
    providers = []
    for scraper in configured_scrapers().values():
        public = {key: value for key, value in scraper.items() if key not in {"password", "developer_password", "api_key"}}
        public["has_password"] = bool(str(scraper.get("password", "")).strip())
        public["has_developer_password"] = bool(str(scraper.get("developer_password", "")).strip())
        public["has_api_key"] = bool(str(scraper.get("api_key", "")).strip())
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
                filetypes = [
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
    from emugui_core.collections import (
        looks_like_collection as core_looks_like_collection,
    )
    return core_looks_like_collection(path)


def unique_collection_id(name: str, used: set[str]) -> str:
    from emugui_core.collections import (
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


def active_collection() -> dict:
    return get_collection_service().active()


def load_active_collection_id() -> str:
    return get_collection_service().active_id()


def activate_collection(collection_id: str) -> dict:
    global COLLECTION, REPORTS, METADATA_FILE
    selected = get_collection_service().resolve(collection_id)
    root = Path(str(selected.get("root", DESASTERON_COLLECTION))).resolve()
    COLLECTION = root
    REPORTS = COLLECTION / "_reports"
    METADATA_FILE = COLLECTION / "collection-metadata.json"
    return selected


def current_collection_writable() -> bool:
    return bool(active_collection().get("writable", False))


def current_collection_auto_metadata() -> bool:
    active = active_collection()
    return bool(active.get("writable", False) or active.get("auto_metadata", False))


def start_index_job(title: str, work) -> str:
    return JOB_SERVICE.start(title, work)


def update_job(job_id: str, **updates: object) -> None:
    JOB_SERVICE.update(job_id, **updates)


def get_job(job_id: str) -> dict[str, object]:
    return JOB_SERVICE.get(job_id)


def start_select_collection_job(collection_id: str) -> str:
    config = load_config()
    target = next((item for item in config.get("collections", []) if item.get("id") == collection_id), None)
    title = f"Switching to {target.get('name')}" if target else "Switching Collection"
    previous_id = load_active_collection_id()

    def work(progress) -> None:
        if target is None:
            raise ValueError(f"Unknown collection: {collection_id}")
        selected = activate_collection(collection_id)
        update_state(lambda state: state.update({"active_collection_id": selected.get("id", "desasteron")}))
        try:
            get_library().rebuild(progress)
        except Exception:
            activate_collection(previous_id)
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
        get_library().rebuild(progress)

    return start_index_job(f"Rebuilding {active.get('name', 'Collection')}", work)


def load_favourites() -> set[str]:
    return set(load_state().get("favourites", []))


def load_poks() -> dict[tuple[str, str], list[dict[str, str]]]:
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
            absolute = (COLLECTION.parent / output_path).resolve()
            row = dict(row)
            row["id"] = stable_id(output_path)
            row["path"] = str(absolute)
            row["file_name"] = absolute.name
            row["cheats"] = parse_pok_file(absolute)
            row["cheat_summary"] = ", ".join(cheat["name"] for cheat in row["cheats"][:4])
            poks.setdefault(key, []).append(row)
    return poks


def load_metadata() -> dict:
    metadata = read_json_object(METADATA_FILE, {"version": 1, "games": [], "poks": []})
    if not isinstance(metadata.get("games"), list):
        metadata["games"] = []
    if not isinstance(metadata.get("poks"), list):
        metadata["poks"] = []
    return metadata


def save_metadata(metadata: dict) -> None:
    metadata["updated_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    atomic_write_json(METADATA_FILE, metadata)


def collection_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(COLLECTION.resolve())).replace("\\", "/")
    except ValueError:
        return path.name


def normalize_rel_path(path: object) -> str:
    return str(path or "").replace("\\", "/").strip().lower()


def load_metadata_poks() -> dict[tuple[str, str], list[dict[str, str]]]:
    poks: dict[tuple[str, str], list[dict[str, str]]] = {}
    metadata = load_metadata()
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
        absolute = (COLLECTION / rel_path).resolve()
        if not absolute.exists():
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


def load_metadata_games(poks: dict[tuple[str, str], list[dict[str, str]]], favourites: set[str]) -> list[Game]:
    games: list[Game] = []
    for item in load_metadata().get("games", []):
        status = item.get("status", "Main")
        if status in {"Deleted", "Hidden"}:
            continue
        rel_path = item.get("file", "")
        if not rel_path:
            continue
        absolute = (COLLECTION / rel_path).resolve()
        if not absolute.exists():
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
        languages = tuple(item.get("languages", ()))
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
                or "English",
                extension=item.get("format") or absolute.suffix.lower(),
                path=str(absolute),
                file_name=absolute.name,
                letter=item.get("letter") or folder_letter(title),
                view="collection",
                year=item.get("year") or item.get("date", ""),
                publisher=item.get("publisher", ""),
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
    absolute = (COLLECTION.parent / output_path).resolve()
    if not absolute.exists():
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


LANGUAGE_NAMES = {
    "AR": "Arabic",
    "CS": "Czech",
    "DA": "Danish",
    "DE": "German",
    "EL": "Greek",
    "EN": "English",
    "ES": "Spanish",
    "FI": "Finnish",
    "FR": "French",
    "HR": "Croatian",
    "HU": "Hungarian",
    "IT": "Italian",
    "JA": "Japanese",
    "KO": "Korean",
    "NL": "Dutch",
    "NO": "Norwegian",
    "PL": "Polish",
    "PT": "Portuguese",
    "RO": "Romanian",
    "RU": "Russian",
    "SK": "Slovak",
    "SV": "Swedish",
    "TR": "Turkish",
    "UZ": "Uzbek",
}


COUNTRY_NAMES = {
    "BR": "Brazil",
    "CA": "Canada",
    "CZ": "Czech Republic",
    "DE": "Germany",
    "ES": "Spain",
    "FR": "France",
    "GB": "United Kingdom",
    "GR": "Greece",
    "HR": "Croatia",
    "HU": "Hungary",
    "IT": "Italy",
    "JP": "Japan",
    "NL": "Netherlands",
    "PL": "Poland",
    "PT": "Portugal",
    "RO": "Romania",
    "RU": "Russia",
    "SK": "Slovakia",
    "TR": "Turkey",
    "US": "United States",
    "UZ": "Uzbekistan",
}


COUNTRY_TO_DEFAULT_LANGUAGE = {
    "BR": "PT",
    "CZ": "CS",
    "DE": "DE",
    "ES": "ES",
    "FR": "FR",
    "GR": "EL",
    "HR": "HR",
    "HU": "HU",
    "IT": "IT",
    "JP": "JA",
    "NL": "NL",
    "PL": "PL",
    "PT": "PT",
    "RO": "RO",
    "RU": "RU",
    "SK": "SK",
    "TR": "TR",
    "UZ": "UZ",
}


LANGUAGE_ALIASES = {
    "gr": "EL",
    "jp": "JA",
}

ARTICLE_SUFFIX_TO_PREFIX = {
    "a": "A",
    "an": "An",
    "the": "The",
    "de": "De",
    "het": "Het",
    "der": "Der",
    "die": "Die",
    "das": "Das",
    "le": "Le",
    "la": "La",
    "les": "Les",
    "l'": "L'",
    "el": "El",
    "los": "Los",
    "las": "Las",
    "il": "Il",
    "lo": "Lo",
    "gli": "Gli",
    "i": "I",
}

ARTICLE_PREFIXES = tuple(sorted((value for value in ARTICLE_SUFFIX_TO_PREFIX.values() if value != "I"), key=len, reverse=True))


def is_placeholder_metadata_value(value: object) -> bool:
    return str(value or "").strip() in {"", "-", "?"}


def parse_tosec_name(file_name: str) -> dict[str, object]:
    stem = Path(file_name).stem
    parentheses = re.findall(r"\(([^()]*)\)", stem)
    brackets = re.findall(r"\[([^\[\]]*)\]", stem)
    tosec_title = re.split(r"\s+\(", stem, maxsplit=1)[0].strip() or stem
    title = display_title_from_tosec(tosec_title)
    year = ""
    publisher = ""
    languages: list[str] = []
    countries: list[str] = []
    systems: list[str] = []

    for i, tag in enumerate(parentheses):
        clean = tag.strip()
        upper = clean.upper()
        system = parse_system_tag(clean)
        if system:
            systems.append(system)
        if not year and re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?|19XX|20XX", upper):
            year = clean
            if i + 1 < len(parentheses):
                candidate = parentheses[i + 1].strip()
                if not is_placeholder_metadata_value(candidate):
                    publisher = candidate
            continue
        language = parse_language_tag(clean)
        country = parse_country_tag(clean)
        if language and is_metadata_tag(clean):
            languages.extend(language)
        if country and is_metadata_tag(clean):
            countries.extend(country)

    for tag in brackets:
        language = parse_language_tag(tag)
        country = parse_country_tag(tag)
        if language and is_metadata_tag(tag):
            languages.extend(language)
        if country and is_metadata_tag(tag):
            countries.extend(country)

    return {
        "title": title,
        "tosec_title": tosec_title,
        "sort_title": article_sort_title(title),
        "year": year,
        "publisher": publisher,
        "system": " / ".join(dedupe(systems)),
        "languages": tuple(dedupe(languages)),
        "countries": tuple(dedupe(countries)),
        "parentheses": tuple(parentheses),
        "brackets": tuple(brackets),
    }


def display_title_from_tosec(title: str) -> str:
    text = re.sub(r"\s+", " ", title).strip()
    match = re.match(r"^(.+),\s*([A-Za-z]+'?)$", text)
    if not match:
        return text
    base = match.group(1).strip()
    suffix = match.group(2).strip().lower()
    article = ARTICLE_SUFFIX_TO_PREFIX.get(suffix)
    if not article:
        return text
    if article.endswith("'"):
        return f"{article}{base}"
    return f"{article} {base}"


def tosec_title_from_display(title: str) -> str:
    text = re.sub(r"\s+", " ", title).strip()
    for article in ARTICLE_PREFIXES:
        pattern = rf"(?i)^{re.escape(article)}(?:\s+|(?=[A-Z0-9]))(.+)$" if article.endswith("'") else rf"(?i)^{re.escape(article)}\s+(.+)$"
        match = re.match(pattern, text)
        if not match:
            continue
        base = match.group(1).strip()
        if not base:
            return text
        suffix = article
        return f"{base}, {suffix}"
    return text


def article_sort_title(title: str) -> str:
    text = display_title_from_tosec(title)
    for article in ARTICLE_PREFIXES:
        pattern = rf"(?i)^{re.escape(article)}(?:\s+|(?=[A-Z0-9]))(.+)$" if article.endswith("'") else rf"(?i)^{re.escape(article)}\s+(.+)$"
        match = re.match(pattern, text)
        if match:
            return match.group(1).strip() or text
    return text


def parse_system_tag(tag: str) -> str:
    normalized = tag.strip().upper().replace(" ", "")
    if re.fullmatch(r"(?:16|48|128)K", normalized):
        return normalized
    if re.fullmatch(r"(?:16|48|128)K-(?:16|48|128)K", normalized):
        return normalized
    return ""


def parse_language_tag(tag: str) -> list[str]:
    codes: list[str] = []
    for token in re.split(r"[-_,+/ ]+", tag.strip()):
        if not token:
            continue
        if not token.islower():
            continue
        lower = token.lower()
        upper = LANGUAGE_ALIASES.get(lower, lower.upper())
        if upper in LANGUAGE_NAMES:
            codes.append(upper)
    return codes


def is_metadata_tag(tag: str) -> bool:
    tokens = [token for token in re.split(r"[-_,+/ ]+", tag.strip()) if token]
    if not tokens:
        return False
    return all(is_language_token(token) or is_country_token(token) for token in tokens)


def is_language_token(token: str) -> bool:
    if not token.islower():
        return False
    upper = LANGUAGE_ALIASES.get(token.lower(), token.upper())
    return upper in LANGUAGE_NAMES


def is_country_token(token: str) -> bool:
    return len(token) == 2 and token.isupper() and token in COUNTRY_NAMES


def parse_country_tag(tag: str) -> list[str]:
    countries: list[str] = []
    for token in re.split(r"[-_,+/ ]+", tag.strip()):
        if len(token) != 2 or not token.isupper():
            continue
        if token in COUNTRY_NAMES:
            countries.append(token)
    return countries


def parse_report_language(value: str) -> list[str]:
    if not value:
        return []
    return parse_language_tag(value)


def format_languages(codes: tuple[str, ...] | list[str]) -> str:
    if not codes:
        return ""
    return " / ".join(LANGUAGE_NAMES.get(code, code) for code in codes)


def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def folder_letter(title: str) -> str:
    normalized = normalize_title(article_sort_title(title))
    if not normalized:
        return "0-9"
    first = normalized[0].upper()
    return first if "A" <= first <= "Z" else "0-9"


def normalize_title(title: str) -> str:
    import re

    text = article_sort_title(title).lower().replace("&", " and ")
    text = re.sub(r"['`]", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def stable_id(text: str) -> str:
    import hashlib

    return hashlib.sha1(text.lower().encode("utf-8")).hexdigest()[:16]


LIBRARY: Library | None = None
LIBRARY_LOCK = threading.Lock()


def get_library() -> Library:
    """Build the collection index only when a runtime transport needs it."""
    global LIBRARY
    if LIBRARY is None:
        with LIBRARY_LOCK:
            if LIBRARY is None:
                LIBRARY = Library()
    return LIBRARY


EMUGUI_READ_SERVICE = ReadOnlyEmuGuiService(
    get_library,
    collections_payload,
    lambda: emulator_payload(),
    emulator_profiles_payload,
)


def dispatch_emugui_read(method: object, params: object = None) -> dict[str, object]:
    """Expose bounded reads independently of HTTP for the extension bridge."""
    return EMUGUI_READ_SERVICE.dispatch(method, params)


def _api_query_value(query: dict[str, object], key: str, fallback: str = "") -> str:
    value = query.get(key, fallback)
    if isinstance(value, (list, tuple)):
        value = value[0] if value else fallback
    return str(value or fallback)


def _read_only_error() -> dict[str, object]:
    return {"ok": False, "error": "Selected collection is read-only"}


def dispatch_emugui_api(method: object, path: object, query: object = None, data: object = None) -> dict[str, object]:
    """Route the existing UI API without coupling it to HTTP transport."""
    verb = str(method or "").strip().upper()
    route = str(path or "").strip()
    query = query if isinstance(query, dict) else {}
    data = data if isinstance(data, dict) else {}

    if verb == "GET":
        if route == "/api/games":
            return {"games": get_library().list_games(_api_query_value(query, "view", "collection"))}
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
        if route == "/api/favourite":
            game_id = str(data.get("game_id", ""))
            favourite = bool(data.get("favourite", False))
            game = get_library().set_favourite(game_id, favourite)
            if not game:
                return {"ok": False, "error": "Unknown game"}
            set_favourite(game_id, favourite)
            return {"ok": True, "game": asdict(game)}
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
            return scrape_preview(str(data.get("game_id", "")), str(data.get("provider", "manual")))
        if route == "/api/rebuild":
            return {"ok": True, "job_id": start_rebuild_job()}

        writable_routes = {
            "/api/rename", "/api/update-metadata", "/api/metadata-preview", "/api/apply-scrape",
            "/api/delete", "/api/import-incoming", "/api/import-incoming-bulk", "/api/restore-trash",
            "/api/purge-trash", "/api/move-language",
        }
        if route in writable_routes and not current_collection_writable():
            return _read_only_error()
        if route == "/api/rename":
            return rename_game(str(data.get("game_id", "")), str(data.get("name", "")))
        if route == "/api/update-metadata":
            return update_game_metadata(data.get("game_ids", []), data.get("changes", {}), bool(data.get("rename_files", False)))
        if route == "/api/metadata-preview":
            return preview_game_metadata(data.get("game_ids", []), data.get("changes", {}), bool(data.get("rename_files", False)))
        if route == "/api/apply-scrape":
            return apply_scrape_metadata(str(data.get("game_id", "")), data.get("candidate", {}),
                                         data.get("assets", {}), data.get("remote_assets", {}))
        if route == "/api/delete":
            return delete_game(str(data.get("game_id", "")))
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

    raise ServiceContractError("Unsupported EmuGUI API operation")


def read_emugui_asset(relative_path: object, max_bytes: object = 4 * 1024 * 1024) -> dict[str, object]:
    relative = unquote(str(relative_path or "")).replace("\\", "/").lstrip("/")
    if not relative or "\x00" in relative:
        raise ServiceContractError("Asset path is invalid")
    root = COLLECTION.resolve()
    target = (root / relative).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ServiceContractError("Asset path escapes the active collection") from exc
    limit = max(1, min(4 * 1024 * 1024, int(max_bytes or 0)))
    if not target.is_file() or target.stat().st_size > limit:
        raise ServiceContractError("Asset is missing or too large")
    content_type = mimetypes.guess_type(target.name)[0] or ""
    if content_type not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}:
        raise ServiceContractError("Asset type is not supported")
    encoded = base64.b64encode(target.read_bytes()).decode("ascii")
    return {"dataUrl": f"data:{content_type};base64,{encoded}", "contentType": content_type}





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


def get_launch_service() -> GameLaunchService:
    """Build a launch service around the current configuration and library."""

    return GameLaunchService(
        get_game=lambda game_id: get_library().get_game(game_id),
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
        collection_root=lambda: COLLECTION,
        check_immediate_exit=should_check_immediate_exit,
    )


def launch_game(game_id: str, emulator_id: str, launch_action: str = "", force_new: bool = False, profile_id: str = "") -> dict:
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
    if os.name == "nt":
        subprocess.Popen(["explorer.exe", f"/select,{path}"])
    else:
        webbrowser.open(str(path.parent))
    return {"ok": True}


def rename_game(game_id: str, name: str) -> dict:
    return get_metadata_service().rename_game(game_id, name)


def get_metadata_service() -> MetadataService:
    return MetadataService(
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
    )


def apply_scrape_metadata(game_id: str, candidate: object, assets: object | None = None, remote_assets: object | None = None) -> dict:
    return get_metadata_service().apply_scrape(game_id, candidate, remote_assets)


def scrape_candidate_changes(candidate: dict, assets: dict, remote_assets: dict) -> dict:
    return get_metadata_service().scrape_candidate_changes(candidate, remote_assets)


def update_game_metadata(game_ids: object, changes: object, rename_files: bool = False) -> dict:
    return get_metadata_service().update(game_ids, changes, rename_files)


def preview_game_metadata(game_ids: object, changes: object, rename_files: bool = False) -> dict:
    return get_metadata_service().preview(game_ids, changes, rename_files)


def scrape_preview(game_id: str, provider_id: str = "manual") -> dict:
    return get_scraper_service().preview(game_id, provider_id)


def get_scraper_service() -> ScraperService:
    return ScraperService(
        get_game=lambda game_id: get_library().get_game(game_id),
        provider_config=configured_scrapers,
        adapters={
            "manual": ScraperAdapter("manual", manual_scrape_preview),
            "screenscraper": ScraperAdapter("screenscraper", screenscraper_scrape_preview),
            "thegamesdb": ScraperAdapter("thegamesdb", thegamesdb_scrape_preview),
        },
    )


def screenscraper_scrape_preview(game: Game, provider: dict[str, object]) -> dict:
    data = screenscraper_request(game, provider)
    game_data = (data.get("response") or {}).get("jeu") if isinstance(data.get("response"), dict) else None
    if not isinstance(game_data, dict):
        return {
            "ok": True,
            "provider": scraper_public_identity(provider),
            "game": import_match_summary(game),
            "query": scrape_identity(game),
            "matches": [],
            "warnings": ["ScreenScraper returned no game match."],
        }
    candidate = screenscraper_candidate(game_data, provider)
    candidate["scraper_source"] = "screenscraper"
    candidate["scraper_id"] = str(game_data.get("id") or game_data.get("gameid") or "")
    return {
        "ok": True,
        "provider": scraper_public_identity(provider),
        "game": import_match_summary(game),
        "query": scrape_identity(game),
        "matches": [
            {
                "match_id": candidate["scraper_id"] or "screenscraper",
                "confidence": screenscraper_confidence(game, candidate),
                "reason": "ScreenScraper game lookup by filename and configured Spectrum system id.",
                "candidate": candidate,
                "assets": scrape_asset_targets(game),
                "remote_assets": screenscraper_assets(game_data, provider),
            }
        ],
    }


def thegamesdb_scrape_preview(game: Game, provider: dict[str, object]) -> dict:
    data = thegamesdb_request(game, provider, game.title)
    games = (((data.get("data") or {}).get("games")) if isinstance(data.get("data"), dict) else []) or []
    query_title = game.title
    if not games:
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
    game_ids = [str(row.get("id") or "") for row in games[:8] if isinstance(row, dict) and row.get("id")]
    if game_ids:
        try:
            image_lookup = thegamesdb_images_request(provider, game_ids)
        except ValueError as exc:
            image_warning = str(exc)
    matches = []
    for row in games[:8]:
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
                "confidence": screenscraper_confidence(game, candidate),
                "reason": "TheGamesDB title lookup filtered by configured Spectrum platform id.",
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
        "warnings": ([image_warning] if image_warning else []) if matches else ["TheGamesDB returned no game match."],
    }


def thegamesdb_request(game: Game, provider: dict[str, object], title: str) -> dict:
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://api.thegamesdb.net/v1")
    params = {
        "apikey": str(provider.get("api_key", "")),
        "name": title,
        "fields": "players,publishers,genres,overview,rating,platform,release_date,developers,coop,youtube",
        "include": "boxart,genres,publishers,platform",
    }
    platform_id = str(provider.get("platform_id", "")).strip()
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


def simplified_scrape_title(title: str) -> str:
    text = re.sub(r"\bv\d+(?:\.\d+)*\b", "", title, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:demo|preview|beta|alpha|final|release|remake)\b$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" -_")
    return text


def thegamesdb_candidate(row: dict, includes: dict, provider: dict[str, object]) -> dict[str, str]:
    publisher_names = lookup_tgdb_names(row.get("publishers"), includes.get("publishers"), provider, "publishers")
    developer_names = lookup_tgdb_names(row.get("developers"), includes.get("developers"), provider, "developers")
    genre_names = lookup_tgdb_names(row.get("genres"), includes.get("genres"), provider, "genres")
    platform_names = lookup_tgdb_names(row.get("platform"), includes.get("platform"))
    release_date = clean_metadata_text(row.get("release_date") or row.get("release_date_eu") or row.get("release_date_us") or "", max_len=24)
    return {
        "title": clean_metadata_text(row.get("game_title") or row.get("title") or row.get("name") or ""),
        "year": release_date or extract_year(row.get("release_date") or row.get("release_date_eu") or row.get("release_date_us") or ""),
        "publisher": publisher_names[0] if publisher_names else "",
        "genre": ", ".join(genre_names),
        "developer": ", ".join(developer_names),
        "platform": platform_names[0] if platform_names else "",
        "region": clean_metadata_text(row.get("region") or row.get("release_region") or ""),
        "players": clean_metadata_text(row.get("players") or "", max_len=24),
        "coop": clean_metadata_text(row.get("coop") or "", max_len=24),
        "rating": clean_metadata_text(row.get("rating") or "", max_len=80),
        "youtube_id": clean_youtube_id(row.get("youtube") or row.get("youtube_id") or ""),
        "description": clean_metadata_text(row.get("overview") or "", max_len=2000),
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


def screenscraper_request(game: Game, provider: dict[str, object]) -> dict:
    base_url = normalize_scraper_base_url(provider.get("base_url"), "https://www.screenscraper.fr/api2")
    path = Path(game.path)
    params = {
        "softname": str(provider.get("softname") or "DesasteronSpectrumLauncher"),
        "ssid": str(provider.get("username", "")),
        "sspassword": str(provider.get("password", "")),
        "output": "json",
        "systemeid": str(provider.get("system_id", "")),
        "romtype": "rom",
        "romnom": game.file_name,
    }
    developer_id = str(provider.get("developer_id", "")).strip()
    developer_password = str(provider.get("developer_password", "")).strip()
    if developer_id:
        params["devid"] = developer_id
    if developer_password:
        params["devpassword"] = developer_password
    if path.exists():
        params["romtaille"] = str(path.stat().st_size)
    url = f"{base_url}/jeuInfos.php?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "DesasteronSpectrumLauncher/0.1"})
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1024 * 1024 * 4).decode("utf-8", errors="replace")
    except HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", errors="replace")
        raise ValueError(f"ScreenScraper HTTP {exc.code}: {detail[:240]}")
    except URLError as exc:
        raise ValueError(f"ScreenScraper request failed: {exc.reason}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"ScreenScraper returned invalid JSON: {exc}")


def scraper_public_identity(provider: dict[str, object]) -> dict[str, object]:
    return {
        "id": provider.get("id", ""),
        "name": provider.get("name", ""),
        "type": provider.get("type", ""),
    }


def screenscraper_candidate(game_data: dict, provider: dict[str, object]) -> dict[str, str]:
    language = str(provider.get("preferred_language") or "en").lower()
    region = str(provider.get("preferred_region") or "wor").lower()
    title = choose_localized_text(game_data.get("noms"), region, language) or clean_metadata_text(game_data.get("nom", ""))
    date = choose_localized_text(game_data.get("dates"), region, language) or clean_metadata_text(game_data.get("date", ""))
    publisher = nested_text(game_data.get("editeur")) or nested_text(game_data.get("publisher"))
    genre = choose_genre(game_data.get("genres"), language)
    description = choose_localized_text(game_data.get("synopsis"), region, language) or choose_localized_text(game_data.get("descriptif"), region, language)
    return {
        "title": title,
        "year": extract_year(date),
        "publisher": publisher,
        "genre": genre,
        "description": description,
        "screenshot": "",
        "loading_screen": "",
    }


def screenscraper_confidence(game: Game, candidate: dict[str, str]) -> int:
    score = 20
    if normalize_title(candidate.get("title", "")) == game.title_key:
        score += 55
    elif normalize_title(candidate.get("title", "")) in game.title_key or game.title_key in normalize_title(candidate.get("title", "")):
        score += 35
    if candidate.get("year") and candidate.get("year") == gameYear_py(game.year):
        score += 15
    if candidate.get("publisher") and normalize_title(candidate.get("publisher", "")) == normalize_title(game.publisher):
        score += 10
    return max(0, min(100, score))


def gameYear_py(value: str) -> str:
    match = re.search(r"\d{4}|19XX|20XX", str(value or ""), re.IGNORECASE)
    return match.group(0).upper() if match else ""


def extract_year(value: object) -> str:
    return gameYear_py(str(value or ""))


def nested_text(value: object) -> str:
    if isinstance(value, str):
        return clean_metadata_text(value)
    if isinstance(value, dict):
        for key in ("text", "nom", "name"):
            if value.get(key):
                return clean_metadata_text(value.get(key))
    return ""


def choose_localized_text(value: object, region: str = "wor", language: str = "en") -> str:
    rows = value if isinstance(value, list) else []
    if isinstance(value, dict):
        rows = [value]
    if not rows:
        return nested_text(value)
    preferred_regions = [region, "wor", "eu", "us", "gb", "ss", "jp", "fr", "de"]
    preferred_languages = [language, "en", "de", "fr"]
    for key, preferred in (("region", preferred_regions), ("langue", preferred_languages), ("language", preferred_languages)):
        for wanted in preferred:
            for row in rows:
                if isinstance(row, dict) and str(row.get(key, "")).lower() == wanted:
                    text = nested_text(row)
                    if text:
                        return text
    for row in rows:
        text = nested_text(row)
        if text:
            return text
    return ""


def choose_genre(value: object, language: str = "en") -> str:
    rows = value if isinstance(value, list) else []
    if isinstance(value, dict):
        rows = [value]
    for row in rows:
        if not isinstance(row, dict):
            continue
        text = choose_localized_text(row.get("noms") or row.get("genres"), language=language)
        if text:
            return text
        for key in ("text", "nomcourt", "nom"):
            if row.get(key):
                return clean_metadata_text(row.get(key), max_len=80)
    return ""


def screenscraper_assets(game_data: dict, provider: dict[str, object]) -> dict[str, str]:
    language = str(provider.get("preferred_language") or "en").lower()
    region = str(provider.get("preferred_region") or "wor").lower()
    medias = game_data.get("medias")
    return {
        "screenshot": find_media_url(medias, ("ss", "screenshot", "screen"), region, language),
        "loading_screen": find_media_url(medias, ("sstitle", "titlescreen", "screenmarquee", "loading"), region, language),
    }


def find_media_url(value: object, type_tokens: tuple[str, ...], region: str, language: str) -> str:
    rows = value if isinstance(value, list) else []
    if isinstance(value, dict):
        rows = [value]
    preferred_regions = [region, "wor", "eu", "us", "gb", "ss", "fr", "de"]
    preferred_languages = [language, "en", "de", "fr"]
    matches: list[tuple[int, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        media_type = " ".join(str(row.get(key, "")) for key in ("type", "typemedia", "nom", "parent")).lower()
        if not any(token in media_type for token in type_tokens):
            continue
        url = clean_metadata_text(row.get("url") or row.get("media") or row.get("download"), max_len=500)
        if not url:
            continue
        rank = 50
        row_region = str(row.get("region", "")).lower()
        row_language = str(row.get("langue", row.get("language", ""))).lower()
        if row_region in preferred_regions:
            rank -= preferred_regions.index(row_region) * 4
        if row_language in preferred_languages:
            rank -= preferred_languages.index(row_language) * 2
        matches.append((rank, url))
    matches.sort(key=lambda item: item[0])
    return matches[0][1] if matches else ""


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
        "screenshot": collection_relative(collection_asset_root() / "screenshots" / f"{base}.png"),
        "loading_screen": collection_relative(collection_asset_root() / "loading-screens" / f"{base}.png"),
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
    system = clean_system_value(changes.get("system", item.get("system") or game.system))
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
    apply_metadata_values(game, item, changes)

    if rename_files:
        target = build_metadata_target_path(source, item, old_title)
        if target.resolve() != source.resolve():
            target.parent.mkdir(parents=True, exist_ok=True)
            target = unique_path(target)
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
    return {"ok": True, "warnings": warnings}


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
    return (COLLECTION / rel).resolve()


def build_tosec_file_name(source: Path, item: dict, old_title: str) -> str:
    title = clean_file_name(tosec_title_from_display(str(item.get("title") or old_title))) or source.stem
    tags = build_tosec_tags(source, item)
    flags = build_tosec_flags(item)
    suffix = source.suffix
    version = clean_file_name(str(item.get("version", "")))
    demo = clean_file_name(str(item.get("demo", "")))
    title_version = f"{title} {version}".strip() if version else title
    raw_tag_text = "".join(f"({clean_file_name(tag)})" for tag in tags if clean_file_name(tag))
    tag_text = f" {raw_tag_text}" if raw_tag_text else ""
    if demo:
        tag_text = f" ({demo}){tag_text}"
    flag_text = "".join(f"[{clean_file_name(flag)}]" for flag in flags if clean_file_name(flag))
    return f"{title_version}{tag_text}{flag_text}{suffix}"


def build_tosec_tags(source: Path, item: dict) -> list[str]:
    parsed = parse_tosec_name(source.name)
    existing = list(item.get("tosec_tags") or parsed["parentheses"])
    old_year = str(parsed.get("year") or "").strip()
    old_publisher = str(parsed.get("publisher") or "").strip()
    managed: list[str] = []
    for tag in existing:
        clean = str(tag).strip()
        if is_placeholder_metadata_value(clean):
            continue
        if old_year and clean == old_year:
            continue
        if old_publisher and clean == old_publisher:
            continue
        if parse_system_tag(clean) or is_metadata_tag(clean) or clean.lower() == "ulaplus":
            continue
        if clean in {
            str(item.get("video", "")),
            str(item.get("copyright_status", "")),
            str(item.get("development_status", "")),
            str(item.get("media_type", "")),
            str(item.get("media_label", "")),
            str(item.get("demo", "")),
        }:
            continue
        managed.append(clean)

    tags: list[str] = []
    if item.get("year"):
        tags.append(str(item["year"]))
    if item.get("publisher"):
        tags.append(str(item["publisher"]))
    if item.get("system"):
        tags.append(str(item["system"]).upper())
    if item.get("video"):
        tags.append(str(item["video"]).upper())
    countries = normalize_code_values(item.get("countries", []), COUNTRY_NAMES)
    languages = normalize_code_values(item.get("languages", []), LANGUAGE_NAMES)
    if countries:
        tags.append("-".join(countries))
    if languages:
        tags.append("-".join(code.lower() for code in languages))
    for key in ("copyright_status", "development_status", "media_type", "media_label"):
        if item.get(key):
            tags.append(str(item[key]))
    if any(str(value).lower() == "ulaplus" for value in item.get("hardware", [])):
        tags.append("ULAPlus")
    tags.extend(managed)
    return dedupe(tags)


def build_tosec_flags(item: dict) -> list[str]:
    existing = [str(flag).strip() for flag in item.get("flags", []) if str(flag).strip()]
    explicit = normalize_text_list(item.get("dump_flags", [])) + normalize_text_list(item.get("more_info", []))
    return dedupe(explicit or existing)


def clean_metadata_text(value: object, default: str = "", max_len: int = 120, allow_empty: bool = True) -> str:
    text = str(value if value is not None else default).strip()
    text = re.sub(r"\s+", " ", text)
    if not text and not allow_empty:
        text = default
    return text[:max_len]


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


def normalize_code_values(value: object, allowed: dict[str, str]) -> list[str]:
    if isinstance(value, str):
        raw_values = re.split(r"[,;/\s]+", value)
    elif isinstance(value, list | tuple):
        raw_values = [str(item) for item in value]
    else:
        raw_values = []
    codes: list[str] = []
    for raw in raw_values:
        code = raw.strip().upper()
        if not code:
            continue
        if code in allowed:
            codes.append(code)
    return dedupe(codes)


def normalize_text_list(value: object) -> list[str]:
    if isinstance(value, str):
        raw_values = re.split(r"[,;]+", value)
    elif isinstance(value, list | tuple):
        raw_values = [str(item) for item in value]
    else:
        raw_values = []
    return dedupe([clean_metadata_text(item, max_len=60) for item in raw_values if clean_metadata_text(item)])


def delete_game(game_id: str) -> dict:
    game = get_library().get_game(game_id)
    if not game:
        return {"ok": False, "error": "Unknown game"}
    source = Path(game.path)
    if not source.exists():
        return {"ok": False, "error": f"Missing game file: {source}"}
    trash_root = COLLECTION / "_Deleted"
    target = unique_path(trash_root / relative_collection_path(source))
    target.parent.mkdir(parents=True, exist_ok=True)
    source.replace(target)
    if game.view == "incoming":
        cleanup_empty_parents(source.parent, (COLLECTION / "incoming").resolve())
    else:
        update_metadata_game(game_id, file=collection_relative(target), status="Deleted")
    trash_game = make_scanned_game(target, trash_root, "trash", get_library().poks_by_title_memory, load_favourites())
    get_library().replace_game(game_id, trash_game)
    return {"ok": True, "path": str(target)}


def import_incoming_game(game_id: str) -> dict:
    result = import_incoming_games([game_id])
    if not result.get("ok"):
        return result
    imported = result.get("imported", [])
    if imported:
        first = imported[0]
        return {"ok": True, "name": first.get("name", ""), "path": first.get("path", ""), "imported": imported}
    return {"ok": True, "name": "", "path": "", "imported": []}


def import_incoming_games(game_ids: object) -> dict:
    ids = selected_game_ids(game_ids)
    if not ids:
        return {"ok": False, "error": "No incoming games selected"}
    ensure_metadata_file()
    metadata = load_metadata()
    imported = []
    errors = []
    for game_id in ids:
        try:
            imported.append(import_incoming_game_item(game_id, metadata))
        except Exception as exc:
            errors.append({"game_id": game_id, "error": str(exc)})
    if imported:
        save_metadata(metadata)
        get_library().rebuild()
    if errors:
        return {"ok": False, "error": f"Imported {len(imported)}, failed {len(errors)}", "imported": imported, "errors": errors}
    return {"ok": True, "imported": imported, "count": len(imported)}


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
    shutil.move(str(source), str(target))
    item["file"] = collection_relative(target)
    item["format"] = target.suffix.lower()
    item["id"] = stable_id(item["file"])
    metadata.setdefault("games", []).append(item)
    cleanup_empty_parents(source.parent, incoming)
    get_library().remove_game(game_id)
    return {"id": item["id"], "name": target.name, "path": str(target), "folder": collection_relative(target.parent)}


def restore_trash_games(game_ids: object) -> dict:
    ids = selected_game_ids(game_ids)
    if not ids:
        return {"ok": False, "error": "No bin games selected"}
    ensure_metadata_file()
    metadata = load_metadata()
    restored = []
    errors = []
    for game_id in ids:
        try:
            restored.append(restore_trash_game_item(game_id, metadata))
        except Exception as exc:
            errors.append({"game_id": game_id, "error": str(exc)})
    if restored:
        save_metadata(metadata)
        get_library().rebuild()
    if errors:
        return {"ok": False, "error": f"Restored {len(restored)}, failed {len(errors)}", "restored": restored, "errors": errors}
    return {"ok": True, "restored": restored, "count": len(restored)}


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
    shutil.move(str(source), str(target))
    item["file"] = collection_relative(target)
    item["format"] = target.suffix.lower()
    item["id"] = stable_id(item["file"])
    cleanup_empty_parents(source.parent, trash)
    get_library().remove_game(game_id)
    return {"id": item["id"], "name": target.name, "path": str(target), "folder": collection_relative(target.parent)}


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
    resolved = path.resolve()
    try:
        return resolved.relative_to(COLLECTION.resolve())
    except ValueError:
        return Path(path.name)


def clean_file_name(name: str) -> str:
    cleaned = name.strip().replace("/", "-").replace("\\", "-")
    cleaned = cleaned.strip(" .")
    for char in '<>:"|?*':
        cleaned = cleaned.replace(char, "-")
    return cleaned


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


def log(message: str) -> None:
    timestamp = dt.datetime.now().isoformat(timespec="seconds")
    line = f"[{timestamp}] {message}\n"
    try:
        DATA.mkdir(parents=True, exist_ok=True)
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
