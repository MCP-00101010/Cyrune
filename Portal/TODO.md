# Cyrune Portal TODO

This file owns outstanding dashboard, board, item, launcher-presentation, and Portal persistence-client work. Widget implementations belong in `../Widgets/TODO.md`; Relay and Host authority belongs in their component TODOs.

## Reliability and Regression Monitoring

- Continue monitoring persistence and Relay startup for false disk-change warnings, delayed popup actions, registration failures, incorrect recovery prompts, transport errors, and regressions during rapid Inbox delivery or Relay reloads.
- Periodically verify multiple Portal tabs, active-tab routing, and session-token renewal after Portal or Relay reloads.

## Interface Improvements

- Revisit upward drag-and-drop placement within the bottom-aligned widget group without reintroducing the geometry feedback loop fixed in Portal 0.11.119.
- Review background loading with many tabs and images for duplicate decoding, avoidable rerenders, and retained image data.
- Revisit a per-item “ignore inheritance” option after more real-world use of tag inheritance.

## Required-Relay Persistence Cutover

- Route every authoritative database load, save, import, reload, Inbox delivery, and recovery operation through the authenticated Relay bridge.
- Wait for a compatible Relay handshake before loading Portal data. Show a blocking, recoverable setup screen when Relay is missing, outdated, disabled, or lacks local-file access; never initialise an empty Portal behind it.
- Detect legacy page snapshots and copy them through Relay only after destination reread/hash verification. Require an explicit choice for divergent page, Relay, or disk snapshots.
- Keep a disconnected session readable, block mutations, retain an in-memory unsaved snapshot, reconnect automatically, and compare authoritative revisions before retrying.
- Remove browser-only main-database load/save/recovery paths after the migration release is proven. Preserve intentionally local widget/UI storage and IndexedDB assets.
- Keep safe non-mutating actions available during authority loss and expose persistent connection/save state.
- Cover missing/late/reloaded Relay, local-file permissions, multiple tabs, rapid edits, stale revisions, interrupted saves, conflict recovery, corrupt data, quota exhaustion, and legacy-data rescue.

## Code Health and Documentation

- Continue decomposing large rendering modules where a stable boundary exists and document major functions/data shapes.
- Extract stable user-facing strings into locale files and support drop-in translations.
- Expand user/developer documentation for installation, state schema, rendering, and bridge usage after the migration layout is stable.
