# Cyrune Portal

Cyrune Portal is the local dashboard, bookmark organiser, launcher surface, Inbox, search interface, and widget host formerly developed as Morpheus WebHub.

Open `index.html` directly through a browser with local-file access enabled for Cyrune Relay. Relative scripts, styles, themes, assets, and vendor libraries remain self-contained beneath this directory.

**Add Game** shows one result per title in each Arcade collection, with the available platform/language/edition options. Right-click a game and choose **Launch Version…** to launch an alternative or **Use as default** to save the normal-launch version for both Portal and Arcade. Remakes stay separate. Existing sibling version shortcuts collapse visually within columns, folders and Inboxes while their saved records remain intact.

## Architecture and Guidance

- [Portal instructions](AGENTS.md) define implementation, persistence, rendering, portable-data, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define ownership across Portal, Widgets, Arcade, Relay, and Host.
- [Portal UI guidelines](../docs/architecture/portal-ui-guidelines.md) define content-modal, utility-modal, settings-draft, and accessibility patterns.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) governs compact game items, bindings, client roles, delivery, and security.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Portal's component manifest, protocol advertisements, migrations, and release validation.

Portal scripts run in a deliberate classic-script order for direct-file compatibility. Keep top-level declarations unique. `state-schema.js` owns persisted structural repair, `state.js` owns normalized state and coalesced persistence, `render.js`/`render-items.js` own composition, `background-assets.js` and `background-assets.css` own managed background imports and presentation, and `app.js` owns startup and UI orchestration. Binding-status updates use targeted content renderers, refreshing compact Essentials only when application bindings shown there change, instead of rebuilding navigation and settings. Undo snapshots use the canonical portable serializer and are bounded by count and memory size.

Relay is the required authoritative persistence boundary. It uses Host disk storage when configured and a versioned extension-owned snapshot otherwise; both modes provide revision/hash compare-and-swap semantics. The page cache is a read-only recovery and export aid only and is refreshed after authoritative loads/saves. If authority disappears, Portal keeps that cache readable, discards attempted mutations, shows persistent read-only guidance, and reloads the authoritative revision after reconnection. Browser-only snapshots are never promoted over Relay or Host data.

Normal startup and page reload stay quiet, including Relay's first connection if it finishes after Portal loads. The recovery notice appears only after an established Relay connection has been lost and restored. If browser storage cannot hold another recovery snapshot, authoritative saves continue without a quota popup; the previous cached copy and Trash remain intact, and the current tab retains the latest authoritative snapshot in memory.

Portal and its hosted Widgets consume the fixed `portal-widgets` Nexus settings profile through Relay and Host. The typed client accepts rolling profile schemas 1 and 2, applies shared language and accessibility presentation, and exposes effective values plus global/component sources to Widget SDK 3. Widget-local preferences remain authoritative unless their inheritance switch is enabled. Portal continues with safe defaults when the service is unavailable and refreshes rendered Widgets after revision broadcasts.

## Game Picker

Portal 0.12.7 provides **Add Game** in the context menu of an unlocked regular board column with Relay 1.1.5, Host 0.2.5 and Arcade 0.2.11. Right-click a column, search your Arcade library, select games, and click **Add selected games**. Configured managed Spectrum collections, including read-only collections, are browsed directly; there is no preparation or publication step. Arcade's game/collection emulator default, or its initial configured launcher selection, supplies the launch policy. Firefox 153+ requires Relay's **Access local files on your computer** permission in `about:addons`. Reload Relay and the pages after updating. See the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).

The picker searches bounded pages, keeps exact hardware/edition variants separate, supports up to 100 selected entries and can explicitly copy suggested Arcade tags. Confirmation creates or reuses approved device bindings, then saves successful cards to the captured column as one undoable batch. Failed entries remain visible. Connection changes require a fresh selection; an uncertain save uses Portal's storage recovery without automatically inserting the batch again. Closing the draft discards its catalogue records and artwork.

`source/game-picker.js` owns the in-memory controller and bounded read queue; `source/game-picker-ui.js` and `source/game-picker.css` own the dialog. The bridge supplies only fixed catalogue routes, and `state.js` validates the exact destination and persists compact game items. Folder, Essentials and Speed Dial creation are later picker placements; existing game cards retain their normal move/launch behavior.

## Platform Limits

- Firefox/Zen may require explicit local-file permission for Relay.
- Windows Explorer drag payloads do not reveal trustworthy absolute paths for executable or binary shortcut files; use the Host-backed application picker. Readable `.url` files and allowlisted launcher URIs can be accepted directly.
- External bookmark drags do not expose item-specific data until drop, and dragging a browser bookmark folder exposes only one URL. Full-folder import requires Relay interception.

## Game Shortcut Presentation

Game titles show the actual default version’s language and system badges aligned to the right of each game row, including Spectrum 16K/48K/128K editions. Spectrum favicons use the same rainbow artwork as Arcade. They follow explicit default changes; the tooltip still shows every available language and platform. [Platform artwork and licenses](assets/platforms/NOTICE.md) are bundled locally. Game tooltips show known Arcade languages as local flag icons beside the title.
Existing shortcuts receive this information through their normal Host status refresh;
language metadata stays in the current page's status cache. Unknown languages do not
inherit a flag from the game's platform or release country. ScummVM games use its
[official icon, with attribution and license](assets/scummvm/NOTICE.md), while their
original platform remains visible in the tooltip. [Flag assets](assets/language-flags/SOURCE.txt)
are bundled under the MIT license and require no runtime network requests.

## Tests

```powershell
node --test "Portal/tests/*.cjs"
```

Portal 0.12.10 also browses configured ScummVM registrations with Arcade 0.2.15, Host 0.2.6 and Relay 1.1.6. **Add Game** can search and select releases by their original platform without preparing a catalogue or activating the collection in Arcade. ScummVM retains its own settings and saves; see the [ScummVM contract](../docs/architecture/arcade-scummvm-adapter.md).
