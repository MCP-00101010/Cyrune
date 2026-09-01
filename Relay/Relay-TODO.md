# Cyrune Relay TODO

This file owns outstanding WebExtension storage authority, authenticated page routing, browser integration, and delivery work.

## Required-Relay Storage Authority

- Continue hardening reload/reconnect behaviour for active Portal and Arcade pages, interrupted queue writes, delivery acknowledgements, quota exhaustion, and stale session tokens.
- Keep intentionally browser-local widget caches, view state, histories, notifications, preferences, and IndexedDB assets outside the authoritative Portal snapshot migration.
- Ensure diagnostics and extension storage never include credentials or unredacted native targets.

## Browser Integration

- Keep Firefox and Zen as the supported integration target and preserve clear local-file permission diagnostics.
- Prefer generic Relay/Host service contracts so individual product integrations do not force avoidable extension releases.

## Portal–Arcade Catalogue and Launch Transport

Relay authenticates and bounds the new Portal catalogue picker and batch-binding workflow without acquiring Arcade business logic or native authority. Coordinate this section with `../Portal/Portal-TODO.md`, `../Arcade/Arcade-TODO.md`, and `../Host/Host-TODO.md`.

- Version the Portal, Arcade, Relay, and Host protocol/capability changes before enabling the migration. Keep older single-game delivery, status, launch, reveal, rebind, and open-in-Arcade operations compatible during the rollout.
- Add an exact Portal-role allowlist for bounded read-only Arcade catalogue search, filters, paging, sanitized details, and explicit binding of selected catalogue IDs. Do not expose Arcade mutation, scraper, credential, collection-maintenance, profile-management, arbitrary query, filesystem, or command operations to Portal.
- Bind every catalogue and binding request to the exact authenticated Portal tab, canonical page URL, role, session token, negotiated protocol, and live Host connection. Revalidate role and operation independently on every request and after navigation or reload.
- Bound query text, filter counts and values, page size, continuation data, metadata strings, artwork bytes, batch selection size, response size, timeouts, retries, and retained errors. Forward only declared fields and reject unknown launch-target kinds or capability versions.
- Keep catalogue pages transient: never cache the full Arcade catalogue, native targets, launch descriptors, or complete metadata in extension storage, durable intake, logs, or diagnostics.
- Add retry-safe batch binding transport that returns per-entry success or sanitized failure while preserving request order. Duplicate requests must reuse approved bindings rather than create unbounded keys.
- Extend Arcade-to-Portal delivery to accept bounded batches into the existing active-tab Inbox path with one delivery identity per batch/item as required for exact retry deduplication. Arcade must not name or mutate Portal-internal destinations.
- Preserve one-game-at-a-time launch semantics. Do not add a batch-launch operation; accept one approved `gameKey` per launch request and reject array or batch payloads even if a compromised page constructs them directly.
- Test stale and cross-tab sessions, wrong roles, navigation, unsupported protocols, Host/Arcade reconnects, pagination tampering, oversized filters/results/artwork/batches, duplicate retries, partial batch failure, Relay reload, Portal closed/open delivery, and absence of native data in extension state.
- Minimize temporary-extension churn by implementing the transport as a generic bounded catalogue/binding capability rather than adding platform- or emulator-specific Relay operations.

## Remote Sync Transport

- Add a fixed, Nexus-role-only transport for sync configuration/status, manual fetch/preview/apply/push actions, conflict decisions, and bounded progress. Callers must not provide repository paths, remote URLs, branches, Git commands, credentials, component snapshot contents, or Host staging details through the general message surface.
- Map authenticated component export/merge requests to exact component roles and capability versions. A component may handle only its own declared portable schema; Portal, Arcade, Widgets, and Nexus must not read or mutate one another's authoritative snapshots through Relay.
- Keep sync usable while Nexus is closed by routing only revision/progress notifications and Host-owned scheduled triggers. Consider Relay alarms for opt-in startup/interval sync only after the manual workflow is proven; deduplicate triggers and resume safely across extension/Host reloads without opening Nexus automatically.
- Bound all sync messages, conflict summaries, event histories, retries, and retained status. Test stale sessions, wrong roles, navigation, Relay reload, Host reconnect, quota exhaustion, duplicate actions, and unavailable optional Host sync capability.

## Deferred Chromium Compatibility

- Revisit only for a concrete Chrome/Edge use case.
- Define browser-neutral storage semantics equivalent to authenticated load, revision/hash comparison, conflicts, backups, and atomic save.
- Evaluate File System Access API permission retention without restoring unauthenticated browser-only authority.
- Validate startup, permission loss, external edits, concurrent tabs, large chunked snapshots, and migration between authority implementations before release.
