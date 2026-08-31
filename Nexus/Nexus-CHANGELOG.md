# Cyrune Nexus Changelog

## [0.3.0] — 2026-08-31

### Added

- Added a project-wide protocol compatibility matrix and component TODO summaries backed by the existing allowlisted document service.
- Added settings search, schema-checked JSON import/export, and sanitized human-readable revision history from Host.

### Changed

- Document reads now degrade from authenticated Host to direct local files and finally to the last bounded browser cache for resilient direct-file and offline use.

### Validation

- The coordinated release gate passes all 26 Nexus tests, JavaScript syntax checks, infrastructure/version validation, and sanitized validation-receipt generation, including authoritative document coalescing and Host-to-file-to-cache recovery.

## [0.2.0] — 2026-08-31

### Added

- Added the generated six-component registry, fixed declarative adapter layer and protocol compatibility diagnostics, replacing Nexus's duplicated component/version array.
- Added bounded operational-event presentation and source manifests for every Cyrune component.

### Changed

- Component navigation, source versions, documents, capabilities, schemas and page links now originate in validated component-owned manifests.
- Coordinated validation now gates the protocol catalogue, compatibility register, generated registry and conservative affected-suite selection.

### Validation

- All 23 Nexus tests pass, covering registry load order, adapter allowlisting, compatible/outdated protocol advertisements, bounded event presentation and version alignment in addition to existing settings and status behaviour. The full coordinated gate also passes.

## [0.1.11] — 2026-08-31

### Changed

- Moved authoritative document loading and revision-aware caching into a dedicated service module. Concurrent TODO/changelog requests now share one bounded read and older revision caches are discarded.
- Updated monitored Portal and Relay releases to 0.11.227 and 1.0.63.

### Fixed

- A settings-revision broadcast received during an active health refresh now queues one follow-up refresh instead of being silently lost.

### Validation

- All 22 Nexus tests pass, covering the service, cache revisions, refresh race, script order, model/manifest alignment, and coordinated version validation.

## [0.1.10] — 2026-08-31

### Changed

- Updated the monitored Relay component release to 1.0.62 after Arcade optional-network enforcement moved into the authenticated artwork path.

### Validation

- Nexus model/manifest alignment and coordinated version validation cover the monitoring-only release.

## [0.1.9] — 2026-08-31

### Added

- Clicking the Portal, Widgets, Arcade, or Nexus artwork in the sidebar, overview, component header, or Nexus brand now opens that component's stable local browser page in a new tab. The surrounding cards and navigation still open the component status inside Nexus.
- Relay and Host retain status-only icons because neither exposes a stable standalone browser entry point.

### Validation

- Nexus tests cover the fixed page allowlist, icon launch markers, new-tab/no-opener behaviour, and preserved component navigation; independent version validation confirms the Nexus manifest, model, and changelog remain aligned.

## [0.1.8] — 2026-08-31

### Changed

- Replaced letter-based component placeholders throughout the sidebar, overview cards, and component headers with the shared Cyrune lattice icon family. The Project entry uses the master Cyrune mark and Nexus uses its junction variant for both branding and favicon.

### Validation

- Nexus tests cover the fixed local icon mapping, favicon, brand treatment, and removal of generated letter symbols; the coordinated validator covers the complete release.

## [0.1.7] — 2026-08-25

### Added

- Added global, Portal & Widgets, and Arcade scopes to Variables. Component values show whether they come from the global setting or a sparse component override, and each override can be enabled or cleared independently.
- Added permission-gated manual latitude and longitude settings for the `portal-widgets` profile. Arcade remains unable to receive city, location mode, coordinates, or location permissions.
- Added Widget SDK 3 effective-setting resolution and real opt-in consumers in Weather, Weather Map, Astronomy, and Calendar with local Widget configuration retaining highest precedence.

### Changed

- Migrated authoritative and disconnected-preview settings from schema 1 to schema 2 while preserving revisioned global values. Profile schema 2 adds fixed per-value source metadata; the shared client accepts profile schemas 1 and 2 during rolling reloads.
- Global optional-network and location permissions remain ceilings: component overrides can narrow optional networking but cannot grant unavailable location or network authority.

### Validation

- Focused Nexus, component-client, Host, Widget SDK, Weather, Weather Map, Astronomy, and Calendar suites cover schema migration, sparse overrides, effective/source resolution, coordinate redaction, permission ceilings, compatibility defaults, and live settings adoption. The coordinated repository validator covers the full monorepo release.

## [0.1.6] — 2026-08-25

### Added

- Added independent health sampling for Portal data, Arcade service/state, Nexus settings, Host, Relay, and source-only Widgets, with fixed healthy, attention, unavailable, and source-only states.
- Runtime data now reports sanitized schema validity, retained-backup health where managed, sample age, stable diagnostic codes, and concrete recovery guidance without exposing contents or native targets.
- Added a browser-neutral typed component client and fixed `portal-widgets` and `arcade` profiles. Portal, hosted Widgets, and Arcade now consume only their approved subsets and refresh after revision-only Relay broadcasts while Nexus is closed.

### Fixed

- Settings and project status now refresh independently. Corrupt or unavailable authoritative settings no longer suppress healthy repository, component, service, validation, or runtime diagnostics; Variables falls back safely while the status surface remains live.

### Validation

- All 15 Nexus tests and 51 Host tests plus 11 parameterised subtests pass, including partial failures, corrupt persisted state, fixed guidance, schema/backup summaries, independent sampling, snapshot redaction, profile normalization, role mismatch, stale revisions, safe copies, and fixed component subsets. Packaging, version, and syntax checks also pass.

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
