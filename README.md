# Cyrune

Cyrune is the combined home of the Portal dashboard, Arcade game-library frontend, Relay browser extension, Host native-messaging service, and widget catalogue.

## Components

- `Portal/` — the local dashboard and launcher interface formerly developed as Morpheus WebHub.
- `Arcade/` — the emulator-library manager formerly developed as Morpheus EmuGUI.
- `Relay/` — the Firefox-compatible WebExtension that connects trusted local pages to browser and native capabilities.
- `Host/` — the relocated native-messaging process, installers, templates, and host-specific tests.
- `Widgets/` — category-based homes for Portal widgets and their focused tests, plus the shared widget runtime and SDK under `Widgets/core/`. Portal remains their runtime host.

Shared integration and migration checks live in `tests/`; repository tools live in `tools/`; generated output belongs in the ignored `artifacts/` directory.

## Migration Status

Migration is active on `migration/cyrune-monorepo`. Portal and Arcade now run from their Cyrune paths through the relocated Relay and Host; external runtime-data migration, widget regrouping, packaging, and final cutover checks remain. The legacy checkouts stay available as recovery sources until every migration gate passes. See `CYRUNE-MONOREPO-TODO.md` for the authoritative sequence and rollback gates.

Do not delete or redirect the old checkouts merely because their histories are present here.

## Validation

Run the complete existing baseline from the repository root:

```powershell
.\tools\validate.ps1
```

Use `-SkipWebExtLint` only when working offline or when validating code that cannot affect Relay packaging.
