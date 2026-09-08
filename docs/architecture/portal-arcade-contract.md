# Cyrune Portal–Arcade Integration Contract

This document defines the durable security, data, and ownership rules for Portal/Arcade integration. Historical implementation steps remain in `docs/history/portal-arcade-integration-plan.md`.

**Catalogue capability v1** lets Portal's regular-column picker browse configured managed Spectrum libraries directly, including read-only collections. Optional `arcade-scummvm: 1` adds existing ScummVM registrations through the [configured-source adapter](arcade-scummvm-adapter.md), with independently validated native bindings and original-platform selection. No catalogue preparation is required. The [2026-09-07 update](portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07) replaces the initial preparation prerequisite and per-search launch preflight. Existing prepared identities, portable schemas and legacy actions remain compatible. Outstanding work remains in component TODOs.

## Product Responsibilities

Arcade owns collection discovery and maintenance, game metadata and artwork, incoming/review/trash workflows, scrapers, emulator definitions, profiles, launch adapters, launch decisions, favourites, and recent games.

Portal receives explicitly selected games as compact first-class items. It owns their presentation, Portal tags, movement through columns/folders/tabs/Inboxes, search, locks, duplication, Undo, Trash, portable export/import, and user-triggered launch/reveal/rebind actions.

Portal does not scan collections, scrape or mutate game metadata, manage Arcade files, configure emulators/profiles/helpers, or import whole libraries into its portable state.

## Canonical Clients and Roles

- Portal and Arcade remain external direct `file://` applications. Relay authorizes only their configured canonical real pages.
- A matching compatibility meta tag does not grant authority. Relay binds each client to its exact tab, role, page URL, and opaque session token, and rejects stale or navigated registrations.
- Discovery may renew a Portal registration only by presenting its current token for the same tab and URL. Renewal preserves that session; a fresh document registration rotates it. Pending renewal completes before content forwards page requests. Discovery replies and pings cannot replace a newer registration with an old token.
- Renewal of the same token does not emit a new relay-ready event: Portal must not replay storage requests or invalidate catalogue work merely because its tab was rediscovered.
- Portal currently receives narrow status, launch, reveal, rebind, forget, and open-in-Arcade capabilities for approved bindings. Catalogue capability v1 adds only the explicitly defined read and selected-entry binding operations below.
- Arcade receives its own bounded collection, metadata, artwork, scraper, profile, maintenance, job, and launcher capabilities.
- Portal can never call Arcade rename, delete, scrape, import, collection-maintenance, profile-management, or arbitrary filesystem operations.
- Arcade business logic and its canonical HTML/CSS/JavaScript remain outside Relay. Frontend changes take effect after an ordinary page reload without rebuilding or reinstalling Relay.
- `Arcade/arcade_service.py` and `Arcade/arcade_core` are the canonical service and package names, and Host prefers `arcadeRoot`. The former module, package, and root-key names remain read-compatible aliases during the migration window and must not become new call sites.

## Portable Game Item

A Portal game item contains bounded presentation data and an opaque device binding, for example:

```js
{
  id: "game-item-...",
  type: "game",
  title: "Jetpac",
  gameKey: "game_opaque_device_binding",
  systemId: "zx-spectrum",
  systemName: "ZX Spectrum",
  tags: ["Games"],
  thumbnailCache: "data:image/webp;base64,..."
}
```

Optional public library/game identities may assist an explicit rebind workflow, but never grant launch authority. Portable data must not contain ROM/disk/manifest/game-directory paths, emulator/helper/profile/working-directory paths, command strings, argument templates, environment variables, scraper credentials, or complete Arcade metadata records.

Thumbnails must use supported image formats, bounded dimensions and bytes, and the existing portable cache-exclusion controls. Imported or cross-device game items receive a fresh unbound state until the user explicitly approves a local binding.

## Device-Local Binding

Host owns the opaque `gameKey` mapping to stable library/game/emulator/profile identities and any approved native targets. Arcade remains authoritative for resolving current game metadata and launch policy.

- Repeated sends of the same approved combination normally reuse a binding; multiple Portal cards may reference it.
- Renames and moves in Arcade continue resolving when the stable game identity is retained.
- Missing or changed libraries, games, emulators, profiles, and incompatible resources produce explicit recoverable states instead of silently selecting another executable.
- Forgetting or rebinding is explicit. A public identity never automatically adopts an existing device approval.

## Delivery and Runtime

The existing `GAME_STATUS` response may include `languages`: at most 12 distinct
lowercase language codes (two or three letters, optionally followed by a two-letter
region). Host normalizes only explicit Arcade language metadata; release countries,
titles and native paths are never used to guess a language. Portal renders this
optional metadata from its in-memory status cache and does not add it to portable
items or catalogue binding envelopes. Older participants may omit it. ScummVM status
also supplies the existing display-only `emulatorName` and `profileName` fields, so
Portal can distinguish its official launcher icon from the original game platform.

- Arcade sends compact items through its authenticated Relay session to the active Portal tab Inbox.
- Delivery IDs prevent duplicates caused by retries. Durable Relay intake remains quota-bounded and acknowledges each delivery exactly once.
- Game launches use the persistent Host connection so emulator processes survive the native-message response lifecycle.
- Long Arcade operations retain bounded job status/progress and safe cancellation where supported.

### Checked-game delivery — Arcade 0.2.12

The administration UI can send 1–100 checked collection games as an ordered sequence through the existing single-game transport. This extends the established pinned-binding workflow without changing a message schema or activating the reserved catalogue-policy publication route below. Each game retains its exact legacy identity, game-specific emulator/profile pins and the captured collection default (or launcher selection when no default exists). Host independently validates each existing binding request; Portal alone chooses its Inbox destination.

The page captures a UUID plus item index as each delivery ID and reuses the exact payload on explicit retry. It waits for each acknowledgement before sending the next item, distinguishes Portal persistence from durable Relay queue acceptance, and never treats native binding creation alone as delivery success. The existing per-item intake count/byte limits apply before each queued item is acknowledged; no whole-batch acceptance or capacity reservation is claimed. If a later item fails, earlier accepted items remain delivered or queued. No batch launch is introduced.

Stop finishes the in-flight item and leaves remaining items pending. Retry skips accepted items; an uncertain response keeps its delivery ID. The unfinished draft stays in memory when the dialog closes and can be reopened in the same page. It is not automatically replayed after an Arcade page reload. Accepted queued deliveries remain in Relay storage across Relay reloads and use Portal's existing delivery-ID deduplication when drained. This does not promise permanent deduplication after a user removes delivered items. Single-game sends and in-place rebinding remain unchanged.

## Security and Validation Rules

- Reject unknown bindings, adapters, emulators, profiles, placeholders, launch-target kinds, operations, roles, and message fields.
- Confine every relative game, artwork, profile, and collection path to its approved real root, including traversal and symlink cases.
- Start processes with validated executable paths and argument arrays, never shell command strings or `shell=True` behavior.
- Bound native request/response sizes, transfers, thumbnails, metadata strings, search pages, job histories, configuration counts, and remote artwork.
- Use only validated HTTPS scraper and remote-artwork origins. Treat provider results as untrusted until preview/apply validation.
- Keep credentials out of Portal/Arcade portable state, extension storage, diagnostics, logs, caches, and migration receipts.
- Treat Nexus `privacy.allowOptionalNetwork` as an authoritative permission. Arcade checks it before scraper work, Host fails closed before native dispatch, and Relay checks the fixed `arcade` profile before fetching remote artwork. Browser rendering must never bypass Relay with a direct remote image URL.
- Test first/repeated/retried/multi-game delivery; missing/changed/rebound resources; multiple cards sharing a binding; client/Relay/Host reloads; native reconnection; unavailable/corrupt artwork; and portable cache exclusion whenever the relevant contract changes.

## Compatibility

Historical `EMUGUI_*` native operations, extension messages/events, identifying meta values, installed IDs, credential targets, storage keys, opaque binding fields, and persisted schema values remain compatibility contracts even though current user-facing text uses Cyrune names. Change them only through an explicit versioned migration with old-data and upgraded-install coverage.

## Catalogue capability v1 — implementation target

Portal becomes the everyday organiser and launcher for selected games. Arcade owns the multisystem catalogue, source review, metadata, artwork, emulator configuration, and exact-entry launch policy. Portal never stores the full catalogue. The first enabled workflow is a Portal-owned Add Game picker inserting Spectrum entries into an existing unlocked board column.

### Negotiation and authority

Introduce an optional `arcade-catalogue` protocol at version 1, with Portal, Arcade, Relay, and Host as participants and an outer message ceiling of 1 MiB. Register it in `infrastructure/protocols.json`, the participating manifests, and runtime advertisements only with the implementation. Its operation-specific ceilings below are stricter. Require all four participants to support v1 before exposing the picker; the Arcade service advertisement is authoritative even when its web page is closed. An absent, newer unsupported, or incompatible advertisement disables only the new capability and gives recovery guidance. Existing minimum role protocols and legacy game actions continue unchanged.

Relay validates the canonical page, role, tab, session, operation, and protocol on every request. It supplies the authenticated role/session context to Host; pages cannot supply or override that context. Host independently checks the declared role, negotiated capability, operation shape, and Arcade response, and invalidates session-bound work on disconnect. A page-provided role string is never proof of registration. Requests use the persistent Host connection. No new operation executes a batch of games.

These are the reserved v1 operation names. Relay 1.1.2 and Host 0.2.2 implement staged routes behind the closed advertisement gate; [native session envelopes and remaining gates](portal-arcade-spectrum-migration.md#implemented-staged-transport--relay-112-and-host-022) are documented separately:

| Page message | Role | Host operation | Arcade service operation / responsibility |
| --- | --- | --- | --- |
| `MW_SEARCH_ARCADE_CATALOGUE` | Portal | `ARCADE_CATALOGUE_SEARCH` | `CATALOGUE_SEARCH`: sanitized paged projection |
| `MW_GET_ARCADE_CATALOGUE_ENTRY` | Portal | `ARCADE_CATALOGUE_GET_ENTRY` | `CATALOGUE_GET_ENTRY`: one sanitized entry |
| `MW_GET_ARCADE_CATALOGUE_ARTWORK` | Portal | `ARCADE_CATALOGUE_GET_ARTWORK` | Resolve an entry-owned artwork reference through the authenticated asset pipeline |
| `MW_BIND_ARCADE_CATALOGUE_ENTRIES` | Portal | `ARCADE_CATALOGUE_BIND_ENTRIES` | Resolve selected entries and current policies; Host owns approval and persistence |
| `MW_PUBLISH_ARCADE_CATALOGUE_ENTRIES` | Arcade | Same fixed binding primitive with independently validated Arcade role | Later bounded publication to Relay intake |

Publication additionally requires the optional `arcade-catalogue-publish-v1` capability from Arcade, Relay, and Host. It may remain disabled when picker v1 is enabled. Portal may not invoke publication; Arcade may not supply Portal destinations. Legacy methods are not repurposed as generic catalogue dispatchers. Neither role may submit service method names, arbitrary filters, native targets, emulator/profile IDs, launch arguments, or filesystem paths through these operations.

### Entry and identity model

The public projection has `schemaVersion: 1`. An entry identifies one exact release and launch target, independently of which installed emulator executes it. Different platforms, 48K/128K releases, translations, enhanced versions, and editions remain separate. A single existing combined 48K/128K release remains one entry unless reviewed source evidence establishes separate targets. Similar titles and scraper matches never establish identity or approve substitution.

| Public field | Rule |
| --- | --- |
| `catalogueId` | Stable opaque entry ID; no path, filename, title, emulator, or launch authority encoded in it |
| `sourceId` | Stable opaque catalogue source ID; distinct from a local root or a device approval |
| `entryRevision` | Opaque revision of the entry's selectable presentation and launch semantics; used for stale-selection detection |
| `title` | Plain text, at most 160 Unicode code points |
| `platformId`, `platformLabel` | Declared platform ID and plain-text label of at most 80 code points; initially `zx-spectrum` / `ZX Spectrum` |
| `hardwareLabel`, `editionLabel` | Plain text, at most 80 / 160 code points; unknown values remain empty |
| `targetKind` | v1 accepts only `media-file`; it is a classification, never a target descriptor |
| `year`, `publisher` | Plain text, at most 16 / 160 code points |
| `availability` | One of `available`, `ready`, `source-unavailable`, `media-missing`, `configuration-required`, `unsupported`, `review-required`. `available` means a selectable library entry whose exact media and launch policy will be checked on Add; it does not promise launch readiness. |
| `artworkRef` | Optional opaque reference tied to this entry and revision; at most 128 ASCII characters; no URL/path |

Detail adds only `description` (2,000 code points), `languages`, `countries`, and `suggestedTags` (at most 12 values each, respectively 16/16/80 code points). Search returns the base projection only. All fields are fixed; unknown fields are rejected at trust boundaries. Strings are plain text without control characters and are rendered as text. IDs and revision tokens use `[A-Za-z0-9_-]`, at most 80 characters. Missing optional text is an empty string, lists are empty arrays, and absent artwork is an empty string. Each base record is at most 2 KiB serialized UTF-8; oversized or invalid source metadata produces a sanitized unavailable/review result, never a truncated identity or raw internal record.

Arcade retains existing prepared identity mappings unchanged. For direct library browsing, a schema-1 `catalogue-library.json` in the native runtime holds a random 256-bit key, created atomically under a native lock. Domain-separated HMACs of native collection/root/legacy-entry identities provide stable opaque IDs without exposing paths or enabling dictionary guesses. No unkeyed path hash or encoded native target is public. Browsing never writes collection metadata, media, preparation proofs or Host approvals. Missing metadata IDs retain Arcade's existing private legacy alias; Portal never receives that path-derived alias. A root change creates different direct IDs rather than silently retargeting a binding. Optional later relocation preparation adopts already-issued direct IDs. Existing prepared IDs take precedence, and corrupt identity state is never silently reset. These native identifiers are not portable device approvals.

For Spectrum display and profile matching, an explicit valid `system` is authoritative and `memory` is its fallback, matching Arcade. Different values can describe a valid release and are not grounds for disabling it.

Future target kinds include disc manifests, ScummVM entries, DOSBox configurations, and MAME machines. They require declared adapter support and contract coverage before admission. Platform and execution adapter remain separate concepts; a DOS release does not become a different platform merely because it uses DOSBox or ScummVM. Existing Portal system IDs remain readable until a separately tested compatibility mapping exists.

Arcade's [native import manifest](arcade-import-manifest.md) is a separate discovery/review format. Its Spectrum adapter shares normalization with this projection, but private target descriptors, artwork URLs and POK references remain native. Manifest validation grants no binding, launch, import/apply or page authority and adds no preparation prerequisite to browsing.

### Search, detail, and artwork

Search accepts exactly `{ query, platformIds, pageSize, cursor }`: query defaults to empty and is limited to 160 code points, platform IDs to four declared values, page size defaults to 50 and accepts integers 1–100, and cursor defaults to empty and is at most 256 ASCII characters. Reject wrong types, booleans in integer fields, unknown fields, duplicate/unknown filters, and out-of-range values rather than coercing or silently clamping them.

Search performs case-folded title token matching with all tokens required and exact platform filtering. It returns `{ schemaVersion, catalogueRevision, entries, nextCursor }`, capped at 256 KiB including the envelope. Ordering is deterministic by normalized title, platform ID, hardware label, edition label, then catalogue ID. There is no locale-dependent ordering or whole-library payload. A page may be shorter than requested to satisfy the byte ceiling; its cursor advances past exactly the returned entries. Empty results have no next cursor.

The native process caches the metadata projection and checks configuration, root and metadata-file stamps around each read. Warm searches do not walk media files, hash games, or resolve each result's launch policy. Metadata/configuration/identity changes rebuild the index and invalidate old selections. Media, executable and profile checks occur only for selected games during Add and again during launch; the Add lease checks those selected targets again before Host persists approvals. Search and detail retain the `available` state until that explicit action. An unavailable configured source does not select a replacement or change Arcade's active collection.

Arcade issues an opaque, integrity-protected cursor bound to the normalized query, filters, ordering, page size, catalogue revision, and service generation. Do not expose native data inside even an encoded cursor. A cursor expires after five minutes; tampering or a query mismatch returns `invalid-request`, and a changed catalogue, restart, or expiry returns `catalogue-changed`. Portal restarts paging and revalidates selections rather than concatenating incompatible pages. Mutations affecting identity, eligibility, ordering, or availability invalidate the revision. Catalogue reads must not select or mutate Arcade's active collection.

Detail accepts exactly `{ catalogueId }` and returns `{ schemaVersion, entry }`, capped at 16 KiB. Each operation has a 15-second deadline and at most two outstanding reads per Portal session. Portal cancels obsolete searches or discards late results by request generation and keeps no more than 200 result records in memory plus the bounded selection. Closing the picker discards pages, cursors, and artwork references. Relay never retains catalogue pages in extension storage or durable intake.

Artwork accepts exactly `{ catalogueId, artworkRef }`. Host verifies entry ownership and revision before using the existing asset pipeline. It returns a validated PNG/JPEG/WebP thumbnail, at most 256 pixels on either edge, 128 KiB decoded bytes, and 192 KiB for the complete base64 response. Missing, changed, or corrupt artwork produces an icon fallback without invalidating an otherwise launchable entry. Portal never supplies a provider URL or local path. Any remote acquisition retains the authoritative optional-network gate and provider/redirect allowlists; read-only catalogue search itself does not trigger scraping. Legacy thumbnail ceilings remain unchanged for old operations.

The artwork implementation admits a bounded static local PNG subset and emits newly encoded PNG pixels; other source formats and remote references use the text/icon fallback. Its exact success envelope, input limits, and validation boundaries are documented in the [local artwork milestone](portal-arcade-spectrum-migration.md#implemented-local-artwork-and-read-leases--arcade-026-host-023-relay-113).

### Explicit binding, retries, and Portal insertion

Binding accepts exactly `{ requestId, entries }`, where `requestId` is a fresh UUID and `entries` is an ordered array of 1–100 distinct `{ catalogueId, entryRevision }` pairs. The whole request is at most 32 KiB. Reject the whole request before mutation for invalid envelopes, duplicate IDs, excessive counts, unsupported versions, or a wrong role. Per-entry missing media, stale revision, unsupported target, or missing configuration yields a fixed failure for that entry. Binding has a 30-second deadline, one outstanding mutation per session, and a maximum response size of 256 KiB.

Host revalidates each selection against Arcade immediately before committing approval. It returns `{ schemaVersion, requestId, results }` in the original order; each result contains `catalogueId` and either `{ ok: true, game }` or `{ ok: false, code }`. `game` uses the existing compact game presentation and opaque `gameKey`, with no inline thumbnail in batch results. Use bounded artwork reads independently. Suggested tags are copied only through Portal's explicit choice; catalogue metadata never changes Portal tags implicitly.

Within one native lock, resolve/reuse bindings, stage all successful additions and the bounded request receipt, then atomically persist them or use a recoverable journal. Report success only after persistence. A failed commit adds no approvals; a per-entry validation failure does not discard successful entries or existing bindings. Respect the current total limit of 512 game bindings across old and new representations.

An identical in-flight retry shares the same approval outcome. Private binding receipts contain only request/session IDs, a digest of the exact ordered payload, catalogue IDs, keys, and fixed result codes; reconstruct presentation through the validated projection. They are not Nexus validation receipts and contain no query text, titles, raw records, or native targets. A changed payload is `request-conflict`. Retain at most 64 receipts per session, with an aggregate Host budget of 1 MiB; reject new mutations with `busy` rather than evict an unexpired receipt needed for retry. A session's mutation lease lasts at most 30 minutes from registration. Invalidate that lease before expiring its receipts, so old requests cannot become fresh approvals through eviction. Session expiry/reconnect ends automatic mutation retries and requires refreshed selection and explicit confirmation under a new authenticated session. Receipts and approvals must recover together after an interrupted write; a previous-session request is never replayed automatically after Host restart. Read-only operations may be retried once within their deadline, but binding timeouts must be reconciled using the same request ID while its session remains valid.

Reuse an existing binding only for the same exact entry and equivalent launch-policy semantics. New bindings use the game's emulator override, then the collection default, then Arcade's initial visible configured emulator selection (excluding OS-default launch and hidden/helper adapters). Validate that exact selection; an explicit missing or broken pin never falls through to another executable. Existing profile pins/rules select the profile. Legacy pinned emulator/profile bindings retain their semantics and keys. Do not merge several legacy bindings or convert them to a moving default silently. A delayed retry after Forget returns `binding-forgotten`; it must not restore approval. Forget marks the corresponding retained result as forgotten instead of deleting the receipt and making the old request eligible again.

Portal captures the insertion destination when opening the picker and revalidates its existence, lock state, capacity, and authoritative write availability before confirming and before inserting results. All successful results are applied once in request order through one Undo snapshot and one authoritative save. It reports per-entry failures and preserves the successful selection. A failed save follows Portal's existing recovery rules; it must not report persisted success or blindly append the same results again. If the destination becomes invalid, retain the results in the open draft for explicit placement or cancellation. No automatic fallback to another board/slot. Cancelling before confirmation creates no approvals; cancelling after approvals does not silently revoke a binding shared by another card. Undo removes Portal cards, not Host approval.

Initial cards retain the current portable game shape, `systemId`/`systemName`, and `gameKey`. Catalogue revisions, pending selections, request receipts, target descriptors, and full detail records are not added to portable Portal state. Any later persistence of public catalogue IDs requires schema/serializer/import coverage first.

### Launch and later publication

A click sends one `gameKey` through the existing single-game launch route. Host resolves the exact source/entry and Arcade's current approved policy, validates the resolved native launch plan, and executes through the persistent native process. Source-scoped resolution must work without switching the Arcade UI's active collection. An inaccessible source returns a specific unavailable state; another source with the same game ID/title is never substituted. Emulator/profile edits in Arcade may change new-policy bindings' launch configuration without rewriting Portal cards; changing an executable or native target still requires the existing device approval rules. Existing running-emulator choices remain explicit and can direct the user to Arcade.

Later Arcade publication uses the same selected-entry validation and ordered results, then creates bounded per-item deliveries through the existing durable intake. Each successful item gets a stable delivery ID derived from the publication request identity and entry position; retries reuse it. Reserve queue capacity before accepting publication, omit inline artwork, and obey the existing per-delivery and aggregate quotas. A response distinguishes approved, accepted/queued, and acknowledged delivery; binding success alone is not publication success. Pending delivery retains its identity through Relay restart. Expired sessions require explicit reconciliation, not an automatic new publication. Preserve the existing bounded acknowledgement/deduplication retention rules; do not claim permanent exactly-once delivery after their expiry.

Only Portal chooses the active Inbox destination through its existing intake rules. The new Arcade publication request rejects board/tab/folder/slot fields. Games remain excluded from Sets, browser sessions, URL checks, folder/open-all and batch-launch workflows, including mixed selections.

### Errors and rollout

New operations return fixed codes, never native exception text: `invalid-request`, `unsupported-protocol`, `unauthorized`, `unavailable`, `busy`, `timeout`, `catalogue-changed`, `entry-changed`, `entry-missing`, `source-unavailable`, `media-missing`, `configuration-required`, `unsupported-target`, `review-required`, `binding-limit`, `binding-forgotten`, `request-conflict`, or `persistence-failed`. Clients map codes to actionable text. Details, error histories, diagnostics, and events never contain paths, credentials, raw metadata, arguments, or catalogue query text.

Enable the initial picker only after the Spectrum identity, source-scoping, role, paging, retry, persistence, and launch acceptance gates in the companion document pass. Add compact placements and batch publication next. Source adapters, broader review/import workflows, and retirement of Arcade launcher UI follow only after the existing Spectrum workflow is proven. This documentation change does not enable any route, alter a manifest, migrate live data, or retire an interface.

## ScummVM capability extension — 2026-09-07

Arcade 0.2.15 / Host 0.2.6 / Relay 1.1.6 / Portal 0.12.10 implement optional `arcade-scummvm: 1`. The [adapter contract](arcade-scummvm-adapter.md#optional-transport-and-native-approval-migration) defines native negotiation, exact launch policy and the explicit atomic binding-store schema 1 → 2 migration. Existing public request envelopes, catalogue projection schema 1 and portable Portal records are preserved. Negotiated sessions also admit `targetKind: "scummvm-game"` with `dos` / `DOS`, `windows` / `Windows`, `fm-towns` / `FM Towns`, `amiga` / `Amiga`, `atari-st` / `Atari ST`, `macintosh` / `Macintosh`, or `unknown` / `Unspecified platform`. Spectrum keeps `media-file` and `zx-spectrum`. Unknown discriminants and platform/label mismatches fail closed. All original limits and page-role boundaries continue to apply.

Both legacy single-game Send and its bounded client batch sequence can approve configured ScummVM targets. This extends the existing authenticated route; it does not expose the planned catalogue publication protocol or Portal structure to Arcade. Portal stores only compact presentation and opaque keys, and verifies the selected platform when accepting a binding response. Native ScummVM paths, target IDs, INI settings and launch arguments never enter Portal data or Relay catalogue storage.
## ScreenScraper artwork references — Arcade 0.2.44 (2026-09-08)

Arcade's existing authenticated asset operation also accepts the bounded native reference `scraper-artwork/screenscraper/<systemId>/<gameId>/<mediaType>/<region>`. Numeric public IDs, an exact still-image type allowlist and a bounded region code identify a ScreenScraper image; no URL, password, native path or process authority is encoded. The native Arcade service reconstructs the fixed API v2 `mediaJeu.php` request from these fields and the configured provider credentials, enforces the authoritative optional-network gate, checks redirects before following them and returns bounded PNG data through the unchanged asset envelope. API-provided credential-bearing URLs never enter preview responses or persisted metadata. Requests are serialized for single-thread accounts.

These references persist in Arcade-owned presentation fields for Spectrum, Atari and ScummVM. The correction of the mistakenly shipped Spectrum `system_id` 135 to 76 occurs during request construction; saved setting keys and other explicit overrides are retained. Relay treats the references as native asset identifiers through its existing Arcade-only route. Portal catalogue thumbnails retain their local-PNG-only rules and never receive the references or trigger scraping. No native message or portable schema changes.

Arcade 0.2.48 caches successful ScreenScraper PNG responses under its native runtime `scraper-cache/`, using hashed public references only. Cache files expire after 30 days and are bounded to 128 MiB / 2,048 entries; confined paths and atomic replacement keep failures disposable. The existing provider-enabled/configured and optional-network checks still run before cache access. No cache path, credentials, new message or portable field is exposed.

## Related game versions (2026-09-07)

Arcade 0.2.54 distinguishes dedicated game folders from legacy containers. Alphabet/numeric buckets and flat roots always separate original titles; other folders qualify as dedicated when their name matches a member's original title or ROM title. Unrecognized layouts conservatively separate original titles. The same native grouping drives presentation reads, Spectrum scrape scope, manual propagation and in-memory refresh. No ROM moves, metadata rewrite on load, identity migration or message-schema changes are introduced. Collection-switch jobs also prepare version metadata before completion; the browser commits collection identity and list data together and rejects overlapping switches.

Arcade 0.2.52 resolves Atari/Spectrum presentation per game folder before building the native library and catalogue. Protected fields (including empty values) take precedence, followed by validated Atari overrides, scraper provenance and populated metadata; equal-priority legacy donors use stable entry ordering. Source records remain unchanged on reads. Unrelated titles in a flat collection root remain separate. Hardware, language, media and launch policy remain exact-edition data; stored family identities and defaults remain intact. Legacy Spectrum presentation edits propagate to folder siblings. ScummVM retains per-registration metadata. Cleanup summaries derive from these resolved records, replacing the temporary default-only browser filter in 0.2.51. No portable field, native operation or new authority is introduced.

Arcade 0.2.50 adds Arcade-only POST `/api/metadata-care` through the existing authenticated API route. An exact game ID reads or edits bounded presentation fields and `protected_fields`; `action: "undo"` restores the last applied scrape/batch in the current collection. Optional `collection_id` uses the existing collection-change lock. `/api/apply-scrape` accepts `mode: "replace" | "missing"` (default replace) and an optional bounded `undo_group` token for a batch. Protected fields always win over incoming values. Native folder/version membership, writable-source/override policy and asset validation remain authoritative.

Native Spectrum metadata and Atari/ScummVM override rows may carry an additive `protected_fields` list. Runtime `metadata-care/` files store review markers, one row-level Undo record and an interrupted-write journal, bounded to 32 MiB and 1,000 changed versions. Interrupted writes recover before game-list reads or subsequent protection/scrape operations; Undo compares affected current rows to the saved after-state and preserves unrelated rows. These native fields and history are not projected to Portal. Arcade game summaries add only `cleanup: {artwork, description, review}` booleans; scraper previews add `needs_review`. Existing providers, launch identity, portable schemas and Relay/Host messages are unchanged.

Arcade 0.2.47 adds Arcade-only POST `/api/scrape-targets` under the existing authenticated API transport and collection-change lock. Up to 100 selected IDs expand to at most 1,000 exact versions: one review row per native game folder for Atari/Spectrum, or one per related ScummVM registration in the active collection. Responses contain bounded presentation, exact game IDs and an opaque search-reuse key, never native folders or registration targets. Bulk preview requests may now include the existing term/platform overrides. ScummVM Current system resolves the registration's original provider platform; unspecified platforms search broadly and require review.

Scrape previews expose `target_ids`; apply may supply that list to reject changed folder membership before writing. Atari/Spectrum apply resolves the folder natively and writes shared presentation to its exact members using the existing metadata/override shapes. Atari uses one atomic override replacement; Spectrum rejects a partial folder edit. ScummVM apply remains exact-registration-only. Media, hardware, language, launch pins, identities and shared defaults remain version-specific. Spectrum rows add `scrape_family_title` on their first reviewed scrape, retaining their pre-scrape family identity so title corrections do not discard existing version defaults; older rows still group by their title. This additive native metadata field grants no authority and is not projected to Portal. No automatic migration of old conflicting scraped values occurs: the next reviewed folder scrape reconciles them. This changes Arcade scraper scope only; it adds no Portal capability, native message, or portable field.

Arcade 0.2.45 extends the existing Arcade-only scraper-preview body with optional `search_platform`, defaulting to `current`. A fixed provider-specific mapping accepts `all`, `zx-spectrum`, `atari-st`, `amiga`, `dos`, `windows`, `macintosh`, `fm-towns`, and ScreenScraper-only `scummvm`. All removes the provider platform filter; explicit scopes only alter lookup. `/api/scrapers` supplies bounded `platform_options` IDs/labels for each provider. No arbitrary URL or numeric provider selector is accepted. Preview candidates retain their source platform for review, but applying scraped metadata never changes the native platform/system or launch identity. Bulk requests omit the override. Existing collection/role/network checks and message schemas remain intact.

Arcade 0.2.40 adds Arcade-only GET/POST `/api/collection-settings`. GET selects a configured collection by `collection_id` and returns bounded location/name fields with a revision. POST accepts only that ID/revision, name, root and optional ScummVM configuration file; validation and atomic configuration persistence remain in Arcade's Host-loaded service. Settings never change adapters, emulator pins, prepared identities, game files or Portal records. Prepared-root relocation uses the existing reattachment workflow. Editing another platform's settings does not activate its library; the browser keeps unsaved drafts only in the open modal. No new Relay/native operation or Portal capability is added.


Arcade 0.2.39 extends its existing scraper-preview body with optional `search_term` (a nonempty string up to 500 characters, without control characters). Omission retains provider defaults and automatic title fallback. The preview's `query.search_term` reports the actual lookup term; explicit edits affect only provider lookup, never source identity or saved metadata. This remains an Arcade-only request under existing role, network and collection checks.

Arcade 0.2.38 keeps platform-specific search/filter preferences in its existing browser UI storage. Exclusions prune only the displayed edition aggregates and counts; row action identities still refer to the saved default, even when excluded. These local preferences never alter Portal defaults, catalogue families or launch approval. Arcade-only scraper preview/apply calls may include `collection_id`; the service compares it with the active collection under the collection-change lock before processing. Older requests without this additive field retain their existing behavior. Bulk scraping uses bounded sequential calls to these existing routes and an explicit combined preview/apply UI; it adds no Portal capability or new native operation.

Arcade retains every exact game/target identity and adds a presentation family scoped to source and target kind. Normalized titles identify families, except ScummVM's specific `scumm`/`kyra` engine/game IDs identify their editions even when registration display titles differ. Generic AGS/GLK IDs never merge unrelated titles. Whitespace/case normalization does not strip sequel numbers, Deluxe or remake names. Remakes and different configured collections remain separate. This grouping does not delete or rewrite collection files, registrations, metadata, favourites or launch approvals.

Catalogue search accepts optional `groupVersions: true`. It returns one existing entry per family, selected by the saved default or the deterministic catalogue order, with aggregated hardware/platform and edition/language labels. Families are formed before pagination; a platform filter matches any member without changing the default. The existing schema-1 envelope and exact entry IDs/revisions remain unchanged. Omission or `false` retains the exact-entry projection. New Portal opts in and retries without that option when an older participant rejects the optional field. Grouped cursors also depend on the current default choices. A missing saved default is not silently replaced with another version.

Host game status adds optional runtime-only `versionGroup`, `versionCount`, and `platforms` (up to twelve display strings); `languages` represents the family's explicit language options. Portal uses this native identity to collapse duplicate game versions within individual columns, folders and Inboxes. Original portable records, custom metadata and placement in other containers remain intact. Portable schema 6 still carries a single opaque `gameKey`; family membership and defaults are never persisted in Portal or Relay storage.

Authenticated Portal may send `MW_GAME_VERSIONS`, routed to Host `GAME_VERSIONS`, with an already-approved `gameKey` and fixed action `list`, `launch`, or `default`. Only the latter two accept an exact `catalogueId` and `entryRevision`. Host independently resolves the anchor binding, validates family membership and the current immutable launch plan, and approves the explicitly selected version before launch or saving a default. Listing creates no approvals. A list contains a sanitized family ID, title, default ID, and at most 1,000 options, bounded to 512 KiB. Options contain only catalogue identity/revision, display label, platform label, languages, countries and `isDefault`. Equal display labels receive stable copy ordinals. Relay rejects extra fields and oversized replies. Native paths, ScummVM target descriptors and process arguments never cross this interface.

Arcade owns `game-version-defaults.json` in its native runtime: schema 1 maps opaque family IDs to exact catalogue IDs and Host-approved game keys. Writes use a native writer lock and atomic replacement; invalid data requires recovery rather than an empty fallback. Host approves explicit default selection; ordinary Portal launch revalidates the saved approval and never approves or substitutes a new target automatically. Older shortcuts retain their original exact launch pin until the user selects a shared default. New grouped-picker and Arcade-row shortcuts start with the catalogue's deterministic default. Choosing **Launch** in the version dialog is a one-time choice; **Use as default** applies to both clients. Forgotten, changed or missing default approvals fail safely.

Arcade's authenticated `/api/games?groupVersions=true` adds native family annotations while retaining exact rows underneath. Its frontend groups collection rows and aggregates system, edition, language and country options; Incoming and Bin remain file-oriented. `/api/game-versions` lists a selected game's family and `/api/game-version-default` performs the explicit default choice through Host approval. These Arcade routes do not grant Portal collection-mutation authority. Double-click uses the grouped row's default; the **Launch Version…** context action exposes every member. Language and country columns use local, licensed SVG flags with accessible labels.


### Default-version badges (2026-09-07)

Host 0.2.10 adds optional runtime-only `defaultVersion` to game status: `languages` is the exact launch version's normalized language list (up to twelve codes); `platforms` contains its bounded display labels (native platform and, where explicitly recorded by ScummVM, Steam). Family `languages` and `platforms` continue to represent all versions. Portal 0.12.13 uses only `defaultVersion` for title badges and omits them when it is absent or status is unavailable. Older shortcuts retain their exact pin until an approved shared default is selected; a missing saved default is never presented as a different version. This additive status field changes no request, authority, binding, or portable schema. Portal never persists it.


### Platform and system presentation (2026-09-07)

Library platforms identify adapters/collections, such as ScummVM and ZX Spectrum. Systems identify game variants: DOS/Windows/Amiga for ScummVM, 16K/48K/128K for Spectrum, and potentially ST/STe/TT/Falcon for Atari. Preserve historical protocol `platformId`, `systemId`, and persisted column key `system`; these are presentation terminology changes, not identity migrations.

Host 0.2.11 adds optional `defaultVersion.systems` (bounded display labels) alongside the existing `platforms` compatibility field. Portal prefers `systems`. Arcade’s native-only catalogue presentation lookup resolves Spectrum hardware and explicit legacy language labels without modifying indexed entry details, revision digests, approvals or source metadata. Known language codes take precedence over labels; absent or unknown languages remain unknown. Shared default resolution remains authoritative. Arcade combines available system badges in each title row; Portal displays only the selected default’s systems.

Host 0.2.12 also obtains Spectrum hardware from the exact catalogue detail when the optional presentation helper is absent. Portal 0.12.16 omits a legacy `ZX Spectrum` platform label from the default-system badges: the platform logo belongs only in the favicon. Missing hardware is never guessed from the title or emulator profile.

Host 0.2.14 and Arcade 0.2.25 resolve existing Spectrum `approvedGames` bindings by their saved collection/game IDs when another collection is active. The native-only source/launch callbacks reuse Arcade's confined metadata loader, exact emulator/profile pins and launch adapters without changing active collection state or allocating a replacement binding. Thumbnail lookup uses the bound root and never borrows artwork from the active collection. Portable records and page message schemas remain unchanged.

### Launch review hardening (2026-09-07)

Portal 0.12.17 rejects pending game launches, reveal/open actions, Forget and version mutations with a local `outcome-unknown` error on Relay reconnection. These effects may already have completed and must not be replayed automatically. Version lists and other reads retain normal recovery; catalogue session expiry keeps its existing separate rules.

Arcade 0.2.28 validates supported media formats before native launch and catalogue approval. Automatic catalogue selection skips incompatible formats; an explicit incompatible emulator or missing saved profile fails instead of silently selecting a replacement. Managed EightyOne profile selection uses the configured emulator ID, including custom IDs, and requires a valid copy destination. Host 0.2.15 uses a validated catalogue binding's source collection when opening Spectrum games in Arcade, independently of the currently active collection.

## Atari ST disk sets

The optional Atari capability, complete-edition identity, STEem launch policy and native binding schema 3 migration are defined in the [Atari adapter contract](arcade-atari-adapter.md).

## Emulator application shortcuts — 2026-09-08

Arcade 0.2.55 adds Arcade-only GET `/api/emulator-shortcuts`, GET `/api/emulator-icon` and POST `/api/launch-emulator` through the existing authenticated API envelope. Requests carry the current collection ID and, for icon/launch operations, a configured emulator ID. Native validation rejects extra fields, wrong-platform adapters/media formats, stale collection IDs and missing executables. Shortcut responses contain names, IDs and icon revisions; icons are bounded PNG data URLs. Host 0.2.24 injects its existing application-icon extractor as a native-only callback. Application launches use only the configured executable/working directory, plus ScummVM's configured INI when applicable; no ROM or game-profile template is applied. No new portable record, native message or Portal authority is introduced.

## Game Boy cartridges — 2026-09-08

Arcade 0.2.53 adds the native `gameboy-cartridges-v1` collection adapter with one `game-boy` navigation platform. Cartridge variants remain `GB`, `GBC`, `GBA` in system/tags, with separate provider-system IDs. Metadata paths are relative to the configured root and confined to its three cartridge sublibraries; ROMs are not moved by setup or scraping.

Arcade-originated delivery uses existing opaque Host game bindings. The source-scoped legacy resolver supports these cartridge records without activating their collection. Exact version approvals reuse the private schema-1 media-file plan: Host 0.2.23 independently allows `.gb`, `.gbc`, `.gba` only for `game-boy` / `Game Boy`, the `generic` adapter and the corresponding cartridge system. Spectrum plans retain their previous formats. File signatures, content hashes, argument-array rendering and approved roots remain independently checked. No paths, commands or new authority are added to portable data.

Arcade 0.2.56, Host 0.2.25, Relay 1.1.12 and Portal 0.12.21 add optional `arcade-gameboy: 1`. Relay enables it on the dedicated catalogue session with `ARCADE_CATALOGUE_ENABLE_GAMEBOY`, only after client advertisement. Host checks its own and Arcade's capability and native version marker before enabling it. Sessions lacking this negotiation cannot search or bind cartridges. Game Boy entries use `game-boy` / `Game Boy`, `media-file` and a GB/GBC/GBA hardware label. Existing schema-1 native plans and exact media validation remain unchanged.


## Portal-owned theme presentation — 2026-09-08

Portal 0.12.20 publishes `MW_PUBLISH_PORTAL_THEME` after authoritative snapshot loads and successful non-conflicting saves. Relay 1.1.11 advertises `portalTheme` in Portal storage capabilities. The projection is built from that snapshot, never from rendered settings-editor previews. Theme publication failures cannot fail a database operation. Portal remains the theme owner; this does not extend Nexus settings schemas.

Relay authenticates publication as Portal-only and `MW_EMUGUI_GET_PORTAL_THEME` as Arcade-only using existing exact page/session checks. Schema 1 contains `colorScheme` and exactly 38 allowlisted colour, dimension, font, opacity and shadow tokens, each at most 160 characters. It rejects extra fields and arbitrary CSS/URL functions. Relay stores one projection under `cyrunePortalThemeV1`, serializes publication, skips identical updates and sends `MW_PORTAL_THEME_CHANGED` to registered Arcade tabs. The cache has no database contents, board data, media references, credentials or native paths.

Arcade 0.2.41 reads on startup/pageshow and change notifications, ignores older in-flight responses, and applies presentation to its own layout. The cached theme survives Portal closure and Relay restart. Board backgrounds remain Portal-specific; panel opacity uses Portal's general sidebar opacity because Arcade has no active Portal board. Spectrum/Atari navigation artwork mirrors Portal's native symbols; ScummVM original-platform badges remain confined to ScummVM entries.


## Arcade responsiveness and artwork — 2026-09-08

Legacy API names remain supported. Updated Arcade requests identify the collection for game reads and collection mutations; native dispatch validates it under the collection lock. Local image requests carry optional `collectionId` through `EMUGUI_ASSET`. Provider images use public references and native cache roots, never credential-bearing URLs. Catalogue artwork descriptors remain native-only, exact-entry, signature-checked PNGs, including existing ScreenScraper cache files; the picker never acquires remote artwork implicitly. No title-based borrowing is allowed across registrations.

`/api/games` optionally accepts `compact=true` and `since=<revision>` for summary reads. It returns omitted-field defaults, upserts, removed IDs and changed exact-entry revisions. The browser reconstructs a complete local snapshot and rejects stale views; legacy requests retain full rows. Native snapshots retain at most two views/60,000 rows.

`/api/scrape-preview` with `background:true` returns an opaque `job_id` and collection identity; `/api/scrape-job` polls that identity and returns a bounded completed result. Native artwork jobs use the same read-only queue. Two workers, four unfinished jobs and sixteen retained jobs bound it; completed jobs expire after three minutes. Metadata application remains a separate, scoped operation. The in-memory successful search cache retains at most 64 entries/8 MiB for thirty minutes, using digests of captured provider configuration without persisting credentials or raw provider responses.

Relay admits two complete Arcade transfers and at most 64 waiting operations. The general native FIFO is bounded to 128 waiting requests/32 MiB, checks queued deadlines and rechecks Arcade page authority before dispatch. Host refuses excess transfers before dispatching a mutation; it never evicts an unfinished transfer to admit another request. Existing transfer TTL and per-response byte limits remain in force.
