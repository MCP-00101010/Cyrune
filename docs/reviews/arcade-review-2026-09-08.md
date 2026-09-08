# Arcade code and performance review — 2026-09-08

Reviewed the working tree at Arcade 0.2.55, Host 0.2.24, Relay 1.1.11 and Portal 0.12.20. This is an audit, not a product change or a claim that every execution path is defect-free. Existing uncommitted work was retained.

## Findings, in recommended repair order

### 1. ScreenScraper descriptions are silently truncated — confirmed

`Arcade/arcade_service.py:3273` passes descriptions through `choose_localized_text` and `nested_text`. The latter calls `clean_metadata_text` with its default limit of 120, even though the metadata schema and TheGamesDB adapter allow 2,000 description characters.

A synthetic 640-character English synopsis became 120 characters in `screenscraper_candidate`. HTML entities such as `&quot;` and `&amp;` also remain literal and are escaped again for display. This explains cut-off descriptions and visible entity text; fixing parsing alone will not restore text already lost from saved records.

Use field-specific limits through localization, decode text entities once, then render as text. Re-scraping should remain an explicit action and respect protected fields.

### 2. Artwork cache can mix collections and retain failures indefinitely — confirmed

`Arcade/web/app.js:2862`–`2885` keys both cached images and pending requests only by their reference string. `read_arcade_asset` resolves local references against the active collection, but the browser neither scopes these keys to the collection nor clears them on a switch. There is also no entry/byte eviction limit.

Executing the actual extracted functions with mocked transport reproduced both problems:

- Read `art/cover.png` in collection A, switch to B and request its identically named image: A's cached image is returned without a second request.
- Make the first image request fail, restore transport and request again: the cached empty string prevents another attempt for the lifetime of the page.

Use collection/revision keys for local artwork, public provider-reference keys for shared provider images, a bounded cache and short-lived failure entries. Apply generation checks to pending requests too. Native local-asset requests should identify their collection so a delayed request cannot resolve against a newly active root. A retry action would then be useful when artwork is unavailable.

### 3. Detail and list reads do not consistently reject stale responses — confirmed cache reproduction; wider race risk

`Arcade/web/app.js:2724` caches a detail response by game ID after awaiting it without checking the collection or metadata generation. Clearing the cache during a switch or reload does not stop the old response from repopulating it. A deferred-response reproduction confirmed this. `reloadGames` at line 671 likewise installs its response without the generation protection already used by `reloadCollections`.

Consequences require overlapping work: an old detail request completing after a metadata reload, revisiting a collection while its old request remains pending, or collections sharing legacy game IDs. Scrape mutations already carry a checked collection ID, but game/detail, favourite, launch, reveal and several older mutation routes still rely on the native active collection. Two Arcade tabs can therefore disagree about that state.

Carry collection identity and a view/metadata revision through reads and applicable mutations; discard late results before updating either the visible panel or its cache. Reject stale mutations explicitly. Show the selected game's summary immediately, with actions tied to that identity, while details load. The current panel waits for details, and Spectrum details also await POKs before replacing its HTML.

### 4. Unfinished native transfers can be evicted — confirmed primitive reproduction

`Host/morpheus_host.py:2540` allows four retained Arcade transfers and evicts the oldest when a fifth starts, even if the oldest is still being read. Five synthetic 500,000-character payloads reproduced the first transfer becoming unreadable before its second chunk.

`Relay/background.js:2318` requeues each next chunk through the shared queue, so other asset/list requests can interleave. Bulk image previewing supplies a plausible trigger, although this review did not reproduce the complete failure in a live browser. The browser's permanent negative artwork cache makes a transient transfer failure more persistent.

Bound concurrent complete transfers, reserve their slots through completion, and return a retryable busy result instead of evicting an active transfer. Preserve the memory ceiling. Small responses could avoid allocating a retained transfer, with a compatible envelope extension if needed.

### 5. Unsupported adapters still fall through to Spectrum — confirmed

The platform registry rejects unknown adapters, but `Arcade/arcade_core/catalogue_library.py:138` falls through to `SpectrumSource` for anything other than its explicitly handled Atari, ScummVM and Game Boy cases. The main loader at `Arcade/arcade_service.py:1272` has a similar final Spectrum branch.

A temporary source with `adapter: future-console-v1` and a valid Spectrum-shaped metadata row was admitted as `SpectrumSource`. This does not establish arbitrary execution, but it contradicts the declared platform boundary and is a trap for future integrations or mistyped adapter IDs.

Explicitly recognize the preserved empty-adapter legacy case and `spectrum-metadata-v1`; reject or isolate all other unsupported adapters. Keep import/launch factories native and declarative capability data shared with the browser.

### 6. Native and browser match-review rules disagree — confirmed

`Arcade/arcade_core/metadata_care.py:330` and `Arcade/web/metadata-scraping.js:22` normalize titles differently. For `The Hobbit` versus `Hobbit, The` at confidence 85, the native review decision is true while the batch automatically selects the result. Reproduced with the actual functions. This is inconsistent review guidance, not evidence of another Pirates-style wrong-game application.

Use one authoritative match classification and reason from the native provider result, with explicit manual selection overriding it. Keep separate games with similar names unselected. Also normalize TheGamesDB release dates to years when scoring: its candidate currently retains a full release date, while the confidence comparison expects a four-digit year.

### 7. ScreenScraper images do not reach every Portal artwork path — confirmed code-path gap

The new `scraper-artwork/screenscraper/...` references are understood by Arcade's asset reader. Host's legacy `_emugui_binding_thumbnail` at `Host/morpheus_host.py:2582` understands HTTPS URLs or collection-relative files; it does not resolve the native scraper cache. The Spectrum catalogue artwork adapter accepts local PNG paths, and `catalogue_scummvm.py:52` emits an empty artwork reference.

Thus artwork visible in Arcade is not guaranteed to appear on a newly sent Portal shortcut or in the picker. This is an integration limitation, not a broken launch binding.

Add a native exact-entry thumbnail resolver which can consume already cached provider PNGs. Keep Portal's size limits and its no-implicit-scraping rule. Preserve ScummVM version ownership; do not find replacement artwork by similar title. Any optional remote acquisition still needs the existing policy checks.

## Performance evidence

Measured existing library sources through an isolated temporary Arcade runtime. Its configuration contained collection definitions but no scraper credentials or emulator configuration. Collection writes and auto-metadata were disabled; presentation overrides were copied into that runtime. Live ROMs, collection metadata, active settings and emulator processes were not changed.

These are native measurements, not browser click-to-display timings. The initial measurements overlapped regression tests, so ranges are indicative rather than controlled performance targets. Counts describe this read-only run; they need not match the UI's grouped or incoming/trash counts.

| Source | Records | Native library load, two passes | Warm catalogue/group enrichment | Compact summary payload before cleanup flags |
| --- | ---: | ---: | ---: | ---: |
| Main Spectrum | 12,926 | 3.95–7.90 s | 0.136 s | 13.56 MiB |
| Other configured Spectrum source | 21,471 | 10.94–11.82 s | 0.219–0.227 s | 22.33 MiB |
| ScummVM | 170 | 0.172–0.190 s | 0.033 s | 0.184 MiB |
| Atari ST | 2,089 | 1.259–1.290 s | 0.045–0.050 s | 2.17 MiB |
| Game Boy | 749 | 0.420–0.425 s | 0.038–0.042 s | 0.789 MiB |

The first catalogue/group enrichment cost 6.42 seconds across configured sources. Warm enrichment was much cheaper. A metadata/configuration stamp change currently rebuilds all catalogue sources in `_ensure_fresh`, so retaining unchanged source projections would help after edits.

A subsequent isolated profile of the main Spectrum loader took 7.36 seconds with profiling enabled. It recorded 17,029 `ConfinedRoot.resolve` calls, accounting for 5.35 seconds of cumulative time; 34,116 Windows final-path calls accounted for about 3.00 seconds. Loading POKs took 1.40 seconds. These times overlap and must not be added together. Repeated filesystem validation and POK loading matter more here than JSON serialization (about 0.13 seconds in the unprofiled measurements).

Recommended performance work:

1. **Keep a bounded native cache of recently loaded collections.** Validate collection/configuration/metadata changes before reuse. Refresh favourites and launch pins appropriately. Rebuild Index must bypass the cache. Reuse checked directory observations within a read lease rather than removing path-confinement checks; revalidate exact media and launch authority when used.
2. **Cache POK parsing by checked file revision and load the POK panel independently.** A Spectrum game's metadata/artwork should not wait for its cheat list.
3. **Shrink repeated game-list transfers.** Spectrum now transfers substantially more than the old health-audit summary baseline once version identifiers are included. Avoid sending all unchanged rows after a small edit. Start with revision-aware snapshots/deltas and leaner summaries; add paging only if measurements still justify it. Preserve local filtering and exact version membership.
4. **Reuse unchanged catalogue sources.** The current all-source rebuild is unnecessary after a change to one library. Keep a coherent overall revision while regenerating only affected source projections.
5. **Move slow scraper I/O out of the shared native request handler.** Relay has one serial general native queue, and Host's normal message loop executes one request at a time. A title lookup or image download can delay Portal storage/status/launch traffic using that port; the Portal catalogue has its own dedicated connection. Prefer bounded native scraper jobs with fast status reads, captured collection identity and narrowly scoped commits. Do not simply parallelize every mutation against global active-collection state.
6. **Cache sanitized search results and schedule quota pauses.** The existing cache is limited to equivalent successful results inside one batch. Key a bounded native search cache by provider configuration revision, search platform, normalized term and localization; retain no credentials or raw provider URLs. Keep retry/refresh explicit for stale or negative results. Bulk scraping currently marks subsequent rows failed when quota errors occur rather than retaining them as queued until a known retry time.
7. **Update only the affected bulk row.** `showBulkScrapeModal` rebuilds all result HTML on every status change, selection and search-field keystroke, then reconstructs focus and artwork observers. At the 1,000-version limit this does unnecessary work. Persistent row nodes would simplify focus handling and avoid repeated image element construction.

ScreenScraper's official API documents `maxthreads`, per-minute/daily limits and ROM hash lookup. Existing serialization is safe for a one-thread account; concurrency should use the actual account allowance, not a guessed fixed thread count. Hash-first identification is a useful later enhancement for cartridges, with cached hashes and title-search fallback. It should not be applied indiscriminately to ScummVM directories or disk sets. [Official API documentation, checked 2026-09-08](https://www.screenscraper.fr/webapi2.php).

## Meaningful code simplification

Current line counts: `Arcade/web/app.js` 5,143; `Arcade/arcade_service.py` 4,204; `Host/morpheus_host.py` 4,872; `Relay/background.js` 3,212. Most existing `arcade_core` modules are already substantially smaller.

Extract complete responsibilities with explicit dependencies, one at a time:

| File | Useful extraction |
| --- | --- |
| Arcade `app.js` | Collection/view state; table/filter controller; details/artwork controller; scraping modal views; emulator/profile editor; import/trash views |
| Arcade `arcade_service.py` | ScreenScraper and TheGamesDB adapters; TOSEC parsing/filename construction; native collection loaders; maintenance operations; route dispatch |
| Host `morpheus_host.py` | Arcade bridge and transfer store; approved-game status/presentation; thumbnail resolution, reusing existing native authority helpers |
| Relay `background.js` | General native request scheduling and Arcade transfer routing; preserve authenticated role/session checks and account for the exact package allowlist |

The existing `metadata-scraping.js` is a useful model/view seam; move its DOM views out of `app.js`, rather than inventing a new UI framework. Retain the canonical direct-file frontend and compatibility shims. Generated platform definitions are intentional duplication, not dead code. Consolidate duplicated title matching, provider request/error handling and supported-format knowledge, but do not merge distinct metadata-sharing and launch-version identities.

The safer structural direction is an explicit native collection context passed to operations. Extracting files while retaining many callbacks into mutable module globals would make files smaller without resolving the underlying coupling. A broad rewrite, build-system migration or framework replacement is not warranted by these findings.

## Small useful features

- **Retry failed lookups/artwork** and a visible quota pause, retaining completed selections.
- **Resume a scrape review after closing/reloading**, storing only bounded IDs/search choices/provider result references, revalidated before apply. Never automatically replay an uncertain save.
- **Show metadata provenance in Properties**: provider, selected source platform and last successful scrape, especially when artwork came from another platform.
- **Newly indexed games filter**, useful when existing collections gain files; keep a collection-management overhaul separate.

Game Boy's omission from Portal's catalogue picker is explicitly documented. Completing that optional capability would improve parity, but existing Arcade-to-Portal delivery works and this is lower priority than the fixes above.

## Validation and limits

- Arcade: 490 tests passed.
- Host: 237 tests and 11 subtests passed.
- Portal: 164 tests passed.
- Relay: 33 tests passed.
- Total: 924 tests plus 11 subtests.
- Executed focused synthetic reproductions for description truncation/entity retention, cross-collection artwork reuse, permanent failed-image caching, late detail cache writes, unknown adapter fallback, unfinished-transfer eviction and inconsistent match-review decisions.
- Initial sandbox test attempts failed because Windows blocked test-worker/temp access. The authorized isolated runs above passed.
- No live emulator launches, paid/provider scraping requests, ROM migration, product-code changes or live-browser mutation. Provider documentation was browsed; performance used read-only native sources. The complete visual/transport scenarios for the identified races remain regression work for their fixes.

Suggested implementation sequence: repair parsing and cache correctness; enforce collection scope and transfer backpressure; measure and improve warm library reuse; then extract the affected modules while adding the targeted regressions. Let everyday use determine whether the optional features merit implementation.
