# Cyrune Host TODO

- Monitor 0.2.26: coordinated data cutover, current protocol negotiation and first-reload browser upgrades. See `docs/architecture/suite-data-cutover.md` at repository root.
- Cutover follow-up: the existing Portal shortcut for Impact! needs explicit rebind because its retained Atari launch fingerprint differs. Two other stale approvals are not referenced by Portal; no replacement authority was granted.

- Monitor 0.2.26: scrape retry/resume, cross-platform artwork, repeated collection switches and Game Boy picker use. Implementation details and validation: `../docs/reviews/arcade-implementation-2026-09-08.md`.

- Monitor Host 0.2.24 installed emulator icons in Arcade's application shortcuts. Retain monitoring of source-scoped Game Boy shortcuts; SameBoy and VBA-M game launches are confirmed working by the user.

- Monitor Host 0.2.22 Arcade/Portal Explorer activation parity after switching Arcade to direct Explorer startup.

- Monitor Host 0.2.21 Open in Explorer restoration for minimized windows and file/folder targets after restarting the browser.

- Monitor Host 0.2.20 per-game Portal delivery latency after removing unrelated collection/profile status work for native adapters.

- Monitor Host 0.2.19 Hatari CFG isolation, cross-emulator save-disk leases and schema-4 policy migration between Hatari and STEem.

- Monitor Host 0.2.18 concurrent first writes to new database lock files on Windows.

- Monitor Host 0.2.17 private STEem profiles, mutable save-disk approvals, backups and persistent session leases. An interrupted start without a recorded child identity remains blocked for native review; add a verified recovery workflow before offering automatic unlock.

- Monitor Host 0.2.16 Atari ST disk-set browsing, STEem SSE selection, multi-disk swaps and Portal defaults under the [Atari adapter contract](../docs/architecture/arcade-atari-adapter.md).

- Monitor opening picker-created Spectrum shortcuts in inactive collections, including verified source reattachment.

- Monitor Host 0.2.15 inactive Spectrum binding resolution and launch, Explorer selection visibility, Windows API game-file selection and folder opening, exact Spectrum hardware fallback with older Arcade services, and exact-default language/platform badges in Portal, including default changes and missing-default handling.

This file owns outstanding native filesystem, process, credential, binding, and device-integration work. Repository relocation itself remains in the root migration plan.

## Application Integration

- Monitor Host 0.2.9 grouped game versions, remakes staying separate, shared default selection, exact alternative launches, missing-default recovery and older-client fallback.

- Monitor Host 0.2.8 ScummVM catalogue selection, exact native binding/launch and mixed-version capability fallback under the [adapter contract](../docs/architecture/arcade-scummvm-adapter.md). Preserve Spectrum approvals and compact Portal records.

- Add bounded installed-application discovery after the explicit picker workflow has sufficient real-world coverage: Start Menu entries on Windows, application bundles on macOS, and desktop entries on Linux.
- Improve native application-icon extraction on macOS and Linux while retaining generic fallbacks and portable unbound placeholders.
- Keep executable paths and command authority in approved device-local bindings rather than portable Portal data.
- Explore an opt-in Windows Explorer **Send to Cyrune Portal** action for supported links and applications. It must create or reuse approved device-local bindings, hand only a sanitized delivery to Relay's durable intake, and provide a removable installer path rather than broad shell execution.

## Portal–Arcade Catalogue Bindings and Exact Launch

Host remains the sole owner of local paths, opaque game bindings, and process execution while Arcade owns catalogue and launch-policy decisions. Coordinate this section with `../Portal/Portal-TODO.md`, `../Arcade/Arcade-TODO.md`, and `../Relay/Relay-TODO.md`.

The 2026-09-06 [Catalogue capability v1 design](../docs/architecture/portal-arcade-contract.md#catalogue-capability-v1--implementation-target) and [Spectrum mapping/acceptance gates](../docs/architecture/portal-arcade-spectrum-migration.md) are the implementation target. [Host 0.2.1 / Arcade 0.2.5](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-host-bindings--host-021-and-arcade-025) implement private entry-policy bindings, atomic approval/receipt persistence, native session leases, and exact-source launch decisions. Legacy pins/keys remain separate. Catalogue v1 is enabled for the initial managed Spectrum/column scope.

- Monitor Host 0.2.5 / Relay 1.1.5 direct library sessions and selected-game binding validation under the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07), including unprepared/read-only collections and metadata changes during Add.
- Keep batch publication separately disabled until its Arcade-role authority and durable queue workflow exist; the current binding primitive accepts only native-registered Portal sessions.
- Monitor native reads on slower devices. The full-size benchmark passes with two source checks per page (7.254 seconds cold / 1.320 seconds warm). Preserve exact-source checks, deadlines, and revocation in further optimization.
- Return only compact sanitized presentation and binding state. Never expose collection roots, media/game paths, emulator/helper/profile paths, arguments, working directories, environment values, credentials, or raw Arcade service errors to Portal or Relay.
- Extend new-policy rebind/open-in-Arcade UX and additional profile adapters around the implemented exact-source launch path. Generic/Spectaculator media launches and EightyOne managed profile copies use Host guards; default-app association and non-EightyOne managed profiles remain unsupported in the new path. Legacy actions retain their existing behaviour.
- Preserve explicit missing, moved, renamed, incompatible, unavailable, forgotten, and unbound states. Stable entry IDs may help repair an existing binding, but Host must never adopt a new local target from a public identity without explicit approval.
- Extend the device-local binding/configuration model for multiple Arcade library sources, platforms, launch-target kinds, and emulator profiles without placing those details in portable Portal state.
- Test duplicate Portal cards sharing a binding, batch retries and partial failures, missing or changed Arcade records, collection moves retaining stable IDs, emulator/profile changes without Portal edits, wrong roles, stale sessions, Host restart, long-lived launched processes, path traversal/symlink escapes, invalid argument arrays, and sanitized diagnostics.

## Authoritative Disk Storage

- Preserve an optional Host boundary: Relay-owned storage must remain available for installations that do not enable native disk or process capabilities.
- Continue recovery testing for interrupted writes, stale revisions, corrupt snapshots, backup exhaustion, and Host reconnects across Portal/Relay upgrades.

## Remote Repository Sync Engine

- Implement a fixed-purpose sync service for a single explicitly configured remote repository, initially supporting manual Portal sync only. Keep its staging worktree outside the source checkout beneath the Cyrune runtime root; never run Git against a live component database or the Cyrune source repository.
- Store remote credentials through the operating system credential store and keep remote configuration, device identity, sync state, locks, journals, and staging paths in Host-owned runtime data. Nexus and component pages must never receive credentials, native paths, arbitrary remotes, Git arguments, command output, or a general filesystem/Git interface.
- Use argument-array, non-interactive, timeout-bounded Git operations against the configured remote and branch. Prohibit force-push, arbitrary ref selection, hooks, submodules, unsafe repository configuration, shell execution, and automatic destructive resets.
- Fetch into isolation, validate the versioned sync manifest and every component snapshot, compare base revisions/content hashes, and obtain a component-owned merge plan before changing authoritative data. Create and verify a local backup, then apply through the component's normal revision-aware atomic persistence boundary.
- Record only bounded content-free sync metadata: device ID, schema/revision/hash identifiers, timestamps, fixed outcomes, and conflict counts. Never record user content, database fragments, credentials, native targets, repository paths, or raw errors in Nexus events or receipts.
- Cover offline operation, authentication failure, interrupted clone/fetch/commit/push, non-fast-forward races, corrupt or oversized snapshots, newer schemas, duplicate device IDs, concurrent local writes, rollback after partial application, and recovery without loss of legitimate post-sync changes.

## Credentials and Security

- Preserve stable credential identifiers and verify secure writes by rereading them before removing any legacy plaintext value.
- Never expose secrets through portable data, extension storage, diagnostics, logs, caches, or migration receipts.
- Retain existing values when secure storage is unavailable and support safe rehydration when Host reconnects.
- Continue validating approved directory/application/game bindings without exporting their targets.
