# Cyrune Monorepo Migration TODO

## Status

- **State:** Planned; permanent suite and repository name selected.
- **Created:** 2026-08-24
- **Revised:** 2026-08-25
- **Objective:** Combine the existing products as Cyrune Portal, Arcade, Relay, Host, and Widgets in one repository while preserving history, runtime data, credentials, bindings, direct-file operation, release workflows, and rollback paths.

This document contains migration and repository-structure work only. Product features, behavioural fixes, component refactors, and speculative shared-code extraction belong in the applicable component TODO and must not be implemented as part of the path migration.

## Decisions

- The permanent suite and repository name is **Cyrune**.
- Component display names are **Cyrune Portal** (WebHub), **Cyrune Arcade** (EmuGUI), **Cyrune Relay** (extension), **Cyrune Host** (native host), and **Cyrune Widgets**.
- Use `Cyrune` as the repository/directory name and `%LOCALAPPDATA%/Cyrune` as the default runtime-data root.
- Keep existing extension IDs, native-messaging host IDs, credential names, schema identifiers, storage keys, and opaque binding formats unchanged during the monorepo migration. Rename compatibility-sensitive identifiers only in a later dedicated migration if there is a real benefit.
- Use “formerly Morpheus WebHub/EmuGUI” only as temporary upgrade and recovery wording where users may otherwise confuse old and new local paths.
- Keep Portal and Arcade as separate applications with separate interfaces and responsibilities.
- Keep Relay and Host as separate components and trust boundaries.
- Give Portal, Arcade, Relay, Host, and Widgets their own `TODO.md` and `CHANGELOG.md`.
- The native host requires its own pair because it is independently versioned, installed, security-sensitive, and released on a different cadence from the extension.
- Keep the root migration TODO limited to repository/infrastructure work.
- Keep a small root changelog or release index for repository-wide migration/tooling changes only; do not duplicate component release notes there.
- Preserve direct `file://` development and ordinary page reloads for both interfaces.
- Do not carry the retired EmuGUI HTTP server into the monorepo.
- Preserve each application’s internal shape during import; refactor only after the migrated baseline is green.
- Move mutable device-local data outside the source checkout through copy-first, verified, idempotent migrations.
- Treat generated extension packages, downloaded translation runtimes, caches, and test output as artifacts rather than source.

## Proposed Repository Layout

```text
Cyrune/
  Portal/
    index.html
    source/
    assets/
    themes/
    vendor/
    tests/
    README.md
    TODO.md
    CHANGELOG.md
  Arcade/
    web/
    emugui_service.py
    emugui_core/
    defaults/
    tools/
    tests/
    README.md
    TODO.md
    CHANGELOG.md
  Relay/
    manifest.json
    background.js
    content.js
    popup/
    icons/
    README.md
    TODO.md
    CHANGELOG.md
  Host/
    native host source, installers, launchers, and manifest templates
    config.example.json
    README.md
    TODO.md
    CHANGELOG.md
  Widgets/
    core/
    coding-development/
    content-feeds/
    gaming/
    personal-productivity/
    space-astronomy/
    sports/
    system-network/
    utilities/
    weather-hazards/
    README.md
    TODO.md
    CHANGELOG.md
  tests/
    integration/
    migration/
  tools/
  docs/
    architecture/
    history/
    migration/
  artifacts/                     # generated; ignored by Git
  AGENTS.md
  CHANGELOG.md                   # repository/infrastructure releases only
  README.md
  CYRUNE-MONOREPO-TODO.md
```

The widget group names mirror the existing catalogue categories. A widget’s JavaScript, CSS, tests, fixtures, and static assets should live together under its group. Shared registry/runtime/network/settings code belongs in `Widgets/core`; no widget business logic belongs there.

Do not create speculative `packages/` or a generic shared `core/` during the initial migration. Shared packages may be extracted later only when a stable contract and at least two real consumers justify them.

## Component Documentation Rules

Each component `TODO.md` contains only outstanding work owned by that component. Each component `CHANGELOG.md` contains only completed changes that materially affected that component.

Cross-component work may appear in more than one component changelog when each side changed, but each entry should describe that component’s part and use that component’s version where one exists.

### Source-document disposition

- Current root `TODO.md`: split into Portal, Relay, Host, and Widgets TODOs; move guidance/constraints into the relevant README or `AGENTS.md` rather than leaving them as tasks.
- Current root `CHANGELOG.md`: preserve every historical release entry, then sort applicable entries into component changelogs. Mixed releases may be represented in multiple component logs without losing their original version/date.
- Current Arcade-source `TODO.md`: becomes `Arcade/TODO.md` after work owned by other components is removed.
- Current completed `EmuGUI-TODO.md`: archive under `docs/history/` as the completed Portal/Arcade integration record; do not treat it as an active backlog.
- Current Arcade-source history: create `Arcade/CHANGELOG.md` from its Git history and current health-pass record before or during import.
- Current `PROJECT.md`: discard during the documentation cutover. Replace it after migration with root and component READMEs derived from the validated final layout.
- Current untracked `Infrastructure TODO.md`: use only as source material; do not import it as an active TODO after its migration work and component backlog have been accounted for.
- Root `CHANGELOG.md`: after the split, retain only monorepo import, path migration, data migration, repository tooling, and coordinated release-index entries.

### Backlog separation gate

- [ ] Create or confirm the five component TODOs.
- [ ] Move every product feature, behavioural fix, and component refactor out of this migration plan.
- [ ] Sort the existing Portal-source TODO by owning component.
- [ ] Merge Arcade product work into `Arcade/TODO.md` without copying completed migration tasks back into it.
- [ ] Verify every removed task exists in exactly the appropriate component backlog, with cross-component references only where coordination is required.
- [ ] Keep this document free of feature implementation phases.

## Runtime Data Layout

```text
%LOCALAPPDATA%/Cyrune/
  Host/
    config.json
    logs/
    intake/
  Portal/
    database.json
    backups/
    backgrounds/
  Arcade/
    config.json
    state.json
    emulator-profiles/
    logs/
    cache/
```

Environment/configuration overrides remain available for portable and development installations. The default must not depend on the Git checkout path.

## Phase 0 — Name, Freeze, Inventory, and Recovery

### Naming gate

- [x] Select **Cyrune** as the suite name, repository slug, source root, and runtime-data root.
- [x] Select **Cyrune Portal**, **Cyrune Arcade**, **Cyrune Relay**, **Cyrune Host**, and **Cyrune Widgets** as component display names.
- [x] Keep former names only in temporary upgrade/recovery wording.
- [x] Preserve compatibility-sensitive extension, native-host, credential, schema, storage, and binding identifiers during the folder migration.

### Repository recovery

- [ ] Confirm both worktrees are clean apart from explicitly preserved user files.
- [ ] Finish and commit the current Arcade-source health pass before importing its history.
- [ ] Record current Portal, Relay, Host, and Arcade versions.
- [ ] Tag the last pre-monorepo commits in both repositories.
- [ ] Create a Git bundle of the Arcade source repository because it has no remote.
- [ ] Confirm the pushed Portal source remote contains the current branch and create an additional local bundle if desired.
- [ ] Record current commit IDs and branches.
- [ ] Create a dedicated Cyrune infrastructure branch in the new monorepo clone.

### Runtime recovery

- [ ] Inventory ignored/local runtime files without printing credentials, database contents, embedded icons, or browsing data.
- [ ] Record the active native-host registry manifest and launcher paths.
- [ ] Record only hashes, sizes, and locations for Portal data/backups, Host configuration, Arcade configuration/state, and managed profiles.
- [ ] Confirm scraper credentials remain in Windows Credential Manager and absent from JSON.
- [ ] Record binding/approval counts without exporting their targets.
- [ ] List user bookmarks or shortcuts pointing to the old local page URLs.
- [ ] Create verified backups for every runtime source before cleanup or copying.

### Pre-import cleanup audit

No runtime or ignored file is deleted until its purpose and references have been checked.

- [ ] Portal source: exclude `.build/`, `.test-tmp/`, `dist/`, `.mypy_cache/`, `.pytest_cache/`, and other generated caches from the import snapshot.
- [ ] Portal source: verify the single ignored root `backgrounds/` image is unreferenced before removing it; it is not byte-identical to any current managed background.
- [ ] Portal source: treat ignored `assets/backgrounds/` as managed runtime data and migrate it with the Portal database rather than importing it as source.
- [ ] Portal source: copy and verify tracked `extension/native/config.json` externally, then replace it in source with a sanitised `config.example.json` and ignore the live file.
- [ ] Portal source: keep tracked source assets such as the astronomy image and tracked vendor dependencies.
- [ ] Portal source: retire `PROJECT.md` during documentation cutover.
- [ ] Arcade source: exclude `__pycache__/`, `.pytest_cache/`, and ignored runtime logs from the import snapshot.
- [ ] Arcade source: migrate `data/` as runtime state rather than application source.
- [ ] Arcade source: remove the hard-coded `test_spectaculator_launch.ps1` after confirming `tools/validate_zx_launch.py` covers its useful launch matrix.
- [ ] Record each removed path and whether it was generated, runtime, obsolete, or archived.

### Phase 0 exit gate

- The Cyrune name, component names, and preserved compatibility identifiers are recorded.
- Component backlogs contain all non-migration work.
- Both repositories and runtime stores can be restored independently.
- Cleanup candidates have been classified, but no unverified user data has been removed.

## Phase 1 — Import Histories and Establish Component Roots

- [ ] Clone the Portal source repository into `F:\Projects\Coding\Cyrune` as the initial monorepo to retain its remote and release history while leaving the old checkout intact.
- [ ] Import the Arcade source repository’s `main` branch beneath `Arcade/` without squashing its history.
- [ ] Prefer `git subtree` or an equivalent unrelated-history import over copying files without history.
- [ ] Move Portal product files beneath `Portal/` with `git mv`.
- [ ] Move Relay source to root `Relay/` without changing behaviour.
- [ ] Leave Host separation to its dedicated phase so registry/install rollback remains simple.
- [ ] Create the documented widget group directories but move widget files only in the widget-layout phase.
- [ ] Add component ownership/path rules to root `AGENTS.md`.
- [ ] Add a root README explaining component boundaries and focused development commands.
- [ ] Preserve both old checkouts unchanged until every migration gate passes.

### Phase 1 constraints

- Do not refactor behaviour while importing or moving source.
- Do not change database authority, fallback behaviour, schemas, or binding formats.
- Do not move runtime data yet.
- Do not delete either old checkout.

### Phase 1 exit gate

- Both Git histories are visible from the combined repository.
- Portal and Arcade source trees are present under their named component roots.
- A diff audit shows path moves, repository metadata, and documentation only.

## Phase 2 — Split and Reconcile Documentation

- [ ] Place one TODO and CHANGELOG in each of Portal, Arcade, Relay, Host, and Widgets.
- [ ] Sort current TODO content by component ownership.
- [ ] Sort the complete combined changelog history without dropping version/date/validation information.
- [ ] Preserve mixed historical releases in every materially changed component log with component-specific wording.
- [ ] Archive the completed Portal/Arcade integration plan.
- [ ] Remove `PROJECT.md` and replace its still-accurate content with root/component READMEs.
- [ ] Convert platform limitations and architectural rules into durable component documentation instead of TODO items.
- [ ] Make the root changelog an infrastructure/release index rather than another product changelog.
- [ ] Update repository instructions so release changes touch only the affected component versions and changelogs.

### Phase 2 exit gate

- No active product task exists only in the migration plan.
- Each component has an authoritative backlog and release history.
- Root documentation describes the actual combined repository rather than either legacy checkout.

## Phase 3 — Repair Paths and Restore the Baseline

- [ ] Update Portal HTML script, stylesheet, asset, worker, vendor, and test-root paths.
- [ ] Update Arcade test discovery and service-relative paths.
- [ ] Update Relay source/package paths.
- [ ] Update Host loader paths only as required to reach the newly imported Arcade application.
- [ ] Update documentation links and setup commands.
- [ ] Update local page URLs used by integration tests.
- [ ] Verify Portal opens directly from `Portal/index.html`.
- [ ] Verify Arcade opens directly from `Arcade/web/index.html` through Relay.
- [ ] Verify no retired HTTP listener or frontend fallback reappears.
- [ ] Add a root validation command that runs all existing Portal, Arcade, Host, and Relay checks.
- [ ] Keep component-specific commands usable.

### Phase 3 exit gate

- Both interfaces work from their new paths.
- Every pre-migration automated suite passes without behavioural expectation changes.
- Old checkouts remain usable fallbacks.

## Phase 4 — Separate and Reinstall Cyrune Host

- [ ] Move Host source/installers from the Relay tree to root `Host/`.
- [ ] Keep Host Python, installers, templates, and runtime data out of the WebExtension package.
- [ ] Update imports and test paths.
- [ ] Update installers and launchers for the new source location and selected suite identifiers.
- [ ] Reinstall the native messaging manifest so Firefox/Zen registry entries point to the new launcher.
- [ ] Preserve accepted installed and temporary-development extension IDs.
- [ ] Add only the path/config diagnostics needed to validate relocation; further native features stay in its component TODO.
- [ ] Verify the persistent native process starts from the new path and existing launches/services still work.
- [ ] Verify extension lint no longer sees native files.

### Phase 4 exit gate

- Browsers connect to the relocated host.
- Existing Portal and Arcade native workflows pass unchanged.
- Old registry/native-manifest paths are recorded for rollback and are no longer active after cutover.

## Phase 5 — Regroup Existing Widgets

This phase is a path-only reorganisation of already shipped widgets.

- [ ] Move SDK/runtime/network/registry/shared action-layout files into `Widgets/core/`.
- [ ] Move each widget’s JavaScript and CSS together into the directory matching its existing catalogue category.
- [ ] Move widget-specific tests, fixtures, and static assets with their widget where practical.
- [ ] Update ordered classic-script and stylesheet paths without changing load order.
- [ ] Update test discovery, global-symbol checks, manifests, documentation, and local SDK fixtures.
- [ ] Keep category IDs and persisted widget type IDs unchanged.
- [ ] Do not split large widget implementations or change their SDK contract during this phase.
- [ ] Verify direct `file://` loading and every existing widget test after each group move.

### Phase 5 exit gate

- The widget tree is readable by category and each widget’s files are colocated.
- Existing widget IDs, configuration, cache keys, and behaviour are unchanged.

## Phase 6 — Externalise and Migrate Runtime Data

### Migration rules

- [ ] Implement one versioned migration coordinator and receipt format.
- [ ] Copy before switching pointers; do not delete or overwrite a source before destination write, reread, parse, and hash verification.
- [ ] Preserve timestamps where practical and use atomic replacement at destinations.
- [ ] Make retries idempotent and distinguish missing, identical, corrupt, divergent, interrupted, and already-migrated states.
- [ ] Require explicit choice before replacing divergent data.
- [ ] Keep receipts free of database contents, secrets, and credential locations.

### Portal

- [ ] Copy the authoritative Portal database, useful backups, and managed backgrounds to the external Portal data root.
- [ ] Update native configuration only after every destination rereads successfully.
- [ ] Verify revision/hash metadata and opaque application/game keys.
- [ ] Leave intentionally browser-local widget/UI caches and IndexedDB assets unchanged.

### Arcade

- [ ] Copy configuration, state, managed profiles, and intended cache/log state to the external Arcade data root.
- [ ] Change defaults to external runtime data while retaining documented overrides.
- [ ] Verify collections, favourites, recent history, emulator definitions, profile IDs/hashes, scraper settings, and secure credentials.

### Host

- [ ] Copy native configuration to the external Host data root.
- [ ] Preserve approved application/game/directory bindings and validate targets without exporting them.
- [ ] Update the configured Arcade root.
- [ ] Reapprove repository-scoped directory handles whose root necessarily changed.

### Local page links

- [ ] Update the user’s Portal and Arcade bookmarks/shortcuts.
- [ ] Update exact-page authorization and Portal’s Arcade URL construction.
- [ ] Provide temporary redirect/recovery pages at old locations during validation if needed.

### Phase 6 exit gate

- Both applications run from the monorepo using verified external runtime data.
- Existing data, bindings, profiles, managed backgrounds, and credentials remain intact.
- Old runtime sources remain read-only recovery copies.

## Phase 7 — Restore Packaging and Repository Automation

- [ ] Keep unpackaged Relay source solely in `Relay/`.
- [ ] Write generated artifacts beneath `artifacts/Relay/<version>/` and ignore them.
- [ ] Update the existing extension build/lint/package workflow for relocated paths.
- [ ] Ensure archives exclude native host code, installers, tests, local configuration, databases, backups, and credentials.
- [ ] Preserve the distinction between unsigned AMO upload archives and Mozilla-signed packages.
- [ ] Update version-alignment validation for independent component versions.
- [ ] Add repository-wide validation orchestration without removing focused component commands.
- [ ] Verify a clean checkout produces the same bounded extension archive as the pre-migration workflow.

### Phase 7 exit gate

- Packaging, linting, and validation work from the combined checkout.
- Generated/downloaded files do not pollute source or extension packages.

## Phase 8 — Cutover, Monitoring, and Archive

- [ ] Run the complete cross-component validation matrix.
- [ ] Compare application data counts, hashes, profile IDs, bindings, and representative UI/launch workflows against the pre-migration record.
- [ ] Confirm no hard-coded old checkout dependency remains.
- [ ] Document rollback for code, native registration, runtime pointers, and local-page links.
- [ ] Use the monorepo for normal development during an agreed monitoring period.
- [ ] Keep old checkouts and runtime sources untouched during monitoring.
- [ ] Archive old checkouts/runtime sources only after explicit confirmation; do not immediately delete them.
- [ ] Rename the remote repository only after the combined repository works from its permanent path and selected identity.

## Validation Matrix

### Repository and paths

- [ ] Fresh clone into a different absolute directory.
- [ ] Directory names containing spaces and Unicode.
- [ ] Existing upgraded checkout.
- [ ] Old local-page bookmark recovery.
- [ ] Native-host reinstall after relocation.
- [ ] No hard-coded legacy checkout path at runtime.

### Data preservation

- [ ] Existing 12,933-game Arcade library and all configured collections load unchanged.
- [ ] Hub boards, tabs, columns, items, and managed backgrounds match.
- [ ] Application/game keys and local bindings remain paired correctly.
- [ ] Managed profile IDs and hashes match.
- [ ] Favourites and recent history match.
- [ ] Secure credentials remain retrievable and absent from portable/plaintext data.
- [ ] Existing backups remain readable.

### Runtime lifecycle

- [ ] Firefox and Zen installed extension.
- [ ] Temporary extension development install.
- [ ] Relay reload with both pages open.
- [ ] Native-host and browser restart.
- [ ] Multiple Hub tabs and existing active-target routing.
- [ ] Existing Portal/Arcade delivery, launch, reveal, rebind, metadata, scraper, POK, incoming, trash, emulator, and profile workflows.

### Automated checks

- [ ] Complete Portal JavaScript suite.
- [ ] Complete Arcade Python suite.
- [ ] Complete Host Python suite.
- [ ] Existing integration and migration fixtures.
- [ ] JavaScript/Python syntax and static correctness checks.
- [ ] JSON/manifest validation and version alignment.
- [ ] `web-ext lint` with zero errors.
- [ ] Relay archive content/hash checks.
- [ ] Diff checks and secret scan that reports locations only, never values.

## Rollback Rules

- Use multiple independently testable migration commits.
- Define rollback instructions before every phase that changes a runtime pointer or installed path.
- Roll code and configuration pointers back together.
- Never point old code at a partially migrated schema.
- Do not delete the old Arcade source repository, old runtime data, signed packages, or working Host registration during the migration.
- Prefer archive/quarantine over deletion after the monitoring period.

## Explicit Non-Goals

- No new product features or behavioural fixes.
- No Portal or Arcade framework rewrite.
- No combined application interface.
- No speculative shared package extraction.
- No large-module decomposition during path moves.
- No change to extension-required/optional product policy beyond preserving the current baseline.
- No implementation of work owned by a component backlog.
- No new widget SDK or storage contract.
- No reintroduction of the retired Arcade HTTP transport.

## Completion Criteria

The migration is complete when one recoverable repository contains both preserved histories; every component has an authoritative TODO and CHANGELOG; source is organised under the agreed component/widget layout; mutable runtime data is external and verified; all existing behaviour and data survive unchanged; packaging and validation work from a clean checkout; and the old checkouts remain available through the monitoring period.
