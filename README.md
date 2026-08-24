# Morpheus EmuGUI

Small local browser launcher and collection manager for emulator libraries.

## Run

With Morpheus WebHub extension 1.0.48 or newer installed and its native host configured for this EmuGUI checkout, open:

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

- `server.py` contains the transport-neutral service operations and the optional development HTTP adapter.
- `web/` contains the canonical browser frontend used by both file/RPC and HTTP modes.
- `data/state.json` stores favourites and recent plays.
- The default collection is `E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection`.
- Override the default collection with `MORPHEUS_EMUGUI_COLLECTION`.
- Override the sibling collection search root with `MORPHEUS_EMUGUI_COLLECTIONS_BASE`.

The runtime intentionally uses only Python's standard library.

## Antivirus Note

When using the optional HTTP adapter, use the `.bat` starter rather than a hidden VBS/pythonw launcher. Hidden script chains such as
`wscript.exe -> pythonw.exe` can be flagged by Bitdefender Advanced Threat Defense even when the
local server is harmless.
