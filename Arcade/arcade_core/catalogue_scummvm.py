"""Native catalogue and exact configured-target policy for ScummVM sources."""

from dataclasses import dataclass
from pathlib import Path

from arcade_core.catalogue_identity import CatalogueError, valid_id
from arcade_core.catalogue_spectrum import SpectrumEntry, _metadata_digest, media_signature
from arcade_core.import_scummvm import scummvm_manifest, configured_target, launch_preflight, PLATFORMS
from arcade_core.import_manifest import BASE_TEXT, DETAIL_TEXT, DETAIL_LISTS
from arcade_core.scummvm_overrides import ScummvmOverrides


PLATFORM_LABELS = {identity: label for identity, label in PLATFORMS.values()}


@dataclass(frozen=True)
class ScummvmEntry(SpectrumEntry):
    target: dict | None = None
    family_title: str = ""


class ScummvmSource:
    browse = True

    def __init__(self, collection, identity, runtime=None):
        self.runtime = runtime
        self.collection_id = collection["id"]
        self.root = Path(collection["root"]).resolve()
        value = collection.get("scummvm_config")
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise CatalogueError("configuration-required")
        self.config_path = Path(value).resolve()
        self.collection = dict(collection)
        manifest = scummvm_manifest(self.collection_id, self.root, self.config_path)
        self.rows = {entry["id"]: entry for entry in manifest["entries"]}
        self.overrides = ScummvmOverrides(runtime, collection).load() if runtime is not None else {}
        self.source_id = identity(["scummvm-source", self.collection_id, str(self.root), str(self.config_path)])
        self.identity = identity

    def _row_index(self):
        return self.rows

    def artwork_target(self, row):
        from arcade_core.entry_artwork import target
        values = ScummvmOverrides.values(self.overrides, row['id'], row['target'])
        return target(self.root, self.runtime, {**row['metadata'], **values})

    def snapshot(self):
        result = []
        for legacy, row in self.rows.items():
            metadata, target = row["metadata"], row["target"]
            values = ScummvmOverrides.values(self.overrides, legacy, target)
            presentation = {**metadata, **{key: value for key, value in values.items()
                                           if key in BASE_TEXT or key in DETAIL_TEXT}}
            platform, label = PLATFORMS[target["platform"]]
            base = {"catalogueId": self.identity(["scummvm-entry", self.source_id, legacy]),
                    "sourceId": self.source_id, "entryRevision": "", "platformId": platform, "platformLabel": label,
                    "targetKind": "scummvm-game", "availability": "available", "artworkRef": "",
                    **{key: presentation[key] for key in BASE_TEXT}}
            detail = {key: presentation[key] for key in (*DETAIL_TEXT, *DETAIL_LISTS)}
            result.append(ScummvmEntry(base, detail, legacy, self.collection_id, target["directory"], (),
                                      (self.collection.get("default_emulator", ""), ""),
                                      _metadata_digest({"registration": row, "overrides": values} if values else row), self.artwork_target(row), target,
                                      metadata["title"]))
        return result

    def resolve_native(self, entry):
        if entry.collection_id != self.collection_id or self.rows.get(entry.legacy_id, {}).get("target") != entry.target:
            raise CatalogueError("entry-changed")
        return configured_target(self.root, self.config_path, entry.target)


def resolve_scummvm_plan(lifecycle, source, indexed, public, directory):
    from arcade_core.catalogue_launch import _native_path
    config = lifecycle._config()
    collection = lifecycle._collection(config, source.collection_id)
    emulator_id = collection.get("default_emulator")
    if not valid_id(emulator_id, legacy=True):
        raise CatalogueError("configuration-required")
    emulator = config.get("emulators", {}).get(emulator_id)
    if not isinstance(emulator, dict) or emulator.get("type") != "scummvm":
        raise CatalogueError("configuration-required")
    preflight = launch_preflight(source.root, source.config_path, _native_path(emulator.get("path")), indexed.target)
    result = {"schemaVersion": 2, "catalogueId": public["catalogueId"], "sourceId": public["sourceId"],
              "entryRevision": public["entryRevision"], "collectionId": source.collection_id, "gameId": indexed.legacy_id,
              "adapterId": "scummvm", "emulatorId": emulator_id, "profileId": "", "root": str(source.root),
              "media": str(directory), "config": str(source.config_path), "configSignature": media_signature(source.config_path),
              "target": dict(indexed.target), "targetDigest": preflight["targetDigest"],
              "executable": preflight["executable"], "executableSignature": media_signature(Path(preflight["executable"])),
              "cwd": preflight["cwd"], "arguments": preflight["arguments"],
              "public": {"title": public["title"], "systemId": public["platformId"], "systemName": public["platformLabel"]}}
    if hasattr(lifecycle, "observe_plan"):
        lifecycle.observe_plan(result)
    return result
