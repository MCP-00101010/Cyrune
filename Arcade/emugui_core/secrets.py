"""Scraper-secret storage and verified legacy migration."""

from __future__ import annotations

from typing import Callable


SCRAPER_SECRET_FIELDS = {
    "screenscraper": ("password", "developer_password"),
    "thegamesdb": ("api_key",),
}


class ScraperSecretService:
    def __init__(self) -> None:
        self._get: Callable[[str], str] | None = None
        self._set: Callable[[str, str], None] | None = None
        self._delete: Callable[[str], None] | None = None
        self._status: Callable[[], dict[str, object]] | None = None

    @staticmethod
    def key(provider_id: str, field: str) -> str:
        return f"emugui.scraper.{provider_id}.{field}"

    def configure(self, *, get_secret: Callable[[str], str], set_secret: Callable[[str, str], None],
                  delete_secret: Callable[[str], None], status: Callable[[], dict[str, object]]) -> None:
        self._get = get_secret
        self._set = set_secret
        self._delete = delete_secret
        self._status = status

    def status(self) -> dict[str, object]:
        if not self._status:
            return {"available": False, "provider": "", "error": "Open Cyrune Arcade through Cyrune Relay to manage credentials."}
        try:
            return dict(self._status())
        except Exception as exc:
            return {"available": False, "provider": "", "error": str(exc)}

    def get(self, provider_id: str, field: str) -> str:
        if not self._get:
            return ""
        return str(self._get(self.key(provider_id, field)) or "")

    def set_verified(self, provider_id: str, field: str, value: str) -> None:
        if not self._set or not self._get or not self._delete:
            raise RuntimeError("Credential storage is unavailable; open Cyrune Arcade through Cyrune Relay")
        key = self.key(provider_id, field)
        if value:
            self._set(key, value)
            if str(self._get(key) or "") != value:
                raise RuntimeError(f"Credential verification failed for {provider_id}")
        else:
            self._delete(key)

    def hydrate(self, scrapers: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
        for provider_id, fields in SCRAPER_SECRET_FIELDS.items():
            provider = scrapers.get(provider_id)
            if provider is None:
                continue
            for field in fields:
                stored = self.get(provider_id, field)
                if stored:
                    provider[field] = stored
        return scrapers

    def migrate(self, config: dict[str, object]) -> bool:
        if not self.status().get("available"):
            return False
        scrapers = config.get("scrapers")
        if not isinstance(scrapers, dict):
            return False
        changed = False
        for provider_id, fields in SCRAPER_SECRET_FIELDS.items():
            provider = scrapers.get(provider_id)
            if not isinstance(provider, dict):
                continue
            for field in fields:
                legacy = str(provider.get(field) or "")
                if not legacy:
                    provider.pop(field, None)
                    continue
                self.set_verified(provider_id, field, legacy)
                provider.pop(field, None)
                changed = True
        return changed

    @staticmethod
    def scrub(scrapers: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
        for provider_id, fields in SCRAPER_SECRET_FIELDS.items():
            provider = scrapers.get(provider_id)
            if isinstance(provider, dict):
                for field in fields:
                    provider.pop(field, None)
        return scrapers
