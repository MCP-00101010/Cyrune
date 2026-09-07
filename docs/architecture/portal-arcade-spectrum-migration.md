# Spectrum Catalogue Mapping and Acceptance Criteria

Design baseline: 2026-09-06. Current status: prepared managed Spectrum sources and the regular-column picker are enabled in the [coordinated activation below](#column-picker-activation--2026-09-06). Earlier milestone sections preserve their status at the time. Live collection preparation remains an explicit user-reviewed operation.

This document accompanies [Catalogue capability v1](portal-arcade-contract.md#catalogue-capability-v1--implementation-target). It defines the first Spectrum mapping and evidence required to enable Portal's Add Game flow. Component TODOs own the remaining work.

## Inspected implementation baseline

| Source | Observed behaviour | Consequence |
| --- | --- | --- |
| [Game and GameLibrary](../../Arcade/arcade_core/library.py) | `Game` mixes presentation, native `path`, emulator/profile IDs, and import state; summaries still contain filenames, profile IDs, and import matches. | Build a separate allowlisted projection; neither `asdict(Game)` nor the current summaries are Portal-safe catalogue responses. |
| [Existing read service](../../Arcade/arcade_core/service.py) | `SEARCH_GAMES` has bounded offset/limit, but materializes full records and searches internal filename/metadata fields; `GET_GAME` returns a full record. | Retain old methods for existing consumers. Implement new projection/paging operations over the index without exporting or serializing the complete library. |
| [Spectrum loaders](../../Arcade/arcade_service.py) | `load_metadata_games` keeps a persisted ID or derives `stable_id(rel_path)`; `make_game` hashes its report output path; `make_scanned_game` hashes the resolved absolute path. `stable_id` is a lowercased SHA-1 prefix. | Existing IDs are not uniformly stable across relocation. Preserve persisted IDs and pin identities before catalogue publication; never promise that re-scanning paths alone preserves identity. |
| [Collection configuration](../../Arcade/arcade_core/collections.py) | Configured collections have retained IDs, often originally derived from names. The service and library currently operate on the active collection. | Keep configured IDs; introduce explicit source resolution that does not mutate active UI state or use `resolve`'s fallback-to-first behaviour. |
| [Metadata mutations](../../Arcade/arcade_core/metadata.py) | Rename updates the file reference under the existing game ID and rebuilds, with rollback. | Preserve that ID through managed renames and verify the rebuilt record and POK linkage. |
| [Host bindings](../../Host/morpheus_host.py) | `approvedGames` stores `libraryId`, `gameId`, `emulatorId`, and `profileId`; reuse matches all four. Source resolution requires the library to be active. Limit is 512 bindings. | Preserve old pins/keys. New entry-policy bindings and source-scoped resolution require explicit compatibility work. |
| [Native launch](../../Arcade/arcade_core/launching.py) | Arcade's launch module currently performs process work inside the Host-loaded native service. | Retain working emulator behaviour while separating a validated launch decision from Host execution; never move native authority into a page or Relay. |
| [Portal game presentation](../../Portal/source/game-launcher.js) | Cards use `gameKey`, `systemId`/`systemName`, thumbnail cache, and display emulator/profile names. | Reuse that portable shape initially; no new persisted catalogue snapshot or native launch fields. |
| [Relay delivery](../../Relay/background.js) | Existing single-game binding/publication and persistent launch transport already exist. | Preserve their identifiers and old payload compatibility; add the new role-specific batch route separately. |

These observations are source inspection, not a new measurement of a live library. The recorded health-audit baseline is 12,933 games and an 8.66 MiB summary payload; it must be remeasured when the projection is implemented.

## Identity and migration decisions

1. Keep existing collection IDs, persisted game IDs, favourites/recent references, metadata IDs, profile IDs, and `gameKey` values unchanged. The new projection is additive and does not rewrite the legacy `system` field.
2. Introduce an Arcade-owned version-1 identity registry outside the checkout, with opaque `sourceId` and `catalogueId` values minted once and persisted atomically. A private entry maps to the exact existing `(collectionId, gameId)` plus confined target identity and provenance. Public IDs must not be constructed by concatenating collection names or hashing native paths. They are public references, not secrets or approval tokens.
3. Before publishing a source, validate ID uniqueness and record a one-to-one mapping. Freeze any loader-generated ID into managed metadata, or into a versioned Arcade-owned sidecar for read-only sources, without renaming media or writing into a read-only source. Make the loader consume the pinned identity. Ambiguous IDs, case-folded path collisions, or inconsistent source mappings become review failures rather than last-record-wins entries.
4. Automatic path relocation is permitted only within an already approved source and with an unambiguous managed identity update. Moving the source root requires an explicit Arcade/Host reattachment to the retained source identity. An external rename or replacement without reliable continuity remains missing/review-required; a matching title or public ID never adopts a new target automatically.
5. Validate existing bindings against that mapping without changing their keys or emulator/profile pins. New bindings follow Arcade's entry policy; a legacy binding is reusable only when its policy is equivalent. Keep separate bindings when legacy explicit choices differ. Conversion of old pins to entry policy is a later explicit, versioned migration, not part of discovery.
6. The first implementation must define versioned registry/sidecar persistence and use the ordered migration runner before writing anything. Its dry run lists fixed step IDs and counts only. Back up affected metadata/configuration, prepare and validate new files, then commit with recoverable state and atomic replacements. Interruption must leave old readers usable and never publish half-mapped entries. Reruns retain every minted ID.
7. Rollback restores only files/revisions owned by that migration after checking that they have not changed since the migration. Preserve subsequent user edits and require conflict handling instead of overwriting them. Keep the identity registry while any new bindings depend on it; disabling the picker is not permission to delete bindings or sidecars. Older binaries must either preserve additive fields/files or be prevented from writing an incompatible schema; verify this before enabling the feature.

The initial source scope is the configured, managed Spectrum collection. Incoming, language-review, hidden, and trash records are excluded from the picker. Read-only source publication follows only after its identity sidecar is proven. Search can initially expose one configured source, but launch and binding must resolve that explicit source correctly even if the Arcade UI subsequently selects another collection.

## Spectrum field mapping

| Existing Spectrum data | New public projection / internal treatment |
| --- | --- |
| Configured collection `id`; `Game.id` | Retained internal aliases for the registry's opaque `sourceId` / `catalogueId`; never recomputed on rename |
| `title` | Bounded `title`; no path or filename fallback in the public projection |
| `title_key`, `sort_title` | Internal search/sort aids; v1 ordering follows the normalized public title contract |
| Adapter identity | `platformId: "zx-spectrum"`, `platformLabel: "ZX Spectrum"`; derive from the declared source adapter, not emulator names or title guesses |
| `system`, `memory`, parsed hardware | `hardwareLabel`, such as `48K`, `128K`, `48K-128K`, or `+3`; retain the original values for launch/profile/POK compatibility |
| Conflicting system/memory or an inferred loader default | Preserve provenance. Show only supported hardware claims; use empty/unknown where evidence is absent, or `review-required` if conflict affects safe launch. Do not turn the scan loader's default `48K` into verified metadata. |
| `version`, `demo`, development status, languages, countries, hardware enhancements | Compose bounded `editionLabel` from reviewed facts; retain meaningful translations/enhancements/releases separately. Keep raw TOSEC data internal. |
| `year`, `publisher`, `description` | Bounded optional presentation; description is detail-only |
| `languages`, `countries` | Detail lists; preserve lowercase language and uppercase country conventions; `(EN)` is not English |
| `tags`, genre/category metadata | Optional bounded `suggestedTags`; copying requires Portal's explicit choice |
| `extension`, `media_type`, `media_label`, `path` | Private `media-file` descriptor with confined target and format; expose only `targetKind` |
| `screenshot`, `loading_screen`, scraper references | Private asset provenance/resolution; expose only entry-owned `artworkRef` |
| `default_emulator`, `emulator_profile`, managed profile configuration | Private Arcade launch policy; IDs/paths are excluded from picker data |
| Explicit metadata `poks`; title/memory POK fallback | Remain Arcade-owned and retain existing precedence; POKs are not independently published game entries |
| `favourite`, recent-history state | Keep existing references and semantics; do not create Portal cards implicitly |
| File, emulator, source, and profile checks | Sanitized `availability`; final resolution is repeated at binding and launch |

Do not invent a generic multisystem meaning for the legacy `Game.system` field. For Spectrum it currently often means memory/hardware, and `{system}` is used in emulator argument templates. The projection separates these concepts without changing those template values.

## Representative synthetic cases

Use synthetic fixtures; no live paths, native bindings, media, or provider credentials belong in the repository. The IDs below are illustrative legacy aliases, not proposed public IDs.

| Fixture | Expected identity and behaviour |
| --- | --- |
| `elite_48`, title Elite, verified 48K, one tape | One Spectrum entry with hardware `48K`; launches only this target |
| `elite_128`, same title, distinct verified 128K tape | Separate entry/key from `elite_48`; never collapsed by title |
| `combined_48_128`, one reviewed combined release | One `48K-128K` entry; no invented second target |
| `translated_es`, Spanish translation of a known game | Separate edition; language `es` is not country `ES` |
| `enhanced_ula`, reviewed ULAPlus release | Retain enhancement and exact profile compatibility; separate from the base release |
| `linked_pok`, explicit POK link plus fallback candidates | Explicit linkage takes precedence; rename preserves game ID and linkage; title/memory edits retain existing tested rematching behaviour |
| `renamed_tape`, managed filename change | Same registry ID and `gameKey`; new file reference remains confined |
| `scanned_unpinned`, ID derived from absolute path | Cannot publish until the identity is pinned; relocation never recomputes the public ID |
| Same legacy game ID in two configured collections | Distinct source-scoped identities; active-collection changes cannot launch the other record |
| Duplicate legacy IDs inside one source | Review failure; no silent overwrite or binding |
| Same title with a changed/replaced unapproved target | Missing/review state until explicitly reconciled; no inferred substitution |
| Missing pinned emulator/profile on a legacy binding | Existing key and pin remain; actionable unavailable state, no first-emulator fallback |

Default duplicate policy for this slice is **retain all existing distinct records**. Duplicate detection can identify candidates for Arcade review, but there is no automatic merge, deletion, edition folding, or ID reassignment. A later same-release policy needs separate review/apply and migration coverage.

## Acceptance gates

### A — identity and compatibility

- Run the mapping on metadata-backed, report-derived, scanned, and read-only synthetic sources; demonstrate pinning, deterministic reruns, collision rejection, and no source-path leakage in public IDs or responses.
- Preserve all legacy IDs, favourites, recent references, metadata, POK links, existing keys, and profile pins across migrate/reload/rollback. Unsupported newer registry schemas fail safely without rewriting them.
- Inject failures before and after every persistence step. Recovery must either retain the old usable state or finish the verified new state; no partially published identities. Rollback with subsequent edits reports conflicts and preserves those edits.
- Demonstrate source relocation with explicit approval and rejection of ambiguous external replacement. Source A and B containing the same legacy ID never cross-resolve.
- Exercise new Portal with old Relay/Host/Arcade and old Portal with new components. The optional picker stays unavailable when unsupported; old single-game delivery and actions remain functional. Verify old writers preserve new persistence or are explicitly blocked.

### B — catalogue transport

- Test title search, platform filters, empty results, stable ordering, exact page boundaries, byte-limited short pages, and invalid types/fields/limits. Concurrent metadata changes or service restart invalidate cursors without skipped/duplicated results being presented as a coherent page sequence.
- Reject wrong roles, forged role context, stale/cross-tab sessions, navigation, tampered cursors/artwork references, oversized strings/batches, and unsupported target/protocol versions independently at Relay and Host.
- Verify every public field by allowlist; seed fixtures with sentinel paths, filenames, profile IDs, commands, credentials, and raw errors and assert their absence from projection, transport errors, extension state, diagnostics, and receipts.
- Prove catalogue requests do not change Arcade's active source, selection, favourites, recent history, or metadata and do not trigger scraping.
- Use a 12,933-entry synthetic library to demonstrate fixed response/page limits and no full-record serialization on each request. Measure response bytes, first/subsequent page latency, and peak allocation. Keep the live health-audit baseline separate until a non-mutating real-library measurement is authorized for that validation step.
- Test artwork decoding/dimensions/bytes, ownership and revision, corrupt/missing assets, denied optional network, provider/redirect allowlists, and safe icon fallback.

### C — binding and exact launch

- A valid selection binds in request order; stale/missing/unsupported entries fail individually. Envelope validation is all-or-nothing before mutation. A failed atomic write produces no new approvals and no false success.
- Test identical concurrent retries, changed-payload conflicts, response loss, timeout reconciliation, receipt exhaustion/expiry, native restart, and stale-session rejection. New confirmation can reuse an equivalent existing binding without growing keys on each attempt.
- Enforce the aggregate 512-binding limit. Test reuse at capacity, partial capacity results in deterministic order, Forget followed by delayed retry, and several Portal cards sharing one key.
- Show that changing the Arcade UI's active collection cannot change the bound target or prevent resolving an otherwise available registered source. Unknown sources never fall back to the first collection.
- Changing a new binding's approved Arcade emulator/profile policy updates subsequent launch without editing the Portal card; old pinned bindings remain pinned. Changed native targets still require approval. Missing configuration yields an actionable error.
- Assert one launch request contains one key; reject arrays and batch payloads. Validate resolved paths, symlink confinement, adapter, executable, arguments, and POK/profile compatibility before execution. Mock process creation in automated tests; do not start live emulators.
- Preserve EightyOne and Spectaculator behaviour, including running-instance choices and the persistent Host lifetime. Any later live emulator matrix requires explicit authorization and the documented closed-emulator preconditions.

### D — first Portal picker

- From an unlocked board column, keyboard users can search, distinguish 48K/128K/editions, select one or several entries, and confirm. Labels explain unavailable entries without exposing implementation details or native paths.
- Opening, searching, selecting, and cancelling before confirmation leave Portal data and Host approvals unchanged. Selecting a different search does not accidentally lose or duplicate the bounded selection.
- Insert successful entries once, in selection order, with one Undo snapshot and one authoritative save; mixed binding failures remain visible. Do not copy suggested tags without an explicit choice.
- Test destination deletion/locking, read-only recovery, stale authoritative revisions, save failure/response loss, double confirmation, cancellation during binding, reconnect, and retry. No success toast for a failed save and no silent destination substitution.
- Undo/Redo affects Portal cards without revoking shared Host bindings. Export/import keeps cards portable and safely unbound on another device; no catalogue pages or native data enter persisted state.
- Launch exactly the chosen Spectrum entry and retain existing edit, duplicate, rebind, reveal, status, and open-in-Arcade actions. Mixed selection, Sets, browser sessions, folder/open-all, and URL tools must not batch-launch games.

### E — expansion and retirement

- Extend the proven picker to folders/subfolders, Essentials, and available Speed Dial slots with capacity, lock, placement, and Undo coverage before enabling each destination.
- Add Arcade batch Inbox publication behind its separate capability. Test queue limits, per-entry results, stable delivery IDs, partial failure, Portal closed/open, acknowledgement loss, Relay restart, deduplication retention expiry, and rejection of Portal destination fields.
- Preserve the working Spectrum library while introducing the common import manifest and next adapters. Atari ST/STe/Falcon and ScummVM come next; additional target kinds cannot pass through v1's media-file allowlist accidentally.
- Retire Arcade launcher-oriented UI only after the picker, all intended placements, exact launch, batch delivery, and replacement administration workflows pass automated and direct-file Firefox checks.

## Implementation order and validation ownership

| Order | Work | Owner / completion evidence |
| --- | --- | --- |
| 1 | Versioned identity mapping, private Spectrum adapter, sanitized projection, source-scoped reads | Arcade; gates A and catalogue unit cases from B |
| 2 | Fixed native projection routes, entry-policy binding persistence, exact-source launch resolution | Host with Arcade; gates A/C and native redaction checks |
| 3 | Optional negotiation, role-bound catalogue/artwork/binding routes | Relay with all participants; gate B and mixed-version integration |
| 4 | Column Add Game picker and authoritative insertion | Portal; gate D plus cross-component A–C |
| 5 | Other placements, batch publication, then adapters/workshop UI | Owning components; gate E |

The dependency order is not permission to expose an incomplete capability. Keep runtime advertisements disabled until the complete slice passes. Run affected component tests and the root coordinated validator for each implemented boundary change, with Relay lint and Host tests where required. Product implementation releases get their own component version/changelog updates. The original documentation milestone changed no runtime advertisement; the core implementation status is recorded below.

## Implemented foundation — Arcade 0.2.3

This section records the original core milestone. The following 0.2.4 section supersedes its outstanding native lifecycle work; its core-only performance measurement remains distinct.

The internal `IdentityRegistry`, `SpectrumSource`, and `CatalogueService` classes implement explicit preparation and indexed reads. They are not imported by existing dispatchers, advertised in protocols, or started automatically. Constructing a service does not index a collection or write runtime data. Only explicit `initialize(dry_run=False)` and source `prepare(dry_run=False)` calls write the private registry; these calls have been exercised on synthetic temporary data only.

### Private registry schema and persistence

The intended runtime filename is `catalogue-identities.json` beneath Arcade's external runtime data directory. The caller supplies that fixed native location when integrating the service; the core refuses a location inside the source checkout. The schema is:

```text
schemaVersion: 1
revision: non-negative integer
sources: map of retained legacy collection ID -> {
  sourceId: opaque minted UUID-based ID,
  root: canonical native source root (private),
  entries: map of retained legacy game ID -> {
    catalogueId: opaque minted UUID-based ID,
    relativePath: confined source-relative media reference (private),
    signature: [device, inode/file identity, size, modification time in nanoseconds]
  }
}
```

The reader rejects unknown/newer schemas, duplicate JSON keys and public IDs, conflicting case-folded paths, wrong types, corrupt data, and oversized files. Limits are 64 sources, 100,000 retained entries, a 32 MiB read ceiling, and a conservative 16 MiB compact-JSON write budget allowing for on-disk formatting. It never resets unreadable data to an empty registry. A signature detects observed replacement or modification; it is not a cryptographic content identity or approval for an executable.

Initialization uses the repository's ordered `arcade-catalogue-identity` 0→1 migration and a content-free `.migration.json` receipt. Dry run creates no directory, lock, receipt, or IDs on disk. A failed initial write can be retried; a missing registry with a completed migration receipt is a recovery error, never permission to mint replacements. A completed registry survives a missing/failed receipt and is validated before any receipt is retried.

Preparation locks the native registry across threads/processes and checks `expected_revision`. It writes one validated replacement atomically, increments the revision only for a change, and retains removed aliases to prevent ID reuse. Invalid sources/collisions/stale revisions do not write. A failed replacement leaves the old registry usable. Identical reruns retain IDs and do not rewrite the file. This stage writes no legacy metadata, favourites, recent history, profiles, or Host bindings, so disabling it requires no rollback of those files; retain the additive registry. Backed-up multi-file legacy migration and source-root reattachment remain required before activating the full migration.

### Implemented source and query scope

- Managed `collection-metadata.json` records with status `Main` are the only initial source. Existing IDs are retained; a missing metadata ID uses the exact legacy relative-path hash input and is pinned privately. Report-derived and arbitrary scanned-source integration remains deferred. The new adapter consumes pins; existing legacy loaders are unchanged.
- Preparation requires confined supported media. A later missing file becomes `media-missing`; a changed signature, unreviewed move, conflicting hardware, or malformed presentation becomes `review-required`. An explicit internal `allow_managed_moves=True` preparation can update a retained ID's relative path only when its media signature is unchanged. Wiring that call into the recoverable metadata rename transaction is still required; automatic reads never approve a move or replacement.
- Source snapshots use the source object's explicit root and collection ID. There is no active-collection lookup, source fallback, scrape, launch, or metadata write. Native resolution rechecks current metadata, the exact source, ID, target confinement, and file signature before returning a target to the future Host adapter.
- `refresh()` atomically rebuilds the allowlisted index. Search/detail read that snapshot, copy only returned projections, and do not serialize the full library per page. Identical refreshes retain revisions; changed entry metadata, media signatures, policy IDs, or eligibility invalidate cursors. Failed refresh makes the service unavailable instead of serving the old snapshot as current. Automatic lifecycle/file-change invalidation remains an integration gate; current reads do not claim to watch the filesystem.
- Title-only token search, exact Spectrum platform filtering, default 50/max 100 results, 256 KiB pages, and five-minute integrity-protected cursors are implemented. Cursors bind normalized filters/query/page size, index revision, and service generation. Entry revision digests are keyed so native path/profile guesses cannot be checked against a public hash.
- Artwork references remain empty and valid entries report `configuration-required`: the Host policy/readiness and bounded artwork adapters are not yet connected. Existing legacy game actions and their readiness remain unchanged.

The next work is native lifecycle integration and Host policy/binding operations, alongside the remaining source preparation/recovery gates. This foundation does not complete acceptance gate A or make the Portal picker ready to enable.

### Synthetic validation baseline

On 2026-09-06, the 12,933-entry synthetic index returned 100-entry pages of 39,925 bytes. First and subsequent page reads each measured approximately 4.6 ms with `tracemalloc` enabled, with 96,183 bytes peak allocation during the two reads. This measures reads after index construction, not source loading, total index memory, a cold native startup, or the live library. Timing is machine-dependent; the tests enforce bounded payloads and read allocation rather than a timing threshold. Thirty-six catalogue tests cover the foundation's persistence, projection, source, and cursor behaviour.

## Implemented native lifecycle — Arcade 0.2.4

`CatalogueLifecycle` is the native owner of prepared-source writes and freshness. Arcade loads it lazily when private preparation/recovery artifacts exist. Native maintenance helpers `prepare_catalogue_source`, `reattach_catalogue_source`, and `recover_catalogue_transaction` default to dry run and are deliberately absent from the API dispatchers. `get_catalogue_service()` returns the internally refreshed service only after preparation. Module import, ordinary startup on an unprepared runtime, and catalogue search never prepare a source.

### Preparation and compatibility

Preparation accepts one exact configured writable collection backed by existing managed metadata. It validates confined supported media, IDs, and collisions before committing. The private registry retains schema 1 and its ordered 0→1 initialization. Managed collection metadata retains its existing schema: preparation fills only missing/empty `id` fields with the legacy loader's exact hash of the original relative filename, including its separators. Existing IDs and all other fields remain intact. This additive pinning makes existing loader, rename, favourites, recent history, and explicit POK references agree; preparation does not rewrite state, profile files, or Host bindings.

Preparation also writes private schema-1 `catalogue-proofs.json`: `{schemaVersion: 1, sources: {legacyCollectionId: {legacyGameId: sha256}}}`. Hashing streams supported media with a 64 MiB per-file ceiling and checks the native signature before/after reading. Proofs use the registry's bounded source/entry/file budgets. Unchanged native signatures permit proof reuse during ordinary metadata saves; explicit reattachment always reads and verifies content. These proofs are private content checks, never launch approvals or portable identifiers. Missing/corrupt prepared data fails closed instead of silently reminting identities.

Identical preparation reruns do not write. Dry run validates without creating locks, registry, proofs, journal, or receipts. Preparation remains limited to writable managed Spectrum collections; scanned/report-only and read-only source workflows still need their own reviewed preparation design.

### Transactions and recovery

The fixed private runtime file `catalogue-transaction.json` retains the latest bounded transaction. Schema 1 records an opaque transaction ID, fixed operation (`prepare`, `metadata`, or `reattach`), exact private collection/root, status, before/after images for fixed document kinds, and confined media moves with content proofs. Its read ceiling is 160 MiB and compact write budget 80 MiB. It is recovery data containing private metadata/configuration, not a sanitized migration receipt or Nexus diagnostic; it must never enter page responses, shared exports, or logs.

Prepared rename, bulk metadata rename/Undo, delete, import, and restore hold a native writer lease across the operation. Before each move, a `staged` journal preserves the unchanged document images and move intent. A process interruption at that stage rolls the verified files back. Once the candidate metadata and identity updates are ready, an atomic `pending` journal replaces the staged intent and precedes document writes. Successful application marks it `committed`. Ordinary errors cooperate with the existing mutation rollback. Permanent purge retains the existing explicit destructive-delete workflow; the catalogue retains removed aliases and drops purged rows from its projection.

On the next native configuration/metadata/catalogue read, pending recovery finishes the recorded transaction before exposing data. Explicit native recovery can preview or roll back a pending transaction instead. Recovery preflights all document images and media proofs; subsequent external edits or ambiguous targets cause a conflict and remain untouched. Staged intent always rolls back because no new metadata was committed. Interrupted recovery is idempotent. Completed/rolled-back journals are retained for diagnosis but do not provide arbitrary historical Undo; normal Arcade metadata Undo remains separate.

### Root reattachment and freshness

Explicit root reattachment requires an existing prepared source, preserved metadata IDs, and verified media content at the selected root. It refuses unknown entries, absent retained metadata records, missing media, or different content; partial/purged collections may therefore require a later reconciliation workflow. The config root, private registry root/signatures, and proofs are committed/recovered together. Source and catalogue IDs remain unchanged. Changing Arcade's active collection does not change source-scoped catalogue resolution, and selecting another root never implicitly approves different games.

Native metadata/config saves and library rebuilds invalidate the index. Before every search, detail, or internal target resolution, the lifecycle samples configured source/metadata/media files and configured emulator/profile references. An observed change triggers an atomic refresh and changes opaque revisions, so old cursors and selected entry revisions cannot be reused. Missing/corrupt sources make reads unavailable; unknown externally added Main entries require explicit preparation. No background watcher, query-selected filesystem path, or automatic source switch is introduced. Sampling signatures is change detection, not protection against a hostile native writer deliberately preserving filesystem metadata.

The per-read filesystem sampling is proportional to the retained catalogue size and is excluded from the 0.2.3 core-only benchmark. Cold source loading, lifecycle latency, artwork, Host policy readiness, old-writer compatibility, fixed Host operations, Relay role enforcement, and the Portal picker remain activation gates. The native lifecycle has been exercised only against temporary synthetic collections; the capability remains unadvertised.

## Implemented Host bindings — Host 0.2.1 and Arcade 0.2.5

The private `CatalogueBindings` service implements selected-entry approval and retry persistence. Arcade's `catalogue_launch.py` supplies exact-source launch decisions; Host validates their native effects independently. The existing single-key launch/status/Forget paths recognize the new representation. At this implementation milestone, reserved catalogue registration/read/bind messages still rejected requests. The subsequent staged transport is documented below; no protocol or capability advertisement has been enabled.

### Binding persistence and compatibility

New bindings live in fixed `catalogue-bindings.json` beside Host's configured external `config.json`. Legacy `approvedGames` records retain their original representation, keys, emulator/profile pins, and active-library requirement. They are never merged into entry-policy bindings. Host configuration updates use atomic replacement, and legacy/new binding writes share a reentrant thread/native writer lease with the aggregate 512-key ceiling. Missing/corrupt new persistence cannot silently create replacement approvals; a valid legacy binding remains on its legacy resolver.

The new file has schema 1, a monotonic integer `revision`, a `bindings` map, and a `receipts` map. Its complete compact-JSON budget is 4 MiB. Each binding stores only private approval semantics:

```text
gameKey -> {
  mode: entry-policy-v1,
  sourceId, catalogueId,
  mediaSha256,
  executable, executableSignature,
  adapterId, cwd, profileTarget
}
```

These native targets never enter Portal cards or public catalogue responses. Equivalent approvals reuse a key; a changed executable/signature, adapter, working directory, media proof, or profile-copy destination requires explicit fresh approval. Verified Arcade renames and source reattachment may change media paths while retaining source/entry IDs and the approved content proof. Current arguments and profile selection remain Arcade policy; they are revalidated on each launch. Existing pinned bindings never acquire those moving-policy semantics.

Initialization uses the ordered `host-catalogue-bindings` 0→1 migration and a separate content-free `.migration.json` receipt. Dry run creates no runtime artifact. An interrupted bootstrap is retryable, and an existing valid store is never replaced with an empty one. A missing store with a completed initialization receipt is a recovery failure. A batch stages all results/approvals in memory and writes bindings plus request receipts in one atomic replacement. An interruption leaves either the prior state or the complete committed state. A returned success therefore follows persistence; a lost response is reconciled using the same request/session while its lease remains valid.

### Native session and retry rules

Registration is an internal integration hook that mints an in-memory session object for the Portal role and protocol 1. Binding requires that exact registered object; copied/forged objects, wrong roles, expired/disconnected sessions, and previous-process sessions fail. The staged transport below calls this hook only after authenticating the exact page/session and revokes it on disconnect; no page-supplied context can register itself.

The lease expires within 30 minutes under monotonic and wall-clock ceilings. Each persisted receipt group has its session ID, `expiresAt`, and up to 64 requests. A request stores only its UUID, ordered-payload digest, and ordered `{catalogueId, key, code}` results. No titles, query text, targets, arguments, or raw errors enter receipts. All receipt groups together are limited to 1 MiB and 64 retained sessions. Unexpired groups belonging to another native connection are retained; exhausting the budget returns `busy`, without evicting retry protection. Expiry checks invalidate mutation authority before a group becomes eligible for removal.

Envelope validation precedes initialization/mutation. Batches contain 1–100 distinct selections within 32 KiB; results preserve order and stay below 256 KiB without inline artwork or implicit suggested tags. Successful selections are revalidated immediately before commit; a stale/failed selection receives its own fixed error without discarding other successes. Changed payloads for a retained request UUID return `request-conflict`. Identical concurrent retries serialize and return the retained keys. Forget atomically removes approval and marks retained outcomes `binding-forgotten`; a delayed retry cannot restore it. Host restart retains approvals and receipts but grants no authority to replay an old session.

### Exact-source launch decisions and Host effects

Arcade resolves the selected catalogue ID through the prepared source and current revision without constructing the active library or selecting another collection. It uses the entry's explicit emulator or that source's explicit collection default; it never chooses the first available emulator. Missing emulator/profile pins fail instead of falling through to a different configuration. Existing profile rules remain Arcade-owned.

The private schema-1 decision is limited to 64 KiB and contains exact source/game identities, confined media, signatures/proof, the selected emulator/adapter, bounded template and rendered argument arrays, working directory, optional managed profile copy, and allowlisted presentation. Host verifies schema/fields, supported media/adapter, real-path confinement, media content, file signatures, template/rendered-argument agreement, profile source confinement/size, and approved destination. It repeats validation before side effects and starts processes with an argument array and `shell=False` through the persistent native connection. Arcade's existing launch service retains recent-history and running-emulator behaviour while accepting Host-guarded process/copy callbacks.

The initial path supports configured generic/Spectaculator media launches and EightyOne managed profile copies (at most 1 MiB, `.ini`/`.cfg` destinations outside the checkout and collection). Default-application association and non-EightyOne managed profiles are unsupported in this new path. Running-emulator choices return `configuration-required` so the user can make the existing explicit choice in Arcade; Portal does not acquire a hidden current/new-instance override. Legacy launch/profile behaviour is unchanged.

At this milestone, the raw Arcade projection still reported `configuration-required` pending Host read readiness. The subsequent transport adds that readiness check. Artwork, the preparation/picker interfaces, new-policy rebind/source-aware open-in-Arcade UX, and the remaining rollout gates are outstanding. The legacy page link cannot select a different source, so new bindings refuse that link when the source differs rather than opening a same-ID game from the active source. All implementation tests use synthetic collections and mocked process creation; no live emulator matrix has run.

## Implemented staged transport — Relay 1.1.2 and Host 0.2.2

The reserved Portal search/detail/artwork/bind messages now have fixed staged routes. They remain dormant: Relay requires exact v1 advertisements from itself and the registered Portal client, while Host independently requires its own and the configured Arcade service manifest's exact v1. Current manifests and runtime advertisements omit the optional protocol. No compatibility protocol, portable schema, or existing single-key action changes.

Pages send only `{protocol: 1, payload}` through the existing authenticated page envelope. Relay rejects additional context, checks the top-level frame, registered role/tab/URL/token and current browser tab URL before dispatch and again before returning a result, and rotates tokens when a catalogue-capable page registers anew. It opens a dedicated persistent native connection for that registration. The fixed native `ARCADE_CATALOGUE_OPEN_SESSION` accepts exactly `{type, protocol, role: "portal", pageUrl, tabId}`. Host independently checks the real canonical `Portal/index.html` in its checkout, rejecting other pages, localhost HTTP pages, query/fragment variants, wrong roles, and malformed context. This connection does not expose legacy Host operations.

Host returns `{ok: true, schemaVersion: 1, sessionId}` only to Relay. Subsequent native messages accept exactly `{type, protocol: 1, sessionId, payload}`; neither the handle nor the native registration envelope reaches the page. One connection owns one in-memory Portal lease. Unknown, copied-from-another-connection, revoked, expired, and previous-process handles fail. Relay retains at most 64 connections, two outstanding reads and one mutation per session. Identical in-flight retries share that mutation's outcome (at most 64 waiting duplicate callers); a changed selection under its request UUID returns `request-conflict`. Binding digests use declared field order, so JSON object-key order does not change a retry. Reads expire after 15 seconds and binds after 30 seconds, including queue/registration time. Native dispatch on each connection is serialized; there is no fallback to one-shot native messages.

Navigation, reload, replacement registration, timeout, or native disconnect closes that catalogue connection, discards queued requests and late responses, and preserves unrelated shared native traffic. Host's dedicated stdin reader observes EOF while a request is resolving and revokes the binding session before a pending commit can acquire its final session lease. A commit already holding that lease remains atomic; a lost result is never reported as a rollback. Closing a session does not delete committed approvals or unexpired retry receipts. Reconnection creates a fresh handle and cannot authorize replay of the old session.

Host delegates query/identity semantics to Arcade and validates fixed public fields and bounds independently. Search/detail readiness resolves the exact Arcade plan and applies Host native validation without profile copies, process creation, active-source changes, or binding persistence. Only successful validation produces `ready`; unsupported, missing, and configuration failures stay sanitized. A revision change during readiness invalidates the response. Relay validates the public result again, including ordered binding outcomes and compact game fields, before sending it to Portal. Successful responses include `ok: true` plus the operation envelope; errors contain only `{ok: false, code}`.

At this transport milestone artwork was incomplete and readiness repeated source sampling per result. The following milestone implements local PNG artwork and checked read leases. Publication remains absent; live Firefox/Zen and full-source activation checks remain outstanding.

## Implemented local artwork and read leases — Arcade 0.2.6, Host 0.2.3, Relay 1.1.3

### Exact-entry local artwork

Arcade selects only the exact metadata row's existing confined `loading_screen` or `screenshot` PNG, in that order. It never searches other titles/editions, switches the active source, or fetches a URL. Missing, remote, escaped, oversized, or unsupported targets have no artwork reference. Existing local files receive an opaque keyed reference bound to catalogue identity, entry revision, source-relative association, and file signature. Metadata or observed file changes invalidate the reference. An artwork failure does not change otherwise valid launch readiness.

The private resolver returns only `{catalogueId, artworkRef, entryRevision, root, path, signature}` to Host. Host independently validates fields, canonical paths, root confinement, suffix, and file signature, bounds the read, and rechecks the descriptor/file after normalization. Paths and source bytes never cross to Relay. Success is exactly `{ok: true, schemaVersion: 1, catalogueId, artworkRef, contentType: "image/png", width, height, data}`, with `data` containing canonical base64 of the new PNG. The full response stays within 192 KiB and decoded binary within 128 KiB. Existing fixed errors drive the future picker's icon fallback.

The dependency-free decoder implements a bounded subset of the [PNG specification](https://www.w3.org/TR/png-3/): static, noninterlaced, 8-bit grayscale/truecolor/alpha and 1/2/4/8-bit indexed images. Input is at most 4 MiB, 2,048 pixels per edge, one megapixel, and 4,096 chunks. It verifies chunk order/CRCs, palette indices, transparency, zlib completion, exact decompressed size, and all five filters. Ancillary data is discarded without decompressing embedded text/profiles. Animation, interlacing, 16-bit data, JPEG/WebP, and other formats use the fallback. Remote acquisition remains absent; a future format/provider extension requires separate decoder and network-policy coverage.

Host reconstructs pixels, uses nearest-neighbour resizing suitable for Spectrum artwork, and emits only fresh `IHDR`, `IDAT`, and `IEND` chunks containing 8-bit RGBA/filter-zero rows. Each edge is at most 256 pixels; incompressible output is reduced further to meet 128 KiB. Relay independently checks the envelope/reference, canonical PNG shape, CRCs, dimensions, and bounded `DecompressionStream` output before returning it to the page. Navigation/session/deadline checks still apply after decompression. No catalogue image is retained in extension storage, intake, diagnostics, or native runtime caches.

### Checked native reads and measured scope

Readiness and artwork run within Arcade's private `catalogue_read_snapshot()` lease. The collection job lock and native identity-writer lease exclude cooperating mutations. Source, metadata, media, artwork, profile, and executable signatures are sampled before and after the read; an observed external change invalidates the entire response. Configuration, identities, proofs, metadata rows, and row lookup indexes are memoized only within this read context, then discarded on success, error, or cancellation. Selected media/executable/profile checks still run in Host. Binding, launch, and their final approval/effect validation do not use the read cache.

The synthetic benchmark is reproducible with `python -B Host/tools/benchmark_catalogue.py --entries 12933 --baseline`. It creates and owns temporary runtime/source files outside the checkout, substitutes synthetic media and a non-executable emulator fixture, and never reads live configuration or launches anything. A native-only run on 2026-09-06 measured:

| Operation | Elapsed | Full source checks | Outcome |
| --- | ---: | ---: | --- |
| Explicit fixture preparation | 12.935 s | — | Prepared 12,933 identities |
| Cold index + 100-entry readiness page | 12.041 s | 2 | 100 ready; 42,643-byte JSON response |
| Warm 100-entry readiness page | 7.149 s | 2 | 100 ready; 42,643-byte JSON response |
| Prior repeated-read path, same fixture | 16.787 s | 5 before deadline | `timeout` |

These measurements include native lifecycle and Host readiness checks, but exclude Firefox/Relay IPC, realistic media sizes, live artwork, slow disks, and process startup. Whole-source sampling remains proportional to catalogue size. This is evidence of the repeated-work fix, not completion of the live-library performance gate; the earlier core-only benchmark remains a separate measurement.

Keep protocol advertisements disabled until reviewed source preparation, the Portal picker, direct-file browser acceptance, older-writer compatibility, and the remaining Spectrum gates pass. No live source was prepared during this milestone.

## Implemented reviewed preparation — Arcade 0.2.7

The Arcade collection sidebar now offers **Prepare Catalogue...** for an available writable collection. The dialog captures that collection's identity, previews verified media, new/retained catalogue identities and missing legacy metadata IDs, then requires explicit confirmation. It explains that Portal catalogue access remains gated. Opening or cancelling the dialog does not prepare a source. Existing IDs and unrelated metadata, favourites and recent history retain their semantics.

Two fixed POST routes use the existing authenticated Arcade `MW_EMUGUI_RPC` / `EMUGUI_API` transport:

| Route | Exact body | Result |
| --- | --- | --- |
| `/api/catalogue-preparation/preview` | `{ collection_id }` | `ok`, `status: "preview"`, `entries`, `newEntries`, `retainedEntries`, `pinnedIds`, `initializationRequired`, `reviewToken`, `expiresInSeconds: 300` |
| `/api/catalogue-preparation/confirm` | `{ collection_id, review_token }` | `ok`, `status: "committed"` or `"unchanged"`, `entries` |

These routes do not admit roots, paths, policy, role or method fields. Portal cannot use the Arcade RPC role. The raw native maintenance helpers remain absent from dispatchers; recovery and reattachment have no page route yet. This does not introduce an optional catalogue advertisement or relax the four-participant picker gate.

Preview performs no filesystem writes, including lock/receipt creation. It validates existing managed metadata and confined Spectrum media. The native lifecycle retains at most 16 opaque confirmations in memory for five minutes; Host restart loses them. Tokens are source-bound and consumed before an apply attempt, including a failed attempt. Responses contain counts and opaque tokens, not paths, proofs, planned IDs or raw metadata. Review tokens are not persisted in page storage or validation receipts.

Confirmation holds the lifecycle and native writer locks before loading inputs. It replans and compares a private digest of configuration, original metadata, retained identities, proofs, planned media paths/signatures, moves, verified counts and observed file stamps. Fresh UUIDs are excluded from that comparison. File stamps are checked before and after planning; changed inputs reject confirmation before initialization or journal writes. Pending recovery blocks preview/confirmation without silently selecting a recovery direction. As elsewhere, filesystem signatures detect ordinary external changes; they do not defend against a hostile native writer deliberately preserving metadata.

Success uses the existing recoverable preparation transaction. Missing legacy IDs are pinned with the exact existing filename hash; new public identities remain native-only. Repeat review after success reports retained identities, and unchanged confirmation writes no data documents. An interrupted/failed UI request discards its token and directs the user to review current state; it never automatically replays a mutation. The dialog disables duplicate submissions and dismissal while a request runs, traps keyboard focus and restores focus on close.

Acceptance uses temporary synthetic collections and executable dialog-controller tests. The in-app browser was unavailable, so visual/direct-file Firefox/Zen acceptance remains pending, along with recovery/reattachment UI, scanned/read-only sources, older writers and the Portal picker. No live source was prepared or emulator launched during this milestone.

## Implemented reviewed recovery — Arcade 0.2.8

**Catalogue Recovery...** is available before a library has loaded. Startup first checks recovery status and retains the sidebar and recovery controls on failure. Ordinary Arcade API work, configuration/metadata reads and writes, catalogue reads and new managed mutations now refuse pending recovery instead of choosing a repair implicitly. In-progress journal commits and cooperating mutation rollback still use the native transaction machinery. Native maintenance helpers remain explicit operations.

Host can attach Arcade's credential callbacks while recovery blocks configuration reads. Verified legacy scraper-secret migration is deferred in that case and retried before ordinary API work after recovery. Recovery dispatchers do not run deferred migration; initial Host attachment retains its existing migration behavior for a settled runtime. The recovery response reports the persisted repair outcome independently of a later library reload or credential failure.

Three fixed POST routes use the existing authenticated Arcade RPC role:

| Route | Exact body | Response |
| --- | --- | --- |
| `/api/catalogue-recovery/status` | `{}` | `ok`, `status: "idle"`; or `ok`, `status: "recovery-required"`, `operation`, `collectionId`, bounded plain `collectionName`, `directions` |
| `/api/catalogue-recovery/preview` | `{ direction: "forward" \| "rollback" }` | `ok`, `status: "preview"`, `operation`, `collectionId`, `direction`, changed `documents` count, actual `moves` count, `reviewToken`, `expiresInSeconds: 300` |
| `/api/catalogue-recovery/confirm` | `{ review_token }` | `ok`, `status: "committed"` or `"rolled-back"` |

The page cannot select a collection, root, target, transaction ID or recovery method. Native state identifies the interrupted transaction. Pending transactions allow finish/restore; staged moves only allow restore because no committed metadata intent exists. An interrupted confirmed repair only offers its previously selected direction. Recovery requires configured writable access. Errors use fixed codes and bounded messages without exception text or native targets.

Status and preview do not write files, locks, journals or receipts. Preview preflights existing before/after document images and move-content hashes using the native recovery machinery. It captures a private digest of the exact journal, choice, current documents, configuration and file stamps, checked around preflight. At most 16 five-minute one-use reviews reside in native memory. Confirmation consumes a token, obtains the native writer lock, repeats preflight and rejects changed inputs before recording intent or repairing files. Active mutation/read leases exclude reviews and repairs.

### Durable repair intent and compatibility

Confirmation atomically writes the fixed external runtime file `catalogue-recovery.json` before any repair. This is a new private schema-1 artifact containing only `{ schemaVersion: 1, transactionId, journalDigest, direction }`; it is not a Nexus receipt or portable data. The existing transaction journal, metadata, identity and proof schemas remain unchanged. Creating intent on explicit confirmation is the additive migration; opening an older runtime creates nothing.

The intent binds the exact pending/staged journal digest. A subsequent interrupted repair or explicit native recovery uses the same direction, so a partially applied rollback cannot become a forward recovery after restart. Corrupt/mismatched intent blocks repair. Once the journal is settled, its retained intent does not authorize repair of a later transaction with a different ID. Failure to persist intent starts no repair. Completed journals are not a general Undo history.

Arcade 0.2.8 changes startup recovery behavior from the earlier native-lifecycle milestone: pending work requires review. Earlier writers do not understand the new intent file and must not share a runtime with a pending confirmed repair. Resolve the transaction with 0.2.8 or newer before any downgrade; older-writer coexistence remains an activation gate. No protocol advertisement is enabled by this addition.

Temporary-journal tests cover both recovery choices, interruption/restart, stale and competing confirmations, expiry, bounded reviews, conflicts, failed intent persistence, staged moves, read-only state, corrupt intent, lease exclusion and deferred credential migration. Executable dialog tests cover review invalidation when the choice changes, duplicate clicks, retry/error states, explicit reload, keyboard dismissal and startup blocking before library reads. Browser discovery returned no available browser; visual/direct-file acceptance remains pending. Source-reattachment UI and the Portal picker are subsequent work. No live collection was repaired or emulator launched.

## Implemented reviewed reattachment — Arcade 0.2.9

**Reconnect Collection...** lists prepared sources independently of the loaded library, including sources whose configured folders are unavailable. The user selects the original collection, chooses its relocated folder through the native picker, reviews full retained-ID/content verification and confirms the location change. Read-only sources are shown but cannot be chosen for reattachment. The page uses text rendering, invalidates selection/review on a source change, blocks duplicate confirmation and offers an explicit library reload after completion.

The fixed Arcade-only API uses the existing authenticated RPC role:

| Route | Exact body | Response |
| --- | --- | --- |
| `/api/catalogue-reattachment/sources` | `{}` | `ok`, `sources`: at most 64 `{ collectionId, name, available, writable }` records |
| `/api/pick-path` | `{ kind: "catalogue-reattachment", collection_id }` | `ok`, `selectionToken`, bounded plain `folderName`, `expiresInSeconds: 300`; or `ok`, `cancelled: true` |
| `/api/catalogue-reattachment/preview` | `{ selection_token }` | `ok`, `status: "preview"`, verified `entries`, `reviewToken`, `expiresInSeconds: 300` |
| `/api/catalogue-reattachment/confirm` | `{ review_token }` | `ok`, `status: "committed"` or `"unchanged"`, verified `entries` |

The new picker purpose admits no page path, initial directory, picker title or method. It reuses the existing extended picker timeout without adding a Relay/Host operation. Host-owned Arcade code retains the selected canonical root behind an opaque native-memory handle; only the folder's bounded display name reaches the page. Selection/preview/confirmation handles are not portable data, browser storage or Nexus receipts. Only one reattachment picker may be open per native lifecycle, and no lifecycle or native writer lock is held while the user chooses a folder.

There are at most 16 five-minute selection/review handles combined. A selection handle is consumed by preview; a review handle is consumed before confirmation. Cancellation creates no handle. Expiry, restart, failed attempts and lost replies require a fresh selection/review; mutations are never replayed automatically. Configuration changes while the picker is open or before preview reject the selection, as does replacement of the selected directory. The page cannot override the source or root associated with a handle.

Reattachment requires existing prepared identities/proofs, configured writable access, existing managed metadata with pinned retained IDs, and a complete content-hash match for retained media. It rejects missing/substituted IDs or media, unexpected new Main entries, conflicting source roots, path escapes, checkout/runtime roots and active native read/mutation leases. It does not adopt games based on titles or scan the selected folder to invent metadata. It may reconnect an explicitly chosen verified copy while the old folder still exists.

Preview writes no collection/configuration/identity/proof/journal data or lock files. Confirmation acquires the native writer lock before loading inputs, repeats full proof verification and compares a private digest of the configuration, metadata, complete reattachment plan and file stamps. Changes during verification or after review reject the confirmation. Success uses the existing config/identity/proof journal; catalogue IDs, source IDs and legacy game IDs are retained, with no changes to Host binding records. Existing device approval checks still apply to launch. An identical reconnection is a no-op. Interrupted reconnection is resolved through the reviewed recovery UI with finish/restore semantics.

The service clears stale library/metadata caches after reattachment and recovery. A confirmed reattachment updates the active native paths only when they belong to that source; other active collections keep their identity/location. Reloading the page rebuilds the library using current native configuration.

Synthetic tests exercise unavailable originals, retained IDs, content/metadata mismatches, stale inputs, directory replacement, root collisions, cancellation, bounded/expired/restarted handles, competing confirmations, interrupted reattachment and sanitized API results. Executable dialog tests cover source changes, picker cancellation, preview/confirm, duplicate submission, errors and reload. Browser discovery returned no available browser; direct-file visual/native-picker and full-size relocated-source acceptance remain pending. The Portal picker, older-writer checks and remaining rollout gates still precede activation. No live source was reattached or emulator launched.

## Implemented column game picker — Portal 0.12.5

Portal now stages **Add Game** in the context menu of a writable, unlocked regular board column. It remains hidden because `arcade-catalogue` is still unadvertised. Coordinated activation and native-stack acceptance remain separate gates; this milestone enables no protocol flags. The page uses the four existing fixed Relay catalogue routes and gains no native path, process, metadata-mutation or profile authority.

The dialog captures board, tab and column IDs when opened. Search uses 50-entry pages, query/platform filtering, a maximum of two concurrent reads, generation-based stale-response rejection and a rolling window of at most 200 results plus 100 selected entries. Exact hardware/edition variants remain separate. The selection retains its explicit order across searches. Detail and exact-entry PNG artwork are held only in the open draft; closing releases records, cursors and images. Native text is rendered as text, errors use fixed messages and invalid projection fields/envelopes are refused.

Confirmation checks authoritative storage and the exact destination before asking Host to create/reuse bindings. Suggested tags are unchecked by default; opting in reads and revalidates selected details before binding, then copies only approved entries' suggested names into Portal-owned tags. No Arcade metadata is edited. Binding results must match the complete ordered request before any cards are applied. Partial failures remain visible while successes become compact game cards with new item IDs, existing system identity and opaque keys. Catalogue IDs, revisions, receipts, descriptions and artwork are not added to Portal state.

Immediately before insertion, Portal prepares authoritative storage again and rechecks the captured board/tab/column, locks and capacity. The initial picker admits at most 100 additions and refuses to take a destination beyond 10,000 top-level items; it does not trim existing data. One Undo snapshot covers cards and any explicitly copied tags; one save uses Portal's existing coalesced authoritative persistence. A changed active board does not redirect insertion. Missing/locked/full destinations retain approved results for an explicit **Place approved games** retry into that same column, or cancellation. Once insertion has been attempted, save failure/conflict is terminal for that draft and follows existing Portal recovery; no repeated append or persisted-success claim is allowed. Closing after approval and Undo do not revoke shared Host bindings.

The bridge strips only its transport envelope before validating catalogue projections and preserves fixed catalogue error codes. Relay-ready notifications invalidate the draft's session epoch and reject pending catalogue requests instead of replaying them. Only an explicit same-session `busy` retry reuses the original UUID and ordered selection. Timeout, unavailable transport, session expiry or reconnect requires refreshed selection and fresh confirmation; the current Relay implementation closes native sessions on timeout, so cross-session replay is forbidden.

Synthetic controller/bridge/persistence tests and executable dialog tests cover paging limits, late results, stale revisions, bounded detail reads, tag opt-in, exact variants, duplicate confirmation, safe text rendering, keyboard focus/cancellation, partial failures, lost destinations, uncertain saves and the closed production capability gate. Browser discovery returned no available browser. Direct-file visual acceptance, full-size prepared collections, older-writer coexistence and remaining rollout checks still precede activation. Folder, Essentials and Speed Dial picker entry points remain subsequent work. No live collection was changed or emulator launched.

## Joined workflow verification — 2026-09-06

The [cross-component workflow suite](../../tests/migration/test_catalogue_workflow.py) now runs Portal's real picker controller, bridge, normalized state/persistence and pre-insertion storage check through the complete Relay content and background scripts into actual Python Host processes over length-prefixed native-message pipes. Host loads the real Arcade service against an isolated prepared 125-entry Spectrum collection. Browser APIs, test-process protocol advertisements and emulator process/window callbacks are fixtures; legacy active-source initialization is suppressed to test source independence. Page-wide reload is a fixture boundary that these scenarios do not invoke. The visual dialog remains covered by its separate executable DOM tests, not this transport harness.

Nine passing scenarios cover the normal workflow, a mixed fresh/stale selection after a real media change, a column locked after binding, an external database write immediately before save, reconnect with fresh selection, missing catalogue support in the content registration/Host/Arcade, and the closed production gate. Normal flow verifies 50-entry paging, distinct 48K/128K entries with the same title, retained ordered selection, exact-entry normalized PNG artwork, explicit tag copying, native approval persistence, one Portal batch write, the captured column and status after saving. Restoring the Undo snapshot removes cards without revoking Host approvals. Catalogue replies and portable cards omit native targets and session authority; catalogue records do not enter Relay storage.

One explicit game activation is routed through Portal and Relay into Host/Arcade's real resolution and launch validation. A mock replaces `Popen` and records the validated argument array in the external fixture. It resolves the selected variant's exact tape while Arcade's active source is different, with `shell: false`; no emulator process is created.

This verifies the joined automated workflow, not an installed Firefox/Zen session. Browser discovery still returned no browser. Direct-file visual/extension registration acceptance, full-size prepared-source checks, older-writer coexistence and the remaining activation criteria above remain open. Enabling later requires updating Relay's content-side Portal registration advertisement as well as the Portal, Relay background, Host and Arcade declarations; leaving that registration old correctly keeps native catalogue access unavailable. Production advertisements and live data remain unchanged.

## Column picker activation — 2026-09-06

Portal 0.12.6, Arcade 0.2.10, Host 0.2.4 and Relay 1.1.4 advertise `arcade-catalogue: 1`, including Relay's Portal and Arcade content registrations. The shared protocol registry records the existing 1 MiB outer ceiling; stricter operation limits remain unchanged. Nexus's generated component registry reflects these declarations. Legacy participants still negotiate core functionality independently, and missing catalogue support prevents native session opening.

This release enables **Add Game** only in unlocked regular Portal columns and only for explicitly prepared writable managed Spectrum collections. Scanned/report-only/read-only preparation is refused without creating artifacts; those adapters remain gated future work. Folders, Essentials, Speed Dial entry points, batch publication, additional launch adapters and Arcade UI retirement remain outside this release. These scope limits apply to the broad acceptance checklist above; unsupported adapters are tested for refusal, not claimed as implemented.

### Acceptance evidence

Binding performance needed one final correction: a 100-game confirmation on the full-size source timed out at 32.324 s with no approvals. Read-only planning now shares the checked lease across the batch, including individual initial/final native target validation. The final whole-source observation happens on lease exit, before initialization, receipts or approval writes. Cached data is discarded before persistence and never used for process/profile effects. Receipt presentation uses the same bounded read observation. A change after the last target resolution invalidates the batch without creating an approval store or migration receipt. The corrected 100-game confirmation passed in 2.970 s. This supersedes the earlier read-lease milestone's blanket exclusion of binding plan reads from caching; binding writes and launches remain outside the cache.

The final `--bind 100` benchmark also passed identical receipt replay: 100 approvals in 3.228 s and replay in 2.081 s with the same result. Installed Firefox then passed `--entries 12933 --selection 100`, saving and reloading all 100 distinct compact cards without copying tags. The two-selection scenario separately verifies explicit tag copying.

- `python -B tools/validate_game_picker_firefox.py --entries 12933` passed in installed Firefox 155.0.1. Mozilla Marionette controlled a disposable headless profile with the actual Relay extension and installed native-host registration. Firefox's local-file permission was granted through its add-on UI. Both the 125-entry and full-size fixture passed column-menu access, keyboard selection across pages, distinct 48K/128K variants, exact-entry PNG details, cancellation without binding/card writes, optional tags, two native bindings, disk save and page reload. Screenshots at 1,280 and 600 pixels were inspected; narrow-dialog content now retains its height and scrolls instead of collapsing. The final narrow layout also passed a detail-height assertion.
- The nine joined native workflow scenarios use production advertisements for normal operation and remove support only in legacy cases. They cover stale media, lost/locked destination, save conflict, reconnect, old content/Host/Arcade and the closed gate. Existing component suites cover maximum selection/result bounds, invalid envelopes, concurrent requests, timeout/retry, cancellation, recovery, portability and single-game launch with process creation mocked.
- `python -B Host/tools/benchmark_catalogue.py --entries 12933 --allocation --relocate` passed: preparation 24.054 s; cold 100-entry readiness 7.254 s; warm 1.320 s; two source observations per page; 42,643-byte responses; 100 ready entries. A separate traced warm read peaked at 48,330,761 bytes. Tracing disables only the benchmark clock deadline and is excluded from latency numbers. Preview plus explicit full-size relocation took 45.757 s, retained all 12,933 entry identities and the source ID, then returned a ready page in 6.761 s. Timings are machine-dependent, and slower-device monitoring remains open.
- `python -B tools/validate_catalogue_legacy_writers.py` passed against exact baseline `860c7ec` (pre-catalogue Arcade 0.2.2). Actual older Host configuration saves preserved the separate approval store; actual older Arcade edits preserved pinned legacy IDs and private identities/proofs. An older rename made the current entry `review-required` instead of adopting a changed target. Coexistence is supported only for settled data: older binaries do not understand pending recovery intent and must not share a runtime during an interrupted transaction or repair. Finish or restore with current Arcade before downgrading. Existing conflict tests preserve external edits and block uncertain repair.
- A non-mutating review of the configured writable live Spectrum source passed in 14.678 s with 12,927 publishable entries from the existing 12,933-row metadata. All rows passed artwork selection; its 21 distinct JPEG references correctly take the existing text fallback. The live non-launching ZX preflight passed the configured EightyOne/Spectaculator/SpecStub executables, managed profiles and 48K/128K media. No live catalogue preparation, emulator launch or binding creation was performed.

Use **Prepare Catalogue...** in Arcade to review and confirm the desired managed collection, then reload Relay and Portal and choose **Add Game** from a column's context menu. Opening an unprepared catalogue does not silently migrate live data. On Firefox 153+, enable Relay's **Access local files on your computer** permission in `about:addons` if needed.

The in-app browser was unavailable, so these browser checks used the separately installed Firefox. Zen, native folder-picker visual interaction and broader administration-dialog/browser combinations remain follow-up coverage; native preparation/recovery/reattachment behavior is covered by executable tests and the full-size native relocation above. Live emulator launches remain outside this validation.

Final coordinated validation passed **911 tests**: Portal 135, Widgets 304, Arcade 215, Relay 27, Host 163 (plus 11 subtests), Nexus 26, migration 19, packaging 14 and tooling 8. JavaScript syntax, eight shared protocol declarations, generated registry, independent versions and packaging all passed. Relay `web-ext lint` reported zero errors, warnings or notices, and the sanitized Nexus receipt was written. Acceptance-tool Python syntax, 14 activation links and `git diff --check` also passed.

## Direct library browsing — 2026-09-07

Portal 0.12.7, Arcade 0.2.11, Host 0.2.5 and Relay 1.1.5 replace the preparation prerequisite described in the initial activation above. The normal workflow is **Add Game → search the Arcade library → select games → Add selected games**. Both writable and read-only configured managed Spectrum libraries participate. Optional relocation preparation and recovery remain under Arcade's Collection maintenance disclosure; they are not prerequisites for browsing.

The native process builds a metadata index once and checks metadata/configuration/identity stamps around reads. It does not walk the collection's media, hash files or preflight every result on each query. The new `available` projection state means selectable library metadata, with exact media/emulator/profile checks deferred to Add and launch. Portal retains row controls during selection/detail updates and debounces typing for 150 ms. Existing bounded pages, transient Portal state, authentication, native authority and explicit approval/persistence boundaries remain intact.

Direct browsing creates only a schema-1 private random identity key in Arcade's external runtime, plus native lock files. Keyed, domain-separated identities are stable across process restarts and opaque to pages. Existing prepared IDs take precedence; optional subsequent preparation adopts direct IDs. No collection metadata, source media, preparation proofs or Host approvals are written while browsing. Broken identity files and missing existing preparation proofs fail closed. Unreviewed source-root changes do not retarget bindings.

The reported selection failure came from requiring explicit launch settings before enabling checkboxes: only one entry in the writable live library had an individual emulator override, and the collection had no default. New entry-policy resolution uses game override, collection default, then Arcade's initial visible configured launcher selection. Broken explicit emulator/profile pins still fail rather than falling through. The projection also respects Arcade's authoritative Spectrum `system` when legacy `memory` differs; this makes valid 16K and combined releases selectable.

Validation evidence:

- `python -B Host/tools/benchmark_catalogue.py --entries 12933 --bind 100` used an unprepared synthetic library: first 100-entry read 1.361 s; warm 100-entry read 0.108 s; three 50-entry searches 0.0626–0.0646 s; adding 100 games 1.201 s; identical retry 0.079 s. No preparation was performed. These are native transport timings on this machine, excluding the typing debounce; the previous full-size readiness reads took seconds per query.
- Isolated Firefox 155.0.1 passed the 12,933-entry unprepared workflow with 100 additions, second-row title clicks, keyboard selection, paging, responsive details, cancellation without approvals/cards, authoritative disk save and reload. A two-edition scenario separately checked explicit tag copying. The fixtures verify that collection metadata bytes remain unchanged.
- The final `--entries 12933 --prepared` Firefox run also passed typed search, clicking the second matching title, keyboard deselection/reselection, clearing the query, paging, adding both editions with tags, and disk reload. Typed search completed in 0.314 s including the debounce and browser-driver polling.
- Read-only projection of the two available live metadata files returned 34,398 selectable Main entries, including all represented Spectrum hardware variants, in 2.165 s cold. Ten representative native launch-plan checks resolved existing emulator profiles without launching an emulator, creating approvals or modifying live collection/runtime data. Their temporary native indexes stayed outside the checkout.
- Automated regressions cover unprepared/read-only browsing, restart-stable IDs, old prepared IDs, later preparation retaining direct IDs, metadata edit/Undo/delete/restore/import refresh, selected-target changes before approval, missing media/configuration/proofs, corrupt identity keys, stale/corrupt artwork, wrong roles, retry receipts and portable-state exclusion.

Reload Relay and Portal after updating. Firefox's local-file permission remains a one-time browser requirement. Scanned/report-only collections, other platform adapters and compact picker destinations remain separate follow-up work.

The final coordinated validator passed **923 tests**: Portal 136, Widgets 304, Arcade 226, Relay 27, Host 162 (plus 11 subtests), Nexus 26, migration 20, packaging 14 and tooling 8. JavaScript syntax, manifests, generated registry, independent versions and packaging passed. Relay lint reported zero errors, warnings or notices, and the sanitized Nexus validation receipt was written.
