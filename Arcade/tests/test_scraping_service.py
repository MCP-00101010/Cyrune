from types import SimpleNamespace

from arcade_core.scraping import ScraperAdapter, ScraperService


def test_scraper_service_routes_configured_providers_and_contains_errors():
    game = SimpleNamespace(id="jetpac")
    providers = {
        "manual": {"id": "manual", "name": "Manual", "type": "manual", "enabled": True, "configured": True},
        "screen": {"id": "screen", "name": "ScreenScraper", "type": "screenscraper", "enabled": True, "configured": True},
    }
    service = ScraperService(
        get_game=lambda game_id: game if game_id == "jetpac" else None,
        provider_config=lambda: providers,
        adapters={
            "manual": ScraperAdapter("manual", lambda selected, provider: {"ok": True, "provider": provider["id"], "game": selected.id}),
            "screenscraper": ScraperAdapter("screenscraper", lambda *_args: (_ for _ in ()).throw(RuntimeError("offline"))),
        },
    )

    assert service.preview("jetpac", "manual") == {"ok": True, "provider": "manual", "game": "jetpac"}
    assert service.preview("jetpac", "screen") == {"ok": False, "error": "offline"}
    assert service.preview("missing", "manual")["error"] == "Unknown game"


def test_scraper_service_enforces_provider_state_before_dispatch():
    game = SimpleNamespace(id="jetpac")
    providers = {
        "disabled": {"name": "Disabled", "type": "screenscraper", "enabled": False, "configured": True},
        "unconfigured": {"name": "Needs Setup", "type": "thegamesdb", "enabled": True, "configured": False},
        "future": {"name": "Future", "type": "future", "enabled": True, "configured": True},
    }
    service = ScraperService(get_game=lambda _game_id: game, provider_config=lambda: providers, adapters={})

    assert service.preview("jetpac", "disabled")["error"] == "Disabled is disabled"
    assert service.preview("jetpac", "unconfigured")["error"] == "Needs Setup is not configured yet"
    assert "not implemented" in service.preview("jetpac", "future")["error"]


def test_scraper_service_enforces_optional_network_policy():
    service = ScraperService(
        get_game=lambda _game_id: object(),
        provider_config=lambda: {
            "remote": {"type": "remote", "name": "Remote", "enabled": True, "configured": True},
        },
        adapters={"remote": ScraperAdapter("remote", lambda *_args: {"ok": True})},
        optional_network_allowed=lambda: False,
    )

    assert service.preview("game", "remote") == {
        "ok": False,
        "error": "Optional network access is disabled in Cyrune Nexus",
    }
