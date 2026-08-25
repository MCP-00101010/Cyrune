# Cyrune Relay

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal and Arcade pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host.

The unpackaged extension root is this directory. Native Python, installers, configuration, and launchers live exclusively in `../Host/` and must not be included in Relay packages.

## Tests

```powershell
node --test "Relay/tests/*.cjs"
npx --yes web-ext lint --source-dir Relay
```
