"""Transport-independent metadata editing orchestration."""

from __future__ import annotations

from dataclasses import asdict
from copy import deepcopy
from pathlib import Path
import shutil
from typing import Callable


class MetadataService:
    """Coordinate metadata previews and mutations through injected storage adapters."""

    def __init__(
        self,
        *,
        library_provider: Callable[[], object],
        ensure_metadata_file: Callable[[], None],
        load_metadata: Callable[[], dict[str, object]],
        save_metadata: Callable[[dict[str, object]], None],
        game_to_metadata_item: Callable[[object, list[str]], dict[str, object]],
        apply_metadata_changes: Callable[[object, dict[str, object], dict[str, object], bool], dict[str, object]],
        apply_metadata_values: Callable[[object, dict[str, object], dict[str, object]], None],
        build_target_path: Callable[[Path, dict[str, object], str], Path],
        metadata_warnings: Callable[[object, object, object, dict[str, object]], list[str]],
        metadata_change_labels: Callable[[dict[str, object]], list[str]],
        collection_relative: Callable[[Path], str],
        unique_path: Callable[[Path], Path],
        clean_file_name: Callable[[str], str],
        update_metadata_game: Callable[..., None],
        clean_metadata_text: Callable[..., str],
        clean_asset_path: Callable[[object], str],
        dedupe: Callable[[list[str]], list[str]],
        before_move: Callable[[Path, Path], None] | None = None,
    ) -> None:
        self._library_provider = library_provider
        self._ensure_metadata_file = ensure_metadata_file
        self._load_metadata = load_metadata
        self._save_metadata = save_metadata
        self._game_to_metadata_item = game_to_metadata_item
        self._apply_metadata_changes = apply_metadata_changes
        self._apply_metadata_values = apply_metadata_values
        self._build_target_path = build_target_path
        self._metadata_warnings = metadata_warnings
        self._metadata_change_labels = metadata_change_labels
        self._collection_relative = collection_relative
        self._unique_path = unique_path
        self._clean_file_name = clean_file_name
        self._update_metadata_game = update_metadata_game
        self._clean_metadata_text = clean_metadata_text
        self._clean_asset_path = clean_asset_path
        self._dedupe = dedupe
        self._before_move = before_move or (lambda _source, _target: None)
        self._history: list[dict[str, object]] = []

    def rename_game(self, game_id: str, name: str) -> dict[str, object]:
        library = self._library_provider()
        game = library.get_game(game_id)
        if not game:
            return {"ok": False, "error": "Unknown game"}
        source = Path(game.path)
        if not source.exists():
            return {"ok": False, "error": f"Missing game file: {source}"}
        cleaned = self._clean_file_name(name)
        if not cleaned:
            return {"ok": False, "error": "Please enter a filename"}
        requested = Path(cleaned)
        if requested.suffix and requested.suffix.lower() != source.suffix.lower():
            return {"ok": False, "error": f"File extension must stay {source.suffix}"}
        target_stem = requested.stem if requested.suffix else cleaned
        requested_target = source.with_name(f"{target_stem}{source.suffix}")
        if requested_target.resolve() == source.resolve():
            return {"ok": True, "path": str(source), "name": source.name, "unchanged": True}
        target = self._unique_path(requested_target)
        old_relative = self._collection_relative(source)
        self._before_move(source, target)
        source.replace(target)
        try:
            self._update_metadata_game(game_id, file=self._collection_relative(target), format=target.suffix.lower())
            library.rebuild()
        except Exception as error:
            rollback_errors: list[str] = []
            try:
                if target.exists() and not source.exists():
                    target.replace(source)
            except Exception as rollback_error:
                rollback_errors.append(f"file restore: {rollback_error}")
            try:
                self._update_metadata_game(game_id, file=old_relative, format=source.suffix.lower())
            except Exception as rollback_error:
                rollback_errors.append(f"metadata restore: {rollback_error}")
            try:
                library.rebuild()
            except Exception as rollback_error:
                rollback_errors.append(f"library rebuild: {rollback_error}")
            if rollback_errors:
                raise RuntimeError(
                    f"Rename failed ({error}); rollback was incomplete ({'; '.join(rollback_errors)})"
                ) from error
            raise
        return {"ok": True, "path": str(target), "name": target.name}

    def scrape_candidate_changes(self, candidate: dict, remote_assets: dict) -> dict[str, object]:
        changes: dict[str, object] = {}
        for key in (
            "title", "year", "publisher", "genre", "developer", "platform", "region", "players",
            "coop", "rating", "youtube_id", "description", "scraper_source", "scraper_id",
        ):
            value = self._clean_metadata_text(candidate.get(key, ""), max_len=2000 if key == "description" else 160)
            if value:
                changes["date" if key == "year" else key] = value
        screenshot = self._clean_asset_path(remote_assets.get("screenshot") or candidate.get("screenshot"))
        loading_screen = self._clean_asset_path(remote_assets.get("loading_screen") or candidate.get("loading_screen"))
        if screenshot:
            changes["screenshot"] = screenshot
        if loading_screen:
            changes["loading_screen"] = loading_screen
        return changes

    def apply_scrape(self, game_id: str, candidate: object, remote_assets: object | None = None) -> dict[str, object]:
        if not isinstance(candidate, dict):
            return {"ok": False, "error": "Missing scrape candidate"}
        if not self._library_provider().get_game(game_id):
            return {"ok": False, "error": "Unknown game"}
        changes = self.scrape_candidate_changes(candidate, remote_assets if isinstance(remote_assets, dict) else {})
        if not changes:
            return {"ok": False, "error": "Scrape candidate has no usable metadata"}
        result = self.update([game_id], changes, False)
        if not result.get("ok"):
            return result
        updated = self._library_provider().get_game(game_id)
        return {
            "ok": True,
            "updated_count": result.get("updated_count", 0),
            "changes": changes,
            "game": asdict(updated) if updated else None,
        }

    def update(self, game_ids: object, changes: object, rename_files: bool = False) -> dict[str, object]:
        if not isinstance(game_ids, list) or not game_ids:
            return {"ok": False, "error": "No games selected"}
        if not isinstance(changes, dict):
            return {"ok": False, "error": "Missing metadata changes"}
        self._ensure_metadata_file()
        metadata = self._load_metadata()
        original_metadata = deepcopy(metadata)
        items = metadata.setdefault("games", [])
        by_id = {str(item.get("id", "")): item for item in items}
        updated: list[dict[str, str]] = []
        errors: list[str] = []
        warnings: list[str] = []
        library = self._library_provider()
        moved_files: list[tuple[str, str]] = []
        for raw_game_id in game_ids:
            game_id = str(raw_game_id)
            game = library.get_game(game_id)
            if not game:
                errors.append(f"Unknown game: {game_id}")
                continue
            item = by_id.get(game_id)
            if item is None:
                item = self._game_to_metadata_item(game, [])
                items.append(item)
                by_id[game_id] = item
            result = self._apply_metadata_changes(game, item, changes, rename_files)
            if result.get("ok"):
                updated.append({"id": game_id, "file": str(item.get("file", ""))})
                warnings.extend(str(warning) for warning in result.get("warnings", []))
                source_path = str(result.get("source_path") or "")
                target_path = str(result.get("target_path") or "")
                if source_path and target_path and source_path != target_path:
                    moved_files.append((source_path, target_path))
            else:
                errors.append(str(result.get("error") or game.file_name))
        if updated:
            self._save_metadata(metadata)
            library.rebuild()
            self._history.append({
                "metadata": original_metadata,
                "moves": moved_files,
                "updated": [entry["id"] for entry in updated],
            })
            self._history = self._history[-20:]
        return {
            "ok": not errors, "updated": updated, "errors": errors, "warnings": warnings,
            "updated_count": len(updated), "undo_available": bool(self._history),
        }

    def undo_last(self) -> dict[str, object]:
        if not self._history:
            return {"ok": False, "error": "No metadata edit is available to undo"}
        record = self._history[-1]
        reversed_moves: list[tuple[Path, Path]] = []
        try:
            for source_text, target_text in reversed(record.get("moves", [])):
                source = Path(source_text)
                target = Path(target_text)
                if source.exists() and source.resolve() != target.resolve():
                    raise FileExistsError(f"Undo target already exists: {source.name}")
                if target.exists():
                    source.parent.mkdir(parents=True, exist_ok=True)
                    self._before_move(target, source)
                    shutil.move(str(target), str(source))
                    reversed_moves.append((source, target))
            self._save_metadata(deepcopy(record["metadata"]))
            self._library_provider().rebuild()
        except Exception:
            for source, target in reversed(reversed_moves):
                if source.exists() and not target.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(source), str(target))
            raise
        self._history.pop()
        return {
            "ok": True,
            "restored_count": len(record.get("updated", [])),
            "undo_available": bool(self._history),
        }

    def preview(self, game_ids: object, changes: object, rename_files: bool = False) -> dict[str, object]:
        if not isinstance(game_ids, list) or not game_ids:
            return {"ok": False, "error": "No games selected"}
        if not isinstance(changes, dict):
            return {"ok": False, "error": "Missing metadata changes"}
        metadata = self._load_metadata()
        by_id = {str(item.get("id", "")): item for item in metadata.get("games", [])}
        previews = []
        warnings: list[str] = []
        change_labels = self._metadata_change_labels(changes)
        library = self._library_provider()
        for raw_game_id in game_ids[:50]:
            game_id = str(raw_game_id)
            game = library.get_game(game_id)
            if not game:
                continue
            original = by_id.get(game_id) or self._game_to_metadata_item(game, [])
            item = dict(original)
            self._apply_metadata_values(game, item, changes)
            source = Path(game.path)
            target = self._build_target_path(source, item, str(original.get("title") or game.title)) if rename_files else source
            collision = rename_files and target.exists() and target.resolve() != source.resolve()
            new_target = self._unique_path(target) if collision else target
            item_warnings = self._metadata_warnings(
                original.get("title_key") or game.title_key,
                original.get("system") or game.system,
                original.get("memory") or game.memory,
                item,
            )
            if collision:
                item_warnings.append("filename collision; a suffix will be added")
            warnings.extend(item_warnings)
            previews.append({
                "id": game_id,
                "title": item.get("title", game.title),
                "current_filename": source.name,
                "new_filename": new_target.name,
                "current_folder": self._collection_relative(source.parent),
                "new_folder": self._collection_relative(new_target.parent),
                "rename_files": rename_files,
                "filename_changed": source.name != new_target.name or source.parent.resolve() != new_target.parent.resolve(),
                "warnings": item_warnings,
            })
        return {
            "ok": True,
            "count": len(game_ids),
            "preview_count": len(previews),
            "changes": change_labels,
            "rename_files": rename_files,
            "warnings": self._dedupe(warnings),
            "previews": previews,
        }
