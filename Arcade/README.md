# Cyrune Arcade

Formerly Morpheus EmuGUI. Arcade remains authoritative for game libraries, metadata, artwork, emulator definitions, managed profiles, and launch decisions.

Small local browser launcher and collection manager for emulator libraries.

## Run

With Cyrune Relay 1.0.53 or newer installed and Cyrune Host configured for this Arcade checkout, open:

```text
web/index.html
```

The normal Cyrune Arcade interface remains in this repository. It sends its API calls through an authenticated Cyrune Relay session and the persistent Cyrune Host connection. Cyrune Portal's **Open in Cyrune Arcade** action opens this page and selects the source game automatically.

Firefox/Zen must allow Cyrune Relay to access local files. Relay authorises only this checkout's configured `web/index.html`, not arbitrary file pages.

Arcade consumes the fixed `arcade` Nexus settings profile through that authenticated role. It applies shared language and accessibility presentation and exposes unit/privacy values locally, refreshes after revision broadcasts, and remains usable with defaults if the settings service is unavailable. The profile deliberately excludes Portal/Widget city and precise-location settings.

## Architecture and Guidance

- [Arcade instructions](AGENTS.md) define product ownership, transport, filesystem, metadata, launch, Portal-integration, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define ownership across Arcade, Portal, Relay, and Host.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines client roles, compact Portal game items, opaque bindings, delivery, and security.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Arcade's component manifest, protocol negotiation, compatibility aliases, and migration receipts.
- [Health audit](HEALTH-AUDIT.md) records the current reliability and real-library performance baseline.

## Shape

- `arcade_service.py` provides the transport-independent API dispatcher and platform-specific filesystem/network adapters loaded by Cyrune Host. `emugui_service.py` is a compatibility shim for older Host installations.
- `arcade_core/library.py`, `collections.py`, and `collection_loading.py` own the in-memory library model, collection configuration, and loading/import orchestration.
- `arcade_core/metadata.py` and `scraping.py` own metadata mutations and bounded scraper dispatch while accepting the existing platform adapters as injected dependencies.
- `arcade_core/jobs.py` owns thread-safe background-job state and progress reporting.
- `arcade_core/emulators.py` owns validated emulator definitions, argument-vector templates, custom emulator lifecycle, and collection defaults; built-in definitions live in `defaults/emulators.json`.
- `arcade_core/secrets.py` keeps scraper credentials behind Cyrune Host's Windows Credential Manager boundary and verifies legacy migration before removing plaintext JSON values.
- `arcade_core/profiles.py` owns emulator-profile import, refresh, editing, deletion, and launch-profile selection independently of either browser transport.
- `arcade_core/launching.py` owns game/POK launch orchestration, managed-profile preparation, safe argument-array process startup, running-instance choices, and the Windows adapters for EightyOne and Spectaculator/SpecStub.
- `web/` contains the canonical local-file browser frontend, which uses extension RPC exclusively.
- `%LOCALAPPDATA%/Cyrune/Arcade/state.json` stores favourites and recent plays on Windows. The default is `${XDG_DATA_HOME:-~/.local/share}/Cyrune/Arcade` elsewhere; set `CYRUNE_ARCADE_DATA` for a portable or development override.
- The default collection is `E:\Emulation\Software Library\Sinclair\ZX Spectrum\Desasteron Spectrum Collection`.
- Override the default collection with `CYRUNE_ARCADE_COLLECTION`; `MORPHEUS_EMUGUI_COLLECTION` remains a compatibility alias.
- Override the sibling collection search root with `CYRUNE_ARCADE_COLLECTIONS_BASE`; `MORPHEUS_EMUGUI_COLLECTIONS_BASE` remains a compatibility alias.

The runtime intentionally uses only Python's standard library.

State, configuration, collection metadata, and emulator-profile files are replaced atomically so an interrupted write does not destroy the previous working copy. Bulk import and restore treat file moves, metadata, and index rebuilds as one recoverable transaction; metadata/rename edits keep a bounded Undo history. Scraper credentials are sent only to validated HTTPS base URLs. See [HEALTH-AUDIT.md](HEALTH-AUDIT.md) for the latest reliability and 12,933-game summary-payload baseline.

Launch templates are JSON arrays of arguments, not command strings. They may use `{file}`, `{file_dir}`, `{file_name}`, `{collection_root}`, `{pok_file}`, `{system}`, and `{title}`. Cyrune Arcade validates executable/helper paths and templates before saving changes.

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
