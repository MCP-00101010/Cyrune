"""Portal-owned theme projection across the authenticated Relay/Arcade boundary."""
from pathlib import Path
import subprocess


def test_portal_theme_workflow():
    source = Path(__file__).with_name("portal_theme.cjs")
    result = subprocess.run(
        ["node", "--experimental-test-isolation=none", "--test", str(source)],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
