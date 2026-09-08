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

The **Emulators** card below Platforms opens the installed emulators for the selected platform using their application icons. It does not require a selected game or apply a game's launch profile. ScummVM opens the current collection's configured library. Configure emulator locations through Settings as usual.

Use the **Platforms** icon card to select ScummVM, ZX Spectrum or Atari ST, then choose a collection in the filter card. The Portal-style menu and filters sit beside the full-height game list; game details remain collapsible. Click the version number for **Settings**: General contains layout controls and Metadata Providers, while each platform has library folder/name settings, compatible Emulators & Profiles, and library tools. Settings tabs keep independent drafts and do not switch the game list. **Save Library Settings** saves the selected collection; **Save Layout** saves General. Cancel discards remaining drafts. Choosing another library folder does not move media; prepared roots use Reconnect Collection and existing Portal shortcuts may need reconnecting. Atari folders must already contain a valid Arcade disk-set index. Each platform remembers its last collection and its own column order, visibility and widths, seeded from the previous layout. ScummVM Publisher and Series values come from the [bundled official metadata snapshot](data/scummvm-metadata/NOTICE.md), matched by exact engine/game ID; an absent series stays blank. Series is sortable and included in search.

Filter checkboxes cycle through unrestricted, include and exclude when clicked or activated with Space. A red cross hides matching editions from the list's version count, badges and edition labels. A game stays listed while any matching edition remains. Double-click still launches its saved default, including when that version is excluded; Properties and Launch Version retain all versions. Search, view and filters are remembered separately for each platform, including after reload. Clear Filters resets the current platform only. POK controls are Spectrum-only, and Edit Emulators lists only the selected platform's adapters. Atari profiles are selected in each game's Properties.

Right-click a game for **Scrape Metadata**, or check up to 100 games and choose **Scrape selected games** (also available in Bulk Actions). Atari and Spectrum scrape once per game folder and apply the shared metadata/artwork to every version in that folder. Disk sets, language, hardware, emulator and profile settings stay separate. A new scrape reconciles previously conflicting scraped metadata; existing data is not changed on startup. ScummVM expands each selected game into all its registered versions in the current library and keeps their metadata/artwork separate, searching each version's platform. Equivalent searches can be reused within the batch.

Bulk results place a large cover/loading-screen preview beside each game, loading artwork as its row comes into view. Click the artwork or **View details** to inspect the selected result. **Use metadata from** shows the provider result and offers a selector only when several search results are available, with title, platform, year and publisher to distinguish them. These are provider search results, which may include different games with similar names. Each row retains editable **Search term**, **Current system / All platforms** and **Search again** controls. Correct a failed or unwanted match without leaving the batch; editing clears its old selection until a fresh search completes. Review and apply selected results together. Saved and unconfirmed rows stay locked and are never automatically replayed; stop finishes the current request. Single-game Atari/Spectrum scraping also allows an edited term and platform. These choices affect lookup only. Single and bulk scraping remember the last provider across reloads. Expansion is bounded to 1,000 versions; select fewer games if that limit is reached.

Collection lists show one row per title with combined system, edition, language and country options. The System column shows available 16K/48K/128K badges for Spectrum editions and system icons for ScummVM editions. Language and country columns use local flags; explicit legacy language labels such as English are recognized without guessing unknown languages. Flags always follow normalized language/country-code order. Context menus offer only available emulators matching the game’s target kind and supported file format. Platform badges come from ScummVM’s icon collection; explicit Steam edition markers appear alongside any known platform, and unspecified platforms use a green/orange question mark. This display information does not change native platform IDs or launch targets. See [artwork attribution](web/assets/platforms/NOTICE.md). Double-click launches the default version; right-click **Launch Version…** to launch any edition once or **Use as default** to share that choice with Portal. Remakes stay separate, and Incoming/Bin continue to show individual files. Grouping preserves the underlying exact records and files.

- [Arcade instructions](AGENTS.md) define product ownership, transport, filesystem, metadata, launch, Portal-integration, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define ownership across Arcade, Portal, Relay, and Host.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines client roles, compact Portal game items, opaque bindings, delivery, and security.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Arcade's component manifest, protocol negotiation, compatibility aliases, and migration receipts.
- [Health audit](HEALTH-AUDIT.md) records the current reliability and real-library performance baseline.
- [Native import manifest](../docs/architecture/arcade-import-manifest.md) defines the shared discovery/review format and Spectrum adapter. `python -B Arcade/tools/inspect_import.py --spectrum-source SOURCE_ID --root COLLECTION` checks a draft from the repository root without changing the collection. This developer tool is groundwork for ScummVM import; ordinary Portal browsing still needs no preparation.
- [ScummVM adapter](../docs/architecture/arcade-scummvm-adapter.md) reads existing registrations within a selected library root and checks exact launch targets without starting games or changing settings. Use `--scummvm-source SOURCE_ID --root COLLECTION --scummvm-config INI --check-launcher EXE` with the same inspection tool. ScummVM is enabled in the Portal picker with the optional capability shared by current Arcade, Host, Relay and Portal releases.

Legacy Spectrum libraries may retain alphabet, numeric or category folders. Those containers share metadata only between versions of the same original title. Dedicated game folders share presentation across their editions. This applies to display, scraping and manual edits; reorganising ROMs is not required to use metadata sharing.

Platform switching tracks catalogue preparation before the index job completes, then loads the new collection and game list together. Failed loads clear stale rows and show a retry message.

## Game Boy library

Game Boy, Game Boy Color and Game Boy Advance share one **Game Boy** platform and collection. **GB**, **GBC** and **GBA** tags distinguish cartridges; each version retains its own ROM, launch choice and scraper system. The cartridge adapter reads `GameBoy/Games`, `GameBoy Color/Games` and `GameBoy Advanced/Games` beneath the configured Nintendo root, accepting TOSEC and No-Intro names. **Rebuild Index** adds new cartridges without replacing existing IDs, scraped metadata or launch pins.

SameBoy accepts a ROM path and handles GB/GBC. VisualBoyAdvance-M handles GBA and can also open GB/GBC; BGB is an optional GB/GBC alternative. Only compatible emulators appear under **Open with**. Setup preserves installed emulator preferences and does not move media. Scraping, protected corrections and Undo remain available while ROM file-management actions stay disabled for this adapter.

Configure a library with `python -B Arcade/tools/configure_gameboy.py --arcade-config CONFIG --root NINTENDO_ROOT --sameboy SAMEBOY_EXE --vbam VBAM_EXE`. Optional `--bgb BGB_EXE` adds BGB; `--receipt MIGRATION_JSON` validates completed migration hashes and retains audited language/title choices. Review the default dry run, then add `--apply`. Existing configuration is backed up and unrelated collections/settings remain intact. Runtime files must stay outside the checkout.

Games can be sent from Arcade to Portal and retain source-scoped launch identities when another collection is active. The Portal catalogue picker also lists cartridges when all participants advertise `arcade-gameboy: 1`; GB/GBC/GBA stay visible as hardware labels.


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
- `data/platforms.json` defines library labels, adapters, emulator compatibility, metadata sharing, POK support and provider platform IDs. Native code reads it through `arcade_core/platforms.py`; regenerate the browser counterpart with `python -B Arcade/tools/build_platforms.py` from the repository root. Unknown adapters do not inherit Spectrum capabilities; legacy collections without an adapter retain their existing Spectrum behavior. Adding a definition does not implement a native import or launch adapter.
- `arcade_core/metadata_care.py` owns protected presentation fields, cleanup review markers and recoverable scrape Undo. Private runtime `metadata-care/` journals retain affected rows only, with a 32 MiB limit and at most 1,000 changed versions per batch. History stays native and grants no launch authority; scraper credentials are never recorded.
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

## ScreenScraper metadata and artwork

Single and bulk scraping offer **Fill missing fields only**. Leave it unchecked to replace existing unprotected values with the selected result; check it to retain populated fields and add missing information or artwork. Protected fields always retain their values, including intentionally empty fields.

Right-click **Metadata & protection…** to correct presentation fields or protect/unprotect existing values. New manual corrections are protected automatically, including edits made through the existing Spectrum metadata editor. Earlier manual corrections cannot be identified retrospectively; protect those values explicitly before replacing metadata. Atari/Spectrum protection applies to the game folder; ScummVM protection remains specific to each registered version.

**Undo last scrape**, available in the context menu and bulk scraper, restores the most recent scrape or applied batch in the current collection. It survives browser restarts and preserves unrelated games. If an affected game was edited afterwards, Undo refuses to overwrite that later edit. This is separate from the Spectrum metadata/rename editor's Undo.

Use **Needs attention** in the filters for **Missing artwork**, **Missing description**, or **Needs scrape review**. Artwork is missing when both screenshot and cover/loading-screen references are absent; this does not check remote image availability. Failed, weak or tied searches are marked for review from this release onward; applying a reviewed result clears that marker. Filters are remembered per platform and do not trigger scraper requests.

Atari/Spectrum versions in a game folder resolve shared presentation when loading, including older single-version scrapes and newly indexed versions. The list, details, cleanup filters and native catalogue use this same metadata. Protected fields take precedence, followed by validated Atari overrides and scraped/populated values; source records remain intact. Spectrum presentation edits also update siblings, while file/hardware/language settings remain specific to each edition. Flat collection roots keep unrelated titles separate. ScummVM continues to resolve each registration independently.

For a single game, use **Search platform** beside the search term to choose **Current system** or **All platforms**. It starts on the current platform each time you open scraping. Results show their source platform; selecting a match loads its artwork. Applying another platform's metadata and artwork keeps the original game's platform, system and launch settings. This works with ScreenScraper and TheGamesDB; bulk scraping starts on the current system and lets you change each row independently. Results are bounded to 30, so refine the title if a broad search fills the list. Bulk scraping preselects only an unambiguous title match scoring at least 75%; weak or tied results remain unchecked for review. After a native service update, restart the browser to reload Cyrune Host; reloading the Arcade page alone retains the running service.

ScreenScraper uses its [API v2 title-search endpoint](https://www.screenscraper.fr/webapi2.php) and requires both your account and approved developer credentials. Spectrum uses system 76 (the previously shipped 135 default is corrected automatically); Atari ST uses 42 and ScummVM uses each registration's original platform (DOS, Amiga, Windows, etc.). Registrations with an unspecified platform search across platforms and require manual match review. Review the ranked matches before applying. Screenshots and box covers are fetched by the native service with saved credentials; only credential-free media references are retained in metadata. Covers fall back to a title screen when unavailable. Downloaded ScreenScraper PNGs are cached beneath the native runtime `scraper-cache/` directory for up to 30 days (128 MiB / 2,048 images maximum), so later page/browser sessions reuse them. The first uncached download still depends on the provider. Details display each image as it arrives; concurrent requests for the same image are combined. Cache access retains the existing provider and optional-network gates. Optional networking must be enabled. Restart the browser after updating the native scraper, then reopen Arcade and rescrape affected games.

## ScummVM collections

**Scrape Metadata** searches all related registered versions; **Apply matches** saves each checked version's own metadata and approved artwork references in Arcade's native runtime (`scummvm-overrides/`). These overrides survive reload and feed catalogue presentation. The original ScummVM registration, system/language, launch configuration and game files stay intact; generic file editing/deletion remains disabled. Scraped titles preserve the original title family and shared default. Artwork uses the existing optional-network display path; this does not download an offline artwork library.

Arcade 0.2.15 ScummVM integration uses your existing registered games and settings. After the native source is configured, select **ScummVM** in Arcade, launch games normally or use **Send to Portal**. Portal's **Add Game** searches it directly alongside Spectrum, including distinct language/platform editions. Reload Relay and both pages after updating. See [setup, behavior and compatibility](../docs/architecture/arcade-scummvm-adapter.md#configure-and-use).


## Atari ST collections

Configure an already sorted TOSEC disk-image library with `tools/configure_atari.py --arcade-config <native-config.json> --root <games-folder> --executable <STEem.exe>`. The command previews the complete editions; add `--apply` to save the collection and a configuration backup. STEem must already have a `steem.ini` beside its executable. Use a build matching the installed Pasti DLL for STX images.

Select **Atari ST** in Arcade. Complete multi-disk editions share a title row; use **Launch Version…** to choose an edition or save its default. Without saved Properties, STEem loads the first two disks into A/B; swap additional disks from the game folder in STEem. Existing TOS and machine settings are retained. TT/Falcon editions remain listed but need another emulator. The source disk set remains read-only; file maintenance is disabled. **Scrape Metadata → Apply Selected** saves presentation overrides in Arcade’s native `atari-overrides/` storage, including validated artwork references. These survive reload without changing disk images, edition identities, shared defaults or launch Properties.

**Send to Portal** and Portal's **Add Game** use the same library even when another platform is active. Reload Relay and the pages after updating. See the [Atari adapter contract](../docs/architecture/arcade-atari-adapter.md) for metadata and compatibility details.

### Atari game Properties

Right-click a game and choose **Properties…**. Select an edition, emulator and optional named STEem configuration, and choose a game disk, save disk or empty drive B. The default checkbox also sets the edition used by Arcade and Portal.

The **Save disk** selector lists valid images for this edition, followed by **Create empty save disk** and **Import save disk…**. Creation immediately adds a blank 720 KiB `.st` image; import opens the native file picker and copies the selected raw `.st` image (up to 2 MiB). Both actions keep Properties open, name the disk for the edition, select it for drive B and retain any other draft changes. Existing filenames receive a numbered suffix instead of being overwritten. Images stay in the game's **Safe Disks** folder and are excluded from the library.

**Save** applies the selected disk and other launch settings. **Cancel** discards those settings; disks you explicitly created or imported remain available next time. New images belong to their edition, older explicit sharing is preserved, and unassigned valid images already in the folder remain selectable. Backups are available in the expandable **Save disk backups** section; **Restore selected backup** acts immediately and first preserves the current image.

STEem's named configurations are discovered in its `config` folder. Each launch uses a private INI copy, so emulator history and preference writes leave the original configuration intact. Properties apply to launches from both Arcade and Portal. A save disk's normal contents can change without breaking its shortcut.

Mounted save disks are backed up before launch; the ten most recent distinct backups can be restored in Properties. Restore first backs up the current disk. Close the game before changing its settings, restoring its disk or launching another edition sharing that disk. Properties offers recovery for an interrupted settings save. An interrupted emulator start whose child identity was never recorded stays blocked for native review. Game disk images themselves are not copied or made write-protected; use the separate save image when a game asks for a writable save disk.

Hatari is available as an alternative Atari emulator. Select it in a game’s **Properties**, choose a named profile from the installation’s `configs` folder, and save to use those settings in Arcade and Portal. The launch menu can use another emulator for one launch. `tools/configure_hatari.py --arcade-config <native-config> --executable <hatari.exe>` previews registration; `--apply` registers it with a backup and keeps existing collection defaults. See the [Atari adapter contract](../docs/architecture/arcade-atari-adapter.md#hatari--arcade-0234--host-0219) for profile discovery and compatibility.

After copying complete Atari disk sets into the library, use **Rebuild Index** to add them. Existing records and Properties are retained. **Launch Version** and **Properties** display full disk image filenames. Game disk settings are shared by Hatari and STEem for the selected edition; emulator profiles remain specific to their emulator.

Arcade follows Portal's saved theme through Relay, including colours, fonts, panel opacity and light/dark mode. Reload Relay and open Portal once after upgrading to publish its current theme; Arcade then retains that appearance with Portal closed. Board backgrounds remain Portal-specific. Details provide larger artwork and compact metadata; launch, scraping and favourite actions are in the game context menu.


## Scraping and loading

Applying a match remembers that game's edited search term and **Current system / All platforms** choice for the selected provider. Individual and bulk scraping restore them next time, including after restarting the browser. Edit and apply again to replace them; failed searches and closing without applying retain the previous successful choices. Shared metadata versions reuse the same searches; ScummVM versions keep their own. An unfinished resumed review takes precedence over these defaults. Automatic searches remain automatic, preserving Game Boy hash lookup. Choices made before this feature need to be applied once to be remembered.

Bulk scraping supports editing each search, retrying failed lookups and pausing at provider limits. Closing retains one bounded review for seven days in this browser; **Resume scrape review** in a game's context menu rechecks remaining matches. Saved and uncertain writes are never replayed automatically. **Discard review** removes those choices. Metadata provider, source platform and scrape date appear in the details, Properties and Metadata & protection views. **Newly indexed (14 days)** starts with a baseline of existing games.

Recent native libraries, parsed POKs, provider results and artwork have bounded caches. Rebuild Index always refreshes collection data. Collection-scoped requests and generation checks prevent late replies from populating another platform. List reads support compact defaults and revision deltas while retaining exact version identities. Scraper jobs release the native message handler while fetching, and ScreenScraper concurrency starts at one until its account response advertises a larger allowance (currently capped at two workers). Cartridge hashes are used only for current-platform Game Boy searches without an edited term; other searches retain title matching.

`arcade_core/tosec.py` owns filename parsing/building, `provider_metadata.py` owns provider text/media projection, and `web/scrape-views.js` owns the scraping dialogs alongside the independent `metadata-scraping.js` batch model. No build step or additional runtime framework is required.
