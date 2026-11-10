from pathlib import Path
import subprocess


def test_navigation_order_preferences():
    result = subprocess.run(
        ['node', '--test', str(Path(__file__).with_name('navigation_order.cjs'))],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
