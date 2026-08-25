# Cyrune Repository Changelog

This log records repository-wide migration, tooling, and coordinated release changes only. Product changes belong in the affected component changelog.

## [Unreleased] — migration started 2026-08-25

### Added

- Established the adjacent `Cyrune` monorepo and the `Portal`, `Arcade`, `Relay`, `Host`, and `Widgets` component roots.
- Imported the complete Arcade Git history without squashing it.
- Added verified pre-migration Git bundles, source tags, a hash-only recovery inventory, and an isolated migration branch.
- Added authoritative TODO, changelog, and README files for every component, plus a repository-wide validation command.

### Changed

- Moved the existing dashboard source to `Portal/` and the WebExtension source to `Relay/` through history-preserving renames.
- Renamed and narrowed the migration plan to repository/infrastructure work.
- Moved existing tests beneath their owning Portal, Relay, and Host roots and repaired cross-component paths and local-page fixtures.
- Archived the legacy combined TODO and completed Portal/Arcade integration plan, and retired the obsolete `PROJECT.md` after moving durable guidance into current documentation.
- Separated Host source, installers, tests, and mutable configuration from Relay; installed the new Host launcher while preserving compatibility identifiers and opaque bindings.

### Validation

- Both recovery bundles pass `git bundle verify`; source commits, runtime counts, selected runtime fingerprints, Host registration, and binding counts are recorded without private contents.
- The pre-import Arcade health pass succeeds with 62 tests.
- Before Host separation, the migrated baseline passed 339 Portal tests, 6 Relay tests, 42 Host tests plus 11 subtests, and 62 Arcade tests. JavaScript syntax and Relay manifest checks passed; `web-ext lint` reported zero errors with the two expected warnings caused by the then-embedded Host files.
- After Host separation, framed Host and Arcade status requests pass, the migrated Git binding resolves the Cyrune branch, installer syntax checks pass, and `web-ext lint` reports zero errors, notices, or warnings.
