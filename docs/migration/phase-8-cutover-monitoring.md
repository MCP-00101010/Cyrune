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
| Legacy `assets/backgrounds/` | Runtime | Migrated and verified beneath the external Portal root; legacy source retained |
| Single legacy root `backgrounds/` image | Unreferenced runtime orphan | No tracked, legacy-database, or active-database reference; no managed hash match; copied and SHA-256 verified under Phase 0 recovery while the source remains untouched |
| Live native `config.json` | Runtime/security-sensitive | Copied externally and replaced in source by a sanitized example |
| `PROJECT.md` | Obsolete documentation | Durable guidance moved to current README/architecture/migration records before removal |
| Arcade `data/` and launcher logs/cache | Runtime/generated | Authoritative state migrated externally; source and recovery copies retained |
| `Arcade/test_spectaculator_launch.ps1` | Obsolete diagnostic | Replaced by the configurable ZX preflight/live matrix and focused coverage of the Windows-default association route |
| Legacy source checkouts and recovery bundles | Archived recovery sources | Retained in place through monitoring; no deletion authorized |

The orphan background recovery copy is 2,707,748 bytes with SHA-256 `ED79E0B5527577163C3736C4F1A530F774AD2B0E192A8A71D6E88918E20C8A53`. The source file was not removed.

## Rollback

Rollback must preserve legitimate writes made after cutover. Compare current external data with its recovery baseline before changing any pointer; never overwrite divergent data automatically.

1. Close Firefox and Zen so Relay and Host cannot write during rollback.
2. Revert migration code with an ordinary Git revert or switch to a verified migration checkpoint. Keep Portal, Relay, Host, and Arcade revisions mutually compatible; do not use a destructive reset.
3. For native registration, restore the verified pre-Cyrune manifest and launcher recorded in `phase-4-host-cutover.md`, confirm their hashes, then restart the browser before testing status.
4. For runtime pointers, restore the verified pre-Phase-6 Host configuration only after comparing the active external Portal database and Arcade state for newer writes. Use the still-present source runtime or documented environment overrides; do not delete the external copies.
5. For Relay, reload the prior unpackaged source or install the preserved signed package appropriate to that revision. Do not label an unsigned local archive as Mozilla-signed.
6. For local-page links, temporarily restore the legacy Portal and Arcade `file://` URLs only while their untouched checkouts remain available. Return bookmarks to the Cyrune URLs when resuming the migration.
7. Verify Host status, Portal database counts, Arcade collections/profiles, and one non-destructive read workflow before allowing writes or launches.

Component-specific details and recovery hashes remain in `phase-4-host-cutover.md`, `phase-6-runtime-data.md`, and `phase-7-packaging.md`.

## Gates Still Requiring Interactive or Time-Based Evidence

The following are intentionally not claimed by this unattended audit:

- confirmed installed-extension operation in both Firefox and Zen;
- a temporary development installation;
- a complete browser restart followed by Host reconnection;
- multiple live Portal tabs and active-target routing;
- the complete live delivery/launch/reveal/rebind/metadata/scraper/POK/incoming/trash/emulator/profile workflow matrix;
- completion of an agreed normal-development monitoring period;
- archival of legacy sources, which requires explicit confirmation.

The configured `origin` already uses the final `Cyrune` repository identity, so no remote rename is required. The legacy remote remains as a recovery reference.
