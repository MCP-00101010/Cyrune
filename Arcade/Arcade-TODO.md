# Cyrune Arcade TODO

## Versioning Follow-up

- Surface the authoritative Arcade component version in a compact visible About/status view; its manifest, Nexus reporting, changelog enforcement and repository validation are implemented.

## Portal-Fronted Multisystem Migration

Arcade becomes Cyrune's game-library workshop, catalogue, metadata authority, emulator-profile manager, and exact-entry launch engine. Portal becomes the normal user-facing organiser and launcher for selected games. Coordinate this section with `../Portal/Portal-TODO.md`, `../Relay/Relay-TODO.md`, and `../Host/Host-TODO.md`.

### Contract and catalogue model gate

- Update the Portal–Arcade architecture contract before implementation. Expose only bounded read-only catalogue search/detail plus explicit bind/launch operations to Portal; keep collection mutation, deduplication, filesystem maintenance, scraping, credentials, and emulator/profile editing Arcade-only.
- Define a versioned launchable-entry model with stable public catalogue IDs. Model platform, hardware/system label, edition/release metadata, source identity, media or launch-target kind, artwork references, and compatible launch profile independently instead of continuing to use Spectrum memory values as the general meaning of `system`.
- Treat every meaningful platform or edition as an independently launchable entry. Do not introduce preferred cross-platform versions or automatic substitution: `Elite — Spectrum 48K`, `Elite — Atari ST`, and `Elite — DOS` bind and launch separately.
- Deduplicate only records that match the configured same-release policy. Preserve materially different hardware versions, enhanced releases, translations, platform ports, and editions as separate entries; optional related-title metadata may assist search but must not alter launch selection.
- Preserve existing stable IDs and compatibility identifiers where possible. Document and test any versioned migration needed for current Spectrum records, Portal bindings, favourites, recent history, metadata, or profiles.

### Bounded Portal catalogue projection

- Add transport-independent paged search, filter, and detail operations that return only sanitized presentation fields and stable catalogue IDs. Never return collection roots, game/media paths, emulator/helper/profile paths, arguments, working directories, credentials, or complete internal records.
- Support filters useful to the Portal picker, initially title and platform/system, with bounded optional metadata such as edition, year, publisher, genre/tags, artwork, and local availability. Define deterministic ordering and continuation/page semantics.
- Keep artwork bounded and served through the existing authenticated asset path. Do not let Portal render arbitrary local paths or unvalidated remote image URLs.
- Add a batch publish action to Arcade's administration UI so selected games can be delivered to Portal's active Inbox with delivery-ID deduplication. Arcade must not read Portal structure or choose a Portal board, tab, folder, Essentials slot, or speed-dial destination.
- Retain the current single-game delivery and bindings during rollout; add compatibility tests for old Portal/Relay/Host combinations and retry-safe mixed-version behaviour.

### Multisystem library workshop

- Define a versioned import manifest that system-specific tools and adapters can produce without granting them launch authority. Include stable source identity, launchable entries, meaningful editions, metadata provenance, artwork references, and local launch-target descriptors that remain confined to Arcade/Host.
- Separate discovery/parsing from review/apply. Use a staged, previewable, recoverable pipeline for scan, metadata extraction, duplicate grouping, meaningful-version retention, merge/sort decisions, artwork acquisition, and catalogue publication.
- Migrate the existing ZX Spectrum/TOSEC collection as the first adapter and regression baseline, preserving distinct 48K/128K releases and POK behaviour. Prioritize Atari ST/STe/Falcon and ScummVM next; keep later adapters for DOSBox, MAME, Atari consoles, SNES, Game Boy, and other systems independent.
- Define launch-target kinds rather than forcing every game into a single-file model: confined media file, multi-file/disc manifest, ScummVM game ID/configuration, DOSBox configuration/working directory, MAME machine/driver, and other explicitly validated adapters.
- Support multiple installed emulators per platform with device-local defaults and exact-entry overrides, including the existing EightyOne/Spectaculator path and future Fuse, STEem SSE, Hatari, and ScummVM profiles. Portal bindings identify an exact Arcade entry, while Arcade remains free to change its emulator/profile configuration without rewriting Portal cards.
- Keep system-specific cleanup scripts small and replaceable by having them emit the common manifest. Do not accumulate unrelated platform parsing, filesystem reorganisation, or emulator quirks in the Portal client or Relay.

### Arcade interface transition and validation

- Refocus the Arcade web interface on source setup, scan/import jobs, duplicate and version review, metadata/artwork, bulk editing, emulator/profile configuration, diagnostics, and selection for Portal publication. Do not duplicate Portal boards, folders, tabs, Essentials, speed dials, Sets, or leisure-oriented organisation.
- Decompose `web/app.js` and `arcade_service.py` along the catalogue-query, source-adapter, review/apply, metadata, profile, launch, and view-controller boundaries as those contracts stabilize; preserve the current transport-independent core and working Spectrum flows during migration.
- Add contract, migration, paging, payload-bound, duplicate-policy, exact-entry launch, batch publication, path-confinement, adapter, and large-library performance tests. Re-run the 12,933-game baseline after the catalogue projection changes and introduce paging before Portal catalogue access if the full summary remains material.
- Retire legacy launcher-oriented Arcade UI only after the Portal picker, exact-entry launch, batch Inbox delivery, and Arcade administration replacements are proven with the existing Spectrum library.

## Metadata Editing

- Extend the first-pass metadata editor with dedicated `Set Country` and `Set Language` quick actions.
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

- Add a bounded game context action that searches the web using the game title plus system, with an optional direct TheGamesDB lookup when a stable provider identity is available.
- Keep search URLs explicit, HTTPS-only, and user-triggered; do not treat search results as trusted metadata until the normal preview/apply workflow validates them.

## Performance / Large Collections

- Virtual scrolling for the game list is implemented while preserving selection, launch, checkbox, context-menu, and sortable-header behaviour.
- The summary transfer now measures 8.66 MiB for 12,933 games, about 45% below the former full payload. Add paging only if repeat runs or slower machines show this remains material.

## Reliability Follow-ups

- The 2026-08-25 health pass added atomic persistence, persisted-shape validation, concurrent state protection, failed collection-switch rollback, HTTPS scraper endpoint validation, bounded job history, and regression tests. See `HEALTH-AUDIT.md`.
- Rename, delete, import, and restore now roll back filesystem and metadata changes on failure. Add a small crash-recovery journal only if real interrupted-process cases show in-memory rollback is insufficient.
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
