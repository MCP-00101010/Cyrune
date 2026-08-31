# Cyrune Relay TODO

This file owns outstanding WebExtension storage authority, authenticated page routing, browser integration, and delivery work.

## Required-Relay Storage Authority

- Enforce negotiated minimum protocol versions after the current diagnostic-only registration advertisements have been proven across upgraded and stale Portal, Arcade, Nexus and Host installations.
- Continue hardening reload/reconnect behaviour for active Portal and Arcade pages, interrupted queue writes, delivery acknowledgements, quota exhaustion, and stale session tokens.
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
