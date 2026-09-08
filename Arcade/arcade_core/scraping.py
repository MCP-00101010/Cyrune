"""Transport-independent scraper provider dispatch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from arcade_core.scrape_platforms import platform_override


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
        optional_network_allowed: Callable[[], bool] = lambda: True,
    ) -> None:
        self._get_game = get_game
        self._provider_config = provider_config
        self._adapters = adapters
        self._optional_network_allowed = optional_network_allowed

    def preview(self, game_id: str, provider_id: str = "manual", search_term: object = None,
                search_platform: object = "current") -> dict[str, object]:
        if search_term is not None:
            if not isinstance(search_term, str) or not search_term.strip() or len(search_term) > 500 or any(ord(c) < 32 for c in search_term):
                return {"ok": False, "error": "Enter a search term of 1 to 500 characters."}
            search_term = search_term.strip()
        game = self._get_game(game_id)
        if not game:
            return {"ok": False, "error": "Unknown game"}
        provider = self._provider_config().get(provider_id)
        if not provider:
            return {"ok": False, "error": f"Unknown scraper provider: {provider_id}"}
        provider_type = str(provider.get("type") or "")
        if provider_type != "manual" and not self._optional_network_allowed():
            return {"ok": False, "error": "Optional network access is disabled in Cyrune Nexus"}
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
            request_provider = {**provider}
            request_provider["_search_platform"] = search_platform
            platform_override(request_provider, provider_type)
            if search_term is not None:
                request_provider["_search_term"] = search_term
            result = adapter.preview(game, request_provider)
            query = result.get("query", {})
            result["query"] = {**query, "search_platform": search_platform, "search_term": query.get("lookup_title", search_term if search_term is not None else
                getattr(game, "title", ""))}
            return result
        except Exception as exc:
            return {"ok": False, "error": str(exc), **({'retry_after':exc.retry_after} if hasattr(exc, 'retry_after') else {})}
