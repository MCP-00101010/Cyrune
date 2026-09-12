# Cyrune compatibility and fallback review — 2026-09-09

Reviewed Arcade 0.2.57, Portal 0.12.21, Host 0.2.25, Relay 1.1.12, Nexus 0.3.0 and Widgets 0.2.17 against the development migration policy. This records the original assessment. Implementation and current upgrade rules are documented in [suite-data-cutover.md](../architecture/suite-data-cutover.md).

The largest opportunities are parallel game-binding implementations in Host, Portal's old board representation inside its current UI, and Arcade's inference of metadata groups from historical collection layouts. Old names and tiny forwarding modules are a much smaller maintenance burden.

## Evidence from the configured data

Read existing JSON files directly, without invoking application loaders or migration functions. Only schema versions and aggregate counts were returned; no credentials, game titles, bindings or native paths are included here.

| Area | Observed state | Consequence |
| --- | --- | --- |
| Portal database | Schema 6; nine boards, all with tabs; zero persisted board-level column aliases | The database already uses the newer board structure. Much of the remaining work is changing current UI consumers. |
| Portal game shortcuts | 24 distinct keys: 16 in Host's `approvedGames`, eight in its catalogue store | Removing the older binding path immediately would break active shortcuts. Preserve their keys through migration. |
| Host binding stores | 19 `approvedGames` records; 15 catalogue records in a schema-3 store | Consolidate all retained approvals, not just currently visible shortcuts. The catalogue reader presently supports store schemas 1–4. |
| Catalogue records | Eight ScummVM entries; seven entry-policy records covering Spectrum and Atari emulators | Adapter-specific launch validation remains necessary even after consolidating storage. |
| Host configuration | Contains the old `emuguiRoot` key | Current save code deliberately writes both old and new root keys. Fix writers/installers as well as migrating existing config. |
| Nexus settings | Schema 2 | The current authoritative file does not need a schema-1 conversion. Old browser previews were not inspected. |
| Arcade configuration | Six collections; three omit the adapter and implicitly mean Spectrum | Add explicit adapter declarations. One of those three roots is currently unavailable; keep its identity and report its unavailable state. |
| Main Spectrum index | 12,933 metadata records, all in letter/number folders; 43 with `scrape_family_title` | Folder-layout compatibility still protects real data. Create explicit metadata groups before retiring inference. Counts include index records and may differ from the visible grouped library. |
| Other available Spectrum index | 21,471 records, including 2,857 in letter/number folders | An upgrade must cover source collections too, not assume every library has been reorganised. |
| Old plaintext credential fields | Zero nonempty fields in Portal's central legacy service-key map and Arcade's known scraper-secret fields | These files are good candidates for completing the credential cutover. This is not verification of Credential Manager contents or old widget/browser storage. |

## 1. Consolidate Host game bindings — highest structural payoff

Evidence: [`Host/morpheus_host.py`](../../Host/morpheus_host.py), particularly `create_emugui_game_binding`, `resolve_emugui_game_binding`, `emugui_game_status`, `launch_emugui_game` and `_legacy_game_keys`; [`Host/catalogue_bindings.py`](../../Host/catalogue_bindings.py).

Host supports both `config.json:approvedGames` and `catalogue-bindings.json`. Status, creation, launch, rebind and key-limit logic branch between them. The older path remains a current writer for Spectrum/Game Boy delivery; it is not just a reader for pre-upgrade records. It also performs status/profile work that the newer native plan path can avoid.

Recommended change:

1. Route all new game approvals through one current binding store.
2. Convert the existing 19 older records, retaining each opaque `gameKey`, exact collection/game, explicit emulator/profile selection and shared-default meaning. Resolve and verify existing authority; do not silently approve a different target when a record cannot be migrated.
3. Use a recoverable transaction for old/new store promotion and preserve missing/unavailable records with an explicit unresolved state.
4. Normalize the binding-store envelope to a current schema once, then remove old-envelope acceptance and duplicate routing/lookup branches.

Portal's 24 existing shortcut keys can stay unchanged if this migration preserves keys. Adapter-specific media, ScummVM, STEem and Hatari plan formats describe different launch requirements and should not be collapsed merely because their schema numbers differ.

Expected benefit: high reduction in maintenance branches, clearer rebind/default behaviour, and potentially less repeated status work. No precise timing or deletion count is claimed.

## 2. Finish Portal's canonical state model — high payoff

Evidence: [`Portal/source/state-schema.js`](../../Portal/source/state-schema.js), [`Portal/source/state.js`](../../Portal/source/state.js), and consumers in `render.js`, `dnd.js`, `context.js`, `settings.js`, `background-assets.js` and `app.js`.

`STATE_SCHEMA_MIGRATIONS` contains six identity functions. Most actual conversion still happens in `parseStateJson` and its normalizers regardless of the document's declared current version: old boards become tabs, old Inbox columns are extracted, item aliases are renamed, tag formats are converted, theme profiles are populated and old import-manager boards are unpacked.

`syncBoardCompatibilityFields` recreates board-level `columns`, `inbox`, background and column-count aliases from a selected tab. Current code still consumes these aliases. `serializeStateSnapshot` synchronizes them and then removes them from the saved copy. A source search found 48 matching lines for the compatibility synchronizers and board `columns`/`inbox` references; that is a navigation aid, not 48 independently removable blocks.

Recommended change:

- Make rendering, editing, drag/drop and serialization use explicit board/tab accessors. Remove the mirrored active-tab fields after migrating every current consumer.
- Separate one-time old-format conversion from current-format validation. Keep repair of genuinely damaged current data and portable-data sanitization.
- Replace placeholder version increments with actual migration steps where transformation is needed; keep old import support at an import/migration boundary with a declared baseline.
- Remove obsolete per-record compatibility fields from the canonical format after preserving their meaning.

The live database already has tabs and no saved board-column aliases, so the board-accessor work need not itself rewrite the database. A later canonical-format cleanup can make any remaining settings/widget changes in one verified schema migration.

There is also a confirmed declaration mismatch: `Portal/source/state-schema.js` writes schema **6**, while [`Portal/component.json`](../../Portal/component.json) still declares `portableState: 5`. Align the manifest and generated Nexus registry. This is a metadata correction, not a reason to migrate a schema-6 database again.

## 3. Standardize Arcade metadata ownership — high payoff, real migration needed

Evidence: [`Arcade/arcade_core/shared_metadata.py`](../../Arcade/arcade_core/shared_metadata.py), [`scrape_groups.py`](../../Arcade/arcade_core/scrape_groups.py), [`collections.py`](../../Arcade/arcade_core/collections.py), [`catalogue_library.py`](../../Arcade/arcade_core/catalogue_library.py) and [`Arcade/data/platforms.json`](../../Arcade/data/platforms.json).

Current code infers whether a folder is a dedicated game folder or a container, then uses original titles and `scrape_family_title` to keep unrelated games separate. This is required for the current Spectrum libraries; simply removing it would risk the earlier Airwolf-style metadata corruption returning.

Recommended change:

- Give every collection an explicit adapter and a declared index format.
- Persist explicit metadata-group membership and exact version identity during a reviewed index upgrade. Share presentation within those groups; keep ScummVM presentation per registration.
- Use those stored identities in scraping, cleanup filters, provenance, remembered searches and catalogue projection. Infer membership only when importing/indexing a source that lacks it.
- Preserve game IDs, favourites, launch properties and shortcut bindings; do not regenerate identity from a newly scraped title.

Physical one-game-folder reorganisation is an optional subsequent step. Explicit metadata groups can remove most runtime layout inference while retaining existing paths. If folders move, the migration must also update media/POK/artwork references and native binding identities through a mapping; reorganising ROMs alone is insufficient. Reconnect/prepared-source identity and interrupted-write recovery remain useful features, not disposable compatibility code.

## 4. Require current runtime contracts — useful, relatively small cleanup

Evidence:

- [`Portal/source/bridge.js`](../../Portal/source/bridge.js): `searchArcadeCatalogue` retries without `groupVersions` after `invalid-request`; `getEmuGuiStatus` and `openGameInEmuGui` remain old API aliases.
- [`Arcade/web/metadata-scraping.js`](../../Arcade/web/metadata-scraping.js): browser `clearMatch` classification remains a fallback when native `needs_review` is absent.
- [`Arcade/arcade_service.py`](../../Arcade/arcade_service.py): collection scoping is optional; old callers can omit the collection ID. The API also retains synchronous preview and optional old/full game-list response paths.
- [`Host/morpheus_host.py`](../../Host/morpheus_host.py): service-file/dispatcher aliases and many optional-method checks support older Arcade deployments.

Advance the relevant protocol revisions to require the current fields/capabilities, update clients together, and reject outdated peers clearly. Many features were added under an unchanged version-1 protocol, so requiring today's advertised `v1` alone does not establish that an older installation implements them.

Then require scoped collection operations, native review classification and the current list/job transport. Audit native callers, command-line tools and test fixtures before removing an old path: the canonical Host still uses some older read operations internally. Do not remove full detail APIs merely because compact lists exist.

This is a good early cleanup because most changes require no database migration. It can remove fallback-specific tests, while retaining current-contract and incompatible-peer rejection tests. Platform availability, optional-network controls and permissions remain genuine capability decisions.

## 5. Complete small rename/settings/cache cutovers — modest payoff

### Host and Arcade names

[`Host/install.ps1`](../../Host/install.ps1) and [`install.sh`](../../Host/install.sh) still seed `emuguiRoot`. `_save_config_locked` in Host writes both `arcadeRoot` and `emuguiRoot` expressly for downgrades; the loader falls back to `emugui_service.py`. Stop old writes, normalize existing configuration once, require the canonical service and retire the related aliases.

The entire `Arcade/emugui_core` shim package plus `emugui_service.py` is **15 files but only 35 lines**. Removing these tidies the tree and corresponding deployment tests, but it is not a major code or performance saving. Wire prefixes and Credential Manager target names can remain fixed spellings without requiring old behaviour. Renaming them purely for appearances has a poorer return than consolidating the binding/state implementations.

### Nexus

[`Nexus/client/component-settings.js`](../../Nexus/client/component-settings.js) accepts profile schemas 1 and 2. [`Nexus/source/app.js`](../../Nexus/source/app.js) also reads the old preview storage key, while `model.js` contains old-shape defaults. Require current profile schema 2 after the coordinated update; promote any retained old preview once before dropping its reader. The live authoritative settings already use schema 2.

Keep the Host settings migration as an explicit import/upgrade boundary for the supported baseline. Nexus's cached document view, disconnected settings draft and unavailable-service presentation are current diagnostic behaviour; their usefulness does not depend on supporting an old version.

### Widgets and credentials

[`Widgets/core/widget-sdk.js`](../../Widgets/core/widget-sdk.js) provides repeated legacy-cache lookup and removal helpers. Weather, maps, RSS, calendar, ISS and IP widgets still call them. Move old-key promotion into one upgrade pass; expendable forecasts/network samples can expire, while view preferences and user-maintained widget data should be retained.

Portal's legacy service-key lookup and widget-to-global credential migration can also leave the ordinary runtime after verifying the current stores. The file audit found no nonempty old central credentials, but did not inspect browser storage or OS credential records. Keep current secure-store validation and portable-data scrubbing.

## 6. Relay storage fallback is a product-mode decision

[`Relay/background.js`](../../Relay/background.js) supports a versioned browser-owned Portal snapshot when native disk storage is not configured. It separately converts the old `morpheusState` snapshot to that current envelope. The one-time old snapshot converter can be retired after verified migration; the whole browser-owned backend is not merely historical support.

Removing the browser-owned mode could simplify persistence further, but would make Host/disk storage mandatory for authoritative Portal use. That is a separate scope change from retiring old versions. Keep disk conflict detection, recovery snapshots, chunk integrity, failed-write recovery and cross-tab authority checks in either mode. Never switch to another database just because the configured one cannot be read.

## Recommended implementation order

1. **Current-contract cleanup:** align the Portal schema declaration; update protocol requirements; remove old grouped-search/review fallbacks and unused page aliases; normalize Host root settings and Nexus profiles. Small migrations, comparatively low disruption.
2. **Binding consolidation:** stop creating old Host bindings, migrate both stores to one current envelope and remove the duplicate execution/status branches. Largest immediate native simplification.
3. **Portal state cleanup:** replace board compatibility aliases with explicit tab access, then isolate old database/widget conversion from current validation.
4. **Arcade index upgrade:** explicit adapters and stable metadata-group/version identities across all retained collections; optional folder reorganisation through a separate checked mapping.
5. **Final retirement:** remove obsolete shims/cache readers and compatibility-only tests after the preceding changes have eliminated their consumers. Keep a supported import/upgrade route for retained backups.

I would not promise a target such as reducing 518 Arcade tests to 200. Many cover distinct platforms, metadata ownership, disk safety and recovery. Prune old-client matrices, alias-only assertions and redundant normalization tests with the retired code; retain current behaviour and migration integrity. The primary gain is fewer maintained representations and execution paths, with fewer reasons for future changes to break unrelated behaviour.

## Limits

This review inspected source paths and read aggregate information from configured native JSON data. It did not modify live data, read credential values into the report, inspect browser extension/local storage, run emulators, call providers or run full product suites. Unavailable sources and old backup formats require a migration inventory before any destructive retirement. Only this report was added during the audit; the preceding policy edits remain separate pending changes.
