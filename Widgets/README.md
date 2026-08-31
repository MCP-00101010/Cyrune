# Cyrune Widgets

Portal widgets are grouped by their existing catalogue category. Each widget’s JavaScript, CSS, tests, fixtures, and practical static assets now live together beneath `Widgets/`. The shared registry, built-ins, SDK, network adapter, settings support, action layout, examples, and validator live in `core/`; Portal remains the runtime host.

Category names and persisted widget type IDs remain unchanged by this layout.

Portal supplies the fixed `portal-widgets` Nexus profile to Widget SDK 3. Widgets read, subscribe, or explicitly resolve inherited values through `WidgetSDK.settings` rather than contacting Relay directly, and all managed optional network requests obey the shared Nexus privacy gate. Effective preference precedence is schema default → global → component override → local Widget setting; inheritance remains opt-in where an existing local setting already exists.

Managed Widget network responses are buffered by `core/widget-response.js`, which enforces the declared byte limit against the actual body even when a server omits or misstates `Content-Length`. Widget code receives a reusable bounded response rather than a live unbounded stream.

`WidgetSDK.presets` stores at most 64 browser-local presets and supports scoped JSON import/export with rename, replace, or skip conflict handling. Presets may contain portable configuration and explicitly included content; credential-shaped fields, caches, runtime state, and machine-local paths are excluded. Applying a preset occurs inside the existing settings draft, so Cancel restores the prior widget. Daily Briefing is a read-only cache/state aggregator and never adds provider authority. Portal's Widget text-scale variable applies consistently across the catalogue.

## Architecture and Guidance

- [Widgets instructions](AGENTS.md) define catalogue layout, state, settings, capabilities, rendering, and validation invariants.
- [Widget SDK reference](core/sdk/README.md) defines descriptors, services, storage ownership, and local-package rules.
- [Component boundaries](../docs/architecture/component-boundaries.md) define the Portal host and Relay/Host authority boundaries.
- [Portal UI guidelines](../docs/architecture/portal-ui-guidelines.md) apply to Portal-hosted widget settings and modal surfaces.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines the Widgets manifest, SDK protocol declaration, generated registry, and migrations.

## Local UI State

Meaningful widget UI state must survive reloads locally. This includes selected tabs, filters, expanded or collapsed sections, and map/globe cameras. Use `WidgetSDK.cache` for bounded browser-local state rather than portable configuration.

Universal Search state such as an unfinished query or keyboard-highlighted result is transient and must not be restored after reload. Other transient interaction state must not be persisted either.
