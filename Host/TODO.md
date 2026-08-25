# Cyrune Host TODO

This file owns outstanding native filesystem, process, credential, binding, and device-integration work. Repository relocation itself remains in the root migration plan.

## Application Integration

- Add bounded installed-application discovery after the explicit picker workflow has sufficient real-world coverage: Start Menu entries on Windows, application bundles on macOS, and desktop entries on Linux.
- Improve native application-icon extraction on macOS and Linux while retaining generic fallbacks and portable unbound placeholders.
- Keep executable paths and command authority in approved device-local bindings rather than portable Portal data.

## Authoritative Disk Storage

- Support revision/hash-aware compare-and-swap writes and atomic backups for Relay’s authoritative Portal persistence protocol.
- Provide bounded, content-free diagnostics for missing paths, external changes, corrupt snapshots, backup availability, and recovery.
- Preserve an optional Host boundary: Relay-owned storage must remain available for installations that do not enable native disk or process capabilities.

## Credentials and Security

- Preserve stable credential identifiers and verify secure writes by rereading them before removing any legacy plaintext value.
- Never expose secrets through portable data, extension storage, diagnostics, logs, caches, or migration receipts.
- Retain existing values when secure storage is unavailable and support safe rehydration when Host reconnects.
- Continue validating approved directory/application/game bindings without exporting their targets.
