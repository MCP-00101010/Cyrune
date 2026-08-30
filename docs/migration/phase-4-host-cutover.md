# Phase 4 Host Cutover

Recorded on 2026-08-25. No credential values, approved targets, database contents, or embedded icons are included here.

## Active Paths

- Host source: `F:\Projects\Coding\Cyrune\Host\morpheus_host.py`
- Windows launcher: `F:\Projects\Coding\Cyrune\Host\morpheus_host.bat`
- Runtime configuration: `%LOCALAPPDATA%\Cyrune\Host\config.json`
- Native manifest: `%APPDATA%\Mozilla\NativeMessagingHosts\morpheus_webhub.json`
- Registry key: `HKCU:\Software\Mozilla\NativeMessagingHosts\morpheus_webhub`

The compatibility Host ID `morpheus_webhub`, extension ID, credential prefix, binding keys, and stored schemas remain unchanged.

The runtime configuration was copied and reread before activation. Its Arcade root now points to `F:\Projects\Coding\Cyrune\Arcade`; all 2 directory, 3 application, and 5 game bindings were retained. The one Git-directory binding that pointed exactly at the old Portal repository now points at the Cyrune root with its opaque handle preserved. A live Host request successfully returned Git status for `migration/cyrune-monorepo` through that handle.

## Recovery Files

Directory: `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-25`

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `native-config.pre-cyrune.json` | 10,737 | `A88E91E0967656FE65A6FFDFFD5B1ABEED31F0A5043A4E4B5D634262B278A012` |
| `native-config.before-cyrune-binding.json` | 10,736 | `38F946B584E6702A8A40FFEBA58626BB9C47FCDF834F617A5B4FC1E2193B759F` |
| `native-manifest.pre-cyrune.json` | 336 | `18375145F5F0444EA0C0698943AD8A0635F7447ED0B93F919AE7266C5DBA255E` |
| `native-launcher.pre-cyrune.bat` | 154 | `EC283C174D499CA95C48E74116DA42161ED3C46C7FD73FD21E35433608A6076A` |

## Validation

- Registered manifest resolves to the Cyrune Host launcher and retains one allowed extension ID.
- Framed `PING` succeeds with protocol version `1.0` and a clean process exit.
- Framed Arcade status succeeds from the new Arcade root and reports the configured library, emulator, and profile.
- Host suite: 42 tests plus 11 parameterised subtests pass.
- Relay suite: 6 tests pass.
- `web-ext lint`: zero errors, notices, or warnings after native files were removed from Relay.
- Windows PowerShell and Unix shell installer syntax checks pass.

Firefox/Zen must be restarted or the extension reloaded before browser processes use the new registration.

## Rollback

1. Close Firefox/Zen so no Host process retains the new launcher.
2. Restore `native-manifest.pre-cyrune.json` to `%APPDATA%\Mozilla\NativeMessagingHosts\morpheus_webhub.json`; the registry key already points to this manifest location.
3. Confirm the restored manifest references the still-present legacy launcher under `Morpheus WebHub\extension\native`.
4. The legacy checkout’s original `config.json` remains unchanged. If required, restore `native-config.pre-cyrune.json` beside that legacy Host only after verifying its SHA-256.
5. Restart Firefox/Zen and run a Host status check before resuming writes or launches.
