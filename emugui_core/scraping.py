"""Transport-independent scraper provider dispatch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ScraperAdapter:
    provider_type: str
    preview: Callable[[object, dict[str, object]], dict[str, object]]


class ScraperService:
    def __init__(
        self,
        *,
        get_game: Callable[[str], object | None],
        provider_config: Callable[[], dict[str, dict[str, object]]],
        adapters: dict[str, ScraperAdapter],
    ) -> None:
        self._get_game = get_game
        self._provider_config = provider_config
        self._adapters = adapters

    def preview(self, game_id: str, provider_id: str = "manual") -> dict[str, object]:
        game = self._get_game(game_id)
        if not game:
            return {"ok": False, "error": "Unknown game"}
        provider = self._provider_config().get(provider_id)
        if not provider:
            return {"ok": False, "error": f"Unknown scraper provider: {provider_id}"}
        provider_type = str(provider.get("type") or "")
        if provider_type != "manual" and not provider.get("enabled", False):
            return {"ok": False, "error": f"{provider.get('name', provider_id)} is disabled"}
        if provider_type != "manual" and not provider.get("configured"):
            return {"ok": False, "error": f"{provider.get('name', provider_id)} is not configured yet"}
        adapter = self._adapters.get(provider_type)
        if not adapter:
            return {
                "ok": False,
                "error": f"{provider.get('name', provider_id)} provider scaffold exists, but live scraping is not implemented yet",
            }
        try:
            return adapter.preview(game, provider)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
