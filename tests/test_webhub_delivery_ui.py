from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_emugui_page_declares_the_extension_boundary():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert '<meta name="morpheus-emugui" content="1">' in html


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
    assert "Update WebHub Shortcut" in source


def test_file_page_uses_one_extension_rpc_transport_with_http_fallback():
    source = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert 'window.location.protocol === "file:"' in source
    assert 'requestWebHub("MW_EMUGUI_RPC"' in source
    assert 'requestWebHub("MW_EMUGUI_ASSET"' in source
    assert "if (usesExtensionTransport)" in source
    assert "payload.ok === false && payload.cancelled !== true" in source
    assert 'payload.path === "/api/pick-path" ? 305000 : 125000' in source
    assert "const response = await fetch(path" in source
