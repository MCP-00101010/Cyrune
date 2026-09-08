import base64
from copy import deepcopy
import io
import json
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request

import pytest

from arcade_core.screenscraper import RequestQuota, ScreenScraperRedirectHandler, artwork_parts
from arcade_core.scummvm_overrides import validate_values
from test_feature_parity import configure_fixture, load_server


@pytest.fixture
def setup(tmp_path, monkeypatch):
    server = load_server()
    configure_fixture(server, tmp_path)
    provider = {"id": "screenscraper", "type": "screenscraper", "name": "ScreenScraper",
                "enabled": True, "configured": True, "system_id": "135",
                "username": "fixture-user", "password": "fixture-password",
                "developer_id": "fixture-dev", "developer_password": "fixture-dev-secret"}
    monkeypatch.setattr(server, "configured_scrapers", lambda: {"screenscraper": provider})
    monkeypatch.setattr(server, "OPTIONAL_NETWORK_ALLOWED", lambda: True)
    return server, server.get_library().get_game("jetpac"), provider


def row(game_id="45280", title="Jetpac", system="76"):
    return {"id": game_id, "noms": [{"region": "wor", "text": title}],
            "systeme": {"id": system, "text": "ZX Spectrum"},
            "dates": [{"region": "wor", "text": "1983"}],
            "editeur": {"text": "Ultimate"}, "developpeur": {"text": "Ultimate"},
            "joueurs": {"text": "1-2"}, "medias": [
                {"type": kind, "region": region, "url":
                 "https://neoclone.screenscraper.fr/api2/mediaJeu.php?sspassword=fixture-password&devpassword=fixture-dev-secret"}
                for kind, region in [("sstitle", "wor"), ("ss", "fr"), ("ss", "wor"),
                                     ("box-2D", "fr"), ("box-2D", "wor"), ("box-3D", "wor")]]}


def test_pirates_exact_title_outscores_shared_words_even_with_matching_year_and_publisher(setup):
    server, game, _ = setup
    game.title = "Pirates!"
    game.title_key = "stale title"
    game.year = "1989"
    game.publisher = "MicroProse"
    exact = server.screenscraper_confidence(game, {"title": "Pirates"})
    unrelated = server.screenscraper_confidence(game, {
        "title": "Space Quest III: The Pirates of Pestulon", "year": "1989", "publisher": "MicroProse"})
    assert exact >= 75
    assert unrelated < 75 and unrelated < exact
    assert server.screenscraper_confidence(game, {"title": ""}) < 75


def test_public_platform_choices_are_all_platforms_without_secrets(setup):
    server, _, _ = setup
    provider = server.scrapers_payload()["providers"][0]
    assert provider["platform_options"] == [{"id": "all", "label": "All platforms"}]
    assert provider["type"] == "screenscraper"
    assert not {"password", "developer_password", "api_key"} & provider.keys()


@pytest.mark.parametrize('platform,expected', [('dos','135'), ('windows','138'), ('amiga','64'),
    ('atari-st','42'), ('fm-towns','253'), ('macintosh','146'), ('unknown','')])
def test_scummvm_current_system_uses_registration_platform(setup, platform, expected):
    server, game, provider = setup
    game.type, game.platform = 'ScummVM', platform
    assert server.screenscraper_system_id(game, provider) == expected
    assert server.screenscraper_system_id(game, {**provider, '_search_platform':'all'}) == ''


def test_edited_title_ranks_against_the_new_query(setup):
    server, game, _ = setup
    game.title = 'Space Quest III: The Pirates of Pestulon'
    assert server.screenscraper_confidence(game, {'title':'Pirates!'}, 'Pirates') >= 75
    assert server.screenscraper_confidence(game, {'title':game.title}, 'Pirates') < 75


@pytest.mark.parametrize("kind,expected", [("Game", "76"), ("Atari ST", "42"), ("ScummVM", "135")])
def test_title_search_correct_system_and_multiple_ranked_matches(setup, monkeypatch, kind, expected):
    server, game, provider = setup
    game.type = kind
    if kind == 'ScummVM':
        game.platform = 'dos'
    original = deepcopy(game)
    requests = []

    def respond(request, timeout):
        requests.append(request.full_url)
        return io.BytesIO(json.dumps({"response": {"jeux": [row("2", "Jetpac II", expected),
            row(system=expected), row("3", "Jetpac", "1")]}}).encode())

    monkeypatch.setattr(server, "screenscraper_open", respond)
    result = server.scrape_preview(game.id, "screenscraper")
    assert result["ok"], result
    url = urlsplit(requests[0])
    query = parse_qs(url.query)
    assert url.path == "/api2/jeuRecherche.php"
    assert query["systemeid"] == [expected] and query["recherche"] == [game.title]
    assert not {"romnom", "romtaille", "romtype"} & query.keys()
    assert query["devpassword"] == [provider["developer_password"]]
    assert [match["match_id"] for match in result["matches"]] == ["45280", "2"]
    assert result["matches"][0]["candidate"]["players"] == "1-2"
    assert result["query"]["search_term"] == game.title
    assert provider["system_id"] == "135" and game == original
    serialized = json.dumps(result)
    assert "fixture-password" not in serialized and "fixture-dev-secret" not in serialized
    assert "neoclone" not in serialized


def test_artwork_uses_exact_types_and_preferred_region(setup):
    server, _, provider = setup
    assets = server.screenscraper_assets(row(), provider)
    assert assets == {"screenshot": "scraper-artwork/screenscraper/76/45280/ss/wor",
                      "loading_screen": "scraper-artwork/screenscraper/76/45280/box-2D/wor"}
    assert validate_values(assets) == assets
    data = row()
    data["medias"] = [data["medias"][0]]
    assert server.screenscraper_assets(data, provider)["screenshot"] == ""
    assert server.screenscraper_assets(data, provider)["loading_screen"].endswith("/sstitle/wor")


def test_native_artwork_request_and_metadata_survive_reload(setup, monkeypatch):
    server, game, _ = setup
    reference = server.screenscraper_assets(row(), {})["screenshot"]
    png = b"\x89PNG\r\n\x1a\nfixture"
    requests = []

    def respond(request, timeout):
        requests.append(request.full_url)
        response = io.BytesIO(png)
        response.headers = {"Content-Type": "image/png; charset=binary"}
        return response

    monkeypatch.setattr(server, "screenscraper_open", respond)
    asset = server.read_arcade_asset(reference, 1024)
    assert base64.b64decode(asset["dataUrl"].split(",")[1]) == png
    query = parse_qs(urlsplit(requests[0]).query)
    assert urlsplit(requests[0]).hostname == "api.screenscraper.fr"
    assert query["jeuid"] == ["45280"] and query["media"] == ["ss(wor)"]
    assert query["sspassword"] == ["fixture-password"] and query["outputformat"] == ["png"]
    assert server.apply_scrape_metadata(game.id, {"publisher": "Ultimate"}, remote_assets={"screenshot": reference})["ok"]
    server.LIBRARY = None
    assert server.get_library().get_game(game.id).screenshot == reference
    assert server.read_arcade_asset(reference, 1024) == asset
    assert len(requests) == 1, 'A second read uses the persistent native cache'
    assert "fixture-password" not in server.METADATA_FILE.read_text()
    monkeypatch.setattr(server, "OPTIONAL_NETWORK_ALLOWED", lambda: False)
    assert server.read_arcade_asset(reference, 1024) == asset
    with pytest.raises(ValueError, match="Optional network"):
        server.read_arcade_asset(reference.replace("45280", "45281"), 1024)
    assert len(requests) == 1


@pytest.mark.parametrize("suffix", ["76/45280/ss/wor?url=evil", "76/../ss/wor", "76/1/video/wor",
                                    "76/1/ss/wor/extra", "76/1/ss/%2e%2e", "0/1/ss/wor"])
def test_invalid_references_never_fetch(setup, monkeypatch, suffix):
    server, _, _ = setup
    monkeypatch.setattr(server, "screenscraper_open", lambda *_a, **_k: pytest.fail("must not fetch"))
    value = "scraper-artwork/screenscraper/" + suffix
    assert not artwork_parts(value)
    with pytest.raises(ValueError):
        server.read_arcade_asset(value)
    with pytest.raises(ValueError):
        validate_values({"screenshot": value})


@pytest.mark.parametrize("code", [401, 403, 429, 430, 431, 503])
def test_api_errors_do_not_leak_credentials_or_retry(setup, monkeypatch, code):
    server, game, _ = setup
    requests = []

    def respond(request, timeout):
        requests.append(request)
        raise HTTPError(request.full_url, code, "fixture-password", {}, io.BytesIO(b"fixture-dev-secret"))

    monkeypatch.setattr(server, "screenscraper_open", respond)
    result = server.scrape_preview(game.id, "screenscraper")
    assert not result["ok"] and str(code) in result["error"]
    assert "fixture" not in json.dumps(result) and len(requests) == 1


@pytest.mark.parametrize("body", [b"Error: fixture-password", b"[]", b'{"response":null}', b"x" * (4*1024*1024+1)],
                         ids=["plaintext", "array", "null-response", "oversized"])
def test_invalid_and_oversized_responses_are_sanitized(setup, monkeypatch, body):
    server, game, _ = setup
    monkeypatch.setattr(server, "screenscraper_open", lambda *_a, **_k: io.BytesIO(body))
    result = server.scrape_preview(game.id, "screenscraper")
    assert not result["ok"] and "fixture-password" not in json.dumps(result)


def test_connection_error_sanitized(setup, monkeypatch):
    server, game, _ = setup
    def fail(*_a, **_k):
        raise URLError("fixture-password")
    monkeypatch.setattr(server, "screenscraper_open", fail)
    assert "fixture-password" not in json.dumps(server.scrape_preview(game.id, "screenscraper"))


@pytest.mark.parametrize("body,content_type,limit", [(b"NOMEDIA", "text/plain", 100),
    (b"<html>error</html>", "image/png", 100), (b"\x89PNG\r\n\x1a\n" + b"x" * 100, "image/png", 100)])
def test_native_artwork_rejects_non_images_and_oversize(setup, monkeypatch, body, content_type, limit):
    server, _, _ = setup
    def respond(*_a, **_k):
        response = io.BytesIO(body)
        response.headers = {"Content-Type": content_type}
        return response
    monkeypatch.setattr(server, "screenscraper_open", respond)
    with pytest.raises(ValueError):
        server.read_arcade_asset("scraper-artwork/screenscraper/76/45280/ss/wor", limit)


def test_no_match_allows_one_simplified_title_retry(setup, monkeypatch):
    server, game, _ = setup
    game.title = "Jetpac v1.0"
    queries = []
    def respond(request, timeout):
        queries.append(parse_qs(urlsplit(request.full_url).query)["recherche"][0])
        if len(queries) == 1:
            raise HTTPError(request.full_url, 404, "not found", {}, io.BytesIO())
        return io.BytesIO(json.dumps({"response": {"jeux": [row()]}}).encode())
    monkeypatch.setattr(server, "screenscraper_open", respond)
    result = server.scrape_preview(game.id, "screenscraper")
    assert result["ok"] and result["matches"]
    assert queries == ["Jetpac v1.0", "Jetpac"]
    assert result["query"]["search_term"] == "Jetpac"


def test_credential_redirects_are_checked_before_following():
    handler = ScreenScraperRedirectHandler()
    request = Request("https://api.screenscraper.fr/api2/mediaJeu.php?sspassword=fixture-password")
    for url in ["https://evil.test/image", "http://api.screenscraper.fr/image",
                "https://api.screenscraper.fr:444/image", "https://user@api.screenscraper.fr/image"]:
        with pytest.raises(ValueError, match="unsupported origin"):
            handler.redirect_request(request, None, 302, "", {}, url)
    assert handler.redirect_request(request, None, 302, "", {}, "https://neoclone.screenscraper.fr/api2/mediaJeu.php")


def test_configuration_requires_approved_developer_credentials():
    server = load_server()
    user = {"type": "screenscraper", "username": "fixture", "password": "fixture"}
    assert not server.scraper_configured(user)
    assert server.scraper_configured({**user, "developer_id": "fixture", "developer_password": "fixture"})


def test_provider_quotas_stop_bulk_requests_without_sleeping():
    now = [100]
    quota = RequestQuota(clock=lambda: now[0])
    quota.update({"maxrequestspermin": "2"})
    quota.before_request()
    quota.before_request()
    with pytest.raises(ValueError, match="minute quota"):
        quota.before_request()
    now[0] += 61
    quota.before_request()
    quota.update({"requestskotoday": "10", "maxrequestskoperday": "10"})
    with pytest.raises(ValueError, match="daily quota"):
        quota.before_request()
    now[0] += 3601
    quota.before_request()
    quota.failed(429)
    with pytest.raises(ValueError, match="request limit"):
        quota.before_request()


@pytest.mark.parametrize("scope,expected", [("current", "76"), ("amiga", "64"), ("dos", "135"), ("all", None)])
def test_explicit_platform_filters_and_all_platform_results(setup, monkeypatch, scope, expected):
    server, game, provider = setup
    before = deepcopy(game)
    queries = []
    def respond(request, timeout):
        queries.append(parse_qs(urlsplit(request.full_url).query))
        assert timeout == (20 if expected else 60)
        rows = [row(str(i + 1), "Jetpac", expected or ("64" if i % 2 else "42")) for i in range(30)]
        return io.BytesIO(json.dumps({"response": {"jeux": rows}}).encode())
    monkeypatch.setattr(server, "screenscraper_open", respond)
    result = server.dispatch_arcade_api("POST", "/api/scrape-preview", data={
        "game_id": game.id, "provider": "screenscraper", "search_platform": scope})
    assert result["ok"], result
    assert queries[0].get("systemeid") == ([expected] if expected else None)
    assert len(result["matches"]) == 30 and result["warnings"]
    assert result["query"]["search_platform"] == scope
    assert game == before and "_search_platform" not in provider
    assert all(match["candidate"]["platform"] for match in result["matches"])


@pytest.mark.parametrize("scope", [None, [], {}, 64, "64", "bad", "x" * 500])
def test_invalid_platform_cannot_issue_request(setup, monkeypatch, scope):
    server, game, _ = setup
    monkeypatch.setattr(server, "screenscraper_open", lambda *_a, **_k: pytest.fail("must not fetch"))
    assert not server.scrape_preview(game.id, "screenscraper", search_platform=scope)["ok"]


def test_scrape_cannot_replace_native_platform(setup):
    server, game, _ = setup
    original = (game.platform, game.system, game.path, game.id)
    result = server.apply_scrape_metadata(game.id, {"publisher": "Borrowed", "platform": "Amiga", "system": "Amiga"})
    assert result["ok"]
    updated = server.get_library().get_game(game.id)
    assert (updated.platform, updated.system, updated.path, updated.id) == original
    assert "platform" not in result["changes"]


def test_cartridge_hash_identification_and_edited_term_fallback(setup, monkeypatch):
    import hashlib
    server,game,provider=setup
    rom=server.COLLECTION/'fixture.gb';rom.write_bytes(b'cartridge fixture')
    game.type='Game Boy';game.system='GB';game.platform='game-boy';game.path=str(rom)
    provider={**provider,'_collection_root':str(server.COLLECTION)}
    identified=row(title='Canonical cartridge title',system='9')
    identified['rom']={'romsha1':hashlib.sha1(rom.read_bytes()).hexdigest()}
    requests=[]
    def api(provider,endpoint,query,limit):
        requests.append((endpoint,query));return json.dumps({'response':{'jeu':identified}}).encode(),'application/json'
    monkeypatch.setattr(server,'screenscraper_api_request',api)
    monkeypatch.setattr(server,'screenscraper_request',lambda *a:{'response':{'jeux':[]}})
    result=server.screenscraper_scrape_preview(game,provider)
    assert requests[0][0]=='jeuInfos.php' and requests[0][1]['romtype']=='rom'
    assert result['matches'][0]['identity']=='rom-sha1' and result['matches'][0]['confidence']==100
    requests.clear()
    assert server.screenscraper_scrape_preview(game,{**provider,'_search_term':'Other title'})['matches']==[]
    assert requests==[]
