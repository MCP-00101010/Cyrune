# Cyrune Arcade Health Audit

Date: 2026-08-31

This pass deliberately hardened the existing application before the Morpheus monorepo migration without reorganising modules that would immediately move again.

## Completed

- Promoted `arcade_service.py` and `arcade_core` to canonical names while retaining compatibility-only legacy import shims.
- Added strict resolved-path confinement for metadata games, POKs, imported paths, and asset reads.
- Added summary game records, indexed frontend lookups, on-demand details, frame-debounced filters, and batched favourite/delete requests.
- Added no-op rename handling, rename/delete rollback, and collection maintenance job serialization.
- Extended recoverable transactions to bulk import and trash restore, including reverse file moves, metadata restoration, and index rebuild on failure.
- Added bounded metadata/rename Undo history and retained the live TOSEC filename preview in the safer bulk-edit flow.
- Enforced authoritative optional-network policy at the Arcade service, Host bridge, Relay fetch, and browser rendering boundaries.
- Extracted the page transport/settings boundary to `web/transport.js`; further UI-domain extraction can proceed without mixing authenticated transport code into view logic.

- Replaced in-place state, configuration, collection metadata, managed-profile, and live EightyOne profile writes with same-directory atomic replacements.
- Validated persisted JSON root and collection shapes so valid-but-unexpected JSON cannot reach code that assumes dictionaries and lists.
- Serialised favourite and recent-history mutations to prevent concurrent native requests from losing updates.
- Restored the previous active collection and index when a collection switch rebuild fails; unknown collection IDs now fail instead of silently selecting the first collection.
- Required clean HTTPS base URLs for credential-bearing ScreenScraper and TheGamesDB calls. Embedded credentials, queries, fragments, non-HTTPS schemes, and malformed ports are rejected.
- Scoped TheGamesDB lookup caching to both endpoint and lookup type, and invalidated it when scraper settings change.
- Bounded retained background-job history to 100 completed/error jobs and surfaced thread-start failures as job errors.
- Forwarded the actual pinned or automatically selected emulator profile through the HTML launch API.
- Removed unused native-window imports and duplicate API-route test entries.
- Added regression coverage for interrupted writes/copies, malformed persisted data, concurrent state updates, collection rollback, unsafe scraper URLs, bounded jobs, thread-start failures, and profile forwarding.

## Validation Baseline

- Automated tests: `62 passed` with Python 3.14.
- Ruff's undefined-name/unused-import (`F`) checks pass for the project after the cleanup.
- Full Ruff analysis still reports pre-existing formatting/modernisation findings plus deliberate broad exception handlers at service, job, and OS-integration boundaries. Those should be handled under an agreed repository lint policy rather than by a noisy pre-migration rewrite.
- Mypy 2.3.1 currently terminates with an internal error under the installed Python 3.14 environment, so it is not a reliable baseline until the tool/environment combination is corrected.

## Real-Library Performance Baseline

The former full-record baseline and the new summary-record measurement use the configured 12,933-game library with `tracemalloc` enabled. Absolute startup timing is system-dependent; payload size is the stable comparison:

| Operation | Measurement |
| --- | ---: |
| Summary benchmark startup | 8.2478 s |
| Summary construction | 0.0806 s |
| Summary JSON serialisation | 0.9963 s |
| Summary JSON payload | 8.66 MiB |
| Former full JSON payload | 16.545 MiB |
| Payload reduction | about 45% |
| Peak traced Python memory | 117.77 MiB former / 117.77 MiB current benchmark order-of-magnitude |

The frontend already virtualises rendered rows and the summary contract nearly halves transfer size. Paging is now optional follow-up work only if repeated measurements on slower machines show the remaining 8.66 MiB materially affects startup.

## Remaining Follow-ups

- Continue splitting `arcade_service.py` and `web/app.js` along their stable API, collection-maintenance, metadata, and view-controller boundaries.
- Repeat the summary benchmark after material schema changes and add paging only if needed.
- Add crash-recovery journaling for import/restore only if interrupted-process failures appear in real use; in-process failures now roll back transactionally.
- Give configuration and metadata services transaction-level update APIs, not only atomic individual writes, if the unified runtime permits multiple simultaneous writers.
- Establish one Ruff configuration and a Python-version-compatible type-checking baseline for the monorepo.
- Replace boundary-wide exception catches with a shared error taxonomy where doing so improves user-facing diagnostics without letting worker or native integration errors escape.
