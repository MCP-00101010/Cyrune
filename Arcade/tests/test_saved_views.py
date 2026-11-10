from pathlib import Path
import subprocess


def test_saved_views_in_node():
    result = subprocess.run(
        ['node', '--test', str(Path(__file__).with_name('saved_views.cjs'))],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
