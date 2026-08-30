# Cyrune

Cyrune is the combined home of the Portal dashboard, Arcade game-library frontend, Relay browser extension, Host native-messaging service, widget catalogue, and Nexus project control centre.

## Components

- `Portal/` — the local dashboard and launcher interface formerly developed as Morpheus WebHub.
- `Arcade/` — the emulator-library manager formerly developed as Morpheus EmuGUI.
- `Relay/` — the Firefox-compatible WebExtension that connects trusted local pages to browser and native capabilities.
- `Host/` — the relocated native-messaging process, installers, templates, and host-specific tests.
- `Widgets/` — category-based homes for Portal widgets and their focused tests, plus the shared widget runtime and SDK under `Widgets/core/`. Portal remains their runtime host.
- `Nexus/` — a direct-file project-status dashboard and the management surface for shared Cyrune variables. The current first draft uses honest partial diagnostics and a browser-local settings preview while its Relay/Host service is being built.

Shared integration and migration checks live in `tests/`; repository tools live in `tools/`; generated output belongs in the ignored `artifacts/` directory.

## Migration Status

Migration is active on `migration/cyrune-monorepo`. Portal and Arcade now run from their Cyrune paths through the relocated Relay and Host, and the category-based widget regrouping is complete. External Portal/Arcade runtime-data migration, packaging, and final cutover checks remain. The legacy checkouts stay available as recovery sources until every migration gate passes. See `CYRUNE-MONOREPO-TODO.md` for the authoritative sequence and rollback gates, and `docs/migration/2026-08-25-handover.md` for the current continuation context.

Do not delete or redirect the old checkouts merely because their histories are present here.

## Validation

Run the complete existing baseline from the repository root:

```powershell
.\tools\validate.ps1
```

Use `-SkipWebExtLint` only when working offline or when validating code that cannot affect Relay packaging.
