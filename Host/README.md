# Cyrune Host

Cyrune Host owns native messaging, filesystem and process authority, approved local bindings, secure credentials, disk-backed Portal persistence, and authoritative Nexus settings and sanitized project metadata.

Run `install.ps1` on Windows or `install.sh` on Linux/macOS to register the compatibility host ID `morpheus_webhub`. Mutable configuration defaults to `%LOCALAPPDATA%\Cyrune\Host\config.json` on Windows and `${XDG_CONFIG_HOME:-~/.config}/Cyrune/Host/config.json` elsewhere. Set `CYRUNE_HOST_CONFIG` for a portable or development override.

`config.example.json` documents the shape only. `arcadeRoot` points to the Cyrune Arcade checkout; Host prefers `arcade_service.py` there while retaining the former root key and service filename as read-compatible upgrade aliases. Never commit the live configuration because it contains device-local paths and approved bindings.

`catalogue_bindings.py` provides entry-policy bindings for configured Arcade libraries, with no preparation prerequisite. It stores new approvals and retry receipts atomically in `catalogue-bindings.json` beside the native configuration, while legacy pinned bindings remain in `config.json`. Browsing uses Arcade's cached metadata projection and returns selectable `available` entries. Only Add and launch resolve exact native media/emulator/profile plans; selected targets are rechecked before approval writes and process creation. `catalogue_transport.py` retains dedicated Relay connections, independent page/session checks and EOF revocation. See the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).

Nexus settings default to `%LOCALAPPDATA%\Cyrune\Nexus\settings.json` on Windows and `${XDG_DATA_HOME:-~/.local/share}/Cyrune/Nexus/settings.json` elsewhere. `CYRUNE_NEXUS_DATA` provides a controlled development override. Host accepts only the exact Nexus page, migrates schema 1 to schema 2, validates the complete typed settings snapshot and sparse component overrides, rejects stale revisions, and returns only revision/time/changed-key metadata from its bounded settings history. It maps document identifiers to a fixed repository allowlist. It also owns the exact typed `portal-widgets` and `arcade` effective subsets and source annotations used by authenticated component roles; callers cannot supply paths or key lists. Precise coordinates are projected only to Portal & Widgets when the global permission and complete bounded pair are present, and component overrides cannot relax global privacy ceilings. Its status adapter independently samples Portal database/schema/backups, Arcade service/state, Nexus settings/backups, Host, repository, and validation health using fixed sanitized codes and recovery guidance, so one failed source does not erase healthy sections. Its user-triggered TODO editor maps a component ID to that same allowlist and starts Visual Studio Code with an argument array; Nexus never provides or receives a path or executable. The separate repository check always compares the current checkout branch with fixed `origin` through non-interactive `git ls-remote`, with a bounded timeout and no fetch or mutation. Host does not expose arbitrary paths, Git commands, or native operations to Nexus.

Relay reaches Portal persistence through fixed-purpose database, backup, theme, and managed-background operations. Host resolves the configured database and confines asset/theme names independently; active page traffic no longer supplies arbitrary filesystem targets. Nexus status uses descriptive storage labels and never returns those resolved local paths.

## Architecture and Guidance

Catalogue artwork uses `catalogue_artwork.py` for entry-owned file resolution and `catalogue_png.py` for bounded decoding/normalization without extra dependencies. Unsupported images use the icon fallback. See the [artwork limits and native benchmark](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-local-artwork-and-read-leases--arcade-026-host-023-relay-113).

- [Host instructions](AGENTS.md) define native authority, security, compatibility, persistence, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define Host's ownership and optional capability boundary.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines native binding, path, process, credential, and client-role constraints.
- [Nexus contract](../docs/architecture/nexus-contract.md) defines Host's settings authority, status redaction, document allowlist, and exact-page authorization.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Host's version manifest, native protocol advertisement, bounded event journal, and migration receipts.

## Tests

```powershell
python -m pytest -q Host/tests
```

Configured ScummVM targets are supported through optional `arcade-scummvm: 1`; use compatible Arcade 0.2.15, Host 0.2.6, Relay 1.1.6 and Portal 0.12.10 releases. Older sessions retain Spectrum browsing. See the [exact target and native migration contract](../docs/architecture/arcade-scummvm-adapter.md#optional-transport-and-native-approval-migration).
