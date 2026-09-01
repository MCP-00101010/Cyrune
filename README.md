# Cyrune

Cyrune is the combined home of the Portal dashboard, Arcade game-library frontend, Relay browser extension, Host native-messaging service, widget catalogue, and Nexus project control centre.

## Components

- `Portal/` — the local dashboard and launcher interface formerly developed as Morpheus WebHub.
- `Arcade/` — the emulator-library manager formerly developed as Morpheus EmuGUI.
- `Relay/` — the Firefox-compatible WebExtension that connects trusted local pages to browser and native capabilities.
- `Host/` — the relocated native-messaging process, installers, templates, and host-specific tests.
- `Widgets/` — category-based homes for Portal widgets and their focused tests, plus the shared widget runtime and SDK under `Widgets/core/`. Portal remains their runtime host.
- `Nexus/` — the direct-file project-status dashboard and management surface for shared Cyrune settings, sanitized validation/activity state, component documents, and fixed repository diagnostics. Its authenticated Relay/Host service remains available while the page is closed, with clearly labelled cached fallback views when disconnected.

Shared integration and migration checks live in `tests/`; repository tools live in `tools/`; generated output belongs in the ignored `artifacts/` directory.

## Project Status

Cyrune on `master` is the active project. The monorepo migration completed on 2026-08-31: Portal and Arcade run from their Cyrune paths, mutable runtime data lives beneath `%LOCALAPPDATA%\Cyrune`, and Relay, Host, Widgets, Nexus, packaging, and coordinated validation use this checkout.

The intact legacy WebHub and EmuGUI checkouts are archived as read-only recovery sources beneath `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-31\archived-sources`; the independently verified Git bundles and runtime snapshots remain beneath the dated recovery area. See [`docs/history/cyrune-monorepo-migration.md`](docs/history/cyrune-monorepo-migration.md) and `docs/migration/phase-8-cutover-monitoring.md` for the completed cutover record and rollback guidance.

## Validation

Run the complete existing baseline from the repository root:

```powershell
.\tools\validate.ps1
```

Use `-SkipWebExtLint` only when working offline or when validating code that cannot affect Relay packaging.
