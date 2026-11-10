# Cyrune Relay TODO

- Monitor the [Firefox development autoload setup](../docs/development/firefox-relay-autoload.md) after Firefox updates: confirm automatic Relay loading, retained custom files and the existing Bitdefender setting. Use the guide's restore/diagnostic steps if startup loading breaks.

- Monitor 1.6.6: single-row daily limit/warning controls at compact popup widths.

- Monitor 1.6.5: independent per-card pause/resume and expiry, retained saved timer rules, expanded distraction controls and shared domain header after extension reload.

- Monitor 1.6.4: popup category navigation, scroll containment, errors and keyboard reachability in the toolbar and address-bar popups; confirm both colour schemes and narrow views after extension reload.


- Monitor 1.6.3: twenty-category choices, schema-4 migration/backup, preserved ambiguous/custom assignments and historical report labels.

- Monitor 1.6.2: clock-card daily totals across subdomains, local midnight, tracking enable/disable and pauses.

- Monitor 1.6.1: early allowance-record conversion/backup and isolation of recovery failures from other clock settings; override expiry/navigation/close/restart, independent saved timer rules, overview bulk selections and exact-document authorization; daily allowance subdomain totals, local-day resets, warnings, profile restart and blocking while Portal is closed.

- Monitor 1.5.2: background-only reloads, fresh intervals after switching away, no catch-up on return and independent deadlines across windows. Active-tab overrides and pause-specific UI belong to future Relay/site settings; keep the current popup compact.

- Monitor 1.5.1: confirm Reddit's logged-in feed with refreshed content handlers, timer skip reasons, sleep/reload title markers and dynamic editor/audio behavior. Firefox owns discarded-tab previews; a retained thumbnail is not evidence of a loaded page.

- Monitor 1.5.0: inactive-tab unloading, audio/edited-form protection, reload timer suspension, domain setting persistence and Firefox restore on selection. Protection preferences remain fixed until Relay gains its settings modal.

- Monitor 1.4.1: aligned reload controls and uniform checkbox/field spacing in the address-bar popup.


- Monitor 1.4.0: automatic valid edits, rapid popup changes/close, compact daily controls, sorted categories and independent distraction flags, migration recovery and flag-based budget totals.


- Monitor 1.3.0: whole-domain timer/category/exclusion choices, scheduled and focus blocking, block-page clock access, restart/migration recovery and global activity settings Done/Cancel.


- Monitor 1.2.0: shared Focus controls, background phase notifications, restart recovery and explicit legacy adoption; opt-in activity sampling, retention/deletion and compact reporting in board/sidebar layouts. See `../docs/architecture/productivity-services.md`.


- Monitor 1.1.19: address-bar clock visibility, off/active/paused presentation and saved refresh controls after navigation and Firefox restart.

- Monitor 1.1.18: link collection in complex selections/frames, copy/paste restoration on rich editors, and saved page refresh across navigation/restarts. Confirm site-specific restrictions through explicit exceptions; retain edited-form reload suppression.

- Monitor 1.1.17: native right-click opt-in, per-site exceptions and embedded-player behavior on real websites; overlays can still obscure the underlying media target.

- Monitor 1.1.16: conditional shortcut repair, stable public game references, exact repair preselection and explicit user approval after missing native records.

- Monitor 1.1.15: authenticated startup delivery and theme loading after removal of unused path helpers.

- Monitor 1.1.14: Monitor Host outage/restart, first-time storage selection and queued writes across explicit storage changes; preserve existing snapshots and fixed native targets.

- Monitor 1.1.13: coordinated data cutover, current protocol negotiation and first-reload browser upgrades. See `docs/architecture/suite-data-cutover.md` at repository root.

- Monitor 1.1.13: scrape retry/resume, cross-platform artwork, repeated collection switches and Game Boy picker use. Implementation details and validation: `../docs/reviews/arcade-implementation-2026-09-08.md`.

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

## Productivity and Tab Tools

- Monitor the 1.6.0 temporary overrides, distracting-site allowances and separate tab-timer overview, plus Widgets 0.6.0 focus-session review. Keep less-used controls in future Relay/site settings rather than expanding the clock popup.

### Deferred: Watch for Updates

- Defer page/section/version change monitoring and optional notify/reload-on-change (2026-10-23). Mod managers and specialist software updaters already cover the strongest examples, while social feeds change routinely on reload. Revisit only for a concrete unmet use case with a clear benefit over existing tools and periodic reloads.

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

- Agreed category work remaining: review all retired labels and recorded Uncategorized domains in resumable batches; migration is complete only when every queued domain is resolved. Implement domain-branch inheritance, more-specific overrides, explicitly linked regional service groups and segment-boundary path exceptions; manual local choices win, ignore query/fragment data, retain service identities for future reports and avoid inventing path distinctions in old hostname-only records. Keep distraction, exclusions, blocking and timers at whole-domain scope.

- Consider a separate Spam & unwanted flag or exclusion reason for unsolicited pop-up/ad domains; keep it separate from site-purpose categories.
