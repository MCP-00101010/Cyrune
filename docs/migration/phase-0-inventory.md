# Phase 0 Recovery Inventory

Recorded on 2026-08-25 before source-path cutover. This inventory contains hashes and counts only; it contains no database contents, credentials, approved targets, or embedded assets.

## Source Repositories

| Component source | Branch | Pre-migration commit |
| --- | --- | --- |
| Portal | `master` | `388ee274ad5920c69679ecc186527a17b29099f5` |
| Arcade | `main` | `90bb0065673a4ff7bb5999fecf6dd399d394bc38` |

Both commits are tagged `pre-cyrune-monorepo-2026-08-25`. The Cyrune migration branch began at the Portal commit, and Arcade history was imported without squashing.

## Versions at Import

| Component | Version |
| --- | --- |
| Portal | `0.11.220` |
| Relay | `1.0.52` |
| Host | No independent version before migration |
| Arcade | No formal application version before migration |

## Git Recovery Bundles

Recovery directory: `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-25`

| Bundle | Bytes | SHA-256 |
| --- | ---: | --- |
| `portal-source.bundle` | 7,412,364 | `D895C8E1F1AC68809A9AC0A5D10ACE422684801A9132767363520F99642A41D4` |
| `arcade-source.bundle` | 166,502 | `FBBD1CE5C08D3BFF4E0A4C00DF6DFE7EA1B3000914A0F02730336ED5F33BD6AE` |

Both bundles passed `git bundle verify` and record complete histories.

## Runtime and Local-State Fingerprints

Fingerprints are SHA-256 hashes of sorted `relative-path|size|file-hash` manifests. They allow later copy verification without placing file contents in Git.

| Source | Files | Bytes | Tree fingerprint |
| --- | ---: | ---: | --- |
| Portal managed backgrounds (`assets/backgrounds`) | 23 | 20,021,253 | `9EF3B8A10303CB165E9ABC70967D5D24D4CBCEB79A0EC77109366D4022FBA9CD` |
| Portal legacy root backgrounds (`backgrounds`) | 1 | 2,707,748 | `432E6F131DAC2F0C1DE7D1989686D142C132788EA6E2AECA90277B1574D23C24` |
| Arcade runtime data (`data`) | 7 | 261,433 | `8DAA4B0F085708AF0F98BB4E7AFDF1168F9B5075FC829E889C42E5CC68EBD9ED` |

The original native configuration was 10,737 bytes with SHA-256 `A88E91E0967656FE65A6FFDFFD5B1ABEED31F0A5043A4E4B5D634262B278A012`. Its configured database existed, its configured Arcade source root resolved correctly, and its observed keys were `databasePath`, `emuguiRoot`, `approvedDirectories`, `approvedApplications`, and `approvedGames`.

The configuration contained 2 approved directory bindings, 3 approved application bindings, and 5 approved game bindings. Targets are intentionally omitted.

## Installed Host Registration

- Registry key: `HKCU:\Software\Mozilla\NativeMessagingHosts\morpheus_webhub`
- Manifest: `C:\Users\chris\AppData\Roaming\Mozilla\NativeMessagingHosts\morpheus_webhub.json` (present)
- Launcher at inventory time: `F:\Projects\Coding\Morpheus WebHub\extension\native\morpheus_host.bat` (present)
- Allowed extension IDs: 1

Ten matching `Morpheus WebHub/` credential targets were present in Windows Credential Manager. Credential names and values are intentionally absent from this inventory and from portable JSON.
