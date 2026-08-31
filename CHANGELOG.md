# Cyrune Repository Changelog

This log records repository-wide migration, tooling, and coordinated release changes only. Product changes belong in the affected component changelog.

## [Unreleased] — migration started 2026-08-25

### Added

- Added component-owned manifests and semantic versions for all six products, a generated Nexus registry, a versioned protocol catalogue, compatibility-removal register, fixed Nexus adapters, capability negotiation, bounded operational events, a reusable migration runner, and conservative affected-suite validation. Portal 0.11.228, Widgets 0.1.0, Arcade 0.1.0, Relay 1.0.64, Host 0.1.0, and Nexus 0.2.0 form the coordinated infrastructure release.

- Added Nexus 0.1.9 icon launch actions for the stable Portal, Widgets fixture, Arcade, and Nexus browser entry points while preserving Relay and Host as status-only components.
- Added a repository-wide Cyrune lattice icon family and integrated it across Nexus component navigation/cards, Portal, Arcade, Relay, Nexus, and the standalone Widgets SDK fixture. Portal 0.11.226, Relay 1.0.61, and Nexus 0.1.8 carry the independently versioned browser-facing changes.
- Added Nexus 0.1.7 settings schema 2, Portal 0.11.225, and Widget SDK 3: fixed sparse component overrides, effective-value source indicators, permission-gated coordinates, rolling profile compatibility, and opt-in Weather, Weather Map, Astronomy, and Calendar consumers now implement default → global → component → local Widget precedence.
- Added typed, role-bound Nexus settings consumers across Host, Relay 1.0.60, Portal 0.11.224, Widgets SDK 2, and Arcade: fixed component profiles, live revision broadcasts, accessibility/language/unit application, and an authoritative optional-network gate work while the Nexus page is closed.
- Added Nexus 0.1.6 snapshot-schema health adapters across Host and Nexus: independently sampled Portal, Arcade, Nexus settings, Host, Relay, and source-only Widget states now provide sanitized schema/backup summaries and fixed actionable recovery guidance without allowing one failure to suppress healthy sections.
- Added the Nexus 0.1.5 and Relay 1.0.59 explicit origin check: the authenticated page can request a fixed, non-interactive comparison of the current branch with live `origin`, while Host returns only sanitized commit state and never fetches or mutates the checkout.
- Added the Nexus 0.1.4 and Relay 1.0.58 TODO-editing route: component and project TODOs open as exact allowlisted Visual Studio Code files through Host, while changelogs retain read-only previews without open links.
- Added a coordinated validation-receipt writer and Nexus 0.1.3 Activity presentation for the last successful commit, component versions, passing suite counts, and fixed release gates; receipts remain atomic, content-free, and outside the checkout.
- Added the Nexus 0.1.1 authoritative service across Nexus, Relay 1.0.56, and Host: typed atomic settings with revision conflicts, an exact authenticated Nexus role, sanitized live project/runtime/repository status, allowlisted project documents, and honest disconnected fallback behaviour.
- Added Cyrune Nexus as a sixth component with routed guidance, project documentation, a typed shared-settings and sanitized-status contract, component metadata, focused tests, and a functional direct-file first draft covering Overview, Variables, Activity, Project, and component document views.
- Added routed component-specific `AGENTS.md` files for Portal, Widgets, Arcade, Relay, and Host, plus an active Portal–Arcade integration contract promoted from the completed legacy plan.
- Added a new Cyrune-wide `PROJECT.md` covering component boundaries, runtime data, compatibility, development, validation, packaging, documentation, and migration status.
- Added the Phase 8 non-interactive cutover audit, sanitized data/binding comparison, legacy-path and secret-location checks, cleanup classification, and coordinated rollback record.
- Added deterministic Relay AMO packaging, exact archive allowlisting, SHA-256 sidecars, content-free reports, signed-XPI import validation, and independent component-version checks.
- Added a versioned, copy-first runtime migration coordinator with atomic writes, reread/parse/hash verification, sanitized receipts, interrupted-copy recovery, explicit divergent-data replacement, and focused migration coverage.
- Established the adjacent `Cyrune` monorepo and the `Portal`, `Arcade`, `Relay`, `Host`, and `Widgets` component roots.
- Imported the complete Arcade Git history without squashing it.
- Added verified pre-migration Git bundles, source tags, a hash-only recovery inventory, and an isolated migration branch.
- Added authoritative TODO, changelog, and README files for every component, plus a repository-wide validation command.

### Changed

- Linked all active architecture guidance from the project and component READMEs, restored missing Portal module/persistence/settings/rendering rules and full modal details, and replaced stale legacy product wording in Arcade guidance while labelling retained compatibility variables.
- Renamed every component TODO and changelog with its component prefix, reconciled the legacy Portal and Arcade backlogs into the owning current TODOs, and updated repository references.
- Replaced remaining user-facing WebHub, EmuGUI, and Morpheus labels with Cyrune Portal, Arcade, Relay, Host, and Widgets while preserving compatibility-sensitive installed IDs, storage keys, events, binding fields, credential namespaces, and portable-format identifiers.
- Retired Arcade's hard-coded Spectaculator diagnostic after the configurable ZX validation matrix and focused Windows-default association coverage superseded it; preserved a verified copy of the unreferenced legacy root background without deleting its source.
- Restored Relay packaging beneath ignored `artifacts/Relay/<version>` while retaining the historic eight-file payload boundary and separating unsigned upload artifacts from Mozilla-signed packages.
- Externalised and activated Portal and Arcade runtime data beneath `%LOCALAPPDATA%/Cyrune`, retaining verified recovery copies and leaving both legacy runtime sources untouched. Portal background references and Arcade managed-profile paths were the only transformed fields.
- Completed the Phase 5 widget regrouping across all catalogue categories and shared core, and taught repository validation to discover colocated widget tests and source.
- Moved the existing dashboard source to `Portal/` and the WebExtension source to `Relay/` through history-preserving renames.
- Renamed and narrowed the migration plan to repository/infrastructure work.
- Moved existing tests beneath their owning Portal, Relay, and Host roots and repaired cross-component paths and local-page fixtures.
- Archived the legacy combined TODO and completed Portal/Arcade integration plan, and retired the obsolete `PROJECT.md` after moving durable guidance into current documentation.
- Separated Host source, installers, tests, and mutable configuration from Relay; installed the new Host launcher while preserving compatibility identifiers and opaque bindings.
- Verified Portal and Arcade at their final Cyrune `file://` paths through the relocated Relay and Host.
- Recovered Arcade's ignored runtime state after validation exposed an incomplete source-only import: 30 favourites, 30 recent entries, three collection records, two managed emulator profiles, and both managed profile files are present again. Existing external collection metadata remained intact.

### Fixed

- Fixed the first live Nexus connection gate in Nexus 0.1.2 and Relay 1.0.57 by binding its exact local document independently of client-side hash navigation; the earlier check incorrectly rejected `index.html#overview` as a different page.

### Validation

- The receipt-producing coordinated run passes 90 Portal, 254 Widgets, 69 Arcade, 12 Relay, 51 Host plus 11 parameterised subtests, 15 Nexus, 10 migration, 14 packaging, and 3 tooling tests. JavaScript syntax—including the shared Nexus client—manifest parsing, independent versions, packaging, and `web-ext lint` pass, and the resulting runtime receipt contains only its fixed schema.
- The authoritative Nexus service passes 8 Nexus tests, 11 Relay tests, and 47 Host tests plus 11 parameterised subtests, covering exact roles, bounds, typed validation, atomic revisions, conflicts, allowlisted documents, status redaction, and remote-URL sanitization. Relay 1.0.56 passes `web-ext lint` with zero errors, notices, or warnings.
- The Nexus baseline passes 89 Portal tests, 7 Nexus tests, 253 Widget tests, 8 Relay tests, 42 Host tests plus 11 parameterised subtests, 10 migration tests, 14 packaging/version tests, and 68 Arcade tests. All coordinated JavaScript syntax, manifest, independent-version, and `web-ext lint` checks pass with zero errors, notices, or warnings.
- Nexus 0.1.0 adds focused component-catalogue, settings-normalization, safe-document, safe-Markdown, direct-file structure, and version-alignment coverage; Nexus source is included in the coordinated JavaScript syntax pass.
- All active guidance Markdown links resolve, every root-plus-component instruction chain is under 7 KiB, and the only remaining legacy product names in active guidance are the intentional one-line upgrade identifiers in the Portal and Arcade READMEs.
- The final naming and migration audit passes 89 Portal tests, 253 Widget tests, 8 Relay tests, 42 Host tests plus 11 parameterised subtests, 10 migration tests, 14 packaging tests, and 68 Arcade tests. All JavaScript syntax, Relay manifest, independent-version, and `web-ext lint` checks pass; source scans found no unexpected active-checkout references outside compatibility contracts, test fixtures, and migration records.
- A clean clone at a different space-and-Unicode absolute path passes the complete coordinated checks and reproduces the Relay 1.0.54 archive hash exactly. The final upgraded-checkout matrix passes with 68 Arcade tests; the active receipt, Portal structural counts, every Phase 6 binding, Arcade profile IDs/hashes, favourites, recent count, emulator/profile/game preflight, legacy-path scan, and location-only secret scan also pass without modifying active data.
- The completed Phase 7 combined-checkout validation passes 88 Portal tests, 253 Widget tests, 8 Relay tests, 42 Host tests plus 11 parameterised subtests, 10 migration tests, 14 packaging tests, and 67 Arcade tests. JavaScript syntax, manifest parsing, independent Portal/Relay version checks, and `web-ext lint` all pass; the Relay archive also reproduces byte-for-byte from a clean checkout at a different space-and-Unicode path.
- The activated Phase 6 runtime baseline passes 88 Portal tests, 253 Widget tests, 8 Relay tests, 42 Host tests plus 11 parameterised subtests, 10 migration tests, and 67 Arcade tests. JavaScript syntax, Relay manifest validation, and `web-ext lint` pass with zero errors, notices, or warnings.
- The user confirmed both permanent direct-file applications open with their migrated databases and that Portal reports the external `%LOCALAPPDATA%\Cyrune` database location.
- The user confirmed a newly saved background is written beneath the external Portal data root and all legacy WebHub/EmuGUI bookmarks in use now point at Cyrune, completing the Phase 6 browser and local-link gate.
- Both recovery bundles pass `git bundle verify`; source commits, runtime counts, selected runtime fingerprints, Host registration, and binding counts are recorded without private contents.
- The pre-import Arcade health pass succeeds with 62 tests.
- Before Host separation, the migrated baseline passed 339 Portal tests, 6 Relay tests, 42 Host tests plus 11 subtests, and 62 Arcade tests. JavaScript syntax and Relay manifest checks passed; `web-ext lint` reported zero errors with the two expected warnings caused by the then-embedded Host files.
- After Host separation, framed Host and Arcade status requests pass, the migrated Git binding resolves the Cyrune branch, installer syntax checks pass, and `web-ext lint` reports zero errors, notices, or warnings.
- The exact Portal URL loads all eight boards, and the exact Arcade URL loads 12,933 games, 30 favourites, eight scraped records, five screenshot references, two managed profiles, and Relay-delivered remote artwork in Firefox 154.
- The restored baseline passes 341 Portal tests, 6 Relay tests, 42 Host tests plus 11 subtests, and 64 Arcade tests; all JavaScript syntax, manifest, and extension lint checks pass.
- The completed Phase 5 path migration preserves all 341 Portal/Widget tests as 88 Portal-owned and 253 colocated Widget tests; Relay, Host, Arcade, syntax, manifest, and extension lint checks stay green.
