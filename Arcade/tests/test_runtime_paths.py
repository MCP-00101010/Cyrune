from pathlib import Path
from unittest.mock import patch

import emugui_service as service


def test_arcade_runtime_data_defaults_outside_the_checkout(tmp_path):
    local = tmp_path / "LocalAppData"
    with patch.object(service.sys, "platform", "win32"), patch.dict(
        service.os.environ,
        {"LOCALAPPDATA": str(local)},
        clear=True,
    ):
        assert service.default_runtime_data_root() == local / "Cyrune" / "Arcade"


def test_arcade_runtime_data_supports_a_documented_override(tmp_path):
    override = tmp_path / "portable" / "Arcade data"
    with patch.dict(service.os.environ, {"CYRUNE_ARCADE_DATA": str(override)}, clear=True):
        assert service.default_runtime_data_root() == override.resolve()


def test_arcade_runtime_constants_use_the_external_layout():
    assert service.EMULATOR_PROFILE_DIR == service.DATA / "emulator-profiles"
    assert service.STATE_FILE == service.DATA / "state.json"
    assert service.CONFIG_FILE == service.DATA / "config.json"
    assert service.LOG_FILE == service.DATA / "logs" / "launcher.log"
