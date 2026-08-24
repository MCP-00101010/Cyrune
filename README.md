# Morpheus EmuGUI

Small local browser launcher and collection manager for emulator libraries.

## Run

With Morpheus WebHub extension 1.0.50 or newer installed and its native host configured for this EmuGUI checkout, open:

```text
web/index.html
```

The normal EmuGUI interface remains in this repository. When opened as a local file, it sends its existing API calls through an authenticated WebHub extension session and the persistent native host, so no launcher console or manually started HTTP server is required. WebHub's **Open in EmuGUI** action opens this page and selects the source game automatically.

Firefox/Zen must allow the Morpheus WebHub extension to access local files. The extension authorises only this checkout's configured `web/index.html`, not arbitrary file pages.

For standalone frontend development, the HTTP adapter remains available. Double-click `Start Morpheus EmuGUI.bat`, keep its console open, and browse to:

```text
http://127.0.0.1:8765
```

To stop the optional development server, close the console window or press `Ctrl+C` in it.
If an old server process is still running, run:

```text
Stop Morpheus EmuGUI.bat
```

Or run manually:

```powershell
python server.py --no-browser
```

## Shape

- `server.py` provides thin compatibility functions, platform-specific filesystem/network adapters, and the optional development HTTP adapter.
- `emugui_core/library.py`, `collections.py`, and `collection_loading.py` own the in-memory library model, collection configuration, and loading/import orchestration.
- `emugui_core/metadata.py` and `scraping.py` own metadata mutations and bounded scraper dispatch while accepting the existing platform adapters as injected dependencies.
- `emugui_core/jobs.py` owns thread-safe background-job state and progress reporting.
- `emugui_core/profiles.py` owns emulator-profile import, refresh, editing, deletion, and launch-profile selection independently of either browser transport.
- `emugui_core/launching.py` owns game/POK launch orchestration, managed-profile preparation, safe argument-array process startup, running-instance choices, and the Windows adapters for EightyOne and Spectaculator/SpecStub.
- `web/` contains the canonical browser frontend used by both file/RPC and HTTP modes.
- `data/state.json` stores favourites and recent plays.
- The default collection is `E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection`.
- Override the default collection with `MORPHEUS_EMUGUI_COLLECTION`.
- Override the sibling collection search root with `MORPHEUS_EMUGUI_COLLECTIONS_BASE`.

The runtime intentionally uses only Python's standard library.

## ZX Launch Validation

Run the non-launching preflight to verify the active collection, emulator executables, managed profiles, and representative 48K/128K games:

```powershell
python -B tools\validate_zx_launch.py
```

Run the live matrix when EightyOne and Spectaculator are closed:

```powershell
python -B tools\validate_zx_launch.py --live
```

The live validator refuses to interfere with an existing emulator session. It backs up and restores the live EightyOne configuration, verifies profile copying and focusable windows, exercises Spectaculator direct/current/new behaviour through SpecStub, confirms launched processes survive the response, and closes only the processes it started.

## Antivirus Note

When using the optional HTTP adapter, use the `.bat` starter rather than a hidden VBS/pythonw launcher. Hidden script chains such as
`wscript.exe -> pythonw.exe` can be flagged by Bitdefender Advanced Threat Defense even when the
local server is harmless.
