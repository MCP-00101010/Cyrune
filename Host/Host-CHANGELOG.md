# Cyrune Host Changelog

Historical entries below are preserved from Portal releases whose release notes materially changed this component. Version numbers are Portal release versions unless an entry explicitly says otherwise.

---

## [Unversioned] — 2026-08-25

### Added

- Added Nexus settings schema 2 with schema-1 migration, sparse typed `portal-widgets` and `arcade` overrides, fixed source annotations, and permission-gated precise coordinates exposed only to the Portal & Widgets profile.
- Added fixed typed Nexus settings profiles for `portal-widgets` and `arcade`. Host chooses each profile's exact key set, rejects unknown component IDs, and never accepts a path or arbitrary key list from browser pages.
- Added sanitized, independently sampled health adapters for Portal database/schema/backups, Arcade service/state, Nexus settings/backups, and Host availability, using only fixed diagnostic codes and recovery guidance.
- Added a fixed-purpose Nexus origin check that derives the current branch locally, disables interactive Git credential prompts, calls only timeout-bounded `git ls-remote` against fixed `origin`, and returns sanitized short commit comparisons without fetching or changing repository state.
- Added a user-triggered, fixed-purpose Nexus TODO editor that maps only registered component IDs to their authoritative TODOs and opens Visual Studio Code with an argument array without returning filesystem or executable paths.
- Added the authoritative Nexus shared-settings service with typed schema validation, monotonic revisions, stale-write rejection, atomic persistence, bounded content-free history, and retained revision backups beneath the Nexus runtime-data root.
- Added exact Nexus page authorization, allowlisted component-document reads, and sanitized component, runtime-data, repository, and validation-receipt status operations.

### Fixed

- A corrupt component state source now degrades only its own Nexus health record instead of erasing otherwise healthy status sections.
- Nexus page authorization now treats client-side `#…` routes as views of the same exact `Nexus/index.html` document while continuing to reject query-bearing and different local files.
- Chunked database and backup reads now bind their continuation token to both file metadata and a SHA-256 content identity, rejecting same-size replacements even when the filesystem reuses the previous modification timestamp.

### Changed

- Expanded validation-receipt sanitization to admit only the fixed Migration, Packaging, and Tooling suite counts alongside component suites; arbitrary groups and nested output remain discarded.
- Updated native-host diagnostics, default database filenames, Arcade service errors, and network identification to use the Cyrune Host, Portal, and Arcade names while preserving installed IDs and credential namespaces.
- Renamed the active backlog and release log to `Host-TODO.md` and `Host-CHANGELOG.md` for unambiguous editor tabs.
- Relocated Host source, installers, tests, and templates from Relay into the top-level `Host/` component.
- Moved live Host configuration outside the checkout to the Cyrune runtime-data root while retaining a documented environment override.
- Preserved the installed native-messaging host ID and credential namespace for compatibility.

### Validation

- Host coverage now includes fixed per-component settings subsets and traversal rejection alongside Nexus authorization, independent health adapters, partial failures, validation, atomic revisions, stale-write conflicts, document/editor allowlists, path-free Visual Studio Code startup, fixed-origin remote comparison, status redaction, and remote-URL sanitization.


## [0.11.220] — 2026-08-25

### Changed

- **EmuGUI native service boundary** — the retained transport-independent dispatcher and platform adapters now live in `emugui_service.py`, and the WebHub native host loads that explicitly named service module.
- **Single EmuGUI transport** — EmuGUI's external `file://` interface now uses authenticated extension RPC for every API and artwork request. Extension registration and **Open in EmuGUI** accept only the configured local file page.

### Removed

- **Retired EmuGUI HTTP server** — removed the localhost handler, port-8765 process lifecycle, browser-start entry point, start/stop batch files, frontend fetch fallback, and special localhost authorization path. The server is not carried into the monorepo plan.

### Validation

- All 345 WebHub JavaScript tests, all 42 native-host tests (plus 11 parameterised subtests), and all 53 EmuGUI tests pass. JavaScript and Python syntax/import coverage pass through those suites, and Firefox extension `1.0.52` passes `web-ext lint` with zero errors plus the existing native-host Python notice and installer-shell warning.

## [0.11.219] — 2026-08-24

### Added

- **Extensible EmuGUI emulator configuration** — EmuGUI now loads its built-in emulator definitions from versioned JSON, supports validated custom emulators through an Add/Edit interface, stores launch commands as bounded argument arrays with an approved placeholder set, and supports one default emulator per collection.
- **Credential Manager boundary for EmuGUI** — the native host now supplies its existing Windows Credential Manager service to EmuGUI. Existing ScreenScraper and TheGamesDB secrets are written and read back for verification before their plaintext JSON fields are removed.

### Changed

- **Template-driven native launches** — direct game, running-instance helper, and POK launches render configured argument vectors while retaining `shell=False`, existing managed-profile behaviour, and the current EightyOne/Spectaculator adapters.
- **EmuGUI migration complete** — the external file interface, extension/native transport, complete game-shortcut lifecycle, extracted application services, configurable emulator layer, secure scraper credentials, and optional-only HTTP adapter have passed their final feature-parity sweep. Future EmuGUI work is now ordinary product development rather than migration work.

### Validation

- All 345 WebHub JavaScript tests, all 52 EmuGUI tests, and all 42 native-host tests (plus 11 parameterised subtests) pass. The final parity suite covers every API route used by the external page plus disposable collection maintenance, metadata, scraping, artwork, POK, favourite, emulator, profile, credential, background-job, and read-only workflows. A real read-only pass loaded the configured three collections and all 12,933 games, returned emulator/profile/scraper/recent/POK/search data, and remained stable across native-service reload; port 8765 remained closed. The configured credentials contain no plaintext scraper secrets, both providers remain configured, and the live EightyOne 48K/128K and Spectaculator direct/current/new matrix passes through the template renderer. JavaScript/Python syntax checks pass, and Firefox extension `1.0.51` passes `web-ext lint` with zero errors and the existing native-host Python notice and installer-shell warning. No in-app browser target was available for an automated click-through.

## [0.11.218] — 2026-08-24

### Fixed

- **Local pages can be bookmarked** — canonical local `file://` page URLs, including EmuGUI's external `web/index.html`, are now accepted by the Add Bookmark dialog, Import Manager, and extension Inbox delivery. Local page bookmarks remain ordinary browser links; remote file shares, empty file roots, and executable/application targets are not enabled by this change.
- **Stable local URL storage** — local page paths containing spaces are stored in canonical percent-encoded form while existing HTTP/HTTPS bookmark behaviour remains unchanged.

### Validation

- Added bookmark-policy regression coverage for EmuGUI's exact local page URL, paths containing spaces, localhost file URLs, normal web URLs, and rejected remote-file, empty-file, script, data, and null-byte targets. All 345 JavaScript tests and changed-file syntax checks pass. Firefox extension `1.0.50` remains unchanged and passes `web-ext lint` with zero errors and the existing native-host Python notice and installer-shell warning. No in-app browser target was available for an automated click-through.

## [0.11.217] — 2026-08-24

### Changed

- **EmuGUI profile core extraction** — emulator-profile import, managed-copy refresh, editing, deletion, status calculation, rule normalisation, and explicit/automatic launch-profile selection now live in EmuGUI's transport-independent `emugui_core/profiles.py`. The existing HTTP and external file interfaces retain the same `server.py` compatibility functions while sharing one implementation.
- **Server-free launch/profile parity** — the generic file transport now has regression coverage for emulator-profile mutations, explicit launch choices, running-emulator choice payloads, and safe picker cancellation. EmuGUI's native executable/profile picker receives a five-minute interactive timeout at both the page and extension layers instead of expiring after roughly two minutes.

### Validation

- All 343 JavaScript tests, all 41 native-host tests (plus 11 parameterised subtests), and all 17 EmuGUI tests pass. A live read-only check loaded the extracted `EmulatorProfileService`, found both configured managed profiles, and resolved Bubble Bobble's explicit `Spectrum 48K` profile without launching an emulator or changing configuration. JavaScript and Python syntax checks pass, and Firefox extension `1.0.50` passes `web-ext lint` with zero errors and the existing native-host Python notice and installer-shell warning. No in-app browser target was available for an automated click-through.

## [0.11.216] — 2026-08-24

### Fixed

- **Large EmuGUI libraries load without native-message failure** — extension-backed EmuGUI API and artwork results now travel over short-lived, bounded native transfers instead of one oversized response. The background validates transfer identity, offsets, advertised size, chunk size, completeness, and JSON before returning the reconstructed result to the configured EmuGUI page.
- **Real Desasteron startup restored** — the initial 12,933-game response previously produced a roughly 17.3 MB native message and failed in EmuGUI's relay response handler. Compact serialization now delivers the current 15.9 MB payload in 41 responses whose largest native envelope is about 524 KB.

### Validation

- Added multi-chunk native and extension reconstruction tests, including cleanup after completion and API/artwork routing over the persistent connection. All 342 JavaScript tests, all 41 native-host tests (plus 11 parameterised subtests), and all 14 EmuGUI tests pass. A live read-only transfer reconstructed all 12,933 configured games from 41 bounded chunks. JavaScript syntax checks pass, and Firefox extension `1.0.49` passes `web-ext lint` with zero errors and the existing native-host Python notice and installer-shell warning. No in-app browser target was available for an automated click-through.

## [0.11.215] — 2026-08-24

### Added

- **Server-free external EmuGUI interface** — the canonical EmuGUI `web/index.html`, CSS, and JavaScript now run directly as a local page and relay their existing collection, metadata, scraper, profile, maintenance, launch, and artwork operations through the WebHub extension's persistent native connection. The EmuGUI interface remains entirely in its own repository, so frontend changes need only a page reload rather than an extension rebuild or reinstall.
- **Transport-neutral EmuGUI API** — EmuGUI exposes its current UI operations through a Python dispatcher shared by non-HTTP transports, plus a bounded collection-artwork reader. Its localhost server and unchanged fetch path remain available as an optional standalone development fallback.

### Changed

- **Open in EmuGUI no longer needs the manual server** — game shortcuts now open the configured EmuGUI `web/index.html` file with the existing selected-game/rebind handoff. The native host authorises the page by its canonical configured path, and the extension gives each registered EmuGUI tab an opaque session token.
- **Narrow extension boundary** — extension code contains only page authentication, namespaced message validation, bounded routing, and persistent-native transport. EmuGUI business rules and the complete UI stay external. Localhost fallback pages retain Send-to-WebHub delivery but cannot call privileged management RPCs.

### Validation

- Added exact-file authorization, per-tab registration, localhost privilege isolation, generic API relay, bounded artwork, real configured-collection, frontend transport, cancellation, and path-containment coverage. All 342 JavaScript tests, all 40 native-host tests (plus 11 parameterised subtests), and all 14 EmuGUI tests pass. JavaScript syntax checks and a live read-only request against the configured three-collection EmuGUI checkout passed. Firefox extension `1.0.48` passes `web-ext lint` with zero errors and the existing native-host Python notice and installer-shell warning. No in-app browser target was available for an automated click-through.

## [0.11.214] — 2026-08-24

### Added

- **Complete game-shortcut lifecycle** — game context menus in boards and Hub Search now offer **Open in EmuGUI**, **Reveal game file**, and **Rebind in EmuGUI…** alongside launch and forget. Open/rebind focuses an existing EmuGUI tab when possible and selects the shortcut's source game.
- **In-place EmuGUI rebinding** — a rebind handoff changes EmuGUI's button to **Update WebHub Shortcut**. Sending the selected emulator/profile updates the same device-local `gameKey` and pushes safe system, emulator, profile, and thumbnail presentation data back to every matching Hub card instead of creating an Inbox duplicate.
- **Actionable game states** — native status now distinguishes inactive library, missing game, missing emulator, missing profile, unbound, and unavailable conditions. Hub badges and launch errors present concise recovery-oriented labels while the underlying file paths and binding IDs remain behind the extension/native boundary.

### Validation

- Added native, extension-background, content-relay, page-bridge, Hub launcher, and EmuGUI frontend coverage for deep-linked selection, fixed-origin tab opening, reveal, in-place rebinding, update delivery, and precise failure states. All 338 JavaScript tests, all 38 native-host tests (plus 11 parameterised subtests), and all ten EmuGUI tests pass. Syntax checks passed for the changed Hub, extension, and EmuGUI JavaScript. Firefox extension `1.0.47` carries the lifecycle bridge. No in-app browser target was available for an automated click-through.

## [0.11.213] — 2026-08-24

### Changed

- **System-first game shortcuts** — game items now use their ZX Spectrum, Atari ST, Game Boy, SNES, ScummVM, DOSBox, MAME, or generic system emblem in the standard 20px favicon/application-icon position. The redundant badge beside the title has been removed, making game, application, and web links visually consistent.
- **Artwork-rich game tooltips** — hovering a game opens a 300px preview with its cached artwork displayed up to 170px high, followed by the game title, system, emulator, and launch profile.
- **Safe runtime labels** — compact game records now carry bounded emulator and profile display names for presentation while emulator IDs, profile IDs, executable paths, ROM paths, and commands remain device-local behind the opaque binding. Existing shortcuts backfill the labels during their next status refresh; shared-state schema version 6 preserves them.

### Validation

- Added regression coverage for system-icon placement, rich-tooltip layout and metadata, emulator/profile delivery and portable preservation, existing-item backfill, and continued exclusion of binding IDs from tooltip data. Live native reads resolve the current shortcuts to `EightyOne / Plus3` and `EightyOne / Spectrum 48K`. All 335 JavaScript tests and all 37 native-host tests (plus 11 parameterised subtests) pass; syntax checks passed for 50 Hub and extension JavaScript files, the extension manifest parsed successfully, and `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.46` carries the expanded safe game-status record.

## [0.11.212] — 2026-08-24

### Fixed

- **EmuGUI artwork now reaches game shortcuts** — the native bridge accepts bounded HTTPS PNG, JPEG, GIF, WebP, and AVIF artwork supplied by EmuGUI as well as collection-local images. Previously it rejected every remote scraper URL, leaving `thumbnailCache` empty even though artwork appeared in EmuGUI.
- **Existing shortcuts backfill missing thumbnails** — game-status requests fetch artwork only when the Hub item has no cached thumbnail, then persist it in shared presentation state. Exact-title games on the same system may reuse an artwork-bearing EmuGUI sibling without changing the bound game file or launch profile; this covers duplicate editions such as the current Ghostbusters entries.
- **Composite Spectrum identities** — memory labels such as `48K-128K` now resolve to ZX Spectrum rather than becoming an unknown platform.

### Validation

- Live bounded reads produced thumbnails for all three current Hub shortcuts: The Hobbit, Ghostbusters, and Bubble Bobble. Added remote-URL, HTTPS-only, missing-thumbnail request, exact-title/same-system fallback, and composite Spectrum regression coverage. All 334 JavaScript tests and all 37 native-host tests (plus 11 parameterised subtests) pass; syntax checks passed for 50 Hub and extension JavaScript files, the extension manifest parsed successfully, and `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.45` carries the thumbnail-aware status bridge.

## [0.11.211] — 2026-08-24

### Added

- **Game-system emblems** — game shortcuts now show a compact platform badge independently from their cover artwork. The initial emblem set covers ZX Spectrum, Atari ST, Game Boy, Super Nintendo, ScummVM, DOSBox, and MAME/arcade, with a generic game-system fallback for future EmuGUI adapters.
- **Portable system identity** — EmuGUI bindings and delivered Hub shortcuts now carry bounded `systemId` and `systemName` presentation fields. Existing shortcuts automatically backfill these fields from native game status, while legacy ZX Spectrum tags provide an immediate badge before the refresh completes.

### Changed

- **Future-ready game metadata** — native game records derive platform identity from EmuGUI system/platform metadata or known emulator IDs instead of hard-coding every game as ZX Spectrum. Shared-state schema version 5 preserves this safe presentation metadata without exposing ROM or emulator paths.

### Validation

- Added native and Hub regression coverage for system derivation, delivery, portable round trips, status backfilling, badge rendering, and all seven initial emblem mappings. All 334 JavaScript tests and all 35 native-host tests (plus ten parameterised subtests) pass; syntax checks passed for 50 Hub and extension JavaScript files, the extension manifest parsed successfully, and `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.44` carries the expanded native game record. The in-app browser had no available target for an automated visual pass.

## [0.11.210] — 2026-08-24

### Fixed

- **Cold EmuGUI launches no longer time out** — EmuGUI status, binding, game-status, launch, and forget requests now share the extension's persistent native-host connection. The loaded EmuGUI module and indexed collection remain warm instead of being rebuilt in a short-lived native process before every operation.
- **EightyOne survives slow collection startup** — EmuGUI operations now use a dedicated bounded two-minute timeout through both the Hub page bridge and native request queue. This replaces the generic five-second page and fifteen-second native limits that could disconnect the host—and terminate its newly launched EightyOne process—before a cold game launch completed.

### Validation

- Added regression coverage proving EmuGUI reads, binding creation, status, and launch use one warmed native connection and receive the dedicated timeout. All 331 JavaScript tests pass; syntax checks passed for 50 Hub and extension JavaScript files, the extension manifest parsed successfully, and `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.43` carries the persistent EmuGUI lifecycle fix.

## [0.11.209] — 2026-08-24

### Added

- **Send games from EmuGUI to WebHub** — EmuGUI now offers **Send to WebHub** in game details and the game context menu. The extension creates or reuses a device-local binding and delivers a compact shortcut to the active Hub Inbox with only its name, Hub tags, optional bounded thumbnail, and opaque `gameKey`.
- **First-class game shortcuts** — game items now render and launch from columns, ordinary folders, tab Inboxes, Hub Search, and the command palette. They participate in drag-and-drop, Send To, Inbox counts, locks, Undo, Trash, duplication, title/tag editing, and status refresh alongside bookmarks and applications.
- **Native EmuGUI game operations** — the persistent native host now supports binding creation, status, launch, and forgetting. Bindings retain stable library/game/emulator/profile IDs locally, reuse identical selections, enforce a bounded registry, and invoke the selected emulator profile during launch.

### Changed

- **Portable game safety** — portable bundles omit game bindings and omit thumbnail caches unless image caches are explicitly included. Every imported game receives a fresh unbound key, preventing portable data from acquiring an unrelated device-local approval by collision.
- **Game-aware state schema** — schema version 4 normalises compact game presentation fields and strips ROM paths, emulator paths, commands, and arguments from shared state.

### Validation

- All 330 JavaScript tests, all 34 WebHub native-host tests (plus three parameterised unsafe-link subtests), and all nine EmuGUI tests pass. Syntax checks passed for 50 Hub and extension JavaScript files, the extension manifest parsed successfully, and `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. A reversible binding create/status/forget check also passed against the configured Desasteron library without exposing filesystem paths; no emulator was launched during validation. Firefox extension `1.0.42` carries the game delivery and launch bridge.

## [0.11.208] — 2026-08-24

### Added

- **First EmuGUI service bridge** — the extension and persistent native host can now load an explicitly configured Morpheus EmuGUI checkout and request a path-free service summary. The ordinary Hub client receives only the active collection identity and collection/emulator/profile counts; native paths and the broader EmuGUI management surface stay behind the native boundary.
- **Transport-independent EmuGUI reads** — EmuGUI now exposes a bounded service contract for status, paginated game search, and individual game lookup. Its existing HTTP UI remains available through the original endpoints plus a temporary `/api/read-rpc` adapter during migration.

### Changed

- **Lazy EmuGUI startup boundary** — importing EmuGUI no longer constructs and scans the active game library. The standalone server still builds it during normal startup, while the extension can load lightweight capabilities without triggering a collection scan.

### Validation

- Added EmuGUI service and lazy-import regression coverage, native-host path filtering/configuration tests, extension routing coverage, and page-bridge coverage. All six EmuGUI tests, all 33 WebHub native-host tests (plus three parameterized unsafe-link subtests), and all 322 JavaScript tests pass. The native bridge also returned the real configured Desasteron status successfully without exposing filesystem paths. `web-ext lint` reports zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.41` carries the first EmuGUI capability.

## [0.11.207] — 2026-08-24

### Changed

- **Explicit application-drop boundary** — readable `.url` files and allowlisted launcher URIs remain true one-drop application links. Raw `.exe`, `.com`, and binary `.lnk` files deliberately continue through the native picker because Firefox exposes their name and contents but not the absolute Windows source path required for a stable device-local launch binding. This accepted platform limitation is now recorded in `Host-TODO.md` alongside the reason image drops can still be copied directly.

### Fixed

- **Icons for URI-only Steam drops** — Steam application links that arrive from Windows without `.url` icon metadata now resolve their numeric app ID and use Steam's bounded local per-game artwork cache. If the local cache has no usable image, the native host requests the matching official Steam library artwork. Existing icon-less bindings are upgraded automatically during their next status refresh.
- **Cell to Singularity icon** — the existing `steam://rungameid/977400` binding now resolves and caches its real local Steam icon without requiring the item to be removed and dragged in again. Only bounded image data is retained; Steam cache paths are neither returned to the page nor persisted with the binding.

### Validation

- Added native-host regression coverage for hashed Steam cache images, official artwork fallback, and automatic backfill of existing protocol-link icons. The live Cell to Singularity binding backfilled as a JPEG successfully. All 321 JavaScript tests across 40 files and all 31 native-host tests (plus three parameterized unsafe-link subtests) passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the existing native-host Python notice and installer-shell warning. Firefox extension `1.0.40` carries the Steam cache fallback.

## [0.11.206] — 2026-08-24

### Added

- **Real application icons** — executable and Windows shortcut approvals now extract their associated icon correctly and cache a bounded PNG on the Hub item. Dropped Steam `.url` links also read their `IconFile` metadata and use it only when it resolves to Steam's own `steam\\games\\*.ico` cache; the local hint path is never stored in the Hub database or native configuration.

### Fixed

- **Windows icon extractor input** — executable paths are now passed to PowerShell over standard input instead of as a malformed trailing command argument, fixing the generic application glyph seen on valid bindings such as Calibre.

### Validation

- Added regression coverage for safe Steam icon hints, rejected unrelated local icon paths, non-persistence of hint paths, and stdin-based Windows icon extraction. All 40 JavaScript test files and all 28 native-host tests (plus three parameterized unsafe-link subtests) passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories. Firefox extension `1.0.39` carries the icon relay and extraction fix.

## [0.11.205] — 2026-08-24

### Fixed

- **Application lifetime after launch** — launch requests now use the extension's long-lived native connection. Firefox closes a one-shot native-message host as soon as it replies; on Windows, applications started as children of that host could be torn down immediately, creating a silent apparent no-op. Executables and protocol handlers now remain alive after the launch response.

### Validation

- Reproduced the lifecycle fault with the real approved Calibre binding: three application processes appeared during the native request and disappeared with the one-shot host. Added an end-to-end background regression proving launch requests share the persistent native connection. All 40 JavaScript test files and all 26 native-host tests (plus three parameterized unsafe-link subtests) passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories. Firefox extension `1.0.38` carries the lifecycle fix.

## [0.11.204] — 2026-08-24

### Fixed

- **Windows launches that reported success but did nothing** — executable bindings now start as direct child processes with their application directory as the working directory. `.lnk`, `.url`, and allowlisted protocol bindings are dispatched through Windows Explorer, avoiding the ShellExecute return-without-visible-launch behaviour observed for both Calibre and Steam game cards. Both card clicks and **Launch application** use this shared backend.

### Validation

- Updated native launch regression coverage for direct executables and Explorer-dispatched Steam protocol links. All 40 JavaScript test files and all 26 native-host tests (plus three parameterized unsafe-link subtests) passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories. Firefox extension `1.0.37` carries the revised launch backend.

## [0.11.203] — 2026-08-24

### Fixed

- **True one-drop game shortcuts** — readable Windows `.url` files are now decoded directly from the drop, validated as an allowlisted game/application protocol, bound in the native host, and added to the target column without reopening a picker. Launcher URIs exposed directly by a desktop or shell drag use the same path; the Hub database still stores only the opaque device binding key.
- **Reliable Windows application launching** — application clicks and **Launch application** now use checked Windows Shell execution with the executable's own directory as its working directory. Shell failures propagate back to the Hub instead of being reported as successful no-ops; protocol links launch through their registered application handler.

### Changed

- **Honest fallback for opaque drags** — when Firefox supplies only a filename or an unreadable binary shortcut, the Hub explains the browser limitation before offering the native picker. Protocol-only application links no longer show an inapplicable **Reveal application** action. Firefox extension `1.0.36` adds the bounded application-link relay.

### Validation

- Added direct-drop parsing, protocol relay, device-local binding, allowlist rejection, and checked-launch regression coverage. All 40 JavaScript test files and all 26 native-host tests (plus three parameterized unsafe-link subtests) passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories.

## [0.11.202] — 2026-08-24

### Fixed

- **Desktop game shortcut drops** — Windows `.url` Internet Shortcuts such as Steam-created Baldur's Gate 3 links are now recognized from standard, Firefox URI, and Firefox native-file drag formats. Dropping one on a board column opens the native application picker with the shortcut name instead of silently consuming the drop; unsupported desktop files now show an explanation.

### Changed

- **Constrained URI launch support** — the native host accepts `.url` files only when their Internet Shortcut target uses an explicit game/application protocol allowlist (including Steam, GOG Galaxy, Epic, Ubisoft, EA/Origin, Battle.net, Xbox, and Heroic). Web URLs and arbitrary schemes remain bookmarks or are rejected as application targets. Firefox extension `1.0.35` includes the updated native picker and validation path.

### Validation

- Added drag-format and native URI-shortcut regression coverage. All 40 JavaScript test files and all 24 native-host tests passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories.

## [0.11.201] — 2026-08-24

### Added

- **First-class application shortcuts** — applications now live alongside bookmarks and folders with real application icons where the native platform can provide them, tags, locks, drag-and-drop movement, Inbox support, Hub Search results, and an Applications group in the command palette. The **Create Application Shortcut** command and board/folder context menus open an explicit native application picker; supported executable drops route through the same approval flow.
- **Device-local application approvals** — Hub items store only a random portable application key and display metadata. The native host keeps the executable path in its local configuration and exposes fixed approve, status, launch, reveal, rebind, and forget operations without page-supplied arguments, working directories, shell text, environment variables, or elevation.

### Changed

- **Portable transfer safety** — portable bundles omit application binding keys and local icon caches by default. Every imported application receives a fresh unbound key, preventing imported data from acquiring an existing device approval; the card then offers **Set up on this device**.
- **Application-aware navigation** — Inbox badges and panels count applications independently, application status badges distinguish checking, unbound, missing, changed, and unavailable states, and command queries such as `launch vscode` target application entries without adding them to bookmark Sets or Speed Dial.

### Validation

- Added application item, native approval/launch, bridge, state migration, search integration, portable-transfer, and Windows picker-injection regression coverage. All 40 JavaScript test files and all 21 native-host tests passed; syntax checks passed for 49 Hub and extension JavaScript files, both JSON manifests validated, and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories. The in-app browser had no active target for an automated visual pass. Firefox extension `1.0.34` adds the authenticated application-launcher bridge capability.

## [0.11.200] — 2026-08-24

### Added

- **Expanded useful-site catalogue** — Universal Search now includes Google Maps (`@maps`), Reddit (`@reddit`), npm (`@npm`), PyPI (`@pypi`), Docker Hub (`@docker`), SteamDB (`@steamdb`), itch.io (`@itch`), ProtonDB (`@proton`), PCGamingWiki (`@pcgw`), and Bandcamp (`@bandcamp`).

### Changed

- **Balanced provider grouping** — the new providers are organized under General, Development, Gaming, and Media while the small Google, DuckDuckGo, YouTube, and Wikipedia default set remains unchanged. Every addition is immediately available through `@` without expanding existing widgets’ persistent chip lists.

### Validation

- Added catalogue-presence and exact URL-construction coverage for all ten providers. All 39 JavaScript test files passed (316 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated interaction pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.199] — 2026-08-24

### Added

- **GOG provider** — added the DRM-free game catalogue to Universal Search’s Gaming presets with the `@gog` alias and the current GOG catalogue-query route.
- **Twitch provider** — added Twitch to the Media presets with the `@twitch` alias and its site-wide channel, category, and video search route.

### Validation

- Added URL-construction and catalogue-presence coverage for both providers. All 39 JavaScript test files passed (315 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated interaction pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.198] — 2026-08-24

### Added

- **Provider favicons** — Universal Search provider chips, `@` choices, web-search results, and settings summaries now show each site’s resolved favicon. Configured icon text remains visible as a resilient fallback while the favicon loads or when no remote icon is available.
- **Full `@` provider catalogue** — typing `@` now searches every built-in provider plus configured custom providers. Built-ins can be used immediately without adding them to widget settings, while configured providers retain priority on alias conflicts.

### Changed

- **Persistent versus transient providers** — widget settings continue to control the default provider and compact provider-chip list; selecting an unconfigured built-in from `@` applies only to that search and does not mutate saved configuration.

### Validation

- Added coverage for full-catalogue discovery, purpose filtering, transient built-in searches, configuration preservation, and favicon fallback behavior. All 39 JavaScript test files passed (314 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated interaction pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.197] — 2026-08-24

### Added

- **Discoverable provider shortcuts** — typing `@` in Universal Search now lists configured providers, filters them by name or alias as more characters are entered, and lets keyboard or pointer selection prepare an explicit provider search.
- **Searchable provider catalogue** — the Add/Edit Provider dialog can now filter the grouped preset library by provider name, alias, or purpose, while existing HTTPS custom-provider support remains unchanged.

### Changed

- **Provider ordering controls** — search providers can be moved up or down from the compact settings list, controlling their widget-chip and shortcut order without replacing existing saved configuration.

### Validation

- Added provider-picker, catalogue-filter, and saved-configuration migration coverage. All 39 JavaScript test files passed (312 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated interaction pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.196] — 2026-08-22

### Fixed

- **Weather settings location validation** — closing the Weather widget settings with **Done** now accepts the numeric coordinates stored by a valid location selection. Latitude and longitude remain internal to the location picker rather than appearing as manual settings.

### Validation

- Added regression coverage for both a selected Open-Meteo location and the empty unconfigured location state. All 39 JavaScript test files passed (309 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests and the example widget manifest validated, and diff checks passed. The in-app browser had no active target for an automated modal pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.195] — 2026-08-22

### Added

- **Widget movement between tabs and boards** — board-compatible widgets can now be dropped onto tab names to move them into that tab's Inbox. Widget context menus also provide a nested **Send to** → board → tab destination picker from board, Inbox, sidebar, and search-result placements.

### Changed

- **Widget-aware Inboxes** — Inbox badges and panels now count and render widgets alongside bookmarks and folders. Moves preserve the widget ID, configuration, portable data, and browser-local cache namespace while safely clearing only the active runtime for its former placement.
- **Atomic destination handling** — widget moves reuse one validated mutation path with Undo support and reject locked, unavailable, unsupported, duplicate, and same-Inbox destinations without removing the source widget.

### Validation

- Added regression coverage for same-tab and cross-board moves, sidebar sources, configuration and identity preservation, widget Inbox counts, duplicate/stale/locked destination rejection, runtime cleanup wiring, context-menu destinations, and Undo snapshot restoration. All 39 JavaScript test files passed (308 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.194] — 2026-08-22

### Changed

- **Conventional thumbnail placement** — Nexus mod title images now appear on the left side of each card, with the title and existing metadata retained to their right.
- **Compact adult-content label** — the Adult badge now appears before the mod title on the same row instead of consuming a separate content row.

### Validation

- Added layout regression coverage for left-hand image ordering, responsive image columns, and Adult-badge placement before the title. All 39 JavaScript test files passed (306 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.193] — 2026-08-22

### Added

- **Nexus mod title images** — mod cards now show the provider’s primary title image on the right with the existing title, author, version, date, endorsement/download counts, badges, and optional summary retained in a left-hand text rail. Images are lazy-loaded, restricted to HTTPS Nexus Mods hosts, and collapse cleanly when missing or unavailable.

### Changed

- **Scrollable 30-mod feeds** — each tab now caches up to 30 mods. **Mods displayed** controls a fixed 5- or 10-row viewport while the scrollbar exposes the remaining results instead of truncating the feed.
- **Read-only recent-mod query** — Recently added uses Nexus Mods’ read-only GraphQL listing query to move beyond the legacy ten-item REST feed, with the legacy endpoint retained as a fallback. Recently updated keeps the confirmed file-update ordering and resolves up to 30 visible detail records from the stable REST API.

### Validation

- Added regression coverage for Nexus-hosted image normalization, GraphQL request boundaries and sorting, 30-item feed limits, viewport-height calculation, more-than-ten-item recent and updated feeds, REST updated-order preservation, image layout, and lazy image behavior. All 39 JavaScript test files passed (306 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, the provider GraphQL CORS preflight accepted the required read-only POST headers, and diff checks passed. The in-app browser had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.192] — 2026-08-22

### Changed

- **Single-game Nexus trackers** — each Nexus Mods Tracker now retains one selected game, uses that game as its default widget heading, replaces the current selection when another game is chosen, and removes the redundant game badge from every mod row. Existing multi-game widgets retain their first configured game.
- **Scrollable mod feeds** — Recently added and Recently updated results now scroll inside a bounded list while the heading, tabs, quota, and attribution remain visible. The existing 5/10 selector is now labelled **Mods displayed**.

### Validation

- Added regression coverage for single-game normalization, default and custom headings, one-game request/cache behavior, the renamed display setting, and scroll-container styling. All 39 JavaScript test files passed (306 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.191] — 2026-08-22

### Fixed

- **Nexus Mods feed accuracy** — removed inaccessible, hidden, and deleted mods instead of rendering “Unavailable” placeholders, and aligned the Updated tab with Nexus Mods file-update activity rather than the separate latest-mod-metadata feed.
- **Nexus Mods update ordering** — update records are now ordered by `latest_file_update`, with visible mod details resolved from the read-only API so the widget follows the site’s Updated ordering more closely.

### Validation

- Added regression coverage for file-update ordering, update-period query construction, detail lookup, and omission of unavailable or missing mods. All 39 JavaScript test files passed (306 tests), all 17 native-host tests passed, syntax checks passed for 49 Hub, extension, and widget-template JavaScript files, both JSON manifests validated, and diff checks passed. The in-app browser still had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.190] — 2026-08-22

### Added

- **Nexus Mods Tracker** — added a read-only Gaming widget for selecting up to eight games and browsing compact recently added or recently updated mod feeds, with direct Nexus Mods page links, adult-content filtering, locally remembered feed selection, and configurable result limits.
- **Provider-aware game picker** — added a cached, searchable Nexus Mods game catalogue with exact-domain fallback entry so widgets can still be configured while the provider is unavailable.

### Changed

- **Secure Nexus Mods credential** — added a stable global Nexus Mods API key entry to the shared secure-credential flow and documented the provider requirement that personal keys remain limited to personal/testing use until a public-facing release is registered.
- **Conservative provider access** — bounded catalogues and feed responses, defaulted automatic refresh to three hours, enforced a five-minute manual-refresh floor, retained stale results across partial failures, and added explicit handling for rejected keys, unavailable games, removed mods, rate limits, and provider outages. The tracker exposes no download, install, tracking, endorsement, or other mutation path.

### Tests

- Added Nexus payload normalization, multi-game request/header, browser-local cache, refresh-floor, stale-fallback, read-only-boundary, global-secret, and Gaming-category coverage. All 39 JavaScript test files passed (305 tests), all 17 native-host tests passed, syntax checks passed for 48 Hub and extension JavaScript files, the widget manifest example and extension manifest JSON validated, Hub `0.11.190` version fallbacks aligned, the provider CORS preflight accepted every required request header, and diff checks passed. The in-app browser had no active target for an automated visual pass; extension code was unchanged, so its version remains `1.0.33` and `web-ext lint` was not required by the release checklist.

## [0.11.189] — 2026-08-22

### Changed

- **Consolidated future roadmap** — moved the remaining application-launcher, Nexus Mods tracker, and Universal Search settings/catalogue work from the temporary widget-ideas list into the maintained project TODO with implementation, security, portability, and validation considerations.
- **Retired completed ideas list** — removed the temporary widget-ideas document after confirming that football tracking, Global Hazards, notifications, and widget categorisation are delivered, while the previously dropped Spotify and equalizer ideas remain out of scope.

### Tests

- Audited the consolidated release against the Hub and extension release checklist. All 38 JavaScript test files and all 17 native-host tests passed; syntax checks passed for 46 Hub and extension JavaScript files; the widget manifest example validated; Hub `0.11.189` and extension `1.0.33` versions aligned; and diff checks passed. `web-ext lint` reported zero errors with the two existing bundled native-host packaging advisories.

## [0.11.181] — 2026-08-21

### Added

- **Global Hazards widget** — added an interactive MapLibre world map for earthquakes, wildfires, tropical cyclones, volcanoes, floods, tsunamis, landslides, and droughts. The column widget combines current NASA EONET, USGS, and GDACS data into clustered category markers, storm tracks, a filterable event list, and a detail view with source attribution and official links.
- **Regional hazard alerts** — an optional watch location can inherit the first configured Weather widget or use a searched custom location. Explicitly enabled notifications fire only for newly observed events inside the configured radius and at or above the selected severity while the Hub is running.

### Changed

- **Bounded multi-provider refresh** — hazard requests use configurable 7–60 day windows, a configurable earthquake threshold, managed 15–60 minute scheduling, partial-provider fallback, and a 24-hour local SDK cache. Duplicate low-severity GDACS events are suppressed where EONET or USGS provides the primary record; GDACS remains authoritative for tsunamis and tropical cyclones and contributes orange/red alerts for other types.
- **Privacy and portability** — provider responses, seen-event IDs, map view state, and alert state remain browser-local and outside the shared Hub database. No API key is required.

### Tests

- Added normalization, severity, storm-track, source-priority, bounded-request, partial-provider, regional-notification, asset-order, responsive-style, category-registration, and script-symbol coverage. All 38 JavaScript test files, syntax checks, diff checks, and extension lint passed; lint retained the existing native-host packaging notice/warning. The in-app browser had no active preview target for an automated visual pass.

## [0.11.168] — 2026-08-21

### Fixed

- **Sportmonks relay diagnostics** — preserved bounded provider error responses through the extension bridge instead of replacing a relay-side authentication failure with the browser's generic CORS network error. Scottish Premiership failures now explain when Firefox extension 1.0.33 must be reloaded and distinguish that from an invalid Sportmonks token.

### Tests

- Added Sportmonks CORS/relay guidance and bounded provider-error propagation coverage. All 37 JavaScript test files and all 17 native-host tests passed; syntax and diff checks passed. `web-ext lint` reported zero errors with the existing native-host Python notice and installer shell-file warning.

## [0.11.167] — 2026-08-21

### Added

- **Multi-provider Football Tracker** — added Sportmonks support for the Scottish Premiership and Danish Superliga, plus API-Football support for the FA Cup, English League Cup, Scottish Cup, Scottish League Cup, DFB-Pokal, Copa del Rey, Coppa Italia, Coupe de France, KNVB Beker, Taça de Portugal, Europa League, and Conference League.
- **International tournaments** — added the FIFA World Cup and UEFA European Championship through football-data.org's free Tier One coverage.
- **Global football credentials** — added Sportmonks and API-Football entries to Settings → API Keys with native Credential Manager storage and authenticated extension relay support in Firefox extension 1.0.33.

### Changed

- **Provider-priority routing** — football-data.org remains the first choice, Sportmonks supplies its free Scottish coverage, and API-Football is called only for competitions unavailable on those free routes. Same-day duplicate widgets share provider loads, provider metadata is cached for seven days, and fixtures/tables retain daily/manual refresh behaviour.
- **Tournament presentation** — knockout cups omit the irrelevant table tab while group-based UEFA and international competitions retain tables where the provider supplies them.

### Tests

- Added provider allocation, authentication-header isolation, metadata/request caching, duplicate-load coalescing, API-Football normalization, Sportmonks normalization, competition catalogue, and global credential coverage. All 37 JavaScript test files and all 17 native-host tests passed; syntax and diff checks passed. `web-ext lint` reported zero errors with the existing native-host Python notice and installer shell-file warning. The in-app browser target was unavailable for automated visual verification.

## [0.11.158] — 2026-08-17

### Added

- **Private local Translator** — added a responsive board/sidebar Translator for English↔German using Mozilla's Bergamot WASM engine. It supports direction swapping, copy/clear controls, Ctrl/Cmd+Enter translation, optional recent history, and model management in widget settings.
- **Verified offline models** — each direction is installed on demand from Mozilla through a fixed Firefox-extension allowlist, downloaded in bounded chunks, verified against pinned SHA-256 hashes, and stored in a quota-limited browser-local IndexedDB asset cache. Once installed, translation runs entirely in a dedicated local worker.
- **Large SDK asset cache** — added an explicitly declared `assetCache` capability and IndexedDB gateway for sizeable browser-local binary resources that must remain outside portable Hub state and the small local-storage cache.

### Changed

- **Privacy-first persistence** — source text, translated text, history, model binaries, and runtime state never enter the shared Hub database. Text retention and recent history are disabled by default and remain local to the current browser when enabled.
- **Firefox extension 1.0.30** — added the authenticated, fixed-purpose Mozilla translation-model chunk relay. Arbitrary URLs are not accepted, partial-content responses are validated, and redirects and credentials are disabled.

### Tests

- Added Translator coverage for descriptor/privacy boundaries, pinned model manifests, WASM integrity, optional text retention, responsive/document integration, the fixed authenticated extension relay, and SDK binary-cache ownership, quota, retrieval, and removal. A verified Mozilla English→German model completed a real Bergamot inference locally. All 228 JavaScript tests and all 17 native-host tests passed; JavaScript syntax and diff checks passed. `web-ext lint` reported zero errors with the two existing native-host packaging advisories. The in-app browser target was unavailable for automated visual verification.

## [0.11.157] — 2026-08-17

### Added

- **Persistent Media Watchlist view state** — Media Watchlist now remembers which movie or series details are expanded, the active season tab for each series, and whether Specials are visible after the Hub reloads.

### Changed

- **Local-only viewing position** — view state is stored through the bounded widget cache rather than the portable database, so personal navigation choices remain browser-local. Deleted records are pruned and provider responses, loading/error state, and loaded episode payloads are excluded.

### Tests

- Added coverage for local view-state round trips across runtime recreation, movie and series expansion, active season and Specials restoration, deleted-record pruning, season bounds, and exclusion of transient provider data. All focused Media Watchlist, SDK, settings, and global-symbol tests passed; native-host persistence passed 17 of 17 tests. The stale RSS manifest-version assertion was updated for extension 1.0.29, bringing all 34 JavaScript test files back to green. All 39 source JavaScript files and diff checks passed.

## [0.11.156] — 2026-08-17

### Fixed

- **Language-path episode lookup** — episode lookups now derive their effective language consistently from the Fandom community URL as well as the editable language field. A canonical path such as `/de` takes precedence over blank or stale `en` metadata for normalization, localized TMDB prefetching, cache access, context-menu labels, and final search construction.
- **X-Files German lookup** — `akte-x.fandom.com/de` now requests German season metadata and searches for the localized episode title instead of allowing the English title to leak back in through an empty language-field fallback. For season 5 episode 4, this targets the German title used by the wiki's season article.

### Tests

- Added regression coverage for blank and stale language metadata on `/de` communities, canonical language precedence during record normalization, and language-neutral fallback searches. All focused Media Watchlist tests passed; native-host persistence passed 17 of 17 tests. 33 of 34 JavaScript test files passed overall, with the unrelated RSS suite still expecting extension 1.0.27 while the existing manifest is 1.0.29. All 39 source JavaScript files and diff checks passed.

## [0.11.155] — 2026-08-17

### Fixed

- **Localized episode wiki searches** — non-English Fandom lookups now prefetch the matching TMDB season in the wiki's language and search using only the localized episode title. This avoids MediaWiki's all-terms matching rejecting German results because an English episode title was included. When no localized title is available, the search falls back to the language-neutral `SxxExx` identifier.

### Changed

- **Compact localized cache** — translated lookup metadata remains browser-local and stores only episode numbers and names, once per visible season and wiki language. It is never added to the portable watchlist database.

### Tests

- Added coverage for TMDB language-tag normalization, translated German lookup terms, language-path search URLs, language-neutral fallbacks, request deduplication, and local-only translated season caching. All focused Media Watchlist, SDK, widget-category, API-key, and global-symbol tests passed; native-host persistence passed 17 of 17 tests. 33 of 34 JavaScript test files passed overall, with the unrelated RSS suite still expecting extension 1.0.27 while the existing manifest is 1.0.29. All 39 source JavaScript files and diff checks passed.

## [0.11.154] — 2026-08-17

### Added

- **Episode wiki lookup** — right-clicking an episode in Media Watchlist now opens a context menu with one lookup action for every Fandom community attached to that series. Searches include the series title, padded season/episode identifier, and episode name; language labels and the preferred-wiki marker make similar sources easy to distinguish.

### Changed

- **Reusable context-menu actions** — the shared context-menu renderer now accepts internal callback actions, allowing self-contained widgets to add safe contextual commands without adding widget-specific cases to the global action dispatcher.

### Tests

- Added coverage for English and language-path Fandom search URLs, episode search terms, invalid-community rejection, episode-row context-menu wiring, safe new-tab behavior, and callback-enabled shared context menus. Focused Media Watchlist, widget-category, and global-symbol tests passed; native-host persistence passed 17 of 17 tests. 33 of 34 JavaScript test files passed overall, with the unrelated RSS suite still expecting extension 1.0.27 while the existing manifest is 1.0.29. All 39 source JavaScript files and diff checks passed.

## [0.11.153] — 2026-08-17

### Added

- **Multi-wiki Fandom links** — each Media Watchlist title can now link to multiple Fandom communities, so sources such as English and German editions or Memory Alpha and Memory Beta can coexist. Each source has an editable label and language, can be reordered or selected as the default, and appears inside one compact `Wikis (n)` menu on the live card.
- **Assisted article matching** — the settings manager verifies an HTTPS Fandom community through its wiki API, searches that community for the title, and lets the user select or change the linked article. Community-home links remain available when no exact article is selected, and a separate discovery link helps locate candidate communities.

### Changed

- **Portable watchlist format** — export format version 3 includes the bounded multi-wiki metadata while remaining compatible with older imports. Fandom search responses stay in the local widget cache; no Fandom credential is required or stored.
- **Narrow network capability** — Media Watchlist network access now declares only TMDB plus the `fandom.com` community domain family, with HTTPS validation, bounded responses, and no arbitrary user-configured hosts.

### Tests

- Added coverage for HTTPS/domain validation, language-path API derivation, duplicate removal, single-default normalization, article URL generation, API verification/search, local search caching, bounded SDK requests, settings controls, compact card links, and export versioning. All focused Media Watchlist, API-key, SDK, settings, layout, category, and global-symbol tests passed; native-host persistence passed 17 of 17 tests. 33 of 34 JavaScript test files passed overall, with the unrelated RSS suite still expecting extension 1.0.27 while the existing manifest is 1.0.29. JavaScript syntax and diff checks passed; an in-app browser target was unavailable for visual automation.

## [0.11.149] — 2026-08-17

### Changed

- **Central API key management** — added TMDB and football-data.org credentials beside NASA in Settings → API Keys. Media Watchlist and Calendar now consume those shared global credentials instead of asking for separate tokens in each widget instance; private calendar URLs remain source-specific.
- **Credential migration** — existing per-widget TMDB and football-data.org tokens migrate into their global Windows Credential Manager entries on startup, after which obsolete instance-level entries are removed. Browser-storage fallback values remain excluded from portable exports.
- **Independent key saving** — each API key now has its own debounced save operation, so editing one service cannot cancel another service's pending update.

### Tests

- Added coverage for the centralized API-key fields, shared provider lookup, removal of per-widget token controls, legacy instance-key discovery/migration, independent key saving, and continued source-specific storage for private calendar URLs. Passed all 41 relevant settings, state, SDK, provider, Calendar, and Media Watchlist tests plus JavaScript syntax, version, and diff checks.

## [0.11.148] — 2026-08-17

### Fixed

- **Git Workspace terminal action** — Windows now opens approved repositories in Windows Terminal when available, with visible PowerShell and Command Prompt fallbacks. Launches use fixed argument lists and the approved working directory without interpolating repository paths into shell commands.
- **Native action feedback** — failed folder, terminal, file-open, and file-reveal requests now surface the native host error instead of silently appearing to succeed.

### Tests

- Added native launcher coverage for Windows Terminal selection, special-character paths, and the visible PowerShell fallback, plus page-bridge coverage for native action errors. Passed all 17 native-host tests and all 3 page-bridge tests plus syntax and diff checks; `web-ext lint` reported no errors (only the existing native-host Python notice and installer shell-file warning).

## [0.11.147] — 2026-08-17

### Fixed

- **Native folder approval** — corrected the Git Workspace and Recent Downloads folder picker request to pass a numeric timeout instead of an options object, preventing the immediate `NaN seconds` timeout. Interactive folder selection now remains open for up to five minutes, with the page relay allowing a small response margin; invalid native timeout values now safely fall back to the standard timeout.

### Tests

- Added extension and page-bridge regression coverage proving directory approval uses finite numeric timeouts and returns the approved opaque directory handle. Passed all 21 relevant bridge/background tests plus JavaScript syntax and diff checks; `web-ext lint` reported no errors (only the existing native-host Python notice and installer shell-file warning).

## [0.11.145] — 2026-08-17

### Added

- **Service Monitor** — added HTTPS endpoint checks with expected-status and text/JSON assertions, bounded direct requests plus Firefox relay fallback, response timing, local uptime history, visibility-aware scheduling, failure backoff, manual refresh, and optional outage notifications.
- **System Monitor** — added configurable aggregate CPU, memory, disk, network, uptime, battery, and platform cards with warning thresholds and bounded browser-local graphs. The native host returns only requested aggregate fields and the widget explains unavailable platform metrics.
- **Git Workspace** — added user-approved repository folders, branch/detached state, clean/dirty and staged/unstaged counts, ahead/behind state, last commit, sanitized remote links, and fixed folder/terminal actions without arbitrary shell input.
- **Media Watchlist** — added portable film/series records with watched state, progress, ratings, notes, notification preferences, provider-independent import/export, optional securely stored TMDB matching, local metadata caches, and an opt-in read-only Calendar source for upcoming releases and episodes.
- **Recent Downloads & Files** — added approved-directory views with extension, age, count, and bounded-recursion filters; browser-local result caches; safe relative metadata; and containment-checked fixed Open/Reveal actions.
- **Universal Search Launcher** — added local bookmark, board, tab, folder, Set, tag, widget, and command matching alongside direct URL navigation and configurable HTTPS web providers with aliases, icons, keyboard control, and optional local recents.

### Changed

- **Native SDK boundary** — added a declared `WidgetSDK.nativeHost` gateway plus opaque native directory approvals, fixed-purpose system/Git/file commands, and matching extension capabilities. Approved filesystem paths remain in native configuration and never enter portable widget state.
- **Calendar integration** — Calendar can now merge opted-in Media Watchlist dates as a local read-only source.
- **Release versions** — bumped the Hub to 0.11.145 and the Firefox extension to 1.0.27 for the expanded relay/native protocol.

### Tests

- Added focused suites for all six widgets plus native-host coverage for aggregate-metric privacy, approval-purpose isolation, Git parsing/remote sanitization, bounded recent-file enumeration, and path containment. Passed all 200 JavaScript tests and all 15 native-host tests; syntax and diff checks passed, and `web-ext lint` reported no errors (only the expected bundled native-host/installer notices).

## [0.11.144] — 2026-08-17

### Changed

- **SDK-owned widget integrations** — routed standalone widget HTTP requests through declared-domain checks, concurrency and response-size limits, timeouts, and teardown-aware abort handling. RSS Reader and Calendar fallbacks plus Saved Sessions browser operations now use the shared extension-relay gateway, while Calendar secrets use the SDK credential boundary.
- **Unified browser-local caches** — moved NASA APOD, Weather, Weather Map, ISS Tracker, RSS Reader, IP Info, and Calendar runtime caches and view preferences into quota-managed SDK storage. Existing legacy `localStorage` entries migrate automatically on first use, and NASA APOD payloads no longer live in portable shared widget data.
- **Managed visual runtime** — added cancellable SDK animation frames and moved Weather Map playback/rain/resize work, ISS resize work, Calendar agenda positioning, IP speed-test timeouts, and Saved Sessions rename focus onto shared scheduler/frame lifecycle services.

### Tests

- Added NASA APOD persistence-boundary and migration coverage plus SDK tests for animation-frame teardown, legacy-cache migration, extension relay, secure credentials, and request abortion. Passed all 183 JavaScript regression cases, all standalone widget boundary and syntax checks, and all 11 native-host tests.

## [0.11.143] — 2026-08-17

### Changed

- **Standalone built-in widget modules** — extracted NASA APOD, Weather, Weather Map, ISS Tracker, Astronomy & Night Sky, RSS Reader, and IP Info from the legacy widget catalogue into dedicated JavaScript and CSS modules, preserving their existing behaviour and ordered classic-script loading.
- **Module-owned runtime lifecycle** — Weather Map and ISS now expose their own context cleanup and resize hooks, while every extracted stateful widget owns disposal of its private runtime maps, browser-local caches, timers, map instances, and saved views. The shared widget framework no longer contains widget-specific cleanup paths.
- **Smaller legacy catalogue** — `source/widgets.js` now contains the common framework and lightweight Clock, Countdown, Notes, To-do, and Image widgets, making subsequent SDK service migrations and widget development more isolated.

### Tests

- Updated all affected widget suites to load and inspect the standalone modules, added ordered module-boundary coverage, and passed all 177 JavaScript regression cases, relevant syntax and combined classic-script checks, and all 11 native-host tests.

## [0.11.142] — 2026-08-17

### Added

- **Saved Sessions widget** — added responsive column and sidebar views for named browser sessions, including tab counts, created and last-launched times, current favicon previews, group-colour indicators, and clear Firefox bridge availability messaging.
- **Complete session management** — sessions can be captured from the active tab, current window, selected tabs, current group, or recently closed tabs; replaced from a fresh capture; appended with unique current tabs; renamed inline; deeply duplicated; safely launched; and deleted with confirmation. Launches above ten tabs require an additional confirmation.
- **Graceful launch fallback** — when the Firefox session bridge is unavailable, existing portable URLs can still open in order through a user-triggered browser fallback, with an explicit warning that group and pinned state cannot be restored.

### Changed

- **Portable session metadata** — shared session records now preserve `updatedAt` and `lastLaunchedAt`, deduplicate fragment/tracking variants while retaining order, and continue to exclude transient browser tab/window/group IDs and cached favicon data. Hub Tools and every Saved Sessions widget refresh from the same normalized records.
- **Favicon previews** — session previews reuse the Hub's browser-local origin resolution cache without persisting temporary session favicon data or triggering redundant shared-database saves.

### Tests

- Added coverage for portable sanitization, duplicate and unsupported URLs, missing capture permissions, create/replace/append identity, partial launch failures, unsupported grouping, browser fallback, large-launch confirmation, deep duplication, shared metadata migration, Hub Tools synchronization, SDK metadata, favicon boundaries, placement menus, and responsive assets. Passed all 176 JavaScript regression cases, relevant syntax/diff checks, and all 11 native-host tests. An in-app browser target was unavailable for visual verification.

## [0.11.141] — 2026-08-17

### Added

- **Focus Session widget** — added responsive column and sidebar layouts with Pomodoro, Deep Work, Short Sprint, and custom focus/break timing; start, pause, resume, skip, and reset controls; configurable long-break cadence; optional automatic phase progression; recent phase history; and local daily session/minute totals.
- **Focus launch helpers** — a session can optionally open a selected Set or nested bookmark folder once at the start, with URL deduplication, missing/empty-target feedback, and confirmation before opening more than ten bookmarks.
- **Calendar and notification awareness** — Focus can warm configured Calendar widgets and warn when a timed event overlaps the current focus window without changing calendar sources. Phase-complete notifications remain off by default and request browser permission explicitly when enabled.

### Changed

- **Drift-free local timer lifecycle** — running phases persist an absolute deadline in the Widget SDK's quota-limited local cache, reconcile overdue phases after reload or sleep, and keep timer state, history, totals, and session progress outside the shared Hub database. Independent widget instances retain isolated runtime state.

### Tests

- Added coverage for absolute deadlines, pause/resume, reload and overdue recovery, automatic short/long-break sequences, skip/reset behavior, daily totals, timed Calendar conflicts, granted/denied notifications, Set and nested-folder launches, cache boundaries, multiple widget instances, SDK metadata, placement menus, and responsive assets. Passed all 165 JavaScript regression cases, relevant syntax/diff checks, and all 11 native-host tests. An in-app browser target was unavailable for visual verification.

## [0.11.139] — 2026-08-17

### Added

- **Calculator and Converter widget** — added a standalone Phase 3 widget for board columns and the sidebar, with a safe local expression parser, operator precedence, parentheses, powers, percentages, common scientific functions, memory controls, copyable results, and a bounded browser-local history.
- **Comprehensive conversions** — added explicit source/target conversion for length, mass, temperature, duration, decimal and binary storage, angles, ISO/Unix dates, and selected IANA time zones. Time-zone conversion detects nonexistent daylight-saving transition times instead of silently changing them.
- **Command-palette calculation** — expressions prefixed with `=` now use the same parser in the command palette, with Enter copying a valid result and clear feedback for incomplete or invalid expressions.

### Changed

- **SDK-native widget state** — Calculator runtime values, memory, history, and view choices use the Widget SDK's quota-limited local cache and remain outside the shared Hub database. Settings cover the starting mode, conversion family, significant-digit precision, and history visibility.

### Tests

- Added regression coverage for precedence, powers, unary values, contextual percentages, invalid and unsafe input, decimal commas, precision and extreme values, every conversion family, daylight-saving gaps, clipboard behavior, local-state boundaries, SDK metadata, responsive assets, placement menus, and command-palette results. Passed all 150 JavaScript regression cases, relevant syntax/diff checks, and all 11 native-host tests. An in-app browser target was unavailable for visual verification.

## [0.11.138] — 2026-08-17

### Added

- **Activity views in Essentials** — the sidebar Essentials pane can now cycle through Essentials, Recently Opened, Most Used, Neglected, and Newly Added without creating a separate widget or duplicating bookmarks. The centred view label opens a direct-selection menu, while previous/next chevrons provide one-click cycling.
- **Compact read-only activity grid** — activity views reuse the configured Essentials slot count and favicon layout, show local open counts in Most Used, refresh after an open, and expose only Open and Locate context actions. Neglected means previously opened but untouched for 90 days; Never Opened remains in the complete Smart Views panel.

### Changed

- **Local view preference** — the selected Essentials mode is stored only with browser-local activity metadata, survives reloads and statistics resets, and never enters the shared Hub database. Disabled activity tracking produces a clear empty state while Newly Added remains available from local inventory metadata.

### Tests

- Added regression coverage for Neglected thresholds, forward/backward view cycling, local preference persistence, read-only activity rendering, controls, styling, and retained privacy boundaries. Passed all 139 JavaScript regression cases, the Phase 1 and Phase 2 feature scripts, relevant syntax checks, and all 11 native-host tests. An in-app browser target was unavailable for visual verification.

## [0.11.137] — 2026-08-17

### Added

- **Widget and Integration SDK foundation** — added a versioned descriptor contract covering identity, placement, defaults, settings schemas, lifecycle hooks, migrations, responsive hints, and declared integration capabilities. All 13 current widgets are normalized as trusted built-ins while future local packages remain explicitly opt-in and untrusted.
- **Shared widget runtime services** — added visibility-aware scheduling with error backoff, bounded/concurrency-limited network requests with declared-domain checks, quota-limited expiring local caches, standard unavailable/error states, settings-draft validation, state migration, and centralized teardown. Existing widget render, reload, scheduling, settings, state-loading, and disposal seams now pass through the SDK.
- **Developer kit** — added a documented local widget template, stylesheet, example manifest, standalone manifest validator, browser fixture harness, and contract tests for registration, trust, drafts, migrations, persistence boundaries, cleanup, networking, and unavailable capabilities.

### Tests

- Passed all 139 JavaScript regression cases, the Phase 1 and Phase 2 feature scripts, Widget SDK manifest validation, relevant syntax checks, and all 11 native-host tests. An in-app browser target was unavailable for visual fixture verification.

## [0.11.135] — 2026-08-17

### Added

- **Inbox Automation Rules** — added ordered, importable rules for hostname, URL/path, title, source, tags, and duplicate conditions, with tagging, renaming, routing, URL normalization, duplicate rejection, stop/continue semantics, target validation, and a no-change dry-run preview. The same evaluator handles manual Inbox/Import Manager batches and automatic Firefox deliveries with one-step Undo.
- **Firefox session workflows** — extension 1.0.26 captures active, window, selected, grouped, and recently closed tabs without persisting browser IDs. Sessions can be saved or captured to an Inbox, new folder, or Set; folders, Sets, board tabs, and saved sessions launch with URL deduplication, stagger controls, large-batch confirmation, partial-failure reporting, and tab-group fallback.
- **Backup timeline and selective restore** — added contained native-host APIs for integrity-checked backup enumeration and chunked reads, summary comparison, explicit safety backups, and rollback-safe restore of the full Hub or selected boards, Sets, tags, settings, Import Manager data, bookmarks, and folder subtrees.
- **Scoped portable transfer** — added sanitized, versioned bundles for boards, tabs, folders, Sets, Smart View results, Inbox contents, and selected items, with optional dependencies/assets/usage, an included/omitted manifest, preview, merge/copy/replace modes, destination selection, duplicate filtering, ID remapping, and Undo.

### Changed

- **Hub Tools** — Phase 2 lives in a new Workflows tab inside the existing Hub Tools panel, avoiding another sidebar icon and preserving the single-row icon bar.
- **State schema 2** — automation rules and sanitized saved sessions are now normalized persisted records; older databases migrate non-destructively.

### Tests

- Added Phase 2 core coverage for ordered/multiple rule matches, duplicate rejection, conflicts, session sanitization/deduplication, portable round trips and sanitization, folder export, summary comparison, and collision-safe selective restore.
- Added extension tests for private/internal tab exclusion, browser-ID removal, launch deduplication, group fallback, and partial failures; expanded native tests for backup integrity, forced safety copies, containment, corrupt files, and concurrent chunk reads.
- Passed all 132 JavaScript regression cases, 11 native-host persistence tests, JavaScript/Python syntax checks, and extension lint validation.

## [0.11.131] — 2026-08-17

### Added

- **Bookmark Maintenance Centre** — added a canonical cross-Hub bookmark inventory with scoped exact-host URL migration, configurable duplicate analysis and merging, tracking-parameter cleanup, missing-favicon refresh, and previewed/confirmed batch changes using one Undo snapshot.
- **Categorized link health** — extension 1.0.24 adds bounded Hub-authenticated URL checks, cancellable browser-local scans, redirect acceptance, local exclusions, and distinct redirect, timeout, DNS/network, HTTP, unsupported-scheme, and authentication-gated results.
- **Command Palette** — added an accessible `Ctrl+K` palette with fuzzy matching, recent commands, keyboard navigation, focus trapping, contextual bookmark actions, and indexes for boards, tabs, folders, bookmarks, Sets, tags, widgets, Settings pages, and available actions. Firefox's `Ctrl+Shift+K` extension command focuses or opens the registered Hub palette.
- **Smart Views and local activity** — added Recently Opened, Most Used, Never Opened, Added Recently, Duplicates, Broken Links, Redirected Links, and Missing Favicons views with period/limit controls. Stable-ID activity counts and recent-open history stay in browser-local storage, can be disabled, reset, or exported, and are never added to the shared database.

### Changed

- **Central bookmark opening path** — board, Essentials, speed-dial, Search, Set, Import Manager, folder, and context-menu opens now share the same local activity-recording path.
- **Fast control entry points** — Smart Views are available from Essentials, Search, and the sidebar, while maintenance results can be opened, located, moved, excluded, or acted on directly.

### Fixed

- **Favicon rerenders** — resolved favicon sources are reused for the rest of the page session, preventing unchanged icons from being decoded or requested again when folders or tabs rerender.

### Tests

- Added Phase 1 regression coverage for canonical/nested inventory discovery, dynamic projections, hostname boundaries, query/fragment preservation, configurable duplicates, local-only activity cleanup/reset/sorting, cancellable categorized health scans, palette indexing/actions, centralized opens, and extension command/relay wiring.
- Passed all 123 `node:test` regression cases, the dedicated Phase 1 integration suite, 7 native-host persistence tests, JavaScript syntax checks, and `web-ext lint` with no errors. The existing native Python-file notice and installer shell-file warning remain.

## [0.11.128] — 2026-08-05

### Added

- **Unified Calendar sources** — expanded the Calendar widget beyond Proton with generic HTTPS iCalendar feeds, regional UK bank holidays, locally calculated astronomy events, upcoming space launches, football competitions or teams, and official PDC darts schedules. All enabled sources merge chronologically into the existing agenda and month views.
- **Per-source controls** — Calendar settings now provide source types and relevant provider options, while the widget legend can temporarily show or hide individual sources without changing the shared Hub database.
- **Authenticated calendar relay** — extension 1.0.23 adds a bounded, authenticated Hub-only calendar request that forwards only the allowlisted `Accept` and football-data.org token headers.

### Changed

- **Automatic Proton migration** — existing Proton Calendar source entries retain their IDs, colours, names, and Windows Credential Manager links while gaining the new Proton source type automatically.
- **Credential isolation** — private ICS URLs and football API tokens remain in Windows Credential Manager; public source configuration contains only non-secret provider options.

### Tests

- Added coverage for legacy Proton migration, public-only settings, common provider-event normalization, authenticated header allowlisting, and the expanded extension relay.
- Passed all 117 JavaScript regression tests, 7 native-host persistence tests, JavaScript syntax checks, and `web-ext lint` with no errors. The existing native Python-file notice and installer-shell-file warning remain.

## [0.11.126] — 2026-08-05

### Added

- **Proton Calendar widget** — added a read-only calendar widget for Proton Unlimited sharing links, with combined multi-calendar agenda and month views, calendar colours, Today/period navigation, expandable event details, all-day events, and common recurring-event rules.
- **Private calendar sources** — Proton sharing URLs are stored per widget and calendar in Windows Credential Manager. Neither the URLs nor fetched event details are written to the shared Hub database, browser cache, or backups.
- **Calendar controls** — settings support up to six calendars, default agenda/month view, 7–60 day agenda ranges, Monday/Sunday week starts, and 30-minute to six-hour automatic refresh. A widget reload action forces an immediate refresh and event links open separately from the read-only feed.

### Changed

- **Asynchronous widget-setting commits** — widgets can now finish secure external-storage updates before the settings modal commits its database draft. Done and Cancel remain guarded during the operation, and a failed secure write leaves the modal open without changing the widget.
- **Widget code separation** — the Proton Calendar implementation and responsive presentation live in dedicated source files rather than further expanding the main widget module.

### Tests

- Added regression coverage for secure URL exclusion, Credential Manager writes and removals, direct-to-extension fetch fallback, ICS time-zone parsing, all-day events, escaped content, recurrence exclusions, responsive assets, and widget categorization.
- Passed all 112 JavaScript regression tests, 7 native-host persistence tests, and JavaScript syntax checks.

## [0.11.125] — 2026-08-05

### Added

- **Explicit persisted-state schema** — moved version-1 serialization and normalization into a dedicated schema module. Saved snapshots now omit redundant active-tab compatibility aliases, while loading repairs orphaned boards by restoring navigation entries instead of deleting their data.
- **Shared widget networking** — added bounded-fetch and Open-Meteo geocoding helpers with stale-response protection for weather, astronomy, and ISS requests.

### Changed

- **Transactional widget settings** — settings now edit a full title/config/data draft. Live previews remain visible while editing, Cancel restores every field, and Done creates one undoable persisted change without saving intermediate keystrokes.
- **Current project guide** — rewrote `PROJECT.md` around the actual state schema, rendering pipeline, extension bridge, native host, widget runtime, and validation workflow.

### Fixed

- **Search completeness** — persistent search indexing now covers every tab Inbox and the Import Manager, avoids duplicate dynamic-folder results, and preserves the correct context-menu behavior for Import Manager matches.
- **Interaction correctness** — Ctrl+Z/Ctrl+Y no longer intercept text-field editing; alpha tag chips receive their board context explicitly; external links use isolated window features; and duplicate classic-script helper declarations can no longer silently override one another.
- **Chunked-read consistency** — large database reads carry an expected file version through every chunk, reject mid-transfer changes or incomplete byte counts, and retry once from a fresh snapshot.
- **Widget lifecycle cleanup** — deleting widgets now clears their timers, runtime instances, pending requests, and browser-local caches. Unchanged MapLibre, ISS, column, and sidebar widget nodes survive unrelated Hub rerenders.
- **Path and theme handling** — extension path conversion preserves POSIX file paths, while native theme writes validate identifiers and remain contained within the configured theme directory.

### Security

- **Authenticated Hub relay sessions** — extension services now require the exact registered Hub tab, URL, and per-registration session token. Active-Hub routing is stable across multiple open Hub tabs, reloads renew the session, and inactive registrations no longer steal extension deliveries.

### Performance

- **Lighter persistence monitoring** — file polling no longer hashes unchanged databases, duplicate five-second timers are merged, and rapid saves coalesce backup creation within a short safety window.
- **Incremental rendering and search** — unchanged widgets reuse their DOM and live runtimes, while search data is rebuilt only after Hub mutations instead of on every query.
- **Bounded favicon work** — favicon discovery deduplicates by origin, limits fallback providers, prefers native/direct sources, and batches cache persistence.

### Tests

- Added regression coverage for global classic-script symbols, complete widget-setting rollback, Hub relay sessions, chunk-version enforcement, path conversion, theme containment, state-schema repair, render reuse, and lifecycle cleanup.
- Passed all 107 JavaScript regression tests, 7 native-host persistence tests, JavaScript syntax checks, and `web-ext lint` with no errors. The existing native Python-file notice and installer-shell-file warning remain.

## [0.11.79] — 2026-08-03

### Fixed

- **Firefox 153 local-file permission diagnosis** — detects Firefox's new, default-off “Access local files on your computer” permission and shows the exact `about:addons` action in both the extension popup and the file-based Hub instead of reporting a generic missing relay.
- **Correct extension-root injection** — programmatic relay recovery now injects `/content.js` from the extension root; the former relative `content.js` path was resolved beside the Hub's `index.html` and caused the popup's “unexpected error”.
- **Self-healing Hub registration** — page pings register their sender, discovery retries a failed initial registration, startup/status scans recover already-open Hub tabs, and stale or navigated relay tabs are cleared and rediscovered before delivery.
- **Durable Import Manager delivery** — extension imports now prepare against the latest shared snapshot, deduplicate retries by delivery ID, and rebase once after a real shared-database conflict, matching Inbox delivery guarantees.
- **Accurate shared-data polling and startup** — polling compares JSON semantically, while a successful shared read that returns no data is treated as a load failure instead of presenting an empty database.
- **Recoverable native messaging** — persistent and one-shot native requests have bounded timeouts; disconnects clear stale availability and later storage checks can reconnect and reload the shared-path configuration without an extension reload.

### Tests

- Added relay-path, failed-registration, stale-registry, Firefox 153 permission, Import Manager idempotency/rebase, native reconnect, semantic polling, and empty-shared-read regressions.
- Verified Firefox 153 against the exact `file:///F:/Projects/Coding/Morpheus%20WebHub/index.html` URL with the local-file opt-in gate enabled for the isolated test profile; the relay connected, the native shared database loaded eight boards, and the Hub left its protected startup state.

---

## [0.11.78] — 2026-08-03

### Fixed

- **Reverted the regressed Hub/extension discovery layer** — restored the pre-session single-Hub registration contract: the declarative `document_idle` relay registers its tab, and the background routes status and deliveries directly to that registered tab. The proactive tab registry, discovery scan, and background injection path have been removed.
- **Restored the proven Firefox file match** — returned the manifest to the exact previously working `file://*/*` content-script declaration without the added explicit origin permissions.
- **Active-tab recovery from the popup** — when Firefox has not attached the declarative relay to an open local Hub, opening the extension popup on that Hub injects the idempotent relay using the existing `activeTab` grant and immediately re-registers it.
- **Database fixes preserved** — semantic shared/cache comparison, protected shared loading, chunked reads, correlated saves, and persistence acknowledgements remain in place; this rollback does not touch the database or native-host protocol.

### Tests

- Updated relay tests around the restored registration contract and added popup fallback-injection coverage while retaining the shared-load, FIFO, acknowledgement, and semantic-snapshot regressions.

---

## [0.11.76] — 2026-08-03

### Fixed

- **Late relay recovery updates the live Hub** — when the extension relay arrives after the initial bridge attempts have expired, its ready announcement now starts a fresh connection and immediately refreshes extension, native-host, and shared-storage state.
- **Early relay attachment with the corrected Firefox origin match** — the content relay now starts before deferred Hub scripts, using the canonical `file:///*` match pattern and explicit local-origin permission introduced in the preceding fixes.

### Tests

- Added coverage for reconnecting after the initial bridge sequence has fully timed out and retained the early-page marker/first-ping regression.

---

## [0.11.71] — 2026-08-03

### Fixed

- **End-to-end shared database chunking** — shared JSON now remains in bounded 256 KiB chunks across native messaging, extension messaging, and the page bridge instead of being recombined into one multi-megabyte extension response before reaching the hub.
- **Accurate desktop-sync status** — settings now calculate native readiness after the authoritative storage lookup completes rather than retaining the initial fast-handshake value.
- **Visible startup diagnostics** — if an authoritative shared load still fails, the protected empty-fallback notice now includes the actual transport error while automatic recovery continues.

### Tests

- Added a 700 KB multi-chunk page-bridge regression proving that shared state is reconstructed exactly without falling back to the legacy whole-database message.

---

## [0.11.70] — 2026-08-03

### Fixed

- **Immediate page bridge startup** — the extension relay now attaches at document start, before the hub's deferred scripts can send their first ping; handshake attempts also use short bounded timeouts instead of accumulating five-second stalls.
- **No false empty shared database** — a configured shared-file read failure is no longer replaced with extension-local storage. When that fallback is empty, the hub keeps its data area hidden and retries rather than presenting it as the real database.
- **Faster shared database loading** — startup probing, configuration lookup, and chunked database reads now reuse one native-host connection instead of launching a new Python process for every chunk.

### Tests

- Added regression coverage for document-start ping delivery, shared-read failure isolation, and persistent native-host reuse during startup.

---

## [0.11.69] — 2026-08-03

### Fixed

- **Fast extension discovery** — hub registration and bridge pings now acknowledge extension presence immediately instead of waiting for the native-host probe and database-path lookup to finish.
- **Popup delivery action recovery** — the extension popup now refreshes hub/storage status while open and enables Inbox and Import Manager delivery as soon as an open hub is discovered.
- **Open-hub rediscovery** — status checks and send actions can rebuild the hub-tab registry directly from verified Morpheus pages, including after an extension reload or an initial registration race.

### Tests

- Added regression coverage for native-startup-independent handshakes, status-time hub rediscovery, and popup actions becoming enabled after a delayed hub registration.

---

## [0.11.68] — 2026-08-03

### Changed

- **Durable extension delivery** — inbox and Import Manager sends now carry a delivery ID and wait for the hub to acknowledge the corresponding save before the popup reports success.
- **Hub tab routing** — the extension now tracks all registered hub tabs and preserves the last genuinely active hub as the delivery target instead of allowing inactive polling traffic to steal it.

### Fixed

- **Correlated shared-database saves** — replaced the extension-wide save debouncer with a FIFO that keeps every snapshot, expected version, and result paired with its original caller, preventing stale tabs from being told that a different tab's snapshot was saved.
- **Inbox rollback recovery** — external inbox additions are idempotent, refresh stale shared state before mutation, and safely reapply once if the disk changes during delivery.
- **Inactive-tab background writes** — hidden hub tabs no longer persist asynchronous favicon or APOD results produced from potentially stale state.
- **Atomic shared-database writes** — native conditional writes now use a cross-process lock, content hashes, and atomic file replacement so two native-host processes cannot both replace the same baseline and metadata-only file changes do not create false conflicts.

### Tests

- Added regression coverage for extension FIFO response correlation, inactive-tab delivery targeting, page-side save coalescing, native conflict detection, metadata-only changes, identical snapshots, and concurrent writers.

---

## [0.11.66] — 2026-05-29

### Added

- **Extension Import Manager delivery** — added a popup action and bridge flow that sends the current browser tab directly into the hub Import Manager, including Firefox-provided favicon data when available.
- **Managed background assets** — tab background images picked from disk or loaded from web URLs are now copied into managed `assets/backgrounds/...` files and stored by path instead of embedding large data URLs in the shared JSON database.
- **Native favicon fallback** — the native host can now fetch page HTML, parse declared favicon/touch-icon links, download the best candidate, and return a cached data URL for stubborn sites.
- **Generic secret bridge** — added reusable extension/native secret get/set/delete/list actions with Windows Credential Manager support for the NASA APOD API key.
- **Native database backups** — the native host now creates rotating `before-write` JSON backups before replacing the shared database file.

### Changed

- **Disk-backed persistence** — large hubs now treat the extension/native shared database as the primary persistence path and avoid mirroring the full database into extension storage when disk storage is available.
- **Shared database reads** — extension/native shared-database loading now uses chunked file reads so large JSON files are not limited by native messaging response size.
- **Secret persistence** — the NASA APOD widget now reads its API key from the secret cache/Credential Manager path instead of relying on the shared JSON database.
- **Settings organization** — moved visual toggles into a dedicated UI settings tab and clarified shared data file, desktop sync, and API key status wording.
- **Temporary extension setup** — native-host installers now accept explicit extension IDs so temporary/debug extension IDs can be allowed during development.

### Fixed

- **Browser quota failures** — saving no longer fails just because browser storage or extension storage is full when the shared disk database is available.
- **Shared database recovery safety** — pending disk saves keep an emergency browser snapshot, startup detects when local cache looks newer than the shared database, and sync pauses/prompts instead of silently accepting an older disk snapshot.
- **External-change reload loop** — accepting a freshly loaded shared snapshot now clears stale queued writes and updates the shared-disk baseline so the hub does not repeatedly reload the same file change.
- **Secret migration safety** — JSON API keys are scrubbed only after secure storage is verified and migration/write succeeds, preventing keys from disappearing when the native bridge is temporarily unavailable.
- **Favicon refresh behavior** — `Refresh favicon` now forces the native favicon lookup once before public favicon services can return a generic successful icon.

---

## [0.11.52] — 2026-04-28

### Added

- **Manual hub reload control** — General Settings now includes a `Reload Now` action that reloads from the shared database when available, otherwise from the browser cache.

### Changed

- **Shared/local startup authority** — hub startup now decides the authoritative source up front, preferring the shared database when the extension/native host is available and otherwise falling back cleanly to browser cache.
- **Warm browser-cache metadata** — local cache now keeps source/freshness metadata alongside the saved snapshot so the app can reason about shared-vs-local recovery without guessing.
- **Auto-refresh notice preference** — General Settings now includes a toggle for whether automatic shared-disk refreshes show a post-refresh notice or stay silent.

### Fixed

- **In-app shared-disk reloads** — external shared-disk changes now reload data in-app instead of relying on normal page refreshes, while transient panels/modals are cleared safely during reload.
- **Recovered shared-storage reconciliation** — when the extension/native host comes back, the hub now compares cached local state against shared state, prompts to push the newer local copy when appropriate, and pauses sync safely if you decline.
- **Bridge availability tracking** — bridge connection status now updates more honestly after failed calls, which improves storage-status UI and recovery detection when the extension/native host disappears or returns.

---

## [0.11.48] — 2026-04-26

### Added

- **NASA APOD widget** — added a new widget that displays NASA's Astronomy Picture of the Day, including support for image and video entries, refresh, and per-day caching.
- **API Keys settings tab** — Global Settings now includes a dedicated API Keys tab, starting with a shared NASA key used by APOD widgets.

### Changed

- **AMO packaging flow** — added a dedicated AMO packaging script that strips non-store files and writes normalized archive paths so the Firefox signing upload matches Mozilla's validation requirements.
- **API key handling** — the APOD widget now reads its key from shared settings instead of per-widget config, and existing widget-level NASA keys are migrated automatically.
- **Project cleanup** — removed outdated extension artifacts and tightened `.gitignore` coverage around generated packaging output and local native-host files.

### Fixed

- **Shared-disk conflict protection** — cross-browser saves now compare file-version metadata before writing, emit a user-visible conflict flow when the on-disk JSON changed, and avoid silently clobbering newer data.
- **API key leakage in widget state** — obsolete APOD key copies are stripped from widget config and cache data so the same key is no longer duplicated across multiple saved records.
- **Firefox AMO upload validation** — the signed-upload artifact now includes the required `data_collection_permissions` manifest entry and excludes native helper files from the store package.

---

## [0.11.47] — 2026-04-26

### Changed

- **Shared extension database path** — the Firefox bridge no longer derives `morpheus-webhub.json` from the page URL. The active database path is now explicit, browser-independent, and can be shared between Firefox and Zen.
- **Hub data settings** — Global Settings now exposes the shared database path when the native bridge is available, including browse/apply flow plus read-only path display in About.
- **Extension popup status** — the popup now reports the resolved shared database path so the browser-side status matches what the hub shows.
- **Localhost bridge support** — the extension content script now runs on `http://localhost/*` and `http://127.0.0.1/*` in addition to `file://`, allowing the hub to be served from a local webserver without losing bridge features.

### Fixed

- **Native host configuration bootstrap** — the native host now supports `config.json` for shared database path discovery and persistence, including a Windows save-path picker flow that reliably returns the selected JSON path.
- **False disconnected state** — the page-side bridge now retries its handshake and reconnects on later bridge calls so the hub no longer gets stuck reporting the extension as disconnected while the popup/native host are actually available.
- **Primary persistence target** — when native messaging is available, the shared on-disk database is treated as authoritative and extension storage is only a best-effort backup mirror, avoiding quota-related save failures on larger databases.

---

## [0.11.28] — 2026-04-23

### Added

- **Base tag suggestions** — tag autocomplete now includes a configurable default suggestion set without creating saved tags until a suggestion is committed.
- **Extension status in About** — the About tab now shows extension/native-host connection state and lists available extension-backed features.

### Changed

- **Code quality cleanup** — centralised board creation, drag/drop area checks, drag decoration cleanup, and deep-clone handling; removed unused widget-picker UI/code and dead helper functions.
- **Favicon cache trimming** — save operations now run the existing favicon cache trimmer before persistence.

### Fixed

- **Unsorted tag management** — Unsorted now uses the shared chip-input behavior, supports manual additions, deletes tags correctly, and refreshes the orphan counter after deletion.
- **Create widget cancel** — cancelling the new-widget settings dialog no longer creates a widget.
- **Folder internal reordering** — moving items within a folder no longer trips the self-subfolder safety check.
- **Navpane bottom drops** — dragging below the final nav item now shows the preview at the bottom and inserts there reliably.

---

## [0.11.3] — 2026-04-19

### Fixed

- **DnD: navpane inbox drop for bookmarks** — board nav items now accept bookmarks and folders dragged from any source (board column, nav list, speed dial, essentials), not just board columns; items are correctly extracted and normalised per source before being pushed to the target board's inbox
- **DnD: navpane board items as position anchors** — when dragging a widget cross-context into the navpane, board nav items (the majority of nav entries) were exiting the dragover handler early, making the middle of the list unreachable; they now correctly serve as position anchors
- **Modal: modalCard hidden state** — `modalCard` was not having its `hidden` class removed on open, causing display issues in some modal flows

### Changed

- **Extension: native messaging routing** — all bridge messages except `MW_PING` are now routed through the background script, enabling file-based save/load via the native host; `MW_REGISTER` sends the page URL so the background can derive the save path
- **Extension: manifest** — added `nativeMessaging` permission and `browser_specific_settings` gecko block for proper add-on ID assignment
- **Extension: popup** — separate status rows for Morpheus hub presence and native file save availability; clearer call-to-action when hub is not open

---

## [0.10.0] — 2026-04-19

### Added

- **Theme system** — Global Settings → Style tab now has a Theme section at the top
  - 7 built-in themes: Default Dark, Light, Dracula, Catppuccin Mocha, Midnight (dark blue), Crimson (dark red), Nebula (dark purple)
  - Theme picker renders color-swatch cards; clicking applies immediately and persists to state
  - "Save current as theme…" button — captures all active CSS color variables as a named custom theme; stored in `state.settings.customThemes[]`
  - Custom themes show a delete (×) button on hover
  - If native host is connected, custom themes are also written to `./themes/<id>.json`; themes in that folder are loaded and shown alongside built-ins
- **`source/themes.js`** — `BUILTIN_THEMES`, `applyTheme(theme)`, `getThemeById(id)`, `getAllThemes()`
- **`themes/` folder** — 4 built-in theme JSON files for sharing and reference
- **`--accent-glow` CSS variable** — derived from `--accent` at 20% opacity; body radial gradient now uses it so the glow color follows the active theme's accent
- **Extension: `LIST_DIR` native message** — lists files in a directory with optional extension filter
- **Extension: `MW_LIST_THEMES` / `MW_WRITE_THEME`** — background routes to native host; reads/writes JSON theme files in `./themes/` next to `index.html`
- **Bridge: `listThemes()` / `saveTheme(theme)`** — page-side bridge methods for theme file access

### Changed

- `applySettings()` in `render.js` now calls `applyTheme()` at the end, keeping colors in sync with the active theme on every settings change
- **CSS fully variabilized** — all hardcoded dark hex values (`#141518`, `#16181d`, `#24262a`, sidebar gradient, board/column/speed-dial backgrounds), semi-transparent white surfaces (`rgba(255,255,255,…)`), and accent tints (`rgba(109,124,255,…)`) replaced with CSS variables; light and custom themes now render correctly across every UI element
- New CSS variables: `--panel-r/g/b` (RGB split for alpha-composited panel backgrounds), `--surface-1/2` (theme-aware hover/active surfaces), `--accent-chip/hover/selected/selected-border/glow`

---

## [0.9.1] — 2026-04-19

### Added

- **Native messaging host** (`extension/native/`)
  - `morpheus_host.py` — handles `READ_FILE`, `WRITE_FILE`, `OPEN_FILE_PICKER`, `PING`; cross-platform file picker via tkinter with PowerShell fallback on Windows
  - `morpheus_host.bat` — Windows launcher (path written by installer)
  - `install.ps1` — Windows installer: detects Python, writes launcher `.bat`, writes native messaging manifest to `%APPDATA%\Mozilla\NativeMessagingHosts\`, registers registry key under `HKCU\Software\Mozilla\NativeMessagingHosts\`
  - `install.sh` — Linux/macOS installer
- **Extension ID** (`morpheus-webhub@local`) added to manifest — required for native messaging and permanent installation
- **`nativeMessaging` permission** added to manifest
- `background.js` now connects to native host: `WRITE_FILE` (debounced 800 ms), `READ_FILE`, `OPEN_FILE_PICKER`; falls back to `browser.storage.local` when host unavailable
- `content.js` sends page URL on registration (used to derive JSON save path next to `index.html`); relays all bridge messages to background
- **"Browse…" button** in board settings background panel — calls `bridge.openFilePicker('image')` → native file picker → sets `board.backgroundImage` as data URL
- Popup now shows two status rows: Morpheus open/closed + file save enabled/storage-only
- `bridge.nativeIsAvailable()` and `bridge.openFilePicker()` added to page bridge

---

