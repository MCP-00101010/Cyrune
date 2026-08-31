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
- `WidgetSDK.network.request(...)` is used by the Portal network helper to enforce declared domains, concurrency, timeouts, and response-size bounds. `widget-response.js` verifies the actual streamed body size and returns a reusable response-like buffer; `Content-Length` is only an early rejection hint.
- `WidgetSDK.cache.get/set/remove(widgetType, widgetId, key)` stores small browser-local, expiring values within a per-widget quota; `migrateLegacy(...)` moves an older local-storage entry into that namespace once.
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

1. Copy `widget-template.js` and `widget-template.css` under a new local package directory.
2. Keep the package disabled in production while developing. The fixture's Enable button sets the browser-local opt-in flag.
3. Open `fixture.html`, register the package, exercise resize/reload/cleanup, and inspect the descriptor report.
4. Validate a JSON manifest with `node validate-widget-manifest.cjs manifest.example.json`.
5. Add contract tests before placing a script in Portal's ordered script list.

Local packages are deliberately opt-in. Registration marks them as untrusted and does not grant capabilities; a future installer can build on this boundary without treating external code as a built-in.
