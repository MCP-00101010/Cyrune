# Cyrune Arcade Health Audit

Date: 2026-08-25

This pass deliberately hardened the existing application before the Morpheus monorepo migration without reorganising modules that would immediately move again.

## Completed

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

Measured against the configured 12,933-game library with `tracemalloc` enabled:

| Operation | Measurement |
| --- | ---: |
| Initial library construction | 5.0486 s |
| Convert all games to API dictionaries | 0.5295 s |
| JSON serialisation | 0.8515 s |
| Full JSON payload | 16.545 MiB |
| Peak traced Python memory | 117.772 MiB |

The frontend already virtualises rendered rows. The next meaningful performance improvement is therefore not more DOM work; it is reducing the initial all-fields/all-games API payload with summary records, paging or incremental loading, while preserving local filtering and sorting semantics.

## Defer Until the Monorepo

- Split `emugui_service.py` and `web/app.js` along stable domain boundaries after their final package locations exist.
- Introduce a smaller/versioned game-list contract and fetch full details on selection.
- Add full filesystem-plus-metadata transactions or recovery journaling for rename/import/delete/restore workflows. Atomic metadata writes prevent corruption but cannot roll back a file move completed just before an unrelated failure.
- Give configuration and metadata services transaction-level update APIs, not only atomic individual writes, if the unified runtime permits multiple simultaneous writers.
- Establish one Ruff configuration and a Python-version-compatible type-checking baseline for the monorepo.
- Replace boundary-wide exception catches with a shared error taxonomy where doing so improves user-facing diagnostics without letting worker or native integration errors escape.
