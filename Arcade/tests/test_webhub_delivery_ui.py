from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_emugui_page_declares_the_extension_boundary():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert '<meta name="morpheus-emugui" content="1">' in html


def test_arcade_consumes_only_its_fixed_shared_settings_profile():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert html.index("../../Nexus/client/component-settings.js") < html.index('src="app.js"')
    assert 'component: "arcade"' in source
    assert 'requestWebHub("MW_EMUGUI_GET_CYRUNE_SETTINGS")' in source
    assert '"cyrune:settings-revision"' in source
    assert "allowPreciseLocation" not in source


def test_selected_game_can_be_sent_without_passing_native_paths():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    start = source.index("async function sendSelectedToWebHub")
    end = source.index("\nfunction ", start + 20)
    delivery = source[start:end]
    assert 'requestWebHub("MW_EMUGUI_SEND_GAME"' in delivery
    assert "gameId: game.id" in delivery
    assert "emulatorId: binding.emulatorId" in delivery
    assert "profileId: binding.profileId" in delivery
    assert "rebindGameKey: webHubHandoff.rebindGameKey" in delivery
    for forbidden in ("game.path", "romPath", "emulatorPath", "command", "arguments"):
        assert forbidden not in delivery


def test_webhub_deep_link_selects_a_game_and_supports_in_place_rebinding():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert 'params.get("game")' in source
    assert 'params.get("hubRebind")' in source
    assert "await selectGame(webHubHandoff.gameId)" in source
    assert "Update Portal Shortcut" in source


def test_file_page_uses_only_the_extension_rpc_transport():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert 'requestWebHub("MW_EMUGUI_RPC"' in source
    assert 'requestWebHub("MW_EMUGUI_ASSET"' in source
    assert "payload.ok === false && payload.cancelled !== true" in source
    assert 'payload.path === "/api/pick-path" ? 305000 : 125000' in source
    assert "usesExtensionTransport" not in source
    assert "fetch(path" not in source


def test_local_and_remote_artwork_use_the_authenticated_extension_asset_transport():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    start = source.index("async function prepareArtworkAssets")
    end = source.index("\nfunction ", start + 20)
    artwork = source[start:end]
    assert 'requestWebHub("MW_EMUGUI_ASSET"' in artwork
    assert "!/^https?:\\/\\//i.test(value)" not in artwork
    assert "extensionAssetCache.set(value" in artwork


def test_arcade_launch_uses_the_shared_emulator_and_profile_binding():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    start = source.index("async function launchGame")
    end = source.index("\nfunction ", start + 20)
    launch = source[start:end]
    assert "resolveLaunchBinding(state.selected, emulator)" in launch
    assert "emulator: binding.emulatorId" in launch
    assert "profile_id: binding.profileId" in launch
    assert "state.profiles" not in source
    assert "runLaunchChoice(choice, emulator)" in source
