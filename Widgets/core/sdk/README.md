# Cyrune Widgets SDK

The Widget SDK is a classic-script API for trusted built-ins and explicitly enabled local packages. It does not load remote JavaScript. Built-in descriptors are normalized automatically; local packages register through `WidgetSDK.registry.register()`.

## Descriptor contract

Every widget declares:

- `id`, `name`, `category`, `description`, and `allowedIn`
- `defaultConfig`, `defaultData`, and an object-shaped `settingsSchema`
- `render(widget, element, context)` and optional `reload`, `cleanup`, and `migrate` hooks
- `responsive` width/height hints
- `capabilities` selected from `network`, `extensionRelay`, `nativeHost`, `secureCredentials`, `filesystemPaths`, `geolocation`, `notifications`, `timers`, `localCache`, and `assetCache`

Network capabilities list exact hostnames. Use `user-configured` only when the URL is part of the user's widget configuration. Mark a capability `{ optional: true }` when the widget can still provide a useful reduced experience without it.

## Runtime services

- `WidgetSDK.runtime.schedule(key, task, intervalMs)` provides one visibility-aware schedule per key, error backoff, and cancellation.
- `WidgetSDK.runtime.requestFrame(key, callback)` provides a cancellable animation frame that is included in widget teardown.
- `WidgetSDK.network.request(...)` is used by the Portal network helper to enforce declared domains, concurrency, deadlines through the complete body read, teardown cancellation, and response-size bounds. `widget-response.js` verifies the actual streamed body size and returns a reusable response-like buffer; `Content-Length` is only an early rejection hint.
- `WidgetSDK.cache.get/set/remove(widgetType, widgetId, key)` stores small browser-local, expiring values within a per-widget quota. SDK 4 performs verified old-cache promotion once at startup; widget implementations use only the current cache API.
- `WidgetSDK.presets.list/save/apply/remove/export/import(...)` manages bounded reusable browser-local presets. Portable configuration is included by default; user content is opt-in, while credentials, cache/runtime state, and machine-local paths are excluded. Import conflicts support rename, replace, or skip, and applying inside Portal settings remains reversible with Cancel.
- `WidgetSDK.assets.metadata/list/get/set/remove/clear(widgetType, key)` stores explicitly declared large binary assets in IndexedDB, outside portable Portal state and the small local-storage cache.
- `WidgetSDK.extensionRelay.invoke(widgetType, method, ...args)` and `supports(...)` gate optional extension operations behind the descriptor capability.
- `WidgetSDK.nativeHost.invoke(widgetType, method, ...args)` and `supports(...)` gate fixed-purpose native operations behind the descriptor capability and native availability.
- `WidgetSDK.credentials.status/get/set/remove(...)` provides the secure-credential boundary without exposing the bridge to widget implementations.
- `WidgetSDK.settings.validateDraft(descriptor, widget)` validates configuration before persistence.
- `WidgetSDK.settings.shared()` and `subscribeShared(listener)` expose the fixed Portal & Widgets profile without granting Relay access.
- `WidgetSDK.settings.resolve(path, localValue, { inherit })` returns `{ value, source }`. It uses the profile only when `inherit` is exactly true and otherwise returns the local value with source `local`; inherited sources are `global` or `component`.
- `WidgetSDK.runtime.teardown(widget)` cancels schedules and requests, then invokes cleanup exactly once.

View preferences and small samples belong in `WidgetSDK.cache`; downloaded binary resources belong in `WidgetSDK.assets`; portable configuration belongs in `widget.config`; user content belongs in `widget.data`. Never place credentials, filesystem paths, browser tab IDs, or cache payloads in shared widget state.

When a Widget already has a local preference, add a persisted opt-in switch before adopting the shared equivalent. Default that switch to false for existing behaviour unless an explicit migration says otherwise. Precise location is absent from the profile unless Nexus permission and Host projection both allow it; Widgets must fall back to their local configuration rather than inferring or requesting broader location authority.

Meaningful UI state is restorable by default. A widget should save selected tabs, filters, pages/items, expanded or collapsed details and attribution, map/globe cameras, focus modes, and meaningful scroll positions as bounded per-instance `view` data in `WidgetSDK.cache`. Restore it after widget and Portal reloads, keep it out of portable configuration and content, and remove it from the widget's `dispose` hook. State that is intentionally transient should be documented and covered by a test. Universal Search's unfinished query and keyboard-highlighted result are deliberate transient exceptions; completed recent searches may still be remembered locally when enabled.

## Develop locally

Portal Search reuses Universal Search's pure `CyruneSearchProviders` gateway: `providers()`, `parse(input, config)`, `choices(input, config)`, `url(provider, query)` and `directUrl(input)`. Configuration is copied before normalization; calls neither modify the source widget nor read/write its histories or caches. The gateway grants no network, filesystem or launch capabilities. Portal owns its opt-in completed-search history and result composition.

1. Copy `widget-template.js` and `widget-template.css` under a new local package directory.
2. Keep the package disabled in production while developing. The fixture's Enable button sets the browser-local opt-in flag.
3. Open `fixture.html`, register the package, exercise resize/reload/cleanup, and inspect the descriptor report.
4. Validate a JSON manifest with `node validate-widget-manifest.cjs manifest.example.json`.
5. Add contract tests before placing a script in Portal's ordered script list.

Local packages are deliberately opt-in. Registration marks them as untrusted and does not grant capabilities; a future installer can build on this boundary without treating external code as a built-in.


`WidgetSDK.productivity.request(widgetType, service, action, args, expectedRevision)` is the fixed Relay productivity gateway for built-in `focusSession` and `browserActivity`. Declare `extensionRelay`; no direct browser APIs or Host calls are permitted. Focus mutations require the last focus revision. `WidgetSDK.productivity.subscribe(listener)` returns an unsubscribe function for revision-only change events. SDK commands carry generated request identities; failures remain visible and never fall back to a competing local timer. The bridge advertises `productivityService`; missing support asks for a Relay update. See `docs/architecture/productivity-services.md` for the schema-1 actions and bounds.


Browser Activity uses a service-backed transient settings draft for global idle cutoff, retention and budget. These inputs must not use data-cfg or enter portable widget.config/data. The beforeSettingsCommit hook persists changed service fields and prevents closing on failure; Cancel performs no service mutation.

Focus Session reviews use the existing read-only activity/report gateway with a work-phase sessionId, keeping timer duration distinct from recorded browsing. Review/disclosure selection lives in the widget's local view cache. Relay owns site allowances and temporary tab overrides; widgets receive no tab-control authority and no allowance settings enter portable configuration.


Portal marks the hosted widget body with `data-widget-body`. Renderers may replace its CSS classes; retain this host-owned attribute so shared live refresh controls can locate the body in board and sidebar layouts.

Portal owns `.widget-custom-title` above the body when `widget.title` is nonempty. Renderers keep functional labels but must not duplicate that configured name. The host updates it during initial render and shared settings/refresh paths; clearing the name removes the heading.
