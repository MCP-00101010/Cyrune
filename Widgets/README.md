# Cyrune Widgets

Portal widgets are grouped by their existing catalogue category. Each widget’s JavaScript, CSS, tests, fixtures, and practical static assets now live together beneath `Widgets/`. The shared registry, built-ins, SDK, network adapter, settings support, action layout, examples, and validator live in `core/`; Portal remains the runtime host.

Category names and persisted widget type IDs remain unchanged by this layout.

## Local UI State

Meaningful widget UI state must survive reloads locally. This includes selected tabs, filters, expanded or collapsed sections, and map/globe cameras. Use `WidgetSDK.cache` for bounded browser-local state rather than portable configuration.

Universal Search state such as an unfinished query or keyboard-highlighted result is transient and must not be restored after reload. Other transient interaction state must not be persisted either.
