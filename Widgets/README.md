# Cyrune Widgets

Focus Session includes a compact review of the latest completed or stopped work phase: elapsed timer duration, recorded browsing on non-distracting/distracting sites, and up to three main sites. Earlier phases are selectable. Review selection/disclosure are browser-local view state; activity remains in Relay, and no browser runtime records enter portable widget data. Timer time and measured browsing time are distinct; idle/offline/private time is not invented as activity.

Portal widgets are grouped by their existing catalogue category. Each widget’s JavaScript, CSS, tests, fixtures, and practical static assets now live together beneath `Widgets/`. The shared registry, built-ins, SDK, network adapter, settings support, action layout, examples, and validator live in `core/`; Portal remains the runtime host.

Category names and persisted widget type IDs remain unchanged by this layout.

Portal supplies the fixed `portal-widgets` Nexus profile to Widget SDK 3. Widgets read, subscribe, or explicitly resolve inherited values through `WidgetSDK.settings` rather than contacting Relay directly, and all managed optional network requests obey the shared Nexus privacy gate. Effective preference precedence is schema default → global → component override → local Widget setting; inheritance remains opt-in where an existing local setting already exists.

Managed Widget network responses are buffered by `core/widget-response.js`, which enforces the declared byte limit against the actual body even when a server omits or misstates `Content-Length`. Widget code receives a reusable bounded response rather than a live unbounded stream.

`WidgetSDK.presets` stores at most 64 browser-local presets and supports scoped JSON import/export with rename, replace, or skip conflict handling. Presets may contain portable configuration and explicitly included content; credential-shaped fields, caches, runtime state, and machine-local paths are excluded. Applying a preset occurs inside the existing settings draft, so Cancel restores the prior widget. Daily Briefing is a read-only cache/state aggregator and never adds provider authority. Portal's Widget text-scale variable applies consistently across the catalogue.

## Architecture and Guidance

Weather, Weather Map, Astronomy and Global Hazards share category-owned location
lookup. Full UK postcodes use Postcodes.io; city and other postal searches use
Open-Meteo. Postcode selections display the returned built-up-area/locality name,
retaining exact postcode coordinates for forecasts and map centres.
Weather Map follows the first configured Weather widget by default.
**Use Weather location** can be disabled for an independent origin; selecting a
location directly in Weather Map turns following off. Existing manual origins are
retained for that independent mode, and an explicit Cyrune-location choice is preserved.
Weather Map and Hazards retain panning for the same configured location
and refocus when their effective origin/watch coordinates change. Committing a
Weather source location also refreshes linked Weather Map, Hazards and Astronomy widgets.

Reusable templates are available through **Templates** at the bottom left of each
widget's settings modal. Applying a template edits the draft; Done commits and
Cancel restores the widget. The opaque theme-colored Templates dialog can be dragged by its header and recenters on open/resize. The browser-local template library saves independently.
Provider/library credits and runtime notes are collected in
[Nexus's widget sources document](../Nexus/docs/widget-sources.md).

- [Widgets instructions](AGENTS.md) define catalogue layout, state, settings, capabilities, rendering, and validation invariants.
- [Widget SDK reference](core/sdk/README.md) defines descriptors, services, storage ownership, and local-package rules.
- [Component boundaries](../docs/architecture/component-boundaries.md) define the Portal host and Relay/Host authority boundaries.
- [Portal UI guidelines](../docs/architecture/portal-ui-guidelines.md) apply to Portal-hosted widget settings and modal surfaces.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines the Widgets manifest, SDK protocol declaration, generated registry, and migrations.

## Local UI State

Meaningful widget UI state must survive reloads locally. This includes selected tabs, filters, expanded or collapsed sections, and map/globe cameras. Use `WidgetSDK.cache` for bounded browser-local state rather than portable configuration.

Universal Search state such as an unfinished query or keyboard-highlighted result is transient and must not be restored after reload. Other transient interaction state must not be persisted either.


Focus Session controls one Relay-owned timer per Firefox profile. Browser Activity provides opt-in hostname reports and tracking controls. Current widgets require Relay 1.4.0 and Portal 0.13.0; their runtime data is browser-local and absent from portable widget data. Legacy Focus caches are retained for explicit history import or paused adoption. See [productivity services](../docs/architecture/productivity-services.md).


Widgets 0.5.0 keeps Browser Activity focused on reports. Choose recorded sites from its dropdown to filter all displayed reports and scope export/deletion; categories and exclusions are set for the current whole domain from Relay’s Timer & Activity Tracker. Idle cutoff, detail retention and daily budget are shared Firefox-profile preferences edited through the widget settings modal. Done commits; Cancel leaves Relay unchanged.


Browser Activity has a top enable/disable tracking switch and Sites, Categories and Work / Focus report tabs. Sites and Categories always show pies with scrollable legends containing elapsed time and percentage. Charts show up to ten slices; larger reports show the top nine plus Others, retaining unlisted time in that total. Tabs, report range, site and scroll choices stay in per-instance local view cache. Offline reports remain viewable without enabling mutations.

Portal shows configured widget names in a shared heading and gives board/sidebar widgets a bordered card surface. Widgets keep their own functional labels; they do not repeat the configured name inside the body. Focus phase labels sit inside the countdown dial.
