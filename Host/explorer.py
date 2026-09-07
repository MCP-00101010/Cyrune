"""Windows Explorer presentation for an already resolved native game target.

Selection semantics: https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems
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
$parent = [IO.Path]::GetDirectoryName($target)
$name = [IO.Path]::GetFileName($target)
$shell = New-Object -ComObject Shell.Application
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    foreach ($window in @($shell.Windows())) {
        try {
            if ($window.Document.Folder.Self.Path -eq $parent) {
                $item = $window.Document.Folder.ParseName($name)
                if ($null -ne $item) {
                    $window.Document.SelectItem($item, 29)
                    exit 0
                }
            }
        } catch { }
    }
    Start-Sleep -Milliseconds 150
}
exit 1
'''


def ensure_visible(target):
    environment = dict(os.environ, CYRUNE_EXPLORER_TARGET=str(target))
    powershell = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    result = subprocess.run([str(powershell), '-NoProfile', '-NonInteractive', '-Command', _ENSURE_VISIBLE],
                            env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=8)
    if result.returncode:
        raise OSError('Explorer opened the folder but could not bring the selected game into view')


def reveal_game(path):
    target = Path(path).resolve(strict=True)
    shell = ctypes.WinDLL('shell32', use_last_error=True)
    if target.is_dir():
        execute = shell.ShellExecuteW
        execute.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR,
                            wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.c_int]
        execute.restype = ctypes.c_void_p
        if (execute(None, 'open', str(target), None, None, 1) or 0) <= 32:
            raise OSError('Windows could not open the game folder')
        return

    ole = ctypes.WinDLL('ole32', use_last_error=True)
    ole.CoInitializeEx.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    ole.CoInitializeEx.restype = ctypes.c_long
    ole.CoUninitialize.argtypes = []
    ole.CoUninitialize.restype = None
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole.CoTaskMemFree.restype = None
    shell.SHParseDisplayName.argtypes = [wintypes.LPCWSTR, ctypes.c_void_p,
                                       ctypes.POINTER(ctypes.c_void_p), wintypes.DWORD, ctypes.c_void_p]
    shell.SHParseDisplayName.restype = ctypes.c_long
    shell.SHOpenFolderAndSelectItems.argtypes = [ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p, wintypes.DWORD]
    shell.SHOpenFolderAndSelectItems.restype = ctypes.c_long
    initialized = ole.CoInitializeEx(None, 2)
    # A native thread already initialized in MTA can use its existing apartment.
    if initialized < 0 and initialized != -2147417850:  # RPC_E_CHANGED_MODE
        raise OSError('Windows could not initialize Explorer selection')
    item = ctypes.c_void_p()
    try:
        result = shell.SHParseDisplayName(str(target), None, ctypes.byref(item), 0, None)
        if result < 0 or not item.value:
            raise OSError('Windows could not resolve the game in Explorer')
        # With cidl=0, Windows opens the parent and selects this exact item.
        result = shell.SHOpenFolderAndSelectItems(item, 0, None, 0)
        if result < 0:
            raise OSError('Windows could not select the game in Explorer')
    finally:
        if item.value:
            ole.CoTaskMemFree(item)
        if initialized >= 0:
            ole.CoUninitialize()
    ensure_visible(target)
