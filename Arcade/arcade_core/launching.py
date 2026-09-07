"""Transport-independent game launching and Windows emulator adapters."""

from __future__ import annotations

import ctypes
import os
import subprocess
import time
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from arcade_core.emulators import normalize_template, normalize_extensions
from arcade_core.persistence import atomic_copy_file


@dataclass(frozen=True)
class EmulatorLaunchAdapter:
    """Describe the native launch behaviour of one emulator family."""

    adapter_id: str
    launched_process_names: frozenset[str] = frozenset()
    running_process_names: frozenset[str] = frozenset()
    supports_current: bool = False
    supports_new: bool = False
    current_uses_spectaculator_stub: bool = False


class EightyOneLaunchAdapter(EmulatorLaunchAdapter):
    def __init__(self) -> None:
        super().__init__(
            adapter_id="eightyone",
            launched_process_names=frozenset({"eightyone-desasteron.exe", "eightyone.exe"}),
            running_process_names=frozenset({"eightyone-desasteron.exe", "eightyone.exe"}),
            supports_new=True,
        )


class SpectaculatorLaunchAdapter(EmulatorLaunchAdapter):
    def __init__(self, *, helper: bool = False, windows_default: bool = False) -> None:
        super().__init__(
            adapter_id="default" if windows_default else ("spectaculator_stub" if helper else "spectaculator"),
            launched_process_names=frozenset({"spectaculator.exe", "specstub.exe"}),
            running_process_names=frozenset({"spectaculator.exe"}),
            supports_current=True,
            supports_new=not helper and not windows_default,
            current_uses_spectaculator_stub=True,
        )


class GenericLaunchAdapter(EmulatorLaunchAdapter):
    def __init__(self, adapter_id: str = "generic") -> None:
        super().__init__(adapter_id=adapter_id)


_ADAPTERS: dict[str, EmulatorLaunchAdapter] = {
    "eightyone": EightyOneLaunchAdapter(),
    "spectaculator": SpectaculatorLaunchAdapter(),
    "spectaculator_stub": SpectaculatorLaunchAdapter(helper=True),
    "default": SpectaculatorLaunchAdapter(windows_default=True),
}


def emulator_adapter(emulator_id: str, emulator: dict[str, object] | None = None) -> EmulatorLaunchAdapter:
    """Resolve a built-in adapter by configured ID, then by immutable type."""

    configured_type = str((emulator or {}).get("type") or "").strip().lower()
    return _ADAPTERS.get(emulator_id) or _ADAPTERS.get(configured_type) or GenericLaunchAdapter(configured_type or emulator_id)


def render_arguments(
    template: object,
    *,
    game: object | None = None,
    file_path: Path | None = None,
    collection_root: Path | None = None,
    pok_file: Path | None = None,
) -> list[str]:
    """Render a validated argument vector without invoking a shell."""

    arguments = normalize_template(template, "arguments")
    target = file_path or pok_file
    values = {
        "file": str(file_path or ""),
        "file_dir": str(target.parent if target else ""),
        "file_name": target.name if target else "",
        "collection_root": str(collection_root or ""),
        "pok_file": str(pok_file or ""),
        "system": str(getattr(game, "system", "") or ""),
        "title": str(getattr(game, "title", "") or ""),
    }
    return [replace_placeholders(argument, values) for argument in arguments]


def replace_placeholders(argument: str, values: dict[str, str]) -> str:
    for name, value in values.items():
        argument = argument.replace(f"{{{name}}}", value)
    return argument


def prepare_eightyone_profile(
    emulator: dict[str, object],
    game: object,
    profile_id: str,
    *,
    expand_path: Callable[[object], Path | None],
    select_profile: Callable[[str, object, str], dict[str, object] | None],
) -> None:
    """Copy the selected managed EightyOne profile to its live target."""

    if emulator_adapter("", emulator).adapter_id != "eightyone":
        return
    pinned = profile_id or str(getattr(game, "emulator_profile", "") or "")
    managed_profile = select_profile(str(emulator.get("id") or "eightyone"), game, pinned)
    if pinned and not managed_profile:
        raise FileNotFoundError(f"The selected managed EightyOne profile is unavailable: {pinned}")
    if not managed_profile:
        return
    target = expand_path(emulator.get("eightyone_config_target"))
    if not target:
        raise FileNotFoundError("The EightyOne profile destination is not configured")
    source = expand_path(managed_profile.get("managed_path"))
    if not source or not source.exists():
        raise FileNotFoundError(f"Missing managed EightyOne profile: {managed_profile.get('name')}")
    target.parent.mkdir(parents=True, exist_ok=True)
    atomic_copy_file(source, target)


class GameLaunchService:
    """Launch games through configured adapters without depending on HTTP."""

    def __init__(
        self,
        *,
        get_game: Callable[[str], object | None],
        get_pok: Callable[[str], dict[str, object] | None],
        emulator_provider: Callable[[], dict[str, dict[str, object]]],
        expand_path: Callable[[object], Path | None],
        prepare_profile: Callable[[dict[str, object], object, str], None],
        mark_recent: Callable[[str], None],
        launch_process: Callable[[list[str], Path], object],
        open_default: Callable[[str], None],
        find_running_window: Callable[[str], int],
        focus_emulator: Callable[[str, object | None], None],
        bring_to_front: Callable[[int], None],
        collection_root: Callable[[], Path] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        check_immediate_exit: Callable[[Path], bool] | None = None,
    ) -> None:
        self._get_game = get_game
        self._get_pok = get_pok
        self._emulator_provider = emulator_provider
        self._expand_path = expand_path
        self._prepare_profile = prepare_profile
        self._mark_recent = mark_recent
        self._launch_process = launch_process
        self._open_default = open_default
        self._find_running_window = find_running_window
        self._focus_emulator = focus_emulator
        self._bring_to_front = bring_to_front
        self._collection_root = collection_root or (lambda: Path(""))
        self._sleep = sleep
        self._check_immediate_exit = check_immediate_exit or should_check_immediate_exit

    def _emulator(self, emulator_id: str) -> dict[str, object]:
        emulators = self._emulator_provider()
        if emulator_id not in emulators:
            raise KeyError(f"Unknown emulator: {emulator_id}")
        return emulators[emulator_id]

    def running_choice(self, emulator_id: str) -> dict[str, object]:
        emulator = self._emulator(emulator_id)
        adapter = emulator_adapter(emulator_id, emulator)
        name = str(emulator.get("name") or emulator_id)
        return {
            "ok": False,
            "needs_choice": True,
            "emulator": emulator_id,
            "emulator_name": name,
            "supports_current": adapter.supports_current,
            "supports_new": adapter.supports_new,
            "error": f"{name} is already running.",
        }

    def send_to_running_spectaculator(self, path: Path, game_id: str, running_hwnd: int) -> dict[str, object]:
        spec_stub = self._expand_path(self._emulator_provider()["spectaculator_stub"].get("path"))
        if spec_stub is None or not spec_stub.exists():
            self._bring_to_front(running_hwnd)
            return {
                "ok": False,
                "needs_confirmation": True,
                "error": "Spectaculator is already running, but SpecStub.exe is missing. Start a second copy?",
            }
        stub = self._emulator_provider()["spectaculator_stub"]
        arguments = render_arguments(
            stub.get("arguments", ["{file}"]), game=self._get_game(game_id), file_path=path,
            collection_root=self._collection_root(),
        )
        process = self._launch_process([str(spec_stub), *arguments], spec_stub.parent)
        self._mark_recent(game_id)
        self._focus_emulator("spectaculator_stub", process)
        return {"ok": True, "pid": process.pid, "reused": True}

    def launch_game(
        self,
        game_id: str,
        emulator_id: str,
        launch_action: str = "",
        force_new: bool = False,
        profile_id: str = "",
    ) -> dict[str, object]:
        game = self._get_game(game_id)
        if not game:
            return {"ok": False, "error": "Unknown game"}
        path = Path(str(getattr(game, "path", "")))
        if not path.exists():
            return {"ok": False, "error": f"Missing game file: {path}"}

        try:
            emulator = self._emulator(emulator_id)
            if emulator.get("type") == "scummvm":
                return {"ok": False, "error": "Select a registered ScummVM collection target"}
            extensions = normalize_extensions(emulator.get("supported_extensions", []))
            if extensions and path.suffix.lower() not in extensions:
                return {"ok": False, "error": "The selected emulator does not support this game file format"}
            adapter = emulator_adapter(emulator_id, emulator)
            emulator_path = self._expand_path(emulator.get("path"))
            if force_new:
                launch_action = "new"
            running_hwnd = self._find_running_window(emulator_id)
            if running_hwnd:
                if launch_action == "current" and adapter.current_uses_spectaculator_stub:
                    return self.send_to_running_spectaculator(path, game_id, running_hwnd)
                if launch_action == "current":
                    return {"ok": False, "error": "This emulator cannot accept a game in the running instance."}
                if launch_action != "new":
                    return self.running_choice(emulator_id)

            process = None
            if emulator_path is None:
                self._open_default(str(path))
            else:
                if not emulator_path.exists():
                    return {"ok": False, "error": f"Missing emulator: {emulator_path}"}
                self._prepare_profile({**emulator, "id": emulator_id}, game, profile_id)
                working_dir = self._expand_path(emulator.get("working_dir")) or emulator_path.parent
                arguments = render_arguments(
                    emulator.get("arguments", ["{file}"]), game=game, file_path=path,
                    collection_root=self._collection_root(),
                )
                process = self._launch_process([str(emulator_path), *arguments], working_dir)
            self._mark_recent(game_id)
            payload: dict[str, object] = {"ok": True}
            if process is not None:
                payload["pid"] = process.pid
                self._sleep(0.4)
                if self._check_immediate_exit(emulator_path) and process.poll() is not None:
                    return {"ok": False, "error": f"Emulator exited immediately with code {process.returncode}"}
            self._focus_emulator(emulator_id, process)
            return payload
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def open_pok(self, pok_id: str) -> dict[str, object]:
        pok = self._get_pok(pok_id)
        if not pok:
            return {"ok": False, "error": "Unknown POK"}
        path = Path(str(pok.get("path", "")))
        if not path.exists():
            return {"ok": False, "error": f"Missing POK file: {path}"}
        emulators = self._emulator_provider()
        spectaculator = emulators.get("spectaculator", {})
        stub_config = emulators.get("spectaculator_stub", {})
        spec_stub = self._expand_path(stub_config.get("path"))
        if spec_stub is None or not spec_stub.exists():
            return {"ok": False, "error": f"Missing Spectaculator helper: {spec_stub}"}
        try:
            arguments = render_arguments(
                spectaculator.get("pok_arguments", ["{pok_file}"]), pok_file=path,
                collection_root=self._collection_root(),
            )
            process = self._launch_process([str(spec_stub), *arguments], spec_stub.parent)
            self._focus_emulator("spectaculator_stub", process)
            return {"ok": True, "pid": process.pid, "path": str(path)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}


def launch_visible(command: list[str], cwd: Path) -> subprocess.Popen:
    """Start a visible child process with an argument array and no shell."""

    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 1
    return subprocess.Popen(command, cwd=str(cwd), startupinfo=startupinfo, close_fds=True, shell=False)


def should_check_immediate_exit(emulator_path: Path) -> bool:
    return emulator_path.name.lower() != "specstub.exe"


def focus_launched_emulator(emulator_id: str, process: object | None) -> None:
    if os.name != "nt":
        return
    adapter = emulator_adapter(emulator_id)
    process_ids = {int(process.pid)} if process is not None else set()
    for _ in range(12):
        time.sleep(0.25)
        hwnd = find_window_for_process(process_ids, set(adapter.launched_process_names))
        if hwnd:
            bring_window_to_front(hwnd)
            return


def find_running_emulator_window(emulator_id: str) -> int:
    if os.name != "nt":
        return 0
    return find_window_for_process(set(), set(emulator_adapter(emulator_id).running_process_names))


def find_window_for_process(process_ids: set[int], process_names: set[str]) -> int:
    user32 = ctypes.windll.user32
    user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    matches: list[int] = []

    def callback(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        pid = get_window_process_id(hwnd)
        process_name = get_process_image_name(pid.value).lower()
        if pid.value in process_ids or process_name in process_names:
            matches.append(hwnd)
        return True

    enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(callback)
    user32.EnumWindows(enum_proc, 0)
    return matches[-1] if matches else 0


def get_window_process_id(hwnd: int) -> wintypes.DWORD:
    user32 = ctypes.windll.user32
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid


def get_process_image_name(pid: int) -> str:
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    process_query_limited_information = 0x1000
    handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
    if not handle:
        return ""
    try:
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return Path(buffer.value).name
        return ""
    finally:
        kernel32.CloseHandle(handle)


def bring_window_to_front(hwnd: int) -> None:
    user32 = ctypes.windll.user32
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.ShowWindow.restype = wintypes.BOOL
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.restype = wintypes.BOOL
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.SetActiveWindow.argtypes = [wintypes.HWND]
    user32.SetActiveWindow.restype = wintypes.HWND
    user32.SetFocus.argtypes = [wintypes.HWND]
    user32.SetFocus.restype = wintypes.HWND
    user32.GetForegroundWindow.argtypes = []
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    user32.AttachThreadInput.restype = wintypes.BOOL
    user32.ShowWindowAsync.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.ShowWindowAsync.restype = wintypes.BOOL
    user32.SwitchToThisWindow.argtypes = [wintypes.HWND, wintypes.BOOL]
    user32.SwitchToThisWindow.restype = None
    user32.SetWindowPos.argtypes = [
        wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL
    user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, wintypes.ULONG]
    user32.keybd_event.restype = None
    kernel32 = ctypes.windll.kernel32
    kernel32.GetCurrentThreadId.argtypes = []
    kernel32.GetCurrentThreadId.restype = wintypes.DWORD

    sw_restore = 9
    hwnd_topmost = wintypes.HWND(-1)
    hwnd_notopmost = wintypes.HWND(-2)
    swp_nomove = 0x0002
    swp_nosize = 0x0001
    swp_showwindow = 0x0040
    vk_menu = 0x12
    keyeventf_keyup = 0x0002
    try:
        user32.AllowSetForegroundWindow(-1)
    except Exception:
        pass
    foreground = user32.GetForegroundWindow()
    current_thread = kernel32.GetCurrentThreadId()
    target_thread = user32.GetWindowThreadProcessId(hwnd, None)
    foreground_thread = user32.GetWindowThreadProcessId(foreground, None) if foreground else 0
    attached_target = bool(target_thread and user32.AttachThreadInput(current_thread, target_thread, True))
    attached_foreground = bool(foreground_thread and user32.AttachThreadInput(current_thread, foreground_thread, True))
    try:
        user32.keybd_event(vk_menu, 0, 0, 0)
        user32.keybd_event(vk_menu, 0, keyeventf_keyup, 0)
        user32.ShowWindowAsync(hwnd, sw_restore)
        user32.ShowWindow(hwnd, sw_restore)
        user32.SetWindowPos(hwnd, hwnd_topmost, 0, 0, 0, 0, swp_nomove | swp_nosize | swp_showwindow)
        user32.SetWindowPos(hwnd, hwnd_notopmost, 0, 0, 0, 0, swp_nomove | swp_nosize | swp_showwindow)
        user32.BringWindowToTop(hwnd)
        user32.SetActiveWindow(hwnd)
        user32.SetFocus(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.SwitchToThisWindow(hwnd, True)
    finally:
        if attached_foreground:
            user32.AttachThreadInput(current_thread, foreground_thread, False)
        if attached_target:
            user32.AttachThreadInput(current_thread, target_thread, False)
