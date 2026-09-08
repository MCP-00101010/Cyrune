import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_batch_delivery_execution_and_retry_contract():
    result = subprocess.run(["node", "--test", str(Path(__file__).with_name("portal_delivery.cjs"))],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_arcade_status_displays_the_authoritative_component_version():
    manifest = json.loads((ROOT / "component.json").read_text(encoding="utf-8"))
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    match = re.search(r"ARCADE_VERSION\s*=\s*'([^']+)'", source)
    assert match
    assert match.group(1) == manifest["version"]
    assert 'id="arcade-version"' in html
    assert f'v{manifest["version"]}' in html
    assert "Open Arcade settings, version ${ARCADE_VERSION}" in source


def test_metadata_country_and_language_quick_actions_focus_the_existing_editor():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    assert 'data-action="set-country">Set Country</button>' in source
    assert 'data-action="set-language">Set Language</button>' in source
    assert 'action === "set-country" ? "countries" : "languages"' in source
    assert 'function focusMetadataQuickAction(overlay, field, isBulk)' in source
    assert 'apply.checked = true' in source
    assert 'combo.classList.add("open")' in source


def test_game_research_action_uses_only_a_bounded_explicit_https_search():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    start = source.index("function openGameResearchSearch")
    end = source.index("\nasync function ", start + 20)
    research = source[start:end]
    assert 'data-action="research-web">Search the Web</button>' in source
    assert 'new URL("https://duckduckgo.com/")' in research
    assert 'game?.title' in research
    assert 'game?.platform || game?.computer || globalThis.ArcadePlatforms.searchLabel(game)' in research
    assert 'game?.system || game?.memory' in research
    assert '[title, platform, system]' in research
    assert '.slice(0, 160)' in research
    assert 'behaviour?.externalLinks' in research
    for forbidden in ("game?.path", "file_name", "scraper_id", "fetch(", "requestArcadeRpc"):
        assert forbidden not in research


def test_arcade_page_declares_the_extension_boundary_and_legacy_alias():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert '<meta name="cyrune-arcade" content="1">' in html
    assert '<meta name="morpheus-emugui" content="1">' in html
    assert '<link rel="icon" type="image/svg+xml" href="assets/arcade.svg">' in html
    assert (ROOT / "web" / "assets" / "arcade.svg").is_file()


def test_arcade_consumes_only_its_fixed_shared_settings_profile():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    source = (ROOT / "web" / "transport.js").read_text(encoding="utf-8")
    assert html.index("../../Nexus/client/component-settings.js") < html.index('src="app.js?')
    assert html.index('src="transport.js"') < html.index('src="app.js?')
    version = json.loads((ROOT / 'component.json').read_text(encoding='utf-8'))['version']
    assert f'src="app.js?v={version}"' in html
    assert f'href="style.css?v={version}"' in html
    assert 'component: "arcade"' in source
    assert 'request("MW_EMUGUI_GET_CYRUNE_SETTINGS")' in source
    assert '"cyrune:settings-revision"' in source
    assert "allowPreciseLocation" not in source


def test_selected_game_can_be_sent_without_passing_native_paths():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    start = source.index("async function sendSelectedToWebHub")
    end = source.index("\nfunction ", start + 20)
    delivery = source[start:end]
    assert "sendArcadeGame({" in delivery
    assert "gameId: game.id" in delivery
    assert "emulatorId: binding.emulatorId" in delivery
    assert "profileId: binding.profileId" in delivery
    assert "rebindGameKey: webHubHandoff.rebindGameKey" in delivery
    for forbidden in ("game.path", "romPath", "emulatorPath", "command", "arguments"):
        assert forbidden not in delivery


def test_webhub_deep_link_selects_a_game_and_supports_in_place_rebinding():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    assert 'params.get("game")' in source
    assert 'params.get("hubRebind")' in source
    assert "await selectGame(webHubHandoff.gameId)" in source
    assert "Update Portal Shortcut" in source


def test_file_page_uses_only_the_extension_rpc_transport():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    transport = (ROOT / "web" / "transport.js").read_text(encoding="utf-8")
    assert "requestArcadeRpc({" in source
    assert "ArcadeTransport.asset(path, collectionId)" in source
    assert "payload.ok === false && payload.cancelled !== true" in source
    assert 'payload.path === "/api/pick-path" ? 305000 : 125000' in transport
    assert "usesExtensionTransport" not in source
    assert "fetch(path" not in source


def test_local_and_remote_artwork_use_the_authenticated_extension_asset_transport():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    start = source.index("async function prepareArtworkAssets")
    end = source.index("\nfunction ", start + 20)
    artwork = source[start:end]
    assert "extensionAssetCache.prepare" in artwork
    assert "!/^https?:\\/\\//i.test(value)" not in artwork
    assert "ArcadeArtwork.create" in source


def test_arcade_launch_uses_the_shared_emulator_and_profile_binding():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8") + (ROOT / "web" / "scrape-views.js").read_text(encoding="utf-8")
    start = source.index("async function launchGame")
    end = source.index("\nfunction ", start + 20)
    launch = source[start:end]
    assert "resolveLaunchBinding(state.selected, emulator)" in launch
    assert "emulator: binding.emulatorId" in launch
    assert "profile_id: binding.profileId" in launch
    assert "state.profiles" not in source
    assert "runLaunchChoice(choice, emulator)" in source
