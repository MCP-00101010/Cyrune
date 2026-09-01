# Cyrune Widgets Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Widgets/`.

## Required Context

Before acting on Widgets code, read `Widgets/README.md`, `Widgets/core/sdk/README.md`, and `docs/architecture/component-boundaries.md`. Read `docs/architecture/portal-ui-guidelines.md` when widget settings or other Portal-hosted modal UI is involved, and read `Portal/AGENTS.md` before changing the Portal hosting contract or script order.

## Ownership and Layout

- Keep each widget's JavaScript, CSS, tests, fixtures, and practical static assets together under its catalogue category.
- `Widgets/core` owns shared registry, SDK, cache, scheduling, network, settings, capability, and action-layout services. Do not place component-specific provider or business logic in core.
- Treat Portal's top-right Widget action rail as reserved overlay space. Every Widget title, status, timestamp, input, or other top-row content must remain clear of it in both board and sidebar layouts: reserve at least `26px` for settings-only Widgets and `52px` when reload plus settings actions are present, preferably through `Widgets/core/widget-action-layout.css`, with a focused regression assertion.
- Preserve persisted widget type IDs, catalogue categories, descriptor contracts, load order, and browser-local storage namespaces unless an explicit compatibility migration is documented and tested.
- Widgets run as ordered classic scripts in Portal. Keep top-level declarations unique and retain global-symbol coverage when adding or moving scripts.

## State and Settings

- Use a full draft for settings previews. Cancel restores the original widget; only Done commits portable configuration/content.
- Store portable settings in `widget.config`, user content in `widget.data`, bounded local view state and small samples in `WidgetSDK.cache`, and declared binary assets in `WidgetSDK.assets`.
- Restore meaningful UI state by default: selected tabs, filters, pages/items, disclosures, attribution, map/globe cameras, focus modes, and meaningful scroll positions. Document and test deliberately transient exceptions.
- Remove per-instance local state and assets during disposal/deletion. Never place credentials, filesystem paths, browser IDs, runtime caches, or provider response dumps in shared widget state.

## Capabilities, Network, and Rendering

- Declare every capability in the widget descriptor and use only the corresponding Widget SDK gateway. Keep optional capabilities useful when unavailable and render the standard unavailable state for missing required capabilities.
- Network access must use the SDK, exact declared HTTPS hosts, bounded responses, conservative caching, and explicit `user-configured` handling where applicable. Never load remote JavaScript.
- Use secure credential gateways; never log, cache, export, or persist secrets.
- Prefer targeted updates and retain existing map, globe, media, timer, and long-list instances when configuration and identity are unchanged. Teardown must cancel schedules, requests, and animation frames exactly once.

## Validation

Run the changed widget's colocated `test_*.cjs` file and any shared SDK/registry tests it affects. Run Portal global-symbol/load-order tests when scripts move or globals change, and run the root coordinated validator for SDK, hosting, bridge, capability, or cross-widget changes.
