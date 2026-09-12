# Cyrune Repository Instructions

## Instruction Routing

This file applies to the entire repository. Component `AGENTS.md` files add rules for their own trees.

Before inspecting any other file, planning, reviewing, or changing work beneath a component directory, read that component's `AGENTS.md` completely, even when Codex was started from the repository root and did not discover the nested file automatically. For a cross-component task, read every affected component file before acting:

- `Portal/AGENTS.md`
- `Widgets/AGENTS.md`
- `Arcade/AGENTS.md`
- `Relay/AGENTS.md`
- `Host/AGENTS.md`
- `Nexus/AGENTS.md`

Repository-only work under `docs/`, `tools/`, or root `tests/` uses this file, but also requires the applicable component instructions when it changes, validates, packages, or documents a component contract. Read `docs/architecture/component-boundaries.md` before changing any cross-component contract. More specific component instructions augment this file; where instructions genuinely conflict, the closer component rule governs that component.

## Component Ownership

- `Portal/`: dashboard application and Portal-owned assets/tests.
- `Arcade/`: game-library application and Arcade-owned assets/tests.
- `Relay/`: WebExtension source and Relay-owned tests.
- `Host/`: native-messaging source, installers, templates, and Host-owned tests.
- `Widgets/`: widget implementations grouped by catalogue category.
- `Nexus/`: project-status dashboard, shared-settings management, sanitized validation state, and Nexus-owned tests.
- `tests/`: cross-component integration and migration coverage only.

## Shared Invariants

- Protect user data, credentials and existing launch authority. Schemas, identifiers, storage keys, bindings and message formats may change through documented migrations and coordinated component updates; they are not permanent compatibility obligations.
- Keep mutable runtime data, generated packages, credentials, logs, caches, and live device bindings outside the checkout.
- Keep browser authority in Relay and device/filesystem/process/credential authority in Host. Portal, Widgets, and Arcade must use their declared bridge capabilities rather than bypassing those boundaries.
- Keep shared Cyrune settings schemas and management in Nexus, transport in Relay, and native persistence in Host. The Nexus page is an editor and diagnostic client, not an always-running settings service.
- Never place native paths, command authority, credentials, or unredacted binding targets in portable Portal, Arcade, or Widget data.
- Use current Cyrune component names in user-facing text. Legacy names are allowed only for preserved compatibility identifiers, explicit migration handling, historical records, or tests of those contracts.
- Use `docs/architecture/` for durable cross-component and interface rules, component READMEs for human-facing setup/shape, component `AGENTS.md` files for implementation constraints, TODOs for outstanding work, and changelogs for completed work.

## Development Compatibility and Test Policy

- Cyrune is in active development. Prefer updating databases, collections and settings to the current format over maintaining parallel legacy runtime behaviour. Apply this policy across Portal, Arcade, Nexus, Relay, Host and Widgets.
- Coordinated component updates may require current protocol support. Detect outdated peers and provide update/reload guidance; do not add old-client fallbacks by default. Ordinary optional capabilities and temporary disconnect handling remain supported product behaviour.
- For a format change, define the supported migration baseline, preserve a recoverable backup, validate the converted data, and use atomic or recoverable writes. Migrate at the load/import boundary, then operate on the current format. Preserve user choices and the meaning of bindings without retaining obsolete shapes throughout the application.
- Retire old readers, aliases, branches and their exclusive tests when their supported migration path and documented removal conditions are satisfied. Update the compatibility register where applicable. A retained legacy identifier does not itself require supporting an old application version.
- Add tests for distinct behaviour, meaningful regressions, migration integrity and authority boundaries. Consolidate duplicates and remove obsolete implementation-specific assertions with the code they cover. Test count is not a progress target.
- Use focused tests while developing and the required coordinated checks for releases or actual runtime boundary changes. Avoid repeated full runs after a passing result unless a change or unresolved failure warrants them. Documentation-only policy edits need relevant document/contract checks, not a rerun of every product suite.
- This policy guides implementation within the requested task; it does not authorize unrelated live-data migrations or weaken component authority boundaries. See `docs/architecture/component-boundaries.md` for the durable support policy.

## Release and Commit Checklist

Before committing product changes:

1. Bump only the affected component version. Portal currently stores its version in `Portal/source/app.js` and displayed fallbacks in `Portal/index.html`; Relay stores its version in `Relay/manifest.json`.
2. Add a dated entry to the affected component `<Component>-CHANGELOG.md`, including relevant validation. Use the root changelog only for repository-wide infrastructure or coordinated release entries.
3. Update only the affected component `<Component>-TODO.md` for completed work or changed monitoring/version references.
4. Run the affected component tests plus cross-component integration checks when a boundary changes.
5. Run `web-ext lint` when Relay files change, and run Host tests when native transport, persistence, launch, or installer code changes.

Keep unrelated user changes out of scoped commits.
