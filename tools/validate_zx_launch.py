"""Preflight and optionally run the real ZX Spectrum emulator launch matrix."""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import emugui_service as server  # noqa: E402
from emugui_core.launching import emulator_adapter  # noqa: E402


class ValidationFailure(RuntimeError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationFailure(message)


def _choose_game(games: list[object], memory: str, explicit_id: str = "") -> object:
    if explicit_id:
        match = next((game for game in games if getattr(game, "id", "") == explicit_id), None)
        _require(match is not None, f"Unknown requested {memory} game: {explicit_id}")
        return match
    if memory == "48K":
        match = next(
            (
                game for game in games
                if "48K" in f"{getattr(game, 'memory', '')} {getattr(game, 'system', '')}".upper()
                and "128K" not in f"{getattr(game, 'memory', '')} {getattr(game, 'system', '')}".upper()
            ),
            None,
        )
    else:
        match = next(
            (game for game in games if "128K" in f"{getattr(game, 'memory', '')} {getattr(game, 'system', '')}".upper()),
            None,
        )
    _require(match is not None, f"No {memory} game is available in the active collection")
    return match


def _profile_for_system(profiles: list[dict[str, object]], system: str) -> dict[str, object]:
    normalized = system.upper()
    match = next(
        (
            profile for profile in profiles
            if profile.get("emulator_id") == "eightyone"
            and normalized in {str(value).upper() for value in (profile.get("rule") or {}).get("systems", [])}
        ),
        None,
    )
    _require(match is not None, f"No managed EightyOne profile targets {system}")
    return match


def build_preflight(game_48k_id: str = "", game_128k_id: str = "") -> dict[str, object]:
    library = server.get_library()
    emulators = server.configured_emulators(include_hidden=True)
    profiles = server.emulator_profiles_payload()
    game_48k = _choose_game(library.games, "48K", game_48k_id)
    game_128k = _choose_game(library.games, "128K", game_128k_id)
    profile_48k = _profile_for_system(profiles, "48K")
    profile_128k = _profile_for_system(profiles, "128K")

    checks = []
    for emulator_id in ("eightyone", "spectaculator", "spectaculator_stub"):
        emulator = emulators.get(emulator_id) or {}
        path = server.expand_config_path(emulator.get("path"))
        checks.append({
            "kind": "emulator",
            "id": emulator_id,
            "path": str(path or ""),
            "available": bool(path and path.is_file()),
        })
    for profile in (profile_48k, profile_128k):
        path = server.expand_config_path(profile.get("managed_path"))
        checks.append({
            "kind": "profile",
            "id": profile.get("id"),
            "path": str(path or ""),
            "available": bool(path and path.is_file()),
        })
    for memory, game in (("48K", game_48k), ("128K", game_128k)):
        path = Path(str(getattr(game, "path", "")))
        checks.append({
            "kind": "game",
            "id": getattr(game, "id", ""),
            "title": getattr(game, "title", ""),
            "memory": memory,
            "path": str(path),
            "available": path.is_file(),
        })
    failed = [check for check in checks if not check["available"]]
    _require(not failed, f"Preflight has unavailable resources: {failed}")
    return {
        "ok": True,
        "gameCount": len(library.games),
        "checks": checks,
        "games": {"48K": game_48k, "128K": game_128k},
        "profiles": {"48K": profile_48k, "128K": profile_128k},
        "emulators": emulators,
    }


def _process_is_alive(pid: int) -> bool:
    process_query_limited_information = 0x1000
    still_active = 259
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
    if not handle:
        return False
    try:
        exit_code = wintypes.DWORD()
        return bool(kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))) and exit_code.value == still_active
    finally:
        kernel32.CloseHandle(handle)


def _wait_for_window(pid: int, emulator_id: str, timeout: float = 8.0) -> int:
    names = set(emulator_adapter(emulator_id).launched_process_names)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        hwnd = server.find_window_for_process({pid}, names)
        if hwnd:
            return hwnd
        time.sleep(0.2)
    return 0


def _stop_owned_process(pid: int) -> None:
    if not pid or not _process_is_alive(pid):
        return
    result = subprocess.run(
        ["taskkill.exe", "/PID", str(pid), "/T", "/F"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0 and _process_is_alive(pid):
        raise ValidationFailure(f"Could not close validation process {pid}: {result.stderr.strip() or result.stdout.strip()}")


def _assert_process_result(result: dict[str, object], label: str) -> int:
    _require(result.get("ok") is True, f"{label} failed: {result.get('error', result)}")
    pid = int(result.get("pid") or 0)
    _require(pid > 0, f"{label} did not return a process ID")
    _require(_process_is_alive(pid), f"{label} process {pid} did not survive the native response")
    return pid


def run_live_matrix(preflight: dict[str, object], keep_open: bool = False) -> list[dict[str, object]]:
    _require(os.name == "nt", "The live ZX launch matrix currently requires Windows")
    for emulator_id in ("eightyone", "spectaculator"):
        _require(
            server.find_running_emulator_window(emulator_id) == 0,
            f"{emulator_id} is already running; close it before live validation so existing sessions remain untouched",
        )

    games = preflight["games"]
    profiles = preflight["profiles"]
    emulators = preflight["emulators"]
    target = server.expand_config_path(emulators["eightyone"].get("eightyone_config_target"))
    _require(target is not None, "EightyOne has no live configuration target")
    original_target = target.read_bytes() if target.exists() else None
    owned_pids: list[int] = []
    results: list[dict[str, object]] = []
    try:
        for memory in ("48K", "128K"):
            game = games[memory]
            profile = profiles[memory]
            launch = server.launch_game(
                str(getattr(game, "id", "")),
                "eightyone",
                "new",
                True,
                str(profile.get("id") or ""),
            )
            pid = _assert_process_result(launch, f"EightyOne {memory}")
            owned_pids.append(pid)
            managed_path = server.expand_config_path(profile.get("managed_path"))
            _require(managed_path is not None and target.read_bytes() == managed_path.read_bytes(), f"EightyOne {memory} profile was not copied")
            hwnd = _wait_for_window(pid, "eightyone")
            _require(hwnd != 0, f"EightyOne {memory} did not expose a focusable window")
            results.append({"case": f"eightyone-{memory.lower()}", "ok": True, "pid": pid, "window": hwnd})
            if not keep_open:
                _stop_owned_process(pid)
                owned_pids.remove(pid)
                time.sleep(0.5)

        direct = server.launch_game(str(getattr(games["48K"], "id", "")), "spectaculator", "new", True)
        direct_pid = _assert_process_result(direct, "Spectaculator direct")
        owned_pids.append(direct_pid)
        hwnd = _wait_for_window(direct_pid, "spectaculator")
        _require(hwnd != 0, "Spectaculator direct launch did not expose a focusable window")
        choice = server.launch_game(str(getattr(games["128K"], "id", "")), "spectaculator")
        _require(choice.get("needs_choice") is True, f"Running Spectaculator did not request a launch choice: {choice}")
        _require(choice.get("supports_current") is True and choice.get("supports_new") is True, "Spectaculator choice capabilities are incorrect")
        reused = server.launch_game(str(getattr(games["128K"], "id", "")), "spectaculator", "current")
        _require(reused.get("ok") is True and reused.get("reused") is True, f"SpecStub reuse failed: {reused}")
        _require(_process_is_alive(direct_pid), "SpecStub reuse closed the existing Spectaculator process")
        second = server.launch_game(str(getattr(games["128K"], "id", "")), "spectaculator", "new")
        second_pid = _assert_process_result(second, "Spectaculator new instance")
        owned_pids.append(second_pid)
        results.extend([
            {"case": "spectaculator-direct", "ok": True, "pid": direct_pid, "window": hwnd},
            {"case": "spectaculator-choice", "ok": True},
            {"case": "spectaculator-current-specstub", "ok": True, "pid": int(reused.get("pid") or 0)},
            {"case": "spectaculator-new-instance", "ok": True, "pid": second_pid},
        ])
        return results
    finally:
        if original_target is None:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original_target)
        if not keep_open:
            for pid in reversed(owned_pids):
                _stop_owned_process(pid)


def _public_preflight(preflight: dict[str, object]) -> dict[str, object]:
    return {"ok": preflight["ok"], "gameCount": preflight["gameCount"], "checks": preflight["checks"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Launch the configured emulators and run the real matrix")
    parser.add_argument("--keep-open", action="store_true", help="Leave validation-owned emulator processes running")
    parser.add_argument("--game-48k", default="", help="Use a specific game ID for the 48K case")
    parser.add_argument("--game-128k", default="", help="Use a specific game ID for the 128K case")
    args = parser.parse_args()
    try:
        preflight = build_preflight(args.game_48k, args.game_128k)
        payload = _public_preflight(preflight)
        if args.live:
            payload["live"] = run_live_matrix(preflight, keep_open=args.keep_open)
        print(json.dumps(payload, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
