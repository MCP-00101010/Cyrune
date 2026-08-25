# Cyrune Widgets

Portal widgets are grouped by their existing catalogue category. Each widget’s JavaScript, CSS, tests, fixtures, and practical static assets now live together beneath `Widgets/`. The shared registry, built-ins, SDK, network adapter, settings support, action layout, examples, and validator live in `core/`; Portal remains the runtime host.

Category names and persisted widget type IDs remain unchanged by this layout.

Portal supplies the fixed `portal-widgets` Nexus profile to Widget SDK 2. Widgets read or subscribe through `WidgetSDK.settings` rather than contacting Relay directly, and all managed optional network requests obey the shared Nexus privacy gate.

## Architecture and Guidance

- [Widgets instructions](AGENTS.md) define catalogue layout, state, settings, capabilities, rendering, and validation invariants.
- [Widget SDK reference](core/sdk/README.md) defines descriptors, services, storage ownership, and local-package rules.
- [Component boundaries](../docs/architecture/component-boundaries.md) define the Portal host and Relay/Host authority boundaries.
- [Portal UI guidelines](../docs/architecture/portal-ui-guidelines.md) apply to Portal-hosted widget settings and modal surfaces.

## Local UI State

Meaningful widget UI state must survive reloads locally. This includes selected tabs, filters, expanded or collapsed sections, and map/globe cameras. Use `WidgetSDK.cache` for bounded browser-local state rather than portable configuration.

Universal Search state such as an unfinished query or keyboard-highlighted result is transient and must not be restored after reload. Other transient interaction state must not be persisted either.
