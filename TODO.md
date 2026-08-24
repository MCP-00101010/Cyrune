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

- Add virtual scrolling for the game list.
  - Keep `state.filtered` as the full logical result set.
  - Render only the visible rows plus a small buffer instead of all 10k+ games.
  - Preserve selection, double-click launch, checkbox selection, context menus, and sortable headers.
  - Consider replacing the HTML table body with a CSS grid/list if table virtualization becomes awkward.
  - Goal: make selection, scrolling, and sorting feel closer to a native launcher with very large collections.

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
