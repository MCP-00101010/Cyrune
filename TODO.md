# Morpheus EmuGUI TODO

## Metadata Editing

- Extend the first-pass metadata editor with dedicated `Set Country` and `Set Language` quick actions.
- Replace comma-separated country/language inputs with proper searchable multi-select controls.
- Add preview-before-save for TOSEC filename changes.
- Add undo/history for rename and metadata edits.
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
  - dry-run summary before applying large edits
  - clearer field-specific warnings for title/system/status changes
  - optional backup of `collection-metadata.json` before bulk changes

## Future Collection Sources

- Add a browsing mode for arbitrary source roots such as raw TOSEC or TheSpectrum collections.
- Reuse the TOSEC parser for title, year, publisher, memory, country, language, flags, and media/version tags.

## Performance / Large Collections

- Virtual scrolling for the game list is implemented while preserving selection, launch, checkbox, context-menu, and sortable-header behaviour.
- Reduce the initial all-games API transfer before or during the monorepo migration.
  - The 2026-08-25 baseline for 12,933 games is a 16.545 MiB JSON payload, about 5.05 seconds to construct the library, 0.53 seconds to materialise API dictionaries, and 0.85 seconds to serialise them with tracing enabled.
  - Prefer a versioned summary-record contract plus on-selection detail loading, paging, or incremental loading.
  - Preserve fast client-side filtering and sorting, or replace them with equivalently responsive bounded service operations.

## Reliability Follow-ups

- The 2026-08-25 health pass added atomic persistence, persisted-shape validation, concurrent state protection, failed collection-switch rollback, HTTPS scraper endpoint validation, bounded job history, and regression tests. See `HEALTH-AUDIT.md`.
- During the monorepo migration, add recoverable filesystem-plus-metadata transactions for rename/import/delete/restore workflows.
- Establish shared Ruff and type-checking policy after the final Python package layout exists; the current mypy/Python 3.14 combination crashes internally.

## Emulator Profiles

- Add a profile comparison view for managed emulator profiles when the original source file is newer or its hash changed.
- Add reusable hardware-specific presets on top of the existing validated emulator argument templates.
- Use parsed metadata such as system, ULAPlus, 128K, AY, or other hardware tags to suggest launch profiles.
- Keep the first version Windows-friendly, but avoid baking in Windows-only assumptions where possible.

## Multi-System Ambitions

- Keep the launcher collection-agnostic enough to support non-Spectrum libraries later.
- Treat systems/platforms as metadata rather than code branches where possible.
- Future target systems:
  - ZX Spectrum
  - Atari ST
  - Game Boy / Game Boy Color
  - ScummVM
  - DOSBox
  - MAME
- Expect some systems to need special launch models:
  - ScummVM uses game IDs and config entries more than plain ROM files.
  - DOSBox often needs per-game working directories, mount commands, and config files.
  - MAME needs machine/driver names, BIOS/device paths, ROM sets, and stricter command templates.
  - Disc-based or multi-file games may need a manifest rather than a single launch file.
