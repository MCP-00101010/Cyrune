# Cyrune Repository Changelog

This log records repository-wide migration, tooling, and coordinated release changes only. Product changes belong in the affected component changelog.

## [Unreleased] — migration started 2026-08-25

### Added

- Established the adjacent `Cyrune` monorepo and the `Portal`, `Arcade`, `Relay`, `Host`, and `Widgets` component roots.
- Imported the complete Arcade Git history without squashing it.
- Added verified pre-migration Git bundles, source tags, a hash-only recovery inventory, and an isolated migration branch.

### Changed

- Moved the existing dashboard source to `Portal/` and the WebExtension source to `Relay/` through history-preserving renames.
- Renamed and narrowed the migration plan to repository/infrastructure work.

### Validation

- Both recovery bundles pass `git bundle verify`; source commits, runtime counts, selected runtime fingerprints, Host registration, and binding counts are recorded without private contents.
- The pre-import Arcade health pass succeeds with 62 tests.
