"""Windows Explorer presentation for an already resolved native game target.

Use the same direct Explorer startup as Portal's Reveal game file action.
"""

import ctypes
import os
import subprocess
from ctypes import wintypes
from pathlib import Path


# Fixed native helper: the target is data in the child environment, never script text.
# ShellFolderView.SelectItem flags 1|4|8|16 select, clear other selections,
# ensure visibility and focus, without changing Explorer's sort order.
_ENSURE_VISIBLE = r'''
$ErrorActionPreference = 'Stop'
$target = $env:CYRUNE_EXPLORER_TARGET
$directory = $env:CYRUNE_EXPLORER_DIRECTORY -eq '1'
$parent = if ($directory) { $target } else { [IO.Path]::GetDirectoryName($target) }
$name = [IO.Path]::GetFileName($target)
$shell = New-Object -ComObject Shell.Application
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    foreach ($window in @($shell.Windows())) {
        try {
            if ($window.Document.Folder.Self.Path -eq $parent) {
                if (-not $directory) {
                    $item = $window.Document.Folder.ParseName($name)
                    if ($null -eq $item) { continue }
                    $window.Document.SelectItem($item, 29)
                }
                Write-Output ([long]$window.HWND)
                exit 0
            }
        } catch { }
    }
    Start-Sleep -Milliseconds 150
}
exit 1
'''


def ensure_visible(target, *, directory=False):
    environment = dict(os.environ, CYRUNE_EXPLORER_TARGET=str(target),
                       CYRUNE_EXPLORER_DIRECTORY='1' if directory else '0')
    powershell = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    result = subprocess.run([str(powershell), '-NoProfile', '-NonInteractive', '-Command', _ENSURE_VISIBLE],
                            env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, text=True,
                            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=8)
    handle = (result.stdout or '').strip()
    if result.returncode or not handle.isascii() or not handle.isdecimal() or len(handle) > 20:
        raise OSError('Explorer opened the folder but could not bring the selected game into view')
    window = int(handle)
    if not 0 < window < 2 ** (ctypes.sizeof(ctypes.c_void_p) * 8):
        raise OSError('Windows could not resolve the Explorer window')
    user = ctypes.WinDLL('user32', use_last_error=True)
    user.IsIconic.argtypes = [wintypes.HWND]
    user.IsIconic.restype = wintypes.BOOL
    user.ShowWindowAsync.argtypes = [wintypes.HWND, ctypes.c_int]
    user.ShowWindowAsync.restype = wintypes.BOOL
    user.SetForegroundWindow.argtypes = [wintypes.HWND]
    user.SetForegroundWindow.restype = wintypes.BOOL
    # Restore minimized windows; showing an already maximized window keeps its size.
    # SelectItem focuses the file, but does not restore the containing window.
    if not user.ShowWindowAsync(window, 9 if user.IsIconic(window) else 5):
        raise OSError('Windows could not show the Explorer window')
    # Windows can decline foreground focus if the user has switched applications.
    user.SetForegroundWindow(window)


def reveal_game(path):
    target = Path(path).resolve(strict=True)
    directory = target.is_dir()
    # Launch Explorer itself, as Portal does. Shell API selection alone may open
    # a passive window from the native host. Keep /select, separate so spaces and
    # commas in the path are quoted as data rather than part of the switch.
    subprocess.Popen(['explorer.exe', str(target)] if directory
                     else ['explorer.exe', '/select,', str(target)])
    ensure_visible(target, directory=directory)
