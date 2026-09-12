# Coordinated development data cutover — 2026-09-09

This implements the [suite compatibility review](../reviews/suite-compatibility-review-2026-09-09.md). Upgrade Portal, Arcade, Relay, Host, Nexus and Widgets together. Older running peers must be reloaded; their fallback implementations are no longer supported.

## Current formats and supported upgrade boundaries

| Owner | Current representation | Supported source and conversion |
| --- | --- | --- |
| Portal | Portable schema 7; boards own tabs, tabs own columns/Inbox/background | Unversioned and schemas 1–6 convert at load/import. Current rendering and editing never synthesize board aliases. Old item/tag/theme conversion lives in `state-schema.js`; current structural repair and authority scrubbing remain. |
| Arcade | Configuration schema 1 with explicit adapters; collection index schema 2 | Unversioned configuration declares Spectrum explicitly. Unversioned/index-1 records acquire stable `metadata_group_id` values once at the import/index boundary. Existing exact IDs and all metadata/launch fields survive. |
| Host | Configuration schema 1 and one binding-store envelope, schema 5 | Catalogue envelopes 1–4 and `approvedGames` consolidate with original keys. Exact emulator/profile selections remain private. Unresolvable legacy approvals retain their original private record and require explicit rebind. |
| Nexus | Authoritative settings and component profiles, schema 2 | Host retains the explicit settings-1 upgrade boundary. Browser preview-1 promotes to preview-2 with reread verification. Ordinary component clients accept only profile-2. |
| Widgets | SDK 4; per-descriptor widget state version | Old cache/view entries promote at SDK startup after verified writes. Per-widget cache lookups/removal use only the current namespace. Descriptor migrations run only for older widget state versions. |
| Relay | Existing versioned browser snapshot envelope | Old `morpheusState` converts once with content-hash verification. Corrupt current storage is an error, never a reason to select an older database. Browser-owned operation remains a supported product mode. |

Atari disk plans, ScummVM registrations, Game Boy cartridge rules, catalogue source proofs, game-version defaults and collection state keep their existing adapter-specific formats. Their differing schemas express current functionality. ScummVM presentation remains per registration. Spectrum alphabet buckets remain in place; stored groups prevent unrelated games sharing metadata. Filesystem layout inference is confined to indexing/importing an older source, including a collection that reconnects later.

## Native migration and recovery

Run `python -B tools/upgrade_suite_data.py` for an aggregate dry run; `--apply` performs the authorized conversion against configured stores. It does not launch emulators or call scraping providers. It uses each owner's writer lock, compares observed bytes, verifies retained originals, stages current documents, and atomically promotes them through private redo journals. It checks retained collection fields and Portal IDs/application/game keys before promotion. Nexus settings convert only where needed. Unavailable collection roots remain configured and are reported for a later rerun.

Each native batch has a `suite-data-v2-<batch>.json` journal in Arcade's external data directory. Binding consolidation uses `bindings-v5-upgrade.json` beside Host configuration. Their `.data` directories retain exact `.original` and `.current` files. These are **private recovery transactions**, containing native locations and original user data; they are never portable, packaged, logged, or exposed in Nexus diagnostic receipts. Keep them with the database backups.

A prepared transaction verifies every original/staged hash and accepts only an original or already-promoted target before resuming. Concurrent changes stop recovery without overwriting the changed data. Completed transactions do not replace retained originals. Restoring an older suite requires restoring the corresponding data set together; do not run older writers against current databases. The retained import boundaries allow supported old backups to be converted again.

The native tool cannot inspect page-local or extension-owned storage. Relay snapshots, Nexus previews, widget caches and any old browser credential references upgrade in their owning context on the next reload. Credential promotion uses Host's OS store, verifies by rereading, and deletes an old record only when the verified current value matches. Conflicting values remain available for recovery. Normal saves fail without changing the database when secure storage fails; plaintext fallback is retired.

## Current runtime contracts

- `portal-relay: 2`, `arcade-relay: 2`, `arcade-service: 2`, `host-native: 3`, `widget-sdk: 4`.
- Scoped Arcade operations require the collection ID. `/api/games` returns compact revision-aware summaries; full native/read detail operations remain separate. Scrape previews always use bounded background jobs and native review classification.
- Host loads only `arcade_service.py`; configuration writers/installers use `arcadeRoot`. The old Python shim files and duplicate game approval execution paths are removed.
- Fixed native host IDs, credential target prefixes, wire message spellings and opaque bindings remain unchanged. They are identifiers, not alternate execution implementations.

Keep the supported upgrade boundaries while retained backups or disconnected collections need them. Retire a baseline only through an explicit replacement import/recovery route. Current data validation, authorization, optional capabilities, conflict recovery, platform validation and identity tests remain release requirements.

## Verified local cutover

The configured native migration completed with verified originals retained: Portal schema 7 (nine boards and 24 unchanged game keys); four schema-2 indexes with 37,242 retained records (12,933 + 21,471 Spectrum, 2,089 Atari, 749 Game Boy); explicit adapters for all six configured collections; and 34 schema-5 Host approvals, including all 19 older pins. Nexus settings remained schema 2 without a rewrite. A subsequent dry run reported zero pending native documents.

One configured Spectrum root is unavailable and must be rerun through the upgrade tool after reconnection. Thirty-one retained launch approvals validate. Three original catalogue approvals retain changed launch fingerprints (one ScummVM and two Atari); their approval records are unchanged from the retained pre-migration records. Only one of these is referenced by the current Portal database. Preserve their rebind requirement rather than approving changed launch data during a schema conversion.

Browser-local upgrades run on each owning context's next reload. Isolated Firefox acceptance verifies the current Portal/Arcade handoff, version/default selection, ScummVM scraping, responsive dialogs, and settings persistence; it does not inspect the user's browser-local stores.
