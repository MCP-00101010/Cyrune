from emugui_core.secrets import ScraperSecretService


def configured_service(secrets, *, verify=True):
    service = ScraperSecretService()
    service.configure(
        get_secret=lambda key: secrets.get(key, "") if verify else "wrong",
        set_secret=lambda key, value: secrets.__setitem__(key, value),
        delete_secret=lambda key: secrets.pop(key, None),
        status=lambda: {"available": True, "provider": "test"},
    )
    return service


def test_legacy_scraper_secrets_are_verified_before_json_is_scrubbed():
    secrets = {}
    service = configured_service(secrets)
    config = {
        "scrapers": {
            "screenscraper": {"username": "user", "password": "password"},
            "thegamesdb": {"api_key": "key"},
        }
    }

    assert service.migrate(config) is True
    assert "password" not in config["scrapers"]["screenscraper"]
    assert "api_key" not in config["scrapers"]["thegamesdb"]
    hydrated = service.hydrate({"screenscraper": {}, "thegamesdb": {}})
    assert hydrated["screenscraper"]["password"] == "password"
    assert hydrated["thegamesdb"]["api_key"] == "key"


def test_failed_secret_verification_keeps_legacy_json_value():
    service = configured_service({}, verify=False)
    config = {"scrapers": {"screenscraper": {"password": "keep-me"}}}

    try:
        service.migrate(config)
    except RuntimeError:
        pass

    assert config["scrapers"]["screenscraper"]["password"] == "keep-me"
