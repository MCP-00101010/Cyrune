# Cyrune Arcade Changelog

Historical entries below are preserved from Portal releases whose release notes materially changed this component. Version numbers are Portal release versions unless an entry explicitly says otherwise.

---

## [Unversioned] — 2026-08-25

### Changed

- Retired the hard-coded standalone Spectaculator launch diagnostic after confirming the configurable ZX validation matrix covers direct, current-instance/SpecStub, new-instance, managed-profile, and representative 48K/128K cases; focused tests retain the Windows-default association route.
- Externalised configuration, favourites/recent state, managed profiles, logs, and cache beneath `%LOCALAPPDATA%/Cyrune/Arcade`; `CYRUNE_ARCADE_DATA` retains a portable/development override.
- Added atomic JSON persistence, persisted-shape validation, concurrent state protection, failed collection-switch rollback, validated HTTPS scraper origins, bounded job history, and launch-profile forwarding.
- Added a health-audit record and focused persistence, collection, job, metadata, and service-runtime regression coverage.

### Fixed

- **Scraped artwork on the external page** — screenshots and loading screens, including existing TheGamesDB URLs, now request bounded image data through authenticated Cyrune Relay. Local artwork continues to load through Cyrune Host.
- **Direct Arcade launches** — fixed a stale profile-state reference that stopped Launch before the request reached Relay, and unified launches with the game-default emulator/profile resolver used for Portal shortcuts.
- **Context-menu launch choices** — an explicitly selected emulator now remains selected when Arcade asks whether to reuse or start another emulator instance.

### Validation

- All 68 Arcade tests pass, including the 12-test focused launch suite, and the non-launching active-data preflight confirms all seven representative emulator/profile/game resources across 12,933 games are available.
- The external runtime cutover preserves three collections, 30 favourites, 30 recent entries, two emulator profiles and their copied files, configured scraper state, and Credential Manager-backed secrets with no plaintext secret fields. All 67 Arcade tests pass.
- All 64 pre-Phase-6 Arcade tests pass; JavaScript and Python syntax checks pass. A Firefox 154 smoke test rendered existing remote screenshot and loading-screen metadata through Relay with non-zero image dimensions.


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

## [0.11.58] — 2026-05-09

### Added

- **Dynamic sets** — added live tag-rule-based sets with shared include/exclude rule editing, tab set bar support, resolved counts/previews, and dedicated Set Manager controls for creating, editing, sorting, and inspecting dynamic results.
- **Dynamic folders** — added live tag-rule-based folders for board columns with dedicated open/closed icons, shared rule editing, per-folder sort modes, and in-column quick actions for editing rules and sort order.

### Changed

- **Dynamic collection UX** — dynamic sets and folders now behave as read-only live views, including live rule-preview updates in the Set Manager, shared sort modes (`source`, title, and URL ordering), and streamlined header controls across the Set Manager, folder modal, and board column UI.
- **Project tracking** — the Dynamic Sets and Folders implementation checklist is now complete and rolled into this release.

### Fixed

- **Dynamic collection interactions** — blocked invalid manual edits against dynamic sets/folders across context menus, drag/drop, modal flows, and Add-to-Set paths while keeping normal manual sets and folders unchanged.
- **Dynamic folder copy/move semantics** — dragging or sending bookmarks from inside a dynamic folder now creates safe copies where appropriate instead of mutating the underlying source bookmark or causing items to disappear from other folders.
- **Dynamic persistence and recovery** — dynamic set/folder fields now survive normalization, export/import, trash restore, and shared-database save/load consistently, including restoring board items back into their original parent folders when possible.

---

## [0.11.56] — 2026-05-02

### Changed

- **Shared-tag model simplification** — boards, tabs, and folders no longer expose per-object `Pass to...` / `Strip on...` toggles; shared tags now always propagate by design.
- **Shared-tag persistence cleanup** — legacy `inheritTags` / `autoRemoveTags` fields are now stripped from runtime state and saved snapshots, with the live shared database migrated to remove those obsolete fields.
- **Import Manager tree workflow** — Import Manager now uses the same nested tree interaction model as the main hub instead of a flatter bespoke list path.

### Fixed

- **Inherited tag dedupe** — items that already own a tag explicitly no longer surface the same tag again as inherited when moved under a parent sharing that tag.
- **Import Manager drag and drop** — folders and bookmarks in Import Manager now support internal nesting/reordering and drag cleanly into board, inbox, and bookmark-target destinations.
- **Import Manager send target** — Import Manager items can now be sent directly to the active tab inbox from the context menu when a valid active tab target exists.

---

## [0.11.50] — 2026-04-28

### Added

- **Global sets** — added reusable bookmark launch groups with a dedicated Sets Manager, live inline editing, search integration, bookmark context-menu `Add to Set...`, and bulk-open support.
- **Tab set bars** — tabs can now link global sets directly in the board shell, with context-menu launch/manage/remove actions and DnD from the Sets Manager.
- **Import Manager panel** — bookmark HTML imports now stage in a dedicated Import Manager utility panel with its own sidebar entry, item tree, bulk selection, and tab-inbox delivery flow.

### Changed

- **Board/tab overhaul** — replaced the old collection-aware runtime model with top-level boards that own embedded tabs, board-level speed dial, and tab-level set bars.
- **Board and tab editing flow** — board creation/editing now uses the old collection-style modal role, while tab editing uses the old board-settings modal role.
- **Import delivery model** — inbox delivery is now tab-aware across Import Manager sends, bulk move flows, and extension tab send, and the Import Manager button now shows a staged-item indicator badge.
- **UI shell cleanup** — Tag Manager, Sets Manager, and settings-style panels now follow the current modal/header patterns more closely, drag from their headers, and use the updated sidebar/footer presentation.
- **Project backlog cleanup** — removed actioned overhaul and UI items from `TODO.md` so the backlog reflects only remaining work.

### Fixed

- **Set DnD polish** — set-manager reordering and copy-in drops now use stable preview-clone behavior without flicker, hidden-source glitches, or incorrect bottom-drop handling.
- **Import Manager pseudo-board leftovers** — removed the remaining board/nav behavior assumptions so Import Manager no longer appears as a fake board or empty-state main-panel content.
- **Tag and bookmark modal regressions** — restored inherited-tag display in bookmark/folder modals and fixed collection-speed-dial-era edit flows that surfaced blank bookmark edit dialogs.
- **Collection-era behavior leftovers** — removed old collection-specific search, trash, move, tag inheritance, modal, context-menu, and DnD paths that no longer belonged to the live board/tab model.

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

## [0.11.41] — 2026-04-26

### Changed

- **U1** All edit/create modals now have a consistent header: "NEW/EDIT \<TYPE>" subtitle, name input with auto-focus, and `var(--border)` divider line. Board, folder, and widget settings panels brought in line with the bookmark modal reference.
- **U2** Board settings panel Cancel button is now always visible (not only during create). Cancelling an edit restores the original board state without saving.
- **U3** Active board icon in the navpane now changes to accent color, matching active collection icon behaviour.
- **U4** Board names, collection names, and folder names all use the same 8 px gap between icon and label.
- **U5** Right-clicking empty space in the board tab bar (collection and folder contexts) shows an "Add board" context menu.
- **U6** Background image URL input in the board settings panel now sits flush left next to the "URL" label and stretches to fill the remaining width.
- **W1** Widget cards inherit theme font family and title line style/color/thickness from global style settings.
- **W2** Clock widget 12 h / 24 h format is now selected with radio buttons instead of a dropdown.
- **W3** To-do widget in columns no longer renders a duplicate divider below the widget title.
- **W4** To-do settings modal: removed redundant "Clear Completed" label; button renamed "Clear completed" and aligned bottom-left.
- **W5** Countdown widget blocks saving when the target date is in the past, with an inline error message.
- **W6** Countdown widget defaults to midnight (00:00) when no time component is provided, instead of failing.
- **W7** Note settings modal: removed "Content" label; textarea stretches to fill the full modal width.

## [0.11.39] — 2026-04-26

### Fixed

- **Collection tab bar button styling** — add-board and board-settings buttons in the collection tab bar now match the 18 px icon size used in the board name pane and no longer display a bordered frame; hover uses the same subtle background as the name-pane buttons.

---

## [0.11.38] — 2026-04-26

### Changed

- **Name pane icon size + alignment** — undo/redo/inbox/settings buttons in the board header are now 28 × 28 px with 18 px SVG icons (down from 36 × 36 / 20 px), use a transparent resting background, and are top-aligned so they anchor to the top-right corner when the board title wraps.
- **Inbox count chips inline** — the inbox item-count chips are now displayed inline to the right of the inbox icon inside the button, replacing the old absolutely-positioned row that floated above the header.
- **Board settings button in collection tab bar** — a small settings button now appears at the right end of the collection tab bar (aligned under the name-pane gear icon) and opens board settings for the active board. The add-board button is also pushed to the right alongside it via `margin-left: auto`.

---

## [0.11.37] — 2026-04-26

### Fixed

- **Nav board / collection deletion quota error** — `saveTrash()` now handles `QuotaExceededError` gracefully: it retries by stripping `backgroundImage` from stored boards, then progressively drops the oldest trash entries, so deletion never fails due to localStorage being full.

---

## [0.11.35] — 2026-04-25

### Fixed

- **Collection create/cancel** — creating a collection no longer writes to state or renders in the nav until the modal is confirmed. Cancelling the New Collection modal now discards with no side-effects.
- **Strip on leave default** — the "Strip on leave" / auto-remove-tags toggle now defaults to enabled when creating a new collection, board, or folder that exposes shared tags.
- **Collection settings icon** — the settings button in the board name pane now opens the Edit Collection modal when a collection is active, instead of the board settings panel.

---

## [0.11.34] — 2026-04-25

### Added

- **Collection speed dial section in Edit Collection modal** — speed dial settings (Show toggle and Slots input) are now in a dedicated "Speed Dial" section below Tags, instead of being appended inside the Tags section.
- **Show toggle for collection speed dial** — collections now have a `showSpeedDial` flag; the "Show" toggle in the new Speed Dial section controls whether the speed dial bar is visible when that collection is active. Changes apply live.

---

## [0.11.33] — 2026-04-25

### Added

- **Speed dial slot grid** — speed dial is now a fixed-slot grid (default 8, configurable 1–48) instead of a free list; empty slots show as dashed cells and accept drops. Board settings and collection edit modal both expose a Slots input.
- **Board icon in nav** — board items in the sidebar now show a small grid icon (tinted accent when active), matching the collection icon treatment.
- **Inbox dot indicators** — collection tabs, folder headers, and nav board items now display a small accent dot when any contained board has inbox items, replacing the previous count chips.
- **`findCollectionById` helper** — centralized lookup via `findNavItemPath` so nested collections are found correctly everywhere.
- **Slot-based speed dial helpers** — `normalizeSpeedDialSlots`, `getSpeedDialSlotCount`, `firstEmptySpeedDialSlot`, `findSpeedDialSlot`, `setSpeedDialSlot`, `removeSpeedDialItemById` added to state.js.

### Changed

- **Board title display** — when a collection is active the main title bar now shows only the collection title; folder context shows only the board title.
- **Delete collection** — now deletes contained boards outright (with trash restore support) instead of scattering them back to the nav.
- **Speed dial drag image** — `applyDragImage` now preserves the source element's exact pixel dimensions and fixes img sizing inside the clone.
- **Essentials slot drop** — filled essential slots no longer accept drops.
- **Import manager board** — inbox button is hidden (not just disabled) when the import manager board is active; clicking the inbox button while on the import manager is a no-op.

### Fixed

- **Delete board from collection/folder** — now pushes the board to trash with restore support (`collection-board` / `folder-board` areas).
- **Restore collection from trash** — now re-adds all contained boards to state, not just the nav item.
- **Null slot guards** — null entries in `speedDial` arrays no longer crash search, tag merge, `findDuplicateUrl`, or migration loops.
- **`addSpeedDialBookmark`** — uses `contextTarget.collectionId` when set, and places the new item in the correct slot.
- **Duplicate speed dial item** — uses `firstEmptySpeedDialSlot` instead of `splice`, so it respects the slot grid.
- **Collection speed dial edit** — editing a bookmark in a collection speed dial now correctly looks up the item from the collection, not the active board.
- **Edit essential bookmark** — `setEssential` now accepts a `replace` flag so editing an existing slot works correctly.

---

## [0.11.25] — 2026-04-23

### Fixed

- **Nav pane preview wrong font/color** — the synthetic nav item created for collection-tab → nav drags was missing `data-type="board"`, so the `[data-type="board"]` CSS rules (`font-size`, `font-family`, `font-weight`, `font-style`, `color`, `text-align`, `display: flex`, `align-items: center`) did not apply. Added `el.dataset.type = 'board'` to make the preview render identically to the dropped item.

---

## [0.11.24] — 2026-04-23

### Fixed

- **Collection tab bar drag flicker** — the per-tab `dragleave` handler was removing the indicator whenever the cursor entered the ghost element (which has `pointer-events:none`, causing events to pass through to `tabBar`); this created a remove/re-add loop that flickered. Removed the per-tab `dragleave` handler entirely — the indicator is now only cleared when the cursor leaves the entire `tabBar`. Added position-change tracking (`_tabIndicatorKey`) so the DOM is only modified when the logical drop position changes. The `tabBar.dragover` handler now silently accepts the drop without repositioning when an indicator is already placed.
- **Ghost tab clone fidelity** — the cloned tab now strips `.dragging` and `.active` before insertion so it appears in its resting (non-active) style. The nav pane preview for collection-tab drags now includes board tags (matching the exact appearance the item would have after being dropped).

---

## [0.11.23] — 2026-04-23

### Fixed

- **Collection tab bar drag indicator** — `_tabDragOver` was inserting a 3px vertical bar (`div.tab-drop-indicator`) as the drop indicator. It now inserts a ghost tab clone (for reorders, a clone of the dragged tab; for nav board drops, a new tab div with the board title). CSS updated to override the thin-bar styles on `.collection-tab.tab-drop-indicator`.
- **Nav preview clone for collection-tab drags** — `createDragPlaceholder('nav')` only checked `dragPayload.itemId` and fell back to a dashed placeholder when dragging a collection tab (which sets `boardId`, not `itemId`). A new branch synthesises a nav board preview element from the board title before reaching the fallback.
- **Drop from collection tab bar to empty nav space** — `handleNavListDragOver` blocked `collection-tab` drags (preventing `preventDefault` from being called on empty nav space, so the drop event never fired). Added `collection-tab` to the allowed areas. `handleNavListDrop` now has a `collection-tab` branch that removes the board from the collection and inserts a new nav item at the drop position, matching the logic already present in `handleNavDrop`.

---

## [0.11.22] — 2026-04-23

### Fixed

- **Collection speed dial reordering** — `handleSpeedDialItemDragOver/Drop` and `handleSpeedDialContainerDragOver` were missing `collection-speed-dial` in their area guards, so dragging to reorder items in the collection speed bar had no effect. All three guards and the item-drop handler now handle `collection-speed-dial`.
- **Dragged element visible alongside preview clone** — elements that initiate a drag (board items, speed dial links, nav items, collection/folder tabs) now receive a `.dragging` class one animation frame after dragstart (after the drag image snapshot is captured), hiding the original. The class is removed when `removeDragPlaceholders` is called on dragend.

### Added

- **Collection tab bar DnD** — tabs in the collection tab bar can now be reordered by dragging. Nav board items can be dragged directly onto the collection tab bar to add them to the collection (with a vertical bar indicator showing the insertion point). The existing support for dragging a collection tab back onto a nav item to remove it from the collection now also shows a position preview and inserts at the correct position.

---

## [0.11.16] — 2026-04-23

### Fixed

- **Undo/redo leaves stale trash entries** — after undoing a deletion, the restored item is now removed from the Recently Deleted panel automatically. Applies to redo as well. If the trash panel is open, it refreshes immediately.
- **Board tab bar stale after closing settings with no rename** — `hideBoardSettingsPanel` now refreshes the collection/folder tab bar when the title input is empty (placeholder fallback path), matching the existing live-update on every keystroke.

### Changed

- **Trash panel label for deleted collections** — restored-collection entries now show "Collection" in the trash panel meta line instead of "Item".

---

## [0.11.15] — 2026-04-23

### Changed

- **"Move to board" list sorting** — all board selectors (modal dropdown, search-result submenu, bulk-move dropdown) now sort: standalone boards A-Z first, then collection boards grouped by collection name A-Z, then board name A-Z within each collection.

---

## [0.11.14] — 2026-04-22

### Added

- **Collections in trash** — deleting a collection now pushes it to Recently Deleted. Restoring puts the collection back in the nav and un-promotes its boards (removes the stub nav entries that were created on delete).
- **Collection speed dial → DnD to columns / essentials** — bookmarks in a collection's speed dial can now be dragged into board columns, board sub-folders, and essential slots (was silently rejected before). Displaced essentials are returned to the collection speed dial.
- **Collection speed dial → "Move to board"** — right-clicking a collection speed dial bookmark now offers "Move to board", identical to the regular speed dial item menu.

### Changed

- **Move to board board list** — boards that live inside a collection are now labelled `Collection — Board` instead of just `Board` in all "Move to board" dropdowns (modal selector and search-result submenu).
- **Shared tags input placeholder** — changed from "shared tag1 tag2" to "tag1 tag2" to match all other tag input fields.

---

## [0.11.13] — 2026-04-22

### Added

- **Collection `inheritTags` / `autoRemoveTags` toggles** — the Edit Collection modal now shows "Pass to items" and "Strip on remove" toggles below the Shared Tags input, matching the equivalent controls in folder and board settings. Collections missing these fields are migrated on load (defaults: `inheritTags: true`, `autoRemoveTags: false`).
- `autoRemoveTags` logic on collection removal — when "Strip on remove" is enabled, removing a board from a collection (via context menu or DnD to nav) strips the collection's shared tags from the board's own tag list.

### Fixed

- **Boards not displaying inherited tags** — `getBoardInheritedTags()` in modal.js was only looking one level up (immediate nav parent folder). It now calls `getBoardNavInheritedTags(boardId)` from state.js, which walks the full ancestor chain (nested folders + collection) and respects each ancestor's `inheritTags` flag.
- **`computeInheritedTags` ignoring collection `inheritTags`** — the in-board tag computation now checks `collection.inheritTags !== false` before appending collection shared tags, consistent with folder ancestry logic.

---

## [0.11.12] — 2026-04-22

### Added

- **Collection tags modal** — the "New Collection" and "Edit Collection" dialogs now include a Tags chip input (collection's own tags) and a Shared Tags chip input (inherited by all boards in the collection), matching the layout used in other create/edit modals.

### Fixed

- **Double border on modal tag input** — `.chip-text-input { border: none }` was being overridden by the more-specific `.tag-field-row .tags-input-container input` rule; added `!important` to `.chip-text-input` border reset.
- **Empty collection shows last active board title** — clicking a collection with no boards now sets `activeBoardId = null` so the title bar shows only the collection name.
- **Speed dial DnD adds to wrong target** — dragging a bookmark onto the speed dial pane while a collection is active now adds to the collection's speed dial, not the last active board's speed dial.
- **Speed dial "Add bookmark" context menu adds to wrong target** — same fix applied to `addSpeedDialBookmark()`; collection speed dial is targeted when `state.activeCollectionId` is set.

---

## [0.11.11] — 2026-04-22

### Added

- **Collection style settings** — Collections section in the Style tab of global settings: font size, font family, bold/italic/underline, text align, and color. These control how collection names appear in the nav pane.

### Fixed

- Collection name shown twice in the nav pane. The nav item renderer was falling through to a generic label-append branch after already building the collection's info element.

---

## [0.11.10] — 2026-04-22

### Added

- **Board tab bar** — when the active board lives inside a nav folder, a tab bar appears above the speed dial showing all boards in that folder. Click a tab to switch boards. Active tab is highlighted with an accent bottom border. Right-click a tab for Edit / Remove from folder / Delete. Drag a tab to the nav to pull the board out of the folder. "Add board" button appends a new board to the folder.
- **"Add board" in folder context menu** — right-clicking a nav folder now offers "Add board", creating a new board directly inside that folder.
- `findBoardFolder(boardId)` helper in state.js to locate the immediate parent folder of a board.

### Changed

- Board title header shows `Folder — Board` format when the active board is in a nav folder (mirrors the `Collection — Board` format).

---

## [0.11.9] — 2026-04-22

### Added

- **Collections** — new nav item type that groups boards into a tabbed workspace. Click a collection to activate it; boards appear in a scrollable tab bar above the speed dial. Context menus on collections and tabs support add/delete/rename/unlock operations. DnD: drop a board nav item onto a collection to add it; drag a tab back to the nav to remove it from the collection.
- **Collection speed dial** — when a board lives inside a collection, its individual speed dial is hidden; the collection's own speed dial is shown instead. The board settings speed dial toggle is disabled with an explanatory note when the board is in a collection.
- **Collection tag inheritance** — `sharedTags` on a collection are appended to every board's inherited-tag set, exactly like folder-level inheritance.
- **Search tag picker** — a collapsible side panel in the search modal lists every tag that appears in the current text-match results. Click chips to filter results by tag. Supports AND/OR toggle and A-Z / Group / Count sort modes. Pre-selects the tag when opened via "Search for tag" from the tag manager.

### Changed

- Search modal now uses a two-column layout (results + tag picker panel) when the picker is open.
- Empty search term now matches all items (so the tag picker can filter the full database without needing a text query).

---
