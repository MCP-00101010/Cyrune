# Cyrune Relay

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal and Arcade pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host.

The unpackaged extension root is this directory. Host code currently remains in `native/` only until the dedicated Host relocation and browser-registration phase.

## Tests

```powershell
node --test "Relay/tests/*.cjs"
npx --yes web-ext lint --source-dir Relay
```
