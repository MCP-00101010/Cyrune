# Cyrune Portal

Cyrune Portal is the local dashboard, bookmark organiser, launcher surface, Inbox, search interface, and widget host formerly developed as Morpheus WebHub.

Open `index.html` directly through a browser with local-file access enabled for Cyrune Relay. Relative scripts, styles, themes, assets, and vendor libraries remain self-contained beneath this directory.

## Architecture and Guidance

- [Portal instructions](AGENTS.md) define implementation, persistence, rendering, portable-data, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define ownership across Portal, Widgets, Arcade, Relay, and Host.
- [Portal UI guidelines](../docs/architecture/portal-ui-guidelines.md) define content-modal, utility-modal, settings-draft, and accessibility patterns.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) governs compact game items, bindings, client roles, delivery, and security.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Portal's component manifest, protocol advertisements, migrations, and release validation.

Portal scripts run in a deliberate classic-script order for direct-file compatibility. Keep top-level declarations unique. `state-schema.js` owns persisted structural repair, `state.js` owns normalized state and coalesced persistence, `render.js`/`render-items.js` own composition, `background-assets.js` and `background-assets.css` own managed background imports and presentation, and `app.js` owns startup and UI orchestration. Binding-status updates use the targeted content-surface renderer instead of rebuilding navigation, essentials, and settings. Undo snapshots use the canonical portable serializer and are bounded by count and memory size.

Relay is the required authoritative persistence boundary. It uses Host disk storage when configured and a versioned extension-owned snapshot otherwise; both modes provide revision/hash compare-and-swap semantics. The page cache is a read-only recovery and export aid only and is refreshed after authoritative loads/saves. If authority disappears, Portal keeps that cache readable, discards attempted mutations, shows persistent read-only guidance, and reloads the authoritative revision after reconnection. Browser-only snapshots are never promoted over Relay or Host data.

Portal and its hosted Widgets consume the fixed `portal-widgets` Nexus settings profile through Relay and Host. The typed client accepts rolling profile schemas 1 and 2, applies shared language and accessibility presentation, and exposes effective values plus global/component sources to Widget SDK 3. Widget-local preferences remain authoritative unless their inheritance switch is enabled. Portal continues with safe defaults when the service is unavailable and refreshes rendered Widgets after revision broadcasts.

## Platform Limits

- Firefox/Zen may require explicit local-file permission for Relay.
- Windows Explorer drag payloads do not reveal trustworthy absolute paths for executable or binary shortcut files; use the Host-backed application picker. Readable `.url` files and allowlisted launcher URIs can be accepted directly.
- External bookmark drags do not expose item-specific data until drop, and dragging a browser bookmark folder exposes only one URL. Full-folder import requires Relay interception.

## Tests

```powershell
node --test "Portal/tests/*.cjs"
```
