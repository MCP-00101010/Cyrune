# Cyrune Relay TODO

This file owns outstanding WebExtension storage authority, authenticated page routing, browser integration, and delivery work.

## Required-Relay Storage Authority

- Add a versioned Relay-owned authoritative snapshot for installations without Host-backed disk storage.
- Add revision and content-hash metadata, compare-and-swap writes, an extension-wide serial save queue, and change broadcasts to every registered Portal tab in both storage modes.
- Require every save to state its loaded revision and report success only after the authoritative target accepts the snapshot.
- Add a migration protocol and content-free receipt for legacy page snapshots, including identical, divergent, corrupt, over-quota, interrupted, retried, and already-completed states.
- Advertise minimum-version and baseline capabilities during authenticated page registration.
- Harden reload/reconnect behaviour for active Portal and Arcade pages, pending intake, delivery acknowledgements, and stale session tokens.
- Keep intentionally browser-local widget caches, view state, histories, notifications, preferences, and IndexedDB assets outside the authoritative Portal snapshot migration.
- Ensure diagnostics and extension storage never include credentials or unredacted native targets.

## Browser Integration

- Keep Firefox and Zen as the supported integration target and preserve clear local-file permission diagnostics.
- Prefer generic Relay/Host service contracts so individual product integrations do not force avoidable extension releases.

## Deferred Chromium Compatibility

- Revisit only for a concrete Chrome/Edge use case.
- Define browser-neutral storage semantics equivalent to authenticated load, revision/hash comparison, conflicts, backups, and atomic save.
- Evaluate File System Access API permission retention without restoring unauthenticated browser-only authority.
- Validate startup, permission loss, external edits, concurrent tabs, large chunked snapshots, and migration between authority implementations before release.
