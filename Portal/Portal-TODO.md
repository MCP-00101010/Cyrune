# Cyrune Portal TODO

- Monitor uncertain game-action outcomes after Relay reconnects; pending launches and game mutations must never be automatically replayed.

- Monitor Portal 0.12.17 Spectrum hardware badges and omission of duplicate platform icons with older Host metadata, exact-default language/platform badges in Portal, including default changes and missing-default handling.

This file owns outstanding dashboard, board, item, launcher-presentation, and Portal persistence-client work. Widget implementations belong in `../Widgets/Widgets-TODO.md`; Relay and Host authority belongs in their named component TODOs.

## Reliability and Regression Monitoring

- Monitor Portal 0.12.12 grouped game versions, remakes staying separate, shared default selection, exact alternative launches, missing-default recovery and older-client fallback.

- Monitor Portal 0.12.11 ScummVM catalogue selection, exact native binding/launch and mixed-version capability fallback under the [adapter contract](../docs/architecture/arcade-scummvm-adapter.md). Preserve Spectrum approvals and compact Portal records.

- Continue monitoring persistence and Relay startup for false disk-change warnings, delayed popup actions, registration failures, incorrect recovery prompts, transport errors, and regressions during rapid Inbox delivery or Relay reloads.
- Monitor Portal 0.12.8 for quiet startup/reload with healthy Relay, a single recovery notice after an observed outage, and continued authoritative saves when the optional browser recovery cache is full; retain the previous cache and Trash on quota failure.
- Periodically verify multiple Portal tabs, active-tab routing, and session-token renewal after Portal or Relay reloads.
- Monitor Portal 0.12.9 queued game intake during startup and Relay reload, including the bounded early-delivery buffer and acknowledgement only after authoritative saving.
- Monitor application and game shortcuts in Speed Dial and Essentials for drag previews, launch/status refreshes, editing, duplication, and binding recovery after reloads.

## Interface Improvements

- Monitor Portal 0.12.11 language flags and official ScummVM shortcut icons across columns, folders, search, Essentials and Speed Dial, including existing-card status refresh and missing language metadata.

- Continue checking the established content-modal and utility-modal patterns on less-used create/edit surfaces, particularly true text-rail alignment and accessible control sizing.

### Unified search modal — after the current Arcade work

- Unify Portal search, the search widget engine and the game picker in one modal for games, bookmarks and applications.
- Support dragging results into any Portal container that accepts that item type, including eligible columns, folders/subfolders, Essentials and Speed Dial slots. Reuse destination lock/capacity checks, existing item rules and the required binding/save boundaries. Keep games excluded from Sets and bulk-launch workflows.

## Portal-Fronted Arcade Migration

Portal is the user-facing organiser and launcher for a curated selection of games. Arcade remains the catalogue, library-workshop, metadata, emulator-profile, and launch-decision component. Coordinate this section with `../Arcade/Arcade-TODO.md`, `../Relay/Relay-TODO.md`, and `../Host/Host-TODO.md`.

### Contract and item-behaviour gate

- Monitor Portal 0.12.8 direct library browsing, second/later result selection and warm search latency under the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07). No preparation is required. Keep mutation, scraper, profile-management, filesystem, executable, and command authority outside Portal.
- Keep `type: "game"` as a normal first-class Portal item containing bounded presentation data and an opaque device-local `gameKey`. Do not persist ROM/media paths, emulator/profile paths, launch arguments, working directories, complete Arcade metadata records, or Arcade catalogue snapshots.
- Make game items participate in the same organisational behaviours as bookmarks: columns, folders/subfolders, board tabs, Essentials, speed dial, Portal tags, search, selection, duplication, locks, drag/drop, Undo/Redo, Trash, portable export/import, and safe unbound placeholders.
- Explicitly exclude games from Sets, browser-session creation, URL validation, URL-based duplicate checks, folder/open-all commands, and every other multi-activation workflow. Define mixed bookmark/game selection behaviour so a bulk action can never launch several games unexpectedly.
- Keep Portal tags organisational and Arcade metadata descriptive. Copy suggested Arcade tags only through an explicit add/edit choice; never make Portal tag edits mutate the Arcade catalogue implicitly.

### Catalogue picker and curated placement

- Skip separate **Add Game** entry points for folders/subfolders, Essentials and Speed Dial. Placement from search will be handled by drag-and-drop from the planned unified search modal above.
- Continue browser acceptance on Zen and slower devices, including long metadata, maximum selections, partial failures and uncertain saves. Installed Firefox 155.0.1 passed the complete column workflow with 12,933 synthetic entries; adversarial cases remain covered by automated controller and joined native tests.
- Keep the existing Arcade-to-Portal direction as a complementary batch workflow. Arcade may deliver several compact game items to the active Portal Inbox, but it must not inspect or mutate Portal boards, tabs, folders, or destinations.
- Do not add the whole Arcade catalogue to Portal state. Defer dynamic catalogue-backed collections unless real use shows they are valuable beyond the curated picker workflow.

### Launch, recovery, and retirement gate

- Keep normal activation deliberately simple: clicking one game asks Arcade to launch that exact bound entry through Host. Do not route game cards through Portal's generic application launcher.
- Preserve focused context actions for launch, status, open in Arcade, reveal where appropriate, rebind, and forget. Changing an emulator, profile, collection root, or local filename in Arcade must not require editing every Portal card.
- Show missing, changed, unavailable, incompatible, and unbound states without guessing another local target. Synced or imported cards remain visible and inert until explicitly rebound on the current device.
- Add regression coverage for every supported placement, duplicate cards sharing one binding, single versus mixed selection, prohibited Sets/open-all paths, picker paging/filtering, batch add/rollback, unavailable Relay/Host/Arcade, stale sessions, reconnects, and portable serialization without native authority.
- After the Portal picker and batch workflows are proven, make Portal the documented everyday game launcher while Arcade's browser UI narrows to library administration, metadata, emulator configuration, and diagnostics.

## Required-Relay Persistence Cutover

- Continue exercising missing/late/reloaded Relay, local-file permissions, multiple tabs, rapid edits, stale revisions, interrupted saves, corrupt data, quota exhaustion, and read-only cache export/recovery.

## Portable Remote Sync Adapter

- Define a versioned, deterministic Portal sync projection and make Portal the first component in the project-wide remote-repository sync rollout. Reuse the portable database model and normal state-schema repair/persistence boundaries rather than synchronising the live `database.json` file directly.
- Separate portable item presentation and stable logical IDs from device-local application/game bindings, native paths, credentials, caches, browser sessions, and other local authority. Synced application/game items must remain visible but safely unbound on a new device until the user explicitly maps them to approved local bindings.
- Define record-aware three-way merge rules for boards, tabs, columns, folders, items, tags, settings, ordering, and deletions. Automatically merge changes to different stable IDs; use tombstones to prevent deleted records from reappearing; surface same-record conflicts to Nexus without exposing complete records in status events.
- Decide which managed backgrounds and other portable assets participate. Use bounded content-addressed assets and verified references if enabled; exclude caches and avoid unbounded binary Git growth. Missing optional assets must not invalidate an otherwise usable database.
- Validate initial clone into an empty Portal, merge into an existing database, two-device concurrent edits, offline commits, rename/reorder/delete conflicts, stale base revisions, corrupt/newer schemas, interrupted apply, backup restoration, binding rehydration, and identical repeat syncs.

## Code Health and Documentation

- Continue decomposing large rendering modules where a stable boundary exists and document major functions/data shapes.
- Extract stable user-facing strings into locale files and support drop-in translations.
- Expand user/developer documentation for installation, state schema, rendering, and bridge usage after the migration layout is stable.
