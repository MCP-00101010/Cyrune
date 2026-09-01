# Phase 8 Cutover and Monitoring

Recorded on 2026-08-25. This audit reports counts, hashes, booleans, and source locations only. It contains no database contents, credential names or values, approved native targets, bookmark titles, game paths, or embedded assets.

## Non-Interactive Cutover Audit

The activated migration receipt was revalidated through the idempotent coordinator. It remains at version 1 with status `activated`, 119 verified records, 21 rewritten Portal background references, and two rewritten Arcade managed-profile paths.

The current runtime was compared with the verified Phase 6 recovery baseline:

- Portal remains at schema 6 with eight boards, 28 tabs, 323 bookmarks, 59 folders, 54 titles, one set, 93 tags, and 92 settings. Every structural count matches the baseline.
- Host retains all two directory, four application, and six game binding keys from the Phase 6 baseline. Its Portal pointer resolves beneath `%LOCALAPPDATA%/Cyrune`, and its Arcade root resolves to the Cyrune checkout.
- Arcade retains three collections, four configured emulator records, two managed profile IDs with byte-identical managed files, 30 identical favourite IDs, and 30 recent entries.
- The non-launching ZX preflight loads all 12,933 games and confirms three emulator executables, two managed profiles, and representative 48K/128K games are available.
- The authoritative pre-cutover Portal database, 31 backups, 23 managed backgrounds, and four Cyrune Arcade source-runtime files remain byte-identical to their Phase 6 recovery copies.

These read-only checks complement the earlier user-confirmed Portal/Arcade direct-file startup, migrated database loading, managed-background write, application/game launches, artwork, favourites, and updated bookmarks. No emulator or application was launched during this unattended audit.

## Fresh Checkout and Package Reproduction

A clean local clone of commit `d5ed58a` was created beneath an ignored temporary artifact directory whose absolute path contained spaces and `Ω`. The clone passed the complete coordinated suite:

- 88 Portal tests;
- 253 Widget tests;
- 8 Relay tests;
- 42 Host tests plus 11 parameterised subtests;
- 10 migration tests;
- 14 packaging tests;
- 67 Arcade tests;
- all JavaScript syntax, manifest, and independent component-version checks;
- `web-ext lint` with zero errors, notices, or warnings.

The clone remained Git-clean after building Relay. Its exact eight-file archive reproduced SHA-256 `9794436F45EBDA587C390DBD4DB148E9F19825B198760279AF404B2CFE738D6A`. The temporary clone and generated nested artifacts were then removed.

After replacing the obsolete launch diagnostic with focused default-association coverage, the upgraded checkout passed the same coordinated matrix with 68 Arcade tests; every other count and check remained unchanged.

## Legacy-Path and Secret Audit

Executable source beneath Portal, Relay, Host, Arcade, Widgets, and repository tools contains no absolute dependency on either legacy checkout. The four active JSON roots—Host configuration, Portal database, Arcade configuration, and Arcade state—contain no old runtime pointer. One saved Portal bookmark still contains the legacy Arcade URL at `/boards/1/tabs/1/columns/0/items/0/url`; it is user data rather than an application dependency, was previously confirmed not to be among the legacy bookmarks still in use, and was deliberately left unchanged.

The tracked-source secret scan reported locations only:

- seven high-confidence private-key and provider-token patterns produced zero matches;
- the broader credential-assignment pattern produced one match at `Widgets/gaming/test_nexus_mods_tracker_widget.cjs:21`, confined to a test fixture;
- no values were printed or copied into this record.

Git whitespace/diff checks are part of the final coordinated validation. Generated Relay and clean-checkout artifacts remain ignored.

## Phase 0 Cleanup Classification

| Path or class | Classification | Disposition |
| --- | --- | --- |
| `.build/`, `.test-tmp/`, `dist/`, Python/pytest caches | Generated | Excluded from import; reproducible output only |
| Legacy `assets/backgrounds/` | Runtime | Migrated and verified beneath the external Portal root; legacy source archived intact with its checkout |
| Single legacy root `backgrounds/` image | Unreferenced runtime orphan | No tracked, legacy-database, or active-database reference; no managed hash match; copied and SHA-256 verified under Phase 0 recovery, with the original archived intact with its checkout |
| Live native `config.json` | Runtime/security-sensitive | Copied externally and replaced in source by a sanitized example |
| `PROJECT.md` | Obsolete documentation | Durable guidance moved to current README/architecture/migration records before removal |
| Arcade `data/` and launcher logs/cache | Runtime/generated | Authoritative state migrated externally; the ignored Cyrune source baseline matched its Phase 6 recovery fingerprint before moving to `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-31\archived-runtime-sources\Cyrune\Arcade\data` |
| `Arcade/test_spectaculator_launch.ps1` | Obsolete diagnostic | Replaced by the configurable ZX preflight/live matrix and focused coverage of the Windows-default association route |
| Legacy source checkouts and recovery bundles | Archived recovery sources | Monitoring completed and archival was explicitly authorized on 2026-08-31. Both intact checkouts now reside beneath `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-31\archived-sources`; verified bundles remain beneath the 2026-08-25 recovery directory. |

The orphan background recovery copy is 2,707,748 bytes with SHA-256 `ED79E0B5527577163C3736C4F1A530F774AD2B0E192A8A71D6E88918E20C8A53`. The source file was not removed.

## Rollback

Rollback must preserve legitimate writes made after cutover. Compare current external data with its recovery baseline before changing any pointer; never overwrite divergent data automatically.

1. Close Firefox and Zen so Relay and Host cannot write during rollback.
2. Revert migration code with an ordinary Git revert or switch to a verified migration checkpoint. Keep Portal, Relay, Host, and Arcade revisions mutually compatible; do not use a destructive reset.
3. For native registration, rehydrate the legacy checkout from its read-only archive into a deliberate working location, then restore a verified manifest and launcher using that exact location. The recorded pre-Cyrune manifest still names the retired top-level path and must not be restored unchanged. Confirm hashes, then restart the browser before testing status.
4. For runtime pointers, restore the verified pre-Phase-6 Host configuration only after comparing the active external Portal database and Arcade state for newer writes. Use an explicitly rehydrated legacy source or documented environment overrides; do not run against or modify the read-only archive, and do not delete the external copies.
5. For Relay, reload the prior unpackaged source or install the preserved signed package appropriate to that revision. Do not label an unsigned local archive as Mozilla-signed.
6. For local-page links, use legacy Portal and Arcade `file://` URLs only after rehydrating the archived checkouts to the matching paths. Return bookmarks to the Cyrune URLs when resuming the migration.
7. Verify Host status, Portal database counts, Arcade collections/profiles, and one non-destructive read workflow before allowing writes or launches.

Component-specific details and recovery hashes remain in `phase-4-host-cutover.md`, `phase-6-runtime-data.md`, and `phase-7-packaging.md`.

## Final Cutover Confirmation — 2026-08-31

Normal development and the practical single-Portal-tab runtime workflow were confirmed across Portal, Widgets, Arcade, Relay and Host. Temporary Relay installation, local-file permissions, reload/reconnection, cold Host shutdown/restart, and Portal/Arcade delivery and management workflows pass. With every browser closed, no Cyrune Host process remained. Active Host configuration and native registration contain no reference to either retired top-level checkout.

The user explicitly authorized archival after monitoring. The complete legacy WebHub checkout (10,657 files, 1,116,675,909 bytes, Git HEAD `388ee274ad5920c69679ecc186527a17b29099f5`, including its preserved untracked `Infrastructure TODO.md`) and EmuGUI checkout (297 files, 4,680,544 bytes, Git HEAD `90bb0065673a4ff7bb5999fecf6dd399d394bc38`) were moved intact to `F:\Projects\Coding\Cyrune Migration Recovery\2026-08-31\archived-sources`. Post-move identities and file totals match the pre-move inventory. The ignored Cyrune `Arcade/data` baseline was also moved intact to the dated `archived-runtime-sources` tree after matching its Phase 6 recovery fingerprint. Nothing was deleted. After archival, all 79 Arcade tests pass and the non-launching preflight loads the external 12,933-game library with its three emulator executables and two managed profiles available.

Cyrune on `master` is now the active project. Installed/signed Relay testing remains deferred until extension development stabilises, and concurrent Portal-tab routing remains deferred because it is outside the current usage model; neither is a migration cutover blocker. The configured `origin` already uses the final `Cyrune` repository identity, while the legacy remote remains a recovery reference.
