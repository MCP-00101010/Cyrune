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

## Send Games to Portal

Check up to 100 collection games, right-click one of the checked rows, and choose **Send selected games to Portal**. The same action is available under **Bulk Actions**. Sending starts immediately; the result lists delivered, queued and unconfirmed games. If Portal is closed, Relay queues accepted games for its Inbox when it opens. Portal 0.12.9 also handles deliveries arriving during page startup. Reload both pages after updating. Single-game **Send to Portal** and **Update Portal Shortcut** retain their existing behaviour.

**Stop after current game** leaves the remaining games unsent. **Retry remaining** skips accepted items and keeps the same delivery IDs, so a lost acknowledgement does not create another card on retry. An unfinished send remains available when you reopen the action in the same Arcade page; **Discard remaining** abandons those attempts without removing delivered or queued games. Finish or inspect unconfirmed sends before reloading Arcade. Game-specific emulator/profile pins are retained, with the collection default used for unpinned games. Incoming or deleted games must be added or restored to the collection first.

## Architecture and Guidance

Select a platform (ScummVM or ZX Spectrum), then one of its collections. Each platform remembers its last collection and its own column order, visibility and widths, seeded from the previous layout. ScummVM Publisher and Series values come from the [bundled official metadata snapshot](data/scummvm-metadata/NOTICE.md), matched by exact engine/game ID; an absent series stays blank. Series is sortable and included in search.

Collection lists show one row per title with combined system, edition, language and country options. The System column shows available 16K/48K/128K badges for Spectrum editions and system icons for ScummVM editions. Language and country columns use local flags; explicit legacy language labels such as English are recognized without guessing unknown languages. Flags always follow normalized language/country-code order. Context menus offer only available emulators matching the game’s target kind and supported file format. Platform badges come from ScummVM’s icon collection; explicit Steam edition markers appear alongside any known platform, and unspecified platforms use a green/orange question mark. This display information does not change native platform IDs or launch targets. See [artwork attribution](web/assets/platforms/NOTICE.md). Double-click launches the default version; right-click **Launch Version…** to launch any edition once or **Use as default** to share that choice with Portal. Remakes stay separate, and Incoming/Bin continue to show individual files. Grouping preserves the underlying exact records and files.

- [Arcade instructions](AGENTS.md) define product ownership, transport, filesystem, metadata, launch, Portal-integration, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define ownership across Arcade, Portal, Relay, and Host.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines client roles, compact Portal game items, opaque bindings, delivery, and security.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Arcade's component manifest, protocol negotiation, compatibility aliases, and migration receipts.
- [Health audit](HEALTH-AUDIT.md) records the current reliability and real-library performance baseline.
- [Native import manifest](../docs/architecture/arcade-import-manifest.md) defines the shared discovery/review format and Spectrum adapter. `python -B Arcade/tools/inspect_import.py --spectrum-source SOURCE_ID --root COLLECTION` checks a draft from the repository root without changing the collection. This developer tool is groundwork for ScummVM import; ordinary Portal browsing still needs no preparation.
- [ScummVM adapter](../docs/architecture/arcade-scummvm-adapter.md) reads existing registrations within a selected library root and checks exact launch targets without starting games or changing settings. Use `--scummvm-source SOURCE_ID --root COLLECTION --scummvm-config INI --check-launcher EXE` with the same inspection tool. ScummVM is enabled in the Portal picker with the optional capability shared by current Arcade, Host, Relay and Portal releases.

## Shape

- `arcade_service.py` provides the transport-independent API dispatcher and platform-specific filesystem/network adapters loaded by Cyrune Host. `emugui_service.py` is a compatibility shim for older Host installations.
- `arcade_core/library.py`, `collections.py`, and `collection_loading.py` own the in-memory library model, collection configuration, and loading/import orchestration.
- `arcade_core/import_manifest.py` owns bounded native import validation and reference review. `import_spectrum.py` supplies the first source adapter and the running catalogue's shared identity/metadata normalization, preserving exact editions and explicit POK links. Drafts grant no launch authority.
- `arcade_core/import_scummvm.py` preserves existing ScummVM registrations as native game-directory targets, including release platform/language and exact text-adventure filenames. Its launch preflight names the original configured target so native ScummVM preferences remain in effect; Host independently validates and executes those exact targets.
- `arcade_core/catalogue_library.py`, `catalogue_spectrum.py`, and `catalogue.py` let Portal browse configured managed Spectrum libraries directly, including read-only collections. A native metadata index makes warm title searches independent of media-file checks. A private runtime identity key supplies stable opaque IDs, while existing prepared IDs remain unchanged. No preparation, metadata writes or game approvals are required to browse. Optional **Collection maintenance → Preserve IDs for relocation...** retains the existing reviewed preparation tools for relocation and recovery. See the [direct browsing contract](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).
- `arcade_core/catalogue_recovery.py` powers **Catalogue Recovery...**, available even when startup cannot load the library. Review the interrupted collection's saved change, choose finish or restore where available, confirm, then reload the library. Confirmed repair choices survive interruption; conflicting edits require inspection before repair. See the [recovery contract and compatibility limits](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-reviewed-recovery--arcade-028).
- `arcade_core/catalogue_reattachment.py` powers **Reconnect Collection...** for a prepared source whose folder moved. Select the original collection, choose its relocated folder in the native picker, review retained game IDs/content and confirm. Reconnection preserves catalogue identities and existing binding records, then requires a library reload. See the [reviewed reattachment contract](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-reviewed-reattachment--arcade-029).
- `arcade_core/catalogue_launch.py` resolves selected exact library entries and their configured emulator/profile policy for Host when adding or launching. Game override, collection default, then the initial visible configured launcher selection supply the emulator; broken explicit pins never fall through. It reuses existing launch adapters with Host-validated process and profile-copy callbacks, without switching the active collection or exposing launch plans to pages.
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

Catalogue reads reuse private metadata only within a checked native read lease. Exact-entry local PNG references feed Host's bounded thumbnail decoder without remote acquisition or title matching. The [artwork and native performance milestone](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-local-artwork-and-read-leases--arcade-026-host-023-relay-113) records supported inputs and synthetic measurements; the column picker is enabled. See the [activation record](../docs/architecture/portal-arcade-spectrum-migration.md#column-picker-activation--2026-09-06).

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

## ScummVM collections

**Scrape Metadata → Apply Selected** saves metadata and approved HTTPS artwork references for the selected version in Arcade's native runtime (`scummvm-overrides/`). These overrides survive reload and feed catalogue presentation. The original ScummVM registration, system/language, launch configuration and game files stay intact; generic file editing/deletion remains disabled. Scraped titles preserve the original title family and shared default. Artwork uses the existing optional-network display path; this does not download an offline artwork library.

Arcade 0.2.15 ScummVM integration uses your existing registered games and settings. After the native source is configured, select **ScummVM** in Arcade, launch games normally or use **Send to Portal**. Portal's **Add Game** searches it directly alongside Spectrum, including distinct language/platform editions. Reload Relay and both pages after updating. See [setup, behavior and compatibility](../docs/architecture/arcade-scummvm-adapter.md#configure-and-use).
