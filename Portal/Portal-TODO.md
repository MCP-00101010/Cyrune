# Cyrune Portal TODO

This file owns outstanding dashboard, board, item, launcher-presentation, and Portal persistence-client work. Widget implementations belong in `../Widgets/Widgets-TODO.md`; Relay and Host authority belongs in their named component TODOs.

## Reliability and Regression Monitoring

- Continue monitoring persistence and Relay startup for false disk-change warnings, delayed popup actions, registration failures, incorrect recovery prompts, transport errors, and regressions during rapid Inbox delivery or Relay reloads.
- Periodically verify multiple Portal tabs, active-tab routing, and session-token renewal after Portal or Relay reloads.

## Interface Improvements

- Revisit upward drag-and-drop placement within the bottom-aligned widget group without reintroducing the geometry feedback loop fixed in Portal 0.11.119.
- Review background loading with many tabs and images for duplicate decoding, avoidable rerenders, and retained image data.
- Revisit a per-item “ignore inheritance” option after more real-world use of tag inheritance.
- Finish applying the established content-modal and utility-modal patterns to remaining create/edit and Sets surfaces: consistent headers/footers, true text-rail alignment, compact tag sections, sidebar-opacity panels, and accessible control sizing.

## Required-Relay Persistence Cutover

- Remove browser-only main-database load/save/recovery paths after the migration release is proven. Preserve intentionally local widget/UI storage and IndexedDB assets.
- Add explicit incompatible/outdated Relay guidance to the read-only recovery banner once minimum protocol enforcement is enabled.
- Continue exercising missing/late/reloaded Relay, local-file permissions, multiple tabs, rapid edits, stale revisions, interrupted saves, corrupt data, quota exhaustion, and divergent legacy-data rescue.

## Code Health and Documentation

- Continue decomposing large rendering modules where a stable boundary exists and document major functions/data shapes.
- Extract stable user-facing strings into locale files and support drop-in translations.
- Expand user/developer documentation for installation, state schema, rendering, and bridge usage after the migration layout is stable.
