# Cyrune Widgets

Portal widgets are grouped by their existing catalogue category. Each widget’s JavaScript, CSS, tests, fixtures, and static assets will move together during the path-only widget regrouping phase.

Shared registry, SDK, network, settings, and action-layout code belongs in `core/`; widget business logic does not.

## Local UI State

Meaningful widget UI state must survive reloads locally. This includes selected tabs, filters, expanded or collapsed sections, and map/globe cameras. Use `WidgetSDK.cache` for bounded browser-local state rather than portable configuration.

Universal Search state such as an unfinished query or keyboard-highlighted result is transient and must not be restored after reload. Other transient interaction state must not be persisted either.
