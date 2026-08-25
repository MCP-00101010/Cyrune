# Cyrune Repository Changelog

This log records repository-wide migration, tooling, and coordinated release changes only. Product changes belong in the affected component changelog.

## [Unreleased] — migration started 2026-08-25

### Added

- Established the adjacent `Cyrune` monorepo and the `Portal`, `Arcade`, `Relay`, `Host`, and `Widgets` component roots.
- Imported the complete Arcade Git history without squashing it.
- Added verified pre-migration Git bundles, source tags, a hash-only recovery inventory, and an isolated migration branch.
- Added authoritative TODO, changelog, and README files for every component, plus a repository-wide validation command.

### Changed

- Completed the Phase 5 widget regrouping across all catalogue categories and shared core, and taught repository validation to discover colocated widget tests and source.
- Moved the existing dashboard source to `Portal/` and the WebExtension source to `Relay/` through history-preserving renames.
- Renamed and narrowed the migration plan to repository/infrastructure work.
- Moved existing tests beneath their owning Portal, Relay, and Host roots and repaired cross-component paths and local-page fixtures.
- Archived the legacy combined TODO and completed Portal/Arcade integration plan, and retired the obsolete `PROJECT.md` after moving durable guidance into current documentation.
- Separated Host source, installers, tests, and mutable configuration from Relay; installed the new Host launcher while preserving compatibility identifiers and opaque bindings.
- Verified Portal and Arcade at their final Cyrune `file://` paths through the relocated Relay and Host.
- Recovered Arcade's ignored runtime state after validation exposed an incomplete source-only import: 30 favourites, 30 recent entries, three collection records, two managed emulator profiles, and both managed profile files are present again. Existing external collection metadata remained intact.

### Validation

- Both recovery bundles pass `git bundle verify`; source commits, runtime counts, selected runtime fingerprints, Host registration, and binding counts are recorded without private contents.
- The pre-import Arcade health pass succeeds with 62 tests.
- Before Host separation, the migrated baseline passed 339 Portal tests, 6 Relay tests, 42 Host tests plus 11 subtests, and 62 Arcade tests. JavaScript syntax and Relay manifest checks passed; `web-ext lint` reported zero errors with the two expected warnings caused by the then-embedded Host files.
- After Host separation, framed Host and Arcade status requests pass, the migrated Git binding resolves the Cyrune branch, installer syntax checks pass, and `web-ext lint` reports zero errors, notices, or warnings.
- The exact Portal URL loads all eight boards, and the exact Arcade URL loads 12,933 games, 30 favourites, eight scraped records, five screenshot references, two managed profiles, and Relay-delivered remote artwork in Firefox 154.
- The restored baseline passes 341 Portal tests, 6 Relay tests, 42 Host tests plus 11 subtests, and 64 Arcade tests; all JavaScript syntax, manifest, and extension lint checks pass.
- The completed Phase 5 path migration preserves all 341 Portal/Widget tests as 88 Portal-owned and 253 colocated Widget tests; Relay, Host, Arcade, syntax, manifest, and extension lint checks stay green.
