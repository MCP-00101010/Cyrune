# Cyrune Relay

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal and Arcade pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host.

The unpackaged extension root is this directory. Native Python, installers, configuration, and launchers live exclusively in `../Host/` and must not be included in Relay packages.

## Tests

```powershell
node --test "Relay/tests/*.cjs"
npx --yes web-ext lint --source-dir Relay
```

## Packaging

Build the deterministic unsigned archive for AMO upload from the repository root:

```powershell
.\Relay\package-amo.ps1
```

The archive, SHA-256 sidecar, and content-free report are written beneath `artifacts/Relay/<version>/unsigned/`. Only `manifest.json`, the two runtime scripts, both icons, and the three popup files are admitted; Host code, installers, tests, configuration, databases, backups, credentials, and repository documentation cannot enter the archive.

Mozilla signing is a separate workflow. After AMO returns a signed XPI, validate and store it with:

```powershell
.\Relay\import-signed.ps1 -SourcePath C:\path\to\mozilla-signed.xpi
```

Signed imports must contain the same bounded Relay payload plus Mozilla `META-INF` signature records. They are written beneath `artifacts/Relay/<version>/signed/` and are never synthesized or labelled as signed locally.
