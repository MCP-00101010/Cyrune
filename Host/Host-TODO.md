# Cyrune Host TODO

This file owns outstanding native filesystem, process, credential, binding, and device-integration work. Repository relocation itself remains in the root migration plan.

## Application Integration

- Add bounded installed-application discovery after the explicit picker workflow has sufficient real-world coverage: Start Menu entries on Windows, application bundles on macOS, and desktop entries on Linux.
- Improve native application-icon extraction on macOS and Linux while retaining generic fallbacks and portable unbound placeholders.
- Keep executable paths and command authority in approved device-local bindings rather than portable Portal data.
- Explore an opt-in Windows Explorer **Send to Cyrune Portal** action for supported links and applications. It must create or reuse approved device-local bindings, hand only a sanitized delivery to Relay's durable intake, and provide a removable installer path rather than broad shell execution.

## Portal–Arcade Catalogue Bindings and Exact Launch

Host remains the sole owner of local paths, opaque game bindings, and process execution while Arcade owns catalogue and launch-policy decisions. Coordinate this section with `../Portal/Portal-TODO.md`, `../Arcade/Arcade-TODO.md`, and `../Relay/Relay-TODO.md`.

- Add fixed-purpose native operations for bounded Arcade catalogue search/detail and explicit selected-entry binding. Validate the Portal role, negotiated capability, request shape, page/batch limits, and Arcade service response independently of Relay.
- Route catalogue semantics to Arcade's transport-independent service rather than reimplementing search, platform, edition, metadata, duplicate, or emulator logic in Host.
- Create or reuse opaque `gameKey` bindings only after an explicit Portal picker confirmation or authenticated Arcade publication. Bind each key to one exact stable Arcade entry; do not select a preferred platform/version or silently substitute a related entry.
- Add an atomic or recoverable batch-binding operation with deterministic request ordering and per-entry results. Repeated requests for the same approved device-local entry should reuse its binding, and partial failure must not invalidate successful existing bindings.
- Return only compact sanitized presentation and binding state. Never expose collection roots, media/game paths, emulator/helper/profile paths, arguments, working directories, environment values, credentials, or raw Arcade service errors to Portal or Relay.
- Keep launch resolution in Arcade and process authority in Host. A Portal click supplies one approved `gameKey`; Host validates it, asks Arcade for the current exact-entry launch decision, validates the adapter/executable/argument array again, and starts it through the persistent native process path.
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
