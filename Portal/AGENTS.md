# Cyrune Portal Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Portal/`.

## Required Context

Before acting on Portal code, read `Portal/README.md`, `docs/architecture/component-boundaries.md`, and `docs/architecture/portal-ui-guidelines.md`. Read `docs/architecture/portal-arcade-contract.md` when game items, Arcade actions, bindings, thumbnails, or delivery are involved. Read `Widgets/AGENTS.md` before changing widget-host contracts or any file owned by Widgets.

## Architecture and Persistence

- Treat `source/state-schema.js` as the persisted-schema and structural-repair boundary, `source/state.js` as normalized state/persistence/selectors/mutations, `source/render.js` and `source/render-items.js` as composition/rendering, and `source/app.js` as startup and UI orchestration.
- Portal remains a direct `file://` application. Its ordered classic scripts must keep unique top-level declarations; preserve `tests/test_global_script_symbols.cjs` coverage until code is explicitly namespaced or modularized.
- Never silently replace an unavailable or unreadable configured shared database with an empty browser cache. Keep the last readable session visible where safe, block unsafe mutations, and provide actionable Relay/Host recovery.
- Preserve schema IDs, storage keys, the exact-legacy-default title migration, and non-destructive repair of otherwise valid boards and navigation.
- Keep page-originated privileged requests bound to the exact authenticated Relay registration/session. Do not add direct browser or native authority to Portal.

## Interface and Rendering

- Follow `docs/architecture/portal-ui-guidelines.md` for content and utility modals.
- Keep the absolutely positioned top-right Widget action rail a documented hosting contract. Settings consumes one `26px` slot and an optional reload action consumes a second; host changes must preserve those slots in board and sidebar cards, and Widget top rows must not be allowed to render beneath them.
- Use draft state for settings and create/edit previews. Cancel must restore the original state; only the explicit Done/Save action may commit and persist.
- Preserve established drag/drop semantics, selection ordering, Undo/Redo behaviour, and the existing folder-depth limit unless a separately tested migration changes them.
- Prefer targeted rendering for small changes. Preserve expensive widget, map, globe, media, and scroll instances when their owning state has not changed.
- Portal owns widget hosting, not widget implementations. Put widget descriptors, provider logic, widget CSS/assets, and widget-focused tests under `Widgets/`.

## Portable Data and Games

- Portal game items contain presentation data plus an opaque `gameKey`; never persist ROM paths, emulator paths, launch arguments, working directories, profiles, or scraper credentials.
- Route external deliveries to a tab Inbox or the Import Manager and retain delivery-ID deduplication.
- Keep unavailable device-bound applications and games as safe, portable unbound placeholders rather than guessing a local target.

## Validation

Run `node --test "Portal/tests/*.cjs"` for Portal changes. Run the root coordinated validator for persistence, bridge, schema, load-order, Widget-host, Relay, Host, or Arcade boundary changes. Product-visible Portal changes require the root release checklist and a Portal version/changelog update.
