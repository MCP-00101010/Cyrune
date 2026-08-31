# Cyrune Host TODO

This file owns outstanding native filesystem, process, credential, binding, and device-integration work. Repository relocation itself remains in the root migration plan.

## Application Integration

- Add bounded installed-application discovery after the explicit picker workflow has sufficient real-world coverage: Start Menu entries on Windows, application bundles on macOS, and desktop entries on Linux.
- Improve native application-icon extraction on macOS and Linux while retaining generic fallbacks and portable unbound placeholders.
- Keep executable paths and command authority in approved device-local bindings rather than portable Portal data.
- Explore an opt-in Windows Explorer **Send to Cyrune Portal** action for supported links and applications. It must create or reuse approved device-local bindings, hand only a sanitized delivery to Relay's durable intake, and provide a removable installer path rather than broad shell execution.

## Authoritative Disk Storage

- Preserve an optional Host boundary: Relay-owned storage must remain available for installations that do not enable native disk or process capabilities.
- Continue recovery testing for interrupted writes, stale revisions, corrupt snapshots, backup exhaustion, and Host reconnects across Portal/Relay upgrades.

## Credentials and Security

- Preserve stable credential identifiers and verify secure writes by rereading them before removing any legacy plaintext value.
- Never expose secrets through portable data, extension storage, diagnostics, logs, caches, or migration receipts.
- Retain existing values when secure storage is unavailable and support safe rehydration when Host reconnects.
- Continue validating approved directory/application/game bindings without exporting their targets.
