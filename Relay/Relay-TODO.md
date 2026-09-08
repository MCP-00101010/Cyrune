# Cyrune Relay TODO

- Monitor 1.1.12: scrape retry/resume, cross-platform artwork, repeated collection switches and Game Boy picker use. Implementation details and validation: `../docs/reviews/arcade-implementation-2026-09-08.md`.

- Monitor Relay 1.1.11 committed Portal-theme handoff, custom/light themes, Relay restart and Arcade appearance with Portal closed.

- Monitor Relay 1.1.10 Atari ST disk-set browsing, STEem SSE selection, multi-disk swaps and Portal defaults under the [Atari adapter contract](../docs/architecture/arcade-atari-adapter.md).

- Monitor Relay 1.1.9 unchanged-session rediscovery without false reconnect events, Portal startup/discovery overlap, session renewal and stale-token rejection.

This file owns outstanding WebExtension storage authority, authenticated page routing, browser integration, and delivery work.

## Required-Relay Storage Authority

- Monitor Relay 1.1.9 grouped game versions, remakes staying separate, shared default selection, exact alternative launches, missing-default recovery and older-client fallback.

- Monitor Relay 1.1.6 ScummVM catalogue selection, exact native binding/launch and mixed-version capability fallback under the [adapter contract](../docs/architecture/arcade-scummvm-adapter.md). Preserve Spectrum approvals and compact Portal records.

- Continue hardening reload/reconnect behaviour for active Portal and Arcade pages, interrupted queue writes, delivery acknowledgements, quota exhaustion, and stale session tokens.
- Keep intentionally browser-local widget caches, view state, histories, notifications, preferences, and IndexedDB assets outside the authoritative Portal snapshot migration.
- Ensure diagnostics and extension storage never include credentials or unredacted native targets.

## Browser Integration

- Keep Firefox and Zen as the supported integration target and preserve clear local-file permission diagnostics.
- Prefer generic Relay/Host service contracts so individual product integrations do not force avoidable extension releases.

## Portal–Arcade Catalogue and Launch Transport

Relay authenticates and bounds the new Portal catalogue picker and batch-binding workflow without acquiring Arcade business logic or native authority. Coordinate this section with `../Portal/Portal-TODO.md`, `../Arcade/Arcade-TODO.md`, and `../Host/Host-TODO.md`.

The 2026-09-06 [Catalogue capability v1 design](../docs/architecture/portal-arcade-contract.md#catalogue-capability-v1--implementation-target) defines the reserved routes, limits, retries, and optional negotiation. Implement it against the [Spectrum acceptance gates](../docs/architecture/portal-arcade-spectrum-migration.md); catalogue v1 is enabled for the initial managed Spectrum/column scope. Batch publication has a separate enablement gate after the column picker.

- Version the Portal, Arcade, Relay, and Host protocol/capability changes before enabling the migration. Keep older single-game delivery, status, launch, reveal, rebind, and open-in-Arcade operations compatible during the rollout.
- Monitor Relay 1.1.5 / Host 0.2.5 direct library transport, including the selectable `available` state, Firefox local-file permissions and content/background advertisement agreement. Keep batch publication separately gated.
- Verify the implemented entry-owned PNG route in direct-file Firefox/Zen, including decompression support, cancellation, and icon fallback. Other formats and remote acquisition remain separate follow-ups.
- Keep catalogue pages transient: never cache the full Arcade catalogue, native targets, launch descriptors, or complete metadata in extension storage, durable intake, logs, or diagnostics.
- Connect Portal confirmation/retry UI to the implemented ordered binding transport, retaining the same request UUID and native session for retries. Reconnection requires fresh registration and must not replay an old session automatically.
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
