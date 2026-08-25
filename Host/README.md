# Cyrune Host

Cyrune Host owns native messaging, filesystem and process authority, approved local bindings, secure credentials, disk-backed Portal persistence, and authoritative Nexus settings and sanitized project metadata.

Run `install.ps1` on Windows or `install.sh` on Linux/macOS to register the compatibility host ID `morpheus_webhub`. Mutable configuration defaults to `%LOCALAPPDATA%\Cyrune\Host\config.json` on Windows and `${XDG_CONFIG_HOME:-~/.config}/Cyrune/Host/config.json` elsewhere. Set `CYRUNE_HOST_CONFIG` for a portable or development override.

`config.example.json` documents the shape only. Never commit the live configuration because it contains device-local paths and approved bindings.

Nexus settings default to `%LOCALAPPDATA%\Cyrune\Nexus\settings.json` on Windows and `${XDG_DATA_HOME:-~/.local/share}/Cyrune/Nexus/settings.json` elsewhere. `CYRUNE_NEXUS_DATA` provides a controlled development override. Host accepts only the exact Nexus page, validates the complete typed settings snapshot, rejects stale revisions, and maps document identifiers to a fixed repository allowlist. Its user-triggered TODO editor maps a component ID to that same allowlist and starts Visual Studio Code with an argument array; Nexus never provides or receives a path or executable. The separate repository check always compares the current checkout branch with fixed `origin` through non-interactive `git ls-remote`, with a bounded timeout and no fetch or mutation. Host does not expose arbitrary paths, Git commands, or native operations to Nexus.

## Architecture and Guidance

- [Host instructions](AGENTS.md) define native authority, security, compatibility, persistence, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define Host's ownership and optional capability boundary.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines native binding, path, process, credential, and client-role constraints.
- [Nexus contract](../docs/architecture/nexus-contract.md) defines Host's settings authority, status redaction, document allowlist, and exact-page authorization.

## Tests

```powershell
python -m pytest -q Host/tests
```
