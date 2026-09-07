import io
import json
from urllib.parse import parse_qs, urlsplit

import pytest

from test_feature_parity import configure_fixture, load_server


@pytest.mark.parametrize("kind,platform,system,configured,expected", [
    ("Official", "", "48K", "4913", "4913"),
    ("Official", "PC", "128K", "custom-id", "custom-id"),
    ("ScummVM", "dos", "DOS", "4913", "1"),
    ("ScummVM", "windows", "Windows", "4913", "1"),
    ("ScummVM", "amiga", "Amiga", "4913", "4911"),
    ("ScummVM", "atari-st", "Atari ST", "4913", "4937"),
    ("ScummVM", "macintosh", "Macintosh", "4913", "37"),
    ("ScummVM", "fm-towns", "FM Towns", "4913", "4932"),
    ("ScummVM", "unknown", "Steam", "4913", None),
    ("ScummVM", "unknown", "Unspecified platform", "4913", None),
    ("ScummVM", "future-system", "Future system", "4913", None),
    ("ScummVM", "dos", "DOS", "", "1"),
])
def test_request_uses_selected_versions_original_platform(
        tmp_path, monkeypatch, kind, platform, system, configured, expected):
    server = load_server()
    configure_fixture(server, tmp_path)
    game = server.get_library().get_game("jetpac")
    game.type, game.platform, game.system = kind, platform, system
    provider = {"api_key": "fixture-key", "platform_id": configured}
    requests = []

    def respond(request, timeout):
        requests.append(parse_qs(urlsplit(request.full_url).query))
        return io.BytesIO(b'{"data":{"games":[]}}')

    monkeypatch.setattr(server, "urlopen", respond)
    server.thegamesdb_request(game, provider, "King's Quest V")
    assert requests[0].get("filter[platform]") == ([expected] if expected else None)
    assert requests[0]["name"] == ["King's Quest V"]
    assert provider == {"api_key": "fixture-key", "platform_id": configured}


def test_scummvm_preview_returns_matches_and_keeps_platform_on_title_retry(tmp_path, monkeypatch):
    server = load_server()
    configure_fixture(server, tmp_path)
    game = server.get_library().get_game("jetpac")
    game.type, game.platform, game.system = "ScummVM", "dos", "DOS"
    game.title = "Monkey Island v1.0"
    requests = []

    def respond(request, timeout):
        query = parse_qs(urlsplit(request.full_url).query)
        requests.append(query)
        rows = [] if len(requests) == 1 else [{"id": 42, "game_title": "Monkey Island", "platform": 1}]
        return io.BytesIO(json.dumps({"data": {"games": rows},
            "include": {"platform": {"data": {"1": {"name": "PC"}}}}}).encode())

    monkeypatch.setattr(server, "urlopen", respond)
    monkeypatch.setattr(server, "thegamesdb_images_request", lambda *_: {})
    monkeypatch.setattr(server, "thegamesdb_lookup_table", lambda *_: {})
    monkeypatch.setattr(server, "configured_scrapers", lambda: {"thegamesdb": {
        "id": "thegamesdb", "name": "TheGamesDB", "type": "thegamesdb", "enabled": True,
        "configured": True, "api_key": "fixture-key", "platform_id": "4913"}})
    monkeypatch.setattr(server, "OPTIONAL_NETWORK_ALLOWED", lambda: True)
    result = server.scrape_preview(game.id, "thegamesdb")
    assert result["ok"] is True
    assert [query["name"] for query in requests] == [["Monkey Island v1.0"], ["Monkey Island"]]
    assert all(query["filter[platform]"] == ["1"] for query in requests)
    assert result["matches"][0]["candidate"]["platform"] == "PC"
    assert "Spectrum" not in result["matches"][0]["reason"]
    assert "fixture-key" not in json.dumps(result)


def test_provider_configuration_does_not_require_spectrum_filter():
    server = load_server()
    assert server.scraper_configured({"type": "thegamesdb", "api_key": "fixture-key", "platform_id": ""})
    assert not server.scraper_configured({"type": "thegamesdb", "api_key": "", "platform_id": "4913"})
