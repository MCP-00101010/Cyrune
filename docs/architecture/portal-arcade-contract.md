# Cyrune Portal–Arcade Integration Contract

This document promotes the durable security, data, and ownership rules from the completed Portal/Arcade integration plan. Historical implementation steps remain in `docs/history/portal-arcade-integration-plan.md`; this file governs current work.

## Product Responsibilities

Arcade owns collection discovery and maintenance, game metadata and artwork, incoming/review/trash workflows, scrapers, emulator definitions, profiles, launch adapters, launch decisions, favourites, and recent games.

Portal receives explicitly selected games as compact first-class items. It owns their presentation, Portal tags, movement through columns/folders/tabs/Inboxes, search, locks, duplication, Undo, Trash, portable export/import, and user-triggered launch/reveal/rebind actions.

Portal does not scan collections, scrape or mutate game metadata, manage Arcade files, configure emulators/profiles/helpers, or import whole libraries into its portable state.

## Canonical Clients and Roles

- Portal and Arcade remain external direct `file://` applications. Relay authorizes only their configured canonical real pages.
- A matching compatibility meta tag does not grant authority. Relay binds each client to its exact tab, role, page URL, and opaque session token, and rejects stale or navigated registrations.
- Portal receives only narrow status, launch, reveal, rebind, forget, and open-in-Arcade capabilities for approved bindings.
- Arcade receives its own bounded collection, metadata, artwork, scraper, profile, maintenance, job, and launcher capabilities.
- Portal can never call Arcade rename, delete, scrape, import, collection-maintenance, profile-management, or arbitrary filesystem operations.
- Arcade business logic and its canonical HTML/CSS/JavaScript remain outside Relay. Frontend changes take effect after an ordinary page reload without rebuilding or reinstalling Relay.
- `Arcade/arcade_service.py` and `Arcade/arcade_core` are the canonical service and package names, and Host prefers `arcadeRoot`. The former module, package, and root-key names remain read-compatible aliases during the migration window and must not become new call sites.

## Portable Game Item

A Portal game item contains bounded presentation data and an opaque device binding, for example:

```js
{
  id: "game-item-...",
  type: "game",
  title: "Jetpac",
  gameKey: "game_opaque_device_binding",
  system: "zx-spectrum",
  tags: ["Games"],
  thumbnailCache: "data:image/webp;base64,..."
}
```

Optional public library/game identities may assist an explicit rebind workflow, but never grant launch authority. Portable data must not contain ROM/disk/manifest/game-directory paths, emulator/helper/profile/working-directory paths, command strings, argument templates, environment variables, scraper credentials, or complete Arcade metadata records.

Thumbnails must use supported image formats, bounded dimensions and bytes, and the existing portable cache-exclusion controls. Imported or cross-device game items receive a fresh unbound state until the user explicitly approves a local binding.

## Device-Local Binding

Host owns the opaque `gameKey` mapping to stable library/game/emulator/profile identities and any approved native targets. Arcade remains authoritative for resolving current game metadata and launch policy.

- Repeated sends of the same approved combination normally reuse a binding; multiple Portal cards may reference it.
- Renames and moves in Arcade continue resolving when the stable game identity is retained.
- Missing or changed libraries, games, emulators, profiles, and incompatible resources produce explicit recoverable states instead of silently selecting another executable.
- Forgetting or rebinding is explicit. A public identity never automatically adopts an existing device approval.

## Delivery and Runtime

- Arcade sends compact items through its authenticated Relay session to the active Portal tab Inbox.
- Delivery IDs prevent duplicates caused by retries. Durable Relay intake remains quota-bounded and acknowledges each delivery exactly once.
- Game launches use the persistent Host connection so emulator processes survive the native-message response lifecycle.
- Long Arcade operations retain bounded job status/progress and safe cancellation where supported.

## Security and Validation Rules

- Reject unknown bindings, adapters, emulators, profiles, placeholders, launch-target kinds, operations, roles, and message fields.
- Confine every relative game, artwork, profile, and collection path to its approved real root, including traversal and symlink cases.
- Start processes with validated executable paths and argument arrays, never shell command strings or `shell=True` behavior.
- Bound native request/response sizes, transfers, thumbnails, metadata strings, search pages, job histories, configuration counts, and remote artwork.
- Use only validated HTTPS scraper and remote-artwork origins. Treat provider results as untrusted until preview/apply validation.
- Keep credentials out of Portal/Arcade portable state, extension storage, diagnostics, logs, caches, and migration receipts.
- Treat Nexus `privacy.allowOptionalNetwork` as an authoritative permission. Arcade checks it before scraper work, Host fails closed before native dispatch, and Relay checks the fixed `arcade` profile before fetching remote artwork. Browser rendering must never bypass Relay with a direct remote image URL.
- Test first/repeated/retried/multi-game delivery; missing/changed/rebound resources; multiple cards sharing a binding; client/Relay/Host reloads; native reconnection; unavailable/corrupt artwork; and portable cache exclusion whenever the relevant contract changes.

## Compatibility

Historical `EMUGUI_*` native operations, extension messages/events, identifying meta values, installed IDs, credential targets, storage keys, opaque binding fields, and persisted schema values remain compatibility contracts even though current user-facing text uses Cyrune names. Change them only through an explicit versioned migration with old-data and upgraded-install coverage.
