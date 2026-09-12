# Cyrune Arcade Changelog

Historical entries below are preserved from Portal releases whose release notes materially changed this component. Version numbers are Portal release versions unless an entry explicitly says otherwise.

---

## [0.2.58] — 2026-09-09

- Collection indexes now store stable metadata-group IDs under index schema 2 and explicit adapters. Current scoped summary/job APIs replace old client and service shims; native scrape classification is required. Exact versions, launch properties and ScummVM metadata ownership are preserved.
- Validation: 522 component tests; coordinated migration/packaging/tooling checks, syntax, versions, infrastructure and Relay lint passed. Isolated Firefox Portal/Arcade acceptance passed.

## [0.2.57] — 2026-09-09

- Remember each game's successfully applied search term and Current system/All platforms choice separately for each metadata provider. Individual and bulk scraping restore these defaults; unfinished review choices take precedence on resume.
- Store preferences natively per collection and exact metadata group. Shared Atari/Spectrum/Game Boy versions inherit them, including newly indexed editions; ScummVM versions and unrelated games in legacy Spectrum folders remain separate. Automatic cartridge searches retain hash identification.
- Failed/unapplied searches do not overwrite successful choices. Preference-write failures report a warning while retaining the successful metadata save. Existing metadata and launch identities are unchanged.
- Validation: persistence/reload, provider/collection isolation, shared and independent versions, legacy Spectrum folders, invalid input, failed saves, resumed reviews and individual/bulk dialog regressions.
- Final Arcade run: 518 tests passed after preserving existing validation exceptions. Other component, migration, packaging and tooling suites passed in the coordinated run; final syntax, infrastructure and version checks passed. Relay lint was skipped because this release does not change Relay.
- Commit validation: the complete coordinated validator passed for the accumulated release, including all component/integration suites and Relay lint with zero errors, warnings or notices.

## [0.2.56] — 2026-09-08

- Preserve full provider descriptions and decode entities once. Unify native match review; reject unknown adapters and stale collection requests. Identify Game Boy cartridges by checked hashes with title fallback.
- Add bounded collection/POK/search/artwork caches, compact list snapshots and deltas, asynchronous provider/artwork jobs, account-advertised request concurrency and incremental scrape rows.
- Add retryable artwork, failed-search retry, quota pauses, bounded resumable search choices, metadata provenance and a newly indexed filter. Resumed reviews recheck results; uncertain saves never replay automatically.
- Extract TOSEC parsing, provider metadata, scrape views, caches and background jobs into focused modules. Publish Game Boy catalogue support behind the optional negotiated capability.
- Validation: final Arcade suite 505 passed; coordinated release checks and isolated Firefox workflows passed. See the [implementation report](../docs/reviews/arcade-implementation-2026-09-08.md) for measured performance and test limits.

## [0.2.55] — 2026-09-08

- Fit the four platform icons into one compact row. Add an Emulators card between Platforms and Filters with installed application icons and platform-specific shortcuts.
- Open configured emulator applications without a ROM or game-profile arguments; ScummVM opens the collection's configured INI. Validate selected collection, adapter, supported media and executable natively; reject caller-supplied paths and arguments. Cache icons and ignore responses from previous platforms.
- Validation: shortcut scoping, exact application argument arrays, missing targets, stale requests, icon caching, native Host callback wiring and browser interaction tests. Isolated Firefox checks use real library summaries and icons for all eight installed emulators; no real application launch is performed.
- Release checks: 490 Arcade tests and coordinated repository validation passed; Relay lint skipped because Relay source is unchanged.

## [0.2.54] — 2026-09-08

- Keep unrelated Spectrum titles separate in alphabet, numeric, flat and mixed-category folders. Resolve shared presentation and scrape/edit membership using the same original-title grouping; dedicated game folders retain shared metadata. Reading the older collection never rewrites metadata or moves ROMs.
- Track catalogue preparation inside collection-switch jobs. Fetch the new collection and game list together before rendering, prevent overlapping platform switches and stale dropdown responses, reset list scrolling and clear stale game actions with a visible retry message on failure.
- Validation: legacy-folder load, scrape, edit, Undo and catalogue regression cases; tracked-job completion and browser transition/failure coverage. Repeated isolated Firefox transitions used real summaries for 12,933 Spectrum, 170 ScummVM, 2,089 Atari and 749 Game Boy entries, with mocked transport and no emulator launches.
- Release checks: 486 Arcade tests and coordinated repository validation passed (Relay lint skipped; no Relay source changes). The final stale-dropdown guard passed the nine focused browser tests. Live Spectrum verification retained all 786 distinct A-folder titles across 864 editions without changing the metadata file. The intermittent live-browser stall was not reproduced by the isolated checks.

## [0.2.53] — 2026-09-08

- Add one Game Boy platform and cartridge collection with GB/GBC/GBA tags, TOSEC/No-Intro indexing and additive rebuilds that preserve IDs and user metadata. Configure existing SameBoy/BGB for GB/GBC and VisualBoyAdvance-M for GBA.
- Route current-system scraping to each cartridge variant, preserve hardware/defaults after scraping, and retain folder sharing, metadata protection and Undo. Add a local navigation icon and compatible emulator choices.
- Keep Arcade-originated Portal shortcuts source-scoped; existing Portal picker capabilities remain unchanged.
- Validation: synthetic indexing, refresh, language parsing, scraper preservation, emulator compatibility, inactive-source resolution, idempotent setup and UI regression tests. Live attachment verified all 749 cartridges (669 GB, 12 GBC, 68 GBA), variant tags, emulator formats and scraper system IDs; representative GB/GBC/GBA plans passed Host validation. SameBoy 1.0.3 command-line usage was verified without booting a ROM.
- Release checks: 481 Arcade tests passed; coordinated repository validation passed with Relay lint skipped because this change does not modify Relay.

## [0.2.52] — 2026-09-08

- Resolve Atari/Spectrum presentation once per game folder during library and catalogue loading. Older single-version scrapes and newly indexed versions now inherit the folder's metadata/artwork without rescraping or rewriting the original records. Preserve protected blanks and ignore stale Atari overrides as metadata donors.
- Share presentation changes made in the legacy Spectrum editor and refresh every affected version immediately. Keep hardware, language, disk sets, paths, profiles, defaults and ScummVM registration metadata separate.
- Remove the 0.2.51 default-version filter workaround: cleanup filters now consume the same shared metadata as the individual records and details. Flat collection roots retain separate unrelated titles.
- Validation: legacy override inheritance, newly indexed editions, non-mutating loads, catalogue consistency, successive manual corrections and protected blank fields.
- Final checks: 474 Arcade tests and coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`), plus scoped Ruff and whitespace checks.

## [0.2.51] — 2026-09-08

- Make Missing artwork and Missing description use the same default edition as the displayed Atari/Spectrum group and details. Empty metadata on an older alternative no longer flags a complete game, including when language filters exclude the default edition. ScummVM ports and scrape-review markers retain per-version checks.
- Include the selected Needs attention filter in the active-filter summary.
- Validation: regression coverage for complete and incomplete shared groups, excluded defaults, separate ScummVM ports and review markers.
- Final checks: 471 Arcade tests, 14 packaging/version checks and 26 Nexus tests passed, plus JavaScript syntax and whitespace checks.

## [0.2.50] — 2026-09-08

- Centralise platform labels, adapter recognition, compatible emulators, metadata sharing and scraper platform IDs in one definition file, with a generated browser counterpart. Unknown platforms no longer acquire Spectrum controls or scraper defaults.
- Add Fill missing fields only to individual and bulk scraping, plus Metadata & protection for presentation edits and per-field protection. New manual corrections are protected automatically; protected empty fields stay empty. Retain folder sharing for Atari/Spectrum and separate ScummVM version metadata.
- Add collection-scoped Undo last scrape for individual results and applied batches across all three platforms. Persist bounded row-level history with interrupted-save recovery; retain unrelated edits and refuse Undo when affected rows have changed afterwards.
- Add remembered Needs attention filters for missing artwork, missing description and failed/weak/ambiguous scrape searches. Keep summary payloads compact and update review markers after searches and applies.
- Validation: cross-platform protection, fill-missing saves, persistent/batch Undo, later-edit conflicts, interrupted writes, cleanup filters and generated-definition consistency.
- Final checks: 471 Arcade tests and coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`), plus scoped Ruff and whitespace checks.

## [0.2.49] — 2026-09-08

- Replace the bulk scraper's stacked controls and small thumbnail with a 200 × 220 artwork area on the left, game title and result beside it, and aligned search controls. Clicking the artwork opens the full metadata/artwork preview; narrow windows retain artwork beside the title and stack the search controls.
- Remove the platform-specific explanatory paragraph and redundant single-version labels. Place the provider in the dialog header and allow more space for the results while keeping the dialog within the viewport.
- Rename Match to Use metadata from, show the number of provider search results, and omit the dropdown for a single result. Retain platform/year/publisher distinctions and explicit alternative selection; selecting a result updates the artwork and the metadata to apply.
- Validation: focused bulk dialog checks passed for single/multiple results, selected artwork changes, editable retries, preview and apply. Interactive browser inspection was unavailable.
- Final checks: 459 Arcade tests, 14 packaging/version checks and 26 Nexus registry/client tests passed, plus JavaScript syntax and whitespace checks.

## [0.2.48] — 2026-09-08

- Show the chosen match's cover/loading-screen artwork inline in bulk results. Load only visible/nearby rows and discard image updates for replaced matches or closed dialogs.
- Place the single-game metadata supplier beside the term and platform in the same labelled grid with matching selector heights and responsive stacking.
- Reuse concurrent artwork requests and update each details image as it arrives, without waiting for the second image or refetching POKs/rebuilding the full details pane.
- Cache ScreenScraper PNG downloads in native runtime storage across page/browser reloads. Bound the disposable cache to 128 MiB, 2,048 entries and 30 days; use hashed public references, atomic writes and confined paths. Provider/network gates remain enforced, and cache write failures do not fail successful downloads.
- Validation: cache hits, expiry, corruption/size rejection, eviction and write failure; visible-row thumbnails, stale-image rejection, duplicate-request coalescing and incremental details rendering. First uncached downloads remain subject to provider response time.
- Final checks: 459 Arcade tests and coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`), along with focused UI, Ruff and whitespace checks.

## [0.2.47] — 2026-09-08

- Share scraped metadata and artwork across every Atari/Spectrum version in the same game folder, deduplicating bulk lookups by folder. Preserve exact media, disk order, hardware, language and emulator/profile settings. Write Atari folder overrides atomically and reject partial Spectrum folder updates; do not migrate conflicting old values on startup.
- Expand a ScummVM scrape into all registered versions of the same game in the active library. Search the registration's original platform, retain separate per-version metadata and reuse equivalent searches within the batch. Unspecified platforms require match review.
- Add per-row search-term and Current system/All platforms controls, Search again, alternative result selection and metadata/artwork previews to bulk scraping. Edits invalidate previous matches; completed/unconfirmed writes remain locked. Edited terms also determine title ranking.
- Preserve Spectrum version families and saved defaults across corrected scraped titles using an additive native metadata field.
- Add bounded native scrape planning and preview/apply membership checks without exposing folders or registration targets to the page. Existing persisted identities, override schemas and launch configuration remain intact.
- Validation: folder deduplication and persistence, ST/STe hardware preservation, atomic failures, ScummVM expansion/platform routing, cache target isolation, edited retries, stale-match rejection and integrated bulk-control tests. Interactive browser inspection was unavailable.
- Final checks: coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`); the full Arcade suite passed 455 tests, followed by 18 passing focused folder/persistence checks after the shared-artwork fallback addition. Ruff and whitespace checks passed.

## [0.2.46] — 2026-09-08

- Keep grouped list titles and publishers attached to the same default edition used by details and launches, including when exclusion filters hide that edition. Correcting one Pirates edition no longer leaves a different edition's Space Quest metadata displayed for its row.
- Preselect bulk matches only for a normalized title match scoring at least 75% with no tied top result. Lower substring-match scores so shared words, years and publishers cannot outrank an exact title. Leave weak or ambiguous matches available for explicit review.
- Simplify single-game search to Current system and All platforms for both providers. Build these options from provider type so an older provider payload cannot disable the selector; report when a running native service requires a browser restart instead of silently accepting the wrong scope.
- Validation: focused scraper, persistence and UI regressions passed, including Pirates versus Space Quest, ambiguous/weak matches, filtered default-edition presentation, older provider payloads and stale native search responses.
- Final checks: 440 Arcade tests and the coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`), along with focused UI, Ruff and whitespace checks.

## [0.2.45] — 2026-09-08

- Add a Search platform dropdown beside the single-game search term. Default to the current platform; offer Amiga and other related computer platforms plus All platforms for ScreenScraper and TheGamesDB. Keep the choice local to the open scraper and validate provider-specific scopes before networking.
- Show up to 30 ranked candidates with their source platform. Render results immediately and fetch artwork only for the selected match. Platform/provider changes discard obsolete previews and disable Apply until the new results arrive.
- Applying borrowed metadata/artwork preserves the game's native platform, system, identity and launch configuration; bulk scraping retains current-platform defaults.
- Validation: platform/query routing, invalid scopes, all-platform candidate bounds, unchanged native metadata, stale previews, provider switching and selected-match artwork regressions. Live Amiga and All platforms searches both found Dungeon Master II: The Legend of Skullkeep while retaining the source game's Atari platform. All-platform ScreenScraper requests have a bounded 60-second timeout for slower searches.
- Final checks: 438 Arcade tests and coordinated component/integration/packaging/syntax/version checks passed (`tools/validate.ps1 -SkipWebExtLint`), plus focused UI, Ruff and whitespace checks. The in-app browser was unavailable, so visual browser inspection was not performed.

## [0.2.44] — 2026-09-08

- Use ScreenScraper API v2 title search with ranked review candidates instead of hashless ROM identification. Correct the shipped Spectrum system ID from PC DOS 135 to Spectrum 76 without rewriting stored settings; select Atari ST 42 and ScummVM 123 automatically. Edited terms remain exact and automatic title simplification is bounded to one retry.
- Retrieve screenshots and box covers through the native asset service using bounded public media references. Never send ScreenScraper's credential-bearing media URLs to pages or metadata; preserve saved references across reloads. Prefer exact image types and the requested region, with title-screen fallback when no cover exists.
- Serialize ScreenScraper requests, honor reported minute quotas, pause subsequent requests after rate/daily-quota errors, validate redirects before following, bound image/JSON reads, and report sanitized authentication/quota/service errors. Mark developer credentials as required in provider setup.
- Validation: live authenticated searches and both PNG artwork downloads succeeded for Jetpac (Spectrum), Dungeon Master (Atari ST), and The Secret of Monkey Island (ScummVM), without applying changes to live libraries. Regression coverage includes platform/query routing, media selection, preview redaction, native fetching, persistence, disabled networking, unsafe redirects, response limits and provider failures.
- Final checks: 423 Arcade tests passed; coordinated component, integration, packaging, syntax, registry and version checks passed (`tools/validate.ps1 -SkipWebExtLint`; Relay source unchanged). Focused Ruff checks and whitespace validation passed.

## [0.2.43] — 2026-09-08

- Remove artwork captions and duplicate artwork badges from game details, keeping the images and accessible alternative text. Remove the unused caption space and styles.
- Validation: Arcade tests, JavaScript syntax and component-version checks.

## [0.2.42] — 2026-09-08

- Place Players and Co-op side by side in game details and expand the description's visible height from 92 to 160 px.
- Validation: Arcade tests, JavaScript syntax and component-version checks.

## [0.2.41] — 2026-09-08

- Follow Portal's committed theme through authenticated Relay: colours, light/dark mode, typography, panel opacity, rounding and shadow. Keep the last published presentation while Portal is closed.
- Use Portal's native Spectrum rainbow and Atari Fuji artwork in navigation/settings; retain ScummVM artwork for ScummVM.
- Widen details to 400 px, enlarge artwork, and remove the redundant Platform field and Launch/Scrape/Favourite buttons; context-menu actions remain available.
- Validation: theme projection, invalid payloads, cache restart, out-of-order updates and role isolation regressions; coordinated validation and isolated Firefox workflows.
- Final checks: coordinated validation and Relay lint passed; isolated Firefox ScummVM/custom-colour and Atari/light-theme workflows passed, with screenshot inspection. Additional authoritative theme-save regressions passed.

## [0.2.40] — 2026-09-08

- Replace the utility sidebar with Portal-style menu, Platforms and filter cards, matching rounded surfaces, spacing, typography and version/settings placement. Platform icons select the remembered collection; the game list uses the full content height and details remain collapsible.
- Open Settings from the version button, with General and separate Spectrum, ScummVM and Atari tabs. Keep library location/name drafts when switching settings tabs without activating another library; explicit Save applies the selected section, Cancel discards remaining drafts. Move emulator/provider editors and maintenance actions into Settings.
- Add scoped, revision-checked native collection-location settings; validate folder/platform compatibility, retain emulator pins and source identities, and require the existing reattachment workflow for prepared roots. Media is never moved by settings. Existing emulator editors now capture the settings collection instead of relying on the active game list.
- Reuse local Spectrum/Atari badges and the official licensed ScummVM icon. No runtime artwork downloads or Portal settings/data dependencies.
- Validation: scoped settings, stale drafts, invalid/duplicate roots, failed saves, prepared-root protection and inactive-platform regressions; isolated Firefox layout/settings and existing Atari/ScummVM workflows plus coordinated validation.
- Final checks passed: 1,181 coordinated tests plus 11 Host subtests, zero Relay lint findings, and isolated Firefox desktop/narrow settings, platform navigation, Atari and ScummVM workflows.

## [0.2.39] — 2026-09-08

- Show the actual provider search term beneath the single-game scraper title. Edit it to search again after a 500 ms pause, or press Enter immediately; empty terms pause lookup.
- Preserve original game identity and metadata while using the edited term for TheGamesDB title and ScreenScraper filename queries. Explicit edits bypass automatic title simplification. Ignore obsolete responses and disable Apply immediately when the term changes.
- Validation: provider request/term bounds, unchanged source metadata, automatic fallback reporting, debounced input and stale-result regression checks; Arcade and coordinated validation plus isolated Firefox workflow.

## [0.2.38] — 2026-09-08

- Remember each platform's search, view, include/exclude selections and POK filter across platform switches and page reloads. Clear Filters affects only the current platform.
- Exclusions remove matching editions from list counts, language/system badges and edition labels instead of hiding the whole family. Row actions retain the saved default identity even when that edition is excluded; Properties and Launch Version still expose the complete game.
- Add context-menu Scrape Metadata and bulk scraping for up to 100 selected games, including ScummVM/Atari. Automatically select the highest-confidence candidate, review/uncheck matches together, apply once, report individual outcomes and support stopping after the current game. Refresh the list once after a batch.
- Share the last-used metadata provider between single and bulk scraping, with configured/network-aware fallback. Scope preview/apply requests to their original collection under the collection-change lock.
- Validation: preference persistence, filtered presentation/default identity, match ranking, review/apply, stop/resume, unknown-save and changed-collection regressions; isolated Firefox and coordinated checks.
- Coordinated validation passed: 1,173 tests plus 11 Host subtests and zero Relay lint findings. Isolated Firefox checks covered Atari platform preferences/excluded editions and ScummVM single/bulk scraping, provider persistence and desktop/narrow layouts without launching emulators or modifying live libraries.

## [0.2.37] — 2026-09-08

- Restrict POK filters, columns and details to Spectrum. Filter the emulator editor and adapter choices by the selected platform; keep Spectrum managed-profile controls out of Atari/ScummVM.
- Add unrestricted/include/exclude states to metadata and POK filter checkboxes, with red crosses, keyboard operation, active-filter summaries and retained zero-count choices. Excluded editions remove their displayed game family without changing its saved default.
- Refresh saved metadata and Properties rows without rebuilding unrelated games. Avoid collection discovery on ordinary valid configuration reads, and let artwork load without delaying save or delivery completion.
- Validation: filter/family, platform, late-artwork, targeted-save and binding regressions; coordinated suites and isolated Firefox workflow checks.
- Final checks passed: 1,168 coordinated tests plus 11 Host subtests, three additional filter/Spectrum metadata regressions, zero Relay lint findings, and isolated Firefox checks for Atari, ScummVM and Spectrum. A profiled 1,500-game generated collection reduced metadata save/list refresh from 3.20s with full rebuilding to 1.46s with targeted updates; live-library latency remains a monitoring item.

## [0.2.36] — 2026-09-08

- Load Properties editions from a fresh native version response instead of the page's cached game groups. Include Arcade-only game/collection IDs so newly indexed releases remain selectable even when an open page still has one cached edition.
- Make full image filenames the primary Launch Version labels, retain metadata underneath, and refresh the game list before launching a newly discovered version. Add versioned app/CSS URLs so page reloads fetch the matching frontend assets.
- Validation: stale single-edition cache regression, private identifier/filename API checks, versioned-asset assertions, isolated Firefox selecting Powermonger's Empire release and coordinated tests.

- Final validation passed: 1,165 coordinated tests plus 11 Host subtests, zero Relay lint findings and isolated Firefox acceptance with a deliberately stale one-edition page cache.

## [0.2.35] — 2026-09-08

- Rebuild now discovers added complete Atari disk sets, including alternate releases/dumps, and atomically appends them to the native collection index with a backup. Existing metadata, IDs, missing-file records, favourites and launch settings are retained; incomplete sets and Safe Disks remain excluded.
- Show complete image filenames in Launch Version and Properties, including every member of a multi-disk set and the Drive B selector. Keep these labels in the Arcade-only API.
- Separate game disk settings from the default emulator/profile in Properties. Verify that save disks and empty/game-disk Drive B choices remain edition-owned across Hatari/STEem switches and one-time alternative launches.
- Validation: additive/index failure regressions, rebuild API and private filename coverage, cross-emulator disk/Portal binding tests, Firefox rebuild/dialog checks and coordinated suite.

- Final validation passed: 1,165 coordinated tests plus 11 Host subtests, zero Relay lint findings and isolated Firefox acceptance. The installed Atari index added the Empire and Replicants Powermonger releases with no rejected images.

## [0.2.34] — 2026-09-07

- Add Hatari as an alternative Atari disk-set emulator, including one-time Arcade launches and per-edition Properties defaults shared with Portal. Register installed Hatari without replacing collection defaults.
- Discover named configurations in Hatari's `configs` folder, including extensionless names; use `--configfile` with a private launch copy, exact drive A/B choices, save-disk backups and session leases. Retain profile machine/TOS settings. Filter unsupported STT images and keep STEem limited to ST/STe.
- Validation: synthetic hardware/profile/registration cases, independent Host command/binding/session tests, emulator-menu checks and isolated Firefox Properties persistence; coordinated suite. No live emulator session was launched.

- Final checks passed: 1,157 coordinated tests plus 11 Host subtests, zero Relay lint findings, isolated Firefox Hatari Properties save/reload, and a non-launching plan/profile check against the installed Hatari.

## [0.2.33] — 2026-09-07

- Enable **Scrape Metadata → Apply Selected** for Atari ST collections. Persist validated text and approved HTTPS artwork references in native `atari-overrides/` storage while leaving the source disk-set metadata and images intact.
- Refresh the library and catalogue from exact-edition overrides, retaining hardware/language, original title-family identity, shared defaults and Portal launch policies. Keep generic rename, deletion and file maintenance disabled for the read-only adapter.
- Validation: Atari and ScummVM override persistence, atomic failure/corruption, artwork validation, retargeting and family/default regressions; Host checks existing Portal bindings and saved Properties after scraping; isolated Firefox Apply/reload and coordinated validation.

- Final validation passed: 1,145 coordinated tests plus 11 Host subtests, zero Relay lint findings, and Firefox 155.0.1 Atari Apply/reload acceptance.

## [0.2.32] — 2026-09-07

- Replace the save-disk action dropdown with compatible disks followed by a divider and **Create empty save disk** / **Import save disk…** in the save-disk selector. Execute these actions immediately, automatically name/select the resulting image and keep Properties open. Save applies launch settings; Cancel discards those settings without deleting disks explicitly created or imported.
- Keep edition-owned save disks separate, retain legacy explicit sharing and offer unassigned valid raw images from the game folder. Allocate numbered filenames without overwriting existing data; preserve imported originals and backups. Move backup restoration into a compact expandable section and place Save/Cancel together in the footer.
- Validation: native immediate create/import/restore, draft isolation, edition filtering, no-overwrite and failed-publication recovery tests; isolated Firefox immediate creation, Cancel/reopen, edition switching, cancelled picker and responsive Properties workflow; coordinated validation.

- Final coordinated validation passed: 1,138 tests plus 11 Host subtests, with zero Relay lint findings.

## [0.2.31] — 2026-09-07

- Add Atari game Properties to the context menu: edition/default selection, compatible emulator and named STEem configuration, drive B game/save/empty choice, and save disk creation, import and backup restore.
- Keep save disks in each game's `Safe Disks` folder, with edition-aware filenames. Create formatted blank 720 KiB FAT12 images; copy existing raw `.st` images only on Save. Cancel preserves files and settings. Exclude all save/session images from game discovery.
- Persist per-edition settings natively and retain existing Portal shortcuts after explicit configuration changes and ordinary save writes. Recover interrupted properties commits and preserve save data.
- Validation: isolated Firefox Properties draft/create/profile/drive B and responsive-layout workflow; native FAT12, import, overwrite refusal, backup corruption, restore, rollback and interrupted-commit tests; coordinated suite.

- Coordinated validation: 1,132 tests plus 11 Host subtests passed; Relay lint reported zero findings. Final isolated Firefox 155.0.1 acceptance and 23 focused Properties/native regressions passed.

## [0.2.30] — 2026-09-07

- Add Add to Favourites / Remove from Favourites to the game context menu. Update shared version records, cached details and active filters immediately after a successful save; removing a grouped favourite also clears starred alternative editions.
- Preserve newer selections and collection data while requests finish, prevent duplicate toggles, and show save failures without changing the visible favourite state.
- Validation: grouped favourite add/remove, alternative editions, failed saves and delayed responses; isolated Firefox context-menu/details/filter workflow and Arcade suite.

## [0.2.29] — 2026-09-07

- Add read-only Atari ST disk-set collections with TOSEC editions, grouped titles, language and ST/STe/TT/Falcon badges, and collection-specific STEem SSE selection. Keep every disk in its edition; use the existing STEem configuration and load the first two disks into drives A/B. Reject unsupported TT/Falcon launches. The setup tool previews before applying, backs up configuration and leaves disk images and emulator preferences intact.
- Validation: Atari discovery, exact-set binding and mocked launch regressions; authenticated catalogue routing and Portal hardware presentation checks.

## [0.2.28] — 2026-09-07

### Fixed

- Reject missing or incompatible saved emulator profiles instead of silently replacing them. Preserve custom EightyOne emulator identity and require a destination when copying a managed profile.
- Check supported media formats before direct launch or catalogue approval; implicit catalogue selection skips incompatible emulators.
- Refresh version listings before acquiring the catalogue index lock, avoiding a lock-order conflict with concurrent catalogue updates.
- Discard stale scraper previews and disable Apply while another preview is loading.

### Validation

- Regression coverage exercises missing profiles, custom EightyOne destinations, media compatibility, concurrent version refresh, pinned shortcut creation and out-of-order scraper responses. Process and profile side effects are mocked.
- Coordinated validation passed: 1,102 tests plus 11 Host subtests; Ruff and Relay lint reported no findings. Isolated Firefox 155.0.1 passed mixed-platform picker/default/scraper persistence and legacy Spectrum board switching/reload with ScummVM active. Native launch tests mock process execution.


## [0.2.27] — 2026-09-07

### Added

- Enable ScummVM **Apply Selected** through Arcade-owned metadata and HTTPS artwork-reference overrides in native runtime storage. Save each exact version atomically, retain prior fields on partial reapply, and reload overrides over registered/bundled metadata.
- Refresh catalogue title/year/publisher/description after saving, including inactive sources. Preserve source/game identities, original title-family membership, shared defaults and existing Portal launch approvals. ScummVM registrations, files, original systems/languages and general read-only collection controls remain unchanged.

### Validation

- Nine focused Arcade tests and a Host binding/launch regression passed, covering persistence, other editions, inactive catalogue refresh, generic-engine grouping, unsafe artwork, write failure, corrupt stores and retargeted registrations. Native process execution is mocked; no real game is launched.
- Coordinated validation passed: 1,096 tests plus 11 Host subtests, clean Ruff checks and zero Relay lint findings. Isolated Firefox 155.0.1 verified enabled Apply, durable saving and reload through Relay/Host, plus the existing mixed-platform picker/default/delivery workflow. The synthetic ScummVM INI remained byte-for-byte unchanged.

## [0.2.26] — 2026-09-07

### Fixed

- TheGamesDB searches now select the original system of the exact ScummVM version: DOS/Windows use PC, with provider mappings for Amiga, Atari ST, Macintosh and FM Towns. Unknown systems search without a platform restriction; Steam alone does not imply an OS. Preserve the configured Spectrum filter for Spectrum games and clarify its settings label.
- Scraper setup requires the API key independently of the optional Spectrum filter. Read-only collection previews explain that saving is unavailable and keep Apply disabled.

### Validation

- Fourteen scraper regressions passed, covering platform selection, unknown/Steam systems, preserved Spectrum overrides, title retries, returned candidates and credential redaction. A read-only live TheGamesDB check for Day of the Tentacle returned zero matches with the old Spectrum filter and five with the corrected PC filter.
- Coordinated validation passed: 1,086 tests plus 11 Host subtests, zero Relay lint findings, and clean Ruff checks. Executable modal checks verified read-only previews stay disabled for Apply while writable collections can apply a selected match.

## [0.2.25] — 2026-09-07

### Fixed

- Resolve and launch existing Spectrum shortcuts from their own configured collection without activating it. Reuse the metadata loader and launch adapters with an explicit game/root context; preserve emulator and profile pins.

### Validation

- Coordinated validation passed: 1,072 tests plus 11 Host subtests, with zero Relay lint findings. Firefox verified an existing Spectrum shortcut on its board through switching and reload while ScummVM stayed active, plus the existing ScummVM picker/default workflow. Native mocked-process checks preserve the saved binding and active collection while launching the correct Spectrum target. Real Windows UI Automation confirmed the highlighted file was visible in a 351-file folder.

## [0.2.24] — 2026-09-07

### Fixed

- Route Open in Explorer through Host’s native reveal callback when available, retaining the older-Host fallback. Surface Windows selection failures instead of reporting success after merely starting Explorer.

### Validation

- Coordinated validation passed: 1,069 tests plus 11 Host subtests, with zero Relay lint findings. Firefox 155.0.1 passed startup, shared-database save/reload and the Portal/Arcade workflow. Deterministic tests cover registration overlap, fresh document tokens, stale pings and delayed discovery replies. A real Windows check through Host's Arcade route confirmed file selection and direct directory opening; native tests cover COM cleanup and Windows failures.

## [0.2.23] — 2026-09-07

### Fixed

- Correct Open in Explorer for paths containing spaces by passing the selection switch separately. Select Spectrum game files in their containing folder and open ScummVM game directories directly.

### Validation

- Coordinated checks passed, including 308 Arcade tests, 190 Host tests plus 11 subtests, integration checks and clean Relay lint. Verified in Windows Explorer that a file is selected in its containing folder and a ScummVM directory opens directly, using temporary paths containing spaces and commas. Regression coverage also checks missing targets and Unicode paths.

## [0.2.22] — 2026-09-07

### Fixed

- Reset the emulator when switching collections or platforms, honoring compatible collection defaults and selecting an available platform emulator when no default exists. Limit the launcher dropdown to the selected platform; reject incompatible explicit game pins and protect launch/delivery resolution from stale selections.

### Validation

- Coordinated validation passed: 1,057 tests plus 11 Host subtests; Relay lint had zero findings. Firefox 155.0.1 verified ScummVM to Spectrum and back selects the proper emulator, and Portal switches English/48K to German/128K badges with the Spectrum logo only as favicon. Screenshots were visually inspected. Targeted launcher checks also cover unset defaults, unavailable emulators, incompatible pins, stale selection and shortcut error reporting.

## [0.2.21] — 2026-09-07

### Changed

- Distinguish library platforms from systems. Rename the game column to System; show separate numeric Spectrum 16K/48K/128K badges for all grouped editions, retaining ScummVM system icons. Recognize explicit legacy language labels for display without inferring a language from platform/country or changing source metadata.

### Validation

- Coordinated validation passed: 1,056 tests plus 11 Host subtests, syntax, infrastructure, versions and packaging; Relay lint had zero findings. Firefox 155.0.1 verified grouped Spectrum 48K/128K badges, explicit language-label flags, shared Spectrum artwork, English/48K to German/128K default changes and unchanged source metadata. Native regression checks preserve the resolved approval before and after presentation lookup. Final Arcade and Portal screenshots were visually inspected.

## [0.2.20] — 2026-09-07

### Changed

- Populate Publisher and the new sortable/searchable Series column from a bundled ScummVM metadata snapshot matched by exact engine/game ID. Separate ScummVM/ZX Spectrum platform selection from their collections; remember the last collection and independent column order, visibility and widths per platform, preserving the previous layout as the migration baseline. Existing native targets and import manifests stay unchanged.

### Validation

- Coordinated validation passed: 1,047 tests plus 11 Host subtests, syntax, infrastructure, versions and packaging; Relay lint had zero findings. Firefox 155.0.1 verified publisher/series values, separate selectors, independent platform column widths across switches and reload, shared defaults, Portal delivery and right-aligned badges. Final layouts were visually inspected.

## [0.2.19] — 2026-09-07

### Changed

- Sort country/language flags by normalized code so grouped rows retain a consistent order. Only offer available context-menu emulators matching the ScummVM target kind or the media file extension.

### Validation

- Coordinated validation passed: 1,045 tests plus 11 Host subtests, syntax, infrastructure, versions and packaging; Relay lint had zero findings. Firefox 155.0.1 verified default title badges changing from English/DOS to German/Windows, stable Arcade flag order, ScummVM-only emulator choices, shared defaults and Portal delivery. The Portal title layout was visually inspected.

## [0.2.18] — 2026-09-07

### Changed

- Replace Arcade's platform text with local ScummVM platform badges, a Steam badge and an original green/orange question mark for unspecified platforms. Grouped titles display every available platform; hover labels preserve platform names and Spectrum hardware options. Include upstream artwork sources, attribution and licenses.
- Recognize explicit Steam edition markers from ScummVM, including registrations without an original platform. Show known platform and Steam together; keep native platform IDs, exact targets and launch bindings unchanged.

### Validation

- Coordinated validation: 1,043 tests and 11 Host subtests passed; syntax, component versions, packaging and infrastructure passed; Relay lint reported zero errors, warnings or notices. Firefox 155.0.1 verified grouped platform badges, Steam detection through Host/Relay, shared defaults and Portal delivery, unchanged ScummVM configuration, loaded local assets and unchanged row heights; all nine badges were visually inspected.
- Read-only checks of the configured library identify Chronicle of Innsmouth and Heroine’s Quest as Steam, and The Castle as Windows / Steam.

## [0.2.17] — 2026-09-07

### Changed

- Show one collection row per game with combined platform, edition, language and country options; keep remakes separate. Add Launch Version… and a persistent shared default for double-click/Portal launches. Use local MIT-licensed SVG country/language flags. Retain exact records and file-oriented Incoming/Bin workflows; parse nested ScummVM edition qualifiers.

### Validation

- Coordinated validation plus final focused regressions: 1,035 tests and 11 Host subtests passed. Firefox 155.0.1 verified grouped ScummVM selection, shared defaults in both clients, separate remakes, flags, Inbox delivery, and Spectrum search/pagination/save/reload. Relay lint: zero errors, warnings or notices.

## [0.2.16] — 2026-09-07

### Fixed

- Focus the launched ScummVM game window and check for startup exits before reporting success or recording Recent. Failed process creation and early exits show a bounded startup error in Arcade.
- Validation: startup failure, window focus and native error-redaction regressions passed; the real Host API opened Elvira II (DOS/German) visibly and the game survived Host exit.
- Coordinated validation: 1,012 tests plus 11 Host subtests passed; syntax, infrastructure, version checks and Relay lint passed with zero findings.

## [0.2.15] — 2026-09-07

### Added

- Use Cyrune Arcade in the sidebar heading and a platform-neutral search prompt for the multisystem library.

- Configured ScummVM collections now appear in Arcade and the Portal picker without catalogue preparation. Exact registered targets retain original platforms, languages and settings; Arcade launch and single/batch Send use independently checked Host plans. A native setup tool adds the source with a configuration backup.
- Validation: synthetic mixed-library browsing, exact target launch callbacks, missing/changed registration rejection and existing Spectrum binding regression checks.

- Completed validation: all coordinated suites passed (1,007 tests plus 11 Host subtests), including mixed-version and joined native workflows; Relay lint reported zero findings. Firefox 155.0.1 passed ScummVM selection/save/reload and Arcade batch Inbox delivery. Live checks validated all 169 ScummVM plans and the existing Spectrum preflight without starting games.

## [0.2.14] — 2026-09-07

### Added

- ScummVM configured-source adapter for the common native import manifest, using exact existing target IDs and game directories while preserving release/platform/language variants and text-adventure filename selectors. Global configuration, credentials, native roots and launch authority are excluded from the draft.
- Read-only reference review and exact configured-target launch preflight in the developer inspection tool. Existing ScummVM settings remain authoritative; missing or retargeted registrations fail without title/game-ID substitution. Source setup, catalogue admission and Host execution remain the next integration stage.

### Validation

- Synthetic adapter tests cover editions, private settings, native target identity, retargeting, missing registrations/media, story selectors, INI ambiguity, language/platform handling, unsafe paths, symlinks and non-launching CLI behavior.
- All 169 configured releases in the supplied live library passed discovery, reference review and launch preflight. Discovery took 0.0602 seconds and left the INI byte-for-byte unchanged; the installed ScummVM 2026.3.0 help/version commands were checked in an isolated temporary configuration. No games were launched.
- The coordinated validator passed all component/integration suites, syntax, infrastructure/version checks and Relay lint (zero findings). Arcade has 285 passing tests, including 23 ScummVM checks; focused Ruff F checks passed with caching disabled.

## [0.2.13] — 2026-09-07

### Added

- Native import manifest schema 1 with bounded exact source/entry identity, metadata provenance, edition labels, typed media/artwork references and explicit POK links. Validation rejects unknown fields/versions/targets, duplicate identities, native launch authority and unsafe local paths.
- Managed Spectrum discovery and a non-mutating developer inspection tool. Local reference review checks real-path confinement and missing files; existing remote artwork is preserved as unfetched provenance. Import/apply and ScummVM source/launch integration remain the next stages.

### Changed

- The running Spectrum catalogue now shares row identity and metadata normalization with the first import adapter. Existing public identities, native aliases, 48K/128K/combined releases, POK matching, profile pins and metadata-only browsing remain compatible. No new preparation flow is added to Portal.

### Validation

- Focused tests cover manifest round trips, source/catalogue parity, legacy path-separator identity, editions, POK references, unknown authority and versions, duplicate targets, traversal/Windows aliases, real symlink escapes, missing references and remote artwork without network access.
- All component/integration suites, syntax, infrastructure/version checks and Relay lint passed. Arcade has 262 passing tests, including 35 new import checks and metadata-only discovery of 12,933 synthetic entries. Focused Ruff F checks passed.
- The non-launching live Spectrum preflight passed for the 12,933-game library. Its 12,926 Main metadata entries all produced a native draft with 25 preserved remote artwork references; source metadata remained byte-for-byte unchanged. Isolated-runtime browsing measured 0.9102 seconds cold / 0.0198 seconds warm, and draft discovery 0.9044 seconds, without allocation tracing.

## [0.2.12] — 2026-09-07

### Added

- **Send selected games to Portal** from the checked-row context menu and collection Bulk Actions, for up to 100 games. Sending begins immediately and reports delivered, queued, unconfirmed and unsent items individually.
- Capture each game's pinned emulator/profile and the collection default before sending. Preserve the existing single-game and in-place rebind actions.
- Stop after the current game and explicitly retry only the remaining items with unchanged delivery IDs. Keep an unfinished send available when its dialog is reopened in the same Arcade page; accepted deliveries retain Relay's existing durable queue across extension reloads.

### Validation

- Executable controller tests cover distinct variants and launch pins, queue acknowledgement, partial failure, lost replies, stable retries, duplicate activation, Stop/resume and selection bounds.
- The coordinated validator passed all component and integration suites, syntax, manifest/version checks and Relay lint (zero findings). Eight executable batch/controller checks pass. Isolated Firefox 155.0.1 verified checked-row sending, exact native bindings, queueing with Portal closed, Relay reload, saved Inbox delivery and Portal reload without duplicates; the dialog was checked at 600 and 1,280 pixels.

## [0.2.11] — 2026-09-07

### Changed

- Portal now browses configured managed Spectrum libraries, including read-only sources, without preparation or collection metadata writes. A native metadata index and private identity key retain stable IDs across restarts; prepared IDs and optional later relocation preparation remain compatible.
- Defer media hashing and emulator/profile validation to selected games on Add and launch. Use Arcade's initial configured launcher selection when game/collection defaults are absent, while rejecting broken explicit pins. Respect authoritative Spectrum `system` values even when legacy `memory` differs.
- Move optional preparation/recovery tools under Collection maintenance. Synthetic 12,933-game searches measured about 63 ms warm; read-only real metadata checks projected 34,398 selectable entries and resolved representative profiles without launching emulators. See the [direct browsing validation](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).

## [0.2.10] — 2026-09-06

### Changed

- Advertised catalogue v1 for explicitly prepared writable managed Spectrum sources and updated preparation guidance for Portal's enabled column picker.
- Reduced Windows path-resolution work during read observation by resolving shared parents once, retaining file-ID checks and individually resolving reparse targets. Before/after observations and Host target validation remain in place.
- Verified replacement/missing-file detection, read-lease invalidation, confinement and refusal of unsupported source preparation. The 12,933-entry native benchmark passed cold/warm reads and retained every identity through relocation; the pre-catalogue Arcade writer preserved pinned IDs and failed closed on an unreviewed rename. See the [activation record](../docs/architecture/portal-arcade-spectrum-migration.md#column-picker-activation--2026-09-06).

## [0.2.9] — 2026-09-06

### Added

- Added **Reconnect Collection...**, reachable before library loading and for unavailable prepared sources. A fixed-purpose native folder picker returns opaque handles; the page never submits or retains a target path.
- Added write-free reconnection review and expiring one-use confirmation. Full retained-ID/content verification rejects substitutions, missing files, unexpected Main entries, stale inputs, read-only sources and roots already assigned to another prepared source. Confirmation rechecks under the native writer lock and uses the existing recoverable config/identity/proof transaction.
- Refresh the active service paths after reconnection and discard stale library/metadata caches after reconnection or recovery. Existing catalogue identities and device-binding records remain intact; unchanged reconnection writes no data documents.

### Validation

- Synthetic tests cover unavailable originals, preserved identities, mismatched media/IDs, stale reviews, picker cancellation, bounded/expired/restarted handles, competing confirmations, interrupted reconnection with finish/restore recovery, and sanitized fixed API fields. Executable dialog tests cover source changes, selection cancellation, review, duplicate confirmation, errors and explicit reload.
- Coordinated validation passes all 870 tests, including 209 Arcade tests, plus syntax, manifests, infrastructure, version alignment, packaging and zero-warning Relay lint. Focused Ruff `F` checks and 22 local documentation links/anchors pass.
- Browser discovery returned no available browser; direct-file visual/native-picker acceptance remains pending. No live collection was reconnected and no emulator was launched. Portal catalogue advertisements remain disabled.

## [0.2.8] — 2026-09-06

### Added

- Added **Catalogue Recovery...** with exact-transaction status, write-free review and one-use confirmation. Pending changes offer finish/restore choices; staged moves offer restore only. The preview reports the affected collection, data updates and file moves without exposing native targets.
- Persist the confirmed recovery direction before repairing data, so an interrupted rollback resumes as a rollback. Conflicting external edits, stale reviews, read-only collections and corrupt intent fail closed.
- Keep recovery reachable before library loading and after startup errors. Ordinary catalogue reads/configuration writes now require interrupted work to be reviewed; scraper-secret migration defers while recovery is pending and retries before normal API work.

### Validation

- Temporary-journal tests cover finish/restore, interrupted repairs and restart, stale/expired/replayed confirmations, competing confirmations, write failure, conflicts, staged moves and blocked startup/secret migration. Executable dialog tests cover choice changes, duplicate submission, error/retry, reload and keyboard dismissal.
- Coordinated validation passes all 850 tests, including 189 Arcade tests, plus syntax, manifests, infrastructure, version alignment, packaging and zero-warning Relay lint. Focused Ruff `F` checks and 22 local documentation links/anchors pass. Browser discovery returned no available browser, so visual acceptance remains pending.
- Portal catalogue advertisements remain disabled; source-reattachment UI, older-writer compatibility and direct-file browser acceptance are still pending. No live collection was repaired and no emulator was launched.

## [0.2.7] — 2026-09-06

### Added

- Added **Prepare Catalogue...** for available writable managed Spectrum collections. Review shows verified media, new and retained catalogue identities, and missing metadata IDs before explicit confirmation.
- Added fixed Arcade-only preview/confirm routes over the existing authenticated RPC. Native memory retains at most 16 five-minute one-use reviews; confirmation revalidates the exact source, configuration, metadata, identities, proofs and file signatures under the writer lock. Stale reviews and pending recovery fail without applying the preparation.
- Kept Portal catalogue advertisements disabled. Recovery/reattachment UI and direct-file browser acceptance remain outstanding.

### Validation

- Synthetic collection tests cover write-free review, ID preservation, stale inputs, expiry/restart/replay, concurrent confirmation, bounded reviews, pending recovery and fixed API fields. Executable dialog tests cover confirmation, duplicate clicks, errors, captured source and keyboard dismissal/focus.
- Coordinated validation passes all 834 tests, including 173 Arcade tests, plus syntax, manifests, infrastructure, versions, packaging and zero-warning Relay lint. Focused Ruff `F` checks and 21 local documentation links/anchors pass.
- In-app browser discovery returned no available browser; visual and Firefox/Zen transport validation remain pending. No live collection was prepared and no emulator was launched.

## [0.2.6] — 2026-09-06

### Added

- Added exact-entry local PNG references bound to source, entry revision, and file signature. No title matching, remote acquisition, or active-collection dependence is introduced.
- Added a checked native read lease with request-local metadata/configuration/identity/proof reuse. Source checks run before and after each page; external changes discard results, while binding and launch keep independent validation.

### Validation

- A synthetic 12,933-entry native benchmark returns 100 ready entries in 12.041 seconds cold and 7.149 seconds warm, using two source passes and a 42,643-byte response. Disabling the read lease reproduces a timeout at 16.787 seconds. These timings exclude Firefox/Relay IPC and use tiny synthetic media; live-source acceptance remains outstanding.
- Read-lease tests cover cancellation, cache disposal, mutation exclusion, and external metadata changes. Capability advertisements remain disabled.
- Coordinated validation passes all 819 tests, including 158 Arcade tests, plus syntax, manifests, infrastructure, versions, packaging, and zero-warning Relay lint. Focused Ruff `F` and documentation links/anchors pass.

## [0.2.5] — 2026-09-06

### Added

- Added private source-scoped catalogue launch decisions for Host entry-policy bindings. Resolution uses the entry's configured emulator or its exact collection default and honors missing profile pins without selecting another emulator or activating a collection.
- Reused the existing launch adapters with exact-source game data and Host-validated process/profile-copy callbacks. Verified source reattachment and policy edits retain bindings; running-emulator choices remain explicit.

### Validation

- Host/Arcade integration tests use temporary collections, profiles, and executables with mocked process creation. They cover stale selections, missing/changed media, policy edits, managed profile copies, source relocation, and unchanged legacy pins. Existing Arcade dispatchers expose no catalogue maintenance or launch-plan method.
- The coordinated validator passes all 157 Arcade tests and 100 Host tests, with 744 tests across the repository. Syntax, infrastructure/version/package validation, Relay lint, focused Ruff `F`, and documentation link/anchor checks pass.

## [0.2.4] — 2026-09-06

### Added

- Added native-only dry-run/apply source preparation that pins the legacy loader's existing path-derived IDs into managed metadata while preserving favourites, recent history, explicit POK links, and opaque catalogue identities.
- Integrated prepared sources with metadata editing/Undo, rename, import, delete, and restore. Native writer leases and durable move intent precede file changes; atomic journaled metadata/identity/proof writes support interrupted-process completion or conflict-aware rollback.
- Added explicit source reattachment using stored SHA-256 media proofs, preserving IDs while updating private roots and signatures together with native configuration. Missing or different media requires review.
- Added refresh before catalogue reads for configured source, metadata, media, emulator, and profile changes. Stale cursors and entry revisions are rejected; unavailable sources cannot serve a stale snapshot as current.

### Fixed

- Restoring a game retains its stored metadata ID when the managed destination changes.
- Catalogue projection normalizes Arcade's stored language codes to lowercase without changing TOSEC filename parsing or persisted codes.

### Validation

- Synthetic lifecycle coverage exercises native editing, POK/state preservation, move interruption before metadata save, every preparation write, forward/rollback recovery, external-edit conflicts, source-copy verification, and refresh/stale-selection handling. No live collection was prepared and no emulator was launched.
- All 39 lifecycle tests pass. The coordinated validator passes 157 Arcade tests, 456 JavaScript tests, and 251 Python tests in total, plus syntax, manifest, infrastructure, version, packaging, and zero-warning Relay lint checks. Focused Ruff `F` and documentation link/anchor checks pass.
- Catalogue capability advertisements and page/native dispatcher routes remain disabled pending Host binding/policy and Relay integration.

## [0.2.3] — 2026-09-06

### Added

- Added an unadvertised catalogue core with an explicitly prepared version-1 identity registry, ordered initialization migration, atomic revision-checked writes, native writer locking, collision rejection, and stable aliases for managed Spectrum metadata.
- Added source-scoped Spectrum snapshots and native target rechecks without changing Arcade's active collection; distinct hardware releases and editions retain separate identities. Managed moves require an explicit preparation call and an unchanged media signature.
- Added sanitized title/platform search and detail projection, deterministic bounded pages, authenticated expiring cursors, revision invalidation, and fail-closed refreshes. No new page/native route is enabled, no live metadata is migrated, and native readiness remains pending Host policy validation.

### Validation

- Synthetic tests cover identity persistence and failed writes, competing revisions, legacy ID preservation, exact-source resolution, media replacement, metadata/policy changes, payload redaction, paging/cursor failures, and the 12,933-entry read-allocation baseline. Existing runtime dispatch remains isolated from the new capability.
- All 36 new catalogue tests pass. Synthetic 100-entry pages are 39,925 bytes with approximately 4.6 ms first/subsequent reads and 96,183 bytes peak read allocation under `tracemalloc`; this excludes index construction and live-library startup.
- The coordinated validator passes all 118 Arcade tests, 456 JavaScript tests, and 212 Python tests in total, plus syntax, manifest, infrastructure, version, packaging, and zero-warning Relay lint checks. Focused Ruff `F` checks and documentation link checks pass.

## [0.2.2] — 2026-09-04

### Added

- Added dedicated `Set Country` and `Set Language` actions for individual games and bulk selections. Each action opens the existing metadata editor at the relevant selector, retaining filename preview, rename, warnings, and Undo behaviour.
- Added a user-triggered game research action that opens a bounded HTTPS search containing only the title, computer/platform, and hardware system, while respecting the shared external-link destination preference. Legacy records without a platform use their known ZX Spectrum catalogue context.

### Validation

- Arcade frontend tests cover both metadata quick actions, their focused selectors, automatic field selection during bulk edits, and the research action's bounded explicit URL construction.

## [0.2.1] — 2026-09-04

### Added

- Added a compact visible Arcade version badge beside the live library status.
- Added release validation that keeps the displayed fallback and runtime version aligned with Arcade's authoritative component manifest.

### Validation

- Arcade frontend structure and version-alignment tests cover the visible status badge.

## [0.2.0] — 2026-08-31

### Added

- Added bounded metadata and rename Undo plus the existing live TOSEC filename preview to the safer edit workflow.
- Added `tools/benchmark_library.py` for repeatable, content-free large-library timing, memory, and payload measurements.

### Changed

- Import and trash restore now commit filesystem moves, metadata, and index rebuilds as all-or-nothing batches with rollback on any failure.
- Large bulk metadata edits require confirmation after their dry-run summary.

### Validation

- The coordinated release gate passes all 79 Arcade tests and JavaScript syntax checks. The real 12,933-game summary benchmark produced an 8.66 MiB payload, about 45% smaller than the former 16.55 MiB full payload.

## [0.1.0] — 2026-08-31

### Added

- Introduced independent Arcade component versioning and a schema-1 manifest for its page, icon, capabilities, service/Relay/settings protocols and owned schemas.
- Added Arcade to generated Nexus metadata and protocol-compatibility diagnostics without changing preserved `EMUGUI_*` wire identifiers or legacy service aliases.

### Validation

- All 77 Arcade tests pass. Infrastructure validation checks the Arcade manifest, current protocol catalogue, compatibility register and generated Nexus registry; coordinated JavaScript/Python and release validation also pass.

## [Unversioned] — 2026-08-31

### Changed

- Made `arcade_service.py` and `arcade_core` the canonical service/package names, with narrow `emugui_service.py` and `emugui_core` compatibility shims for upgraded Host installations and third-party callers.
- Split authenticated Relay transport and shared-settings handling out of the frontend monolith into `web/transport.js`.
- Replaced the initial full-record library transfer with summary records, indexed browser lookups, and on-selection detail loading; search/filter work is now frame-debounced and reuses precomputed filter sets.
- Summary generation now reads only summary fields instead of deep-copying full records, metadata loading canonicalizes its confined collection root once per pass, and startup renders the library before filesystem-backed collection counts and secondary emulator/status data finish loading.
- Replaced per-game favourite and delete request loops with bounded batch operations.

### Fixed

- Confined metadata, POK, import, and artwork paths to the active collection, including resolved symlink targets.
- Made same-name renames true no-ops and added filesystem/metadata rollback for failed renames and deletes.
- Serialized collection switch/rebuild jobs so concurrent maintenance cannot mutate the active collection simultaneously.
- Enforced Nexus optional-network permission in Arcade, Host, Relay, and remote-artwork rendering rather than treating the setting as presentation-only.

### Validation

- All 77 Arcade tests pass, including path-escape, rollback, batch, summary-payload/materialization, optional-network, and job-serialization regressions; both frontend JavaScript files pass syntax validation.

## [Unversioned] — 2026-08-31

### Changed

- Added the Arcade retro-joystick variant of the shared Cyrune lattice as the external browser page favicon.

### Validation

- Arcade frontend tests and the coordinated repository validator cover the local-file entry point.

## [Unversioned] — 2026-08-25

### Changed

- Arcade now consumes its fixed typed Nexus profile through its authenticated Relay role and applies shared interface language, scale, accessibility, unit-system metadata, and optional-network policy. Revision broadcasts refresh the profile while Nexus is closed; precise location and Portal-only city data are not exposed.
- Updated the Arcade page title, Portal handoff actions, service diagnostics, credential guidance, and transport-neutral documentation to use the Cyrune Arcade, Portal, Relay, and Host names.
- Renamed the active backlog and release log to `Arcade-TODO.md` and `Arcade-CHANGELOG.md` for unambiguous editor tabs.
- Retired the hard-coded standalone Spectaculator launch diagnostic after confirming the configurable ZX validation matrix covers direct, current-instance/SpecStub, new-instance, managed-profile, and representative 48K/128K cases; focused tests retain the Windows-default association route.
- Externalised configuration, favourites/recent state, managed profiles, logs, and cache beneath `%LOCALAPPDATA%/Cyrune/Arcade`; `CYRUNE_ARCADE_DATA` retains a portable/development override.
- Added atomic JSON persistence, persisted-shape validation, concurrent state protection, failed collection-switch rollback, validated HTTPS scraper origins, bounded job history, and launch-profile forwarding.
- Added a health-audit record and focused persistence, collection, job, metadata, and service-runtime regression coverage.

### Fixed

- **Scraped artwork on the external page** — screenshots and loading screens, including existing TheGamesDB URLs, now request bounded image data through authenticated Cyrune Relay. Local artwork continues to load through Cyrune Host.
- **Direct Arcade launches** — fixed a stale profile-state reference that stopped Launch before the request reached Relay, and unified launches with the game-default emulator/profile resolver used for Portal shortcuts.
- **Context-menu launch choices** — an explicitly selected emulator now remains selected when Arcade asks whether to reuse or start another emulator instance.

### Validation

- The coordinated settings and migration audit passes all 69 Arcade tests plus JavaScript and Python validation.
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
- **Project backlog cleanup** — removed actioned overhaul and UI items from `Arcade-TODO.md` so the backlog reflects only remaining work.

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
