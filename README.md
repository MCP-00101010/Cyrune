# Cyrune

Cyrune is the combined home of the Portal dashboard, Arcade game-library frontend, Relay browser extension, Host native-messaging service, and widget catalogue.

## Components

- `Portal/` — the local dashboard and launcher interface formerly developed as Morpheus WebHub.
- `Arcade/` — the emulator-library manager formerly developed as Morpheus EmuGUI.
- `Relay/` — the Firefox-compatible WebExtension that connects trusted local pages to browser and native capabilities.
- `Host/` — the native-messaging process, installers, templates, and host-specific tests. Host source remains under `Relay/native/` until the dedicated relocation and reinstall phase.
- `Widgets/` — category-based homes for Portal widgets. Existing widget files remain under `Portal/source/` until the path-only widget regrouping phase.

Shared integration and migration checks live in `tests/`; repository tools live in `tools/`; generated output belongs in the ignored `artifacts/` directory.

## Migration Status

Migration is active on `migration/cyrune-monorepo`. The legacy Portal and Arcade checkouts remain the operational fallback until path repair, Host reinstallation, runtime-data migration, and the complete validation matrix pass. See `CYRUNE-MONOREPO-TODO.md` for the authoritative sequence and rollback gates.

Do not delete or redirect the old checkouts merely because their histories are present here.

## Validation

Run the complete existing baseline from the repository root:

```powershell
.\tools\validate.ps1
```

Use `-SkipWebExtLint` only when working offline or when validating code that cannot affect Relay packaging.
