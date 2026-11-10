from pathlib import Path
import subprocess


def test_context_menu_workflows_in_node():
    result = subprocess.run(
        ['node', '--test', str(Path(__file__).with_name('context_menus.cjs')),
         str(Path(__file__).with_name('ui_foundation.cjs'))],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
