# Arcade review implementation

Completed 2026-09-09, following the [2026-09-08 audit](arcade-review-2026-09-08.md). Releases: Arcade **0.2.56**, Host **0.2.25**, Relay **1.1.12**, Portal **0.12.21**. Existing unrelated working-tree changes were retained.

## Correctness and scraping

- ScreenScraper descriptions now retain the metadata schema's 2,000-character allowance. Provider text decodes HTML entities once. Previously truncated saved descriptions require an explicit re-scrape; existing records are not silently overwritten.
- Native match classification supplies the browser's review decision and reason. Equivalent article placement is normalized, tied or unrelated titles require review, and TheGamesDB release dates contribute their year correctly. Manual choice remains available.
- Local artwork cache keys include collection and metadata generation. Late responses cannot replace the current image or detail view. The image cache is bounded, requests coalesce, failed reads expire after 15 seconds, and artwork can be retried explicitly.
- Applicable native reads and mutations validate collection identity. List/detail responses also check browser generations before updating the view or cache. The selected summary appears immediately; Spectrum's POK panel loads independently.
- Unsupported adapters are rejected or omitted explicitly. The preserved legacy empty adapter still means Spectrum.
- Unfinished Host transfers are retained until completion or expiry. Capacity pressure produces a busy response before mutation dispatch. Relay limits complete transfers, bounds its native queue and rechecks queued Arcade page authority before dispatch.
- Portal artwork resolves the exact entry's own local or cached ScreenScraper image. ScummVM registrations remain independent. Provider image identities stay stable while cache files change; native reads validate the actual file. Portal does not initiate scraping or borrow another title's image.

## Loading and network work

- A bounded native cache retains up to four recently loaded libraries, subject to a 60,000-record ceiling. Configuration, metadata, overrides, properties and relevant filesystem observations are checked before reuse. Rebuild Index bypasses this cache; exact media and launch authority are still checked when used.
- Spectrum indexing reuses checked parent directories within a read lease, revalidating them before the index is accepted. Parsed POK files are cached by file revision.
- Game-list responses support compact defaults, revisions and deltas. Unchanged lists send no repeated rows; small edits transfer changed rows and version revisions. Legacy callers retain their existing response shape.
- The catalogue reuses unchanged source projections when another collection changes. Reading or downloading a disposable provider image no longer invalidates every source projection.
- Slow provider searches and provider artwork downloads run as bounded read-only native jobs. Relay releases transfer capacity between job polls so a slow provider does not occupy the normal native request handler for its entire network wait. Mutation execution remains scoped and serialized.
- Successful sanitized search results have a bounded 30-minute memory cache. Keys account for provider configuration, collection, game/group identity, platform, term and cartridge revision. Explicit retries bypass it. Credentials and raw provider responses are not persisted in this cache.
- ScreenScraper requests start with one account slot and may use two when the account advertises that allowance. Known quota pauses retain queued bulk rows and show a countdown.
- Current-platform Game Boy cartridge searches without an edited term attempt checked CRC32/MD5/SHA-1 identification first, with title-search fallback. Automatic exact identification requires the returned ROM SHA-1 to agree. Disk sets and ScummVM directories are not hashed this way. Hash parameters and account `maxthreads` were checked against the [official ScreenScraper API](https://www.screenscraper.fr/webapi2.php).

## User-facing additions

- Bulk scraping has **Retry failed**, visible quota pauses and a resumable review. One review is retained for seven days in this browser, containing bounded game IDs and search choices. Resume rechecks results; it never automatically repeats saved or uncertain writes. **Discard review** removes it.
- Bulk rows update individually, retaining search-field focus and existing artwork elements.
- Metadata provenance displays provider, source platform and scrape date. Notes live in native runtime storage and preserve the existing folder-sharing and ScummVM ownership rules. Existing metadata has no invented historical provenance; Undo clears notes for reverted IDs.
- **Newly indexed (14 days)** distinguishes additions after the first observed baseline. Existing games are not all marked new on upgrade.
- Portal's picker supports Game Boy with GB/GBC/GBA hardware labels through the optional negotiated `arcade-gameboy: 1` capability. Older peers retain their existing capabilities and exact bindings.

## Structure

Focused modules now own TOSEC parsing, provider text projection, match review, collection context, caches, background jobs, metadata notes, exact-entry artwork and native transfer storage. `scrape-views.js` separates dialog rendering from the existing batch model; `artwork.js` and `scrape-drafts.js` own browser cache/review persistence. Relay's transfer gate is encapsulated within its existing packaged background entry point.

Despite the added functionality, `app.js` fell from 5,143 to 4,682 lines and `arcade_service.py` from 4,204 to 3,908. These entry points remain substantial orchestration modules, and the scraping view still shares the page's state/API. This is an incremental extraction, not a wholesale replacement of every controller or native route. No framework, build-system migration or generated frontend copy was introduced.

## Measured native performance

Final measurements used the audit's isolated temporary runtime, with writable collections and auto-metadata disabled, no scraper credentials or emulator configuration, and copied presentation overrides. Library sources were read without changing ROMs or live metadata. Regression tests were idle during this final measurement. These are individual native timings, **not browser click-to-display guarantees**; the audit baseline was taken under different load.

| Library | Records | Audit cold load | Final cold load | Validated warm cache lookup | First compact list | Unchanged list response |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main Spectrum | 12,926 | 3.95–7.90 s | 2.234 s | 0.007 s | 10.825 MiB | 699 bytes |
| ScummVM | 170 | 0.172–0.190 s | 0.216 s | 0.023 s | 0.149 MiB | 664 bytes |
| Atari ST | 2,089 | 1.259–1.290 s | 1.913 s | 0.371 s | 1.746 MiB | 602 bytes |
| Game Boy | 749 | 0.420–0.425 s | 0.789 s | 0.152 s | 0.634 MiB | 628 bytes |

The first Spectrum response previously carried about 13.56 MiB; compact defaults reduce it by about 20%. An unchanged list still requires native row comparison: 0.681 seconds for Spectrum, 0.054 for ScummVM, 0.146 for Atari and 0.079 for Game Boy in this run. Warm cache lookup excludes catalogue enrichment, transport and browser rendering.

Spectrum cold indexing improved materially. Cold loads of the smaller libraries were slower in this run; no across-the-board cold-start improvement is claimed. The first Spectrum summary also spent 7.213 seconds preparing the configured catalogue, versus 6.42 seconds in the audit. Initial catalogue preparation remains a significant cost. Subsequent per-source reuse, warm library reuse and smaller repeated transfers are the main general improvements. Paging has not been added: full local filtering remains intact, with revisions/deltas addressing repeated transfer cost first.

No live provider timing is claimed. Search cache hits avoid repeated network lookups, and jobs improve responsiveness while waiting; a first uncached lookup or download still depends on the provider and account limits.

## Validation

- Coordinated `tools/validate.ps1` passed: Portal 165, Relay 34, Host 241 plus 11 subtests, Arcade 504, migration 22, packaging 14 and tooling 8 tests. Nexus and Widget suites also passed.
- JavaScript syntax, component manifests, infrastructure/registry contracts and independent component versions passed. Relay `web-ext lint`: zero errors, warnings or notices.
- The final Arcade suite passed **505 tests**, additionally covering group-membership cache invalidation and late artwork after a metadata revision.
- Isolated Firefox 155.0.1 completed 12 workflow checks: authenticated registration, Portal picker/save/reload/defaults, Arcade platform switching and settings, theme delivery, ScummVM metadata apply/reload, edited bulk searches and retry, provider selection, review resume after reload, explicit two-version apply and desktop/narrow layouts. Saved bulk-dialog screenshots were inspected.
- New focused regressions cover description/entity handling, title review, collection scope, cache bounds/invalidation, compact deltas, nonblocking jobs, account concurrency, cartridge hashes, provenance/new IDs, checked indexing leases, transfer pressure, exact cached artwork and Game Boy capability-gated bindings.

Browser workflow tests use isolated fixtures and mocked transport/provider results. Native boundary behavior is covered separately by the component/integration suites. No live emulator launches, paid scraping calls or library migration were performed.

Reload Relay and reopen Arcade/Portal to load the coordinated update and reconnect Host. Re-scrape an affected game explicitly to recover a description truncated by an older release. Everyday testing should particularly monitor provider quota recovery, resumed reviews, rapid platform switches and cross-platform artwork ownership.
