# Cyrune Arcade

Formerly Morpheus EmuGUI. Arcade remains authoritative for game libraries, metadata, artwork, emulator definitions, managed profiles, and launch decisions.

Small local browser launcher and collection manager for emulator libraries.

## Run

With Morpheus WebHub extension 1.0.52 or newer installed and its native host configured for this EmuGUI checkout, open:

```text
web/index.html
```

The normal EmuGUI interface remains in this repository. It sends its API calls through an authenticated WebHub extension session and the persistent native host. WebHub's **Open in EmuGUI** action opens this page and selects the source game automatically.

Firefox/Zen must allow the Morpheus WebHub extension to access local files. The extension authorises only this checkout's configured `web/index.html`, not arbitrary file pages.

## Shape

- `emugui_service.py` provides the transport-independent API dispatcher and platform-specific filesystem/network adapters loaded by the WebHub native host.
- `emugui_core/library.py`, `collections.py`, and `collection_loading.py` own the in-memory library model, collection configuration, and loading/import orchestration.
- `emugui_core/metadata.py` and `scraping.py` own metadata mutations and bounded scraper dispatch while accepting the existing platform adapters as injected dependencies.
- `emugui_core/jobs.py` owns thread-safe background-job state and progress reporting.
- `emugui_core/emulators.py` owns validated emulator definitions, argument-vector templates, custom emulator lifecycle, and collection defaults; built-in definitions live in `defaults/emulators.json`.
- `emugui_core/secrets.py` keeps scraper credentials behind the WebHub native host's Windows Credential Manager boundary and verifies legacy migration before removing plaintext JSON values.
- `emugui_core/profiles.py` owns emulator-profile import, refresh, editing, deletion, and launch-profile selection independently of either browser transport.
- `emugui_core/launching.py` owns game/POK launch orchestration, managed-profile preparation, safe argument-array process startup, running-instance choices, and the Windows adapters for EightyOne and Spectaculator/SpecStub.
- `web/` contains the canonical local-file browser frontend, which uses extension RPC exclusively.
- `data/state.json` stores favourites and recent plays.
- The default collection is `E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection`.
- Override the default collection with `MORPHEUS_EMUGUI_COLLECTION`.
- Override the sibling collection search root with `MORPHEUS_EMUGUI_COLLECTIONS_BASE`.

The runtime intentionally uses only Python's standard library.

State, configuration, collection metadata, and emulator-profile files are replaced atomically so an interrupted write does not destroy the previous working copy. Scraper credentials are sent only to validated HTTPS base URLs. See [HEALTH-AUDIT.md](HEALTH-AUDIT.md) for the latest reliability and real-library performance baseline.

Launch templates are JSON arrays of arguments, not command strings. They may use `{file}`, `{file_dir}`, `{file_name}`, `{collection_root}`, `{pok_file}`, `{system}`, and `{title}`. EmuGUI validates executable/helper paths and templates before saving changes.

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
