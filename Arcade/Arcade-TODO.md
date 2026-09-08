# Cyrune Arcade TODO

- Monitor 0.2.57 remembered search terms and platform choices when re-scraping favourites, switching providers and scraping newly indexed versions.

- Monitor 0.2.56: scrape retry/resume, cross-platform artwork, repeated collection switches and Game Boy picker use. Implementation details and validation: `../docs/reviews/arcade-implementation-2026-09-08.md`.

- Monitor Arcade 0.2.55 emulator application shortcuts and compact platform row. Platform swapping, Spectrum titles and SameBoy/VBA-M game launches are confirmed working by the user.

- Monitor Arcade 0.2.52 shared metadata loading for legacy Atari/Spectrum scrapes, newly indexed editions, protected corrections and matching Arcade/catalogue presentation. ScummVM ports remain independent.

- Monitor Arcade 0.2.51 missing-artwork/description filters against the displayed Atari/Spectrum default, especially groups with older unpopulated alternatives and language exclusions.

- Monitor Arcade 0.2.50 shared platform definitions, protected manual metadata, fill-missing scraping, persistent batch Undo and per-platform cleanup filters. Platform definitions now provide the common capabilities; future platforms still require their native adapters.

- Monitor Arcade 0.2.49 larger artwork beside bulk game titles, responsive search controls and clearer provider result selection.

- Monitor Arcade 0.2.48 inline bulk covers, aligned scraper controls and cached/incremental artwork display.

- Monitor Arcade 0.2.47 folder-shared Atari/Spectrum scrapes, ScummVM platform/version batches, editable bulk retries and per-result artwork review.

- Monitor Arcade 0.2.44 ScreenScraper title-match quality, platform routing and native screenshot/cover retrieval after restarting the browser and rescraping affected games.

- Monitor Arcade 0.2.43 compact Players/Co-op details, expanded descriptions and artwork without redundant labels.

- Monitor Arcade 0.2.41 committed Portal-theme handoff, custom/light themes, Relay restart and Arcade appearance with Portal closed.

- Monitor Arcade 0.2.40 Portal-style navigation, compact filters, version-button Settings, per-platform library drafts and emulator editing without switching the active game list.
- Monitor per-platform filter/search restoration, excluded-edition display with unchanged default launches, and reviewed bulk scraper match quality/provider persistence.

- Monitor Arcade 0.2.37 include/exclude filters, platform-specific controls and metadata/Properties save responsiveness on larger live collections.

- Monitor Arcade 0.2.36 fresh dialog edition loading on already-open pages and versioned frontend asset refresh.

- Monitor Arcade 0.2.35 additive Atari reindexing, complete filename labels and emulator-independent edition disk settings.

- Monitor Arcade 0.2.34 Hatari alternative launches, named profiles, hardware compatibility and saved Properties in Arcade/Portal; verify real game boot and disk swapping with user feedback.

- Monitor Arcade 0.2.33 Atari scraped metadata/artwork overrides through reload, inactive-library catalogue browsing and launches with saved Properties.

- Monitor Arcade 0.2.32 immediate create/import from the save-disk selector, per-edition choices and independent launch-settings drafts. Keep ordinary file actions direct and leave Properties open after they complete.

- Monitor Arcade 0.2.31 Atari Properties, per-edition Safe Disks, imports/restores, drive B choices, named profiles and interrupted-save recovery. Verify real STEem in-game save/load and disk swaps when a test session is authorized.

- Monitor Arcade 0.2.30 immediate grouped favourites updates from context menus and bulk actions, including default-version changes and delayed saves.

- Monitor Arcade 0.2.29 Atari ST disk-set browsing, STEem SSE selection, multi-disk swaps and Portal defaults under the [Atari adapter contract](../docs/architecture/arcade-atari-adapter.md).

- Monitor review fixes for strict saved profiles, media compatibility, simultaneous version refresh and scraper preview response ordering.

## Portal-Fronted Multisystem Migration

- Monitor Arcade 0.2.28 ScummVM metadata/artwork override saving, game-aware TheGamesDB searches and legacy Spectrum shortcuts with inactive collections, Explorer opening for game files and ScummVM folders, collection/platform emulator resets, compatible launch selection and Spectrum language/system badges, ScummVM publisher/series coverage, separate platform/collection selection, per-platform column layouts, stable language-flag order, compatible context-menu emulators, platform badges, explicit Steam edition detection, unknown-platform fallback, grouped game versions, remakes staying separate, shared default selection, exact alternative launches, missing-default recovery and older-client fallback.

Arcade becomes Cyrune's game-library workshop, catalogue, metadata authority, emulator-profile manager, and exact-entry launch engine. Portal becomes the normal user-facing organiser and launcher for selected games. Coordinate this section with `../Portal/Portal-TODO.md`, `../Relay/Relay-TODO.md`, and `../Host/Host-TODO.md`.

### Contract and catalogue model gate

- Monitor Arcade 0.2.11 direct library browsing for configured managed Spectrum collections, including read-only sources, under the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07). Preparation is optional relocation maintenance. Keep scraping, credentials and emulator/profile editing Arcade-only.
- Extend browsing to scanned/report-only sources through their native adapters. Continue direct-file administration-dialog and native folder-picker checks on Firefox/Zen. Full-size native relocation and settled-runtime legacy-writer compatibility passed; older binaries must not share a runtime with pending recovery.
- Keep every platform/edition independently launchable underneath grouped title rows. Preserve explicit defaults and exact version selection; never substitute a missing saved default.
- Deduplicate only records that match the configured same-release policy. Preserve materially different hardware versions, enhanced releases, translations, platform ports, and editions as separate entries; title grouping is presentation-only; changing the shared launch default requires an explicit choice.
- Preserve existing stable IDs and compatibility identifiers where possible. Document and test any versioned migration needed for current Spectrum records, Portal bindings, favourites, recent history, metadata, or profiles.

### Bounded Portal catalogue projection

- Monitor whole-source sampling on slower devices. The 12,933-entry native benchmark passed in 7.254 seconds cold / 1.320 seconds warm, with 48,330,761 bytes peak warm-read allocation; installed Firefox also passed the full-size picker workflow.
- Support filters useful to the Portal picker, initially title and platform/system, with bounded optional metadata such as edition, year, publisher, genre/tags, artwork, and local availability. Define deterministic ordering and continuation/page semantics.
- Keep exact-entry PNG handling bounded. The current live corpus has 21 JPEG references; all 12,933 metadata rows safely use the text fallback. Add other formats and remote acquisition only with separate decoder/provider coverage.
- Monitor Arcade 0.2.12 **Send selected games to Portal** for per-game launch pins, partial failures, Stop/resume, unchanged retry identities and closed-Portal queue delivery. The bounded client sequence uses existing single-game sends; a future catalogue-policy publication protocol remains separately gated. Arcade must not read Portal structure or choose a Portal board, tab, folder, Essentials slot, or speed-dial destination.
- Retain the current single-game delivery and bindings during rollout; add compatibility tests for old Portal/Relay/Host combinations and retry-safe mixed-version behaviour.

### Multisystem library workshop

- Monitor Arcade 0.2.13's [native import manifest schema 1 and Spectrum adapter](../docs/architecture/arcade-import-manifest.md): bounded source/entry identity, exact editions, provenance, local/remote artwork references and explicit POK links, with no launch authority. Discovery/review and the running Spectrum catalogue share normalization; a manifest is not a replacement metadata database.
- Separate discovery/parsing from review/apply. Use a staged, previewable, recoverable pipeline for scan, metadata extraction, duplicate grouping, meaningful-version retention, merge/sort decisions, artwork acquisition, and catalogue publication.
- Monitor Arcade 0.2.16's [configured ScummVM integration](../docs/architecture/arcade-scummvm-adapter.md): source selection, mixed-platform Portal browsing, exact registered-target launch and single/batch Send. The supplied library has 169 registrations, including 27 without an explicit original platform. Native API launch verified with Elvira II (DOS/German), including visible startup and survival after Host exits; continue monitoring other engines. Add unregistered-directory discovery and richer metadata/artwork separately. Atari ST/STe now use the disk-set adapter; add TT/Falcon emulators separately.
- Define launch-target kinds rather than forcing every game into a single-file model: confined media file, multi-file/disc manifest, ScummVM game ID/configuration, DOSBox configuration/working directory, MAME machine/driver, and other explicitly validated adapters.
- Support multiple installed emulators per platform with device-local defaults and exact-entry overrides, including the existing EightyOne/Spectaculator path and future Fuse, STEem SSE, Hatari, and ScummVM profiles. Portal bindings identify an exact Arcade entry, while Arcade remains free to change its emulator/profile configuration without rewriting Portal cards.
- Keep system-specific cleanup scripts small and replaceable by having them emit the common manifest. Do not accumulate unrelated platform parsing, filesystem reorganisation, or emulator quirks in the Portal client or Relay.

### Arcade interface transition and validation

- Refocus the Arcade web interface on source setup, scan/import jobs, duplicate and version review, metadata/artwork, bulk editing, emulator/profile configuration, diagnostics, and selection for Portal publication. Do not duplicate Portal boards, folders, tabs, Essentials, speed dials, Sets, or leisure-oriented organisation.
- Decompose `web/app.js` and `arcade_service.py` along the catalogue-query, source-adapter, review/apply, metadata, profile, launch, and view-controller boundaries as those contracts stabilize; preserve the current transport-independent core and working Spectrum flows during migration.
- Add contract, migration, paging, payload-bound, duplicate-policy, exact-entry launch, batch publication, path-confinement, adapter, and large-library performance tests. Re-run the 12,933-game baseline after the catalogue projection changes and introduce paging before Portal catalogue access if the full summary remains material.
- Retire legacy launcher-oriented Arcade UI only after the Portal picker, exact-entry launch, batch Inbox delivery, and Arcade administration replacements are proven with the existing Spectrum library.

## Metadata Editing

- Monitor ScummVM scraper Apply across reload and platform switches, including exact-version overrides and unchanged Portal launches. Add override editing/reset and offline artwork acquisition separately.

- Preserve existing TOSEC-style filename structure where possible.
- TOSEC casing rule:
  - Lowercase ISO 639-1 tags are languages, for example `(en)`, `(de)`, `(es)`, `(ru)`.
  - Uppercase ISO 3166-1 tags are countries/regions, for example `(GB)`, `(DE)`, `(ES)`, `(BR)`, `(RU)`.
  - Uppercase `(EN)` is non-standard and should not be treated as English language.
- If a file already has country/language tags:
  - update the existing tag of the same type
  - avoid duplicating tags
  - keep memory tags such as `(48K)`, `(128K)`, `(48K-128K)` intact
- After rename:
  - rebuild/reload the relevant launcher view
  - keep the renamed item selected if possible
  - update POK matching if title or memory tags changed
- Bulk metadata editing exists, but needs more guardrails:
  - clearer field-specific warnings for title/system/status changes
  - optional backup of `collection-metadata.json` before bulk changes

## Future Collection Sources

- Add a browsing mode for arbitrary source roots such as raw TOSEC or TheSpectrum collections.
- Reuse the TOSEC parser for title, year, publisher, memory, country, language, flags, and media/version tags.

## Research Actions

- Consider an optional direct TheGamesDB lookup only when a stable provider identity and durable HTTPS detail URL are available; the bounded title-plus-platform-plus-system web search is implemented.
- Keep search URLs explicit, HTTPS-only, and user-triggered; do not treat search results as trusted metadata until the normal preview/apply workflow validates them.

## Performance / Large Collections

- Virtual scrolling for the game list is implemented while preserving selection, launch, checkbox, context-menu, and sortable-header behaviour.
- The summary transfer now measures 8.66 MiB for 12,933 games, about 45% below the former full payload. Add paging only if repeat runs or slower machines show this remains material.

## Reliability Follow-ups

- The 2026-08-25 health pass added atomic persistence, persisted-shape validation, concurrent state protection, failed collection-switch rollback, HTTPS scraper endpoint validation, bounded job history, and regression tests. See `HEALTH-AUDIT.md`.
- Prepared catalogue sources now stage rename/delete/import/restore moves before application and journal metadata, identity, and proof updates. Extend that recovery model to unprepared collections and permanent purge only under a separate maintenance change; their existing rollback/destructive-delete behaviour remains the baseline.
- Establish shared Ruff and type-checking policy after the final Python package layout exists; the current mypy/Python 3.14 combination crashes internally.

## Portable Remote Sync Adapter

- After Portal sync is proven, define an opt-in versioned Arcade sync projection for portable favourites, recent/history preferences, metadata edits, collection preferences, and other records whose stable public IDs remain meaningful across devices.
- Exclude collection roots, game/emulator/helper paths, launch arguments, working directories, managed profile files, credentials, logs, caches, scraped binary artwork, and Host-owned bindings. A remote record must never grant launch or filesystem authority on another computer.
- Define component-owned merge rules for stable game IDs, metadata revisions, favourites, history, deletions, and unavailable collections. Preserve local-only launch configuration and present imported records as unavailable/unbound when the matching local collection or approved binding does not exist.
- Test identical and differently rooted libraries, missing games, renamed files with retained IDs, conflicting metadata edits, collection deletion, new-device bootstrap, offline changes, newer schemas, and rollback after an interrupted apply before enabling automatic sync.

## Emulator Profiles

- Add a profile comparison view for managed emulator profiles when the original source file is newer or its hash changed.
- Add reusable hardware-specific presets on top of the existing validated emulator argument templates.
- Use parsed metadata such as system, ULAPlus, 128K, AY, or other hardware tags to suggest launch profiles.
- Keep the first version Windows-friendly, but avoid baking in Windows-only assumptions where possible.

## Multi-System Ambitions

- Superseded by **Portal-Fronted Multisystem Migration** above; retain this heading temporarily as a migration marker so older planning references do not lose their destination.
