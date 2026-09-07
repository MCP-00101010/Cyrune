"""Private, source-scoped launch decisions for Host's entry-policy bindings."""

from copy import deepcopy
import os
import subprocess
from pathlib import Path
from types import SimpleNamespace

from arcade_core.catalogue_identity import CatalogueError, encoded, valid_id
from arcade_core.catalogue_spectrum import media_signature, _metadata_digest
from arcade_core.emulators import ALLOWED_ADAPTERS, normalize_template, normalize_extensions
from arcade_core.launching import GameLaunchService, render_arguments
from arcade_core.paths import ConfinedRoot
from arcade_core.profiles import EmulatorProfileService


def resolve_plan(lifecycle, catalogue_id, entry_revision=None):
    """Read one exact source and explicit policy; never activate a collection."""
    with lifecycle._lock:
        service = lifecycle.service()
        public = service.detail({"catalogueId": catalogue_id})["entry"]
        if entry_revision is not None and entry_revision != public["entryRevision"]:
            raise CatalogueError("entry-changed")
        target = service.resolve_native(catalogue_id, public["entryRevision"])
        indexed = service._by_id[catalogue_id]
        source = next(s for s in service._sources if s.collection_id == indexed.collection_id)
        if public["targetKind"] == "scummvm-game":
            from arcade_core.catalogue_scummvm import resolve_scummvm_plan
            return resolve_scummvm_plan(lifecycle, source, indexed, public, target)
        item = source._row_index().get(indexed.legacy_id)
        if item is None:
            raise CatalogueError("entry-missing")
        if _metadata_digest(item) != indexed.metadata_digest:
            raise CatalogueError("entry-changed")
        config = lifecycle._config()
        collection = lifecycle._collection(config, indexed.collection_id)
        emulator_id = item.get("default_emulator") or collection.get("default_emulator")
        if not emulator_id and source.browse:
            # Arcade's initial launcher selection is the first visible configured
            # emulator. An explicit missing/broken pin never falls through here.
            emulator_id = next((key for key, value in config.get("emulators", {}).items()
                                if isinstance(value, dict) and not value.get("hidden")
                                and (not normalize_extensions(value.get("supported_extensions", []))
                                     or target.suffix.lower() in normalize_extensions(value.get("supported_extensions", [])))
                                and (value.get("type") or key) not in {"default", "spectaculator_stub", "scummvm"}), None)
        if not valid_id(emulator_id, legacy=True):
            raise CatalogueError("configuration-required")
        emulator = config.get("emulators", {}).get(emulator_id)
        if not isinstance(emulator, dict):
            raise CatalogueError("configuration-required")
        extensions = normalize_extensions(emulator.get("supported_extensions", []))
        if extensions and target.suffix.lower() not in extensions:
            raise CatalogueError("unsupported-target")
        adapter = emulator.get("type") or emulator_id
        if adapter not in ALLOWED_ADAPTERS - {"default", "scummvm"}:
            raise CatalogueError("unsupported-target")
        executable = _native_path(emulator.get("path"))
        if not executable.is_file():
            raise CatalogueError("configuration-required")
        cwd = _native_path(emulator["working_dir"]) if emulator.get("working_dir") else executable.parent
        if not cwd.is_dir():
            raise CatalogueError("configuration-required")
        template = emulator.get("arguments", ["{file}"])
        if (not isinstance(template, list) or len(template) > 32
                or any(not isinstance(argument, str) for argument in template)):
            raise CatalogueError("configuration-required")
        template = normalize_template(template, "arguments", required_file=True)
        game = SimpleNamespace(id=indexed.legacy_id, path=str(target), title=public["title"],
                               system=item.get("system") or item.get("memory", ""),
                               tags=item.get("tags", []), emulator_profile=item.get("emulator_profile", ""))
        profiles = config.get("emulator_profiles", [])
        if not isinstance(profiles, list) or len(profiles) > 512 or any(not isinstance(p, dict) for p in profiles):
            raise CatalogueError("configuration-required")
        profile_service = EmulatorProfileService(
            load_config=lambda: config, save_config=lambda _: None, emulator_provider=lambda: config["emulators"],
            expand_path=_native_path, profile_dir=lifecycle.runtime / "emulator-profiles", clean_text=str, clean_id=str)
        # An explicit missing pin must never fall through to a rule/default profile.
        profile = profile_service.select(emulator_id, game, game.emulator_profile)
        if game.emulator_profile and profile is None:
            raise CatalogueError("configuration-required")
        profile_copy = None
        if profile:
            if adapter != "eightyone":
                raise CatalogueError("unsupported-target")
            managed = _native_path(profile.get("managed_path"))
            profile_root = (lifecycle.runtime / "emulator-profiles").resolve()
            if not managed.is_relative_to(profile_root) or not managed.is_file():
                raise CatalogueError("configuration-required")
            managed = ConfinedRoot(profile_root).resolve(managed.relative_to(profile_root), require_exists=True)
            destination = _native_path(emulator.get("eightyone_config_target"))
            if destination == managed or destination.is_relative_to(source.root):
                raise CatalogueError("review-required")
            profile_copy = {"root": str(profile_root), "source": str(managed), "target": str(destination),
                            "signature": media_signature(managed)}
        digest = lifecycle._proofs()["sources"].get(indexed.collection_id, {}).get(indexed.legacy_id)
        identity = source.registry.load()["sources"][indexed.collection_id]["entries"][indexed.legacy_id]
        if not digest and source.browse and not identity["signature"]:
            from arcade_core.catalogue_lifecycle import _content_hash
            digest = _content_hash(target)
        if not digest:
            raise CatalogueError("review-required")
        result = {
            "schemaVersion": 1, "catalogueId": catalogue_id, "sourceId": public["sourceId"],
            "entryRevision": public["entryRevision"], "collectionId": indexed.collection_id, "gameId": indexed.legacy_id,
            "root": str(source.root), "media": str(target), "mediaSignature": media_signature(target), "mediaSha256": digest,
            "emulatorId": emulator_id, "profileId": str((profile or {}).get("id") or ""), "adapterId": adapter,
            "executable": str(executable), "executableSignature": media_signature(executable), "cwd": str(cwd),
            "template": template, "arguments": render_arguments(template, game=game, file_path=target, collection_root=source.root),
            "profileCopy": profile_copy, "public": {"title": public["title"], "systemId": "zx-spectrum", "systemName": "ZX Spectrum"},
            "game": {"title": game.title, "system": game.system},
        }
        if len(encoded(result)) > 64 * 1024:
            raise CatalogueError("review-required")
        if hasattr(lifecycle, "observe_plan"):
            lifecycle.observe_plan(result)
        return result


def _native_path(value):
    if not isinstance(value, str) or not value or len(value) > 4096 or any(ord(c) < 32 for c in value):
        raise CatalogueError("configuration-required")
    path = Path(os.path.expandvars(value.strip().strip('"').strip("'").strip())).expanduser()
    if not path.is_absolute():
        raise CatalogueError("configuration-required")
    return path.resolve()


def launch_plan(runtime, plan, *, launch_process, copy_profile):
    """Use existing adapter behaviour with exact-source data and Host callbacks."""
    lifecycle = runtime.get_library_catalogue()
    if lifecycle is None:
        raise CatalogueError("unavailable")
    with runtime.COLLECTION_JOB_LOCK, lifecycle._lock:
        if resolve_plan(lifecycle, plan["catalogueId"], plan["entryRevision"]) != plan:
            raise CatalogueError("entry-changed")
        if plan["adapterId"] == "scummvm":
            process = launch_process([plan["executable"], *plan["arguments"]], Path(plan["cwd"]))
            if process is None:
                raise CatalogueError("unavailable")
            try:
                process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                pass
            else:
                raise CatalogueError("unavailable")
            runtime.focus_launched_emulator("scummvm", process)
            if process.poll() is not None:
                raise CatalogueError("unavailable")
            runtime.mark_recent(plan["gameId"])
            return True
        game = SimpleNamespace(id=plan["gameId"], path=plan["media"], **plan["game"])
        emulator = {"type": plan["adapterId"], "path": plan["executable"], "working_dir": plan["cwd"],
                    "arguments": deepcopy(plan["template"])}
        service = GameLaunchService(
            get_game=lambda game_id: game if game_id == plan["gameId"] else None, get_pok=lambda _: None,
            emulator_provider=lambda: {plan["emulatorId"]: emulator}, expand_path=_native_path,
            prepare_profile=lambda *_: copy_profile(plan["profileCopy"]) if plan["profileCopy"] else None,
            mark_recent=runtime.mark_recent, launch_process=launch_process,
            open_default=lambda _: (_ for _ in ()).throw(CatalogueError("unsupported-target")),
            find_running_window=lambda _: runtime.find_running_emulator_window(plan["adapterId"]),
            focus_emulator=lambda _id, process: runtime.focus_launched_emulator(plan["adapterId"], process),
            bring_to_front=runtime.bring_window_to_front, collection_root=lambda: Path(plan["root"]),
            check_immediate_exit=runtime.should_check_immediate_exit)
        result = service.launch_game(plan["gameId"], plan["emulatorId"], profile_id=plan["profileId"])
        if result.get("needs_choice") or result.get("needs_confirmation"):
            raise CatalogueError("configuration-required")
        if result.get("ok") is not True:
            raise CatalogueError("unavailable")
        return True
