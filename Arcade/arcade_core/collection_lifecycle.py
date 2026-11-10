"""Own the interactive collection view, its cache and recoverable transitions.

Collection loading callbacks read current() under the same reentrant lock. A
candidate is visible to those callbacks only while selection owns that lock;
failed selections restore the previous complete view before releasing it.
"""
from copy import deepcopy
from dataclasses import dataclass, replace
from pathlib import Path

from arcade_core.collection_cache import CollectionCache
from arcade_core.catalogue_identity import CatalogueError, _writer_lock
from arcade_core.collection_settings import settings_record, validate_settings


@dataclass(frozen=True)
class CollectionView:
    root: Path
    collection: dict | None = None
    library: object = None
    metadata: object = None

    @property
    def reports(self):
        return self.root / '_reports'

    @property
    def metadata_file(self):
        return self.root / 'collection-metadata.json'


class CollectionLifecycle:
    def __init__(self, *, default_root, runtime, config_path, checkout, lock,
                 collections, load_config, save_config, update_state,
                 load_favourites, build_library, prepare_versions,
                 invalidate_catalogue, parse_tosec_name):
        self._view = CollectionView(Path(default_root))
        self._cache = CollectionCache()
        self._runtime, self._config_path, self._checkout = runtime, config_path, checkout
        self._lock = lock
        self._collections, self._load_config, self._save_config = collections, load_config, save_config
        self._update_state, self._load_favourites = update_state, load_favourites
        self._build_library, self._prepare_versions = build_library, prepare_versions
        self._invalidate_catalogue, self._parse_tosec_name = invalidate_catalogue, parse_tosec_name

    def current(self):
        with self._lock:
            return replace(self._view, collection=deepcopy(self._view.collection))

    def active(self):
        """Refresh configured policy before callers authorize collection work."""
        with self._lock:
            if self._view.collection is None:
                return self._collections().active()
            selected = self._resolve(self._view.collection['id'])
            if selected != self._view.collection:
                self.invalidate()
                self._view = CollectionView(Path(selected['root']).resolve(), deepcopy(selected))
            return deepcopy(selected)

    def activate(self, collection_id):
        """Initialize/reload a context without loading media or persisting selection."""
        with self._lock:
            selected = self._resolve(collection_id)
            self._view = CollectionView(Path(selected['root']).resolve(), deepcopy(selected))
            return selected

    def _resolve(self, collection_id):
        selected = next((row for row in self._load_config().get('collections', [])
                         if row['id'] == collection_id), None)
        if selected is None:
            raise ValueError(f'Unknown collection: {collection_id}')
        return selected

    def library(self):
        with self._lock:
            if self._view.library is None:
                library = self._build_library()
                self._view = replace(self._view, library=library)
            return self._view.library

    def metadata(self, factory):
        with self._lock:
            if self._view.metadata is None:
                self._view = replace(self._view, metadata=factory())
            return self._view.metadata

    def invalidate(self, *, old_root=None, new_root=None):
        with self._lock:
            self._cache.invalidate(self._cache_key())
            view = self._view
            if old_root is not None and view.root.resolve() == Path(old_root).resolve():
                record = {**(view.collection or {}), 'root': str(new_root)}
                view = CollectionView(Path(new_root).resolve(), record)
            self._view = replace(view, library=None, metadata=None)
            self._invalidate_catalogue()

    def invalidate_cache(self):
        with self._lock:
            self._cache.invalidate(self._cache_key())
            self._invalidate_catalogue()

    def _cache_key(self):
        return (str(self._runtime.resolve()), str(self._view.root.resolve()),
                (self._view.collection or {}).get('id', ''))

    def remember(self, library):
        with self._lock:
            from arcade_core.game_properties import properties_path
            view = self._view
            collection = view.collection or self._collections().active()
            paths = [self._config_path, view.metadata_file, view.root,
                     self._runtime / 'catalogue-transaction.json', self._runtime / 'catalogue-proofs.json',
                     properties_path(self._runtime, collection)]
            if collection.get('adapter') == 'scummvm-config-v1':
                from arcade_core.scummvm_overrides import ScummvmOverrides
                paths.extend([collection['scummvm_config'], ScummvmOverrides(self._runtime, collection).path])
            elif collection.get('adapter') == 'atari-st-disks-v1':
                from arcade_core.atari_overrides import AtariOverrides
                paths.append(AtariOverrides(self._runtime, collection).path)
            paths.extend(Path(game.path).parent for game in library.games)
            paths.extend(Path(pok.get('output_path', '')).parent for pok in library.pok_by_id.values())
            paths.extend(view.root / name for name in ('incoming', '_Deleted', 'Games', 'POKs'))
            self._cache.put(self._cache_key(), library, paths)

    def select(self, collection_id, progress=None):
        progress = progress or (lambda *_: None)
        with self._lock:
            selected = self._resolve(collection_id)
            previous = self._view
            self._view = CollectionView(Path(selected['root']).resolve(), deepcopy(selected))
            try:
                cached = self._cache.get(self._cache_key())
                if cached is not None:
                    favourites = self._load_favourites()
                    for game in cached.games:
                        game.favourite = game.id in favourites
                    self._view = replace(self._view, library=cached)
                    progress('cached', 0, 0, 'Loading saved library view...')
                else:
                    self.library()
                progress('versions', 0, 0, 'Loading game versions...')
                try:
                    self._prepare_versions()
                except CatalogueError as error:
                    if error.code != 'unavailable':
                        raise
                # Publish durable selection only after the full candidate is usable.
                self._update_state(lambda state: state.update(active_collection_id=selected['id']))
            except Exception:
                self._cache.invalidate(self._cache_key())
                self._view = previous
                raise
            return self.current()

    def update_settings(self, data):
        with self._lock, _writer_lock(self._config_path):
            config = self._load_config()
            collection = self._resolve(data.get('collection_id'))
            active = self._view.collection or self._collections().active()
            updated = validate_settings(config, data, self._runtime, self._checkout)
            if updated != collection:
                config['collections'][config['collections'].index(collection)] = updated
                self._save_config(config)
                # Durable settings already succeeded. Invalidate rather than risk
                # reporting a successful view of the old location after a load fault.
                if active['id'] == updated['id']:
                    self.invalidate()
                    self._view = CollectionView(Path(updated['root']).resolve(), deepcopy(updated))
                else:
                    self._invalidate_catalogue()
            return settings_record(updated)

    def rebuild(self, collection_id, progress=None):
        with self._lock:
            # A queued job may begin after another process edits this record.
            # Resolve current policy and paths before refreshing any native index.
            collection = self.active()
            if collection['id'] != collection_id:
                raise ValueError('The selected collection changed. Rebuild it again.')
            self.invalidate_cache()
            try:
                adapter = collection.get('adapter')
                if adapter in {'atari-st-disks-v1', 'gameboy-cartridges-v1'}:
                    if adapter == 'atari-st-disks-v1':
                        from arcade_core.atari import refresh_index
                        message = 'Checking for added disk images…'
                    else:
                        from arcade_core.gameboy import refresh_index
                        message = 'Checking for added cartridges…'
                    if progress:
                        progress('discovering', 0, 0, message)
                    refresh_index(collection['root'], self._parse_tosec_name)
                self.library().rebuild(progress)
            except Exception:
                self.invalidate()
                raise
            return self.current()
