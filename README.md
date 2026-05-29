# Morpheus EmuGUI

Small local browser launcher and collection manager for emulator libraries.

## Run

Double-click:

```text
Start Morpheus EmuGUI.bat
```

Keep the console window open while using the launcher. Starting it this way matters on Windows because emulator windows need to be launched from your interactive desktop session.
The launcher does not auto-open the browser; open this address manually:

```text
http://127.0.0.1:8765
```

To stop the launcher server, close the console window or press `Ctrl+C` in it.
If an old server process is still running, run:

```text
Stop Morpheus EmuGUI.bat
```

Or run manually:

```powershell
python server.py --no-browser
```

## Shape

- `server.py` serves the UI and exposes a tiny JSON API.
- `web/` contains the browser frontend.
- `data/state.json` stores favourites and recent plays.
- The default collection is `E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection`.
- Override the default collection with `MORPHEUS_EMUGUI_COLLECTION`.
- Override the sibling collection search root with `MORPHEUS_EMUGUI_COLLECTIONS_BASE`.

The first version intentionally uses only Python's standard library.

## Antivirus Note

Use the `.bat` starter rather than a hidden VBS/pythonw launcher. Hidden script chains such as
`wscript.exe -> pythonw.exe` can be flagged by Bitdefender Advanced Threat Defense even when the
local server is harmless.
