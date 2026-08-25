# Cyrune Nexus Changelog

## [0.1.5] — 2026-08-25

### Added

- Added an explicit **Check origin** action to the repository panel. It compares the current branch with live `origin`, distinguishes the cached tracking ref from the remote result, and explains when a separate fetch is needed to refresh ahead/behind counts.
- The action is manual and read-only; opening or refreshing Nexus never triggers network access or changes the checkout.

### Validation

- All 11 Nexus tests, 11 Relay tests, and 49 Host tests plus 11 parameterised subtests pass, covering the fixed no-parameter operation, non-interactive bounded Host command, sanitized result, and live/cached UI states. Packaging, version, syntax, and extension-lint validation also passes.

## [0.1.4] — 2026-08-25

### Changed

- Component TODO actions now open their exact allowlisted files in Visual Studio Code through the authenticated Relay and Host boundary, making them immediately editable without navigating the browser away from Nexus.
- Changelog panels remain readable in Nexus but no longer show an unnecessary open-file link. The project migration TODO uses the same Visual Studio Code action while `PROJECT.md` retains its ordinary document link.

### Validation

- All 10 Nexus tests, 11 Relay tests, and 48 Host tests plus 11 parameterised subtests pass, including fixed-operation routing, component allowlisting, path-free responses, argument-array startup, and changelog action removal.

## [0.1.3] — 2026-08-25

### Added

- Added an atomic, content-free validation-receipt writer to the coordinated repository validator. It records only the successful commit, declared component versions, bounded passing counts, and fixed release-gate outcomes beneath the Nexus runtime-data root.
- Added a detailed Activity view for the receipt's age, commit, versions, test suites, and syntax/manifest/version/package/lint outcomes.

### Changed

- Failed or interrupted coordinated validations retain the preceding known-good receipt instead of publishing partial or failed command output.

### Validation

- Added 3 focused receipt-writer tests and a ninth Nexus interface test; the coordinated validator now verifies and publishes its own sanitized receipt after every successful run.

## [0.1.2] — 2026-08-25

### Fixed

- Nexus hash routes such as `#overview`, `#variables`, and component pages now retain the same authenticated document identity instead of appearing to be different local files.
- Disconnected file-access status now uses a neutral indicator, and the Overview service panel displays the bounded registration error directly.

### Validation

- All 8 Nexus tests pass alongside the Relay and Host hash-route authorization coverage.

## [0.1.1] — 2026-08-25

### Added

- Added authoritative, revision-aware shared settings persisted atomically by Cyrune Host beneath `%LOCALAPPDATA%\Cyrune\Nexus`, with typed validation, bounded content-free history, backups, and stale-write conflict handling.
- Added live project status for component versions and update ages, Relay and Host availability, runtime-data metadata, sanitized repository state, and available validation receipts.
- Added allowlisted TODO and changelog loading through the exact Nexus Relay role and fixed-purpose Host operations.

### Changed

- The Variables screen now uses Host-backed settings when Relay is available and clearly falls back to a non-authoritative browser cache when disconnected.
- Overview, Activity, Project, and component pages now consume the authoritative project snapshot instead of presenting only draft source metadata.

### Validation

- All 8 Nexus tests, 11 Relay tests, and 47 Host tests plus 11 parameterised subtests pass, including exact-role routing, payload bounds, document allowlists, setting validation, atomic revision changes, stale-write conflicts, status redaction, and remote-URL sanitization.

## [0.1.0] — 2026-08-25

### Added

- Added the first direct-file Nexus interface with Overview, Variables, Activity, Project, and per-component views.
- Added honest partial diagnostics for Relay, Host, runtime data, repository state, and validation receipts that are not connected yet.
- Added an interactive browser-local preview of typed region, units, language, formatting, behaviour, accessibility, and privacy preferences, including coherent metric/imperial presets and custom overrides.
- Added component TODO/changelog panels with safe local document loading and direct-file fallbacks.
- Added the Nexus settings, status, security, future Theme Manager, and future Tag Manager architecture contract.
- Added focused model, safe-Markdown, component-document, interface-structure, and version-alignment tests.
