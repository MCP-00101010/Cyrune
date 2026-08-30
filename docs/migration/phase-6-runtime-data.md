# Phase 6 Runtime-Data Cutover

Recorded on 2026-08-25. This record contains paths, counts, and hashes only; it contains no database contents, approved targets, credential names or values, or embedded assets.

## Active Layout

- Portal database: `%LOCALAPPDATA%\Cyrune\Portal\database.json`
- Portal backups: `%LOCALAPPDATA%\Cyrune\Portal\backups`
- Portal managed backgrounds: `%LOCALAPPDATA%\Cyrune\Portal\backgrounds`
- Arcade configuration and state: `%LOCALAPPDATA%\Cyrune\Arcade`
- Arcade managed profiles: `%LOCALAPPDATA%\Cyrune\Arcade\emulator-profiles`
- Arcade logs and cache: `%LOCALAPPDATA%\Cyrune\Arcade\logs` and `cache`
- Sanitized receipt: `%LOCALAPPDATA%\Cyrune\migration-receipts\runtime-v1.json`
- Verified recovery copy: `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-25\phase-6-runtime`

Arcade uses this external root by default on Windows and `${XDG_DATA_HOME:-~/.local/share}/Cyrune/Arcade` elsewhere. `CYRUNE_ARCADE_DATA` remains available for portable and development use. `CYRUNE_RUNTIME_ROOT` and the coordinator's explicit path arguments support isolated migration rehearsals.

## Coordinator and Safety Model

`tools/runtime_migration.py` separates `prepare` from `activate`:

1. `prepare` snapshots every source into the recovery directory, copies destination files through same-directory temporary files, rereads JSON, verifies SHA-256 before and after atomic replacement, and writes a sanitized version-1 receipt.
2. Portal background references are changed from legacy source-relative paths to exact external `file://` paths only after every referenced background has been copied and verified.
3. Arcade managed-profile paths are changed to the external copies only after those files exist; profile IDs, source hashes, rules, collection configuration, scraper configuration, favourites, and recent state remain unchanged.
4. Existing identical files are accepted. Corrupt or divergent destinations stop the migration unless the operator explicitly supplies `--replace-divergent`. Abandoned migration temporary files are classified and safely replaced without touching source data.
5. `activate` re-verifies every prepared destination before atomically changing the Host's Portal database pointer. A repeated command recognizes the activated receipt and performs read-only active-data validation.

The receipt records component-relative names, sizes, hashes, statuses, timestamps, and transformation counts. It contains no file contents, configuration objects, secrets, approved bindings, or credential locations.

## Cutover Results

- Receipt status: `activated`
- Verified records: 119
- Portal database source: 4,264,800 bytes; SHA-256 `88DB8D3F2D556835500B9A8EC2C4E3B1BBA10FCF075636C1B0920467141B19D8`
- Portal database destination: 4,389,087 bytes; SHA-256 `E2EB8CFFF89C3923D721BAE634F34B97990F36C9FBB679EBF26BBC75AB145401`
- Portal background references transformed: 21
- Managed Portal backgrounds: 23 files, 20,021,253 bytes; byte-identical to the recovery inventory
- Portal backups copied and JSON-reread: 31
- Arcade state: 3,712 bytes; SHA-256 remained `89E0A0BA8E4C412135269FF69AC34CF7507C5512EE7C3801997D290A49132F0F`
- Arcade config source: SHA-256 `0FDB1E6A8544689D4C707F76D282670C7D251CFCBC54FBDE6F28303C23747250`
- Arcade config destination: SHA-256 `32252FCDEBD5F58A4EBA66D8D4F7C6CEB1C3FDD05DC77520EB2C3624C40EF1E7`; only two managed-profile paths changed
- Arcade baseline: three collections, 30 favourites, 30 recent entries, two emulators, two managed profiles, and both managed profile files
- Current Host bindings retained: 2 directory, 4 application, and 6 game bindings
- Both configured scraper providers remain available through Windows Credential Manager; external Arcade JSON contains zero populated plaintext secret fields
- Coordinated validation passes 88 Portal tests, 253 Widget tests, 8 Relay tests, 42 Host tests plus 11 parameterised subtests, 10 migration tests, and 67 Arcade tests; JavaScript syntax, manifest validation, and `web-ext lint` are clean
- The user confirmed that both permanent direct-file pages open successfully after activation, Portal and Arcade load their migrated databases, and Portal's About dialog reports the new `%LOCALAPPDATA%\Cyrune` database location

Semantic comparison removes only `backgroundImage` or `managed_path` values before comparing source and destination structures. This verified that opaque keys, IDs, revision metadata, collection/emulator/profile configuration, scraper settings, favourites, and history did not otherwise change.

## User Confirmation

The in-app browser was unavailable during the automated cutover, but the user subsequently confirmed that:

- Portal and Arcade open successfully with their migrated databases and Portal reports the external database location.
- A newly saved Portal background appears beneath `%LOCALAPPDATA%\Cyrune\Portal\backgrounds`, proving Relay 1.0.54 is using the external asset root.
- Every bookmark in use that referred to the legacy WebHub or EmuGUI pages now points at the Cyrune project location; temporary recovery pages are not needed.

The old checkouts and runtime sources remain untouched during monitoring.

## Rollback

1. Close Firefox/Zen so neither Relay nor Host retains the active paths.
2. Verify and restore `phase-6-runtime\Host\config.json` to `%LOCALAPPDATA%\Cyrune\Host\config.json`; this restores the pre-Phase-6 Portal database pointer and all then-current opaque bindings together.
3. Revert the Phase 6 Arcade default-path change or set `CYRUNE_ARCADE_DATA` to the still-present Cyrune source `Arcade\data` directory before restarting Host.
4. Reload the prior Relay source if managed backgrounds must again be written beneath the Portal checkout.
5. Restart Firefox/Zen and verify Portal and Arcade status before resuming writes.

Do not delete or overwrite the external destinations during rollback. They are the recovery source for any legitimate changes made after activation and must be compared explicitly before a later retry.
